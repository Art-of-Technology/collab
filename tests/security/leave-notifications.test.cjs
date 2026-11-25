const { assert, test, load, matches } = require('./helpers.cjs');

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
    { workspaceId: 'w1', userId: 'off', role: 'ADMIN', status: false },
    { workspaceId: 'w2', userId: 'elsewhere', role: 'MEMBER', status: true },
    { workspaceId: 'w2', userId: 'primary2', role: 'ADMIN', status: true },
    { workspaceId: 'w3', userId: 'admin3', role: 'ADMIN', status: true },
  ];
  let queries = 0;
  const db = {
    rolePermission: { findMany: async ({ where }) => { queries++; return grants.filter(row => matches(row, where)); } },
    workspaceMember: { findMany: async ({ where }) => { queries++; return members.filter(row => matches(row, where)); } },
    workspace: { findUnique: async ({ where }) => { queries++; return workspaces.find(row => row.id === where.id) ?? null; } },
    user: { findMany: async () => { throw new Error('A platform admin is not looked up'); } },
  };
  const { NotificationService } = load('src/lib/notification-service.ts', {
    '@/lib/prisma': { prisma: db }, '@/lib/push-notifications': {}, '@/lib/permissions': { WorkspaceRole: {} },
    'date-fns': {}, '@/lib/logger': { logger: {} }, '@/lib/html-sanitizer': {},
  });
  const told = async workspaceId => {
    queries = 0;
    const ids = await NotificationService.findManagersInWorkspace(workspaceId);
    assert.ok(queries <= 3, `a fixed number of queries, got ${queries}`);
    assert.equal(new Set(ids).size, ids.length, 'each person once');
    return [...ids].sort();
  };

  // Admin, HR and a custom role with the row; both Owners without one; the primary owner without a membership.
  // Not: a Project Manager or Member without the row, a switched-off Admin, anyone from w2.
  assert.deepEqual(await told('w1'), ['admin', 'hr', 'lead', 'lower-owner', 'owner', 'primary']);
  // The primary owner who is also a member whose role has the row is told once.
  grants.push({ workspaceId: 'w2', role: 'ADMIN', permission: 'MANAGE_LEAVE' });
  assert.deepEqual(await told('w2'), ['elsewhere', 'primary2']);
  // An Admin whose role has no MANAGE_LEAVE row in this workspace is not told.
  assert.deepEqual(await told('w3'), ['primary3']);
});
