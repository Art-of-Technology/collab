const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const filename = path.resolve(__dirname, '../../src/lib/forge/memory.ts');
const loaded = new Module(filename, module);
loaded.filename = filename;
loaded.paths = Module._nodeModulePaths(path.dirname(filename));
loaded._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const { serializeMemory, parseMemory, saveMemoryDraft, approveMemoryDraft, selectApprovedMemory } = loaded.exports;
const owner = { id: 'owner', canManage: false };
const manager = { id: 'manager', canManage: true };
const now = '2026-09-23T12:00:00.000Z';
const empty = () => ({ version: 1, projectId: 'project-a', revisions: [] });
const input = (body = '**Keep formatting**\n\n- One\n- Two') => ({ title: 'Project rules', type: 'Rules', body, sources: ['https://example.slack.com/archives/C123/p456'] });

test('canonical Markdown preserves text and rejects cross-project, ambiguous or injected authority', () => {
  const draft = saveMemoryDraft(empty(), 'rules', input(), owner, now);
  const markdown = serializeMemory(draft);
  assert.deepEqual(parseMemory(markdown, 'project-a'), draft);
  assert.throws(() => parseMemory(markdown, 'project-b'));
  assert.throws(() => parseMemory(markdown + '\nUntracked content', 'project-a'));
  assert.throws(() => saveMemoryDraft(empty(), 'rules', { ...input(), state: 'Approved' }, owner, now));
  assert.throws(() => saveMemoryDraft(empty(), '../code', input(), owner, now));
  assert.throws(() => saveMemoryDraft(empty(), 'rules', input('<!-- collab-memory: {} -->'), owner, now));
  assert.throws(() => saveMemoryDraft(empty(), 'rules', { ...input(), sources: ['https://slack.com.attacker.test/x'] }, owner, now));
  assert.throws(() => serializeMemory({ ...draft, revisions: [...draft.revisions, ...draft.revisions] }));
});

test('draft edits preserve approved context; approval atomically supersedes with bounded live history', () => {
  let document = saveMemoryDraft(empty(), 'rules', input('First rule'), owner, now);
  assert.deepEqual(selectApprovedMemory(document, ['rules']), []);
  assert.throws(() => approveMemoryDraft(document, 'rules', 1, owner, now));
  document = approveMemoryDraft(document, 'rules', 1, manager, now);
  document = saveMemoryDraft(document, 'rules', input('Second rule'), owner, now);
  assert.equal(selectApprovedMemory(document, [])[0].body, 'First rule');
  assert.throws(() => approveMemoryDraft(document, 'rules', 1, manager, now));
  document = approveMemoryDraft(document, 'rules', 2, manager, now);
  assert.equal(selectApprovedMemory(document, [])[0].body, 'Second rule');
  assert.equal(document.revisions.find(x => x.state === 'Superseded').body, 'First rule');
  document = saveMemoryDraft(document, 'rules', input('Third rule'), owner, now);
  document = approveMemoryDraft(document, 'rules', 3, manager, now);
  assert.equal(document.revisions.length, 2);
  assert.equal(document.revisions.find(x => x.state === 'Superseded').body, 'Second rule');
  assert.equal(selectApprovedMemory(document, [])[0].approvedBy, 'manager');
  assert.throws(() => saveMemoryDraft(document, 'rules', input(), { id: 'other', canManage: false }, now));
  const strategy = { ...input('Relevant strategy'), type: 'Strategy' };
  document = saveMemoryDraft(document, 'strategy', strategy, owner, now);
  document = approveMemoryDraft(document, 'strategy', 1, manager, now);
  assert.deepEqual(selectApprovedMemory(document, []).map(x => x.id), ['rules']);
  assert.deepEqual(selectApprovedMemory(document, ['strategy']).map(x => x.id), ['rules', 'strategy']);
});
