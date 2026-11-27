const { assert, test, load } = require('./helpers.cjs');

const at = '2026-11-28T10:00:00.000Z';
const person = { id: 'alice', name: 'Alice', image: null };
const seatUser = { id: 'seat-user', name: 'Seat' };
const row = (id, parentId = null, extra = {}) => ({ id, content: `text ${id}`, html: null, createdAt: at, updatedAt: at, parentId, author: person, reactions: [], ...extra });
const tree = () => {
  const reply = row('r1', 'c1');
  return [row('c1', null, { replies: [reply] }), row('c2', null, { replies: [] }), reply];
};
const ackOf = () => ({ state: 'acked', seats: [{ userId: 'seat-user', name: 'Seat', at }] });

// The ack library as a fixture: `acked` is the shared store of rows that recordCommentAcks writes and commentAcks reads.
function library({ failRead, empty } = {}) {
  const calls = { record: [], read: [] };
  const acked = new Set();
  return { calls, acked, module: {
    ACK_TYPE: 'ack',
    recordCommentAcks: async input => { calls.record.push(input); const ids = input.commentIds ?? []; ids.forEach(id => acked.add(id)); return ids.length; },
    commentAcks: async (issueId, comments) => {
      calls.read.push({ issueId, ids: comments.map(comment => comment.id), acked: [...acked], reactions: comments.map(comment => (comment.reactions ?? []).map(reaction => reaction.type)) });
      if (failRead) throw new Error('ack library down');
      if (empty) return new Map();
      const out = new Map();
      for (const comment of comments) {
        const rows = (comment.reactions ?? []).filter(reaction => reaction.type === 'ack');
        out.set(comment.id, rows.length ? ackOf() : { state: 'none', seats: [] });
      }
      return out;
    },
  } };
}

function browser(lib, comments = tree()) {
  const { GET } = load('src/app/api/issues/[issueId]/comments/route.ts', {
    'next/server': { NextResponse: Response }, '@/lib/redis': { publishEvent: async () => {} },
    '@/lib/forge/legacy-write-guard': { assertLegacyIssueWriteAllowed: async () => {}, ForgeProjectWriteError: class extends Error {} },
    '@/lib/session': { getCurrentUser: async () => ({ id: 'alice' }) },
    '@/lib/issue-finder': { findIssueByIdOrKey: async () => ({ id: 'i', workspaceId: 'w' }) },
    '@/lib/issue-comment-mentions': {},
    '@/lib/prisma': { prisma: { issueComment: { findMany: async () => comments } } },
    '@/lib/issue-comment-acks': lib.module,
  }, { console: { error() {} }, URL });
  return () => GET(new Request('https://example.test'), { params: Promise.resolve({ issueId: 'i' }) });
}

// What `collab comments wait` sends after its baseline: only comments made after a moment.
const SINCE = 'https://example.test/x?since=2026-11-01T00:00:00.000Z';

function token({ lib, seat = { userId: 'seat-user' }, run = { id: 'run' }, comments = tree(), calls = [], url = 'https://example.test/x', seatFor, findRun }) {
  const reactionStore = [];
  const { GET } = load('src/app/api/apps/auth/issues/[issueIdOrKey]/comments/route.ts', {
    'next/server': { NextResponse: Response }, zod: require('zod'), '@/lib/redis': { publishEvent: async () => {} },
    '@/lib/apps/auth-middleware': { withAppAuth: handler => handler },
    '@/lib/issue-finder': { tokenIssueReadWhere: () => ({}) },
    '@/lib/agent-seats': { HandoffError: class extends Error {}, seatWriteGuard: async () => {}, seatFor: seatFor ?? (async () => seat) },
    '@/lib/forge/legacy-write-guard': { ForgeProjectWriteError: class extends Error {}, assertLegacyIssueWriteAllowed: async () => {} },
    '@/lib/issue-comment-acks': lib.module,
    '@/lib/prisma': { prisma: {
      issue: { findFirst: async () => ({ id: 'i', issueKey: 'CLB-1', projectId: 'p' }) },
      agentRun: { findFirst: findRun ?? (async args => { calls.push(['run', args.where]); return run; }) },
      // A flat list (`flat=true`, or a `since` read) is every comment and reply in one list, without nesting.
      issueComment: { findMany: async ({ where }) => ('parentId' in where ? comments.filter(comment => !comment.parentId)
        : comments.map(({ replies, ...comment }) => comment)), count: async () => 3 },
      issueCommentReaction: { findMany: async args => { calls.push(['reactions', args.where]); return [...lib.acked].map(commentId => ({ commentId, type: 'ack', authorId: 'seat-user', createdAt: new Date(at), author: seatUser })); } },
    } },
  }, { console: { error() {} }, URL });
  return () => GET(new Request(url), { user: { id: 'seat-user' }, workspace: { id: 'w' } }, { params: Promise.resolve({ issueIdOrKey: 'CLB-1' }) });
}
const callToken = get => get();

test('the browser list gives each comment and reply its ack, and null where there is none', async () => {
  const lib = library();
  lib.acked.add('c1');
  // Seed an ack reaction on c1 and its reply only.
  const comments = tree();
  comments[0].reactions = [{ type: 'ack', authorId: 'seat-user', createdAt: at, author: seatUser }];
  comments[0].replies[0].reactions = [{ type: 'ack', authorId: 'seat-user', createdAt: at, author: seatUser }];
  comments[2].reactions = comments[0].replies[0].reactions;
  const response = await browser(lib, comments)();
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.ok(Array.isArray(body));
  assert.equal(body[0].ack.state, 'acked');
  assert.equal(body[0].replies[0].ack.state, 'acked');
  assert.equal(body[1].ack.state, 'none');
  // Replies are passed once, in one flat list with the comments.
  assert.deepEqual([...lib.calls.read[0].ids].sort(), ['c1', 'c2', 'r1']);
  // A comment the library says nothing about has no ack.
  lib.module.commentAcks = async () => new Map([['c1', { state: 'waiting', seats: [] }]]);
  const partial = await (await browser(lib, tree())()).json();
  assert.equal(partial[0].ack.state, 'waiting');
  assert.equal(partial[1].ack, null);
  assert.equal(partial[0].replies[0].ack, null);
});

test('the token list gives the same, and every field it had before', async () => {
  const lib = library();
  const body = await (await callToken(token({ lib, seat: null }))).json();
  assert.deepEqual(Object.keys(body), ['issueKey', 'issueId', 'comments', 'total']);
  assert.equal(body.total, 3);
  const keys = ['id', 'content', 'html', 'createdAt', 'updatedAt', 'parentId', 'author', 'reactions', 'reactionCounts', 'replies'];
  const [first, second] = body.comments;
  assert.deepEqual(Object.keys(first).filter(key => key !== 'ack'), keys);
  assert.deepEqual(Object.keys(first.replies[0]).filter(key => key !== 'ack' && key !== 'replies'), keys.filter(key => key !== 'replies'));
  assert.equal(first.ack.state, 'none');
  assert.equal(first.replies[0].ack.state, 'none');
  assert.equal(second.ack.state, 'none');
  assert.deepEqual([...lib.calls.read[0].ids].sort(), ['c1', 'c2', 'r1']);
});

test("a seat's plain list, the baseline `collab comments wait` throws away, records nothing even with a run open", async () => {
  for (const url of ['https://example.test/x', 'https://example.test/x?flat=true']) {
    const lib = library();
    const response = await callToken(token({ lib, url }));
    assert.equal(response.status, 200);
    assert.deepEqual(lib.calls.record, []);
    assert.equal(lib.acked.size, 0);
  }
});

test("a seat's since read with a run open records exactly the comments returned, before the state is read", async () => {
  const lib = library();
  const calls = [];
  const body = await (await callToken(token({ lib, calls, url: SINCE }))).json();
  assert.equal(lib.calls.record.length, 1);
  assert.deepEqual({ ...lib.calls.record[0], commentIds: [...lib.calls.record[0].commentIds].sort() },
    { workspaceId: 'w', issueId: 'i', seatUserId: 'seat-user', commentIds: ['c1', 'c2', 'r1'] });
  assert.equal(JSON.stringify(calls[0]), JSON.stringify(['run', { issueId: 'i', userId: 'seat-user', endedAt: null }]));
  // The state is read after the rows are written, and sees them.
  assert.deepEqual([...lib.calls.read[0].acked].sort(), ['c1', 'c2', 'r1']);
  assert.equal(JSON.stringify(lib.calls.read[0].reactions.flat()), JSON.stringify(['ack', 'ack', 'ack']));
  assert.deepEqual(body.comments.map(comment => comment.ack.state), ['acked', 'acked', 'acked']);
  assert.deepEqual(body.comments.map(comment => comment.id), ['c1', 'c2', 'r1']);
});

test('a token read without an open run, or by a token that is not a seat, records nothing', async () => {
  for (const options of [{ run: null }, { seat: null }]) {
    const lib = library();
    const response = await callToken(token({ lib, url: SINCE, ...options }));
    assert.equal(response.status, 200);
    assert.equal(lib.calls.record.length, 0);
    assert.equal(lib.acked.size, 0);
    assert.equal((await response.json()).comments[0].ack.state, 'none');
  }
});

test('both lists answer when the ack library fails', async () => {
  for (const options of [{ failRead: true }, { empty: true }]) {
    const lib = library(options);
    for (const get of [browser(lib), token({ lib })]) {
      const response = await get();
      assert.equal(response.status, 200);
      const body = await response.json();
      const list = Array.isArray(body) ? body : body.comments;
      assert.ok(list.length >= 2);
      for (const comment of list) {
        assert.equal(comment.ack, null);
        for (const reply of comment.replies ?? []) assert.equal(reply.ack, null);
      }
    }
  }
});

test('a failed record still leaves the state read: stored acks show, and the answer is 200', async () => {
  const lib = library();
  lib.acked.add('c1');
  const comments = tree();
  comments[0].reactions = [{ type: 'ack', authorId: 'seat-user', createdAt: at, author: seatUser }];
  lib.module.recordCommentAcks = async () => { throw new Error('write down'); };
  const response = await token({ lib, comments, url: SINCE })();
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(lib.calls.read.length, 1);
  assert.equal(body.comments[0].ack.state, 'acked');
  assert.equal(body.comments[1].ack.state, 'none');
});

test('a rejecting seat lookup or open-run lookup still answers 200 with the state read', async () => {
  const down = async () => { throw new Error('lookup down'); };
  for (const options of [{ seatFor: down }, { findRun: down }]) {
    const lib = library();
    lib.acked.add('c1');
    const comments = tree();
    comments[0].reactions = [{ type: 'ack', authorId: 'seat-user', createdAt: at, author: seatUser }];
    const response = await token({ lib, comments, url: SINCE, ...options })();
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(lib.calls.record, []);
    assert.equal(lib.calls.read.length, 1);
    assert.equal(body.comments[0].ack.state, 'acked');
    assert.equal(body.comments[1].ack.state, 'none');
  }
});

test('an ack is not listed among reactions: both answers carry only the likes, and reactionCounts has no ack', async () => {
  const like = { type: 'like', authorId: 'bob', createdAt: at, author: { id: 'bob', name: 'Bob', image: null } };
  const ack = { type: 'ack', authorId: 'seat-user', createdAt: at, author: seatUser };
  const seeded = () => {
    const comments = tree();
    comments[0].reactions = [like, ack];
    comments[0].replies[0].reactions = [ack, like];
    comments[2].reactions = comments[0].replies[0].reactions;
    return comments;
  };
  const lib = library();
  const browserBody = await (await browser(lib, seeded())()).json();
  // The ack state was read from the ack rows, and the answer lists only the likes.
  assert.equal(JSON.stringify(lib.calls.read[0].reactions.map(types => [...types].sort())), JSON.stringify([['ack', 'like'], ['ack', 'like'], []]));
  assert.equal(browserBody[0].ack.state, 'acked');
  assert.deepEqual(browserBody[0].reactions.map(reaction => reaction.type), ['like']);
  assert.deepEqual(browserBody[0].replies[0].reactions.map(reaction => reaction.type), ['like']);

  for (const url of ['https://example.test/x', SINCE]) {
    const tokenLib = library();
    const body = await (await token({ lib: tokenLib, comments: seeded(), url, seat: null })()).json();
    const rows = url === SINCE ? body.comments : [body.comments[0], body.comments[0].replies[0]];
    const first = rows[0], reply = url === SINCE ? rows.find(row => row.id === 'r1') : rows[1];
    for (const row of [first, reply]) {
      assert.equal(row.ack.state, 'acked');
      assert.deepEqual(row.reactions.map(reaction => reaction.type), ['like']);
      assert.deepEqual(row.reactionCounts, { like: 1 });
      assert.equal('ack' in row.reactionCounts, false);
    }
  }
});
