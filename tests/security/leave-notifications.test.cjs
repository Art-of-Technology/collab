const { assert, test, load, matches } = require('./helpers.cjs');

function matchesMember(row, { OR, role, ...fields }) {
  const roleMatches = role?.mode === 'insensitive'
    ? row.role.toLowerCase() === role.equals.toLowerCase()
    : matches(row, { role });
  return roleMatches && matches(row, fields) && (!OR || OR.some(clause => matchesMember(row, clause)));
}

test('a new request is announced to every active member whose role holds MANAGE_LEAVE, every Owner and the primary owner, once each, and to nobody else', async () => {
  const workspaces = [{ id: 'w1', ownerId: 'primary' }, { id: 'w2', ownerId: 'primary2' }, { id: 'w3', ownerId: 'primary3' }];
  const grants = [
    { workspaceId: 'w1', role: 'ADMIN', permission: 'MANAGE_LEAVE' },
    { workspaceId: 'w1', role: 'HR', permission: 'MANAGE_LEAVE' },
    { workspaceId: 'w1', role: 'TEAM_LEAD', permission: 'MANAGE_LEAVE' },
    { workspaceId: 'w1', role: 'PROJECT_MANAGER', permission: 'VIEW_TASKS' },
    { workspaceId: 'w1', role: 'OWNER', permission: 'VIEW_TASKS' },
    // Another workspace's rows never reach w1.
    { workspaceId: 'w2', role: 'MEMBER', permission: 'MANAGE_LEAVE' },
    { workspaceId: 'w2', role: 'PROJECT_MANAGER', permission: 'MANAGE_LEAVE' },
  ];
  const members = [
    { workspaceId: 'w1', userId: 'admin', role: 'ADMIN', status: true },
    { workspaceId: 'w1', userId: 'hr', role: 'HR', status: true },
    { workspaceId: 'w1', userId: 'lead', role: 'TEAM_LEAD', status: true },
    { workspaceId: 'w1', userId: 'pm', role: 'PROJECT_MANAGER', status: true },
    { workspaceId: 'w1', userId: 'member', role: 'MEMBER', status: true },
    { workspaceId: 'w1', userId: 'owner', role: 'OWNER', status: true },
    { workspaceId: 'w1', userId: 'lower-owner', role: 'owner', status: true },
    { workspaceId: 'w1', userId: 'lower-lead', role: 'team_lead', status: true },
    { workspaceId: 'w1', userId: 'off', role: 'ADMIN', status: false },
    { workspaceId: 'w1', userId: 'off-owner', role: 'Owner', status: false },
    { workspaceId: 'w2', userId: 'elsewhere', role: 'MEMBER', status: true },
    { workspaceId: 'w2', userId: 'primary2', role: 'ADMIN', status: true },
    { workspaceId: 'w3', userId: 'admin3', role: 'ADMIN', status: true },
    { workspaceId: 'w3', userId: 'hr3', role: 'HR', status: true },
  ];
  let queries = 0;
  let transactions = 0;
  let memberRows = 0;
  const tx = {
    rolePermission: { findMany: async ({ where }) => { queries++; return grants.filter(row => matches(row, where)); } },
    workspaceMember: { findMany: async ({ where }) => {
      queries++;
      const rows = members.filter(row => matchesMember(row, where));
      memberRows += rows.length;
      return rows;
    } },
    workspace: { findUnique: async ({ where }) => { queries++; return workspaces.find(row => row.id === where.id) ?? null; } },
    user: { findMany: async () => { throw new Error('A platform admin is not looked up'); } },
  };
  const db = { async $transaction(read, options) {
    assert.equal(options?.isolationLevel, 'RepeatableRead');
    transactions++;
    return read(tx);
  } };
  const { NotificationService } = load('src/lib/notification-service.ts', {
    '@/lib/prisma': { prisma: db }, '@/lib/push-notifications': {}, '@/lib/permissions': load('src/lib/permission-types.ts'),
    'date-fns': {}, '@/lib/logger': { logger: {} }, '@/lib/html-sanitizer': {},
  });
  const told = async (workspaceId, expectedMemberRows) => {
    queries = 0;
    transactions = 0;
    memberRows = 0;
    const ids = await NotificationService.findManagersInWorkspace(workspaceId);
    assert.equal(transactions, 1, 'all three reads share a snapshot');
    assert.equal(queries, 3, 'three reads per workspace');
    assert.equal(memberRows, expectedMemberRows, 'only candidate memberships are fetched');
    assert.equal(new Set(ids).size, ids.length, 'each person once');
    return [...ids].sort();
  };

  // Admin, HR and a custom role with the row; both Owners without one; the primary owner without a membership.
  // Not: a Project Manager or Member without the row, a switched-off Admin, anyone from w2.
  assert.deepEqual(await told('w1', 5), ['admin', 'hr', 'lead', 'lower-owner', 'owner', 'primary']);
  // The primary owner who is also a member whose role has the row is told once.
  grants.push({ workspaceId: 'w2', role: 'ADMIN', permission: 'MANAGE_LEAVE' });
  assert.deepEqual(await told('w2', 2), ['elsewhere', 'primary2']);
  // An Admin whose role has no MANAGE_LEAVE row in this workspace is not told.
  assert.deepEqual(await told('w3', 0), ['primary3']);
});
