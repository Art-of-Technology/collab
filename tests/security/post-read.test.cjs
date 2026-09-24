const { assert, test, resolve, load, matches, workspaces, prisma } = require('./helpers.cjs');


test('disclosure: post GET and action reads deny foreign or revoked members', async () => {
  let session = null;
  let reads = 0;
  const author = { id: 'bob', name: 'Bob', email: 'bob@example.test' };
  const db = {
    user: { findUnique: async () => session?.user.email === 'alice@example.test' ? { id: 'alice' } : null },
    post: { findUnique: async ({ where, include }) => {
      reads++;
      const workspace = workspaces.find(row => row.id === where.id);
      if (!workspace) return null;
      const memberWhere = include?.workspace?.select.members.where;
      return {
        id: where.id, message: 'Private post content', author, tags: [{ name: 'Important' }],
        comments: [{ id: 'comment', message: 'Private comment', author, reactions: [] }], reactions: [],
        workspace: { ...workspace, members: workspace.members.filter(row => !memberWhere || matches(row, memberWhere)) },
      };
    } },
  };
  db.post.findFirst = async ({ where, include }) => {
    reads++;
    const workspace = workspaces.find(row => row.id === where.id);
    if (!workspace || !matches({ workspace }, { workspace: where.workspace })) return null;
    const projectAuthor = selection => Object.fromEntries(Object.entries(author).filter(([key]) => selection.select[key]));
    return { id: where.id, message: 'Private post content', author: projectAuthor(include.author),
      tags: [{ name: 'Important' }], comments: [{ id: 'comment', message: 'Private comment',
        author: projectAuthor(include.comments.include.author), reactions: [] }], reactions: [] };
  };
  const actions = load('src/actions/post.ts', {
    '@/lib/auth-options': { authOptions: {} }, '@/lib/prisma': { prisma: db },
    'next-auth': { getServerSession: async () => session },
    '@/utils/mentions': {}, '@/lib/notification-service': {},
    '@/lib/user-utils': load('src/lib/user-utils.ts'),
  }, { Error });
  const { GET } = load('src/app/api/posts/[postId]/route.ts', {
    'next/server': { NextResponse: Response }, '@/actions/post': actions,
    '@/lib/prisma': { prisma: db }, '@/lib/session': { getCurrentUser: async () =>
      session?.user.email === 'alice@example.test' ? { id: 'alice' } : null },
    '@/lib/user-utils': load('src/lib/user-utils.ts'),
  }, { Error, console });
  const get = id => GET(new Request('https://example.test/api/posts/' + id), { params: Promise.resolve({ postId: id }) });
  assert.equal((await get('joined')).status, 401);
  assert.equal(reads, 0);
  session = { user: { email: 'deleted@example.test' } };
  assert.equal((await get('joined')).status, 401);
  assert.equal(reads, 0);
  session = { user: { email: 'alice@example.test' } };
  for (const id of ['foreign', 'revoked', 'missing']) {
    const response = await get(id);
    assert.equal(response.status, 404, id);
    assert.equal(await response.text(), 'Post not found');
    await assert.rejects(actions.getPostById(id), /Post not found|You do not have access/);
  }
  for (const id of ['joined', 'own']) {
    const response = await get(id);
    assert.equal(response.status, 200, id);
    const post = await response.json();
    assert.equal(post.id, id);
    assert.equal(post.message, 'Private post content');
    assert.deepEqual(post.author, { id: author.id, name: author.name });
    assert.equal('email' in post.comments[0].author, false);
    assert.equal(post.comments[0].message, 'Private comment');
    assert.equal(post.tags[0].name, 'Important');
  }
});

test('post GET restricts private content to owners and active members', async (t) => {
  const safeAuthor = { id: 'author', name: 'Author', image: 'https://example.test/avatar', useCustomAvatar: true,
    avatarSkinTone: 'light', avatarEyes: 'happy', avatarBrows: 'raised', avatarMouth: 'smile',
    avatarNose: 'small', avatarHair: 'short', avatarEyewear: 'glasses', avatarAccessory: 'none' };
  const author = { ...safeAuthor, hashedPassword: 'synthetic-only', githubAccessToken: 'synthetic-only', email: 'private@example.test' };
  const comments = [
    { id: 'later', message: 'Second private comment', createdAt: '2026-09-24T12:00:00Z', author },
    { id: 'earlier', message: 'First private comment', createdAt: '2026-09-24T11:00:00Z', author },
  ];
  const posts = [...workspaces, null].map(workspace => ({
    id: workspace?.id ?? 'unscoped', workspace, workspaceId: workspace?.id ?? null,
    authorId: 'alice', message: 'Private post', author, comments,
    tags: [{ id: 'tag', name: 'Private tag' }], reactions: [{ id: 'reaction', authorId: 'alice', type: 'LIKE' }],
  }));
  let user = null;
  let reads = 0;
  function projectAuthor(author, selection) {
    return selection?.select
      ? Object.fromEntries(Object.entries(author).filter(([field]) => selection.select[field] === true))
      : { ...author };
  }
  async function findPost({ where, include }) {
    reads++;
    const post = posts.find(row => matches(row, where));
    if (!post) return null;
    const { workspace, ...data } = post;
    return { ...data, author: projectAuthor(post.author, include.author),
      comments: [...post.comments].sort((a, b) => include.comments.orderBy.createdAt === 'asc'
        ? a.createdAt.localeCompare(b.createdAt) : b.createdAt.localeCompare(a.createdAt))
        .map(comment => ({ ...comment, author: projectAuthor(comment.author, include.comments.include.author) })) };
  }
  const { GET } = load('src/app/api/posts/[postId]/route.ts', {
    'next/server': { NextResponse: Response },
    '@/lib/session': { getCurrentUser: async () => user },
    '@/lib/prisma': { prisma: { post: { findFirst: findPost, findUnique: findPost } } },
    '@/lib/user-utils': load('src/lib/user-utils.ts'),
  });
  const request = id => GET(new Request(`https://example.test/api/posts/${id}`), { params: Promise.resolve({ postId: id }) });
  await t.test('anonymous', async () => {
    const anonymous = await request('joined');
    assert.equal(anonymous.status, 401);
    assert.equal(await anonymous.text(), 'Unauthorized');
    assert.equal(reads, 0);
  });
  user = { id: 'alice' };
  for (const id of ['foreign', 'revoked', 'missing', 'unscoped']) {
    await t.test(id, async () => {
      const response = await request(id);
      assert.equal(response.status, 404, id);
      assert.equal(await response.text(), 'Post not found');
    });
  }
  for (const id of ['own', 'joined']) {
    await t.test(id, async () => {
      const response = await request(id);
      assert.equal(response.status, 200, id);
      const post = await response.json();
      assert.equal(post.id, id);
      assert.equal(post.message, 'Private post');
      assert.deepEqual(post.tags, posts[0].tags);
      assert.deepEqual(post.reactions, posts[0].reactions);
      assert.deepEqual(post.comments.map(comment => comment.id), ['earlier', 'later']);
      assert.deepEqual(post.comments.map(comment => comment.message), ['First private comment', 'Second private comment']);
      for (const returnedAuthor of [post.author, ...post.comments.map(comment => comment.author)]) {
        assert.equal('hashedPassword' in returnedAuthor, false);
        assert.equal('githubAccessToken' in returnedAuthor, false);
        assert.deepEqual(Object.keys(returnedAuthor).sort(), Object.keys(safeAuthor).sort());
        for (const field of Object.keys(safeAuthor)) assert.equal(returnedAuthor[field], safeAuthor[field]);
      }
    });
  }
});

test('shared post access protects comments, replies and action history before content reads', async (t) => {
  const author = { id: 'author', name: 'Author', image: 'avatar', email: 'private@example.test', hashedPassword: 'synthetic', githubAccessToken: 'synthetic' };
  const posts = [...workspaces, null].map(workspace => ({ id: workspace?.id ?? 'unscoped', workspace,
    workspaceId: workspace?.id ?? null, authorId: 'alice' }));
  let user = null, contentReads = 0, metadataReads = 0, fail = false;
  const projectAuthor = selection => Object.fromEntries(Object.entries(author).filter(([field]) => selection?.select[field]));
  const db = {
    user: { findUnique: async () => user },
    post: { findFirst: async ({ where, include }) => {
      metadataReads++; if (fail) throw new Error('Post not found');
      const post = posts.find(row => matches(row, where));
      if (!post) return null;
      if (!include) return { id: post.id };
      contentReads++;
      return { ...post, message: 'Private', author: projectAuthor(include.author), comments: [], tags: [], reactions: [] };
    } },
    comment: { findMany: async ({ where, include }) => {
      contentReads++;
      const post = posts.find(row => row.id === where.postId);
      if (where.post && !matches(post, where.post)) return [];
      const replies = Boolean(where.NOT);
      return [{ id: replies ? 'reply' : 'comment', postId: post.id, parentId: replies ? 'comment' : null,
        message: replies ? 'Reply message' : 'Comment message', html: '<p>Private HTML</p>',
        author: projectAuthor(include.author), reactions: [{ id: 'reaction', author: projectAuthor(include.reactions.include.author) }] }];
    } },
    reaction: { findMany: async ({ where, include }) => {
      contentReads++;
      const post = posts.find(row => row.id === where.postId);
      if (where.post && !matches(post, where.post)) return [];
      return [{ id: 'reaction', authorId: 'alice', author: projectAuthor(include.author) }];
    } },
    postAction: { findMany: async ({ where, include }) => {
      contentReads++;
      const post = posts.find(row => row.id === where.postId);
      if (where.post && !matches(post, where.post)) return [];
      return [{ id: 'action', user: projectAuthor(include.user), newValue: 'Private history' }];
    } },
  };
  const dependencies = {
    'next/server': { NextResponse: Response }, '@/lib/session': { getCurrentUser: async () => user },
    '@/lib/prisma': { prisma: db }, '@/lib/user-utils': load('src/lib/user-utils.ts'),
    '@/lib/auth-options': { authOptions: {} }, 'next-auth': { getServerSession: async () => user && { user: { email: 'alice@example.test' } } },
    '@/utils/mentions': {}, '@/lib/notification-service': {},
  };
  const globals = { console: { error() {} }, Error };
  const reactions = load('src/app/api/posts/[postId]/reactions/route.ts', dependencies, globals).GET;
  const comments = load('src/app/api/posts/[postId]/comments/route.ts', dependencies, globals).GET;
  const postGet = load('src/app/api/posts/[postId]/route.ts', dependencies, globals).GET;
  const actions = load('src/actions/post.ts', dependencies, globals);
  const request = (handler, id) => handler(new Request('https://example.test'), { params: Promise.resolve({ postId: id }) });
  await t.test('anonymous reads do not query posts or comments', async () => {
    for (const handler of [comments, postGet, reactions]) assert.equal((await request(handler, 'joined')).status, 401);
    await assert.rejects(actions.getPostById('joined'), /Unauthorized/);
    await assert.rejects(actions.getPostActions('joined'), /Unauthorized/);
    assert.equal(metadataReads, 0); assert.equal(contentReads, 0);
  });
  user = { id: 'alice' };
  for (const id of ['foreign', 'revoked', 'unscoped', 'missing']) await t.test(id, async () => {
    contentReads = 0;
    for (const handler of [comments, postGet, reactions]) {
      const response = await request(handler, id);
      assert.equal(response.status, 404); assert.equal(await response.text(), 'Post not found');
    }
    await assert.rejects(actions.getPostById(id), /Post not found/);
    await assert.rejects(actions.getPostActions(id), /Post not found/);
    assert.equal(contentReads, 0);
  });
  for (const id of ['own', 'joined']) await t.test(id, async () => {
    const response = await request(comments, id);
    assert.equal(response.status, 200);
    const { comments: [comment] } = await response.json();
    assert.equal(comment.message, 'Comment message'); assert.equal(comment.html, '<p>Private HTML</p>');
    assert.equal(comment.replies[0].message, 'Reply message'); assert.equal(comment.replies[0].parentId, comment.id);
    for (const row of [comment, comment.replies[0], comment.reactions[0], comment.replies[0].reactions[0]]) {
      assert.deepEqual(row.author, { id: author.id, name: author.name, image: author.image });
    }
    const reactionResponse = await request(reactions, id);
    assert.equal(reactionResponse.status, 200);
    const reactionBody = await reactionResponse.json();
    assert.equal(reactionBody.hasReacted, true);
    assert.deepEqual(reactionBody.reactions[0].author, { id: author.id, name: author.name, image: author.image });
    assert.equal((await actions.getPostById(id)).message, 'Private');
    assert.equal((await actions.getPostActions(id))[0].newValue, 'Private history');
  });
  await t.test('storage exceptions remain server errors instead of legacy action error mappings', async () => {
    fail = true;
    assert.equal((await request(postGet, 'joined')).status, 500);
  });
});

test('comment server action enforces shared post access before both content queries', async (t) => {
  const author = { id: 'bob', name: 'Bob', image: 'avatar', role: 'DEVELOPER', useCustomAvatar: true,
    email: 'private@example.test', hashedPassword: 'synthetic', githubAccessToken: 'synthetic' };
  const posts = [...workspaces, null].map(workspace => ({ id: workspace?.id ?? 'unscoped', workspace }));
  const rows = posts.flatMap(post => [
    { id: `${post.id}-comment`, postId: post.id, post, parentId: null, message: 'Comment', html: '<p>Comment</p>', author },
    { id: `${post.id}-reply`, postId: post.id, post, parentId: `${post.id}-comment`, message: 'Reply', html: '<p>Reply</p>', author },
  ]);
  let session = null, user = { id: 'alice' }, reads = 0, lookups = 0;
  const projectAuthor = spec => Object.fromEntries(Object.entries(author).filter(([field]) => spec.select[field]));
  const db = {
    user: { findUnique: async () => user },
    post: { findFirst: async ({ where }) => { lookups++; return posts.find(row => matches(row, where)) ?? null; } },
    comment: { findMany: async ({ where, include }) => {
      reads++;
      return rows.filter(row => matches(row, where)).map(({ post, ...row }) => ({ ...row,
        author: projectAuthor(include.author), reactions: [{ author: projectAuthor(include.reactions.include.author) }] }));
    } },
  };
  const { getComments } = load('src/actions/comment.ts', {
    '@/lib/auth-options': { authOptions: {} }, 'next-auth': { getServerSession: async () => session },
    '@/lib/prisma': { prisma: db }, '@/utils/mentions': {}, '@/lib/notification-service': {}, '@/lib/html-sanitizer': {},
  }, { Error });
  await t.test('anonymous', async () => {
    await assert.rejects(getComments('joined'), /Unauthorized/);
    assert.equal(reads, 0); assert.equal(lookups, 0);
  });
  session = { user: { id: 'alice', email: 'alice@example.test' } };
  await t.test('deleted user', async () => {
    user = null;
    await assert.rejects(getComments('joined'), /User not found/);
    assert.equal(reads, 0); assert.equal(lookups, 0);
    user = { id: 'alice' };
  });
  for (const id of ['revoked', 'foreign', 'unscoped', 'missing', '']) await t.test(id || 'empty ID', async () => {
    reads = 0;
    await assert.rejects(getComments(id), /Post not found/);
    assert.equal(reads, 0);
  });
  for (const id of ['own', 'joined']) await t.test(id, async () => {
    reads = 0;
    const result = await getComments(id);
    assert.equal(reads, 2);
    assert.equal(result.topLevelComments.length, 1);
    const comment = result.topLevelComments[0];
    const reply = result.repliesByParentId[comment.id][0];
    assert.equal(comment.message, 'Comment'); assert.equal(reply.message, 'Reply');
    assert.equal(comment.html, '<p>Comment</p>'); assert.equal(reply.html, '<p>Reply</p>');
    for (const row of [comment, reply]) {
      assert.deepEqual(Object.keys(row.author).sort(), ['id', 'image', 'name', 'role', 'useCustomAvatar'].sort());
      assert.equal(row.author.name, author.name);
      assert.deepEqual(Object.keys(row.reactions[0].author).sort(), ['id', 'image', 'name']);
    }
  });
});

test('post collections and counts share active workspace scope for IDs, slugs and implicit feeds', async (t) => {
  const spaces = workspaces.map(workspace => ({ ...workspace, slug: `slug-${workspace.id}` }));
  const posts = [...spaces, null].map(workspace => ({ id: `p-${workspace?.id ?? 'unscoped'}`, workspace,
    workspaceId: workspace?.id ?? null, authorId: 'bob', message: 'Private', type: workspace?.id === 'joined' ? 'IDEA' : 'UPDATE',
    priority: workspace?.id === 'own' ? 'high' : 'normal', followers: [{ userId: 'alice' }] }));
  posts.push({ ...posts.find(row => row.workspaceId === 'joined'), id: 'p-other', authorId: 'carol', type: 'UPDATE', priority: 'critical' });
  const comments = posts.map(post => ({ id: `c-${post.id}`, authorId: 'bob', post }));
  comments.push({ id: 'other-author-comment', authorId: 'carol', post: posts[1] });
  const reactions = posts.map(post => ({ id: `r-${post.id}`, post }));
  let session = null, reads = 0, counts = 0, profileReads = 0;
  const db = {
    workspace: {
      findFirst: async ({ where }) => spaces.find(row => matches(row, where)) ?? null,
      findMany: async ({ where }) => spaces.filter(row => matches(row, where)),
    },
    user: { findUnique: async () => { profileReads++; return { id: 'bob', name: 'Bob' }; } },
    workspaceMember: { findUnique: async () => null },
    post: {
      findMany: async ({ where, take }) => {
        reads++;
        const result = posts.filter(row => matches(row, where)).sort((a, b) => b.id.localeCompare(a.id));
        return take === undefined ? result : result.slice(0, take);
      },
      count: async ({ where }) => { counts++; return posts.filter(row => matches(row, where)).length; },
    },
    comment: { count: async ({ where }) => { counts++; return comments.filter(row => matches(row, where)).length; } },
    reaction: { count: async ({ where }) => { counts++; return reactions.filter(row => matches(row, where)).length; } },
  };
  const dependencies = {
    '@/lib/prisma': { prisma: db }, 'next-auth': { getServerSession: async () => session }, '@/lib/auth-options': { authOptions: {} },
    '@/lib/user-utils': load('src/lib/user-utils.ts'), '@/utils/mentions': {}, '@/lib/notification-service': {},
  };
  const { getPosts, getUserPosts } = load('src/actions/post.ts', dependencies, { Error });
  const { getPostStats } = load('src/actions/postStats.ts', dependencies, { Error });
  const profile = { authorId: 'bob', includeProfileData: true };
  await t.test('anonymous', async () => {
    await assert.rejects(getPosts({ ...profile, workspaceId: 'joined' }), /Unauthorized/);
    await assert.rejects(getUserPosts('bob', 'joined'), /Unauthorized/);
    await assert.rejects(getPostStats({ workspaceId: 'joined' }), /Unauthorized/);
    assert.equal(reads + counts + profileReads, 0);
  });
  session = { user: { id: 'alice', email: 'alice@example.test' } };
  for (const workspaceId of ['foreign', 'slug-foreign', 'revoked', 'slug-revoked', 'missing']) await t.test(workspaceId, async () => {
    reads = 0; counts = 0; profileReads = 0;
    const result = await getPosts({ ...profile, workspaceId });
    assert.deepEqual(JSON.parse(JSON.stringify(result)), { posts: [], hasMore: false, nextCursor: null });
    await assert.rejects(getUserPosts('bob', workspaceId), /access denied/);
    assert.equal(reads + counts + profileReads, 0);
    const stats = await getPostStats({ workspaceId });
    assert.ok(Object.values(stats).every(value => value === 0));
  });
  for (const workspaceId of ['own', 'slug-own', 'joined', 'slug-joined', undefined]) await t.test(workspaceId ?? 'implicit', async () => {
    const joined = workspaceId?.includes('joined');
    const result = await getPosts({ ...profile, workspaceId });
    const expectedIds = workspaceId ? [joined ? 'p-joined' : 'p-own'] : ['p-own', 'p-joined'];
    assert.deepEqual(Array.from(result.posts, post => post.id), expectedIds);
    assert.ok(result.posts.every(post => post.isFollowing));
    assert.equal(result.stats.postCount, expectedIds.length);
    assert.equal(result.stats.commentCount, workspaceId ? (joined ? 2 : 1) : 3);
    assert.equal(result.stats.reactionsReceived, expectedIds.length);
    assert.equal(result.user.name, 'Bob');
    const stats = await getPostStats({ workspaceId });
    assert.equal(stats.total, workspaceId ? (joined ? 2 : 1) : 3);
    assert.equal(stats.updates, workspaceId ? 1 : 2);
    assert.equal(stats.ideas, workspaceId ? (joined ? 1 : 0) : 1);
    assert.equal(stats.priority, workspaceId ? 1 : 2);
    if (workspaceId && !workspaceId.startsWith('slug-')) {
      assert.deepEqual(Array.from(await getUserPosts('bob', workspaceId), post => post.id), expectedIds);
    }
  });
  await t.test('pagination keeps aggregate counts scoped and independent of page size', async () => {
    const first = await getPosts({ ...profile, limit: 1 });
    assert.equal(first.hasMore, true); assert.equal(first.nextCursor, 'p-own');
    assert.equal(first.stats.postCount, 2); assert.equal(first.stats.commentCount, 3);
    const second = await getPosts({ ...profile, limit: 1, cursor: first.nextCursor });
    assert.deepEqual(Array.from(second.posts, post => post.id), ['p-joined']);
    assert.equal(second.hasMore, false); assert.equal(second.stats.postCount, 2);
  });
  await t.test('no accessible workspace does not trigger unscoped profile reads or counts', async () => {
    session = { user: { id: 'outsider', email: 'outsider@example.test' } };
    reads = 0; counts = 0; profileReads = 0;
    const result = await getPosts(profile);
    assert.equal(result.posts.length, 0); assert.equal(result.user, undefined); assert.equal(result.stats, undefined);
    assert.equal(reads + counts + profileReads, 0);
    assert.equal((await getPostStats({})).total, 0);
  });
});
