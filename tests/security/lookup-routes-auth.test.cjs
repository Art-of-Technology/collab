const { assert, test, load, matches } = require('./helpers.cjs');

// Lookups that used to answer any caller: they need a session and show only what the caller's workspaces contain.
function fixture() {
  const w1 = { id: 'w1', slug: 'one', name: 'One', ownerId: 'alice', members: [{ userId: 'bob', status: true }, { userId: 'dave', status: false }] };
  const w2 = { id: 'w2', slug: 'two', name: 'Two', ownerId: 'erin', members: [] };
  const project = (id, workspace) => ({ id, name: `Project ${id}`, slug: id, workspace });
  const issues = [
    { id: 'i1', issueKey: 'AAA-1', workspaceId: 'w1', workspace: w1, project: project('p1', w1) },
    // The same key exists in another workspace, and comes first.
    { id: 'i0', issueKey: 'AAA-2', workspaceId: 'w2', workspace: w2, project: project('p2', w2) },
    { id: 'i2', issueKey: 'AAA-2', workspaceId: 'w1', workspace: w1, project: project('p1', w1) },
    { id: 'i3', issueKey: 'BBB-1', workspaceId: 'w2', workspace: w2, project: project('p2', w2) },
  ];
  const repositories = [{ id: 'r1', project: project('p1', w1) }, { id: 'r2', project: project('p2', w2) }];
  const users = ['alice', 'bob', 'dave', 'erin'].map(id => ({ id, role: 'DEVELOPER', createdAt: new Date(), updatedAt: new Date(), emailVerified: null }));
  const state = { session: null, reads: [], issueError: false };
  const data = name => new Proxy({}, { get: (_, method) => async () => { state.reads.push(`${name}.${String(method)}`); return method === 'count' ? 0 : []; } });
  // Like the database client, a query with select returns only the selected fields.
  const first = rows => async ({ where, select }) => {
    const row = rows.find(entry => matches(entry, where)) ?? null;
    return row && select ? Object.fromEntries(Object.keys(select).map(key => [key, row[key]])) : row;
  };
  const prisma = {
    user: { findUnique: async ({ where }) => users.find(row => row.id === where.id) ?? null },
    issue: { findFirst: async args => { if (state.issueError) throw new Error('database unavailable'); return first(issues)(args); }, findUnique: first(issues) },
    repository: { findFirst: first(repositories), findUnique: first(repositories) },
    commit: data('commit'), pullRequest: data('pullRequest'), deployment: data('deployment'), review: data('review'), release: data('release'),
  };
  const json = (body, init = {}) => ({ body, status: init.status ?? 200 });
  const deps = {
    'next/server': { NextResponse: { json } },
    '@/lib/prisma': { prisma }, '@/lib/auth-options': { authOptions: {} },
    '@/lib/request-session': { getServerSession: async () => state.session },
    '@/lib/post-access': load('src/lib/post-access.ts'),
    '@/lib/shared-issue-key-utils': load('src/lib/shared-issue-key-utils.ts'),
  };
  const globals = { URL, console: { error() {}, log() {} }, Date, parseInt, Promise };
  deps['@/lib/session'] = load('src/lib/session.ts', deps, globals);
  deps['@/lib/issue-finder'] = load('src/lib/issue-finder.ts', deps, globals);
  deps['@/lib/github/access'] = load('src/lib/github/access.ts', deps, globals);
  deps['@/lib/repository-access'] = load('src/lib/repository-access.ts', deps, globals);
  const route = file => load(`src/app/api/${file}/route.ts`, deps, globals);
  const as = id => { state.session = id ? { user: { id } } : null; };
  const get = (handler, query = '', params = {}) => handler.GET({ url: `https://collab.test/api/x${query}` }, { params: Promise.resolve(params) });
  const resolve = route('issues/resolve'), keys = route('resolve-issue-key');
  const repository = Object.fromEntries(['commits', 'contributors', 'deployments', 'pull-requests'].map(name => [name, route(`github/repositories/[repositoryId]/${name}`)]));
  return { state, as, get, resolve, keys, repository };
}

test('an issue key resolves only inside the caller\'s workspaces', async () => {
  const f = fixture();
  f.as(null);
  assert.equal((await f.get(f.resolve, '?issueKey=AAA-1')).status, 401);
  for (const user of ['alice', 'bob']) {
    f.as(user);
    const found = await f.get(f.resolve, '?issueKey=AAA-1');
    assert.equal(JSON.stringify([found.status, found.body.issueId, found.body.workspace.id]), JSON.stringify([200, 'i1', 'w1']), user);
    assert.equal((await f.get(f.resolve, '?issueKey=AAA-2')).body.issueId, 'i2', 'the caller\'s own issue, not the one with the same key elsewhere');
    assert.equal((await f.get(f.resolve, '?issueKey=BBB-1')).status, 404, 'an issue of another workspace reads as missing');
  }
  f.as('dave'); // switched off in w1
  assert.equal((await f.get(f.resolve, '?issueKey=AAA-1')).status, 404);
  f.as('erin');
  assert.equal((await f.get(f.resolve, '?issueKey=AAA-2')).body.issueId, 'i0');
});

test('issue ids and keys convert only for issues the caller can use', async () => {
  const f = fixture();
  const ask = async (value, action, extra = '') => (await f.get(f.keys, `?value=${value}&action=${action}${extra}`));
  f.as(null);
  assert.equal((await ask('AAA-1', 'toId')).status, 401);
  f.as('alice');
  assert.equal((await ask('AAA-1', 'toId')).body.result, 'i1');
  assert.equal((await ask('AAA-2', 'toId')).body.result, 'i2');
  assert.equal((await ask('AAA-2', 'toId', '&workspaceId=w2')).body.result, null, 'naming another workspace does not open it');
  assert.equal((await ask('BBB-1', 'toId')).body.result, null);
  assert.equal((await ask('i1', 'toIssueKey')).body.result, 'AAA-1');
  assert.equal((await ask('i3', 'toIssueKey')).body.result, null);
  assert.equal(JSON.stringify((await ask('AAA-1', 'resolve')).body.result), JSON.stringify({ id: 'i1', issueKey: 'AAA-1' }));
  assert.equal((await ask('BBB-1', 'resolve')).body.result, null);
  assert.equal((await ask('i1', 'toId')).body.result, 'i1', 'an id is still returned as given');
  assert.equal((await ask('AAA-1', 'nonsense')).status, 400);
});

test('issue lookup failures preserve the null result response', async () => {
  const f = fixture();
  f.as('alice');
  f.state.issueError = true;
  for (const [value, action] of [['AAA-1', 'toId'], ['i1', 'toIssueKey'], ['AAA-1', 'resolve'], ['12345678-1234-1234-1234-123456789abc', 'resolve']]) {
    const response = await f.get(f.keys, `?value=${value}&action=${action}&workspaceId=w1`);
    assert.equal(response.status, 200, action);
    assert.equal(response.body.result, null, action);
  }
  const passthrough = await f.get(f.keys, '?value=i1&action=toId');
  assert.equal(passthrough.status, 200);
  assert.equal(passthrough.body.result, 'i1');
});

test('repository data needs a session and access to the repository\'s workspace', async () => {
  const f = fixture();
  for (const [name, handler] of Object.entries(f.repository)) {
    f.as(null);
    assert.equal((await f.get(handler, '', { repositoryId: 'r1' })).status, 401, name);
    for (const user of ['erin', 'dave']) {
      f.as(user);
      assert.equal((await f.get(handler, '', { repositoryId: 'r1' })).status, 404, `${name} for ${user}`);
    }
    assert.deepEqual(f.state.reads, [], `${name}: nothing was read for them`);
    for (const user of ['alice', 'bob']) {
      f.as(user);
      assert.equal((await f.get(handler, '', { repositoryId: 'r1' })).status, 200, `${name} for ${user}`);
      assert.equal((await f.get(handler, '', { repositoryId: 'r2' })).status, 404, `${name}: another workspace's repository`);
    }
    assert.ok(f.state.reads.length > 0, `${name} read its data for a member`);
    f.state.reads.length = 0;
  }
});
