const { assert, test, resolve, load, matches, prisma, userHasWorkspaceAccess } = require('./helpers.cjs');


test('leave policy permissions enforce active membership across reads and mutations', async (t) => {
  const basic = { id: 'policy', name: 'Annual leave', group: 'Time off', isPaid: true, trackIn: 'DAYS' };
  const policy = { ...basic, workspaceId: 'workspace', isHidden: false,
    exportMode: 'EXPORT_WITH_CODE', exportCode: 'PAYROLL', accrualType: 'FIXED', deductsLeave: true,
    maxBalance: 30, rolloverType: 'PARTIAL_BALANCE', rolloverAmount: 5, rolloverDate: '2027-01-01T00:00:00Z',
    allowOutsideLeaveYearRequest: false, useAverageWorkingHours: false,
    createdAt: '2026-09-24T00:00:00Z', updatedAt: '2026-09-24T00:00:00Z' };
  const workspace = { id: 'workspace', ownerId: 'owner' };
  const memberships = [
    { userId: 'ordinary', workspaceId: 'workspace', role: 'MEMBER', status: true },
    { userId: 'manager', workspaceId: 'workspace', role: 'HR', status: true },
    { userId: 'revoked', workspaceId: 'workspace', role: 'HR', status: false },
    { userId: 'foreign', workspaceId: 'other', role: 'HR', status: true },
    { userId: 'revoked-admin', workspaceId: 'workspace', role: 'HR', status: false },
  ];
  const users = ['owner', 'ordinary', 'manager', 'revoked', 'foreign'].map(id => ({ id, email: `${id}@example.test`, role: 'DEVELOPER' }));
  users.push(...['admin', 'revoked-admin'].map(id => ({ id, email: `${id}@example.test`, role: 'SYSTEM_ADMIN' })));
  const grants = [{ workspaceId: 'workspace', role: 'HR', permission: 'MANAGE_LEAVE' }];
  const writes = [];
  let policyExists = true;
  const requests = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'].map(status => ({ status }));
  let currentUser = null;
  let reads = 0;
  function readWorkspace({ where, include }) {
    if (!matches(workspace, where)) return null;
    return { ...workspace, members: memberships.filter(member =>
      member.workspaceId === workspace.id && matches(member, include.members.where)) };
  }
  function readPolicy({ select, include }) {
    const result = select
      ? Object.fromEntries(Object.entries(policy).filter(([key]) => select[key] === true)) : { ...policy };
    if (include?.workspace) {
      result.workspace = readWorkspace({ where: { id: policy.workspaceId }, include: include.workspace.include });
    }
    const count = select?._count ?? include?._count;
    if (count) result._count = { leaveRequests: requests.filter(row => matches(row, count.select.leaveRequests.where)).length,
      ...(count.select.leaveBalances ? { leaveBalances: 0 } : {}) };
    return result;
  }
  const db = {
    user: { findUnique: async ({ where, include }) => {
      reads++;
      const user = users.find(row => matches(row, where));
      if (!user) return null;
      if (!include) return user;
      return { ...user,
        workspaceMemberships: memberships.filter(row => row.userId === user.id && matches(row, include.workspaceMemberships.where)),
        ownedWorkspaces: workspace.ownerId === user.id && matches(workspace, include.ownedWorkspaces.where) ? [workspace] : [],
      };
    } },
    workspace: { findUnique: async args => readWorkspace(args) },
    rolePermission: {
      findUnique: async ({ where: { workspaceId_role_permission: where } }) => grants.find(row => matches(row, where)) ?? null,
      findMany: async ({ where }) => grants.filter(row => matches(row, where)),
    },
    leavePolicy: {
      findUnique: async args => policyExists && matches(policy, args.where) ? readPolicy(args) : null,
      update: async args => {
        assert.ok(policyExists && matches(policy, args.where));
        writes.push('update');
        Object.assign(policy, args.data);
        return readPolicy(args);
      },
      delete: async ({ where }) => {
        assert.ok(policyExists && matches(policy, where));
        writes.push('delete');
        policyExists = false;
        return policy;
      },
      findMany: async args => matches(policy, args.where) ? [readPolicy(args)] : [],
    },
  };
  const permissions = load('src/lib/permissions.ts', { './prisma': { prisma: db } });
  const dependencies = {
    'next/server': { NextResponse: Response }, 'next-auth': { getServerSession: async () =>
      currentUser ? { user: { id: currentUser, email: `${currentUser}@example.test` } } : null },
    '@/lib/auth-options': { authOptions: {} }, '@/lib/prisma': { prisma: db }, '@/lib/permissions': permissions, zod: require('zod'),
    '@/lib/issue-finder': { userHasWorkspaceAccess: async (userId, workspaceId) => workspace.id === workspaceId &&
      (workspace.ownerId === userId || memberships.some(row => row.workspaceId === workspaceId && row.userId === userId && row.status)) },
  };
  const list = load('src/app/api/leave/policies/route.ts', dependencies, { URL });
  const detail = load('src/app/api/leave/policies/[policyId]/route.ts', dependencies);
  for (const [name, get] of [
    ['list', () => list.GET(new Request('https://example.test/api/leave/policies?workspaceId=workspace'))],
    ['detail', () => detail.GET(new Request('https://example.test/api/leave/policies/policy'), { params: Promise.resolve({ policyId: 'policy' }) })],
  ]) {
    for (const [userId, status] of [[null, 401], ['foreign', 403], ['revoked', 403], ['ordinary', 200], ['manager', 200], ['owner', 200]]) {
      await t.test(`${name}/${userId ?? 'anonymous'}`, async () => {
        currentUser = userId;
        reads = 0;
        const response = await get();
        assert.equal(response.status, status);
        const body = await response.json();
        if (status !== 200) {
          assert.deepEqual(Object.keys(body), ['error']);
          if (!userId) assert.equal(reads, 0);
          return;
        }
        const result = name === 'list' ? body[0] : body;
        if (name === 'list') assert.equal(body.length, 1);
        if (userId === 'ordinary') {
          assert.deepEqual(result, basic);
        } else {
          const { workspaceId, ...management } = policy;
          assert.deepEqual(result, { ...management, ...(name === 'detail' ? { workspaceId } : {}), _count: { leaveRequests: 2 } });
        }
      });
    }
  }
  const permissionRoute = load('src/app/api/workspaces/[workspaceId]/permissions/route.ts', dependencies, { URL });
  for (const [userId, allowed, role] of [
    ['ordinary', false, 'MEMBER'], ['revoked', false, null], ['foreign', false, null],
    ['manager', true, 'HR'], ['owner', true, 'OWNER'], ['admin', true, null], ['revoked-admin', true, null],
    ['missing', false, null],
  ]) {
    await t.test(`permission helpers/${userId}`, async () => {
      const permission = permissions.Permission.MANAGE_LEAVE;
      assert.equal((await permissions.checkUserPermission(userId, 'workspace', permission)).hasPermission, allowed);
      assert.equal((await permissions.checkUserPermissions(userId, 'workspace', [permission]))[permission].hasPermission, allowed);
      assert.equal(await permissions.requirePermission(permission)(userId, 'workspace'), allowed);
      assert.equal(await permissions.requireAnyPermission([permission])(userId, 'workspace'), allowed);
      assert.equal(await permissions.requireAllPermissions([permission])(userId, 'workspace'), allowed);
      const all = await permissions.getUserPermissions(userId, 'workspace');
      assert.equal(all.includes(permission), allowed);
      if (!allowed) assert.equal(all.length, 0);
      if (['owner', 'admin', 'revoked-admin'].includes(userId)) {
        assert.deepEqual([...all].sort(), Object.values(permissions.Permission).sort());
      }
      assert.equal(await permissions.getUserWorkspaceRole(userId, 'workspace'), role);
    });
    await t.test(`permission endpoint/${userId}`, async () => {
      currentUser = userId;
      const response = await permissionRoute.GET(new Request(`https://example.test/api/workspaces/workspace/permissions?userId=${userId}`),
        { params: Promise.resolve({ workspaceId: 'workspace' }) });
      assert.equal(response.status, role ? 200 : 404);
      const body = await response.json();
      if (role) {
        assert.equal(body.role, role);
        assert.equal(body.permissions.includes('MANAGE_LEAVE'), allowed);
      } else {
        assert.deepEqual(Object.keys(body), ['error']);
      }
    });
  }
  requests.length = 0;
  for (const method of ['PUT', 'DELETE']) {
    for (const [userId, status] of [[null, 401], ['foreign', 403], ['revoked', 403], ['ordinary', 403],
      ['manager', 200], ['owner', 200], ['admin', 200], ['revoked-admin', 200]]) {
      await t.test(`${method}/${userId ?? 'anonymous'}`, async () => {
        currentUser = userId;
        policy.maxBalance = 30;
        policyExists = true;
        writes.length = 0;
        const response = await detail[method](new Request('https://example.test/api/leave/policies/policy', {
          method, ...(method === 'PUT' ? { body: JSON.stringify({ maxBalance: 999 }) } : {}),
        }), { params: Promise.resolve({ policyId: 'policy' }) });
        assert.equal(response.status, status);
        const body = await response.json();
        if (status !== 200) {
          assert.deepEqual(writes, []);
          assert.equal(policy.maxBalance, 30);
          assert.equal(policyExists, true);
          assert.deepEqual(Object.keys(body), ['error']);
        } else if (method === 'PUT') {
          assert.deepEqual(writes, ['update']);
          assert.equal(policy.maxBalance, 999);
          assert.equal(body.maxBalance, 999);
          assert.equal(body.exportCode, 'PAYROLL');
          assert.equal(body._count.leaveRequests, 0);
        } else {
          assert.deepEqual(writes, ['delete']);
          assert.equal(policyExists, false);
          assert.deepEqual(body, { message: 'Policy deleted successfully' });
        }
      });
    }
  }

});
