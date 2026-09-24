const { assert, test, resolve, load, matches, issues, prisma } = require('./helpers.cjs');


test('shared issue mutation blocks AI and PUT bypasses with real access and field permissions', async (t) => {
  const workspace = { id: 'joined', slug: 'joined', ownerId: 'bob', members: [{ userId: 'alice', status: true, role: 'MEMBER' }] };
  let user, state, grants, writes, effects, conflict;
  const db = {
    workspace: { findFirst: async ({ where }) => matches(workspace, where) ? workspace : null },
    user: { findUnique: async ({ where, include }) => ({ id: where.id, name: where.id, role: 'DEVELOPER',
      workspaceMemberships: include ? workspace.members.filter(member => member.userId === where.id &&
        matches({ ...member, workspaceId: workspace.id }, include.workspaceMemberships.where)) : [],
      ownedWorkspaces: workspace.ownerId === where.id ? [{ id: workspace.id }] : [] }) },
    rolePermission: { findUnique: async ({ where }) => grants.includes(where.workspaceId_role_permission.permission) ? {} : null },
    issue: {
      findFirst: async ({ where }) => matches({ ...state, workspace }, where) ? { ...state } : null,
      update: async ({ data }) => { writes++; Object.assign(state, data); return { ...state }; },
      create: async ({ data }) => { writes++; return { ...data, id: 'created' }; },
    },
    project: { findFirst: async ({ where }) => {
      const project = { id: 'project', workspaceId: 'joined', issuePrefix: 'P', _count: { issues: 1 } };
      return matches(project, where) ? project : null;
    } },
    projectStatus: { findMany: async ({ where }) => [
      { id: 'todo', projectId: 'project', name: 'todo', displayName: 'To Do', isActive: true },
      { id: 'progress', projectId: 'project', name: 'in_progress', displayName: 'In Progress', isActive: true },
    ].filter(row => matches(row, where)) },
    taskLabel: { count: async () => 0 },
    issueAssignee: { upsert: async () => { writes++; } },
    issueFollower: { findMany: async () => [] }, projectFollower: { findMany: async () => [] },
    $transaction: async (fn, options) => {
      assert.equal(options.isolationLevel, 'Serializable');
      if (conflict) throw new (require('@prisma/client').Prisma.PrismaClientKnownRequestError)('conflict', { code: 'P2034', clientVersion: 'test' });
      return fn(db);
    },
  };
  const finder = load('src/lib/issue-finder.ts', { '@/lib/prisma': { prisma: db },
    '@/lib/shared-issue-key-utils': load('src/lib/shared-issue-key-utils.ts') });
  const permissions = load('src/lib/permissions.ts', { './prisma': { prisma: db } }, { console });
  const dependencies = {
    zod: require('zod'), '@prisma/client': require('@prisma/client'),
    'next/server': { NextResponse: Response }, '@/lib/session': { getCurrentUser: async () => user },
    '@/lib/prisma': { prisma: db }, '@/lib/permissions': permissions, '@/lib/issue-finder': finder,
    '@/utils/html-normalizer': { normalizeDescriptionHTML: value => value },
    '@/lib/board-item-activity-service': { compareObjects: () => [], trackAssignment: async () => {}, trackStatusChange: async () => {}, createActivity: async () => {} },
    '@/lib/redis': { publishEvent: async () => { effects++; } }, '@/utils/mentions': { extractMentionUserIds: () => [] },
    '@/lib/notification-service': {}, '@/lib/event-bus': { emitIssueUpdated: async () => { effects++; } },
  };
  const put = load('src/app/api/issues/[issueId]/route.ts', dependencies, { URL, console }).PUT;
  const ai = load('src/app/api/ai/action/route.ts', dependencies, { console }).POST;
  function reset() {
    user = { id: 'alice' }; grants = ['EDIT_SELF_TASK']; writes = 0; effects = 0; conflict = false;
    workspace.ownerId = 'bob'; workspace.members = [{ userId: 'alice', status: true, role: 'MEMBER' }];
    state = { id: 'issue', issueKey: 'P-1', title: 'Before', reporterId: 'bob', assigneeId: null,
      workspaceId: 'joined', projectId: 'project', statusId: 'todo', status: 'todo', statusValue: 'todo',
      parentId: null, updatedAt: new Date('2026-09-24T00:00:00Z') };
  }
  const aiRequest = (params, type = 'update_issue', workspaceId = 'joined') => ai(new Request('https://example.test/api/ai/action', {
    method: 'POST', body: JSON.stringify({ action: { type, params }, context: { workspace: { id: workspaceId } } }),
  }));
  for (const endpoint of ['PUT', 'AI']) {
    const request = fields => endpoint === 'AI' ? aiRequest({ issueId: 'issue', ...fields }) : put(new Request('https://example.test/api/issues/issue?workspaceId=joined', {
      method: 'PUT', body: JSON.stringify(fields),
    }), { params: Promise.resolve({ issueId: 'issue' }) });
    const denied = [
      ['other reporter', () => {}, { title: 'Denied' }, 403],
      ['read only reporter', () => { state.reporterId = 'alice'; grants = []; }, { title: 'Denied' }, 403],
      ['anonymous', () => { user = null; }, { title: 'Denied' }, 401],
      ['revoked', () => { workspace.members[0].status = false; grants = ['EDIT_ANY_TASK']; }, { title: 'Denied' }, endpoint === 'AI' ? 403 : 404],
      ['foreign user', () => { workspace.members = []; grants = ['EDIT_ANY_TASK']; }, { title: 'Denied' }, endpoint === 'AI' ? 403 : 404],
      ['foreign issue', () => { state.workspaceId = 'foreign'; grants = ['EDIT_ANY_TASK']; }, { title: 'Denied' }, 404],
      ['status mixed with title', () => { grants = ['CHANGE_TASK_STATUS']; }, { statusId: 'progress', title: 'Denied' }, endpoint === 'AI' ? 400 : 403],
      ['status name mixed with title', () => { grants = ['CHANGE_TASK_STATUS']; }, { status: 'In Progress', title: 'Denied' }, 403],
      ['assignment mixed with status', () => { grants = ['ASSIGN_TASK']; }, { assigneeId: 'alice', statusId: 'progress' }, endpoint === 'AI' ? 400 : 403],
      ['assignment mixed with status name', () => { grants = ['ASSIGN_TASK']; }, { assigneeId: 'alice', status: 'In Progress' }, 403],
      ['empty title', () => { grants = ['EDIT_ANY_TASK']; }, { title: ' ' }, 400],
      ['bad date', () => { grants = ['EDIT_ANY_TASK']; }, { dueDate: 'tomorrow' }, 400],
      ['mass assignment', () => { grants = ['EDIT_ANY_TASK']; }, { workspaceId: 'foreign' }, 400],
      ['foreign assignee', () => { grants = ['ASSIGN_TASK']; }, { assigneeId: 'outsider' }, 400],
      ['revoked assignee', () => { workspace.members.push({ userId: 'revoked', status: false }); grants = ['ASSIGN_TASK']; }, { assigneeId: 'revoked' }, 400],
      ['foreign reporter', () => { grants = ['EDIT_ANY_TASK']; }, { reporterId: 'outsider' }, 400],
      ['foreign project', () => { grants = ['EDIT_ANY_TASK']; }, { projectId: 'foreign' }, 400],
      ['foreign status', () => { grants = ['CHANGE_TASK_STATUS']; }, { statusId: 'foreign' }, 400],
      ['foreign parent', () => { grants = ['EDIT_ANY_TASK']; }, { parentId: 'foreign' }, 400],
      ['foreign labels', () => { grants = ['EDIT_ANY_TASK']; }, { labels: ['foreign'] }, 400],
      ['conflict', () => { grants = ['EDIT_ANY_TASK']; conflict = true; }, { title: 'Denied' }, 409],
    ];
    for (const [name, setup, fields, expected] of denied) await t.test(`${endpoint}: ${name}`, async () => {
      reset(); setup(); const before = structuredClone(state);
      const response = await request(fields);
      assert.equal(response.status, expected, await response.text());
      assert.equal(writes, 0); assert.equal(effects, 0); assert.deepEqual(state, before);
    });
    for (const [name, setup, fields, expectedWrites] of [
      ['owner without membership', () => { workspace.ownerId = 'alice'; workspace.members = []; grants = []; }, { title: 'After' }, 1],
      ['reporter', () => { state.reporterId = 'alice'; }, { title: 'After' }, 1],
      ['editor', () => { grants = ['EDIT_ANY_TASK']; }, { title: 'After' }, 1],
      ['status only', () => { grants = ['CHANGE_TASK_STATUS']; }, { status: 'In Progress' }, 1],
      ['assignment only', () => { grants = ['ASSIGN_TASK']; }, { assigneeId: 'alice' }, 2],
    ]) await t.test(`${endpoint}: ${name}`, async () => {
      reset(); setup(); const response = await request(fields);
      assert.equal(response.status, 200, await response.text()); assert.equal(writes, expectedWrites);
      assert.equal(state.workspaceId, 'joined');
      if (fields.title) assert.equal(state.title, 'After');
      if (fields.status) { assert.equal(state.statusId, 'progress'); assert.equal(state.statusValue, 'in_progress'); }
      if (fields.assigneeId) assert.equal(state.assigneeId, 'alice');
    });
  }
  await t.test('AI preserves its original update field set with zero writes for unsupported fields', async () => {
    for (const fields of [{ projectId: 'project' }, { reporterId: 'alice' }, { parentId: null },
      { labels: [] }, { progress: 50 }, { position: 3 }, { statusId: 'todo' }, { statusValue: 'todo' }, { unexpected: true }]) {
      reset(); grants = ['EDIT_ANY_TASK']; const before = structuredClone(state);
      const response = await aiRequest({ issueId: 'issue', title: 'Must not change', ...fields });
      assert.equal(response.status, 400, JSON.stringify(fields));
      assert.equal(writes, 0); assert.equal(effects, 0); assert.deepEqual(state, before);
    }
    reset(); grants = ['EDIT_ANY_TASK'];
    const fields = { title: 'Supported', description: 'Content', status: 'In Progress', priority: 'high',
      type: 'BUG', assigneeId: 'alice', dueDate: '2026-10-01T00:00:00Z' };
    const response = await aiRequest({ issueId: 'issue', ...fields });
    assert.equal(response.status, 200, await response.text());
    assert.equal(writes, 2);
    for (const [field, value] of Object.entries(fields)) assert.equal(state[field], field === 'status' ? 'in_progress' : value);
  });
  await t.test('AI rejects malformed envelopes and issue identifier aliases', async () => {
    reset(); grants = ['EDIT_ANY_TASK'];
    for (const body of [null, {}, { action: { type: 'update_issue', params: null }, context: { workspace: { id: 'joined' } } }]) {
      assert.equal((await ai(new Request('https://example.test', { method: 'POST', body: JSON.stringify(body) }))).status, 400);
    }
    assert.equal((await aiRequest({ id: 'issue', title: 'Denied' })).status, 400);
    assert.equal((await aiRequest({ issueId: 'issue', title: 'Denied' }, 'update_issue', 'foreign')).status, 403);
    assert.equal(writes, 0);
  });
  await t.test('AI creation also denies read only users and foreign references', async () => {
    reset();
    assert.equal((await aiRequest({ title: 'New', projectId: 'project' }, 'create_issue')).status, 403);
    grants = ['CREATE_TASK'];
    for (const [params, expected] of [[{ title: ' ' }, 400], [{ title: 'New', projectId: 'foreign' }, 404],
      [{ title: 'New', projectId: 'project', assigneeId: 'outsider' }, 400]]) {
      assert.equal((await aiRequest(params, 'create_issue')).status, expected);
    }
    assert.equal(writes, 0);
    assert.equal((await aiRequest({ title: 'New', projectId: 'project' }, 'create_issue')).status, 200);
    assert.equal(writes, 1);
  });
});
