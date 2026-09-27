const { assert, test, load, matches } = require('./helpers.cjs');

function fixture() {
  const stamp = new Date('2026-09-27T00:00:00Z');
  const state = {
    session: { user: { id: 'alice', email: 'stale@example.test' } },
    actor: { id: 'alice', email: 'current@example.test', role: 'DEVELOPER', createdAt: stamp, updatedAt: stamp },
    workspace: { id: 'workspace', name: 'Workspace', ownerId: 'bob' },
    members: [{ userId: 'alice', status: true, role: 'MEMBER' }],
    grants: [],
    post: { id: 'post', workspaceId: 'workspace', authorId: 'alice', message: 'Post', isPinned: false, pinnedAt: null, pinnedBy: null },
    followers: [], actions: [], writes: [], logs: [],
  };
  let beforeWrite = () => {}, failAction = false, failFollower = false;
  const workspace = () => ({ ...state.workspace, rolePermissions: state.grants,
    members: state.members.map(member => ({ ...member, user: state.actor })) });
  const post = () => ({ ...state.post, workspace: state.post.workspaceId ? workspace() : null });
  const follower = row => ({ ...row, post: post(), postId_userId: { postId: row.postId, userId: row.userId } });
  function select(row, fields) {
    if (!row) return null;
    return fields ? Object.fromEntries(Object.entries(fields).filter(([, enabled]) => enabled === true)
      .map(([key]) => [key, row[key]])) : { ...row };
  }
  function checkpoint() { const effect = beforeWrite; beforeWrite = () => {}; effect(); }
  function saveAction(data) {
    if (failAction) throw new Error('synthetic-secret action failure');
    state.actions.push({ ...data }); state.writes.push('action');
  }
  const db = {
    user: { findUnique: async ({ where, include }) => {
      if (!state.actor || state.actor.id !== where.id) return null;
      return { ...state.actor, ...(include ? {
        workspaceMemberships: state.members.filter(member => matches({ ...member, workspaceId: state.workspace.id }, include.workspaceMemberships.where)),
        ownedWorkspaces: state.workspace.ownerId === where.id ? [{ id: state.workspace.id }] : [],
      } : {}) };
    } },
    workspace: { findUnique: async ({ where, select: fields }) => select(where.id === state.workspace.id ? workspace() : null, fields) },
    rolePermission: { findUnique: async ({ where }) => state.grants.find(grant => matches(grant, where.workspaceId_role_permission)) ?? null },
    post: {
      findFirst: async ({ where, select: fields }) => select(matches(post(), where) ? post() : null, fields),
      update: async ({ where, data }) => {
        checkpoint();
        if (!matches(post(), where)) throw new Error('synthetic-secret missing row');
        // Model Prisma nested-write rollback: validate nested action before committing either write.
        if (data.actions && failAction) throw new Error('synthetic-secret action failure');
        const { actions, ...values } = data;
        Object.assign(state.post, values); state.writes.push('pin');
        if (actions) saveAction({ postId: state.post.id, ...actions.create });
        return { ...state.post, author: { id: state.post.authorId, name: 'Author', email: 'author@example.test', image: null },
          workspace: { id: state.workspace.id, name: state.workspace.name } };
      },
    },
    postAction: { create: async ({ data }) => saveAction(data) },
    postFollower: {
      upsert: async ({ where, create }) => {
        checkpoint();
        if (failFollower) throw new Error('synthetic-secret follower failure');
        const existing = state.followers.find(row => matches(follower(row), where));
        if (existing) return existing;
        if (create.post && !matches(post(), create.post.connect)) throw new Error('synthetic-secret connect denied');
        const row = { postId: create.postId ?? create.post.connect.id, userId: create.userId ?? create.user.connect.id };
        if (state.followers.some(item => item.postId === row.postId && item.userId === row.userId)) throw new Error('duplicate');
        state.followers.push(row); state.writes.push('follow'); return row;
      },
      deleteMany: async ({ where }) => {
        checkpoint();
        if (failFollower) throw new Error('synthetic-secret follower failure');
        const removed = state.followers.filter(row => matches(follower(row), where));
        state.followers = state.followers.filter(row => !removed.includes(row));
        if (removed.length) state.writes.push('unfollow');
        return { count: removed.length };
      },
      findUnique: async ({ where }) => readFollower(where),
      findFirst: async ({ where }) => readFollower(where),
    },
  };
  function readFollower(where) {
    checkpoint();
    if (failFollower) throw new Error('synthetic-secret follower failure');
    return state.followers.find(row => matches(follower(row), where)) ?? null;
  }
  const globals = { Date, console: { error: (...args) => state.logs.push(args.map(value => value instanceof Error || value?.message ? String(value.message) : value)) } };
  const permissions = load('src/lib/permissions.ts', { './prisma': { prisma: db } }, globals);
  const session = load('src/lib/session.ts', {
    '@/lib/request-session': { getServerSession: async () => state.session },
    '@/lib/auth-options': { authOptions: {} }, '@/lib/prisma': { prisma: db },
  }, globals);
  const { NotificationService } = load('src/lib/notification-service.ts', {
    '@/lib/prisma': { prisma: db }, '@/lib/permissions': permissions,
    '@/lib/push-notifications': { sendPushNotification: () => assert.fail('No provider calls') },
    'date-fns': { format: () => assert.fail('No formatting needed') },
    '@/lib/logger': { logger: { error: (...args) => state.logs.push(args.map(value => value instanceof Error || value?.message ? String(value.message) : value)) } },
    '@/lib/html-sanitizer': {}, '@/lib/notification-access': {},
  }, globals);
  const dependencies = {
    '@/lib/prisma': { prisma: db }, '@/lib/session': session,
    'next/server': { NextResponse: Response },
    'next-auth': { getServerSession: async () => state.session },
    '@/lib/auth-options': { authOptions: {} }, '@/lib/auth': { authConfig: {} },
    '@/lib/permissions': permissions, '@/lib/notification-service': { NotificationService },
  };
  const pin = load('src/app/api/posts/[postId]/pin/route.ts', dependencies, globals);
  const follow = load('src/app/api/posts/[postId]/follow/route.ts', dependencies, globals);
  const invoke = (method, isPinned = true) => (method === 'PUT' ? pin.PUT : follow[method])(
    new Request('https://example.test/post', { method, ...(method === 'PUT' ? { body: JSON.stringify({ isPinned }) } : {}) }),
    { params: Promise.resolve({ postId: 'post' }) });
  return { state, invoke, service: NotificationService,
    beforeWrite(fn) { beforeWrite = fn; }, failAction() { failAction = true; }, failFollower() { failFollower = true; } };
}

for (const method of ['PUT', 'POST', 'DELETE', 'GET']) {
  test(`${method}: absent or deleted immutable actor denied before writes`, async () => {
    for (const absent of [true, false]) {
      const f = fixture();
      if (absent) f.state.session = null; else f.state.actor = null;
      assert.equal((await f.invoke(method)).status, 401);
      assert.deepEqual(f.state.writes, []);
    }
  });
}

test('all routes keep exact workspace access and ID-bound subject', async () => {
  for (const method of ['PUT', 'POST', 'DELETE', 'GET']) {
    for (const mode of ['foreign', 'inactive', 'unscoped', 'wrong-subject']) {
      const f = fixture();
      if (mode === 'foreign') f.state.members = [];
      if (mode === 'inactive') f.state.members[0].status = false;
      if (mode === 'unscoped') f.state.post.workspaceId = null;
      if (mode === 'wrong-subject') f.state.session.user.id = 'outsider';
      const response = await f.invoke(method);
      assert.equal(response.status, mode === 'wrong-subject' ? 401 : 404);
      assert.deepEqual(f.state.writes, []);
    }
  }
});

test('pin authority branches, unpin action and response contract remain', async () => {
  for (const branch of ['author', 'owner', 'configured-role', 'admin']) {
    const f = fixture();
    if (branch !== 'author') f.state.post.authorId = 'bob';
    if (branch === 'owner') { f.state.workspace.ownerId = 'alice'; f.state.members = []; }
    if (branch === 'configured-role') f.state.grants = [{ workspaceId: 'workspace', role: 'MEMBER', permission: 'PIN_POST' }];
    if (branch === 'admin') f.state.actor.role = 'SYSTEM_ADMIN';
    for (const isPinned of [true, false]) {
      const response = await f.invoke('PUT', isPinned);
      assert.equal(response.status, 200, branch);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      const body = await response.json();
      assert.equal(body.success, true); assert.equal(body.post.isPinned, isPinned);
      assert.equal(body.post.pinnedBy, isPinned ? 'alice' : null);
      assert.equal(body.post.author.email, 'author@example.test');
      assert.equal(body.message, isPinned ? 'Post pinned successfully' : 'Post unpinned successfully');
      assert.equal(f.state.actions.at(-1).actionType, isPinned ? 'PINNED' : 'UNPINNED');
    }
  }
});

test('ordinary member and outsider admin cannot pin', async () => {
  for (const admin of [false, true]) {
    const f = fixture(); f.state.post.authorId = 'bob';
    if (admin) { f.state.actor.role = 'SYSTEM_ADMIN'; f.state.members = []; }
    assert.equal((await f.invoke('PUT')).status, admin ? 404 : 403);
    assert.deepEqual(f.state.writes, []);
  }
});

for (const revoked of ['membership', 'author', 'grant', 'member-role', 'admin', 'owner']) {
  test(`pin final write rejects revoked ${revoked} with no partial action`, async () => {
    const f = fixture();
    if (['grant', 'member-role'].includes(revoked)) {
      f.state.post.authorId = 'bob';
      f.state.grants = [{ workspaceId: 'workspace', role: 'MEMBER', permission: 'PIN_POST' }];
    }
    if (revoked === 'admin') { f.state.post.authorId = 'bob'; f.state.actor.role = 'SYSTEM_ADMIN'; }
    if (revoked === 'owner') { f.state.post.authorId = 'bob'; f.state.workspace.ownerId = 'alice'; }
    f.beforeWrite(() => {
      if (revoked === 'membership') f.state.members[0].status = false;
      if (revoked === 'author') f.state.post.authorId = 'bob';
      if (revoked === 'grant') f.state.grants = [];
      if (revoked === 'member-role') f.state.members[0].role = 'VIEWER';
      if (revoked === 'admin') f.state.actor.role = 'DEVELOPER';
      if (revoked === 'owner') f.state.workspace.ownerId = 'bob';
    });
    assert.equal((await f.invoke('PUT')).status, 500);
    assert.equal(f.state.post.isPinned, false);
    assert.deepEqual(f.state.actions, []); assert.deepEqual(f.state.writes, []);
    assert.doesNotMatch(JSON.stringify(f.state.logs), /synthetic-secret/);
  });
}

test('pin action failure rolls back pin fields', async () => {
  const f = fixture(); const before = structuredClone(f.state.post); f.failAction();
  assert.equal((await f.invoke('PUT')).status, 500);
  assert.deepEqual(f.state.post, before);
  assert.deepEqual(f.state.actions, []); assert.deepEqual(f.state.writes, []);
});

for (const existing of [false, true]) {
  test(`follow upsert checks final access on ${existing ? 'existing' : 'create'} branch`, async () => {
    const f = fixture();
    if (existing) f.state.followers.push({ postId: 'post', userId: 'alice' });
    const before = structuredClone(f.state.followers);
    f.beforeWrite(() => { f.state.members[0].status = false; });
    assert.equal((await f.invoke('POST')).status, 500);
    assert.deepEqual(f.state.followers, before); assert.deepEqual(f.state.writes, []);
    assert.doesNotMatch(JSON.stringify(f.state.logs), /synthetic-secret/);
  });
}

test('follow GET and DELETE filter access lost after route lookup', async () => {
  for (const method of ['GET', 'DELETE']) {
    const f = fixture(); f.state.followers.push({ postId: 'post', userId: 'alice' });
    f.beforeWrite(() => { f.state.members[0].status = false; });
    const response = await f.invoke(method);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), method === 'GET' ? { isFollowing: false } : { success: true });
    assert.equal(f.state.followers.length, 1); assert.deepEqual(f.state.writes, []);
  }
});

test('manual follower shared methods protect direct callers too', async () => {
  const f = fixture(); f.state.members = [];
  f.state.followers.push({ postId: 'post', userId: 'alice' });
  await assert.rejects(f.service.addPostFollower('post', 'alice'));
  assert.equal(await f.service.isUserFollowingPost('post', 'alice'), false);
  await f.service.removePostFollower('post', 'alice');
  assert.equal(f.state.followers.length, 1); assert.deepEqual(f.state.writes, []);
});

test('follow duplicate add, reads and repeated remove preserve DTO and post', async () => {
  for (const owner of [false, true]) {
    const f = fixture(); if (owner) { f.state.workspace.ownerId = 'alice'; f.state.members = []; }
    const before = structuredClone(f.state.post);
    for (const method of ['POST', 'POST', 'GET', 'DELETE', 'DELETE', 'GET']) {
      const response = await f.invoke(method);
      assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.deepEqual(await response.json(), method === 'GET' ? { isFollowing: f.state.followers.length > 0 } : { success: true });
    }
    assert.deepEqual(f.state.post, before);
    assert.deepEqual(f.state.writes, ['follow', 'unfollow']);
  }
});

test('follower database errors retain fallback/rethrow with safe logs', async () => {
  for (const method of ['GET', 'POST', 'DELETE']) {
    const f = fixture(); f.failFollower(); const response = await f.invoke(method);
    assert.equal(response.status, method === 'GET' ? 200 : 500);
    if (method === 'GET') assert.deepEqual(await response.json(), { isFollowing: false });
    assert.doesNotMatch(JSON.stringify(f.state.logs), /synthetic-secret/);
    assert.deepEqual(f.state.writes, []);
  }
});
