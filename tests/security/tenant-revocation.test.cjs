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
    'next-auth': { getServerSession: async () => { throw new Error('Gateway fell back to legacy auth'); } },
    './gateway-identity': load('src/lib/gateway-identity.ts'),
    '@/lib/url-utils': { isUUID: value => /^[0-9a-f-]{36}$/.test(value) },
    '@/lib/shared-issue-key-utils': load('src/lib/shared-issue-key-utils.ts'),
  };
  dependencies['@/lib/request-session'] = load('src/lib/request-session.ts', dependencies);
  dependencies['@/lib/auth'] = { authConfig: {}, authOptions: {}, getAuthSession: dependencies['@/lib/request-session'].getServerSession };
  dependencies['@/lib/slug-resolvers'] = load('src/lib/slug-resolvers.ts', dependencies);
  dependencies['@/lib/issue-finder'] = load('src/lib/issue-finder.ts', dependencies);
  dependencies['@/lib/view-helpers'] = load('src/lib/view-helpers.ts', dependencies);
  dependencies['@/lib/issue-references'] = load('src/lib/issue-references.ts', dependencies);
  dependencies['@/lib/session'] = load('src/lib/session.ts', dependencies);
  dependencies['@/lib/post-access'] = load('src/lib/post-access.ts', dependencies);
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

test('gateway issue search denies revoked membership by ID and slug before content reads', async () => {
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

test('gateway project creation denies revoked membership without content reads or writes and retains owner access', async () => {
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

test('revoked identity is rejected while tenant revocation leaves the gateway session intact', async () => {
  const f = fixture(), search = f.route('issues/search'), projects = f.route('workspaces/[workspaceId]/projects');
  const user = f.state.user;
  assert.equal((await f.dependencies['@/lib/request-session'].getServerSession({})).user.id, 'alice');
  for (const invalidate of [() => { f.state.mapped = false; }, () => { f.state.user = null; }, () => { f.state.claims = false; }]) {
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
  const f = fixture(); let callback, unsubscribed = 0, quit = 0;
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
    await callback(JSON.stringify({ type: 'issue.created', key: 'allowed' }));
    assert.match(new TextDecoder().decode((await reader.read()).value), /allowed/);
    if (revoke === 'membership') f.workspaces[1].members[0].status = false;
    if (revoke === 'mapping') f.state.mapped = false;
    if (revoke === 'user') f.state.user = null;
    await callback(JSON.stringify({ type: 'issue.created', key: 'secret-after-revocation' }));
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
test('issue deletion retains server tenant scope for active recipients and suppresses revoked delivery', async () => {
  const f = scopedNotificationFixture();
  const workspace = f.workspaces[1];
  workspace.members.push({ userId: 'dan', status: true }, { userId: 'carol', status: false });
  const lookupUser = f.db.user.findUnique;
  f.db.user.findUnique = async args => ['bob', 'dan', 'carol'].includes(args.where.id) ? { id: args.where.id } : lookupUser(args);
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
  assert.deepEqual(f.stored.map(row => row.userId).sort(), ['bob', 'dan']);
  assert.deepEqual(f.deliveries.map(([userId]) => userId).sort(), ['bob', 'dan']);
  assert.ok(f.stored.every(row => row.issueId === 'issue-joined' && row.workspaceId === workspace.id));
  const where = f.dependencies['@/lib/notification-access'].notificationAccessWhere('dan');
  assert.equal(f.stored.filter(row => matches(row, where)).length, 1);
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
    groupBy: async () => [], count: async () => 0,
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
  f.dependencies['@/lib/secrets/access'] = { noteAccessWhere: () => ({}) };
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
  'apps/auth/issues/[issueIdOrKey]/activity', 'issues/[issueId]/activities']) {
  test(`historical activity status access filters both relations in ${endpoint}`, async () => {
    const f = relatedIssueFixture(), own = f.workspaces[0], joined = f.workspaces[1];
    const current = f.rows[0], accessedStatuses = [];
    const privateStatus = { id: 'historic-status', name: 'historic-private-status',
      displayName: 'Historic private status', project: f.rows[1].project, color: 'red' };
    const publicStatus = { id: 'current-status', name: 'current-public-status', project: current.project, color: 'green' };
    current.statusId = publicStatus.id; current.projectStatus = publicStatus;
    const activities = [
      { id: 'old', oldStatus: privateStatus, newStatus: publicStatus },
      { id: 'new', oldStatus: publicStatus, newStatus: privateStatus },
    ].map(row => ({ ...row, itemId: current.id, itemType: 'ISSUE', workspaceId: own.id,
      action: 'STATUS_CHANGED', createdAt: new Date('2026-09-01'), userId: 'alice', user: { id: 'alice' } }));
    f.dependencies['date-fns'] = require('date-fns');
    f.dependencies['@/lib/apps/auth-middleware'] = { withAppAuth: handler => (req, params) => handler(req,
      { workspace: own, user: f.state.user }, params) };
    f.db.issue.findUnique = f.db.issue.findFirst;
    f.db.user.findMany = async () => [];
    f.db.issueActivity.count = async ({ where }) => activities.filter(row => matches(row, where)).length;
    f.db.issueActivity.findMany = async args => activities.filter(row => matches(row, args.where)).map(row => {
      const result = f.project(row, args);
      for (const name of ['oldStatus', 'newStatus']) if (result[name]) accessedStatuses.push(result[name].name);
      return result;
    });
    const { GET } = f.route(endpoint);
    const call = () => GET(new Request(`https://collab.example.test/?workspaceId=${own.id}&startDate=2026-09-01&endDate=2026-09-02`),
      { params: Promise.resolve({ workspaceId: own.id, issueId: current.id, issueIdOrKey: current.id }) });
    let response = await call();
    assert.equal(response.status, 200);
    assert.equal(JSON.stringify(await response.json()).includes('historic-private-status'), true);
    joined.members[0].status = false; accessedStatuses.length = 0;
    for (const missing of endpoint.includes('issues/') ? [false] : [false, true]) {
      if (missing) activities.forEach(row => { row.itemId = 'deleted-issue'; });
      response = await call();
      assert.equal(response.status, 200);
      const body = JSON.stringify(await response.json());
      assert.equal(body.includes('historic-private-status'), false);
      assert.equal(body.includes('current-public-status'), true);
    }
    assert.equal(accessedStatuses.includes('historic-private-status'), false);
    joined.ownerId = 'alice';
    assert.equal(JSON.stringify(await (await call()).json()).includes('historic-private-status'), true);
    assert.deepEqual(f.writes, []);
    assert.equal(activities[0].oldStatus, privateStatus);
  });
}
