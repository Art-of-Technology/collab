const { assert, test, load, matches } = require('./helpers.cjs');

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
