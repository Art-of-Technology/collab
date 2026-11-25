const { assert, test, load, matches } = require('./helpers.cjs');

// One workspace, owned by `prim`, with a member at every level.
function fixture() {
  const rows = [
    ['prim', 'OWNER'], ['own1', 'OWNER'], ['own2', 'owner'], ['adm1', 'ADMIN'], ['adm2', 'admin'],
    ['hr', 'HR'], ['hr2', 'HR'], ['dev', 'DEVELOPER'], ['mem', 'MEMBER'], ['agent', 'MEMBER'], ['gone', 'MEMBER', false],
    // Platform admins who are also members: a standard role, an Admin and an Owner.
    ['pas', 'DEVELOPER'], ['paa', 'ADMIN'], ['pao', 'OWNER'],
  ].map(([userId, role, status = true]) => ({ id: `m-${userId}`, workspaceId: 'w', userId, role, status }));
  const users = [...rows.map(row => ({ id: row.userId, email: `${row.userId}@example.test`, role: row.userId.startsWith('pa') ? 'SYSTEM_ADMIN' : 'DEVELOPER' })),
    { id: 'root', email: 'root@example.test', role: 'SYSTEM_ADMIN' }, { id: 'out', email: 'out@example.test', role: 'DEVELOPER' }];
  users.find(user => user.id === 'agent').email = null; // an agent token's service account
  const workspaces = [{ id: 'w', slug: 'w', name: 'W', ownerId: 'prim' }];
  const rolePermissions = [
    ...['CHANGE_MEMBER_ROLES', 'MANAGE_WORKSPACE_MEMBERS'].flatMap(permission => ['ADMIN', 'admin', 'HR'].map(role => ({ workspaceId: 'w', role, permission }))),
  ];
  const state = { userId: null };
  const withUser = row => row && { ...row, user: { id: row.userId, name: row.userId, email: users.find(user => user.id === row.userId).email } };
  const find = where => rows.find(row => matches(row, where)) ?? null;
  const memberships = (userId, where) => rows.filter(row => row.userId === userId && matches(row, where));
  const prisma = {
    workspace: {
      findUnique: async ({ where }) => { const row = workspaces.find(item => matches(item, where)); return row ? { ...row, owner: { id: row.ownerId } } : null; },
      findFirst: async ({ where }) => workspaces.find(item => matches(item, where)) ?? null,
    },
    user: {
      findUnique: async ({ where, select, include }) => {
        const user = users.find(row => row.id === where.id);
        const shape = select || include;
        if (!user || !shape?.workspaceMemberships) return user ?? null;
        return { ...user, workspaceMemberships: memberships(user.id, shape.workspaceMemberships.where),
          ownedWorkspaces: workspaces.filter(row => row.ownerId === user.id && row.id === shape.ownedWorkspaces?.where.id) };
      },
    },
    workspaceMember: {
      findUnique: async ({ where }) => withUser(find(where.userId_workspaceId ?? where)),
      findFirst: async ({ where }) => withUser(find(where)),
      update: async ({ where, data }) => withUser(Object.assign(find(where.userId_workspaceId ?? where), data)),
      create: async ({ data }) => { const row = { id: `m-${data.userId}`, status: true, ...data }; rows.push(row); return row; },
      delete: async ({ where }) => { rows.splice(rows.indexOf(find(where)), 1); return {}; },
    },
    rolePermission: { findUnique: async ({ where }) => rolePermissions.find(row => matches(row, where.workspaceId_role_permission)) ?? null },
    customRole: { findFirst: async ({ where }) => (where.workspaceId === 'w' && where.name === 'Release Captain' ? { id: 'c', name: where.name } : null) },
    appAuditLog: { create: async ({ data }) => data },
    $queryRaw: async () => [],
    $transaction: async run => run(prisma),
  };
  const globals = { console: { log() {}, warn() {}, error() {} }, Date };
  const deps = {
    zod: require('zod'),
    '@/lib/prisma': { prisma },
    'next/server': { NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200 }) } },
    '@/lib/request-session': { getServerSession: async () => state.userId && { user: { id: state.userId } } },
    '@/lib/session': { getCurrentUser: async () => state.userId && { id: state.userId } },
    '@/lib/auth-options': { authOptions: {} },
    '@/lib/slug-resolvers': { resolveWorkspaceSlug: async value => workspaces.find(row => row.id === value || row.slug === value)?.id ?? null },
    '@/lib/role-permission-defaults': { ensureRolePermissionsForWorkspaceRole: async () => {} },
    '@/lib/post-access': load('src/lib/post-access.ts'),
    '@/lib/issue-trash': {}, '@/lib/forge/legacy-write-guard': {}, '@/lib/utils': {},
  };
  deps['@/lib/workspace-authority'] = load('src/lib/workspace-authority.ts', { './prisma': { prisma } });
  deps['@/lib/permissions'] = load('src/lib/permissions.ts', { './prisma': { prisma }, './workspace-authority': deps['@/lib/workspace-authority'] }, globals);
  deps['@/lib/workspace-membership'] = load('src/lib/workspace-membership.ts', deps, globals);
  const base = 'src/app/api/workspaces/[workspaceId]/members/';
  const roleRoute = load(`${base}[memberId]/role/route.ts`, deps, globals);
  const memberRoute = load(`${base}[memberId]/route.ts`, deps, globals);
  const byUserRoute = load(`${base}by-user/[userId]/route.ts`, deps, globals);
  const actions = load('src/actions/workspace.ts', deps, globals);

  const as = userId => { state.userId = userId; };
  const request = body => ({ json: async () => body });
  // Each path answers { ok, status, error }; a server action's refusal is the error it throws.
  const respond = response => ({ ok: response.status === 200, status: response.status, error: response.body?.error });
  const settle = async promise => {
    try { await promise; return { ok: true }; } catch (error) { return { ok: false, error: error.message }; }
  };
  const paths = {
    role: async (actor, target, role) => { as(actor); return respond(await roleRoute.PUT(request({ role }), { params: Promise.resolve({ workspaceId: 'w', memberId: `m-${target}` }) })); },
    patch: async (actor, target, status) => { as(actor); return respond(await memberRoute.PATCH(request({ status }), { params: Promise.resolve({ workspaceId: 'w', memberId: `m-${target}` }) })); },
    byUser: async (actor, target, active) => { as(actor); return respond(await byUserRoute.PUT(request({ active }), { params: Promise.resolve({ workspaceId: 'w', userId: target }) })); },
    action: async (actor, target, status) => { as(actor); return settle(actions.updateWorkspaceMemberStatus({ workspaceId: 'w', memberId: `m-${target}`, status })); },
    remove: async (actor, target) => { as(actor); return settle(actions.removeWorkspaceMember({ workspaceId: 'w', userId: target })); },
  };
  const row = userId => rows.find(item => item.userId === userId) ?? null;
  return { ...paths, row, rows, rolePermissions };
}

// Criterion 8: a refusal on a route is a 403 whose error is one sentence.
function refused(answer, why) {
  assert.equal(answer.ok, false, why);
  if (answer.status !== undefined) assert.equal(answer.status, 403, `${why}: ${JSON.stringify(answer)}`);
  assert.match(answer.error, /^[A-Z][^.]*\.?$/, why);
}

test('a role change is refused on the actor\'s own row, on an equal level and on a higher level', async () => {
  const f = fixture();
  const before = JSON.stringify(f.rows);
  for (const [actor, target, role, why] of [
    ['hr', 'hr', 'OWNER', 'a standard role holding change-roles raises itself to Owner'],
    ['hr', 'hr', 'ADMIN', 'or to Admin'],
    ['adm1', 'adm1', 'OWNER', 'an Admin raises itself'],
    ['own1', 'own1', 'MEMBER', 'an Owner lowers itself'],
    ['adm1', 'adm1', 'MEMBER', 'an Admin lowers itself'],
    ['own1', 'own2', 'MEMBER', 'Owner on Owner'],
    ['adm1', 'adm2', 'MEMBER', 'Admin on Admin, stored in lowercase'],
    ['adm1', 'own1', 'MEMBER', 'Admin on Owner'],
    ['hr', 'adm1', 'MEMBER', 'standard on Admin'],
    ['hr', 'own2', 'MEMBER', 'standard on Owner'],
  ]) refused(await f.role(actor, target, role), why);
  assert.equal(JSON.stringify(f.rows), before, 'nothing was stored');

  assert.equal((await f.role('own1', 'adm1', 'MEMBER')).ok, true, 'an Owner changes an Admin');
  assert.equal(f.row('adm1').role, 'MEMBER');
  assert.equal((await f.role('adm2', 'dev', 'MEMBER')).ok, true, 'an Admin changes a standard role');
  assert.equal(f.row('dev').role, 'MEMBER');
});

test('only the primary owner grants or removes the Owner role', async () => {
  const f = fixture();
  for (const actor of ['own1', 'adm1', 'hr']) {
    const answer = await f.role(actor, 'mem', 'OWNER');
    refused(answer, `${actor} grants Owner to someone else`);
    assert.match(answer.error, /primary owner/i, 'the sentence says who may grant it');
  }
  refused(await f.role('own1', 'adm1', 'OWNER'), 'an Owner promotes an Admin to Owner');
  refused(await f.role('own1', 'own2', 'ADMIN'), 'an Owner demotes another Owner');
  refused(await f.role('adm1', 'mem', 'ADMIN'), 'an Admin grants Admin');
  assert.equal(f.row('mem').role, 'MEMBER');
  assert.equal(f.row('own2').role, 'owner');

  assert.equal((await f.role('own1', 'mem', 'ADMIN')).ok, true, 'an Owner makes someone an Admin');
  assert.equal(f.row('mem').role, 'ADMIN');
  assert.equal((await f.role('prim', 'dev', 'OWNER')).ok, true, 'the primary owner makes someone an Owner');
  assert.equal(f.row('dev').role, 'OWNER');
  assert.equal((await f.role('prim', 'own2', 'MEMBER')).ok, true, 'and demotes one');
  assert.equal(f.row('own2').role, 'MEMBER');
});

test('a standard role with change-roles moves people between standard roles only', async () => {
  const f = fixture();
  assert.equal((await f.role('hr', 'dev', 'MEMBER')).ok, true);
  assert.equal(f.row('dev').role, 'MEMBER');
  assert.equal((await f.role('hr', 'mem', 'Release Captain')).ok, true, 'a custom role is a standard role');
  assert.equal(f.row('mem').role, 'Release Captain');
  assert.equal((await f.role('hr', 'hr2', 'DEVELOPER')).ok, true, 'another holder of the same standard role');
  for (const [target, role, why] of [['dev', 'ADMIN', 'grants Admin'], ['dev', 'OWNER', 'grants Owner'], ['adm1', 'MEMBER', 'acts on an Admin'], ['own1', 'MEMBER', 'acts on an Owner']]) {
    refused(await f.role('hr', target, role), why);
  }
  refused(await f.role('dev', 'mem', 'DEVELOPER'), 'a standard role without change-roles');
  assert.equal(f.row('dev').role, 'MEMBER');
});

test('the primary owner\'s membership cannot be re-roled, switched off or removed, by anyone', async () => {
  const f = fixture();
  for (const actor of ['prim', 'own1', 'adm1', 'hr', 'root', 'pas', 'paa', 'pao']) {
    refused(await f.role(actor, 'prim', 'MEMBER'), `${actor} re-roles the primary owner`);
    for (const path of ['patch', 'action']) refused(await f[path](actor, 'prim', false), `${actor} switches the primary owner off on ${path}`);
    // The by-user path keeps its own answer for the owner, who is in the workspace through ownership.
    assert.equal((await f.byUser(actor, 'prim', false)).status, 409, `${actor} on by-user`);
    assert.equal((await f.remove(actor, 'prim')).ok, false, `${actor} removes the primary owner`);
  }
  assert.equal(JSON.stringify(f.row('prim')), JSON.stringify({ id: 'm-prim', workspaceId: 'w', userId: 'prim', role: 'OWNER', status: true }));
});

test('an Owner switches a member off on all three status paths, and an Admin only below Admin', async () => {
  for (const path of ['patch', 'byUser', 'action']) {
    for (const [actor, target, allowed, why] of [
      ['prim', 'own1', true, 'the primary owner on an Owner'],
      ['own1', 'adm2', true, 'an Owner on an Admin'],
      ['own1', 'mem', true, 'an Owner on a standard role'],
      ['own1', 'own2', false, 'an Owner on an Owner'],
      ['adm1', 'mem', true, 'an Admin on a standard role'],
      ['adm1', 'adm2', false, 'an Admin on an Admin'],
      ['adm1', 'own1', false, 'an Admin on an Owner'],
      ['adm1', 'adm1', false, 'an Admin on itself'],
      ['hr', 'mem', false, 'a standard role that may manage members'],
      ['dev', 'mem', false, 'a standard role'],
    ]) {
      const f = fixture();
      const answer = await f[path](actor, target, false);
      if (allowed) {
        assert.equal(answer.ok, true, `${path}: ${why}`);
        assert.equal(f.row(target).status, false, `${path}: ${why}`);
      } else {
        refused(answer, `${path}: ${why}`);
        assert.equal(f.row(target).status, true, `${path}: ${why}`);
      }
    }
  }
  for (const path of ['patch', 'byUser', 'action']) {
    const f = fixture();
    assert.equal((await f[path]('adm1', 'gone', true)).ok, true, `${path}: an Admin switches a standard role back on`);
    f.row('adm2').status = false;
    refused(await f[path]('adm1', 'adm2', true), `${path}: but not another Admin`);
    assert.equal(f.row('adm2').status, false);
  }
  const f = fixture();
  assert.equal((await f.byUser('own1', 'agent', false)).status, 409, 'agents stay on the Agent tokens page');
  assert.equal(f.row('agent').status, true);
});

test('an Admin whose role has no manage-members permission row gets the same answer on all three status paths', async () => {
  for (const path of ['patch', 'byUser', 'action']) {
    const f = fixture();
    f.rolePermissions.splice(0, f.rolePermissions.length, ...f.rolePermissions.filter(row => row.permission !== 'MANAGE_WORKSPACE_MEMBERS'));
    assert.equal((await f[path]('adm1', 'mem', false)).ok, true, `${path}: an Admin on a standard role`);
    assert.equal(f.row('mem').status, false, path);
    refused(await f[path]('adm1', 'adm2', false), `${path}: an Admin on an Admin`);
    refused(await f[path]('dev', 'mem', false), `${path}: a standard role`);
  }
});

test('an agent account is managed on the Agent tokens page: no member path changes its role, switches it or removes it', async () => {
  const agentRefusal = { ok: false, status: 409, error: 'Agents are managed on the Agent tokens page' };
  // An Admin, an Owner, the primary owner and platform admins, member or not.
  for (const actor of ['adm1', 'own1', 'prim', 'paa', 'pao', 'pas', 'root']) {
    for (const role of ['OWNER', 'ADMIN', 'DEVELOPER', 'MEMBER', 'Release Captain']) {
      const f = fixture();
      const before = JSON.stringify(f.rows);
      assert.deepEqual(await f.role(actor, 'agent', role), agentRefusal, `${actor} gives the agent ${role}`);
      assert.equal(JSON.stringify(f.rows), before, `${actor}: nothing was stored`);
    }
  }
  for (const actor of ['adm1', 'own1', 'prim', 'paa', 'pao']) {
    for (const status of [false, true]) {
      for (const path of ['patch', 'action']) {
        const f = fixture();
        f.row('agent').status = !status;
        const before = JSON.stringify(f.rows);
        const answer = await f[path](actor, 'agent', status);
        if (path === 'patch') assert.deepEqual(answer, agentRefusal, `${actor} switches the agent ${status ? 'on' : 'off'} on ${path}`);
        else assert.deepEqual(answer, { ok: false, error: agentRefusal.error }, `${actor} switches the agent ${status ? 'on' : 'off'} on ${path}`);
        assert.equal(JSON.stringify(f.rows), before, `${actor} on ${path}: nothing was stored`);
      }
    }
    const f = fixture();
    const before = JSON.stringify(f.rows);
    assert.deepEqual(await f.remove(actor, 'agent'), { ok: false, error: agentRefusal.error }, `${actor} removes the agent`);
    assert.equal(JSON.stringify(f.rows), before, `${actor} removes: nothing was stored`);
  }
  // A person's account at the same level keeps today's answers.
  const f = fixture();
  assert.equal((await f.role('adm1', 'mem', 'DEVELOPER')).ok, true);
  assert.equal((await f.patch('adm1', 'mem', false)).ok, true);
  assert.equal((await f.action('adm1', 'mem', true)).ok, true);
  assert.deepEqual([f.row('mem').role, f.row('mem').status], ['DEVELOPER', true]);
  assert.equal((await f.remove('adm1', 'mem')).ok, true);
  assert.equal(f.row('mem'), null);
});

test('an Admin removes a member below Admin, and anyone but the primary owner may leave', async () => {
  for (const [actor, target, allowed, why] of [
    ['adm1', 'mem', true, 'an Admin on a standard role'],
    ['adm1', 'adm2', false, 'an Admin on an Admin'],
    ['adm1', 'own1', false, 'an Admin on an Owner'],
    ['own1', 'adm1', true, 'an Owner on an Admin'],
    ['own1', 'own2', false, 'an Owner on an Owner'],
    ['prim', 'own1', true, 'the primary owner on an Owner'],
    ['hr', 'mem', false, 'a standard role that may manage members'],
    ['dev', 'mem', false, 'a standard role'],
    ['mem', 'mem', true, 'a standard role leaves'],
    ['adm1', 'adm1', true, 'an Admin leaves'],
    ['own1', 'own1', true, 'an Owner leaves'],
    ['prim', 'prim', false, 'the primary owner leaves'],
  ]) {
    const f = fixture();
    const answer = await f.remove(actor, target);
    if (allowed) assert.equal(answer.ok && f.row(target), null, why);
    else {
      refused(answer, why);
      assert.ok(f.row(target), why);
    }
  }
});

test('a platform admin who is not a member gets today\'s answer on each path', async () => {
  let f = fixture();
  // Role: allowed for any role on any member but the primary owner.
  assert.equal((await f.role('root', 'mem', 'ADMIN')).ok, true);
  assert.equal((await f.role('root', 'adm1', 'OWNER')).ok, true);
  assert.equal((await f.role('root', 'own1', 'MEMBER')).ok, true);
  assert.deepEqual([f.row('mem').role, f.row('adm1').role, f.row('own1').role], ['ADMIN', 'OWNER', 'MEMBER']);
  // PATCH and the server action: refused, since only owners and admins of the workspace may.
  f = fixture();
  assert.deepEqual(await f.patch('root', 'mem', false), { ok: false, status: 403, error: 'Only workspace owners and admins can update member status' });
  assert.match((await f.action('root', 'mem', false)).error, /^Only workspace owners and admins can update member status$/);
  // By-user: allowed on anyone but the owner and agents.
  assert.equal((await f.byUser('root', 'own1', false)).ok, true);
  assert.equal((await f.byUser('root', 'gone', true)).ok, true);
  assert.equal((await f.byUser('root', 'agent', false)).status, 409);
  assert.deepEqual([f.row('own1').status, f.row('gone').status, f.row('agent').status], [false, true, true]);
  // Remove: refused.
  assert.equal((await f.remove('root', 'mem')).ok, false);
  assert.ok(f.row('mem'));
});

test('a platform admin who is also a member gets the answer a platform admin got before the rank rule', async () => {
  // Role: allowed for any role on any other member but the primary owner, whatever the admin's own membership.
  for (const [actor, target, role] of [['pas', 'adm1', 'MEMBER'], ['pas', 'mem', 'OWNER'], ['paa', 'own1', 'MEMBER'], ['paa', 'adm2', 'OWNER'], ['pao', 'own2', 'ADMIN']]) {
    const f = fixture();
    assert.equal((await f.role(actor, target, role)).ok, true, `${actor} gives ${target} ${role}`);
    assert.equal(f.row(target).role, role);
  }
  // Nobody changes their own role, a platform admin included.
  for (const [actor, role] of [['pas', 'ADMIN'], ['paa', 'OWNER'], ['paa', 'MEMBER']]) {
    const f = fixture();
    refused(await f.role(actor, actor, role), `${actor} sets their own role to ${role}`);
    assert.equal(f.row(actor).role, actor === 'pas' ? 'DEVELOPER' : 'ADMIN');
  }
  // PATCH and the server action: Admin and above may, on anyone but the primary owner; below Admin may not.
  for (const path of ['patch', 'action']) {
    for (const [actor, target] of [['paa', 'adm2'], ['paa', 'own1'], ['paa', 'paa'], ['pao', 'own2']]) {
      const f = fixture();
      assert.equal((await f[path](actor, target, false)).ok, true, `${path}: ${actor} on ${target}`);
      assert.equal(f.row(target).status, false);
    }
    const f = fixture();
    refused(await f[path]('pas', 'mem', false), `${path}: a platform admin with a standard role`);
    assert.equal(f.row('mem').status, true);
  }
  // By-user: allowed on anyone but the owner and agents.
  for (const [actor, target] of [['pas', 'adm1'], ['pas', 'pas'], ['paa', 'own1']]) {
    const f = fixture();
    assert.equal((await f.byUser(actor, target, false)).ok, true, `by-user: ${actor} on ${target}`);
    assert.equal(f.row(target).status, false);
  }
  // Remove: as for anyone at that level today, which is no less than before.
  let f = fixture();
  refused(await f.remove('pas', 'mem'), 'a platform admin with a standard role removes someone');
  refused(await f.remove('paa', 'adm2'), 'a platform admin Admin removes an Admin');
  assert.ok(f.row('mem') && f.row('adm2'));
  assert.equal((await f.remove('paa', 'mem')).ok, true, 'a platform admin Admin removes a standard role');
  assert.equal(f.row('mem'), null);
  // A member at the same level who is not a platform admin keeps today's answer.
  f = fixture();
  refused(await f.role('hr', 'adm1', 'MEMBER'), 'a standard role on an Admin');
  refused(await f.role('adm1', 'adm2', 'OWNER'), 'an Admin on an Admin');
  refused(await f.patch('adm1', 'adm2', false), 'an Admin switches an Admin off');
  refused(await f.byUser('hr', 'adm1', false), 'a standard role switches an Admin off');
  assert.deepEqual([f.row('adm1').role, f.row('adm2').role, f.row('adm2').status, f.row('adm1').status], ['ADMIN', 'admin', true, true]);
});

test('someone without access to the workspace is refused on every member path', async () => {
  const f = fixture();
  const before = JSON.stringify(f.rows);
  refused(await f.role('out', 'mem', 'ADMIN'), 'role');
  for (const path of ['patch', 'byUser', 'action']) refused(await f[path]('out', 'mem', false), path);
  refused(await f.remove('out', 'mem'), 'remove');
  assert.equal(JSON.stringify(f.rows), before);
});
