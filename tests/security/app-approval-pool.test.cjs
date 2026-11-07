const { assert, test, load } = require('./helpers.cjs');
const { isDeepStrictEqual } = require('node:util');

function fixture({ role = 'SYSTEM_ADMIN', mutate, beforeTransaction, valid = true, oauth = true, client = null, authMethod = 'private_key_jwt' } = {}) {
  const manifest = { scopes: ['issues:read'], ...(oauth && { oauth: {
    client_type: 'confidential', token_endpoint_auth_method: authMethod,
    jwks_uri: 'https://example.test/jwks', redirect_uris: ['https://example.test/callback'],
  } }) };
  const state = { app: { id: 'app', status: 'IN_REVIEW', versions: [{ id: 'version', manifest }], oauthClient: client }, writes: 0, events: [] };
  const app = { findUnique: async () => structuredClone(state.app), update: async ({ data }) => { state.writes++; Object.assign(state.app, data); } };
  const tx = { app, $queryRaw: async () => { state.events.push('lock'); return []; },
    appOAuthClient: { create: async ({ data }) => { state.writes++; state.client = data; } },
    appScope: { deleteMany: async () => { state.writes++; }, createMany: async () => { state.writes++; } },
  };
  const prisma = { app, $transaction: async fn => { state.events.push('transaction'); beforeTransaction?.(state.app); return fn(tx); } };
  const deps = { 'node:util': { isDeepStrictEqual }, '@/lib/prisma': { prisma }, '@/lib/auth-options': { authOptions: {} },
    '@/lib/request-session': { getServerSession: async () => ({ user: { id: 'admin', role } }) },
    'next/server': { NextResponse: { json: (body, options = {}) => ({ body, status: options.status || 200 }) } },
    '@/lib/apps/jwks': { validateJWKS: async () => { state.events.push('jwks'); mutate?.(state.app); return { valid, error: 'invalid' }; } },
    '@/lib/apps/crypto': { generateClientCredentials: async () => { state.events.push('credentials'); return { clientId: 'client', clientSecret: 'secret' }; }, encryptToken: async () => { state.events.push('encrypt'); return Buffer.from('encrypted'); } },
  };
  return { state, run: () => load('src/app/api/apps/by-id/[id]/approve/route.ts', deps, { console: { error() {} } }).POST({}, { params: Promise.resolve({ id: 'app' }) }) };
}

test('validates the external key before acquiring a transaction and approves its exact manifest', async () => {
  const f = fixture(); assert.equal((await f.run()).status, 200);
  assert.ok(f.state.events.indexOf('jwks') < f.state.events.indexOf('transaction'));
  assert.ok(f.state.events.indexOf('credentials') < f.state.events.indexOf('transaction'));
  assert.equal(f.state.events.filter(x => x === 'lock').length, 3);
  assert.equal(f.state.app.status, 'DRAFT'); assert.equal(f.state.client.jwksValidated, true);
});

test('invalid JWKS fails without opening a transaction or changing the app', async () => {
  const f = fixture({ valid: false }); assert.equal((await f.run()).status, 500);
  assert.equal(f.state.events.includes('transaction'), false); assert.equal(f.state.writes, 0);
});

for (const [name, mutate] of [
  ['status', app => { app.status = 'REJECTED'; }],
  ['manifest', app => { app.versions[0].manifest.oauth.jwks_uri = 'https://changed.test/jwks'; }],
  ['latest version', app => { app.versions[0].id = 'new-version'; }],
  ['OAuth client', app => { app.oauthClient = { id: 'concurrent-client' }; }],
]) test(`approval rejects a concurrently changed ${name} without writes`, async () => {
  const f = fixture({ mutate }); assert.equal((await f.run()).status, 409); assert.equal(f.state.writes, 0);
});

test('non-admins cannot validate keys or modify the app', async () => {
  const f = fixture({ role: 'USER' }); assert.equal((await f.run()).status, 403);
  assert.deepEqual(f.state.events, []); assert.equal(f.state.writes, 0);
});

test('a manifest without OAuth does not generate a client', async () => {
  const f = fixture({ oauth: false }); assert.equal((await f.run()).status, 200);
  assert.equal(f.state.events.includes('jwks'), false); assert.equal(f.state.events.includes('credentials'), false);
});

test('an existing OAuth client is retained without network validation or new credentials', async () => {
  const f = fixture({ client: { id: 'existing' } }); assert.equal((await f.run()).status, 200);
  assert.equal(f.state.events.includes('jwks'), false); assert.equal(f.state.events.includes('credentials'), false);
});

test('same OAuth client with changed security fields is not approved', async () => {
  const f = fixture({ client: { id: 'existing', tokenEndpointAuthMethod: 'private_key_jwt', redirectUris: ['https://before.test'] },
    beforeTransaction: app => { app.oauthClient.redirectUris = ['https://changed.test']; } });
  assert.equal((await f.run()).status, 409); assert.equal(f.state.writes, 0);
});

test('client-secret derivation happens before the transaction', async () => {
  const f = fixture({ authMethod: 'client_secret_basic' }); assert.equal((await f.run()).status, 200);
  assert.ok(f.state.events.indexOf('encrypt') < f.state.events.indexOf('transaction'));
  assert.equal(f.state.client.clientSecret.toString(), 'encrypted');
});

test('app deletion locks the parent before deleting related records', async () => {
  const events = [];
  const tx = { $queryRaw: async () => { events.push('parent-lock'); return []; } };
  for (const name of ['appOAuthAuthorizationCode', 'appWebhook', 'appInstallation', 'appOAuthClient', 'appScope', 'appVersion', 'app']) {
    tx[name] = { deleteMany: async () => { events.push(name); }, delete: async () => { events.push(name); } };
  }
  const app = { id: 'app', publisherId: 'admin', installations: [], oauthClient: { id: 'client', clientId: 'client' }, webhooks: [] };
  const deps = { '@/lib/prisma': { prisma: { app: { findUnique: async () => app }, $transaction: async fn => fn(tx) } },
    '@/lib/auth-options': { authOptions: {} }, '@/lib/request-session': { getServerSession: async () => ({ user: { id: 'admin', role: 'SYSTEM_ADMIN' } }) },
    'next/server': { NextResponse: { json: (body, options = {}) => ({ body, status: options.status || 200 }) } },
  };
  const route = load('src/app/api/apps/[slug]/delete/route.ts', deps, { console: { error() {} } });
  assert.equal((await route.DELETE({}, { params: Promise.resolve({ slug: 'app' }) })).status, 200);
  assert.equal(events[0], 'parent-lock');
  assert.ok(events.indexOf('appOAuthClient') < events.indexOf('appVersion'));
  assert.equal(events.at(-1), 'app');
});
