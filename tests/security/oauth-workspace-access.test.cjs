const { assert, test, load, matches } = require('./helpers.cjs');

function fixture(kind, access = 'member', options = {}) {
  const actor = { id: 'alice', createdAt: new Date(), updatedAt: new Date() };
  const workspace = { id: 'workspace', slug: 'slug-only', ownerId: access === 'owner' ? 'alice' : 'bob', members: access === 'foreign' || access === 'owner' ? [] : [{ userId: 'alice', status: access === 'member' }] };
  const fallback = { id: 'fallback', slug: 'fallback', ownerId: 'alice', members: [] };
  const rows = options.fallback ? [workspace, fallback] : [workspace];
  const writes = [], queries = [], pending = [];
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
    appOAuthAuthorizationCode: { create: async ({ data }) => { pending.push(data); return data; } },
    $transaction: async fn => {
      if (options.revoke) { workspace.ownerId = 'bob'; workspace.members = []; }
      let checked = false;
      return fn({
        workspace: { findFirst: async query => { checked = true; return lookup(query); } },
        appOAuthAuthorizationCode: { deleteMany: async ({ where }) => {
          const i = pending.findIndex(row => Object.entries(where).every(([k,v]) => k === 'expiresAt' ? row[k] > v.gt : row[k] === v));
          if (i < 0) return { count: 0 }; pending.splice(i, 1); return { count: 1 };
        }, create: async ({ data }) => {
          assert.equal(checked, true, 'access must be checked on the transaction handle');
          writes.push({ ...data, transaction: true }); return data;
        } },
      });
    },
  };
  const deps = {
    '@/lib/prisma': { prisma: db }, '@/lib/auth-options': { authOptions: {} },
    '@/lib/request-session': { getServerSession: async () => options.absent ? null : { user: actor } },
    '@/lib/apps/crypto': { generateAuthorizationCode: () => require('node:crypto').randomBytes(32).toString('hex') },
    crypto: { randomBytes: () => ({ toString: () => 'mcp-code' }) },
    '@/lib/oauth-scopes': load('src/lib/oauth-scopes.ts', {}, { URL }),
    '@/lib/post-access': load('src/lib/post-access.ts'),
    'next/navigation': { redirect: url => { throw { digest: 'NEXT_REDIRECT', url }; } },
    'next/server': { NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200 }), redirect: url => ({ status: 307, url: url.toString() }) } },
  };
  deps['@/lib/session'] = load('src/lib/session.ts', deps, { console: { error() {} } });
  deps['@/lib/oauth-authorization'] = load('src/lib/oauth-authorization.ts', deps, { URL, URLSearchParams, process: { env: {} }, console: { error() {}, log() {} } });
  const handler = load(`src/app/api/oauth/${kind === 'mcp' ? 'mcp/' : ''}authorize/route.ts`, deps, { URL, process: { env: {} }, console: { error() {}, log() {} } });
  const paramsFor = (overrides = {}) => {
    const params = { client_id: 'client', redirect_uri: 'https://client.example.test/callback', response_type: 'code', workspace_id: 'workspace', scope: 'issues:read', state: 'state', nonce: 'nonce', installation_id: 'install', code_challenge: 'a'.repeat(43), code_challenge_method: 'S256', ...overrides };
    for (const k of Object.keys(params)) if (params[k] === null) delete params[k];
    return params;
  };
  const request = (params, method = 'GET', headers = {}, body) => ({
    method, url: `https://collab.example.test/api/oauth/authorize?${new URLSearchParams(params)}`,
    headers: new Headers({ host: 'collab.example.test', ...headers }), json: async () => body,
  });
  const call = async (method, req) => {
    try { return await handler[method](req); }
    catch (e) { if (e.digest === 'NEXT_REDIRECT') return { status: 307, url: e.url }; throw e; }
  };
  const prepare = (overrides = {}) => call('GET', request(paramsFor(overrides), 'GET', { 'x-collab-consent': 'prepare' }));
  const approve = (token, overrides = {}, headers = {}) => call('POST', request({}, 'POST', {
    origin: 'https://collab.example.test', 'content-type': 'application/json', ...headers,
  }, { ...paramsFor(overrides), consent_token: token, approve: true }));
  const invoke = async (overrides = {}) => {
    const prepared = await prepare(overrides);
    if (prepared.status !== 200) return prepared;
    const result = await approve(prepared.body.consent_token, overrides);
    return result.status === 200 ? { ...result, url: result.body.redirect } : result;
  };
  const navigate = overrides => call('GET', request(paramsFor(overrides)));

  return { invoke, writes, queries, pending, prepare, approve, navigate };
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
      const f = fixture(kind, access); const result = await f.invoke(); assert.equal(result.status, 200);
      assert.equal(f.writes.length, 1); const row = f.writes[0];
      assert.equal(row.userId, 'alice'); assert.equal(row.workspaceId, 'workspace'); assert.equal(row.clientId, 'client');
      assert.equal(row.installationId, kind === 'mcp' ? null : 'install'); assert.equal(row.scope, 'issues:read');
      assert.equal(row.state, 'state'); assert.equal(row.code_challenge, 'a'.repeat(43)); assert.equal(row.code_challenge_method, 'S256');
      assert.equal(row.nonce, 'consent_approved'); assert.equal(row.redirectUri, 'https://client.example.test/callback');
      assert.equal(row.transaction, true);
      const url = new URL(result.url); assert.equal(url.origin, 'https://client.example.test'); assert.equal(url.searchParams.get('workspace_id'), 'workspace');
      assert.equal(url.searchParams.get('state'), 'state'); assert.equal(url.searchParams.get('code'), row.code);
    }
  });
  test(`${kind}: missing/deleted actor cannot mint and exact workspace IDs reject slug aliases`, async () => {
    for (const option of ['absent', 'deleted']) {
      const f = fixture(kind, 'member', { [option]: true }); const result = await f.invoke();
      assert.equal(f.writes.length, 0); assert.equal(result.status, 401);
    }
    const f = fixture(kind); assert.equal((await f.invoke({ workspace_id: 'slug-only' })).status, 403); assert.equal(f.writes.length, 0);
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
for (const kind of ['regular', 'mcp']) {
  test(`${kind}: preparation and approval require an explicit workspace even with an accessible fallback`, async () => {
    const f = fixture(kind, 'member', { fallback: true });
    assert.equal((await f.prepare({ workspace_id: null })).status, 400);
    assert.equal((await f.approve('invented', { workspace_id: null })).status, 400);
    assert.equal(f.queries.length, 0); assert.equal(f.pending.length, 0); assert.equal(f.writes.length, 0);
  });
}
test('regular installation and scope guards remain mandatory', async () => {
  const f = fixture('regular', 'member', { noInstallation: true }); assert.equal((await f.invoke()).status, 403); assert.equal(f.writes.length, 0);
  const invalid = fixture('regular'); assert.equal((await invalid.invoke({ scope: 'unsupported' })).status, 400); assert.equal(invalid.writes.length, 0);
});

for (const kind of ['regular', 'mcp']) {
  test(`${kind}: navigation cannot grant access even with attacker-selected workspace and PKCE`, async () => {
    const f = fixture(kind); const response = await f.navigate();
    assert.equal(response.status, 307); assert.equal(new URL(response.url).pathname, '/auth/mcp');
    assert.equal(f.writes.length, 0); assert.equal(f.pending.length, 0);
  });
  test(`${kind}: explicit approval is bound, single-use and cannot be forged cross-origin`, async () => {
    const f = fixture(kind); const prepared = await f.prepare();
    assert.equal(prepared.status, 200);
    assert.equal(prepared.body.redirect_uri, 'https://client.example.test/callback');
    assert.equal(prepared.body.state, 'state');
    assert.equal(f.pending[0].used, true); assert.equal(f.writes.length, 0);
    const token = prepared.body.consent_token;
    for (const override of [{ state: 'other' }, { redirect_uri: 'https://attacker.test/callback' }, { scope: 'secrets:read' }, { code_challenge: 'b'.repeat(43) }, { workspace_id: 'foreign' }]) {
      const response = await f.approve(token, override); assert.ok(response.status >= 400); assert.equal(f.writes.length, 0);
    }
    assert.equal((await f.approve(token, {}, { origin: 'https://attacker.test' })).status, 403);
    assert.equal((await f.approve('invented')).status, 403);
    assert.equal((await f.approve(token)).status, 200);
    assert.equal((await f.approve(token)).status, 403); assert.equal(f.writes.length, 1);
  });
  test(`${kind}: missing or malformed PKCE and excess scopes are refused`, async () => {
    for (const override of [{ code_challenge: null }, { code_challenge: 'short' }, { code_challenge_method: 'plain' }, { scope: 'issues:read secrets:read' }]) {
      const f = fixture(kind); assert.equal((await f.invoke(override)).status, 400); assert.equal(f.writes.length, 0);
    }
  });
}
test('native system client dynamic loopback remains usable after explicit approval', async () => {
  const f = fixture('mcp'); const result = await f.invoke({ redirect_uri: 'http://127.0.0.1:54321/callback' });
  assert.equal(result.status, 200); assert.equal(new URL(result.url).port, '54321'); assert.equal(f.writes.length, 1);
});

test('regular read-only app may omit scope and approve only the server prepared grant', async () => {
  const f = fixture('regular'); const prepared = await f.prepare({ scope: '' });
  assert.equal(prepared.status, 200); assert.equal(prepared.body.scope, 'issues:read');
  assert.equal((await f.approve(prepared.body.consent_token, { scope: prepared.body.scope })).status, 200);
  assert.equal(f.writes[0].scope, 'issues:read');
});
