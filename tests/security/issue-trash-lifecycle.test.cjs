const { assert, test, load, matches } = require('./helpers.cjs');
const { Prisma } = require('@prisma/client');

const copy = value => structuredClone(value);
const json = value => JSON.parse(JSON.stringify(value));
const initialTime = new Date('2026-10-22T10:00:00Z');
function knownError(code) { return new Prisma.PrismaClientKnownRequestError('private database detail', { code, clientVersion: 'test' }); }
function select(row, fields) {
  if (!row || !fields) return copy(row);
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value).map(([key, value]) => [key,
    value === true ? copy(row[key]) : Array.isArray(row[key])
      ? row[key].filter(item => !value.where || matches(item, value.where)).map(item => select(item, value.select))
      : select(row[key], value.select),
  ]));
}

function fixture(options = {}) {
  const workspace = { id: 'w1', slug: 'workspace-one', name: 'Workspace One', ownerId: 'owner', members: [
    { userId: 'admin', role: 'ADMIN', status: true }, { userId: 'member', role: 'MEMBER', status: true },
    { userId: 'revoked', role: 'ADMIN', status: false },
  ] };
  let state = {
    workspaces: [workspace, { id: 'w2', slug: 'foreign', name: 'Foreign', ownerId: 'other', members: [] }],
    projects: [{ id: 'p1', workspaceId: 'w1' }, { id: 'p2', workspaceId: 'w1' }, { id: 'p3', workspaceId: 'w2' }],
    issues: [
      { id: 'issue-one', issueKey: 'HP-1', title: 'Original discussion', description: 'Keep this description', workspaceId: 'w1', projectId: 'p1', reporterId: 'member', updatedAt: initialTime, deletedAt: options.trashed ? initialTime : null, deletedById: options.trashed ? 'owner' : null },
      { id: 'issue-two', issueKey: 'HP-2', title: 'Other project', workspaceId: 'w1', projectId: 'p2', reporterId: 'owner', updatedAt: initialTime, deletedAt: null, deletedById: null },
      { id: 'issue-foreign', issueKey: 'HP-3', title: 'Foreign workspace', workspaceId: 'w2', projectId: 'p3', reporterId: 'other', updatedAt: initialTime, deletedAt: null, deletedById: null },
    ],
    comments: [{ id: 'comment-one', issueId: 'issue-one', content: 'Original comment', parentId: null }],
    relations: [{ id: 'relation-one', sourceIssueId: 'issue-one', targetIssueId: 'issue-two', relationType: 'BLOCKS' }],
    workLogs: [{ id: 'log-one', issueId: 'issue-one', timeSpent: 60 }],
    history: [{ id: 'history-one', itemId: 'issue-one', action: 'CREATED', details: 'Original history' }], audits: [],
  };
  const effects = [], transactions = [], events = [], appScopes = [], sessionReads = [];
  const userId = options.userId || 'owner';
  let insideTransaction = false;
  function hydrate(issue, current) {
    return { ...issue, project: current.projects.find(project => project.id === issue.projectId),
      parent: current.issues.find(parent => parent.id === issue.parentId) || null,
      sourceRelations: current.relations.filter(relation => relation.sourceIssueId === issue.id).map(relation => ({ ...relation, sourceIssue: { id: relation.sourceIssueId }, targetIssue: { id: relation.targetIssueId } })),
      targetRelations: current.relations.filter(relation => relation.targetIssueId === issue.id).map(relation => ({ ...relation, sourceIssue: { id: relation.sourceIssueId }, targetIssue: { id: relation.targetIssueId } })),
      _count: { comments: current.comments.filter(comment => comment.issueId === issue.id).length,
        sourceRelations: current.relations.filter(relation => relation.sourceIssueId === issue.id).length,
        targetRelations: current.relations.filter(relation => relation.targetIssueId === issue.id).length,
        workLogs: current.workLogs.filter(log => log.issueId === issue.id).length },
    };
  }
  function database(current, transactional) {
    const write = name => {
      assert.equal(transactional, true, `${name} must use the transaction client`);
      effects.push(name);
      if (options.fail === name) throw new Error('private audit storage detail');
    };
    return {
      workspace: { findFirst: async ({ where, select: fields }) => select(current.workspaces.find(row => matches(row, where)) || null, fields) },
      project: { findFirst: async ({ where, select: fields }) => select(current.projects.find(row => matches(row, where)) || null, fields) },
      issue: {
        findFirst: async ({ where, select: fields }) => select(current.issues.map(issue => hydrate(issue, current)).find(row => matches(row, where)) || null, fields),
        findMany: async ({ where, select: fields }) => current.issues.map(issue => hydrate(issue, current)).filter(row => matches(row, where)).map(row => select(row, fields)),
        count: async ({ where }) => current.issues.filter(row => matches(row, where)).length,
        update: async ({ where, data }) => {
          write('update');
          if (options.stale) current.issues.find(row => row.id === where.id).updatedAt = new Date(initialTime.getTime() + 1000);
          const issue = current.issues.find(row => matches(row, where));
          if (!issue) throw knownError('P2025');
          Object.assign(issue, copy(data), { updatedAt: new Date() });
          return copy(issue);
        },
        delete: async ({ where }) => {
          write('delete');
          if (options.stale) current.issues.find(row => row.id === where.id).updatedAt = new Date(initialTime.getTime() + 1000);
          const issue = current.issues.find(row => matches(row, where));
          if (!issue) throw knownError('P2025');
          current.issues = current.issues.filter(row => row.id !== issue.id);
          current.comments = current.comments.filter(row => row.issueId !== issue.id);
          current.relations = current.relations.filter(row => row.sourceIssueId !== issue.id && row.targetIssueId !== issue.id);
          current.workLogs = current.workLogs.filter(row => row.issueId !== issue.id);
          return copy(issue);
        },
      },
      issueDeletionAudit: { create: async ({ data }) => { write('audit'); current.audits.push(copy(data)); return copy(data); } },
      issueActivity: { create: async ({ data }) => { write('activity'); current.history.push(copy(data)); return copy(data); } },
    };
  }
  const db = new Proxy({}, { get: (_, name) => {
    if (name === '$transaction') return async (operation, settings) => {
      transactions.push(settings);
      const draft = copy(state);
      insideTransaction = true;
      try {
        const result = await operation(database(draft, true));
        if (options.commitError) throw knownError(options.commitError);
        state = draft;
        return result;
      } finally { insideTransaction = false; }
    };
    return database(state, false)[name];
  } });
  const response = (body, init = {}) => ({ status: init.status || 200, body });
  const globals = { URL, Headers, Error, console: { error() {}, warn() {}, log() {} } };
  const deps = {
    'server-only': {}, '@prisma/client': { Prisma }, zod: require('zod'),
    'next/server': { NextResponse: { json: response } }, '@/lib/prisma': { prisma: db, issueTrashPrisma: db },
    '@/lib/session': { getCurrentUser: async () => { sessionReads.push(true); return options.absent ? null : { id: userId }; } },
    '@/lib/agent-label-triggers': {},
    '@/lib/event-bus': Object.fromEntries(['emitIssueCreated', 'emitIssueDeleted'].map(name => [name, async issue => {
      assert.equal(insideTransaction, false, 'events must follow commit');
      events.push({ name, issue: copy(issue), committed: copy(state) });
    }])),
    '@/lib/apps/auth-middleware': { withAppAuth(handler, config) {
      return async (request, params) => {
        appScopes.push(config.requiredScopes);
        if (config.requiredScopes.some(scope => !(options.scopes || ['issues:read', 'issues:write']).includes(scope))) return response({ error: 'insufficient_scope' }, { status: 403 });
        return handler(request, { user: { id: userId }, workspace: { id: options.appWorkspace || 'w1' }, app: { id: 'cli-app' }, installation: { id: 'cli-installation' } }, params);
      };
    } },
  };
  const permissions = load('src/lib/permissions.ts', { './prisma': { prisma: db } }, globals);
  deps['@/lib/permissions'] = { ...permissions, checkUserPermissions: async (_user, _workspace, requested) => Object.fromEntries(requested.map(permission => [permission, { hasPermission: options.permissions === 'self' ? permission === permissions.Permission.DELETE_SELF_TASK : options.permissions !== 'none' }])) };
  deps['@/lib/forge/legacy-write-guard'] = load('src/lib/forge/legacy-write-guard.ts', { ...deps, './reader': { readForgeBindings: async () => options.bindings || [] } }, globals);
  const lifecycle = load('src/lib/issue-trash.ts', deps, globals);
  deps['@/lib/issue-trash'] = lifecycle;
  deps['@/lib/issue-trash-response'] = load('src/lib/issue-trash-response.ts', deps, globals);
  deps['@/lib/issue-trash-browser'] = load('src/lib/issue-trash-browser.ts', deps, globals);
  const routes = {
    preview: ['src/app/api/apps/auth/issues/[issueIdOrKey]/delete-preview/route.ts', 'GET'],
    appTrash: ['src/app/api/apps/auth/issues/[issueIdOrKey]/route.ts', 'DELETE'],
    appRestore: ['src/app/api/apps/auth/issues/[issueIdOrKey]/restore/route.ts', 'POST'],
    appList: ['src/app/api/apps/auth/issues/trash/route.ts', 'GET'],
    browserRestore: ['src/app/api/issues/[issueId]/restore/route.ts', 'POST'],
    browserPurge: ['src/app/api/issues/[issueId]/purge/route.ts', 'DELETE'],
    browserList: ['src/app/api/issues/trash/route.ts', 'GET'],
  };
  const request = ({ query = '?workspaceId=w1&projectId=p1', body, headers = {} } = {}) => ({
    url: 'https://collab.example/api/issues' + query, headers: new Headers(headers), json: async () => { if (body instanceof Error) throw body; return body; },
  });
  return { lifecycle, effects, events, transactions, appScopes, sessionReads,
    state: () => copy(state), change: input => lifecycle.changeIssueTrash({ idOrKey: 'HP-1', workspaceId: 'w1', projectId: 'p1', action: 'TRASHED', actor: { userId, client: 'app', appId: 'cli-app', installationId: 'cli-installation' }, ...input }),
    route: (name, input, id = 'HP-1') => { const [file, method] = routes[name]; return load(file, deps, globals)[method](request(input), { params: Promise.resolve({ issueId: id, issueIdOrKey: id }) }); },
    errorResponse: deps['@/lib/issue-trash-response'].issueTrashErrorResponse,
  };
}

test('trash and restore preserve original identity, comments, relations, work logs and history', async () => {
  const f = fixture(); const original = f.state();
  const preview = await f.route('preview');
  assert.equal(preview.status, 200);
  assert.deepEqual(json(preview.body), { id: 'issue-one', issueKey: 'HP-1', title: 'Original discussion', projectId: 'p1', counts: { issues: 1, comments: 1, relations: 1, workLogs: 1 } });
  assert.deepEqual(f.effects, []);
  const trashed = await f.route('appTrash');
  assert.equal(trashed.status, 200);
  assert.deepEqual(json(trashed.body.deletedIssue), { id: 'issue-one', issueKey: 'HP-1', title: 'Original discussion' });
  assert.ok(f.state().issues[0].deletedAt instanceof Date);
  assert.equal((await f.route('preview')).status, 404);
  const listing = await f.route('appList');
  assert.deepEqual(listing.body.issues.map(issue => issue.id), ['issue-one']);
  assert.equal(listing.body.canPurge, false);
  assert.equal((await f.route('appRestore')).status, 200);
  const restored = f.state();
  for (const key of ['id', 'issueKey', 'title', 'description']) assert.equal(restored.issues[0][key], original.issues[0][key]);
  assert.equal(restored.issues[0].deletedAt, null); assert.equal(restored.issues[0].deletedById, null);
  for (const key of ['comments', 'relations', 'workLogs']) assert.deepEqual(restored[key], original[key]);
  assert.deepEqual(restored.history[0], original.history[0]);
  assert.deepEqual(restored.audits.map(row => row.action), ['TRASHED', 'RESTORED']);
  assert.ok(restored.audits.every(row => row.issueId === 'issue-one' && row.issueKey === 'HP-1' && row.actorId === 'owner' && row.appId === 'cli-app' && row.installationId === 'cli-installation'));
  assert.deepEqual(restored.history.slice(1).map(row => row.action), ['TRASHED', 'RESTORED']);
  assert.deepEqual(f.effects, ['update', 'audit', 'activity', 'update', 'audit', 'activity']);
  assert.ok(f.transactions.every(settings => settings.isolationLevel === 'Serializable'));
  assert.deepEqual(f.events.map(event => event.name), ['emitIssueDeleted', 'emitIssueCreated']);
  assert.ok(f.events[0].committed.issues[0].deletedAt);
  assert.equal(f.events[1].committed.issues[0].deletedAt, null);
});

test('audit, history or transaction failure rolls back the issue transition and emits nothing', async () => {
  for (const failure of [{ fail: 'audit' }, { fail: 'activity' }, { commitError: 'P2034' }]) {
    for (const action of ['TRASHED', 'RESTORED', 'PURGED']) {
      const f = fixture({ ...failure, trashed: action !== 'TRASHED' }); const original = f.state();
      await assert.rejects(f.change({ action, actor: { userId: 'owner', client: 'browser' }, confirmIssueKey: 'HP-1' }));
      assert.deepEqual(f.state(), original); assert.deepEqual(f.events, []);
    }
  }
});

test('missing or wrong tenant/project and revoked membership cannot preview or mutate an issue', async () => {
  for (const query of ['', '?projectId=', '?projectId=p2', '?projectId=p3']) {
    const f = fixture(); const original = f.state();
    assert.ok([400, 404].includes((await f.route('preview', { query })).status));
    assert.ok([400, 404].includes((await f.route('appTrash', { query })).status));
    assert.deepEqual(f.effects, []); assert.deepEqual(f.state(), original);
  }
  for (const options of [{ userId: 'revoked' }, { userId: 'outsider' }, { appWorkspace: 'w2' }]) {
    const f = fixture(options);
    assert.equal((await f.route('preview')).status, 404);
    assert.equal((await f.route('appTrash')).status, 404);
    assert.deepEqual(f.effects, []);
  }
  const f = fixture({ trashed: true });
  assert.equal((await f.route('browserRestore', { body: { workspaceId: 'w2', projectId: 'p1' } })).status, 404);
  assert.deepEqual(f.effects, []);
});

test('app API declares read/write scopes and trash listings never grant app purge capability', async () => {
  const f = fixture({ trashed: true, scopes: ['issues:read'] });
  assert.equal((await f.route('appList')).body.canPurge, false);
  assert.equal((await f.route('appRestore')).status, 403);
  assert.equal((await f.route('appTrash')).status, 403);
  assert.deepEqual(json(f.appScopes), [['issues:read'], ['issues:write'], ['issues:write']]);
  assert.deepEqual(f.effects, []);
  const denied = fixture({ scopes: [] });
  assert.equal((await denied.route('preview')).status, 403);
  assert.equal((await denied.route('appList')).status, 403);
  assert.deepEqual(denied.effects, []);
});

test('app actors and any Authorization header cannot reach permanent deletion', async () => {
  const direct = fixture({ trashed: true });
  await assert.rejects(direct.change({ action: 'PURGED', confirmIssueKey: 'HP-1' }), error => error.status === 403);
  assert.equal(direct.transactions.length, 0);
  for (const authorization of ['Bearer agent-token', '', 'Basic legacy']) {
    const f = fixture({ trashed: true });
    const response = await f.route('browserPurge', { headers: { authorization }, body: { workspaceId: 'w1', projectId: 'p1', confirmIssueKey: 'HP-1' } });
    assert.equal(response.status, 403); assert.deepEqual(f.sessionReads, []); assert.equal(f.transactions.length, 0); assert.deepEqual(f.effects, []);
  }
});

test('browser restore requires a session, valid scope and issue deletion permission', async () => {
  const absent = fixture({ absent: true, trashed: true });
  assert.equal((await absent.route('browserRestore', { body: { workspaceId: 'w1', projectId: 'p1' } })).status, 401);
  assert.deepEqual(absent.effects, []);
  for (const body of [null, new Error('malformed JSON'), {}, { workspaceId: 'w1', projectId: 1 }]) {
    const f = fixture({ trashed: true });
    assert.equal((await f.route('browserRestore', { body })).status, 400); assert.deepEqual(f.effects, []);
  }
  const denied = fixture({ trashed: true, userId: 'member', permissions: 'none' });
  assert.equal((await denied.route('browserRestore', { body: { workspaceId: 'w1', projectId: 'p1' } })).status, 403);
  assert.deepEqual(denied.effects, []);
  const own = fixture({ trashed: true, userId: 'member', permissions: 'self' });
  assert.equal((await own.route('browserRestore', { body: { workspaceId: 'w1', projectId: 'p1' } })).status, 200);
  assert.equal(own.state().issues[0].deletedAt, null);
});

test('permanent deletion requires administrator membership, exact typed key and an already trashed issue', async () => {
  for (const options of [{ userId: 'member', trashed: true }, { trashed: false }]) {
    const f = fixture(options);
    const response = await f.route('browserPurge', { body: { workspaceId: 'w1', projectId: 'p1', confirmIssueKey: 'HP-1' } });
    assert.equal(response.status, options.trashed ? 403 : 404); assert.deepEqual(f.effects, []);
  }
  for (const confirmIssueKey of [undefined, 'hp-1', 'HP-1 ', 'HP-2', '']) {
    const f = fixture({ trashed: true });
    assert.equal((await f.route('browserPurge', { body: { workspaceId: 'w1', projectId: 'p1', confirmIssueKey } })).status, 400);
    assert.deepEqual(f.effects, []);
  }
  for (const userId of ['owner', 'admin']) {
    const f = fixture({ trashed: true, userId });
    assert.equal((await f.route('browserList')).body.canPurge, true);
    assert.equal((await f.route('browserPurge', { body: { workspaceId: 'w1', projectId: 'p1', confirmIssueKey: 'HP-1' } })).status, 200);
    assert.equal(f.state().issues.some(issue => issue.id === 'issue-one'), false);
    assert.equal(f.state().audits[0].action, 'PURGED');
    assert.equal(f.state().audits[0].issueKey, 'HP-1');
    assert.equal(f.state().history[0].id, 'history-one');
    assert.equal(f.state().history[1].action, 'PURGED');
    assert.deepEqual(f.effects, ['delete', 'audit', 'activity']);
  }
});

test('stale transition and protected-reference errors return conflicts without partial changes', async () => {
  for (const action of ['TRASHED', 'RESTORED', 'PURGED']) {
    const f = fixture({ stale: true, trashed: action !== 'TRASHED' }); const original = f.state();
    const response = action === 'TRASHED' ? await f.route('appTrash') : await f.route(action === 'PURGED' ? 'browserPurge' : 'browserRestore', { body: { workspaceId: 'w1', projectId: 'p1', confirmIssueKey: 'HP-1' } });
    assert.equal(response.status, 409); assert.deepEqual(f.state(), original); assert.deepEqual(f.events, []);
    assert.equal(JSON.stringify(response.body).includes('private'), false);
  }
  const f = fixture();
  for (const code of ['P2025', 'P2034', 'P2003']) assert.equal(f.errorResponse(knownError(code)).status, 409);
  const failure = f.errorResponse(new Error('private secret detail'));
  assert.equal(failure.status, 500); assert.equal(JSON.stringify(failure.body).includes('private'), false);
});

test('Forge bindings still refuse trash, restore and purge, including related retained issues', async () => {
  for (const action of ['TRASHED', 'RESTORED', 'PURGED']) {
    for (const projectId of ['p1', 'p2']) {
      const f = fixture({ trashed: action !== 'TRASHED', bindings: [{ projectId, workspaceId: 'w1' }] }); const original = f.state();
      await assert.rejects(f.change({ action, actor: { userId: 'owner', client: 'browser' }, confirmIssueKey: 'HP-1' }), error => f.errorResponse(error).status === 409);
      assert.deepEqual(f.effects, []); assert.deepEqual(f.events, []); assert.deepEqual(f.state(), original);
    }
  }
});

test('project and workspace destruction is refused while retained trash exists', async () => {
  const f = fixture({ trashed: true });
  await assert.rejects(f.lifecycle.assertNoRetainedIssues({ projectId: 'p1' }), error => error.status === 409);
  await assert.rejects(f.lifecycle.assertNoRetainedIssues({ workspaceId: 'w1' }), error => error.status === 409);
  await f.lifecycle.assertNoRetainedIssues({ projectId: 'empty' });
  assert.deepEqual(f.effects, []);
});
