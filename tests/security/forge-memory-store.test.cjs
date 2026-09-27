const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const Module = require('node:module');
const ts = require('typescript');
const cache = new Map();
function load(name) {
  const filename = path.resolve(__dirname, '../../src/lib/forge', name + '.ts');
  if (cache.has(filename)) return cache.get(filename).exports;
  const loaded = new Module(filename, module);
  loaded.filename = filename; loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const original = loaded.require.bind(loaded);
  loaded.require = name => name === 'server-only' ? {} : name.startsWith('./') && !name.endsWith('.mjs') ? load(name.slice(2)) : original(name);
  cache.set(filename, loaded);
  loaded._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
  return loaded.exports;
}
const { readProjectMemory, writeProjectMemory } = load('memory-store');
const { saveMemoryDraft, serializeMemory } = load('memory');
const { writeMemoryFile } = require('../../src/lib/forge/memory-file.mjs');

test('fixed-path SHA-CAS preserves concurrent writes, validates file type, and resolves lost responses by readback', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'collab-memory-test-'));
  try {
    const reader = path.join(directory, 'reader'), writer = path.join(directory, 'writer');
    fs.writeFileSync(reader, 'fixture-reader'); fs.writeFileSync(writer, 'fixture-service-credential-only-123456789');
    const binding = { origin: 'https://forge.example.test', workspaceId: 'workspace', projectId: 'project', repositoryId: 123,
      owner: 'example', repository: 'project', readTokenFile: reader, memory: { branch: 'main', writerOrigin: 'https://writer.example.test/', serviceTokenFile: writer } };
    let stored = null, mode = '', writes = 0;
    const payload = markdown => {
      const bytes = Buffer.from(markdown);
      return { type: 'file', path: 'project-memory.md', encoding: 'base64', size: bytes.length,
        sha: crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'), content: bytes.toString('base64') };
    };
    const request = async (url, options) => {
      if (url === 'https://writer.example.test/v1/project-memory') {
        assert.equal(options.headers.Authorization, 'Bearer fixture-service-credential-only-123456789');
        assert.equal(options.method, 'POST');
        const body = JSON.parse(options.body);
        assert.deepEqual(Object.keys(body).sort(), ['content', 'expectedSha', 'projectId', 'repositoryId']);
        assert.equal(body.projectId, binding.projectId); assert.equal(body.repositoryId, binding.repositoryId);
        const result = await writeMemoryFile(binding, 'fixture-writer', body.expectedSha, body.content, request);
        return Response.json(result, { status: result.kind === 'conflict' ? 409 : result.kind === 'saved' ? 200 : 503 });
      }
      assert.equal(options.redirect, 'error'); assert.equal(options.cache, 'no-store');
      assert.ok(options.signal instanceof AbortSignal);
      assert.ok(url.startsWith('https://forge.example.test/api/v1/repos/example/project'));
      if (url.endsWith('/project')) return Response.json({ id: mode === 'mismatch' ? 999 : 123 });
      if (url.endsWith('/branches/main')) return Response.json({ name: 'main' });
      if (!options.method) {
        assert.ok(url.endsWith('/contents/project-memory.md?ref=main'));
        assert.ok(['token fixture-reader', 'token fixture-writer'].includes(options.headers.Authorization));
        if (mode === 'symlink') return Response.json({ ...stored, type: 'symlink', target: 'code.ts' });
        return stored ? Response.json(stored) : new Response(null, { status: 404 });
      }
      writes++;
      assert.ok(url.endsWith('/contents/project-memory.md'));
      assert.equal(options.headers.Authorization, 'token fixture-writer');
      const body = JSON.parse(options.body);
      assert.deepEqual(Object.keys(body).sort(), (stored ? ['branch', 'sha', 'content', 'message'] : ['branch', 'content', 'message']).sort());
      assert.equal(body.branch, 'main');
      assert.equal(options.method, stored ? 'PUT' : 'POST');
      if (mode === 'race' || (stored && body.sha !== stored.sha)) return new Response(null, { status: 409 });
      if (mode === 'offline') throw new Error('Connection lost before write');
      stored = payload(Buffer.from(body.content, 'base64').toString('utf8'));
      if (mode === 'lost-response') throw new Error('Connection lost after commit');
      return Response.json({ content: stored });
    };
    const empty = await readProjectMemory(binding, request);
    assert.equal(empty.sha, null);
    const next = saveMemoryDraft(empty.document, 'rules', { title: 'Rules', type: 'Rules', body: '**Markdown**', sources: [] },
      { id: 'owner', canManage: false }, '2026-09-23T12:00:00.000Z');
    const created = await writeProjectMemory(binding, null, next, request);
    assert.equal(created.kind, 'saved'); assert.equal(writes, 1);
    assert.equal(serializeMemory(created.snapshot.document), serializeMemory(next));
    assert.equal((await writeProjectMemory(binding, null, next, request)).kind, 'conflict'); assert.equal(writes, 1);
    const edited = saveMemoryDraft(next, 'rules', { title: 'Rules', type: 'Rules', body: 'Updated', sources: [] },
      { id: 'owner', canManage: false }, '2026-09-23T12:01:00.000Z');
    mode = 'race';
    assert.equal((await writeProjectMemory(binding, created.snapshot.sha, edited, request)).kind, 'conflict');
    mode = 'offline';
    assert.equal((await writeProjectMemory(binding, created.snapshot.sha, edited, request)).kind, 'uncertain');
    mode = 'lost-response';
    assert.equal((await writeProjectMemory(binding, created.snapshot.sha, edited, request)).kind, 'saved');
    assert.equal(writes, 4); // No automatic write retries.
    mode = 'symlink'; await assert.rejects(readProjectMemory(binding, request));
    mode = 'mismatch'; await assert.rejects(readProjectMemory(binding, request));
    mode = ''; stored = payload('\uFEFF' + serializeMemory(edited));
    await assert.rejects(readProjectMemory(binding, request));
    mode = ''; stored.content = Buffer.from('tampered').toString('base64');
    await assert.rejects(readProjectMemory(binding, request));
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('memory binding accepts only the isolated fixed-branch service contract', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'collab-memory-binding-'));
  const previous = process.env.COLLAB_FORGE_CONFIG_FILE;
  try {
    const file = path.join(directory, 'config.json');
    process.env.COLLAB_FORGE_CONFIG_FILE = file;
    const memory = { branch: 'main', writerOrigin: 'https://writer.example.test/', serviceTokenFile: '/run/secrets/collab-memory-service' };
    const binding = { workspaceId: 'workspace', projectId: 'project', repositoryId: 4, owner: 'Space', repository: 'team-space',
      slackWorkspaceId: 'T123', slackChannelId: 'C123', readTokenFile: '/run/secrets/collab-forge-token', memory };
    const put = value => fs.writeFileSync(file, JSON.stringify({ origin: 'https://forge.example.test', bindings: [{ ...binding, memory: value }] }));
    const { readForgeBindings } = load('reader');
    put(memory);
    assert.deepEqual((await readForgeBindings())[0].memory, memory);
    for (const invalid of [
      { branch: 'main', writeTokenFile: '/run/secrets/native-notes-token' },
      { ...memory, branch: 'other' }, { ...memory, serviceTokenFile: 'relative' },
      ...['http://writer.example.test', 'https://user:secret@writer.example.test', 'https://writer.example.test/path',
        'https://writer.example.test/?other=1', 'https://writer.example.test/#fragment'].map(writerOrigin => ({ ...memory, writerOrigin })),
    ]) { put(invalid); await assert.rejects(readForgeBindings()); }
  } finally {
    if (previous === undefined) delete process.env.COLLAB_FORGE_CONFIG_FILE;
    else process.env.COLLAB_FORGE_CONFIG_FILE = previous;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('empty repository requires its verified default branch and concurrent first saves never overwrite', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'collab-memory-empty-'));
  try {
    const reader = path.join(directory, 'reader'), writer = path.join(directory, 'writer');
    fs.writeFileSync(reader, 'fixture-reader'); fs.writeFileSync(writer, 'fixture-service-credential-only-123456789');
    const binding = { origin: 'https://forge.example.test', projectId: 'project', repositoryId: 123,
      owner: 'example', repository: 'project', readTokenFile: reader, memory: { branch: 'main', writerOrigin: 'https://writer.example.test', serviceTokenFile: writer } };
    let stored = null, mode = '', writes = 0, commits = 0, reads = 0;
    let release;
    const bothReadEmpty = new Promise(resolve => { release = resolve; });
    const request = async (url, options) => {
      if (url === 'https://writer.example.test/v1/project-memory') {
        assert.equal(options.headers.Authorization, 'Bearer fixture-service-credential-only-123456789');
        assert.equal(options.method, 'POST');
        const body = JSON.parse(options.body);
        assert.deepEqual(Object.keys(body).sort(), ['content', 'expectedSha', 'projectId', 'repositoryId']);
        assert.equal(body.projectId, binding.projectId); assert.equal(body.repositoryId, binding.repositoryId);
        const result = await writeMemoryFile(binding, 'fixture-writer', body.expectedSha, body.content, request);
        return Response.json(result, { status: result.kind === 'conflict' ? 409 : result.kind === 'saved' ? 200 : 503 });
      }
      if (url.endsWith('/project')) return Response.json({ id: mode === 'identity' ? 999 : 123,
        empty: mode === 'nonempty' || mode === 'missing-branch' || mode === 'wrong-branch-response' ? false : !stored,
        default_branch: mode === 'wrong-default' ? 'other' : 'main' });
      if (url.includes('/branches/')) {
        if (mode === 'missing-branch') return new Response(null, { status: 404 });
        return Response.json({ name: mode === 'wrong-branch-response' ? 'other' : 'main' });
      }
      if (!options.method) {
        assert.ok(url.endsWith('/contents/project-memory.md?ref=main'));
        if (mode === 'missing-branch' || mode === 'wrong-branch-response') return new Response(null, { status: 404 });
        if (mode === 'directory') return Response.json([{ type: 'file', path: 'project-memory.md/child' }]);
        if (mode === 'race' && !stored) {
          if (++reads === 2) release();
          await bothReadEmpty;
          return Response.json([]);
        }
        return Response.json(stored || []);
      }
      writes++;
      assert.equal(options.method, 'POST');
      assert.ok(url.endsWith('/contents/project-memory.md'));
      const body = JSON.parse(options.body);
      assert.equal(body.branch, 'main'); assert.equal(body.sha, undefined);
      if (stored) return new Response(null, { status: 409 });
      const bytes = Buffer.from(body.content, 'base64');
      stored = { type: 'file', path: 'project-memory.md', encoding: 'base64', content: body.content,
        size: bytes.length, sha: crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex') };
      commits++;
      return Response.json({ content: stored }, { status: 201 });
    };
    const empty = await readProjectMemory(binding, request);
    assert.equal(empty.sha, null);
    for (const invalid of ['identity', 'wrong-default', 'directory', 'nonempty', 'missing-branch', 'wrong-branch-response']) {
      mode = invalid;
      await assert.rejects(readProjectMemory(binding, request), invalid);
    }
    mode = '';
    await assert.rejects(readProjectMemory({ ...binding, memory: { ...binding.memory, branch: 'wrong' } }, request));
    assert.equal(writes, 0);
    const makeDraft = title => saveMemoryDraft(empty.document, 'rules', { title, type: 'Rules', body: title, sources: [] },
      { id: 'owner', canManage: false }, '2026-09-24T12:00:00.000Z');
    mode = 'race';
    const results = await Promise.all([writeProjectMemory(binding, null, makeDraft('First'), request),
      writeProjectMemory(binding, null, makeDraft('Second'), request)]);
    assert.deepEqual(results.map(result => result.kind).sort(), ['conflict', 'saved']);
    assert.ok(writes >= 1 && writes <= 2); assert.equal(commits, 1);
    const saved = results.find(result => result.kind === 'saved');
    assert.equal(serializeMemory((await readProjectMemory(binding, request)).document), serializeMemory(saved.snapshot.document));
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
