const { assert, test, load, matches } = require('./helpers.cjs');

test('current user follows the session subject and fails closed without a live subject', async () => {
  const date = new Date('2026-09-24T00:00:00Z');
  const users = [
    { id: 'alice', email: 'alice@example.test', createdAt: date, updatedAt: date, emailVerified: null },
    { id: 'bob', email: 'bob@example.test', createdAt: date, updatedAt: date, emailVerified: date },
  ];
  let session = { user: { id: 'alice', email: 'bob@example.test' } };
  let reads = 0;
  let fail = false;
  const { getCurrentUser } = load('src/lib/session.ts', {
    'next-auth': { getServerSession: async () => session },
    '@/lib/auth-options': { authOptions: {} },
    '@/lib/prisma': { prisma: { user: { findUnique: async ({ where }) => {
      reads++;
      if (fail) throw new Error('database unavailable');
      return users.find(user => matches(user, where)) ?? null;
    } } } },
  }, { console: { error() {} } });
  const user = await getCurrentUser();
  assert.equal(user.id, 'alice');
  assert.equal(user.createdAt, date.toISOString());
  assert.equal(user.emailVerified, null);
  session = { user: { id: 'bob' } };
  assert.equal((await getCurrentUser()).emailVerified, date.toISOString());
  session = { user: { id: 'deleted', email: 'alice@example.test' } };
  assert.equal(await getCurrentUser(), null);
  for (const value of [null, { user: { email: 'alice@example.test' } }]) {
    session = value;
    const before = reads;
    assert.equal(await getCurrentUser(), null);
    assert.equal(reads, before);
  }
  session = { user: { id: 'alice' } };
  fail = true;
  assert.equal(await getCurrentUser(), null);
});

test('workspace helper preserves owners and active members while revocation denies access', async () => {
  const workspace = { id: 'workspace', ownerId: 'owner', members: [{ userId: 'member', status: true }] };
  let reads = 0;
  const { hasWorkspaceAccess } = load('src/lib/workspace-helpers.ts', {
    'next/headers': {}, 'next/navigation': {},
    '@/lib/prisma': { prisma: { workspace: { findFirst: async ({ where }) => {
      reads++;
      return matches(workspace, where) ? workspace : null;
    } } } },
  });
  assert.equal(await hasWorkspaceAccess('owner', 'workspace'), true);
  assert.equal(await hasWorkspaceAccess('member', 'workspace'), true);
  workspace.members[0].status = false;
  assert.equal(await hasWorkspaceAccess('member', 'workspace'), false);
  assert.equal(await hasWorkspaceAccess('foreign', 'workspace'), false);
  assert.equal(await hasWorkspaceAccess('owner', 'missing'), false);
  const before = reads;
  assert.equal(await hasWorkspaceAccess('', 'workspace'), false);
  assert.equal(await hasWorkspaceAccess('owner', ''), false);
  assert.equal(reads, before);
});
