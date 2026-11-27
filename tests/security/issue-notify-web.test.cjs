// The web issue routes tell the notifier about status changes, assignments and description mentions, after the write,
// without waiting for it, and without changing their answers.
const { assert, test, load, matches, workspaces } = require('./helpers.cjs');

const client = require('@prisma/client');
const permissionModule = load('src/lib/permissions.ts', { './prisma': { prisma: {} } });
const respond = { NextResponse: { json: (body, init = {}) => ({ body, status: init.status ?? 200 }) } };
const mentions = { extractMentionUserIds: text => [...String(text).matchAll(/@\[[^\]]*\]\(([^)]+)\)/g)].map(match => match[1]) };
const notifications = {
  NotificationService: { notifyUsers: async () => {} },
  NotificationType: { ISSUE_MENTION: 'ISSUE_MENTION', ISSUE_UPDATED: 'ISSUE_UPDATED', PROJECT_ISSUE_UPDATED: 'PROJECT_ISSUE_UPDATED',
    ISSUE_CREATED: 'ISSUE_CREATED', PROJECT_ISSUE_CREATED: 'PROJECT_ISSUE_CREATED' },
};
// The keys of the answers as they were before the routes told the notifier anything.
const PUT_ANSWER_KEYS = ['issue'];
const POST_ANSWER_KEYS = ['issue'];

function recorder() {
  const events = [];
  return { events, module: { // The route runs in its own context: keep a plain copy, so the events compare as data.
    tellIssueEvent: event => { events.push(JSON.parse(JSON.stringify(event))); }, issueEventsSettled: async () => {} } };
}

function webPut() {
  const told = recorder();
  const statuses = [
    { id: 'todo-id', projectId: 'source', name: 'todo', displayName: 'To Do', isActive: true },
    { id: 'progress-id', projectId: 'source', name: 'in_progress', displayName: 'In Progress', isActive: true },
  ];
  const workspace = workspaces.find(row => row.id === 'joined');
  const fixture = { state: null };
  const reset = () => {
    fixture.state = { id: 'issue', workspaceId: 'joined', projectId: 'source', reporterId: 'bob', assigneeId: null,
      workspace, project: { workspace }, projectStatus: { project: { workspace } },
      statusId: 'todo-id', statusValue: 'todo', status: 'todo', title: 'Keep', issueKey: 'SOURCE-1',
      updatedAt: new Date('2026-09-23T00:00:00Z'), parentId: null, labels: [],
      children: [], branches: [], commits: [], pullRequests: [], versionIssues: [], description: 'Keep content' };
    told.events.length = 0;
  };
  const db = {
    issue: {
      findFirst: async ({ where }) => matches(fixture.state, where) ? fixture.state : null,
      update: async ({ data }) => { Object.assign(fixture.state, data); return { ...fixture.state }; },
    },
    project: { findFirst: async () => null },
    // bob is an active member of the workspace and nobody is a seat.
    workspace: { findFirst: async () => ({ id: 'joined' }) },
    agentSeat: { findFirst: async () => null, findUnique: async () => null },
    projectStatus: {
      findFirst: async ({ where }) => statuses.find(row => matches(row, where)) ?? null,
      findMany: async ({ where }) => statuses.filter(row => matches(row, where)),
    },
    taskLabel: { count: async () => 0 },
    issueAssignee: { upsert: async () => {}, deleteMany: async () => {} },
    user: { findUnique: async ({ where }) => ({ id: where.id, name: where.id }) },
    issueFollower: { findMany: async () => [] }, projectFollower: { findMany: async () => [] },
    $transaction: async fn => fn(db),
  };
  const route = load('src/app/api/issues/[issueId]/route.ts', {
    zod: require('zod'), '@prisma/client': client, 'next/server': respond,
    '@/lib/prisma': { prisma: db }, '@/lib/session': { getCurrentUser: async () => ({ id: 'alice', name: 'Alice' }) },
    '@/lib/permissions': { ...permissionModule,
      checkUserPermissions: async (_user, _workspace, requested) => Object.fromEntries(requested.map(p => [p, { hasPermission: true }])) },
    '@/lib/issue-finder': { getStandardIssueInclude: () => ({}), issueReadAccessWhere: () => ({}),
      findIssueByIdOrKey: async () => ({ ...fixture.state }),
      userHasWorkspaceAccess: async (user, id) => id === 'joined' && ['alice', 'bob'].includes(user) },
    '@/lib/board-item-activity-service': { compareObjects: () => [], trackStatusChange: async () => {}, trackAssignment: async () => {},
      trackFieldChanges: async () => {}, createActivity: async () => {} },
    '@/lib/redis': { publishEvent: async () => {} }, '@/utils/mentions': mentions,
    '@/lib/notification-service': notifications, '@/lib/event-bus': { emitIssueUpdated: async () => {} },
    '@/utils/html-normalizer': { normalizeDescriptionHTML: value => value },
    '@/lib/notification-issue-events': told.module,
  }, { URL, console });
  const put = body => route.PUT(new Request('https://example.test/issues/issue', { method: 'PUT', body: JSON.stringify(body) }),
    { params: Promise.resolve({ issueId: 'issue' }) });
  return { told, fixture, reset, put };
}

function webPost() {
  const told = recorder();
  const workspace = { id: 'joined', name: 'Joined', slug: 'joined' };
  const db = {
    workspace: { findFirst: async () => workspace },
    project: { findFirst: async () => ({ id: 'source', workspaceId: 'joined' }) },
    issue: { findFirst: async () => null },
    projectStatus: { findFirst: async () => ({ id: 'todo-id', name: 'todo', displayName: 'To Do' }) },
    issueFollower: { findMany: async () => [] }, projectFollower: { findMany: async () => [] },
    $transaction: async fn => fn(tx),
  };
  const tx = {
    projectStatus: db.projectStatus,
    issue: { create: async ({ data }) => ({ id: 'created', ...data, workspace, projectStatus: { id: 'todo-id', name: 'todo', displayName: 'To Do' } }) },
    issueAssignee: { create: async () => {} }, issueRelation: { create: async () => {} },
  };
  const route = load('src/app/api/issues/route.ts', {
    '@prisma/client': client, 'next/server': respond, '@/lib/prisma': { prisma: db },
    '@/lib/request-session': { getServerSession: async () => ({ user: { id: 'alice', name: 'Alice' } }) }, '@/lib/auth-options': { authOptions: {} },
    '@/lib/issue-key-allocation': { allocateIssueKey: async () => 'SOURCE-2' },
    '@/lib/agent-label-triggers': { enqueueLabelHandoff: async () => {}, InvalidIssueLabels: class extends Error {} },
    '@/lib/forge/legacy-write-guard': { ForgeProjectWriteError: class extends Error {}, assertLegacyIssueWriteAllowed: async () => {}, assertLegacyProjectWriteAllowed: async () => {} },
    '@/lib/board-item-activity-service': { trackCreation: async () => {} },
    '@/lib/redis': { publishEvent: async () => {} }, '@/utils/mentions': mentions,
    '@/lib/notification-service': notifications, '@/lib/event-bus': { emitIssueCreated: async () => {} },
    '@/utils/issueRelations': { buildIssueRelations: () => ({}) },
    '@/lib/issue-assignee': { assertAssignable: async () => {}, HandoffError: class extends Error {} },
    '@/lib/issue-finder': { issueAccessWhere: () => ({}), issueReadAccessWhere: () => ({}) },
    '@/lib/notification-issue-events': told.module,
  }, { URL, console });
  const post = body => route.POST(new Request('https://example.test/issues', { method: 'POST',
    body: JSON.stringify({ title: 'New', workspaceId: 'joined', projectId: 'source', ...body }) }));
  return { told, post };
}

test('a status change tells status once, with both status ids', async () => {
  const web = webPut();
  web.reset();
  const response = await web.put({ statusId: 'progress-id' });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.deepEqual(web.told.events, [{ kind: 'status', issueId: 'issue', actorId: 'alice', fromStatusId: 'todo-id', toStatusId: 'progress-id' }]);
});

test('saving without a status change tells nothing', async () => {
  const web = webPut();
  web.reset();
  const response = await web.put({ title: 'Renamed' });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.deepEqual(web.told.events, []);
});

test('a new assignee tells assigned; an unassignment tells nothing', async () => {
  const web = webPut();
  web.reset();
  const assigned = await web.put({ assigneeId: 'bob' });
  assert.equal(assigned.status, 200, JSON.stringify(assigned.body));
  assert.deepEqual(web.told.events, [{ kind: 'assigned', issueId: 'issue', actorId: 'alice', assigneeId: 'bob' }]);
  web.told.events.length = 0;
  const unassigned = await web.put({ assigneeId: null });
  assert.equal(unassigned.status, 200, JSON.stringify(unassigned.body));
  assert.equal(web.fixture.state.assigneeId, null);
  assert.deepEqual(web.told.events, []);
});

test('creating an issue with an assignee tells assigned', async () => {
  const web = webPost();
  const response = await web.post({ assigneeId: 'bob' });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  assert.deepEqual(web.told.events, [{ kind: 'assigned', issueId: 'created', actorId: 'alice', assigneeId: 'bob' }]);
  web.told.events.length = 0;
  assert.equal((await web.post({})).status, 201);
  assert.deepEqual(web.told.events, []);
});

test('a description mention tells described with the mentioned ids', async () => {
  const web = webPut();
  web.reset();
  const response = await web.put({ description: 'Look @[Bob](bob) and @[Alice](alice)' });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  // The same people the in-app mention goes to: the actor is not one of them.
  assert.deepEqual(web.told.events, [{ kind: 'described', issueId: 'issue', actorId: 'alice', mentionedIds: ['bob'] }]);
  web.told.events.length = 0;
  assert.equal((await web.put({ description: 'Only @[Alice](alice)' })).status, 200);
  assert.deepEqual(web.told.events, []);

  const create = webPost();
  assert.equal((await create.post({ description: 'Hi @[Bob](bob)' })).status, 201);
  assert.deepEqual(create.told.events, [{ kind: 'described', issueId: 'created', actorId: 'alice', mentionedIds: ['bob'] }]);
});

test('the PUT and POST answers have the same keys as before', async () => {
  const web = webPut();
  web.reset();
  const put = await web.put({ statusId: 'progress-id', assigneeId: 'bob' });
  assert.equal(put.status, 200);
  assert.deepEqual(Object.keys(put.body), PUT_ANSWER_KEYS);
  assert.deepEqual(Object.keys(put.body.issue).sort(), Object.keys(web.fixture.state).sort());
  const create = webPost();
  const post = await create.post({ assigneeId: 'bob' });
  assert.equal(post.status, 201);
  assert.deepEqual(Object.keys(post.body), POST_ANSWER_KEYS);
});
