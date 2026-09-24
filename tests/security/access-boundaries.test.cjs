// Run: node --test tests/security/access-boundaries.test.cjs
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { runInNewContext } = require('node:vm');
const ts = require('typescript');

function load(file, dependencies = {}, globals = {}) {
  const exports = {};
  const source = process.env.SECURITY_TEST_REV
    ? require('node:child_process').execFileSync('git', ['show', `${process.env.SECURITY_TEST_REV}:${file}`], { encoding: 'utf8' })
    : readFileSync(resolve(process.env.SECURITY_TEST_ROOT || resolve(__dirname, '../../'), file), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  });
  runInNewContext(outputText, {
    exports,
    ...globals,
    require(name) {
      if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  });
  return exports;
}

function matches(row, where) {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'AND') return value.every(clause => matches(row, clause));
    if (key === 'OR') return value.some(clause => matches(row, clause));
    const actual = row?.[key];
    if (value === undefined) return true;
    if (value === null || typeof value !== 'object') return actual === value;
    if (Object.prototype.toString.call(value) === '[object Date]') return actual?.getTime() === value.getTime();
    if ('some' in value) return actual?.some(item => matches(item, value.some)) ?? false;
    if ('in' in value) return value.in.includes(actual);
    if ('notIn' in value) return !value.notIn.includes(actual);
    if ('not' in value) return actual !== value.not;
    if ('contains' in value) return typeof actual === 'string' && actual.toLowerCase().includes(value.contains.toLowerCase());
    if ('gte' in value) return actual != null && actual >= value.gte;
    return actual != null && matches(actual, value);
  });
}

const workspaces = [
  { id: 'own', ownerId: 'alice', members: [] },
  { id: 'joined', ownerId: 'bob', members: [{ userId: 'alice', status: true }] },
  { id: 'revoked', ownerId: 'bob', members: [{ userId: 'alice', status: false }] },
  { id: 'foreign', ownerId: 'bob', members: [] },
];
const issues = workspaces.map(workspace => ({
  id: `id-${workspace.id}`, issueKey: `${workspace.id.toUpperCase()}-1`, workspaceId: workspace.id,
}));

// Evaluate the Prisma predicates against records, including absent predicates.
function matchesWorkspace(workspace, where) {
  return (!where.id || where.id === workspace.id) && (!where.OR || where.OR.some(clause => {
    if ('ownerId' in clause) return workspace.ownerId === clause.ownerId;
    const member = clause.members.some;
    return workspace.members.some(row => row.userId === member.userId &&
      (member.status === undefined || row.status === member.status));
  }));
}
const prisma = {
  issue: {
    async findFirst({ where }) {
      return issues.find(issue => (!where.id || issue.id === where.id) &&
        (!where.issueKey || issue.issueKey === where.issueKey) &&
        (!where.workspaceId || issue.workspaceId === where.workspaceId) &&
        (!where.workspace || matchesWorkspace(workspaces.find(w => w.id === issue.workspaceId), where.workspace))) ?? null;
    },
    async findUnique({ where }) { return issues.find(issue => issue.id === where.id) ?? null; },
  },
  workspace: {
    async findFirst({ where }) { return workspaces.find(workspace => matchesWorkspace(workspace, where)) ?? null; },
  },
};
const { findIssueByIdOrKey, userHasWorkspaceAccess } = load('src/lib/issue-finder.ts', {
  '@/lib/prisma': { prisma },
  '@/lib/shared-issue-key-utils': load('src/lib/shared-issue-key-utils.ts'),
});

test('issue IDs and keys require ownership or active membership, even with explicit workspace', async () => {
  for (const issue of issues) {
    const allowed = ['own', 'joined'].includes(issue.workspaceId);
    for (const key of [issue.id, issue.issueKey]) {
      for (const workspaceId of [undefined, issue.workspaceId]) {
        const result = await findIssueByIdOrKey(key, { userId: 'alice', workspaceId });
        assert.equal(result?.id ?? null, allowed ? issue.id : null, `${key}/${workspaceId}`);
      }
      assert.equal(await findIssueByIdOrKey(key, { workspaceId: issue.workspaceId }), null);
      assert.equal(await findIssueByIdOrKey(key, { userId: 'alice', workspaceId: 'missing' }), null);
    }
    assert.equal(await userHasWorkspaceAccess('alice', issue.workspaceId), allowed);
  }
  assert.equal(await userHasWorkspaceAccess('', 'own'), false);
});

test('error page renders the resolved search message and fallback', async () => {
  const { default: ErrorPage } = load('src/app/error/page.tsx', {
    react: require('react'),
    'react/jsx-runtime': require('react/jsx-runtime'),
    'next/link': { default: 'a' },
    '@/components/ui/card': Object.fromEntries(
      ['Card', 'CardContent', 'CardDescription', 'CardHeader', 'CardTitle'].map(name => [name, 'div'])
    ),
    '@/components/ui/button': { Button: ({ children }) => children },
    'lucide-react': { AlertTriangle: 'span', Home: 'span', ArrowLeft: 'span' },
  });
  const { renderToStaticMarkup } = require('react-dom/server');
  for (const [searchParams, message] of [
    [{ message: 'Access denied' }, 'Access denied'],
    [{}, 'An unexpected error occurred'],
  ]) {
    const page = await ErrorPage({ searchParams: Promise.resolve(searchParams) });
    assert.ok(renderToStaticMarkup(page).includes(message));
  }
});

test('auth image migration uploads only HTTPS Google hosts across all callbacks', async () => {
  const uploads = [];
  const updates = [];
  let uploadFails = false;
  let userExists = true;
  const uploadedUrl = 'https://res.cloudinary.com/example/profile.png';
  const globals = { process: { env: {} }, URL, console: { log() {}, error() {} } };
  const imageHandler = load('src/utils/cloudinary-server.ts', {
    'server-only': {},
    cloudinary: { v2: { config() {}, uploader: { async upload(url) {
      uploads.push(url);
      if (uploadFails) throw new Error('Upload unavailable');
      return { secure_url: uploadedUrl };
    } } } },
  }, globals);
  const { authOptions } = load('src/lib/auth-options.ts', {
    'next-auth/providers/google': { default: () => ({}) },
    '@/lib/prisma': { prisma: { user: {
      findUnique: async () => userExists ? { id: 'alice' } : null,
      update: async args => updates.push(args),
    } } },
    '@/utils/user-image-handler': { processUserProfileImage: imageHandler.processUserProfileImageServer },
    '@/lib/custom-prisma-adapter': { CustomPrismaAdapter: () => ({}) },
  }, globals);
  const rejected = [
    null, 'not a URL', uploadedUrl,
    'https://evil.test/googleusercontent.com/avatar',
    'https://evil.test/?image=googleusercontent.com',
    'https://googleusercontent.com.evil.test/avatar',
    'https://evilgoogleusercontent.com/avatar',
    'https://googleusercontent.com@evil.test/avatar',
    'http://lh3.googleusercontent.com/avatar',
    'ftp://lh3.googleusercontent.com/avatar',
    '//lh3.googleusercontent.com/avatar',
  ];
  const allowed = [
    'https://googleusercontent.com/avatar',
    'https://lh3.googleusercontent.com/avatar',
    'https://LH3.GOOGLEUSERCONTENT.COM/avatar?old=cloudinary.com',
  ];
  for (const image of [...rejected, ...allowed]) {
    const shouldUpload = allowed.includes(image);
    for (const callback of ['createUser', 'linkAccount', 'signIn', 'updateImage']) {
      uploads.length = 0;
      updates.length = 0;
      const user = { id: 'alice', image };
      const args = { user, account: { provider: 'google' }, profile: { picture: image } };
      if (callback === 'signIn') {
        assert.equal(await authOptions.callbacks.signIn(args), true);
        assert.equal(user.image, shouldUpload ? uploadedUrl : image);
      } else if (callback === 'updateImage') {
        assert.equal(await imageHandler.updateUserProfileImageIfNeededServer(image, user.id), shouldUpload ? uploadedUrl : image);
      } else {
        await authOptions.events[callback](args);
      }
      assert.deepEqual(uploads, shouldUpload ? [image] : [], `${callback}: ${image}`);
      assert.equal(updates.length, shouldUpload && callback !== 'updateImage' ? 1 : 0);
      if (updates.length) assert.equal(updates[0].data.image, uploadedUrl);
    }
  }
  userExists = false;
  uploads.length = 0;
  assert.equal(await authOptions.callbacks.signIn({ user: { id: 'new', image: allowed[0] }, account: { provider: 'google' } }), true);
  assert.equal(uploads.length, 0);
  uploadFails = true;
  assert.equal(await imageHandler.processUserProfileImageServer(allowed[0], 'alice'), allowed[0]);
});

test('login redirects stay on the exact application origin', async () => {
  const { authOptions } = load('src/lib/auth-options.ts', {
    'next-auth': { default: () => () => {} },
    'next-auth/providers/google': { default: () => ({}) },
    '@/lib/prisma': { prisma: {} },
    '@/utils/user-image-handler': {},
    '@/lib/custom-prisma-adapter': { CustomPrismaAdapter: () => ({}) },
  }, { process: { env: {} }, URL });
  const baseUrl = 'https://collab.example';
  for (const url of ['https://collab.example.evil.test/', '//evil.test/', '/\\evil.test/', 'javascript:alert(1)', 'http://collab.example/', 'https://[invalid']) {
    assert.equal(await authOptions.callbacks.redirect({ url, baseUrl }), baseUrl, url);
  }
  for (const url of ['/projects', 'https://collab.example/projects']) {
    assert.equal(await authOptions.callbacks.redirect({ url, baseUrl }), baseUrl + '/projects');
  }
});

test('optional AI initialization does not require credentials during route import', async () => {
  let creations = 0;
  class MissingCredentials {
    constructor() { creations++; throw new Error('Missing test credentials'); }
  }
  const { AIContentGenerator } = load('src/lib/ai/content-generator.ts', {
    'openai': { default: MissingCredentials }, '@prisma/client': require('@prisma/client'),
  }, { process: { env: {} }, console: { error() {} } });
  const generator = new AIContentGenerator();
  assert.equal(creations, 0);
  assert.equal(await generator.enhanceIssueTitle('Original title'), 'Original title');
  assert.equal(creations, 1);
});

test('password hashing and email rendering work without contacting external services', async () => {
  const bcrypt = require('bcrypt');
  const hash = await bcrypt.hash('test-password', 4);
  assert.equal(await bcrypt.compare('test-password', hash), true);
  assert.equal(await bcrypt.compare('incorrect', hash), false);
  const mail = require('nodemailer').createTransport({ streamTransport: true, buffer: true });
  const result = await mail.sendMail({ from: 'a@example.test', to: 'b@example.test', subject: 'Test', text: 'Local only' });
  assert.match(result.message.toString(), /Local only/);
});

test('validation wrapper rejects bad body/query/params and passes validated values', async () => {
  const { z } = require('zod');
  const { withValidation } = load('src/lib/validation.ts', {
    zod: { z }, 'next/server': { NextResponse: { json: (body, init) => ({ body, status: init.status }) } },
  }, { URL });
  let calls = 0;
  const handler = withValidation(async (_req, context) => { calls++; return { status: 200, context }; }, {
    body: z.object({ title: z.string() }), query: z.object({ q: z.string() }), params: z.object({ id: z.string() }),
  });
  for (const [body, query, id] of [[{ title: 1 }, '?q=x', 'id'], [{ title: 'x' }, '', 'id'], [{ title: 'x' }, '?q=x', 1]]) {
    const response = await handler(new Request('https://example.test/' + query, { method: 'POST', body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });
    assert.equal(response.status, 400);
  }
  assert.equal(calls, 0);
  const response = await handler(new Request('https://example.test/?q=x', { method: 'POST', body: '{"title":"ok"}' }), { params: Promise.resolve({ id: 'id' }) });
  assert.equal(response.status, 200);
  assert.equal(response.context.body.title, 'ok');
  assert.equal(calls, 1);
});

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

test('AI issue suggestions and relations resolve their source issue inside the authorized workspace', async () => {
  for (const endpoint of ['related', 'suggestions']) {
    let reads = 0;
    const { GET } = load(`src/app/api/ai/issues/${endpoint}/route.ts`, {
      'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status ?? 200 }) } },
      'next-auth': { getServerSession: async () => ({ user: { id: 'alice' } }) },
      '@/lib/auth': { authConfig: {} }, '@/lib/issue-finder': { userHasWorkspaceAccess },
      '@/lib/prisma': { prisma: { issue: { findFirst: async ({ where }) => {
        reads++; assert.equal(where.workspaceId, 'joined'); assert.equal(where.id, 'foreign-issue'); return null;
      } } } },
    }, { URL });
    for (const workspace of ['revoked', 'foreign', 'joined']) {
      const response = await GET(new Request(`https://example.test/?workspaceId=${workspace}&issueId=foreign-issue`));
      assert.equal(response.status, workspace === 'joined' ? 404 : 403);
    }
    assert.equal(reads, 1);
  }
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

test('planning activity conversion and child relations preserve IDs, statuses and timestamps', () => {
  const { activityToMovement } = load('src/utils/teamSyncAnalyzer.ts');
  const base = { issueId: 'issue', action: 'STATUS_CHANGED', userId: 'alice', createdAt: '2026-09-23T10:00:00Z',
    oldValue: 'backlog', newValue: 'done', issue: { issueKey: 'P-1', title: 'Title', type: 'TASK', priority: 'high' } };
  const movement = activityToMovement(base);
  assert.equal(movement.movementType, 'completed');
  assert.equal(movement.timestamp.toISOString(), new Date(base.createdAt).toISOString());
  assert.equal(movement.issueKey, 'P-1');
  assert.equal(activityToMovement({ ...base, action: 'CREATED' }).movementType, 'created');
  assert.equal(activityToMovement({ ...base, action: 'ASSIGNED' }).movementType, 'assigned');
  const { organizeRelationsData } = load('src/components/issue/sections/relations/utils/relationHelpers.ts');
  const result = organizeRelationsData([{ relationType: 'child', relatedItem: { id: 'child' } }]);
  assert.equal(result.children[0].dbId, 'child');
});

test('issue modal state follows URL and navigation clears stale parent context', () => {
  let params = new URLSearchParams('selectedIssue=old&parentTitle=Parent&parentKey=P-1&keep=yes');
  let pushed;
  const { useIssueModalUrlState } = load('src/hooks/useIssueModalUrlState.ts', {
    react: { useMemo: fn => fn(), useCallback: fn => fn },
    'next/navigation': {
      useSearchParams: () => params, usePathname: () => '/workspace/issues',
      useRouter: () => ({ push: url => { pushed = url; } }),
    },
  }, { URLSearchParams });
  const state = useIssueModalUrlState();
  assert.equal(state.selectedIssueId, 'old');
  assert.equal(state.parentIssueInfo.key, 'P-1');
  state.setSelectedIssueId('new');
  const next = new URL(pushed, 'https://example.test');
  assert.equal(next.searchParams.get('selectedIssue'), 'new');
  assert.equal(next.searchParams.has('parentKey'), false);
  assert.equal(next.searchParams.get('keep'), 'yes');
  state.closeModal();
  assert.equal(new URL(pushed, 'https://example.test').searchParams.has('selectedIssue'), false);
  params = new URLSearchParams('selectedIssue=back');
  assert.equal(useIssueModalUrlState().selectedIssueId, 'back');
});

test('review: encryption roundtrip and generated Prisma Bytes assignments retain concrete allocation types', async () => {
  const env = { APP_TOKENS_KEY: '0123456789abcdef0123456789abcdef' };
  const crypto = load('src/lib/apps/crypto.ts', {
    crypto: require('node:crypto'), util: require('node:util'), bcrypt: { default: require('bcrypt') },
  }, { Buffer, process: { env }, console: { error() {} } });
  const plaintext = 'dummy-token-✓';
  const encrypted = await crypto.encryptToken(plaintext);
  assert.ok(Buffer.isBuffer(encrypted));
  assert.ok(encrypted.buffer instanceof ArrayBuffer);
  assert.equal(await crypto.decryptToken(encrypted), plaintext);
  assert.equal(await crypto.decrypt(await crypto.encrypt(plaintext)), plaintext);
  const newKey = 'abcdef0123456789abcdef0123456789';
  const rotated = await crypto.rotateTokenEncryption(encrypted, env.APP_TOKENS_KEY, newKey);
  env.APP_TOKENS_KEY = newKey;
  assert.equal(await crypto.decryptToken(rotated), plaintext);
  const tampered = Buffer.from(rotated); tampered[tampered.length - 1] ^= 1;
  await assert.rejects(crypto.decryptToken(tampered), /Failed to decrypt token/);

  const file = resolve('tests/security/prisma-bytes-contract.ts');
  const contract = `import { Prisma } from '@prisma/client';
    import { encryptToken, encrypt, rotateTokenEncryption } from '../../src/lib/apps/crypto';
    async function check() {
      const secret: Prisma.AppOAuthClientCreateInput['clientSecret'] = await encryptToken('dummy');
      const webhook: Prisma.AppWebhookCreateInput['secretEnc'] = await encrypt('dummy');
      const rotated: Prisma.AppOAuthClientCreateInput['clientSecret'] = await rotateTokenEncryption(Buffer.alloc(64), '', '');
      return [secret, webhook, rotated];
    }`;
  const options = { noEmit: true, incremental: false, strict: true, skipLibCheck: true,
    esModuleInterop: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS };
  const host = ts.createCompilerHost(options);
  const read = host.readFile;
  host.readFile = name => name === file ? contract : read(name);
  const program = ts.createProgram([file], options, host);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: name => name, getCurrentDirectory: () => process.cwd(), getNewLine: () => '\n',
  }));
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

test('related issues classify both blocking types in both directions and retain access controls', async () => {
  let session = { user: { id: 'alice' } };
  const records = ['a', 'b', 'foreign'].map(id => ({ id, issueKey: id, title: id,
    workspaceId: id === 'foreign' ? 'foreign' : 'joined', labels: [], projectStatus: { name: 'Open', color: '#fff' } }));
  let links = [];
  const { GET } = load('src/app/api/ai/issues/related/route.ts', {
    'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status ?? 200 }) } },
    'next-auth': { getServerSession: async () => session }, '@/lib/auth': { authConfig: {} },
    '@/lib/issue-finder': { userHasWorkspaceAccess },
    '@/lib/prisma': { prisma: {
      issue: { findFirst: async ({ where }) => records.find(row => matches(row, where)), findMany: async () => [] },
      issueRelation: { findMany: async ({ where }) => links.filter(row => matches(row, where)) },
    } },
  }, { URL });
  const request = (id, workspace = 'joined') => GET(new Request(`https://example.test/?issueId=${id}&workspaceId=${workspace}`));
  for (const [relationType, expected] of [['BLOCKS', ['blocks', 'dependent']], ['BLOCKED_BY', ['dependent', 'blocks']], ['RELATES_TO', ['related', 'related']]]) {
    links = [{ relationType, sourceIssueId: 'a', targetIssueId: 'b', sourceIssue: records[0], targetIssue: records[1] },
      { relationType, sourceIssueId: 'a', targetIssueId: 'foreign', sourceIssue: records[0], targetIssue: records[2] }];
    for (const [index, id] of ['a', 'b'].entries()) {
      const response = await request(id);
      assert.equal(response.status, 200);
      assert.equal(response.body.relatedIssues.length, 1);
      assert.equal(response.body.relatedIssues[0].id, id === 'a' ? 'b' : 'a');
      assert.equal(response.body.relatedIssues[0].relation, expected[index], `${relationType}/${id}`);
      assert.equal(response.body.relatedIssues[0].similarity, 1);
    }
  }
  assert.equal((await request('foreign')).status, 404);
  assert.equal((await request('a', 'foreign')).status, 403);
  assert.equal((await request('a', 'revoked')).status, 403);
  session = null;
  assert.equal((await request('a')).status, 401);
});

test('slash menu commands preserve paragraphs, formatting and inline atoms', async () => {
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM('<div id="root"></div>', { pretendToBeVisual: true });
  const names = ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame'];
  const original = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  for (const name of names) Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name] });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const React = require('react');
  const { createRoot } = require('react-dom/client');
  const { Editor, Node: TiptapNode } = require('@tiptap/core');
  const StarterKit = require('@tiptap/starter-kit').default;
  const atom = TiptapNode.create({ name: 'testAtom', group: 'inline', inline: true, atom: true,
    parseHTML: () => [{ tag: 'span[data-test-atom]' }], renderHTML: () => ['span', { 'data-test-atom': '' }, 'Existing mention'] });
  const editor = new Editor({ extensions: [StarterKit, atom], content: '<p>Initial</p>' });
  editor.view.coordsAtPos = () => ({ top: 0, bottom: 0, left: 0, right: 0 });
  const ui = ({ children }) => React.createElement('div', null, children);
  const dependencies = {
    react: React, 'react/jsx-runtime': require('react/jsx-runtime'),
    '@tiptap/react': { useEditor: () => editor, EditorContent: () => null },
    '@/lib/utils': { cn: () => '' }, 'next-auth/react': { useSession: () => ({}) },
    '@/utils/cloudinary': {}, '@/context/WorkspaceContext': { useWorkspace: () => ({}) },
    '@/hooks/queries/useUser': { useCurrentUser: () => ({}) },
    '@/lib/collaboration': { createCollaborationUser: () => ({}) },
    '@/components/ui/command': { Command: ui, CommandInput: ui, CommandList: ui,
      CommandItem: ({ children, onSelect }) => React.createElement('button', { onClick: onSelect }, children) },
  };
  for (const [file, exports] of Object.entries({
    button: ['Button'], tooltip: ['Tooltip', 'TooltipContent', 'TooltipProvider', 'TooltipTrigger'], separator: ['Separator'],
    popover: ['Popover', 'PopoverContent', 'PopoverTrigger'], input: ['Input'],
    'mention-suggestion': ['MentionSuggestion'], 'task-mention-suggestion': ['TaskMentionSuggestion'],
    'epic-mention-suggestion': ['EpicMentionSuggestion'], 'story-mention-suggestion': ['StoryMentionSuggestion'],
    'milestone-mention-suggestion': ['MilestoneMentionSuggestion'],
  })) dependencies[`@/components/ui/${file}`] = Object.fromEntries(exports.map(name => [name, ui]));
  for (const name of ['@tiptap/core', '@tiptap/starter-kit', 'lucide-react', ...['link', 'image', 'underline', 'placeholder', 'text-style', 'heading', 'color'].map(name => `@tiptap/extension-${name}`)]) {
    dependencies[name] = require(name);
  }
  const { MarkdownEditor } = load('src/components/ui/markdown-editor.tsx', dependencies, {
    document: dom.window.document, window: dom.window, console, setTimeout, clearTimeout,
  });
  const root = createRoot(dom.window.document.getElementById('root'));
  try {
    await React.act(async () => root.render(React.createElement(MarkdownEditor, { compact: true, content: editor.getHTML() })));
    const cases = [
      ['<p>Alpha</p><p>Beta </p>', 13],
      ['<p><strong>Alpha</strong></p><p><em>Beta</em> </p>', 13],
      ['<p>Alpha</p><blockquote><p><strong>Beta</strong> <span data-test-atom></span> </p></blockquote>', 16],
    ];
    for (const [html, position] of cases) {
      for (const [type, trigger] of [['user', '@'], ['task', '#'], ['epic', '~'], ['story', '^'], ['milestone', '!']]) {
        await React.act(async () => {
          editor.commands.setContent(html, false, { preserveWhitespace: 'full' });
          editor.commands.setTextSelection(position);
          editor.commands.insertContent('/');
        });
        const before = editor.getJSON();
        const button = [...dom.window.document.querySelectorAll('button')].find(button => button.textContent === `Mention ${type}`);
        assert.ok(button, `Menu opens for ${type}`);
        await React.act(async () => button.click());
        const expected = structuredClone(before);
        function replaceSlash(node) {
          if (node.text?.endsWith('/')) node.text = node.text.slice(0, -1) + trigger;
          node.content?.forEach(replaceSlash);
        }
        replaceSlash(expected);
        assert.deepEqual(editor.getJSON(), expected, `${type}: ${html}`);
      }
    }
  } finally {
    await React.act(async () => root.unmount());
    editor.destroy();
    dom.window.close();
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    for (const [name, descriptor] of original) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
});
