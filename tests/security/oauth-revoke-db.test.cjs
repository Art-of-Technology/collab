const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { load } = require('./helpers.cjs');
const { seatsDatabase } = require('../agents/seats-db.cjs');

// The revoke route's queries run against a real PostgreSQL through Prisma here, so a filter Prisma
// rejects (CLB-751: `{ not: null }` on the required accessToken column) fails before release.
let db;
after(() => db?.stop());

class Response {
  constructor(body, init = {}) { this.body = body; this.status = init.status ?? 200; }
  static json(body, init) { return new Response(body, init); }
}
const globals = { URL, Buffer, process: { env: {} }, console: { error() {}, log() {}, warn() {} } };
// Stored tokens are base64 of the plain token, so the fixture needs no encryption key.
const fakeCrypto = { getEncryptionKey: () => 'fixture-key', encryptToken: async value => Buffer.from(value), decryptToken: async value => String(value) };
const stored = value => Buffer.from(value).toString('base64');
const form = (fields, authorization) => new Request('https://collab.test/api/oauth', { method: 'POST', body: new URLSearchParams(fields),
  headers: authorization ? { authorization } : {} });

test('revoking by access or refresh token, with or without a hint, ends the whole grant (CLB-751)', async t => {
  const grants = ['access-plain', 'access-hinted', 'refresh-plain', 'refresh-hinted', 'control'];
  db = await seatsDatabase(async prisma => {
    await prisma.user.create({ data: { id: 'calice00001', name: 'alice' } });
    await prisma.workspace.create({ data: { id: 'cworkspace1', name: 'w', slug: 'w', ownerId: 'calice00001' } });
    for (const [id, slug] of [['cconnector1', 'collab-connector'], ['cotherapp01', 'other-app']]) {
      await prisma.app.create({ data: { id, name: slug, slug, publisherId: 'calice00001', status: 'PUBLISHED', isSystemApp: true,
        scopes: { create: { scope: 'issues:read' } },
        oauthClient: { create: { clientId: slug, clientType: 'public', tokenEndpointAuthMethod: 'none', redirectUris: [] } } } });
    }
    const grant = (id, appId, name, refresh = true) => prisma.appToken.create({ data: { id, appId, workspaceId: 'cworkspace1', userId: 'calice00001',
      scopes: ['issues:read'], accessToken: stored(`collab_at_${name}${appId === 'cotherapp01' ? '-other' : ''}`), refreshToken: refresh ? stored(`collab_rt_${name}`) : null } });
    for (const name of grants) await grant(`c${name.replace('-', '')}`, 'cconnector1', name);
    // Another client's grant holding the same refresh token must survive this client's revocations.
    await grant('cothergrant', 'cotherapp01', 'refresh-plain');
    // A grant without a refresh token is skipped by the refresh search, not an error in it.
    await grant('cnorefresh1', 'cconnector1', 'no-refresh', false);
  });
  const { prisma } = db;
  const deps = { 'next/server': { NextResponse: Response }, crypto, '@/lib/prisma': { prisma }, '@/lib/apps/crypto': fakeCrypto,
    '@/lib/oauth-scopes': load('src/lib/oauth-scopes.ts', {}, globals), '@/lib/post-access': load('src/lib/post-access.ts'),
    '@/lib/apps/jwt-assertion': {}, '@/lib/apps/webhook-auto-creation': {} };
  const revoke = load('src/app/api/oauth/revoke/route.ts', { ...deps, '@/lib/oauth-client-auth': load('src/lib/oauth-client-auth.ts', deps, globals) }, globals);
  const refresh = load('src/app/api/oauth/token/route.ts', deps, globals);
  const auth = load('src/lib/apps/auth-middleware.ts', deps, globals);
  const revoked = async id => (await prisma.appToken.findUniqueOrThrow({ where: { id } })).isRevoked;
  const refreshWith = token => refresh.POST(form({ grant_type: 'refresh_token', refresh_token: token, client_id: 'collab-connector' }));
  const callWith = async token => (await auth.authenticateAppRequest(form({}, `Bearer ${token}`), { requiredScopes: ['issues:read'] })).success;

  for (const [name, token, hint] of [
    ['access-plain', 'collab_at_access-plain'],
    ['access-hinted', 'collab_at_access-hinted', 'refresh_token'],
    ['refresh-plain', 'collab_rt_refresh-plain'],
    ['refresh-hinted', 'collab_rt_refresh-hinted', 'refresh_token'],
  ]) {
    await t.test(`${token.startsWith('collab_at_') ? 'access' : 'refresh'} token, hint ${hint ?? 'none'}`, async () => {
      const id = `c${name.replace('-', '')}`;
      assert.equal(await callWith(`collab_at_${name}`), true, 'the grant works before it is revoked');
      const response = await revoke.POST(form({ token, client_id: 'collab-connector', ...(hint ? { token_type_hint: hint } : {}) }));
      assert.equal(response.status, 200, JSON.stringify(response.body));
      assert.equal(await revoked(id), true);
      // Revocation ends both halves of the grant: the access token no longer authenticates and the refresh token no longer refreshes.
      assert.equal(await callWith(`collab_at_${name}`), false);
      const refused = await refreshWith(`collab_rt_${name}`);
      assert.equal(refused.status, 400);
      assert.equal(refused.body.error, 'invalid_grant');
    });
  }

  await t.test('an unknown token answers 200 and revokes nothing', async () => {
    for (const hint of [undefined, 'access_token', 'refresh_token']) {
      const response = await revoke.POST(form({ token: 'collab_at_unknown', client_id: 'collab-connector', ...(hint ? { token_type_hint: hint } : {}) }));
      assert.equal(response.status, 200, JSON.stringify(response.body));
    }
    assert.deepEqual(await Promise.all(['ccontrol', 'cothergrant', 'cnorefresh1'].map(revoked)), [false, false, false]);
  });

  await t.test('grants that were not revoked keep working', async () => {
    assert.equal(await callWith('collab_at_control'), true);
    assert.equal((await refreshWith('collab_rt_control')).status, 200);
  });
});
