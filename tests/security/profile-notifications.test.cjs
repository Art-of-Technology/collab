const { assert, test, resolve, load, matches, workspaces, prisma } = require('./helpers.cjs');


test('profile timeline and notification boundaries recheck current viewer access', async (t) => {
  let user = { id: 'alice', email: 'alice@example.test', name: 'Alice' };
  let protectedReads = 0, writes = [], deliveries = [];
  const spaces = structuredClone(workspaces);
  const author = { id: 'bob', name: 'Bob', hashedPassword: 'synthetic-secret' };
  const posts = [...spaces, null].map(workspace => ({ id: workspace?.id ?? 'unscoped', workspace,
    workspaceId: workspace?.id ?? null, authorId: 'bob', author, type: 'BLOCKER', resolvedAt: null,
    message: `Protected ${workspace?.id}`, html: '<p>Protected HTML</p>', createdAt: new Date(),
    _count: { comments: 1, reactions: 1 } }));
  const comments = posts.map(post => ({ id: `c-${post.id}`, postId: post.id, post, noteId: null, note: null, authorId: 'bob', message: `Protected comment ${post.id}` }));
  const reactions = posts.map(post => ({ id: `r-${post.id}`, post }));
  const notifications = posts.flatMap(post => [
    { id: `n-${post.id}`, userId: 'alice', postId: post.id, post, commentId: null, comment: null, read: false, content: `Protected preview ${post.id}` },
    { id: `nc-${post.id}`, userId: 'alice', postId: null, post: null, commentId: `c-${post.id}`,
      comment: comments.find(c => c.postId === post.id), read: false, content: `Protected comment preview ${post.id}` },
  ]);
  notifications.push({ id: 'generic', userId: 'alice', postId: null, post: null, commentId: null, comment: null, read: false, content: 'Generic' });
  const pick = (row, select) => !row ? null : select ? Object.fromEntries(Object.entries(select).filter(([,v]) => v === true).map(([k]) => [k, row[k]])) : row;
  const records = rows => ({
    findFirst: async ({ where, select }) => pick(rows.find(row => matches(row, where)), select),
    findUnique: async ({ where, select }) => pick(rows.find(row => matches(row, where)), select),
    findMany: async ({ where = {}, select } = {}) => rows.filter(row => matches(row, where)).map(row => pick(row, select)),
    count: async ({ where }) => rows.filter(row => matches(row, where)).length,
  });
  const db = {
    workspace: records(spaces),
    workspaceMember: { findFirst: async ({ where }) => spaces.flatMap(w => w.members.map(m => ({ ...m, workspaceId: w.id })))
      .find(m => matches(m, where)), findUnique: async () => null, findMany: async () => [] },
    user: { findUnique: async ({ where }) => where.email ? user : author },
    post: { ...records(posts), findMany: async spec => {
      protectedReads++;
      return posts.filter(row => matches(row, spec.where)).map(post => ({ ...post,
        author: pick(author, spec.include?.author?.select),
        comments: comments.filter(c => c.postId === post.id), reactions: reactions.filter(r => r.post.id === post.id),
      }));
    }, create: async spec => { writes.push(spec.data); return { id: 'new', ...spec.data }; } },
    comment: records(comments), reaction: records(reactions), conversation: { findFirst: async () => null },
    notification: { ...records(notifications),
      findMany: async spec => { const rows = notifications.filter(row => matches(row, spec.where)); protectedReads += rows.length; return rows; },
      groupBy: async () => [], createMany: async ({ data }) => { writes.push(...data); return { count: data.length }; },
      update: async ({ where, data }) => { const row = notifications.find(row => matches(row, where)); assert.ok(row); writes.push(data); return { ...row, ...data }; },
    },
    notificationPreferences: { findFirst: async () => null },
    postFollower: { findMany: async () => ['alice', 'bob', 'revoked-user', 'foreign-user'].map(userId => ({ userId })) },
  };
  for (const key of ['issueActivity', 'issue', 'issueComment', 'view', 'project']) db[key] = {
    findMany: async () => { protectedReads++; return []; }, count: async () => { protectedReads++; return 0; },
  };
  const deps = {
    '@/lib/prisma': { prisma: db }, 'next/server': { NextResponse: Response },
    'next-auth': { getServerSession: async () => user && { user } }, 'next-auth/next': { getServerSession: async () => user && { user } },
    '@/lib/session': { getCurrentUser: async () => user }, '@/lib/auth': {}, '@/lib/auth-options': {},
    '@/lib/issue-finder': {}, '@/lib/user-utils': load('src/lib/user-utils.ts'),
    '@/utils/teamSyncAnalyzer': { classifyStatus: () => 'todo' }, '@/utils/mentions': { extractMentionUserIds: () => ['bob'] },
    '@/lib/html-sanitizer': { sanitizeHtmlToPlainText: value => value },
    '@/lib/push-notifications': { sendPushNotification: async id => { deliveries.push(id); } },
    '@/lib/permissions': {}, 'date-fns': {}, '@/lib/logger': { logger: { info() {}, error() {} } },
  };
  const service = load('src/lib/notification-service.ts', deps, { console }).NotificationService;
  deps['@/lib/notification-service'] = { NotificationService: service };
  service.autoFollowPost = async () => { writes.push('follow'); };
  const globals = { URL, Error, console };
  const profile = load('src/actions/user.ts', deps, globals).getUserProfile;
  const timeline = load('src/app/api/timeline/unified/route.ts', deps, globals).GET;
  const dashboard = load('src/app/api/ai/dashboard/route.ts', deps, globals).GET;
  const create = load('src/app/api/timeline/posts/route.ts', deps, globals).POST;
  const list = load('src/app/api/notifications/route.ts', deps, globals).GET;
  db.notification.updateMany = async ({ where, data }) => {
    const rows = notifications.filter(row => matches(row, where));
    writes.push(...rows.map(row => ({ id: row.id, ...data })));
    return { count: rows.length };
  };
  const readAll = load('src/app/api/notifications/read-all/route.ts', deps, globals).POST;
  const mark = load('src/app/api/notifications/[id]/route.ts', deps, globals).PATCH;
  const request = id => new Request(`https://example.test/?workspaceId=${id}`);
  for (const [name, invoke] of [['timeline', timeline], ['dashboard', dashboard], ['create', id => create(new Request('https://example.test', {
    method: 'POST', body: JSON.stringify({ workspaceId: id, content: 'Mentioned post' }),
  }))]]) {
    for (const id of ['anonymous', 'revoked', 'foreign', 'own', 'joined']) await t.test(`${name}: ${id}`, async () => {
      user = id === 'anonymous' ? null : { id: 'alice', email: 'alice@example.test' };
      protectedReads = 0; writes = []; deliveries = [];
      const result = await invoke(name === 'create' ? id : request(id));
      const body = await result.text();
      if (['own', 'joined'].includes(id)) {
        assert.equal(result.status, 200, body);
        if (name === 'create') assert.equal(writes[0].workspaceId, id);
        else assert.match(body, /Protected/);
      } else {
        assert.equal(result.status, id === 'anonymous' ? 401 : 403, body);
        assert.doesNotMatch(body, /Protected/); assert.equal(protectedReads, 0); assert.equal(writes.length, 0); assert.equal(deliveries.length, 0);
      }
    });
  }
  await t.test('timeline creation requires an exact scoped workspace', async () => {
    for (const workspaceId of [null, '', 12, 'missing']) {
      writes = []; deliveries = [];
      const response = await create(new Request('https://example.test', { method: 'POST', body: JSON.stringify({ workspaceId, content: 'Post' }) }));
      assert.ok([400, 403].includes(response.status)); assert.equal(writes.length, 0); assert.equal(deliveries.length, 0);
    }
  });
  await t.test('profile projections and all counts use viewer access', async () => {
    user = null; await assert.rejects(profile('bob', 'joined'), /Unauthorized/);
    for (const id of ['alice', 'outsider']) {
      user = { id, email: `${id}@example.test` };
      const result = await profile('bob', 'joined');
      assert.deepEqual(Array.from(result.posts, p => p.id).sort(), id === 'alice' ? ['joined', 'own'] : []);
      assert.deepEqual({ ...result.stats }, { postCount: id === 'alice' ? 2 : 0, commentCount: id === 'alice' ? 2 : 0, reactionsReceived: id === 'alice' ? 2 : 0 });
      assert.equal(result.posts.some(p => p.author.hashedPassword), false);
    }
  });
  await t.test('notification list and mark-read cannot return revoked previews', async () => {
    user = null; assert.equal((await list(request('own'))).status, 401);
    user = { id: 'alice' }; protectedReads = 0;
    const visible = await (await list(request('own'))).json();
    assert.deepEqual(visible.map(n => n.id).sort(), ['generic', 'n-joined', 'n-own', 'nc-joined', 'nc-own']);
    assert.equal(protectedReads, 5);
    writes = [];
    assert.equal((await (await readAll()).json()).count, 5);
    assert.deepEqual(writes.map(n => n.id).sort(), visible.map(n => n.id).sort());
    for (const id of ['revoked', 'foreign', 'unscoped']) for (const prefix of ['n-', 'nc-']) {
      writes = [];
      const result = await mark(new Request('https://example.test', { method: 'PATCH', body: '{"read":true}' }), { params: Promise.resolve({ id: prefix + id }) });
      assert.equal(result.status, 404); assert.doesNotMatch(await result.text(), /Protected/); assert.equal(writes.length, 0);
    }
    const result = await mark(new Request('https://example.test', { method: 'PATCH', body: '{"read":true}' }), { params: Promise.resolve({ id: 'n-own' }) });
    assert.equal(result.status, 200); assert.equal((await result.json()).read, true);
  });
  await t.test('follower, mention and direct push delivery recheck current access', async () => {
    spaces[1].members.push({ userId: 'revoked-user', status: false });
    const recipients = ['alice', 'bob', 'revoked-user', 'foreign-user'];
    for (const invoke of [
      () => service.notifyPostFollowers({ postId: 'joined', senderId: 'actor', type: 'POST_COMMENT_ADDED', content: 'Protected preview' }),
      () => service.notifyUsers(recipients, 'comment_mention', 'Protected preview', 'actor', { commentId: 'c-joined', postId: 'joined' }),
      () => service.notifyUsers(recipients, 'comment_mention', 'Protected preview', 'actor', { commentId: 'c-joined' }),
    ]) {
      writes = []; deliveries = []; await invoke();
      assert.deepEqual(writes.map(n => n.userId).sort(), ['alice', 'bob']);
      assert.ok(deliveries.every(id => ['alice', 'bob'].includes(id)));
    }
    writes = []; deliveries = [];
    await service.notifyUsers(recipients, 'comment_mention', 'Protected preview', 'actor', { commentId: 'c-foreign', postId: 'joined' });
    for (const id of ['revoked-user', 'foreign-user']) await service.sendPushNotificationForUser(id, 'POST_COMMENT_ADDED', 'Protected preview', undefined, 'joined');
    assert.equal(writes.length, 0); assert.equal(deliveries.length, 0);
    spaces[1].members.find(m => m.userId === 'alice').status = false;
    await service.notifyPostFollowers({ postId: 'joined', senderId: 'actor', type: 'POST_COMMENT_ADDED', content: 'Protected after revocation' });
    assert.deepEqual(writes.map(n => n.userId), ['bob']); assert.deepEqual(deliveries, ['bob']);
  });
});
