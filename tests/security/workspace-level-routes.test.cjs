const { assert, test, load, matches } = require('./helpers.cjs');

// Composite unique keys such as `userId_workspaceId` are read as their fields.
const flat = where => Object.fromEntries(Object.entries(where || {}).flatMap(([key, value]) =>
  key.includes('_') && value && typeof value === 'object' ? Object.entries(value) : [[key, value]]));

const settings = { name: 'Renamed', description: 'Updated', slug: 'renamed', logoUrl: '/logo.png', dockEnabled: true, timeTrackingEnabled: true };

function fixture(patch = settings) {
  const members = [
    ['prim', 'OWNER'], ['own1', 'OWNER'], ['own2', 'owner'], ['adm1', 'ADMIN'], ['adm2', 'admin'], ['hr', 'HR'], ['dev', 'DEVELOPER'],
  ].map(([userId, role]) => ({ id: `m-${userId}`, workspaceId: 'w', userId, role, status: true }));
  const users = [...members.map(row => ({ id: row.userId, name: row.userId, email: `${row.userId}@example.test`, role: 'DEVELOPER' })),
    { id: 'out', name: 'out', email: 'out@example.test', role: 'DEVELOPER' }, { id: 'root', name: 'root', email: 'root@example.test', role: 'SYSTEM_ADMIN' }];
  const db = {
    workspaces: [{ id: 'w', slug: 'w', name: 'W', description: null, logoUrl: null, ownerId: 'prim', dockEnabled: false, timeTrackingEnabled: false }],
    members,
    // Admin rows hold the settings and permission permissions but not invite; HR holds invite and permissions.
    rolePermissions: [
      ...['ADMIN', 'admin'].flatMap(role => ['MANAGE_WORKSPACE_SETTINGS', 'MANAGE_WORKSPACE_PERMISSIONS'].map(permission => ({ workspaceId: 'w', role, permission }))),
      ...['INVITE_MEMBERS', 'MANAGE_WORKSPACE_PERMISSIONS'].map(permission => ({ workspaceId: 'w', role: 'HR', permission })),
    ],
    customRoles: [{ id: 'c1', workspaceId: 'w', name: 'Support', color: '#000000' }],
    invitations: [{ id: 'inv1', workspaceId: 'w', email: 'pending@example.test', status: 'pending', invitedById: 'prim' }],
  };
  const state = { userId: null };
  const find = (table, where) => db[table].find(row => matches(row, flat(where))) ?? null;
  const prisma = {
    workspace: {
      findUnique: async ({ where, include }) => {
        const row = find('workspaces', where);
        return row && include?.members ? { ...row, members: db.members.filter(member => matches(member, { workspaceId: row.id, ...include.members.where })) } : row;
      },
      findFirst: async ({ where }) => db.workspaces.find(row => matches(row, where) && (!where.OR || where.OR.some(clause => clause.ownerId === row.ownerId ||
        db.members.some(member => member.workspaceId === row.id && member.userId === clause.members?.some.userId)))) ?? null,
      update: async ({ where, data }) => Object.assign(find('workspaces', where), JSON.parse(JSON.stringify(data))),
      delete: async ({ where }) => { db.workspaces = db.workspaces.filter(row => row.id !== where.id); return {}; },
    },
    user: {
      findUnique: async ({ where, select, include }) => {
        const user = users.find(row => row.id === where.id);
        const shape = select || include;
        if (!user || !shape?.workspaceMemberships) return user ?? null;
        return { ...user, workspaceMemberships: db.members.filter(row => row.userId === user.id && matches(row, shape.workspaceMemberships.where)),
          ownedWorkspaces: db.workspaces.filter(row => row.ownerId === user.id && row.id === shape.ownedWorkspaces?.where.id) };
      },
      findFirst: async () => null,
    },
    workspaceMember: {
      findUnique: async ({ where }) => find('members', where),
      findFirst: async ({ where }) => find('members', where),
      count: async ({ where }) => db.members.filter(row => matches(row, where)).length,
      updateMany: async ({ where, data }) => { db.members.filter(row => matches(row, where)).forEach(row => Object.assign(row, data)); return {}; },
    },
    rolePermission: {
      findUnique: async ({ where }) => find('rolePermissions', where),
      findMany: async ({ where }) => db.rolePermissions.filter(row => matches(row, where)),
      upsert: async ({ where, create }) => find('rolePermissions', where) ?? (db.rolePermissions.push({ ...create }), create),
      deleteMany: async ({ where }) => { db.rolePermissions = db.rolePermissions.filter(row => !matches(row, where)); return {}; },
      createMany: async ({ data }) => { db.rolePermissions.push(...data); return {}; },
      updateMany: async ({ where, data }) => { db.rolePermissions.filter(row => matches(row, where)).forEach(row => Object.assign(row, data)); return {}; },
    },
    customRole: {
      findFirst: async ({ where }) => db.customRoles.find(row => matches(row, { ...where, name: undefined }) &&
        (where.name === undefined || String(where.name.equals ?? where.name).toLowerCase() === row.name.toLowerCase())) ?? null,
      findMany: async ({ where }) => db.customRoles.filter(row => matches(row, where)),
      create: async ({ data }) => { const row = { id: 'c-new', ...data }; db.customRoles.push(row); return row; },
      update: async ({ where, data }) => Object.assign(find('customRoles', where), data),
      delete: async ({ where }) => { db.customRoles = db.customRoles.filter(row => row.id !== where.id); return {}; },
    },
    workspaceInvitation: {
      findMany: async ({ where }) => db.invitations.filter(row => matches(row, where)),
      findFirst: async ({ where }) => find('invitations', where),
      findUnique: async ({ where }) => find('invitations', where),
      create: async ({ data }) => { const row = { id: `inv-${data.email}`, ...data }; db.invitations.push(row); return row; },
      delete: async ({ where }) => { db.invitations = db.invitations.filter(row => row.id !== where.id); return {}; },
    },
    $transaction: async run => run(prisma),
  };
  const globals = { console: { log() {}, warn() {}, error() {} }, Date, URL };
  const session = async () => state.userId && { user: { id: state.userId, name: state.userId } };
  const deps = {
    zod: require('zod'),
    'node:crypto': require('node:crypto'),
    '@/lib/prisma': { prisma },
    'next/server': { NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200 }) } },
    '@/lib/request-session': { getServerSession: session },
    '@/lib/auth': { getAuthSession: session },
    '@/lib/session': { getCurrentUser: async () => state.userId && users.find(user => user.id === state.userId) },
    '@/lib/auth-options': { authOptions: {} },
    '@/lib/email': { sendWorkspaceInvitationEmail: async () => ({ success: true }) },
    '@/lib/issue-trash': { assertNoRetainedIssues: async () => {}, IssueTrashError: class extends Error {} },
    '@/lib/forge/legacy-write-guard': { assertLegacyWorkspaceDeleteAllowed: async () => {}, ForgeProjectWriteError: class extends Error {} },
    '@/lib/post-access': load('src/lib/post-access.ts'), '@/lib/utils': {},
  };
  deps['@/lib/workspace-authority'] = load('src/lib/workspace-authority.ts', { './prisma': { prisma } });
  deps['@/lib/permissions'] = load('src/lib/permissions.ts', { './prisma': { prisma }, './workspace-authority': deps['@/lib/workspace-authority'] }, globals);
  deps['@/lib/role-permission-defaults'] = load('src/lib/role-permission-defaults.ts', { '@/lib/prisma': { prisma } }, globals);
  const base = 'src/app/api/workspaces/[workspaceId]/';
  const routes = {
    workspace: load(`${base}route.ts`, deps, globals),
    settings: load(`${base}settings/route.ts`, deps, globals),
    permissions: load(`${base}permissions/route.ts`, deps, globals),
    roles: load(`${base}custom-roles/route.ts`, deps, globals),
    role: load(`${base}custom-roles/[roleId]/route.ts`, deps, globals),
    invitations: load(`${base}invitations/route.ts`, deps, globals),
  };
  const actions = load('src/actions/workspace.ts', deps, globals);

  // Each path answers { ok, status, error }; a server action's refusal is the error it throws.
  const respond = response => ({ ok: response.status < 300, status: response.status, error: response.body?.error });
  const settle = async promise => {
    try { await promise; return { ok: true }; } catch (error) { return { ok: false, error: error.message }; }
  };
  const call = (route, method, body, params = {}, url = 'https://example.test/') => async actor => {
    state.userId = actor;
    return respond(await routes[route][method]({ url, json: async () => body }, { params: Promise.resolve({ workspaceId: 'w', ...params }) }));
  };
  const act = run => async actor => { state.userId = actor; return settle(run()); };
  const paths = {
    rename: call('workspace', 'PATCH', patch),
    settings: call('settings', 'PATCH', patch),
    updateAction: act(() => actions.updateWorkspace('w', patch)),
    deleteRoute: call('workspace', 'DELETE'),
    deleteAction: act(() => actions.deleteWorkspace('w')),
    listInvitations: call('invitations', 'GET'),
    invite: call('invitations', 'POST', { email: 'new@example.test' }),
    cancelInvitation: call('invitations', 'DELETE', undefined, {}, 'https://example.test/?id=inv1'),
    readPermissions: call('permissions', 'GET'),
    changePermission: call('permissions', 'PUT', { role: 'DEVELOPER', permission: 'VIEW_POSTS', enabled: true }),
    resetPermissions: call('permissions', 'POST', { role: 'DEVELOPER' }),
    listRoles: call('roles', 'GET'),
    createRole: call('roles', 'POST', { name: 'Helpers', permissions: ['VIEW_POSTS'] }),
    editRole: call('role', 'PUT', { description: 'Edited' }, { roleId: 'c1' }),
    deleteRole: call('role', 'DELETE', undefined, { roleId: 'c1' }),
  };
  const snapshot = () => JSON.stringify(db);
  return { paths, db, snapshot, workspace: () => db.workspaces[0] ?? null };
}

// A refusal on a route is a 403 whose error is one sentence; an action throws one sentence.
function refused(answer, why) {
  assert.equal(answer.ok, false, why);
  if (answer.status !== undefined) assert.equal(answer.status, 403, `${why}: ${JSON.stringify(answer)}`);
  assert.match(answer.error, /^[A-Z][^.]*\.?$/, why);
}

test('all six workspace settings are writable from Owner on every path, and refused below', async () => {
  for (const path of ['rename', 'settings', 'updateAction']) {
    for (const actor of ['prim', 'own1', 'own2']) {
      const f = fixture();
      const answer = await f.paths[path](actor);
      assert.equal(answer.ok, true, `${path}: ${actor} ${JSON.stringify(answer)}`);
      for (const [field, value] of Object.entries(settings)) assert.equal(f.workspace()[field], value, `${path}: ${field}`);
    }
    for (const actor of ['adm1', 'adm2', 'hr', 'dev', 'out']) {
      const f = fixture();
      const before = f.snapshot();
      const answer = await f.paths[path](actor);
      refused(answer, `${path}: ${actor}`);
      assert.match(answer.error, /Owner/, `${path}: the sentence names who may`);
      assert.equal(f.snapshot(), before, `${path}: ${actor} stored nothing`);
    }
    for (const [slug, message] of [['docs', /reserved/], ['taken', /already exists/]]) {
      const f = fixture({ ...settings, slug });
      f.db.workspaces.push({ id: 'other', slug: 'taken' });
      const before = f.snapshot();
      const answer = await f.paths[path]('own1');
      assert.equal(answer.ok, false);
      assert.match(answer.error, message);
      assert.equal(f.snapshot(), before);
    }
  }
});

test('settings PATCH returns 404 for a missing workspace', async () => {
  const f = fixture();
  f.db.workspaces.length = 0;
  assert.equal((await f.paths.settings('out')).status, 404);
});

test('only the primary owner deletes the workspace', async () => {
  for (const path of ['deleteRoute', 'deleteAction']) {
    for (const actor of ['own1', 'own2', 'adm1', 'hr', 'dev', 'out']) {
      const f = fixture();
      const answer = await f.paths[path](actor);
      refused(answer, `${path}: ${actor}`);
      assert.match(answer.error, /primary owner/i, `${path}: the sentence names who may`);
      assert.ok(f.workspace(), `${path}: ${actor} deleted nothing`);
    }
    const f = fixture();
    assert.equal((await f.paths[path]('prim')).ok, true, `${path}: the primary owner`);
    assert.equal(f.workspace(), null);
  }
});

test('inviting is for Admin and above, and for a standard role that holds the invite permission', async () => {
  for (const path of ['listInvitations', 'invite', 'cancelInvitation']) {
    for (const actor of ['prim', 'own1', 'own2', 'adm1', 'adm2', 'hr']) {
      const f = fixture();
      const answer = await f.paths[path](actor);
      assert.equal(answer.ok, true, `${path}: ${actor} ${JSON.stringify(answer)}`);
      if (path === 'invite') assert.ok(f.db.invitations.some(row => row.email === 'new@example.test' && row.invitedById === actor));
      if (path === 'cancelInvitation') assert.equal(f.db.invitations.some(row => row.id === 'inv1'), false);
    }
    for (const actor of ['dev', 'out', 'root']) {
      const f = fixture();
      if (actor === 'root') f.db.members.push({ userId: 'root', workspaceId: 'w', role: 'DEVELOPER', status: true });
      const before = f.snapshot();
      const answer = await f.paths[path](actor);
      refused(answer, `${path}: ${actor}`);
      assert.match(answer.error, /Admin.*INVITE_MEMBERS/);
      assert.equal(f.snapshot(), before);
    }
  }
});

test('a platform admin who is not a member gets today\'s answer on each path', async () => {
  // Allowed today, through the platform role.
  for (const path of ['rename', 'deleteRoute', 'listInvitations', 'invite', 'cancelInvitation',
    'readPermissions', 'changePermission', 'resetPermissions', 'createRole', 'editRole', 'deleteRole']) {
    const f = fixture();
    const answer = await f.paths[path]('root');
    assert.equal(answer.ok, true, `${path}: ${JSON.stringify(answer)}`);
  }
  let f = fixture();
  await f.paths.rename('root');
  assert.equal(f.workspace().name, 'Renamed');
  f = fixture();
  await f.paths.deleteRoute('root');
  assert.equal(f.workspace(), null);
  // Refused today: the settings switches, both actions, and listing custom roles.
  f = fixture();
  const before = f.snapshot();
  assert.deepEqual(await f.paths.settings('root'), { ok: false, status: 404, error: 'Workspace not found or insufficient permissions' });
  assert.equal((await f.paths.updateAction('root')).ok, false);
  assert.equal((await f.paths.deleteAction('root')).ok, false);
  assert.deepEqual(await f.paths.listRoles('root'), { ok: false, status: 403, error: 'Not a member of this workspace' });
  assert.equal(f.snapshot(), before);
});
