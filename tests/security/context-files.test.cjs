const { assert, test, load, matches } = require('./helpers.cjs');

// Files in Context folders: who may put one in, what the server decides a file is, who may read the
// bytes back, and what is left behind when an upload fails.
const STORE = { FILE_STORAGE_ENDPOINT: 'https://s3.test', FILE_STORAGE_BUCKET: 'collab', FILE_STORAGE_ACCESS_KEY: 'key', FILE_STORAGE_SECRET_KEY: 'secret' };

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 1, 2, 3, 4]);
const PDF = Buffer.from('%PDF-1.7\n1 0 obj\n');
const HTML = Buffer.from('<!DOCTYPE html><html><body><script>alert(1)</script></body></html>');

function fixture(userId = 'alice', environment = STORE, logger = console) {
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
  const files = [];
  function addFile(id, fields = {}) {
    const row = {
      id, name: id, mimeType: 'application/octet-stream', size: 1, storageUrl: 'storage:context/00000000-0000-4000-8000-000000000000',
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

  const transaction = {
    workspace: {
      findUnique: async ({ where }) => ws.find(item => item.id === where.id) ?? null,
    },
    // The authority module reads the caller's platform role and active memberships.
    user: { findUnique: async ({ where, select }) => ({ id: where.id, role: platformAdmins.includes(where.id) ? 'SYSTEM_ADMIN' : 'USER',
      workspaceMemberships: ws.flatMap(item => item.members.map(member => ({ ...member, workspaceId: item.id })))
        .filter(member => member.userId === where.id && matches(member, select?.workspaceMemberships?.where ?? {})) }) },
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
  const db = {
    contextFolder: transaction.contextFolder,
    contextFile: transaction.contextFile,
    $transaction: async (work) => { state.transactions++; return work(transaction); },
  };

  // Storage: a bucket that keeps what it is sent, and every request this server made to it.
  const stored = new Map();
  const requests = [];
  const fetched = [];
  async function fakeFetch(url, { method = 'GET', body, headers = {} } = {}) {
    const key = /^https:\/\/s3\.test\/collab\/(.+)$/.exec(String(url))?.[1];
    fetched.push(String(url));
    requests.push({ method, key, authorization: headers.authorization });
    if (!key || !/^AWS4-HMAC-SHA256 Credential=key\//.test(headers.authorization ?? '')) return new Response(null, { status: 403 });
    if (state.away > 0) { state.away -= 1; return new Response(null, { status: 503 }); }
    if (method === 'PUT') {
      if (state.failUpload) return new Response(null, { status: 403 });
      stored.set(key, Buffer.from(body));
      return new Response(null, { status: 200 });
    }
    if (method === 'DELETE') {
      if (state.failDelete) return new Response(null, { status: 403 });
      stored.delete(key); return new Response(null, { status: 204 });
    }
    const bytes = stored.get(key);
    return bytes ? new Response(bytes, { status: 200 }) : new Response(null, { status: 404 });
  }

  const dependencies = {
    'next/server': { NextResponse: Response },
    'next-auth': { getServerSession: async () => ({ user: { id: userId } }) },
    '@/lib/auth-options': { authOptions: {} },
    '@/lib/prisma': { prisma: db },
    '@/lib/rate-limit': { withRateLimit: handler => handler, mediaUploadRateLimit: {} },
  };
  const globals = { URL, console: logger, TextDecoder, Buffer, Response, fetch: fakeFetch, process: { env: { ...environment } } };
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
  return { ws, folders, files, state, platformAdmins, addFolder, addFile, call, upload, stored, requests, fetched };
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
  // The bytes went into the bucket, under a name storage made up, in a request this server signed.
  assert.equal(f.requests[0].method, 'PUT');
  assert.match(f.requests[0].key, /^context\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.match(f.requests[0].authorization, /^AWS4-HMAC-SHA256 Credential=key\/\d{8}\/us-east-1\/s3\/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/);
  assert.deepEqual([...f.stored.values()], [PNG]);

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
  // The bytes came out of the bucket through this server; the caller is told nothing of where they are kept.
  assert.equal(f.requests.at(-1).method, 'GET');
  assert.equal([...download.headers].some(([, value]) => value.includes('s3.test')), false);

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
  assert.deepEqual(f.requests.map(request => request.method), ['PUT', 'DELETE']);

  // Storage that refuses the bytes is said plainly, and writes nothing.
  f.state.failCreate = null;
  f.state.failUpload = true;
  const unstored = await f.upload({ folderId: 'ideation', file: { bytes: PDF, name: 'plan.pdf' } });
  assert.equal(unstored.status, 502);
  assert.match((await unstored.json()).error, /could not be stored/);
  assert.equal(f.files.length, 0);

  // A store that is away for a moment, as it is during its daily backup, is asked again.
  f.state.failUpload = false;
  f.state.away = 1;
  const afterPause = await f.upload({ folderId: 'ideation', file: { bytes: PDF, name: 'plan.pdf' } });
  assert.equal(afterPause.status, 201);
  assert.equal(f.files.length, 1);

  // Without storage configured, nothing is stored and the reason is not a surprise 500.
  const unconfigured = fixture('alice', {});
  unconfigured.addFolder('ideation');
  const refusedUpload = await unconfigured.upload({ folderId: 'ideation', file: { bytes: PDF, name: 'plan.pdf' } });
  assert.equal(refusedUpload.status, 503);
  assert.equal(unconfigured.files.length, 0);
});

test('malformed storage names never reach the bucket', async () => {
  const f = fixture();
  f.addFolder('ideation');
  for (const value of ['storage:context/' + '-'.repeat(36), 'storage:context/' + 'a'.repeat(36),
    'storage:context/00000000-0000-0000-8000-000000000000']) {
    const file = f.addFile(value, { storageUrl: value, mimeType: 'application/pdf' });
    assert.equal((await f.call(DOWNLOAD, 'GET', { id: file.id })).status, 500);
    assert.equal((await f.call('src/app/api/context/files/[id]/preview/route.ts', 'GET', { id: file.id })).status, 500);
  }
  assert.equal(f.requests.length, 0);
});

test('bytes that could not be taken back are named in the log, and nothing else about the store is', async () => {
  const logs = [];
  const f = fixture('alice', STORE, { error: (...args) => logs.push(args) });
  f.addFolder('ideation');
  f.state.failCreate = new Error('row failed');
  f.state.failDelete = true;
  await f.upload({ folderId: 'ideation', file: { bytes: PDF, name: 'plan.pdf' } });
  assert.equal(f.stored.size, 1);
  // The made-up name is what lets someone remove the bytes by hand; the endpoint, bucket and key stay out.
  const orphan = logs.find(args => args[0] === 'context_file_orphan_bytes');
  assert.equal(JSON.stringify(orphan[1]), JSON.stringify({ object: f.requests[0].key }));
  assert.equal(/s3\.test|collab\/|secret|Credential/.test(JSON.stringify(logs)), false);
  assert.ok(logs.some(args => args[0] === 'file_storage_request_failed' && args[1].method === 'DELETE' && args[1].status === 403));
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

test('a folder or file of someone else is changed by an Admin and above, and by nobody below', async () => {
  // olivia is the workspace's primary owner; alice put the file there.
  const join = (user, role, { status = true, platformAdmin = false } = {}) => {
    const f = fixture(user);
    f.ws[0].ownerId = 'olivia';
    if (role) f.ws[0].members.push({ userId: user, status, role });
    if (platformAdmin) f.platformAdmins.push(user);
    f.addFolder('ideation');
    return { f, file: f.addFile('theirs', { uploadedById: 'alice' }) };
  };
  for (const [user, role] of [['adam', 'ADMIN'], ['adal', 'admin'], ['otto', 'OWNER'], ['ola', 'Owner'], ['olivia', null], ['olivia', 'MEMBER']]) {
    const { f, file } = join(user, role);
    assert.equal((await f.call(ONE, 'PATCH', { id: file.id, body: { name: 'tidied.pdf' } })).status, 200, `${user} renames`);
    assert.equal(file.name, 'tidied.pdf', user);
    assert.equal((await f.call(ONE, 'DELETE', { id: file.id })).status, 200, `${user} deletes`);
    assert.equal((await f.call(RESTORE, 'POST', { id: file.id })).status, 200, `${user} restores`);
    assert.equal(file.deletedAt, null, user);
  }
  // A standard role, custom ones and a platform admin's included, is refused; a switched-off Admin and a
  // platform admin who is not a member do not reach the file at all.
  for (const [user, role, expected, options] of [['sam', 'MEMBER', 403], ['dev', 'Developer', 403],
    ['padm', 'MEMBER', 403, { platformAdmin: true }], ['off', 'ADMIN', 404, { status: false }], ['root', null, 404, { platformAdmin: true }]]) {
    const { f, file } = join(user, role, options);
    assert.equal((await f.call(ONE, 'PATCH', { id: file.id, body: { name: 'mine.pdf' } })).status, expected, `${user} renames`);
    assert.equal((await f.call(ONE, 'DELETE', { id: file.id })).status, expected, `${user} deletes`);
    Object.assign(file, { deletedAt: new Date(), deletedById: 'alice' });
    assert.equal((await f.call(RESTORE, 'POST', { id: file.id })).status, expected, `${user} restores`);
    assert.equal(file.name, 'theirs', user);
    assert.equal(f.state.writes, 0, user);
  }
});

test('a file in a project folder is changed by an Admin, and not by a standard member who did not upload it', async () => {
  const setup = (user) => {
    const f = fixture(user);
    f.addFolder('ideation', { projectId: 'project' });
    return { f, file: f.addFile('theirs', { uploadedById: 'alice' }) };
  };
  const { f, file } = setup('carol');
  assert.equal((await f.call(ONE, 'PATCH', { id: file.id, body: { name: 'mine.pdf' } })).status, 403);
  assert.equal((await f.call(ONE, 'DELETE', { id: file.id })).status, 403);
  Object.assign(file, { deletedAt: new Date(), deletedById: 'alice' });
  assert.equal((await f.call(RESTORE, 'POST', { id: file.id })).status, 403);
  assert.equal(file.name, 'theirs');
  assert.equal(f.state.writes, 0);

  const admin = setup('dana');
  assert.equal((await admin.f.call(ONE, 'PATCH', { id: admin.file.id, body: { name: 'tidied.pdf' } })).status, 200);
  assert.equal((await admin.f.call(ONE, 'DELETE', { id: admin.file.id })).status, 200);
  assert.equal((await admin.f.call(RESTORE, 'POST', { id: admin.file.id })).status, 200);
  assert.equal(admin.file.name, 'tidied.pdf');
  assert.equal(admin.file.deletedAt, null);
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

const PREVIEW = 'src/app/api/context/files/[id]/preview/route.ts';
const ZIP = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('photos.jpg')]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

test('a file is previewed as what it is, and never as something a browser runs', async () => {
  const f = fixture();
  f.addFolder('ideation');
  const put = async (bytes, name) => (await f.upload({ folderId: 'ideation', file: { bytes, name } })).json();
  const png = await put(PNG, 'sketch.png');
  const pdf = await put(PDF, 'plan.pdf');
  const page = await put(HTML, 'report.html');
  const rows = await put(Buffer.from('name,count\n"a, b",2\nlast,3\n'), 'rows.csv');
  const archive = await put(ZIP, 'photos.zip');
  const drawing = await put(SVG, 'logo.svg');

  // An image leaves with its own type, shown in the page rather than downloaded, and sealed.
  const image = await f.call(PREVIEW, 'GET', { id: png.id });
  assert.equal(image.status, 200);
  assert.equal(image.headers.get('content-type'), 'image/png');
  assert.match(image.headers.get('content-disposition'), /^inline; filename="sketch\.png"/);
  assert.equal(image.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(image.headers.get('content-security-policy'), "default-src 'none'; sandbox; frame-ancestors 'self'");
  assert.equal(Buffer.from(await image.arrayBuffer()).toString('hex'), PNG.toString('hex'));

  // The PDF viewer is the browser's own program and needs its scripts. The seal is kept for the browsers
  // that honour it on a PDF; what holds everywhere is the type from the bytes and `nosniff`.
  const viewer = await f.call(PREVIEW, 'GET', { id: pdf.id });
  assert.equal(viewer.headers.get('content-type'), 'application/pdf');
  assert.equal(viewer.headers.get('content-security-policy'), "default-src 'none'; sandbox allow-scripts; frame-ancestors 'self'");
  assert.match(viewer.headers.get('content-disposition'), /^inline;/);
  assert.equal(viewer.headers.get('x-content-type-options'), 'nosniff');

  // Collab frames a PDF without a sandbox mark (Chrome's viewer will not start in one), so only bytes
  // that are a PDF ever get that frame. A page named like a PDF is still read as text, never served inline.
  const fake = await put(HTML, 'fake.pdf');
  const fakeRead = await f.call(PREVIEW, 'GET', { id: fake.id });
  assert.match(fakeRead.headers.get('content-type'), /^application\/json/);
  const fakeText = await fakeRead.json();
  assert.equal(fakeText.kind, 'text');
  assert.equal(fakeText.text, HTML.toString());
  // A PDF that carries a page after its header leaves as a PDF the browser may not sniff, so the page
  // only ever reaches the PDF viewer, never the browser's HTML reader.
  const polyglotBytes = Buffer.concat([PDF, HTML]);
  const polyglot = await f.call(PREVIEW, 'GET', { id: (await put(polyglotBytes, 'mixed.pdf')).id });
  assert.equal(polyglot.headers.get('content-type'), 'application/pdf');
  assert.equal(polyglot.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(polyglot.headers.get('content-security-policy'), "default-src 'none'; sandbox allow-scripts; frame-ancestors 'self'");
  assert.equal(Buffer.from(await polyglot.arrayBuffer()).toString('hex'), polyglotBytes.toString('hex'));

  // A file that says it is HTML is read, not run: its bytes leave as JSON, never with a type a browser runs.
  const read = await f.call(PREVIEW, 'GET', { id: page.id });
  assert.match(read.headers.get('content-type'), /^application\/json/);
  const text = await read.json();
  assert.equal(text.kind, 'text');
  assert.equal(text.text, HTML.toString());
  assert.equal(text.truncated, false);

  // A CSV is a table, quotes and all.
  const table = await (await f.call(PREVIEW, 'GET', { id: rows.id })).json();
  assert.equal(table.kind, 'csv');
  assert.deepEqual(table.rows, [['name', 'count'], ['a, b', '2'], ['last', '3']]);
  assert.equal(table.hasMore, false);

  // Any other type is named, not shown, and its bytes are never fetched for a preview.
  const fetches = f.fetched.length;
  const named = await (await f.call(PREVIEW, 'GET', { id: archive.id })).json();
  assert.deepEqual(named, { id: archive.id, name: 'photos.zip', mimeType: 'application/zip', size: ZIP.length, kind: 'none' });
  assert.equal(f.fetched.length, fetches);

  // An SVG is drawn by an `<img>` but is a document when it is opened on its own, so it is named like
  // any other type a browser would run: its bytes never leave inline, whatever header is on them.
  const vector = await f.call(PREVIEW, 'GET', { id: drawing.id });
  assert.match(vector.headers.get('content-type'), /^application\/json/);
  assert.deepEqual(await vector.json(),
    { id: drawing.id, name: 'logo.svg', mimeType: 'image/svg+xml', size: SVG.length, kind: 'none' });
  assert.equal(f.fetched.length, fetches);

  // Only someone who reads the folder, as everywhere else: a stranger gets no preview and no bytes.
  const stranger = fixture('mallory');
  stranger.addFolder('ideation');
  stranger.addFile(png.id, { folderId: 'ideation', mimeType: 'image/png', name: 'sketch.png' });
  stranger.ws[0].members = [];
  assert.equal((await stranger.call(PREVIEW, 'GET', { id: png.id })).status, 404);
  assert.equal(stranger.fetched.length, 0);
});

test('a preview of a large file reads only its start and says there is more', async () => {
  const f = fixture();
  f.addFolder('ideation');
  const put = async (bytes, name) => (await f.upload({ folderId: 'ideation', file: { bytes, name } })).json();
  const { csvPreview, contextPreviewKind, MAX_CONTEXT_PREVIEW_BYTES, CONTEXT_PREVIEW_ROWS } =
    load('src/lib/context-file-preview.ts', {}, { TextDecoder });

  const lines = ['name,count', ...Array.from({ length: 500 }, (_, index) => `row ${index},${index}`)];
  const rows = await put(Buffer.from(`${lines.join('\n')}\n`), 'big.csv');
  const table = await (await f.call(PREVIEW, 'GET', { id: rows.id })).json();
  assert.equal(table.rows.length, CONTEXT_PREVIEW_ROWS);
  assert.equal(table.rowLimit, CONTEXT_PREVIEW_ROWS);
  assert.equal(table.hasMore, true);
  assert.deepEqual(table.rows.at(-1), ['row 198', '198']);

  // A megabyte of text is answered from its first bytes alone, and the reply says so.
  const long = await put(Buffer.from('x'.repeat(1024 * 1024)), 'long.txt');
  const read = await (await f.call(PREVIEW, 'GET', { id: long.id })).json();
  assert.equal(read.text.length, MAX_CONTEXT_PREVIEW_BYTES);
  assert.equal(read.truncated, true);

  // Bytes that stop in the middle of a row lose it: half a row is not a row.
  const parsed = (text, truncated) => JSON.stringify(csvPreview(text, truncated).rows);
  assert.equal(parsed('a,b\n1,2\n3,', true), '[["a","b"],["1","2"]]');
  assert.equal(parsed('a,b\n1,2\n3,', false), '[["a","b"],["1","2"],["3",""]]');
  // A quoted field holds commas and line breaks, and a doubled quote is one quote.
  assert.equal(parsed('a,b\n"one, two","a ""quote""\nover two lines"\n', false),
    '[["a","b"],["one, two","a \\"quote\\"\\nover two lines"]]');

  // The type decides what a preview is; a name only ever chooses between two readings of text.
  const kinds = [
    [{ name: 'notes.txt', mimeType: 'text/plain' }, 'text'],
    [{ name: 'rows.csv', mimeType: 'text/plain' }, 'csv'],
    [{ name: 'report.html', mimeType: 'text/html' }, 'text'],
    [{ name: 'sketch.svg', mimeType: 'image/svg+xml' }, 'none'],
    [{ name: 'scan.tiff', mimeType: 'image/tiff' }, 'none'],
    [{ name: 'rows.csv', mimeType: 'application/zip' }, 'none'],
    [{ name: 'plan.pdf', mimeType: 'application/pdf' }, 'pdf'],
  ];
  for (const [file, expected] of kinds) assert.equal(contextPreviewKind(file), expected, file.name);
});

// The seal on inline preview bytes is a header of the route, and Next keeps a header the proxy set
// over a route's own one. So the policy of Collab's pages must never be put on an API address: the
// preview would go on returning a seal that never reaches the browser. The two halves only work as a
// pair, so both are asked here: the proxy stays out of the way, and the route says the whole seal
// itself — including who may frame the bytes, which it no longer inherits from a page.
test('the policy of Collab pages never replaces the seal a preview puts on its bytes', async () => {
  const { NextRequest, NextResponse } = require('next/server');
  const { proxy } = load('src/proxy.ts', {
    'next/server': { NextRequest, NextResponse },
    '@/lib/gateway-identity': { authMode: () => 'nextauth', gatewayMutationAllowed: () => true, readGatewayIdentity: () => null },
    '@/lib/request-session': { getGatewaySession: async () => null },
  }, { process: { env: { NODE_ENV: 'production' } }, URL, Buffer, console });
  // What a browser sends on a navigation, and on a frame it is told to open.
  const headers = { accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,*/*;q=0.8' };
  const ask = path => proxy(new NextRequest('https://example.test' + path, { method: 'GET', headers }));

  for (const path of ['/api', '/api/context/files/file/preview', '/api/context/files/file/download', '/api/issues']) {
    const sent = await ask(path);
    assert.equal(sent.headers.get('content-security-policy'), null, path);
    assert.equal(sent.headers.get('content-security-policy-report-only'), null, path);
    // The headers that are not a page's own are still put on every reply.
    assert.equal(sent.headers.get('x-content-type-options'), 'nosniff', path);
  }
  // A page still gets the policy, and a path that merely begins with the same letters is a page.
  for (const path of ['/space', '/apifolder', '/login']) {
    assert.match((await ask(path)).headers.get('content-security-policy') ?? '', /default-src 'self'/, path);
  }

  // The other half: with no page policy to inherit, the route states who may frame its bytes. Collab's
  // own preview frames the PDF, so inline bytes allow the site itself and nobody else; a download is
  // framed by no one at all.
  const { previewHeaders } = load('src/lib/context-file-preview.ts', {}, { TextDecoder });
  const { downloadHeaders } = load('src/lib/context-files.ts', {
    '@prisma/client': { Prisma: {} },
    '@/lib/prisma': { prisma: {} },
    '@/lib/file-storage': { FileStorageError: Error },
  }, { URL, console, TextDecoder, Buffer, Response, process: { env: {} } });
  const seal = headers => headers['Content-Security-Policy'];
  assert.equal(seal(previewHeaders({ name: 'sketch.png', mimeType: 'image/png' }, 'image')),
    "default-src 'none'; sandbox; frame-ancestors 'self'");
  assert.equal(seal(previewHeaders({ name: 'plan.pdf', mimeType: 'application/pdf' }, 'pdf')),
    "default-src 'none'; sandbox allow-scripts; frame-ancestors 'self'");
  assert.equal(seal(downloadHeaders({ name: 'report.html' })), "default-src 'none'; sandbox; frame-ancestors 'none'");
});
