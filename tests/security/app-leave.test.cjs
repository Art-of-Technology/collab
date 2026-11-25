// /api/apps/auth/leave/requests: a token sees and decides other people's leave requests only with MANAGE_LEAVE, as in the app.
const { assert, test, load, matches } = require('./helpers.cjs');

function fixture({ rows = ['ADMIN', 'HR'] } = {}) {
  const state = { actor: null, writes: [], checks: 0 };
  const users = { primary: 'DEVELOPER', owner: 'DEVELOPER', admin: 'DEVELOPER', hr: 'DEVELOPER', member: 'DEVELOPER',
    root: 'SYSTEM_ADMIN', off: 'DEVELOPER', seat: 'DEVELOPER' };
  const workspace = { id: 'w', slug: 'w', name: 'Workspace', ownerId: 'primary', members: [['owner', 'OWNER', true], ['admin', 'ADMIN', true],
    ['hr', 'HR', true], ['member', 'DEVELOPER', true], ['root', 'DEVELOPER', true], ['off', 'ADMIN', false], ['seat', 'DEVELOPER', true]]
    .map(([userId, role, status]) => ({ userId, workspaceId: 'w', role, status })) };
  const policy = { id: 'p', name: 'Holiday', group: null, isPaid: true, trackIn: 'DAYS', workspaceId: 'w' };
  const requests = [['r-member', 'member', 'PENDING'], ['r-member-2', 'member', 'PENDING'], ['r-canceled', 'member', 'CANCELED'],
    ['r-admin', 'admin', 'PENDING'], ['r-seat', 'seat', 'PENDING']]
    .map(([id, userId, status]) => ({ id, userId, status, policyId: 'p', policy, user: { id: userId, name: userId, email: null, image: null },
      startDate: new Date(0), endDate: new Date(1), duration: 'FULL_DAY', notes: 'Away', createdAt: new Date(0), updatedAt: new Date(0) }));
  const db = {
    appToken: { findMany: async () => [{ accessToken: 'Y2lwaGVy', userId: state.actor, scopes: ['leave:read', 'leave:write'], tokenExpiresAt: null,
      installation: { id: 'install', appId: 'app', workspaceId: 'w', installedById: workspace.ownerId, scopes: ['leave:read', 'leave:write'], status: 'ACTIVE',
        workspace: { id: 'w', slug: 'w', name: 'Workspace' },
        app: { id: 'app', slug: 'app', name: 'App', status: 'PUBLISHED', scopes: [{ scope: 'leave:read' }, { scope: 'leave:write' }] } } }] },
    user: { findUnique: async ({ where, include }) => {
      if (!(where.id in users)) return null;
      if (!include) return { id: where.id, email: null, name: where.id };
      // The permission check asks for the user's role, active memberships and owned workspace.
      state.checks++;
      return { id: where.id, role: users[where.id],
        workspaceMemberships: workspace.members.filter(m => m.userId === where.id && matches(m, include.workspaceMemberships.where)).map(m => ({ role: m.role })),
        ownedWorkspaces: workspace.ownerId === where.id && include.ownedWorkspaces.where.id === 'w' ? [{ id: 'w' }] : [] };
    } },
    rolePermission: { findUnique: async ({ where: { workspaceId_role_permission: key } }) =>
      key.workspaceId === 'w' && key.permission === 'MANAGE_LEAVE' && rows.includes(key.role) ? { id: `row-${key.role}` } : null },
    workspace: { findFirst: async ({ where }) => matches(workspace, where) ? { id: workspace.id } : null },
    workspaceMember: { findUnique: async ({ where }) => workspace.members.find(m => m.userId === where.userId_workspaceId.userId) ?? null },
    agentSeat: { findUnique: async ({ where }) => where.userId === 'seat' ? { id: 'seat-row' } : null },
    leaveRequest: {
      findMany: async ({ where, skip, take }) => requests.filter(r => matches(r, where)).slice(skip, skip + take),
      count: async ({ where }) => requests.filter(r => matches(r, where)).length,
      findFirst: async ({ where }) => requests.find(r => matches(r, where)) ?? null,
      update: async ({ where, data }) => {
        const request = requests.find(r => r.id === where.id);
        Object.assign(request, data);
        state.writes.push({ id: where.id, data: { ...data } });
        return request;
      },
    },
  };
  const deps = { '@/lib/prisma': { prisma: db }, 'next/server': { NextResponse: Response }, zod: require('zod'),
    '@/lib/apps/crypto': { getEncryptionKey: () => 'fixture-key', decryptToken: async () => 'token' }, '@/lib/oauth-scopes': load('src/lib/oauth-scopes.ts') };
  const globals = { URL, Buffer, console, Error };
  deps['@/lib/permissions'] = load('src/lib/permissions.ts', { './prisma': { prisma: db } }, globals);
  deps['@/lib/apps/auth-middleware'] = load('src/lib/apps/auth-middleware.ts', deps, globals);
  const list = load('src/app/api/apps/auth/leave/requests/route.ts', deps, globals);
  const detail = load('src/app/api/apps/auth/leave/requests/[requestId]/route.ts', deps, globals);
  const send = async (actor, run) => {
    state.actor = actor; state.checks = 0;
    const response = await run();
    assert.ok(state.checks <= 1, `${actor}: the permission is asked at most once`);
    return { status: response.status, body: await response.json() };
  };
  const headers = { Authorization: 'Bearer token' };
  const call = {
    list: (actor, query = '') => send(actor, () => list.GET(new Request(`https://example.test/?${query}`, { headers }))),
    read: (actor, id) => send(actor, () => detail.GET(new Request('https://example.test', { headers }), { params: Promise.resolve({ requestId: id }) })),
    patch: (actor, id, body) => send(actor, () => detail.PATCH(new Request('https://example.test', { method: 'PATCH', headers, body: JSON.stringify(body) }),
      { params: Promise.resolve({ requestId: id }) })),
  };
  return { state, call };
}

const ids = body => body.leaveRequests.map(r => r.id).sort();

test("a token of someone who holds MANAGE_LEAVE lists, reads, approves and rejects other people's requests; a token without it sees and changes only its own", async t => {
  // An Owner, the primary owner (no membership row), an Admin and HR whose roles hold the row, and a platform admin, as in the app.
  for (const actor of ['owner', 'primary', 'admin', 'hr', 'root']) await t.test(`${actor} holds MANAGE_LEAVE`, async () => {
    const { state, call } = fixture();
    const all = await call.list(actor);
    assert.equal(all.status, 200, JSON.stringify(all.body));
    assert.deepEqual(ids(all.body), ['r-admin', 'r-canceled', 'r-member', 'r-member-2', 'r-seat']);
    const theirs = await call.list(actor, 'userId=member');
    assert.equal(theirs.status, 200);
    assert.deepEqual(ids(theirs.body), ['r-canceled', 'r-member', 'r-member-2']);
    const read = await call.read(actor, 'r-member');
    assert.equal(read.status, 200); assert.equal(read.body.id, 'r-member');
    assert.equal((await call.patch(actor, 'r-member', { status: 'APPROVED' })).status, 200);
    assert.equal((await call.patch(actor, 'r-member-2', { status: 'REJECTED' })).status, 200);
    assert.deepEqual(state.writes, [{ id: 'r-member', data: { status: 'APPROVED' } }, { id: 'r-member-2', data: { status: 'REJECTED' } }]);
    // The other checks keep their order and answers.
    const canceled = await call.patch(actor, 'r-canceled', { status: 'APPROVED' });
    assert.equal(canceled.status, 400); assert.equal(canceled.body.error, 'invalid_status_change');
    assert.equal((await call.read(actor, 'r-member')).body.status, 'APPROVED');
    const notes = await call.patch(actor, 'r-member', { notes: 'Not mine' });
    assert.equal(notes.status, 403); assert.equal(notes.body.error, 'insufficient_permissions');
    assert.equal(state.writes.length, 2);
  });

  // A standard member, and an Admin whose role has no MANAGE_LEAVE row: one permission decides, not the level.
  for (const [label, actor, rows, own, other] of [
    ['a standard member', 'member', undefined, ['r-canceled', 'r-member', 'r-member-2'], 'r-admin'],
    ['an Admin whose role has no MANAGE_LEAVE row', 'admin', ['HR'], ['r-admin'], 'r-member'],
  ]) await t.test(label, async () => {
    const { state, call } = fixture({ rows });
    const all = await call.list(actor);
    assert.equal(all.status, 200); assert.deepEqual(ids(all.body), own);
    const mine = await call.list(actor, `userId=${actor}`);
    assert.equal(mine.status, 200); assert.deepEqual(ids(mine.body), own);
    const theirs = await call.list(actor, `userId=${other === 'r-admin' ? 'admin' : 'member'}`);
    assert.equal(theirs.status, 403); assert.equal(theirs.body.error, 'insufficient_permissions');
    const read = await call.read(actor, other);
    assert.equal(read.status, 403); assert.equal(read.body.error, 'insufficient_permissions');
    assert.equal((await call.read(actor, own.at(-1))).status, 200);
    for (const [id, status] of [[other, 'APPROVED'], [other, 'REJECTED'], [own.at(-1), 'APPROVED']]) {
      const refused = await call.patch(actor, id, { status });
      assert.equal(refused.status, 403, `${id} ${status}`); assert.equal(refused.body.error, 'insufficient_permissions');
    }
    // The permission refusal still comes before the canceled-request check.
    if (actor === 'member') assert.equal((await call.patch(actor, 'r-canceled', { status: 'APPROVED' })).status, 403);
    assert.equal(state.writes.length, 0);
    // Its own pending request's notes it still changes.
    assert.equal((await call.patch(actor, own.at(-1), { notes: 'Changed' })).status, 200);
    assert.deepEqual(state.writes, [{ id: own.at(-1), data: { notes: 'Changed' } }]);
  });

  await t.test("a switched-off member's and an agent seat's token keep today's answers", async () => {
    const { state, call } = fixture();
    for (const run of [() => call.list('off'), () => call.read('off', 'r-member'), () => call.patch('off', 'r-member', { status: 'APPROVED' })]) {
      assert.equal((await run()).status, 403);
    }
    const seat = await call.list('seat');
    assert.equal(seat.status, 200); assert.deepEqual(ids(seat.body), ['r-seat']);
    assert.equal((await call.read('seat', 'r-member')).status, 403);
    const write = await call.patch('seat', 'r-member', { status: 'APPROVED' });
    assert.equal(write.status, 403); assert.equal(write.body.error, 'seat_scope');
    assert.equal(state.writes.length, 0);
  });
});
