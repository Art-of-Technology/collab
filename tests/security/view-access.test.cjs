const { assert, test, load, matches: baseMatches } = require('./helpers.cjs');

function matches(row, where) {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'AND') return value.every(part => matches(row, part));
    if (key === 'OR') return value.some(part => matches(row, part));
    if (key === 'NOT') return !matches(row, value);
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      if ('has' in value) return row?.[key]?.includes(value.has) ?? false;
      if ('some' in value) return row?.[key]?.some(item => matches(item, value.some)) ?? false;
      if (!['in', 'notIn', 'not', 'contains', 'gte', 'lt'].some(op => op in value)) return matches(row?.[key], value);
    }
    return baseMatches(row, { [key]: value });
  });
}

const routes = [
  ['detail', 'src/app/api/views/[viewId]/route.ts', 'GET'],
  ['edit', 'src/app/api/views/[viewId]/route.ts', 'PUT'],
  ['delete', 'src/app/api/views/[viewId]/route.ts', 'DELETE'],
  ['favorite', 'src/app/api/views/[viewId]/favorite/route.ts', 'POST'],
  ['follow', 'src/app/api/views/[viewId]/follow/route.ts', 'POST'],
  ['unfollow', 'src/app/api/views/[viewId]/follow/route.ts', 'DELETE'],
  ['followers', 'src/app/api/views/[viewId]/follow/route.ts', 'GET'],
  ['positions', 'src/app/api/views/[viewId]/issue-positions/route.ts', 'GET'],
  ['position-write', 'src/app/api/views/[viewId]/issue-positions/route.ts', 'PUT'],
  ['list', 'src/app/api/workspaces/[workspaceId]/views/route.ts', 'GET'],
  ['create', 'src/app/api/workspaces/[workspaceId]/views/route.ts', 'POST'],
  ['workspace-edit', 'src/app/api/workspaces/[workspaceId]/views/[viewId]/route.ts', 'PUT'],
  ['workspace-delete', 'src/app/api/workspaces/[workspaceId]/views/[viewId]/route.ts', 'DELETE'],
  ['workspace-favorite', 'src/app/api/workspaces/[workspaceId]/views/[viewId]/favorite/route.ts', 'POST'],
];

function fixture(spec) {
  const [name, path, method] = spec;
  const state = { live: true, session: true, staleEmail: false, member: true, foreign: false,
    viewOwner: 'actor', visibility: 'WORKSPACE', sharedWith: [], isDefault: false,
    effects: [], writes: [], revokeBeforeWrite: false, favorite: false, foreignIssue: false, extraPosition: false,
    workspaceOwner: false, positionExists: false, legacyCalls: 0 };
  const workspace = () => ({ id: 'workspace', slug: 'team', ownerId: state.workspaceOwner ? 'actor' : 'workspace-owner',
    members: state.foreign ? [] : [{ userId: 'actor', user: { email: 'actor@weezboo.com' }, status: state.member },
      { userId: 'recipient', user: { email: 'recipient@weezboo.com' }, status: true }] });
  const user = () => ({ id: 'actor', email: 'actor@weezboo.com', createdAt: new Date(), updatedAt: new Date(),
    ownedWorkspaces: state.workspaceOwner ? [{ id: 'workspace' }] : [], workspaceMemberships: [{ workspaceId: 'workspace', status: state.member }] });
  const view = () => ({ id: 'view', slug: 'view-slug', workspaceId: 'workspace', workspace: workspace(),
    ownerId: state.viewOwner, owner: { id: state.viewOwner }, visibility: state.visibility, sharedWith: state.sharedWith,
    name: 'Fixture', projectIds: [], workspaceIds: ['workspace'], favorites: [], isDefault: state.isDefault });
  const issue = () => ({ id: 'issue', issueKey: 'FIX-1', title: 'Visible', workspaceId: state.foreignIssue ? 'foreign' : 'workspace',
    workspace: workspace(), project: { workspace: workspace() }, statusId: null });
  const record = (kind, args) => state.effects.push([kind, args]);
  const rejectMissing = row => { if (!row) throw new Error('Conditional record missing'); return row; };
  const checkConnect = data => {
    if (state.revokeBeforeWrite) state.member = false;
    if (data.view) rejectMissing(matches(view(), data.view.connect) && view());
    if (data.workspace) rejectMissing(matches(workspace(), data.workspace.connect) && workspace());
    if (data.issue) rejectMissing(matches(issue(), data.issue.connect) && issue());
  };
  const prisma = {
    account: { findUnique: async () => state.live ? { user: { ...user(), accounts: [{ id: 'mapping' }] } } : null },
    user: {
      findUnique: async args => { record('user', args); const rows = state.live ? [user(), { ...user(), id: 'replacement', email: 'old@weezboo.com' }] : [];
        return rows.find(row => matches(row, args.where)) || null; },
      findMany: async args => { record('recipient', args); return [user(), { ...user(), id: 'recipient',
        workspaceMemberships: [{ workspaceId: 'workspace', status: true }] }].filter(row => matches(row, args.where)); },
    },
    workspace: {
      findFirst: async args => { record('workspace', args); return matches(workspace(), args.where) ? workspace() : null; },
      findMany: async args => { record('workspaces', args); return [workspace()].filter(row => matches(row, args.where)); },
    },
    project: { findMany: async args => { record('projects', args); return [{ id: 'project', workspace: workspace() }].filter(row => matches(row, args.where)); } },
    view: {
      findFirst: async args => { record('view', args); return matches(view(), args.where) ? view() : null; },
      findMany: async args => { record('views', args); return [view()].filter(row => matches(row, args.where)); },
      create: async args => { checkConnect(args.data); state.writes.push(['create-view', args]); return { ...view(), ...args.data }; },
      update: async args => { if (state.revokeBeforeWrite) state.member = false;
        rejectMissing(matches(view(), args.where) && view()); state.writes.push(['update-view', args]); return { ...view(), ...args.data }; },
      delete: async args => { if (state.revokeBeforeWrite) state.member = false;
        rejectMissing(matches(view(), args.where) && view()); state.writes.push(['delete-view', args]); return view(); },
    },
    issue: {
      findFirst: async args => { record('issue', args); return matches(issue(), args.where) ? issue() : null; },
      findMany: async args => { record('issues', args); return [issue()].filter(row => matches(row, args.where)); },
    },
    viewIssuePosition: {
      findMany: async args => { record('positions', args); const rows = [{ viewId: 'view', view: view(), issueId: 'issue', issue: issue(), columnId: 'todo', position: 1 }];
        if (state.extraPosition) rows.push({ ...rows[0], issueId: 'foreign', issue: { ...issue(), id: 'foreign', workspaceId: 'foreign', title: 'Hidden' } });
        return rows.filter(row => matches(row, args.where)); },
      upsert: async args => {
        if (state.positionExists) {
          if (state.revokeBeforeWrite) state.member = false;
          const { viewId_issueId_columnId, ...where } = args.where;
          rejectMissing(matches({ ...viewId_issueId_columnId, view: view(), issue: issue() }, where));
        } else checkConnect(args.create);
        state.writes.push(['position', args]); return { id: 'position', ...args.create };
      },
      deleteMany: async args => { state.writes.push(['cleanup', args]); return { count: 1 }; },
    },
  };
  for (const model of ['viewFavorite', 'viewFollower']) prisma[model] = {
    findUnique: async args => { record(model, args); return state.favorite ? { id: 'existing' } : null; },
    findMany: async args => { record(model, args); return []; },
    create: async args => { checkConnect(args.data); state.writes.push([model, args]); return { id: 'new' }; },
    delete: async args => { if (state.revokeBeforeWrite) state.member = false;
      if (args.where.view) rejectMissing(matches(view(), args.where.view) && view()); state.writes.push([model, args]); return {}; },
    deleteMany: async args => { if (args.where.view && !matches(view(), args.where.view)) return { count: 0 };
      state.writes.push([model, args]); return { count: 1 }; },
  };
  prisma.$transaction = async callback => {
    const writes = state.writes.length;
    try { return await callback(prisma); } catch (error) { state.writes.length = writes; throw error; }
  };
  const options = {};
  const nextAuth = { getServerSession: async actual => { assert.equal(actual, options); state.legacyCalls++; return state.session ? {
    user: { id: 'actor', email: state.staleEmail ? 'old@weezboo.com' : 'actor@weezboo.com' },
  } : null; } };
  const env = { env: { COLLAB_AUTH_MODE: 'nextauth', COLLAB_GATEWAY_ISSUER: 'https://identity.example.test' } };
  const adapter = load('src/lib/request-session.ts', { 'server-only': {}, 'next-auth': nextAuth,
    './gateway-identity': load('src/lib/gateway-identity.ts', { 'node:crypto': require('node:crypto') }, { process: env, Buffer, TextDecoder, URL }),
    'next/headers': { headers: () => new Headers(Object.fromEntries([
      ['issuer', 'https://identity.example.test'], ['subject', 'view-actor'], ['email', 'actor@weezboo.com'],
    ].map(([key, value]) => [`x-collab-${key}`, Buffer.from(value).toString('base64url')])
      .concat([['x-collab-email-verified', 'true'], ['cookie', 'legacy=present']]))) }, '@/lib/prisma': { prisma },
  }, { process: env });
  const finder = load('src/lib/issue-finder.ts', { '@/lib/prisma': { prisma } });
  const deps = { '@/lib/prisma': { prisma }, '@/lib/request-session': adapter,
    'next-auth': nextAuth, 'next-auth/next': nextAuth, '@/lib/auth': { authConfig: options }, '@/lib/auth-options': { authOptions: options },
    'next/server': { NextResponse: Response }, '@/lib/issue-finder': finder,
    '@/lib/post-access': load('src/lib/post-access.ts'), 'zod': require('zod'),
    '@/lib/rate-limit': { withRateLimit: handler => handler, followActionRateLimit: {} },
    '@/lib/notification-service': {}, '@/lib/utils': { generateUniqueViewSlug: async () => 'fixture' },
    '@/constants/viewPositions': { VIEW_POSITIONS_MAX_BULK_SIZE: 100 },
    '@/lib/redis': { publishEvent: async (...args) => state.writes.push(['publish', args]) },
  };
  deps['@/lib/session'] = load('src/lib/session.ts', deps, { console: { error() {} } });
  deps['@/lib/view-access'] = load('src/lib/view-access.ts', deps);
  const route = load(path, deps, { URL, console: { error() {} } });
  const invoke = (body = name === 'position-write' ? { issueId: 'issue', columnId: 'todo', position: 1 } : { name: 'Fixture', displayType: 'LIST' }) => route[method](new Request('https://example.test/?workspaceId=workspace', {
    method, ...(method === 'GET' ? {} : { body: JSON.stringify(body) }),
  }), { params: Promise.resolve({ workspaceId: 'workspace', viewId: ['detail', 'edit', 'delete'].includes(name) ? 'view-slug' : 'view' }) });
  return { state, env, invoke, prisma, access: deps['@/lib/view-access'] };
}

test('legacy view owner remains a positive control', async () => {
  assert.equal((await fixture(routes[0]).invoke()).status, 200);
});

for (const spec of routes) test(`${spec[0]} uses immutable actor and requires current workspace membership`, async () => {
  const f = fixture(spec); f.state.staleEmail = true;
  assert.equal((await f.invoke()).status, spec[0] === 'create' ? 201 : 200);
  for (const kind of ['inactive', 'foreign']) {
    const denied = fixture(spec); denied.state.member = kind !== 'inactive'; denied.state.foreign = kind === 'foreign';
    const result = await denied.invoke(); assert.equal(result.status, 404, kind); assert.deepEqual(denied.state.writes, []);
    assert.ok(denied.state.effects.every(([name]) => ['user', 'workspace', 'view'].includes(name)), kind);
  }
  const absent = fixture(spec); absent.state.session = false;
  assert.equal((await absent.invoke()).status, 401); assert.deepEqual(absent.state.writes, []);
  const deleted = fixture(spec); deleted.state.live = false;
  assert.ok([401, 404].includes((await deleted.invoke()).status)); assert.deepEqual(deleted.state.writes, []);
});

test('shared visibility requires recipient and personal views remain private', async () => {
  for (const spec of routes.filter(([name]) => !['create', 'edit', 'delete', 'workspace-edit', 'workspace-delete'].includes(name))) {
    const f = fixture(spec); f.state.viewOwner = 'other'; f.state.visibility = 'SHARED';
    const denied = await f.invoke();
    if (spec[0] === 'list') assert.deepEqual((await denied.json()).views, []); else assert.equal(denied.status, 404, spec[0]);
    assert.deepEqual(f.state.writes, []);
    f.state.sharedWith = ['actor']; assert.equal((await f.invoke()).status, 200);
    f.state.visibility = 'PERSONAL'; f.state.writes.length = 0;
    const privateResult = await f.invoke();
    if (spec[0] === 'list') assert.deepEqual((await privateResult.json()).views, []); else assert.equal(privateResult.status, 404);
    assert.deepEqual(f.state.writes, []);
  }
});

test('operation permissions and workspace default-delete guard remain', async () => {
  for (const name of ['edit', 'workspace-edit']) {
    const f = fixture(routes.find(spec => spec[0] === name)); f.state.viewOwner = 'other';
    assert.equal((await f.invoke()).status, 200); f.state.visibility = 'SHARED'; f.state.sharedWith = ['actor'];
    f.state.writes.length = 0; assert.equal((await f.invoke()).status, 404); assert.deepEqual(f.state.writes, []);
  }
  const f = fixture(routes.find(spec => spec[0] === 'workspace-delete')); f.state.isDefault = true;
  assert.equal((await f.invoke()).status, 400); assert.deepEqual(f.state.writes, []);
});

test('position reads hide polluted rows and writes bind canonical same-workspace issues', async () => {
  const read = fixture(routes.find(spec => spec[0] === 'positions')); read.state.extraPosition = true;
  assert.deepEqual((await (await read.invoke()).json()).positions.map(p => p.issueId), ['issue']);
  const write = fixture(routes.find(spec => spec[0] === 'position-write'));
  assert.equal((await write.invoke({ issueId: 'FIX-1', columnId: 'todo', position: 2 })).status, 200);
  assert.equal(write.state.writes.find(([name]) => name === 'position')[1].where.viewId_issueId_columnId.issueId, 'issue');
  write.state.foreignIssue = true; write.state.writes.length = 0;
  assert.equal((await write.invoke()).status, 404); assert.deepEqual(write.state.writes, []);
});

test('bulk cleanup cannot escape validated issues and bad references write nothing', async () => {
  const f = fixture(routes.find(spec => spec[0] === 'position-write'));
  const bulk = [{ issueId: 'issue', columnId: 'done', position: 0 }];
  assert.equal((await f.invoke({ bulk, cleanup: { issueIds: ['foreign'], keepColumnId: 'done' } })).status, 400);
  assert.deepEqual(f.state.writes, []);
  assert.equal((await f.invoke({ bulk, cleanup: { issueIds: ['issue'], keepColumnId: 'done' } })).status, 200);
  for (const name of ['create', 'edit', 'workspace-edit']) for (const body of [
    { projectIds: ['foreign'] }, { projectIds: 'invalid' },
  ]) {
    const bad = fixture(routes.find(spec => spec[0] === name));
    assert.equal((await bad.invoke({ name: 'Fixture', displayType: 'LIST', ...body })).status, 400); assert.deepEqual(bad.state.writes, []);
  }
});

test('final mutation predicates reject access lost after initial view read', async () => {
  for (const name of ['edit', 'delete', 'favorite', 'workspace-edit', 'workspace-delete', 'workspace-favorite', 'follow', 'position-write', 'create']) {
    const f = fixture(routes.find(spec => spec[0] === name)); f.state.revokeBeforeWrite = true;
    assert.ok((await f.invoke()).status >= 400, name); assert.deepEqual(f.state.writes, [], name);
  }
  const existing = fixture(routes.find(spec => spec[0] === 'position-write'));
  existing.state.positionExists = true; existing.state.revokeBeforeWrite = true;
  assert.ok((await existing.invoke()).status >= 400); assert.deepEqual(existing.state.writes, []);
});

test('workspace owners need no membership row and accessible references remain usable', async () => {
  for (const spec of routes) {
    const f = fixture(spec); f.state.workspaceOwner = true; f.state.foreign = true;
    assert.equal((await f.invoke()).status, spec[0] === 'create' ? 201 : 200, spec[0]);
  }
  for (const name of ['create', 'edit', 'workspace-edit']) {
    const f = fixture(routes.find(spec => spec[0] === name));
    const body = { name: 'Fixture', displayType: 'LIST', projectIds: ['project'],
      ...(name === 'workspace-edit' ? { ownerId: 'recipient' } : { visibility: 'SHARED', sharedWith: ['recipient'] }),
      ...(name === 'edit' ? { workspaceIds: ['workspace'] } : {}),
    };
    assert.equal((await f.invoke(body)).status, name === 'create' ? 201 : 200, name);
    assert.deepEqual(Array.from(f.state.writes[0][1].data.projectIds), ['project']);
  }
});

test('all view entry points use gateway actor without a legacy cookie fallback', async () => {
  for (const spec of routes) {
    const f = fixture(spec); f.env.env.COLLAB_AUTH_MODE = 'gateway';
    assert.equal((await f.invoke()).status, spec[0] === 'create' ? 201 : 200, spec[0]);
    assert.equal(f.state.legacyCalls, 0);
    f.state.live = false; f.state.writes.length = 0;
    assert.equal((await f.invoke()).status, 401); assert.deepEqual(f.state.writes, []); assert.equal(f.state.legacyCalls, 0);
  }
});

test('single position rejects malformed scalars before issue lookup or writes', async () => {
  for (const change of [{ issueId: 12 }, { columnId: {} }, { position: -1 }, { position: 0.5 }, { position: null }]) {
    const f = fixture(routes.find(spec => spec[0] === 'position-write'));
    assert.equal((await f.invoke({ issueId: 'issue', columnId: 'todo', position: 0, ...change })).status, 400);
    assert.deepEqual(f.state.writes, []); assert.ok(!f.state.effects.some(([name]) => name === 'issue'));
  }
});

test('the first list of a view page leaves requests out', async t => {
  const workspace = { id: 'workspace' };
  const project = { id: 'project' };
  const work = { id: 'work', workspaceId: workspace.id, projectId: project.id, agentRequestRole: null, priority: 'medium' };
  const request = { ...work, id: 'request', agentRequestRole: 'review' };
  const rows = [work, request];
  for (const page of ['[viewId]', 'dynamic']) await t.test(page, async () => {
    let fields = [];
    const { default: render } = load(`src/app/(main)/[workspaceId]/views/${page}/page.tsx`, {
      'react/jsx-runtime': require('react/jsx-runtime'),
      'next/navigation': { notFound() { assert.fail('Expected an accessible view'); } },
      '@/lib/request-session': { getServerSession: async () => ({ user: { email: 'member@example.test' } }) },
      '@/lib/auth': {},
      '@/lib/prisma': { prisma: {
        user: { findUnique: async () => ({ id: 'member' }) },
        workspace: { findFirst: async () => workspace },
        project: { findMany: async () => [project] },
        view: { findFirst: async () => ({
          id: 'view', slug: 'view', displayType: 'LIST', visibility: 'WORKSPACE', projectIds: [project.id], fields,
          filters: { priority: ['medium'] },
        }) },
        issue: { findMany: async ({ where }) => rows.filter(row => matches(row, where)) },
      } },
      '@/components/views/ViewRenderer': { default: () => null },
      '@/components/views/agent-request-display': load('src/components/views/agent-request-display.ts'),
    });
    const list = async searchParams => (await render({
      params: Promise.resolve({ workspaceId: workspace.id, viewId: 'view' }),
      searchParams: Promise.resolve(searchParams),
    })).props.issues.map(issue => issue.id);

    assert.deepEqual(await list({}), ['work']);
    if (page === '[viewId]') {
      fields = ['Agent requests'];
      assert.deepEqual(await list({}), ['work', 'request']);
    }
    assert.deepEqual(await list({ requests: '1' }), ['work', 'request']);
    assert.deepEqual(await list({ requests: '0' }), ['work']);
  });
});

test('a view without saved filters leaves its list to the browser, which loads it anyway', async () => {
  const workspace = { id: 'workspace' };
  const project = { id: 'project' };
  const listed = [];
  let filters;
  const { default: render } = load('src/app/(main)/[workspaceId]/views/[viewId]/page.tsx', {
    'react/jsx-runtime': require('react/jsx-runtime'),
    'next/navigation': { notFound() { assert.fail('Expected an accessible view'); } },
    '@/lib/request-session': { getServerSession: async () => ({ user: { email: 'member@example.test' } }) },
    '@/lib/auth': {},
    '@/lib/prisma': { prisma: {
      user: { findUnique: async () => ({ id: 'member' }) },
      workspace: { findFirst: async () => workspace },
      project: { findMany: async () => [project] },
      view: { findFirst: async () => ({
        id: 'view', slug: 'view', displayType: 'LIST', visibility: 'WORKSPACE', projectIds: [project.id], fields: [], filters,
      }) },
      issue: { findMany: async query => { listed.push(query); return [{ id: 'work', projectId: project.id }]; } },
    } },
    '@/components/views/ViewRenderer': { default: () => null },
    '@/components/views/agent-request-display': load('src/components/views/agent-request-display.ts'),
  });
  // The page runs in its own context, so its arrays are copied into this one before they are compared.
  const open = async (searchParams = {}) => (await render({
    params: Promise.resolve({ workspaceId: workspace.id, viewId: 'view' }),
    searchParams: Promise.resolve(searchParams),
  })).props;

  for (const saved of [undefined, null, {}, { project: [project.id] }, { status: [], priority: [] }]) {
    filters = saved;
    for (const searchParams of [{}, { requests: '1' }]) {
      const props = await open(searchParams);
      assert.deepEqual(Array.from(props.issues, issue => issue.id), [], `No rows are sent for filters ${JSON.stringify(saved)}`);
      assert.equal(props.view.projects.length, 1);
    }
  }
  assert.equal(listed.length, 0, 'The issues of a view without saved filters are not read on the server');

  filters = { status: ['done'] };
  assert.deepEqual(Array.from((await open()).issues, issue => issue.id), ['work']);
  assert.equal(listed.length, 1, 'A view with saved filters still gets its first list from the server');
});
