const { test, assert, load } = require('./helpers.cjs');
const crypto = require('node:crypto');
const next = { NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200 }) } };
const globals = { URL, Buffer, process: { env: {} }, console: { error() {}, log() {}, warn() {} } };
const scopes = load('src/lib/oauth-scopes.ts', {}, globals);
const verifier = 'v'.repeat(43);
function fixture(kind, overrides = {}) {
  const grants = [], updates = [];
  const app = { id: 'app', slug: 'app', name: 'CLI', status: 'PUBLISHED', isSystemApp: true, scopes: [{ scope: 'issues:read' }] };
  const client = { clientId: 'collab-cli', clientType: 'public', tokenEndpointAuthMethod: 'none', redirectUris: [], app };
  const workspace = { id: 'workspace', name: 'Workspace' };
  const code = { id: 'code-id', code: 'code', nonce: 'consent_approved', used: false, expiresAt: new Date(Date.now() + 60000),
    clientId: client.clientId, userId: 'alice', workspaceId: 'workspace', redirectUri: 'http://127.0.0.1:56789/callback',
    scope: 'issues:read', code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', ...overrides };
  const token = { id: 'token-id', userId: 'alice', workspaceId: 'workspace', workspace, appId: 'app', installationId: null,
    refreshToken: Buffer.from('collab_rt_refresh').toString('base64'), scopes: ['issues:read', 'secrets:read'], updatedAt: new Date() };
  let consumed = false;
  const db = {
    appOAuthClient: { findUnique: async () => client },
    appOAuthAuthorizationCode: { findUnique: async () => consumed ? null : code,
      deleteMany: async () => { if (consumed) return { count: 0 }; consumed = true; return { count: 1 }; },
      update: async () => { code.used = true; return code; },
      updateMany: async () => { if (consumed) return { count: 0 }; consumed = true; return { count: 1 }; },
      delete: async () => { consumed = true; } },
    workspace: { findUnique: async () => workspace, findFirst: async () => overrides.revoked ? null : workspace },
    appToken: { findFirst: async () => { throw Error('CLI login must not overwrite another device grant'); },
      findMany: async () => [token], create: async ({ data }) => { grants.push(data); return data; },
      update: async ({ data, where }) => { updates.push({ data, where }); return data; } },
  };
  const deps = { 'next/server': next, crypto, '@/lib/prisma': { prisma: db }, '@/lib/oauth-scopes': scopes,
    '@/lib/post-access': load('src/lib/post-access.ts'),
    '@/lib/apps/crypto': { encryptToken: async v => Buffer.from(v), decryptToken: async v => String(v) },
    '@/lib/apps/jwt-assertion': {}, '@/lib/apps/webhook-auto-creation': {} };
  const handler = load(`src/app/api/oauth/${kind === 'mcp' ? 'mcp/' : ''}token/route.ts`, deps, globals);
  const invoke = async (body = {}) => {
    const data = { client_id: client.clientId, grant_type: 'authorization_code', code: 'code', redirect_uri: code.redirectUri, code_verifier: verifier, ...body };
    return handler.POST({ headers: new Headers({ 'content-type': kind === 'mcp' ? 'application/json' : 'application/x-www-form-urlencoded' }),
      json: async () => data, formData: async () => new Map(Object.entries(data)) });
  };
  return { invoke, grants, updates, code };
}
for (const kind of ['mcp', 'regular']) {
  test(`${kind}: approved S256 grant succeeds and replay cannot create another token`, async () => {
    const f = fixture(kind); assert.equal((await f.invoke()).status, 200); assert.equal(f.grants.length, 1);
    assert.equal(f.grants[0].userId, 'alice'); assert.deepEqual(Array.from(f.grants[0].scopes), ['issues:read']);
    assert.equal((await f.invoke()).status, 400); assert.equal(f.grants.length, 1);
  });
  test(`${kind}: pending/used/overscoped/legacy and PKCE-invalid codes never mint tokens`, async () => {
    for (const override of [{ nonce: 'consent_pending', used: true }, { used: true }, { nonce: 'mcp_system_app' },
      { scope: 'issues:read secrets:read' }, { code_challenge: null }, { code_challenge_method: 'plain' }, { revoked: true }]) {
      const f = fixture(kind, override); const response = await f.invoke();
      assert.equal(response.status, 400, JSON.stringify(override)); assert.equal(f.grants.length, 0);
    }
    const f = fixture(kind); assert.equal((await f.invoke({ code_verifier: 'wrong' })).status, 400); assert.equal(f.grants.length, 0);
  });
  test(`${kind}: refresh strips historical excess scope and preserves exact token identity`, async () => {
    const f = fixture(kind); const response = await f.invoke({ grant_type: 'refresh_token', refresh_token: 'collab_rt_refresh' });
    assert.equal(response.status, 200); assert.equal(response.body.scope, 'issues:read'); assert.equal(f.grants.length, 0);
    assert.equal(f.updates.length, 1); assert.equal(f.updates[0].where.id, 'token-id');
    assert.deepEqual(Array.from(f.updates[0].data.scopes), ['issues:read']);
  });
}
test('scope ceiling is enforced on already-issued tokens through actual authentication middleware', async () => {
  const workspace = { id: 'workspace', slug: 'workspace' };
  const token = { id: 'token', accessToken: Buffer.from('bearer').toString('base64'), userId: 'alice', scopes: ['issues:read', 'secrets:read'],
    app: { id: 'app', slug: 'app', status: 'PUBLISHED', isSystemApp: true, scopes: [{ scope: 'issues:read' }] }, workspace };
  const auth = load('src/lib/apps/auth-middleware.ts', { 'next/server': next, '@/lib/oauth-scopes': scopes,
    '@/lib/post-access': load('src/lib/post-access.ts'), '@/lib/apps/crypto': { decryptToken: async v => String(v) },
    '@/lib/prisma': { prisma: { appToken: { findMany: async () => [token] }, workspace: { findFirst: async () => workspace } } } }, globals);
  const request = { headers: new Headers({ Authorization: 'Bearer bearer' }) };
  assert.equal((await auth.authenticateAppRequest(request, { requiredScopes: ['secrets:read'] })).success, false);
  assert.equal((await auth.authenticateAppRequest(request, { requiredScopes: ['issues:read'] })).success, true);
});
