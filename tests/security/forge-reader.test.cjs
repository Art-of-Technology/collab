const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
function load(name) {
  const filename = path.resolve(__dirname, `../../src/lib/forge/${name}.ts`);
  const loaded = new Module(filename, module);
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  loaded.require = id => id === 'server-only' ? {} : id === './tasks' ? load('tasks') : Module.prototype.require.call(loaded, id);
  loaded._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
  return loaded.exports;
}
const { readForgeIssues, readForgeBindings } = load('reader');
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-reader-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const readTokenFile = path.join(directory, 'reader-token');
  fs.writeFileSync(readTokenFile, 'fixture-token-only');
  return { origin: 'https://forge.example.test', workspaceId: 'workspace-a', projectId: 'project-a',
    repositoryId: 123, owner: 'example', repository: 'project', slackWorkspaceId: 'TEXAMPLE',
    slackChannelId: 'CEXAMPLE', readTokenFile };
}
const issue = number => ({ number, title: `Task ${number}`, state: 'open', body: 'Existing discussion', comments: 2 });

test('verifies immutable repository identity before bounded paginated reads', async t => {
  const binding = fixture(t);
  const calls = [];
  const result = await readForgeIssues(binding, async (url, options) => {
    calls.push(url);
    assert.equal(options.redirect, 'error');
    assert.equal(options.cache, 'no-store');
    assert.equal(options.headers.Authorization, 'token fixture-token-only');
    assert.ok(options.signal instanceof AbortSignal);
    if (!url.includes('/issues?')) return Response.json({ id: 123 });
    assert.match(url, /state=all&type=issues&limit=50&page=/);
    return Response.json(url.endsWith('page=1') ? Array.from({ length: 50 }, (_, i) => issue(i + 1)) : [issue(50), issue(51)]);
  });
  assert.equal(calls.length, 3);
  assert.equal(result.tasks.length, 51);
  assert.equal(result.tasks[0].comments, 2);
  assert.equal(result.truncated, false);
  assert.equal(JSON.stringify(result).includes('fixture-token-only'), false);
  let requests = 0;
  await assert.rejects(readForgeIssues(binding, async () => { requests++; return Response.json({ id: 999 }); }), /no longer matches/);
  assert.equal(requests, 1);
});

test('fails visibly on upstream errors, redirects, oversized or malformed payloads', async t => {
  const binding = fixture(t);
  for (const response of [new Response('', { status: 403 }), new Response('', { status: 302 }),
    new Response('{}', { headers: { 'content-length': String(3 * 1024 * 1024) } })]) {
    await assert.rejects(readForgeIssues(binding, async () => response));
  }
  await assert.rejects(readForgeIssues(binding, async url => Response.json(url.includes('/issues?') ? [{ bad: true }] : { id: 123 })), /Invalid issue/);
});

test('requires complete unique server bindings and safe configured origins', async t => {
  const binding = fixture(t);
  const file = path.join(path.dirname(binding.readTokenFile), 'config.json');
  const previous = process.env.COLLAB_FORGE_CONFIG_FILE;
  t.after(() => { if (previous === undefined) delete process.env.COLLAB_FORGE_CONFIG_FILE; else process.env.COLLAB_FORGE_CONFIG_FILE = previous; });
  process.env.COLLAB_FORGE_CONFIG_FILE = file;
  const { origin, ...entry } = binding;
  fs.writeFileSync(file, JSON.stringify({ origin, bindings: [entry] }));
  assert.deepEqual(await readForgeBindings(), [binding]);
  fs.writeFileSync(file, JSON.stringify({ origin, bindings: [{ ...entry, slackWorkspaceId: '' }] }));
  await assert.rejects(readForgeBindings());
  fs.writeFileSync(file, JSON.stringify({ origin, bindings: [entry, entry] }));
  await assert.rejects(readForgeBindings(), /Duplicate/);
  fs.writeFileSync(file, JSON.stringify({ origin: 'https://user:password@forge.example.test', bindings: [entry] }));
  await assert.rejects(readForgeBindings());
});
