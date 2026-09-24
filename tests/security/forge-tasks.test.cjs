const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const filename = path.resolve(__dirname, '../../src/lib/forge/tasks.ts');
const loaded = new Module(filename, module);
loaded._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const { projectForgeTask, needsAttention, taskDate } = loaded.exports;
const issue = { number: 42, title: 'Existing task', state: 'open', updated_at: '2026-09-23T10:00:00Z', comments: 3 };
const body = metadata => `Keep this discussion.\n\n\`\`\`channel-task\n${JSON.stringify(metadata)}\n\`\`\``;

test('preserves long descriptions, trailing metadata and long next actions without projection truncation', () => {
  const description = 'Existing discussion. '.repeat(4000) + 'Final paragraph.';
  const metadata = { status: 'waiting', priority: 'high', owner: 'Owner '.repeat(50),
    dueDate: '2026-09-24', followUpDate: '2026-09-23', nextAction: 'Follow up. '.repeat(100) + 'Final action.' };
  const title = 'Long title '.repeat(40);
  const task = projectForgeTask({ ...issue, title, body: description + '\n\n' + body(metadata) });
  assert.equal(task.description, description + '\n\nKeep this discussion.');
  assert.equal(task.title, title);
  assert.equal(task.number, issue.number);
  assert.equal(task.comments, issue.comments);
  for (const [key, value] of Object.entries(metadata)) assert.equal(task[key], value, key);
  assert.equal(task.warning, '');
  assert.equal(projectForgeTask({ ...issue, body: description }).description, description);
  assert.equal(projectForgeTask({ ...issue, body: body(metadata) }).nextAction, metadata.nextAction);
});

test('projects existing issue identity, discussion and follow-up metadata', () => {
  const task = projectForgeTask({ ...issue, body: body({ status: 'waiting', priority: 'high', owner: 'Sam',
    dueDate: '2026-09-24', followUpDate: '2026-09-23', nextAction: 'Ask for update', sourceUrl: 'https://example.slack.com/archives/C123/p456' }) });
  assert.equal(task.number, 42);
  assert.equal(task.comments, 3);
  assert.equal(task.description, 'Keep this discussion.');
  assert.equal(task.status, 'waiting');
  assert.equal(task.owner, 'Sam');
  assert.equal(task.nextAction, 'Ask for update');
  assert.equal(needsAttention(task, '2026-09-23'), true);
  assert.equal(task.warning, '');
});

test('Forge closed state is authoritative and pull requests are excluded', () => {
  const closed = projectForgeTask({ ...issue, state: 'closed', body: body({ status: 'blocked', priority: 'critical' }) });
  assert.equal(closed.status, 'done');
  assert.equal(needsAttention(closed, '2026-09-23'), false);
  const open = projectForgeTask({ ...issue, body: body({ status: 'done' }) });
  assert.equal(open.status, 'backlog');
  assert.match(open.warning, /still open/);
  assert.equal(projectForgeTask({ ...issue, pull_request: { url: 'https://example.test/pr/42' } }), null);
  assert.equal(projectForgeTask({ ...issue, number: -1 }), null);
});

test('ambiguous metadata, invalid dates and unsafe links remain visibly invalid', () => {
  const ambiguous = projectForgeTask({ ...issue, body: body({ status: 'blocked' }) + '\n' + body({ status: 'waiting' }) });
  assert.equal(ambiguous.status, 'backlog');
  assert.match(ambiguous.warning, /Multiple/);
  const malformed = projectForgeTask({ ...issue, body: '```channel-task\nnot json\n```' });
  assert.match(malformed.warning, /review/);
  const invalid = projectForgeTask({ ...issue, body: body({ dueDate: '2026-02-30', sourceUrl: 'https://slack.com.attacker.test/a' }) });
  assert.equal(invalid.dueDate, '');
  assert.equal(invalid.sourceUrl, '');
  assert.match(invalid.warning, /Invalid date/);
  assert.equal(taskDate('2028-02-29'), '2028-02-29');
  assert.equal(taskDate('2026-02-29'), '');
  assert.equal(projectForgeTask({ ...issue, body: body({ sourceUrl: 'https://user:password@slack.com/a' }) }).sourceUrl, '');
});
