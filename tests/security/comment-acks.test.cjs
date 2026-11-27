const { assert, test, load, matches } = require('./helpers.cjs');

// The module runs in its own VM context, so its objects are compared by value.
const plain = value => JSON.parse(JSON.stringify(value));
const MIN = 60_000;
const AFTER = new Date('2026-12-01T00:00:00.000Z');
const NOW = new Date('2026-12-01T12:00:00.000Z');

const isDate = value => Object.prototype.toString.call(value) === '[object Date]';
// The few Prisma predicates the ack library uses beyond what the shared `matches` knows.
function ok(row, where, db) {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'AND') return value.every(clause => ok(row, clause, db));
    if (key === 'author') return ok(db.users.find(user => user.id === row.authorId) || {}, value, db);
    if (key === 'agentSeat' && value.is === null) return !db.seats.some(seat => seat.userId === row.id);
    if (key === 'email' && value.not === null) return row.email != null;
    if (key === 'reactions' && value.none) return !db.reactions.some(reaction => reaction.commentId === row.id && ok(reaction, value.none, db));
    if (key === 'createdAt' && value && typeof value === 'object' && !isDate(value)) {
      return (!('gt' in value) || row.createdAt > value.gt) && (!('gte' in value) || row.createdAt >= value.gte)
        && (!('lte' in value) || row.createdAt <= value.lte) && (!('lt' in value) || row.createdAt < value.lt);
    }
    if (key === 'endedAt' && value === null) return row.endedAt == null;
    if (key === 'lastSeenAt') return true;
    return matches(row, { [key]: value });
  });
}

function fixture(overrides = {}) {
  const db = {
    users: [{ id: 'p', email: 'p@example.test', name: 'Pat' }, { id: 'seat', email: null, name: 'Dev 1' }, { id: 'rev', email: null, name: 'Reviewer' }, { id: 'p2', email: 'p2@example.test', name: 'Sam' }],
    seats: [
      { userId: 'seat', name: 'Dev 1', byRunner: true, ownerId: 'owner', retiredAt: null, workspaceId: 'w' },
      { userId: 'rev', name: 'Reviewer', byRunner: false, ownerId: 'owner', retiredAt: null, workspaceId: 'w' },
    ],
    runners: [{ workspaceId: 'w', ownerId: 'owner', removedAt: null, lastSeenAt: NOW }],
    runs: [], reactions: [], comments: [], events: [], creates: 0, errors: [], firstAckLookups: 0,
    // The workspace's first ack, an hour before the comments: where waiting and nobody lines start. `finished` is the
    // issue's last finished run, whose end opens the next run's window.
    workspaceAcks: [{ createdAt: new Date(AFTER.getTime() - 60 * MIN) }], finished: null,
    issue: { id: 'i', workspaceId: 'w', assigneeId: 'seat', status: 'In Progress', statusValue: null, projectStatus: { category: 'started', isFinal: false } },
    failCreate: false, noReactionModel: false,
    ...overrides,
  };
  const pick = (rows, where, args = {}) => {
    let found = rows.filter(row => ok(row, where || {}, db));
    if (args.orderBy?.createdAt === 'desc') found = [...found].sort((a, b) => b.createdAt - a.createdAt);
    return args.take ? found.slice(0, args.take) : found;
  };
  const prisma = {
    agentSeat: {
      findFirst: async ({ where }) => pick(db.seats, where)[0] ?? null,
      findMany: async ({ where }) => pick(db.seats, where),
    },
    user: { findMany: async ({ where }) => pick(db.users, where).filter(user => user.email != null && !db.seats.some(seat => seat.userId === user.id)) },
    issue: { findUnique: async () => db.issue },
    issueComment: { findMany: async args => pick(db.comments.filter(c => c.issueId === args.where.issueId), (({ issueId, ...rest }) => rest)(args.where), args) },
    agentRun: {
      findMany: async ({ where }) => pick(db.runs, where),
      findFirst: async ({ where }) => (where.state === 'finished' && where.issueId === 'i' ? db.finished : null),
    },
    issueActivity: { findFirst: async () => null },
    agentRunner: { findMany: async ({ where }) => pick(db.runners, where) },
  };
  if (!db.noReactionModel) prisma.issueCommentReaction = {
    // The oldest ack of the workspace, asked for by type and by the workspace of the comment's issue.
    findFirst: async ({ where, orderBy }) => {
      db.firstAckLookups++;
      if (where.type !== 'ack' || where.comment?.issue?.workspaceId !== 'w' || orderBy?.createdAt !== 'asc') return null;
      const all = [...db.workspaceAcks, ...db.reactions.filter(r => r.type === 'ack')].sort((a, b) => a.createdAt - b.createdAt);
      return all[0] ? { createdAt: all[0].createdAt } : null;
    },
    createMany: async args => {
      db.creates++;
      if (db.failCreate) throw new Error('synthetic failure');
      for (const row of args.data) if (!db.reactions.some(r => r.commentId === row.commentId && r.authorId === row.authorId && r.type === row.type)) db.reactions.push({ ...row, createdAt: NOW });
      return { count: args.data.length };
    },
  };
  const lib = load('src/lib/issue-comment-acks.ts', {
    '@/lib/prisma': { prisma },
    '@/lib/redis': { publishEvent: async (channel, message, timeout) => { db.events.push({ channel, message, timeout }); return true; } },
  }, { console: { error: (...args) => db.errors.push(args) } });
  // Each case starts with no remembered first ack.
  lib.forgetAckStarts();
  return { db, lib };
}

const comment = (id, authorId, minutes = 0, extra = {}) => ({ id, issueId: 'i', authorId, content: '', html: null, createdAt: new Date(AFTER.getTime() + minutes * MIN), ...extra });
const base = { workspaceId: 'w', issueId: 'i', seatUserId: 'seat' };

test("a run's ack is one reaction row per person comment, under the seat's account", async () => {
  const { db, lib } = fixture();
  db.comments.push(comment('c1', 'p'), comment('c2', 'seat', 1), comment('c3', 'rev', 2));
  assert.equal(await lib.recordCommentAcks(base), 1);
  assert.deepEqual(db.reactions.map(({ type, commentId, authorId }) => ({ type, commentId, authorId })), [{ type: 'ack', commentId: 'c1', authorId: 'seat' }]);
  assert.deepEqual(plain(db.events), [{ channel: 'workspace:w:events', message: { type: 'issue.comments.changed', workspaceId: 'w', issueId: 'i' }, timeout: 1000 }]);
});

test('the same comment is acked once, and a second call publishes nothing', async () => {
  const { db, lib } = fixture();
  db.comments.push(comment('c1', 'p'));
  assert.equal(await lib.recordCommentAcks(base), 1);
  assert.equal(await lib.recordCommentAcks(base), 0);
  assert.equal(db.reactions.length, 1);
  assert.equal(db.events.length, 1);
});

test('at most 200 rows in one write, the newest comments first', async () => {
  const { db, lib } = fixture();
  for (let n = 0; n < 250; n++) db.comments.push(comment(`c${n}`, 'p', n));
  assert.equal(await lib.recordCommentAcks(base), 200);
  assert.equal(db.creates, 1);
  const acked = new Set(db.reactions.map(r => r.commentId));
  for (let n = 0; n < 50; n++) assert.equal(acked.has(`c${n}`), false, `c${n} is among the oldest 50`);
  for (let n = 50; n < 250; n++) assert.equal(acked.has(`c${n}`), true);
});

test('a comment from any day is acked: there is no release date', async () => {
  const { db, lib } = fixture();
  assert.equal('ACKS_SINCE' in lib, false);
  db.comments.push({ ...comment('c1', 'p'), createdAt: new Date('2020-01-01T00:00:00.000Z') });
  assert.equal(await lib.recordCommentAcks(base), 1);
  assert.deepEqual(db.reactions.map(r => r.commentId), ['c1']);
});

test("a retired seat and a person's account ack nothing", async () => {
  const retired = fixture();
  retired.db.seats[0].retiredAt = NOW;
  retired.db.comments.push(comment('c1', 'p'));
  assert.equal(await retired.lib.recordCommentAcks(base), 0);
  const person = fixture();
  person.db.comments.push(comment('c1', 'p2'));
  assert.equal(await person.lib.recordCommentAcks({ ...base, seatUserId: 'p' }), 0);
  for (const { db } of [retired, person]) { assert.equal(db.creates, 0); assert.deepEqual(db.reactions, []); assert.deepEqual(db.events, []); }
});

test('a failing database resolves 0 and does not throw', async () => {
  const failing = fixture({ failCreate: true });
  failing.db.comments.push(comment('c1', 'p'));
  assert.equal(await failing.lib.recordCommentAcks(base), 0);
  assert.deepEqual(failing.db.events, []);
  const bare = fixture({ noReactionModel: true });
  bare.db.comments.push(comment('c1', 'p'));
  assert.equal(await bare.lib.recordCommentAcks(base), 0);
});

test('commentIds and createdAt narrow what is acked', async () => {
  const named = fixture();
  named.db.comments.push(comment('c1', 'p', 0), comment('c2', 'p', 1), comment('c3', 'p', 2));
  assert.equal(await named.lib.recordCommentAcks({ ...base, commentIds: ['c2'] }), 1);
  assert.deepEqual(named.db.reactions.map(r => r.commentId), ['c2']);
  const later = fixture();
  later.db.comments.push(comment('c1', 'p', 0), comment('c2', 'p', 1), comment('c3', 'p', 2));
  assert.equal(await later.lib.recordCommentAcks({ ...base, createdAt: { gt: new Date(AFTER.getTime() + 1 * MIN) } }), 1);
  assert.deepEqual(later.db.reactions.map(r => r.commentId), ['c3']);
  const orLater = fixture();
  orLater.db.comments.push(comment('c1', 'p', 0), comment('c2', 'p', 1), comment('c3', 'p', 2));
  assert.equal(await orLater.lib.recordCommentAcks({ ...base, createdAt: { gte: new Date(AFTER.getTime() + 1 * MIN) } }), 2);
  // A run start's window is closed at the run's start: a comment that lands after the run began is not acked by it.
  const bounded = fixture();
  bounded.db.comments.push(comment('c1', 'p', 0), comment('c2', 'p', 1), comment('c3', 'p', 2));
  assert.equal(await bounded.lib.recordCommentAcks({ ...base, createdAt: { gt: AFTER, lte: new Date(AFTER.getTime() + 1 * MIN) } }), 1);
  assert.deepEqual(bounded.db.reactions.map(r => r.commentId), ['c2']);
});

test('commentAcks: acked, waiting, the two reasons, done, not the holder, and no entry', async () => {
  const mention = id => `hello @[x](${id})`;
  // acked: oldest first, name from the reaction's author, then a lookup
  {
    const { lib } = fixture();
    const c = comment('c1', 'p', 0, { reactions: [
      { type: 'ack', authorId: 'rev', createdAt: new Date(NOW.getTime() + MIN) },
      { type: 'ack', authorId: 'seat', createdAt: NOW, author: { id: 'seat', name: 'Dev 1' } },
      { type: 'like', authorId: 'p2', createdAt: NOW },
    ] });
    const got = (await lib.commentAcks('i', [c], NOW)).get('c1');
    assert.deepEqual(JSON.parse(JSON.stringify(got)), { state: 'acked', seats: [
      { userId: 'seat', name: 'Dev 1', at: NOW.toISOString() }, { userId: 'rev', name: 'Reviewer', at: new Date(NOW.getTime() + MIN).toISOString() }] });
  }
  // waiting, with no reason, while the runner is listening; the seat's own comment and an issue held by a person have no entry
  {
    const { lib } = fixture();
    const map = await lib.commentAcks('i', [comment('c1', 'p'), comment('c2', 'seat', 1)], NOW);
    assert.deepEqual(JSON.parse(JSON.stringify(map.get('c1'))), { state: 'waiting', seats: [], waitingFor: 'Dev 1' });
    assert.equal(map.has('c2'), false);
  }
  // waiting, missed: a mentioned live seat that does not hold the issue
  {
    const { lib } = fixture();
    const map = await lib.commentAcks('i', [comment('c1', 'p', 0, { content: mention('rev') }), comment('c2', 'p', 1, { content: mention('seat') })], NOW);
    assert.deepEqual(plain(map.get('c1').missed), ['Reviewer']);
    assert.equal('missed' in map.get('c2'), false);
  }
  // in_run: an open run that started before the comment; one that started after does not count
  {
    const { db, lib } = fixture();
    db.runs.push({ issueId: 'i', userId: 'seat', endedAt: null, state: 'running', startedAt: new Date(AFTER.getTime() + 5 * MIN) });
    const map = await lib.commentAcks('i', [comment('c1', 'p', 10), comment('c2', 'p', 1)], new Date(AFTER.getTime() + 10 * MIN));
    assert.equal(map.get('c1').reason, 'in_run');
    assert.equal(map.get('c2').reason, undefined);
  }
  // a lost run is not "in a run now"
  {
    const { db, lib } = fixture();
    db.runs.push({ issueId: 'i', userId: 'seat', endedAt: null, state: 'lost', startedAt: new Date(AFTER.getTime() + 5 * MIN) });
    const map = await lib.commentAcks('i', [comment('c1', 'p', 10)], new Date(AFTER.getTime() + 10 * MIN));
    assert.equal(map.get('c1').state, 'waiting');
    assert.equal(map.get('c1').reason, undefined);
  }
  // runner_silent: the owner's runner last seen 5 minutes ago, or no runner at all; 150 s ago is a runner that asks once a minute
  {
    const { db, lib } = fixture();
    assert.equal(lib.RUNNER_SILENT_MS, 180_000);
    db.runners[0].lastSeenAt = new Date(NOW.getTime() - 150_000);
    assert.equal((await lib.commentAcks('i', [comment('c1', 'p')], NOW)).get('c1').reason, undefined);
    db.runners[0].lastSeenAt = new Date(NOW.getTime() - 5 * MIN);
    assert.equal((await lib.commentAcks('i', [comment('c1', 'p')], NOW)).get('c1').reason, 'runner_silent');
    db.runners.length = 0;
    assert.equal((await lib.commentAcks('i', [comment('c1', 'p')], NOW)).get('c1').reason, 'runner_silent');
  }
  // done
  {
    const { db, lib } = fixture();
    db.issue.projectStatus = { category: 'done', isFinal: true };
    assert.deepEqual(JSON.parse(JSON.stringify((await lib.commentAcks('i', [comment('c1', 'p')], NOW)).get('c1'))), { state: 'none', seats: [], waitingFor: 'Dev 1', reason: 'issue_done' });
  }
  // not the holder: a person holds the issue and the comment mentions a live seat; without a mention, no entry
  {
    const { db, lib } = fixture();
    db.issue.assigneeId = 'p2';
    const map = await lib.commentAcks('i', [comment('c1', 'p', 0, { content: mention('rev') }), comment('c2', 'p', 1)], NOW);
    assert.deepEqual(JSON.parse(JSON.stringify(map.get('c1'))), { state: 'none', seats: [], reason: 'not_holder', missed: ['Reviewer'] });
    assert.equal(map.has('c2'), false);
  }
});

test("commentAcks starts waiting and nobody lines at the workspace's first ack; acked is always shown", async () => {
  const ack = { type: 'ack', authorId: 'seat', createdAt: NOW, author: { id: 'seat', name: 'Dev 1' } };
  // No ack in the workspace yet: no waiting or nobody line for any comment, done or not.
  {
    const { db, lib } = fixture({ workspaceAcks: [] });
    assert.equal((await lib.commentAcks('i', [comment('c1', 'p')], NOW)).size, 0);
    db.issue.projectStatus = { category: 'done', isFinal: true };
    assert.equal((await lib.commentAcks('i', [comment('c1', 'p')], NOW)).size, 0);
  }
  // A comment written before the first ack has no line; one written at or after it has; an acked one always shows.
  {
    const { lib } = fixture({ workspaceAcks: [{ createdAt: new Date(AFTER.getTime() + 2 * MIN) }] });
    const map = await lib.commentAcks('i', [comment('c1', 'p', 1), comment('c2', 'p', 2), comment('c3', 'p', 0, { reactions: [ack] })], NOW);
    assert.equal(map.has('c1'), false);
    assert.equal(map.get('c2').state, 'waiting');
    assert.equal(map.get('c3').state, 'acked');
  }
  // Years-old acked comments are acked.
  {
    const { lib } = fixture({ workspaceAcks: [] });
    const map = await lib.commentAcks('i', [{ ...comment('c1', 'p', 0, { reactions: [ack] }), createdAt: new Date('2020-01-01T00:00:00.000Z') }], NOW);
    assert.equal(map.get('c1').state, 'acked');
  }
});

test('commentAcks: a comment that no run will be given says so, and a live run or the next window keeps it waiting', async () => {
  // The last run ended 5 minutes after AFTER: the next run's window opens there.
  const finished = { id: 'r0', startedAt: AFTER, endedAt: new Date(AFTER.getTime() + 5 * MIN), userId: 'seat', seat: { name: 'Dev 1' } };
  const later = new Date(AFTER.getTime() + 20 * MIN);
  {
    const { lib } = fixture({ finished });
    const map = await lib.commentAcks('i', [comment('c1', 'p', 1), comment('c2', 'p', 5), comment('c3', 'p', 10)], later);
    assert.deepEqual(plain(map.get('c1')), { state: 'none', seats: [], waitingFor: 'Dev 1', reason: 'not_given' });
    // The window opens after the run's end: a comment at that very moment is not given either.
    assert.equal(map.get('c2').reason, 'not_given');
    assert.deepEqual(plain(map.get('c3')), { state: 'waiting', seats: [], waitingFor: 'Dev 1' });
  }
  // A live open run on the issue: still waiting, as the session may still ask.
  {
    const { db, lib } = fixture({ finished });
    db.runs.push({ issueId: 'i', userId: 'seat', endedAt: null, state: 'waiting', startedAt: new Date(AFTER.getTime() + 15 * MIN) });
    assert.equal((await lib.commentAcks('i', [comment('c1', 'p', 1)], later)).get('c1').state, 'waiting');
  }
  // A lost open run, or another account's live run, is no live run of the seat.
  for (const run of [{ userId: 'seat', state: 'lost' }, { userId: 'rev', state: 'running' }]) {
    const { db, lib } = fixture({ finished });
    db.runs.push({ issueId: 'i', endedAt: null, startedAt: new Date(AFTER.getTime() + 15 * MIN), ...run });
    assert.equal((await lib.commentAcks('i', [comment('c1', 'p', 1)], later)).get('c1').reason, 'not_given');
  }
  // No run has finished yet: the next run is given everything, so nothing is "not given".
  {
    const { lib } = fixture();
    assert.equal((await lib.commentAcks('i', [comment('c1', 'p', 1)], later)).get('c1').state, 'waiting');
  }
  // A done issue still says done.
  {
    const { db, lib } = fixture({ finished });
    db.issue.projectStatus = { category: 'done', isFinal: true };
    assert.equal((await lib.commentAcks('i', [comment('c1', 'p', 1)], later)).get('c1').reason, 'issue_done');
  }
});

test("the workspace's first ack is looked up once while it exists", async () => {
  const { db, lib } = fixture();
  assert.equal((await lib.commentAcks('i', [comment('c1', 'p')], NOW)).get('c1').state, 'waiting');
  assert.equal((await lib.commentAcks('i', [comment('c2', 'p', 1)], new Date(NOW.getTime() + 24 * 60 * MIN))).get('c2').state, 'waiting');
  assert.equal(db.firstAckLookups, 1);
  // The reset for tests forgets it.
  lib.forgetAckStarts();
  await lib.commentAcks('i', [comment('c1', 'p')], NOW);
  assert.equal(db.firstAckLookups, 2);
});

test('with no ack yet, the lookup is repeated only after 60 seconds', async () => {
  const { db, lib } = fixture({ workspaceAcks: [] });
  assert.equal((await lib.commentAcks('i', [comment('c1', 'p')], NOW)).size, 0);
  assert.equal((await lib.commentAcks('i', [comment('c1', 'p')], new Date(NOW.getTime() + 59_000))).size, 0);
  assert.equal(db.firstAckLookups, 1);
  // An ack appears elsewhere in the workspace; it is seen once the 60 seconds have passed.
  db.workspaceAcks.push({ createdAt: AFTER });
  assert.equal((await lib.commentAcks('i', [comment('c1', 'p')], new Date(NOW.getTime() + 60_000))).get('c1').state, 'waiting');
  assert.equal(db.firstAckLookups, 2);
});

test("recording an ack forgets the workspace's \"none yet\", so waiting lines appear at once", async () => {
  const { db, lib } = fixture({ workspaceAcks: [] });
  db.comments.push(comment('c1', 'p'));
  assert.equal((await lib.commentAcks('i', [comment('c1', 'p')], NOW)).size, 0);
  assert.equal(db.firstAckLookups, 1);
  assert.equal(await lib.recordCommentAcks(base), 1);
  // c1 is acked (the row was written at NOW); c2 is written after the workspace's first ack, within the 60 seconds.
  const acked = comment('c1', 'p', 0, { reactions: db.reactions.map(row => ({ ...row, author: { id: 'seat', name: 'Dev 1' } })) });
  const newer = { ...comment('c2', 'p'), createdAt: new Date(NOW.getTime() + 1000) };
  const map = await lib.commentAcks('i', [acked, newer], new Date(NOW.getTime() + 2000));
  assert.equal(map.get('c1').state, 'acked');
  assert.equal(map.get('c2').state, 'waiting');
  assert.equal(db.firstAckLookups, 2);
});

test('commentAcks resolves an empty map when the database fails', async () => {
  const { db, lib } = fixture();
  db.issue = null;
  db.comments.push(comment('c1', 'p'));
  const broken = load('src/lib/issue-comment-acks.ts', { '@/lib/prisma': { prisma: {} }, '@/lib/redis': { publishEvent: async () => true } });
  const map = await broken.commentAcks('i', [comment('c1', 'p')], NOW);
  assert.equal(Object.prototype.toString.call(map), '[object Map]');
  assert.equal(map.size, 0);
  assert.equal((await lib.commentAcks('i', [comment('c1', 'p')], NOW)).size, 0);
});

test('a failing ack read or write is logged, and still never throws', async () => {
  const errors = [];
  const broken = load('src/lib/issue-comment-acks.ts', { '@/lib/prisma': { prisma: {} }, '@/lib/redis': { publishEvent: async () => true } },
    { console: { error: (...args) => errors.push(args) } });
  assert.equal((await broken.commentAcks('i', [comment('c1', 'p')], NOW)).size, 0);
  assert.equal(await broken.recordCommentAcks(base), 0);
  assert.equal(errors.length, 2);
  assert.match(String(errors[0][0]), /^\[comment-acks\]/);
  assert.match(String(errors[1][0]), /^\[comment-acks\]/);
  const failing = fixture({ failCreate: true });
  failing.db.comments.push(comment('c1', 'p'));
  assert.equal(await failing.lib.recordCommentAcks(base), 0);
  assert.equal(failing.db.errors.length, 1);
  // A console that itself throws changes nothing.
  const loud = load('src/lib/issue-comment-acks.ts', { '@/lib/prisma': { prisma: {} } }, { console: { error() { throw new Error('no console'); } } });
  assert.equal(await loud.recordCommentAcks(base), 0);
  assert.equal((await loud.commentAcks('i', [comment('c1', 'p')], NOW)).size, 0);
});

test('the shared loader hands the real ack module to code that imports it', async () => {
  const acks = load('src/lib/issue-comment-acks.ts', { '@/lib/prisma': { prisma: {} } });
  assert.equal(acks.ACK_TYPE, 'ack');
  assert.equal(acks.ACK_WRITE_CAP, 200);
  assert.equal(await acks.recordCommentAcks(base), 0);
});
