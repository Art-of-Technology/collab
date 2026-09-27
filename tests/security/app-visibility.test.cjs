const { assert, test, load, matches } = require('./helpers.cjs');

function fixture(subject = null, deleted = false) {
  const date = new Date('2026-09-27T00:00:00Z');
  const rows = ['PUBLISHED', 'DRAFT', 'SUSPENDED', 'IN_REVIEW', 'REJECTED'].flatMap((status, index) => ['alice', 'bob', null].map((owner, n) => ({
    id: `${status}-${owner}`, slug: `${status}-${owner}`, userId: owner, publisherId: 'alice', status,
    name: `${status} app`, createdAt: new Date(date.getTime() + index * 10 + n), updatedAt: date,
    iconUrl: null, manifestUrl: 'https://manifest.example.test/app.json', visibility: 'PRIVATE', permissions: { org: false, user: true },
    versions: [{ id: 'version', appId: `${status}-${owner}`, version: '1', manifest: { name: 'Manifest' }, createdAt: date }],
    scopes: [{ scope: 'issues:read' }], oauthClient: { id: 'client', appId: `${status}-${owner}`, clientId: 'public-client', redirectUris: ['https://callback.example.test'], clientSecret: 'must-not-leak', apiKey: 'must-not-leak' },
  })));
  const queries = [];
  const db = {
    user: { findUnique: async ({ where }) => !deleted && where.id === subject?.id ? { id: where.id, createdAt: date, updatedAt: date } : null },
    app: {
      findUnique: async query => { queries.push(['detail', query]); return rows.find(row => matches(row, query.where)) ?? null; },
      findFirst: async query => { queries.push(['detail', query]); return rows.find(row => matches(row, query.where)) ?? null; },
      findMany: async query => { queries.push(['list', query]); return rows.filter(row => matches(row, query.where)).sort((a, b) => b.createdAt - a.createdAt).slice(query.skip, query.skip + query.take); },
      count: async query => { queries.push(['count', query]); return rows.filter(row => matches(row, query.where)).length; },
    },
  };
  const deps = { '@/lib/prisma': { prisma: db }, '@/lib/auth-options': { authOptions: {} },
    '@/lib/request-session': { getServerSession: async () => subject && { user: subject } },
    'next/server': { NextResponse: { json: (body, options) => ({ status: options?.status ?? 200, body: JSON.parse(JSON.stringify(body)) }) } },
    '@/lib/apps/ownership': load('src/lib/apps/ownership.ts'),
  };
  deps['@/lib/session'] = load('src/lib/session.ts', deps, { console: { error() {} } });
  const globals = { URL, console: { error() {} } };
  const detail = load('src/app/api/apps/[slug]/route.ts', deps, globals).GET;
  const list = load('src/app/api/apps/route.ts', deps, globals).GET;
  const request = (search = '', header = '') => ({ url: `https://collab.example.test/api/apps${search}`, headers: new Headers(header ? { authorization: header } : {}) });
  return { rows, queries, detail: (slug, header) => detail(request('', header), { params: Promise.resolve({ slug }) }), list: (search, header) => list(request(search, header)) };
}

test('unpublished detail rejects anonymous, forged-header, foreign, deleted and missing-owner access', async () => {
  for (const status of ['DRAFT', 'SUSPENDED', 'IN_REVIEW', 'REJECTED']) {
    for (const header of ['', 'anything', 'Bearer unsupported-app-token']) assert.equal((await fixture().detail(`${status}-alice`, header)).status, 404);
    assert.equal((await fixture({ id: 'alice', role: 'SYSTEM_ADMIN' }).detail(`${status}-bob`, 'anything')).status, 404);
    assert.equal((await fixture({ id: 'alice' }, true).detail(`${status}-alice`, 'anything')).status, 404);
    assert.equal((await fixture({ id: 'alice' }).detail(`${status}-null`, 'anything')).status, 404);
  }
});

test('live owner can read own nonpublished details with session alone; publisher label grants nothing', async () => {
  const f = fixture({ id: 'alice' });
  for (const status of ['DRAFT', 'SUSPENDED', 'IN_REVIEW', 'REJECTED']) {
    const result = await f.detail(`${status}-alice`); assert.equal(result.status, 200); assert.equal(result.body.app.status, status);
    assert.equal((await f.detail(`${status}-bob`)).status, 404);
  }
});

test('published details retain anonymous access and safe installation projection', async () => {
  const f = fixture(); const result = await f.detail('PUBLISHED-bob'); assert.equal(result.status, 200);
  assert.deepEqual(Object.keys(result.body).sort(), ['app', 'oauthClient', 'permissions', 'scopes', 'versions']);
  assert.deepEqual(result.body.oauthClient, { id: 'client', appId: 'PUBLISHED-bob', clientId: 'public-client', redirectUris: ['https://callback.example.test'] });
  assert.deepEqual(result.body.scopes, ['issues:read']); assert.equal(result.body.versions[0].manifest.name, 'Manifest');
  assert.equal(JSON.stringify(result.body).includes('must-not-leak'), false);
  assert.equal((await f.detail('missing')).status, 404);
});

test('list access scope constrains both results and totals before requested filters', async () => {
  for (const [actor, deleted, search, expected] of [
    [null, false, '', 3], [null, false, '?status=DRAFT', 0],
    [null, false, '?publisherId=alice', 3], [null, false, '?status=ignored', 3],
    [{ id: 'alice' }, true, '?status=DRAFT', 0],
    [{ id: 'alice' }, false, '?status=DRAFT', 1],
    [{ id: 'alice' }, false, '?status=DRAFT&publisherId=bob', 0],
    [{ id: 'alice' }, false, '?status=SUSPENDED&publisherId=alice', 1],
    [{ id: 'alice' }, false, '?status=IN_REVIEW', 7],
  ]) {
    const f = fixture(actor, deleted); const result = await f.list(search, 'Bearer forged'); assert.equal(result.status, 200);
    assert.equal(result.body.total, expected); assert.equal(result.body.apps.length, expected);
    assert.ok(result.body.apps.every(app => app.status === 'PUBLISHED' || (!deleted && actor && app.id.endsWith(`-${actor.id}`))));
    assert.deepEqual(f.queries[0][1].where, f.queries[1][1].where);
    assert.equal(JSON.stringify(result.body).includes('must-not-leak'), false);
  }
});

test('scoped list preserves pagination, descending order, latest version and total', async () => {
  const f = fixture({ id: 'alice' }); const result = await f.list('?limit=2&offset=1');
  assert.equal(result.body.total, 7); assert.deepEqual(result.body.apps.map(app => app.id), ['IN_REVIEW-alice', 'SUSPENDED-alice']);
  assert.ok(result.body.apps.every(app => app.latestVersion === '1'));
  const query = f.queries.find(([name]) => name === 'list')[1];
  assert.equal(query.take, 2); assert.equal(query.skip, 1); assert.equal(query.orderBy.createdAt, 'desc');
  assert.equal(query.include.versions.orderBy.createdAt, 'desc'); assert.equal(query.include.versions.take, 1);
});
