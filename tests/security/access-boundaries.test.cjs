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
    issue: { findFirst: async () => null, findUnique: async () => existing, delete: async () => { writes++; } },
    projectStatus: { findFirst: async () => null },
    taskLabel: { count: async () => 0 },
    issueFollower: { findMany: async () => [] }, projectFollower: { findMany: async () => [] },
    $transaction: async fn => fn({ issue: { update: async ({ data }) => { writes++; return { ...existing, ...data }; } } }),
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
    { workspaceId: 'foreign' }, { projectId: 'foreign' }, { id: 'new-id' },
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
  function matches(row, where) {
    return Object.entries(where).every(([key, value]) => {
      if (key === 'AND') return value.every(clause => matches(row, clause));
      if (key === 'OR') return value.some(clause => matches(row, clause));
      const actual = row?.[key];
      if (value === null || typeof value !== 'object') return actual === value;
      if ('some' in value) return actual?.some(item => matches(item, value.some)) ?? false;
      if ('in' in value) return value.in.includes(actual);
      if ('notIn' in value) return !value.notIn.includes(actual);
      if ('gte' in value) return actual != null && actual >= value.gte;
      return actual != null && matches(actual, value);
    });
  }
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
