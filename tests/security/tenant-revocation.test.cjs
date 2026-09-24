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
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports, URL, Headers, Buffer, TextDecoder, Error,
    console: { error() {}, log() {} },
    process: { env: { COLLAB_AUTH_MODE: 'gateway', COLLAB_GATEWAY_ISSUER: issuer } },
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
    project, workspace: project.workspace, sourceRelations: [], targetRelations: [] }));
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
    '@/lib/prisma': { prisma: db }, '@/lib/auth-options': { authOptions: {} },
    '@/lib/github/public-repository': load('src/lib/github/public-repository.ts'),
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
