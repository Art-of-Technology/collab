const { before, beforeEach, after } = require('node:test');
const { createRequire } = require('node:module');
const { Prisma } = require('@prisma/client');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { assert, test, load } = require('./helpers.cjs');
const { seatsDatabase } = require('../agents/seats-db.cjs');
const { JSDOM } = createRequire(require.resolve('isomorphic-dompurify'))('jsdom');

const now = new Date('2026-11-21T12:00:00Z');
const date = days => new Date(now.getTime() + days * 86400000);
const plain = value => JSON.parse(JSON.stringify(value));
let db, raw, loadNeedsYou;
let forgeBindings = [];

before(async () => {
  db = await seatsDatabase(async prisma => {
    await prisma.user.createMany({ data: ['viewer', 'other', 'seat-user', 'other-seat-user', 'foreign-owner'].map(id => ({ id, name: id })) });
    await prisma.workspace.createMany({ data: [
      { id: 'work', name: 'Work', slug: 'work', ownerId: 'viewer' },
      { id: 'foreign', name: 'Foreign', slug: 'foreign', ownerId: 'foreign-owner' },
    ] });
    await prisma.project.createMany({ data: [
      { id: 'project', workspaceId: 'work', name: 'Release', slug: 'release', issuePrefix: 'REL' },
      { id: 'dormant', workspaceId: 'work', name: 'Dormant', slug: 'dormant', issuePrefix: 'DOR' },
      { id: 'archived', workspaceId: 'work', name: 'Archived', slug: 'archived', issuePrefix: 'ARC', isArchived: true },
      { id: 'foreign-project', workspaceId: 'foreign', name: 'Foreign', slug: 'foreign', issuePrefix: 'FOR' },
    ] });
    await prisma.projectStatus.create({ data: { id: 'foreign-status', projectId: 'foreign-project', name: 'open', displayName: 'Open', order: 1 } });
  });
  raw = db.prisma;
  await raw.agentSeat.createMany({ data: [
    { id: 'owned-seat', workspaceId: 'work', projectId: 'project', userId: 'seat-user', ownerId: 'viewer', role: 'developer', name: 'Developer' },
    { id: 'other-seat', workspaceId: 'work', projectId: 'dormant', userId: 'other-seat-user', ownerId: 'other', role: 'developer', name: 'Other seat' },
  ] });
  const visibility = load('src/lib/issue-visibility.ts').issueVisibilityExtension(Prisma.dmmf.datamodel.models);
  const prisma = raw.$extends(visibility);
  const permissions = load('src/lib/permissions.ts', { './prisma': { prisma } }, { console });
  ({ loadNeedsYou } = load('src/lib/dashboard/needs-you.ts', {
    'server-only': {}, '@/lib/prisma': { prisma }, '@/lib/permissions': permissions,
    '@/lib/github/access': load('src/lib/github/access.ts', { '@/lib/post-access': load('src/lib/post-access.ts') }),
    '@/lib/forge/reader': { readForgeBindings: async () => forgeBindings },
  }, { URL, Date }));
});

beforeEach(async () => {
  forgeBindings = [];
  await raw.issueActivity.deleteMany();
  await raw.issue.deleteMany();
  await raw.gitConnection.deleteMany();
  await raw.repository.deleteMany();
});

after(() => db?.stop());

const issue = (id, data = {}) => raw.issue.create({ data: {
  id, title: id, issueKey: id.toUpperCase(), workspaceId: 'work', projectId: 'project',
  assigneeId: 'seat-user', createdAt: date(-60), updatedAt: date(-2), ...data,
} });

async function waiting(id, { askedUser = 'other', pullRequest, days = -2, finishRunId, ask, ...issueData } = {}) {
  const target = await issue(id, issueData);
  const seatUser = target.projectId === 'dormant' ? 'other-seat-user' : 'seat-user';
  const endedAt = date(days);
  const run = await raw.agentRun.create({ data: {
    id: `run-${id}`, workspaceId: 'work', issueId: id, userId: seatUser,
    seatId: seatUser === 'seat-user' ? 'owned-seat' : 'other-seat',
    generation: 'first', runner: 'test', state: 'finished', outcome: pullRequest ? 'in_review' : 'blocked',
    startedAt: date(days - 0.5), endedAt,
  } });
  await raw.issueActivity.create({ data: {
    workspaceId: 'work', projectId: target.projectId, itemId: id, action: 'AGENT_RUN_FINISHED',
    userId: seatUser, createdAt: endedAt,
    details: JSON.stringify({ runId: finishRunId || run.id, askedUser, pullRequest, nextStep: 'Read the result.', ask }),
  } });
  return run;
}

const seatComment = (issueId, content, data = {}) => raw.issueComment.create({ data: {
  issueId, content, authorId: 'seat-user', createdAt: date(-2), ...data,
} });

test("the question is the seat's own last comment since its run ended, and nobody else's", async () => {
  await waiting('current');
  await waiting('fallback');
  await waiting('read-denied', { statusId: 'foreign-status' });
  const question = '<strong>Check the result</strong> ' + 'x'.repeat(2000) + '\nExpected reply: `yes`.';
  await seatComment('current', 'Earlier request', { id: 'earlier', createdAt: date(-3) });
  await seatComment('current', 'Same time, older comment', { id: 'first' });
  await seatComment('current', question, { id: 'last' });
  await seatComment('current', 'Somebody else at the cutoff', { id: 'newest', authorId: 'other' });
  // Seats write their question seconds before the run ends; the run started at date(-2.5).
  await waiting('before-end');
  await seatComment('before-end', 'Asked during the run. Reply `ship` (recommended) or `hold`.', { createdAt: new Date(date(-2).getTime() - 5000) });
  await seatComment('before-end', 'Somebody else during the run', { authorId: 'other', createdAt: date(-2.2) });
  await seatComment('fallback', 'Reply `stale`.', { createdAt: date(-3) });
  await seatComment('read-denied', 'Reply `private`.');
  const { items } = await read();
  assert.deepEqual(Object.fromEntries(items.map(row => [row.issue.id, row.question])), {
    current: question.slice(0, 2000), fallback: 'Read the result.',
    'before-end': 'Asked during the run. Reply `ship` (recommended) or `hold`.',
  });
  assert.deepEqual(items.find(row => row.issue.id === 'before-end').options, ['ship', 'hold']);
  assert.deepEqual(items.find(row => row.issue.id === 'current').options, ['yes']);
  await seatComment('current', 'Later reply by somebody else', { authorId: 'other', createdAt: date(-1) });
  assert.deepEqual((await read()).items.map(row => row.issue.id).sort(), ['before-end', 'fallback']);
});

test('a row is a question only when that comment has reply words; otherwise it waits on the person', async () => {
  await waiting('no-comment', { days: -6 });
  await waiting('note', { days: -5 });
  await waiting('real-question', { days: -3 });
  await waiting('real-review', { days: -4, pullRequest: 'team/repo#7' });
  await seatComment('note', 'No new assignment. The next slice follows the agreed order.');
  await seatComment('real-question', 'Expected reply after the check: `CLB-938 used`.');
  await seatComment('real-review', 'Reply `yes` or `wait`.');
  const result = await read();
  assert.deepEqual(result.items.map(row => [row.issue.id, row.ask, row.canAct]), [
    ['real-review', 'here', true], ['real-question', 'here', true],
    ['no-comment', 'none', false], ['note', 'none', false],
  ]);
  assert.deepEqual(result.oldestQuestion, { seatName: 'Developer', since: date(-4).toISOString() });
  assert.deepEqual(result.counts, { question: 3, review: 1, failed: 0, due: 0 });
});

test('a reply that belongs on another issue names that issue, and only one the viewer may read', async () => {
  await issue('visible-target', { issueKey: 'ADS-52', projectId: 'dormant' });
  await issue('hidden-target', { issueKey: 'CLB-933', statusId: 'foreign-status' });
  await issue('foreign-target', { issueKey: 'FOR-5', workspaceId: 'foreign', projectId: 'foreign-project' });
  await issue('trashed-target', { issueKey: 'CLB-15', deletedAt: date(-1) });
  const destinations = [
    ['visible', 'Reply on ADS-52 with `yes`.'],
    ['hidden', 'Give `CLB-933 used` as a comment on CLB-933.'],
    ['foreign', 'Reply on FOR-5 with `yes`.'],
    ['trashed', 'Reply on `CLB-15` with `yes`.'],
    ['missing', 'Comment `yes` on CLB-12.\nExpected reply: `yes`.'],
    ['ambiguous', 'Reply on ADS-52 or CLB-933 with `yes`.'],
    ['own', 'Reply on CLB-20 with `yes`.'],
    ['aside', 'I left a comment on ADS-52 about the schema.\nReply `yes` to merge this pull request, or `wait`.'],
    ['in-reply', 'Please decide.\nReply with `yes` or `wait` in a comment on ADS-52.'],
  ];
  for (const [id, content] of destinations) {
    await waiting(id, { issueKey: id === 'own' ? 'CLB-20' : id.toUpperCase() });
    await seatComment(id, content);
  }
  const rows = new Map((await read()).items.map(row => [row.issue.id, row]));
  assert.equal(rows.get('visible').ask, 'elsewhere');
  assert.equal(rows.get('visible').canAct, false);
  assert.deepEqual(rows.get('visible').replyOn, { id: 'visible-target', issueKey: 'ADS-52' });
  assert.equal(rows.get('own').ask, 'here');
  assert.equal(rows.get('aside').ask, 'here');
  assert.equal(rows.get('aside').replyOn, null);
  assert.deepEqual(rows.get('aside').options, ['yes', 'wait']);
  assert.deepEqual(rows.get('in-reply').replyOn, { id: 'visible-target', issueKey: 'ADS-52' });
  for (const [id, key] of [['hidden', 'CLB-933'], ['foreign', 'FOR-5'], ['trashed', 'CLB-15'], ['missing', 'CLB-12'],
    ['ambiguous', 'CLB-933']]) {
    const row = rows.get(id);
    assert.equal(row.ask, 'none', id);
    assert.equal(row.replyOn, null, id);
    assert.deepEqual(row.options, [], id);
    assert.ok(!JSON.stringify(row).includes(key), id);
  }
});

test('reply words in backticks become options, at most four, and a bare key or a path does not', async () => {
  await waiting('options');
  await seatComment('options', [
    'Compare the `background` before choosing.',
    'Expected reply: `CLB-933`, `src/lib/dashboard/needs-you.ts`, `src\\file.ts`, `f2343285`, `' + 'x'.repeat(41) + '`.',
    '`CLB-938 used`, `CLB-938 used`, `yes`, `no`, `later`, or `extra`.',
  ].join('\n'));
  assert.deepEqual((await read()).items[0].options, ['CLB-938 used', 'yes', 'no', 'later']);
});

test('the reply word the seat marked as recommended or suggested is the suggested answer', async () => {
  await waiting('listed');
  await waiting('inline');
  await waiting('none');
  await waiting('bare-list');
  await seatComment('bare-list', 'Please choose.\n1. `wait`\n\n2. `go` (suggested)');
  await seatComment('listed', [
    'Please choose how to resolve the contract gap.',
    '',
    '1. **classify** (recommended, 2 minutes). Reply `classify` to approve expanding the work card.',
    '2. **revise** (2 minutes). Reply `revise` to approve revising contract 4.',
    '',
    'The next developer session can take the selected path.',
  ].join('\n'));
  await seatComment('inline', 'Reply `revise` or `classify` (suggested).');
  await seatComment('none', 'Expected reply after the check: `CLB-938 used`.');
  const rows = Object.fromEntries((await read()).items.map(row => [row.issue.id, [row.options, row.suggested]]));
  assert.deepEqual(rows, {
    listed: [['classify', 'revise'], 'classify'],
    inline: [['revise', 'classify'], 'classify'],
    none: [['CLB-938 used'], null],
    'bare-list': [['wait', 'go'], 'go'],
  });
});

const migration = { question: "Run the migration in tonight's window, or split it into two releases?", options: ['window', 'split'], suggested: 'split' };
const column = { question: 'Keep the old column for one release?', options: ['keep', 'drop'] };
const webhook = { kind: 'hands', steps: '1. Open the repository settings.\n2. Add the pull request event to the webhook.', doneWord: 'webhook added' };

test('declared stops: a finish that says what it asks is shown from its fields, and its reply stays on its issue', async () => {
  await issue('visible-target', { issueKey: 'ADS-52', projectId: 'dormant' });
  await waiting('one-decision', { days: -5, ask: { kind: 'decision', questions: [migration] } });
  await waiting('two-decisions', { days: -4, pullRequest: 'team/repo#7', ask: { kind: 'decision', questions: [migration, column] } });
  await waiting('hands', { days: -3, ask: webhook });
  await waiting('unsuggested', { days: -2, ask: { kind: 'decision', questions: [column] } });
  // Nothing is read out of the seat's comment once the finish says what it asks.
  for (const id of ['one-decision', 'two-decisions', 'hands', 'unsuggested']) await seatComment(id, 'Reply on ADS-52 with `yes` (recommended) or `no`.');
  const { items, counts } = await read();
  assert.deepEqual(items.map(row => [row.issue.id, row.kind, row.ask, row.canAct, row.options, row.suggested, row.replyOn]), [
    ['one-decision', 'question', 'here', true, ['window', 'split'], 'split', null],
    ['two-decisions', 'review', 'issue', false, [], null, null],
    ['unsuggested', 'question', 'here', true, ['keep', 'drop'], null, null],
    ['hands', 'question', 'none', false, [], null, null],
  ]);
  // Each row carries the finish it shows, which is what an answer from Home is bound to.
  assert.deepEqual(items.map(row => row.runId), ['one-decision', 'two-decisions', 'unsuggested', 'hands'].map(id => `run-${id}`));
  assert.deepEqual(counts, { question: 3, review: 1, failed: 0, due: 0 });
  const questions = Object.fromEntries(items.map(row => [row.issue.id, row.question]));
  assert.deepEqual(questions, {
    'one-decision': migration.question, unsuggested: column.question,
    'two-decisions': `1. ${migration.question}\nReply words: window, split. Suggested: split.\n\n2. ${column.question}\nReply words: keep, drop.`,
    hands: `${webhook.steps}\n\nWhen it is done, reply: webhook added`,
  });
  assert.ok(!JSON.stringify(items).includes('ADS-52'));
});

test('declared stops: what a finish asks is shown only to a viewer who may read its issue', async () => {
  const ask = { kind: 'decision', questions: [migration] };
  await waiting('unreadable-status', { statusId: 'foreign-status', ask });
  await waiting('trashed', { deletedAt: date(-1), ask: webhook });
  await waiting('wrong-workspace', { workspaceId: 'foreign', ask });
  await waiting('readable', { ask });
  const result = await read();
  assert.deepEqual(result.items.map(row => [row.issue.id, row.question, row.options]), [['readable', migration.question, ['window', 'split']]]);
  assert.deepEqual(result.counts, { question: 1, review: 0, failed: 0, due: 0 });
  assert.ok(!JSON.stringify(result).includes('webhook'));
  // Not a member of the workspace, and a member who may not view issues: neither is given a row.
  assert.deepEqual(plain(await loadNeedsYou({ actorId: 'foreign-owner', workspaceId: 'work', scope: 'all', now })), { kind: 'denied' });
  await raw.workspaceMember.create({ data: { workspaceId: 'work', userId: 'other', role: 'VIEWER' } });
  try {
    assert.deepEqual(plain(await loadNeedsYou({ actorId: 'other', workspaceId: 'work', scope: 'all', now })), { kind: 'denied' });
  } finally {
    await raw.workspaceMember.delete({ where: { userId_workspaceId: { userId: 'other', workspaceId: 'work' } } });
  }
});

test('declared stops: a finish without ask, or with one that was not checked, is read from the comment as before', async () => {
  await waiting('legacy');
  await waiting('unchecked', { ask: { kind: 'decision', questions: [{ question: { html: '<b>Now?</b>' }, options: 'yes' }] } });
  await waiting('unknown-kind', { ask: { kind: 'status', steps: 'Nothing new.' } });
  for (const id of ['legacy', 'unchecked', 'unknown-kind']) await seatComment(id, 'Reply `ship` (recommended) or `hold`.');
  assert.deepEqual((await read()).items.map(row => [row.issue.id, row.ask, row.question, row.options, row.suggested]),
    ['legacy', 'unchecked', 'unknown-kind'].map(id => [id, 'here', 'Reply `ship` (recommended) or `hold`.', ['ship', 'hold'], 'ship']));
});

function failed(id, { assigneeId, leaseUntil = date(-1), state = 'running', ...data } = {}) {
  return issue(id, { assigneeId, ...data, agentRuns: { create: {
    id: `run-${id}`, workspaceId: 'work', userId: 'other-seat-user', seatId: 'other-seat',
    generation: 'first', runner: 'test', state, startedAt: date(-3), leaseUntil,
  } } });
}

async function read(options = {}) {
  const result = await loadNeedsYou({ actorId: 'viewer', workspaceId: 'work', scope: 'all', now, ...options });
  assert.equal(result?.kind, 'ready');
  return plain(result);
}

test('a question leaves the list once someone other than the seat has commented', async () => {
  await waiting('question');
  await waiting('review', { pullRequest: 'team/repo#7' });
  await raw.issueComment.createMany({ data: [
    { issueId: 'question', authorId: 'seat-user', content: 'Seat update', createdAt: date(-1) },
    { issueId: 'question', authorId: 'other', content: 'Earlier context', createdAt: date(-2) },
  ] });
  assert.deepEqual((await read()).items.map(item => item.kind), ['question', 'review']);
  await raw.issueComment.createMany({ data: ['question', 'review'].map(issueId =>
    ({ issueId, authorId: 'other', content: 'Answer', createdAt: date(-0.5) })) });
  const result = await read();
  assert.deepEqual(result.items, []);
  assert.deepEqual(result.waitingSeats, []);
});

test("declared stops: an answer written after the seat's question clears the row, also when it came before the finish", async () => {
  // Each run started at date(-2.5) and finished at date(-2).
  const says = (issueId, authorId, days, content) => raw.issueComment.create({ data: { issueId, authorId, content, createdAt: date(days) } });
  const question = 'Run the migration in tonight\'s window, or split it? Reply `window` or `split`.';
  for (const id of ['early', 'before', 'between', 'silent', 'noted']) await waiting(id);
  await says('early', 'seat-user', -2.2, question);
  await says('early', 'other', -2.1, 'split');
  // Written before the seat's question, also between two of its comments: not an answer to it.
  await says('before', 'other', -2.3, 'Is the backup done?');
  await says('before', 'seat-user', -2.2, question);
  await says('between', 'seat-user', -2.4, 'The backup is done.');
  await says('between', 'other', -2.3, 'Thanks.');
  await says('between', 'seat-user', -2.2, question);
  // The seat wrote nothing in its run, only before it: the finish is the boundary, as it was.
  await says('silent', 'seat-user', -3, 'Picked this up.');
  await says('silent', 'other', -2.1, 'Any news?');
  // What the seat wrote after the finish moves nothing: the answer came after its last comment of the run.
  await says('noted', 'seat-user', -2.2, question);
  await says('noted', 'other', -2.1, 'window');
  await says('noted', 'seat-user', -1, 'Thanks, I will take it from here.');
  const result = await read();
  assert.deepEqual(result.items.map(row => row.issue.id), ['before', 'between', 'silent']);
  assert.deepEqual(result.counts, { question: 3, review: 0, failed: 0, due: 0 });
});

test('a question of an issue that was reassigned since the run is not listed', async () => {
  await waiting('different-assignee', { assigneeId: 'other' });
  await waiting('returned-to-seat');
  await waiting('same-assignment');
  await waiting('old-facts', { finishRunId: 'different-run' });
  await waiting('new-run');
  await raw.issueAssignee.createMany({ data: [
    { issueId: 'returned-to-seat', userId: 'seat-user', assignedAt: date(-4), approvedAt: date(-1) },
    { issueId: 'same-assignment', userId: 'seat-user', assignedAt: date(-2) },
  ] });
  await raw.agentRun.create({ data: { issueId: 'new-run', workspaceId: 'work', userId: 'seat-user',
    seatId: 'owned-seat', generation: 'second', runner: 'test', startedAt: date(-1) } });
  assert.deepEqual((await read()).items.map(item => item.issue.id), ['same-assignment']);
});

test('a row of an issue the viewer may not read is never returned', async () => {
  await waiting('unreadable-status', { statusId: 'foreign-status' });
  await waiting('trashed', { deletedAt: date(-1) });
  await waiting('wrong-workspace', { workspaceId: 'foreign' });
  await failed('archived-failed', { projectId: 'archived' });
  await failed('unreadable-failed', { statusId: 'foreign-status' });
  await issue('unreadable-due', { assigneeId: 'viewer', dueDate: date(-1), projectId: 'foreign-project' });
  const result = await read();
  assert.deepEqual(result.counts, { question: 0, review: 0, failed: 0, due: 0 });
  assert.deepEqual(result.byProject, {});
  assert.deepEqual(result.items, []);
  assert.deepEqual(result.waitingSeats, []);
  assert.equal(result.oldestQuestion, null);
  assert.equal((await loadNeedsYou({ actorId: 'foreign-owner', workspaceId: 'work', scope: 'all', now })).kind, 'denied');
});

test("My work keeps rows that name the viewer, the viewer's seats or the viewer's issues", async () => {
  await waiting('owned-seat');
  await waiting('asked-viewer', { askedUser: 'viewer', projectId: 'dormant', assigneeId: 'other-seat-user' });
  await waiting('outside-scope', { projectId: 'dormant', assigneeId: 'other-seat-user' });
  await failed('assigned-to-viewer', { assigneeId: 'viewer', projectId: 'dormant' });
  await failed('outside-scope-failed', { assigneeId: 'other', projectId: 'dormant' });
  await issue('viewer-due', { assigneeId: 'viewer', dueDate: date(1) });
  await issue('somebody-elses-due', { assigneeId: 'other', dueDate: date(1) });

  assert.deepEqual((await read({ scope: 'mine' })).items.map(item => item.issue.id).sort(),
    ['asked-viewer', 'assigned-to-viewer', 'owned-seat', 'viewer-due']);
  assert.equal((await read()).counts.due, 1);
});

test('the chosen kind is applied before the 20 rows are taken, and counts stay exact', async () => {
  for (let i = 0; i < 21; i++) await waiting(`question-${i}`, { days: -30 + i });
  await seatComment('question-0', 'Reply `yes`.');
  await waiting('review', { pullRequest: 'team/repo#7' });
  await failed('lease-expired', { projectId: 'dormant' });
  await failed('state-lost', { state: 'lost', leaseUntil: null, projectId: 'dormant' });
  await issue('soon', { assigneeId: 'viewer', dueDate: date(6) });
  await issue('boundary', { assigneeId: 'viewer', dueDate: date(7) });
  await issue('done', { assigneeId: 'viewer', status: ' Completed ', dueDate: date(1) });

  const all = await read();
  assert.equal(all.items.length, 20);
  assert.deepEqual(all.items.map(item => item.issue.id), Array.from({ length: 20 }, (_, i) => `question-${i}`));
  assert.deepEqual(all.counts, { question: 21, review: 1, failed: 2, due: 1 });
  assert.deepEqual(all.byProject, { project: 23, dormant: 2 });
  assert.deepEqual(all.oldestQuestion, { seatName: 'Developer', since: date(-30).toISOString() });
  const reviews = await read({ kind: 'review' });
  assert.deepEqual(reviews.items.map(item => item.issue.id), ['review']);
  assert.deepEqual(reviews.counts, all.counts);
  assert.deepEqual(reviews.byProject, all.byProject);
  assert.deepEqual(reviews.oldestQuestion, all.oldestQuestion);
  const failures = await read({ kind: 'failed' });
  assert.deepEqual(failures.items.map(item => [item.runId, item.since]), [
    ['run-state-lost', date(-3).toISOString()], ['run-lease-expired', date(-1).toISOString()],
  ]);
  assert.equal((await raw.agentRun.findUnique({ where: { id: 'run-lease-expired' } })).state, 'running');
});

test('a due issue of a dormant project is not listed', async () => {
  await issue('dormant-due', { assigneeId: 'viewer', projectId: 'dormant', updatedAt: date(-31), dueDate: date(-1) });
  await waiting('dormant-question', { projectId: 'dormant', assigneeId: 'other-seat-user', updatedAt: date(-31) });
  await issue('trashed-change', { projectId: 'dormant', deletedAt: date(-1) });
  await issue('hidden-change', { projectId: 'dormant', statusId: 'foreign-status' });
  assert.deepEqual((await read()).items.map(item => item.issue.id), ['dormant-question']);
  await issue('visible-change', { projectId: 'dormant', assigneeId: 'other', updatedAt: date(-30) });
  assert.deepEqual((await read({ scope: 'mine' })).items.map(item => item.issue.id), ['dormant-due']);
});

test('canAct follows the permissions the comment and clear routes check', async () => {
  await raw.workspaceMember.create({ data: { workspaceId: 'work', userId: 'other', role: 'VIEWER' } });
  const grant = permission => raw.rolePermission.create({ data: { workspaceId: 'work', role: 'VIEWER', permission } });
  await grant('VIEW_TASKS');
  await waiting('legacy-question');
  await seatComment('legacy-question', 'Reply `yes`.');
  await waiting('forge-question', { projectId: 'dormant', assigneeId: 'other-seat-user' });
  await seatComment('forge-question', 'Reply `yes`.', { authorId: 'other-seat-user' });
  await waiting('review', { pullRequest: 'team/repo#7' });
  await failed('lost-run');
  await issue('due-item', { assigneeId: 'other', dueDate: date(1) });
  forgeBindings = [{ workspaceId: 'work', projectId: 'dormant' }];

  const panel = load('src/app/(main)/[workspaceId]/dashboard/components/NeedsYouPanel.tsx', {
    react: React, 'react/jsx-runtime': require('react/jsx-runtime'),
    'next/navigation': { useRouter: () => ({}) },
  }).default;
  // The browser comment route accepts issue readers on legacy projects. Clearing also needs ASSIGN_TASK.
  for (const canAssign of [false, true]) {
    if (canAssign) await grant('ASSIGN_TASK');
    const data = await read({ actorId: 'other' });
    assert.deepEqual(Object.fromEntries(data.items.map(row => [row.issue.id, row.canAct])), {
      'legacy-question': true, 'forge-question': false, review: false, 'lost-run': canAssign, 'due-item': false,
    });

    const document = JSDOM.fragment(renderToStaticMarkup(React.createElement(panel, {
      data, workspaceSlug: 'work', now: now.toISOString(), kindHrefs: { all: '/work/dashboard' },
    })));
    const controls = Object.fromEntries([...document.querySelectorAll('li')].map(row => [
      row.querySelector('p').textContent,
      [...row.querySelectorAll('button, a')].map(control => [control.localName, control.textContent]),
    ]));
    const openIssue = [['a', 'Open issue']];
    assert.deepEqual(controls, {
      'legacy-question': [['button', 'Answer']],
      'forge-question': [['a', 'Open issue'], ['button', 'Show details']],
      review: [['a', 'Open issue'], ['button', 'Show details']],
      'lost-run': canAssign ? [['button', 'Session has stopped: clear run']] : openIssue,
      'due-item': openIssue,
    });
  }
  await raw.workspaceMember.update({
    where: { userId_workspaceId: { userId: 'other', workspaceId: 'work' } }, data: { status: false },
  });
  assert.equal((await loadNeedsYou({ actorId: 'other', workspaceId: 'work', scope: 'all', now })).kind, 'denied');

  const row = (await read()).items.find(item => item.issue.id === 'legacy-question');
  assert.deepEqual(row, {
    id: 'question:legacy-question', kind: 'question', since: date(-2).toISOString(),
    issue: { id: 'legacy-question', issueKey: 'LEGACY-QUESTION', title: 'legacy-question',
      project: { id: 'project', slug: 'release', name: 'Release', color: null } },
    seat: { id: 'owned-seat', name: 'Developer' }, text: 'Read the result.', pullRequestUrl: null, runId: 'run-legacy-question', canAct: true,
    question: 'Reply `yes`.', ask: 'here', replyOn: null, options: ['yes'], suggested: null,
  });
});

test('in My work a seat that waits for somebody else is still in waitingSeats', async () => {
  await waiting('for-other', { projectId: 'dormant', assigneeId: 'other-seat-user' });
  await waiting('newer-for-other', { projectId: 'dormant', assigneeId: 'other-seat-user', days: -1, pullRequest: 'team/repo#42' });
  const result = await read({ scope: 'mine', kind: 'review' });
  assert.deepEqual(result.items, []);
  assert.equal(result.counts.question, 0);
  assert.deepEqual(result.waitingSeats, [{ seatId: 'other-seat', issueKey: 'FOR-OTHER' }]);
});

test('a review whose repository cannot be resolved for the viewer has no pull request link', async () => {
  await waiting('github', { pullRequest: 'team/github#8' });
  await waiting('forgejo', { pullRequest: 'TEAM/FORGEJO#7' });
  await waiting('gitlab', { pullRequest: 'team/gitlab#3' });
  await waiting('bitbucket-cloud', { pullRequest: 'team/bitbucket-cloud#2' });
  await waiting('bitbucket-dc', { pullRequest: 'team/bitbucket-dc#1' });
  await waiting('foreign-repo', { pullRequest: 'team/foreign#6' });
  await waiting('ambiguous', { pullRequest: 'team/ambiguous#5' });
  await waiting('unsafe', { pullRequest: 'team/unsafe#4' });
  await raw.repository.create({ data: { projectId: 'project', githubRepoId: 'github', owner: 'team',
    name: 'github', fullName: 'team/github', webhookSecret: 'unused' } });
  const connection = (id, name, baseUrl, projectId = 'project') => ({
    id, projectId, provider: 'forgejo', baseUrl, externalId: id, name, repositoryPath: `team/${name}`, url: `${baseUrl}/team/${name}`,
  });
  await raw.gitConnection.createMany({ data: [
    { ...connection('github', 'github', 'https://github.com'), provider: 'github' },
    connection('forgejo', 'forgejo', 'https://forge.example.test/git'),
    { ...connection('gitlab', 'gitlab', 'https://lab.example.test'), provider: 'gitlab' },
    { ...connection('cloud', 'bitbucket-cloud', 'https://bitbucket.org'), provider: 'bitbucket' },
    { ...connection('dc', 'bitbucket-dc', 'https://dc.example.test/scm'), provider: 'bitbucket-dc' },
    connection('foreign', 'foreign', 'https://forge.example.test', 'foreign-project'),
    connection('first', 'ambiguous', 'https://forge.example.test'),
    connection('second', 'ambiguous', 'https://second.example.test'),
    connection('unsafe', 'unsafe', 'https://user:pass@forge.example.test'),
  ] });
  const result = await read({ kind: 'review' });
  assert.deepEqual(Object.fromEntries(result.items.map(item => [item.issue.id, item.pullRequestUrl])), {
    github: 'https://github.com/team/github/pull/8',
    forgejo: 'https://forge.example.test/git/team/forgejo/pulls/7',
    gitlab: 'https://lab.example.test/team/gitlab/-/merge_requests/3',
    'bitbucket-cloud': 'https://bitbucket.org/team/bitbucket-cloud/pull-requests/2',
    'bitbucket-dc': 'https://dc.example.test/scm/projects/team/repos/bitbucket-dc/pull-requests/1/overview',
    'foreign-repo': null, ambiguous: null, unsafe: null,
  });
});
