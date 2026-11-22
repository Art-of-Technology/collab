const { before, beforeEach, after } = require('node:test');
const { Prisma } = require('@prisma/client');
const { assert, test, load } = require('./helpers.cjs');
const { seatsDatabase } = require('../agents/seats-db.cjs');

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

async function waiting(id, { askedUser = 'other', pullRequest, days = -2, finishRunId, ...issueData } = {}) {
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
    details: JSON.stringify({ runId: finishRunId || run.id, askedUser, pullRequest, nextStep: 'Read the result.' }),
  } });
  return run;
}

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
  await waiting('forge-question', { projectId: 'dormant', assigneeId: 'other-seat-user' });
  await waiting('review', { pullRequest: 'team/repo#7' });
  await failed('lost-run');
  await issue('due-item', { assigneeId: 'other', dueDate: date(1) });
  forgeBindings = [{ workspaceId: 'work', projectId: 'dormant' }];

  const actions = async () => Object.fromEntries((await read({ actorId: 'other' })).items
    .map(row => [row.issue.id, row.canAct]));
  // The browser comment route accepts issue readers on legacy projects. Clearing also needs ASSIGN_TASK.
  const expected = { 'legacy-question': true, 'forge-question': false, review: false, 'lost-run': false, 'due-item': false };
  assert.deepEqual(await actions(), expected);
  await grant('ASSIGN_TASK');
  assert.deepEqual(await actions(), { ...expected, 'lost-run': true });
  await raw.workspaceMember.update({
    where: { userId_workspaceId: { userId: 'other', workspaceId: 'work' } }, data: { status: false },
  });
  assert.equal((await loadNeedsYou({ actorId: 'other', workspaceId: 'work', scope: 'all', now })).kind, 'denied');

  const rows = (await read()).items;
  assert.deepEqual(rows.filter(row => row.answerRecipientId).map(row => [row.kind, row.answerRecipientId]),
    [['question', 'seat-user']]);
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
