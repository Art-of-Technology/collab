const { assert, test, load, matches } = require('./helpers.cjs');

function fixture(file, sessionUser = { id: 'alice', email: 'bob@example.test' }) {
  const users = ['alice', 'bob'].map(id => ({ id, email: `${id}@example.test`, role: 'DEVELOPER', createdAt: new Date(), updatedAt: new Date() }));
  const workspace = { id: 'unjoined', name: 'Invited workspace', members: [] };
  const invitedBy = { id: 'bob', name: 'Bob', email: 'bob@example.test', image: null };
  const invitations = [
    { id: 'older', email: users[0].email, status: 'pending', expiresAt: new Date('2099-01-01'), createdAt: new Date('2025-01-01'), workspace, invitedBy },
    { id: 'newer', email: users[0].email, status: 'pending', expiresAt: new Date('2099-01-01'), createdAt: new Date('2025-02-01'), workspace, invitedBy },
    { id: 'foreign', email: users[1].email, status: 'pending', expiresAt: new Date('2099-01-01'), createdAt: new Date(), workspace, invitedBy },
    { id: 'expired', email: users[0].email, status: 'pending', expiresAt: new Date('2000-01-01'), createdAt: new Date(), workspace, invitedBy },
    { id: 'accepted', email: users[0].email, status: 'accepted', expiresAt: new Date('2099-01-01'), createdAt: new Date(), workspace, invitedBy },
  ];
  const reads = [];
  const db = {
    user: { findUnique: async ({ where }) => users.find(row => matches(row, where)) ?? null },
    workspaceInvitation: { findMany: async spec => {
      reads.push(spec);
      const rows = invitations.filter(row => matches(row, spec.where));
      if (spec.orderBy?.createdAt === 'desc') rows.sort((a, b) => b.createdAt - a.createdAt);
      return rows.map(row => ({ ...row,
        workspace: spec.include?.workspace ? row.workspace : undefined,
        invitedBy: Object.fromEntries(Object.keys(spec.include?.invitedBy?.select || {}).map(key => [key, row.invitedBy[key]])),
      }));
    } },
  };
  const deps = { 'next-auth': { getServerSession: async () => sessionUser && { user: sessionUser } },
    '@/lib/auth': { getAuthSession: async () => sessionUser && { user: sessionUser } },
    '@/lib/auth-options': {}, '@/lib/prisma': { prisma: db }, '@/lib/utils': {} };
  deps['@/lib/session'] = load('src/lib/session.ts', deps, { console });
  deps['@/lib/workspace-invitations'] = load('src/lib/workspace-invitations.ts', deps, { console });
  deps['@/lib/permissions'] = load('src/lib/permissions.ts', { './prisma': { prisma: db } }, { console });
  return { action: load(file, deps).getPendingInvitations, users, reads, invitations };
}

for (const file of ['src/actions/invitation.ts', 'src/actions/workspace.ts']) {
  test(`${file}: absent/deleted subjects cannot list invitations`, async () => {
    for (const subject of [null, { email: 'alice@example.test' }, { id: 'deleted', email: 'alice@example.test' }]) {
      const f = fixture(file, subject);
      await assert.rejects(f.action('alice@example.test'), /Unauthorized/);
      assert.equal(f.reads.length, 0);
    }
  });
  test(`${file}: current subject owns recipient, regardless of stale session email`, async () => {
    const f = fixture(file);
    await assert.rejects(f.action('bob@example.test'), /Unauthorized/);
    assert.equal(f.reads.length, 0);
    assert.deepEqual(Array.from(await f.action('alice@example.test'), row => row.id), ['newer', 'older']);
    f.users[0].email = 'changed@example.test';
    const before = f.reads.length;
    await assert.rejects(f.action('alice@example.test'), /Unauthorized/);
    assert.equal(f.reads.length, before);
    f.invitations[0].email = 'changed@example.test';
    assert.deepEqual(Array.from(await f.action('changed@example.test'), row => row.id), ['older']);
  });
  test(`${file}: own pending unexpired invitations retain projection/order without membership`, async () => {
    const f = fixture(file, { id: 'alice', email: 'alice@example.test' });
    await assert.rejects(f.action(''), /Email is required/);
    assert.equal(f.reads.length, 0);
    const rows = await f.action('alice@example.test');
    assert.deepEqual(Array.from(rows, row => row.id), ['newer', 'older']);
    assert.equal(rows[0].workspace.id, 'unjoined');
    assert.equal(rows[0].workspace.members.length, 0);
    assert.deepEqual(Object.keys(rows[0].invitedBy).sort(), file.endsWith('/invitation.ts') ? ['email', 'id', 'image', 'name'] : ['email', 'image', 'name']);
    assert.equal(rows[0].invitedBy.email, 'bob@example.test');
  });
}

// The workspace detail page: pending invitations, and the token in each, go only to a viewer who may invite.
function detailFixture(sessionUser) {
  const users = [
    { id: 'owner', role: 'DEVELOPER' }, { id: 'inviter', role: 'DEVELOPER' }, { id: 'member', role: 'DEVELOPER' },
    { id: 'root', role: 'SYSTEM_ADMIN' },
  ].map(user => ({ ...user, email: `${user.id}@example.test`, name: user.id, createdAt: new Date(), updatedAt: new Date() }));
  const pick = id => users.find(user => user.id === id);
  const space = { id: 'space', slug: 'space-slug', name: 'Space', ownerId: 'owner', owner: pick('owner'),
    members: [['inviter', 'ADMIN'], ['member', 'MEMBER']].map(([userId, role]) => ({ id: `m-${userId}`, workspaceId: 'space', userId, role, status: true, user: pick(userId) })),
    invitations: [{ id: 'pending-invite', email: 'new@example.test', status: 'pending', token: 'secret-token', invitedById: 'owner', invitedBy: { id: 'owner', name: 'owner', email: 'owner@example.test' } }],
  };
  const rolePermissions = [{ workspaceId: 'space', role: 'ADMIN', permission: 'INVITE_MEMBERS' }];
  const db = {
    user: { findUnique: async ({ where, include }) => {
      const user = users.find(row => matches(row, where));
      if (!user || !include) return user ?? null;
      return { ...user,
        workspaceMemberships: space.members.filter(member => member.userId === user.id && matches({ ...member, workspaceId: space.id }, include.workspaceMemberships.where)),
        ownedWorkspaces: space.ownerId === user.id && matches(space, include.ownedWorkspaces.where) ? [{ id: space.id }] : [] };
    } },
    workspace: { findUnique: async ({ where, select }) => {
      if (!matches(space, where)) return null;
      return select ? { id: space.id } : structuredClone(space);
    } },
    rolePermission: { findUnique: async ({ where }) => rolePermissions.find(row => matches(row, where.workspaceId_role_permission)) ?? null },
  };
  const deps = { 'next-auth': { getServerSession: async () => ({ user: sessionUser }) },
    '@/lib/auth': { getAuthSession: async () => ({ user: sessionUser }) },
    '@/lib/auth-options': {}, '@/lib/prisma': { prisma: db }, '@/lib/utils': {} };
  deps['@/lib/session'] = load('src/lib/session.ts', deps, { console });
  deps['@/lib/permissions'] = load('src/lib/permissions.ts', { './prisma': { prisma: db } }, { console });
  return { detail: load('src/actions/workspace.ts', deps).getDetailedWorkspaceById, space };
}

test('workspace detail lists pending invitations only for a viewer who may invite', async () => {
  for (const id of ['owner', 'inviter', 'root']) {
    const result = await detailFixture({ id }).detail('space');
    assert.deepEqual(Array.from(result.invitations, row => row.id), ['pending-invite'], id);
    assert.equal(result.invitations[0].token, 'secret-token', id);
  }
  // A member without INVITE_MEMBERS gets none.
  const member = await detailFixture({ id: 'member' }).detail('space');
  assert.deepEqual(Array.from(member.invitations), [], 'member');
});

test('a member who may not invite gets no invitation and no token', async () => {
  const { detail, space } = detailFixture({ id: 'member' });
  const result = await detail('space');
  assert.deepEqual(Array.from(result.invitations), []);
  assert.equal(JSON.stringify(result).includes('secret-token'), false);
  // Everything else the page receives is unchanged.
  assert.equal(result.id, space.id);
  assert.equal(result.isMember, true);
  assert.equal(result.isOwner, false);
  assert.equal(result.canManage, false);
  assert.deepEqual(Array.from(result.members, row => row.id), ['m-inviter', 'm-member']);
});
