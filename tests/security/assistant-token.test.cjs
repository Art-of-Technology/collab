const { assert, test, load, matches } = require('./helpers.cjs');

const MCP_SCOPES = ['user:read', 'workspace:read', 'projects:read', 'issues:read', 'issues:write', 'context:read', 'context:write', 'prompts:read'];

function fixture() {
  const scopes = MCP_SCOPES.map(scope => ({ scope }));
  const apps = [
    { id: 'assistant-app', slug: 'collab-assistant', name: 'Collab assistant', status: 'PUBLISHED', isSystemApp: true, scopes },
    // The old external server's app: its slug contains "mcp" and it must never be picked up again.
    { id: 'old-app', slug: 'collab-mcp-server', name: 'Old MCP server', status: 'PUBLISHED', isSystemApp: true, scopes },
    { id: 'cli-app', slug: 'collab-cli', name: 'Collab CLI', status: 'PUBLISHED', isSystemApp: true, scopes },
  ];
  const workspace = { id: 'w1', slug: 'one', name: 'One', ownerId: 'owner', members: [{ userId: 'alice', status: true }, { userId: 'bob', status: true }] };
  const tokens = [], logs = [];
  const stored = (appId, userId, value) => tokens.push({ id: `token-${tokens.length}`, appId, app: apps.find(app => app.id === appId), workspaceId: 'w1', workspace, userId,
    installationId: null, installation: null, accessToken: Buffer.from(value).toString('base64'), scopes: MCP_SCOPES, isRevoked: false, tokenExpiresAt: new Date(Date.now() + 60_000), createdAt: new Date() });
  const prisma = {
    app: { findUnique: async ({ where }) => apps.find(row => matches(row, where)) ?? null, findFirst: async ({ where }) => apps.find(row => matches(row, where)) ?? null },
    appOAuthClient: { findUnique: async () => null },
    workspace: { findFirst: async ({ where }) => matches(workspace, where) ? workspace : null },
    appToken: {
      findMany: async ({ where }) => tokens.filter(row => matches(row, where)).sort((a, b) => b.createdAt - a.createdAt),
      create: async ({ data }) => { const row = { id: `token-${tokens.length}`, createdAt: new Date(), ...data, app: apps.find(app => app.id === data.appId), workspace, installation: null }; tokens.push(row); return row; },
      updateMany: async ({ where, data }) => { const rows = tokens.filter(row => matches(row, where)); rows.forEach(row => Object.assign(row, data)); return { count: rows.length }; },
    },
  };
  const globals = { Buffer, URL, process: { env: {} }, console: { log: (...args) => logs.push(args), warn: (...args) => logs.push(args), error: (...args) => logs.push(args) } };
  const deps = {
    crypto: require('node:crypto'),
    'next/server': { NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200 }) } },
    '@/lib/prisma': { prisma },
    // Synthetic tokens only: exercise persistence and lookup without a deployment key.
    '@/lib/apps/crypto': { getEncryptionKey: () => 'fixture-key', encryptToken: async value => Buffer.from(value), decryptToken: async value => value.toString() },
    '@/lib/oauth-scopes': load('src/lib/oauth-scopes.ts', {}, { URL }),
    '@/lib/post-access': load('src/lib/post-access.ts'),
  };
  deps['@/lib/mcp-oauth'] = load('src/lib/mcp-oauth.ts', deps, globals);
  // Each call loads the module afresh, like a new server process with an empty cache.
  const fresh = () => load('src/lib/ai/mcp-token.ts', deps, globals);
  const { authenticateAppRequest } = load('src/lib/apps/auth-middleware.ts', deps, globals);
  const auth = (token, scope = 'issues:write') => authenticateAppRequest({ headers: new Headers({ Authorization: `Bearer ${token}` }) }, { requiredScopes: [scope] });
  return { apps, tokens, logs, prisma, fresh, auth, stored };
}

test('the assistant gets a token for the signed-in member under its own app, with the MCP tool scopes', async () => {
  const f = fixture();
  const token = await f.fresh().getMcpToken(f.prisma, 'alice', 'w1');
  assert.match(token, /^collab_at_/);
  const result = await f.auth(token);
  assert.equal(result.success, true);
  assert.equal(result.context.user.id, 'alice');
  assert.equal(result.context.app.slug, 'collab-assistant');
  assert.equal(String(f.tokens[0].scopes), String(MCP_SCOPES));
  assert.equal(f.tokens[0].refreshToken ?? null, null);
  assert.doesNotMatch(JSON.stringify(f.logs), new RegExp(token));
});

test('the same member and workspace keep one token across calls and across server restarts', async () => {
  const f = fixture();
  const lib = f.fresh();
  const first = await lib.getMcpToken(f.prisma, 'alice', 'w1');
  assert.equal(await lib.getMcpToken(f.prisma, 'alice', 'w1'), first);
  assert.equal(await f.fresh().getMcpToken(f.prisma, 'alice', 'w1'), first, 'a new process reuses the stored token');
  assert.equal(f.tokens.length, 1);
  assert.notEqual(await lib.getMcpToken(f.prisma, 'bob', 'w1'), first, 'another member gets their own token');
  assert.equal(f.tokens.length, 2);
});

test('the old MCP server app is never used: without the assistant app there is no token', async () => {
  const f = fixture();
  f.stored('old-app', 'alice', 'collab_at_old');
  f.apps.splice(f.apps.findIndex(app => app.slug === 'collab-assistant'), 1);
  await assert.rejects(f.fresh().getMcpToken(f.prisma, 'alice', 'w1'));
  assert.equal(f.tokens.length, 1, 'nothing is minted under another app');
});

test('an unpublished or non-system assistant app issues nothing', async () => {
  for (const change of [{ status: 'SUSPENDED' }, { isSystemApp: false }]) {
    const f = fixture();
    Object.assign(f.apps[0], change);
    await assert.rejects(f.fresh().getMcpToken(f.prisma, 'alice', 'w1'), undefined, JSON.stringify(change));
    assert.equal(f.tokens.length, 0);
  }
});

test('invalidating replaces only that member\'s assistant token and leaves every other token alone', async () => {
  const f = fixture();
  const lib = f.fresh();
  f.stored('cli-app', 'alice', 'collab_at_cli');
  f.stored('old-app', 'alice', 'collab_at_old');
  const alice = await lib.getMcpToken(f.prisma, 'alice', 'w1'), bob = await lib.getMcpToken(f.prisma, 'bob', 'w1');
  await lib.invalidateMcpToken(f.prisma, 'alice', 'w1');
  assert.equal((await f.auth(alice)).error.statusCode, 401);
  assert.equal((await f.auth(bob)).success, true);
  assert.equal((await f.auth('collab_at_cli')).success, true, 'a CLI login is untouched');
  assert.equal(f.tokens.find(row => row.appId === 'old-app').isRevoked, false);
  const next = await lib.getMcpToken(f.prisma, 'alice', 'w1');
  assert.notEqual(next, alice);
  assert.equal((await f.auth(next)).success, true);
});

test('concurrent and delayed failures of one token share its replacement', async () => {
  const f = fixture();
  const lib = f.fresh();
  const old = await lib.getMcpToken(f.prisma, 'alice', 'w1');
  const [first, second] = await Promise.all([
    lib.refreshMcpToken(f.prisma, 'alice', 'w1', old),
    lib.refreshMcpToken(f.prisma, 'alice', 'w1', old),
  ]);
  assert.notEqual(first, old);
  assert.equal(second, first);
  assert.equal(await lib.refreshMcpToken(f.prisma, 'alice', 'w1', old), first);
  assert.equal((await f.auth(first)).success, true);
  assert.equal(f.tokens.length, 2);
});

test('an expired stored token is replaced, never handed out', async () => {
  const f = fixture();
  f.stored('assistant-app', 'alice', 'collab_at_expired');
  f.tokens[0].tokenExpiresAt = new Date(Date.now() - 1000);
  const token = await f.fresh().getMcpToken(f.prisma, 'alice', 'w1');
  assert.notEqual(token, 'collab_at_expired');
  assert.equal((await f.auth(token)).success, true);
  assert.equal(f.tokens[0].isRevoked, true, 'the expired token is revoked');
});
