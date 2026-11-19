const { assert, test, load, matches } = require('./helpers.cjs');

// What the Context page is given for one folder, and for the top of a level: the Notes and the files
// a member may read there, and nothing a member may not. A Note keeps the rules it has everywhere.
function fixture(userId = 'alice') {
  const client = require('@prisma/client');
  const workspace = { id: 'joined', slug: 'joined', ownerId: 'bob', members: [{ userId: 'alice', status: true, role: 'MEMBER' }] };
  const other = { id: 'foreign', slug: 'foreign', ownerId: 'bob', members: [] };
  const workspaces = [workspace, other];
  const project = { id: 'project', workspaceId: 'joined', workspace };
  const projects = [project, { id: 'foreign-project', workspaceId: 'foreign', workspace: other }];
  const now = new Date('2026-11-17T09:00:00Z');

  const folders = [];
  function addFolder(id, fields = {}) {
    const row = { id, name: id, workspaceId: 'joined', projectId: null, parentId: null, createdById: 'alice',
      createdAt: now, updatedAt: now, deletedAt: null, deletedById: null, ...fields };
    Object.defineProperty(row, 'workspace', { get: () => workspaces.find(item => item.id === row.workspaceId) ?? null, enumerable: true });
    folders.push(row);
    return row;
  }
  const notes = [];
  function addNote(id, fields = {}) {
    const row = { id, title: id, type: 'GENERAL', scope: 'WORKSPACE', folderId: null, workspaceId: 'joined',
      projectId: null, authorId: 'bob', isRestricted: false, isEncrypted: false, isAiContext: false,
      expiresAt: null, sharedWith: [], updatedAt: now, ...fields };
    Object.defineProperty(row, 'workspace', { get: () => workspaces.find(item => item.id === row.workspaceId) ?? null, enumerable: true });
    Object.defineProperty(row, 'folder', { get: () => folders.find(item => item.id === row.folderId) ?? null, enumerable: true });
    Object.defineProperty(row, 'project', { get: () => projects.find(item => item.id === row.projectId) ?? null, enumerable: true });
    notes.push(row);
    return row;
  }
  const files = [];
  function addFile(id, fields = {}) {
    const row = { id, name: id, mimeType: 'text/plain', size: 10, folderId: 'ideation', uploadedById: 'alice',
      storageUrl: `https://res.cloudinary.test/demo/raw/authenticated/v1/collab/context/${id}`,
      createdAt: now, updatedAt: now, deletedAt: null, deletedById: null, ...fields };
    Object.defineProperty(row, 'folder', { get: () => folders.find(item => item.id === row.folderId) ?? null, enumerable: true });
    files.push(row);
    return row;
  }

  /** A read gives back the fields it selected and no others. */
  function selected(row, select) {
    if (!row || !select) return row;
    return Object.fromEntries(Object.entries(select).map(([key, value]) => [key, value === true ? row[key] : selected(row[key], value.select)]));
  }
  const read = rows => async ({ where, select, take, skip = 0 }) => rows
    .filter(row => matches(row, where))
    .slice(skip, take === undefined ? undefined : skip + take)
    .map(row => selected(row, select));
  const db = {
    workspace: { findFirst: async ({ where }) => workspaces.find(item => matches(item, where)) ?? null },
    user: { findUnique: async () => ({ id: userId }) },
    project: { findFirst: async ({ where }) => projects.find(item => matches(item, where)) ?? null },
    contextFolder: {
      findFirst: async ({ where, select }) => { const row = folders.find(item => matches(item, where)); return row ? selected(row, select) : null; },
      findMany: read(folders),
    },
    contextFile: { findMany: read(files) },
    note: { findMany: read(notes) },
  };

  const globals = { URL, console, Response, Request, TextDecoder, Buffer, process: { env: {} } };
  const dependencies = {
    'next/server': { NextResponse: Response },
    'next-auth': { getServerSession: async () => ({ user: { id: userId } }) },
    '@/lib/auth-options': { authOptions: {} },
    '@prisma/client': client,
    '@/lib/prisma': { prisma: db },
    '@/lib/html-sanitizer': load('src/lib/html-sanitizer.ts'),
    '@/utils/cloudinary-server': { cloudinary: { url: id => id, uploader: { destroy: async () => ({}) } } },
  };
  // Folders, files and the reply that reports their errors share one error class, so each module is
  // loaded once here and handed to the next: two copies of the class would answer 500 instead of 404.
  for (const name of ['context-folders', 'context-folders-response', 'context-file-type', 'context-file-preview', 'context-files', 'secrets/access', 'context-items']) {
    dependencies[`@/lib/${name}`] = load(`src/lib/${name}.ts`, dependencies, globals);
  }
  const route = load('src/app/api/context/items/route.ts', dependencies, globals);
  const call = async (query = '') => {
    const response = await route.GET(new Request(`https://example.test/api/context/items${query}`));
    return { status: response.status, body: await response.json() };
  };
  return { addFolder, addNote, addFile, call };
}

test('a folder gives up the Notes and the files a member may read, and nothing else', async () => {
  const f = fixture();
  f.addFolder('ideation');
  f.addFolder('sketches', { parentId: 'ideation' });
  f.addNote('plan', { folderId: 'ideation', title: '<p>Plan</p>' });
  f.addNote('elsewhere', { folderId: 'sketches' });
  // Notes keep their own rules in a folder: one that is restricted to others, or expired, is not listed.
  f.addNote('restricted', { folderId: 'ideation', isRestricted: true });
  f.addNote('expired', { folderId: 'ideation', expiresAt: new Date('2020-01-01T00:00:00Z') });
  f.addFile('sketch.png', { mimeType: 'image/png', size: 2048 });
  f.addFile('binned.png', { deletedAt: new Date() });

  const open = await f.call('?folder=ideation');
  assert.equal(open.status, 200);
  assert.equal(open.body.folderId, 'ideation');
  // The title is given back as the text a reader sees, not as the markup it was written in.
  assert.deepEqual(open.body.notes.map(note => note.title), ['Plan']);
  assert.deepEqual(open.body.files.map(file => file.id), ['sketch.png']);
  // Where the bytes are kept is the server's business and never leaves it.
  assert.equal('storageUrl' in open.body.files[0], false);
});

test('the top of a level holds the Notes that are in no folder, and no files at all', async () => {
  const f = fixture();
  f.addFolder('ideation');
  f.addNote('loose');
  f.addNote('filed', { folderId: 'ideation' });
  f.addNote('mine', { scope: 'PERSONAL', authorId: 'alice' });
  // A project Note carries no workspace of its own; it belongs to its project's level, not the workspace's.
  f.addNote('project-note', { scope: 'PROJECT', workspaceId: null, projectId: 'project' });
  f.addFile('sketch.png');

  const top = await f.call('?workspace=joined');
  assert.equal(top.status, 200);
  assert.equal(top.body.folderId, null);
  assert.deepEqual(top.body.notes.map(note => note.id), ['loose']);
  assert.deepEqual(top.body.files, []);

  const inProject = await f.call('?workspace=joined&project=project');
  assert.deepEqual(inProject.body.notes.map(note => note.id), ['project-note']);
  assert.deepEqual(inProject.body.files, []);
});

test('a level and a folder of a workspace the caller is not in are not found', async () => {
  const f = fixture();
  f.addFolder('elsewhere', { workspaceId: 'foreign' });
  f.addNote('theirs', { folderId: 'elsewhere', workspaceId: 'foreign' });
  assert.equal((await f.call('?folder=elsewhere')).status, 404);
  assert.equal((await f.call('?workspace=foreign')).status, 404);
  assert.equal((await f.call('?workspace=joined&project=foreign-project')).status, 404);
  assert.equal((await f.call('?folder=missing')).status, 404);
  // A level is asked for by name: without one there is nothing to list.
  assert.equal((await f.call('')).status, 400);
});

test('a Note in a folder that is in Trash went there with it', async () => {
  const f = fixture();
  f.addFolder('ideation');
  f.addNote('plan', { folderId: 'ideation' });
  assert.deepEqual((await f.call('?folder=ideation')).body.notes.map(note => note.id), ['plan']);
  // The folder is in Trash: its own read is refused, and the Note is not listed anywhere else either.
  f.addFolder('binned', { deletedAt: new Date() });
  f.addNote('binned-note', { folderId: 'binned' });
  assert.equal((await f.call('?folder=binned')).status, 404);
  assert.deepEqual((await f.call('?workspace=joined')).body.notes.map(note => note.id), []);
});

test('notes beyond the first page are reachable', async () => {
  const f = fixture();
  for (let i = 0; i < 501; i++) f.addNote(`note-${i}`);
  const first = await f.call('?workspace=joined');
  const next = await f.call('?workspace=joined&offset=500');
  assert.equal(first.body.notes.length, 500);
  assert.deepEqual(next.body.notes.map(note => note.id), ['note-500']);
  assert.equal((await f.call('?workspace=joined&offset=-1')).status, 400);
});

test('the pinned, personal and shared lists hold what the reader may read there, wherever it is kept', async () => {
  const f = fixture();
  f.addFolder('ideation');
  f.addNote('mine', { scope: 'PERSONAL', authorId: 'alice' });
  f.addNote('nowhere', { scope: 'PERSONAL', authorId: 'alice', workspaceId: null });
  f.addNote('bobs-own', { scope: 'PERSONAL', authorId: 'bob', isRestricted: true });
  f.addNote('for-alice', { scope: 'SHARED', sharedWith: [{ userId: 'alice' }] });
  f.addNote('from-alice', { scope: 'SHARED', authorId: 'alice', sharedWith: [{ userId: 'bob' }] });
  f.addNote('for-carol', { scope: 'SHARED', isRestricted: true, sharedWith: [{ userId: 'carol' }] });
  f.addNote('pinned-here', { isPinned: true, folderId: 'ideation' });
  f.addNote('pinned-in-project', { isPinned: true, scope: 'PROJECT', workspaceId: null, projectId: 'project' });
  f.addNote('pinned-elsewhere', { isPinned: true, workspaceId: 'foreign' });
  f.addNote('loose');

  const ids = async view => (await f.call(`?workspace=joined&view=${view}`)).body.notes.map(note => note.id).sort();
  assert.deepEqual(await ids('personal'), ['mine', 'nowhere']);
  assert.deepEqual(await ids('shared'), ['for-alice', 'from-alice']);
  assert.deepEqual(await ids('pinned'), ['pinned-here', 'pinned-in-project']);
  // A list is one of the three, and it is a workspace's: neither a made-up one nor a stranger's answers.
  assert.equal((await f.call('?workspace=joined&view=everything')).status, 400);
  assert.equal((await f.call('?workspace=foreign&view=personal')).status, 404);
});
