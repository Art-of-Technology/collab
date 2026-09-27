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
const { readForgeIssue, writeForgeIssue } = load('issue-store');
const { issueFingerprint, patchIssueContent, splitIssueBody } = load('issue-content');

test('metadata updates preserve full outside text and unknown fields; closing omits body', () => {
  const before = 'a'.repeat(90000) + '\n\n', after = '\n\nHuman tail  \n';
  const issue = { number: 1, title: 'Task', state: 'open', updated_at: 'now', body: before + '```channel-task\n' + JSON.stringify({ status: 'backlog', unknown: { nested: [1, 'keep'] }, nextAction: 'x'.repeat(800) }) + '\n```' + after };
  const changed = patchIssueContent(issue, { priority: 'high' });
  const parts = splitIssueBody(changed.body);
  assert.equal(parts.before, before); assert.equal(parts.after, after);
  assert.deepEqual(parts.metadata.unknown, { nested: [1, 'keep'] });
  assert.equal(parts.metadata.nextAction.length, 800);
  assert.deepEqual(patchIssueContent(issue, { status: 'done' }), { state: 'closed' });
  for (const body of ['```channel-task\ninvalid\n```', '```channel-task\n{}\n```\n```channel-task\n{}\n```', '```channel-task\n{}']) {
    assert.throws(() => patchIssueContent({ ...issue, body }, { title: 'New' }));
  }
});

test('human descriptions cannot introduce task metadata', () => {
  const issue = { number: 1, title: 'Task', state: 'open', updated_at: 'now', body: 'Original' };
  for (const description of ['```channel-task\n{"owner":"Other","status":"blocked"}\n```', 'Human text\n```channel-task\r\n{}\r\n```', '```channel-task']) {
    assert.throws(() => patchIssueContent(issue, { description }));
  }
  assert.deepEqual(patchIssueContent(issue, { description: 'Human text' }), { body: 'Human text' });
});

test('scoped Forge writes verify custody, stale edits, own comments, readback, and unknown POST outcomes', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'collab-issue-test-'));
  try {
    const reader = path.join(directory, 'reader'), writer = path.join(directory, 'writer');
    fs.writeFileSync(reader, 'fixture-reader'); fs.writeFileSync(writer, 'fixture-writer');
    const binding = { origin: 'https://forge.example.test', workspaceId: 'workspace', projectId: 'project', repositoryId: 123,
      owner: 'example', repository: 'project', readTokenFile: reader,
      issues: { writeTokenFile: writer, principalId: 11, tokenSha256: crypto.createHash('sha256').update('fixture-writer').digest('hex') } };
    let issue = { number: 1, title: 'Task', body: 'Full body', state: 'open', updated_at: 'now' };
    let comments = [{ id: 2, body: 'Mine', updated_at: 'now', user: { id: 11, login: 'shared' } }, { id: 3, body: 'Other', updated_at: 'now', user: { id: 22, login: 'other' } }];
    let writes = 0, calls = 0, mode = '', lastPayload;
    const request = async (url, options) => {
      calls++;
      assert.ok(url.startsWith(binding.origin + '/api/v1/repos/example/project'));
      assert.equal(options.redirect, 'error'); assert.equal(options.cache, 'no-store');
      assert.ok(options.signal instanceof AbortSignal);
      const pathname = new URL(url).pathname;
      if (pathname.endsWith('/project')) return Response.json({ id: mode === 'wrong-repo' ? 999 : 123 });
      if (options.method === 'GET') {
        if (pathname.endsWith('/issues/1')) return Response.json(issue);
        if (pathname.endsWith('/issues/1/comments')) return Response.json(comments);
        const id = Number(pathname.split('/').at(-1));
        return Response.json(comments.find(row => row.id === id));
      }
      writes++;
      assert.equal(options.headers.Authorization, 'token fixture-writer');
      lastPayload = JSON.parse(options.body);
      if (mode === 'rejected') return new Response('', { status: 403 });
      if (mode === 'offline') throw new Error('offline');
      if (pathname.endsWith('/issues/1')) {
        issue = { ...issue, ...lastPayload, updated_at: String(writes) };
        if (mode === 'intervening') issue.title = 'External change';
        if (mode === 'lost') throw new Error('lost response');
        return Response.json(issue);
      }
      if (pathname.endsWith('/issues/1/comments')) {
        const comment = { id: 4, ...lastPayload, updated_at: 'later', user: { id: 11, login: 'shared' } };
        comments.push(comment);
        if (mode === 'lost') throw new Error('lost response');
        return Response.json(comment);
      }
      const id = Number(pathname.split('/').at(-1));
      comments = comments.map(row => row.id === id ? { ...row, ...lastPayload } : row);
      return Response.json(comments.find(row => row.id === id));
    };
    const initial = await readForgeIssue(binding, 1, request);
    assert.equal(initial.comments[0].canEdit, true); assert.equal(initial.comments[1].canEdit, false);
    const edit = { action: 'edit', number: 1, expected: initial.fingerprint, changes: { title: 'Changed' } };
    fs.writeFileSync(writer, 'wrong-token'); const beforeCalls = calls;
    await assert.rejects(writeForgeIssue(binding, edit, request)); assert.equal(calls, beforeCalls); assert.equal(writes, 0);
    fs.writeFileSync(writer, 'fixture-writer'); mode = 'wrong-repo';
    await assert.rejects(writeForgeIssue(binding, edit, request)); assert.equal(writes, 0);
    mode = ''; issue.title = 'External';
    assert.equal((await writeForgeIssue(binding, edit, request)).kind, 'conflict'); assert.equal(writes, 0);
    edit.expected = issueFingerprint(issue); mode = 'lost';
    assert.equal((await writeForgeIssue(binding, edit, request)).kind, 'saved'); assert.equal(writes, 1);
    assert.deepEqual(lastPayload, { title: 'Changed' });
    edit.expected = issueFingerprint(issue); mode = 'intervening';
    assert.equal((await writeForgeIssue(binding, edit, request)).kind, 'uncertain'); assert.equal(writes, 2);
    mode = ''; const snapshot = await readForgeIssue(binding, 1, request);
    assert.equal((await writeForgeIssue(binding, { action: 'edit-comment', number: 1, commentId: 3, expected: snapshot.comments[1].fingerprint, body: 'No' }, request)).kind, 'rejected'); assert.equal(writes, 2);
    assert.equal((await writeForgeIssue(binding, { action: 'edit-comment', number: 1, commentId: 2, expected: '0'.repeat(64), body: 'No' }, request)).kind, 'conflict'); assert.equal(writes, 2);
    assert.equal((await writeForgeIssue(binding, { action: 'edit-comment', number: 1, commentId: 2, expected: snapshot.comments[0].fingerprint, body: 'Edited' }, request)).kind, 'saved');
    mode = 'lost';
    assert.equal((await writeForgeIssue(binding, { action: 'comment', number: 1, body: 'Posted once' }, request)).kind, 'uncertain');
    assert.equal(writes, 4); assert.equal(comments.filter(row => row.body === 'Posted once').length, 1);
    mode = 'rejected';
    assert.equal((await writeForgeIssue(binding, { action: 'comment', number: 1, body: 'Rejected' }, request)).kind, 'rejected');
    assert.equal(writes, 5);
    const oversized = { action: 'edit', number: 1, expected: issueFingerprint(issue), changes: { description: '界'.repeat(400000) } };
    assert.equal((await writeForgeIssue(binding, oversized, request)).kind, 'invalid');
    assert.equal(writes, 5);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});


test('clearing metadata owner stays cleared while absent owner uses the native assignee', () => {
  const { projectForgeTask } = load('tasks');
  const issue = { number: 1, title: 'Task', state: 'open', assignee: { login: 'Alice' }, body: '```channel-task\n{"owner":"Bob"}\n```' };
  assert.equal(projectForgeTask(issue).owner, 'Bob');
  const cleared = { ...issue, ...patchIssueContent(issue, { owner: '' }) };
  assert.equal(projectForgeTask(cleared).owner, '');
  assert.equal(cleared.assignee.login, 'Alice');
  assert.equal(projectForgeTask({ ...issue, body: 'No metadata' }).owner, 'Alice');
});
