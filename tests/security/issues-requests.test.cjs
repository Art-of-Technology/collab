const { assert, test, load, matches } = require('./helpers.cjs');

function fixture() {
  const workspaces = [
    { id: 'workspace', ownerId: 'owner', members: [{ userId: 'member', status: true }] },
    { id: 'other-workspace', ownerId: 'other', members: [] },
  ];
  const rows = [
    { id: 'work', agentRequestRole: null },
    { id: 'review', agentRequestRole: 'review', parentId: 'work' },
    { id: 'subtask', agentRequestRole: null, parentId: 'work' },
    { id: 'release', agentRequestRole: 'release' },
    { id: 'follow-up', agentRequestRole: null, parentId: 'release' },
    { id: 'other-milestone', agentRequestRole: null, milestoneId: 'later' },
    { id: 'other-project', agentRequestRole: null, projectId: 'another' },
    { id: 'foreign', agentRequestRole: null, workspaceId: 'other-workspace' },
  ].map((row, index) => ({
    workspaceId: 'workspace', projectId: 'project', milestoneId: 'milestone',
    updatedAt: 100 - index, type: 'TASK', ...row,
  }));

  const { GET } = load('src/app/api/issues/route.ts', {
    'next/server': { NextResponse: Response },
    '@/lib/request-session': { getServerSession: async () => ({ user: { id: 'member' } }) },
    '@/lib/auth-options': {},
    '@/lib/prisma': { prisma: {
      workspace: { findFirst: async ({ where }) => workspaces.find(row => matches(row, where)) },
      issue: { findMany: async ({ where, include, orderBy }) => rows
        .filter(row => matches(row, where))
        .sort((a, b) => orderBy.updatedAt === 'desc' ? b.updatedAt - a.updatedAt : a.updatedAt - b.updatedAt)
        .map(row => {
          const children = rows.filter(child => child.parentId === row.id);
          return {
            ...row,
            parent: rows.find(parent => parent.id === row.parentId && matches(parent, include.parent.where ?? {})) ?? null,
            children: children.filter(child => matches(child, include.children.where ?? {})),
            _count: { children: children.filter(child => matches(child, include._count.select.children.where ?? {})).length, comments: 3 },
          };
        }) },
    } },
    '@/lib/board-item-activity-service': {},
    '@/lib/redis': {},
    '@/utils/mentions': {},
    '@/lib/notification-service': {},
    '@/lib/event-bus': {},
    '@/utils/issueRelations': load('src/utils/issueRelations.ts'),
  }, { URL, console });
  const fetch = path => GET(new Request(new URL(path, 'https://example.test')));
  const list = async (query = '') => {
    const response = await fetch('/api/issues?workspaceId=workspace' + query);
    assert.equal(response.status, 200);
    return (await response.json()).issues;
  };
  return { fetch, list };
}

test('a list for people leaves requests out, and requests=1 brings them back', async () => {
  const { fetch, list } = fixture();
  assert.equal((await fetch('/api/issues?workspaceId=other-workspace&requests=1')).status, 403);
  assert.deepEqual((await list()).map(row => row.id), [
    'work', 'subtask', 'follow-up', 'other-milestone', 'other-project',
  ]);

  const scoped = '&projectIds=project,missing&milestoneId=milestone';
  for (const requests of ['', '&requests=', '&requests=0', '&requests=true']) {
    const rows = await list(scoped + requests);
    assert.deepEqual(rows.map(row => row.id), ['work', 'subtask', 'follow-up']);
    assert.deepEqual(rows[0].children.map(child => child.id), ['subtask']);
    assert.deepEqual(rows[0]._count, { children: 1, comments: 3 });
    assert.equal(rows[2].parent, null);
  }

  const rows = await list(scoped + '&requests=1');
  assert.deepEqual(rows.map(row => row.id), ['work', 'review', 'subtask', 'release', 'follow-up']);
  assert.deepEqual(rows[0].children.map(child => child.id), ['review', 'subtask']);
  assert.deepEqual(rows[0]._count, { children: 2, comments: 3 });
  assert.equal(rows[4].parent.id, 'release');
});

test('every row says whether it is a request', async () => {
  const { fetch } = fixture();
  const { useIssuesByWorkspace } = load('src/hooks/queries/useIssues.ts', {
    '@tanstack/react-query': { useQuery: options => options },
  }, { fetch, URLSearchParams });
  const defaultQuery = useIssuesByWorkspace('workspace', ['project']);
  const requestQuery = useIssuesByWorkspace('workspace', ['project'], { requests: true });
  assert.notDeepEqual(requestQuery.queryKey, defaultQuery.queryKey);

  for (const [query, roles] of [
    [defaultQuery, [null, null, null, null]],
    [requestQuery, [null, 'review', null, 'release', null, null]],
  ]) {
    const { issues } = await query.queryFn();
    assert.deepEqual(issues.map(row => row.agentRequestRole), roles);
  }
});
