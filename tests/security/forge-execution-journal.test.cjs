const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { execFileSync } = require('node:child_process');

const target = { origin: 'https://forge.example.test', repositoryId: 4, issueNumber: 12, projectId: 'project', workspaceId: 'workspace' };
async function fixture(t) {
  const api = await import('../../src/lib/forge/execution-journal.mjs');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'collab-ready-journal-'));
  const previous = [process.env.COLLAB_READY_JOURNAL_DIR, process.env.COLLAB_READY_JOURNAL_ID];
  process.env.COLLAB_READY_JOURNAL_DIR = directory;
  process.env.COLLAB_READY_JOURNAL_ID = await api.initializeExecutionJournal(directory);
  t.after(() => {
    for (const [index, key] of ['COLLAB_READY_JOURNAL_DIR', 'COLLAB_READY_JOURNAL_ID'].entries()) {
      if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index];
    }
    fs.rmSync(directory, { recursive: true, force: true });
  });
  return { api, directory };
}

test('explicit empty authority persists receipts and rejects mismatched tenant bindings', async t => {
  const { api, directory } = await fixture(t);
  await assert.rejects(api.initializeExecutionJournal(directory));
  await api.withExecutionJournal(target, async journal => {
    assert.equal(journal.receipt, null);
    await journal.write({ id: 'attempt', state: 'LAUNCHING' });
  });
  await api.withExecutionJournal(target, async journal => assert.deepEqual(journal.receipt, { id: 'attempt', state: 'LAUNCHING' }));
  await assert.rejects(api.withExecutionJournal({ ...target, projectId: 'foreign' }, async () => assert.fail('foreign callback')));
  const record = fs.readdirSync(directory).find(name => name !== 'authority.json' && name.endsWith('.json'));
  assert.equal(fs.statSync(path.join(directory, record)).mode & 0o777, 0o600);
});

test('missing, corrupt, replaced and symlinked authority cannot authorize a callback', async t => {
  const { api, directory } = await fixture(t);
  const file = path.join(directory, 'authority.json'), bytes = fs.readFileSync(file);
  let calls = 0;
  const use = () => api.withExecutionJournal(target, async () => calls++);
  fs.unlinkSync(file); await assert.rejects(use());
  fs.writeFileSync(file, '{'); await assert.rejects(use());
  fs.writeFileSync(file, JSON.stringify({ format: 'collab-ready-journal-v1', authorityId: '00000000-0000-0000-0000-000000000000' }));
  await assert.rejects(use());
  const alternate = path.join(directory, 'alternate'); fs.writeFileSync(alternate, bytes);
  fs.unlinkSync(file); fs.symlinkSync(alternate, file); await assert.rejects(use());
  fs.unlinkSync(file); fs.writeFileSync(file, bytes);
  fs.chmodSync(directory, 0o755); await assert.rejects(use()); fs.chmodSync(directory, 0o700);
  assert.equal(calls, 0);
});

test('exclusive claim serializes competing callers without expiration or replacement', async t => {
  const { api } = await fixture(t);
  let entered, release, callbacks = 0;
  const held = new Promise(resolve => { entered = resolve; });
  const wait = new Promise(resolve => { release = resolve; });
  const first = api.withExecutionJournal(target, async journal => {
    callbacks++; entered(); await wait; await journal.write({ id: 'one', state: 'LAUNCHING' });
  });
  await held;
  await assert.rejects(api.withExecutionJournal(target, async () => callbacks++), { code: 'EEXIST' });
  release(); await first;
  assert.equal(callbacks, 1);
  await api.withExecutionJournal(target, async journal => assert.equal(journal.receipt.state, 'LAUNCHING'));
});

test('a crashed process leaves an exclusive claim that restart cannot erase', async t => {
  const { api, directory } = await fixture(t);
  const moduleUrl = pathToFileURL(path.resolve(__dirname, '../../src/lib/forge/execution-journal.mjs')).href;
  execFileSync(process.execPath, ['--input-type=module', '-e',
    `const {withExecutionJournal}=await import(${JSON.stringify(moduleUrl)});await withExecutionJournal(${JSON.stringify(target)},async()=>process.exit(0));`], { env: process.env });
  await assert.rejects(api.withExecutionJournal(target, async () => assert.fail('restarted callback')), { code: 'EEXIST' });
  assert.equal(fs.readdirSync(directory).filter(name => name.endsWith('.lock')).length, 1);
});

test('an uncertain journal write keeps its claim and blocks re-entry', async t => {
  const { api, directory } = await fixture(t);
  await assert.rejects(api.withExecutionJournal(target, async journal => {
    const circular = {}; circular.self = circular; await journal.write(circular);
  }));
  await assert.rejects(api.withExecutionJournal(target, async () => assert.fail('uncertain callback')), { code: 'EEXIST' });
  assert.equal(fs.readdirSync(directory).filter(name => name.endsWith('.lock')).length, 1);
});
