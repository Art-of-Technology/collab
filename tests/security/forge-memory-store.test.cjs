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
  loaded.require = name => name === 'server-only' ? {} : name.startsWith('./') ? load(name.slice(2)) : original(name);
  cache.set(filename, loaded);
  loaded._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
  return loaded.exports;
}
const { readProjectMemory, writeProjectMemory } = load('memory-store');
const { saveMemoryDraft, serializeMemory } = load('memory');

test('fixed-path SHA-CAS preserves concurrent writes, validates file type, and resolves lost responses by readback', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'collab-memory-test-'));
  try {
    const reader = path.join(directory, 'reader'), writer = path.join(directory, 'writer');
    fs.writeFileSync(reader, 'fixture-reader'); fs.writeFileSync(writer, 'fixture-writer');
    const binding = { origin: 'https://forge.example.test', workspaceId: 'workspace', projectId: 'project', repositoryId: 123,
      owner: 'example', repository: 'project', readTokenFile: reader, memory: { branch: 'main', writeTokenFile: writer } };
    let stored = null, mode = '', writes = 0;
    const payload = markdown => {
      const bytes = Buffer.from(markdown);
      return { type: 'file', path: 'project-memory.md', encoding: 'base64', size: bytes.length,
        sha: crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'), content: bytes.toString('base64') };
    };
    const request = async (url, options) => {
      assert.equal(options.redirect, 'error'); assert.equal(options.cache, 'no-store');
      assert.ok(options.signal instanceof AbortSignal);
      assert.ok(url.startsWith('https://forge.example.test/api/v1/repos/example/project'));
      if (url.endsWith('/project')) return Response.json({ id: mode === 'mismatch' ? 999 : 123 });
      if (!options.method) {
        assert.ok(url.endsWith('/contents/project-memory.md?ref=main'));
        assert.equal(options.headers.Authorization, 'token fixture-reader');
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
    mode = ''; stored.content = Buffer.from('tampered').toString('base64');
    await assert.rejects(readProjectMemory(binding, request));
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
