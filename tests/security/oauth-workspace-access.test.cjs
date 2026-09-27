const { assert, test, load, matches } = require('./helpers.cjs');

function fixture(kind, access = 'member', options = {}) {
  const actor = { id: 'alice', createdAt: new Date(), updatedAt: new Date() };
  const workspace = { id: 'workspace', slug: 'slug-only', ownerId: access === 'owner' ? 'alice' : 'bob', members: access === 'foreign' || access === 'owner' ? [] : [{ userId: 'alice', status: access === 'member' }] };
  const fallback = { id: 'fallback', slug: 'fallback', ownerId: 'alice', members: [] };
  const rows = options.fallback ? [workspace, fallback] : [workspace];
  const writes = [], queries = [];
  const lookup = async query => {
    queries.push(query);
    const row = rows.find(row => matches(row, query.where));
    return row && { ...row, members: query.include?.members ? row.members.filter(member => matches(member, query.include.members.where)) : row.members };
  };
  const db = {
    user: { findUnique: async () => options.deleted ? null : actor },
    workspace: { findUnique: lookup, findFirst: lookup },
    workspaceMember: { findFirst: async () => workspace.members.length ? { workspaceId: workspace.id, workspace } : null },
    appOAuthClient: { findUnique: async () => ({ clientId: 'client', clientType: 'public', redirectUris: ['https://client.example.test/callback'], app: { id: 'app', slug: 'app', status: 'PUBLISHED', isSystemApp: kind === 'mcp', scopes: [{ scope: 'issues:read' }] } }) },
    appInstallation: { findFirst: async ({ where }) => options.noInstallation ? null : { id: 'install', appId: 'app', workspaceId: where.workspaceId, scopes: ['issues:read'], status: 'ACTIVE' } },
    appOAuthAuthorizationCode: { create: async ({ data }) => { writes.push({ ...data, transaction: false }); return data; } },
    $transaction: async fn => {
      if (options.revoke) { workspace.ownerId = 'bob'; workspace.members = []; }
      let checked = false;
      return fn({
        workspace: { findFirst: async query => { checked = true; return lookup(query); } },
        appOAuthAuthorizationCode: { create: async ({ data }) => {
          assert.equal(checked, true, 'access must be checked on the transaction handle');
          writes.push({ ...data, transaction: true }); return data;
        } },
      });
    },
  };
  const deps = {
    '@/lib/prisma': { prisma: db }, '@/lib/auth-options': { authOptions: {} },
    '@/lib/request-session': { getServerSession: async () => options.absent ? null : { user: actor } },
    '@/lib/apps/crypto': { generateAuthorizationCode: () => 'regular-code' },
    crypto: { randomBytes: () => ({ toString: () => 'mcp-code' }) },
    '@/lib/oauth-scopes': load('src/lib/oauth-scopes.ts', {}, { URL }),
    '@/lib/post-access': load('src/lib/post-access.ts'),
    'next/navigation': { redirect: url => { throw { digest: 'NEXT_REDIRECT', url }; } },
    'next/server': { NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200 }), redirect: url => ({ status: 307, url: url.toString() }) } },
  };
  deps['@/lib/session'] = load('src/lib/session.ts', deps, { console: { error() {} } });
  const handler = load(`src/app/api/oauth/${kind === 'mcp' ? 'mcp/' : ''}authorize/route.ts`, deps, { URL, process: { env: {} }, console: { error() {}, log() {} } });
  const invoke = async (overrides = {}) => {
    const params = { client_id: 'client', redirect_uri: 'https://client.example.test/callback', response_type: 'code', workspace_id: 'workspace', scope: 'issues:read', state: 'state', nonce: 'nonce', installation_id: 'install', code_challenge: 'challenge', code_challenge_method: 'S256', ...overrides };
    for (const k of Object.keys(params)) if (params[k] === null) delete params[k];
    try { return await handler.GET({ url: `https://collab.example.test/api/oauth/authorize?${new URLSearchParams(params)}`, headers: new Headers({ host: 'collab.example.test' }) }); }
    catch (e) { if (e.digest === 'NEXT_REDIRECT') return { status: 307, url: e.url }; throw e; }
  };
  return { invoke, writes, queries };
}

for (const kind of ['regular', 'mcp']) {
  test(`${kind}: inactive and foreign access issue no code, including explicit workspace with fallback available`, async () => {
    for (const access of ['revoked', 'foreign']) {
      const f = fixture(kind, access, { fallback: true }); const result = await f.invoke();
      assert.equal(result.status, 403); assert.equal(f.writes.length, 0);
    }
  });
  test(`${kind}: owner without membership and active member preserve exact code fields and callback`, async () => {
    for (const access of ['owner', 'member']) {
      const f = fixture(kind, access); const result = await f.invoke(); assert.equal(result.status, 307);
      assert.equal(f.writes.length, 1); const row = f.writes[0];
      assert.equal(row.userId, 'alice'); assert.equal(row.workspaceId, 'workspace'); assert.equal(row.clientId, 'client');
      assert.equal(row.installationId, kind === 'mcp' ? null : 'install'); assert.equal(row.scope, 'issues:read');
      assert.equal(row.state, 'state'); assert.equal(row.code_challenge, 'challenge'); assert.equal(row.code_challenge_method, 'S256');
      assert.equal(row.nonce, kind === 'mcp' ? 'mcp_system_app' : 'nonce'); assert.equal(row.redirectUri, 'https://client.example.test/callback');
      assert.equal(row.transaction, true);
      const url = new URL(result.url); assert.equal(url.origin, 'https://client.example.test'); assert.equal(url.searchParams.get('workspace_id'), 'workspace');
      assert.equal(url.searchParams.get('state'), 'state'); assert.equal(url.searchParams.get('code'), row.code);
    }
  });
  test(`${kind}: missing/deleted actor cannot mint and exact workspace IDs reject slug aliases`, async () => {
    for (const option of ['absent', 'deleted']) {
      const f = fixture(kind, 'member', { [option]: true }); const result = await f.invoke();
      assert.equal(f.writes.length, 0); assert.equal(result.status, 307); assert.equal(new URL(result.url).origin, 'https://collab.example.test');
    }
    const f = fixture(kind); assert.equal((await f.invoke({ workspace_id: 'slug-only' })).status, kind === 'mcp' ? 404 : 403); assert.equal(f.writes.length, 0);
  });
  test(`${kind}: revocation at transaction entry denies code creation`, async () => {
    for (const access of ['owner', 'member']) {
      const f = fixture(kind, access, { revoke: true }); assert.equal((await f.invoke()).status, 403); assert.equal(f.writes.length, 0);
    }
  });
  test(`${kind}: protocol rejection still performs zero code writes`, async () => {
    for (const override of [{ response_type: 'token' }, { redirect_uri: 'http://untrusted.test/no' }, { code_challenge_method: 'plain' }]) {
      const f = fixture(kind); assert.equal((await f.invoke(override)).status, 400); assert.equal(f.writes.length, 0);
    }
  });
}
test('regular no-workspace fallback skips revoked membership and includes ownership; explicit denied ID never falls back', async () => {
  const f = fixture('regular', 'revoked', { fallback: true });
  assert.equal((await f.invoke({ workspace_id: null })).status, 307); assert.equal(f.writes[0].workspaceId, 'fallback');
  const denied = fixture('regular', 'revoked', { fallback: true }); assert.equal((await denied.invoke()).status, 403); assert.equal(denied.writes.length, 0);
});
test('regular installation and scope guards remain mandatory', async () => {
  const f = fixture('regular', 'member', { noInstallation: true }); assert.equal((await f.invoke()).status, 403); assert.equal(f.writes.length, 0);
  const invalid = fixture('regular'); assert.equal((await invalid.invoke({ scope: 'unsupported' })).status, 400); assert.equal(invalid.writes.length, 0);
});
