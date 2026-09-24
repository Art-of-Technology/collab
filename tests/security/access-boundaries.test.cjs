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
      if (!(name in dependencies) && ['@/lib/issue-mutation', '@/lib/post-access', '@/lib/delete-post-comment'].includes(name)) {
        return load(`src/${name.slice(2)}.ts`, dependencies, globals);
      }
      if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  });
  return exports;
}

test('feature pages preserve Next.js missing-feature and wrong-project navigation', async () => {
  const session = { user: { id: 'alice', email: 'alice@example.test' } };
  let feature;
  let fetchError;
  const dependencies = {
    'react/jsx-runtime': require('react/jsx-runtime'),
    'next/navigation': require('next/navigation'),
    'next/link': { default: 'a' },
    'lucide-react': { ChevronLeft: 'span' },
    'next-auth': { getServerSession: async () => session },
    '@/lib/auth': { getAuthSession: async () => session, authConfig: {} },
    '@/lib/slug-resolvers': { resolveWorkspaceSlug: async () => 'workspace' },
    '@/lib/prisma': { prisma: {
      workspace: { findFirst: async () => ({ id: 'workspace' }) },
      project: { findFirst: async () => ({ id: 'project', name: 'Project' }) },
      user: { findUnique: async () => session.user },
    } },
    '@/components/ui/button': { Button: 'button' },
    '@/components/features/FeatureRequestDetail': { default: 'article' },
    '@/components/features/FeatureRequestComments': { default: 'section' },
    '@/actions/feature': { getFeatureRequestById: async (id, workspaceId) => {
      assert.equal(id, 'feature');
      assert.equal(workspaceId, 'workspace');
      if (fetchError) throw fetchError;
      return feature;
    } },
  };
  const props = { params: Promise.resolve({ workspaceId: 'workspace', projectSlug: 'project', id: 'feature' }) };
  for (const route of ['features/[id]', 'projects/[projectSlug]/features/[id]']) {
    const page = load(`src/app/(main)/[workspaceId]/${route}/page.tsx`, dependencies, {
      console: { error() {} },
    }).default;
    feature = null;
    await assert.rejects(page(props), { digest: 'NEXT_HTTP_ERROR_FALLBACK;404' });
    if (route.startsWith('projects/')) {
      feature = { projectId: 'another-project' };
      await assert.rejects(page(props), {
        digest: 'NEXT_REDIRECT;replace;/workspace/projects/project/features;307;',
      });
    }
    feature = { projectId: 'project', comments: [], userVote: null, isAdmin: false };
    assert.equal(require('react').isValidElement(await page(props)), true);
    fetchError = new Error('Feature storage unavailable');
    const fallback = await page(props);
    assert.equal(fallback.type, 'div');
    assert.equal(fallback.props.children, 'Something went wrong');
    fetchError = undefined;
  }
});

function matches(row, where) {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'AND') return value.every(clause => matches(row, clause));
    if (key === 'OR') return value.some(clause => matches(row, clause));
    if (key === 'NOT') return !matches(row, value);
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
    if ('lt' in value) return actual != null && actual < value.lt;
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
    '@/lib/auth-options': { authOptions: {} },
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
    '@/lib/auth-options': { authOptions: {} },
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
      '@/lib/auth-options': { authOptions: {} },
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
      '@/lib/auth-options': { authOptions: {} },
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
    '@/lib/auth-options': { authOptions: {} },
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
    '@/lib/auth-options': { authOptions: {} },
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
    '@/lib/auth-options': { authOptions: {} }, '@/lib/auth': { authConfig: {} },
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
    '@/lib/auth-options': { authOptions: {} }, '@prisma/client': enums,
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
    '@/lib/auth-options': { authOptions: {} }, '@/lib/issue-finder': { userHasWorkspaceAccess },
    '@/lib/permissions': { Permission: { MANAGE_LEAVE: 'MANAGE_LEAVE' },
      checkUserPermission: async (_userId, workspaceId) => ({ hasPermission: workspaceId === 'own' }) }, zod: require('zod'),
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
    assert.deepEqual(await response.json(), id === 'own'
      ? { id, workspaceId: id, name: 'Annual leave', _count: { leaveRequests: 2 } }
      : { id, name: 'Annual leave' });
  }
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

test('related issues override heuristics in both directions and retain access controls', async () => {
  let session = { user: { id: 'alice' } };
  const records = ['a', 'b', 'foreign', 'ordinary'].map(id => ({ id, issueKey: id, title: id,
    workspaceId: id === 'foreign' ? 'foreign' : 'joined', project: { workspaceId: id === 'foreign' ? 'foreign' : 'joined' }, labels: [], projectStatus: { name: 'Open', color: '#fff' } }));
  let links = [];
  const { GET } = load('src/app/api/ai/issues/related/route.ts', {
    'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status ?? 200 }) } },
    'next-auth': { getServerSession: async () => session }, '@/lib/auth': { authConfig: {} },
    '@/lib/issue-finder': { userHasWorkspaceAccess },
    '@/lib/prisma': { prisma: {
      issue: { findFirst: async ({ where }) => records.find(row => matches(row, where)),
        findMany: async ({ where, take }) => records.filter(row => matches(row, where)).slice(0, take) },
      issueRelation: { findMany: async ({ where }) => links.filter(row => matches(row, where)) },
    } },
  }, { URL });
  const request = (id, workspace = 'joined') => GET(new Request(`https://example.test/?issueId=${id}&workspaceId=${workspace}`));
  for (const overlap of ['none', 'title', 'label', 'both']) {
    for (const row of records) {
      row.title = ['title', 'both'].includes(overlap)
        ? (row.id === 'ordinary' ? 'Database cleanup' : 'Database migration') : row.id.slice(0, 1);
      row.labels = ['label', 'both'].includes(overlap)
        ? (row.id === 'ordinary' ? [{ id: 'x' }] : [{ id: 'x' }, { id: 'y' }]) : [];
    }
    for (const [relationType, expected] of [['BLOCKS', ['blocks', 'dependent']], ['BLOCKED_BY', ['dependent', 'blocks']], ['RELATES_TO', ['related', 'related']]]) {
      links = [{ relationType, sourceIssueId: 'a', targetIssueId: 'b', sourceIssue: records[0], targetIssue: records[1] },
        { relationType, sourceIssueId: 'a', targetIssueId: 'foreign', sourceIssue: records[0], targetIssue: records[2] }];
      const explicitLinks = links;
      for (const extraPosition of ['none', 'before', 'after']) {
        const extra = { ...explicitLinks[0], relationType: 'RELATES_TO' };
        links = extraPosition === 'none' ? explicitLinks
          : extraPosition === 'before' ? [extra, ...explicitLinks] : [...explicitLinks, extra];
        for (const [index, id] of ['a', 'b'].entries()) {
          const response = await request(id);
          assert.equal(response.status, 200);
          assert.equal(response.body.relatedIssues.length, overlap === 'none' ? 1 : 2);
          assert.equal(new Set(response.body.relatedIssues.map(row => row.id)).size, response.body.relatedIssues.length);
          if (overlap !== 'none') {
            assert.equal(response.body.relatedIssues[1].id, 'ordinary');
            assert.equal(response.body.relatedIssues[1].relation, overlap === 'label' ? 'related' : 'similar');
            assert.ok(response.body.relatedIssues[1].similarity < 1);
          }
          assert.equal(response.body.relatedIssues[0].id, id === 'a' ? 'b' : 'a');
          assert.equal(response.body.relatedIssues[0].relation, expected[index], `${relationType}/${id}`);
          assert.equal(response.body.relatedIssues[0].similarity, 1);
        }
      }
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
  const names = ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'MutationObserver', 'Event', 'CustomEvent', 'NodeFilter', 'HTMLInputElement', 'KeyboardEvent', 'FocusEvent'];
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

    // Escape in the menu must not dismiss a parent Radix dialog or discard the draft.
    const Dialog = require('@radix-ui/react-dialog');
    let dialogOpen = true;
    const renderDialog = () => root.render(React.createElement(Dialog.Root, { open: dialogOpen, onOpenChange: open => { dialogOpen = open; renderDialog(); } },
      dialogOpen && React.createElement(Dialog.Content, { 'aria-describedby': undefined },
        React.createElement(Dialog.Title, null, 'Edit Feature Request'),
        React.createElement(MarkdownEditor, { compact: true, content: editor.getHTML() }))));
    await React.act(async () => renderDialog());
    await React.act(async () => {
      editor.commands.setContent('<p>Draft </p>', false, { preserveWhitespace: 'full' });
      editor.commands.setTextSelection(7);
      editor.commands.insertContent('/');
    });
    const menuItem = () => [...dom.window.document.querySelectorAll('button')].find(button => button.textContent === 'Mention user');
    assert.ok(menuItem(), 'Menu opens inside dialog');
    await React.act(async () => {
      menuItem().dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });
    assert.equal(dialogOpen, true, 'Escape keeps the dialog open');
    assert.equal(menuItem(), undefined, 'Escape closes the menu');
    assert.equal(editor.getText(), 'Draft /');
    await React.act(async () => {
      dom.window.document.body.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });
    assert.equal(dialogOpen, false, 'Escape without the menu still dismisses the dialog');
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

test('chat admission enforces conversation owner and workspace before either stream', async () => {
  for (const slug of ['cleo', 'coclaw']) {
    const activity = [];
    const writes = [];
    const rows = [
      { id: 'own', userId: 'alice', workspaceId: 'joined' },
      { id: 'foreign-owner', userId: 'bob', workspaceId: 'joined' },
      { id: 'foreign-workspace', userId: 'alice', workspaceId: 'other' },
    ];
    let lookupFails = false;
    const agent = { slug, name: slug, color: '#fff', systemPrompt: 'Test' };
    const chooseAgent = async () => { activity.push('agent'); return agent; };
    const { POST } = load('src/app/api/ai/chat/stream/route.ts', {
      'next/server': { NextResponse: Response },
      '@/lib/session': { getCurrentUser: async () => ({ id: 'alice', name: 'Alice' }) },
      '@/lib/prisma': { prisma: {
        workspace: { findFirst: async ({ where }) => where.id === 'joined' ? { id: 'joined', name: 'Joined', slug: 'joined' } : null },
        aIConversation: {
          findFirst: async ({ where }) => {
            if (lookupFails) throw new Error('Database unavailable');
            return rows.find(row => matches(row, where)) ?? null;
          },
          create: async ({ data }) => { writes.push({ kind: 'conversation', ...data }); return { id: 'new' }; },
        },
        aIAgent: { findUnique: async () => ({ id: slug }) },
        aIMessage: { create: async ({ data }) => { writes.push({ kind: 'message', ...data }); } },
        coclawChannelConfig: { findMany: async () => [] },
      } },
      '@/lib/ai/agents/registry': { getAgent: chooseAgent, getDefaultAgent: chooseAgent },
      '@/lib/ai/mcp-token': { getMcpToken: async () => { activity.push('token'); return 'test'; } },
      '@/lib/ai/mcp-client': { createMcpSession: async () => {
        activity.push('mcp'); return { convertToolsToClaudeFormat: () => [], close: async () => {} };
      } },
      '@/lib/coclaw/instance-manager': { coclawManager: { getOrCreateInstance: async () => {
        activity.push('gateway'); return { port: 1234 };
      } } },
      '@/lib/coclaw/key-resolver': { resolveApiKey: async () => {
        activity.push('key'); return { provider: 'test', key: 'test', source: 'test' };
      } },
      '@/lib/secrets/crypto': {},
      '@/lib/coclaw/notifications': { CoclawNotificationType: { COCLAW_RESPONSE: 'response' },
        createCoclawNotification: async () => { activity.push('notification'); } },
    }, {
      process: { env: {} }, Response, ReadableStream, TextEncoder, TextDecoder, AbortController, setTimeout, clearTimeout,
      console: { error() {}, warn() {} },
      fetch: async (url) => {
        activity.push(url.endsWith('/api/events') ? 'events' : 'provider');
        if (url.endsWith('/api/events')) return new Response('');
        const events = slug === 'coclaw'
          ? [{ choices: [{ delta: { content: 'Reply' }, finish_reason: 'stop' }] }]
          : [{ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Reply' } },
            { type: 'message_delta', delta: { stop_reason: 'end_turn' } }];
        return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''));
      },
    });
    const request = conversationId => POST(new Request('https://example.test/api/ai/chat/stream', {
      method: 'POST', body: JSON.stringify({ message: 'Hello', context: { workspace: { id: 'joined' } }, agentSlug: slug, conversationId }),
    }));
    for (const [conversationId, status] of [
      ['foreign-owner', 404], ['foreign-workspace', 404], ['missing', 404],
      [{ not: '' }, 400], [['own'], 400], [true, 400], [42, 400], ['', 400],
    ]) {
      const response = await request(conversationId);
      await response.text();
      assert.deepEqual(activity, [], `${slug}: denied input must not dispatch`);
      assert.deepEqual(writes, [], `${slug}: denied input must not persist`);
      assert.equal(response.status, status, `${slug}: ${JSON.stringify(conversationId)}`);
    }
    lookupFails = true;
    assert.equal((await request('own')).status, 500);
    assert.deepEqual(activity, []);
    assert.deepEqual(writes, []);
    lookupFails = false;
    for (const conversationId of ['own', null, undefined]) {
      activity.length = 0;
      writes.length = 0;
      const response = await request(conversationId);
      const events = (await response.text()).trim().split('\n\n').map(event => JSON.parse(event.slice(6)));
      assert.equal(response.status, 200);
      assert.ok(activity.includes('provider'));
      assert.equal(activity.includes('gateway'), slug === 'coclaw');
      assert.equal(events.find(event => event.type === 'done')?.fullContent, 'Reply');
      assert.equal(events.find(event => event.type === 'conversation')?.conversationId, conversationId || 'new');
      assert.equal(writes.filter(row => row.kind === 'conversation').length, conversationId ? 0 : 1);
      if (!conversationId) {
        assert.equal(writes[0].userId, 'alice');
        assert.equal(writes[0].workspaceId, 'joined');
      }
      const messages = writes.filter(row => row.kind === 'message');
      assert.deepEqual(messages.map(row => [row.conversationId, row.role, row.content]),
        [[conversationId || 'new', 'user', 'Hello'], [conversationId || 'new', 'assistant', 'Reply']]);
    }
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

test('leave policy permissions enforce active membership across reads and mutations', async (t) => {
  const basic = { id: 'policy', name: 'Annual leave', group: 'Time off', isPaid: true, trackIn: 'DAYS' };
  const policy = { ...basic, workspaceId: 'workspace', isHidden: false,
    exportMode: 'EXPORT_WITH_CODE', exportCode: 'PAYROLL', accrualType: 'FIXED', deductsLeave: true,
    maxBalance: 30, rolloverType: 'PARTIAL_BALANCE', rolloverAmount: 5, rolloverDate: '2027-01-01T00:00:00Z',
    allowOutsideLeaveYearRequest: false, useAverageWorkingHours: false,
    createdAt: '2026-09-24T00:00:00Z', updatedAt: '2026-09-24T00:00:00Z' };
  const workspace = { id: 'workspace', ownerId: 'owner' };
  const memberships = [
    { userId: 'ordinary', workspaceId: 'workspace', role: 'MEMBER', status: true },
    { userId: 'manager', workspaceId: 'workspace', role: 'HR', status: true },
    { userId: 'revoked', workspaceId: 'workspace', role: 'HR', status: false },
    { userId: 'foreign', workspaceId: 'other', role: 'HR', status: true },
    { userId: 'revoked-admin', workspaceId: 'workspace', role: 'HR', status: false },
  ];
  const users = ['owner', 'ordinary', 'manager', 'revoked', 'foreign'].map(id => ({ id, email: `${id}@example.test`, role: 'DEVELOPER' }));
  users.push(...['admin', 'revoked-admin'].map(id => ({ id, email: `${id}@example.test`, role: 'SYSTEM_ADMIN' })));
  const grants = [{ workspaceId: 'workspace', role: 'HR', permission: 'MANAGE_LEAVE' }];
  const writes = [];
  let policyExists = true;
  const requests = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'].map(status => ({ status }));
  let currentUser = null;
  let reads = 0;
  function readWorkspace({ where, include }) {
    if (!matches(workspace, where)) return null;
    return { ...workspace, members: memberships.filter(member =>
      member.workspaceId === workspace.id && matches(member, include.members.where)) };
  }
  function readPolicy({ select, include }) {
    const result = select
      ? Object.fromEntries(Object.entries(policy).filter(([key]) => select[key] === true)) : { ...policy };
    if (include?.workspace) {
      result.workspace = readWorkspace({ where: { id: policy.workspaceId }, include: include.workspace.include });
    }
    const count = select?._count ?? include?._count;
    if (count) result._count = { leaveRequests: requests.filter(row => matches(row, count.select.leaveRequests.where)).length,
      ...(count.select.leaveBalances ? { leaveBalances: 0 } : {}) };
    return result;
  }
  const db = {
    user: { findUnique: async ({ where, include }) => {
      reads++;
      const user = users.find(row => matches(row, where));
      if (!user) return null;
      if (!include) return user;
      return { ...user,
        workspaceMemberships: memberships.filter(row => row.userId === user.id && matches(row, include.workspaceMemberships.where)),
        ownedWorkspaces: workspace.ownerId === user.id && matches(workspace, include.ownedWorkspaces.where) ? [workspace] : [],
      };
    } },
    workspace: { findUnique: async args => readWorkspace(args) },
    rolePermission: {
      findUnique: async ({ where: { workspaceId_role_permission: where } }) => grants.find(row => matches(row, where)) ?? null,
      findMany: async ({ where }) => grants.filter(row => matches(row, where)),
    },
    leavePolicy: {
      findUnique: async args => policyExists && matches(policy, args.where) ? readPolicy(args) : null,
      update: async args => {
        assert.ok(policyExists && matches(policy, args.where));
        writes.push('update');
        Object.assign(policy, args.data);
        return readPolicy(args);
      },
      delete: async ({ where }) => {
        assert.ok(policyExists && matches(policy, where));
        writes.push('delete');
        policyExists = false;
        return policy;
      },
      findMany: async args => matches(policy, args.where) ? [readPolicy(args)] : [],
    },
  };
  const permissions = load('src/lib/permissions.ts', { './prisma': { prisma: db } });
  const dependencies = {
    'next/server': { NextResponse: Response }, 'next-auth': { getServerSession: async () =>
      currentUser ? { user: { id: currentUser, email: `${currentUser}@example.test` } } : null },
    '@/lib/auth-options': { authOptions: {} }, '@/lib/prisma': { prisma: db }, '@/lib/permissions': permissions, zod: require('zod'),
    '@/lib/issue-finder': { userHasWorkspaceAccess: async (userId, workspaceId) => workspace.id === workspaceId &&
      (workspace.ownerId === userId || memberships.some(row => row.workspaceId === workspaceId && row.userId === userId && row.status)) },
  };
  const list = load('src/app/api/leave/policies/route.ts', dependencies, { URL });
  const detail = load('src/app/api/leave/policies/[policyId]/route.ts', dependencies);
  for (const [name, get] of [
    ['list', () => list.GET(new Request('https://example.test/api/leave/policies?workspaceId=workspace'))],
    ['detail', () => detail.GET(new Request('https://example.test/api/leave/policies/policy'), { params: Promise.resolve({ policyId: 'policy' }) })],
  ]) {
    for (const [userId, status] of [[null, 401], ['foreign', 403], ['revoked', 403], ['ordinary', 200], ['manager', 200], ['owner', 200]]) {
      await t.test(`${name}/${userId ?? 'anonymous'}`, async () => {
        currentUser = userId;
        reads = 0;
        const response = await get();
        assert.equal(response.status, status);
        const body = await response.json();
        if (status !== 200) {
          assert.deepEqual(Object.keys(body), ['error']);
          if (!userId) assert.equal(reads, 0);
          return;
        }
        const result = name === 'list' ? body[0] : body;
        if (name === 'list') assert.equal(body.length, 1);
        if (userId === 'ordinary') {
          assert.deepEqual(result, basic);
        } else {
          const { workspaceId, ...management } = policy;
          assert.deepEqual(result, { ...management, ...(name === 'detail' ? { workspaceId } : {}), _count: { leaveRequests: 2 } });
        }
      });
    }
  }
  const permissionRoute = load('src/app/api/workspaces/[workspaceId]/permissions/route.ts', dependencies, { URL });
  for (const [userId, allowed, role] of [
    ['ordinary', false, 'MEMBER'], ['revoked', false, null], ['foreign', false, null],
    ['manager', true, 'HR'], ['owner', true, 'OWNER'], ['admin', true, null], ['revoked-admin', true, null],
    ['missing', false, null],
  ]) {
    await t.test(`permission helpers/${userId}`, async () => {
      const permission = permissions.Permission.MANAGE_LEAVE;
      assert.equal((await permissions.checkUserPermission(userId, 'workspace', permission)).hasPermission, allowed);
      assert.equal((await permissions.checkUserPermissions(userId, 'workspace', [permission]))[permission].hasPermission, allowed);
      assert.equal(await permissions.requirePermission(permission)(userId, 'workspace'), allowed);
      assert.equal(await permissions.requireAnyPermission([permission])(userId, 'workspace'), allowed);
      assert.equal(await permissions.requireAllPermissions([permission])(userId, 'workspace'), allowed);
      const all = await permissions.getUserPermissions(userId, 'workspace');
      assert.equal(all.includes(permission), allowed);
      if (!allowed) assert.equal(all.length, 0);
      if (['owner', 'admin', 'revoked-admin'].includes(userId)) {
        assert.deepEqual([...all].sort(), Object.values(permissions.Permission).sort());
      }
      assert.equal(await permissions.getUserWorkspaceRole(userId, 'workspace'), role);
    });
    await t.test(`permission endpoint/${userId}`, async () => {
      currentUser = userId;
      const response = await permissionRoute.GET(new Request(`https://example.test/api/workspaces/workspace/permissions?userId=${userId}`),
        { params: Promise.resolve({ workspaceId: 'workspace' }) });
      assert.equal(response.status, role ? 200 : 404);
      const body = await response.json();
      if (role) {
        assert.equal(body.role, role);
        assert.equal(body.permissions.includes('MANAGE_LEAVE'), allowed);
      } else {
        assert.deepEqual(Object.keys(body), ['error']);
      }
    });
  }
  requests.length = 0;
  for (const method of ['PUT', 'DELETE']) {
    for (const [userId, status] of [[null, 401], ['foreign', 403], ['revoked', 403], ['ordinary', 403],
      ['manager', 200], ['owner', 200], ['admin', 200], ['revoked-admin', 200]]) {
      await t.test(`${method}/${userId ?? 'anonymous'}`, async () => {
        currentUser = userId;
        policy.maxBalance = 30;
        policyExists = true;
        writes.length = 0;
        const response = await detail[method](new Request('https://example.test/api/leave/policies/policy', {
          method, ...(method === 'PUT' ? { body: JSON.stringify({ maxBalance: 999 }) } : {}),
        }), { params: Promise.resolve({ policyId: 'policy' }) });
        assert.equal(response.status, status);
        const body = await response.json();
        if (status !== 200) {
          assert.deepEqual(writes, []);
          assert.equal(policy.maxBalance, 30);
          assert.equal(policyExists, true);
          assert.deepEqual(Object.keys(body), ['error']);
        } else if (method === 'PUT') {
          assert.deepEqual(writes, ['update']);
          assert.equal(policy.maxBalance, 999);
          assert.equal(body.maxBalance, 999);
          assert.equal(body.exportCode, 'PAYROLL');
          assert.equal(body._count.leaveRequests, 0);
        } else {
          assert.deepEqual(writes, ['delete']);
          assert.equal(policyExists, false);
          assert.deepEqual(body, { message: 'Policy deleted successfully' });
        }
      });
    }
  }

});

test('shared issue mutation blocks AI and PUT bypasses with real access and field permissions', async (t) => {
  const workspace = { id: 'joined', slug: 'joined', ownerId: 'bob', members: [{ userId: 'alice', status: true, role: 'MEMBER' }] };
  let user, state, grants, writes, effects, conflict;
  const db = {
    workspace: { findFirst: async ({ where }) => matches(workspace, where) ? workspace : null },
    user: { findUnique: async ({ where, include }) => ({ id: where.id, name: where.id, role: 'DEVELOPER',
      workspaceMemberships: include ? workspace.members.filter(member => member.userId === where.id &&
        matches({ ...member, workspaceId: workspace.id }, include.workspaceMemberships.where)) : [],
      ownedWorkspaces: workspace.ownerId === where.id ? [{ id: workspace.id }] : [] }) },
    rolePermission: { findUnique: async ({ where }) => grants.includes(where.workspaceId_role_permission.permission) ? {} : null },
    issue: {
      findFirst: async ({ where }) => matches({ ...state, workspace }, where) ? { ...state } : null,
      update: async ({ data }) => { writes++; Object.assign(state, data); return { ...state }; },
      create: async ({ data }) => { writes++; return { ...data, id: 'created' }; },
    },
    project: { findFirst: async ({ where }) => {
      const project = { id: 'project', workspaceId: 'joined', issuePrefix: 'P', _count: { issues: 1 } };
      return matches(project, where) ? project : null;
    } },
    projectStatus: { findMany: async ({ where }) => [
      { id: 'todo', projectId: 'project', name: 'todo', displayName: 'To Do', isActive: true },
      { id: 'progress', projectId: 'project', name: 'in_progress', displayName: 'In Progress', isActive: true },
    ].filter(row => matches(row, where)) },
    taskLabel: { count: async () => 0 },
    issueAssignee: { upsert: async () => { writes++; } },
    issueFollower: { findMany: async () => [] }, projectFollower: { findMany: async () => [] },
    $transaction: async (fn, options) => {
      assert.equal(options.isolationLevel, 'Serializable');
      if (conflict) throw new (require('@prisma/client').Prisma.PrismaClientKnownRequestError)('conflict', { code: 'P2034', clientVersion: 'test' });
      return fn(db);
    },
  };
  const finder = load('src/lib/issue-finder.ts', { '@/lib/prisma': { prisma: db },
    '@/lib/shared-issue-key-utils': load('src/lib/shared-issue-key-utils.ts') });
  const permissions = load('src/lib/permissions.ts', { './prisma': { prisma: db } }, { console });
  const dependencies = {
    zod: require('zod'), '@prisma/client': require('@prisma/client'),
    'next/server': { NextResponse: Response }, '@/lib/session': { getCurrentUser: async () => user },
    '@/lib/prisma': { prisma: db }, '@/lib/permissions': permissions, '@/lib/issue-finder': finder,
    '@/utils/html-normalizer': { normalizeDescriptionHTML: value => value },
    '@/lib/board-item-activity-service': { compareObjects: () => [], trackAssignment: async () => {}, trackStatusChange: async () => {}, createActivity: async () => {} },
    '@/lib/redis': { publishEvent: async () => { effects++; } }, '@/utils/mentions': { extractMentionUserIds: () => [] },
    '@/lib/notification-service': {}, '@/lib/event-bus': { emitIssueUpdated: async () => { effects++; } },
  };
  const put = load('src/app/api/issues/[issueId]/route.ts', dependencies, { URL, console }).PUT;
  const ai = load('src/app/api/ai/action/route.ts', dependencies, { console }).POST;
  function reset() {
    user = { id: 'alice' }; grants = ['EDIT_SELF_TASK']; writes = 0; effects = 0; conflict = false;
    workspace.ownerId = 'bob'; workspace.members = [{ userId: 'alice', status: true, role: 'MEMBER' }];
    state = { id: 'issue', issueKey: 'P-1', title: 'Before', reporterId: 'bob', assigneeId: null,
      workspaceId: 'joined', projectId: 'project', statusId: 'todo', status: 'todo', statusValue: 'todo',
      parentId: null, updatedAt: new Date('2026-09-24T00:00:00Z') };
  }
  const aiRequest = (params, type = 'update_issue', workspaceId = 'joined') => ai(new Request('https://example.test/api/ai/action', {
    method: 'POST', body: JSON.stringify({ action: { type, params }, context: { workspace: { id: workspaceId } } }),
  }));
  for (const endpoint of ['PUT', 'AI']) {
    const request = fields => endpoint === 'AI' ? aiRequest({ issueId: 'issue', ...fields }) : put(new Request('https://example.test/api/issues/issue?workspaceId=joined', {
      method: 'PUT', body: JSON.stringify(fields),
    }), { params: Promise.resolve({ issueId: 'issue' }) });
    const denied = [
      ['other reporter', () => {}, { title: 'Denied' }, 403],
      ['read only reporter', () => { state.reporterId = 'alice'; grants = []; }, { title: 'Denied' }, 403],
      ['anonymous', () => { user = null; }, { title: 'Denied' }, 401],
      ['revoked', () => { workspace.members[0].status = false; grants = ['EDIT_ANY_TASK']; }, { title: 'Denied' }, endpoint === 'AI' ? 403 : 404],
      ['foreign user', () => { workspace.members = []; grants = ['EDIT_ANY_TASK']; }, { title: 'Denied' }, endpoint === 'AI' ? 403 : 404],
      ['foreign issue', () => { state.workspaceId = 'foreign'; grants = ['EDIT_ANY_TASK']; }, { title: 'Denied' }, 404],
      ['status mixed with title', () => { grants = ['CHANGE_TASK_STATUS']; }, { statusId: 'progress', title: 'Denied' }, endpoint === 'AI' ? 400 : 403],
      ['status name mixed with title', () => { grants = ['CHANGE_TASK_STATUS']; }, { status: 'In Progress', title: 'Denied' }, 403],
      ['assignment mixed with status', () => { grants = ['ASSIGN_TASK']; }, { assigneeId: 'alice', statusId: 'progress' }, endpoint === 'AI' ? 400 : 403],
      ['assignment mixed with status name', () => { grants = ['ASSIGN_TASK']; }, { assigneeId: 'alice', status: 'In Progress' }, 403],
      ['empty title', () => { grants = ['EDIT_ANY_TASK']; }, { title: ' ' }, 400],
      ['bad date', () => { grants = ['EDIT_ANY_TASK']; }, { dueDate: 'tomorrow' }, 400],
      ['mass assignment', () => { grants = ['EDIT_ANY_TASK']; }, { workspaceId: 'foreign' }, 400],
      ['foreign assignee', () => { grants = ['ASSIGN_TASK']; }, { assigneeId: 'outsider' }, 400],
      ['revoked assignee', () => { workspace.members.push({ userId: 'revoked', status: false }); grants = ['ASSIGN_TASK']; }, { assigneeId: 'revoked' }, 400],
      ['foreign reporter', () => { grants = ['EDIT_ANY_TASK']; }, { reporterId: 'outsider' }, 400],
      ['foreign project', () => { grants = ['EDIT_ANY_TASK']; }, { projectId: 'foreign' }, 400],
      ['foreign status', () => { grants = ['CHANGE_TASK_STATUS']; }, { statusId: 'foreign' }, 400],
      ['foreign parent', () => { grants = ['EDIT_ANY_TASK']; }, { parentId: 'foreign' }, 400],
      ['foreign labels', () => { grants = ['EDIT_ANY_TASK']; }, { labels: ['foreign'] }, 400],
      ['conflict', () => { grants = ['EDIT_ANY_TASK']; conflict = true; }, { title: 'Denied' }, 409],
    ];
    for (const [name, setup, fields, expected] of denied) await t.test(`${endpoint}: ${name}`, async () => {
      reset(); setup(); const before = structuredClone(state);
      const response = await request(fields);
      assert.equal(response.status, expected, await response.text());
      assert.equal(writes, 0); assert.equal(effects, 0); assert.deepEqual(state, before);
    });
    for (const [name, setup, fields, expectedWrites] of [
      ['owner without membership', () => { workspace.ownerId = 'alice'; workspace.members = []; grants = []; }, { title: 'After' }, 1],
      ['reporter', () => { state.reporterId = 'alice'; }, { title: 'After' }, 1],
      ['editor', () => { grants = ['EDIT_ANY_TASK']; }, { title: 'After' }, 1],
      ['status only', () => { grants = ['CHANGE_TASK_STATUS']; }, { status: 'In Progress' }, 1],
      ['assignment only', () => { grants = ['ASSIGN_TASK']; }, { assigneeId: 'alice' }, 2],
    ]) await t.test(`${endpoint}: ${name}`, async () => {
      reset(); setup(); const response = await request(fields);
      assert.equal(response.status, 200, await response.text()); assert.equal(writes, expectedWrites);
      assert.equal(state.workspaceId, 'joined');
      if (fields.title) assert.equal(state.title, 'After');
      if (fields.status) { assert.equal(state.statusId, 'progress'); assert.equal(state.statusValue, 'in_progress'); }
      if (fields.assigneeId) assert.equal(state.assigneeId, 'alice');
    });
  }
  await t.test('AI preserves its original update field set with zero writes for unsupported fields', async () => {
    for (const fields of [{ projectId: 'project' }, { reporterId: 'alice' }, { parentId: null },
      { labels: [] }, { progress: 50 }, { position: 3 }, { statusId: 'todo' }, { statusValue: 'todo' }, { unexpected: true }]) {
      reset(); grants = ['EDIT_ANY_TASK']; const before = structuredClone(state);
      const response = await aiRequest({ issueId: 'issue', title: 'Must not change', ...fields });
      assert.equal(response.status, 400, JSON.stringify(fields));
      assert.equal(writes, 0); assert.equal(effects, 0); assert.deepEqual(state, before);
    }
    reset(); grants = ['EDIT_ANY_TASK'];
    const fields = { title: 'Supported', description: 'Content', status: 'In Progress', priority: 'high',
      type: 'BUG', assigneeId: 'alice', dueDate: '2026-10-01T00:00:00Z' };
    const response = await aiRequest({ issueId: 'issue', ...fields });
    assert.equal(response.status, 200, await response.text());
    assert.equal(writes, 2);
    for (const [field, value] of Object.entries(fields)) assert.equal(state[field], field === 'status' ? 'in_progress' : value);
  });
  await t.test('AI rejects malformed envelopes and issue identifier aliases', async () => {
    reset(); grants = ['EDIT_ANY_TASK'];
    for (const body of [null, {}, { action: { type: 'update_issue', params: null }, context: { workspace: { id: 'joined' } } }]) {
      assert.equal((await ai(new Request('https://example.test', { method: 'POST', body: JSON.stringify(body) }))).status, 400);
    }
    assert.equal((await aiRequest({ id: 'issue', title: 'Denied' })).status, 400);
    assert.equal((await aiRequest({ issueId: 'issue', title: 'Denied' }, 'update_issue', 'foreign')).status, 403);
    assert.equal(writes, 0);
  });
  await t.test('AI creation also denies read only users and foreign references', async () => {
    reset();
    assert.equal((await aiRequest({ title: 'New', projectId: 'project' }, 'create_issue')).status, 403);
    grants = ['CREATE_TASK'];
    for (const [params, expected] of [[{ title: ' ' }, 400], [{ title: 'New', projectId: 'foreign' }, 404],
      [{ title: 'New', projectId: 'project', assigneeId: 'outsider' }, 400]]) {
      assert.equal((await aiRequest(params, 'create_issue')).status, expected);
    }
    assert.equal(writes, 0);
    assert.equal((await aiRequest({ title: 'New', projectId: 'project' }, 'create_issue')).status, 200);
    assert.equal(writes, 1);
  });
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

test('profile timeline and notification boundaries recheck current viewer access', async (t) => {
  let user = { id: 'alice', email: 'alice@example.test', name: 'Alice' };
  let protectedReads = 0, writes = [], deliveries = [];
  const spaces = structuredClone(workspaces);
  const author = { id: 'bob', name: 'Bob', hashedPassword: 'synthetic-secret' };
  const posts = [...spaces, null].map(workspace => ({ id: workspace?.id ?? 'unscoped', workspace,
    workspaceId: workspace?.id ?? null, authorId: 'bob', author, type: 'BLOCKER', resolvedAt: null,
    message: `Protected ${workspace?.id}`, html: '<p>Protected HTML</p>', createdAt: new Date(),
    _count: { comments: 1, reactions: 1 } }));
  const comments = posts.map(post => ({ id: `c-${post.id}`, postId: post.id, post, authorId: 'bob', message: `Protected comment ${post.id}` }));
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

test('app post handlers enforce live membership and preserve token and operation permissions', async t => {
  let reads, writes, token, spaces, posts, actor;
  const reset = () => {
    reads = 0; writes = []; actor = 'alice'; spaces = structuredClone(workspaces);
    posts = spaces.map(workspace => ({ id: workspace.id, workspaceId: workspace.id, workspace, authorId: 'alice',
      message: 'Protected post', html: '<p>Protected</p>', author: { id: 'alice', name: 'Alice', email: 'private@example.test' },
      comments: [], _count: { comments: 0, reactions: 0, bookmarks: 0 } }));
    token = { workspaceId: 'joined', isSystemApp: false, status: 'ACTIVE', scopes: ['posts:read', 'posts:write'], isRevoked: false };
  };
  reset();
  const project = (post, spec) => {
    if (!post) return null;
    if (spec.select) return { id: post.id };
    reads++;
    const fields = spec.include?.author?.select;
    return { ...post, author: fields ? Object.fromEntries(Object.entries(post.author).filter(([key]) => fields[key])) : post.author };
  };
  const db = {
    workspace: { findFirst: async ({ where }) => spaces.find(w => matches(w, where)) ?? null },
    workspaceMember: {
      findFirst: async ({ where }) => spaces.flatMap(w => w.members.map(m => ({ ...m, workspaceId: w.id }))).find(m => matches(m, where)),
      findUnique: async ({ where }) => spaces.find(w => w.id === where.userId_workspaceId.workspaceId)?.members.find(m => m.userId === actor) ?? null,
    },
    user: { findUnique: async () => ({ id: actor, name: 'Alice' }) },
    app: { findUnique: async () => ({ isSystemApp: token.isSystemApp }) },
    appToken: { findMany: async () => {
      if (token.isRevoked) return [];
      const workspace = spaces.find(w => w.id === token.workspaceId);
      const app = { id: 'app', name: 'App', slug: 'app', status: token.appStatus || 'PUBLISHED', isSystemApp: token.isSystemApp };
      return [{ accessToken: 'Y2lwaGVy', userId: actor, scopes: token.scopes, tokenExpiresAt: token.expiresAt,
        app, workspace, installation: token.isSystemApp ? null : { id: 'installation', workspace, workspaceId: workspace.id,
          app, appId: 'app', status: token.status, installedById: actor, scopes: [] } }];
    } },
    post: {
      findFirst: async spec => project(posts.find(p => matches(p, spec.where)), spec),
      findMany: async spec => posts.filter(p => matches(p, spec.where)).map(p => project(p, spec)),
      count: async spec => { reads++; return posts.filter(p => matches(p, spec.where)).length; },
      create: async spec => { writes.push('create'); return project({ ...posts[0], ...spec.data, id: 'created' }, spec); },
      update: async spec => { writes.push('update'); return project({ ...posts.find(p => p.id === spec.where.id), ...spec.data }, spec); },
      delete: async spec => { writes.push('delete'); posts = posts.filter(p => p.id !== spec.where.id); },
    },
    $queryRaw: async () => [], $transaction: async fn => fn(db),
  };
  const deps = { '@/lib/prisma': { prisma: db }, 'next/server': { NextResponse: Response }, zod: require('zod'),
    '@/lib/apps/crypto': { decryptToken: async () => 'valid-token' }, '@/lib/oauth-scopes': load('src/lib/oauth-scopes.ts') };
  const globals = { URL, Buffer, console, Error };
  deps['@/lib/apps/auth-middleware'] = load('src/lib/apps/auth-middleware.ts', deps, globals);
  const collection = load('src/app/api/apps/auth/posts/route.ts', deps, globals);
  const detail = load('src/app/api/apps/auth/posts/[postId]/route.ts', deps, globals);
  const call = (method, list, id = token.workspaceId, extra = {}) => (list ? collection : detail)[method](new Request('https://example.test/?' + (extra.query || ''), {
    method, headers: extra.anonymous ? {} : { Authorization: 'Bearer valid-token' },
    ...(['POST', 'PATCH'].includes(method) ? { body: JSON.stringify(extra.body || { message: 'Updated' }) } : {}),
  }), { params: Promise.resolve({ postId: id }) });
  for (const [method, list] of [['GET', true], ['POST', true], ['GET', false], ['PATCH', false], ['DELETE', false]]) {
    for (const state of ['anonymous', 'revoked', 'foreign', 'own', 'joined']) await t.test(`${list ? 'collection' : 'detail'} ${method}: ${state}`, async () => {
      reset(); token.workspaceId = state === 'anonymous' ? 'joined' : state;
      const response = await call(method, list, token.workspaceId, { anonymous: state === 'anonymous' });
      const body = await response.text();
      if (['own', 'joined'].includes(state)) {
        assert.ok([200, 201].includes(response.status), body); assert.doesNotMatch(body, /private@example/);
      } else {
        assert.equal(response.status, state === 'anonymous' ? 401 : 403, body);
        assert.equal(reads, 0); assert.equal(writes.length, 0); assert.doesNotMatch(body, /Protected|private@example/);
      }
    });
  }
  await t.test('token scope, expiry and installation checks still deny without resource access', async () => {
    for (const change of [{ scopes: ['posts:read'] }, { expiresAt: new Date(0) }, { isRevoked: true }, { status: 'SUSPENDED' }, { appStatus: 'DRAFT' }]) {
      reset(); Object.assign(token, change);
      assert.ok([401, 403].includes((await call('PATCH', false)).status)); assert.equal(reads, 0); assert.equal(writes.length, 0);
    }
  });
  await t.test('author, active admin and pin permissions remain operation specific', async () => {
    reset(); posts.find(p => p.id === 'joined').authorId = 'bob';
    assert.equal((await call('PATCH', false)).status, 403); assert.equal((await call('DELETE', false)).status, 403);
    assert.equal(writes.length, 0);
    spaces.find(w => w.id === 'joined').members[0].role = 'ADMIN';
    assert.equal((await call('PATCH', false, 'joined', { body: { isPinned: true } })).status, 200);
    assert.equal((await call('DELETE', false)).status, 200);
    reset(); assert.equal((await call('PATCH', false, 'joined', { body: { isPinned: true } })).status, 403);
    assert.equal(writes.length, 0);
  });
  await t.test('system workspace overrides enforce owner and active membership', async () => {
    for (const target of ['own', 'joined', 'revoked', 'foreign']) {
      reset(); token.isSystemApp = true;
      const response = await call('GET', false, target, { query: `workspaceId=${target}` });
      assert.equal(response.status, ['own', 'joined'].includes(target) ? 200 : 403);
      if (response.status === 403) assert.equal(reads, 0);
    }
    reset(); token.isSystemApp = true; token.workspaceId = 'revoked';
    assert.equal((await call('GET', false, 'own', { query: 'workspaceId=own' })).status, 403);
    assert.equal(reads, 0);
    reset(); assert.equal((await call('GET', false, 'foreign')).status, 404); assert.equal(reads, 0);
  });
});
