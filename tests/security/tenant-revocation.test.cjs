const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { runInNewContext } = require('node:vm');
const ts = require('typescript');

const issuer = 'https://identity.example.test/realms/company';
function load(file, dependencies = {}) {
  const exports = {};
  const source = readFileSync(resolve(process.env.SECURITY_TEST_ROOT || resolve(__dirname, '../..'), file), 'utf8');
  runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, {
    exports, URL, Headers, Buffer, TextDecoder, TextEncoder, ReadableStream, Response, Error,
    setTimeout, clearTimeout, setInterval, clearInterval, ...dependencies.__globals,
    console: { error() {}, log() {}, warn() {} },
    process: { env: { COLLAB_AUTH_MODE: 'gateway', COLLAB_GATEWAY_ISSUER: issuer, ...dependencies.__env } },
    require(name) {
      if (name in dependencies) return dependencies[name];
      if (name.startsWith('node:') || name === 'zod') return require(name);
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  return exports;
}

function matches(row, where = {}) {
  return Object.entries(where).every(([key, value]) => {
    const clauses = Array.isArray(value) ? value : [value];
    if (key === 'AND') return clauses.every(clause => matches(row, clause));
    if (key === 'OR') return clauses.some(clause => matches(row, clause));
    if (key === 'NOT') return clauses.every(clause => !matches(row, clause));
    if (value === undefined) return true;
    const actual = row?.[key];
    if (value === null || typeof value !== 'object') return actual === value;
    if ('every' in value) return actual?.every(item => matches(item, value.every)) ?? false;
    if ('some' in value) return actual?.some(item => matches(item, value.some)) ?? false;
    if ('notIn' in value) return !value.notIn.includes(actual);
    if ('startsWith' in value) return typeof actual === 'string' && actual.startsWith(value.startsWith);
    if ('in' in value) return value.in.includes(actual);
    if ('not' in value) return actual !== value.not;
    if ('equals' in value) return String(actual).toLowerCase() === value.equals.toLowerCase();
    if ('contains' in value) return String(actual).toLowerCase().includes(value.contains.toLowerCase());
    return matches(actual, value);
  });
}

function fixture() {
  const user = { id: 'alice', email: 'alice@weezboo.com', role: 'DEVELOPER', accounts: [{ id: 'mapping' }],
    createdAt: new Date(), updatedAt: new Date() };
  const workspaces = ['own', 'joined', 'revoked', 'foreign'].map((slug, index) => ({
    id: `c${String(index).padStart(24, '0')}`, slug, name: slug,
    ownerId: slug === 'own' ? user.id : 'bob',
    members: slug === 'own' ? [] : [{ userId: slug === 'foreign' ? 'bob' : user.id,
      user: slug === 'foreign' ? { id: 'bob', email: 'bob@weezboo.com' } : user,
      status: slug !== 'revoked', role: 'MEMBER' }],
  }));
  const projects = workspaces.map(workspace => ({ id: `project-${workspace.slug}`, slug: 'existing',
    workspaceId: workspace.id, workspace, name: 'Existing', statuses: [], _count: { issues: 1 } }));
  const issues = projects.map(project => ({ id: `issue-${project.workspace.slug}`, title: 'needle',
    issueKey: `${project.workspace.slug}-1`, workspaceId: project.workspaceId, projectId: project.id,
    project, statusId: null, projectStatus: null, workspace: project.workspace, sourceRelations: [], targetRelations: [] }));
  const calls = { issueReads: 0, projectReads: 0, otherReads: 0, writes: 0, decrypts: 0, providerCalls: 0 };
  const state = { user, mapped: true, claims: true };
  const projectWrites = [], viewWrites = [];
  function workspaceResult({ where, include, select }) {
    const row = workspaces.find(row => matches(row, where));
    if (!row) return null;
    if (select) return Object.fromEntries(Object.keys(select).map(key => [key, row[key]]));
    return { ...row, members: row.members.filter(member => matches(member, include?.members?.where)) };
  }
  const db = {
    account: { findUnique: async () => state.mapped && state.user ? { user: state.user } : null },
    user: { findUnique: async ({ where }) => state.user && matches(state.user, where) ? state.user : null },
    workspace: {
      findFirst: async args => workspaceResult(args),
      findUnique: async args => workspaceResult(args),
      findMany: async ({ where }) => workspaces.filter(row => matches(row, where)),
    },
    workspaceMember: { findFirst: async ({ where }) => workspaces.flatMap(workspace => workspace.members.map(
      member => ({ ...member, workspaceId: workspace.id }))).find(row => matches(row, where)) ?? null },
    issue: {
      findMany: async ({ where }) => { calls.issueReads++; return issues.filter(row => matches(row, where)); },
    },
    project: {
      findFirst: async ({ where }) => { calls.projectReads++; return projects.find(row => matches(row, where)) ?? null; },
      findMany: async ({ where }) => { calls.projectReads++; return projects.filter(row => matches(row, where)); },
      create: async ({ data }) => {
        calls.writes++; projectWrites.push(data);
        return { ...data, id: 'created', _count: { issues: 0 } };
      },
    },
    projectStatus: { createMany: async () => { calls.writes++; } },
    statusTemplate: { findMany: async () => { calls.otherReads++; return []; } },
    view: {
      findFirst: async () => { calls.otherReads++; return null; },
      create: async ({ data }) => { calls.writes++; viewWrites.push(data); return data; },
    },
    post: {
      findMany: async () => { calls.otherReads++; return []; },
      count: async () => { calls.otherReads++; return 0; },
    },
    repository: {
      findFirst: async ({ where }) => projects.map(project => ({ id: 'repo', project, accessToken: 'encrypted' }))
        .find(row => matches(row, where)) ?? null,
    },
    $transaction: async callback => { calls.writes++; return callback(db); },
  };
  const headers = new Headers({
    'x-collab-issuer': Buffer.from(issuer).toString('base64url'),
    'x-collab-subject': Buffer.from('subject-alice').toString('base64url'),
    'x-collab-email': Buffer.from(user.email).toString('base64url'),
    'x-collab-email-verified': 'true',
  });
  const dependencies = {
    'server-only': {}, 'next/server': { NextResponse: Response },
    '@/lib/prisma': { prisma: db }, '@/lib/user-utils': load('src/lib/user-utils.ts'), '@/lib/auth-options': { authOptions: {} },
    '@/lib/github/public-repository': load('src/lib/github/public-repository.ts'),
    '@/lib/feature-access': load('src/lib/feature-access.ts'),
    '@/lib/utils': { generateUniqueViewSlug: async (_name, workspaceId, check) => {
      await check('default-view', workspaceId); return 'default-view';
    } },
    '@/lib/board-item-activity-service': {}, '@/lib/redis': {}, '@/utils/mentions': {},
    '@/lib/notification-service': {}, '@/lib/event-bus': {}, '@/utils/issueRelations': { buildIssueRelations: () => ({}) },
    '@/constants/project-statuses': {}, '@/lib/permissions': {}, '@/lib/leave-service': {},
    '@/lib/secrets/access': {}, '@/utils/teamSyncAnalyzer': {},
    '@/lib/encryption': { EncryptionService: { decrypt: () => { calls.decrypts++; return 'token'; } } },
    'next/headers': { headers: async () => state.claims ? headers : new Headers(), cookies: async () => ({ get() {} }) },
    'next-auth': { getServerSession: async () => state.user && state.mapped && state.claims ? { user: state.user } : null },
    '@/lib/url-utils': { isUUID: value => /^[0-9a-f-]{36}$/.test(value) },
    '@/lib/shared-issue-key-utils': load('src/lib/shared-issue-key-utils.ts'),
  };
  dependencies['@/lib/auth'] = { authConfig: {}, authOptions: {}, getAuthSession: dependencies['next-auth'].getServerSession };
  dependencies['@/lib/slug-resolvers'] = load('src/lib/slug-resolvers.ts', dependencies);
  dependencies['@/lib/issue-finder'] = load('src/lib/issue-finder.ts', dependencies);
  dependencies['@prisma/client'] = require('@prisma/client');
  dependencies['@/lib/secrets/access'] = load('src/lib/secrets/access.ts', dependencies);
  dependencies['@/lib/view-helpers'] = load('src/lib/view-helpers.ts', dependencies);
  dependencies['@/lib/issue-references'] = load('src/lib/issue-references.ts', dependencies);
  dependencies['@/lib/session'] = load('src/lib/session.ts', dependencies);
  dependencies['@/lib/github/repository-access'] = load('src/lib/github/repository-access.ts', dependencies);
  dependencies.semver = { default: require('semver') };
  dependencies['@/lib/github/sync-releases'] = load('src/lib/github/sync-releases.ts', dependencies);
  dependencies['@/lib/github/version-recovery'] = load('src/lib/github/version-recovery.ts', dependencies);
  dependencies['@/lib/post-access'] = load('src/lib/post-access.ts', dependencies);
  dependencies['@/lib/feature-access'] = load('src/lib/feature-access.ts', dependencies);
  dependencies['@/lib/notification-access'] = load('src/lib/notification-access.ts', dependencies);
  const route = file => load(`src/app/api/${file}/route.ts`, dependencies);
  const request = (method = 'GET', workspace, body = {}) => new Request(
    `https://collab.example.test/api/test?workspace=${workspace || ''}&workspaceId=${workspace || ''}`, {
      method, ...(method === 'GET' ? {} : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
    });
  const context = workspaceId => ({ params: Promise.resolve({ workspaceId, projectSlug: 'existing',
    statusId: 'status', viewId: 'view', issueKey: 'issue', relationId: 'relation', repositoryId: 'repo' }) });
  return { workspaces, state, calls, dependencies, route, request, context, projectWrites, viewWrites, db };
}

const noContent = f => assert.deepEqual(f.calls, {
  issueReads: 0, projectReads: 0, otherReads: 0, writes: 0, decrypts: 0, providerCalls: 0,
});

test('issue search denies revoked membership by ID and slug before content reads', async () => {
  const f = fixture(), { GET } = f.route('issues/search');
  for (const workspace of f.workspaces.filter(row => ['revoked', 'foreign'].includes(row.slug))) {
    for (const key of [workspace.id, workspace.slug]) {
      for (const query of ['', 'needle']) {
        const result = await GET(new Request(`https://collab.example.test/api/issues/search?workspace=${key}&q=${query}`));
        assert.equal(result.status, 403);
        noContent(f);
      }
    }
  }
  for (const workspace of f.workspaces.filter(row => ['own', 'joined'].includes(row.slug))) {
    assert.equal((await GET(f.request('GET', workspace.id))).status, 200);
  }
  const all = await GET(new Request('https://collab.example.test/api/issues/search?q=needle'));
  assert.deepEqual((await all.json()).map(row => row.id).sort(), ['issue-joined', 'issue-own']);
  f.workspaces.find(row => row.slug === 'joined').members[0].status = false;
  const reads = f.calls.issueReads;
  assert.equal((await GET(f.request('GET', 'joined'))).status, 403);
  assert.equal(f.calls.issueReads, reads);
  assert.equal((await GET(f.request('GET', 'own'))).status, 200);
  f.workspaces.find(row => row.slug === 'own').ownerId = 'bob';
  const lastReads = f.calls.issueReads;
  assert.deepEqual(await (await GET(new Request('https://collab.example.test/api/issues/search'))).json(), []);
  assert.equal(f.calls.issueReads, lastReads);
});

test('project creation denies revoked membership without content reads or writes and retains owner access', async () => {
  const f = fixture(), { POST, GET } = f.route('workspaces/[workspaceId]/projects');
  const create = key => POST(f.request('POST', key, { name: 'New project', issuePrefix: 'NEW' }), f.context(key));
  for (const workspace of f.workspaces.filter(row => ['revoked', 'foreign'].includes(row.slug))) {
    for (const key of [workspace.id, workspace.slug]) {
      assert.equal((await create(key)).status, 404);
      assert.equal((await GET(f.request('GET', key), f.context(key))).status, 404);
      noContent(f);
    }
  }
  for (const key of ['own', 'joined']) assert.equal((await create(key)).status, 201);
  assert.deepEqual(f.projectWrites.map(row => row.workspaceId), f.workspaces.slice(0, 2).map(row => row.id));
  assert.ok(f.viewWrites.every(row => row.ownerId === 'alice'));
  f.workspaces[0].members.push({ userId: 'alice', status: false });
  f.workspaces[1].members[0].status = false;
  const before = { ...f.calls };
  assert.equal((await create('joined')).status, 404);
  assert.deepEqual(f.calls, before);
  assert.equal((await create('own')).status, 201);
});

test('missing session is rejected before tenant reads or writes', async () => {
  const f = fixture(), search = f.route('issues/search'), projects = f.route('workspaces/[workspaceId]/projects');
  const user = f.state.user;
  assert.equal((await f.dependencies['next-auth'].getServerSession({})).user.id, 'alice');
  for (const invalidate of [() => { f.state.user = null; }]) {
    Object.assign(f.state, { user, mapped: true, claims: true });
    invalidate();
    assert.equal((await search.GET(f.request('GET', 'joined'))).status, 401);
    assert.equal((await projects.POST(f.request('POST', 'joined', { name: 'New' }), f.context('joined'))).status, 401);
    noContent(f);
  }
});

for (const [path, method, body, status] of [
  ['issues', 'GET', {}, 403], ['issues', 'POST', { title: 'New', projectId: 'project-revoked' }, 403],
  ['workspaces/[workspaceId]/projects/[projectSlug]', 'GET', {}, 404],
  ['workspaces/[workspaceId]/projects/[projectSlug]', 'PATCH', { name: 'Changed' }, 404],
  ['workspaces/[workspaceId]/projects/[projectSlug]/statuses/[statusId]', 'DELETE', {}, 404],
  ['workspaces/[workspaceId]/projects/[projectSlug]/statuses/[statusId]/issues-count', 'GET', {}, 404],
  ['workspaces/[workspaceId]/action-filter-issues', 'POST', { actionFilters: [] }, 404],
  ['workspaces/[workspaceId]/views', 'POST', { name: 'New view' }, 404],
  ['workspaces/[workspaceId]/views/[viewId]/favorite', 'POST', {}, 404],
  ['workspaces/[workspaceId]/issues/[issueKey]/relations', 'GET', {}, 404],
  ['workspaces/[workspaceId]/issues/[issueKey]/relations/[relationId]', 'DELETE', {}, 404],
  ['leave/balances', 'GET', {}, 403], ['leave/policies', 'GET', {}, 403],
  ['leave/requests', 'GET', {}, 403], ['timeline/unified', 'GET', {}, 403],
  ['ai/dashboard', 'GET', {}, 403],
]) {
  test(`revoked tenant stops ${method} ${path} before content access`, async () => {
    const f = fixture(), id = f.workspaces[2].id;
    const response = await f.route(path)[method](f.request(method, id, { ...body, workspaceId: id }), f.context(id));
    assert.equal(response.status, status);
    noContent(f);
  });
}

test('post search and statistics deny explicit revoked tenants and retain unrelated tenants', async () => {
  const f = fixture();
  const { getPosts } = load('src/actions/post.ts', f.dependencies);
  const { getPostStats } = load('src/actions/postStats.ts', f.dependencies);
  for (const key of [f.workspaces[2].id, 'revoked']) {
    const result = await getPosts({ workspaceId: key, authorId: 'alice', includeProfileData: true });
    assert.equal(result.posts.length, 0);
    assert.equal(result.user, undefined);
    await assert.rejects(getPostStats({ workspaceId: key }), /Access denied/);
    noContent(f);
  }
  assert.equal((await getPosts({ workspaceId: 'own' })).posts.length, 0);
  assert.equal((await getPostStats({ workspaceId: f.workspaces[1].id })).total, 0);
});

test('repository sync denies revoked membership before credentials, provider calls or writes', async () => {
  const f = fixture();
  f.db.repository.findFirst = async ({ where }) => {
    const repository = { id: 'repo', project: { workspace: f.workspaces[2] }, accessToken: 'encrypted' };
    return matches(repository, where) ? repository : null;
  };
  const response = await f.route('github/repositories/[repositoryId]/sync').POST(f.request('POST'), f.context('revoked'));
  assert.equal(response.status, 404);
  noContent(f);
});

function postFixture() {
  const f = fixture();
  const posts = f.workspaces.map(workspace => ({ id: `post-${workspace.slug}`, workspaceId: workspace.id,
    authorId: 'alice', isPinned: false }));
  const comments = posts.map(post => ({ id: `comment-${post.id.slice(5)}`, postId: post.id, authorId: 'alice',
    message: 'Private comment', parentId: null, reactions: [] }));
  const reactions = [];
  const project = (row, select) => row && (select
    ? Object.fromEntries(Object.keys(select).map(key => [key, row[key]])) : row);
  f.db.post.findUnique = async ({ where, select }) => {
    if (!select) f.calls.otherReads++;
    return project(posts.find(row => matches(row, where)), select) ?? null;
  };
  const findComment = async ({ where, select }) => {
    if (!select) f.calls.otherReads++;
    return project(comments.find(row => matches(row, where)), select) ?? null;
  };
  f.db.comment = {
    findUnique: findComment, findFirst: findComment,
    findMany: async ({ where }) => { f.calls.otherReads++; return comments.filter(row => matches(row, where)); },
    create: async ({ data }) => { f.calls.writes++; return { ...data, id: 'new-comment' }; },
    update: async ({ where, data }) => { f.calls.writes++; return { ...comments.find(row => matches(row, where)), ...data }; },
    delete: async () => { f.calls.writes++; },
  };
  f.db.reaction = {
    findFirst: async ({ where }) => { f.calls.otherReads++; return reactions.find(row => matches(row, where)) ?? null; },
    findMany: async ({ where }) => { f.calls.otherReads++; return reactions.filter(row => matches(row, where)); },
    create: async ({ data }) => { f.calls.writes++; return { ...data, id: 'new-reaction' }; },
    delete: async () => { f.calls.writes++; },
    deleteMany: async () => { f.calls.writes++; },
  };
  f.db.post.update = async ({ where, data }) => { f.calls.writes++; return { ...posts.find(row => matches(row, where)), ...data }; };
  f.db.postAction = { create: async () => { f.calls.writes++; } };
  f.dependencies['@/utils/mentions'] = { extractMentionUserIds: () => [] };
  f.dependencies['@/lib/html-sanitizer'] = { sanitizeHtmlToPlainText: value => value };
  f.dependencies['@/lib/notification-service'] = {
    NotificationType: {},
    NotificationService: new Proxy({}, { get: () => async () => { f.calls.providerCalls++; return false; } }),
  };
  f.dependencies['@/lib/permissions'] = { Permission: {}, checkUserPermission: async () => ({ hasPermission: false }) };
  f.reset = () => Object.keys(f.calls).forEach(key => { f.calls[key] = 0; });
  return { ...f, comments, reactions };
}

for (const [file, action, args] of [
  ['comment', 'createComment', key => [{ postId: `post-${key}`, message: 'Hello' }]],
  ['comment', 'updateComment', key => [`comment-${key}`, { message: 'Changed' }]],
  ['comment', 'deleteComment', key => [`comment-${key}`]],
  ['reaction', 'getPostReactions', key => [`post-${key}`]],
  ['reaction', 'getCommentReactions', key => [`comment-${key}`]],
  ['reaction', 'addReaction', key => [{ postId: `post-${key}`, type: 'LIKE' }]],
  ['reaction', 'addReaction', key => [{ commentId: `comment-${key}`, type: 'LIKE' }]],
  ['reaction', 'removeReaction', key => [{ postId: `post-${key}`, type: 'LIKE' }]],
  ['reaction', 'removeReaction', key => [{ commentId: `comment-${key}`, type: 'LIKE' }]],
]) {
  test(`loaded post revocation blocks action ${action} ${JSON.stringify(args('joined'))}`, async () => {
    const f = postFixture(), comments = load('src/actions/comment.ts', f.dependencies);
    const actionFn = load(`src/actions/${file}.ts`, f.dependencies)[action];
    if (action === 'removeReaction') {
      for (const key of ['joined', 'own']) f.reactions.push({ id: `reaction-${key}`, authorId: 'alice', ...args(key)[0] });
    }
    await comments.getComments('post-joined');
    f.workspaces[1].members[0].status = false;
    f.reset();
    await assert.rejects(actionFn(...args('joined')), /Post not found/);
    noContent(f);
    await actionFn(...args('own'));
    f.workspaces[1].members[0].status = true;
    await actionFn(...args('joined'));
  });
}

for (const [path, method, body] of [
  ['comments', 'POST', { message: 'Hello' }],
  ['comments/[commentId]', 'PATCH', { message: 'Changed' }],
  ['comments/[commentId]', 'DELETE', {}],
  ['comments/[commentId]/like', 'POST', {}],
  ['comments/[commentId]/like', 'GET', {}],
  ['reactions', 'POST', { type: 'LIKE' }],
  ['reactions', 'GET', {}],
  ['follow', 'GET', {}], ['follow', 'POST', {}], ['follow', 'DELETE', {}],
  ['pin', 'PUT', { isPinned: true }],
]) {
  test(`loaded post revocation blocks HTTP ${method} ${path}`, async () => {
    const f = postFixture();
    await load('src/actions/comment.ts', f.dependencies).getComments('post-joined');
    f.workspaces[1].members[0].status = false;
    f.reset();
    const handler = f.route(`posts/[postId]/${path}`)[method];
    const call = key => handler(f.request(method, undefined, body), {
      params: Promise.resolve({ postId: `post-${key}`, commentId: `comment-${key}` }),
    });
    assert.equal((await call('joined')).status, 404);
    noContent(f);
    assert.equal((await call('own')).status, 200);
    f.workspaces[1].members[0].status = true;
    assert.equal((await call('joined')).status, 200);
  });
}

test('post comments and reactions reject cross-post and ambiguous targets without writes', async () => {
  const f = postFixture(), comments = load('src/actions/comment.ts', f.dependencies);
  await assert.rejects(comments.createComment({ postId: 'post-own', parentId: 'comment-revoked', message: 'Hello' }), /Parent comment not found/);
  for (const action of ['addReaction', 'removeReaction']) {
    await assert.rejects(load('src/actions/reaction.ts', f.dependencies)[action]({
      postId: 'post-own', commentId: 'comment-revoked', type: 'LIKE',
    }), /Exactly one/);
  }
  const likes = f.route('posts/[postId]/comments/[commentId]/like');
  assert.equal((await likes.GET(f.request(), { params: Promise.resolve({
    postId: 'post-own', commentId: 'comment-revoked',
  }) })).status, 404);
  assert.equal(f.calls.writes, 0);
  assert.equal(f.calls.providerCalls, 0);
});

test('project status action excludes revoked tenants while retaining owner and unrelated membership', async () => {
  const f = fixture(), rows = f.workspaces.map(workspace => ({ id: `status-${workspace.slug}`, projectId: `project-${workspace.slug}` }));
  f.db.projectStatus.findMany = async ({ where }) => {
    f.calls.otherReads++;
    return rows.filter(row => matches(row, where));
  };
  const { getProjectStatuses } = load('src/actions/status.ts', f.dependencies);
  assert.equal((await getProjectStatuses(['project-joined'])).length, 1);
  f.workspaces[1].members[0].status = false;
  const before = f.calls.otherReads;
  assert.equal((await getProjectStatuses(['project-joined'])).length, 0);
  assert.equal(f.calls.otherReads, before);
  const result = await getProjectStatuses(['project-own', 'project-revoked', 'project-foreign']);
  assert.deepEqual(Array.from(result, row => row.id), ['status-own']);
  f.workspaces[1].members[0].status = true;
  assert.equal((await getProjectStatuses(['project-joined'])).length, 1);
});

function leaveFixture() {
  const f = fixture();
  const rows = f.workspaces.map(workspace => ({ id: `leave-${workspace.slug}`, userId: 'alice',
    user: f.state.user, policyId: 'policy', status: 'PENDING', notes: 'Leave', duration: 'FULL_DAY',
    startDate: new Date('2100-01-01'), endDate: new Date('2100-01-02'), updatedAt: new Date(),
    policy: { id: 'policy', name: 'Policy', workspaceId: workspace.id, workspace, trackIn: 'DAYS' } }));
  f.db.leaveRequest = {
    findUnique: async ({ where }) => rows.find(row => matches(row, where)) ?? null,
    update: async ({ where, data }) => { f.calls.writes++; return { ...rows.find(row => matches(row, where)), ...data }; },
  };
  f.db.$transaction = callback => callback(f.db);
  f.dependencies['date-fns'] = { differenceInDays: () => 1 };
  f.dependencies['@/lib/permissions'] = { Permission: {}, checkUserPermission: async () => ({ hasPermission: true }) };
  f.dependencies['@/lib/notification-service'] = {
    NotificationService: new Proxy({}, { get: () => async () => { f.calls.providerCalls++; } }),
  };
  f.dependencies['@/lib/event-bus'] = new Proxy({}, { get: () => async () => { f.calls.providerCalls++; } });
  f.dependencies['@/lib/leave-service'] = load('src/lib/leave-service.ts', f.dependencies);
  return f;
}

for (const method of ['PUT', 'DELETE']) {
  test(`leave ${method} rejects revocation with zero writes or notifications`, async () => {
    const f = leaveFixture(), handler = f.route('leave/requests/[requestId]')[method];
    const call = key => handler(f.request(method, undefined, { notes: 'Updated notes' }), { params: Promise.resolve({ requestId: `leave-${key}` }) });
    f.workspaces[1].members[0].status = false;
    assert.equal((await call('joined')).status, 404);
    noContent(f);
    assert.equal((await call('own')).status, 200);
    f.workspaces[1].members[0].status = true;
    assert.equal((await call('joined')).status, 200);
  });
}

test('leave service binds the actor and denies revoked membership before updates', async () => {
  const f = leaveFixture(), { processLeaveRequestAction } = f.dependencies['@/lib/leave-service'];
  await assert.rejects(processLeaveRequestAction({ requestId: 'leave-joined', action: 'REJECTED', actionById: 'bob' }), /Unauthorized/);
  f.workspaces[1].members[0].status = false;
  await assert.rejects(processLeaveRequestAction({ requestId: 'leave-joined', action: 'REJECTED', actionById: 'alice' }), /Leave request not found/);
  noContent(f);
  assert.equal((await processLeaveRequestAction({ requestId: 'leave-own', action: 'REJECTED', actionById: 'alice' })).status, 'REJECTED');
});

function indirectFixture() {
  const f = postFixture();
  const rows = f.workspaces.map(workspace => ({ id: `repo-${workspace.slug}`, aiReviewEnabled: true,
    aiReviewAutoTrigger: true, accessToken: 'encrypted', owner: 'example', name: 'repo',
    project: { workspace }, _count: { commits: 0 }, defaultBranch: 'main' }));
  const project = (row, select) => row && (select
    ? Object.fromEntries(Object.keys(select).map(key => [key, row[key]])) : row);
  const repositoryFind = async ({ where, select }) => {
    const row = rows.find(row => matches(row, where));
    if (row && !select) f.calls.otherReads++;
    return project(row, select) ?? null;
  };
  f.db.repository = { findFirst: repositoryFind, findUnique: repositoryFind,
    update: async ({ where, data }) => { f.calls.writes++; return { ...rows.find(row => matches(row, where)), ...data }; } };
  const emptyModel = () => ({
    findMany: async () => { f.calls.otherReads++; return []; },
    findFirst: async () => { f.calls.otherReads++; return null; },
    count: async () => { f.calls.otherReads++; return 0; },
    groupBy: async () => { f.calls.otherReads++; return []; },
    create: async ({ data }) => { f.calls.writes++; return { id: 'new', ...data }; },
    update: async ({ data }) => { f.calls.writes++; return { id: 'new', ...data }; },
    upsert: async ({ create }) => { f.calls.writes++; return create; },
  });
  for (const name of ['commit', 'release', 'version', 'deployment', 'branch', 'pRReview', 'aIMessage',
    'projectFollower', 'viewFollower', 'viewIssuePosition', 'taskLabel']) f.db[name] = emptyModel();
  f.db.issue.groupBy = async () => { f.calls.issueReads++; return []; };
  f.db.pullRequest = { ...emptyModel(), findFirst: async () => { f.calls.otherReads++; return { id: 'pr' }; } };
  f.db.aIPRReview = { ...emptyModel(), findUnique: async () => { f.calls.otherReads++; return { id: 'review' }; } };
  const conversations = f.workspaces.map(workspace => ({ id: `convo-${workspace.slug}`, workspaceId: workspace.id,
    workspace, userId: 'alice', isArchived: false, messages: [], agent: null, _count: { messages: 0 } }));
  f.db.aIConversation = { ...emptyModel(),
    findFirst: async ({ where, select }) => {
      const row = conversations.find(row => matches(row, where));
      if (row && !select) f.calls.otherReads++;
      return project(row, select) ?? null;
    },
  };
  f.db.post.findMany = async ({ where }) => { f.calls.otherReads++; return f.workspaces
    .map(workspace => ({ id: `post-${workspace.slug}`, workspaceId: workspace.id }))
    .filter(row => matches(row, where)); };
  f.db.post.create = async ({ data }) => { f.calls.writes++; return { id: 'new-post', ...data }; };
  f.db.post.delete = async () => { f.calls.writes++; };
  const subscription = { subscribe: async () => { f.calls.providerCalls++; }, unsubscribe: async () => {}, quit: async () => {} };
  f.dependencies['@/lib/redis'] = { getRedisSubscriber: async () => { f.calls.providerCalls++; return subscription; },
    publishEvent: async () => { f.calls.providerCalls++; } };
  f.dependencies['@/lib/github/repository-access'] = load('src/lib/github/repository-access.ts', f.dependencies);
  f.dependencies['@/lib/github/ai-pr-review-service'] = { aiPRReviewService: { performReview: async () => {
    f.calls.providerCalls++; f.calls.writes++; return { success: true, reviewId: 'review' };
  } } };
  f.dependencies['@prisma/client'] = { AIPRReviewTrigger: { MANUAL: 'MANUAL' }, PRState: { OPEN: 'OPEN' } };
  f.dependencies['@/actions/post'] = {};
  f.dependencies['@/lib/ai/agents/registry'] = { getDefaultAgent: async () => {
    f.calls.otherReads++; return { slug: 'cleo', name: 'Cleo', systemPrompt: 'Hello' };
  } };
  f.dependencies['@/lib/ai/mcp-token'] = { getMcpToken: async () => { f.calls.providerCalls++; return 'synthetic-token'; } };
  f.dependencies['@/lib/ai/mcp-client'] = { createMcpSession: async () => {
    f.calls.providerCalls++; return { convertToolsToClaudeFormat: () => [], close: async () => {} };
  } };
  for (const name of ['@/lib/coclaw/instance-manager', '@/lib/coclaw/key-resolver', '@/lib/secrets/crypto', '@/lib/coclaw/notifications']) {
    f.dependencies[name] = {};
  }
  f.dependencies['@/lib/rate-limit'] = { withRateLimit: handler => handler };
  f.dependencies['@/constants/viewPositions'] = { VIEW_POSITIONS_MAX_BULK_SIZE: 100 };
  f.dependencies.__env = { ANTHROPIC_API_KEY: 'synthetic-test-key', OPENAI_API_KEY: 'synthetic-test-key' };
  f.dependencies['openai'] = { default: class {
    chat = { completions: { create: async () => { f.calls.providerCalls++; return { choices: [{ message: { content: 'Summary' } }] }; } } };
  } };
  f.dependencies['@anthropic-ai/sdk'] = { default: class {
    messages = { create: async () => { f.calls.providerCalls++; return { content: [{ type: 'text', text: 'Summary' }] }; } };
  } };
  f.dependencies.__globals = { fetch: async url => {
    f.calls.providerCalls++;
    if (url.includes('anthropic')) return new Response('data: {"type":"message_stop"}\n\n');
    return Response.json([]);
  } };
  return f;
}

for (const method of ['GET', 'POST']) {
  test(`indirect posts ${method} denies revoked workspace before reads or writes`, async () => {
    const f = indirectFixture(), handler = f.route('posts')[method];
    const call = workspace => handler(f.request(method, workspace.id, {
      workspaceId: workspace.id, message: 'Hello', type: 'UPDATE', priority: 'normal', tags: [],
    }));
    assert.equal((await call(f.workspaces[2])).status, 403); noContent(f);
    for (const workspace of f.workspaces.slice(0, 2)) assert.equal((await call(workspace)).status, 200);
    if (method === 'GET') {
      const all = await handler(f.request());
      assert.deepEqual((await all.json()).map(row => row.id), ['post-own', 'post-joined']);
    }
  });
}
for (const method of ['PATCH', 'DELETE']) {
  test(`indirect post ${method} denies revoked authors with zero effects`, async () => {
    const f = indirectFixture(), handler = f.route('posts/[postId]')[method];
    const call = key => handler(f.request(method, undefined, { message: 'Hi', type: 'UPDATE', priority: 'normal', tags: [] }),
      { params: Promise.resolve({ postId: `post-${key}` }) });
    assert.equal((await call('revoked')).status, 404); noContent(f);
    for (const key of ['own', 'joined']) assert.equal((await call(key)).status, method === 'DELETE' ? 204 : 200);
  });
}

test('workspace realtime stream denies revoked subscriptions and permits owner and active member', async () => {
  const f = indirectFixture(), { GET } = f.route('realtime/workspace/[workspaceId]/stream');
  const call = workspace => GET(f.request(), { params: Promise.resolve({ workspaceId: workspace.id }) });
  const denied = await call(f.workspaces[2]);
  await denied.body?.cancel();
  assert.equal(denied.status, 403); noContent(f);
  for (const workspace of f.workspaces.slice(0, 2)) {
    const response = await call(workspace);
    assert.equal(response.status, 200);
    const reader = response.body.getReader();
    assert.match(new TextDecoder().decode((await reader.read()).value), /connected/);
    await reader.cancel();
  }
  assert.ok(f.calls.providerCalls > 0);
});

test('AI chat denies revoked tenants and cross-tenant conversations before providers or writes', async () => {
  const f = indirectFixture(), { POST } = f.route('ai/chat/stream');
  const call = (workspace, conversationId) => POST(f.request('POST', undefined, {
    message: 'Hello', context: { workspace: { id: workspace.id } }, conversationId,
  }));
  assert.equal((await call(f.workspaces[2])).status, 403); noContent(f);
  assert.equal((await call(f.workspaces[0], 'convo-revoked')).status, 404); noContent(f);
  for (const workspace of f.workspaces.slice(0, 2)) {
    const response = await call(workspace, `convo-${workspace.slug}`);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /"type":"agent"/);
  }
  assert.ok(f.calls.providerCalls > 0);
  assert.ok(f.calls.writes > 0);
});

for (const [path, method, expected] of [
  ['pull-requests/[prId]/ai-review', 'GET', 200], ['pull-requests/[prId]/ai-review', 'POST', 200],
  ['ai-review-settings', 'GET', 200], ['ai-review-settings', 'PATCH', 200],
  ...['pull-requests', 'commits', 'dashboard', 'releases', 'deployments', 'contributors', 'activity', 'versions', 'github-branches'].map(path => [path, 'GET', 200]),
  ['github-branches', 'POST', 200], ['sync-releases', 'POST', 200],
]) {
  test(`repository boundary ${method} ${path} denies revoked tenants with zero side effects`, async () => {
    const f = indirectFixture(), handler = f.route(`github/repositories/[repositoryId]/${path}`)[method];
    const call = key => handler(f.request(method, undefined, { aiReviewEnabled: true }),
      { params: Promise.resolve({ repositoryId: `repo-${key}`, prId: 'pr' }) });
    assert.equal((await call('revoked')).status, 404); noContent(f);
    for (const key of ['own', 'joined']) assert.equal((await call(key)).status, expected);
  });
}

test('repository changelog refuses revoked access before data and provider work', async () => {
  const f = indirectFixture(), { POST } = f.route('github/repositories/[repositoryId]/generate-changelog');
  assert.equal((await POST(f.request('POST'), { params: Promise.resolve({ repositoryId: 'repo-revoked' }) })).status, 404);
  noContent(f);
});

for (const [path, method, denied] of [
  ['ai/conversations', 'GET', 404], ['ai/conversations', 'POST', 404],
  ['ai/conversations/[id]', 'GET', 404], ['ai/conversations/[id]', 'DELETE', 404],
  ['ai/action', 'POST', 403], ['ai/summarize', 'POST', 403],
  ['workspaces/[workspaceId]/labels', 'GET', 404],
  ['users/[userId]/assigned-issues', 'GET', 403],
]) {
  test(`indirect tenant boundary ${method} ${path} preserves owner and active access`, async () => {
    const f = indirectFixture(), handler = f.route(path)[method];
    const call = workspace => handler(f.request(method, workspace.id, { workspaceId: workspace.id,
      context: { workspace: { id: workspace.id } }, action: { type: 'search', params: {} }, type: 'general' }),
    { params: Promise.resolve({ workspaceId: workspace.id, userId: 'alice', id: `convo-${workspace.slug}` }) });
    assert.equal((await call(f.workspaces[2])).status, denied); noContent(f);
    for (const workspace of f.workspaces.slice(0, 2)) assert.equal((await call(workspace)).status, 200);
  });
}

for (const [path, method] of [['views/[viewId]/follow', 'GET'], ['views/[viewId]/follow', 'POST'],
  ['views/[viewId]/follow', 'DELETE'], ['views/[viewId]/issue-positions', 'GET'],
  ['views/[viewId]/issue-positions', 'PUT']]) {
  test(`view resource boundary ${method} ${path} denies revoked view owners`, async () => {
    const f = indirectFixture();
    const views = f.workspaces.map(workspace => ({ id: `view-${workspace.slug}`, ownerId: 'alice',
      workspaceId: workspace.id, workspace, visibility: 'WORKSPACE', sharedWith: ['alice'] }));
    f.db.view.findFirst = async ({ where }) => views.find(row => matches(row, where)) ?? null;
    f.db.viewFollower.findUnique = async () => { f.calls.otherReads++; return null; };
    f.db.viewFollower.deleteMany = async () => { f.calls.writes++; };
    f.db.issue.findFirst = async ({ where }) => {
      const issue = f.workspaces.map(workspace => ({ id: `issue-${workspace.slug}`, workspaceId: workspace.id, workspace, project: { workspace }, statusId: null }))
        .find(row => matches(row, where));
      if (issue) f.calls.issueReads++;
      return issue ?? null;
    };
    const handler = f.route(path)[method];
    const call = key => handler(f.request(method, undefined, { issueId: `issue-${key}`, columnId: 'column', position: 1 }),
      { params: Promise.resolve({ viewId: `view-${key}` }) });
    assert.equal((await call('revoked')).status, 404); noContent(f);
    for (const key of ['own', 'joined']) assert.equal((await call(key)).status, 200);
  });
}

test('user profile scopes posts and stats to authorized tenants', async () => {
  const f = indirectFixture(), originalFind = f.db.user.findUnique;
  f.db.user.findUnique = async args => args.where.id === 'bob' ? { id: 'bob' } : originalFind(args);
  f.db.workspaceMember.findUnique = async () => null;
  const posts = f.workspaces.map(workspace => ({ id: `post-${workspace.slug}`, authorId: 'bob', workspaceId: workspace.id, workspace }));
  f.db.post.findMany = async ({ where }) => { f.calls.otherReads++; return posts.filter(row => matches(row, where)); };
  f.db.comment.count = async ({ where }) => posts.filter(post => matches({ authorId: 'bob', post }, where)).length;
  f.db.reaction.count = async ({ where }) => posts.filter(post => matches({ post }, where)).length;
  f.db.conversation = { findFirst: async () => null };
  const { getUserProfile } = load('src/actions/user.ts', f.dependencies);
  await assert.rejects(getUserProfile('bob', f.workspaces[2].id), /Workspace not found/); noContent(f);
  for (const workspace of f.workspaces.slice(0, 2)) {
    const profile = await getUserProfile('bob', workspace.id);
    assert.deepEqual(Array.from(profile.posts, post => post.id), [`post-${workspace.slug}`]);
    assert.equal(profile.stats.commentCount, 1); assert.equal(profile.stats.reactionsReceived, 1);
  }
  assert.deepEqual(Array.from((await getUserProfile('bob')).posts, post => post.id), ['post-own', 'post-joined']);
});

test('AI issue creation rejects projects outside the authorized workspace before writes', async () => {
  const f = indirectFixture();
  const projects = f.workspaces.map(workspace => ({ id: `project-${workspace.slug}`, workspaceId: workspace.id,
    issuePrefix: 'TEST', _count: { issues: 0 } }));
  f.db.project.findUnique = async ({ where }) => {
    const row = projects.find(row => matches(row, where));
    if (row) f.calls.projectReads++;
    return row ?? null;
  };
  f.db.issue.create = async ({ data }) => { f.calls.writes++; return { id: 'new-issue', ...data }; };
  const { POST } = f.route('ai/action');
  const call = projectId => POST(f.request('POST', undefined, { context: { workspace: { id: f.workspaces[0].id } },
    action: { type: 'create_issue', params: { title: 'Hello', projectId } } }));
  assert.equal((await call('project-revoked')).status, 404); noContent(f);
  assert.equal((await call('project-own')).status, 200);
  assert.equal(f.calls.writes, 1);
});

test('repository access rejects missing identity and foreign membership without side effects', async () => {
  const f = indirectFixture(), { GET } = f.route('github/repositories/[repositoryId]/releases');
  const call = key => GET(f.request(), { params: Promise.resolve({ repositoryId: `repo-${key}` }) });
  assert.equal((await call('foreign')).status, 404); noContent(f);
  f.state.mapped = false;
  assert.equal((await call('own')).status, 401); noContent(f);
});

for (const method of ['GET', 'POST', 'DELETE']) {
  test(`project follow ${method} rejects revoked membership before follower access`, async () => {
    const f = indirectFixture();
    const projects = f.workspaces.map(workspace => ({ id: `project-${workspace.slug}`, workspace }));
    f.db.project.findFirst = async ({ where }) => projects.find(row => matches(row, where)) ?? null;
    f.db.projectFollower.findUnique = async () => { f.calls.otherReads++; return null; };
    f.db.projectFollower.deleteMany = async () => { f.calls.writes++; };
    const handler = f.route('projects/[projectId]/follow')[method];
    const call = key => handler(f.request(method), { params: Promise.resolve({ projectId: `project-${key}` }) });
    assert.equal((await call('revoked')).status, 404); noContent(f);
    for (const key of ['own', 'joined']) assert.equal((await call(key)).status, 200);
  });
}

test('post mutation responses exclude user credentials', async () => {
  const f = indirectFixture();
  const author = { id: 'alice', name: 'Alice', githubAccessToken: 'synthetic-user-token', hashedPassword: 'synthetic-password-hash' };
  const projectAuthor = include => include.author === true ? author
    : Object.fromEntries(Object.keys(include.author.select).map(key => [key, author[key]]));
  f.db.post.create = async ({ data, include }) => ({ id: 'post-own', message: data.message, author: projectAuthor(include) });
  f.db.post.update = async ({ data, include }) => include ? { id: 'post-own', message: data.message, author: projectAuthor(include) } : {};
  for (const [path, method] of [['posts', 'POST'], ['posts/[postId]', 'PATCH']]) {
    const response = await f.route(path)[method](f.request(method, undefined, {
      workspaceId: f.workspaces[0].id, message: 'Hello', type: 'UPDATE', priority: 'normal', tags: [],
    }), { params: Promise.resolve({ postId: 'post-own' }) });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.author.id, 'alice');
    for (const secret of ['synthetic-user-token', 'synthetic-password-hash']) assert.equal(JSON.stringify(body).includes(secret), false);
  }
});

test('tenant tags deny revoked access and filter authored tags while retaining personal tags', async () => {
  const f = fixture();
  const tags = [null, ...f.workspaces].map(workspace => ({ id: workspace?.slug || 'personal',
    workspaceId: workspace?.id ?? null, workspace, authorId: 'alice', name: workspace?.slug || 'personal', _count: { notes: 2 } }));
  f.db.noteTag = {
    findMany: async ({ where }) => { f.calls.otherReads++; return tags.filter(row => matches(row, where)); },
    findFirst: async () => { f.calls.otherReads++; return null; },
    create: async ({ data }) => { f.calls.writes++; return data; },
  };
  const { GET, POST } = f.route('notes/tags');
  const create = workspaceId => POST(f.request('POST', undefined, { name: 'New', workspaceId }));
  assert.equal((await GET(f.request('GET', f.workspaces[2].id))).status, 403);
  assert.equal((await create(f.workspaces[2].id)).status, 403); noContent(f);
  assert.deepEqual((await (await GET(f.request())).json()).map(row => row.id).sort(), ['joined', 'own', 'personal']);
  for (const workspaceId of [null, f.workspaces[0].id, f.workspaces[1].id]) assert.equal((await create(workspaceId)).status, 201);
  f.workspaces[1].members[0].status = false;
  assert.deepEqual((await (await GET(f.request())).json()).map(row => row.id).sort(), ['own', 'personal']);
});

for (const endpoint of ['issues/[issueId]/activities', 'workspaces/[workspaceId]/planning/activity',
  'workspaces/[workspaceId]/planning/range', 'workspaces/[workspaceId]/planning/team-activity']) {
  test(`tenant activity ${endpoint} denies revocation before reads and retains active owners`, async () => {
    const f = fixture();
    f.dependencies['date-fns'] = require('date-fns');
    f.dependencies['@/utils/teamSyncAnalyzer'] = load('src/utils/teamSyncAnalyzer.ts', { 'date-fns': require('date-fns') });
    f.db.workspaceMember.findUnique = async ({ where }) => f.workspaces.flatMap(workspace => workspace.members.map(
      member => ({ ...member, workspaceId: workspace.id }))).find(row => matches(row, where.userId_workspaceId)) ?? null;
    f.db.issue.findUnique = async ({ where }) => ({ id: where.id, workspaceId: where.id });
    f.db.issue.findMany = async () => { f.calls.issueReads++; return []; };
    f.db.issueActivity = { findMany: async () => { f.calls.otherReads++; return []; } };
    f.db.user.findMany = async () => [];
    f.db.workspaceMember.findMany = async () => [];
    f.db.projectStatus.findMany = async () => [];
    const { GET } = f.route(endpoint);
    const call = workspaceId => GET(new Request('https://collab.example.test/api?startDate=2026-09-01&endDate=2026-09-02&date=2026-09-01'),
      { params: Promise.resolve({ workspaceId, issueId: workspaceId }) });
    assert.equal((await call(f.workspaces[2].id)).status, 403); noContent(f);
    for (const workspace of f.workspaces.slice(0, 2)) assert.equal((await call(workspace.id)).status, 200);
    f.workspaces[1].members[0].status = false;
    const before = { ...f.calls };
    assert.equal((await call(f.workspaces[1].id)).status, 403);
    assert.deepEqual(f.calls, before);
  });
}

function coclawFixture() {
  const f = fixture();
  const provider = async () => { f.calls.providerCalls++; return { status: 'running' }; };
  const secret = async () => { f.calls.decrypts++; return { key: 'fixture-only', source: 'user', provider: 'anthropic' }; };
  Object.assign(f.dependencies, {
    '@/lib/coclaw/instance-manager': { coclawManager: { getOrCreateInstance: provider,
      getInstanceInfo: () => null, stopInstance: provider, healthCheck: provider } },
    '@/lib/coclaw/key-resolver': new Proxy({}, { get: () => secret }),
    '@/lib/coclaw/spawn-helpers': { buildSpawnConfig: secret },
    '@/lib/ai/mcp-token': { getMcpToken: secret },
    '@/lib/secrets/crypto': new Proxy({}, { get: () => secret }),
    '@/lib/coclaw/anthropic-oauth': new Proxy({}, { get: () => provider }),
    '@/lib/coclaw/notifications': new Proxy({}, { get: () => provider }),
    '@/lib/coclaw/types': { SUPPORTED_CHANNELS: [], PROVIDER_ENV_MAP: { anthropic: 'ANTHROPIC_API_KEY' }, PROVIDER_KEY_PREFIXES: {} },
  });
  f.db.coclawInstance = { findUnique: async () => { f.calls.otherReads++; return null; } };
  return f;
}
for (const [endpoint, methods] of [
  ['instances', ['GET', 'POST']], ['instances/[instanceId]', ['GET', 'DELETE']],
  ['channels', ['GET', 'POST']], ['channels/[channelType]', ['GET', 'DELETE']],
  ['keys', ['GET', 'POST']], ['keys/[provider]', ['DELETE']], ['github', ['GET', 'POST', 'DELETE']],
  ['usage', ['GET']], ['conversations', ['GET']], ['status', ['GET']], ['cleanup', ['GET', 'POST']],
  ['auth/anthropic/start', ['POST']], ['auth/anthropic/exchange', ['POST']], ['notifications', ['GET', 'POST']],
]) {
  for (const method of methods) test(`tenant Coclaw ${endpoint} ${method} denies revoked access before secrets and providers`, async () => {
    const f = coclawFixture(), workspaceId = f.workspaces[2].id;
    const handler = f.route(`workspaces/[workspaceId]/coclaw/${endpoint}`)[method];
    const result = await handler(f.request(method, workspaceId, { provider: 'anthropic', channelType: 'telegram', code: 'fixture' }),
      { params: Promise.resolve({ workspaceId, instanceId: 'instance', provider: 'anthropic', channelType: 'telegram' }) });
    assert.ok([403, 404].includes(result.status), `Expected denial, got ${result.status}: ${await result.text()}`);
    noContent(f);
  });
}
test('tenant Coclaw provisioning retains owner and active member access', async () => {
  const f = coclawFixture(), { GET, POST } = f.route('workspaces/[workspaceId]/coclaw/instances');
  for (const workspace of f.workspaces.slice(0, 2)) {
    assert.equal((await GET(f.request(), f.context(workspace.id))).status, 200);
    assert.equal((await POST(f.request('POST'), f.context(workspace.id))).status, 200);
  }
  assert.equal(f.calls.providerCalls, 2);
  assert.equal(f.calls.decrypts, 4);
});

for (const [endpoint, method] of [['uninstall', 'POST'], ['webhooks', 'GET'], ['webhooks', 'POST'],
  ['webhooks/[webhookId]', 'GET'], ['webhooks/[webhookId]', 'PATCH'], ['webhooks/[webhookId]', 'DELETE'], ['webhooks/test', 'POST']]) {
  test(`tenant app ${endpoint} ${method} denies revoked admin before reads and providers`, async () => {
    const f = fixture(), workspaceId = f.workspaces[2].id;
    f.workspaces[2].members[0].role = 'ADMIN';
    f.dependencies['@/lib/webhooks'] = { validateEventTypes: () => true, isValidWebhookUrl: () => true };
    f.dependencies['@/lib/apps/crypto'] = { encrypt: () => { f.calls.decrypts++; return 'encrypted'; } };
    f.dependencies['@/lib/webhook-delivery'] = { processWebhookEvent: async () => { f.calls.providerCalls++; } };
    f.db.app = { findUnique: async () => { f.calls.otherReads++; return { id: 'app', installations: [] }; } };
    const webhooks = [{ id: 'webhook', app: { slug: 'app' }, installation: { workspace: f.workspaces[2] } }];
    f.db.appWebhook = { findFirst: async ({ where }) => webhooks.find(row => matches(row, where)) ?? null };
    const result = await f.route(`apps/[slug]/${endpoint}`)[method](f.request(method, workspaceId, {
      workspaceId, url: 'https://fixture.example.test', eventTypes: ['issue.updated'], eventType: 'issue.updated', isActive: true,
    }), { params: Promise.resolve({ slug: 'app', webhookId: 'webhook' }) });
    assert.equal(result.status, method === 'PATCH' ? 404 : 403, await result.text()); noContent(f);
  });
}
test('tenant app uninstall retains owner and active admin access', async () => {
  const f = fixture(); f.workspaces[1].members[0].role = 'ADMIN';
  f.db.app = { findUnique: async () => ({ id: 'app', name: 'App', slug: 'app', installations: [{ id: 'installation', webhooks: [] }] }) };
  f.db.appWebhook = { deleteMany: async () => { f.calls.writes++; } };
  f.db.appInstallation = { update: async () => { f.calls.writes++; } };
  f.dependencies['@/lib/event-bus'] = { emitAppUninstalled: async () => { f.calls.providerCalls++; } };
  const { POST } = f.route('apps/[slug]/uninstall');
  for (const workspace of f.workspaces.slice(0, 2)) {
    assert.equal((await POST(f.request('POST', undefined, { workspaceId: workspace.id }),
      { params: Promise.resolve({ slug: 'app' }) })).status, 200);
  }
  assert.equal(f.calls.writes, 6); assert.equal(f.calls.providerCalls, 2);
});

function notificationFixture() {
  const f = fixture(), deliveries = [], stored = [];
  const posts = [null, ...f.workspaces].map(workspace => ({ id: `post-${workspace?.slug || 'personal'}`,
    workspaceId: workspace?.id ?? null, workspace, message: `content-${workspace?.slug || 'personal'}` }));
  const comments = posts.map(post => ({ id: `comment-${post.id}`, postId: post.id, post, noteId: null, note: null, message: post.message }));
  f.db.post.findUnique = async ({ where }) => posts.find(post => matches(post, where)) ?? null;
  f.db.comment = { findUnique: async ({ where }) => comments.find(row => matches(row, where)) ?? null };
  f.db.postFollower = { findMany: async () => [{ userId: 'alice' }] };
  f.db.notificationPreferences = { findFirst: async () => null };
  f.db.notification = {
    groupBy: async () => [],
    createMany: async ({ data }) => { stored.push(...data); f.calls.writes++; return { count: data.length }; },
    findMany: async ({ where }) => stored.filter(row => matches(row, where)),
    findUnique: async ({ where }) => stored.find(row => matches(row, where)) ?? null,
    update: async ({ where, data }) => { f.calls.writes++; const row = stored.find(row => matches(row, where)); Object.assign(row, data); return row; },
    updateMany: async ({ where, data }) => { const rows = stored.filter(row => matches(row, where));
      rows.forEach(row => Object.assign(row, data)); f.calls.writes += rows.length; return { count: rows.length }; },
  };
  Object.assign(f.dependencies, {
    'date-fns': require('date-fns'),
    '@/lib/logger': { logger: { info() {}, warn() {}, error(...args) { throw new Error(JSON.stringify(args)); } } },
    '@/lib/html-sanitizer': { sanitizeHtmlToPlainText: value => value },
    '@/lib/push-notifications': { sendPushNotification: async (...args) => { f.calls.providerCalls++; deliveries.push(args); } },
  });
  f.dependencies['@/lib/notification-access'] = load('src/lib/notification-access.ts', f.dependencies);
  const service = load('src/lib/notification-service.ts', f.dependencies);
  return { ...f, ...service, posts, comments, stored, deliveries };
}
test('tenant notifications stop follower delivery and push after revocation without affecting owners or personal notifications', async () => {
  const f = notificationFixture(), service = f.NotificationService;
  const notify = key => service.notifyPostFollowers({ postId: `post-${key}`, senderId: 'bob',
    type: f.NotificationType.POST_COMMENT_ADDED, content: `new-comment-${key}` });
  await notify('joined'); assert.equal(f.stored.length, 1); assert.equal(f.deliveries.length, 1);
  f.workspaces[1].members[0].status = false;
  f.stored.length = 0; f.deliveries.length = 0;
  for (const key of Object.keys(f.calls)) f.calls[key] = 0;
  await notify('joined');
  await service.sendPushNotificationForUser('alice', f.NotificationType.POST_COMMENT_ADDED, 'secret', undefined, 'post-joined');
  assert.equal(await service.notifyUsers(['alice'], 'POST_COMMENT_ADDED', 'secret', 'bob', { postId: 'post-joined' }), 0);
  assert.equal(await service.notifyUsers(['alice'], 'POST_COMMENT_ADDED', 'secret', 'bob', { commentId: 'comment-post-joined' }), 0);
  noContent(f); assert.equal(f.stored.length, 0); assert.equal(f.deliveries.length, 0);
  for (const key of ['own', 'personal']) await notify(key);
  assert.equal(await service.notifyUsers(['alice'], 'PERSONAL', 'personal', 'bob', { personal: true }), 1);
  assert.equal(f.stored.length, 3); assert.equal(f.deliveries.length, 2);
  f.state.user = null;
  const before = f.calls.writes;
  assert.equal(await service.notifyUsers(['alice'], 'PERSONAL', 'personal', 'bob', { personal: true }), 0);
  assert.equal(f.calls.writes, before);
});
test('tenant notification reads and mutations hide revoked post and comment content', async () => {
  const f = notificationFixture();
  for (const post of f.posts) {
    for (const kind of ['post', 'comment']) f.stored.push({ id: `${kind}-${post.id}`, userId: 'alice', read: false,
      postId: kind === 'post' ? post.id : null, post: kind === 'post' ? post : null,
      commentId: kind === 'comment' ? `comment-${post.id}` : null,
      comment: kind === 'comment' ? f.comments.find(row => row.postId === post.id) : null,
      featureRequestId: null, leaveRequestId: null, workspaceId: null, issueId: null, isPersonal: false, content: post.message });
  }
  const { GET } = f.route('notifications');
  const read = async () => (await (await GET(f.request())).json());
  const initial = await read();
  assert.equal(initial.length, 6);
  assert.equal(JSON.stringify(initial).includes('content-revoked'), false);
  f.workspaces[1].members[0].status = false;
  const current = await read();
  assert.equal(current.length, 4);
  assert.equal(JSON.stringify(current).includes('content-joined'), false);
  const { PATCH } = f.route('notifications/[id]');
  const patch = id => PATCH(f.request('PATCH', undefined, { read: true }), { params: Promise.resolve({ id }) });
  assert.equal((await patch('post-post-joined')).status, 404);
  assert.equal((await patch('comment-post-joined')).status, 404); noContent(f);
  assert.equal((await patch('post-post-own')).status, 200);
  assert.equal((await f.route('notifications/read-all').POST()).status, 200);
  assert.ok(f.stored.filter(row => row.content === 'content-joined').every(row => !row.read));
  assert.ok(f.stored.filter(row => row.content === 'content-personal').every(row => row.read));
});

for (const revoke of ['membership', 'mapping', 'user']) test(`tenant open stream closes on ${revoke} revocation before forwarding events`, async () => {
  const f = relatedIssueFixture(); let callback, unsubscribed = 0, quit = 0;
  f.dependencies['@/lib/redis'] = { getRedisSubscriber: async () => ({
    subscribe: async (_channel, cb) => { callback = cb; },
    unsubscribe: async () => { unsubscribed++; }, quit: async () => { quit++; },
  }) };
  const response = await f.route('realtime/workspace/[workspaceId]/stream').GET(f.request(), f.context(f.workspaces[1].id));
  assert.equal(response.status, 200);
  const reader = response.body.getReader();
  try {
    assert.match(new TextDecoder().decode((await reader.read()).value), /connected/);
    assert.match(new TextDecoder().decode((await reader.read()).value), /realtime.ready/);
    await callback(JSON.stringify({ type: 'issue.created', issueId: 'issue-joined', key: 'allowed' }));
    assert.match(new TextDecoder().decode((await reader.read()).value), /allowed/);
    if (revoke === 'membership') f.workspaces[1].members[0].status = false;
    if (revoke === 'mapping') f.state.mapped = false;
    if (revoke === 'user') f.state.user = null;
    await callback(JSON.stringify({ type: 'issue.created', issueId: 'issue-joined', key: 'secret-after-revocation' }));
    const next = await reader.read();
    assert.equal(next.done, true);
    assert.equal(unsubscribed, 1); assert.equal(quit, 1);
  } finally { await reader.cancel(); }
});
test('tenant owner stream survives an unrelated revoked membership', async () => {
  const f = fixture(); let callback;
  f.dependencies['@/lib/redis'] = { getRedisSubscriber: async () => ({
    subscribe: async (_channel, cb) => { callback = cb; }, unsubscribe: async () => {}, quit: async () => {},
  }) };
  const response = await f.route('realtime/workspace/[workspaceId]/stream').GET(f.request(), f.context(f.workspaces[0].id));
  const reader = response.body.getReader();
  try {
    await reader.read(); await reader.read();
    f.workspaces[1].members[0].status = false;
    await callback(JSON.stringify({ key: 'owner-event' }));
    assert.match(new TextDecoder().decode((await reader.read()).value), /owner-event/);
  } finally { await reader.cancel(); }
});

test('tenant profile page resolves workspace slugs before guarded profile reads', async () => {
  const f = fixture(), findUser = f.db.user.findUnique;
  f.db.user.findUnique = async args => args.where.id === 'bob' ? { id: 'bob', name: 'Bob' } : findUser(args);
  f.db.workspaceMember.findUnique = async () => null;
  f.db.comment = { count: async () => 0 }; f.db.reaction = { count: async () => 0 };
  f.db.conversation = { findFirst: async () => null };
  f.dependencies['@/actions/user'] = load('src/actions/user.ts', f.dependencies);
  f.dependencies['react/jsx-runtime'] = { jsx: (_component, props) => props };
  f.dependencies['@/components/profile/UserProfileClient'] = { default: () => null };
  f.dependencies['next/navigation'] = { redirect: path => { throw new Error(`redirect:${path}`); },
    notFound: () => { throw new Error('notFound'); } };
  const page = load('src/app/(main)/[workspaceId]/profile/[userId]/page.tsx', f.dependencies).default;
  const call = workspaceId => page({ params: Promise.resolve({ workspaceId, userId: 'bob' }) });
  for (const workspace of f.workspaces.slice(0, 2)) {
    assert.equal((await call(workspace.slug)).initialData.user.id, 'bob');
    assert.equal((await call(workspace.id)).initialData.user.id, 'bob');
  }
  const before = f.calls.otherReads;
  await assert.rejects(call('revoked'), /redirect:\/revoked\/timeline/);
  assert.equal(f.calls.otherReads, before);
  await assert.rejects(call('missing'), /notFound/);
});

function featureFixture() {
  const f = fixture();
  const features = [null, ...f.workspaces].map(workspace => ({ id: `feature-${workspace?.slug || 'personal'}`,
    title: `Title-${workspace?.slug || 'personal'}`, description: 'Feature content', authorId: 'alice',
    workspaceId: workspace?.id ?? null, workspace, projectId: workspace ? `project-${workspace.slug}` : null,
    project: workspace ? { id: `project-${workspace.slug}`, workspaceId: workspace.id, workspace } : null,
    votes: [], _count: { votes: 0, comments: 0 }, createdAt: new Date(), updatedAt: new Date() }));
  features.push({ ...features[3], id: 'feature-project-revoked', workspaceId: null, workspace: null });
  f.db.featureRequest = {
    findUnique: async ({ where }) => { f.calls.otherReads++; return features.find(row => matches(row, where)) ?? null; },
    findFirst: async ({ where }) => { const row = features.find(row => matches(row, where)); if (row) f.calls.otherReads++; return row ?? null; },
    findMany: async ({ where }) => { const rows = features.filter(row => matches(row, where)); f.calls.otherReads += rows.length; return rows; },
    create: async ({ data }) => { f.calls.writes++; return { id: 'new', ...data }; },
    update: async ({ where, data }) => { const row = features.find(row => matches(row, where));
      if (!row) throw new Error('Not found'); f.calls.writes++; return { ...row, ...data }; },
    delete: async ({ where }) => { const row = features.find(row => matches(row, where));
      if (!row) throw new Error('Not found'); f.calls.writes++; return row; },
  };
  f.db.featureVote = { count: async () => { f.calls.otherReads++; return 0; },
    findUnique: async () => null, findFirst: async () => null,
    create: async ({ data }) => { f.calls.writes++; return data; } };
  f.db.featureRequestComment = { count: async () => 0, findMany: async () => { f.calls.otherReads++; return []; },
    create: async ({ data }) => { f.calls.writes++; return { ...data, createdAt: new Date(), updatedAt: new Date() }; } };
  f.dependencies['next/cache'] = { revalidatePath() {} };
  f.dependencies['@/lib/permissions'] = { checkUserPermission: async () => ({ hasPermission: true }) };
  const actions = load('src/actions/feature.ts', f.dependencies);
  return { ...f, features, actions };
}
for (const [path, method, body] of [['features/[id]', 'GET', {}], ['features/[id]', 'PATCH', { title: 'Changed' }],
  ['features/[id]', 'DELETE', {}], ['features/[id]/comments', 'GET', {}],
  ['features/[id]/comments', 'POST', { content: 'Hello' }], ['features/[id]/vote', 'POST', { value: 1 }]]) {
  test(`feature boundary ${method} ${path} denies revoked authors and project-only features`, async () => {
    const f = featureFixture(), handler = f.route(path)[method];
    const call = id => handler(f.request(method, undefined, body), { params: Promise.resolve({ id }) });
    for (const id of ['feature-revoked', 'feature-project-revoked', 'feature-foreign']) {
      assert.equal((await call(id)).status, 404); noContent(f);
    }
    for (const key of ['own', 'joined', 'personal']) assert.ok([200, 201].includes((await call(`feature-${key}`)).status));
    f.state.mapped = false;
    assert.equal((await call('feature-own')).status, 401);
  });
}
test('feature actions and metadata deny revoked content through an accessible workspace URL', async () => {
  const f = featureFixture();
  assert.equal(await f.actions.getFeatureRequestById('feature-revoked', f.workspaces[0].id), null);
  assert.equal(await f.actions.getFeatureRequestById('feature-project-revoked'), null); noContent(f);
  for (const invoke of [() => f.actions.voteOnFeature({ featureRequestId: 'feature-revoked', value: 1 }),
    () => f.actions.addFeatureComment({ featureRequestId: 'feature-revoked', content: 'Hi' })]) {
    await assert.rejects(invoke); noContent(f);
  }
  f.state.user.role = 'SYSTEM_ADMIN';
  await assert.rejects(f.actions.updateFeatureStatus({ featureRequestId: 'feature-revoked', status: 'COMPLETED' })); noContent(f);
  Object.assign(f.dependencies, { '@/actions/feature': f.actions, 'react/jsx-runtime': require('react/jsx-runtime'),
    'next/navigation': {}, 'next/link': {}, 'lucide-react': {}, '@/components/ui/button': {},
    '@/components/features/FeatureRequestDetail': {}, '@/components/features/FeatureRequestComments': {} });
  for (const path of ['features/[id]', 'projects/[projectSlug]/features/[id]']) {
    const { generateMetadata } = load(`src/app/(main)/[workspaceId]/${path}/page.tsx`, f.dependencies);
    const metadata = await generateMetadata({ params: Promise.resolve({ workspaceId: f.workspaces[0].id, id: 'feature-revoked' }) });
    assert.equal(metadata.title, 'Feature Request Not Found'); noContent(f);
    const allowed = await generateMetadata({ params: Promise.resolve({ workspaceId: f.workspaces[0].id, id: 'feature-own' }) });
    assert.equal(allowed.title, 'Title-own | Feature Request');
    f.calls.otherReads = 0;
  }
  for (const key of ['own', 'joined', 'personal']) {
    assert.equal((await f.actions.getFeatureRequestById(`feature-${key}`)).title, `Title-${key}`);
    await f.actions.voteOnFeature({ featureRequestId: `feature-${key}`, value: 1 });
    await f.actions.addFeatureComment({ featureRequestId: `feature-${key}`, content: 'Hi' });
  }
});
test('feature listing and creation enforce project and tenant access', async () => {
  const f = featureFixture();
  const { GET, POST } = f.route('features');
  const request = key => new Request(`https://collab.example.test/api/features?orderBy=latest&workspaceId=${f.workspaces.find(w => w.slug === key).id}`);
  const deniedList = await GET(request('revoked'));
  assert.equal(deniedList.status, 200); assert.deepEqual((await deniedList.json()).featureRequests, []); noContent(f);
  const listed = await f.actions.getFeatureRequests({ workspaceId: f.workspaces[2].id });
  assert.equal(listed.featureRequests?.length ?? listed.features?.length, 0); noContent(f);
  const body = { title: 'New', description: 'Details', projectId: 'project-revoked', workspaceId: f.workspaces[0].id };
  assert.equal((await POST(f.request('POST', undefined, body))).status, 404);
  assert.equal(f.calls.writes, 0);
  const form = new FormData(); Object.entries(body).forEach(([key, value]) => form.set(key, value));
  await assert.rejects(f.actions.createFeatureRequest(form)); assert.equal(f.calls.writes, 0);
  for (const key of ['own', 'joined']) {
    const response = await POST(f.request('POST', undefined, { ...body, projectId: `project-${key}`, workspaceId: undefined }));
    assert.equal(response.status, 201);
    assert.equal((await response.json()).workspaceId, f.workspaces.find(w => w.slug === key).id);
  }
});

test('status reorder rejects foreign IDs and mixed batches before mutation and retains owners', async () => {
  const f = fixture();
  const statuses = f.workspaces.map(w => ({ id: `status-${w.slug}`, projectId: `project-${w.slug}`, name: 'todo', order: 0 }));
  f.db.project.findUnique = async ({ where }) => ({ id: where.id, workspaceId: f.workspaces.find(w => `project-${w.slug}` === where.id).id });
  f.db.projectStatus.count = async ({ where }) => statuses.filter(row => matches(row, where)).length;
  f.db.projectStatus.update = async ({ where, data }) => { const row = statuses.find(row => matches(row, where));
    if (!row) throw new Error('Not found'); f.calls.writes++; Object.assign(row, data); return row; };
  f.db.projectStatus.updateMany = async ({ where, data }) => { statuses.filter(row => matches(row, where)).forEach(row => { f.calls.writes++; Object.assign(row, data); }); };
  const { PATCH } = f.route('projects/[projectId]/statuses/reorder');
  const call = (projectId, updates) => PATCH(f.request('PATCH', undefined, { updates }), { params: Promise.resolve({ projectId }) });
  for (const updates of [[{ id: 'status-revoked', order: 9 }], [{ id: 'status-joined', order: 1 }, { id: 'status-revoked', order: 9 }]]) {
    assert.equal((await call('project-joined', updates)).status, 400); noContent(f);
    assert.ok(statuses.every(row => row.order === 0));
  }
  for (const key of ['own', 'joined']) assert.equal((await call(`project-${key}`, [{ id: `status-${key}`, order: 2 }, { name: 'todo', order: 3 }])).status, 200);
  assert.equal(statuses[2].order, 0);
  assert.equal(statuses[0].order, 3); assert.equal(statuses[1].order, 3);
});

function scopedNotificationFixture() {
  const f = notificationFixture();
  const normalize = data => ({ id: `notification-${f.stored.length}`, postId: null, commentId: null,
    featureRequestId: null, leaveRequestId: null, issueId: null, workspaceId: null, isPersonal: false, read: false,
    ...data, workspace: f.workspaces.find(w => w.id === data.workspaceId) ?? null });
  f.db.notification.createMany = async ({ data }) => {
    for (const row of data) f.stored.push(normalize(row)); f.calls.writes++; return { count: data.length };
  };
  f.db.notification.create = async ({ data }) => { const row = normalize(data); f.stored.push(row); f.calls.writes++; return row; };
  f.db.notification.count = async ({ where }) => f.stored.filter(row => matches(row, where)).length;
  const issues = f.workspaces.map(workspace => ({ id: `issue-${workspace.slug}`, issueKey: 'DEMO-1', workspace,
    workspaceId: workspace.id, projectId: `project-${workspace.slug}`, project: { workspace }, statusId: null, reporterId: 'alice' }));
  f.db.issue.findMany = async ({ where }) => issues.filter(row => matches(row, where));
  f.db.issue.findFirst = async ({ where }) => issues.find(row => matches(row, where)) ?? null;
  f.db.issue.findUnique = async ({ where }) => issues.find(row => matches(row, where)) ?? null;
  f.db.issue.delete = async ({ where }) => { f.calls.writes++; issues.splice(issues.findIndex(row => matches(row, where)), 1); };
  f.dependencies['@/lib/notification-service'] = { NotificationService: f.NotificationService, NotificationType: f.NotificationType };
  const coclaw = load('src/lib/coclaw/notifications.ts', f.dependencies);
  f.dependencies['@/lib/coclaw/notifications'] = coclaw;
  return { ...f, issues, coclaw, normalize };
}
test('notification scope persists issues and hides revoked or orphaned previews while retaining personal notices', async () => {
  const f = scopedNotificationFixture();
  for (const key of ['own', 'joined']) {
    assert.equal(await f.NotificationService.notifyUsers(['alice'], 'ISSUE_UPDATED', `issue-secret-${key}`, 'bob', { issueId: `issue-${key}` }), 1);
  }
  assert.equal(await f.NotificationService.notifyUsers(['alice'], 'PERSONAL', 'personal-notice', 'bob', { personal: true }), 1);
  f.stored.push(f.normalize({ userId: 'alice', type: 'ISSUE_UPDATED', content: 'orphan-issue-secret' }));
  f.stored.push(f.normalize({ userId: 'alice', type: 'COCLAW_RESPONSE', content: 'orphan-agent-secret' }));
  const { GET } = f.route('notifications');
  f.workspaces[1].members[0].status = false;
  const result = await GET(f.request()); assert.equal(result.status, 200);
  const contents = (await result.json()).map(row => row.content).sort();
  assert.deepEqual(contents, ['issue-secret-own', 'personal-notice']);
  assert.equal(f.stored[0].issueId, 'issue-own');
  assert.equal(f.stored[0].workspaceId, f.workspaces[0].id);
  const writes = f.calls.writes, pushes = f.calls.providerCalls;
  assert.equal(await f.NotificationService.notifyUsers(['alice'], 'ISSUE_UPDATED', 'revoked-later', 'bob', { issueId: 'issue-joined' }), 0);
  assert.equal(f.calls.writes, writes); assert.equal(f.calls.providerCalls, pushes);
  assert.equal(await f.NotificationService.notifyUsers(['alice'], 'ISSUE_UPDATED', 'unknown-reference', 'bob'), 0);
});
test('Coclaw notifications persist server workspace scope and both read paths deny revoked previews', async () => {
  const f = scopedNotificationFixture();
  const create = key => ({ userId: 'alice', workspaceId: f.workspaces.find(w => w.slug === key).id,
    type: f.coclaw.CoclawNotificationType.COCLAW_RESPONSE, content: `agent-secret-${key}` });
  await f.coclaw.createCoclawNotifications([create('own'), create('joined')]);
  assert.equal(f.stored.length, 2);
  f.workspaces[1].members[0].status = false;
  const writes = f.calls.writes;
  await f.coclaw.createCoclawNotification(create('joined'));
  assert.equal(f.calls.writes, writes);
  f.stored.push(f.normalize({ userId: 'alice', type: 'COCLAW_RESPONSE', content: 'orphan-agent-secret' }));
  const generic = await (await f.route('notifications').GET(f.request())).json();
  assert.deepEqual(generic.map(row => row.content), ['agent-secret-own']);
  const { GET, POST } = f.route('workspaces/[workspaceId]/coclaw/notifications');
  const response = await GET(f.request(), f.context(f.workspaces[0].id)); assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.unreadCount, 1);
  assert.deepEqual(body.activity.map(row => row.content), ['agent-secret-own']);
  assert.equal((await GET(f.request(), f.context(f.workspaces[1].id))).status, 403);
  assert.equal((await POST(f.request('POST'), f.context(f.workspaces[0].id))).status, 200);
  assert.equal(f.stored.find(row => row.content === 'agent-secret-joined').read, false);
  assert.equal(f.stored.find(row => row.content === 'agent-secret-own').read, true);
});
test('issue deletion preserves stored notifications but suppresses reads and delivery without full scope', async () => {
  const f = scopedNotificationFixture();
  const workspace = f.workspaces[1];
  workspace.members.push({ userId: 'dan', status: true }, { userId: 'carol', status: false });
  const lookupUser = f.db.user.findUnique;
  f.db.user.findUnique = async args => ['bob', 'dan', 'carol'].includes(args.where.id) ? { id: args.where.id } : lookupUser(args);
  assert.equal(await f.NotificationService.notifyUsers(['dan'], 'ISSUE_UPDATED', 'retained history', 'alice',
    { issueId: 'issue-joined' }), 1);
  const stored = structuredClone(f.stored);
  const deliveries = JSON.stringify(f.deliveries);
  f.db.issueFollower = { findMany: async () => [{ userId: 'dan' }, { userId: 'carol' }] };
  f.db.projectFollower = { findMany: async () => [{ userId: 'bob' }] };
  Object.assign(f.dependencies, {
    '@prisma/client': { IssueType: { TASK: 'TASK' }, Prisma: {} },
    '@/utils/html-normalizer': {},
    '@/lib/event-bus': { emitIssueDeleted: async () => {} },
    '@/lib/permissions': { Permission: { DELETE_ANY_TASK: 'any', DELETE_SELF_TASK: 'self' },
      canActOnOwnContent: () => true, checkUserPermissions: async () => ({ any: { hasPermission: true }, self: { hasPermission: true } }) },
  });
  const response = await f.route('issues/[issueId]').DELETE(f.request('DELETE', workspace.id),
    { params: Promise.resolve({ issueId: 'issue-joined' }) });
  assert.equal(response.status, 200, await response.text());
  assert.equal(f.issues.some(issue => issue.id === 'issue-joined'), false);
  assert.deepEqual(f.stored, stored);
  assert.equal(JSON.stringify(f.deliveries), deliveries);
  const where = await f.dependencies['@/lib/notification-access'].notificationAccessWhere('dan');
  assert.deepEqual(f.stored.filter(row => matches(row, where)), []);
  workspace.members.find(member => member.userId === 'dan').status = false;
  assert.equal(f.stored.filter(row => matches(row, where)).length, 0);
});

test('feature mentions deny revoked senders before notification writes', async () => {
  const f = featureFixture();
  f.dependencies['@/lib/notification-access'] = load('src/lib/notification-access.ts', f.dependencies);
  f.dependencies['@/lib/html-sanitizer'] = { sanitizeHtmlToPlainText: value => value };
  f.dependencies['@/lib/notification-service'] = { NotificationService: { notifyUsers: async () => { f.calls.writes++; return 1; } } };
  const { POST } = f.route('mentions');
  const call = key => POST(f.request('POST', undefined, { userIds: ['bob'], sourceType: 'feature', sourceId: `feature-${key}`, content: 'Mention' }));
  assert.equal((await call('revoked')).status, 404);
  assert.equal(f.calls.writes, 0);
  assert.equal((await call('own')).status, 200);
  assert.equal(f.calls.writes, 1);
});

for (const path of ['timeline/posts', 'posts', 'action']) {
  test(`post creation ${path} denies revoked identity and tenants before writes or mentions`, async () => {
    const f = fixture(), writes = [];
    f.db.post.create = async ({ data }) => { f.calls.writes++; writes.push(data); return { id: 'post', ...data }; };
    f.db.postAction = { create: async () => { f.calls.writes++; } };
    f.dependencies['@/utils/mentions'] = { extractMentionUserIds: () => ['bob'] };
    f.dependencies['@/lib/html-sanitizer'] = { sanitizeHtmlToPlainText: value => value };
    f.dependencies['@/lib/notification-service'] = { NotificationService: {
      notifyUsers: async () => { f.calls.providerCalls++; },
      autoFollowPost: async () => { f.calls.writes++; },
    } };
    const action = path === 'action' ? load('src/actions/post.ts', f.dependencies).createPost : null;
    const handler = action ? null : f.route(path).POST;
    const invoke = workspaceId => {
      const data = { workspaceId, content: 'Hello @bob', message: 'Hello @bob', type: 'UPDATE', priority: 'normal', tags: [] };
      return action ? action(data) : handler(f.request('POST', undefined, data));
    };
    const deny = async (workspaceId, status) => {
      if (action) await assert.rejects(invoke(workspaceId));
      else assert.equal((await invoke(workspaceId)).status, status);
      noContent(f);
    };
    for (const key of ['revoked', 'foreign']) await deny(f.workspaces.find(w => w.slug === key).id, 403);
    await deny(undefined, 400);
    f.state.mapped = false; await deny(f.workspaces[0].id, 401); f.state.mapped = true;
    const user = f.state.user; f.state.user = null; await deny(f.workspaces[0].id, 401); f.state.user = user;
    for (const workspace of f.workspaces.slice(0, 2)) {
      const result = await invoke(workspace.id);
      if (!action) assert.equal(result.status, 200);
    }
    assert.equal(writes.length, 2);
    assert.ok(writes.every(row => (row.authorId || row.author?.connect.id) === 'alice'));
    assert.equal(f.calls.providerCalls, path === 'posts' ? 0 : 2);
    f.workspaces[1].members[0].status = false;
    for (const key of Object.keys(f.calls)) f.calls[key] = 0;
    await deny(f.workspaces[1].id, 403);
    assert.equal(writes.length, 2);
  });
}

test('Coclaw same-content events remain distinct across accessible workspaces and batches', async () => {
  const f = scopedNotificationFixture();
  f.db.notification.groupBy = async ({ where }) => {
    const rows = f.stored.filter(row => matches(row, where));
    return rows.length ? [{ userId: 'alice', _max: { createdAt: rows.at(-1).createdAt } }] : [];
  };
  const opts = key => ({ userId: 'alice', workspaceId: f.workspaces.find(w => w.slug === key).id,
    type: f.coclaw.CoclawNotificationType.COCLAW_RESPONSE, content: 'Done' });
  await f.coclaw.createCoclawNotification(opts('own'));
  assert.equal(f.stored.length, 1);
  f.stored[0].createdAt = new Date('2026-01-01T00:00:00Z');
  f.stored[0].read = true;
  await f.coclaw.createCoclawNotification(opts('joined'));
  assert.equal(f.stored.length, 2);
  await f.coclaw.createCoclawNotifications([opts('own'), opts('joined')]);
  assert.equal(f.stored.length, 4);
  assert.deepEqual(f.stored.map(row => row.workspaceId), [f.workspaces[0].id, f.workspaces[1].id, f.workspaces[0].id, f.workspaces[1].id]);
  assert.ok(f.stored.every(row => row.content === 'Done' && row.isPersonal === false));
  const before = f.calls.writes;
  f.workspaces[1].members[0].status = false;
  await f.coclaw.createCoclawNotification(opts('joined'));
  assert.equal(f.calls.writes, before);
  f.state.user = null;
  await f.coclaw.createCoclawNotification(opts('own'));
  assert.equal(f.calls.writes, before);
  assert.equal(f.calls.providerCalls, 0);
});

function repositoryChooserFixture() {
  const f = fixture();
  f.state.user.githubAccessToken = 'fixture-encrypted-token';
  f.state.user.githubUsername = 'alice-github';
  const repositories = f.workspaces.map((workspace, index) => ({ id: index + 1, name: `repo-${workspace.slug}`,
    full_name: `company/repo-${workspace.slug}`, description: workspace.slug }));
  const connected = f.workspaces.map((workspace, index) => ({ id: `connection-${index}`, githubRepoId: String(index + 1),
    project: { id: `private-project-${workspace.slug}`, name: `Private project ${workspace.slug}`, workspace } }));
  f.db.repository.findMany = async ({ where, select }) => connected.filter(row => matches(row, where)).map(row => ({
    githubRepoId: row.githubRepoId,
    project: Object.fromEntries(Object.keys(select.project.select).map(key => [key, row.project[key]])),
  }));
  f.db.repository.findFirst = async ({ where, select }) => {
    const row = connected.find(row => matches(row, where));
    return row && select ? Object.fromEntries(Object.keys(select).map(key => [key, row[key]])) : row ?? null;
  };
  f.dependencies['crypto'] = { default: require('node:crypto') };
  f.dependencies['@/lib/github/oauth-config'] = {
    getUserRepositories: async () => { f.calls.providerCalls++; return { repositories, hasMore: true }; },
    getRepositoryDetails: async () => { f.calls.providerCalls++; throw new Error('Unexpected provider request'); },
    createRepositoryWebhook: async () => { f.calls.providerCalls++; throw new Error('Unexpected webhook creation'); },
  };
  return { ...f, repositories, connected };
}
test('repository chooser retains external repos but hides revoked tenant project metadata', async () => {
  const f = repositoryChooserFixture(), { GET } = f.route('github/oauth/repositories');
  const request = () => new Request(`https://collab.example.test/api/github/oauth/repositories?workspaceId=${f.workspaces[0].id}`);
  const read = async () => {
    const response = await GET(request()); assert.equal(response.status, 200); return response.json();
  };
  const initial = await read();
  assert.equal(initial.repositories.length, 4); assert.equal(initial.hasMore, true);
  for (const key of ['own', 'joined']) {
    const repo = initial.repositories.find(row => row.name === `repo-${key}`);
    assert.equal(repo.isConnected, true);
    assert.equal(repo.connectedProject.id, `private-project-${key}`);
  }
  for (const key of ['revoked', 'foreign']) {
    const repo = initial.repositories.find(row => row.name === `repo-${key}`);
    assert.equal(repo.isConnected, false);
    assert.equal(repo.connectedProject, undefined);
    assert.equal(JSON.stringify(initial).includes(`private-project-${key}`), false);
    assert.equal(JSON.stringify(initial).includes(`Private project ${key}`), false);
  }
  f.workspaces[1].members[0].status = false;
  const after = await read();
  assert.equal(after.repositories.length, 4);
  assert.equal(after.repositories.find(row => row.name === 'repo-joined').connectedProject, undefined);
  assert.equal(after.repositories.find(row => row.name === 'repo-own').isConnected, true);
  assert.equal(JSON.stringify(after).includes('fixture-encrypted-token'), false);
  f.state.mapped = false;
  const calls = f.calls.providerCalls;
  assert.equal((await GET(request())).status, 401);
  assert.equal(f.calls.providerCalls, calls);
  assert.equal(f.calls.writes, 0);
});
test('repository connection conflict reveals no inaccessible project metadata or provider calls', async () => {
  const f = repositoryChooserFixture(), { POST } = f.route('github/oauth/connect');
  const response = await POST(f.request('POST', undefined, {
    projectId: 'project-own', repositoryId: 3, owner: 'company', name: 'repo-revoked',
  }));
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.error, 'Repository is already connected to a project');
  assert.equal(JSON.stringify(body).includes('Private project revoked'), false);
  assert.equal(f.calls.providerCalls, 0); assert.equal(f.calls.writes, 0);
});

function issuePreviewFixture() {
  const f = fixture();
  const rows = f.workspaces.map(workspace => ({
    id: `issue-${workspace.slug}`, issueKey: `${workspace.slug}-1`, workspace,
    title: `Private title ${workspace.slug}`, statusId: null, projectStatus: null, status: 'OPEN', priority: 'HIGH', type: 'TASK',
    assignee: { name: `Private assignee ${workspace.slug}` },
    project: { id: `project-${workspace.slug}`, name: `Project ${workspace.slug}`, slug: 'project', workspace },
  }));
  let queries = 0;
  f.db.issue.findFirst = async ({ where }) => {
    queries++;
    const row = rows.find(row => matches(row, where)) ?? null;
    if (row) f.calls.issueReads++;
    return row;
  };
  return { ...f, queries: () => queries };
}

test('issue preview denies revoked cross-workspace links before reading metadata', async () => {
  const f = issuePreviewFixture(), { POST } = f.route('link-preview');
  const preview = async (workspace, key = workspace.slug) => {
    const response = await POST(f.request('POST', f.workspaces[0].id, {
      workspaceId: f.workspaces[0].id, url: `https://collab.example.test/${key}/issues/${workspace.slug}-1`,
    }));
    assert.equal(response.status, 200);
    return response.json();
  };
  for (const workspace of f.workspaces.slice(2)) {
    for (const key of [workspace.slug, workspace.id]) {
      const body = await preview(workspace, key);
      assert.equal(body.metadata.notFound, true);
      assert.equal(body.title, 'Not Found');
      assert.equal(JSON.stringify(body).includes('Private'), false);
      noContent(f);
    }
  }
  for (const workspace of f.workspaces.slice(0, 2)) {
    for (const key of [workspace.slug, workspace.id]) {
      const body = await preview(workspace, key);
      assert.equal(body.title, `${workspace.slug}-1: Private title ${workspace.slug}`);
      assert.equal(body.metadata.assignee, `Private assignee ${workspace.slug}`);
    }
  }
  f.workspaces[1].members[0].status = false;
  const before = f.calls.issueReads;
  assert.equal((await preview(f.workspaces[1])).metadata.notFound, true);
  assert.equal(f.calls.issueReads, before);
  f.state.mapped = false;
  const queries = f.queries();
  assert.equal((await POST(f.request('POST', undefined, { url: '/own/issues/own-1' }))).status, 401);
  assert.equal(f.queries(), queries);
});

test('issue preview resolver denies revoked metadata and retains owner and active members', async () => {
  const f = issuePreviewFixture(), { GET } = f.route('issues/resolve');
  const resolveIssue = workspace => GET(new Request(`https://collab.example.test/api/issues/resolve?issueKey=${workspace.slug}-1`));
  for (const workspace of f.workspaces.slice(2)) {
    assert.equal((await resolveIssue(workspace)).status, 404);
    noContent(f);
  }
  for (const workspace of f.workspaces.slice(0, 2)) {
    const response = await resolveIssue(workspace);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).workspace.id, workspace.id);
  }
  f.state.mapped = false;
  const queries = f.queries();
  assert.equal((await resolveIssue(f.workspaces[0])).status, 401);
  assert.equal(f.queries(), queries);
});

function invitationFixture() {
  const f = fixture(), queries = [];
  const rows = ['alice@weezboo.com', 'victim@weezboo.com'].map(email => ({
    email, status: 'pending', token: `private-token-${email}`, expiresAt: new Date(Date.now() + 86400000),
  }));
  f.db.workspaceInvitation = { findMany: async ({ where }) => {
    queries.push(where.email);
    return rows.filter(row => row.email === where.email && row.status === where.status && row.expiresAt >= where.expiresAt.gte);
  } };
  const actions = load('src/actions/invitation.ts', f.dependencies);
  return { ...f, queries, actions };
}

test('pending invitations ignores spoofed recipient and queries only current session email', async () => {
  const f = invitationFixture();
  const result = await f.actions.getPendingInvitations('victim@weezboo.com');
  assert.deepEqual(f.queries, ['alice@weezboo.com']);
  assert.equal(result.length, 1);
  assert.equal(result[0].token, 'private-token-alice@weezboo.com');
  assert.equal(JSON.stringify(result).includes('victim'), false);
});

for (const invalidation of ['mapped', 'claims', 'user']) {
  test(`pending invitations denies missing ${invalidation} before any invitation query`, async () => {
    const f = invitationFixture();
    f.state[invalidation] = invalidation === 'user' ? null : false;
    await assert.rejects(f.actions.getPendingInvitations('victim@weezboo.com'), /Unauthorized/);
    assert.deepEqual(f.queries, []);
    noContent(f);
  });
}

for (const hook of ['useInvitation', 'useWorkspace']) {
  test(`pending invitations ${hook} caller uses authenticated action for spoofed cache email`, async () => {
    const f = invitationFixture();
    const dependencies = { ...f.dependencies,
      '@tanstack/react-query': { useQuery: options => options.queryFn() },
      'next-auth/react': {}, './useWorkspace': {},
      '@/actions/invitation': f.actions,
      '@/actions/workspace': load('src/actions/workspace.ts', f.dependencies),
    };
    const { usePendingInvitations } = load(`src/hooks/queries/${hook}.ts`, dependencies);
    const rows = await usePendingInvitations('victim@weezboo.com');
    assert.deepEqual(f.queries, ['alice@weezboo.com']);
    assert.equal(rows[0].email, 'alice@weezboo.com');
  });
}

function relatedIssueFixture() {
  const f = fixture(), reads = [], writes = [];
  const rows = f.workspaces.map(workspace => ({
    id: `issue-${workspace.slug}`, issueKey: `${workspace.slug.toUpperCase()}-1`,
    workspaceId: workspace.id, workspace, projectId: `project-${workspace.slug}`,
    project: { id: `project-${workspace.slug}`, name: `Project ${workspace.slug}`, workspaceId: workspace.id, workspace },
    title: `protected-${workspace.slug}`, type: 'TASK', priority: 'high', status: 'open',
    statusId: null, projectStatus: null, dueDate: new Date(0), createdAt: new Date(0), updatedAt: new Date(0),
    reporterId: 'alice', assigneeId: null, parentId: null, parent: null,
    assignee: null, reporter: { id: 'alice' }, children: [], labels: [], comments: [],
    sourceRelations: [], targetRelations: [],
  }));
  const labels = f.workspaces.map(workspace => ({ id: `label-${workspace.slug}`, name: `label-secret-${workspace.slug}`, workspaceId: workspace.id, workspace }));
  const relations = rows.slice(1).flatMap((row, i) => [
    { id: `out-${i}`, sourceIssueId: rows[0].id, targetIssueId: row.id, relationType: 'BLOCKS', sourceIssue: rows[0], targetIssue: row },
    { id: `in-${i}`, sourceIssueId: row.id, targetIssueId: rows[0].id, relationType: 'BLOCKS', sourceIssue: row, targetIssue: rows[0] },
  ]);
  rows[0].parent = rows[2]; rows[0].parentId = rows[2].id;
  rows[0].children = rows.slice(1); rows[0].labels = labels;
  rows[0].sourceRelations = relations.filter(row => row.sourceIssueId === rows[0].id);
  rows[0].targetRelations = relations.filter(row => row.targetIssueId === rows[0].id);
  function project(row, spec = {}) {
    if (!row || !matches(row, spec.where)) return null;
    const fields = spec.select || spec.include;
    if (!fields) return row;
    if (row.title) reads.push(row.title);
    if (row.name?.startsWith('label-secret')) reads.push(row.name);
    const output = spec.include ? Object.fromEntries(Object.entries(row).filter(([, value]) => value === null || typeof value !== 'object' || value instanceof Date)) : {};
    for (const [key, selection] of Object.entries(fields)) {
      if (!selection) continue;
      if (key === '_count') {
        output[key] = Object.fromEntries(Object.entries(selection.select).map(([name, query]) =>
          [name, (row[name] || []).filter(item => query === true || matches(item, query.where)).length]));
      } else if (selection === true) output[key] = row[key];
      else if (Array.isArray(row[key])) output[key] = row[key].filter(item => matches(item, selection.where)).map(item => project(item, selection));
      else output[key] = project(row[key], selection);
    }
    return output;
  }
  f.db.issue = {
    findFirst: async args => project(rows.find(row => matches(row, args.where)), args),
    findMany: async args => rows.filter(row => matches(row, args.where)).map(row => project(row, args)),
    groupBy: async () => [], count: async ({ where }) => rows.filter(row => matches(row, where)).length,
    create: async ({ data }) => { writes.push(data); return { ...data, id: 'created', labels: [], workspace: f.workspaces[0] }; },
    update: async ({ where, data, ...spec }) => { writes.push(data); return project({ ...rows.find(row => row.id === where.id), ...data }, spec); },
  };
  f.db.issueRelation = {
    findMany: async args => relations.filter(row => matches(row, args.where)).map(row => project(row, args)),
    create: async ({ data }) => { writes.push(data); return data; },
  };
  f.db.taskLabel = { count: async ({ where }) => labels.filter(row => matches(row, where)).length };
  f.db.project.findUnique = async ({ where }) => {
    const row = rows.find(row => row.projectId === where.id);
    return row ? { ...row.project, nextIssueNumbers: { TASK: 1 }, issuePrefix: 'NEW' } : null;
  };
  f.db.project.update = async ({ data }) => { writes.push(data); return data; };
  f.db.projectStatus = { findMany: async () => [], findFirst: async () => null };
  f.db.issueAssignee = { create: async ({ data }) => { writes.push(data); } };
  f.db.issueActivity = { create: async ({ data }) => { writes.push(data); return data; } };
  f.db.issueFollower = { findMany: async () => [] }; f.db.projectFollower = { findMany: async () => [] };
  f.db.featureRequest = { findMany: async () => [] }; f.db.note = { findMany: async () => [] };
  f.db.repository.findFirst = async () => null;
  f.dependencies['@prisma/client'] = require('@prisma/client');
  f.dependencies['@/utils/html-normalizer'] = { normalizeDescriptionHTML: value => value };
  f.dependencies['@/utils/issueRelations'] = load('src/utils/issueRelations.ts');
  f.dependencies['@/lib/secrets/access'] = load('src/lib/secrets/access.ts', f.dependencies);
  f.dependencies['@/lib/board-item-activity-service'] = { trackCreation: async () => { f.calls.writes++; } };
  f.dependencies['@/lib/redis'] = { publishEvent: async () => { f.calls.writes++; } };
  f.dependencies['@/lib/event-bus'] = { emitIssueCreated: async () => { f.calls.writes++; }, emitIssueUpdated: async () => { f.calls.writes++; } };
  return { ...f, rows, labels, reads, writes, project };
}

for (const endpoint of ['relations', 'detail', 'list', 'summary']) {
  test(`related issue ${endpoint} filters historical revoked associations and retains authorized peers`, async () => {
    const f = relatedIssueFixture(), own = f.workspaces[0];
    if (endpoint === 'summary') own.members.push({ userId: 'alice', user: f.state.user, status: true });
    const invoke = async () => {
      if (endpoint === 'relations') return f.route('workspaces/[workspaceId]/issues/[issueKey]/relations').GET(f.request(), { params: Promise.resolve({ workspaceId: own.id, issueKey: 'issue-own' }) });
      if (endpoint === 'detail') return f.route('issues/[issueId]').GET(f.request(), { params: Promise.resolve({ issueId: 'issue-own' }) });
      if (endpoint === 'list') return f.route('issues').GET(f.request('GET', own.id));
      return f.route('projects/[projectId]/summary').GET(f.request(), { params: Promise.resolve({ projectId: 'project-own' }) });
    };
    let response = await invoke();
    assert.equal(response.status, 200);
    let body = JSON.stringify(await response.json());
    for (const forbidden of ['protected-revoked', 'protected-foreign', 'label-secret-revoked', 'label-secret-foreign']) {
      assert.equal(body.includes(forbidden), false, forbidden);
      assert.equal(f.reads.includes(forbidden), false, `read ${forbidden}`);
    }
    if (endpoint !== 'summary') assert.equal(body.includes('protected-joined'), true);
    own.members.length = 0;
    f.rows[0].parent = f.rows[1];
    f.rows[0].parentId = f.rows[1].id;
    assert.equal(JSON.stringify(await (await invoke()).json()).includes('protected-joined'), true);
    f.workspaces[1].members[0].status = false;
    f.reads.length = 0;
    response = await invoke();
    assert.equal(response.status, 200);
    body = JSON.stringify(await response.json());
    assert.equal(body.includes('protected-joined'), false);
    assert.equal(f.reads.includes('protected-joined'), false);
    assert.equal(body.includes('protected-own'), endpoint !== 'relations');
    assert.deepEqual(f.writes, []);
  });
}

for (const refs of [
  { parentId: 'issue-revoked' }, { parentId: 'missing' },
  { labels: ['label-own', 'label-revoked'] }, { labels: ['missing'] },
  { assigneeId: 'outsider' }, { reporterId: 'outsider' },
]) {
  test(`issue creation rejects destination references ${JSON.stringify(refs)} without writes or notifications`, async () => {
    const f = relatedIssueFixture();
    const response = await f.route('issues').POST(f.request('POST', undefined, {
      title: 'New', workspaceId: f.workspaces[0].id, projectId: 'project-own', ...refs,
    }));
    assert.equal(response.status, 400);
    assert.deepEqual(f.writes, []);
    assert.equal(f.calls.writes, 0);
  });
}

for (const slug of ['own', 'joined']) {
  test(`issue creation preserves ${slug} access and valid parent labels participants`, async () => {
    const f = relatedIssueFixture(), workspace = f.workspaces.find(row => row.slug === slug);
    const response = await f.route('issues').POST(f.request('POST', undefined, {
      title: 'New', workspaceId: workspace.id, projectId: `project-${slug}`,
      parentId: `issue-${slug}`, labels: [`label-${slug}`], assigneeId: 'alice', reporterId: 'alice',
    }));
    assert.equal(response.status, 201);
    assert.equal(f.writes[0].workspaceId, workspace.id);
    assert.equal(f.writes[0].parentId, `issue-${slug}`);
    assert.equal(f.writes[0].labels.connect[0].id, `label-${slug}`);
  });
}

for (const endpoint of ['apps/auth/issues/[issueIdOrKey]', 'apps/auth/issues/[issueIdOrKey]/relations']) {
  test(`related issue app scope filters historical foreign associations in ${endpoint}`, async () => {
    const f = relatedIssueFixture();
    f.dependencies['@/lib/apps/auth-middleware'] = { withAppAuth: handler => handler };
    const response = await f.route(endpoint).GET(f.request(), { workspace: f.workspaces[0], user: { id: 'alice' } },
      { params: Promise.resolve({ issueIdOrKey: 'issue-own' }) });
    assert.equal(response.status, 200);
    const body = JSON.stringify(await response.json());
    for (const slug of ['joined', 'revoked', 'foreign']) {
      assert.equal(body.includes(`protected-${slug}`), false);
      assert.equal(f.reads.includes(`protected-${slug}`), false);
    }
  });
}

test('issue creation app rejects mixed cross-workspace labels without writes', async () => {
  const f = relatedIssueFixture(), projectId = 'c0000000000000000000000020';
  f.rows[0].projectId = projectId; f.rows[0].project.id = projectId;
  f.db.project.findFirst = async ({ where }) => f.rows.map(row => row.project).find(row => matches(row, where)) ?? null;
  f.dependencies['@/lib/apps/auth-middleware'] = { withAppAuth: handler => handler };
  const response = await f.route('apps/auth/issues').POST(f.request('POST', undefined, {
    title: 'New', projectId, labels: ['label-own', 'label-revoked'],
  }), { workspace: f.workspaces[0], user: { id: 'alice' } });
  assert.equal(response.status, 400);
  assert.deepEqual(f.writes, []);
  assert.equal(f.calls.writes, 0);
});

test('issue creation app update rejects foreign parent and mixed labels without writes', async () => {
  const f = relatedIssueFixture();
  f.rows[2].id = 'c0000000000000000000000021';
  f.dependencies['@/lib/apps/auth-middleware'] = { withAppAuth: handler => handler };
  for (const fields of [{ parentId: f.rows[2].id }, { labels: ['label-own', 'label-revoked'] }]) {
    const response = await f.route('apps/auth/issues/[issueIdOrKey]').PATCH(f.request('PATCH', undefined, fields),
      { workspace: f.workspaces[0], user: { id: 'alice' } }, { params: Promise.resolve({ issueIdOrKey: 'issue-own' }) });
    assert.equal(response.status, 400);
    assert.deepEqual(f.writes, []);
    assert.equal(f.calls.writes, 0);
  }
});

function appTokenFixture(system = false, workspaceIndex = 2) {
  const f = fixture(), workspace = f.workspaces[workspaceIndex];
  const app = { id: 'app', name: 'App', slug: 'app', status: 'PUBLISHED', isSystemApp: system };
  const token = { id: 'token', accessToken: 'Y2lwaGVy', isRevoked: false, userId: 'alice',
    scopes: ['issues:read', 'issues:write'], tokenExpiresAt: null,
    ...(system ? { installationId: null, appId: app.id, workspaceId: workspace.id, app, workspace } : {
      installation: { id: 'installation', appId: app.id, status: 'ACTIVE', workspaceId: workspace.id,
        installedById: 'installer', scopes: [], app, workspace },
    }) };
  f.db.appToken = { findMany: async ({ where }) => matches(token, where) ? [token] : [] };
  f.db.app = { findUnique: async () => app };
  f.dependencies['@/lib/oauth-scopes'] = load('src/lib/oauth-scopes.ts');
  f.dependencies['@/lib/apps/crypto'] = { decryptToken: async () => 'test-token' };
  const auth = load('src/lib/apps/auth-middleware.ts', f.dependencies);
  const dispatched = [];
  const handler = auth.withAppAuth(async (_request, context) => {
    dispatched.push(context); f.calls.writes++; return Response.json({ ok: true });
  }, { requiredScopes: 'issues:write' });
  const request = (query = '') => new Request(`https://collab.example.test/api/apps/auth/issues?${query}`, {
    headers: { Authorization: 'Bearer test-token' },
  });
  return { ...f, token, app, dispatched, handler, request };
}

for (const system of [false, true]) {
  test(`app token ${system ? 'system' : 'installed'} rechecks original workspace before dispatch`, async () => {
    const f = appTokenFixture(system);
    const queries = system ? ['', 'workspace=revoked', `workspaceId=${f.workspaces[2].id}`] : [''];
    for (const query of queries) assert.equal((await f.handler(f.request(query))).status, 403);
    assert.deepEqual(f.dispatched, []); assert.equal(f.calls.writes, 0);
    f.workspaces[2].members[0].status = true;
    assert.equal((await f.handler(f.request())).status, 200);
    assert.equal(f.dispatched[0].user.id, 'alice');
    assert.equal(f.dispatched[0].installation.userId, 'alice');
    f.workspaces[2].members[0].status = false;
    f.workspaces[2].ownerId = 'alice';
    assert.equal((await f.handler(f.request())).status, 200);
    f.state.user = null;
    assert.equal((await f.handler(f.request())).status, 401);
    assert.equal(f.dispatched.length, 2);
  });
}

test('app token keeps scopes, installations and effective workspace access independent', async () => {
  const f = appTokenFixture(true);
  for (const target of ['own', 'joined']) assert.equal((await f.handler(f.request(`workspace=${target}`))).status, 200);
  assert.equal((await f.handler(f.request('workspace=foreign'))).status, 403);
  f.token.scopes = [];
  assert.equal((await f.handler(f.request('workspace=own'))).status, 403);
  assert.equal(f.dispatched.length, 2);
  const regular = appTokenFixture(false, 0);
  assert.equal((await regular.handler(regular.request('workspace=joined'))).status, 403);
  regular.token.installation.status = 'INACTIVE';
  assert.equal((await regular.handler(regular.request())).status, 401);
  assert.equal(regular.dispatched.length, 0);
});

function savedViewFixture() {
  const f = fixture(), reads = [], writes = [];
  const projects = f.workspaces.map(workspace => ({ id: `project-${workspace.slug}`, workspace,
    workspaceId: workspace.id, name: `private-project-${workspace.slug}`, slug: workspace.slug,
    issuePrefix: workspace.slug, statuses: [{ name: `private-status-${workspace.slug}` }] }));
  const view = { id: 'view', slug: 'view', name: 'Saved view', displayType: 'LIST', visibility: 'WORKSPACE',
    workspaceId: f.workspaces[0].id, workspace: f.workspaces[0], ownerId: 'alice', sharedWith: [],
    projectIds: projects.map(p => p.id), filters: {}, createdAt: new Date(), updatedAt: new Date() };
  f.db.project.count = async ({ where }) => projects.filter(p => matches(p, where)).length;
  f.db.project.findMany = async ({ where, select }) => projects.filter(p => matches(p, where)).map(p => {
    if (select?.name) reads.push(p.name);
    return p;
  });
  f.db.view.findFirst = async ({ where }) => matches(view, where) ? view : null;
  f.db.view.create = async ({ data }) => { writes.push(data); return { ...view, ...data }; };
  f.db.view.update = async ({ data }) => { writes.push(data); return { ...view, ...data }; };
  f.db.issue.findMany = async () => [];
  f.dependencies['react/jsx-runtime'] = { jsx: (_type, props) => props };
  f.dependencies['next/navigation'] = { notFound: () => { throw new Error('Not found'); } };
  f.dependencies['@/components/views/ViewRenderer'] = { default: () => null };
  return { ...f, projects, view, reads, writes };
}

for (const endpoint of ['create', 'scoped-update', 'slug-update']) {
  test(`saved view ${endpoint} rejects mixed inaccessible projects without writes`, async () => {
    const f = savedViewFixture(), workspaceId = f.workspaces[0].id;
    const invoke = projectIds => {
      const creating = endpoint === 'create';
      const route = f.route(creating ? 'workspaces/[workspaceId]/views' : endpoint === 'scoped-update'
        ? 'workspaces/[workspaceId]/views/[viewId]' : 'views/[viewId]');
      return route[creating ? 'POST' : 'PUT'](f.request(creating ? 'POST' : 'PUT', workspaceId,
        creating ? { name: 'View', displayType: 'LIST', projectIds } : { projectIds }), f.context(workspaceId));
    };
    for (const invalid of [['project-own', 'project-revoked'], ['project-foreign'], ['missing']]) {
      assert.equal((await invoke(invalid)).status, 400);
      assert.deepEqual(f.writes, []);
      assert.deepEqual(f.reads, []);
    }
    for (const valid of [['project-own', 'project-joined'], [], ['project-own', 'project-own']]) {
      assert.equal((await invoke(valid)).status, endpoint === 'create' ? 201 : 200);
    }
    assert.equal(f.writes.length, 3);
    f.workspaces[1].members[0].status = false;
    assert.equal((await invoke(['project-own', 'project-joined'])).status, 400);
    assert.equal(f.writes.length, 3);
  });
}

test('saved view page filters historical project metadata before retrieval across revocation', async () => {
  const f = savedViewFixture();
  const page = load('src/app/(main)/[workspaceId]/views/[viewId]/page.tsx', f.dependencies);
  const params = Promise.resolve({ workspaceId: 'own', viewId: 'view' });
  let result = await page.default({ params });
  assert.deepEqual(Array.from(result.view.projects, p => p.id), ['project-own', 'project-joined']);
  assert.deepEqual(f.reads, ['private-project-own', 'private-project-joined']);
  assert.equal(JSON.stringify(result.view).includes('revoked'), false);
  f.workspaces[1].members[0].status = false; f.reads.length = 0;
  result = await page.default({ params });
  assert.deepEqual(Array.from(result.view.projects, p => p.id), ['project-own']);
  assert.deepEqual(f.reads, ['private-project-own']);
  assert.equal((await page.generateMetadata({ params })).title, 'Saved view - own');
  f.workspaces[0].ownerId = 'bob';
  assert.equal((await page.generateMetadata({ params })).title, 'View Not Found');
  await assert.rejects(page.default({ params }), /Not found/);
});

for (const endpoint of ['views/[viewId]', 'search/issues-by-activity']) {
  test(`app ${endpoint} excludes historical foreign labels before response projection`, async () => {
    const f = relatedIssueFixture(), own = f.workspaces[0];
    const context = { workspace: own, user: f.state.user };
    f.dependencies['@/lib/apps/auth-middleware'] = { withAppAuth: handler => (req, params) => handler(req, context, params) };
    f.db.view.findFirst = async () => ({ id: 'view', projectIds: ['project-own'] });
    f.db.view.update = async () => ({});
    f.db.issueActivity.findMany = async () => [{ itemId: 'issue-own', action: 'UPDATED', userId: 'alice' }];
    const invoke = async () => {
      const response = await f.route(`apps/auth/${endpoint}`).GET(new Request(
        'https://collab.example.test/?includeIssues=true&includeActivity=false'), f.context(own.id));
      assert.equal(response.status, 200);
      return response.json();
    };
    for (const member of [false, true]) {
      if (member) { own.ownerId = 'bob'; own.members.push({ userId: 'alice', status: true }); }
      const body = await invoke();
      const issues = body.issues || body.results;
      assert.equal(issues.length, 1);
      assert.deepEqual(issues[0].labels.map(label => label.id), ['label-own']);
      for (const suffix of ['joined', 'revoked', 'foreign']) {
        assert.equal(JSON.stringify(body).includes(`label-secret-${suffix}`), false);
        assert.equal(f.reads.includes(`label-secret-${suffix}`), false);
      }
    }
  });
}

for (const endpoint of ['related', 'suggestions']) {
  test(`AI ${endpoint} excludes historical revoked labels before processing`, async () => {
    const f = relatedIssueFixture(), retrieved = [];
    const read = f.db.issue.findFirst;
    f.db.issue.findFirst = async args => {
      const row = await read(args);
      retrieved.push(...row.labels.map(label => label.id));
      return row;
    };
    f.db.issueActivity.findFirst = async () => null;
    f.db.issueActivity.findMany = async () => [];
    f.db.project.findMany = async () => [];
    f.db.issueRelation.findMany = async () => [];
    const response = await f.route(`ai/issues/${endpoint}`).GET(new Request(
      `https://collab.example.test/?workspaceId=${f.workspaces[0].id}&issueId=issue-own`));
    assert.equal(response.status, 200);
    assert.deepEqual(retrieved, ['label-own', 'label-joined']);
    assert.equal(JSON.stringify(await response.json()).includes('label-secret-revoked'), false);
  });
}

test('priority updates preserve saved High view results and counts with validation and rights checks', async () => {
  const f = savedViewFixture(), workspace = f.workspaces[0];
  const issue = { id: 'issue-own', workspaceId: workspace.id, workspace, projectId: 'project-own',
    project: f.projects[0], statusId: null, projectStatus: null, priority: 'HIGH', reporterId: 'alice', title: 'High priority issue', updatedAt: new Date() };
  f.view.projectIds = ['project-own'];
  f.view.filters = { priority: ['HIGH'] };
  let canEdit = true;
  const permissions = load('src/lib/permissions.ts', { './prisma': { prisma: f.db } });
  f.dependencies['@/lib/permissions'] = { ...permissions,
    checkUserPermissions: async (_user, _workspace, requested) => Object.fromEntries(
      requested.map(permission => [permission, { hasPermission: canEdit }])),
  };
  f.dependencies['@prisma/client'] = require('@prisma/client');
  f.dependencies['@/utils/html-normalizer'] = { normalizeDescriptionHTML: value => value };
  f.dependencies['@/lib/board-item-activity-service'] = { compareObjects: () => [] };
  f.dependencies['@/lib/redis'] = { publishEvent: async () => {} };
  f.dependencies['@/lib/event-bus'] = { emitIssueUpdated: async () => {} };
  f.db.issue.findFirst = async ({ where }) => matches(issue, where) ? { ...issue } : null;
  f.db.issue.findMany = async ({ where }) => matches(issue, where) ? [{ ...issue }] : [];
  f.db.issue.update = async ({ data }) => {
    f.writes.push(data); Object.assign(issue, data); return { ...issue };
  };
  const { PUT } = f.route('issues/[issueId]');
  const update = priority => PUT(f.request('PUT', workspace.id, { priority }), {
    params: Promise.resolve({ issueId: issue.id }),
  });
  const page = load('src/app/(main)/[workspaceId]/views/[viewId]/page.tsx', f.dependencies);
  const highView = () => page.default({ params: Promise.resolve({ workspaceId: workspace.id, viewId: 'view' }) });
  let result = await highView();
  assert.equal(result.view.issueCount, 1);
  assert.equal(result.issues[0].id, issue.id);
  for (const invalid of ['root', '', ' HIGH ', null, 1]) {
    assert.equal((await update(invalid)).status, 400);
    assert.equal(f.writes.length, 0);
  }
  canEdit = false;
  assert.equal((await update('HIGH')).status, 403);
  assert.equal(f.writes.length, 0);
  canEdit = true;
  for (const input of ['HIGH', 'high', 'High']) {
    const response = await update(input);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).issue.priority, 'HIGH');
    result = await highView();
    assert.equal(result.view.issueCount, 1);
    assert.equal(result.issues[0].id, issue.id);
    assert.equal(result.issues[0].priority, 'HIGH');
  }
  for (const input of ['low', 'MEDIUM', 'Urgent']) {
    assert.equal((await update(input)).status, 200);
    assert.equal(issue.priority, input.toUpperCase());
    assert.equal((await highView()).view.issueCount, 0);
  }
  const writes = f.writes.length;
  workspace.ownerId = 'bob';
  assert.equal((await update('HIGH')).status, 404);
  assert.equal(f.writes.length, writes);
  f.state.mapped = false;
  assert.equal((await update('HIGH')).status, 401);
  assert.equal(f.writes.length, writes);
});

for (const association of ['project', 'status']) {
  for (const endpoint of ['detail', 'list', 'search', 'relations', 'app-view', 'app-activity']) {
    test(`historical ${association} association denies revoked metadata in ${endpoint}`, async () => {
      const f = relatedIssueFixture(), own = f.workspaces[0], joined = f.workspaces[1];
      const foreignProject = { ...f.rows[1].project, name: 'associated-project-secret', description: 'associated-description-secret' };
      const status = { id: 'associated-status', name: 'associated-status-secret', project: foreignProject };
      const affected = endpoint === 'relations' ? f.rows[2] : f.rows[0];
      if (endpoint === 'relations') {
        affected.workspaceId = own.id; affected.workspace = own;
        affected.project = f.rows[0].project; affected.projectId = f.rows[0].projectId;
      }
      if (association === 'project') {
        affected.project = foreignProject; affected.projectId = foreignProject.id;
      } else {
        affected.projectStatus = status; affected.statusId = status.id;
      }
      f.dependencies['@/lib/apps/auth-middleware'] = { withAppAuth: handler => (req, params) => handler(req,
        { workspace: own, user: f.state.user }, params) };
      f.db.view.findFirst = async () => ({ id: 'view', projectIds: [] });
      f.db.view.update = async () => ({});
      f.db.issueActivity.findMany = async () => [{ itemId: affected.id, action: 'UPDATED', userId: 'alice' }];
      const invoke = () => {
        if (endpoint === 'detail') return f.route('issues/[issueId]').GET(f.request(), { params: Promise.resolve({ issueId: affected.id }) });
        if (endpoint === 'list') return f.route('issues').GET(f.request('GET', own.id));
        if (endpoint === 'search') return f.route('issues/search').GET(f.request('GET', own.id));
        if (endpoint === 'relations') return f.route('workspaces/[workspaceId]/issues/[issueKey]/relations').GET(f.request(),
          { params: Promise.resolve({ workspaceId: own.id, issueKey: f.rows[0].id }) });
        const path = endpoint === 'app-view' ? 'views/[viewId]' : 'search/issues-by-activity';
        return f.route('apps/auth/' + path).GET(new Request('https://collab.example.test/?includeIssues=true&includeActivity=false'), f.context(own.id));
      };
      let response = await invoke();
      assert.equal(response.status, 200);
      assert.equal(JSON.stringify(await response.json()).includes(affected.title), true);
      joined.members[0].status = false;
      f.reads.length = 0;
      response = await invoke();
      assert.equal(response.status, endpoint === 'detail' ? 404 : 200);
      const body = JSON.stringify(await response.json());
      assert.equal(body.includes(affected.title), false);
      assert.equal(body.includes('associated-project-secret'), false);
      assert.equal(body.includes('associated-status-secret'), false);
      assert.equal(f.reads.includes(affected.title), false);
      joined.ownerId = 'alice';
      response = await invoke();
      assert.equal(response.status, 200);
      assert.equal(JSON.stringify(await response.json()).includes(affected.title), true);
      assert.deepEqual(f.writes, []);
    });
  }
}

test('historical view positions filter related issues before metadata retrieval after revocation', async () => {
  const f = relatedIssueFixture(), own = f.workspaces[0];
  const view = { id: 'view', workspaceId: own.id, workspace: own, ownerId: 'alice', visibility: 'WORKSPACE' };
  const positions = f.rows.map((issue, index) => ({ id: `position-${index}`, viewId: view.id, issueId: issue.id,
    columnId: 'column', position: index, issue }));
  f.db.view.findFirst = async ({ where }) => matches(view, where) ? view : null;
  f.db.viewIssuePosition = { findMany: async args => positions.filter(row => matches(row, args.where)).map(row => f.project(row, args)) };
  f.dependencies['@/constants/viewPositions'] = load('src/constants/viewPositions.ts');
  const { GET } = f.route('views/[viewId]/issue-positions');
  const read = async () => {
    const response = await GET(f.request(), f.context(own.id));
    assert.equal(response.status, 200); return response.json();
  };
  let body = await read();
  assert.deepEqual(body.positions.map(row => row.issueId), ['issue-own', 'issue-joined']);
  assert.equal(f.reads.includes('protected-revoked'), false);
  f.workspaces[1].members[0].status = false; f.reads.length = 0;
  body = await read();
  assert.deepEqual(body.positions.map(row => row.issueId), ['issue-own']);
  assert.equal(f.reads.includes('protected-joined'), false);
  f.workspaces[1].ownerId = 'alice';
  assert.deepEqual((await read()).positions.map(row => row.issueId), ['issue-own', 'issue-joined']);
  assert.equal(positions.length, 4);
  assert.deepEqual(f.writes, []);
});

for (const association of ['project', 'status']) {
  test(`app issue mutation denies historical ${association} revocation before writes`, async () => {
    const f = relatedIssueFixture(), own = f.workspaces[0], joined = f.workspaces[1];
    const issue = f.rows[0], foreignProject = f.rows[1].project;
    if (association === 'project') {
      issue.project = foreignProject; issue.projectId = foreignProject.id;
    } else {
      issue.projectStatus = { id: 'historic-status', name: 'private-status', project: foreignProject };
      issue.statusId = issue.projectStatus.id;
    }
    f.dependencies['@/lib/apps/auth-middleware'] = { withAppAuth: handler => (req, params) => handler(req,
      { workspace: own, user: f.state.user }, params) };
    f.db.issue.delete = async args => { f.writes.push(args); };
    const route = f.route('apps/auth/issues/[issueIdOrKey]');
    const call = method => route[method](f.request(method, own.id, { title: 'edited' }),
      { params: Promise.resolve({ issueIdOrKey: issue.id }) });
    assert.equal((await call('PATCH')).status, 200);
    joined.members[0].status = false;
    f.writes.length = 0; f.calls.writes = 0;
    for (const method of ['PATCH', 'DELETE']) {
      const response = await call(method);
      assert.equal(response.status, 404);
      assert.equal(JSON.stringify(await response.json()).includes('private-status'), false);
      assert.deepEqual(f.writes, []);
      assert.equal(f.calls.writes, 0);
    }
    joined.ownerId = 'alice';
    const response = await call('PATCH');
    assert.equal(response.status, 200);
    assert.equal((await response.json()).title, 'edited');
    assert.equal(f.writes.length, 1);
  });
}

for (const endpoint of ['notes', 'notes/[id]']) {
  test(`historical Notes project access gates ${endpoint} while retaining personal notes`, async () => {
    const f = relatedIssueFixture(), own = f.workspaces[0], joined = f.workspaces[1];
    const note = { id: 'note', title: 'historical-note', authorId: 'alice', author: { id: 'alice' },
      scope: 'WORKSPACE', type: 'GENERAL', workspaceId: own.id, workspace: own,
      projectId: f.rows[1].projectId, project: { ...f.rows[1].project, name: 'note-project-secret' },
      isEncrypted: false, isRestricted: false, expiresAt: null, sharedWith: [], tags: [], comments: [] };
    const personal = { ...note, id: 'personal', title: 'personal-note', scope: 'PERSONAL',
      workspaceId: null, workspace: null, projectId: null, project: null };
    const notes = [note, personal];
    const metadataReads = [];
    const read = args => {
      const row = notes.find(row => matches(row, args.where));
      if (row && args.include?.project) metadataReads.push(row.project?.name);
      return f.project(row, args);
    };
    f.db.note = {
      findUnique: async args => read(args), findFirst: async args => read(args),
      findMany: async args => notes.filter(row => matches(row, args.where)).map(row => read({ ...args, where: { id: row.id } })),
    };
    f.dependencies['@/lib/secrets/access'] = load('src/lib/secrets/access.ts', f.dependencies);
    f.dependencies['@/lib/secrets/crypto'] = { isSecretNoteType: () => false };
    f.dependencies['@/lib/versioning'] = {};
    const { GET } = f.route(endpoint);
    const call = id => GET(f.request(), { params: Promise.resolve({ id: id || note.id }) });
    assert.equal((await call()).status, 200);
    joined.members[0].status = false; metadataReads.length = 0;
    for (const scope of ['WORKSPACE', 'PROJECT', 'PUBLIC', 'PERSONAL', 'SHARED']) {
      note.scope = scope;
      const response = await call();
      assert.equal(response.status, endpoint === 'notes' ? 200 : 404);
      const body = JSON.stringify(await response.json());
      assert.equal(body.includes('note-project-secret'), false);
      assert.equal(body.includes('historical-note'), false);
    }
    assert.equal(metadataReads.includes('note-project-secret'), false);
    assert.equal(JSON.stringify(await (await call('personal')).json()).includes('personal-note'), true);
    note.scope = 'WORKSPACE'; joined.ownerId = 'alice';
    const response = await call();
    assert.equal(response.status, 200);
    assert.equal(JSON.stringify(await response.json()).includes('note-project-secret'), true);
    assert.deepEqual(f.writes, []);
    assert.equal(notes.length, 2);
  });
}

for (const endpoint of ['workspaces/[workspaceId]/planning/activity', 'timeline/unified',
  'apps/auth/issues/[issueIdOrKey]/activity', 'issues/[issueId]/activities',
  'apps/auth/workspace/activity', 'apps/auth/projects/[projectId]/activity', 'apps/auth/search/issues-by-activity']) {
  test(`historical activity status access filters both relations in ${endpoint}`, async () => {
    const f = relatedIssueFixture(), own = f.workspaces[0], joined = f.workspaces[1];
    const current = f.rows[0], accessedStatuses = [];
    const privateStatus = { id: 'historic-status', name: 'historic-private-status',
      displayName: 'Historic private status', project: f.rows[1].project, color: 'red' };
    const publicStatus = { id: 'current-status', name: 'current-public-status', project: current.project, color: 'green' };
    current.statusId = publicStatus.id; current.projectStatus = publicStatus;
    const activities = [];
    f.db.issueActivity.create = async ({ data }) => {
      const row = { ...data, oldValue: data.oldValue ?? null, newValue: data.newValue ?? null, details: data.details ?? null, id: `activity-${activities.length}`, createdAt: new Date(),
        oldStatusId: data.oldStatusId ?? null, newStatusId: data.newStatusId ?? null,
        oldStatus: [privateStatus, publicStatus].find(status => status.id === data.oldStatusId) ?? null,
        newStatus: [privateStatus, publicStatus].find(status => status.id === data.newStatusId) ?? null,
        user: { id: 'alice' } };
      activities.push(row); return row;
    };
    const { trackStatusChange } = load('src/lib/board-item-activity-service.ts', f.dependencies);
    for (const [oldStatus, newStatus] of [[privateStatus, publicStatus], [publicStatus, privateStatus], [null, publicStatus]]) {
      await trackStatusChange({ itemId: current.id, itemType: 'ISSUE', workspaceId: own.id, projectId: current.projectId,
        userId: 'alice', oldStatusId: oldStatus?.id ?? null, newStatusId: newStatus.id,
        oldStatusName: oldStatus?.name, newStatusName: newStatus.name });
    }
    f.dependencies['date-fns'] = require('date-fns');
    f.dependencies['@/lib/apps/auth-middleware'] = { withAppAuth: handler => (req, params) => handler(req,
      { workspace: own, user: f.state.user }, params) };
    f.db.issue.findUnique = f.db.issue.findFirst;
    f.db.user.findMany = async () => [];
    f.db.issueActivity.count = async ({ where }) => activities.filter(row => matches(row, where)).length;
  f.db.issueActivity.findFirst = async args => (await f.db.issueActivity.findMany(args))[0] ?? null;
    f.db.issueActivity.findMany = async args => activities.filter(row => matches(row, args.where)).map(row => {
      const result = f.project(row, args);
      for (const name of ['oldStatus', 'newStatus']) if (result[name]) accessedStatuses.push(result[name].name);
      return result;
    });
    const { GET } = f.route(endpoint);
    const call = () => GET(new Request(`https://collab.example.test/?workspaceId=${own.id}&startDate=2026-09-01&endDate=2026-09-02`),
      { params: Promise.resolve({ workspaceId: own.id, issueId: current.id, issueIdOrKey: current.id, projectId: current.projectId }) });
    let response = await call();
    assert.equal(response.status, 200);
    assert.equal(JSON.stringify(await response.json()).includes('historic-private-status'), true);
    joined.members[0].status = false; accessedStatuses.length = 0;
    for (const missing of (endpoint.includes('planning/') || endpoint === 'timeline/unified' || endpoint.endsWith('workspace/activity')) ? [false, true] : [false]) {
      if (missing) activities.forEach(row => { row.itemId = 'deleted-issue'; });
      response = await call();
      assert.equal(response.status, 200);
      const body = JSON.stringify(await response.json());
      assert.equal(body.includes('historic-private-status'), false);
      assert.equal(body.includes('Historic private status'), false);
      assert.equal(body.includes('activity-0'), false);
      assert.equal(body.includes('activity-1'), false);
      assert.equal(body.includes('current-public-status'), !missing);
      const result = JSON.parse(body);
      if (result.stats) assert.equal(result.stats.todayCount, missing ? 0 : 1);
      if (endpoint === 'apps/auth/workspace/activity') assert.equal(result.pagination.total, missing ? 0 : 1);
    }
    assert.equal(accessedStatuses.includes('historic-private-status'), false);
    activities.forEach(row => { row.itemId = current.id; });
    joined.ownerId = 'alice';
    assert.equal(JSON.stringify(await (await call()).json()).includes('historic-private-status'), true);
    assert.deepEqual(f.writes, []);
    assert.equal(activities[0].oldStatus, privateStatus);
  });
}

function noteTagFixture() {
  const f = relatedIssueFixture(), own = f.workspaces[0];
  const tags = f.workspaces.map(workspace => ({ id: `tag-${workspace.slug}`, name: `label-secret-tag-${workspace.slug}`,
    workspaceId: workspace.id, workspace, authorId: 'alice', color: 'red' }));
  tags.push({ id: 'personal', name: 'label-secret-tag-personal', authorId: 'alice', workspaceId: null, workspace: null });
  tags.push({ id: 'private', name: 'label-secret-tag-private', authorId: 'bob', workspaceId: null, workspace: null });
  const note = { id: 'note', title: 'Note', content: 'Note content', authorId: 'alice', author: { id: 'alice' },
    scope: 'WORKSPACE', type: 'GUIDE', workspaceId: own.id, workspace: own, projectId: null, project: null,
    isEncrypted: false, isRestricted: false, expiresAt: null, sharedWith: [{ userId: 'alice', permission: 'EDIT' }],
    tags, comments: [], isPinned: true, isAiContext: true, version: 1, createdAt: new Date(), updatedAt: new Date() };
  f.db.noteTag = { count: async ({ where }) => tags.filter(row => matches(row, where)).length };
  f.db.note = {
    findUnique: async args => f.project(note, args), findFirst: async args => f.project(note, args),
    findMany: async args => matches(note, args.where) ? [f.project(note, args)] : [],
    count: async ({ where }) => matches(note, where) ? 1 : 0,
    update: async ({ data, ...args }) => {
      f.writes.push(data);
      return f.project({ ...note, ...data, tags: data.tags?.set ? tags.filter(tag => data.tags.set.some(ref => ref.id === tag.id)) : note.tags }, args);
    },
    create: async ({ data, ...args }) => {
      f.writes.push(data);
      return f.project({ ...note, ...data, tags: tags.filter(tag => data.tags?.connect?.some(ref => ref.id === tag.id)) }, args);
    },
  };
  f.dependencies['@/lib/secrets/crypto'] = { isSecretNoteType: () => false };
  f.dependencies['@/lib/versioning'] = { createInitialVersion: async () => { f.calls.writes++; } };
  f.dependencies['@/lib/event-bus'] = { emitContextCreated: async () => { f.calls.writes++; }, emitContextUpdated: async () => { f.calls.writes++; } };
  f.dependencies['@/lib/html-sanitizer'] = { stripHtmlToPlainText: value => value };
  f.dependencies['@/lib/apps/auth-middleware'] = { withAppAuth: handler => (req, params) => handler(req,
    { workspace: own, user: f.state.user }, params) };
  function call(path, method = 'GET', body = {}) {
    const request = new Request(`https://collab.example.test/?workspaceId=${own.id}&workspace=${own.id}&q=Note`, {
      method, ...(method === 'GET' ? {} : { body: JSON.stringify(body) }),
    });
    request.nextUrl = new URL(request.url);
    return f.route(path)[method](request, { params: Promise.resolve({ id: 'note', workspaceId: own.id }) });
  }
  return { ...f, tags, note, call };
}

for (const [path, method] of [
  ['notes', 'GET'], ['notes/[id]', 'GET'], ['notes/[id]', 'PATCH'], ['notes/[id]/pin', 'POST'],
  ['notes/pinned', 'GET'], ['notes/shared-with-me', 'GET'], ['notes/search', 'GET'],
  ['workspaces/[workspaceId]/coclaw/memory', 'GET'],
  ['apps/auth/context', 'GET'], ['apps/auth/context/[id]', 'GET'], ['apps/auth/context/[id]', 'PUT'],
  ['apps/auth/context/knowledge', 'GET'], ['apps/auth/context/knowledge/[id]', 'GET'],
]) {
  test(`Notes tag projection ${method} ${path} filters historical tags before retrieval`, async () => {
    const f = noteTagFixture(), joined = f.workspaces[1];
    const read = async () => {
      const response = await f.call(path, method, { pin: true });
      assert.equal(response.status, 200);
      return JSON.stringify(await response.json());
    };
    let body = await read();
    for (const denied of ['revoked', 'foreign', 'private']) {
      assert.equal(body.includes(`label-secret-tag-${denied}`), false);
      assert.equal(f.reads.includes(`label-secret-tag-${denied}`), false);
    }
    for (const allowed of ['own', 'joined', 'personal']) assert.equal(body.includes(`label-secret-tag-${allowed}`), true);
    joined.members[0].status = false; f.reads.length = 0;
    body = await read();
    assert.equal(body.includes('label-secret-tag-joined'), false);
    assert.equal(f.reads.includes('label-secret-tag-joined'), false);
    joined.ownerId = 'alice';
    assert.equal((await read()).includes('label-secret-tag-joined'), true);
    assert.equal(f.note.tags.length, 6);
  });
}

for (const [path, method] of [['notes', 'POST'], ['notes/[id]', 'PATCH'], ['apps/auth/context', 'POST'], ['apps/auth/context/[id]', 'PUT']]) {
  test(`Notes tag writes ${method} ${path} reject mixed foreign references without side effects`, async () => {
    const f = noteTagFixture();
    for (const tagIds of [['tag-own', 'tag-revoked'], ['tag-own', 'tag-joined'], ['private'], ['missing'], null, 'tag-own', [7]]) {
      const response = await f.call(path, method, { title: 'Note', content: 'Note content', workspaceId: f.workspaces[0].id, tagIds });
      assert.equal(response.status, 400, JSON.stringify(tagIds));
      assert.deepEqual(f.writes, []);
      assert.equal(f.calls.writes, 0);
    }
    for (const tagIds of [['tag-own', 'personal'], [], ['tag-own', 'tag-own']]) {
      const response = await f.call(path, method, { title: 'Note', content: 'Note content', workspaceId: f.workspaces[0].id, tagIds });
      assert.equal(response.status, method === 'POST' ? 201 : 200);
      const body = JSON.stringify(await response.json());
      assert.equal(body.includes('label-secret-tag-revoked'), false);
      assert.equal(body.includes('label-secret-tag-private'), false);
    }
  });
}

test('Notes tag validator preserves personal, owner, active member and project-only destinations', async () => {
  const f = noteTagFixture(), own = f.workspaces[0], joined = f.workspaces[1];
  const { canUseNoteTags } = f.dependencies['@/lib/secrets/access'];
  assert.equal(await canUseNoteTags('alice', ['personal'], null), true);
  assert.equal(await canUseNoteTags('alice', ['tag-own', 'personal'], own.id), true);
  assert.equal(await canUseNoteTags('alice', ['tag-joined', 'personal'], joined.id), true);
  assert.equal(await canUseNoteTags('alice', ['tag-joined'], null, 'project-joined'), true);
  joined.members[0].status = false;
  assert.equal(await canUseNoteTags('alice', ['tag-joined'], joined.id), false);
  joined.ownerId = 'alice';
  assert.equal(await canUseNoteTags('alice', ['tag-joined'], joined.id), true);
  assert.equal(await canUseNoteTags('alice', ['private'], null), false);
  assert.deepEqual(f.writes, []);
});

function appIssueSubrouteFixture(association) {
  const f = relatedIssueFixture(), own = f.workspaces[0], joined = f.workspaces[1];
  const issue = f.rows[0], foreignProject = f.rows[1].project;
  if (association === 'project') {
    issue.project = foreignProject; issue.projectId = foreignProject.id;
  } else {
    issue.projectStatus = { id: 'historic-status', name: 'private-status', project: foreignProject };
    issue.statusId = issue.projectStatus.id;
  }
  f.rows.push({ ...issue, id: 'issue-local', issueKey: 'LOCAL-1', parent: null, children: [],
    projectId: 'local', project: { id: 'local', workspaceId: own.id, workspace: own }, statusId: null, projectStatus: null });
  issue.timeSpentMinutes = 20;
  f.dependencies['@/lib/apps/auth-middleware'] = { withAppAuth: handler => (req, params) => handler(req,
    { workspace: own, user: f.state.user }, params) };
  const contentReads = [];
  const comment = { id: 'comment', issueId: issue.id, content: 'private-comment', parentId: null,
    author: f.state.user, reactions: [], replies: [], createdAt: new Date(0) };
  const log = { id: 'worklog', issueId: issue.id, timeSpent: 20, description: 'private-worklog', user: f.state.user };
  const read = (kind, value) => { contentReads.push(kind); return value; };
  const write = data => { f.writes.push(data); return data; };
  f.db.issueComment = {
    findMany: async () => read('comments', [comment]), count: async () => 1,
    create: async ({ data }) => write({ ...comment, ...data }),
  };
  f.db.workLog = {
    findMany: async () => read('worklogs', [log]), findFirst: async () => read('worklog', log),
    count: async () => 1, aggregate: async () => ({ _sum: { timeSpent: 20 } }),
    create: async ({ data }) => write({ ...log, ...data }),
    update: async ({ data }) => write({ ...log, ...data }), delete: async args => write(args),
  };
  f.db.issue.update = async ({ data, ...spec }) => {
    write(data);
    if (data.timeSpentMinutes) issue.timeSpentMinutes += (data.timeSpentMinutes.increment || 0) - (data.timeSpentMinutes.decrement || 0);
    return f.project({ ...issue, ...data, timeSpentMinutes: issue.timeSpentMinutes }, spec);
  };
  f.db.$transaction = async callback => { contentReads.push('transaction'); return callback(f.db); };
  f.db.issueActivity.findMany = async () => read('activity', []);
  const relation = { id: 'relation', sourceIssueId: issue.id, targetIssueId: f.rows[1].id,
    sourceIssue: issue, targetIssue: f.rows[1], relationType: 'BLOCKS' };
  f.db.issueRelation.findUnique = async () => read('relation', relation);
  f.db.issueRelation.findFirst = async ({ where }) => {
    contentReads.push('relation');
    return where.id && matches(relation, where) ? relation : null;
  };
  f.db.issueRelation.delete = async args => write(args);
  return { ...f, own, joined, issue, contentReads };
}

for (const association of ['project', 'status']) {
  for (const [path, method, body, success] of [
    ['comments', 'GET', {}, 200], ['comments', 'POST', { content: 'new' }, 201],
    ['work-logs', 'GET', {}, 200], ['work-logs', 'POST', { timeSpent: 30 }, 201],
    ['work-logs/[workLogId]', 'GET', {}, 200], ['work-logs/[workLogId]', 'PATCH', { timeSpent: 30 }, 200],
    ['work-logs/[workLogId]', 'DELETE', {}, 200], ['assign', 'POST', { unassign: true }, 200],
    ['activity', 'GET', {}, 200], ['relations', 'GET', {}, 200],
    ['relations', 'POST', { targetIssueId: 'issue-local', relationType: 'BLOCKS' }, 201],
    ['relations/[relationId]', 'DELETE', {}, 200],
  ]) {
    test(`historical app subroute ${association} ${method} ${path} denies before content and writes`, async () => {
      const f = appIssueSubrouteFixture(association);
      const route = f.route('apps/auth/issues/[issueIdOrKey]/' + path);
      const invoke = key => route[method](f.request(method, f.own.id, body),
        { params: Promise.resolve({ issueIdOrKey: key, workLogId: 'worklog', relationId: 'relation' }) });
      assert.equal((await invoke(f.issue.id)).status, success);
      f.joined.members[0].status = false;
      f.writes.length = 0; f.calls.writes = 0; f.contentReads.length = 0;
      const timeBefore = f.issue.timeSpentMinutes;
      for (const key of [f.issue.id, f.issue.issueKey]) {
        const response = await invoke(key);
        assert.equal(response.status, 404);
        const result = JSON.stringify(await response.json());
        assert.equal(result.includes('private-'), false);
        assert.deepEqual(f.writes, []);
        assert.deepEqual(f.contentReads, []);
        assert.equal(f.calls.writes, 0);
        assert.equal(f.issue.timeSpentMinutes, timeBefore);
      }
      f.joined.ownerId = 'alice';
      assert.equal((await invoke(f.issue.issueKey)).status, success);
    });
  }
  for (const endpoint of ['detail', 'search', 'project']) {
    test(`historical app hierarchy ${association} ${endpoint} filters metadata and counts before retrieval`, async () => {
      const f = relatedIssueFixture(), own = f.workspaces[0], joined = f.workspaces[1];
      const child = f.rows[1], foreignProject = child.project;
      child.workspaceId = own.id; child.workspace = own;
      if (association === 'status') {
        child.project = f.rows[0].project; child.projectId = child.project.id;
        child.statusId = 'historical-status'; child.projectStatus = { id: child.statusId, project: foreignProject };
      }
      f.rows[0].parent = child; f.rows[0].parentId = child.id;
      f.dependencies['@/lib/apps/auth-middleware'] = { withAppAuth: handler => (req, params) => handler(req,
        { workspace: own, user: f.state.user }, params) };
      const invoke = async () => {
        const path = endpoint === 'detail' ? 'issues/[issueIdOrKey]' : endpoint === 'search' ? 'search/issues' : 'projects/[projectId]/issues';
        const response = await f.route('apps/auth/' + path).GET(f.request(),
          { params: Promise.resolve({ issueIdOrKey: f.rows[0].id, projectId: f.rows[0].projectId }) });
        assert.equal(response.status, 200);
        const body = await response.json();
        return endpoint === 'detail' ? body : (body.results || body.issues).find(row => row.id === f.rows[0].id);
      };
      let body = await invoke();
      assert.equal(body.stats.childCount, 1);
      if (endpoint !== 'project') assert.equal(body.parent.title, child.title);
      joined.members[0].status = false; f.reads.length = 0;
      body = await invoke();
      assert.equal(body.stats.childCount, 0);
      if (endpoint !== 'project') assert.equal(body.parent, null);
      assert.equal(JSON.stringify(body).includes(child.title), false);
      assert.equal(f.reads.includes(child.title), false);
      if (endpoint === 'detail') assert.equal(body.stats.relationCount, 0);
      joined.ownerId = 'alice';
      assert.equal((await invoke()).stats.childCount, 1);
      assert.deepEqual(f.writes, []);
      assert.equal(f.rows[0].parentId, child.id);
    });
  }
}

for (const association of ['project', 'status']) {
  test(`historical app relation target ${association} denies creation and deletion before writes`, async () => {
    const f = appIssueSubrouteFixture(association), source = f.rows[1], target = f.rows[0];
    source.workspace = f.own; source.workspaceId = f.own.id;
    source.project = f.rows[2].project = { id: 'local', workspace: f.own, workspaceId: f.own.id };
    source.projectId = 'local';
    const params = { params: Promise.resolve({ issueIdOrKey: source.id, relationId: 'relation' }) };
    const create = () => f.route('apps/auth/issues/[issueIdOrKey]/relations').POST(
      f.request('POST', f.own.id, { targetIssueId: target.id, relationType: 'BLOCKS' }), params);
    const remove = () => f.route('apps/auth/issues/[issueIdOrKey]/relations/[relationId]').DELETE(f.request('DELETE'), params);
    assert.equal((await create()).status, 201);
    f.joined.members[0].status = false; f.writes.length = 0;
    assert.equal((await create()).status, 404);
    assert.equal((await remove()).status, 404);
    assert.deepEqual(f.writes, []);
    f.joined.ownerId = 'alice';
    assert.equal((await remove()).status, 200);
  });
}

test('historical app project activity excludes denied issue associations', async () => {
  const f = appIssueSubrouteFixture('status');
  const activity = { id: 'activity', itemType: 'ISSUE', itemId: f.issue.id, action: 'UPDATED', newValue: 'private-content', user: f.state.user,
    workspaceId: f.issue.workspaceId, projectId: f.issue.projectId, oldStatusId: null, newStatusId: null, fieldName: null };
  f.db.issueActivity.findMany = async ({ where }) => matches(activity, where) ? [activity] : [];
  const invoke = async () => {
    const response = await f.route('apps/auth/projects/[projectId]/activity').GET(f.request(),
      { params: Promise.resolve({ projectId: f.issue.projectId }) });
    assert.equal(response.status, 200); return response.json();
  };
  assert.equal((await invoke()).activities.length, 1);
  f.joined.members[0].status = false;
  assert.equal((await invoke()).activities.length, 0);
  f.joined.ownerId = 'alice';
  assert.equal((await invoke()).activities.length, 1);
});

for (const association of ['project', 'status']) {
  test(`historical notification ${association} denies storage push and serialized reads after revocation`, async () => {
    const f = scopedNotificationFixture(), own = f.workspaces[0], joined = f.workspaces[1];
    const issue = f.issues[0];
    if (association === 'project') issue.project = f.issues[1].project;
    else { issue.statusId = 'foreign-status'; issue.projectStatus = { project: f.issues[1].project }; }
    const send = content => f.NotificationService.notifyUsers(['alice'], 'ISSUE_UPDATED', content, 'bob', { issueId: issue.id });
    assert.equal(await send('private-issue-key actor event'), 1);
    assert.equal(f.deliveries.length, 1);
    f.stored.push(f.normalize({ ...f.stored[0], id: 'historic-agent', type: 'COCLAW_RESPONSE' }));
    assert.equal(await f.coclaw.getUnreadCoclawCount('alice', own.id), 1);
    joined.members[0].status = false;
    const beforeWrites = f.calls.writes, beforePushes = f.calls.providerCalls;
    assert.equal(await send('private-revoked-event'), 0);
    await f.NotificationService.sendPushNotificationForUser('alice', 'ISSUE_UPDATED', 'private-direct-push', issue.id, undefined, own.id);
    assert.equal(f.calls.writes, beforeWrites);
    assert.equal(f.calls.providerCalls, beforePushes);
    const read = async () => {
      const response = await f.route('notifications').GET(f.request());
      assert.equal(response.status, 200); return response.json();
    };
    assert.deepEqual(await read(), []);
    assert.equal(await f.coclaw.getUnreadCoclawCount('alice', own.id), 0);
    assert.deepEqual(await f.coclaw.getRecentCoclawNotifications('alice', own.id), []);
    assert.equal((await f.route('notifications/[id]').PATCH(f.request('PATCH', undefined, { read: true }),
      { params: Promise.resolve({ id: f.stored[0].id }) })).status, 404);
    await f.route('notifications/read-all').POST();
    assert.equal(f.stored[0].read, false);
    joined.ownerId = 'alice';
    assert.equal((await read())[0].content, 'private-issue-key actor event');
    assert.equal(await send('owner-restored'), 1);
    f.issues.splice(0, 1);
    assert.deepEqual(await read(), []);
    assert.equal(await send('orphan-update'), 0);
    assert.equal(await f.NotificationService.notifyUsers(['alice'], 'PERSONAL', 'personal-control', 'bob', { personal: true }), 1);
    assert.deepEqual((await read()).map(row => row.content), ['personal-control']);
  });
}

for (const [path, method, body, expected] of [
  ['comments', 'GET', {}, 200], ['comments', 'POST', { content: 'new' }, 201],
  ['work-logs', 'GET', {}, 200], ['work-logs', 'POST', { timeSpent: 30 }, 201],
  ['assign', 'POST', { unassign: true }, 200], ['', 'PATCH', { title: 'updated' }, 200],
]) {
  test(`exact issue key A1B-T1 preserves ${method} ${path || 'mutation'} with full access`, async () => {
    const f = appIssueSubrouteFixture('project');
    const route = f.route('apps/auth/issues/[issueIdOrKey]' + (path ? '/' + path : ''));
    const invoke = key => route[method](f.request(method, f.own.id, body), { params: Promise.resolve({ issueIdOrKey: key }) });
    for (const key of ['OWN-1', 'A1B-T1']) {
      f.issue.issueKey = key;
      assert.equal((await invoke(key)).status, expected);
      assert.equal((await invoke(f.issue.id)).status, expected);
    }
    f.joined.members[0].status = false; f.writes.length = 0; f.contentReads.length = 0;
    assert.equal((await invoke('A1B-T1')).status, 404);
    assert.deepEqual(f.writes, []); assert.deepEqual(f.contentReads, []);
  });
}

for (const association of ['project', 'status']) {
  test(`historical notification deletion ${association} checks full access before issue removal`, async () => {
    const f = scopedNotificationFixture(), own = f.workspaces[0], joined = f.workspaces[1];
    own.members.push({ userId: 'dan', status: true }, { userId: 'eve', status: true });
    joined.members.push({ userId: 'dan', status: false }, { userId: 'eve', status: true });
    const issue = f.issues[0];
    if (association === 'project') issue.project = f.issues[1].project;
    else { issue.statusId = 'historic'; issue.projectStatus = { project: f.issues[1].project }; }
    const lookupUser = f.db.user.findUnique;
    f.db.user.findUnique = async args => ['dan', 'eve'].includes(args.where.id) ? { id: args.where.id } : lookupUser(args);
    f.db.issueFollower = { findMany: async () => [{ userId: 'dan' }, { userId: 'eve' }] };
    f.db.projectFollower = { findMany: async () => [] };
    Object.assign(f.dependencies, {
      '@/utils/html-normalizer': {}, '@/lib/event-bus': { emitIssueDeleted: async () => {} },
      '@/lib/permissions': { Permission: { DELETE_ANY_TASK: 'any', DELETE_SELF_TASK: 'self' },
        canActOnOwnContent: () => true, checkUserPermissions: async () => ({ any: { hasPermission: true }, self: { hasPermission: true } }) },
    });
    const response = await f.route('issues/[issueId]').DELETE(f.request('DELETE', own.id),
      { params: Promise.resolve({ issueId: issue.id }) });
    assert.equal(response.status, 200);
    assert.deepEqual(f.stored, []);
    assert.deepEqual(f.deliveries, []);
  });
}

function activitySnapshotFixture() {
  const f = relatedIssueFixture(), own = f.workspaces[0], joined = f.workspaces[1], activities = [], snapshotsRead = [];
  f.dependencies['date-fns'] = require('date-fns');
  f.dependencies['@/lib/apps/auth-middleware'] = { withAppAuth: handler => (req, params) => handler(req,
    { workspace: own, user: f.state.user }, params) };
  f.db.user.findMany = async () => [];
  f.db.issue.findUnique = f.db.issue.findFirst;
  f.db.issueActivity.create = async ({ data }) => {
    const row = { ...data, fieldName: data.fieldName ?? null, id: `snapshot-${activities.length}`, createdAt: new Date(),
      oldValue: data.oldValue ?? null, newValue: data.newValue ?? null, details: data.details ?? null,
      projectId: data.projectId ?? null, oldStatusId: data.oldStatusId ?? null, newStatusId: data.newStatusId ?? null,
      oldStatus: null, newStatus: null, user: f.state.user };
    activities.push(row); return row;
  };
  f.db.issueActivity.findMany = async args => activities.filter(row => matches(row, args.where)).map(row => {
    if (!args.select || args.select.oldValue || args.select.newValue || args.select.details) snapshotsRead.push(row.id);
    return f.project(row, args);
  });
  f.db.issueActivity.count = async ({ where }) => activities.filter(row => matches(row, where)).length;
  f.db.issueActivity.findFirst = async args => (await f.db.issueActivity.findMany(args))[0] ?? null;
  const producer = load('src/lib/board-item-activity-service.ts', f.dependencies);
  const call = endpoint => f.route(endpoint).GET(new Request(`https://collab.example.test/?workspaceId=${own.id}&startDate=2026-09-01&endDate=2027-01-01`),
    { params: Promise.resolve({ workspaceId: own.id, issueId: f.rows[0].id, issueIdOrKey: f.rows[0].id, projectId: f.rows[0].projectId }) });
  return { ...f, own, joined, activities, snapshotsRead, producer, call };
}

for (const endpoint of ['workspaces/[workspaceId]/planning/activity', 'timeline/unified', 'apps/auth/workspace/activity',
  'apps/auth/issues/[issueIdOrKey]/activity', 'apps/auth/projects/[projectId]/activity', 'apps/auth/search/issues-by-activity', 'issues/[issueId]/activities']) {
  test(`activity underlying issue access removes complete field snapshots in ${endpoint}`, async () => {
    const f = activitySnapshotFixture(), issue = f.rows[0];
    const project = endpoint.includes('projects/') ? issue.project : f.rows[1].project;
    if (endpoint.includes('projects/')) { issue.statusId = 'foreign-status'; issue.projectStatus = { project: f.rows[1].project }; }
    else { issue.project = project; issue.projectId = project.id; }
    await f.producer.trackFieldChanges({ itemType: 'ISSUE', itemId: issue.id, userId: 'alice', workspaceId: f.own.id,
      projectId: project.id, changes: [
        { field: 'title', oldValue: 'private-old-title', newValue: 'private-new-title' },
        { field: 'description', oldValue: 'private-old-description', newValue: 'private-new-description' },
        { field: 'priority', oldValue: 'low', newValue: 'urgent' },
      ] });
    f.activities.forEach(row => { row.details = JSON.stringify({ title: 'private-detail' }); });
    const visible = await f.call(endpoint);
    const marker = endpoint.includes('search/') ? 'private-new-title' : 'snapshot-';
    assert.equal(visible.status, 200);
    assert.equal(JSON.stringify(await visible.json()).includes(marker), true);
    f.joined.members[0].status = false; f.snapshotsRead.length = 0;
    const response = await f.call(endpoint), body = JSON.stringify(await response.json());
    assert.equal(response.status, endpoint === 'apps/auth/issues/[issueIdOrKey]/activity' ? 404 : 200);
    for (const token of ['snapshot-', 'private-', 'protected-own']) assert.equal(body.includes(token), false, token);
    assert.deepEqual(f.snapshotsRead, []);
    const parsed = JSON.parse(body);
    if (parsed.stats) assert.equal(parsed.stats.todayCount, 0);
    if (parsed.pagination) assert.equal(parsed.pagination.total, 0);
    f.joined.ownerId = 'alice';
    assert.equal(JSON.stringify(await (await f.call(endpoint)).json()).includes(marker), true);
    assert.equal(f.activities.length, 3);
    assert.deepEqual(f.writes, []);
  });
}

test('activity missing issue fails closed despite retained project scope', async () => {
  const f = activitySnapshotFixture();
  for (const projectId of [f.rows[0].projectId, f.rows[2].projectId, undefined]) {
    await f.producer.trackFieldChanges({ itemType: 'ISSUE', itemId: 'deleted-issue', userId: 'alice', workspaceId: f.own.id,
      projectId, changes: [{ field: 'title', oldValue: 'old-title', newValue: 'new-title' }] });
  }
  await f.producer.createActivity({ action: 'CREATED', itemType: 'ISSUE', itemId: f.rows[0].id, userId: 'alice',
    workspaceId: f.own.id, details: { title: 'allowed-creation' } });
  const response = await f.call('apps/auth/workspace/activity');
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.deepEqual(result.activities.map(row => row.id), ['snapshot-3']);
  assert.equal(result.pagination.total, 1);
  assert.deepEqual(f.snapshotsRead, ['snapshot-3']);
  assert.equal(f.activities.length, 4);
});

for (const side of ['old', 'new']) {
  test(`activity status deletion cannot reauthorize retained ${side} snapshot`, async () => {
    const f = activitySnapshotFixture(), project = f.rows[1].project;
    const status = { id: 'unused-status', projectId: project.id, project, name: 'private-deleted-status', isDefault: false };
    await f.producer.trackStatusChange({ itemType: 'ISSUE', itemId: f.rows[0].id, userId: 'alice', workspaceId: f.own.id,
      projectId: f.rows[0].projectId, oldStatusId: side === 'old' ? status.id : null, newStatusId: side === 'new' ? status.id : null,
      oldStatusName: side === 'old' ? status.name : null, newStatusName: side === 'new' ? status.name : null });
    f.activities[0][`${side}Status`] = status;
    const read = async () => JSON.stringify(await (await f.call('apps/auth/workspace/activity')).json());
    assert.equal((await read()).includes(status.name), true);
    f.joined.members[0].status = false;
    assert.equal((await read()).includes(status.name), false);
    f.db.projectStatus.findFirst = async ({ where }) => matches(status, where) ? status : null;
    f.db.projectStatus.delete = async ({ where }) => {
      assert.equal(where.id, status.id);
      const model = require('@prisma/client').Prisma.dmmf.datamodel.models.find(model => model.name === 'IssueActivity');
      for (const field of model.fields.filter(field => field.type === 'ProjectStatus')) {
        assert.equal(field.relationOnDelete, 'SetNull');
        for (const row of f.activities) if (row[field.relationFromFields[0]] === status.id) {
          row[field.relationFromFields[0]] = null; row[field.name] = null;
        }
      }
      return status;
    };
    f.db.$transaction = async callback => callback(f.db);
    f.joined.ownerId = 'alice';
    const removed = await f.route('workspaces/[workspaceId]/projects/[projectSlug]/statuses/[statusId]').DELETE(f.request('DELETE', f.joined.id),
      { params: Promise.resolve({ workspaceId: f.joined.id, projectSlug: 'existing', statusId: status.id }) });
    assert.equal(removed.status, 200);
    f.joined.ownerId = 'bob'; f.snapshotsRead.length = 0;
    assert.equal((await read()).includes(status.name), false);
    assert.deepEqual(f.snapshotsRead, []);
    assert.equal(f.activities[0][`${side}Value`], status.name);
    assert.equal(f.activities[0][`${side}StatusId`], null);
  });
}

for (const association of ['project', 'status']) {
  test(`AI review ${association} access denies linked review retrieval after revocation`, async () => {
    const f = relatedIssueFixture(), issue = f.rows[0], project = f.rows[1].project;
    if (association === 'project') { issue.project = project; issue.projectId = project.id; }
    else { issue.statusId = 'foreign'; issue.projectStatus = { project }; }
    issue.pullRequests = [{ id: 'pr', title: 'private-pr', aiReviews: [{ id: 'review', content: 'private-review', createdAt: new Date() }] }];
    f.db.issue.findUnique = f.db.issue.findFirst;
    const invoke = () => f.route('issues/[issueId]/ai-reviews').GET(f.request(), { params: Promise.resolve({ issueId: issue.id }) });
    assert.equal(JSON.stringify(await (await invoke()).json()).includes('private-review'), true);
    f.workspaces[1].members[0].status = false; f.reads.length = 0;
    const response = await invoke();
    assert.equal(response.status, 404);
    assert.equal(JSON.stringify(await response.json()).includes('private-'), false);
    assert.deepEqual(f.reads, []);
    f.workspaces[1].ownerId = 'alice';
    assert.equal(JSON.stringify(await (await invoke()).json()).includes('private-review'), true);
  });
}

for (const association of ['project', 'status']) {
  test(`realtime issue ${association} access gates actual update payload before SSE delivery`, async () => {
    const f = relatedIssueFixture(), own = f.workspaces[0], joined = f.workspaces[1], issue = f.rows[0];
    if (association === 'project') { issue.project = f.rows[1].project; issue.projectId = issue.project.id; }
    else { issue.statusId = 'foreign-status'; issue.projectStatus = { project: f.rows[1].project }; }
    f.db.projectStatus.findFirst = async ({ where }) => issue.projectStatus && matches({ ...issue.projectStatus, id: issue.statusId }, where) ? issue.projectStatus : null;
    let callback, payload, unsubscribe = 0;
    f.dependencies['@/lib/redis'] = {
      publishEvent: async (_channel, event) => { payload = event; },
      getRedisSubscriber: async () => ({ subscribe: async (_channel, cb) => { callback = cb; },
        unsubscribe: async () => { unsubscribe++; }, quit: async () => {} }),
    };
    const permissions = load('src/lib/permissions.ts', { './prisma': { prisma: f.db } });
    f.dependencies['@/lib/permissions'] = { ...permissions,
      checkUserPermissions: async (_user, _workspace, requested) => Object.fromEntries(requested.map(key => [key, { hasPermission: true }])) };
    f.dependencies['@/lib/board-item-activity-service'] = { compareObjects: () => [] };
    f.db.$transaction = async callback => callback(f.db);
    const updated = await f.route('issues/[issueId]').PUT(f.request('PUT', own.id, { title: 'updated' }),
      { params: Promise.resolve({ issueId: issue.id }) });
    assert.equal(updated.status, 200);
    assert.equal(payload.type, 'issue.updated');
    assert.equal(payload.issueId, issue.id);
    const response = await f.route('realtime/workspace/[workspaceId]/stream').GET(f.request(), f.context(own.id));
    assert.equal(response.status, 200);
    const reader = response.body.getReader();
    const next = async () => new TextDecoder().decode((await reader.read()).value);
    try {
      await next(); await next();
      await callback(JSON.stringify(payload));
      assert.equal((await next()).includes(payload.issueKey), true);
      joined.members[0].status = false;
      await callback(JSON.stringify(payload));
      await callback(JSON.stringify({ type: 'workspace.updated', marker: 'still-authorized' }));
      assert.equal(await next(), 'data: {"type":"workspace.updated","marker":"still-authorized"}\n\n');
      assert.equal(unsubscribe, 0);
      joined.ownerId = 'alice';
      await callback(JSON.stringify(payload));
      assert.equal((await next()).includes(payload.issueKey), true);
      f.rows.splice(0, 1);
      for (const event of [payload, { ...payload, type: 'issue.deleted' }, { type: 'issue.updated' }]) await callback(JSON.stringify(event));
      await callback(JSON.stringify({ type: 'workspace.updated', marker: 'after-missing' }));
      assert.equal(await next(), 'data: {"type":"workspace.updated","marker":"after-missing"}\n\n');
      f.state.mapped = false;
      await callback(JSON.stringify(payload));
      assert.equal((await reader.read()).done, true);
      assert.equal(unsubscribe, 1);
    } finally { await reader.cancel(); }
  });
}

for (const endpoint of ['apps/auth/workspace/activity', 'workspaces/[workspaceId]/planning/activity', 'timeline/unified']) {
  test(`activity concurrent first snapshot never bypasses checked IDs in ${endpoint}`, async () => {
    const f = activitySnapshotFixture(), own = f.rows[0];
    const field = endpoint === 'timeline/unified' ? 'priority' : 'title';
    await f.producer.trackFieldChanges({ itemType: 'ISSUE', itemId: own.id, userId: 'alice',
      workspaceId: f.own.id, projectId: own.projectId,
      changes: [{ field, oldValue: 'low', newValue: 'high' }] });
    const read = f.db.issueActivity.findMany;
    let insertions = 0;
    f.db.issueActivity.findMany = async args => {
      const result = await read(args);
      if (args.select?.itemId && args.select?.workspaceId) {
        const issue = { ...own, id: `concurrent-${insertions++}`, title: 'private-concurrent-issue',
          statusId: 'revoked-status', projectStatus: { project: f.rows[2].project } };
        f.rows.push(issue);
        await f.producer.trackFieldChanges({ itemType: 'ISSUE', itemId: issue.id, userId: 'alice',
          workspaceId: f.own.id, projectId: own.projectId,
          changes: [{ field, oldValue: field === 'title' ? 'private-concurrent-old' : 'low',
            newValue: field === 'title' ? 'private-concurrent-new' : 'high' }] });
        f.activities.at(-1).details = JSON.stringify({ title: 'private-concurrent-details' });
      }
      return result;
    };
    const response = await f.call(endpoint), body = await response.json();
    assert.equal(response.status, 200);
    assert.ok(insertions > 0);
    assert.equal(JSON.stringify(body).includes('private-concurrent'), false);
    assert.equal(JSON.stringify(body).includes('snapshot-0'), true);
    assert.deepEqual(f.snapshotsRead, ['snapshot-0']);
    if (body.pagination) assert.equal(body.pagination.total, 1);
    if (body.stats) assert.equal(body.stats.todayCount, 1);
    assert.equal(f.activities.length, insertions + 1);
    f.db.issueActivity.findMany = read;
    f.workspaces[2].ownerId = 'alice';
    assert.equal(JSON.stringify(await (await f.call(endpoint)).json()).includes('snapshot-1'), true);
  });
}

for (const association of ['project', 'status']) {
  for (const operation of ['bulk', 'cleanup']) {
    test(`position ${operation} denies mixed historical ${association} references before transaction`, async () => {
      const f = relatedIssueFixture(), own = f.rows[0], target = f.rows[1], joined = f.workspaces[1];
      const foreignProject = target.project;
      target.workspaceId = own.workspaceId; target.workspace = own.workspace;
      if (association === 'status') {
        target.project = own.project; target.projectId = own.projectId;
        target.statusId = 'joined-status'; target.projectStatus = { project: foreignProject };
      }
      const view = { id: 'view', ownerId: 'alice', workspaceId: own.workspaceId, workspace: own.workspace };
      f.db.view.findFirst = async ({ where }) => matches(view, where) ? view : null;
      f.dependencies['@/constants/viewPositions'] = { VIEW_POSITIONS_MAX_BULK_SIZE: 500 };
      const positions = [own, target].map(issue => ({ viewId: view.id, issueId: issue.id, columnId: 'old', position: 9 }));
      f.db.viewIssuePosition = {
        deleteMany: async ({ where }) => {
          for (let i = positions.length - 1; i >= 0; i--) if (matches(positions[i], where)) positions.splice(i, 1);
        },
        upsert: async ({ create }) => { positions.push(create); return create; },
      };
      const { PUT } = f.route('views/[viewId]/issue-positions');
      const update = ids => PUT(f.request('PUT', undefined, {
        bulk: (operation === 'bulk' ? [own.id, ...ids] : [own.id]).map(issueId => ({ issueId, columnId: 'new', position: 0 })),
        cleanup: { issueIds: operation === 'cleanup' ? [own.id, ...ids, ...ids] : [own.id], keepColumnId: 'new' },
      }), f.context(own.workspaceId));
      joined.members[0].status = false;
      const before = JSON.stringify(positions);
      const denied = await update([target.id]);
      assert.equal(denied.status, 404);
      assert.equal(JSON.stringify(positions), before);
      assert.equal(f.calls.writes, 0);
      assert.deepEqual(f.writes, []);
      joined.members[0].status = true;
      const allowed = await update([target.id]);
      assert.equal(allowed.status, 200);
      assert.equal((await allowed.json()).affectedCount, operation === 'bulk' ? 2 : 1);
      assert.ok(positions.some(row => row.issueId === own.id && row.columnId === 'new'));
      if (operation === 'cleanup') assert.equal(positions.some(row => row.issueId === target.id), false);
      joined.members[0].status = false; joined.ownerId = 'alice';
      assert.equal((await update([target.id])).status, 200);
      const mutations = f.calls.writes, snapshot = JSON.stringify(positions);
      assert.equal((await update([f.rows[3].id])).status, 404);
      assert.equal(f.calls.writes, mutations);
      assert.equal(JSON.stringify(positions), snapshot);
    });
  }

  test(`issue preview applies full historical ${association} access and exact URL scope`, async () => {
    const f = relatedIssueFixture(), own = f.rows[0], joined = f.workspaces[1];
    if (association === 'project') { own.project = f.rows[1].project; own.projectId = own.project.id; }
    else { own.statusId = 'joined-status'; own.projectStatus = { project: f.rows[1].project }; }
    own.assignee = { name: 'private-assignee' };
    const { POST } = f.route('link-preview');
    const preview = async scope => {
      const response = await POST(f.request('POST', own.workspaceId, {
        url: `https://collab.example.test/${scope}/issues/${own.issueKey}`, workspaceId: own.workspaceId,
      }));
      assert.equal(response.status, 200); return response.json();
    };
    for (const scope of [own.workspaceId, own.workspace.slug]) {
      assert.equal((await preview(scope)).title, `${own.issueKey}: ${own.title}`);
      joined.members[0].status = false; f.reads.length = 0;
      const body = await preview(scope);
      assert.equal(body.metadata.notFound, true);
      for (const secret of [own.title, 'private-assignee', 'open']) assert.equal(JSON.stringify(body).includes(secret), false);
      assert.deepEqual(f.reads, []);
      joined.ownerId = 'alice';
      assert.equal((await preview(scope)).title, `${own.issueKey}: ${own.title}`);
      joined.ownerId = 'bob'; joined.members[0].status = true;
    }
    assert.equal((await preview(joined.slug)).metadata.notFound, true);
    assert.equal((await preview('unknown-workspace')).metadata.notFound, true);
    assert.deepEqual(f.writes, []);
  });
}

for (const direction of ['source', 'target']) {
  test(`suggestion counts exclude denied issues and ${direction} relation endpoints`, async () => {
    const f = activitySnapshotFixture(), own = f.rows[0], allowed = f.rows[1], denied = f.rows[2];
    const foreignProject = denied.project;
    for (const issue of [own, allowed, denied]) {
      issue.title = 'Matching issue'; issue.project = own.project; issue.projectId = own.projectId;
      issue.workspace = own.workspace; issue.workspaceId = own.workspaceId;
    }
    denied.statusId = 'revoked-status'; denied.projectStatus = { project: foreignProject };
    f.db.issue.count = async ({ where }) => f.rows.filter(row => matches(row, where)).length;
    f.db.issueActivity.findFirst = async () => null;
    f.db.issueActivity.findMany = async () => [];
    f.db.project.findMany = async () => [];
    const relations = [];
    f.db.issueRelation.count = async ({ where }) => relations.filter(row => matches(row, where)).length;
    const read = async () => {
      const response = await f.route('ai/issues/suggestions').GET(new Request(
        `https://collab.example.test/?workspaceId=${own.workspaceId}&issueId=${own.id}`));
      assert.equal(response.status, 200); return response.json();
    };
    const baseline = await read();
    assert.equal(baseline.suggestions.find(row => row.id === 'suggest-link').description,
      'Found 1 potentially related issues. Linking them can help track dependencies.');
    relations.push({ sourceIssueId: direction === 'source' ? denied.id : own.id,
      targetIssueId: direction === 'target' ? denied.id : own.id,
      sourceIssue: direction === 'source' ? denied : own, targetIssue: direction === 'target' ? denied : own });
    assert.deepEqual(await read(), baseline);
    f.workspaces[2].members[0].status = true;
    assert.equal((await read()).suggestions.some(row => row.id === 'suggest-link'), false);
    relations.length = 0;
    assert.equal((await read()).suggestions.find(row => row.id === 'suggest-link').description,
      'Found 2 potentially related issues. Linking them can help track dependencies.');
    f.workspaces[2].members[0].status = false; f.workspaces[2].ownerId = 'alice';
    assert.equal((await read()).suggestions.find(row => row.id === 'suggest-link').description,
      'Found 2 potentially related issues. Linking them can help track dependencies.');
    f.workspaces[2].ownerId = 'bob'; allowed.title = 'Unrelated';
    assert.equal((await read()).suggestions.some(row => row.id === 'suggest-link'), false);
    assert.deepEqual(f.writes, []);
  });
}

function issueReportFixture() {
  const f = relatedIssueFixture(), own = f.rows[0], project = own.project;
  own.updatedAt = new Date(); own.storyPoints = 3; own.labels = []; own.children = [];
  own.parent = null; own.assigneeId = 'alice'; own.assignee = { name: 'Alice' };
  project.issues = [own]; project.statuses = [];
  f.db.project.findFirst = async args => matches(project, args.where) ? f.project(project, args) : null;
  f.db.project.findUnique = f.db.project.findFirst;
  f.db.project.count = async () => 1;
  f.db.workspaceMember.count = async () => 1;
  f.db.workspaceMember.findMany = async () => [{ userId: 'alice', user: { ...f.state.user, expertise: [] }, role: 'MEMBER', expertise: [] }];
  f.db.issue.groupBy = async ({ where, by, _count }) => {
    const groups = new Map();
    for (const row of f.rows.filter(row => matches(row, where))) {
      const key = JSON.stringify(by.map(key => row[key]));
      if (!groups.has(key)) groups.set(key, { ...Object.fromEntries(by.map(key => [key, row[key]])), _count: 0 });
      groups.get(key)._count++;
    }
    return [...groups.values()].map(row => ({ ...row, _count: _count === true ? row._count : { id: row._count } }));
  };
  f.db.issue.aggregate = async ({ where }) => ({ _sum: { storyPoints: f.rows.filter(row => matches(row, where)).reduce((n, row) => n + row.storyPoints, 0) } });
  f.dependencies['@/lib/apps/auth-middleware'] = { withAppAuth: handler => (req, params) => handler(req,
    { workspace: f.workspaces[0], user: f.state.user }, params) };
  const denied = { ...own, id: 'denied-historical', issueKey: 'PRIVATE-1', title: 'private-report-title',
    description: 'private-report-description', assignee: { name: 'private-report-assignee' }, storyPoints: 100,
    statusId: 'revoked-status', projectStatus: { id: 'revoked-status', project: f.rows[2].project } };
  const addDenied = () => { f.rows.push(denied); project.issues.push(denied); };
  return { ...f, own, reportProject: project, denied, addDenied };
}

for (const type of ['issues', 'project', 'view', 'general', 'team']) {
  test(`summary ${type} denies historical issue input before provider processing`, async () => {
    const f = issueReportFixture(), prompts = [];
    f.dependencies.__env = { ANTHROPIC_API_KEY: 'fixture-only' };
    f.dependencies['@anthropic-ai/sdk'] = { default: class { messages = { create: async payload => {
      const data = payload.messages[0].content.split('Data to summarize:\n')[1]; prompts.push(data);
      return { content: [{ type: 'text', text: data }] };
    } }; } };
    f.dependencies.openai = { default: class {} };
    f.db.view.findFirst = async () => ({ name: 'View', projectIds: [f.own.projectId] });
    const invoke = issueIds => f.route('ai/summarize').POST(f.request('POST', undefined,
      { workspaceId: f.own.workspaceId, type, projectId: f.own.projectId, viewId: 'view', issueIds }));
    const baseline = await invoke([f.own.id]);
    assert.equal(baseline.status, 200);
    const expected = (await baseline.json()).summary;
    f.addDenied();
    const response = await invoke([f.own.id, f.denied.id]);
    assert.equal(response.status, type === 'issues' ? 404 : 200);
    const body = await response.json();
    assert.equal(JSON.stringify(body).includes('private-report'), false);
    if (type === 'issues') assert.equal(prompts.length, 1);
    else assert.equal(body.summary, expected);
    assert.equal(prompts.join('').includes('private-report'), false);
    f.workspaces[2].members[0].status = true;
    assert.equal((await invoke([f.denied.id])).status, 200);
    assert.equal(prompts.at(-1).includes('private-report-title'), true);
    f.workspaces[2].members[0].status = false; f.workspaces[2].ownerId = 'alice';
    assert.equal((await invoke([f.denied.id])).status, 200);
    assert.equal(prompts.at(-1).includes('private-report-title'), true);
  });
}

for (const endpoint of ['apps/auth/workspace/stats', 'apps/auth/projects/[projectId]/stats',
  'apps/auth/projects/[projectId]', 'apps/auth/projects/[projectId]/statuses', 'apps/auth/reports/issue-summary',
  'apps/auth/reports/assignee-workload', 'apps/auth/search/users', 'projects/[projectId]/summary']) {
  test(`issue report ${endpoint} excludes denied historical rows from every projection and total`, async () => {
    const f = issueReportFixture();
    const status = { id: 'done', projectId: f.own.projectId, isActive: true, isFinal: true, name: 'Done' };
    f.reportProject.statuses = [status];
    f.db.projectStatus.findMany = async ({ where }) => matches(status, where) ? [status] : [];
    f.own.statusId = status.id; f.own.projectStatus = { ...status, project: f.reportProject };
    f.denied.statusId = status.id; f.denied.projectStatus = f.own.projectStatus;
    f.denied.workspaceId = f.workspaces[2].id; f.denied.workspace = f.workspaces[2];
    const invoke = () => f.route(endpoint).GET(new Request(`https://collab.example.test/?comparePeriod=true&includeCompleted=true`),
      { params: Promise.resolve({ projectId: f.own.projectId }) });
    const first = await invoke(); assert.equal(first.status, 200);
    const expected = await first.json();
    f.addDenied();
    const denied = await invoke(); assert.equal(denied.status, 200);
    assert.deepEqual(await denied.json(), expected);
    f.denied.workspaceId = f.own.workspaceId; f.denied.workspace = f.own.workspace;
    f.denied.statusId = 'foreign-status'; f.denied.projectStatus = { project: f.rows[2].project };
    assert.deepEqual(await (await invoke()).json(), expected);
    f.workspaces[2].ownerId = 'alice';
    f.denied.statusId = status.id; f.denied.projectStatus = f.own.projectStatus;
    assert.notDeepEqual(await (await invoke()).json(), expected);
    assert.equal(f.rows.includes(f.denied), true);
    assert.deepEqual(f.writes, []);
  });
}

for (const direction of ['source', 'target']) {
  test(`relation deletion authorizes historical ${direction} endpoint before mutation`, async () => {
    const f = relatedIssueFixture(), own = f.rows[0], peer = f.rows[1], foreignProject = f.rows[2].project;
    peer.workspaceId = own.workspaceId; peer.workspace = own.workspace; peer.project = own.project; peer.projectId = own.projectId;
    peer.statusId = 'revoked-status'; peer.projectStatus = { project: foreignProject };
    const relation = { id: 'relation', sourceIssueId: direction === 'source' ? peer.id : own.id,
      targetIssueId: direction === 'target' ? peer.id : own.id,
      sourceIssue: direction === 'source' ? peer : own, targetIssue: direction === 'target' ? peer : own };
    f.db.issueRelation.findFirst = async ({ where }) => matches(relation, where) ? relation : null;
    f.db.issueRelation.delete = async args => { f.writes.push(args); };
    f.workspaces[0].members.push({ userId: 'alice', status: true });
    const invoke = () => f.route('workspaces/[workspaceId]/issues/[issueKey]/relations/[relationId]').DELETE(f.request(),
      { params: Promise.resolve({ workspaceId: own.workspaceId, issueKey: own.id, relationId: relation.id }) });
    assert.equal((await invoke()).status, 404); assert.deepEqual(f.writes, []);
    f.workspaces[2].members[0].status = true;
    assert.equal((await invoke()).status, 200); assert.equal(f.writes.length, 1);
    f.workspaces[0].members.length = 0; f.workspaces[2].members[0].status = false; f.workspaces[2].ownerId = 'alice';
    assert.equal((await invoke()).status, 200); assert.equal(f.writes.length, 2);
  });
}

for (const endpoint of ['issues', 'issues/[issueId]', 'apps/auth/issues', 'apps/auth/issues/[issueIdOrKey]']) {
  test(`parent validation denies historical status through ${endpoint} without writes`, async () => {
    const f = relatedIssueFixture(), own = f.rows[0], parent = f.rows[1], foreignProject = f.rows[2].project;
    own.projectId = 'cproject000000000000000001'; own.project.id = own.projectId;
    f.db.project.findFirst = async args => matches(own.project, args.where) ? own.project : null;
    parent.id = 'cparent0000000000000000001'; parent.workspaceId = own.workspaceId; parent.workspace = own.workspace;
    parent.project = own.project; parent.projectId = own.projectId;
    parent.statusId = 'revoked-status'; parent.projectStatus = { project: foreignProject };
    const permissions = load('src/lib/permissions.ts', { './prisma': { prisma: f.db } });
    f.dependencies['@/lib/permissions'] = { ...permissions,
      checkUserPermissions: async (_u, _w, keys) => Object.fromEntries(keys.map(key => [key, { hasPermission: true }])) };
    f.dependencies['@/lib/apps/auth-middleware'] = { withAppAuth: handler => (req, params) => handler(req,
      { workspace: f.workspaces[0], user: f.state.user }, params) };
    f.db.$transaction = async callback => callback(f.db);
    f.dependencies['@/lib/board-item-activity-service'] = { compareObjects: () => [], trackCreation: async () => {} };
    const method = endpoint === 'issues/[issueId]' ? 'PUT' : endpoint.includes('[issueIdOrKey]') ? 'PATCH' : 'POST';
    const response = await f.route(endpoint)[method](f.request(method, undefined,
      { title: 'New child', ...(method === 'POST' ? { workspaceId: own.workspaceId } : {}), projectId: own.projectId, parentId: parent.id }),
      { params: Promise.resolve({ issueId: own.id, issueIdOrKey: own.id }) });
    assert.equal(response.status, 400);
    assert.equal(JSON.stringify(await response.json()).includes('Invalid parent issue'), true);
    assert.deepEqual(f.writes, []); assert.equal(f.calls.writes, 0);
    const validate = f.dependencies['@/lib/issue-references'].validateIssueReferences;
    assert.equal(await validate(f.db, own.workspaceId, own.projectId, 'alice', { parentId: parent.id }), 'Invalid parent issue');
    f.workspaces[2].members[0].status = true;
    assert.equal(await validate(f.db, own.workspaceId, own.projectId, 'alice', { parentId: parent.id }), null);
    f.workspaces[2].members[0].status = false; f.workspaces[2].ownerId = 'alice';
    assert.equal(await validate(f.db, own.workspaceId, own.projectId, 'alice', { parentId: parent.id }), null);
    assert.equal(await validate(f.db, own.workspaceId, own.projectId, '', { parentId: parent.id }), 'Invalid issue actor');
  });
}

function versionReadFixture() {
  const f = issueReportFixture(), inputs = [];
  f.addDenied();
  const repository = { id: 'repo', name: 'repo', project: f.reportProject };
  f.reportProject.repository = repository;
  f.db.repository.findFirst = async args => matches(repository, args.where) ? f.project(repository, args) : null;
  f.db.repository.findUnique = f.db.repository.findFirst;
  const versions = [f.denied, f.own].map((issue, index) => ({ id: `version-${index}`, repositoryId: 'repo',
    version: `1.0.${index}`, issueAccessInvalidated: false, status: 'RELEASED', environment: 'production', createdAt: new Date(0),
    aiSummary: `${issue.title} saved summary`, aiChangelog: `${issue.title} saved changelog`,
    issues: [{ issueId: issue.id, issue, aiTitle: issue.title }], releases: [], deployments: [], parentVersion: null, childVersions: [] }));
  const releases = versions.map((version, index) => ({ id: `release-${index}`, repositoryId: 'repo', versionId: version.id, version,
    tagName: version.version, name: `${version.aiSummary} release`, description: version.aiChangelog, publishedAt: new Date(0) }));
  for (let i = 0; i < versions.length; i++) versions[i].releases = [releases[i]];
  const model = rows => ({
    findMany: async args => rows.filter(row => matches(row, args.where)).map(row => f.project(row, args)),
    findFirst: async args => f.project(rows.find(row => matches(row, args.where)), args),
    findUnique: async args => f.project(rows.find(row => matches(row, args.where)), args),
    update: async ({ data }) => { f.writes.push(data); return data; },
    count: async ({ where }) => rows.filter(row => matches(row, where)).length,
  });
  f.db.version = model(versions); f.db.release = model(releases);
  f.db.versionFile = model(versions.map(version => ({ repositoryId: 'repo', environment: 'production', isActive: true,
    version, content: { features: [version.aiSummary] } })));
  const versionFileRead = f.db.versionFile.findFirst;
  f.db.versionFile.findFirst = args => versionFileRead({ where: args.where });
  f.db.commit = model([]); f.db.pullRequest = model([]);
  f.dependencies.openai = { default: class { chat = { completions: { create: async args => {
    inputs.push(args); return { choices: [{ message: { content: 'Generated summary' } }] };
  } } }; } };
  const invoke = (endpoint, body = {}) => endpoint === 'version.json'
    ? f.route(endpoint).GET(new Request(`https://collab.example.test/?project=${f.own.projectId}`))
    : f.route(`github/repositories/[repositoryId]/${endpoint}`)[endpoint === 'generate-changelog' ? 'POST' : 'GET'](
      f.request(endpoint === 'generate-changelog' ? 'POST' : 'GET', undefined, body),
      { params: Promise.resolve({ repositoryId: 'repo' }) });
  return { ...f, inputs, invoke, versions, releases };
}

for (const endpoint of ['versions', 'releases', 'version.json']) {
  test(`version content ${endpoint} withholds saved text and linked denied issues`, async () => {
    const f = versionReadFixture();
    let response = await f.invoke(endpoint); assert.equal(response.status, 200);
    const body = JSON.stringify(await response.json());
    assert.equal(body.includes('private-report'), false);
    assert.equal(body.includes('protected-own'), true);
    if (endpoint === 'version.json') assert.equal(response.headers.get('cache-control'), 'private, no-store');
    f.workspaces[2].members[0].status = true;
    assert.equal(JSON.stringify(await (await f.invoke(endpoint)).json()).includes('private-report'), true);
    f.workspaces[2].members[0].status = false; f.workspaces[2].ownerId = 'alice';
    assert.equal(JSON.stringify(await (await f.invoke(endpoint)).json()).includes('private-report'), true);
    assert.deepEqual(f.inputs, []); assert.deepEqual(f.writes, []);
    assert.equal(f.versions.length, 2);
  });
}

for (const target of ['versionId', 'releaseId']) {
  test(`changelog ${target} denies historical links before provider or saved content use`, async () => {
    const f = versionReadFixture();
    const body = { [target]: target === 'versionId' ? 'version-0' : 'release-0' };
    const response = await f.invoke('generate-changelog', body);
    assert.equal(response.status, 404); assert.deepEqual(f.inputs, []); assert.deepEqual(f.writes, []);
    f.workspaces[2].members[0].status = true;
    assert.equal((await f.invoke('generate-changelog', body)).status, 200);
    assert.equal(JSON.stringify(f.inputs).includes('private-report-title'), true);
    assert.equal(f.writes.length, 1);
  });
}

test('realtime authorizes all four producer payloads and retained references before delivery', async () => {
  const f = relatedIssueFixture(), own = f.rows[0], joined = f.workspaces[1], events = [];
  let callback, unsubscribe = 0;
  f.dependencies['@/lib/redis'] = { publishEvent: async (_channel, event) => events.push(event),
    getRedisSubscriber: async () => ({ subscribe: async (_channel, cb) => { callback = cb; },
      unsubscribe: async () => { unsubscribe++; }, quit: async () => {} }) };
  const permissions = load('src/lib/permissions.ts', { './prisma': { prisma: f.db } });
  f.dependencies['@/lib/permissions'] = { ...permissions,
    checkUserPermissions: async (_u, _w, keys) => Object.fromEntries(keys.map(key => [key, { hasPermission: true }])) };
  f.dependencies['@/lib/board-item-activity-service'] = { compareObjects: () => [], trackCreation: async () => {} };
  f.dependencies['@/constants/viewPositions'] = { VIEW_POSITIONS_MAX_BULK_SIZE: 500 };
  f.db.$transaction = async callback => callback(f.db);
  f.db.issue.create = async ({ data }) => {
    const row = { ...own, ...data, id: 'new-issue', labels: [], children: [], parent: null };
    f.rows.push(row); return { ...data, id: row.id, labels: [], workspace: f.workspaces[0] };
  };
  const created = await f.route('issues').POST(f.request('POST', undefined,
    { title: 'Created', workspaceId: own.workspaceId, projectId: own.projectId }));
  assert.equal(created.status, 201);
  const status = { id: 'joined-status', project: f.rows[1].project };
  own.statusId = status.id; own.projectStatus = status;
  f.db.projectStatus.findFirst = async args => matches(status, args.where) ? status : null;
  assert.equal((await f.route('issues/[issueId]').PUT(f.request('PUT', undefined, { title: 'Updated' }),
    { params: Promise.resolve({ issueId: own.id }) })).status, 200);
  const view = { id: 'view', ownerId: 'alice', workspaceId: own.workspaceId, workspace: own.workspace };
  f.db.view.findFirst = async args => matches(view, args.where) ? view : null;
  f.db.viewIssuePosition = { upsert: async ({ create }) => create };
  const positions = f.route('views/[viewId]/issue-positions');
  for (const data of [{ issueId: own.id, columnId: 'done', position: 0 },
    { bulk: [own.id, 'new-issue'].map(issueId => ({ issueId, columnId: 'done', position: 0 })) }]) {
    assert.equal((await positions.PUT(f.request('PUT', undefined, data), f.context(own.workspaceId))).status, 200);
  }
  assert.deepEqual(events.map(event => event.type), ['issue.created', 'issue.updated', 'view.issue-position.updated', 'view.issue-position.updated']);
  const response = await f.route('realtime/workspace/[workspaceId]/stream').GET(f.request(), f.context(own.workspaceId));
  const reader = response.body.getReader(), next = async () => new TextDecoder().decode((await reader.read()).value);
  const sentinel = { type: 'workspace.updated', marker: 'boundary' };
  const deliver = async (event, allowed) => {
    await callback(JSON.stringify(event)); await callback(JSON.stringify(sentinel));
    if (allowed) assert.equal(await next(), `data: ${JSON.stringify(event)}\n\n`);
    assert.equal(await next(), `data: ${JSON.stringify(sentinel)}\n\n`);
  };
  try {
    await next(); await next();
    for (const event of events) await deliver(event, true);
    const createdIssue = f.rows.find(row => row.id === 'new-issue');
    createdIssue.project = f.rows[1].project; createdIssue.projectId = createdIssue.project.id;
    joined.members[0].status = false;
    for (const event of events) await deliver(event, false);
    own.statusId = null; own.projectStatus = null;
    await deliver(events[1], false);
    await deliver({ ...events[0], issueId: own.id, projectId: createdIssue.projectId }, false);
    for (const event of [
      { type: 'issue.updated' }, { type: 'view.issue-position.updated' },
      { ...events[3], affectedIssues: [] }, { ...events[3], affectedIssues: [own.id, null] },
      { ...events[3], affectedIssues: own.id }, { ...events[3], affectedIssues: ['missing'] },
      { ...events[3], affectedIssues: [own.id], issueId: createdIssue.id },
    ]) await deliver(event, false);
    joined.ownerId = 'alice';
    for (const event of events) await deliver(event, true);
    f.workspaces[0].ownerId = 'bob';
    await callback(JSON.stringify(events[3]));
    assert.equal((await reader.read()).done, true); assert.equal(unsubscribe, 1);
  } finally { await reader.cancel(); }
});

for (const mode of ['replace', 'delete', 'bulk-statuses']) {
  for (const reference of ['current', 'activity']) {
    test(`status removal ${mode} denies inaccessible ${reference} references before all mutations`, async () => {
      const f = activitySnapshotFixture(), own = f.rows[0], denied = f.rows[2];
      own.project.slug = 'existing';
      const status = { id: 'status', name: 'review', projectId: own.projectId, project: own.project, isDefault: false };
      const target = { ...status, id: 'target', name: 'done' };
      own.statusId = status.id; own.projectStatus = status;
      denied.statusId = reference === 'current' ? status.id : null;
      denied.projectStatus = reference === 'current' ? status : null;
      if (reference === 'activity') {
        await f.producer.trackStatusChange({ itemType: 'ISSUE', itemId: denied.id, workspaceId: denied.workspaceId,
          projectId: denied.projectId, userId: 'alice', oldStatusId: status.id, oldStatusName: 'review' });
        f.activities[0].oldStatus = status;
      }
      f.db.projectStatus.findFirst = async ({ where }) => [status, target].find(row => matches(row, where)) ?? null;
      f.db.projectStatus.findMany = async ({ where }) => [status, target].filter(row => matches(row, where));
      f.db.projectStatus.delete = async args => { f.writes.push(args); return status; };
      f.db.projectStatus.deleteMany = async args => { f.writes.push(args); return { count: 2 }; };
      f.db.issue.updateMany = async args => { f.writes.push(args); return { count: 1 }; };
      const projectRead = f.db.project.findFirst;
      f.db.project.findFirst = async args => (await projectRead(args)) && { ...own.project, slug: 'existing', statuses: [] };
      f.db.project.findUnique = async () => ({ ...own.project, statuses: [], _count: { issues: 1 } });
      const endpoint = 'workspaces/[workspaceId]/projects/[projectSlug]' + (mode === 'bulk-statuses' ? '' : '/statuses/[statusId]');
      const method = mode === 'bulk-statuses' ? 'PATCH' : 'DELETE';
      const invoke = () => f.route(endpoint)[method](f.request(method, own.workspaceId,
        mode === 'bulk-statuses' ? { statuses: [] } : mode === 'replace' ? { targetStatusId: target.id } : {}),
        f.context(own.workspaceId));
      const response = await invoke();
      assert.equal(response.status, 403); assert.deepEqual(f.writes, []); assert.equal(f.calls.writes, 0);
      f.workspaces[2].members[0].status = true;
      assert.equal((await invoke()).status, 200);
      assert.ok(f.writes.length > 0);
    });
  }
}

for (const endpoint of ['workspaces/[workspaceId]/projects', 'workspaces/[workspaceId]/projects/[projectSlug]',
  'projects/[projectId]/statuses', 'workspaces/[workspaceId]/projects/[projectSlug]/statuses/[statusId]/issues-count']) {
  test(`browser project aggregate ${endpoint} excludes denied historical issue references`, async () => {
    const f = issueReportFixture(), project = f.reportProject;
    project.slug = 'existing'; project.repository = null;
    const status = { id: 'status', name: 'review', isActive: true, projectId: project.id, project, issues: project.issues };
    f.own.statusId = status.id; f.own.projectStatus = status;
    f.denied.statusId = status.id; f.denied.projectStatus = status;
    f.denied.workspaceId = f.workspaces[2].id; f.denied.workspace = f.workspaces[2];
    f.db.project.findMany = async args => matches(project, args.where) ? [f.project(project, args)] : [];
    f.db.projectStatus.findFirst = async args => matches(status, args.where) ? f.project(status, args) : null;
    f.db.projectStatus.findMany = async args => matches(status, args.where) ? [f.project(status, args)] : [];
    const invoke = () => f.route(endpoint).GET(f.request('GET', project.workspaceId),
      { params: Promise.resolve({ workspaceId: project.workspaceId, projectSlug: project.slug, projectId: project.id, statusId: status.id }) });
    const first = await invoke(); assert.equal(first.status, 200);
    const expected = await first.json();
    f.addDenied();
    assert.deepEqual(await (await invoke()).json(), expected);
    f.workspaces[2].members[0].status = true;
    assert.notDeepEqual(await (await invoke()).json(), expected);
    f.workspaces[2].members[0].status = false; f.workspaces[2].ownerId = 'alice';
    assert.notDeepEqual(await (await invoke()).json(), expected);
  });
}

test('time tracking project constraint never broadens for revoked empty or missing projects', async () => {
  const f = issueReportFixture(), logs = [f.own, f.rows[2]].map((issue, index) => ({ id: `log-${index}`,
    workspaceId: f.own.workspaceId, issueId: issue.id, issue, timeSpent: 10 + index, userId: 'alice', user: f.state.user, loggedAt: new Date() }));
  f.db.workLog = { findMany: async args => logs.filter(row => matches(row, args.where)).map(row => f.project(row, args)) };
  const invoke = projectId => f.route('apps/auth/reports/time-tracking').GET(new Request(
    `https://collab.example.test/?projectId=${projectId}&includeDetails=true`));
  for (const projectId of [f.rows[2].projectId, f.rows[1].projectId, 'missing']) {
    const response = await invoke(projectId); assert.equal(response.status, 200);
    const body = JSON.stringify(await response.json());
    assert.equal(body.includes('protected-own'), false);
    assert.equal(body.includes('log-0'), false);
    assert.equal(body.includes('log-1'), false);
  }
  const allowed = JSON.stringify(await (await invoke(f.own.projectId)).json());
  assert.equal(allowed.includes('protected-own'), true);
  f.workspaces[2].members[0].status = true;
  const restored = JSON.stringify(await (await invoke(f.rows[2].projectId)).json());
  assert.equal(restored.includes('protected-revoked'), true);
  assert.equal(restored.includes('protected-own'), false);
});

for (const ordering of ['delete-first', 'revoke-first']) {
  test(`deleted worklog activity ${ordering} withholds whole payload and count`, async () => {
    const f = activitySnapshotFixture(), issue = f.rows[0];
    issue.statusId = 'historic'; issue.projectStatus = { project: f.rows[1].project };
    issue.timeSpentMinutes = 0;
    f.db.workLog = { create: async ({ data }) => ({ ...data, id: 'worklog', user: f.state.user, createdAt: new Date() }) };
    f.db.$transaction = async callback => callback(f.db);
    const response = await f.route('issues/[issueId]/work-logs').POST(f.request('POST', undefined,
      { timeSpent: 15, description: 'retained-private-description' }), { params: Promise.resolve({ issueId: issue.id }) });
    assert.equal(response.status, 201);
    const read = async () => {
      const response = await f.call('apps/auth/workspace/activity');
      assert.equal(response.status, 200); return JSON.stringify(await response.json());
    };
    assert.equal((await read()).includes('retained-private-description'), true);
    if (ordering === 'revoke-first') f.joined.members[0].status = false;
    f.rows.splice(0, 1);
    f.joined.members[0].status = false;
    assert.equal((await read()).includes('retained-private-description'), false);
    const app = await (await f.call('apps/auth/workspace/activity')).json();
    assert.deepEqual(app.activities, []); assert.equal(app.pagination.total, 0);
    assert.equal(f.activities.length, 1);
    assert.equal(f.activities[0].details.includes('retained-private-description'), true);
  });
  test(`deleted notifications ${ordering} preserve rows without exposing payloads`, async () => {
    const f = scopedNotificationFixture(), issue = f.issues[0];
    issue.statusId = 'historic'; issue.projectStatus = { project: f.issues[1].project };
    for (const type of ['ISSUE_DELETED', 'PROJECT_ISSUE_DELETED']) {
      assert.equal(await f.NotificationService.notifyUsers(['alice'], type, 'retained-key actor deletion', 'bob', { issueId: issue.id }), 1);
    }
    if (ordering === 'revoke-first') f.workspaces[1].members[0].status = false;
    f.issues.splice(0, 1);
    f.workspaces[1].members[0].status = false;
    assert.deepEqual(await (await f.route('notifications').GET(f.request())).json(), []);
    const pushes = f.deliveries.length, writes = f.calls.writes;
    await f.NotificationService.notifyUsers(['alice'], 'ISSUE_DELETED', 'new-orphan', 'bob', { issueId: issue.id, workspaceId: f.workspaces[0].id });
    assert.equal(f.deliveries.length, pushes); assert.equal(f.calls.writes, writes);
    assert.equal(f.stored.length, 2);
    assert.equal(await f.NotificationService.notifyUsers(['alice'], 'PERSONAL', 'personal-control', 'bob', { personal: true }), 1);
    assert.deepEqual((await (await f.route('notifications').GET(f.request())).json()).map(row => row.content), ['personal-control']);
  });
}

test('changelog regeneration dispatches current inputs and preserves original output', async () => {
  const f = versionReadFixture(), source = f.versions[1];
  source.issueAccessInvalidated = true;
  source.repository = { projectId: f.own.projectId, project: f.own.project };
  source.major = 1; source.minor = 0; source.patch = 0; source.releaseType = 'PATCH';
  f.db.$queryRaw = async () => [];
  f.db.$transaction = async callback => callback(f.db);
  f.db.version.create = async ({ data }) => { f.writes.push(data); return { id: 'replacement', ...data }; };
  const old = source.aiChangelog;
  const response = await f.invoke('generate-changelog', { versionId: source.id, regenerate: true });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.versionId, 'replacement'); assert.equal(body.sourceVersionId, source.id);
  assert.equal(source.aiChangelog, old); assert.equal(source.issueAccessInvalidated, true);
  assert.equal(f.inputs.length, 1); assert.equal(f.writes.length, 1);
  assert.equal(JSON.stringify(f.inputs).includes('saved changelog'), false);
  assert.equal(JSON.stringify(f.inputs).includes('saved summary'), false);
  assert.equal(JSON.stringify(f.inputs).includes('protected-own'), true);
});

for (const deniedScope of ['project', 'status']) {
  test(`bulk relations deny mixed ID and key targets with revoked ${deniedScope} before any mutation`, async () => {
    const f = relatedIssueFixture(), source = f.rows[0], target = f.rows[1];
    target.issueKey = 'A1B-T1';
    const applyDenied = () => {
      if (deniedScope === 'project') target.project = f.rows[2].project;
      else { target.statusId = 'historical'; target.projectStatus = { project: f.rows[2].project }; }
    };
    applyDenied();
    let transactions = 0;
    f.db.issueRelation.upsert = async ({ create }) => { f.writes.push(create); return create; };
    f.db.$transaction = async writes => { transactions++; return Promise.all(writes); };
    const invoke = refs => f.route('workspaces/[workspaceId]/issues/[issueKey]/relations/bulk').POST(
      f.request('POST', undefined, { relations: refs.map(targetIssueId => ({ targetIssueId, relationType: 'BLOCKS' })) }),
      { params: Promise.resolve({ workspaceId: source.workspaceId, issueKey: source.issueKey }) });
    for (const ref of [target.id, target.issueKey]) {
      assert.equal((await invoke([source.id, ref])).status, 404);
      assert.deepEqual(f.writes, []); assert.equal(transactions, 0);
    }
    f.workspaces[2].members[0].status = true;
    let response = await invoke([target.id, target.issueKey]);
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).relations.map(row => row.targetIssueId), [target.id, target.id]);
    f.writes.length = 0; transactions = 0;
    f.workspaces[2].members[0].status = false;
    source.projectStatus = { project: f.rows[2].project }; source.statusId = 'denied-source';
    assert.equal((await invoke([source.id])).status, 404);
    assert.deepEqual(f.writes, []); assert.equal(transactions, 0);
  });
}

for (const endpoint of ['sync-releases', 'sync']) {
  for (const state of ['revoked', 'invalidated', 'deleted', 'release-link']) {
    test(`release sync ${endpoint} withholds ${state} versions and counts without duplicate creation`, async () => {
      const f = versionReadFixture();
      const repository = { id: 'repo', project: f.reportProject, accessToken: 'encrypted', fullName: 'fixture/repo' };
      f.db.repository.findFirst = async args => matches(repository, args.where) ? f.project(repository, args) : null;
      f.db.repository.findUnique = f.db.repository.findFirst;
      f.db.repository.update = async () => repository;
      if (['invalidated', 'deleted'].includes(state)) f.versions[0].issueAccessInvalidated = true;
      if (state === 'release-link') {
        f.releases[0].version = { ...f.versions[0] };
        f.versions[0].issues = f.versions[1].issues;
      }
      if (state === 'deleted') f.versions[0].issues = [];
      const providerRows = f.releases.map((release, index) => ({ id: index + 1, tag_name: release.tagName,
        name: release.name, body: release.description, draft: false, prerelease: false,
        published_at: '2026-09-24T00:00:00Z', html_url: 'https://fixture.test/release' }));
      const created = [], upserts = [];
      f.db.version.create = async ({ data }) => {
        created.push(data);
        const row = { ...data, id: `new-${created.length}`, issueAccessInvalidated: false, issues: [] };
        f.versions.push(row); return row;
      };
      f.db.release.upsert = async ({ where, create, update }) => {
        upserts.push(where.repositoryId_tagName.tagName);
        let row = f.releases.find(row => row.tagName === where.repositoryId_tagName.tagName);
        if (row) Object.assign(row, update);
        else { row = { ...create, id: `new-release-${upserts.length}`, version: f.versions.find(v => v.id === create.versionId) }; f.releases.push(row); }
        return { ...row, version: undefined };
      };
      f.db.release.findMany = async args => f.releases.filter(row => matches(row, args.where))
        .map(({ version, ...row }) => row);
      f.dependencies.__globals = { fetch: async url => ({ ok: true, json: async () => url.includes('/releases?') ? providerRows : [] }) };
      const invoke = () => f.route(`github/repositories/[repositoryId]/${endpoint}`).POST(f.request('POST'),
        { params: Promise.resolve({ repositoryId: 'repo' }) });
      let response = await invoke();
      assert.equal(response.status, 200);
      let body = await response.json();
      assert.equal(JSON.stringify(body).includes('private-report'), false);
      assert.deepEqual(created, []); assert.deepEqual(upserts, ['1.0.1']);
      if (endpoint === 'sync-releases') { assert.equal(body.releases.length, 1); assert.equal(body.message, 'Synced 1 releases'); }
      else assert.equal(body.results.releases, 1);
      if (state === 'revoked') {
        f.workspaces[2].members[0].status = true;
        response = await invoke(); body = await response.json();
        assert.equal(response.status, 200);
        assert.equal(endpoint === 'sync-releases' ? body.releases.length : body.results.releases, 2);
        assert.deepEqual(created, []);
      }
      providerRows.push({ ...providerRows[1], id: 10, tag_name: 'v2.0.0' });
      response = await invoke(); assert.equal(response.status, 200);
      assert.equal(created.length, 1); assert.equal(created[0].version, '2.0.0');
      await invoke(); assert.equal(created.length, 1);
    });
  }
}
