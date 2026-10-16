const { assert, test, load, matches } = require('./helpers.cjs');
const crypto = require('node:crypto');

function fixture(clientId = 'collab-cli') {
  const app = { id: 'app', name: 'Collab CLI', slug: 'collab-cli', status: 'PUBLISHED', isSystemApp: true };
  const workspace = { id: 'workspace', name: 'Workspace', slug: 'workspace', ownerId: 'alice', members: [] };
  const rows = [], codes = new Map();
  const prisma = {
    appOAuthClient: { findUnique: async ({ where }) => where.clientId === clientId ? { clientId, app } : null },
    workspace: {
      findUnique: async ({ where }) => matches(workspace, where) ? workspace : null,
      findFirst: async ({ where }) => matches(workspace, where) ? workspace : null,
    },
    appOAuthAuthorizationCode: {
      findUnique: async ({ where }) => codes.get(where.code),
      delete: async ({ where }) => codes.delete(where.code),
    },
    appToken: {
      findFirst: async ({ where }) => rows.find(row => matches(row, where)),
      findMany: async ({ where }) => rows.filter(row => matches(row, where)),
      create: async ({ data }) => { const row = { id: `token-${rows.length}`, ...data, app, workspace }; rows.push(row); return row; },
      update: async ({ where, data }) => { const row = rows.find(row => row.id === where.id); assert.ok(row); Object.assign(row, data); return row; },
    },
  };
  const deps = {
    crypto,
    '@/lib/prisma': { prisma },
    // Synthetic tokens only: exercise persistence and lookup without a deployment key.
    '@/lib/apps/crypto': { encryptToken: async value => Buffer.from(value), decryptToken: async value => value.toString() },
    '@/lib/oauth-scopes': load('src/lib/oauth-scopes.ts', {}, { URL }),
    '@/lib/post-access': load('src/lib/post-access.ts'),
    'next/server': { NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200 }) } },
  };
  const globals = { Buffer, URL, console: { log() {}, error() {} } };
  const { POST } = load('src/app/api/oauth/mcp/token/route.ts', deps, globals);
  const { authenticateAppRequest } = load('src/lib/apps/auth-middleware.ts', deps, globals);
  const exchange = body => POST({ headers: new Headers({ 'content-type': 'application/json' }), json: async () => ({ client_id: clientId, ...body }) });
  const grant = (code, scope = 'issues:read') => {
    const verifier = `verifier-${code}`;
    codes.set(code, { code, clientId, userId: 'alice', workspaceId: workspace.id, redirectUri: 'http://127.0.0.1:8080/callback', scope, expiresAt: new Date(Date.now() + 60000), code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url') });
    return { grant_type: 'authorization_code', code, redirect_uri: 'http://127.0.0.1:8080/callback', code_verifier: verifier };
  };
  const login = async (code, scope) => { const response = await exchange(grant(code, scope)); assert.equal(response.status, 200); return response.body; };
  const auth = (token, scope = 'issues:read') => authenticateAppRequest({ headers: new Headers({ Authorization: `Bearer ${token}` }) }, { requiredScopes: [scope] });
  return { rows, exchange, grant, login, auth };
}

test('CLI logins on two machines retain independent access, refresh, scopes and revocation', async () => {
  const f = fixture();
  const first = await f.login('mac');
  assert.equal((await f.auth(first.access_token)).success, true);
  const second = await f.login('windows', 'issues:read issues:write');
  assert.equal((await f.auth(first.access_token)).success, true, 'second login must not invalidate the first machine');
  assert.equal((await f.auth(second.access_token)).success, true);
  assert.equal((await f.auth(first.access_token, 'issues:write')).error.statusCode, 403);
  assert.equal((await f.auth(second.access_token, 'issues:write')).success, true);
  const refreshed = await f.exchange({ grant_type: 'refresh_token', refresh_token: first.refresh_token });
  assert.equal(refreshed.status, 200);
  assert.equal((await f.auth(first.access_token)).error.statusCode, 401);
  assert.equal((await f.auth(refreshed.body.access_token)).success, true);
  assert.equal((await f.auth(second.access_token)).success, true);
  f.rows.find(row => Buffer.from(row.refreshToken, 'base64').toString() === first.refresh_token).isRevoked = true;
  assert.equal((await f.auth(refreshed.body.access_token)).error.statusCode, 401);
  assert.equal((await f.exchange({ grant_type: 'refresh_token', refresh_token: first.refresh_token })).status, 400);
  assert.equal((await f.auth(second.access_token)).success, true);
});

test('CLI code exchange still rejects invalid PKCE, redirect and reused codes without changing a valid session', async () => {
  const f = fixture(), first = await f.login('first');
  const grant = f.grant('second');
  assert.equal((await f.exchange({ ...grant, code_verifier: 'wrong' })).status, 400);
  assert.equal((await f.exchange({ ...grant, redirect_uri: 'http://other.test/callback' })).status, 400);
  assert.equal(f.rows.length, 1);
  assert.equal((await f.auth(first.access_token)).success, true);
  assert.equal((await f.exchange(grant)).status, 200);
  assert.equal((await f.exchange(grant)).status, 400);
  assert.equal((await f.auth(first.access_token)).success, true);
});

test('other system OAuth clients retain existing replacement behavior', async () => {
  const f = fixture('other-mcp-client');
  const first = await f.login('first'), second = await f.login('second');
  assert.equal((await f.auth(first.access_token)).error.statusCode, 401);
  assert.equal((await f.auth(second.access_token)).success, true);
  assert.equal(f.rows.length, 1);
});
