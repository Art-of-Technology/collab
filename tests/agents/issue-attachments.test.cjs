const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('../security/helpers.cjs');
const { seatsDatabase } = require('./seats-db.cjs');

// An agent attaches a file to an issue: who may, where the file goes, what the reply says, and what is refused.
const owner = 'cowner00001', person = 'cperson0001';
const A = 'cprojecta001', B = 'cprojectb001';
const scopes = ['issues:read', 'issues:write', 'context:read', 'context:write', 'projects:read', 'workspace:read', 'user:read'];
const STORE = { FILE_STORAGE_ENDPOINT: 'https://s3.test', FILE_STORAGE_BUCKET: 'collab', FILE_STORAGE_ACCESS_KEY: 'key', FILE_STORAGE_SECRET_KEY: 'secret' };
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 1, 2, 3, 4]);
const b64 = bytes => Buffer.from(bytes).toString('base64');

let db;
after(() => db?.stop());

test('an agent attaches a file to an issue', async t => {
  db = await seatsDatabase(async prisma => {
    await prisma.user.createMany({ data: [owner, person].map(id => ({ id, name: id })) });
    for (const id of ['w', 'other']) await prisma.workspace.create({ data: { id, name: id, slug: id, ownerId: owner } });
    await prisma.workspaceMember.create({ data: { workspaceId: 'w', userId: person } });
    for (const id of [A, B]) await prisma.project.create({ data: { id, workspaceId: 'w', name: id, slug: id, issuePrefix: id === A ? 'AA' : 'BB' } });
    await prisma.project.create({ data: { id: 'cprojectx001', workspaceId: 'other', name: 'x', slug: 'x', issuePrefix: 'XX' } });
    for (const [id, slug, granted] of [['agent-app', 'collab-agent', scopes], ['person-app', 'collab-cli', scopes]]) {
      await prisma.app.create({ data: { id, name: slug, slug, publisherId: 'system', status: 'PUBLISHED', visibility: 'PRIVATE', isSystemApp: true,
        scopes: { create: granted.map(scope => ({ scope })) } } });
    }
  });
  const { prisma } = db;

  // The bucket: it keeps what it is sent.
  const stored = new Map();
  async function bucket(url, { method = 'GET', body } = {}) {
    const key = /^https:\/\/s3\.test\/collab\/(.+)$/.exec(String(url))?.[1];
    if (method === 'PUT') { stored.set(key, Buffer.from(body)); return new Response(null, { status: 200 }); }
    if (method === 'DELETE') { stored.delete(key); return new Response(null, { status: 204 }); }
    return stored.has(key) ? new Response(stored.get(key), { status: 200 }) : new Response(null, { status: 404 });
  }

  const crypto = { encryptToken: async value => Buffer.from(value), decryptToken: async data => Buffer.from(data).toString(), getEncryptionKey: () => {} };
  const zod = require('zod');
  const client = require('@prisma/client');
  const globals = { console, URL, Date, Buffer, Response, TextDecoder, setTimeout, clearTimeout, AbortController, fetch: bucket, process: { env: { ...STORE } } };
  const finder = load('src/lib/issue-finder.ts', { '@/lib/prisma': { prisma } });
  const handoffs = load('src/lib/agent-handoffs.ts', { 'node:crypto': require('node:crypto'), 'node:buffer': require('node:buffer'), zod,
    '@/lib/prisma': { prisma }, '@/lib/issue-finder': finder, '@/lib/oauth-scopes': load('src/lib/oauth-scopes.ts') }, { Date });
  const tokens = load('src/lib/agent-tokens.ts', { crypto: require('node:crypto'), '@/lib/prisma': { prisma }, '@/lib/apps/crypto': crypto }, { Buffer, Date });
  const assignee = load('src/lib/issue-assignee.ts', { './agent-handoffs': handoffs });
  const seats = load('src/lib/agent-seats.ts', { '@/lib/prisma': { prisma }, '@/lib/agent-handoffs': handoffs, '@/lib/agent-tokens': tokens, '@/lib/issue-assignee': assignee }, { Date });
  const middleware = load('src/lib/apps/auth-middleware.ts', { crypto: require('node:crypto'), 'next/server': { NextResponse: Response },
    '@/lib/apps/crypto': crypto, '@/lib/oauth-scopes': load('src/lib/oauth-scopes.ts'), '@/lib/post-access': load('src/lib/post-access.ts'),
    '@/lib/auth-error-diagnostics': load('src/lib/auth-error-diagnostics.ts'), '@/lib/prisma': { prisma } }, globals);
  const deps = {
    zod, '@prisma/client': client, 'next/server': { NextResponse: Response }, '@/lib/prisma': { prisma },
    '@/lib/issue-finder': finder, '@/lib/agent-seats': seats, '@/lib/apps/auth-middleware': middleware,
    '@/lib/forge/legacy-write-guard': { assertLegacyIssueWriteAllowed: async () => {}, ForgeProjectWriteError: class extends Error {} },
    '@/lib/rate-limit': { withRateLimit: handler => handler, mediaUploadRateLimit: {} },
    '@/lib/html-sanitizer': load('src/lib/html-sanitizer.ts'),
    '@/lib/pdf-text': { extractPdfText: async () => ({ text: '' }) },
    '@/lib/secrets/access': load('src/lib/secrets/access.ts', { '@/lib/prisma': { prisma }, '@prisma/client': client, '@/lib/issue-finder': finder }),
  };
  // Folders, files and the replies that report their errors share one error class, so each is loaded once.
  deps['@/lib/file-storage'] = load('src/lib/file-storage.ts', { 'node:crypto': require('node:crypto') }, globals);
  deps['@/lib/context-folders'] = load('src/lib/context-folders.ts', deps, globals);
  deps['@/lib/context-file-type'] = load('src/lib/context-file-type.ts', {}, globals);
  deps['@/lib/context-file-preview'] = load('src/lib/context-file-preview.ts', {}, globals);
  deps['@/lib/context-files'] = load('src/lib/context-files.ts', deps, globals);
  deps['@/lib/agent-context-folders'] = load('src/lib/agent-context-folders.ts', deps, globals);
  deps['@/lib/issue-attachments'] = load('src/lib/issue-attachments.ts', deps, globals);
  const attachments = load('src/app/api/apps/auth/issues/[issueIdOrKey]/attachments/route.ts', deps, globals);

  const attach = async (token, key, body) => {
    const response = await attachments.POST(new Request('https://collab.test/api', { method: 'POST', headers: { Authorization: `Bearer ${token}` },
      body: typeof body === 'string' ? body : JSON.stringify(body) }), { params: Promise.resolve({ issueIdOrKey: key }) });
    return { status: response.status, body: await response.json().catch(() => null) };
  };
  let count = 0;
  const issue = (workspaceId, projectId) => prisma.issue.create({ data: { workspaceId, projectId, title: `Issue ${++count}`, issueKey: `FIX-${count}` } });
  const token = async (name, granted) => {
    await prisma.appToken.create({ data: { appId: 'person-app', workspaceId: 'w', userId: person, installationId: null,
      accessToken: Buffer.from(name).toString('base64'), scopes: granted } });
    return name;
  };
  const personToken = await token('collab_person_token', scopes);
  const devA = (await seats.createSeat({ workspaceId: 'w', actorId: owner, projectId: A, role: 'developer', ownerId: person, name: 'dev-a', expiresInDays: 30 })).token.token;
  const inA = await issue('w', A), inB = await issue('w', B), elsewhere = await issue('other', 'cprojectx001');

  await t.test('an image goes into the project\'s folder and comes back as Markdown that shows it', async () => {
    const first = await attach(personToken, inA.issueKey, { name: 'overview.png', contentBase64: b64(PNG) });
    assert.equal(first.status, 201, JSON.stringify(first.body));
    // What the file is comes from its bytes, and where it is kept is not said.
    assert.equal(first.body.file.mimeType, 'image/png');
    assert.equal(first.body.file.storageUrl, undefined);
    assert.equal(first.body.markdown, `![overview.png](/api/context/files/${first.body.file.id}/preview)`);
    const folder = await prisma.contextFolder.findUniqueOrThrow({ where: { id: first.body.file.folderId } });
    assert.deepEqual([folder.name, folder.projectId, folder.parentId, folder.workspaceId], ['Issue attachments', A, null, 'w']);
    assert.deepEqual([...stored.values()], [PNG]);

    // A second file uses the same folder; a file that is not an image comes back as a link that downloads it.
    const second = await attach(personToken, inA.id, { name: 'run [1].log', contentBase64: b64('build ok\n') });
    assert.equal(second.status, 201, JSON.stringify(second.body));
    assert.equal(second.body.file.folderId, folder.id);
    assert.equal(second.body.markdown, `[run  1 .log](/api/context/files/${second.body.file.id}/download)`);
    assert.equal(await prisma.contextFolder.count({ where: { name: 'Issue attachments' } }), 1);
  });

  await t.test('a seat attaches to its own project\'s issues and to no other', async () => {
    const own = await attach(devA, inA.issueKey, { name: 'shot.png', contentBase64: b64(PNG) });
    assert.equal(own.status, 201, JSON.stringify(own.body));
    const before = stored.size;
    const other = await attach(devA, inB.issueKey, { name: 'shot.png', contentBase64: b64(PNG) });
    assert.deepEqual([other.status, other.body.error], [403, 'wrong_project']);
    assert.equal(stored.size, before);
    assert.equal(await prisma.contextFolder.count({ where: { projectId: B } }), 0);
  });

  await t.test('an issue of another workspace is not found, and a token without both scopes is refused', async () => {
    const before = stored.size;
    const foreign = await attach(personToken, elsewhere.id, { name: 'shot.png', contentBase64: b64(PNG) });
    assert.equal(foreign.status, 404);
    for (const granted of [scopes.filter(scope => scope !== 'context:write'), scopes.filter(scope => scope !== 'issues:write')]) {
      const refused = await attach(await token(`narrow_${granted.length}_${granted.includes('context:write')}`, granted), inA.issueKey, { name: 'shot.png', contentBase64: b64(PNG) });
      assert.equal(refused.status, 403, JSON.stringify(refused.body));
    }
    assert.equal((await attach('no_such_token', inA.issueKey, { name: 'shot.png', contentBase64: b64(PNG) })).status, 401);
    assert.equal(stored.size, before);
  });

  await t.test('what is not a file, or is too large, is refused and stores nothing', async () => {
    const before = stored.size, rows = await prisma.contextFile.count();
    const tooLarge = await attach(personToken, inA.issueKey, { name: 'big.bin', contentBase64: 'A'.repeat(Math.ceil(5 * 1024 * 1024 / 3) * 4 + 4) });
    assert.deepEqual([tooLarge.status, tooLarge.body.error], [413, 'too_large']);
    for (const body of [{ name: 'x.png' }, { name: 'x.png', contentBase64: '' }, { name: 'x.png', contentBase64: 'not base64!' },
      { name: 'x.png', contentBase64: 'abc' }, { contentBase64: b64(PNG) }, { name: '../', contentBase64: b64(PNG) }, 'not json', '[]']) {
      const refused = await attach(personToken, inA.issueKey, body);
      assert.deepEqual([refused.status, refused.body.error], [400, 'invalid_request'], JSON.stringify(body).slice(0, 60));
    }
    assert.equal(stored.size, before);
    assert.equal(await prisma.contextFile.count(), rows);
  });
});
