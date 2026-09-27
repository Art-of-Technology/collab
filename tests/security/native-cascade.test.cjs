const { assert, test, resolve, load, prisma } = require('./helpers.cjs');


test('native PostgreSQL comment cascade preserves foreign descendants', {
  skip: !process.env.POST_ACCESS_TEST_DATABASE_URL,
}, async (t) => {
  const url = new URL(process.env.POST_ACCESS_TEST_DATABASE_URL);
  assert.equal(url.hostname, '127.0.0.1');
  assert.equal(url.pathname, '/review_comment_cascade');
  const { PrismaClient } = require(process.env.POST_ACCESS_TEST_CLIENT || '@prisma/client');
  const db = new PrismaClient({ datasources: { db: { url: url.href } } });
  t.after(async () => {
    await db.post.deleteMany({ where: { id: { in: ['cascade-own', 'cascade-foreign'] } } });
    await db.workspace.deleteMany({ where: { id: { in: ['cascade-own', 'cascade-foreign'] } } });
    await db.user.deleteMany({ where: { id: { in: ['cascade-alice', 'cascade-bob'] } } });
    await db.$disconnect();
  });
  const alice = { id: 'cascade-alice', email: 'cascade-alice@example.test', name: 'Alice', expertise: [] };
  await db.user.createMany({ data: [alice, { id: 'cascade-bob', expertise: [] }] });
  for (const [id, ownerId] of [['cascade-own', alice.id], ['cascade-foreign', 'cascade-bob']]) {
    await db.workspace.create({ data: { id, slug: id, name: id, ownerId } });
    await db.post.create({ data: { id, workspaceId: id, authorId: ownerId, message: 'Post', type: 'UPDATE' } });
  }
  const deps = {
    '@/lib/prisma': { prisma: db }, 'next/server': { NextResponse: Response },
    'next-auth': { getServerSession: async () => ({ user: alice }) }, '@/lib/session': { getCurrentUser: async () => alice },
    '@/lib/auth-options': {}, '@/utils/mentions': {}, '@/lib/notification-service': {}, '@/lib/html-sanitizer': {},
  };
  deps['@/lib/user-utils'] = load('src/lib/user-utils.ts');
  deps.zod = require('zod');
  deps['@/lib/apps/auth-middleware'] = { withAppAuth: handler => (req, params) => handler(req, { user: alice, workspace: { id: 'cascade-own' } }, params) };
  const action = load('src/actions/comment.ts', deps, { console, Error }).deleteComment;
  const route = load('src/app/api/posts/[postId]/comments/[commentId]/route.ts', deps, { console, Error }).DELETE;
  const invokeRoute = () => route(new Request('https://example.test', { method: 'DELETE' }), {
    params: Promise.resolve({ postId: 'cascade-own', commentId: 'cascade-root' }),
  });
  const seed = async (foreign, depth) => {
    await db.comment.deleteMany({});
    const comment = (id, postId, parentId = null) => ({ id, postId, parentId, authorId: alice.id, message: id });
    await db.comment.create({ data: comment('cascade-root', 'cascade-own') });
    await db.comment.create({ data: comment('cascade-valid', 'cascade-own', 'cascade-root') });
    await db.comment.create({ data: comment('cascade-leaf', foreign ? 'cascade-foreign' : 'cascade-own', depth === 1 ? 'cascade-root' : 'cascade-valid') });
    await db.reaction.create({ data: { authorId: alice.id, commentId: 'cascade-leaf', type: 'LIKE' } });
  };
  for (const http of [false, true]) {
    for (const depth of [1, 2]) await t.test(`${http ? 'REST' : 'action'} rejects foreign descendant at depth ${depth}`, async t => {
      await seed(true, depth);
      let rejected = false;
      try {
        const result = http ? await invokeRoute() : await action('cascade-root');
        rejected = http && result.status >= 400;
      } catch (error) { rejected = /Invalid comment tree/.test(error.message); }
      const remaining = await db.comment.findMany({ select: { id: true }, orderBy: { id: 'asc' } });
      const reactions = await db.reaction.count();
      t.diagnostic(JSON.stringify({ rejected, remaining: remaining.map(row => row.id), reactions }));
      assert.equal(rejected, true);
      assert.deepEqual(remaining.map(row => row.id), ['cascade-leaf', 'cascade-root', 'cascade-valid']);
      assert.equal(reactions, 1);
    });
    await t.test(`${http ? 'REST' : 'action'} deletes a valid tree using native cascades`, async () => {
      await seed(false, 2);
      if (http) assert.equal((await invokeRoute()).status, 200);
      else assert.equal(await action('cascade-root'), true);
      assert.equal(await db.comment.count(), 0); assert.equal(await db.reaction.count(), 0);
    });
  }
  const postActions = load('src/actions/post.ts', deps, { console, Error });
  const postRoute = load('src/app/api/posts/[postId]/route.ts', deps, { console, Error });
  const appPostRoute = load('src/app/api/apps/auth/posts/[postId]/route.ts', deps, { console, Error });
  for (const [name, invoke] of [
    ['action', () => postActions.deletePost('cascade-own')],
    ['REST', () => postRoute.DELETE(new Request('https://example.test', { method: 'DELETE' }), { params: Promise.resolve({ postId: 'cascade-own' }) })],
    ['app', () => appPostRoute.DELETE(new Request('https://example.test', { method: 'DELETE' }), { params: Promise.resolve({ postId: 'cascade-own' }) })],
  ]) {
    for (const depth of [1, 2]) await t.test(`${name} post deletion rejects foreign descendant at depth ${depth}`, async t => {
      await db.post.upsert({ where: { id: 'cascade-own' }, update: {}, create: { id: 'cascade-own', workspaceId: 'cascade-own', authorId: alice.id, message: 'Post', type: 'UPDATE' } });
      await seed(true, depth);
      let rejected = false;
      try { const result = await invoke(); rejected = result?.status >= 400; }
      catch (error) { rejected = /Invalid comment tree/.test(error.message); }
      const remaining = await db.comment.findMany({ select: { id: true }, orderBy: { id: 'asc' } });
      const reactions = await db.reaction.count();
      t.diagnostic(JSON.stringify({ rejected, remaining: remaining.map(row => row.id), reactions }));
      assert.equal(rejected, true);
      assert.deepEqual(remaining.map(row => row.id), ['cascade-leaf', 'cascade-root', 'cascade-valid']);
      assert.equal(reactions, 1); assert.equal(await db.post.count(), 2); assert.equal(await db.postAction.count(), 0);
    });
    await t.test(`${name} post deletion accepts valid cascades`, async () => {
      await db.post.upsert({ where: { id: 'cascade-own' }, update: {}, create: { id: 'cascade-own', workspaceId: 'cascade-own', authorId: alice.id, message: 'Post', type: 'UPDATE' } });
      await seed(false, 2);
      const result = await invoke();
      assert.ok(result === true || [200, 204].includes(result.status));
      assert.equal(await db.comment.count(), 0); assert.equal(await db.reaction.count(), 0);
      assert.equal(await db.post.count(), 1);
    });
  }

});
