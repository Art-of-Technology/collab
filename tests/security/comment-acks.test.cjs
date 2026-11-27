const { assert, test, load, matches } = require('./helpers.cjs');

// The module runs in its own VM context, so its objects are compared by value.
const plain = value => JSON.parse(JSON.stringify(value));
const MIN = 60_000;
const AFTER = new Date('2026-12-01T00:00:00.000Z');
const NOW = new Date('2026-12-01T12:00:00.000Z');

// The few Prisma predicates the ack library uses beyond what the shared `matches` knows.
function ok(row, where, db) {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'AND') return value.every(clause => ok(row, clause, db));
    if (key === 'author') return ok(db.users.find(user => user.id === row.authorId) || {}, value, db);
    if (key === 'agentSeat' && value.is === null) return !db.seats.some(seat => seat.userId === row.id);
    if (key === 'email' && value.not === null) return row.email != null;
    if (key === 'reactions' && value.none) return !db.reactions.some(reaction => reaction.commentId === row.id && ok(reaction, value.none, db));
    if (key === 'createdAt' && value && 'gt' in value) return row.createdAt > value.gt;
    if (key === 'createdAt' && value && 'lte' in value) return row.createdAt <= value.lte;
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
    runs: [], reactions: [], comments: [], events: [], creates: 0,
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
    agentRun: { findMany: async ({ where }) => pick(db.runs, where) },
    agentRunner: { findMany: async ({ where }) => pick(db.runners, where) },
  };
  if (!db.noReactionModel) prisma.issueCommentReaction = {
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
  });
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

test("a comment older than ACKS_SINCE, a retired seat and a person's account ack nothing", async () => {
  const old = fixture();
  old.db.comments.push({ ...comment('c1', 'p'), createdAt: new Date('2026-11-27T23:59:59.000Z') });
  assert.equal(await old.lib.recordCommentAcks(base), 0);
  const retired = fixture();
  retired.db.seats[0].retiredAt = NOW;
  retired.db.comments.push(comment('c1', 'p'));
  assert.equal(await retired.lib.recordCommentAcks(base), 0);
  const person = fixture();
  person.db.comments.push(comment('c1', 'p2'));
  assert.equal(await person.lib.recordCommentAcks({ ...base, seatUserId: 'p' }), 0);
  for (const { db } of [old, retired, person]) { assert.equal(db.creates, 0); assert.deepEqual(db.reactions, []); assert.deepEqual(db.events, []); }
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
    db.runs.push({ issueId: 'i', userId: 'seat', endedAt: null, startedAt: new Date(AFTER.getTime() + 5 * MIN) });
    const map = await lib.commentAcks('i', [comment('c1', 'p', 10), comment('c2', 'p', 1)], new Date(AFTER.getTime() + 10 * MIN));
    assert.equal(map.get('c1').reason, 'in_run');
    assert.equal(map.get('c2').reason, undefined);
  }
  // runner_silent: the owner's runner last seen 5 minutes ago, or no runner at all
  {
    const { db, lib } = fixture();
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
  // before ACKS_SINCE: no entry
  {
    const { lib } = fixture();
    const map = await lib.commentAcks('i', [{ ...comment('c1', 'p'), createdAt: new Date('2026-11-27T10:00:00.000Z') }], NOW);
    assert.equal(map.size, 0);
  }
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

test('the shared loader hands the real ack module to code that imports it', async () => {
  const acks = load('src/lib/issue-comment-acks.ts', { '@/lib/prisma': { prisma: {} } });
  assert.equal(acks.ACK_TYPE, 'ack');
  assert.equal(acks.ACK_WRITE_CAP, 200);
  assert.equal(await acks.recordCommentAcks(base), 0);
});
