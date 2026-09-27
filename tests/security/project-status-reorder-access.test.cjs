const { assert, test, load, matches } = require('./helpers.cjs');

function fixture(access = 'member', options = {}) {
  const actor = { id: 'alice', email: 'alice@example.test', createdAt: new Date(), updatedAt: new Date() };
  const workspace = { id: 'workspace', ownerId: access === 'owner' ? 'alice' : 'bob', members: access === 'owner' || access === 'foreign' ? [] : [{ userId: 'alice', status: access === 'member', user: { email: actor.email } }] };
  const project = { id: 'project', workspaceId: 'workspace', workspace };
  const foreign = { id: 'foreign-project', workspace: { ownerId: 'bob', members: [] } };
  const rows = [{ id: 'a', name: 'Open', projectId: 'project', project, order: 1 }, { id: 'b', name: 'Done', projectId: 'project', project, order: 2 }, { id: 'foreign', name: 'Open', projectId: 'foreign-project', project: foreign, order: 99 }];
  const writes = [], attempts = [];
  const queryProject = async ({ where }) => !options.missing && matches(project, where) ? project : null;
  const update = async ({ where, data }, single) => {
    if (options.move && attempts.length === 1) { rows[1].projectId = 'foreign-project'; rows[1].project = foreign; }
    attempts.push(where);
    const selected = rows.filter(row => matches(row, where));
    if (single && !selected.length) throw new Error('record missing');
    for (const row of selected) { row.order = data.order; writes.push(row.id); }
    return single ? selected[0] : { count: selected.length };
  };
  const db = {
    user: { findUnique: async () => options.deleted ? null : actor },
    project: { findUnique: queryProject, findFirst: queryProject },
    workspaceMember: { findFirst: async ({ where }) => workspace.members.find(member => matches({ ...member, workspaceId: workspace.id }, where)) || null },
    $transaction: async fn => {
      if (options.revoke) { workspace.ownerId = 'bob'; workspace.members = []; }
      const orders = rows.map(row => row.order); let checked = false;
      const tx = {
        project: { findFirst: async query => { checked = true; return queryProject(query); } },
        projectStatus: {
          update: query => update(query, true),
          updateMany: query => { if (options.requireTxCheck) assert.equal(checked, true); return update(query, false); },
        },
      };
      try { return await fn(tx); }
      catch (error) { rows.forEach((row, i) => { row.order = orders[i]; }); writes.length = 0; throw error; }
    },
  };
  const deps = { '@/lib/prisma': { prisma: db }, '@/lib/auth': { authConfig: {} }, '@/lib/auth-options': { authOptions: {} },
    'next-auth/next': { getServerSession: async () => options.absent ? null : { user: actor } },
    '@/lib/request-session': { getServerSession: async () => options.absent ? null : { user: actor } },
    '@/lib/post-access': load('src/lib/post-access.ts'),
    'next/server': { NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200 }) } },
  };
  deps['@/lib/session'] = load('src/lib/session.ts', deps, { console: { error() {} } });
  const handler = load('src/app/api/projects/[projectId]/statuses/reorder/route.ts', deps, { Error, console: { error() {} } }).PATCH;
  return { rows, writes, attempts, invoke: updates => handler({ json: async () => ({ updates }) }, { params: Promise.resolve({ projectId: 'project' }) }) };
}

test('foreign or missing explicit IDs reject the entire batch without committed changes', async () => {
  for (const id of ['foreign', 'missing']) for (const leading of [[], [{ id: 'a', order: 10 }]]) {
    const f = fixture(); assert.equal((await f.invoke([...leading, { id, order: 20 }])).status, 409);
    assert.deepEqual(f.rows.map(row => row.order), [1, 2, 99]); assert.deepEqual(f.writes, []);
  }
});
test('live owner without membership and active member can reorder IDs and names on same transaction handle', async () => {
  for (const access of ['owner', 'member']) {
    const f = fixture(access, { requireTxCheck: true }); const result = await f.invoke([{ id: 'a', order: '3' }, { name: 'Done', order: 4 }]);
    assert.equal(result.status, 200); assert.equal(result.body.success, true); assert.deepEqual(f.rows.map(row => row.order), [3, 4, 99]);
  }
});
test('missing names remain no-op for multi-project view broadcasting and names cannot mutate foreign project', async () => {
  const f = fixture(); assert.equal((await f.invoke([{ name: 'Absent here', order: 8 }, { name: 'Open', order: 5 }])).status, 200);
  assert.deepEqual(f.rows.map(row => row.order), [5, 2, 99]);
});
test('duplicate own IDs retain sequential ordering while explicit foreign ID takes precedence over valid name', async () => {
  const f = fixture(); assert.equal((await f.invoke([{ id: 'a', order: 5 }, { id: 'a', order: 6 }])).status, 200); assert.equal(f.rows[0].order, 6);
  const denied = fixture(); assert.equal((await denied.invoke([{ id: 'foreign', name: 'Open', order: 7 }])).status, 409); assert.deepEqual(denied.writes, []);
});
test('inactive and foreign workspace users have no write effects', async () => {
  for (const access of ['revoked', 'foreign']) { const f = fixture(access); assert.ok([403, 404].includes((await f.invoke([{ id: 'a', order: 8 }])).status)); assert.deepEqual(f.writes, []); }
});
test('absent and deleted actors cannot reorder', async () => {
  for (const flag of ['absent', 'deleted']) { const f = fixture('member', { [flag]: true }); assert.equal((await f.invoke([{ id: 'a', order: 8 }])).status, 401); assert.deepEqual(f.writes, []); }
});
test('workspace access revoked at transaction entry denies all updates', async () => {
  for (const access of ['owner', 'member']) { const f = fixture(access, { revoke: true }); assert.equal((await f.invoke([{ id: 'a', order: 8 }])).status, 409); assert.deepEqual(f.writes, []); assert.deepEqual(f.rows.map(row => row.order), [1, 2, 99]); }
});
test('status moved to a foreign project between updates rolls back earlier batch changes', async () => {
  const f = fixture('member', { move: true }); assert.equal((await f.invoke([{ id: 'a', order: 8 }, { id: 'b', order: 9 }])).status, 409);
  assert.deepEqual(f.writes, []); assert.deepEqual(f.rows.map(row => row.order), [1, 2, 99]);
});
test('empty updates and missing projects retain denial without writes', async () => {
  const f = fixture(); assert.equal((await f.invoke([])).status, 400); assert.deepEqual(f.writes, []);
  const missing = fixture('member', { missing: true }); assert.equal((await missing.invoke([{ id: 'a', order: 8 }])).status, 404); assert.deepEqual(missing.writes, []);
});
