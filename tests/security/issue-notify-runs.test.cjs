// A run's start and a run's finish tell the issue notifier after their transaction commits, against an in-memory database.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { load } = require('./helpers.cjs');

// What the loaded code returns was made in its own context: compared as data.
const plain = value => JSON.parse(JSON.stringify(value));
const WORKSPACE = 'w1', ISSUE = 'i1', EXTRA = 'i2', SEAT = 'seat1';
const TODO = { id: 's-todo', name: 'to_do', category: 'todo', isFinal: false };
const PROGRESS = { id: 's-progress', name: 'in_progress', category: 'in_progress', isFinal: false };
const DONE = { id: 's-done', name: 'done', category: 'done', isFinal: true };
const note = ['Done', 'Decisions', 'Evidence', 'Next'].map(heading => `## ${heading}\n\nText.`).join('\n\n');

/**
 * Issues held by the seat, each in a status, and the project's statuses. `options.status` is the run's issue's status;
 * `options.failAt` names a write that throws inside the transaction; `options.throwing` makes the notifier throw.
 */
function fixture(options = {}) {
  const statuses = [TODO, PROGRESS, DONE];
  const issues = new Map([[ISSUE, { id: ISSUE, status: options.status ?? TODO }], [EXTRA, { id: EXTRA, status: TODO }]]);
  const runs = [...(options.runs ?? [])];
  const told = [], order = [];
  let committed = false;
  const row = id => {
    const issue = issues.get(id);
    return { id, issueKey: id.toUpperCase(), title: 'T', projectId: 'p1', assigneeId: SEAT, statusId: issue.status.id, firstStartedAt: null,
      agentRequestRole: null, projectStatus: { name: issue.status.name, category: issue.status.category, isFinal: issue.status.isFinal } };
  };
  const prisma = {
    async $transaction(work) {
      // Writes land in a copy and are kept only when the work resolves, as a real transaction's are.
      const before = new Map([...issues].map(([id, issue]) => [id, { ...issue }]));
      const runCount = runs.length;
      try { const result = await work(prisma); committed = true; order.push('commit'); return result; }
      catch (error) { issues.clear(); for (const [id, issue] of before) issues.set(id, issue); runs.length = runCount; throw error; }
    },
    async $queryRaw() { return []; },
    issue: {
      async findFirst({ where }) { const id = where.id ?? where.OR?.[0].id; return issues.has(id) ? row(id) : null; },
      async findMany({ where }) { return [...issues.keys()].filter(id => id !== ISSUE && (where.OR[0].id.in.includes(id) || where.OR[1].issueKey.in.includes(id.toUpperCase()))).map(id => ({ id })); },
      async update({ where, data }) {
        if (options.failAt === 'issue.update') throw new Error('write refused');
        if (data.statusId) issues.get(where.id).status = statuses.find(status => status.id === data.statusId);
      },
      async count() { return 0; },
    },
    issueActivity: { async create() { if (options.failAt === 'activity') throw new Error('write refused'); }, async createMany() {}, async findMany() { return []; } },
    projectStatus: {
      async findFirst({ where }) {
        if (where.category === 'in_progress') return PROGRESS;
        if (where.OR) return DONE;
        return statuses.find(status => status.category === where.category) ?? null;
      },
    },
    agentRun: {
      async findMany() { return []; },
      async findFirst({ where }) {
        return runs.find(run => (!where.id || run.id === where.id) && (!where.issueId || run.issueId === where.issueId) && !run.endedAt
          && (!where.state?.not || run.state !== where.state.not)) ?? null;
      },
      async findFirstOrThrow({ where }) { return runs.find(run => run.id === where.id); },
      async updateMany({ where, data }) {
        const run = runs.find(candidate => candidate.id === where.id && !candidate.endedAt && (!where.state?.in || where.state.in.includes(candidate.state)));
        if (!run) return { count: 0 };
        Object.assign(run, data);
        return { count: 1 };
      },
      async create({ data, select }) {
        const run = { id: `run${runs.length + 1}`, issueId: data.issueId, userId: data.userId, generation: data.generation, state: data.state ?? 'running',
          outcome: data.outcome ?? null, note: null, ask: null, usage: null, leaseUntil: data.leaseUntil ?? null, startedAt: new Date(), endedAt: data.endedAt ?? null,
          seatId: data.seatId ?? null, runner: data.runner };
        runs.push(run);
        return select?.id && Object.keys(select).length === 1 ? { id: run.id } : run;
      },
    },
    agentSeat: { async findFirst() { return null; }, async count() { return 0; } },
    issueComment: { async findMany() { return []; } },
  };
  const seat = { id: 'seat-row', userId: SEAT, role: options.role ?? 'developer', ownerId: 'o1', name: 'Dev' };
  const dependencies = {
    zod: require('zod'), '@/lib/prisma': { prisma },
    '@/lib/agent-seats': { HandoffError: class extends Error { constructor(code, message, status) { super(message); this.code = code; this.status = status; } },
      LEAD_CAP: 3, NOT_DONE: {}, STARTED_MOVE_MS: 0, byRoom: list => list, fromLeads: () => ({}), leadSeatsWithRoom: async () => [], noRoomDue: () => false,
      seatFor: async () => seat, seatWriteGuard: async () => {} },
    '@/lib/agent-repository': { connectedRepositories: async () => [], repositoryStateForSeat: async () => ({ repository: null, repositories: [] }), repositoryOfIssue: async () => null },
    '@/lib/agent-stop-boundary': { earlyAnswers: async () => new Map(), isStopIssueDone: () => false, lastAssigned: () => new Date(0) },
    '@/lib/agent-stop-email': { emailDeclaredStop: async () => {} },
    '@/lib/forge/legacy-write-guard': { assertLegacyIssueWriteAllowed: async () => {}, ForgeProjectWriteError: class extends Error {} },
    '@/lib/issue-finder': { findIssueByIdOrKey: async () => null, issueReadAccessWhere: () => ({}), tokenIssueReadWhere: () => ({}) },
    '@/lib/permissions': {}, '@/lib/agent-tokens': { AGENT_APP_SLUG: 'collab-agent' },
    '@/lib/issue-comment-acks': { recordCommentAcks: async () => 0 },
    '@/lib/agent-context-since': { contextSince: async () => undefined },
    '@/lib/notification-issue-events': { tellIssueEvent: event => {
      order.push('tell');
      told.push({ ...event, committed });
      if (options.throwing) throw new Error('notifier down');
    } },
  };
  const agentRuns = load('src/lib/agent-runs.ts', dependencies, { Date, console: { error: () => {} } });
  const context = { user: { id: SEAT }, workspace: { id: WORKSPACE }, app: { slug: 'collab-agent' } };
  const open = issueId => ({ id: `open-${issueId}`, issueId, userId: SEAT, generation: 'g1', state: 'running', outcome: null, note: null, ask: null, usage: null,
    leaseUntil: new Date(Date.now() + 60_000), startedAt: new Date(), endedAt: null, seatId: 'seat-row', runner: 'r', seat: { role: options.role ?? 'developer' }, workspaceId: WORKSPACE });
  return { agentRuns, context, issues, runs, told, order, open, start: { issue: ISSUE, runner: 'r', generation: 'g1' } };
}

test('a run start that moves the issue tells status after the commit', async () => {
  const { agentRuns, context, start, told, order } = fixture();
  await agentRuns.checkout(context, start);
  assert.deepEqual(plain(told), [{ kind: 'status', issueId: ISSUE, actorId: SEAT, fromStatusId: TODO.id, toStatusId: PROGRESS.id, committed: true }]);
  assert.deepEqual(order, ['commit', 'tell']);
});

test('a run start on an issue already in progress tells nothing', async () => {
  const { agentRuns, context, start, told } = fixture({ status: PROGRESS });
  await agentRuns.checkout(context, start);
  assert.deepEqual(told, []);
});

test('finishing a run that moves the issue tells status; one that does not, tells nothing', async () => {
  const moving = fixture({ status: PROGRESS });
  moving.runs.push(moving.open(ISSUE));
  const answer = await moving.agentRuns.actOnRun(moving.context, `open-${ISSUE}`, { event: 'finish', generation: 'g1', outcome: 'done', note });
  assert.equal(answer.statusUnmapped, false);
  assert.deepEqual(plain(moving.told), [{ kind: 'status', issueId: ISSUE, actorId: SEAT, fromStatusId: PROGRESS.id, toStatusId: DONE.id, committed: true }]);

  // Already in the done group: the issue stays where it is.
  const staying = fixture({ status: DONE });
  staying.runs.push(staying.open(ISSUE));
  await staying.agentRuns.actOnRun(staying.context, `open-${ISSUE}`, { event: 'finish', generation: 'g1', outcome: 'done', note });
  assert.deepEqual(staying.told, []);

  // A release seat finishes another issue with its run: one status event for each issue that moved.
  const release = fixture({ status: PROGRESS, role: 'release' });
  release.runs.push(release.open(ISSUE));
  await release.agentRuns.actOnRun(release.context, `open-${ISSUE}`, { event: 'finish', generation: 'g1', outcome: 'done', note, alsoFinish: [EXTRA] });
  assert.deepEqual(plain(release.told), [
    { kind: 'status', issueId: ISSUE, actorId: SEAT, fromStatusId: PROGRESS.id, toStatusId: DONE.id, committed: true },
    { kind: 'status', issueId: EXTRA, actorId: SEAT, fromStatusId: TODO.id, toStatusId: DONE.id, committed: true },
  ]);
});

test('a transaction that fails tells nothing', async () => {
  const starting = fixture({ failAt: 'activity' });
  await assert.rejects(starting.agentRuns.checkout(starting.context, starting.start), /write refused/);
  assert.deepEqual(starting.told, []);

  const finishing = fixture({ status: PROGRESS, failAt: 'activity' });
  finishing.runs.push(finishing.open(ISSUE));
  await assert.rejects(finishing.agentRuns.actOnRun(finishing.context, `open-${ISSUE}`, { event: 'finish', generation: 'g1', outcome: 'done', note }), /write refused/);
  assert.deepEqual(finishing.told, []);
});

test('the run answers are unchanged, and a notifier that throws does not fail the run', async () => {
  const quiet = fixture();
  const loud = fixture({ throwing: true });
  const started = await loud.agentRuns.checkout(loud.context, loud.start);
  assert.equal(loud.told.length, 1);
  assert.deepEqual(Object.keys(started).sort(), ['repository', 'run']);
  const reference = await quiet.agentRuns.checkout(quiet.context, quiet.start);
  // Two runs started a moment apart differ in every time they carry (start, lease), and in nothing else.
  const TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
  const strip = answer => JSON.parse(JSON.stringify(plain(answer), (key, value) => (typeof value === 'string' && TIME.test(value) ? '<time>' : value)));
  assert.deepEqual(strip(started), strip(reference));

  const finishing = fixture({ status: PROGRESS, throwing: true });
  finishing.runs.push(finishing.open(ISSUE));
  const finished = await finishing.agentRuns.actOnRun(finishing.context, `open-${ISSUE}`, { event: 'finish', generation: 'g1', outcome: 'done', note });
  assert.equal(finishing.told.length, 1);
  assert.deepEqual(Object.keys(finished).sort(), ['run', 'statusUnmapped']);
  assert.equal(finished.statusUnmapped, false);
  assert.equal(finished.run.state, 'finished');
});
