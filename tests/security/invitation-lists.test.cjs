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
