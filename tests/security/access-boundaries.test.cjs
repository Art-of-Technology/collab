// Run: node --test tests/security/access-boundaries.test.cjs
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { runInNewContext } = require('node:vm');
const ts = require('typescript');

function load(file, dependencies = {}, globals = {}) {
  const exports = {};
  const source = readFileSync(resolve(process.env.SECURITY_TEST_ROOT || resolve(__dirname, '../../'), file), 'utf8');
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

const enums = {
  NoteScope: Object.fromEntries(['PERSONAL', 'PROJECT', 'WORKSPACE', 'PUBLIC', 'SHARED'].map(v => [v, v])),
  NoteSharePermission: { EDIT: 'EDIT', VIEW: 'VIEW' },
  NoteActivityAction: {},
};
const { checkNoteAccess } = load('src/lib/secrets/access.ts', {
  '@/lib/prisma': { prisma }, '@prisma/client': enums, '@/lib/issue-finder': { userHasWorkspaceAccess },
});
const note = {
  id: 'note', authorId: 'bob', scope: 'WORKSPACE', workspaceId: 'joined', projectId: null,
  isRestricted: false, isEncrypted: true, expiresAt: null, sharedWith: [],
};
test('note scope, restriction, expiry and edit permission are enforced', async () => {
  const member = { role: 'MEMBER' };
  assert.equal((await checkNoteAccess('alice', note, null)).canAccess, false);
  assert.equal((await checkNoteAccess('bob', note, null)).canAccess, false);
  assert.equal((await checkNoteAccess('alice', note, member)).canAccess, true);
  assert.equal((await checkNoteAccess('alice', note, member)).canEdit, false);
  assert.equal((await checkNoteAccess('bob', note, member)).canEdit, true);
  const restricted = { ...note, isRestricted: true };
  assert.equal((await checkNoteAccess('alice', restricted, { role: 'ADMIN' })).canAccess, false);
  const shared = { ...restricted, sharedWith: [{ userId: 'alice', permission: 'EDIT' }] };
  assert.equal((await checkNoteAccess('alice', shared, member)).canEdit, true);
  assert.equal((await checkNoteAccess('alice', shared, null)).canAccess, false);
  assert.equal((await checkNoteAccess('alice', { ...shared, expiresAt: new Date(0) }, member)).canAccess, false);
  assert.equal((await checkNoteAccess('alice', { ...note, scope: 'PERSONAL' }, member)).canAccess, false);
  assert.equal((await checkNoteAccess('alice', { ...note, scope: 'PUBLIC', isEncrypted: false }, null)).canAccess, true);
});

test('denied note requests stop before database content, history or decryption', async () => {
  const denied = new Proxy({}, { get() { throw new Error('Content accessed before authorization'); } });
  const dependencies = {
    'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status ?? 200 }) } },
    'next-auth': { getServerSession: async () => ({ user: { id: 'alice' } }) },
    '@/app/api/auth/[...nextauth]/route': { authOptions: {} },
    '@/lib/prisma': { prisma: denied }, '@prisma/client': enums,
    '@/lib/secrets/access': { canAccessNote: async () => ({ canAccess: false, canEdit: false, canDelete: false }) },
    'zod': require('zod'), '@/lib/issue-finder': { userHasWorkspaceAccess },
    '@/lib/secrets/crypto': denied, '@/lib/versioning': denied, '@/lib/event-bus': denied,
  };
  for (const [file, methods] of [
    ['route.ts', ['GET', 'PATCH', 'DELETE']],
    ['versions/route.ts', ['GET']],
    ['versions/[version]/route.ts', ['GET', 'POST']],
    ['versions/compare/route.ts', ['GET']],
    ['pin/route.ts', ['POST']],
    ['comments/[commentId]/route.ts', ['GET', 'PATCH', 'DELETE']],
    ['share/route.ts', ['GET', 'POST', 'DELETE']],
    ['save-as-template/route.ts', ['POST']],
    ['secrets/audit-log/route.ts', ['GET']],
  ]) {
    const route = load(`src/app/api/notes/[id]/${file}`, dependencies);
    for (const method of methods) {
      const response = await route[method](new Request('https://example.test/notes?from=1&to=2'), {
        params: Promise.resolve({ id: 'note', version: '1' }),
      });
      assert.equal(response.status, 404, `${file} ${method}`);
    }
  }
});

test('legacy Slack commands are unavailable and never read or create tasks', async () => {
  for (const command of ['my-tasks', 'create-issue']) {
    const route = load(`src/app/api/slack/${command}/route.ts`, {
      'next/server': { NextResponse: { json: (body, init) => ({ body, status: init.status }) } },
    });
    const response = await route.POST(new Request('https://example.test/slack', {
      method: 'POST', body: 'user_id=U123&text=workspace:foreign',
    }));
    assert.equal(response.status, 503);
    assert.equal(response.body.response_type, 'ephemeral');
    assert.match(response.body.text, /unavailable/);
  }
});

test('Prisma excludes credentials from default and nested reads; explicit auth selection still works', async () => {
  const { prisma: client } = load('src/lib/prisma.ts', {
    '@prisma/client': require('@prisma/client'),
  }, { global: {}, process: { env: { NODE_ENV: 'test' } } });
  const queries = [];
  // Capture the real client's emitted engine protocol; no database is contacted.
  client._requestHandler.request = async request => {
    queries.push(request.protocolQuery.query.selection);
    return null;
  };
  try {
    await client.user.findUnique({ where: { id: 'alice' } });
    await client.workspace.findUnique({ where: { id: 'own' }, include: { members: { include: { user: true } } } });
    await client.user.findUnique({ where: { id: 'alice' }, omit: { hashedPassword: false } });
    await client.user.findUnique({ where: { id: 'alice' }, select: { githubAccessToken: true } });
    for (const selection of [queries[0], queries[1].members.selection.user.selection]) {
      assert.equal(selection.hashedPassword, false);
      assert.equal(selection.githubAccessToken, false);
    }
    assert.notEqual(queries[2].hashedPassword, false);
    assert.equal(queries[2].githubAccessToken, false);
    assert.equal(queries[3].githubAccessToken, true);
  } finally {
    await client.$disconnect();
  }
});

test('shared role checks reject inactive memberships', async () => {
  for (const active of [false, true]) {
    const db = {
      user: { findUnique: async ({ include }) => ({
        role: 'DEVELOPER', ownedWorkspaces: [],
        workspaceMemberships: include.workspaceMemberships.where.status === true && !active ? [] : [{ role: 'MEMBER' }],
      }) },
      rolePermission: { findUnique: async () => ({}), findMany: async () => [{ permission: 'CREATE_TASK' }] },
    };
    const permissions = load('src/lib/permissions.ts', { './prisma': { prisma: db } });
    assert.equal((await permissions.checkUserPermission('alice', 'joined', 'CREATE_TASK')).hasPermission, active);
    assert.equal((await permissions.getUserPermissions('alice', 'joined')).length, active ? 1 : 0);
    assert.equal(await permissions.getUserWorkspaceRole('alice', 'joined'), active ? 'MEMBER' : null);
  }
});

test('login redirects stay on the exact application origin', async () => {
  const { authOptions } = load('src/app/api/auth/[...nextauth]/route.ts', {
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

test('note history sanitizes stored HTML before rendering while retaining normal text', () => {
  const version = {
    content: '<p>Keep this note</p><img src=x onerror="alert(1)"><script>alert(1)</script><a href="javascript:alert(1)">link</a>',
    createdAt: new Date().toISOString(), author: { name: 'Alice' }, version: 1,
  };
  let stateIndex = 0;
  const dependencies = {
    'react': { useState: () => [[true, version, null, null][stateIndex++], () => {}] },
    'react/jsx-runtime': require('react/jsx-runtime'),
    '@tanstack/react-query': { useQuery: () => ({ data: undefined }) },
    'date-fns': { format: () => '', formatDistanceToNow: () => '' },
    'isomorphic-dompurify': { default: require('isomorphic-dompurify') },
    'lucide-react': {},
    '@/lib/utils': { cn: (...values) => values.join(' ') },
    '@/lib/html-sanitizer': load('src/lib/html-sanitizer.ts'),
  };
  for (const [path, names] of [
    ['ui/button', ['Button']], ['ui/scroll-area', ['ScrollArea']],
    ['ui/sheet', ['Sheet', 'SheetContent', 'SheetHeader', 'SheetTitle', 'SheetTrigger']],
    ['notes/VersionBadge', ['VersionBadge']], ['notes/VersionDiff', ['VersionDiff']],
    ['notes/RestoreVersionDialog', ['RestoreVersionDialog']], ['ui/user-avatar', ['UserAvatar']],
  ]) dependencies[`@/components/${path}`] = Object.fromEntries(names.map(name => [name, name]));
  const { VersionHistoryPanel } = load('src/components/notes/VersionHistoryPanel.tsx', dependencies);
  const html = [];
  function visit(element) {
    if (Array.isArray(element)) return element.forEach(visit);
    if (!element?.props) return;
    if (element.props.dangerouslySetInnerHTML) html.push(element.props.dangerouslySetInnerHTML.__html);
    visit(element.props.children);
  }
  visit(VersionHistoryPanel({ noteId: 'note' }));
  assert.equal(html.length, 1);
  assert.match(html[0], /<p>Keep this note<\/p>/);
  assert.doesNotMatch(html[0], /onerror|<script|javascript:/i);
});

test('issue mutations reject mass assignment, foreign relations and read-only users', async () => {
  let allowed = true;
  let writes = 0;
  const existing = { id: 'issue', workspaceId: 'own', projectId: 'project', reporterId: 'alice', title: 'Before' };
  const db = {
    issue: { findFirst: async ({ where }) => where.id === existing.id ? existing : null, findUnique: async () => existing, delete: async () => { writes++; },
      update: async ({ data }) => { writes++; return { ...existing, ...data }; } },
    project: { findFirst: async () => null },
    projectStatus: { findMany: async () => [] },
    taskLabel: { count: async () => 0 },
    issueFollower: { findMany: async () => [] }, projectFollower: { findMany: async () => [] },
    $transaction: async fn => fn(db),
  };
  const permissionModule = load('src/lib/permissions.ts', { './prisma': { prisma: {} } });
  const dependencies = {
    'zod': require('zod'), '@prisma/client': require('@prisma/client'),
    'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status ?? 200 }) } },
    '@/lib/prisma': { prisma: db },
    '@/lib/session': { getCurrentUser: async () => ({ id: 'alice' }) },
    '@/lib/permissions': {
      ...permissionModule,
      checkUserPermissions: async (_user, _workspace, permissions) => Object.fromEntries(permissions.map(p => [p, { hasPermission: allowed }])),
    },
    '@/lib/issue-finder': {
      findIssueByIdOrKey: async () => existing, STANDARD_ISSUE_INCLUDE: {},
      userHasWorkspaceAccess: async user => user === 'alice',
    },
    '@/lib/board-item-activity-service': { compareObjects: () => [] },
    '@/lib/redis': { publishEvent: async () => {} },
    '@/utils/mentions': { extractMentionUserIds: () => [] },
    '@/lib/notification-service': {},
    '@/lib/event-bus': { emitIssueUpdated: async () => {}, emitIssueDeleted: async () => {} },
    '@/utils/html-normalizer': { normalizeDescriptionHTML: value => value },
  };
  const route = load('src/app/api/issues/[issueId]/route.ts', dependencies, { URL, console });
  const context = { params: Promise.resolve({ issueId: 'issue' }) };
  for (const body of [
    {}, { workspaceId: 'foreign' }, { projectId: 'foreign' }, { id: 'new-id' },
    { workspace: { connect: { id: 'foreign' } } }, { createdAt: '2020-01-01' },
    { title: 42 }, { priority: 'root' }, { assigneeId: 'outsider' },
    { reporterId: 'outsider' }, { parentId: 'foreign' }, { labels: ['foreign'] }, { statusId: 'foreign' },
  ]) {
    const response = await route.PUT(new Request('https://example.test/issues/issue', {
      method: 'PUT', body: JSON.stringify(body),
    }), context);
    assert.equal(response.status, 400, JSON.stringify(body));
    assert.equal(writes, 0);
  }
  allowed = false;
  assert.equal((await route.PUT(new Request('https://example.test/issues/issue', {
    method: 'PUT', body: JSON.stringify({ title: 'After' }),
  }), context)).status, 403);
  assert.equal((await route.DELETE(new Request('https://example.test/issues/issue'), context)).status, 403);
  assert.equal(writes, 0);
  allowed = true;
  const response = await route.PUT(new Request('https://example.test/issues/issue', {
    method: 'PUT', body: JSON.stringify({ title: 'After' }),
  }), context);
  assert.equal(response.status, 200);
  assert.equal(response.body.issue.title, 'After');
  assert.equal(response.body.issue.workspaceId, 'own');
  assert.equal(writes, 1);
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

test('note authorization resolves project workspace and requires active membership', async () => {
  for (const workspace of workspaces) {
    const db = {
      note: { findUnique: async () => ({ ...note, workspaceId: null, projectId: 'project', project: { workspaceId: workspace.id } }) },
      workspace: { findFirst: async ({ where, select }) => {
        if (!matchesWorkspace(workspace, where)) return null;
        return {
          ownerId: workspace.ownerId,
          members: workspace.members.filter(member => member.userId === select.members.where.userId &&
            (!select.members.where.status || member.status)).map(() => ({ role: 'MEMBER' })),
        };
      } },
    };
    const { canAccessNote } = load('src/lib/secrets/access.ts', { '@/lib/prisma': { prisma: db }, '@prisma/client': enums, '@/lib/issue-finder': { userHasWorkspaceAccess } });
    assert.equal((await canAccessNote('alice', 'note')).canAccess, ['own', 'joined'].includes(workspace.id));
  }
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

test('webhook delivery requires exact trusted HTTPS origins and never follows redirects', async () => {
  const env = {};
  const webhooks = load('src/lib/webhooks.ts', { crypto: { default: require('node:crypto') } }, { process: { env }, URL, Buffer });
  const allowed = webhooks.isAllowedWebhookDeliveryUrl;
  assert.equal(allowed('https://hooks.example.test/event'), false);
  env.COLLAB_WEBHOOK_ALLOWED_ORIGINS = 'https://hooks.example.test';
  assert.equal(allowed('https://hooks.example.test/event?x=1'), true);
  assert.equal(allowed('https://HOOKS.example.test:443/event'), true);
  for (const url of ['https://hooks.example.test.evil.test/', 'https://hooks.example.test:8443/', 'http://hooks.example.test/', 'https://user@hooks.example.test/', '//hooks.example.test/', 'https://hooks.example.test/#secret']) {
    assert.equal(allowed(url), false, url);
  }
  for (const origin of ['invalid', 'http://hooks.example.test', 'https://user@hooks.example.test', 'https://hooks.example.test/path', 'https://hooks.example.test/?x=1']) {
    env.COLLAB_WEBHOOK_ALLOWED_ORIGINS = origin;
    assert.equal(allowed('https://hooks.example.test/event'), false, origin);
  }
  env.COLLAB_WEBHOOK_ALLOWED_ORIGINS = 'https://hooks.example.test:8443';
  assert.equal(allowed('https://hooks.example.test:8443/event'), true);
  assert.equal(allowed('https://hooks.example.test/event'), false);
  let requests = 0;
  const webhook = { isActive: true, url: 'https://hooks.example.test/event', eventTypes: ['issue.updated'], secretEnc: 'test' };
  const { deliverWebhook } = load('src/lib/webhook-delivery.ts', {
    '@/lib/prisma': { prisma: { appWebhook: { findUnique: async () => webhook } } },
    './webhooks': webhooks, './apps/crypto': { decrypt: async () => 'test-secret' },
  }, {
    Buffer, AbortController, setTimeout, clearTimeout, console: { log() {}, warn() {}, error() {} },
    fetch: async (_url, options) => {
      requests++;
      assert.equal(options.redirect, 'manual');
      return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/private' } });
    },
  });
  const event = { id: 'event', type: 'issue.updated', timestamp: Date.now(), data: {}, workspace: { id: 'own', name: 'Test', slug: 'test' }, app: { id: 'app', name: 'Test', slug: 'test' } };
  assert.equal((await deliverWebhook('hook', event)).success, false);
  assert.equal(requests, 0);
  env.COLLAB_WEBHOOK_ALLOWED_ORIGINS = 'https://hooks.example.test';
  const response = await deliverWebhook('hook', event);
  assert.equal(response.success, false);
  assert.equal(response.status, 302);
  assert.equal(response.shouldRetry, false);
  assert.equal(requests, 1);
});


test('profile edits cannot create membership in an inaccessible workspace', async () => {
  let writes = 0;
  const { updateUserProfile } = load('src/actions/user.ts', {
    '@/app/api/auth/[...nextauth]/route': { authOptions: {} },
    'next-auth': { getServerSession: async () => ({ user: { email: 'alice@example.test' } }) },
    '@/lib/issue-finder': { userHasWorkspaceAccess },
    '@/lib/prisma': { prisma: {
      user: { findUnique: async () => ({ id: 'alice' }) },
      workspaceMember: { upsert: async () => { writes++; return {}; } },
    } },
  });
  for (const workspace of ['foreign', 'revoked']) {
    await assert.rejects(updateUserProfile({ name: 'Alice' }, workspace), /Workspace access required/);
  }
  assert.equal(writes, 0);
  await updateUserProfile({ name: 'Alice' }, 'joined');
  assert.equal(writes, 1);
});

test('protected notes cannot publish their content as workspace templates', async () => {
  for (const flags of [{ isEncrypted: true }, { isRestricted: true }]) {
    const { POST } = load('src/app/api/notes/[id]/save-as-template/route.ts', {
      'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status ?? 200 }) } },
      'next-auth': { getServerSession: async () => ({ user: { id: 'alice' } }) },
      '@/app/api/auth/[...nextauth]/route': { authOptions: {} },
      '@/lib/secrets/access': { canAccessNote: async () => ({ canAccess: true }) },
      '@/lib/issue-finder': { userHasWorkspaceAccess },
      '@/lib/prisma': { prisma: { note: { findUnique: async () => ({ ...note, isEncrypted: false, isRestricted: false, ...flags }) } } },
      '@prisma/client': enums, 'zod': require('zod'),
    });
    const response = await POST(new Request('https://example.test/template', {
      method: 'POST', body: JSON.stringify({ name: 'Template' }),
    }), { params: Promise.resolve({ id: 'note' }) });
    assert.equal(response.status, 400);
    assert.match(response.body.error, /Protected notes/);
  }
});

test('collection predicates match the single-note read policy across scope and membership', async () => {
  const { noteAccessWhere } = load('src/lib/secrets/access.ts', {
    '@/lib/prisma': { prisma }, '@prisma/client': enums, '@/lib/issue-finder': { userHasWorkspaceAccess },
  });
  for (const scope of Object.values(enums.NoteScope))
  for (const role of [null, 'MEMBER', 'ADMIN', 'OWNER'])
  for (const isRestricted of [false, true])
  for (const isEncrypted of [false, true])
  for (const authorId of ['alice', 'bob'])
  for (const shared of [false, true])
  for (const expired of [false, true])
  for (const projectFallback of [false, true]) {
    const workspace = { ownerId: role === 'OWNER' ? 'alice' : 'bob', members: [
      { userId: 'alice', status: !!role, role: role || 'ADMIN' },
    ] };
    const row = { ...note, scope, isRestricted, isEncrypted, authorId,
      workspaceId: projectFallback ? null : 'joined',
      projectId: projectFallback ? 'project' : null,
      workspace: projectFallback ? null : workspace,
      project: projectFallback ? { workspace } : null,
      sharedWith: shared ? [{ userId: 'alice', permission: 'EDIT' }] : [],
      expiresAt: expired ? new Date(0) : null,
    };
    const expected = (await checkNoteAccess('alice', row, role ? { role } : null)).canAccess;
    assert.equal(matches(row, noteAccessWhere('alice')), expected, JSON.stringify({ scope, role, isRestricted, isEncrypted, authorId, shared, expired, projectFallback }));
  }
  assert.equal(matches(note, noteAccessWhere('')), false);
});

test('all Notes collections constrain both result reads and search counts', async () => {
  for (const [file, query] of [
    ['route.ts', 'scope=WORKSPACE&workspace=foreign'],
    ['route.ts', 'sharedWithMe=true'],
    ['pinned/route.ts', 'workspaceId=foreign'],
    ['search/route.ts', 'workspaceId=foreign&q=secret'],
    ['shared-with-me/route.ts', 'workspace=foreign'],
  ]) {
    let reads = 0;
    const boundary = { id: { in: [] } };
    const check = ({ where }) => {
      reads++;
      assert.ok(where.AND.includes(boundary), `${file} omitted its access boundary`);
    };
    const { GET } = load(`src/app/api/notes/${file}`, {
      'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status ?? 200 }) } },
      'next-auth': { getServerSession: async () => ({ user: { id: 'alice' } }) },
      '@/app/api/auth/[...nextauth]/route': { authOptions: {} },
      '@/lib/prisma': { prisma: { note: {
        findMany: async args => { check(args); return []; },
        count: async args => { check(args); return 0; },
      } } },
      '@/lib/secrets/access': { noteAccessWhere: () => boundary },
      '@/lib/secrets/crypto': {}, '@/lib/versioning': {}, '@/lib/event-bus': {},
      '@prisma/client': enums,
    }, { URL, console });
    const response = await GET(new Request(`https://example.test/notes?${query}`));
    assert.equal(response.status, 200, file);
    assert.equal(reads, file === 'search/route.ts' ? 2 : 1);
  }
});

test('template use requires workspace access and scopes custom template reads', async () => {
  let templateReads = 0;
  const { POST } = load('src/app/api/notes/templates/[id]/use/route.ts', {
    'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status ?? 200 }) } },
    'next-auth': { getServerSession: async () => ({ user: { id: 'alice' } }) },
    '@/app/api/auth/[...nextauth]/route': { authOptions: {} },
    '@/lib/issue-finder': { userHasWorkspaceAccess },
    '@/lib/prisma': { prisma: {
      user: { findUnique: async () => ({ name: 'Alice' }) },
      workspace: { findUnique: async () => ({ name: 'Workspace' }) },
      noteTemplate: { findFirst: async ({ where }) => {
        templateReads++;
        assert.equal(where.workspaceId, 'joined');
        return null;
      } },
    } },
    'zod': require('zod'), '@/lib/note-templates': { BUILT_IN_TEMPLATES: [] },
    '@/lib/template-placeholders': {},
  });
  for (const workspaceId of ['foreign', 'revoked', 'joined']) {
    const response = await POST(new Request('https://example.test/template', {
      method: 'POST', body: JSON.stringify({ workspaceId }),
    }), { params: Promise.resolve({ id: 'custom-template' }) });
    assert.equal(response.status, workspaceId === 'joined' ? 404 : 403);
  }
  assert.equal(templateReads, 1);
});

test('note destinations reject foreign/revoked workspaces and mismatched projects', async () => {
  const { canWriteNoteDestination } = load('src/lib/secrets/access.ts', {
    '@/lib/issue-finder': { userHasWorkspaceAccess }, '@prisma/client': enums,
    '@/lib/prisma': { prisma: { project: { findUnique: async ({ where }) =>
      workspaces.some(w => w.id === where.id) ? { workspaceId: where.id } : null } } },
  });
  for (const workspace of workspaces) {
    const allowed = ['own', 'joined'].includes(workspace.id);
    assert.equal(await canWriteNoteDestination('alice', workspace.id, null), allowed);
    assert.equal(await canWriteNoteDestination('alice', null, workspace.id), allowed);
    assert.equal(await canWriteNoteDestination('alice', workspace.id, workspace.id), allowed);
  }
  assert.equal(await canWriteNoteDestination('alice', 'joined', 'own'), false);
  assert.equal(await canWriteNoteDestination('alice', 'joined', 'missing'), false);
  assert.equal(await canWriteNoteDestination('alice', null, null), true);
  assert.equal(await canWriteNoteDestination('', null, null), false);
});

test('note creation and project reassignment reject inaccessible destinations before writes', async () => {
  let checked = 0;
  const dependencies = {
    'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status ?? 200 }) } },
    'next-auth': { getServerSession: async () => ({ user: { id: 'alice' } }) },
    '@/app/api/auth/[...nextauth]/route': { authOptions: {} },
    '@/lib/prisma': { prisma: {
      user: { findUnique: async () => ({ id: 'alice' }) },
      note: {
        findFirst: async () => ({ ...note, authorId: 'alice' }),
        findUnique: async () => ({ versioningEnabled: false }),
      },
    } },
    '@/lib/secrets/access': {
      canAccessNote: async () => ({ canEdit: true }),
      canWriteNoteDestination: async (_, workspace, project) => {
        assert.equal(project, 'foreign'); checked++; return false;
      },
    },
    '@/lib/secrets/crypto': { isSecretNoteType: () => false },
    '@/lib/versioning': {}, '@/lib/event-bus': {}, '@prisma/client': enums,
  };
  for (const [file, method] of [['route.ts', 'POST'], ['[id]/route.ts', 'PATCH']]) {
    const route = load(`src/app/api/notes/${file}`, dependencies);
    const response = await route[method](new Request('https://example.test/note', {
      method, body: JSON.stringify({ title: 'Title', content: 'Content', projectId: 'foreign' }),
    }), { params: Promise.resolve({ id: 'note' }) });
    assert.equal(response.status, 403, file);
  }
  assert.equal(checked, 2);
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

test('review: alternate Notes handlers filter content and metadata with the real access policy', async () => {
  const workspace = { id: 'joined', slug: 'joined', name: 'Workspace', ownerId: 'bob',
    members: [{ userId: 'alice', status: true, role: 'MEMBER' }] };
  const rows = [
    { id: 'restricted', scope: 'WORKSPACE', isRestricted: true },
    { id: 'restricted-project', scope: 'PROJECT', isRestricted: true },
    { id: 'personal', scope: 'PERSONAL' },
    { id: 'expired', scope: 'WORKSPACE', expiresAt: new Date(0) },
    { id: 'visible', scope: 'WORKSPACE' },
    { id: 'shared', scope: 'PROJECT', isRestricted: true, sharedWith: [{ userId: 'alice', permission: 'VIEW' }] },
    { id: 'owned', scope: 'PROJECT', authorId: 'alice', isRestricted: true },
  ].map(row => ({ ...note, isEncrypted: false, title: 'matching-text', content: 'matching-text secret ' + row.id,
    createdAt: new Date(), updatedAt: new Date(), tags: [], comments: [], author: { name: 'Author' },
    workspace, projectId: 'project', project: { workspace }, ...row }));
  const access = load('src/lib/secrets/access.ts', {
    '@/lib/prisma': { prisma: {} }, '@prisma/client': enums, '@/lib/issue-finder': { userHasWorkspaceAccess },
  });
  const db = {
    workspace: { findFirst: async ({ where }) => matchesWorkspace(workspace, where) ? workspace : null },
    workspaceMember: { findFirst: async () => workspace.members[0].status ? { userId: 'alice' } : null },
    note: {
      findMany: async ({ where }) => rows.filter(row => matches(row, where)),
      findFirst: async ({ where }) => rows.find(row => matches(row, where)) ?? null,
    },
    project: { findMany: async () => [], findUnique: async () => ({ id: 'project', workspaceId: 'joined' }) },
    issue: { findMany: async () => [], groupBy: async () => [], count: async () => 0 },
    repository: { findFirst: async () => null },
  };
  for (const model of ['user', 'view', 'post', 'tag', 'projectStatus', 'featureRequest']) {
    db[model] = { findMany: async () => [] };
  }
  const dependencies = {
    'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status ?? 200 }) } },
    'next-auth': { getServerSession: async () => ({ user: { id: 'alice', email: 'alice@example.test' } }) },
    'next-auth/next': { getServerSession: async () => ({ user: { id: 'alice', email: 'alice@example.test' } }) },
    '@/lib/session': { getCurrentUser: async () => ({ id: 'alice' }) },
    '@/app/api/auth/[...nextauth]/route': { authOptions: {} }, '@/lib/auth': { authConfig: {} },
    '@/lib/prisma': { prisma: db }, '@/lib/secrets/access': access,
  };
  const search = load('src/app/api/search/route.ts', dependencies, { URL, console });
  const summary = load('src/app/api/projects/[projectId]/summary/route.ts', dependencies, { console });
  const preview = load('src/app/api/link-preview/route.ts', dependencies, { URL, console });
  const allowed = ['owned', 'shared', 'visible'];
  const searchResponse = await search.GET(new Request('https://example.test/api/search?workspace=joined&q=matching-text'));
  assert.equal(searchResponse.status, 200);
  assert.deepEqual(Array.from(searchResponse.body, result => result.id).sort(), allowed);
  const summaryResponse = await summary.GET({}, { params: Promise.resolve({ projectId: 'project' }) });
  assert.equal(summaryResponse.status, 200);
  assert.deepEqual(Array.from(summaryResponse.body.notes, result => result.id).sort(), allowed);
  for (const row of rows) {
    const response = await preview.POST(new Request('https://example.test/api/link-preview', {
      method: 'POST', body: JSON.stringify({ url: `https://example.test/joined/notes/${row.id}` }),
    }));
    assert.equal(response.status, 200);
    assert.equal(response.body.metadata.notFound === true, !allowed.includes(row.id), row.id);
    if (!allowed.includes(row.id)) assert.equal(response.body.title, 'Not Found');
  }
  workspace.members[0].status = false;
  assert.equal((await search.GET(new Request('https://example.test/api/search?workspace=joined&q=matching-text'))).status, 403);
  assert.equal((await summary.GET({}, { params: Promise.resolve({ projectId: 'project' }) })).status, 403);
  const revokedPreview = await preview.POST(new Request('https://example.test/api/link-preview', {
    method: 'POST', body: JSON.stringify({ url: 'https://example.test/joined/notes/owned' }),
  }));
  assert.equal(revokedPreview.body.metadata.notFound, true);
});

test('review: favorite PATCH preserves concurrent visibility and explicit scope updates still work', async () => {
  let state;
  const payloads = [];
  const route = load('src/app/api/notes/[id]/route.ts', {
    'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status ?? 200 }) } },
    'next-auth': { getServerSession: async () => ({ user: { id: 'alice' } }) },
    '@/app/api/auth/[...nextauth]/route': { authOptions: {} }, '@prisma/client': enums,
    '@/lib/prisma': { prisma: { note: {
      findFirst: async () => {
        const snapshot = { ...state };
        state.scope = 'PERSONAL';
        return snapshot;
      },
      findUnique: async () => ({ versioningEnabled: false }),
      update: async ({ data }) => { payloads.push(data); Object.assign(state, data); return state; },
    } } },
    '@/lib/secrets/access': { canAccessNote: async () => ({ canEdit: true }), canWriteNoteDestination: async () => true },
    '@/lib/secrets/crypto': { isSecretNoteType: () => false }, '@/lib/versioning': {}, '@/lib/event-bus': {},
  }, { console });
  for (const [body, expectedScope] of [
    [{ isFavorite: true }, 'PERSONAL'], [{ scope: 'WORKSPACE' }, 'WORKSPACE'],
    [{ isPublic: true }, 'WORKSPACE'], [{ isPublic: false }, 'PERSONAL'],
  ]) {
    state = { ...note, authorId: 'alice', isEncrypted: false };
    const response = await route.PATCH(new Request('https://example.test/note', {
      method: 'PATCH', body: JSON.stringify(body),
    }), { params: Promise.resolve({ id: 'note' }) });
    assert.equal(response.status, 200);
    assert.equal(state.scope, expectedScope);
  }
  assert.equal(Object.hasOwn(payloads[0], 'scope'), false);
});

test('review: issue field grants and atomic same-workspace project moves preserve rights and relations', async () => {
  const client = require('@prisma/client');
  const permissionModule = load('src/lib/permissions.ts', { './prisma': { prisma: {} } });
  const defaults = load('src/lib/role-permission-defaults.ts', { '@prisma/client': client, '@/lib/prisma': { prisma: {} } });
  let grants;
  let active;
  let state;
  let writes;
  let assignments;
  const statuses = [
    { id: 'old-todo', projectId: 'source', name: 'todo', displayName: 'To Do', isActive: true },
    { id: 'old-progress', projectId: 'source', name: 'in_progress', displayName: 'In Progress', isActive: true },
    { id: 'new-todo', projectId: 'destination', name: 'todo', displayName: 'To Do', isActive: true },
    { id: 'new-progress', projectId: 'destination', name: 'in_progress', displayName: 'In Progress', isActive: true },
    { id: 'inactive', projectId: 'destination', name: 'closed', displayName: 'Closed', isActive: false },
  ];
  const projects = [{ id: 'source', workspaceId: 'joined' }, { id: 'destination', workspaceId: 'joined' },
    { id: 'no-status', workspaceId: 'joined' }, { id: 'foreign', workspaceId: 'foreign' }];
  const issueRows = () => [state, { id: 'parent', projectId: 'source', workspaceId: 'joined' }];
  const db = {
    issue: {
      findFirst: async ({ where }) => issueRows().find(row => matches(row, where)) ?? null,
      update: async ({ data }) => { writes++; Object.assign(state, data); return { ...state }; },
    },
    project: { findFirst: async ({ where }) => projects.find(row => matches(row, where)) ?? null },
    projectStatus: {
      findFirst: async ({ where }) => statuses.find(row => matches(row, where)) ?? null,
      findMany: async ({ where }) => statuses.filter(row => matches(row, where)),
    },
    taskLabel: { count: async ({ where }) => [{ id: 'label', workspaceId: 'joined' }].filter(row => matches(row, where)).length },
    issueAssignee: { upsert: async () => { assignments++; } },
    user: { findUnique: async ({ where }) => ({ id: where.id, name: where.id }) },
    issueFollower: { findMany: async () => [] }, projectFollower: { findMany: async () => [] },
    $transaction: async (fn, options) => {
      assert.equal(options.isolationLevel, 'Serializable');
      const before = structuredClone(state);
      const result = await fn(db);
      if (result.error) assert.deepEqual(state, before);
      return result;
    },
  };
  const route = load('src/app/api/issues/[issueId]/route.ts', {
    zod: require('zod'), '@prisma/client': client,
    'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status ?? 200 }) } },
    '@/lib/prisma': { prisma: db }, '@/lib/session': { getCurrentUser: async () => ({ id: 'alice' }) },
    '@/lib/permissions': { ...permissionModule,
      checkUserPermissions: async (_user, _workspace, requested) => Object.fromEntries(requested.map(p => [p, { hasPermission: grants.includes(p) }])) },
    '@/lib/issue-finder': { STANDARD_ISSUE_INCLUDE: {},
      findIssueByIdOrKey: async () => ({ ...state }),
      userHasWorkspaceAccess: async (user, workspace) => active && workspace === 'joined' && ['alice', 'bob'].includes(user) },
    '@/lib/board-item-activity-service': { compareObjects: () => [], trackStatusChange: async () => {}, trackAssignment: async () => {} },
    '@/lib/redis': { publishEvent: async () => {} }, '@/utils/mentions': { extractMentionUserIds: () => [] },
    '@/lib/notification-service': {}, '@/lib/event-bus': { emitIssueUpdated: async () => {} },
    '@/utils/html-normalizer': { normalizeDescriptionHTML: value => value },
  }, { URL, console });
  function reset() {
    state = { id: 'issue', workspaceId: 'joined', projectId: 'source', reporterId: 'bob', assigneeId: 'alice',
      statusId: 'old-todo', statusValue: 'todo', status: 'todo', title: 'Keep', issueKey: 'SOURCE-1',
      updatedAt: new Date('2026-09-23T00:00:00Z'), parentId: null, labels: [{ id: 'label', workspaceId: 'joined' }],
      children: [], branches: [], commits: [], pullRequests: [], versionIssues: [], description: 'Keep content' };
    active = true; writes = 0; assignments = 0;
    grants = defaults.defaultRolePermissions.DEVELOPER;
  }
  const put = body => route.PUT(new Request('https://example.test/issues/issue', {
    method: 'PUT', body: JSON.stringify(body),
  }), { params: Promise.resolve({ issueId: 'issue' }) });
  for (const body of [{ status: 'in_progress', statusValue: 'in_progress' }, { statusId: 'old-progress' }, { assigneeId: 'bob' }]) {
    reset();
    const response = await put(body);
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(writes, 1);
    assert.equal(state.title, 'Keep');
    if (body.assigneeId) { assert.equal(state.assigneeId, 'bob'); assert.equal(assignments, 1); }
    else { assert.equal(state.statusId, 'old-progress'); assert.equal(state.status, 'in_progress'); }
  }
  for (const body of [{ title: 'Denied' }, { status: 'in_progress', title: 'Denied' }, { status: 'in_progress', position: 5 }, { projectId: 'destination' }]) {
    reset(); assert.equal((await put(body)).status, 403, JSON.stringify(body)); assert.equal(writes, 0);
  }
  reset(); grants = ['CHANGE_TASK_STATUS'];
  assert.equal((await put({ status: 'in_progress', assigneeId: 'bob' })).status, 403);
  assert.equal(writes, 0);
  reset(); active = false;
  assert.equal((await put({ status: 'in_progress' })).status, 403); assert.equal(writes, 0);
  reset(); state.workspaceId = 'foreign';
  assert.equal((await put({ status: 'in_progress' })).status, 403); assert.equal(writes, 0);
  reset(); grants = ['ASSIGN_TASK'];
  assert.equal((await put({ assigneeId: 'outsider' })).status, 400); assert.equal(writes, 0);
  reset(); state.reporterId = 'alice';
  assert.equal((await put({ title: 'Own edit' })).status, 200);
  reset(); grants = ['EDIT_ANY_TASK'];
  const beforeMove = structuredClone(state);
  assert.equal((await put({ projectId: 'destination' })).status, 200);
  assert.equal(state.projectId, 'destination'); assert.equal(state.statusId, 'new-todo');
  for (const field of ['labels', 'parentId', 'issueKey', 'description', 'assigneeId', 'reporterId', 'workspaceId']) {
    assert.deepEqual(state[field], beforeMove[field], field);
  }
  for (const body of [
    { projectId: 'foreign' }, { projectId: 'missing' }, { projectId: 'no-status' },
    { projectId: 'destination', labels: ['foreign'] }, { projectId: 'destination', parentId: 'parent' },
    { projectId: 'destination', statusId: 'old-todo' }, { projectId: 'destination', statusId: 'inactive' },
    { status: 'in_progress', statusValue: 'todo' }, { statusId: 'old-todo', status: 'in_progress' },
  ]) {
    reset(); grants = ['EDIT_ANY_TASK'];
    assert.equal((await put(body)).status, 400, JSON.stringify(body)); assert.equal(writes, 0);
  }
  for (const relations of [
    { parentId: 'parent' }, { children: [{ projectId: 'source' }] },
    { labels: [{ workspaceId: 'foreign' }] }, { branches: [{ repository: { projectId: 'source' } }] },
    { commits: [{ repository: { projectId: 'source' } }] }, { pullRequests: [{ repository: { projectId: 'source' } }] },
    { versionIssues: [{ version: { repository: { projectId: 'source' } } }] },
  ]) {
    reset(); grants = ['EDIT_ANY_TASK']; Object.assign(state, relations);
    assert.equal((await put({ projectId: 'destination' })).status, 400, JSON.stringify(relations));
    assert.equal(writes, 0);
  }
  reset(); grants = ['EDIT_ANY_TASK']; state.parentId = 'parent';
  assert.equal((await put({ projectId: 'destination', parentId: null, statusId: 'new-progress' })).status, 200);
  assert.equal(state.parentId, null); assert.equal(state.statusId, 'new-progress');
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

test('disclosure: post GET reuses authenticated reads and denies foreign or revoked members', async () => {
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
  const actions = load('src/actions/post.ts', {
    '@/app/api/auth/[...nextauth]/route': { authOptions: {} }, '@/lib/prisma': { prisma: db },
    'next-auth': { getServerSession: async () => session },
    '@/utils/mentions': {}, '@/lib/notification-service': {},
  }, { Error });
  const { GET } = load('src/app/api/posts/[postId]/route.ts', {
    'next/server': { NextResponse: Response }, '@/actions/post': actions,
    '@/lib/prisma': { prisma: db }, '@/lib/session': {},
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
    assert.deepEqual(post.author, author);
    assert.equal(post.comments[0].message, 'Private comment');
    assert.equal(post.tags[0].name, 'Important');
  }
});

test('disclosure: Coclaw memory enforces active access and Notes result/count parity', async () => {
  let session = { user: { id: 'alice' } };
  let reads = 0;
  let counts = 0;
  const workspace = workspaces.find(row => row.id === 'joined');
  const rows = [
    { id: 'private', scope: 'PERSONAL' },
    { id: 'restricted', isRestricted: true },
    { id: 'expired', expiresAt: new Date(0) },
    { id: 'visible' },
    { id: 'shared', isRestricted: true, isAiContext: true, sharedWith: [{ userId: 'alice', permission: 'VIEW' }] },
    { id: 'shared-personal', type: 'NOTE', scope: 'PERSONAL', isAiContext: true, sharedWith: [{ userId: 'alice', permission: 'EDIT' }] },
    { id: 'owned-expired', authorId: 'alice', expiresAt: new Date(0), isAiContext: true },
    { id: 'ordinary', type: 'NOTE' },
    { id: 'foreign', workspaceId: 'foreign', workspace: workspaces.find(row => row.id === 'foreign') },
  ].map(row => ({ ...note, workspace, isEncrypted: false, type: 'ARCHITECTURE', isAiContext: false,
    aiContextPriority: 1, title: 'Memory ' + row.id, content: 'needle ' + row.id + ' '.repeat(510) + 'end',
    tags: [], createdAt: new Date('2026-09-23T00:00:00Z'), updatedAt: new Date('2026-09-23T00:00:00Z'), ...row }));
  const access = load('src/lib/secrets/access.ts', {
    '@/lib/prisma': { prisma }, '@prisma/client': enums, '@/lib/issue-finder': { userHasWorkspaceAccess },
  });
  const { GET } = load('src/app/api/workspaces/[workspaceId]/coclaw/memory/route.ts', {
    'next/server': { NextResponse: Response }, '@/lib/auth': { getAuthSession: async () => session },
    '@/lib/issue-finder': { userHasWorkspaceAccess }, '@/lib/secrets/access': access,
    '@/lib/prisma': { prisma: { ...prisma, note: {
      findMany: async ({ where, take }) => { reads++; return rows.filter(row => matches(row, where)).slice(0, take); },
      count: async ({ where }) => { counts++; return rows.filter(row => matches(row, where)).length; },
    } } },
  }, { console });
  const get = (workspaceId, query = '') => GET({ nextUrl: new URL('https://example.test/memory?' + query) }, {
    params: Promise.resolve({ workspaceId }),
  });
  session = null;
  assert.equal((await get('joined')).status, 401);
  session = { user: { id: 'alice' } };
  for (const id of ['foreign', 'revoked', 'missing']) assert.equal((await get(id)).status, 404, id);
  assert.equal(reads, 0); assert.equal(counts, 0);
  const visibleIds = ['visible', 'shared', 'shared-personal', 'owned-expired'];
  for (const category of ['all', 'architecture', 'ai-context']) {
    for (const search of ['', 'needle', 'shared', 'absent']) {
      const expected = rows.filter(row => visibleIds.includes(row.id) &&
        (category !== 'architecture' || row.type === 'ARCHITECTURE') &&
        (category !== 'ai-context' || row.isAiContext) &&
        (!search || row.title.includes(search) || row.content.includes(search)));
      for (const limit of [1, 50]) {
        const response = await get('joined', new URLSearchParams({ category, search, limit: String(limit) }));
        assert.equal(response.status, 200);
        const body = await response.json();
        assert.equal(body.total, expected.length, `${category}/${search}/${limit}`);
        assert.deepEqual(body.memories.map(row => row.id), expected.slice(0, limit).map(row => row.id));
        for (const memory of body.memories) {
          const row = expected.find(row => row.id === memory.id);
          assert.equal(memory.fullContent, row.content);
          assert.equal(memory.content, row.content.substring(0, 500));
          assert.equal(memory.createdAt, row.createdAt.toISOString());
        }
      }
    }
  }
  const ownerResponse = await get('own');
  assert.equal(ownerResponse.status, 200);
  assert.deepEqual(await ownerResponse.json(), { memories: [], total: 0 });
  assert.equal(reads, 25); assert.equal(counts, 25);
});

function appNotesHarness() {
  const client = require('@prisma/client');
  const workspace = { id: 'joined', name: 'Joined', slug: 'joined', ownerId: 'bob',
    members: [{ userId: 'alice', status: true, role: 'MEMBER' }] };
  const state = { scopes: ['context:read', 'context:write', 'knowledge:read', 'prompts:read', 'secrets:read'],
    expiresAt: null, reads: 0, counts: 0, writes: 0, decryptions: 0, audits: 0 };
  const rows = [];
  const project = { id: 'c1234567890123456789012345', workspaceId: 'joined', workspace, name: 'Project' };
  function add(id, fields = {}) {
    const row = { ...note, id, title: id, content: 'payload ' + id, type: 'GENERAL', isEncrypted: false,
      author: { id: fields.authorId || 'bob', name: 'Author' }, workspace, project: null, tags: [],
      isAiContext: true, aiContextPriority: 0, createdAt: new Date(), updatedAt: new Date(), ...fields };
    rows.push(row); return row;
  }
  const db = {
    workspace: { findFirst: async ({ where, select }) => {
      if (!matches(workspace, where)) return null;
      return { ...workspace, members: workspace.members.filter(member => !select?.members?.where || matches(member, select.members.where)) };
    } },
    user: { findUnique: async () => ({ id: 'alice', email: 'alice@example.test', name: 'Alice' }) },
    appToken: { findMany: async () => [{ accessToken: 'Y2lwaGVy', userId: 'alice', scopes: state.scopes,
      tokenExpiresAt: state.expiresAt, installation: { id: 'installation', appId: 'app', status: 'ACTIVE',
        workspaceId: 'joined', installedById: 'installer', scopes: [], workspace,
        app: { id: 'app', name: 'App', slug: 'app', status: 'PUBLISHED' } } }] },
    project: {
      findFirst: async ({ where }) => matches(project, where) ? project : null,
      findUnique: async ({ where }) => where.id === project.id ? project : null,
    },
    note: {
      findUnique: async ({ where }) => rows.find(row => row.id === where.id) ?? null,
      findFirst: async ({ where }) => {
        const row = rows.find(row => matches(row, where));
        if (row) state.reads++;
        return row ?? null;
      },
      findMany: async ({ where, skip = 0, take }) => {
        const found = rows.filter(row => matches(row, where));
        const page = found.slice(skip, take === undefined ? undefined : skip + take);
        state.reads += page.length; return page;
      },
      count: async ({ where }) => { state.counts++; return rows.filter(row => matches(row, where)).length; },
      update: async ({ where, data }) => { state.writes++; const row = rows.find(row => row.id === where.id); Object.assign(row, data); return row; },
      create: async ({ data }) => { state.writes++; return add('created', data); },
    },
    noteActivityLog: { create: async () => { state.audits++; } },
  };
  const finder = load('src/lib/issue-finder.ts', {
    '@/lib/prisma': { prisma: db }, '@/lib/shared-issue-key-utils': load('src/lib/shared-issue-key-utils.ts'),
  });
  const access = load('src/lib/secrets/access.ts', {
    '@/lib/prisma': { prisma: db }, '@prisma/client': client, '@/lib/issue-finder': finder,
  });
  const auth = load('src/lib/apps/auth-middleware.ts', {
    'next/server': { NextResponse: Response }, '@/lib/prisma': { prisma: db },
    '@/lib/oauth-scopes': load('src/lib/oauth-scopes.ts'), '@/lib/apps/crypto': { decryptToken: async () => 'test-token' },
  }, { URL, Buffer, console });
  const secrets = load('src/lib/secrets/crypto.ts', { crypto: { default: require('node:crypto') } }, {
    Buffer, process: { env: { SECRETS_MASTER_KEY: '0123456789abcdef0123456789abcdef' } },
  });
  const deps = {
    'next/server': { NextResponse: Response }, '@/lib/prisma': { prisma: db }, '@prisma/client': client,
    '@/lib/apps/auth-middleware': auth, '@/lib/issue-finder': finder, '@/lib/secrets/access': access,
    '@/lib/html-sanitizer': { stripHtmlToPlainText: value => value }, zod: require('zod'),
    '@/lib/event-bus': { emitContextUpdated: async () => {}, emitContextCreated: async () => {} },
    '@/lib/secrets/crypto': { ...secrets,
      decryptRawContent: (...args) => { state.decryptions++; return secrets.decryptRawContent(...args); },
      decryptVariables: (...args) => { state.decryptions++; return secrets.decryptVariables(...args); },
    },
  };
  const routes = new Map();
  async function call(file, method = 'GET', id = 'note', body, query = '', authenticated = true) {
    if (!routes.has(file)) routes.set(file, load('src/app/api/apps/auth/' + file + '/route.ts', deps, { URL, console }));
    const request = new Request('https://example.test/api/apps/auth/' + file + '?' + query, {
      method, headers: authenticated ? { Authorization: 'Bearer test-token' } : {},
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
    return routes.get(file)[method](request, { params: Promise.resolve({ id }) });
  }
  return { add, call, rows, workspace, state, project, secrets };
}

test('app-notes: real token scopes and Notes policy gate detail, reveal and edit rights', async () => {
  const h = appNotesHarness();
  const doc = h.add('doc', { type: 'GUIDE', isRestricted: true });
  const secret = h.add('secret', { type: 'API_KEYS', isRestricted: true, isEncrypted: true,
    encryptedContent: h.secrets.encryptRawContent('dummy-password', 'joined') });
  for (const permission of [null, 'VIEW', 'EDIT', 'OWNER']) {
    for (const row of [doc, secret]) {
      row.authorId = permission === 'OWNER' ? 'alice' : 'bob';
      row.sharedWith = ['VIEW', 'EDIT'].includes(permission) ? [{ userId: 'alice', permission }] : [];
    }
    h.state.reads = h.state.writes = h.state.decryptions = h.state.audits = 0;
    for (const file of ['context/[id]', 'context/knowledge/[id]']) {
      const response = await h.call(file, 'GET', 'doc');
      assert.equal(response.status, permission ? 200 : 404);
      if (permission) assert.equal((await response.json()).content, doc.content);
    }
    const reveal = await h.call('secrets/[id]/reveal', 'POST', 'secret', {});
    assert.equal(reveal.status, permission ? 200 : 404);
    assert.equal(h.state.decryptions, permission ? 1 : 0);
    assert.equal(h.state.audits, permission ? 1 : 0);
    if (permission) assert.equal((await reveal.json()).rawContent, 'dummy-password');
    if (!permission) assert.equal(h.state.reads, 0);
    const edit = await h.call('context/[id]', 'PUT', 'doc', { content: 'edited' });
    assert.equal(edit.status, ['EDIT', 'OWNER'].includes(permission) ? 200 : 404);
    assert.equal(h.state.writes, ['EDIT', 'OWNER'].includes(permission) ? 1 : 0);
    if (permission === 'EDIT') {
      assert.equal((await h.call('context/[id]', 'PUT', 'doc', { scope: 'PUBLIC' })).status, 403);
      assert.equal((await h.call('context/[id]', 'PUT', 'doc', { projectId: h.project.id })).status, 403);
    }
  }
  secret.expiresAt = new Date(0);
  const decryptions = h.state.decryptions;
  assert.equal((await h.call('secrets/[id]/reveal', 'POST', 'secret', {})).status, 403);
  secret.authorId = 'bob'; secret.sharedWith = [{ userId: 'alice', permission: 'VIEW' }];
  assert.equal((await h.call('secrets/[id]/reveal', 'POST', 'secret', {})).status, 404);
  assert.equal(h.state.decryptions, decryptions);
  secret.expiresAt = null; secret.authorId = 'alice';
  assert.equal((await h.call('context/[id]', 'PUT', 'secret', { type: 'GENERAL' })).status, 400);
  assert.equal((await h.call('context/[id]', 'PUT', 'doc', { projectId: 'c9999999999999999999999999' })).status, 403);
  assert.equal((await h.call('context/[id]', 'PUT', 'doc', { scope: 'PROJECT', projectId: h.project.id })).status, 200);
  assert.equal((await h.call('context/[id]', 'PUT', 'doc', { projectId: null })).status, 400);
  doc.workspaceId = 'foreign';
  assert.equal((await h.call('context/[id]', 'GET', 'doc')).status, 404);
  assert.equal((await h.call('context/[id]', 'PUT', 'doc', { title: 'denied' })).status, 404);
  doc.workspaceId = 'joined';
  h.state.scopes = ['context:read'];
  const before = h.state.writes;
  assert.equal((await h.call('context/[id]', 'PUT', 'doc', { title: 'denied' })).status, 403);
  assert.equal((await h.call('secrets/[id]/reveal', 'POST', 'secret', {})).status, 403);
  const redacted = await h.call('context/[id]', 'GET', 'secret');
  assert.equal(redacted.status, 200);
  assert.equal((await redacted.json()).content, '[REDACTED - secrets:read scope required]');
  assert.equal(h.state.writes, before);
  h.state.expiresAt = new Date(0);
  assert.equal((await h.call('context/[id]', 'GET', 'doc')).status, 401);
});

test('app-notes: collections and counts exclude restricted, private and expired siblings', async () => {
  const h = appNotesHarness();
  for (const type of ['GUIDE', 'SYSTEM_PROMPT', 'API_KEYS']) {
    for (const variant of ['visible', 'restricted', 'shared', 'expired', 'personal']) {
      h.add(type + '-' + variant, { type, isEncrypted: type === 'API_KEYS',
        isRestricted: ['restricted', 'shared'].includes(variant),
        sharedWith: variant === 'shared' ? [{ userId: 'alice', permission: 'VIEW' }] : [],
        expiresAt: variant === 'expired' ? new Date(0) : null,
        scope: variant === 'personal' ? 'PERSONAL' : 'WORKSPACE' });
    }
  }
  for (const variant of ['visible', 'restricted', 'personal']) {
    h.add('project-' + variant, { type: 'SYSTEM_PROMPT', projectId: h.project.id, project: h.project,
      scope: variant === 'personal' ? 'PERSONAL' : 'PROJECT', isRestricted: variant === 'restricted' });
  }
  for (const [file, key, expected, query] of [
    ['context', 'context', ['GUIDE-visible', 'GUIDE-shared', 'SYSTEM_PROMPT-visible', 'SYSTEM_PROMPT-shared', 'project-visible'], 'search=payload'],
    ['context/knowledge', 'articles', ['GUIDE-visible', 'GUIDE-shared'], 'q=payload'],
    ['context/system-prompts', 'prompts', ['SYSTEM_PROMPT-visible', 'SYSTEM_PROMPT-shared', 'project-visible'], 'projectId=' + h.project.id],
    ['secrets', 'secrets', ['API_KEYS-visible', 'API_KEYS-shared'], ''],
  ]) {
    const response = await h.call(file, 'GET', '', undefined, query);
    assert.equal(response.status, 200, file);
    const body = await response.json();
    assert.deepEqual(body[key].map(row => row.id), expected, file);
    if (body.total !== undefined) assert.equal(body.total, expected.length, file);
    if (['context', 'context/knowledge'].includes(file)) {
      const page = await (await h.call(file, 'GET', '', undefined, query + '&limit=1&offset=1')).json();
      assert.equal(page.total, expected.length); assert.equal(page[key].length, 1);
      assert.equal(page[key][0].id, expected[1]);
    }
  }
  const combined = await (await h.call('ai-context', 'GET', '', undefined, 'projectId=' + h.project.id + '&includeKnowledge=true')).json();
  assert.deepEqual(combined.systemPrompts.map(row => row.id), ['SYSTEM_PROMPT-visible', 'SYSTEM_PROMPT-shared', 'project-visible']);
  assert.equal(combined.metadata.promptCount, 3);
  assert.doesNotMatch(combined.mergedContext, /restricted|personal|expired/);
  const knowledge = await (await h.call('ai-context', 'GET', '', undefined, 'includeKnowledge=true')).json();
  assert.deepEqual(knowledge.knowledge.map(row => row.id), ['GUIDE-visible', 'GUIDE-shared']);
  assert.equal(h.state.counts, 4);
});

test('app-notes: anonymous and revoked tokens stop all sibling reads and writes', async () => {
  const h = appNotesHarness();
  h.add('note', { authorId: 'alice', scope: 'PUBLIC' });
  const endpoints = [
    ['context', 'GET'], ['context', 'POST'], ['context/[id]', 'GET'], ['context/[id]', 'PUT'],
    ['context/knowledge', 'GET'], ['context/knowledge/[id]', 'GET'], ['context/system-prompts', 'GET'],
    ['ai-context', 'GET'], ['secrets', 'GET'], ['secrets/[id]/reveal', 'POST'],
  ];
  for (const [file, method] of endpoints) {
    const body = method === 'GET' ? undefined : { title: 'New', content: 'text' };
    assert.equal((await h.call(file, method, 'note', body, '', false)).status, 401, file);
    h.workspace.members[0].status = false;
    assert.equal((await h.call(file, method, 'note', body)).status, 403, file);
  }
  assert.equal(h.state.reads, 0); assert.equal(h.state.counts, 0);
  assert.equal(h.state.writes, 0); assert.equal(h.state.decryptions, 0);
  h.workspace.ownerId = 'alice';
  assert.equal((await h.call('context', 'POST', '', { title: 'New', content: 'text' })).status, 201);
  assert.equal(h.state.writes, 1);
});

test('app-notes: leave policy reads require active membership while preserving owner access', async () => {
  let session = null;
  const { GET } = load('src/app/api/leave/policies/[policyId]/route.ts', {
    'next/server': { NextResponse: Response }, 'next-auth': { getServerSession: async () => session },
    '@/app/api/auth/[...nextauth]/route': { authOptions: {} }, '@/lib/issue-finder': { userHasWorkspaceAccess },
    '@/lib/permissions': {}, zod: require('zod'),
    '@/lib/prisma': { prisma: {
      user: { findUnique: async () => ({ id: 'alice' }) },
      leavePolicy: { findUnique: async ({ where }) => {
        const workspace = workspaces.find(row => row.id === where.id);
        return workspace ? { id: where.id, workspaceId: where.id, name: 'Annual leave', _count: { leaveRequests: 2 } } : null;
      } },
    } },
  }, { console });
  const get = id => GET({}, { params: Promise.resolve({ policyId: id }) });
  assert.equal((await get('joined')).status, 401);
  session = { user: { email: 'alice@example.test' } };
  for (const id of ['foreign', 'revoked']) {
    const response = await get(id); assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: 'Access denied to workspace' });
  }
  assert.equal((await get('missing')).status, 404);
  for (const id of ['own', 'joined']) {
    const response = await get(id); assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { id, workspaceId: id, name: 'Annual leave', _count: { leaveRequests: 2 } });
  }
});
