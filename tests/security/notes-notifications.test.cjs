const { assert, test, load, matches } = require('./helpers.cjs');

test('Notes comment notifications preserve authorized delivery, reads and marks with current Notes access', async t => {
  let user = { id: 'alice' }, writes = [], pushes = [];
  const workspace = { id: 'joined', ownerId: 'bob', members: [{ userId: 'alice', role: 'MEMBER', status: true }] };
  const note = { id: 'note', authorId: 'bob', scope: 'WORKSPACE', workspaceId: 'joined', workspace,
    projectId: null, project: null, isEncrypted: false, isRestricted: false, expiresAt: null, sharedWith: [] };
  const comment = { id: 'comment', postId: null, post: null, noteId: 'note', note, message: 'Note comment preview' };
  const notification = { id: 'notification', userId: 'alice', postId: null, post: null, commentId: comment.id,
    comment, content: 'Note comment preview', read: false };
  const db = {
    comment: { findFirst: async ({ where }) => matches(comment, where) ? { id: comment.id } : null },
    notification: {
      groupBy: async () => [],
      findMany: async ({ where }) => matches(notification, where) ? [notification] : [],
      findFirst: async ({ where }) => matches(notification, where) ? notification : null,
      createMany: async ({ data }) => { writes.push(...data); return { count: data.length }; },
      update: async ({ where, data }) => { assert.ok(matches(notification, where)); writes.push(data); return { ...notification, ...data }; },
      updateMany: async ({ where, data }) => { const allowed = matches(notification, where); if (allowed) writes.push(data); return { count: Number(allowed) }; },
    },
  };
  const deps = { '@/lib/prisma': { prisma: db }, 'next/server': { NextResponse: Response },
    '@/lib/session': { getCurrentUser: async () => user }, '@/lib/push-notifications': { sendPushNotification: async (...args) => pushes.push(args) },
    '@/lib/permissions': {}, 'date-fns': {}, '@/lib/logger': { logger: { info() {}, error() {} } }, '@/lib/html-sanitizer': {} };
  const globals = { URL, console };
  const service = load('src/lib/notification-service.ts', deps, globals).NotificationService;
  const list = load('src/app/api/notifications/route.ts', deps, globals).GET;
  const mark = load('src/app/api/notifications/[id]/route.ts', deps, globals).PATCH;
  const all = load('src/app/api/notifications/read-all/route.ts', deps, globals).POST;
  const initial = { ...note };
  for (const [name, fields, active, allowed] of [
    ['active member', {}, true, true],
    ['revoked member', {}, false, false],
    ['revoked author', { authorId: 'alice' }, false, false],
    ['expired', { expiresAt: new Date(0) }, true, false],
    ['restricted', { isRestricted: true }, true, false],
    ['restricted shared reader', { isRestricted: true, sharedWith: [{ userId: 'alice', permission: 'VIEW' }] }, true, true],
    ['revoked shared reader', { isRestricted: true, sharedWith: [{ userId: 'alice', permission: 'VIEW' }] }, false, false],
    ['private', { scope: 'PERSONAL' }, true, false],
    ['private shared reader', { scope: 'PERSONAL', sharedWith: [{ userId: 'alice', permission: 'VIEW' }] }, true, true],
    ['project workspace', { workspaceId: null, workspace: null, projectId: 'project', project: { workspace }, scope: 'PROJECT' }, true, true],
    ['revoked project member', { workspaceId: null, workspace: null, projectId: 'project', project: { workspace }, scope: 'PROJECT' }, false, false],
  ]) await t.test(name, async () => {
    Object.assign(note, initial, fields); workspace.members[0].status = active;
    writes = []; pushes = [];
    assert.equal(await service.notifyUsers(['alice'], 'comment_mention', notification.content, 'bob', { commentId: comment.id }), Number(allowed));
    assert.equal(writes.length, Number(allowed)); assert.equal(pushes.length, 0);
    assert.equal((await (await list(new Request('https://example.test'))).json()).length, Number(allowed));
    writes = [];
    const response = await mark(new Request('https://example.test', { method: 'PATCH', body: '{"read":true}' }), { params: Promise.resolve({ id: notification.id }) });
    assert.equal(response.status, allowed ? 200 : 404); assert.equal(writes.length, Number(allowed));
    if (!allowed) assert.doesNotMatch(await response.text(), /Note comment preview/);
    writes = [];
    assert.equal((await (await all()).json()).count, Number(allowed)); assert.equal(writes.length, Number(allowed));
  });
  await t.test('owner without membership, anonymous and cross-user ownership', async () => {
    Object.assign(note, initial); workspace.ownerId = 'alice'; workspace.members = [];
    assert.equal(await service.notifyUsers(['alice'], 'comment_mention', notification.content, 'bob', { commentId: comment.id }), 1);
    assert.equal((await (await list(new Request('https://example.test'))).json()).length, 1);
    user = null; writes = [];
    assert.equal((await list(new Request('https://example.test'))).status, 401);
    assert.equal((await all()).status, 401); assert.equal(writes.length, 0);
    user = { id: 'bob' };
    assert.equal((await (await list(new Request('https://example.test'))).json()).length, 0);
  });
  await t.test('comments attached to both resources require both policies', async () => {
    user = { id: 'alice' }; Object.assign(note, initial);
    comment.postId = 'post'; comment.post = { id: 'post', workspace };
    for (const [restricted, ownerId, allowed] of [[true, 'alice', false], [false, 'alice', true], [false, 'outsider', false]]) {
      note.isRestricted = restricted; workspace.ownerId = ownerId; writes = []; pushes = [];
      assert.equal(await service.notifyUsers(['alice'], 'comment_mention', notification.content, 'bob', { commentId: comment.id }), Number(allowed));
      assert.equal(writes.length, Number(allowed)); assert.equal(pushes.length, 0);
      assert.equal((await (await list(new Request('https://example.test'))).json()).length, Number(allowed));
    }
    comment.postId = null; comment.post = null; workspace.ownerId = 'alice'; note.isRestricted = false;
  });
  await t.test('explicit post binding cannot turn a Notes comment into a post comment', async () => {
    writes = []; pushes = [];
    assert.equal(await service.notifyUsers(['alice'], 'comment_mention', notification.content, 'bob', { commentId: comment.id, postId: 'unrelated' }), 0);
    assert.equal(writes.length, 0); assert.equal(pushes.length, 0);
  });
});
