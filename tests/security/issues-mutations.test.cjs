const { assert, test, resolve, load, matches, issues, prisma, findIssueByIdOrKey, userHasWorkspaceAccess } = require('./helpers.cjs');


test('issue IDs and keys require ownership or active membership, even with explicit workspace', async () => {
  for (const issue of issues) {
    const allowed = ['own', 'joined'].includes(issue.workspaceId);
    for (const key of [issue.id, issue.issueKey]) {
      for (const workspaceId of [undefined, issue.workspaceId]) {
        const result = await findIssueByIdOrKey(key, { userId: 'alice', workspaceId });
        assert.equal(result?.id ?? null, allowed ? issue.id : null, `${key}/${workspaceId}`);
      }
      assert.equal(await findIssueByIdOrKey(key, { workspaceId: issue.workspaceId }), null);
      assert.equal(await findIssueByIdOrKey(key, { userId: 'alice', workspaceId: 'missing' }), null);
    }
    assert.equal(await userHasWorkspaceAccess('alice', issue.workspaceId), allowed);
  }
  assert.equal(await userHasWorkspaceAccess('', 'own'), false);
});

test('issue mutations reject mass assignment, foreign relations and read-only users', async () => {
  let allowed = true;
  let writes = 0;
  const existing = { id: 'issue', workspaceId: 'own', projectId: 'project', reporterId: 'alice', title: 'Before' };
  const db = {
    issue: { findFirst: async ({ where }) => where.id === existing.id ? existing : null, findUnique: async () => existing, delete: async () => { writes++; },
      update: async ({ data }) => { writes++; return { ...existing, ...data }; } },
    project: { findFirst: async () => null },
    projectStatus: { findMany: async () => [] },
    taskLabel: { count: async () => 0 },
    issueFollower: { findMany: async () => [] }, projectFollower: { findMany: async () => [] },
    $transaction: async fn => fn(db),
  };
  const permissionModule = load('src/lib/permissions.ts', { './prisma': { prisma: {} } });
  const dependencies = {
    'zod': require('zod'), '@prisma/client': require('@prisma/client'),
    'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status ?? 200 }) } },
    '@/lib/prisma': { prisma: db },
    '@/lib/session': { getCurrentUser: async () => ({ id: 'alice' }) },
    '@/lib/permissions': {
      ...permissionModule,
      checkUserPermissions: async (_user, _workspace, permissions) => Object.fromEntries(permissions.map(p => [p, { hasPermission: allowed }])),
    },
    '@/lib/issue-finder': {
      findIssueByIdOrKey: async () => existing, STANDARD_ISSUE_INCLUDE: {},
      userHasWorkspaceAccess: async user => user === 'alice',
    },
    '@/lib/board-item-activity-service': { compareObjects: () => [] },
    '@/lib/redis': { publishEvent: async () => {} },
    '@/utils/mentions': { extractMentionUserIds: () => [] },
    '@/lib/notification-service': {},
    '@/lib/event-bus': { emitIssueUpdated: async () => {}, emitIssueDeleted: async () => {} },
    '@/utils/html-normalizer': { normalizeDescriptionHTML: value => value },
  };
  const route = load('src/app/api/issues/[issueId]/route.ts', dependencies, { URL, console });
  const context = { params: Promise.resolve({ issueId: 'issue' }) };
  for (const body of [
    {}, { workspaceId: 'foreign' }, { projectId: 'foreign' }, { id: 'new-id' },
    { workspace: { connect: { id: 'foreign' } } }, { createdAt: '2020-01-01' },
    { title: 42 }, { priority: 'root' }, { assigneeId: 'outsider' },
    { reporterId: 'outsider' }, { parentId: 'foreign' }, { labels: ['foreign'] }, { statusId: 'foreign' },
  ]) {
    const response = await route.PUT(new Request('https://example.test/issues/issue', {
      method: 'PUT', body: JSON.stringify(body),
    }), context);
    assert.equal(response.status, 400, JSON.stringify(body));
    assert.equal(writes, 0);
  }
  allowed = false;
  assert.equal((await route.PUT(new Request('https://example.test/issues/issue', {
    method: 'PUT', body: JSON.stringify({ title: 'After' }),
  }), context)).status, 403);
  assert.equal((await route.DELETE(new Request('https://example.test/issues/issue'), context)).status, 403);
  assert.equal(writes, 0);
  allowed = true;
  const response = await route.PUT(new Request('https://example.test/issues/issue', {
    method: 'PUT', body: JSON.stringify({ title: 'After' }),
  }), context);
  assert.equal(response.status, 200);
  assert.equal(response.body.issue.title, 'After');
  assert.equal(response.body.issue.workspaceId, 'own');
  assert.equal(writes, 1);
});

test('AI issue suggestions and relations resolve their source issue inside the authorized workspace', async () => {
  for (const endpoint of ['related', 'suggestions']) {
    let reads = 0;
    const { GET } = load(`src/app/api/ai/issues/${endpoint}/route.ts`, {
      'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status ?? 200 }) } },
      'next-auth': { getServerSession: async () => ({ user: { id: 'alice' } }) },
      '@/lib/auth': { authConfig: {} }, '@/lib/issue-finder': { userHasWorkspaceAccess },
      '@/lib/prisma': { prisma: { issue: { findFirst: async ({ where }) => {
        reads++; assert.equal(where.workspaceId, 'joined'); assert.equal(where.id, 'foreign-issue'); return null;
      } } } },
    }, { URL });
    for (const workspace of ['revoked', 'foreign', 'joined']) {
      const response = await GET(new Request(`https://example.test/?workspaceId=${workspace}&issueId=foreign-issue`));
      assert.equal(response.status, workspace === 'joined' ? 404 : 403);
    }
    assert.equal(reads, 1);
  }
});

test('review: issue field grants and atomic same-workspace project moves preserve rights and relations', async () => {
  const client = require('@prisma/client');
  const permissionModule = load('src/lib/permissions.ts', { './prisma': { prisma: {} } });
  const defaults = load('src/lib/role-permission-defaults.ts', { '@prisma/client': client, '@/lib/prisma': { prisma: {} } });
  let grants;
  let active;
  let state;
  let writes;
  let assignments;
  const statuses = [
    { id: 'old-todo', projectId: 'source', name: 'todo', displayName: 'To Do', isActive: true },
    { id: 'old-progress', projectId: 'source', name: 'in_progress', displayName: 'In Progress', isActive: true },
    { id: 'new-todo', projectId: 'destination', name: 'todo', displayName: 'To Do', isActive: true },
    { id: 'new-progress', projectId: 'destination', name: 'in_progress', displayName: 'In Progress', isActive: true },
    { id: 'inactive', projectId: 'destination', name: 'closed', displayName: 'Closed', isActive: false },
  ];
  const projects = [{ id: 'source', workspaceId: 'joined' }, { id: 'destination', workspaceId: 'joined' },
    { id: 'no-status', workspaceId: 'joined' }, { id: 'foreign', workspaceId: 'foreign' }];
  const issueRows = () => [state, { id: 'parent', projectId: 'source', workspaceId: 'joined' }];
  const db = {
    issue: {
      findFirst: async ({ where }) => issueRows().find(row => matches(row, where)) ?? null,
      update: async ({ data }) => { writes++; Object.assign(state, data); return { ...state }; },
    },
    project: { findFirst: async ({ where }) => projects.find(row => matches(row, where)) ?? null },
    projectStatus: {
      findFirst: async ({ where }) => statuses.find(row => matches(row, where)) ?? null,
      findMany: async ({ where }) => statuses.filter(row => matches(row, where)),
    },
    taskLabel: { count: async ({ where }) => [{ id: 'label', workspaceId: 'joined' }].filter(row => matches(row, where)).length },
    issueAssignee: { upsert: async () => { assignments++; } },
    user: { findUnique: async ({ where }) => ({ id: where.id, name: where.id }) },
    issueFollower: { findMany: async () => [] }, projectFollower: { findMany: async () => [] },
    $transaction: async (fn, options) => {
      assert.equal(options.isolationLevel, 'Serializable');
      const before = structuredClone(state);
      const result = await fn(db);
      if (result.error) assert.deepEqual(state, before);
      return result;
    },
  };
  const route = load('src/app/api/issues/[issueId]/route.ts', {
    zod: require('zod'), '@prisma/client': client,
    'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status ?? 200 }) } },
    '@/lib/prisma': { prisma: db }, '@/lib/session': { getCurrentUser: async () => ({ id: 'alice' }) },
    '@/lib/permissions': { ...permissionModule,
      checkUserPermissions: async (_user, _workspace, requested) => Object.fromEntries(requested.map(p => [p, { hasPermission: grants.includes(p) }])) },
    '@/lib/issue-finder': { STANDARD_ISSUE_INCLUDE: {},
      findIssueByIdOrKey: async () => ({ ...state }),
      userHasWorkspaceAccess: async (user, workspace) => active && workspace === 'joined' && ['alice', 'bob'].includes(user) },
    '@/lib/board-item-activity-service': { compareObjects: () => [], trackStatusChange: async () => {}, trackAssignment: async () => {} },
    '@/lib/redis': { publishEvent: async () => {} }, '@/utils/mentions': { extractMentionUserIds: () => [] },
    '@/lib/notification-service': {}, '@/lib/event-bus': { emitIssueUpdated: async () => {} },
    '@/utils/html-normalizer': { normalizeDescriptionHTML: value => value },
  }, { URL, console });
  function reset() {
    state = { id: 'issue', workspaceId: 'joined', projectId: 'source', reporterId: 'bob', assigneeId: 'alice',
      statusId: 'old-todo', statusValue: 'todo', status: 'todo', title: 'Keep', issueKey: 'SOURCE-1',
      updatedAt: new Date('2026-09-23T00:00:00Z'), parentId: null, labels: [{ id: 'label', workspaceId: 'joined' }],
      children: [], branches: [], commits: [], pullRequests: [], versionIssues: [], description: 'Keep content' };
    active = true; writes = 0; assignments = 0;
    grants = defaults.defaultRolePermissions.DEVELOPER;
  }
  const put = body => route.PUT(new Request('https://example.test/issues/issue', {
    method: 'PUT', body: JSON.stringify(body),
  }), { params: Promise.resolve({ issueId: 'issue' }) });
  for (const body of [{ status: 'in_progress', statusValue: 'in_progress' }, { statusId: 'old-progress' }, { assigneeId: 'bob' }]) {
    reset();
    const response = await put(body);
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(writes, 1);
    assert.equal(state.title, 'Keep');
    if (body.assigneeId) { assert.equal(state.assigneeId, 'bob'); assert.equal(assignments, 1); }
    else { assert.equal(state.statusId, 'old-progress'); assert.equal(state.status, 'in_progress'); }
  }
  for (const body of [{ title: 'Denied' }, { status: 'in_progress', title: 'Denied' }, { status: 'in_progress', position: 5 }, { projectId: 'destination' }]) {
    reset(); assert.equal((await put(body)).status, 403, JSON.stringify(body)); assert.equal(writes, 0);
  }
  reset(); grants = ['CHANGE_TASK_STATUS'];
  assert.equal((await put({ status: 'in_progress', assigneeId: 'bob' })).status, 403);
  assert.equal(writes, 0);
  reset(); active = false;
  assert.equal((await put({ status: 'in_progress' })).status, 403); assert.equal(writes, 0);
  reset(); state.workspaceId = 'foreign';
  assert.equal((await put({ status: 'in_progress' })).status, 403); assert.equal(writes, 0);
  reset(); grants = ['ASSIGN_TASK'];
  assert.equal((await put({ assigneeId: 'outsider' })).status, 400); assert.equal(writes, 0);
  reset(); state.reporterId = 'alice';
  assert.equal((await put({ title: 'Own edit' })).status, 200);
  reset(); grants = ['EDIT_ANY_TASK'];
  const beforeMove = structuredClone(state);
  assert.equal((await put({ projectId: 'destination' })).status, 200);
  assert.equal(state.projectId, 'destination'); assert.equal(state.statusId, 'new-todo');
  for (const field of ['labels', 'parentId', 'issueKey', 'description', 'assigneeId', 'reporterId', 'workspaceId']) {
    assert.deepEqual(state[field], beforeMove[field], field);
  }
  for (const body of [
    { projectId: 'foreign' }, { projectId: 'missing' }, { projectId: 'no-status' },
    { projectId: 'destination', labels: ['foreign'] }, { projectId: 'destination', parentId: 'parent' },
    { projectId: 'destination', statusId: 'old-todo' }, { projectId: 'destination', statusId: 'inactive' },
    { status: 'in_progress', statusValue: 'todo' }, { statusId: 'old-todo', status: 'in_progress' },
  ]) {
    reset(); grants = ['EDIT_ANY_TASK'];
    assert.equal((await put(body)).status, 400, JSON.stringify(body)); assert.equal(writes, 0);
  }
  for (const relations of [
    { parentId: 'parent' }, { children: [{ projectId: 'source' }] },
    { labels: [{ workspaceId: 'foreign' }] }, { branches: [{ repository: { projectId: 'source' } }] },
    { commits: [{ repository: { projectId: 'source' } }] }, { pullRequests: [{ repository: { projectId: 'source' } }] },
    { versionIssues: [{ version: { repository: { projectId: 'source' } } }] },
  ]) {
    reset(); grants = ['EDIT_ANY_TASK']; Object.assign(state, relations);
    assert.equal((await put({ projectId: 'destination' })).status, 400, JSON.stringify(relations));
    assert.equal(writes, 0);
  }
  reset(); grants = ['EDIT_ANY_TASK']; state.parentId = 'parent';
  assert.equal((await put({ projectId: 'destination', parentId: null, statusId: 'new-progress' })).status, 200);
  assert.equal(state.parentId, null); assert.equal(state.statusId, 'new-progress');
});
