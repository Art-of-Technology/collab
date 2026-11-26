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
    await db.prisma.issue.create({ data: { id, title: id, issueKey: id.toUpperCase(), workspaceId: 'work', projectId: 'project', statusId } });
    await db.prisma.issueActivity.create({ data: { itemId: id, action: 'UPDATED', userId: 'work-owner', workspaceId: 'work', projectId: 'project',
      fieldName: 'description', oldValue: `${id}-old`, newValue: `${id}-new`, details: JSON.stringify({ content: `${id}-details` }) } });
  }
  // The application's client, so Trash is hidden here as it is in production.
  const prisma = db.prisma.$extends(load('src/lib/issue-visibility.ts').issueVisibilityExtension(Prisma.dmmf.datamodel.models));
  const deps = { 'next/server': { NextResponse: Response }, '@/lib/prisma': { prisma },
    '@/lib/auth': { getAuthSession: async () => ({ user: { id: signedIn } }) }, '@/lib/apps/auth-middleware': { withAppAuth: handler => handler } };
  const route = path => load(`src/app/api/${path}/route.ts`, deps, { URL, console });
  routes = { issue: route('issues/[issueId]/activities'), workspace: route('apps/auth/workspace/activity'), project: route('apps/auth/projects/[projectId]/activity') };
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
