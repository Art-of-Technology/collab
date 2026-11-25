const { assert, test, load, matches, workspaces } = require('./helpers.cjs');

function fixture(sessionUser = { id: 'alice', email: 'bob@example.test' }, onMetadata = () => {}) {
  const users = ['alice', 'bob', 'root'].map(id => ({ id, email: `${id}@example.test`, role: id === 'root' ? 'SYSTEM_ADMIN' : 'DEVELOPER', createdAt: new Date(), updatedAt: new Date() }));
  const spaces = structuredClone(workspaces).map(row => ({ ...row, slug: `${row.id}-slug`, name: `Private ${row.id}`, owner: users.find(user => user.id === row.ownerId),
    members: row.members.map(member => ({ ...member, id: `${row.id}-${member.userId}`, role: 'MEMBER', user: users.find(user => user.id === member.userId) })),
    invitations: [{ id: `invite-${row.id}` }],
  }));
  // Owners do not require an active membership row.
  spaces[0].members.push({ id: 'inactive-owner', userId: 'alice', status: false, user: users[0], role: 'owner' });
  const reads = [], customRoles = [], grants = [];
  let materialized = 0;
  const db = {
    user: { findUnique: async ({ where, include, select }) => {
      const user = users.find(row => matches(row, where)) ?? null;
      // The permission check and the authority module ask for the viewer's active membership (and owned workspace) in one workspace.
      const relations = include ?? select;
      if (!user || !relations?.workspaceMemberships) return user;
      return { ...user,
        workspaceMemberships: spaces.flatMap(row => row.members.map(member => ({ ...member, workspaceId: row.id })))
          .filter(member => member.userId === user.id && matches(member, relations.workspaceMemberships.where)),
        ownedWorkspaces: spaces.filter(row => row.ownerId === user.id && matches(row, relations.ownedWorkspaces?.where ?? {})).map(row => ({ id: row.id })) };
    } },
    customRole: { findMany: async ({ where }) => customRoles.filter(row => matches(row, where)) },
    rolePermission: { findUnique: async ({ where }) => grants.find(row => matches(row, where.workspaceId_role_permission)) ?? null },
    workspace: {
      findMany: async spec => {
        reads.push(spec);
        const rows = spaces.filter(row => matches(row, spec.where)).slice(0, spec.take);
        materialized += rows.length;
        return rows;
      },
      findUnique: async spec => {
        reads.push(spec);
        const row = spaces.find(row => matches(row, spec.where)) ?? null;
        if (!row) return null;
        if (spec.select) {
          const metadata = Object.fromEntries(Object.keys(spec.select).map(key => [key, row[key]]));
          onMetadata(spaces);
          return metadata;
        }
        materialized++;
        return row;
      },
    },
  };
  const deps = { 'next-auth': { getServerSession: async () => sessionUser && { user: sessionUser } },
    '@/lib/auth': { getAuthSession: async () => sessionUser && { user: sessionUser } },
    '@/lib/auth-options': {}, '@/lib/prisma': { prisma: db }, '@/lib/utils': {} };
  deps['@/lib/session'] = load('src/lib/session.ts', deps, { console });
  deps['@/lib/permissions'] = load('src/lib/permissions.ts', { './prisma': { prisma: db } }, { console });
  return { actions: load('src/actions/workspace.ts', deps), spaces, users, reads, customRoles, grants, materialized: () => materialized };
}

test('workspace lists retain owners and active members only, with by-ID reads bound to the current subject', async () => {
  const f = fixture();
  const result = await f.actions.getUserWorkspaces();
  assert.deepEqual(Array.from(result.owned, row => row.id), ['own']);
  assert.deepEqual(Array.from(result.member, row => row.id), ['joined']);
  assert.deepEqual(Array.from(result.all, row => row.id), ['own', 'joined']);
  assert.deepEqual(Array.from(await f.actions.getUserWorkspacesById('alice'), row => row.id), ['own', 'joined']);
  assert.equal((await f.actions.getUserWorkspacesById('alice', 1)).length, 1);
  const before = f.reads.length;
  await assert.rejects(f.actions.getUserWorkspacesById('bob'), /Unauthorized/);
  assert.equal(f.reads.length, before);
  f.spaces[1].members[0].status = false;
  assert.deepEqual(Array.from((await f.actions.getUserWorkspaces()).all, row => row.id), ['own']);
  assert.deepEqual(Array.from(await f.actions.getUserWorkspacesById('alice'), row => row.id), ['own']);
});

for (const name of ['getWorkspaceById', 'getDetailedWorkspaceById']) test(`${name} applies access before relation reads on slug and ID paths`, async () => {
  for (const suffix of ['', '-slug']) {
    for (const id of ['revoked', 'foreign', 'missing']) {
      const f = fixture();
      await assert.rejects(f.actions[name](id + suffix), id === 'missing' ? /Workspace not found/ : /You do not have access to this workspace/);
      assert.equal(f.materialized(), 0);
    }
    for (const id of ['own', 'joined']) {
      const f = fixture({ id: 'alice' });
      const result = await f.actions[name](id + suffix);
      assert.equal(result.id, id);
      assert.equal(result.isOwner, id === 'own');
      assert.equal(result.isMember, id === 'joined');
      assert.equal(result.members.length, 1);
      if (name === 'getDetailedWorkspaceById') {
        assert.equal(result.canManage, id === 'own');
        // The owner may invite and sees pending invitations; a plain member does not.
        assert.deepEqual(Array.from(result.invitations, row => row.id), id === 'own' ? [`invite-${id}`] : []);
      }
      f.spaces[1].members[0].status = false;
      if (id === 'joined') {
        const before = f.materialized();
        await assert.rejects(f.actions[name](id + suffix), id === 'missing' ? /Workspace not found/ : /You do not have access to this workspace/);
        assert.equal(f.materialized(), before);
      }
    }
  }
});

test('detailed workspace keeps current SYSTEM_ADMIN authority and fails closed on demotion', async () => {
  const stale = fixture({ id: 'alice', role: 'SYSTEM_ADMIN' });
  await assert.rejects(stale.actions.getDetailedWorkspaceById('foreign'), /You do not have access to this workspace/);
  assert.equal(stale.materialized(), 0);
  const f = fixture({ id: 'root', role: 'DEVELOPER' });
  for (const id of ['foreign', 'foreign-slug']) {
    const result = await f.actions.getDetailedWorkspaceById(id);
    assert.equal(result.canManage, true);
    assert.equal(result.isOwner, false);
    assert.equal(result.isMember, false);
    assert.deepEqual(Array.from(result.invitations, row => row.id), ['invite-foreign']);
  }
  f.users.find(user => user.id === 'root').role = 'DEVELOPER';
  const before = f.materialized();
  await assert.rejects(f.actions.getDetailedWorkspaceById('foreign'), /You do not have access to this workspace/);
  assert.equal(f.materialized(), before);
});

test('workspace member list requires owner or active membership before roster materialization', async () => {
  for (const id of ['revoked', 'foreign', 'missing']) {
    const f = fixture();
    await assert.rejects(f.actions.getWorkspaceMembers(id), /Workspace not found/);
    assert.equal(f.materialized(), 0);
  }
  for (const id of ['own', 'joined']) {
    const f = fixture({ id: 'alice' });
    const result = await f.actions.getWorkspaceMembers(id);
    assert.equal(result.workspace.id, id);
    assert.equal(result.members[0].userId, 'alice');
    assert.equal(result.members[0].user.id, 'alice');
    assert.equal(result.members[0].id, id === 'own' ? 'inactive-owner' : 'joined-alice');
  }
});

test('all five workspace reads reject absent or deleted subjects before workspace IO', async () => {
  for (const user of [null, { email: 'alice@example.test' }, { id: 'deleted', email: 'alice@example.test', role: 'SYSTEM_ADMIN' }]) {
    const f = fixture(user);
    for (const [name, argument] of [['getUserWorkspaces'], ['getUserWorkspacesById', 'alice'], ['getWorkspaceById', 'own'], ['getDetailedWorkspaceById', 'own'], ['getWorkspaceMembers', 'own']]) {
      await assert.rejects(f.actions[name](argument), /Unauthorized|User not found/);
    }
    assert.equal(f.reads.length, 0);
    assert.equal(f.materialized(), 0);
  }
});

for (const name of ['getWorkspaceById', 'getDetailedWorkspaceById']) test(`${name} rechecks access after metadata and preserves slug precedence`, async () => {
  const f = fixture({ id: 'alice' }, spaces => { spaces[1].members[0].status = false; });
  await assert.rejects(f.actions[name]('joined-slug'), /You do not have access to this workspace/);
  assert.equal(f.materialized(), 0);
  const collision = fixture({ id: 'alice' });
  collision.spaces[3].slug = 'own';
  await assert.rejects(collision.actions[name]('own'), /You do not have access to this workspace/);
  assert.equal(collision.materialized(), 0);
});

test("workspace detail carries the viewer's level, each member's level and the roles the viewer may grant, from the authority module", async () => {
  const f = fixture({ id: 'alice' });
  const person = (id, email = `${id}@example.test`) => ({ id, email, role: 'DEVELOPER' });
  const joined = f.spaces[1]; // owned by bob; alice is a member
  joined.members = [
    { id: 'm-alice', userId: 'alice', status: true, role: 'OWNER', user: f.users[0] },
    { id: 'm-bob', userId: 'bob', status: true, role: 'OWNER', user: f.users[1] },
    { id: 'm-carol', userId: 'carol', status: true, role: 'ADMIN', user: person('carol') },
    { id: 'm-dave', userId: 'dave', status: false, role: 'Support', user: person('dave') },
    { id: 'm-seat', userId: 'seat', status: true, role: 'MEMBER', user: person('seat', null) },
  ];
  f.customRoles.push({ workspaceId: 'joined', name: 'Support' }, { workspaceId: 'foreign', name: 'Elsewhere' });
  const shape = result => Object.fromEntries(result.members.map(m => [m.id, [m.level, m.agent, m.mayAct]]));

  // An Owner acts on Admins and below, never on the primary owner, an agent account or themselves; grants everything below Owner.
  let result = await f.actions.getDetailedWorkspaceById('joined');
  assert.equal(result.viewerLevel, 'OWNER');
  assert.deepEqual(shape(result), {
    'm-alice': ['OWNER', false, false], 'm-bob': ['PRIMARY_OWNER', false, false], 'm-carol': ['ADMIN', false, true],
    'm-dave': ['STANDARD', false, true], 'm-seat': ['STANDARD', true, false],
  });
  assert.ok(!result.rolesViewerMayGrant.includes('OWNER'));
  assert.ok(result.rolesViewerMayGrant.includes('ADMIN') && result.rolesViewerMayGrant.includes('MEMBER'));
  assert.ok(result.rolesViewerMayGrant.includes('Support') && !result.rolesViewerMayGrant.includes('Elsewhere'));

  // An Admin whose role lost the change-roles permission is offered no role to grant: the role route would refuse.
  joined.members[0].role = 'ADMIN';
  f.grants.push({ workspaceId: 'joined', role: 'ADMIN', permission: 'INVITE_MEMBERS' },
    { workspaceId: 'foreign', role: 'ADMIN', permission: 'CHANGE_MEMBER_ROLES' });
  result = await f.actions.getDetailedWorkspaceById('joined');
  assert.deepEqual(Array.from(result.rolesViewerMayGrant), []);
  assert.deepEqual(Array.from(result.invitations, row => row.id), ['invite-joined']);
  assert.equal(shape(result)['m-dave'][2], true, 'switching on or off and removing need no such permission');

  // An Admin does not act on another Admin and grants neither Owner nor Admin.
  f.grants[0].permission = 'CHANGE_MEMBER_ROLES';
  result = await f.actions.getDetailedWorkspaceById('joined');
  assert.deepEqual(Array.from(result.invitations), []);
  assert.equal(result.viewerLevel, 'ADMIN');
  assert.equal(shape(result)['m-carol'][2], false);
  assert.equal(shape(result)['m-dave'][2], true);
  assert.ok(!result.rolesViewerMayGrant.includes('OWNER') && !result.rolesViewerMayGrant.includes('ADMIN'));
  assert.ok(result.rolesViewerMayGrant.includes('Support'));

  // A standard role without the change-roles permission grants nothing and acts on nobody.
  f.grants.length = 0;
  joined.members[0].role = 'MEMBER';
  result = await f.actions.getDetailedWorkspaceById('joined');
  assert.equal(result.viewerLevel, 'STANDARD');
  assert.deepEqual(Array.from(result.rolesViewerMayGrant), []);
  assert.ok(result.members.every(m => m.mayAct === false));

  // The primary owner grants Owner too.
  const owner = fixture({ id: 'bob' });
  owner.spaces[1].members = joined.members;
  result = await owner.actions.getDetailedWorkspaceById('joined');
  assert.equal(result.viewerLevel, 'PRIMARY_OWNER');
  assert.ok(result.rolesViewerMayGrant.includes('OWNER'));
  assert.equal(shape(result)['m-alice'][2], true);

  // A platform admin who is not a member has no level and acts on nobody through the module.
  const admin = fixture({ id: 'root' });
  result = await admin.actions.getDetailedWorkspaceById('foreign');
  assert.equal(result.viewerLevel, null);
  assert.deepEqual(Array.from(result.rolesViewerMayGrant), []);
  assert.equal(result.canManage, true);
});
