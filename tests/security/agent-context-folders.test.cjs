const { assert, test, load, matches } = require('./helpers.cjs');
const zlib = require('node:zlib');

// What an agent's token may read of Context: the folders of its workspace and of one project, what
// is in one folder, and the text of a file. A token reads what its own account reads and nothing
// else, Notes keep the rules they have everywhere, and only text, CSV and PDF files give up text.
const CLOUD = { NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: 'demo', CLOUDINARY_API_KEY: 'key', CLOUDINARY_API_SECRET: 'secret' };
const SCOPES = ['context:read', 'issues:read', 'prompts:read'];

/** A PDF of one page, written here so the reader is exercised on a file and not on a fixture of itself. */
function pdf(lines, { compress = false } = {}) {
  const content = `BT /F1 12 Tf 72 720 Td ${lines.map(line => `(${line}) Tj 0 -14 Td`).join(' ')} ET`;
  const body = compress ? zlib.deflateSync(Buffer.from(content, 'latin1')) : Buffer.from(content, 'latin1');
  const parts = [Buffer.from('%PDF-1.4\n', 'latin1')];
  const object = (number, dict, stream) => parts.push(stream
    ? Buffer.concat([Buffer.from(`${number} 0 obj\n${dict}\nstream\n`, 'latin1'), stream, Buffer.from('\nendstream\nendobj\n', 'latin1')])
    : Buffer.from(`${number} 0 obj\n${dict}\nendobj\n`, 'latin1'));
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  object(3, '<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>');
  object(4, `<< /Length ${body.length}${compress ? ' /Filter /FlateDecode' : ''} >>`, body);
  object(5, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  parts.push(Buffer.from('trailer\n<< /Root 1 0 R >>\n%%EOF\n', 'latin1'));
  return Buffer.concat(parts);
}

function fixture({ userId = 'alice', scopes = SCOPES } = {}) {
  const client = require('@prisma/client');
  const workspace = { id: 'joined', name: 'Joined', slug: 'joined', ownerId: 'bob',
    members: [{ userId: 'alice', status: true, role: 'MEMBER' }] };
  const other = { id: 'other', name: 'Other', slug: 'other', ownerId: 'bob', members: [] };
  const workspaces = [workspace, other];
  const project = { id: 'project', name: 'Project', slug: 'project', workspaceId: 'joined', workspace };
  const state = { fetched: [] };
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
    const row = { id, title: id, content: `payload ${id}`, type: 'GUIDE', scope: 'WORKSPACE', folderId: 'ideation',
      workspaceId: 'joined', projectId: null, authorId: 'bob', isRestricted: false, isEncrypted: false,
      expiresAt: null, sharedWith: [], updatedAt: now, ...fields };
    Object.defineProperty(row, 'workspace', { get: () => workspaces.find(item => item.id === row.workspaceId) ?? null, enumerable: true });
    Object.defineProperty(row, 'folder', { get: () => folders.find(item => item.id === row.folderId) ?? null, enumerable: true });
    Object.defineProperty(row, 'project', { get: () => (row.projectId === project.id ? project : null), enumerable: true });
    notes.push(row);
    return row;
  }
  const files = [];
  const stored = new Map();
  function addFile(id, { bytes = Buffer.from(''), mimeType = 'text/plain', size, ...fields } = {}) {
    const publicId = `collab/context/${id}`;
    stored.set(publicId, Buffer.from(bytes));
    const row = { id, name: id, mimeType, size: size ?? bytes.length, folderId: 'ideation', uploadedById: 'alice',
      storageUrl: `https://res.cloudinary.test/demo/raw/authenticated/v1/${publicId}`,
      createdAt: now, updatedAt: now, deletedAt: null, deletedById: null, ...fields };
    Object.defineProperty(row, 'folder', { get: () => folders.find(item => item.id === row.folderId) ?? null, enumerable: true });
    files.push(row);
    return row;
  }

  /** A read gives back the fields it selected and no others, members filtered to the caller alone. */
  function project_(row, select) {
    if (!row || !select) return row;
    return Object.fromEntries(Object.entries(select).map(([key, value]) => {
      if (value === true) return [key, row[key]];
      const nested = row[key];
      if (Array.isArray(nested)) return [key, nested.filter(item => !value.where || matches(item, value.where)).map(item => project_(item, value.select))];
      return [key, project_(nested, value.select)];
    }));
  }
  const read = rows => async ({ where, select, orderBy = [], take }) => rows
    .filter(row => matches(row, where))
    .sort((first, second) => {
      for (const rule of [].concat(orderBy)) {
        for (const [key, direction] of Object.entries(rule)) {
          if (first[key] < second[key]) return direction === 'asc' ? -1 : 1;
          if (first[key] > second[key]) return direction === 'asc' ? 1 : -1;
        }
      }
      return 0;
    })
    .slice(0, take)
    .map(row => project_(row, select));
  const db = {
    workspace: { findFirst: async ({ where, select }) => {
      const found = workspaces.find(item => matches(item, where));
      return found ? project_(found, select) ?? found : null;
    } },
    user: { findUnique: async () => ({ id: userId, email: null, name: 'Reader' }) },
    appToken: { findMany: async () => [{ accessToken: 'Y2lwaGVy', userId, scopes, tokenExpiresAt: null,
      installation: { id: 'installation', appId: 'app', status: 'ACTIVE', workspaceId: 'joined', installedById: 'bob',
        scopes, workspace, app: { id: 'app', name: 'App', slug: 'app', status: 'PUBLISHED', scopes: scopes.map(scope => ({ scope })) } } }] },
    project: { findFirst: async ({ where }) => (matches(project, where) ? project : null) },
    contextFolder: { findFirst: async ({ where, select }) => {
      const found = folders.find(item => matches(item, where));
      return found ? project_(found, select) : null;
    }, findMany: read(folders) },
    note: { findMany: read(notes) },
    contextFile: {
      findFirst: async ({ where, select }) => {
        const found = files.find(item => matches(item, where));
        return found ? project_(found, select) : null;
      },
      findMany: read(files),
    },
  };

  const cloudinary = {
    url: publicId => `https://res.cloudinary.test/demo/raw/authenticated/s--sign--/${publicId}`,
    uploader: { destroy: async () => ({ result: 'ok' }) },
  };
  async function fakeFetch(url) {
    state.fetched.push(url);
    const bytes = stored.get(/\/s--sign--\/(.+)$/.exec(url)?.[1]);
    return bytes ? new Response(bytes, { status: 200 }) : new Response(null, { status: 404 });
  }

  const globals = { URL, console, TextDecoder, Buffer, Response, Request, fetch: fakeFetch, process: { env: { ...CLOUD } } };
  const finder = load('src/lib/issue-finder.ts', { '@/lib/prisma': { prisma: db },
    '@/lib/shared-issue-key-utils': load('src/lib/shared-issue-key-utils.ts') });
  const scopesModule = load('src/lib/oauth-scopes.ts');
  const access = load('src/lib/secrets/access.ts', { '@/lib/prisma': { prisma: db }, '@prisma/client': client, '@/lib/issue-finder': finder });
  const auth = load('src/lib/apps/auth-middleware.ts', { 'next/server': { NextResponse: Response }, '@/lib/prisma': { prisma: db },
    '@/lib/oauth-scopes': scopesModule, '@/lib/apps/crypto': { getEncryptionKey: () => 'fixture-key', decryptToken: async () => 'test-token' } },
  { URL, Buffer, console });
  const dependencies = {
    'next/server': { NextResponse: Response }, '@prisma/client': client, '@/lib/prisma': { prisma: db },
    '@/lib/issue-finder': finder, '@/lib/secrets/access': access, '@/lib/apps/auth-middleware': auth,
    '@/lib/html-sanitizer': load('src/lib/html-sanitizer.ts'), '@/utils/cloudinary-server': { cloudinary },
    '@/lib/pdf-text': load('src/lib/pdf-text.ts', { unpdf: require('unpdf') }, { Buffer, Uint8Array, TextDecoder, console }),
  };
  dependencies['@/lib/agent-context-folders'] = load('src/lib/agent-context-folders.ts', dependencies, globals);
  const routes = new Map();
  async function call(file, { id, query = '', token = true } = {}) {
    if (!routes.has(file)) routes.set(file, load(`src/app/api/apps/auth/${file}/route.ts`, dependencies, globals));
    const request = new Request(`https://example.test/api/apps/auth/${file}${query}`, {
      headers: token ? { authorization: 'Bearer test-token' } : {},
    });
    const response = await routes.get(file).GET(request, { params: Promise.resolve({ id }) });
    return { status: response.status, body: await response.json(), headers: response.headers };
  }
  return { addFolder, addNote, addFile, call, state, folders, notes, files, workspace, workspaces, project };
}

const FOLDERS = 'context/folders';
const FOLDER = 'context/folders/[id]';
const FILE = 'context/files/[id]';

test('an agent lists the folders of its workspace and its project, and reads what is in one', async () => {
  const f = fixture();
  f.addFolder('ideation');
  f.addFolder('sketches', { parentId: 'ideation' });
  f.addFolder('specs', { projectId: 'project' });
  f.addFolder('binned', { deletedAt: new Date() });
  f.addFolder('elsewhere', { workspaceId: 'other' });
  f.addNote('plan');
  f.addNote('private', { scope: 'PERSONAL', authorId: 'alice' });
  f.addNote('sealed', { isEncrypted: true });
  f.addNote('keys', { type: 'API_KEYS' });
  f.addNote('locked', { isRestricted: true });
  f.addNote('expired', { expiresAt: new Date('2020-01-01T00:00:00Z') });
  f.addFile('plan.pdf', { mimeType: 'application/pdf', bytes: pdf(['Plan']) });
  f.addFile('photo.png', { mimeType: 'image/png', bytes: Buffer.from([1, 2, 3]) });

  // Without a project, the workspace's own folders; with one, that project's as well.
  const workspaceLevel = await f.call(FOLDERS);
  assert.equal(workspaceLevel.status, 200);
  assert.deepEqual(workspaceLevel.body.folders.map(row => row.path), ['ideation', 'ideation/sketches']);
  assert.equal(workspaceLevel.body.folders[1].level, 'WORKSPACE');
  assert.equal(workspaceLevel.body.hasMore, false);
  const withProject = await f.call(FOLDERS, { query: '?projectId=project' });
  assert.deepEqual(withProject.body.folders.map(row => row.id), ['ideation', 'sketches', 'specs']);
  assert.equal(withProject.body.folders.find(row => row.id === 'specs').level, 'PROJECT');
  // Trash and another workspace's folders are in neither list.
  assert.ok(!withProject.body.folders.some(row => ['binned', 'elsewhere'].includes(row.id)));

  const folder = await f.call(FOLDER, { id: 'ideation' });
  assert.equal(folder.status, 200);
  assert.equal(folder.body.folder.path, 'ideation');
  // Everything in the folder, each with what it is, where it is read and when it changed.
  assert.deepEqual(folder.body.items.map(item => [item.type, item.id]), [
    ['folder', 'sketches'], ['note', 'plan'], ['file', 'photo.png'], ['file', 'plan.pdf'],
  ]);
  assert.ok(folder.body.items.every(item => item.name && item.updatedAt));
  assert.equal(folder.body.items.find(item => item.id === 'plan').url, '/joined/notes/plan');
  assert.equal(folder.body.items.find(item => item.id === 'plan.pdf').url, '/api/context/files/plan.pdf/download');
  assert.equal(folder.body.items.find(item => item.id === 'plan.pdf').readable, true);
  assert.equal(folder.body.items.find(item => item.id === 'photo.png').readable, false);
  // A personal, encrypted, restricted, expired or secret Note is no more readable in a folder than out of one.
  assert.ok(!folder.body.items.some(item => ['private', 'sealed', 'keys', 'locked', 'expired'].includes(item.id)));

  // A folder of another workspace, one in Trash, and one that does not exist are all simply not found.
  for (const id of ['elsewhere', 'binned', 'missing']) {
    assert.equal((await f.call(FOLDER, { id })).status, 404, id);
  }
});

test('an agent reads the text of a text, CSV and PDF file, and is told what every other kind is', async () => {
  const f = fixture();
  f.addFolder('ideation');
  f.addFile('notes.txt', { mimeType: 'text/plain', bytes: Buffer.from('Ideation notes\nSecond line') });
  f.addFile('rows.csv', { mimeType: 'text/csv', bytes: Buffer.from('name,size\nplan,2\n') });
  f.addFile('plan.pdf', { mimeType: 'application/pdf', bytes: pdf(['Context as a drive', 'Folders, notes and files'], { compress: true }) });
  f.addFile('photo.png', { mimeType: 'image/png', bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47]) });
  f.addFile('huge.pdf', { mimeType: 'application/pdf', bytes: pdf(['Too long']), size: 9 * 1024 * 1024 });
  f.addFile('scan.pdf', { mimeType: 'application/pdf', bytes: Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n') });

  const text = await f.call(FILE, { id: 'notes.txt' });
  assert.equal(text.status, 200);
  assert.equal(text.body.kind, 'text');
  assert.equal(text.body.text, 'Ideation notes\nSecond line');
  assert.equal(text.body.truncated, false);
  // The reply states the sizes that are read, and is never kept by a cache on the way back.
  assert.equal(text.body.limits.textBytes, 256 * 1024);
  assert.equal(text.headers.get('cache-control'), 'private, no-store');

  const csv = await f.call(FILE, { id: 'rows.csv' });
  assert.equal(csv.body.kind, 'csv');
  assert.equal(csv.body.text, 'name,size\nplan,2\n');

  // A PDF gives up what it says, whether its page is compressed or not.
  const document = await f.call(FILE, { id: 'plan.pdf' });
  assert.equal(document.body.kind, 'pdf');
  assert.equal(document.body.text, 'Context as a drive\nFolders, notes and files');

  // Every other kind is named with its type and size, and its bytes are never fetched for it.
  const before = f.state.fetched.length;
  const image = await f.call(FILE, { id: 'photo.png' });
  assert.equal(image.status, 200);
  assert.equal(image.body.text, null);
  assert.equal(image.body.mimeType, 'image/png');
  assert.equal(image.body.size, 4);
  assert.match(image.body.reason, /not read as text/);
  const oversize = await f.call(FILE, { id: 'huge.pdf' });
  assert.equal(oversize.body.text, null);
  assert.match(oversize.body.reason, /larger than the 8 MB/);
  assert.equal(f.state.fetched.length, before);

  // A PDF whose text cannot be read says so rather than inventing text.
  const scan = await f.call(FILE, { id: 'scan.pdf' });
  assert.equal(scan.body.text, null);
  assert.match(scan.body.reason, /No text could be read/);
});

test('a long text file is cut at the stated size, and says the file holds more', async () => {
  const f = fixture();
  f.addFolder('ideation');
  const long = Buffer.from('x'.repeat(256 * 1024 + 500));
  f.addFile('long.txt', { mimeType: 'text/plain', bytes: long });
  const read = await f.call(FILE, { id: 'long.txt' });
  assert.equal(read.body.text.length, 256 * 1024);
  assert.equal(read.body.truncated, true);
  assert.equal(read.body.size, long.length);
});

test('an agent reads only its own workspace, and only with the scope that allows it', async () => {
  const outside = fixture();
  outside.addFolder('ideation', { workspaceId: 'other' });
  outside.addFile('secret.txt', { mimeType: 'text/plain', bytes: Buffer.from('not yours') });
  // The file is in a folder of another workspace: it is not found, and its bytes are never fetched.
  const refused = await outside.call(FILE, { id: 'secret.txt' });
  assert.equal(refused.status, 404);
  assert.equal(refused.body.error, 'not_found');
  assert.equal(outside.state.fetched.length, 0);

  const unscoped = fixture({ scopes: ['issues:read'] });
  unscoped.addFolder('ideation');
  unscoped.addFile('notes.txt', { mimeType: 'text/plain', bytes: Buffer.from('Ideation notes') });
  for (const [file, params] of [[FOLDERS, {}], [FOLDER, { id: 'ideation' }], [FILE, { id: 'notes.txt' }]]) {
    assert.equal((await unscoped.call(file, params)).status, 403, file);
  }
  assert.equal(unscoped.state.fetched.length, 0);
  // No token at all reads nothing either.
  assert.equal((await unscoped.call(FOLDERS, { token: false })).status, 401);
});

test('folder children are read even beyond the workspace folder summary limit', async () => {
  const f = fixture();
  f.addFolder('ideation');
  for (let index = 0; index < 510; index++) f.addFolder(`a-${index}`);
  f.addFolder('z-child', { parentId: 'ideation' });
  const result = await f.call(FOLDER, { id: 'ideation' });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.items.map(item => item.id), ['z-child']);
});

test('revoked membership and deleted files or folders cannot be read', async () => {
  const f = fixture();
  f.addFolder('ideation');
  f.addFile('gone.txt', { deletedAt: new Date(), bytes: Buffer.from('gone') });
  assert.equal((await f.call(FILE, { id: 'gone.txt' })).status, 404);
  f.addFile('live.txt', { bytes: Buffer.from('live') });
  f.folders[0].deletedAt = new Date();
  assert.equal((await f.call(FILE, { id: 'live.txt' })).status, 404);
  f.workspace.members[0].status = false;
  for (const path of [FOLDERS, FOLDER, FILE]) {
    assert.equal((await f.call(path, { id: 'ideation' })).status, 403);
  }
  assert.equal(f.state.fetched.length, 0);
});
