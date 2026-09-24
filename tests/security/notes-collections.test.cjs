const { assert, test, resolve, load, matches, workspaces, matchesWorkspace, prisma, userHasWorkspaceAccess, enums, note } = require('./helpers.cjs');


test('review: alternate Notes handlers filter content and metadata with the real access policy', async () => {
  const workspace = { id: 'joined', slug: 'joined', name: 'Workspace', ownerId: 'bob',
    members: [{ userId: 'alice', status: true, role: 'MEMBER' }] };
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
    workspace, projectId: 'project', project: { workspace }, ...row }));
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
    project: { findMany: async () => [], findUnique: async () => ({ id: 'project', workspaceId: 'joined' }) },
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
  assert.equal((await summary.GET({}, { params: Promise.resolve({ projectId: 'project' }) })).status, 403);
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

test('disclosure: Coclaw memory enforces active access and Notes result/count parity', async () => {
  let session = { user: { id: 'alice' } };
  let reads = 0;
  let counts = 0;
  const workspace = workspaces.find(row => row.id === 'joined');
  const rows = [
    { id: 'private', scope: 'PERSONAL' },
    { id: 'restricted', isRestricted: true },
    { id: 'expired', expiresAt: new Date(0) },
    { id: 'visible' },
    { id: 'shared', isRestricted: true, isAiContext: true, sharedWith: [{ userId: 'alice', permission: 'VIEW' }] },
    { id: 'shared-personal', type: 'NOTE', scope: 'PERSONAL', isAiContext: true, sharedWith: [{ userId: 'alice', permission: 'EDIT' }] },
    { id: 'owned-expired', authorId: 'alice', expiresAt: new Date(0), isAiContext: true },
    { id: 'ordinary', type: 'NOTE' },
    { id: 'foreign', workspaceId: 'foreign', workspace: workspaces.find(row => row.id === 'foreign') },
  ].map(row => ({ ...note, workspace, isEncrypted: false, type: 'ARCHITECTURE', isAiContext: false,
    aiContextPriority: 1, title: 'Memory ' + row.id, content: 'needle ' + row.id + ' '.repeat(510) + 'end',
    tags: [], createdAt: new Date('2026-09-23T00:00:00Z'), updatedAt: new Date('2026-09-23T00:00:00Z'), ...row }));
  const access = load('src/lib/secrets/access.ts', {
    '@/lib/prisma': { prisma }, '@prisma/client': enums, '@/lib/issue-finder': { userHasWorkspaceAccess },
  });
  const { GET } = load('src/app/api/workspaces/[workspaceId]/coclaw/memory/route.ts', {
    'next/server': { NextResponse: Response }, '@/lib/auth': { getAuthSession: async () => session },
    '@/lib/issue-finder': { userHasWorkspaceAccess }, '@/lib/secrets/access': access,
    '@/lib/prisma': { prisma: { ...prisma, note: {
      findMany: async ({ where, take }) => { reads++; return rows.filter(row => matches(row, where)).slice(0, take); },
      count: async ({ where }) => { counts++; return rows.filter(row => matches(row, where)).length; },
    } } },
  }, { console });
  const get = (workspaceId, query = '') => GET({ nextUrl: new URL('https://example.test/memory?' + query) }, {
    params: Promise.resolve({ workspaceId }),
  });
  session = null;
  assert.equal((await get('joined')).status, 401);
  session = { user: { id: 'alice' } };
  for (const id of ['foreign', 'revoked', 'missing']) assert.equal((await get(id)).status, 404, id);
  assert.equal(reads, 0); assert.equal(counts, 0);
  const visibleIds = ['visible', 'shared', 'shared-personal', 'owned-expired'];
  for (const category of ['all', 'architecture', 'ai-context']) {
    for (const search of ['', 'needle', 'shared', 'absent']) {
      const expected = rows.filter(row => visibleIds.includes(row.id) &&
        (category !== 'architecture' || row.type === 'ARCHITECTURE') &&
        (category !== 'ai-context' || row.isAiContext) &&
        (!search || row.title.includes(search) || row.content.includes(search)));
      for (const limit of [1, 50]) {
        const response = await get('joined', new URLSearchParams({ category, search, limit: String(limit) }));
        assert.equal(response.status, 200);
        const body = await response.json();
        assert.equal(body.total, expected.length, `${category}/${search}/${limit}`);
        assert.deepEqual(body.memories.map(row => row.id), expected.slice(0, limit).map(row => row.id));
        for (const memory of body.memories) {
          const row = expected.find(row => row.id === memory.id);
          assert.equal(memory.fullContent, row.content);
          assert.equal(memory.content, row.content.substring(0, 500));
          assert.equal(memory.createdAt, row.createdAt.toISOString());
        }
      }
    }
  }
  const ownerResponse = await get('own');
  assert.equal(ownerResponse.status, 200);
  assert.deepEqual(await ownerResponse.json(), { memories: [], total: 0 });
  assert.equal(reads, 25); assert.equal(counts, 25);
});
