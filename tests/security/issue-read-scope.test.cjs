const { assert, test, load, matches } = require('./helpers.cjs');

function fixture() {
  const own = { id: 'own', ownerId: 'alice', members: [] };
  const joined = { id: 'joined', ownerId: 'bob', members: [{ userId: 'alice', status: true }] };
  const project = { id: 'project', workspace: own };
  const otherProject = { id: 'other-project', workspace: joined };
  const child = { id: 'child', title: 'private child', workspace: joined, project: otherProject, statusId: null };
  const root = { id: 'issue', issueKey: 'OWN-1', title: 'Root', workspaceId: own.id, workspace: own,
    projectId: project.id, project, statusId: null, projectStatus: null, reporterId: 'alice', parentId: child.id,
    updatedAt: new Date('2026-09-27T00:00:00Z'), parent: child, children: [child], comments: [],
    labels: [{ id: 'label', name: 'private label', workspace: joined }], assignee: null, reporter: { id: 'alice' } };
  const contentReads = [];
  let writes = 0;
  function projectResult(row, include) {
    if (!include) return structuredClone(row);
    const allowed = (value, spec) => value && (!spec?.where || matches(value, spec.where));
    const result = { ...row };
    for (const name of ['labels', 'children', 'parent', 'projectStatus']) {
      const values = Array.isArray(row[name]) ? row[name] : [row[name]];
      const visible = values.filter(value => allowed(value, include[name]));
      visible.forEach(value => contentReads.push(value.title || value.name || value.id));
      result[name] = Array.isArray(row[name]) ? visible : visible[0] || null;
    }
    const count = include._count?.select?.children;
    result._count = { children: row.children.filter(value => allowed(value, count)).length, comments: 0 };
    return structuredClone(result);
  }
  const db = {
    workspace: { findFirst: async ({ where }) => [own, joined].find(row => matches(row, where)) || null },
    issue: {
      findFirst: async ({ where, include }) => matches(root, where) ? projectResult(root, include) : null,
      update: async ({ data, include }) => { writes++; Object.assign(root, data); return projectResult(root, include); },
    },
    issueFollower: { findMany: async () => [] }, projectFollower: { findMany: async () => [] },
    $transaction: async (fn, options) => { assert.equal(options.isolationLevel, 'Serializable'); return fn(db); },
  };
  const permissions = load('src/lib/permissions.ts', { './prisma': { prisma: {} } });
  const dependencies = {
    zod: require('zod'), '@/lib/prisma': { prisma: db },
    'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status ?? 200 }) } },
    '@/lib/session': { getCurrentUser: async () => ({ id: 'alice' }) },
    '@/lib/permissions': { ...permissions, checkUserPermissions: async (_user, _workspace, requested) =>
      Object.fromEntries(requested.map(permission => [permission, { hasPermission: true }])) },
    '@/lib/board-item-activity-service': { compareObjects: () => [] },
    '@/lib/redis': { publishEvent: async () => {} }, '@/utils/mentions': { extractMentionUserIds: () => [] },
    '@/lib/notification-service': {}, '@/lib/event-bus': { emitIssueUpdated: async () => {} },
    '@/utils/html-normalizer': { normalizeDescriptionHTML: value => value },
  };
  const route = load('src/app/api/issues/[issueId]/route.ts', dependencies, { URL, console });
  const invoke = (method, key = root.id) => route[method](new Request('https://example.test/issues/' + key, {
    method, ...(method === 'PUT' ? { body: JSON.stringify({ title: 'Updated' }) } : {}),
  }), { params: Promise.resolve({ issueId: key }) });
  return { root, child, joined, otherProject, invoke, contentReads, writes: () => writes };
}

for (const association of ['project', 'status']) {
  test(`issue ${association} revocation denies GET and PUT before content or writes`, async () => {
    const f = fixture();
    if (association === 'project') f.root.project = f.otherProject;
    else { f.root.statusId = 'status'; f.root.projectStatus = { id: 'status', name: 'private status', project: f.otherProject }; }
    assert.equal((await f.invoke('GET')).status, 200);
    f.joined.members[0].status = false; f.contentReads.length = 0;
    for (const method of ['GET', 'PUT']) {
      for (const key of [f.root.id, f.root.issueKey]) assert.equal((await f.invoke(method, key)).status, 404);
    }
    assert.equal(f.writes(), 0);
    assert.deepEqual(f.contentReads, []);
    f.joined.ownerId = 'alice';
    assert.equal((await f.invoke('GET')).status, 200);
    assert.equal((await f.invoke('PUT')).status, 200);
    assert.equal(f.writes(), 1);
  });
}

for (const association of ['workspace', 'project', 'status']) {
test(`GET and shared mutation responses filter revoked ${association} relations and child count`, async () => {
  const f = fixture();
  if (association !== 'workspace') f.child.workspace = f.root.workspace;
  if (association === 'status') {
    f.child.project = f.root.project; f.child.statusId = 'child-status';
    f.child.projectStatus = { project: f.otherProject };
  }
  assert.equal((await f.invoke('GET')).body.issue._count.children, 1);
  f.joined.members[0].status = false; f.contentReads.length = 0;
  for (const method of ['GET', 'PUT']) {
    const response = await f.invoke(method);
    assert.equal(response.status, 200);
    assert.equal(response.body.issue.parent, null);
    assert.deepEqual(response.body.issue.children, []);
    assert.deepEqual(response.body.issue.labels, []);
    assert.equal(response.body.issue._count.children, 0);
    assert.equal(JSON.stringify(response.body).includes('private'), false);
  }
  assert.deepEqual(f.contentReads, []);
  assert.equal(f.root.parentId, f.child.id);
  assert.equal(f.root.children.length, 1);
  f.joined.members.length = 0;
  for (const method of ['GET', 'PUT']) {
    const response = await f.invoke(method);
    assert.equal(response.status, 200);
    assert.equal(response.body.issue._count.children, 0);
    assert.equal(response.body.issue.parent, null);
    assert.equal(JSON.stringify(response.body).includes('private'), false);
  }
  f.joined.ownerId = 'alice';
  assert.equal((await f.invoke('GET')).body.issue._count.children, 1);
});
}

test('exact nonnumeric issue keys resolve with full scope and deny after revocation', async () => {
  const f = fixture();
  f.root.issueKey = 'A1B-T1'; f.root.project = f.otherProject;
  assert.equal((await f.invoke('GET', 'A1B-T1')).status, 200);
  f.joined.members[0].status = false;
  assert.equal((await f.invoke('GET', 'A1B-T1')).status, 404);
});
