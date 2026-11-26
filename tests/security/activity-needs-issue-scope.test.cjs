const { before, after } = require('node:test');
const { Prisma } = require('@prisma/client');
const { assert, test, load, matches } = require('./helpers.cjs');
const { seatsDatabase } = require('../agents/seats-db.cjs');

// Issue history carries what was written on issues (old and new values, handoff text), so the two
// activity feeds answer only a token that may read issues, not one that may read just projects or the workspace.
function harness(scopes) {
  const all = ['projects:read', 'workspace:read', 'issues:read'];
  const workspace = { id: 'w1', name: 'Workspace', slug: 'w', ownerId: 'bob', members: [{ userId: 'alice', status: true, role: 'MEMBER' }] };
  const project = { id: 'p1', name: 'Project', issuePrefix: 'APP', workspaceId: 'w1' };
  const issue = { id: 'i1', issueKey: 'APP-1', title: 'Title', type: 'TASK', projectId: 'p1', workspaceId: 'w1', project };
  const activity = {
    id: 'a1', action: 'AGENT_HANDOFF_SENT', itemType: 'ISSUE', itemId: 'i1', workspaceId: 'w1', fieldName: 'description',
    oldValue: 'sentinel-old', newValue: 'sentinel-new', details: JSON.stringify({ content: 'sentinel-handoff' }),
    user: { id: 'alice', name: 'Alice', email: 'alice@example.test', image: null }, createdAt: new Date(0),
  };
  const state = { historyReads: 0 };
  const db = {
    workspace: { findFirst: async ({ where }) => matches(workspace, where) ? workspace : null },
    user: { findUnique: async () => ({ id: 'alice', email: 'alice@example.test', name: 'Alice' }) },
    appToken: { findMany: async () => [{ accessToken: 'Y2lwaGVy', userId: 'alice', scopes, tokenExpiresAt: null,
      installation: { id: 'installation', appId: 'app', status: 'ACTIVE', workspaceId: 'w1', installedById: 'alice', scopes: all, workspace,
        app: { id: 'app', name: 'App', slug: 'app', status: 'PUBLISHED', scopes: all.map(scope => ({ scope })) } } }] },
    project: { findFirst: async ({ where }) => matches(project, where) ? project : null },
    issue: { findMany: async () => [issue] },
    issueActivity: {
      findMany: async () => { state.historyReads += 1; return [activity]; },
      count: async () => 1,
    },
  };
  const auth = load('src/lib/apps/auth-middleware.ts', {
    'next/server': { NextResponse: Response }, '@/lib/prisma': { prisma: db },
    '@/lib/oauth-scopes': load('src/lib/oauth-scopes.ts'), '@/lib/apps/crypto': { getEncryptionKey: () => 'fixture-key', decryptToken: async () => 'test-token' },
  }, { URL, Buffer, console });
  const deps = { 'next/server': { NextResponse: Response }, '@/lib/prisma': { prisma: db }, '@/lib/apps/auth-middleware': auth };
  const globals = { URL, console: { error() {} } };
  const feeds = {
    project: load('src/app/api/apps/auth/projects/[projectId]/activity/route.ts', deps, globals),
    workspace: load('src/app/api/apps/auth/workspace/activity/route.ts', deps, globals),
  };
  const read = async (feed, projectId = 'p1') => {
    const response = await feeds[feed].GET(
      new Request(`https://example.test/api/apps/auth/${feed}/activity`, { headers: { Authorization: 'Bearer test-token' } }),
      { params: Promise.resolve({ projectId }) },
    );
    return { status: response.status, text: await response.text() };
  };
  return { read, state };
}

test('issue history is not served to a token that may not read issues', async () => {
  for (const [feed, own] of [['project', 'projects:read'], ['workspace', 'workspace:read']]) {
    for (const scopes of [[own], ['issues:read'], []]) {
      const h = harness(scopes);
      const refused = await h.read(feed);
      assert.equal(refused.status, 403, `${feed} feed with ${scopes.join(', ') || 'no scopes'}`);
      assert.doesNotMatch(refused.text, /sentinel/);
      assert.equal(h.state.historyReads, 0, 'refused before any history is read');
    }

    const h = harness([own, 'issues:read']);
    const served = await h.read(feed);
    assert.equal(served.status, 200, `${feed} feed with both scopes`);
    for (const sentinel of ['sentinel-old', 'sentinel-new', 'sentinel-handoff']) assert.match(served.text, new RegExp(sentinel));
  }
});

test('a project outside the token\'s workspace is still not found', async () => {
  const h = harness(['projects:read', 'issues:read']);
  assert.equal((await h.read('project', 'elsewhere')).status, 404);
  assert.equal(h.state.historyReads, 0);
});

// The issue read rule, against a real database: 'shown' is an issue the workspace's members may read, 'hidden' one they
// may not (its status belongs to a project of a workspace they are not in).
let db, signedIn, routes;
before(async () => {
  db = await seatsDatabase(async prisma => {
    await prisma.user.createMany({ data: ['work-owner', 'viewer', 'inactive', 'foreign-owner'].map(id => ({ id, name: id })) });
    await prisma.workspace.createMany({ data: [
      { id: 'work', name: 'Work', slug: 'work', ownerId: 'work-owner' },
      { id: 'foreign', name: 'Foreign', slug: 'foreign', ownerId: 'foreign-owner' },
    ] });
    await prisma.workspaceMember.createMany({ data: [
      { workspaceId: 'work', userId: 'viewer' }, { workspaceId: 'work', userId: 'inactive', status: false },
    ] });
    await prisma.project.createMany({ data: [
      { id: 'project', workspaceId: 'work', name: 'Release', slug: 'release', issuePrefix: 'REL' },
      { id: 'foreign-project', workspaceId: 'foreign', name: 'Foreign', slug: 'foreign', issuePrefix: 'FOR' },
    ] });
    await prisma.projectStatus.create({ data: { id: 'foreign-status', projectId: 'foreign-project', name: 'open', displayName: 'Open', order: 1 } });
  });
  for (const [id, statusId] of [['shown', null], ['hidden', 'foreign-status']]) {
    await db.prisma.issue.create({ data: { id, title: id, issueKey: id.toUpperCase(), workspaceId: 'work', projectId: 'project', statusId, assigneeId: 'viewer', status: 'in_progress' } });
    await db.prisma.issueActivity.create({ data: { itemId: id, action: 'UPDATED', userId: 'work-owner', workspaceId: 'work', projectId: 'project',
      fieldName: 'description', oldValue: `${id}-old`, newValue: `${id}-new`, details: JSON.stringify({ content: `${id}-details` }) } });
  }
  // The application's client, so Trash is hidden here as it is in production.
  const prisma = db.prisma.$extends(load('src/lib/issue-visibility.ts').issueVisibilityExtension(Prisma.dmmf.datamodel.models));
  const deps = { 'next/server': { NextResponse: Response }, '@/lib/prisma': { prisma },
    '@/lib/auth': { getAuthSession: async () => ({ user: { id: signedIn } }) }, '@/lib/apps/auth-middleware': { withAppAuth: handler => handler } };
  const route = path => load(`src/app/api/${path}/route.ts`, deps, { URL, console, Date });
  routes = { issue: route('issues/[issueId]/activities'), workspace: route('apps/auth/workspace/activity'), project: route('apps/auth/projects/[projectId]/activity') };
  Object.assign(deps, { zod: require('zod'), 'date-fns': require('date-fns'), '@/utils/teamSyncAnalyzer': load('src/utils/teamSyncAnalyzer.ts'),
    '@/lib/redis': {}, '@/lib/event-bus': {}, '@/lib/rate-limit': { withRateLimit: handler => handler }, '@/lib/agent-context-folders': {}, '@/lib/issue-attachments': {} });
  routes.search = route('apps/auth/search/issues-by-activity');
  for (const name of ['activity', 'range', 'team-activity']) routes[name] = route(`workspaces/[workspaceId]/planning/${name}`);
  for (const name of ['', '/comments', '/attachments']) routes[`item${name}`] = route(`apps/auth/issues/[issueIdOrKey]${name}`);
});
after(() => db?.stop());

const readIssue = async (user, issueId) => {
  signedIn = user;
  const response = await routes.issue.GET(new Request(`https://example.test/api/issues/${issueId}/activities`), { params: Promise.resolve({ issueId }) });
  return { status: response.status, text: await response.text() };
};
const readFeed = async (feed, user) => {
  const response = await routes[feed].GET(new Request(`https://example.test/api/apps/auth/${feed}/activity`),
    { workspace: { id: 'work' }, user: { id: user } }, { params: Promise.resolve({ projectId: 'project' }) });
  assert.equal(response.status, 200);
  return response.text();
};

test("an issue's activities are answered by the issue read rule, as the issue itself is", async () => {
  const served = await readIssue('viewer', 'shown');
  assert.equal(served.status, 200);
  for (const sentinel of ['shown-old', 'shown-new', 'shown-details']) assert.match(served.text, new RegExp(sentinel));
  // An issue this member may not read, and any issue for someone outside the workspace, answers as one that does not exist.
  const missing = await readIssue('viewer', 'no-such-issue');
  assert.deepEqual(missing, { status: 404, text: '{"error":"Issue not found"}' });
  assert.deepEqual(await readIssue('viewer', 'hidden'), missing);
  assert.deepEqual(await readIssue('foreign-owner', 'shown'), missing);
});

for (const feed of ['workspace', 'project']) {
  test(`the ${feed} activity feed lists only the issues its reader may read`, async () => {
    const served = await readFeed(feed, 'viewer');
    assert.deepEqual(JSON.parse(served).activities.map(row => row.itemId), ['shown']);
    for (const sentinel of ['shown-old', 'shown-new', 'shown-details']) assert.match(served, new RegExp(sentinel));
    assert.doesNotMatch(served, /hidden/i);
    if (feed === 'workspace') assert.equal(JSON.parse(served).pagination.total, 1);
  });
}

test('a membership that is not active reads no issue activity', async () => {
  assert.deepEqual(await readIssue('inactive', 'shown'), await readIssue('inactive', 'no-such-issue'));
  for (const feed of ['workspace', 'project']) assert.deepEqual(JSON.parse(await readFeed(feed, 'inactive')).activities, [], feed);
});

const asToken = user => ({ workspace: { id: 'work' }, user: { id: user } });
const reply = async response => ({ status: response.status, text: await response.text() });

// The token routes behind a door that lets every caller in: what is tested is the rule each route reads an issue by.
const readItem = (name, user, issueIdOrKey, method = 'GET') => routes[`item${name}`][method](
  new Request('https://example.test/api', { method, ...(method === 'POST' && { body: '{}' }) }), asToken(user), { params: Promise.resolve({ issueIdOrKey }) }).then(reply);

test('the app issue routes find an issue by the issue read rule', async () => {
  const served = await readItem('', 'viewer', 'SHOWN');
  assert.deepEqual([served.status, JSON.parse(served.text).id, JSON.parse(served.text).stats], [200, 'shown', { commentCount: 0, childCount: 0, relationCount: 0 }]);
  assert.equal((await readItem('/comments', 'viewer', 'shown')).status, 200);
  for (const [name, method] of [['', 'GET'], ['/comments', 'GET'], ['/attachments', 'POST']]) {
    const missing = await readItem(name, 'viewer', 'no-such-issue', method);
    assert.deepEqual(missing, { status: 404, text: '{"error":"not_found","error_description":"Issue not found"}' });
    for (const hidden of ['hidden', 'HIDDEN']) assert.deepEqual(await readItem(name, 'viewer', hidden, method), missing, name);
    // A membership that is not active, and an account outside the workspace, read none.
    for (const user of ['inactive', 'foreign-owner']) assert.deepEqual(await readItem(name, user, 'shown', method), missing, `${name} ${user}`);
  }
});

const searched = async user => JSON.parse((await reply(await routes.search.GET(new Request('https://example.test/api?fieldName=description'), asToken(user)))).text);

test('the search by activity finds and counts only the issues its reader may read', async () => {
  const found = await searched('viewer');
  assert.deepEqual(found.results.map(row => [row.id, row.title, row.matchingActivities.map(activity => activity.newValue)]), [['shown', 'shown', ['shown-new']]]);
  assert.deepEqual([found.pagination.total, found.summary], [1, { totalMatchingActivities: 1, uniqueIssuesWithActivity: 1 }]);
  assert.doesNotMatch(JSON.stringify(found), /hidden/i);
  const none = await searched('inactive');
  assert.deepEqual([none.results, none.pagination.total, 'summary' in none], [[], 0, false]);
});

const day = offset => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const plan = async (name, user, query = '') => {
  signedIn = user;
  return reply(await routes[name].GET(new Request(`https://example.test/api?startDate=${day(-1)}&endDate=${day(1)}${query}`), { params: Promise.resolve({ workspaceId: 'work' }) }));
};

for (const name of ['activity', 'range', 'team-activity']) {
  test(`planning ${name} shows a member of the workspace only the issues they may read`, async () => {
    // The member's own assigned issues too, where the route lists them.
    for (const query of ['', '&userIds=viewer']) {
      const served = await plan(name, 'viewer', query);
      assert.equal(served.status, 200);
      assert.doesNotMatch(served.text, /hidden/i, query);
      if (name === 'team-activity' || !query) assert.match(served.text, /SHOWN/, query);
    }
  });

  test(`planning ${name} answers a membership that is not active as it answers someone who is not a member`, async () => {
    const outsider = await plan(name, 'foreign-owner');
    assert.equal(outsider.status, 403);
    assert.deepEqual(await plan(name, 'inactive'), outsider);
  });
}

test('planning counts a cross-workspace blocker only for readers of that blocker', async () => {
  const prisma = db.prisma;
  await prisma.workspaceMember.create({ data: { workspaceId: 'foreign', userId: 'work-owner' } });
  await prisma.projectStatus.create({ data: { id: 'local-open', projectId: 'project', name: 'in_progress', displayName: 'In progress', order: 1 } });
  await prisma.issue.createMany({ data: [
    { id: 'target', issueKey: 'REL-1', title: 'Local task', assigneeId: 'viewer', workspaceId: 'work', projectId: 'project', statusId: 'local-open' },
    { id: 'blocker', issueKey: 'FOR-1', title: 'Blocker', assigneeId: 'viewer', workspaceId: 'foreign', projectId: 'foreign-project', statusId: 'foreign-status' },
  ] });
  await prisma.issueRelation.create({ data: { sourceIssueId: 'blocker', targetIssueId: 'target', relationType: 'BLOCKED_BY' } });

  for (const [reader, count] of [['work-owner', 1], ['viewer', 0]]) {
    const range = await plan('range', reader, '&userIds=viewer');
    assert.equal(range.status, 200);
    const { summary, members: [member] } = JSON.parse(range.text);
    assert.equal(summary.totalBlocked, count);
    assert.deepEqual(member.currentBlocked.map(issue => issue.issueKey), count ? ['REL-1'] : []);
    assert.ok(member.assignedIssues.some(issue => issue.issueKey === 'REL-1'));
    assert.ok(member.assignedIssues.every(issue => issue.issueKey !== 'FOR-1'));

    const team = await plan('team-activity', reader, '&userIds=viewer');
    assert.equal(team.status, 200);
    const { summary: teamSummary, members: [{ current }] } = JSON.parse(team.text);
    assert.equal(teamSummary.blocked, count);
    assert.deepEqual(current.blocked.map(issue => [issue.key, issue.blockedBy]), count ? [['REL-1', 'FOR-1']] : []);
    if (!count) assert.ok(current.inProgress.some(issue => issue.key === 'REL-1'));
    assert.ok(Object.values(current).flat().every(issue => issue.key !== 'FOR-1'));
  }
});

test('planning shows a person who may read every issue what it showed before the issue read rule', async () => {
  const prisma = db.prisma;
  // A member of both workspaces: every issue, status and blocker below is theirs to read.
  await prisma.user.create({ data: { id: 'reader', name: 'reader' } });
  await prisma.workspaceMember.createMany({ data: [{ workspaceId: 'work', userId: 'reader' }, { workspaceId: 'foreign', userId: 'reader' }] });
  await prisma.project.create({ data: { id: 'plan', workspaceId: 'work', name: 'Plan', slug: 'plan', issuePrefix: 'PL' } });
  await prisma.projectStatus.createMany({ data: [['in_progress', false], ['in_review', false], ['done', true]].map(([name, isFinal], order) => (
    { id: `plan-${name}`, projectId: 'plan', name, displayName: name, order, isFinal })) });
  const issue = (number, data) => ({ id: `plan-${number}`, issueKey: `PL-${number}`, title: `Planned ${number}`, assigneeId: 'reader', workspaceId: 'work', projectId: 'plan', ...data });
  await prisma.issue.createMany({ data: [
    issue(1, { statusId: 'plan-in_progress' }), issue(2, { statusId: 'plan-in_progress' }), issue(3, { statusId: 'plan-in_review' }), issue(4, { statusId: 'plan-in_review' }),
    issue(5, { statusId: 'plan-done' }), issue(6, { status: 'todo' }), issue(7, { statusId: 'foreign-status' }),
    issue(8, { workspaceId: 'foreign', projectId: 'foreign-project', statusId: 'foreign-status' }),
  ] });
  // As planning reads a link: PL-2 waits for PL-1, PL-3 for PL-8 in the other workspace. A BLOCKS link is not read.
  await prisma.issueRelation.createMany({ data: [
    { sourceIssueId: 'plan-1', targetIssueId: 'plan-2', relationType: 'BLOCKED_BY' }, { sourceIssueId: 'plan-8', targetIssueId: 'plan-3', relationType: 'BLOCKED_BY' },
    { sourceIssueId: 'plan-1', targetIssueId: 'plan-4', relationType: 'BLOCKS' },
  ] });
  await prisma.issueActivity.createMany({ data: [['plan-1', 'to_do', 'in_progress'], ['plan-5', 'in_progress', 'done']].map(([itemId, oldValue, newValue]) => (
    { itemId, action: 'STATUS_CHANGED', fieldName: 'status', oldValue, newValue, userId: 'reader', workspaceId: 'work', projectId: 'plan' })) });
  const read = async name => {
    const served = await plan(name, 'reader', '&userIds=reader');
    assert.equal(served.status, 200);
    return JSON.parse(served.text);
  };
  const keys = rows => rows.map(row => row.issueKey).sort();

  const { feed, hasMore } = await read('activity');
  assert.deepEqual([feed.map(row => [row.issueKey, row.newValue]).sort(), hasMore], [[['PL-1', 'in_progress'], ['PL-5', 'done']], false]);

  // Range lists the workspace's assigned issues whose status is one of a project and not final; one a `BLOCKED_BY` link points at is blocked, whatever its status.
  const range = await read('range'), [member] = range.members;
  assert.equal(range.members.length, 1);
  assert.deepEqual(['assignedIssues', 'currentInProgress', 'currentInReview', 'currentBlocked', 'currentPlanned'].map(list => keys(member[list])),
    [['PL-1', 'PL-2', 'PL-3', 'PL-4', 'PL-7'], ['PL-1'], ['PL-4'], ['PL-2', 'PL-3'], ['PL-7']]);
  const { totalCompleted, totalStarted, totalInProgress, totalInReview, totalPlanned, totalBlocked } = range.summary;
  assert.deepEqual([totalCompleted, totalStarted, totalInProgress, totalInReview, totalPlanned, totalBlocked], [1, 1, 1, 1, 1, 2]);

  // The team view also lists an issue without a project's status, and names the first blocker.
  const team = await read('team-activity'), [{ current, summary }] = team.members;
  assert.equal(team.members.length, 1);
  assert.deepEqual(Object.fromEntries(Object.entries(current).map(([list, rows]) => [list, rows.map(row => [row.key, row.blockedBy ?? null]).sort()])), {
    inProgress: [['PL-1', null]], inReview: [['PL-4', null]], blocked: [['PL-2', 'PL-1'], ['PL-3', 'PL-8']], planned: [['PL-6', null], ['PL-7', null]] });
  assert.deepEqual([summary, team.summary.blocked, team.summary.completed], [{ completed: 1, inReview: 1, inProgress: 1, blocked: 2, planned: 2, workload: 4 }, 2, 1]);
});
