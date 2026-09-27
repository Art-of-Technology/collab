const { assert, test, load, matches } = require('./helpers.cjs');

function fixture() {
  const ws = [
    { id: 'own', slug: 'own', ownerId: 'alice', members: [] },
    { id: 'joined', slug: 'joined', ownerId: 'bob', members: [{ userId: 'alice', status: true }] },
    { id: 'revoked', slug: 'revoked', ownerId: 'bob', members: [{ userId: 'alice', status: false }] },
    { id: 'foreign', slug: 'foreign', ownerId: 'bob', members: [] },
  ];
  const tags = [
    { id: 'personal', authorId: 'alice', workspaceId: null, workspace: null },
    { id: 'other-personal', authorId: 'bob', workspaceId: null, workspace: null },
    ...ws.map(workspace => ({ id: workspace.id, authorId: workspace.id === 'revoked' ? 'alice' : 'bob', workspaceId: workspace.id, workspace })),
  ].map(t => ({ name: t.id, color: '#123456', ...t }));
  const workspace = ws[1];
  const project = { id: 'project', workspaceId: 'joined', workspace };
  const projects = [project, { id: 'other-project', workspaceId: 'own', workspace: ws[0] }];
  const note = { id: 'note', authorId: 'alice', title: 'needle', content: 'needle', type: 'GENERAL', scope: 'WORKSPACE',
    workspaceId: 'joined', workspace, projectId: 'project', project, isRestricted: false, isEncrypted: false,
    expiresAt: null, sharedWith: [{ userId: 'alice', permission: 'EDIT' }], tags, comments: [], author: { name: 'Alice' },
    isPinned: true, isAiContext: true, createdAt: new Date(), updatedAt: new Date(), versioningEnabled: true, version: 1 };
  const notes = [note, { ...note, id: 'hidden', authorId: 'bob', scope: 'PERSONAL', sharedWith: [] }];
  const state = { writes: 0, effects: 0, tagReads: 0, lastWrite: null };
  function projectNote(row, args) {
    const t = (args.include || args.select)?.tags;
    return { ...row, tags: row.tags.filter(tag => !t?.where || matches(tag, t.where)) };
  }
  const db = {
    workspace: { findFirst: async ({ where }) => ws.find(w => matches(w, where)) ?? null },
    user: { findUnique: async () => ({ id: 'alice' }), findMany: async () => [] },
    project: { findFirst: async ({ where }) => projects.find(p => matches(p, where)) ?? null,
      findUnique: async ({ where }) => projects.find(p => matches(p, where)) ?? null, findMany: async () => [] },
    noteTag: {
      findMany: async args => { state.tagReads++; return tags.filter(t => matches(t, args.where)).map(t => ({ ...t,
        _count: { notes: notes.filter(n => !args.include?._count?.select?.notes?.where || matches(n, args.include._count.select.notes.where)).length } })); },
      count: async ({ where }) => tags.filter(t => matches(t, where)).length,
      findFirst: async () => null,
      create: async args => { state.writes++; state.lastWrite = args; return { id: 'new', ...args.data }; },
    },
    note: {
      findMany: async args => notes.filter(n => matches(n, args.where)).map(n => projectNote(n, args)),
      count: async ({ where }) => notes.filter(n => matches(n, where)).length,
      findFirst: async args => matches(note, args.where) ? projectNote(note, args) : null,
      findUnique: async () => note,
      create: async args => { state.writes++; state.lastWrite = args; return projectNote({ ...note, workspace: null }, args); },
      update: async args => { state.writes++; state.lastWrite = args; return projectNote({ ...note, workspace: null }, args); },
    },
    issue: { findMany: async () => [], count: async () => 0, groupBy: async () => [],
      findFirst: async ({ where }) => state.issue && matches(state.issue, where) ? state.issue : null },
    repository: { findFirst: async () => null },
  };
  for (const model of ['view', 'post', 'tag', 'projectStatus', 'featureRequest']) db[model] = { findMany: async () => [] };
  const dependencies = {
    'next/server': { NextResponse: Response },
    'next-auth': { getServerSession: async () => ({ user: { id: 'alice' } }) },
    '@/lib/auth-options': { authOptions: {} }, '@/lib/prisma': { prisma: db },
    '@/lib/auth': { getAuthSession: async () => ({ user: { id: 'alice' } }) },
    '@/lib/session': { getCurrentUser: async () => ({ id: 'alice' }) },
    '@/lib/secrets/crypto': { isSecretNoteType: t => t === 'SECRET', isSecretsEnabled: () => true,
      encryptVariables: () => { state.effects++; return []; }, encryptRawContent: () => { state.effects++; return ''; } },
    '@/lib/versioning': { createInitialVersion: async () => { state.effects++; }, createVersion: async () => { state.effects++; },
      hasSignificantChange: () => true, detectChangeType: () => 'UPDATE' },
    '@/lib/event-bus': {},
  };
  const route = (file, overrides = {}) => load(file, { ...dependencies, ...overrides }, { URL, console });
  const request = (body, url = 'https://example.test/api', method = 'POST') => new Request(url, { method, body: JSON.stringify(body) });
  return { ws, tags, note, notes, state, db, route, request };
}

test('tag list keeps own personal and requested active tags, denies revoked authorship and foreign tags', async () => {
  const f = fixture(), r = f.route('src/app/api/notes/tags/route.ts');
  for (const [workspace, expected] of [['foreign', ['personal']], ['joined', ['joined', 'personal']], ['own', ['own', 'personal']]]) {
    const response = await r.GET(new Request('https://example.test/tags?workspace=' + workspace));
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).map(t => t.id).sort(), expected);
  }
});

test('tag counts include only currently readable notes', async () => {
  const f = fixture();
  const response = await f.route('src/app/api/notes/tags/route.ts').GET(new Request('https://example.test/tags?workspace=joined'));
  assert.equal((await response.json()).find(t => t.id === 'joined')._count.notes, 1);
});

test('tag creation rejects foreign/revoked workspace before duplicate lookup or writes', async () => {
  for (const workspaceId of ['foreign', 'revoked', 7, {}]) {
    const f = fixture(); let reads = 0; f.db.noteTag.findFirst = async () => { reads++; return null; };
    const response = await f.route('src/app/api/notes/tags/route.ts').POST(f.request({ name: 'tag', workspaceId }));
    assert.equal(response.status, 403); assert.equal(f.state.writes, 0); assert.equal(reads, 0);
  }
});

test('tag creation retains personal, owner and active-member controls', async () => {
  for (const workspaceId of [null, '', 'own', 'joined']) {
    const f = fixture(); const response = await f.route('src/app/api/notes/tags/route.ts').POST(f.request({ name: ' tag ', workspaceId }));
    assert.equal(response.status, 201); assert.equal(f.state.writes, 1); assert.equal(f.state.lastWrite.data.name, 'tag');
  }
});

for (const method of ['POST', 'PATCH']) {
  test(`${method} rejects foreign, wrong-workspace, other personal and malformed tags before side effects`, async () => {
    for (const tagIds of [['foreign'], ['own'], ['other-personal'], ['revoked'], ['missing'], [7], 'joined', null]) {
      const f = fixture(); const route = f.route(method === 'POST' ? 'src/app/api/notes/route.ts' : 'src/app/api/notes/[id]/route.ts');
      const response = await route[method](f.request({ title: 'updated', content: 'updated', workspaceId: 'joined', tagIds }, undefined, method), { params: Promise.resolve({ id: 'note' }) });
      assert.equal(response.status, 403, JSON.stringify(tagIds)); assert.equal(f.state.writes, 0); assert.equal(f.state.effects, 0);
    }
  });
  test(`${method} retains same-workspace/own-personal tags and empty selection with scoped writes`, async () => {
    for (const tagIds of [['joined', 'personal', 'joined'], []]) {
      const f = fixture(); const route = f.route(method === 'POST' ? 'src/app/api/notes/route.ts' : 'src/app/api/notes/[id]/route.ts');
      const response = await route[method](f.request({ title: 'updated', content: 'updated', workspaceId: 'joined', tagIds }, undefined, method), { params: Promise.resolve({ id: 'note' }) });
      assert.equal(response.status, method === 'POST' ? 201 : 200); assert.equal(f.state.writes, 1);
      const selectors = f.state.lastWrite.data.tags?.[method === 'POST' ? 'connect' : 'set'] || [];
      for (const selector of selectors) {
        const original = f.tags.find(t => t.id === selector.id); assert.ok(matches(original, selector));
        assert.equal(matches({ ...original, workspaceId: 'foreign', workspace: f.ws[3] }, selector), false);
      }
    }
  });
}

test('project-only Notes use the effective final project workspace; direct workspace wins', async () => {
  for (const method of ['POST', 'PATCH']) {
    const f = fixture(); f.note.workspaceId = null; f.note.workspace = null;
    const route = f.route(method === 'POST' ? 'src/app/api/notes/route.ts' : 'src/app/api/notes/[id]/route.ts');
    const response = await route[method](f.request({ title: 'updated', content: 'updated', projectId: 'project', scope: 'PROJECT', tagIds: ['joined'] }, undefined, method), { params: Promise.resolve({ id: 'note' }) });
    assert.equal(response.status, method === 'POST' ? 201 : 200);
    const selectors = f.state.lastWrite.data.tags[method === 'POST' ? 'connect' : 'set'];
    assert.ok(matches(f.tags.find(t => t.id === 'joined'), selectors[0]));
    assert.equal(matches({ ...f.tags.find(t => t.id === 'joined'), workspaceId: 'own', workspace: f.ws[0] }, selectors[0]), false);
  }
  const f = fixture(); const helper = f.route('src/lib/note-tag-access.ts');
  assert.equal(await helper.noteTagConnections('alice', ['joined'], 'own', 'project'), null);
  assert.equal(await helper.noteTagConnections('alice', ['joined'], null, 'missing'), null);
  for (const [tagIds, expected] of [[['own'], 200], [['joined'], 403]]) {
    const moved = fixture(); moved.note.workspaceId = null; moved.note.workspace = null; moved.note.scope = 'PROJECT';
    const response = await moved.route('src/app/api/notes/[id]/route.ts').PATCH(
      moved.request({ projectId: 'other-project', tagIds }, undefined, 'PATCH'), { params: Promise.resolve({ id: 'note' }) });
    assert.equal(response.status, expected); assert.equal(moved.state.writes, expected === 200 ? 1 : 0);
  }
});

const projections = [
  ['src/app/api/notes/route.ts', 'GET', '?workspace=joined', b => b],
  ['src/app/api/notes/route.ts', 'GET', '?workspace=joined&sharedWithMe=true', b => b],
  ['src/app/api/notes/[id]/route.ts', 'GET', '', b => [b]],
  ['src/app/api/notes/pinned/route.ts', 'GET', '?workspaceId=joined', b => b],
  ['src/app/api/notes/search/route.ts', 'GET', '?workspaceId=joined&q=needle', b => b.results],
  ['src/app/api/notes/shared-with-me/route.ts', 'GET', '?workspace=joined', b => b],
  ['src/app/api/notes/[id]/pin/route.ts', 'POST', '', b => [b.note]],
  ['src/app/api/search/route.ts', 'GET', '?workspace=joined&q=needle', b => b.filter(v => v.type === 'note').map(v => v.metadata.note)],
  ['src/app/api/projects/[projectId]/summary/route.ts', 'GET', '', b => b.notes],
  ['src/app/api/workspaces/[workspaceId]/coclaw/memory/route.ts', 'GET', '', b => b.memories],
];
for (const [file, method, query, extract] of projections) test(`historical unauthorized tag links are filtered in ${file}${query}`, async () => {
  const f = fixture(), url = 'https://example.test/api' + query;
  const req = method === 'POST' ? f.request({ pin: true }, url) : Object.assign(new Request(url), { nextUrl: new URL(url) });
  const response = await f.route(file)[method](req, { params: Promise.resolve({ id: 'note', projectId: 'project', workspaceId: 'joined' }) });
  assert.equal(response.status, 200);
  const rows = extract(await response.json()); assert.ok(rows.length > 0);
  for (const row of rows) assert.deepEqual(row.tags.map(t => t.name).sort(), ['joined', 'own', 'personal']);
});

test('tag search cannot reveal a note through an unauthorized historical tag link', async () => {
  const f = fixture(); const route = f.route('src/app/api/notes/route.ts');
  for (const tag of ['foreign', 'other-personal', 'revoked']) {
    const response = await route.GET(new Request('https://example.test/notes?workspace=joined&tag=' + tag));
    assert.deepEqual(await response.json(), []);
  }
  assert.equal((await (await route.GET(new Request('https://example.test/notes?workspace=joined&tag=joined'))).json()).length, 1);
});

test('issue previews use current issue, project and status access; owner and external no-fetch controls remain', async () => {
  const f = fixture(), route = f.route('src/app/api/link-preview/route.ts');
  for (const [workspace, projectWorkspace, statusWorkspace, expected] of [
    ['joined', 'joined', null, true], ['own', 'own', null, true], ['revoked', 'joined', null, false],
    ['joined', 'foreign', null, false], ['joined', 'joined', 'revoked', false],
  ]) {
    f.state.issue = { id: 'issue', issueKey: 'KEY-1', title: 'Visible', workspace: f.ws.find(w => w.id === workspace),
      project: { workspace: f.ws.find(w => w.id === projectWorkspace) }, statusId: statusWorkspace ? 'status' : null,
      projectStatus: statusWorkspace ? { project: { workspace: f.ws.find(w => w.id === statusWorkspace) } } : null };
    const response = await route.POST(f.request({ url: `https://example.test/${workspace}/issues/KEY-1` }));
    assert.equal(response.status, 200); assert.equal((await response.json()).metadata.notFound !== true, expected);
  }
  const response = await route.POST(f.request({ url: 'https://example.org/some-page' }));
  assert.equal((await response.json()).type, 'external');
});


function appFixture() {
  const f = fixture();
  const context = { user: { id: 'alice' }, workspace: f.ws[1], token: { scopes: [] } };
  const route = file => f.route(file, {
    zod: require('zod'),
    '@/lib/apps/auth-middleware': { withAppAuth: (handler, options) => (request, params) => {
      if (!options.requiredScopes.every(scope => context.token.scopes.includes(scope))) {
        return Response.json({ error: 'insufficient_scope' }, { status: 403 });
      }
      return handler(request, context, params);
    } },
    '@/lib/html-sanitizer': { stripHtmlToPlainText: text => text },
    '@/lib/event-bus': {
      emitContextCreated: async () => { f.state.effects++; },
      emitContextUpdated: async () => { f.state.effects++; },
    },
  });
  return { ...f, context, route };
}

for (const method of ['POST', 'PUT']) {
  const file = method === 'POST' ? 'src/app/api/apps/auth/context/route.ts' : 'src/app/api/apps/auth/context/[id]/route.ts';
  test(`app ${method} rejects unauthorized tags before writes and events`, async () => {
    for (const tagIds of [['foreign'], ['revoked'], ['other-personal'], ['own'], ['missing'], ['']]) {
      const f = appFixture(); f.context.token.scopes = ['context:write'];
      const response = await f.route(file)[method](f.request({ title: 'updated', content: 'updated', tagIds }, undefined, method), { params: Promise.resolve({ id: 'note' }) });
      assert.equal(response.status, 403, JSON.stringify(tagIds));
      assert.equal(f.state.writes, 0); assert.equal(f.state.effects, 0);
    }
  });
  test(`app ${method} preserves valid scoped tags, clear and omitted tags and filters write projections`, async () => {
    for (const tagIds of [['joined', 'personal', 'joined'], [], undefined]) {
      const f = appFixture(); f.context.token.scopes = ['context:write'];
      const response = await f.route(file)[method](f.request({ title: 'updated', content: 'updated', tagIds }, undefined, method), { params: Promise.resolve({ id: 'note' }) });
      assert.equal(response.status, method === 'POST' ? 201 : 200);
      assert.equal(f.state.writes, 1); assert.equal(f.state.effects, 1);
      const tags = f.state.lastWrite.data.tags;
      if (tagIds === undefined || (method === 'POST' && tagIds.length === 0)) assert.equal(tags, undefined);
      else {
        const selectors = tags[method === 'POST' ? 'connect' : 'set'];
        assert.deepEqual(Array.from(selectors, s => s.id), [...new Set(tagIds)]);
        for (const selector of selectors) {
          const original = f.tags.find(t => t.id === selector.id);
          assert.ok(matches(original, selector));
          for (const denied of ['foreign', 'revoked', 'own', 'other-personal']) {
            const replacement = { ...f.tags.find(t => t.id === denied), id: selector.id };
            assert.equal(matches(replacement, selector), false);
          }
        }
      }
      assert.deepEqual((await response.json()).tags.map(t => t.id).sort(), ['joined', 'own', 'personal']);
    }
  });
}

for (const [path, extract] of [
  ['context', b => b.context], ['context/[id]', b => [b]],
  ['context/knowledge', b => b.articles], ['context/knowledge/[id]', b => [b]],
]) test(`app ${path} filters historical tag links using current access`, async () => {
  const f = appFixture(); f.note.type = 'GUIDE';
  f.context.token.scopes = ['context:read', 'knowledge:read'];
  const handler = f.route(`src/app/api/apps/auth/${path}/route.ts`).GET;
  const get = () => handler(new Request('https://example.test/api?q=needle'), { params: Promise.resolve({ id: 'note' }) });
  for (const owner of ['alice', 'bob']) {
    f.ws[0].ownerId = owner;
    const response = await get(); assert.equal(response.status, 200);
    const rows = extract(await response.json()); assert.equal(rows.length, 1);
    assert.deepEqual(rows[0].tags.map(t => t.id).sort(), owner === 'alice' ? ['joined', 'own', 'personal'] : ['joined', 'personal']);
  }
  if (path === 'context/[id]') {
    f.note.isEncrypted = true;
    const body = await (await get()).json();
    assert.equal(body.content, '[REDACTED - secrets:read scope required]');
    assert.deepEqual(body.tags.map(t => t.id).sort(), ['joined', 'personal']);
  }
  f.ws[1].members[0].status = false;
  assert.equal((await get()).status, 403);
});
