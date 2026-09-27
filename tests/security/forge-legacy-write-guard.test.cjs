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
  const projects = [{ id: 'forge', workspaceId: 'workspace' }, { id: 'ordinary', workspaceId: 'workspace' }];
  const relations = [];
  function matchesIssue(issue, where) {
    if (!issue) return false;
    return Object.entries(where).every(([key, value]) => {
      if (key === 'OR') return value.some(condition => matchesIssue(issue, condition));
      if (key === 'parent') return matchesIssue(issues.find(candidate => candidate.id === issue.parentId), value);
      if (key === 'project') return Object.entries(value).every(([field, expected]) =>
        projects.find(project => project.id === issue.projectId)?.[field] === expected);
      if (key === 'sourceRelations' || key === 'targetRelations') {
        const ownKey = key === 'sourceRelations' ? 'sourceIssueId' : 'targetIssueId';
        return relations.filter(relation => relation[ownKey] === issue.id).some(relation =>
          Object.entries(value.some).every(([endpoint, condition]) => {
            assert.ok(['sourceIssue', 'targetIssue'].includes(endpoint));
            return matchesIssue(issues.find(candidate => candidate.id === relation[`${endpoint}Id`]), condition);
          }));
      }
      assert.ok(['id', 'projectId', 'workspaceId'].includes(key), `Unsupported issue predicate: ${key}`);
      return typeof value === 'object' ? value.in.includes(issue[key]) : issue[key] === value;
    });
  }
  const mutate = async () => { writes++; return { id: 'comment', authorId: 'actor' }; };
  const prisma = {
    issue: {
      findMany: async ({ where }) => issues.filter(issue => matchesIssue(issue, where)),
      findFirst: async ({ where }) => issues.find(issue => matchesIssue(issue, where)) ?? null,
      findUnique: async ({ where }) => issues.find(issue => issue.id === where.id) ?? null,
      delete: mutate,
    },
    issueFollower: { findMany: async () => [] },
    projectFollower: { findMany: async () => [] },
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
  return { guard, dependencies, issues, projects, relations, writes: () => writes, bind: value => { bindings = value; } };
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


test('issue deletion denies connected cascade endpoints in either direction and allows unrelated deletion', async () => {
  for (const link of ['outgoing', 'incoming', 'child', 'unrelated']) {
    const f = fixture();
    if (link === 'child') f.issues[0].parentId = 'legacy';
    else f.relations.push({
      sourceIssueId: link === 'incoming' ? 'bound' : 'legacy',
      targetIssueId: link === 'outgoing' ? 'bound' : link === 'incoming' ? 'legacy' : 'ordinary-peer',
    });
    f.issues.push({ id: 'ordinary-peer', projectId: 'ordinary', workspaceId: 'workspace' });
    const route = load('src/app/api/issues/[issueId]/route.ts', {
      ...f.dependencies, '@/lib/issue-mutation': {},
      '@/lib/permissions': {
        Permission: { DELETE_ANY_TASK: 'any', DELETE_SELF_TASK: 'self' },
        checkUserPermissions: async () => ({ any: { hasPermission: true }, self: { hasPermission: true } }),
        canActOnOwnContent: () => true,
      },
      '@/lib/board-item-activity-service': {}, '@/lib/redis': {},
      '@/lib/event-bus': { emitIssueDeleted: async () => {} },
    });
    await f.guard.assertLegacyIssueWriteAllowed('legacy');
    const response = await route.DELETE(request({}), params('legacy'));
    assert.equal(response.status, link === 'unrelated' ? 200 : 409, link);
    assert.equal(f.writes(), link === 'unrelated' ? 1 : 0, link);
  }
});

test('both workspace deletion callers deny relation cascades through either issue foreign key', async () => {
  for (const caller of ['route', 'action']) {
    for (const foreignKey of ['workspace', 'project']) {
      for (const direction of ['outgoing', 'incoming', 'unrelated']) {
        const f = fixture();
        f.issues[1].workspaceId = foreignKey === 'workspace' ? 'other' : 'workspace';
        f.projects[1].workspaceId = foreignKey === 'project' ? 'other' : 'workspace';
        f.issues.push({ id: 'ordinary-peer', projectId: 'ordinary', workspaceId: 'workspace' });
        f.relations.push({
          sourceIssueId: direction === 'incoming' ? 'bound' : 'legacy',
          targetIssueId: direction === 'outgoing' ? 'bound' : direction === 'incoming' ? 'legacy' : 'ordinary-peer',
        });
        const allowed = direction === 'unrelated';
        const context = `${caller}/${foreignKey}/${direction}`;
        if (caller === 'route') {
          const route = load('src/app/api/workspaces/[workspaceId]/route.ts', f.dependencies);
          const response = await route.DELETE(request({}), { params: Promise.resolve({ workspaceId: 'other' }) });
          assert.equal(response.status, allowed ? 200 : 409, context);
        } else {
          const actions = load('src/actions/workspace.ts', { ...f.dependencies, '@/lib/auth': {}, '@/lib/utils': {} });
          if (allowed) assert.deepEqual(await actions.deleteWorkspace('other'), { success: true });
          else await assert.rejects(actions.deleteWorkspace('other'), f.guard.ForgeProjectWriteError, context);
        }
        assert.equal(f.writes(), allowed ? 1 : 0, context);
      }
    }
  }
});
