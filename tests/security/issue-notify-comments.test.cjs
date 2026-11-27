const { assert, test, load } = require('./helpers.cjs');

// The route modules run in their own VM context, so their objects are compared by value.
const plain = value => JSON.parse(JSON.stringify(value));

// A notifier that records what it is told. It answers with a promise that never settles: a caller that awaited it would hang.
function notifier() {
  const told = [];
  return { told, dependency: { tellIssueEvent: event => { told.push(event); return new Promise(() => {}); }, issueEventsSettled: async () => {} } };
}

const guard = { assertLegacyIssueWriteAllowed: async () => {}, ForgeProjectWriteError: class extends Error {} };

function webCommentRoute() {
  const { told, dependency } = notifier();
  const created = [];
  const { POST } = load('src/app/api/issues/[issueId]/comments/route.ts', {
    'next/server': { NextResponse: Response },
    '@/lib/prisma': { prisma: { issueComment: {
      create: async ({ data }) => { created.push(data); return { id: 'c1', ...data, createdAt: '2026-11-27T00:00:00.000Z', author: { id: 'u1', name: 'Pat', image: null, useCustomAvatar: false }, replies: [] }; },
      findFirst: async () => ({ id: 'parent' }),
    } } },
    '@/lib/session': { getCurrentUser: async () => ({ id: 'u1', name: 'Pat' }) },
    '@/lib/issue-finder': { findIssueByIdOrKey: async () => ({ id: 'i1', issueKey: 'CLB-1', workspaceId: 'w' }) },
    '@/lib/forge/legacy-write-guard': guard,
    '@/lib/issue-comment-mentions': { notifyCommentMentions: async () => {} },
    '@/lib/issue-comment-acks': { ACK_TYPE: 'ack', commentAcks: async () => new Map() },
    '@/lib/redis': { publishEvent: async () => true },
    '@/lib/notification-issue-events': dependency,
  }, { console: { error() {} } });
  const call = body => POST(new Request('https://example.test', { method: 'POST', body: JSON.stringify(body) }), { params: Promise.resolve({ issueId: 'CLB-1' }) });
  return { told, created, call };
}

function tokenCommentRoute() {
  const { told, dependency } = notifier();
  const { POST } = load('src/app/api/apps/auth/issues/[issueIdOrKey]/comments/route.ts', {
    'next/server': { NextResponse: Response }, zod: require('zod'),
    '@/lib/apps/auth-middleware': { withAppAuth: handler => handler },
    '@/lib/issue-finder': { tokenIssueReadWhere: () => ({}) },
    '@/lib/agent-seats': { HandoffError: class extends Error {}, seatFor: async () => null, seatWriteGuard: async () => {} },
    '@/lib/issue-comment-acks': { ACK_TYPE: 'ack', commentAcks: async () => new Map(), recordCommentAcks: async () => 0 },
    '@/lib/forge/legacy-write-guard': guard,
    '@/lib/prisma': { prisma: {
      issue: { findFirst: async () => ({ id: 'i1', projectId: 'p' }) },
      issueComment: { create: async ({ data }) => ({ id: 'c2', ...data, author: { id: 'seat', name: 'Dev 1', email: null, image: null }, issue: { id: 'i1', issueKey: 'CLB-1', title: 'T' } }) },
      issueActivity: { create: async () => ({}) },
    } },
    '@/lib/redis': { publishEvent: async () => true },
    '@/lib/notification-issue-events': dependency,
  }, { console: { error() {} } });
  const call = body => POST(new Request('https://example.test', { method: 'POST', body: JSON.stringify(body) }),
    { workspace: { id: 'w' }, user: { id: 'seat' } }, { params: Promise.resolve({ issueIdOrKey: 'CLB-1' }) });
  return { told, call };
}

// A like store shared by the route and the action: one comment by `author`, liked or not by `u1`.
function likeStore() {
  const reactions = [];
  const comment = { id: 'c1', issueId: 'i1', authorId: 'author', content: 'hello', html: null };
  const prisma = {
    user: { findUnique: async () => ({ id: 'u1' }) },
    issueComment: {
      findFirst: async () => comment,
      findUnique: async () => ({ ...comment, author: { id: 'author', name: 'Pat', image: null, useCustomAvatar: false }, reactions: reactions.map(r => ({ ...r, author: { id: r.authorId, name: 'Sam', image: null } })) }),
    },
    issueCommentReaction: {
      findFirst: async ({ where }) => reactions.find(r => r.commentId === where.commentId && r.authorId === where.authorId && r.type === where.type) ?? null,
      create: async ({ data }) => { const row = { id: `r${reactions.length + 1}`, ...data }; reactions.push(row); return row; },
      delete: async ({ where }) => { reactions.splice(reactions.findIndex(r => r.id === where.id), 1); return {}; },
    },
  };
  return { prisma, reactions };
}

function likeRoute() {
  const { told, dependency } = notifier();
  const { prisma } = likeStore();
  const { POST } = load('src/app/api/issues/[issueId]/comments/[commentId]/like/route.ts', {
    'next/server': { NextResponse: Response },
    '@/lib/prisma': { prisma },
    '@/lib/session': { getCurrentUser: async () => ({ id: 'u1' }) },
    '@/lib/issue-finder': { findIssueByIdOrKey: async () => ({ id: 'i1', workspaceId: 'w' }) },
    '@/lib/forge/legacy-write-guard': guard,
    '@/lib/redis': { publishEvent: async () => true },
    '@/lib/notification-issue-events': dependency,
  }, { console: { error() {} } });
  const toggle = () => POST(new Request('https://example.test', { method: 'POST' }), { params: Promise.resolve({ issueId: 'CLB-1', commentId: 'c1' }) });
  return { told, toggle };
}

function likeAction() {
  const { told, dependency } = notifier();
  const { prisma } = likeStore();
  const { toggleIssueCommentLike } = load('src/actions/issueComment.ts', {
    '@/lib/redis': { publishEvent: async () => true },
    '@/lib/forge/legacy-write-guard': guard,
    '@/lib/request-session': { getServerSession: async () => ({ user: { email: 'u1@example.test' } }) },
    '@/lib/auth-options': { authOptions: {} },
    '@/lib/prisma': { prisma },
    'next/cache': { revalidatePath() {} },
    '@/lib/issue-finder': { findIssueByIdOrKey: async () => ({ id: 'i1', workspaceId: 'w' }) },
    '@/lib/notification-issue-events': dependency,
  }, { console: { error() {} } });
  return { told, toggle: () => toggleIssueCommentLike('CLB-1', 'c1') };
}

test('a web comment tells comment with the html when there is html, else the content', async () => {
  const route = webCommentRoute();
  assert.equal((await route.call({ content: 'plain @Dev', html: '<p>rich <span data-id="seat">@Dev</span></p>' })).status, 201);
  assert.equal((await route.call({ content: 'only text', html: '   ' })).status, 201);
  assert.equal((await route.call({ content: 'no html at all' })).status, 201);
  assert.deepEqual(plain(route.told), [
    { kind: 'comment', issueId: 'i1', actorId: 'u1', commentId: 'c1', text: '<p>rich <span data-id="seat">@Dev</span></p>' },
    { kind: 'comment', issueId: 'i1', actorId: 'u1', commentId: 'c1', text: 'only text' },
    { kind: 'comment', issueId: 'i1', actorId: 'u1', commentId: 'c1', text: 'no html at all' },
  ]);
  // A refused comment tells nothing.
  assert.equal((await route.call({ content: '  ' })).status, 400);
  assert.equal(route.told.length, 3);
});

test('a token comment tells comment with the content', async () => {
  const route = tokenCommentRoute();
  assert.equal((await route.call({ content: 'agent says hi' })).status, 201);
  assert.deepEqual(plain(route.told), [{ kind: 'comment', issueId: 'i1', actorId: 'seat', commentId: 'c2', text: 'agent says hi' }]);
});

test("adding a like tells like with the comment's author; taking it back tells nothing (route)", async () => {
  const route = likeRoute();
  const added = await route.toggle();
  assert.equal((await added.json()).status, 'added');
  assert.deepEqual(plain(route.told), [{ kind: 'like', issueId: 'i1', actorId: 'u1', commentAuthorId: 'author' }]);
  const removed = await route.toggle();
  assert.equal((await removed.json()).status, 'removed');
  assert.equal(route.told.length, 1);
});

test("adding a like tells like with the comment's author; taking it back tells nothing (action)", async () => {
  const action = likeAction();
  assert.equal((await action.toggle()).status, 'added');
  assert.deepEqual(plain(action.told), [{ kind: 'like', issueId: 'i1', actorId: 'u1', commentAuthorId: 'author' }]);
  assert.equal((await action.toggle()).status, 'removed');
  assert.equal(action.told.length, 1);
});

test('the comment and like answers have the same keys as before', async () => {
  const web = webCommentRoute();
  assert.deepEqual(Object.keys(await (await web.call({ content: 'x', html: '<p>x</p>' })).json()).sort(),
    ['author', 'authorId', 'content', 'createdAt', 'html', 'id', 'issueId', 'parentId', 'replies']);
  const token = tokenCommentRoute();
  assert.deepEqual(Object.keys(await (await token.call({ content: 'x' })).json()).sort(),
    ['author', 'authorId', 'content', 'id', 'issue', 'issueId', 'parentId']);
  const route = likeRoute();
  assert.deepEqual(Object.keys(await (await route.toggle()).json()).sort(), ['comment', 'message', 'status']);
  assert.deepEqual(Object.keys(await (await route.toggle()).json()).sort(), ['comment', 'message', 'status']);
  const action = likeAction();
  assert.deepEqual(Object.keys(await action.toggle()).sort(), ['comment', 'status']);
  assert.deepEqual(Object.keys(await action.toggle()).sort(), ['comment', 'status']);
});
