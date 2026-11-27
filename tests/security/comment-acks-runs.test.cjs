// A run's start and a run-context read record acks for a seat, against an in-memory database.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { load } = require('./helpers.cjs');

// What the loaded code returns was made in its own context: compared as data.
const plain = value => JSON.parse(JSON.stringify(value));
const at = text => new Date(`2026-12-0${text}T10:00:00.000Z`);
const WORKSPACE = 'w1', ISSUE = 'i1', SEAT = 'seat1', PERSON = 'person1';

/**
 * One issue, held by `assignee`, with a finished run that ended at day 2 and a comment before it and two after it.
 * `options.early` is the early answer the stop boundary reports; `options.open` an open run to start from.
 */
function fixture(options = {}) {
  const state = {
    runs: [...(options.runs ?? [])],
    finished: options.finished === false ? null : { id: 'r0', state: 'finished', startedAt: at(1), endedAt: at(2), userId: SEAT, note: null, seat: { name: 'Dev' } },
    comments: [
      { id: 'c1', content: 'before', createdAt: at(1), parentId: null, author: { id: PERSON, name: 'P' } },
      { id: 'c2', content: 'after one', createdAt: at(3), parentId: null, author: { id: PERSON, name: 'P' } },
      { id: 'c3', content: 'after two', createdAt: at(4), parentId: null, author: { id: PERSON, name: 'P' } },
    ],
    facts: options.facts,
    reactions: [],
  };
  const issue = () => ({ id: ISSUE, issueKey: 'AA-1', title: 'T', description: '', type: 'TASK', priority: 'medium', projectId: 'p1',
    assigneeId: options.assignee ?? SEAT, statusId: 's1', firstStartedAt: new Date(), agentRequestRole: null,
    projectStatus: { name: 'In Progress', category: 'in_progress', isFinal: false },
    agentRuns: state.finished ? [state.finished] : [], sourceRelations: [], targetRelations: [], children: [] });
  const within = (date, range) => !range || ((!range.gt || date > range.gt) && (!range.gte || date >= range.gte));
  const seats = new Map([[SEAT, { id: 'seat-row', userId: SEAT, role: 'developer', ownerId: 'o1', instructions: '', customRole: null, name: 'Dev' }]]);
  const prisma = {
    async $transaction(work) { return work(prisma); },
    async $queryRaw() { return []; },
    issue: { async findFirst() { return issue(); }, async update() {} },
    issueActivity: {
      async findFirst() { return state.facts ? { details: JSON.stringify(state.facts) } : null; },
      async findMany() { return []; }, async create() {},
    },
    projectStatus: { async findFirst() { return null; } },
    agentRun: {
      async findMany() { return []; },
      async findFirst({ where }) {
        if (where.state === 'finished') return state.finished;
        return state.runs.find(run => run.issueId === where.issueId && !run.endedAt && (!where.userId || run.userId === where.userId)
          && (!where.state?.in || where.state.in.includes(run.state))) ?? null;
      },
      async create({ data }) {
        const run = { id: `run${state.runs.length + 1}`, issueId: data.issueId, userId: data.userId, generation: data.generation, state: 'running', outcome: null,
          note: null, ask: null, usage: null, leaseUntil: data.leaseUntil, startedAt: new Date(), endedAt: null };
        state.runs.push(run);
        return run;
      },
    },
    agentSeat: {
      async findFirst({ where }) { return seats.get(where.userId) && !where.role ? seats.get(where.userId) : null; },
      async count() { return 0; },
    },
    agentRoleInstructions: { async findUnique() { return null; } },
    agentPlatformPrompt: { async findFirst() { return null; } },
    issueComment: {
      async findMany({ where }) {
        // The real ack module asks for the person's comments by id; a run context asks for the ones since the last run.
        if (where.reactions) return state.comments.filter(comment => where.id.in.includes(comment.id)).map(comment => ({ id: comment.id }));
        return state.comments.filter(comment => within(comment.createdAt, where.createdAt));
      },
    },
    issueCommentReaction: { async createMany({ data }) { state.reactions.push(...data); return { count: data.length }; } },
  };
  const calls = [];
  const mode = { fail: false };
  const spy = { recordCommentAcks: async input => { calls.push(input); if (mode.fail) throw new Error('ack store down'); return 0; } };
  const seatFor = async (db, context) => seats.get(context.user.id) ?? null;
  const dependencies = {
    zod: require('zod'), '@/lib/prisma': { prisma },
    '@/lib/agent-seats': { HandoffError: class extends Error { constructor(code, message, status) { super(message); this.code = code; this.status = status; } },
      LEAD_CAP: 3, NOT_DONE: {}, STARTED_MOVE_MS: 0, byRoom: list => list, fromLeads: () => ({}), leadSeatsWithRoom: async () => [], noRoomDue: () => false,
      seatFor, seatWriteGuard: async () => {} },
    '@/lib/agent-repository': { connectedRepositories: async () => [], repositoryStateForSeat: async () => ({ repository: null, repositories: [] }), repositoryOfIssue: async () => null },
    '@/lib/agent-stop-boundary': { earlyAnswers: async () => new Map(options.early ? [[ISSUE, options.early]] : []), isStopIssueDone: () => false, lastAssigned: () => new Date(0) },
    '@/lib/forge/legacy-write-guard': { assertLegacyIssueWriteAllowed: async () => {}, ForgeProjectWriteError: class extends Error {} },
    '@/lib/issue-finder': { findIssueByIdOrKey: async () => null, issueReadAccessWhere: () => ({}), tokenIssueReadWhere: () => ({}) },
    '@/lib/permissions': {}, '@/lib/agent-tokens': { AGENT_APP_SLUG: 'collab-agent' },
    ...(options.realAcks ? { '@/lib/redis': { publishEvent: async () => {} } } : { '@/lib/issue-comment-acks': spy }),
  };
  const runs = load('src/lib/agent-runs.ts', dependencies, { Date });
  const seat = { user: { id: SEAT }, workspace: { id: WORKSPACE }, app: { slug: 'collab-agent' } };
  const person = { user: { id: PERSON }, workspace: { id: WORKSPACE }, app: { slug: 'web' } };
  return { runs, prisma, state, calls, mode, seat, person, input: { issue: ISSUE, runner: 'r', generation: 1 } };
}

test("contextSince is the last finished run's end, or nothing before any run finished", async () => {
  const { runs, prisma } = fixture();
  assert.deepEqual(plain(await runs.contextSince(prisma, ISSUE)), { gt: at(2).toISOString() });
  const fresh = fixture({ finished: false });
  assert.equal(await fresh.runs.contextSince(fresh.prisma, ISSUE), undefined);
  // The person who answered before the run finished: the window opens at that answer, as the run context's always has.
  const early = fixture({ facts: { runId: 'r0', askedUser: PERSON }, early: at(2) });
  assert.deepEqual(plain(await early.runs.contextSince(early.prisma, ISSUE)), { gte: at(2).toISOString() });
});

test("a seat's new run records acks for its comments-since window", async () => {
  const { runs, seat, input, calls, state } = fixture();
  const answer = await runs.checkout(seat, input);
  assert.equal(plain(answer).run.id, 'run1');
  assert.deepEqual(Object.keys(answer).sort(), ['repository', 'run']);
  assert.equal(state.runs.length, 1);
  // The window is closed at the new run's start: a comment landing after the insert is not acked "by start".
  assert.deepEqual(plain(calls), [{ workspaceId: WORKSPACE, issueId: ISSUE, seatUserId: SEAT, createdAt: { gt: at(2).toISOString(), lte: state.runs[0].startedAt.toISOString() } }]);
});

test('a person\'s run, and a run that was already open, record nothing', async () => {
  const { runs, person, input, calls } = fixture({ assignee: PERSON });
  const first = await runs.checkout(person, input);
  assert.equal(plain(first).run.id, 'run1');
  const again = await runs.checkout(person, input);
  assert.equal(plain(again).run.id, 'run1');
  assert.deepEqual(calls, []);
});

test('a run starts when recording throws', async () => {
  const { runs, seat, input, mode, calls } = fixture();
  mode.fail = true;
  const answer = await runs.checkout(seat, input);
  assert.equal(plain(answer).run.id, 'run1');
  assert.deepEqual(Object.keys(answer).sort(), ['repository', 'run']);
  assert.equal(calls.length, 1);
});

test('a run-context read by the seat with a run open records the comments it returned', async () => {
  const open = { id: 'r9', issueId: ISSUE, userId: SEAT, state: 'running', endedAt: null, leaseUntil: new Date(), startedAt: at(5) };
  const { runs, seat, person, calls, mode } = fixture({ runs: [open] });
  const read = await runs.runContext(seat, ISSUE);
  assert.deepEqual(plain(read.commentsSince.map(comment => comment.id)), ['c2', 'c3']);
  assert.deepEqual(plain(calls), [{ workspaceId: WORKSPACE, issueId: ISSUE, seatUserId: SEAT, commentIds: ['c2', 'c3'] }]);
  // Recording changes nothing a reader is told.
  mode.fail = true;
  assert.deepEqual(plain(await runs.runContext(seat, ISSUE)), plain(read));
  // A person reads the same issue and records nothing.
  calls.length = 0;
  await runs.runContext(person, ISSUE);
  assert.deepEqual(calls, []);

  const idle = fixture();
  const noRun = await idle.runs.runContext(idle.seat, ISSUE);
  assert.deepEqual(plain(noRun), plain(read));
  assert.deepEqual(idle.calls, []);

  // A seat other than the one with the run open.
  const other = fixture({ runs: [open] });
  await other.runs.runContext({ user: { id: 'seat2' }, workspace: { id: WORKSPACE }, app: { slug: 'collab-agent' } }, ISSUE);
  assert.deepEqual(other.calls, []);
});

test('agent-runs loads through the shared loader when the test names no ack module', async () => {
  const open = { id: 'r9', issueId: ISSUE, userId: SEAT, state: 'running', endedAt: null, leaseUntil: new Date(), startedAt: at(5) };
  const { runs, seat, state } = fixture({ runs: [open], realAcks: true });
  await runs.runContext(seat, ISSUE);
  assert.deepEqual(plain(state.reactions.map(row => [row.type, row.commentId, row.authorId])), [['ack', 'c2', SEAT], ['ack', 'c3', SEAT]]);
});
