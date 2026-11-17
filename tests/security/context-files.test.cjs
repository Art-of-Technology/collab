const { assert, test, load, matches } = require('./helpers.cjs');

// Files in Context folders: who may put one in, what the server decides a file is, who may read the
// bytes back, and what is left behind when an upload fails.
const CLOUD = { NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: 'demo', CLOUDINARY_API_KEY: 'key', CLOUDINARY_API_SECRET: 'secret' };

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 1, 2, 3, 4]);
const PDF = Buffer.from('%PDF-1.7\n1 0 obj\n');
const HTML = Buffer.from('<!DOCTYPE html><html><body><script>alert(1)</script></body></html>');

function fixture(userId = 'alice', environment = CLOUD) {
  const ws = [
    { id: 'joined', slug: 'joined', ownerId: 'bob', members: [
      { userId: 'alice', status: true, role: 'MEMBER' },
      { userId: 'carol', status: true, role: 'MEMBER' },
      { userId: 'dana', status: true, role: 'ADMIN' },
    ] },
    { id: 'second', slug: 'second', ownerId: 'bob', members: [{ userId: 'alice', status: true, role: 'MEMBER' }] },
    { id: 'foreign', slug: 'foreign', ownerId: 'bob', members: [] },
  ];
  const state = { writes: 0, created: 0, transactions: 0, failCreate: null, failUpload: false };
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
  const files = [];
  function addFile(id, fields = {}) {
    const row = {
      id, name: id, mimeType: 'application/octet-stream', size: 1, storageUrl: `https://res.cloudinary.test/demo/raw/authenticated/v1/collab/context/${id}`,
      folderId: 'ideation', uploadedById: 'alice', createdAt: new Date(), updatedAt: new Date(),
      deletedAt: null, deletedById: null, ...fields,
    };
    Object.defineProperty(row, 'folder', { get: () => folders.find(item => item.id === row.folderId) ?? null, enumerable: true });
    files.push(row);
    return row;
  }
  // A read gives back the fields it selected, and no others: a file's storage address is only
  // ever read where the code asks for it. A selected folder brings its membership for the caller alone.
  function projectFile(row, args) {
    if (!args?.select) return row;
    const picked = Object.fromEntries(Object.entries(args.select).filter(([, value]) => value === true)
      .map(([key]) => [key, row[key]]));
    if (!args.select.folder) return picked;
    const members = args.select.folder.select.workspace?.select?.members;
    const folder = row.folder;
    picked.folder = { id: folder.id, workspaceId: folder.workspaceId, projectId: folder.projectId,
      ...(members && { workspace: { ownerId: folder.workspace.ownerId,
        members: folder.workspace.members.filter(member => matches(member, members.where)) } }) };
    return picked;
  }

  const db = {
    $transaction: async (work) => { state.transactions++; return work(db); },
    workspace: { findFirst: async ({ where }) => ws.find(item => matches(item, where)) ?? null },
    contextFolder: { findFirst: async ({ where }) => folders.find(item => matches(item, where)) ?? null },
    contextFile: {
      findFirst: async args => { const row = files.find(item => matches(item, args.where)); return row ? projectFile(row, args) : null; },
      findMany: async args => files.filter(item => matches(item, args.where)).map(item => projectFile(item, args)),
      create: async ({ data, select }) => {
        if (state.failCreate) throw state.failCreate;
        state.writes++;
        return projectFile(addFile(`new-${++state.created}`, data), { select });
      },
      update: async ({ where, data, select }) => {
        state.writes++;
        const row = files.find(item => item.id === where.id);
        Object.assign(row, data);
        return projectFile(row, { select });
      },
    },
  };

  // Storage: the bytes, the options they went up with, and every address this server signed.
  const stored = new Map();
  const destroyed = [];
  const uploads = [];
  const signed = [];
  const cloudinary = {
    uploader: {
      upload_stream: (options, callback) => ({
        end: (buffer) => {
          if (state.failUpload) return callback(new Error('storage refused'), null);
          const publicId = `${options.folder}/asset-${stored.size + 1}`;
          uploads.push({ options, publicId });
          stored.set(publicId, Buffer.from(buffer));
          callback(null, { public_id: publicId, secure_url: `https://res.cloudinary.test/demo/raw/authenticated/v1/${publicId}` });
        },
      }),
      destroy: async (publicId, options) => { destroyed.push({ publicId, options }); stored.delete(publicId); return { result: 'ok' }; },
    },
    url: (publicId, options) => {
      signed.push({ publicId, options });
      return `https://res.cloudinary.test/demo/raw/authenticated/s--sign--/${publicId}`;
    },
  };
  const fetched = [];
  async function fakeFetch(url) {
    fetched.push(url);
    const publicId = /\/raw\/authenticated\/s--sign--\/(.+)$/.exec(url)?.[1];
    const bytes = publicId && stored.get(publicId);
    if (!bytes) return new Response(null, { status: 404 });
    return new Response(bytes, { status: 200 });
  }

  const dependencies = {
    'next/server': { NextResponse: Response },
    'next-auth': { getServerSession: async () => ({ user: { id: userId } }) },
    '@/lib/auth-options': { authOptions: {} },
    '@/lib/prisma': { prisma: db },
    '@/utils/cloudinary-server': { cloudinary },
    '@/lib/rate-limit': { withRateLimit: handler => handler, mediaUploadRateLimit: {} },
  };
  const globals = { URL, console, TextDecoder, Buffer, Response, fetch: fakeFetch, process: { env: { ...environment } } };
  const routes = new Map();
  function route(file) {
    if (!routes.has(file)) routes.set(file, load(file, dependencies, globals));
    return routes.get(file);
  }
  const call = (file, method, { id, body, raw, query = '', headers } = {}) => route(file)[method](
    new Request('https://example.test/api/context/files' + query, {
      method, ...(headers && { headers }),
      ...(raw !== undefined ? { body: raw } : body !== undefined && { body: typeof body === 'string' || body instanceof FormData ? body : JSON.stringify(body) }),
    }),
    { params: Promise.resolve({ id }) },
  );
  // A browser says how long an upload is before it sends it, so these requests do too.
  async function upload(fields, { length = true, declared } = {}) {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) {
      if (key === 'file') form.append('file', new Blob([value.bytes], { type: value.type ?? '' }), value.name);
      else form.append(key, value);
    }
    const serialized = new Request('https://example.test', { method: 'POST', body: form });
    const raw = Buffer.from(await serialized.arrayBuffer());
    const headers = { 'content-type': serialized.headers.get('content-type') };
    if (length) headers['content-length'] = String(declared ?? raw.length);
    return call(FILES, 'POST', { raw, headers });
  }
  return { ws, folders, files, state, addFolder, addFile, call, upload, stored, destroyed, uploads, signed, fetched };
}

const FILES = 'src/app/api/context/files/route.ts';
const ONE = 'src/app/api/context/files/[id]/route.ts';
const DOWNLOAD = 'src/app/api/context/files/[id]/download/route.ts';
const RESTORE = 'src/app/api/context/files/[id]/restore/route.ts';

test('a file goes into a folder its workspace reads, with the type worked out from its bytes', async () => {
  const f = fixture();
  f.addFolder('ideation');
  f.addFolder('elsewhere', { workspaceId: 'foreign' });
  f.addFolder('gone', { deletedAt: new Date(), deletedById: 'alice' });

  // The browser's word for the file is not kept: these bytes are a PNG whatever the name and type say.
  const created = await f.upload({ folderId: 'ideation', file: { bytes: PNG, name: 'notes.txt', type: 'text/plain' } });
  assert.equal(created.status, 201);
  const file = await created.json();
  assert.equal(file.mimeType, 'image/png');
  assert.equal(file.name, 'notes.txt');
  assert.equal(file.size, PNG.length);
  assert.equal(file.folderId, 'ideation');
  assert.equal(file.uploadedById, 'alice');
  // Where the bytes are is the server's business and never leaves it.
  assert.equal(file.storageUrl, undefined);
  assert.equal(f.uploads[0].options.type, 'authenticated');
  assert.equal(f.uploads[0].options.resource_type, 'raw');

  const listed = await (await f.call(FILES, 'GET', { query: '?folder=ideation' })).json();
  assert.deepEqual(listed.files.map(row => row.id), [file.id]);

  // A folder in a workspace the caller is not a member of, and a folder in Trash, hold nothing new.
  for (const folderId of ['elsewhere', 'gone', 'missing']) {
    assert.equal((await f.upload({ folderId, file: { bytes: PDF, name: 'plan.pdf' } })).status, 404, folderId);
  }
  assert.equal((await f.call(FILES, 'GET', { query: '?folder=elsewhere' })).status, 404);
  assert.equal(f.stored.size, 1);

  // A request that names no folder, carries no file, or carries an empty one is refused and stores nothing.
  assert.equal((await f.upload({ file: { bytes: PDF, name: 'plan.pdf' } })).status, 400);
  assert.equal((await f.upload({ folderId: 'ideation', name: 'plan.pdf' })).status, 400);
  assert.equal((await f.upload({ folderId: 'ideation', file: { bytes: Buffer.alloc(0), name: 'empty.txt' } })).status, 400);
  assert.equal((await f.call(FILES, 'POST', { raw: 'not a form', headers: { 'content-type': 'text/plain', 'content-length': '10' } })).status, 400);
  assert.equal(f.stored.size, 1);
});

test('a file is read back only by someone who reads its folder, and never as a page of Collab', async () => {
  const f = fixture();
  f.addFolder('ideation');
  const page = await (await f.upload({ folderId: 'ideation', file: { bytes: HTML, name: 'report.html' } })).json();
  assert.equal(page.mimeType, 'text/html');

  const download = await f.call(DOWNLOAD, 'GET', { id: page.id });
  assert.equal(download.status, 200);
  // One opaque type, no sniffing, no script, and it downloads: an uploaded page cannot run as one.
  assert.equal(download.headers.get('content-type'), 'application/octet-stream');
  assert.equal(download.headers.get('x-content-type-options'), 'nosniff');
  assert.match(download.headers.get('content-disposition'), /^attachment; filename="report\.html"/);
  assert.match(download.headers.get('content-security-policy'), /default-src 'none'/);
  assert.equal(Buffer.from(await download.arrayBuffer()).toString(), HTML.toString());
  // The address the bytes came from is signed here and used here; the caller never sees it.
  assert.equal(f.signed[0].options.sign_url, true);
  assert.equal(f.signed[0].options.type, 'authenticated');

  // A member of another workspace has no file and no bytes, however the address was come by.
  const stranger = fixture('mallory');
  stranger.addFolder('ideation');
  stranger.addFile(page.id, { folderId: 'ideation' });
  stranger.ws[0].members = [];
  assert.equal((await stranger.call(DOWNLOAD, 'GET', { id: page.id })).status, 404);
  assert.equal((await stranger.call(FILES, 'GET', { query: '?folder=ideation' })).status, 404);
  assert.equal(stranger.fetched.length, 0);
});

test('an upload that fails leaves no half file and says what went wrong', async () => {
  const f = fixture();
  f.addFolder('ideation');

  // The row is what makes the file exist: when it cannot be written, the bytes go back out.
  const { Prisma } = require('@prisma/client');
  f.state.failCreate = new Prisma.PrismaClientKnownRequestError('gone', { code: 'P2003', clientVersion: '5' });
  const refused = await f.upload({ folderId: 'ideation', file: { bytes: PDF, name: 'plan.pdf' } });
  assert.equal(refused.status, 409);
  assert.match((await refused.json()).error, /reload and retry/);
  assert.equal(f.files.length, 0);
  assert.equal(f.stored.size, 0);
  assert.equal(f.destroyed.length, 1);
  assert.equal(f.destroyed[0].options.type, 'authenticated');

  // Storage that refuses the bytes is said plainly, and writes nothing.
  f.state.failCreate = null;
  f.state.failUpload = true;
  const unstored = await f.upload({ folderId: 'ideation', file: { bytes: PDF, name: 'plan.pdf' } });
  assert.equal(unstored.status, 502);
  assert.match((await unstored.json()).error, /could not be stored/);
  assert.equal(f.files.length, 0);

  // Without storage configured, nothing is stored and the reason is not a surprise 500.
  const unconfigured = fixture('alice', {});
  unconfigured.addFolder('ideation');
  const refusedUpload = await unconfigured.upload({ folderId: 'ideation', file: { bytes: PDF, name: 'plan.pdf' } });
  assert.equal(refusedUpload.status, 503);
  assert.equal(unconfigured.files.length, 0);
});

test('a file over the stated limit is turned away before it is stored', async () => {
  const f = fixture();
  f.addFolder('ideation');
  // The limit the server states: 25 MB of bytes, whatever the request says about itself.
  const oversize = Buffer.alloc(25 * 1024 * 1024 + 1);
  oversize.set(PDF, 0);
  const refused = await f.upload({ folderId: 'ideation', file: { bytes: oversize, name: 'huge.pdf' } });
  assert.equal(refused.status, 413);
  assert.match((await refused.json()).error, /at most 25 MB/);

  // A request that understates its length is weighed again on the bytes that arrived.
  const lying = await f.upload({ folderId: 'ideation', file: { bytes: oversize, name: 'huge.pdf' } }, { declared: 100 });
  assert.equal(lying.status, 413);

  // A body that does not say how long it is is never read, so nothing unbounded is buffered.
  const silent = await f.upload({ folderId: 'ideation', file: { bytes: PDF, name: 'plan.pdf' } }, { length: false });
  assert.equal(silent.status, 411);

  assert.equal(f.stored.size, 0);
  assert.equal(f.files.length, 0);
});

test('a file is renamed, moved and sent to Trash by whoever put it there', async () => {
  const f = fixture();
  f.addFolder('ideation');
  f.addFolder('archive');
  f.addFolder('other-workspace', { workspaceId: 'second' });
  f.addFolder('foreign', { workspaceId: 'foreign' });
  const file = await (await f.upload({ folderId: 'ideation', file: { bytes: PDF, name: 'plan.pdf' } })).json();

  // A name is a name, never a path: a download is called what the folder shows.
  const renamed = await f.call(ONE, 'PATCH', { id: file.id, body: { name: '  ../../etc/passwd  ' } });
  assert.equal(renamed.status, 200);
  assert.equal((await renamed.json()).name, 'passwd');
  assert.equal((await f.call(ONE, 'PATCH', { id: file.id, body: { name: '   ' } })).status, 400);
  assert.equal((await f.call(ONE, 'PATCH', { id: file.id, body: {} })).status, 400);
  assert.equal((await f.call(ONE, 'PATCH', { id: file.id, body: { folderId: { not: '' } } })).status, 400);

  // It moves inside its own workspace, where the same people read it, and nowhere else.
  assert.equal((await f.call(ONE, 'PATCH', { id: file.id, body: { folderId: 'archive' } })).status, 200);
  assert.equal(f.files[0].folderId, 'archive');
  assert.equal((await f.call(ONE, 'PATCH', { id: file.id, body: { folderId: 'other-workspace' } })).status, 400);
  assert.equal((await f.call(ONE, 'PATCH', { id: file.id, body: { folderId: 'foreign' } })).status, 404);
  assert.equal(f.files[0].folderId, 'archive');

  // Another member of the workspace is not the one who uploaded it; an administrator is trusted with it.
  const other = fixture('carol');
  other.addFolder('ideation');
  const theirs = other.addFile('theirs', { uploadedById: 'alice' });
  assert.equal((await other.call(ONE, 'PATCH', { id: theirs.id, body: { name: 'mine.pdf' } })).status, 403);
  assert.equal((await other.call(ONE, 'DELETE', { id: theirs.id })).status, 403);
  assert.equal(theirs.name, 'theirs');
  const admin = fixture('dana');
  admin.addFolder('ideation');
  const managed = admin.addFile('managed', { uploadedById: 'alice' });
  assert.equal((await admin.call(ONE, 'PATCH', { id: managed.id, body: { name: 'tidied.pdf' } })).status, 200);
});

test('a file in Trash is out of the folder until it is restored, and so is one whose folder went', async () => {
  const f = fixture();
  f.addFolder('ideation');
  const file = await (await f.upload({ folderId: 'ideation', file: { bytes: PDF, name: 'plan.pdf' } })).json();

  assert.equal((await f.call(ONE, 'DELETE', { id: file.id })).status, 200);
  assert.notEqual(f.files[0].deletedAt, null);
  assert.deepEqual((await (await f.call(FILES, 'GET', { query: '?folder=ideation' })).json()).files, []);
  assert.equal((await f.call(DOWNLOAD, 'GET', { id: file.id })).status, 404);
  const trash = await (await f.call(FILES, 'GET', { query: '?folder=ideation&trashed=true' })).json();
  assert.deepEqual(trash.files.map(row => row.id), [file.id]);

  assert.equal((await f.call(RESTORE, 'POST', { id: file.id })).status, 200);
  assert.equal(f.files[0].deletedAt, null);
  assert.equal((await f.call(DOWNLOAD, 'GET', { id: file.id })).status, 200);

  // A folder in Trash took its files in with it: they are not listed, read, changed or restored alone.
  f.folders[0].deletedAt = new Date();
  assert.equal((await f.call(DOWNLOAD, 'GET', { id: file.id })).status, 404);
  assert.equal((await f.call(ONE, 'PATCH', { id: file.id, body: { name: 'other.pdf' } })).status, 404);
  assert.equal((await f.call(ONE, 'DELETE', { id: file.id })).status, 404);
  assert.equal((await f.call(RESTORE, 'POST', { id: file.id })).status, 404);
  assert.equal((await f.call(FILES, 'GET', { query: '?folder=ideation' })).status, 404);
});

test('what a file is comes from its content, not from its name', async () => {
  const { detectFileType, UNKNOWN_FILE_TYPE } = load('src/lib/context-file-type.ts', {}, { TextDecoder });
  const zip = (...entries) => Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from(entries.join(' '))]);
  const openDocument = Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(14), Buffer.from([39, 0, 0, 0]), Buffer.alloc(4),
    Buffer.from([8, 0]), Buffer.alloc(2), Buffer.from('mimetype'), Buffer.from('application/vnd.oasis.opendocument.text'),
  ]);

  const cases = [
    [PNG, 'image/png'],
    [PDF, 'application/pdf'],
    [HTML, 'text/html'],
    [Buffer.from('A note that mentions %PDF-1.7 well after its first bytes'), 'text/plain'],
    [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), 'image/svg+xml'],
    [Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16]), 'image/jpeg'],
    [Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')]), 'image/webp'],
    [Buffer.concat([Buffer.alloc(4), Buffer.from('ftypisom')]), 'video/mp4'],
    [zip('[Content_Types].xml', 'word/document.xml'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    [zip('[Content_Types].xml', 'xl/workbook.xml'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    [zip('photos.jpg'), 'application/zip'],
    [openDocument, 'application/vnd.oasis.opendocument.text'],
    [Buffer.from([0x00, 0x01, 0x02, 0x7f, 0xfe]), UNKNOWN_FILE_TYPE],
    [Buffer.from('name,count\nidea,2\n'), 'text/plain'],
    [Buffer.from('é'.repeat(3000)), 'text/plain'],
  ];
  for (const [bytes, expected] of cases) {
    assert.equal(detectFileType(new Uint8Array(bytes)), expected, bytes.subarray(0, 12).toString('hex'));
  }
});
