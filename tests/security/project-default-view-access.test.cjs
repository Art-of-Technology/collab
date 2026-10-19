const { test, assert, load, matches: baseMatches } = require('./helpers.cjs');

function matches(row, where) {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'AND') return value.every(part => matches(row, part));
    if (key === 'OR') return value.some(part => matches(row, part));
    if (value && typeof value === 'object') {
      if ('has' in value) return row?.[key]?.includes(value.has) ?? false;
      if ('some' in value) return row?.[key]?.some(item => matches(item, value.some)) ?? false;
      if (!['in', 'notIn', 'not', 'contains', 'gte', 'lt'].some(op => op in value)) return matches(row?.[key], value);
    }
    return baseMatches(row, { [key]: value });
  });
}

function fixture() {
  const state = { userId: 'actor', reads: [] };
  const workspace = { id: 'workspace', ownerId: 'owner', members: [{ userId: 'actor', status: true }] };
  const project = { id: 'project', workspaceId: workspace.id, workspace };
  const view = { id: 'default', slug: 'project-default', name: 'Project: Default', ownerId: 'owner',
    workspaceId: workspace.id, workspace, projectIds: [project.id], visibility: 'WORKSPACE', sharedWith: [], isDefault: true };
  const prisma = Object.fromEntries([['project', project], ['view', view]].map(([model, row]) => [model, {
    findFirst: async ({ where, select }) => {
      state.reads.push(model);
      return matches(row, where) ? Object.fromEntries(Object.keys(select).map(key => [key, row[key]])) : null;
    },
  }]));
  const dependencies = {
    '@/lib/prisma': { prisma }, '@/lib/auth': { authConfig: {} }, 'next/server': { NextResponse: Response },
    '@/lib/request-session': { getServerSession: async () => state.userId === null ? null : { user: { id: state.userId } } },
  };
  dependencies['@/lib/view-access'] = load('src/lib/view-access.ts', dependencies);
  const { GET } = load('src/app/api/projects/[projectId]/default-view/route.ts', dependencies, { console });
  const invoke = (projectId = project.id) => GET(new Request('https://collab.test/api/projects/project/default-view'), { params: Promise.resolve({ projectId }) });
  return { state, workspace, project, view, invoke };
}

test('default-view lookup requires a session before reading project or view records', async () => {
  for (const userId of [null, undefined, '']) {
    const f = fixture(); f.state.userId = userId;
    const response = await f.invoke();
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'Unauthorized' });
    assert.deepEqual(f.state.reads, []);
  }
});

test('default-view lookup enforces project, workspace and view visibility together', async () => {
  const cases = [
    ['active member', () => {}, 200],
    ['workspace owner', f => { f.workspace.members = []; f.state.userId = 'owner'; }, 200],
    ['personal owner', f => { f.view.visibility = 'PERSONAL'; f.view.ownerId = 'actor'; }, 200],
    ['shared recipient', f => { f.view.visibility = 'SHARED'; f.view.sharedWith = ['actor']; }, 200],
    ['other personal view', f => { f.view.visibility = 'PERSONAL'; }, 404],
    ['unshared view', f => { f.view.visibility = 'SHARED'; f.view.sharedWith = ['someone-else']; }, 404],
    ['revoked member', f => { f.workspace.members[0].status = false; f.view.ownerId = 'actor'; }, 404],
    ['foreign project', f => { f.workspace.members = []; }, 404],
    ['cross-workspace view', f => { f.view.workspaceId = 'other'; f.view.workspace = { id: 'other', ownerId: 'actor', members: [] }; }, 404],
    ['other project view', f => { f.view.projectIds = ['other']; }, 404],
    ['non-default view', f => { f.view.isDefault = false; }, 404],
  ];
  for (const [label, configure, status] of cases) {
    const f = fixture(); configure(f);
    const response = await f.invoke();
    assert.equal(response.status, status, label);
    const body = await response.json();
    if (status === 200) assert.deepEqual(body, { id: 'default', slug: 'project-default', name: 'Project: Default' }, label);
    else assert.deepEqual(Object.keys(body), ['error'], label);
  }
  assert.equal((await fixture().invoke('missing')).status, 404);
  assert.equal((await fixture().invoke('')).status, 400);
});

test('default navigation rechecks visibility, session and membership instead of reusing cached metadata', async () => {
  for (const revoke of [f => { f.view.visibility = 'PERSONAL'; }, f => { f.workspace.members[0].status = false; }, f => { f.state.userId = null; }, f => { f.state.userId = 'other-user'; }]) {
    const f = fixture();
    const { generateBackNavigationUrl } = load('src/lib/navigation-helpers.ts', {
      './client-slug-resolvers': { getWorkspaceSlug: async () => null },
    }, { console, fetch: () => f.invoke() });
    const issue = { projectId: 'project', project: { slug: 'project' } };
    assert.equal(await generateBackNavigationUrl('workspace', issue), '/workspace/views/project-default');
    revoke(f);
    assert.equal(await generateBackNavigationUrl('workspace', issue), '/workspace/projects/project');
  }
});
