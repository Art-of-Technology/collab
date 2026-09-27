const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

function load(relative, dependencies) {
  const file = path.resolve(__dirname, '../../', relative);
  const loaded = new Module(file, module);
  loaded.filename = file; loaded.paths = Module._nodeModulePaths(path.dirname(file));
  const original = loaded.require.bind(loaded);
  loaded.require = name => Object.hasOwn(dependencies, name) ? dependencies[name] : original(name);
  loaded._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, file);
  return loaded.exports;
}

function fixture() {
  let bindings = [{ projectId: 'forge', workspaceId: 'workspace' }], writes = 0;
  const issues = [
    { id: 'bound', projectId: 'forge', workspaceId: 'workspace', workspace: { ownerId: 'actor', members: [] } },
    { id: 'legacy', projectId: 'ordinary', workspaceId: 'workspace', workspace: { ownerId: 'actor', members: [] } },
  ];
  const mutate = async () => { writes++; return { id: 'comment', authorId: 'actor' }; };
  const prisma = {
    issue: { findMany: async ({ where }) => issues.filter(issue => where.id.in.includes(issue.id)) },
    issueComment: { create: mutate, update: mutate, delete: mutate, findFirst: async () => ({ id: 'comment', authorId: 'actor', replies: [] }), findMany: async () => [] },
    issueCommentReaction: { create: mutate, delete: mutate, findFirst: async () => null },
    issueRelation: { upsert: mutate },
    workspace: { findFirst: async () => ({ id: 'workspace' }), findUnique: async ({ where }) => ({ id: where.id, ownerId: 'actor' }), delete: mutate },
    user: { findUnique: async () => ({ id: 'actor' }) },
    $transaction: async operation => { writes++; return typeof operation === 'function' ? operation(prisma) : Promise.all(operation); },
  };
  const guard = load('src/lib/forge/legacy-write-guard.ts', {
    'server-only': {}, '@/lib/prisma': { prisma }, './reader': { readForgeBindings: async () => {
      if (bindings instanceof Error) throw bindings;
      return bindings;
    } },
  });
  const dependencies = {
    '@/lib/forge/legacy-write-guard': guard,
    '@/lib/prisma': { prisma },
    '@/lib/session': { getCurrentUser: async () => ({ id: 'actor' }) },
    '@/lib/request-session': { getServerSession: async () => ({ user: { id: 'actor', email: 'actor@example.test' } }) },
    '@/lib/auth-options': { authOptions: {} },
    '@/lib/issue-finder': { findIssueByIdOrKey: async id => issues.find(issue => issue.id === id), issueReadAccessWhere: () => ({}), userHasWorkspaceAccess: async () => true },
    '@/utils/mentions': { extractMentionUserIds: () => [] },
    '@/lib/post-access': {},
    '@/lib/notification-service': {}, 'next/cache': { revalidatePath() {} },
  };
  return { guard, dependencies, writes: () => writes, bind: value => { bindings = value; } };
}
const request = body => new Request('http://localhost/api/issues', { method: 'POST', body: JSON.stringify(body) });
const params = issueId => ({ params: Promise.resolve({ issueId, commentId: 'comment', workLogId: 'log' }) });

test('bound legacy comment entrypoints deny without writes; reads and unrelated writes still work', async () => {
  const f = fixture();
  const comments = load('src/app/api/issues/[issueId]/comments/route.ts', f.dependencies);
  const comment = load('src/app/api/issues/[issueId]/comments/[commentId]/route.ts', f.dependencies);
  const likes = load('src/app/api/issues/[issueId]/comments/[commentId]/like/route.ts', f.dependencies);
  for (const operation of [comments.POST, comment.PUT, comment.DELETE, likes.POST]) {
    const response = await operation(request({ content: 'Body' }), params('bound'));
    assert.equal(response.status, 409); assert.equal(f.writes(), 0);
  }
  assert.equal((await comments.GET(request({}), params('bound'))).status, 200);
  assert.equal((await comments.POST(request({ content: 'Body' }), params('legacy'))).status, 201);
  assert.equal(f.writes(), 1);
});

test('bound legacy comment server actions and worklog create deny before writes', async () => {
  const f = fixture();
  const actions = load('src/actions/issueComment.ts', f.dependencies);
  for (const operation of [
    () => actions.toggleIssueCommentLike('bound', 'comment'),
    () => actions.updateIssueComment('bound', 'comment', { content: 'Body' }),
    () => actions.deleteIssueComment('bound', 'comment'),
  ]) await assert.rejects(operation, f.guard.ForgeProjectWriteError);
  const logs = load('src/app/api/issues/[issueId]/work-logs/route.ts', f.dependencies);
  assert.equal((await logs.POST(request({ timeSpent: 5 }), params('bound'))).status, 409);
  assert.equal(f.writes(), 0);
});

test('bulk relation guard checks all targets before starting any write', async () => {
  const f = fixture();
  const bulk = load('src/app/api/workspaces/[workspaceId]/issues/[issueKey]/relations/bulk/route.ts', f.dependencies);
  const response = await bulk.POST(request({ relations: [
    { targetIssueId: 'legacy', relationType: 'RELATES_TO' },
    { targetIssueId: 'bound', relationType: 'RELATES_TO' },
  ] }), { params: Promise.resolve({ workspaceId: 'workspace', issueKey: 'legacy' }) });
  assert.equal(response.status, 409); assert.equal(f.writes(), 0);
});

test('project guard denies either move endpoint and fails closed on invalid configuration', async () => {
  const f = fixture();
  await assert.rejects(f.guard.assertLegacyProjectWriteAllowed('ordinary', 'forge'), f.guard.ForgeProjectWriteError);
  await assert.rejects(f.guard.assertLegacyProjectWriteAllowed('forge', 'ordinary'), f.guard.ForgeProjectWriteError);
  await f.guard.assertLegacyProjectWriteAllowed('ordinary');
  f.bind(new Error('invalid configuration'));
  await assert.rejects(f.guard.assertLegacyIssueWriteAllowed('legacy'), /invalid configuration/);
  f.bind([]);
  await f.guard.assertLegacyIssueWriteAllowed('bound');
  assert.equal(f.writes(), 0);
});

test('issue move API denies bound source and destination before its transaction', async () => {
  const f = fixture();
  const permissions = { Permission: {}, checkUserPermissions: async () => new Proxy({}, { get: () => ({ hasPermission: true }) }), canActOnOwnContent: () => true };
  const mutation = load('src/lib/issue-mutation.ts', { ...f.dependencies, '@/lib/permissions': permissions, '@/utils/html-normalizer': {} });
  const route = load('src/app/api/issues/[issueId]/route.ts', {
    '@/lib/issue-mutation': mutation,
    ...f.dependencies,
    '@/lib/issue-finder': { ...f.dependencies['@/lib/issue-finder'], userHasWorkspaceAccess: async () => true },
    '@/lib/permissions': {}, '@/lib/board-item-activity-service': {}, '@/lib/redis': {},
    '@/lib/event-bus': {}, '@/utils/html-normalizer': {},
  });
  for (const [source, destination] of [['bound', 'ordinary'], ['legacy', 'forge']]) {
    const response = await route.PUT(request({ projectId: destination }), params(source));
    assert.equal(response.status, 409); assert.equal(f.writes(), 0);
  }
});

test('workspace deletion preflight protects bound records without changing unrelated workspaces', async () => {
  const f = fixture();
  await assert.rejects(f.guard.assertLegacyWorkspaceDeleteAllowed('workspace'), f.guard.ForgeProjectWriteError);
  const route = load('src/app/api/workspaces/[workspaceId]/route.ts', f.dependencies);
  const actions = load('src/actions/workspace.ts', { ...f.dependencies, '@/lib/auth': {}, '@/lib/utils': {} });
  assert.equal((await route.DELETE(request({}), { params: Promise.resolve({ workspaceId: 'workspace' }) })).status, 409);
  await assert.rejects(actions.deleteWorkspace('workspace'), f.guard.ForgeProjectWriteError);
  assert.equal(f.writes(), 0);
  await actions.deleteWorkspace('other');
  assert.equal(f.writes(), 1);
});
