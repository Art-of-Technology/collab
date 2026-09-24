const { assert, test, resolve, load, matches, workspaces, prisma } = require('./helpers.cjs');


test('post sibling readers and mutators enforce access before disclosure or writes', async (t) => {
  let user, spaces, posts, comments, reactions, writes, contentReads, identityReads, grants, effects;
  const author = { id: 'alice', name: 'Alice', image: 'avatar', role: 'DEVELOPER', useCustomAvatar: true,
    email: 'private@example.test', hashedPassword: 'synthetic', githubAccessToken: 'synthetic' };
  function reset() {
    user = { id: 'alice', email: 'alice@example.test', name: 'Alice' };
    spaces = structuredClone(workspaces);
    posts = [...spaces, null].map(workspace => ({ id: workspace?.id ?? 'unscoped', workspace,
      workspaceId: workspace?.id ?? null, authorId: 'alice', author, type: 'BLOCKER', priority: 'normal', message: 'Protected post' }));
    comments = posts.map(post => ({ id: `c-${post.id}`, postId: post.id, post, authorId: 'alice', author,
      message: 'Protected comment', html: '<p>Protected HTML</p>', parentId: null }));
    reactions = []; writes = []; contentReads = 0; identityReads = 0; effects = 0; grants = [];
  }
  function selectAuthor(spec) {
    return spec === true ? { ...author } : Object.fromEntries(Object.entries(author).filter(([field]) => spec?.select[field]));
  }
  function project(row, spec = {}, kind) {
    if (!row) return null;
    if (spec.select) return Object.fromEntries(Object.entries(spec.select).filter(([, value]) => value === true).map(([key]) => [key, row[key]]));
    if (kind !== 'reaction') contentReads++;
    const { workspace, post, comment, author: ignored, ...result } = row;
    const include = spec.include ?? {};
    if (include.author) result.author = selectAuthor(include.author);
    if (include.workspace) result.workspace = workspace;
    if (include.comments) result.comments = comments.filter(c => c.postId === row.id).map(c => project(c, include.comments, 'comment'));
    if (include.reactions) result.reactions = reactions.filter(r => r.commentId === row.id || r.postId === row.id)
      .map(r => project(r, include.reactions, 'reaction'));
    if (include.followers) result.followers = [];
    if (include.tags) result.tags = [];
    if (include.children) result.children = comments.filter(c => c.parentId === row.id);
    return result;
  }
  const model = (getRows, kind) => ({
    findFirst: async spec => project(getRows().find(row => matches(row, spec.where)), spec, kind),
    findUnique: async spec => project(getRows().find(row => matches(row, spec.where)), spec, kind),
    findMany: async spec => getRows().filter(row => matches(row, spec.where)).map(row => project(row, spec, kind)),
    update: async spec => {
      const row = getRows().find(row => matches(row, spec.where)); assert.ok(row);
      writes.push([kind, 'update', row.id]); Object.assign(row, spec.data); return project(row, spec, kind);
    },
    delete: async spec => {
      const rows = getRows(); const index = rows.findIndex(row => matches(row, spec.where)); assert.ok(index >= 0);
      const deleted = rows[index];
      const cascade = id => {
        if (kind === 'comment') for (const child of [...rows].filter(row => row.parentId === id)) cascade(child.id);
        const offset = rows.findIndex(row => row.id === id);
        writes.push([kind, 'delete', id]); rows.splice(offset, 1);
      };
      cascade(deleted.id); return deleted;
    },
  });
  const db = {
    user: { findUnique: async ({ include }) => user && ({ ...user, role: 'DEVELOPER',
      workspaceMemberships: include ? spaces.flatMap(w => w.members.filter(m => m.userId === user.id &&
        matches({ ...m, workspaceId: w.id }, include.workspaceMemberships.where)).map(m => ({ ...m, role: 'MEMBER' }))) : [],
      ownedWorkspaces: include ? spaces.filter(w => w.ownerId === user.id && matches(w, include.ownedWorkspaces.where)) : [] }) },
    workspace: {
      findFirst: async ({ where }) => spaces.find(row => matches(row, where)) ?? null,
      findUnique: async ({ where }) => spaces.find(row => matches(row, where)) ?? null,
      findMany: async ({ where }) => spaces.filter(row => matches(row, where)),
    },
    rolePermission: { findUnique: async ({ where }) => grants.includes(where.workspaceId_role_permission.permission) ? {} : null },
    post: model(() => posts, 'post'), comment: model(() => comments, 'comment'),
    reaction: {
      findFirst: async spec => { identityReads++; return project(reactions.find(row => matches(row, spec.where)), spec, 'reaction'); },
      findMany: async spec => { identityReads++; return reactions.filter(row => matches(row, spec.where)).map(row => project(row, spec, 'reaction')); },
      create: async spec => {
        const postId = spec.data.postId ?? spec.data.post?.connect.id;
        const commentId = spec.data.commentId ?? spec.data.comment?.connect.id;
        const row = { id: `r-${reactions.length}`, type: spec.data.type, authorId: spec.data.authorId ?? spec.data.author?.connect.id,
          postId, commentId, post: posts.find(p => p.id === postId), comment: comments.find(c => c.id === commentId) };
        writes.push(['reaction', 'create', row.id]); reactions.push(row); return project(row, spec, 'reaction');
      },
      delete: async ({ where }) => { writes.push(['reaction', 'delete', where.id]); reactions = reactions.filter(row => row.id !== where.id); },
      deleteMany: async ({ where }) => { writes.push(['reaction', 'deleteMany']); reactions = reactions.filter(row => !matches(row, where)); },
    },
    postAction: { create: async () => { writes.push(['postAction', 'create']); } },
    $transaction: async fn => fn(db),
    $queryRaw: async (sql, value) => {
      if (sql.join('').includes('FROM "Post"')) return posts.filter(p => p.id === value).map(p => ({ id: p.id }));
      return comments.filter(c => Array.isArray(value) ? value.includes(c.parentId)
        : sql.join('').includes('WHERE "postId"') ? c.postId === value : c.id === value)
        .map(c => ({ id: c.id, postId: c.postId }));
    },
  };
  db.post.create = async spec => {
    const workspaceId = spec.data.workspaceId ?? spec.data.workspace?.connect.id;
    const row = { ...spec.data, id: 'created', workspaceId, workspace: spaces.find(w => w.id === workspaceId), authorId: 'alice' };
    posts.push(row); writes.push(['post', 'create', row.id]); return project(row, spec, 'post');
  };
  db.comment.create = async spec => {
    const postId = spec.data.postId ?? spec.data.post?.connect.id;
    const row = { ...spec.data, id: 'created-comment', postId, post: posts.find(p => p.id === postId), authorId: 'alice' };
    comments.push(row); writes.push(['comment', 'create', row.id]); return project(row, spec, 'comment');
  };
  const permissionModule = load('src/lib/permissions.ts', { './prisma': { prisma: db } }, { console });
  const notifications = { autoFollowPost: async () => { effects++; }, notifyPostFollowers: async () => { effects++; },
    addPostFollower: async () => { writes.push(['follow', 'create']); }, removePostFollower: async () => { writes.push(['follow', 'delete']); },
    isUserFollowingPost: async () => { identityReads++; return true; } };
  const deps = {
    'next/server': { NextResponse: Response }, '@/lib/prisma': { prisma: db },
    '@/lib/session': { getCurrentUser: async () => user },
    'next-auth': { getServerSession: async () => user && { user } }, '@/lib/auth-options': { authOptions: {} }, '@/lib/auth': { authConfig: {} },
    '@/lib/permissions': permissionModule, '@/lib/user-utils': load('src/lib/user-utils.ts'),
    '@/utils/mentions': { extractMentionUserIds: () => [] }, '@/lib/html-sanitizer': { sanitizeHtmlToPlainText: value => value },
    '@/lib/notification-service': { NotificationService: notifications, NotificationType: {} },
  };
  const globals = { Error, URL, console };
  const postActions = load('src/actions/post.ts', deps, globals);
  const commentActions = load('src/actions/comment.ts', deps, globals);
  const reactionActions = load('src/actions/reaction.ts', deps, globals);
  const loadRoute = path => load(`src/app/api/posts/${path}route.ts`, { ...deps, '@/actions/post': postActions }, globals);
  const likes = loadRoute('[postId]/comments/[commentId]/like/');
  const resolvePost = loadRoute('[postId]/resolve/');
  const postRoute = loadRoute('[postId]/');
  const commentRoute = loadRoute('[postId]/comments/[commentId]/');
  const createComment = loadRoute('[postId]/comments/');
  const react = loadRoute('[postId]/reactions/');
  const pin = loadRoute('[postId]/pin/');
  const follow = loadRoute('[postId]/follow/');
  const collection = loadRoute('');
  const edit = { message: 'Edited', type: 'BLOCKER', priority: 'normal', tags: [] };
  const request = (handler, id, body, method = 'POST', commentId = `c-${id}`) => handler(new Request(`https://example.test/api/posts?workspaceId=${id}`, {
    method, ...(body ? { body: JSON.stringify(body) } : {}),
  }), { params: Promise.resolve({ postId: id, commentId }) });
  const seedReaction = (id, comment = false) => reactions.push({ id: 'existing', type: 'LIKE', authorId: 'alice',
    ...(comment ? { commentId: `c-${id}`, comment: comments.find(c => c.id === `c-${id}`) } : { postId: id, post: posts.find(p => p.id === id) }) });
  const endpoints = [
    ['like POST', id => request(likes.POST, id), true], ['like GET', id => request(likes.GET, id, null, 'GET'), true],
    ['resolve PATCH', id => request(resolvePost.PATCH, id, {}, 'PATCH'), true],
    ['post reactions action', id => reactionActions.getPostReactions(id)],
    ['comment reactions action', id => reactionActions.getCommentReactions(`c-${id}`)],
    ['add post reaction', id => reactionActions.addReaction({ postId: id, type: 'LIKE' })],
    ['add comment reaction', id => reactionActions.addReaction({ commentId: `c-${id}`, type: 'LIKE' })],
    ['remove post reaction', id => { seedReaction(id); return reactionActions.removeReaction({ postId: id, type: 'LIKE' }); }],
    ['remove comment reaction', id => { seedReaction(id, true); return reactionActions.removeReaction({ commentId: `c-${id}`, type: 'LIKE' }); }],
    ['post PATCH', id => request(postRoute.PATCH, id, edit, 'PATCH'), true],
    ['post DELETE', id => request(postRoute.DELETE, id, null, 'DELETE'), true],
    ['update post action', id => postActions.updatePost(id, edit)], ['delete post action', id => postActions.deletePost(id)],
    ['create comment POST', id => request(createComment.POST, id, { message: 'New' }), true],
    ['create comment action', id => commentActions.createComment({ postId: id, message: 'New' })],
    ['comment PATCH', id => request(commentRoute.PATCH, id, { message: 'Edited' }, 'PATCH'), true],
    ['comment DELETE', id => request(commentRoute.DELETE, id, null, 'DELETE'), true],
    ['update comment action', id => commentActions.updateComment(`c-${id}`, { message: 'Edited' })],
    ['delete comment action', id => commentActions.deleteComment(`c-${id}`)],
    ['reaction POST', id => request(react.POST, id, { type: 'LIKE' }), true],
    ['pin PUT', id => request(pin.PUT, id, { isPinned: true }, 'PUT'), true],
    ['follow POST', id => request(follow.POST, id), true],
    ['follow DELETE', id => request(follow.DELETE, id, null, 'DELETE'), true],
    ['follow GET', id => request(follow.GET, id, null, 'GET'), true],
    ['create post POST', id => request(collection.POST, id, { ...edit, workspaceId: id }), true],
    ['create post action', id => postActions.createPost({ ...edit, workspaceId: id })],
  ];
  for (const [name, invoke, http] of endpoints) {
    for (const id of ['anonymous', 'revoked', 'foreign', 'unscoped']) await t.test(`${name}: denies ${id}`, async () => {
      reset(); if (id === 'anonymous') user = null;
      const target = id === 'anonymous' ? 'joined' : id;
      if (http) {
        const response = await invoke(target);
        const body = await response.text();
        assert.ok([401, 403, 404].includes(response.status), `${response.status}: ${body}`);
        assert.doesNotMatch(body, /Protected|synthetic|private@example/);
      } else await assert.rejects(invoke(target), /Unauthorized|not found|access denied/i);
      assert.equal(contentReads, 0); assert.equal(identityReads, 0); assert.equal(writes.length, 0); assert.equal(effects, 0);
    });
    for (const id of ['own', 'joined']) await t.test(`${name}: allows ${id}`, async () => {
      reset();
      const result = await invoke(id);
      if (http) assert.ok(result.status >= 200 && result.status < 300, `${result.status}: ${await result.text()}`);
      else assert.ok(result);
    });
  }
  await t.test('like toggle returns authorized comment and safe authors for add and remove', async () => {
    reset();
    for (const status of ['added', 'removed']) {
      const response = await request(likes.POST, 'joined');
      assert.equal(response.status, 200);
      const result = await response.json();
      assert.equal(result.status, status); assert.equal(result.comment.message, 'Protected comment');
      assert.equal(result.comment.html, '<p>Protected HTML</p>');
      assert.equal(result.comment.author.name, 'Alice');
      assert.equal(result.comment.author.hashedPassword, undefined); assert.equal(result.comment.author.email, undefined);
    }
    assert.deepEqual(writes.map(row => row[1]), ['create', 'delete']);
  });
  await t.test('reaction readers preserve identities, grouping and hasReacted for authorized users', async () => {
    reset(); seedReaction('joined'); seedReaction('joined', true);
    const postResult = await reactionActions.getPostReactions('joined');
    assert.equal(postResult.hasReacted, true); assert.equal(postResult.reactionsByType.LIKE.length, 1);
    const commentResult = await reactionActions.getCommentReactions('c-joined');
    assert.equal(commentResult.hasReacted, true); assert.equal(commentResult.reactions[0].author.name, 'Alice');
    assert.equal(commentResult.reactions[0].author.hashedPassword, undefined);
    assert.equal((await (await request(likes.GET, 'joined', null, 'GET')).json()).likes.length, 1);
  });
  await t.test('post/comment relationship is enforced even when both resources are accessible', async () => {
    reset();
    for (const method of ['GET', 'POST']) {
      assert.equal((await request(likes[method], 'own', null, method, 'c-joined')).status, 404);
    }
    for (const fn of [reactionActions.addReaction, reactionActions.removeReaction]) {
      await assert.rejects(fn({ postId: 'own', commentId: 'c-joined', type: 'LIKE' }), /not found/);
    }
    await assert.rejects(commentActions.createComment({ postId: 'own', parentId: 'c-joined', message: 'New' }), /not found/);
    assert.equal(writes.length, 0); assert.equal(identityReads, 0);
  });
  await t.test('resolve keeps operation permissions and blocker validation', async () => {
    reset(); posts.find(p => p.id === 'joined').authorId = 'bob';
    assert.equal((await request(resolvePost.PATCH, 'joined', {}, 'PATCH')).status, 403);
    assert.equal(writes.length, 0);
    grants = ['RESOLVE_BLOCKER'];
    const response = await request(resolvePost.PATCH, 'joined', {}, 'PATCH');
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.type, 'RESOLVED'); assert.equal(result.comments[0].message, 'Protected comment');
    assert.equal(result.author.hashedPassword, undefined); assert.equal(result.comments[0].author.email, undefined);
    assert.equal(writes.filter(row => row[0] === 'postAction').length, 1);
    reset(); posts.find(p => p.id === 'joined').type = 'UPDATE';
    assert.equal((await request(resolvePost.PATCH, 'joined', {}, 'PATCH')).status, 400);
    assert.equal(writes.length, 0);
  });
  await t.test('post and comment author checks and pin permissions remain required', async () => {
    reset(); posts.find(p => p.id === 'joined').authorId = 'bob'; comments.find(c => c.id === 'c-joined').authorId = 'bob';
    for (const invoke of [() => postActions.updatePost('joined', edit), () => postActions.deletePost('joined'),
      () => commentActions.updateComment('c-joined', { message: 'Denied' }), () => commentActions.deleteComment('c-joined')]) {
      await assert.rejects(invoke(), /Unauthorized|own comments/);
    }
    assert.equal((await request(pin.PUT, 'joined', { isPinned: true }, 'PUT')).status, 403);
    assert.equal(writes.length, 0);
    grants = ['PIN_POST']; assert.equal((await request(pin.PUT, 'joined', { isPinned: true }, 'PUT')).status, 200);
  });
  await t.test('collection REST reads use the same active workspace boundary', async () => {
    reset(); user = null;
    assert.equal((await request(collection.GET, 'joined', null, 'GET')).status, 401);
    user = { id: 'alice', email: 'alice@example.test' };
    for (const id of ['foreign', 'revoked', 'unscoped']) {
      assert.deepEqual(await (await request(collection.GET, id, null, 'GET')).json(), []);
    }
    assert.equal(contentReads, 0);
    const result = await collection.GET(new Request('https://example.test/api/posts'));
    assert.deepEqual((await result.json()).map(row => row.id).sort(), ['joined', 'own']);
  });
  await t.test('recursive deletion rejects the entire malformed subtree before any deletion', async () => {
    for (const http of [false, true]) for (const depth of [1, 2]) {
      reset();
      comments.push({ ...comments[0], id: 'valid-reply', parentId: 'c-own' });
      comments.find(c => c.id === 'c-foreign').parentId = depth === 1 ? 'c-own' : 'valid-reply';
      if (http) assert.equal((await request(commentRoute.DELETE, 'own', null, 'DELETE')).status, 500);
      else await assert.rejects(commentActions.deleteComment('c-own'), /Invalid comment tree/);
      assert.equal(comments.length, 6); assert.equal(writes.length, 0);
    }
  });
  await t.test('valid comment deletion cascades through replies', async () => {
    reset(); comments.push({ ...comments[0], id: 'reply', parentId: 'c-own' });
    await commentActions.deleteComment('c-own');
    assert.equal(comments.some(c => ['c-own', 'reply'].includes(c.id)), false);
    assert.ok(comments.some(c => c.id === 'c-foreign'));
  });
});
