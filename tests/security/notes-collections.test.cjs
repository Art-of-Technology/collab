const { assert, test, resolve, load, matches, workspaces, matchesWorkspace, prisma, userHasWorkspaceAccess, enums, note } = require('./helpers.cjs');


test('review: alternate Notes handlers filter content and metadata with the real access policy', async () => {
  const workspace = { id: 'joined', slug: 'joined', name: 'Workspace', ownerId: 'bob',
    members: [{ userId: 'alice', status: true, role: 'MEMBER' }] };
  const project = { id: 'project', workspaceId: 'joined', workspace };
  const rows = [
    { id: 'restricted', scope: 'WORKSPACE', isRestricted: true },
    { id: 'restricted-project', scope: 'PROJECT', isRestricted: true },
    { id: 'personal', scope: 'PERSONAL' },
    { id: 'expired', scope: 'WORKSPACE', expiresAt: new Date(0) },
    { id: 'visible', scope: 'WORKSPACE' },
    { id: 'shared', scope: 'PROJECT', isRestricted: true, sharedWith: [{ userId: 'alice', permission: 'VIEW' }] },
    { id: 'owned', scope: 'PROJECT', authorId: 'alice', isRestricted: true },
  ].map(row => ({ ...note, isEncrypted: false, title: 'matching-text', content: 'matching-text secret ' + row.id,
    createdAt: new Date(), updatedAt: new Date(), tags: [], comments: [], author: { name: 'Author' },
    workspace, projectId: 'project', project, ...row }));
  const access = load('src/lib/secrets/access.ts', {
    '@/lib/prisma': { prisma: {} }, '@prisma/client': enums, '@/lib/issue-finder': { userHasWorkspaceAccess },
  });
  const db = {
    workspace: { findFirst: async ({ where }) => matchesWorkspace(workspace, where) ? workspace : null },
    workspaceMember: { findFirst: async () => workspace.members[0].status ? { userId: 'alice' } : null },
    note: {
      findMany: async ({ where }) => rows.filter(row => matches(row, where)),
      findFirst: async ({ where }) => rows.find(row => matches(row, where)) ?? null,
    },
    project: { findMany: async () => [], findFirst: async ({ where }) => matches(project, where) ? project : null },
    issue: { findMany: async () => [], groupBy: async () => [], count: async () => 0 },
    repository: { findFirst: async () => null },
  };
  for (const model of ['user', 'view', 'post', 'tag', 'projectStatus', 'featureRequest']) {
    db[model] = { findMany: async () => [] };
  }
  const dependencies = {
    'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status ?? 200 }) } },
    'next-auth': { getServerSession: async () => ({ user: { id: 'alice', email: 'alice@example.test' } }) },
    'next-auth/next': { getServerSession: async () => ({ user: { id: 'alice', email: 'alice@example.test' } }) },
    '@/lib/session': { getCurrentUser: async () => ({ id: 'alice' }) },
    '@/lib/auth-options': { authOptions: {} }, '@/lib/auth': { authConfig: {} },
    '@/lib/prisma': { prisma: db }, '@/lib/secrets/access': access,
  };
  const search = load('src/app/api/search/route.ts', dependencies, { URL, console });
  const summary = load('src/app/api/projects/[projectId]/summary/route.ts', dependencies, { console });
  const preview = load('src/app/api/link-preview/route.ts', dependencies, { URL, console });
  const allowed = ['owned', 'shared', 'visible'];
  const searchResponse = await search.GET(new Request('https://example.test/api/search?workspace=joined&q=matching-text'));
  assert.equal(searchResponse.status, 200);
  assert.deepEqual(Array.from(searchResponse.body, result => result.id).sort(), allowed);
  const summaryResponse = await summary.GET({}, { params: Promise.resolve({ projectId: 'project' }) });
  assert.equal(summaryResponse.status, 200);
  assert.deepEqual(Array.from(summaryResponse.body.notes, result => result.id).sort(), allowed);
  for (const row of rows) {
    const response = await preview.POST(new Request('https://example.test/api/link-preview', {
      method: 'POST', body: JSON.stringify({ url: `https://example.test/joined/notes/${row.id}` }),
    }));
    assert.equal(response.status, 200);
    assert.equal(response.body.metadata.notFound === true, !allowed.includes(row.id), row.id);
    if (!allowed.includes(row.id)) assert.equal(response.body.title, 'Not Found');
  }
  workspace.members[0].status = false;
  assert.equal((await search.GET(new Request('https://example.test/api/search?workspace=joined&q=matching-text'))).status, 403);
  assert.equal((await summary.GET({}, { params: Promise.resolve({ projectId: 'project' }) })).status, 404);
  const revokedPreview = await preview.POST(new Request('https://example.test/api/link-preview', {
    method: 'POST', body: JSON.stringify({ url: 'https://example.test/joined/notes/owned' }),
  }));
  assert.equal(revokedPreview.body.metadata.notFound, true);
});

test('review: favorite PATCH preserves concurrent visibility and explicit scope updates still work', async () => {
  let state;
  const payloads = [];
  const route = load('src/app/api/notes/[id]/route.ts', {
    'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status ?? 200 }) } },
    'next-auth': { getServerSession: async () => ({ user: { id: 'alice' } }) },
    '@/lib/auth-options': { authOptions: {} }, '@prisma/client': enums,
    '@/lib/prisma': { prisma: { note: {
      findFirst: async () => {
        const snapshot = { ...state };
        state.scope = 'PERSONAL';
        return snapshot;
      },
      findUnique: async () => ({ versioningEnabled: false }),
      update: async ({ data }) => { payloads.push(data); Object.assign(state, data); return state; },
    } } },
    '@/lib/secrets/access': { canAccessNote: async () => ({ canEdit: true }), canWriteNoteDestination: async () => true },
    '@/lib/secrets/crypto': { isSecretNoteType: () => false }, '@/lib/versioning': {}, '@/lib/event-bus': {},
  }, { console });
  for (const [body, expectedScope] of [
    [{ isFavorite: true }, 'PERSONAL'], [{ scope: 'WORKSPACE' }, 'WORKSPACE'],
    [{ isPublic: true }, 'WORKSPACE'], [{ isPublic: false }, 'PERSONAL'],
  ]) {
    state = { ...note, authorId: 'alice', isEncrypted: false };
    const response = await route.PATCH(new Request('https://example.test/note', {
      method: 'PATCH', body: JSON.stringify(body),
    }), { params: Promise.resolve({ id: 'note' }) });
    assert.equal(response.status, 200);
    assert.equal(state.scope, expectedScope);
  }
  assert.equal(Object.hasOwn(payloads[0], 'scope'), false);
});

test('retired Coclaw memory never exposes Notes or metadata for any workspace', async () => {
  const deps = { 'next/server': { NextResponse: Response } };
  const retired = load('src/lib/coclaw-retired.ts', deps);
  const { GET } = load('src/app/api/workspaces/[workspaceId]/coclaw/memory/route.ts', { '@/lib/coclaw-retired': retired });
  for (const workspaceId of ['joined', 'own', 'foreign', 'revoked', 'missing']) {
    const response = await GET({}, { params: Promise.resolve({ workspaceId }) });
    assert.equal(response.status, 410);
    assert.equal((await response.json()).error, 'coclaw_retired');
  }
});
