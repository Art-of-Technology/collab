const { assert, test, load, matches } = require('./helpers.cjs');

// Context folders at workspace and project level: who reads them, where they may sit, and what
// deleting one does to the notes and files inside it.
function fixture(userId = 'alice') {
  const ws = [
    { id: 'joined', slug: 'joined', ownerId: 'bob', members: [{ userId: 'alice', status: true, role: 'MEMBER' }] },
    { id: 'foreign', slug: 'foreign', ownerId: 'bob', members: [] },
  ];
  const workspace = ws[0];
  const projects = [
    { id: 'project', workspaceId: 'joined', workspace },
    { id: 'other-workspace-project', workspaceId: 'foreign', workspace: ws[1] },
  ];
  const state = { writes: 0, created: 0, transactions: 0, authorityReads: { global: 0, transaction: 0 } };
  const platformAdmins = [];
  const folders = [];
  function addFolder(id, fields = {}) {
    const row = {
      id, name: id, workspaceId: 'joined', projectId: null, parentId: null, createdById: 'alice',
      createdAt: new Date(), updatedAt: new Date(), deletedAt: null, deletedById: null, ...fields,
    };
    Object.defineProperty(row, 'workspace', { get: () => ws.find(item => item.id === row.workspaceId) ?? null, enumerable: true });
    folders.push(row);
    return row;
  }
  // A folder read selects its workspace's membership for the caller only.
  function projectFolder(row, args) {
    const members = args?.select?.workspace?.select?.members;
    if (!members) return row;
    return { ...row, workspace: { ownerId: row.workspace.ownerId,
      members: row.workspace.members.filter(member => matches(member, members.where)) } };
  }
  const notes = [];
  function addNote(id, fields = {}) {
    const row = {
      id, title: id, content: id, authorId: 'alice', type: 'GENERAL', scope: 'WORKSPACE', workspaceId: 'joined',
      workspace, projectId: null, project: null, folderId: null, folder: null, isRestricted: false, isEncrypted: false,
      expiresAt: null, sharedWith: [], tags: [], comments: [], isPinned: false, isAiContext: false,
      aiContextPriority: 0, versioningEnabled: false, version: 1, createdAt: new Date(), updatedAt: new Date(),
    };
    Object.defineProperty(row, 'folder', { get: () => folders.find(item => item.id === row.folderId) ?? null, enumerable: true });
    Object.assign(row, fields);
    notes.push(row);
    return row;
  }
  const files = [];
  const findWorkspace = async ({ where }) => ws.find(item => item.id === where.id) ?? null;
  const findUser = async ({ where, select }) => ({ id: where.id, role: platformAdmins.includes(where.id) ? 'SYSTEM_ADMIN' : 'USER',
    workspaceMemberships: ws.flatMap(item => item.members.map(member => ({ ...member, workspaceId: item.id })))
      .filter(member => member.userId === where.id && matches(member, select?.workspaceMemberships?.where ?? {})) });
  // The authority's reads, counted per client: the global one, or the transaction's own.
  const authorityRead = (client, read) => args => { state.authorityReads[client]++; return read(args); };
  const db = {
    // Every rule that reads the tree before writing to it does both in one transaction.
    $transaction: async (work) => { state.transactions++; return work(transaction); },
    workspace: {
      findFirst: async ({ where }) => ws.find(item => matches(item, where)) ?? null,
      findUnique: authorityRead('global', findWorkspace),
    },
    // The authority module reads the caller's platform role and active memberships.
    user: { findUnique: authorityRead('global', findUser) },
    project: {
      findFirst: async ({ where }) => projects.find(item => matches(item, where)) ?? null,
      findUnique: async ({ where }) => projects.find(item => matches(item, where)) ?? null,
    },
    contextFolder: {
      findFirst: async args => { const row = folders.find(item => matches(item, args.where)); return row ? projectFolder(row, args) : null; },
      findMany: async args => folders.filter(item => matches(item, args.where)).map(item => projectFolder(item, args)),
      create: async ({ data }) => { state.writes++; return addFolder(`new-${++state.created}`, data); },
      update: async ({ where, data }) => { state.writes++; const row = folders.find(item => item.id === where.id); Object.assign(row, data); return row; },
      updateMany: async ({ where, data }) => {
        const rows = folders.filter(item => matches(item, where));
        for (const row of rows) Object.assign(row, data);
        state.writes += rows.length;
        return { count: rows.length };
      },
    },
    contextFile: { count: async ({ where }) => files.filter(item => matches(item, where)).length },
    note: {
      count: async ({ where }) => notes.filter(item => matches(item, where)).length,
      findMany: async args => notes.filter(item => matches(item, args.where)),
      findFirst: async args => notes.find(item => matches(item, args.where)) ?? null,
      findUnique: async ({ where }) => notes.find(item => item.id === where.id) ?? null,
      create: async ({ data }) => { state.writes++; return addNote(`note-${++state.created}`, data); },
      update: async ({ where, data }) => {
        state.writes++;
        const row = notes.find(item => item.id === where.id);
        const { folder, tags, project, ...scalars } = data;
        Object.assign(row, scalars);
        if (folder) row.folderId = folder.connect ? folder.connect.id : null;
        if (project) row.projectId = project.connect ? project.connect.id : null;
        return row;
      },
    },
  };
  // The transaction's own client: the same rows as the global one.
  const transaction = Object.assign(Object.create(db), {
    workspace: { ...db.workspace, findUnique: authorityRead('transaction', findWorkspace) },
    user: { findUnique: authorityRead('transaction', findUser) },
  });
  const dependencies = {
    'next/server': { NextResponse: Response },
    'next-auth': { getServerSession: async () => ({ user: { id: userId } }) },
    '@/lib/auth-options': { authOptions: {} },
    '@/lib/prisma': { prisma: db },
    '@/lib/secrets/crypto': { isSecretNoteType: () => false, isSecretsEnabled: () => true },
    '@/lib/versioning': { createInitialVersion: async () => {}, createVersion: async () => {},
      hasSignificantChange: () => false, detectChangeType: () => 'EDIT' },
    '@/lib/event-bus': { emitContextCreated: async () => {}, emitContextUpdated: async () => {}, emitContextDeleted: async () => {} },
  };
  const routes = new Map();
  function route(file) {
    if (!routes.has(file)) routes.set(file, load(file, dependencies, { URL, console }));
    return routes.get(file);
  }
  const call = (file, method, { id, body, raw, query = '' } = {}) => route(file)[method](
    new Request('https://example.test/api/context/folders' + query, {
      method, ...(raw !== undefined ? { body: raw } : body !== undefined && { body: JSON.stringify(body) }),
    }),
    { params: Promise.resolve({ id }) },
  );
  return { ws, projects, folders, notes, files, state, platformAdmins, addFolder, addNote, call };
}

const LIST = 'src/app/api/context/folders/route.ts';
const ONE = 'src/app/api/context/folders/[id]/route.ts';
const RESTORE = 'src/app/api/context/folders/[id]/restore/route.ts';

test('a folder belongs to one workspace or one of its projects, and only its members reach it', async () => {
  const f = fixture();
  const workspaceFolder = f.addFolder('ideation');
  const projectFolder = f.addFolder('project-ideation', { projectId: 'project' });
  f.addFolder('elsewhere', { workspaceId: 'foreign' });

  // Each level lists its own folders, never the other's and never another workspace's.
  const listed = await (await f.call(LIST, 'GET', { query: '?workspace=joined' })).json();
  assert.deepEqual(listed.folders.map(row => row.id), [workspaceFolder.id]);
  const inProject = await (await f.call(LIST, 'GET', { query: '?workspace=joined&project=project' })).json();
  assert.deepEqual(inProject.folders.map(row => row.id), [projectFolder.id]);

  // A workspace the caller is not a member of, and a project in another workspace, are not found.
  assert.equal((await f.call(LIST, 'GET', { query: '?workspace=foreign' })).status, 404);
  assert.equal((await f.call(LIST, 'GET', { query: '?workspace=joined&project=other-workspace-project' })).status, 404);
  assert.equal((await f.call(LIST, 'POST', { body: { workspaceId: 'foreign', name: 'New' } })).status, 404);
  assert.equal((await f.call(LIST, 'POST', { body: { workspaceId: 'joined', projectId: 'other-workspace-project', name: 'New' } })).status, 404);
  assert.equal(f.state.writes, 0);

  // A folder is created at a level, inside a folder of that same level only.
  const created = await (await f.call(LIST, 'POST', { body: { workspaceId: 'joined', name: '  Ideation  ', parentId: workspaceFolder.id } })).json();
  assert.equal(created.name, 'Ideation');
  assert.equal(created.parentId, workspaceFolder.id);
  assert.equal(created.projectId, null);
  const crossLevel = await f.call(LIST, 'POST', { body: { workspaceId: 'joined', projectId: 'project', name: 'Nested', parentId: workspaceFolder.id } });
  assert.equal(crossLevel.status, 404);
  for (const name of ['', '   ', 'a/b', 'x'.repeat(121)]) {
    assert.equal((await f.call(LIST, 'POST', { body: { workspaceId: 'joined', name } })).status, 400);
  }
});

test('a malformed body and an id that is not a string are refused before the database', async () => {
  const f = fixture();
  const root = f.addFolder('root');
  const writes = f.state.writes;
  // An object would otherwise reach Prisma as a query operator.
  for (const body of [
    { workspaceId: { not: '' }, name: 'New' },
    { workspaceId: 'joined', projectId: { not: '' }, name: 'New' },
    { workspaceId: 'joined', parentId: { not: '' }, name: 'New' },
    { workspaceId: 'joined', name: { toString: 'New' } },
  ]) {
    assert.equal((await f.call(LIST, 'POST', { body })).status, 400, JSON.stringify(body));
  }
  for (const raw of ['not json', 'null', '[]', '"text"']) {
    assert.equal((await f.call(LIST, 'POST', { raw })).status, 400, raw);
    assert.equal((await f.call(ONE, 'PATCH', { id: root.id, raw })).status, 400, raw);
  }
  assert.equal((await f.call(ONE, 'PATCH', { id: root.id, body: { parentId: { not: '' } } })).status, 400);
  assert.equal((await f.call(ONE, 'PATCH', { id: root.id, body: {} })).status, 400);
  assert.equal(f.state.writes, writes);
});

test('a folder is renamed and moved, but never into itself or into one of its own folders', async () => {
  const f = fixture();
  const root = f.addFolder('root');
  const child = f.addFolder('child', { parentId: 'root' });
  const grandchild = f.addFolder('grandchild', { parentId: 'child' });
  const sibling = f.addFolder('sibling');

  const renamed = await f.call(ONE, 'PATCH', { id: root.id, body: { name: 'Ideation' } });
  assert.equal(renamed.status, 200);
  assert.equal(root.name, 'Ideation');

  assert.equal((await f.call(ONE, 'PATCH', { id: root.id, body: { parentId: root.id } })).status, 400);
  assert.equal((await f.call(ONE, 'PATCH', { id: root.id, body: { parentId: grandchild.id } })).status, 400);
  assert.equal(root.parentId, null);

  const moved = await f.call(ONE, 'PATCH', { id: grandchild.id, body: { parentId: sibling.id } });
  assert.equal(moved.status, 200);
  assert.equal(grandchild.parentId, sibling.id);
  const out = await f.call(ONE, 'PATCH', { id: child.id, body: { parentId: null } });
  assert.equal(out.status, 200);
  assert.equal(child.parentId, null);

  // Only the folder's author or a workspace administrator changes it.
  const stranger = fixture('bob');
  const theirs = stranger.addFolder('theirs', { createdById: 'carol' });
  stranger.ws[0].members.push({ userId: 'bob', status: true, role: 'MEMBER' });
  stranger.ws[0].ownerId = 'dave';
  assert.equal((await stranger.call(ONE, 'PATCH', { id: theirs.id, body: { name: 'Mine' } })).status, 403);
  assert.equal(theirs.name, 'theirs');
});

test('a folder or file of someone else is changed by an Admin and above, and by nobody below', async () => {
  // olivia is the workspace's primary owner; carol wrote the folder.
  const join = (user, role, { status = true, platformAdmin = false } = {}) => {
    const f = fixture(user);
    f.ws[0].ownerId = 'olivia';
    if (role) f.ws[0].members.push({ userId: user, status, role });
    if (platformAdmin) f.platformAdmins.push(user);
    return { f, folder: f.addFolder('theirs', { createdById: 'carol' }) };
  };
  for (const [user, role] of [['adam', 'ADMIN'], ['adal', 'admin'], ['otto', 'OWNER'], ['ola', 'Owner'], ['olivia', null], ['olivia', 'MEMBER']]) {
    const { f, folder } = join(user, role);
    assert.equal((await f.call(ONE, 'PATCH', { id: folder.id, body: { name: 'Tidied' } })).status, 200, `${user} renames`);
    assert.equal(folder.name, 'Tidied', user);
    assert.equal((await f.call(ONE, 'DELETE', { id: folder.id })).status, 200, `${user} deletes`);
    assert.equal((await f.call(RESTORE, 'POST', { id: folder.id })).status, 200, `${user} restores`);
    assert.equal(folder.deletedAt, null, user);
  }
  // A non-author's level is read on the transaction's own connection, never a second one from the pool.
  const { f: reads, folder: read } = join('adam', 'ADMIN');
  assert.equal((await reads.call(ONE, 'PATCH', { id: read.id, body: { name: 'Tidied' } })).status, 200);
  assert.deepEqual(reads.state.authorityReads, { global: 0, transaction: 2 });

  // A standard role, custom ones and a platform admin's included, is refused; a switched-off Admin and a
  // platform admin who is not a member do not reach the folder at all.
  for (const [user, role, expected, options] of [['sam', 'MEMBER', 403], ['dev', 'Developer', 403],
    ['padm', 'MEMBER', 403, { platformAdmin: true }], ['off', 'ADMIN', 404, { status: false }], ['root', null, 404, { platformAdmin: true }]]) {
    const { f, folder } = join(user, role, options);
    assert.equal((await f.call(ONE, 'PATCH', { id: folder.id, body: { name: 'Mine' } })).status, expected, `${user} renames`);
    assert.equal((await f.call(ONE, 'DELETE', { id: folder.id })).status, expected, `${user} deletes`);
    Object.assign(folder, { deletedAt: new Date(), deletedById: 'carol' });
    assert.equal((await f.call(RESTORE, 'POST', { id: folder.id })).status, expected, `${user} restores`);
    assert.equal(folder.name, 'theirs', user);
    assert.equal(f.state.writes, 0, user);
  }
});

test('deleting a folder that is not empty asks first, then takes its contents to Trash and back', async () => {
  const f = fixture();
  const root = f.addFolder('root');
  const child = f.addFolder('child', { parentId: 'root' });
  const other = f.addFolder('other');
  const note = f.addNote('note', { folderId: child.id });
  f.addNote('loose');
  f.files.push({ id: 'file', folderId: root.id, deletedAt: null });

  // What a delete would take with it is readable before deleting anything.
  const preview = await (await f.call(ONE, 'GET', { id: root.id })).json();
  assert.deepEqual(preview.counts, { folders: 1, notes: 1, files: 1 });

  // Without confirmation a folder with contents is refused, and nothing moves.
  const asked = await f.call(ONE, 'DELETE', { id: root.id });
  assert.equal(asked.status, 409);
  assert.deepEqual((await asked.json()).counts, { folders: 1, notes: 1, files: 1 });
  assert.equal(root.deletedAt, null);
  assert.equal(child.deletedAt, null);

  // An empty folder goes without asking.
  assert.equal((await f.call(ONE, 'DELETE', { id: other.id })).status, 200);
  assert.notEqual(other.deletedAt, null);

  const trashed = await f.call(ONE, 'DELETE', { id: root.id, query: '?confirm=true' });
  assert.equal(trashed.status, 200);
  assert.notEqual(root.deletedAt, null);
  assert.equal(child.deletedAt?.getTime(), root.deletedAt.getTime());
  assert.equal(child.deletedById, 'alice');

  // The note went in with its folder: it keeps its folder and is out of every Context read.
  assert.equal(note.folderId, child.id);
  const visible = await (await f.call('src/app/api/notes/route.ts', 'GET', { query: '?workspace=joined' })).json();
  assert.deepEqual(visible.map(row => row.id), ['loose']);
  assert.equal((await f.call('src/app/api/notes/[id]/route.ts', 'PATCH', { id: note.id, body: { title: 'Edited' } })).status, 404);
  assert.equal(note.title, 'note');

  // The live list shows neither; Trash shows only the folder the delete started from.
  const live = await (await f.call(LIST, 'GET', { query: '?workspace=joined' })).json();
  assert.deepEqual(live.folders.map(row => row.id), []);
  const trash = await (await f.call(LIST, 'GET', { query: '?workspace=joined&trashed=true' })).json();
  assert.deepEqual(trash.folders.map(row => row.id).sort(), ['other', 'root']);

  // A folder is restored from the top down, and takes back exactly what went in with it.
  assert.equal((await f.call(RESTORE, 'POST', { id: child.id })).status, 409);
  assert.equal((await f.call(RESTORE, 'POST', { id: root.id })).status, 200);
  assert.equal(root.deletedAt, null);
  assert.equal(child.deletedAt, null);
  assert.notEqual(other.deletedAt, null);
  const restored = await (await f.call('src/app/api/notes/route.ts', 'GET', { query: '?workspace=joined' })).json();
  assert.deepEqual(restored.map(row => row.id).sort(), ['loose', 'note']);
});

test('a note goes only in a folder at its own level, and personal notes have none', async () => {
  const f = fixture();
  const workspaceFolder = f.addFolder('ideation');
  const projectFolder = f.addFolder('project-ideation', { projectId: 'project' });
  const trashedFolder = f.addFolder('gone', { deletedAt: new Date(), deletedById: 'alice' });
  const notes = 'src/app/api/notes/route.ts';

  const created = await f.call(notes, 'POST', { body: { title: 'Idea', content: 'text', scope: 'WORKSPACE', workspaceId: 'joined', folderId: workspaceFolder.id } });
  assert.equal(created.status, 201);
  assert.equal((await created.json()).folderId, workspaceFolder.id);

  for (const [body, status] of [
    [{ scope: 'WORKSPACE', workspaceId: 'joined', folderId: projectFolder.id }, 400],
    [{ scope: 'PROJECT', workspaceId: 'joined', projectId: 'project', folderId: workspaceFolder.id }, 400],
    [{ scope: 'PERSONAL', workspaceId: 'joined', folderId: workspaceFolder.id }, 400],
    [{ scope: 'WORKSPACE', workspaceId: 'joined', folderId: trashedFolder.id }, 404],
    [{ scope: 'WORKSPACE', workspaceId: 'joined', folderId: 'no-such-folder' }, 404],
  ]) {
    const response = await f.call(notes, 'POST', { body: { title: 'Idea', content: 'text', ...body } });
    assert.equal(response.status, status, JSON.stringify(body));
  }

  // The project note belongs in the project's folder, and moves back out of every folder.
  const projectNote = f.addNote('project-note', { scope: 'PROJECT', projectId: 'project', project: f.projects[0] });
  const one = 'src/app/api/notes/[id]/route.ts';
  assert.equal((await f.call(one, 'PATCH', { id: projectNote.id, body: { folderId: workspaceFolder.id } })).status, 400);
  assert.equal((await f.call(one, 'PATCH', { id: projectNote.id, body: { folderId: projectFolder.id } })).status, 200);
  assert.equal(projectNote.folderId, projectFolder.id);
  assert.equal((await f.call(one, 'PATCH', { id: projectNote.id, body: { folderId: null } })).status, 200);
  assert.equal(projectNote.folderId, null);
});

test('a note in a folder cannot be carried to another level without its folder', async () => {
  const f = fixture();
  const workspaceFolder = f.addFolder('ideation');
  const projectFolder = f.addFolder('project-ideation', { projectId: 'project' });
  const note = f.addNote('note', { folderId: workspaceFolder.id });
  const one = 'src/app/api/notes/[id]/route.ts';

  // Changing the scope or the project is refused while the note sits in a folder of the old level.
  for (const body of [{ projectId: 'project', scope: 'PROJECT' }, { scope: 'PERSONAL' }]) {
    const response = await f.call(one, 'PATCH', { id: note.id, body });
    assert.equal(response.status, 400, JSON.stringify(body));
    assert.equal(note.folderId, workspaceFolder.id);
    assert.equal(note.scope, 'WORKSPACE');
  }

  // Naming the folder of the new level in the same edit moves both together.
  const moved = await f.call(one, 'PATCH', { id: note.id, body: { scope: 'PROJECT', projectId: 'project', folderId: projectFolder.id } });
  assert.equal(moved.status, 200);
  assert.equal(note.folderId, projectFolder.id);
  assert.equal(note.projectId, 'project');

  // A note outside every folder changes level as it always did.
  const loose = f.addNote('loose');
  assert.equal((await f.call(one, 'PATCH', { id: loose.id, body: { scope: 'PERSONAL' } })).status, 200);
  assert.equal(loose.scope, 'PERSONAL');
});
