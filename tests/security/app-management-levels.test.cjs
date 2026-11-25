const { assert, test, load, matches } = require('./helpers.cjs');

// Composite unique keys such as `userId_workspaceId` are read as their fields.
const flat = where => Object.fromEntries(Object.entries(where || {}).flatMap(([key, value]) =>
  key.includes('_') && value && typeof value === 'object' ? Object.entries(value) : [[key, value]]));
const W = 'cworkspace1';

// One workspace owned by `prim`, a member at every level, switched-off members, a stranger and platform admins.
function fixture() {
  const members = [
    // The primary owner's own row says nothing useful: a standard role, switched off.
    ['prim', 'DEVELOPER', false], ['own1', 'OWNER'], ['own2', 'owner'], ['adm1', 'ADMIN'], ['dev', 'DEVELOPER'], ['mgr', 'APPS'],
    ['offo', 'OWNER', false], ['offa', 'ADMIN', false],
    // Platform admins who are also members: a standard role, an Admin and an Owner.
    ['pas', 'DEVELOPER'], ['paa', 'ADMIN'], ['pao', 'OWNER'],
  ].map(([userId, role, status = true]) => ({ id: `m-${userId}`, workspaceId: W, userId, role, status }));
  const users = [...members.map(row => ({ id: row.userId, role: row.userId.startsWith('pa') ? 'SYSTEM_ADMIN' : 'DEVELOPER' })),
    { id: 'out', role: 'DEVELOPER' }, { id: 'root', role: 'SYSTEM_ADMIN' }];
  const db = {
    workspaces: [{ id: W, slug: 'w', name: 'W', ownerId: 'prim' }],
    members,
    // Admin holds both permissions; the standard role APPS holds them too.
    rolePermissions: ['ADMIN', 'APPS'].flatMap(role => ['MANAGE_APPS', 'MANAGE_WORKSPACE_PERMISSIONS'].map(permission => ({ workspaceId: W, role, permission }))),
    apps: [
      { id: 'app-fresh', slug: 'fresh', name: 'Fresh', status: 'PUBLISHED', isSystemApp: false },
      { id: 'app-tool', slug: 'tool', name: 'Tool', status: 'PUBLISHED', isSystemApp: false },
    ],
    installations: [{ id: 'inst1', appId: 'app-tool', workspaceId: W, status: 'ACTIVE', scopes: ['issues:read'] }],
    webhooks: [{ id: 'hook1', appId: 'app-tool', installationId: 'inst1', url: 'https://hooks.example.test/one', eventTypes: ['issue.created'], isActive: true }],
    deliveries: [],
  };
  const state = { userId: null, audit: [], events: [] };
  const find = (table, where) => db[table].find(row => matches(row, flat(where))) ?? null;
  const appView = (app, include) => app && {
    ...app, oauthClient: { clientId: 'client', redirectUris: ['https://app.example.test/callback'] }, scopes: [{ scope: 'issues:read' }], versions: [],
    installations: db.installations.filter(row => row.appId === app.id && matches(row, include?.installations?.where || {}))
      .map(row => ({ ...row, webhooks: db.webhooks.filter(hook => hook.installationId === row.id) })),
  };
  const hookView = hook => hook && {
    ...hook, deliveries: [], app: db.apps.find(app => app.id === hook.appId),
    installation: { ...db.installations.find(row => row.id === hook.installationId), workspace: db.workspaces[0] },
  };
  const prisma = {
    workspace: {
      findUnique: async ({ where }) => find('workspaces', where),
      findUniqueOrThrow: async ({ where }) => { const row = find('workspaces', where); if (!row) throw new Error('not found'); return row; },
    },
    user: {
      findUnique: async ({ where, select, include }) => {
        const user = users.find(row => row.id === where.id);
        const shape = select || include;
        if (!user || !shape?.workspaceMemberships) return user ?? null;
        return { ...user, workspaceMemberships: db.members.filter(row => row.userId === user.id && matches(row, shape.workspaceMemberships.where)),
          ownedWorkspaces: db.workspaces.filter(row => row.ownerId === user.id && row.id === shape.ownedWorkspaces?.where.id) };
      },
    },
    workspaceMember: {
      findUnique: async ({ where, include }) => {
        const row = find('members', where);
        return row && include?.workspace ? { ...row, workspace: db.workspaces.find(space => space.id === row.workspaceId) } : row;
      },
    },
    rolePermission: { findUnique: async ({ where }) => find('rolePermissions', where) },
    app: {
      findUnique: async ({ where, include }) => appView(find('apps', where), include),
      findMany: async () => [],
    },
    appInstallation: {
      findFirst: async ({ where }) => find('installations', where),
      findUnique: async ({ where }) => { const row = find('installations', where); return row && { ...row, app: db.apps.find(app => app.id === row.appId) }; },
      findMany: async () => [],
      create: async ({ data }) => { const row = { id: 'inst-new', ...data }; db.installations.push(row); return row; },
      update: async ({ where, data }) => Object.assign(find('installations', where), JSON.parse(JSON.stringify(data))),
      delete: async ({ where }) => { db.installations = db.installations.filter(row => row.id !== where.id); return {}; },
    },
    appWebhook: {
      findUnique: async ({ where }) => hookView(find('webhooks', where)),
      create: async ({ data }) => { const row = { id: 'hook-new', ...data }; db.webhooks.push(row); return row; },
      update: async ({ where, data }) => Object.assign(find('webhooks', where), data),
      delete: async ({ where }) => { db.webhooks = db.webhooks.filter(row => row.id !== where.id); return {}; },
      deleteMany: async ({ where }) => { db.webhooks = db.webhooks.filter(row => !matches(row, where)); return {}; },
    },
    appWebhookDelivery: { deleteMany: async () => ({}) },
    $transaction: async run => run(prisma),
  };
  const globals = { console: { log() {}, warn() {}, error() {} }, Date, URL, JSON };
  const session = async () => state.userId && { user: { id: state.userId } };
  const record = name => async (...args) => { state.audit.push([name, ...args]); };
  const deps = {
    zod: require('zod'),
    '@/lib/prisma': { prisma },
    'next/server': { NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200 }) } },
    'next/navigation': { notFound() { throw new Error('NOT_FOUND'); }, redirect(url) { throw new Error(`REDIRECT ${url}`); } },
    '@/lib/request-session': { getServerSession: session },
    '@/lib/auth': { getAuthSession: session },
    '@/lib/auth-options': { authOptions: {} },
    '@/lib/audit': { logAppInstallAttempt: record('attempt'), logAppInstallSuccess: record('success'), logAppInstallFailed: record('failed') },
    '@/lib/security': { validateAppManifestSecurity: () => ({ valid: true, errors: [] }) },
    '@/lib/event-bus': { emitAppUninstalled: async (...args) => { state.events.push(args); } },
    '@/lib/webhooks': { generateWebhookSecret: () => 'secret', isValidWebhookUrl: () => true, validateEventTypes: () => true, WEBHOOK_EVENT_TYPES: ['issue.created'] },
    '@/lib/apps/crypto': { encrypt: async value => `enc:${value}` },
  };
  // The real authority module and the real permission check, both reading the fixture database.
  deps['@/lib/workspace-authority'] = load('src/lib/workspace-authority.ts', { './prisma': { prisma } });
  deps['@/lib/permissions'] = load('src/lib/permissions.ts', { './prisma': { prisma }, './workspace-authority': deps['@/lib/workspace-authority'] }, globals);
  const base = 'src/app/api/apps/[slug]/';
  const routes = {
    install: load(`${base}installations/route.ts`, deps, globals),
    uninstall: load(`${base}uninstall/route.ts`, deps, globals),
    hooks: load(`${base}webhooks/route.ts`, deps, globals),
    hook: load(`${base}webhooks/[webhookId]/route.ts`, deps, globals),
  };
  const actions = load('src/actions/appInstallation.ts', deps, globals);

  const respond = response => ({ ok: response.status < 300, status: response.status, error: response.body?.error });
  const call = (route, method, slug, body, url = 'https://example.test/', params = {}) => async actor => {
    state.userId = actor;
    return respond(await routes[route][method]({ url, json: async () => body }, { params: Promise.resolve({ slug, ...params }) }));
  };
  const form = values => { const data = new FormData(); for (const [key, value] of Object.entries(values)) data.set(key, value); return data; };
  const act = (name, values) => async actor => {
    state.userId = actor;
    try { await actions[name](form(values)); return { ok: true }; } catch (error) { return { ok: false, error: error.message }; }
  };
  const query = `https://example.test/?workspaceId=${W}`;
  const paths = {
    installRoute: call('install', 'POST', 'fresh', { workspaceId: W, workspaceSlug: 'w' }),
    installAction: act('installApp', { appSlug: 'fresh', workspaceId: W }),
    uninstallRoute: call('uninstall', 'POST', 'tool', { workspaceId: W }),
    uninstallAction: act('uninstallApp', { installationId: 'inst1', workspaceId: W }),
    listHooks: call('hooks', 'GET', 'tool', undefined, query),
    createHook: call('hooks', 'POST', 'tool', { url: 'https://hooks.example.test/new', eventTypes: ['issue.created'], workspaceId: W }),
    getHook: call('hook', 'GET', 'tool', undefined, query, { webhookId: 'hook1' }),
    changeHook: call('hook', 'PATCH', 'tool', { isActive: false }, undefined, { webhookId: 'hook1' }),
    deleteHook: call('hook', 'DELETE', 'tool', undefined, query, { webhookId: 'hook1' }),
  };

  // The Apps settings page, with its client parts replaced so the tree can be read.
  const WorkspaceAppsManager = () => null;
  const page = load('src/app/(main)/workspaces/[workspaceId]/settings/apps/page.tsx', {
    ...deps, react: require('react'), 'react/jsx-runtime': require('react/jsx-runtime'),
    'next/link': { default: 'a' }, 'lucide-react': new Proxy({}, { get: (_, name) => name }),
    '@/components/apps/WorkspaceAppsManager': { default: WorkspaceAppsManager },
    '@/components/apps/AppStoreDiscovery': { default: () => null },
    '@/components/apps/AppAnalyticsDashboard': { default: () => null },
    '@/components/ui/tabs': Object.fromEntries(['Tabs', 'TabsContent', 'TabsList', 'TabsTrigger'].map(name => [name, 'div'])),
    '@/components/ui/card': Object.fromEntries(['Card', 'CardContent', 'CardDescription', 'CardHeader', 'CardTitle'].map(name => [name, 'div'])),
    '@/components/ui/button': { Button: 'button' }, '@/components/ui/skeleton': { Skeleton: 'div' },
  }, globals).default;
  const nodes = node => !node || typeof node !== 'object' ? [node] : [node, ...[].concat(node.props?.children ?? []).flatMap(nodes)];
  const appsPage = async actor => {
    state.userId = actor;
    const suspense = await page({ params: Promise.resolve({ workspaceId: W }) });
    try {
      const tree = nodes(await suspense.props.children.type(suspense.props.children.props));
      return tree.some(node => node?.type === WorkspaceAppsManager) ? 'opened' : 'empty';
    } catch (error) { return error.message; }
  };
  return { paths, appsPage, state, snapshot: () => JSON.stringify(db) };
}

const routePaths = ['installRoute', 'uninstallRoute', 'listHooks', 'createHook', 'getHook', 'changeHook', 'deleteHook'];
const allPaths = [...routePaths.slice(0, 2), 'installAction', 'uninstallAction', ...routePaths.slice(2)];
const webhookPaths = ['listHooks', 'createHook', 'getHook', 'changeHook', 'deleteHook'];
const installPaths = ['installRoute', 'installAction', 'uninstallRoute', 'uninstallAction'];

async function passes(path, actor) {
  const f = fixture();
  const answer = await f.paths[path](actor);
  assert.equal(answer.ok, true, `${path}: ${actor} should pass ${JSON.stringify(answer)}`);
  // The uninstall event still names the workspace, also for a caller without a membership row.
  if (path === 'uninstallRoute') assert.deepEqual([f.state.events[0]?.[1].workspaceName, f.state.events[0]?.[1].workspaceSlug], ['W', 'w'], `${path}: ${actor}`);
}

// A refusal stores nothing. A route answers 403 with a sentence naming Owners, except the install
// route, whose refusal is thrown inside its own try and has always come back as a 500; an action throws the sentence.
async function refused(path, actor) {
  const f = fixture();
  const before = f.snapshot();
  const answer = await f.paths[path](actor);
  const why = `${path}: ${actor} should be refused ${JSON.stringify(answer)}`;
  assert.equal(answer.ok, false, why);
  if (path === 'installRoute') assert.equal(answer.status, 500, why);
  else {
    if (answer.status !== undefined) assert.equal(answer.status, 403, why);
    assert.match(answer.error, /Owner/, why);
  }
  assert.equal(f.snapshot(), before, `${why}: stored nothing`);
  if (path.startsWith('install')) assert.ok(f.state.audit.some(([name]) => name === 'failed'), `${why}: the failure is still audited`);
}

test('an Owner and the primary owner install, uninstall and manage webhooks through the routes and the server actions; an Admin and a standard role are refused on each', async () => {
  for (const path of allPaths) {
    for (const actor of ['prim', 'own1', 'own2']) await passes(path, actor);
    // An Admin, a standard role, a standard role that holds MANAGE_APPS, switched-off members and a stranger.
    for (const actor of ['adm1', 'dev', 'mgr', 'offo', 'offa', 'out']) await refused(path, actor);
  }
});

test('the apps settings page opens for Owners only', async () => {
  for (const actor of ['prim', 'own1', 'own2']) assert.equal(await fixture().appsPage(actor), 'opened', actor);
  for (const actor of ['adm1', 'dev', 'mgr', 'offo', 'offa', 'out']) assert.equal(await fixture().appsPage(actor), 'NOT_FOUND', actor);
});

test('a platform admin keeps install and uninstall, member or not, and on webhooks the level of their membership decides', async () => {
  for (const actor of ['root', 'pas', 'paa', 'pao']) {
    for (const path of installPaths) await passes(path, actor);
    assert.equal(await fixture().appsPage(actor), 'opened', `page: ${actor}`);
  }
  for (const path of webhookPaths) {
    await passes(path, 'pao');
    for (const actor of ['root', 'pas', 'paa']) await refused(path, actor);
  }
});
