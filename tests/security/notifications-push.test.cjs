const { assert, test, load, matches, prisma } = require('./helpers.cjs');


test('retained issue follow methods and global notification preferences still work', async () => {
  const writes = [];
  const db = {
    issueFollower: { upsert: async value => writes.push(value), deleteMany: async value => writes.push(value) },
    notificationPreferences: { findFirst: async ({ where }) => {
      assert.equal(where.userId, 'alice'); assert.equal(where.workspaceId, null);
      return { emailNotificationsEnabled: false };
    } },
  };
  const { NotificationService } = load('src/lib/notification-service.ts', {
    '@/lib/prisma': { prisma: db }, '@/lib/push-notifications': {}, '@/lib/permissions': {},
    'date-fns': {}, '@/lib/logger': { logger: {} }, '@/lib/html-sanitizer': {},
  });
  await NotificationService.addIssueFollower('issue', 'alice');
  await NotificationService.removeIssueFollower('issue', 'alice');
  assert.equal(writes[0].create.issueId, 'issue');
  assert.equal(writes[1].where.userId, 'alice');
  assert.equal((await NotificationService.getUserPreferences('alice')).emailNotificationsEnabled, false);
});

test('global push subscriptions reuse existing rows and clear only global preferences', async () => {
  const writes = [];
  let existing = null;
  const dbNull = Symbol('DbNull');
  const route = load('src/app/api/notifications/push/subscribe/route.ts', {
    '@prisma/client': { Prisma: { DbNull: dbNull } },
    'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status ?? 200 }) } },
    '@/lib/session': { getCurrentUser: async () => ({ id: 'alice' }) },
    '@/lib/prisma': { prisma: { notificationPreferences: {
      findFirst: async ({ where }) => { assert.equal(where.workspaceId, null); return existing; },
      upsert: async args => { writes.push(args); },
      updateMany: async args => { writes.push(args); },
    } } },
    '@/lib/encryption': { EncryptionService: { encrypt: () => 'encrypted-test' } },
    '@/lib/rate-limit': { withRateLimit: fn => fn },
    '@/lib/validation': { withValidation: fn => req => fn(req, { body: { subscription: {} } }) },
    '@/lib/cors': { withCors: fn => fn, getCorsConfig: () => ({}) },
  });
  assert.equal((await route.POST({})).status, 200);
  assert.equal(writes[0].where.id, writes[0].create.id);
  assert.equal(writes[0].where.id, 'global:alice');
  existing = { id: 'legacy-row' };
  await route.POST({});
  assert.equal(writes[1].where.id, 'legacy-row');
  await route.DELETE({});
  assert.equal(writes[2].where.workspaceId, null);
  assert.equal(writes[2].data.pushSubscription, dbNull);
  assert.equal(writes[2].data.pushNotificationsEnabled, false);
});

test('push delivery uses global subscriptions for direct, bulk and leave callers', async () => {
  const sent = [];
  const rows = ['alice', 'manager', 'hr'].flatMap(userId => [
    { userId, workspaceId: 'joined', pushNotificationsEnabled: false, pushSubscription: 'workspace-setting' },
    { userId, workspaceId: null, pushNotificationsEnabled: true,
      leaveRequestEdited: true, leaveRequestManagerAlert: true, leaveRequestHRAlert: true,
      pushSubscription: JSON.stringify({ endpoint: `https://push.test/${userId}`, keys: { auth: 'auth', p256dh: 'key' } }) },
  ]);
  const workspaceRows = structuredClone(rows.filter(row => row.workspaceId));
  let expired = false;
  const db = {
    notificationPreferences: {
      findFirst: async ({ where }) => rows.find(row => matches(row, where)),
      updateMany: async ({ where, data }) => rows.filter(row => matches(row, where)).forEach(row => Object.assign(row, data)),
    },
    notification: { groupBy: async () => [], create: async () => {}, createMany: async () => {} },
    workspaceMember: { findMany: async ({ where }) => [{ userId: typeof where.role === 'string' ? 'hr' : 'manager' }] },
    workspace: { findUnique: async () => null },
  };
  const push = load('src/lib/push-notifications.ts', {
    '@prisma/client': { Prisma: { DbNull: null } }, '@/lib/prisma': { prisma: db },
    '@/lib/encryption': { EncryptionService: { decrypt: JSON.parse } },
    'web-push': { default: { setVapidDetails() {}, async sendNotification(subscription) {
      if (expired) throw new Error('410');
      sent.push(subscription.endpoint);
    } } },
  }, { Error, console: { log() {}, error() {} }, process: { env: {
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'a'.repeat(87), VAPID_PRIVATE_KEY: 'b'.repeat(43), VAPID_EMAIL: 'mailto:test@example.test',
  } } });
  const { NotificationService, NotificationType } = load('src/lib/notification-service.ts', {
    '@/lib/prisma': { prisma: db }, '@/lib/push-notifications': push,
    '@/lib/permissions': { WorkspaceRole: { HR: 'HR' } }, 'date-fns': require('date-fns'),
    '@/lib/logger': { logger: { info() {}, error() {} } }, '@/lib/html-sanitizer': {},
  });
  assert.equal(await push.sendPushNotification('alice', { title: 'Title', body: 'Body' }), true);
  await push.sendPushNotificationToMultipleUsers(['alice', 'manager'], { title: 'Title', body: 'Body' });
  await NotificationService.sendPushNotificationForUser('alice', NotificationType.ISSUE_MENTION, 'Mention');
  const leave = { id: 'leave', userId: 'alice', user: { name: 'Alice' },
    startDate: new Date('2026-09-24'), endDate: new Date('2026-09-25'), policy: { name: 'Medical', workspaceId: 'joined' } };
  await NotificationService.notifyLeaveSubmission(leave);
  await NotificationService.notifyLeaveEdit(leave, 'manager');
  assert.deepEqual(sent.map(url => url.split('/').pop()), ['alice', 'alice', 'manager', 'alice', 'manager', 'hr', 'alice', 'hr']);
  expired = true;
  assert.equal(await push.sendPushNotification('alice', { title: 'Title', body: 'Body' }), false);
  assert.equal(rows.find(row => row.userId === 'alice' && row.workspaceId === null).pushNotificationsEnabled, false);
  expired = false;
  assert.equal(await push.sendPushNotification('alice', { title: 'Title', body: 'Body' }), false);
  assert.equal(await push.sendPushNotification('missing', { title: 'Title', body: 'Body' }), false);
  assert.deepEqual(rows.filter(row => row.workspaceId), workspaceRows);
});
