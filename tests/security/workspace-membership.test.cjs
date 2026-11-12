const { assert, test, load, matches } = require('./helpers.cjs');

function fixture() {
  const workspaces = [
    { id: 'w1', slug: 'one', name: 'One', ownerId: 'alice', members: [
      { userId: 'bob', role: 'MEMBER', status: true },
      { userId: 'carol', role: 'ADMIN', status: true },
      { userId: 'agent', role: 'MEMBER', status: true },
    ] },
    { id: 'w2', slug: 'two', name: 'Two', ownerId: 'alice', members: [] },
    { id: 'w3', slug: 'three', name: 'Three', ownerId: 'erin', members: [{ userId: 'frank', role: 'MEMBER', status: true }] },
  ];
  const users = ['alice', 'bob', 'carol', 'erin', 'frank'].map(id => ({ id, name: id, email: `${id}@example.test`, role: 'DEVELOPER' }));
  users.push({ id: 'root', name: 'root', email: 'root@example.test', role: 'SYSTEM_ADMIN' });
  users.push({ id: 'agent', name: 'Claude', email: null, role: 'DEVELOPER' }); // an agent token's service account
  const rolePermissions = [{ workspaceId: 'w1', role: 'ADMIN', permission: 'MANAGE_WORKSPACE_MEMBERS' }];
  const audit = [], reads = [];
  const state = { session: null };
  const workspace = id => workspaces.find(row => row.id === id);
  const member = (workspaceId, userId) => workspace(workspaceId)?.members.find(row => row.userId === userId) ?? null;
  const prisma = {
    workspace: {
      findUnique: async ({ where }) => workspaces.find(row => matches(row, where)) ?? null,
      findFirst: async ({ where }) => workspaces.find(row => matches(row, where)) ?? null,
      findMany: async ({ where = {} } = {}) => { reads.push('workspaces'); return workspaces.filter(row => matches(row, where)); },
    },
    user: {
      findUnique: async ({ where, include }) => {
        const user = users.find(row => row.id === where.id);
        if (!user || !include) return user ?? null;
        const scope = include.workspaceMemberships.where;
        return { ...user,
          workspaceMemberships: (workspace(scope.workspaceId)?.members ?? []).filter(row => row.userId === user.id && row.status === scope.status),
          ownedWorkspaces: workspaces.filter(row => row.id === include.ownedWorkspaces.where.id && row.ownerId === user.id),
        };
      },
    },
    workspaceMember: {
      findUnique: async ({ where }) => member(where.userId_workspaceId.workspaceId, where.userId_workspaceId.userId),
      findMany: async ({ where }) => workspaces
        .flatMap(row => row.members.map(entry => ({ ...entry, workspaceId: row.id })))
        .filter(row => matches(row, where)),
      upsert: async ({ where, update, create }) => {
        const { userId, workspaceId } = where.userId_workspaceId;
        const existing = member(workspaceId, userId);
        if (existing) return Object.assign(existing, update);
        const row = { status: true, ...create };
        delete row.workspaceId;
        workspace(workspaceId).members.push(row);
        return row;
      },
      update: async ({ where, data }) => Object.assign(member(where.userId_workspaceId.workspaceId, where.userId_workspaceId.userId), data),
    },
    rolePermission: { findUnique: async ({ where }) => rolePermissions.find(row => matches(row, where.workspaceId_role_permission)) ?? null },
    appAuditLog: { create: async ({ data }) => { audit.push(data); return data; } },
    // The row lock does nothing here.
    $queryRaw: async () => [],
    $transaction: async run => run(prisma),
  };
  const globals = { console: { log() {}, warn() {}, error() {} }, Date };
  const deps = {
    zod: require('zod'),
    '@/lib/prisma': { prisma },
    '@/lib/post-access': load('src/lib/post-access.ts'),
    'next/server': { NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200, headers: init?.headers ?? {} }) } },
    '@/lib/request-session': { getServerSession: async () => state.session },
    '@/lib/auth-options': { authOptions: {} },
  };
  deps['@/lib/permissions'] = load('src/lib/permissions.ts', { './prisma': { prisma } }, globals);
  deps['@/lib/system-admin'] = load('src/lib/system-admin.ts', deps, globals);
  deps['@/lib/workspace-membership'] = load('src/lib/workspace-membership.ts', deps, globals);
  const route = load('src/app/api/workspaces/[workspaceId]/members/by-user/[userId]/route.ts', deps, globals);
  const as = userId => { state.session = userId ? { user: { id: userId } } : null; };
  const put = (workspaceId, userId, body = { active: true }) => route.PUT({ json: async () => body }, { params: Promise.resolve({ workspaceId, userId }) });
  const writes = () => JSON.stringify([audit.length, workspaces.map(row => row.members)]);

  // The two screens, with the client component replaced so its props can be read.
  const Switches = () => null;
  const pageDeps = {
    ...deps,
    'react/jsx-runtime': require('react/jsx-runtime'),
    'next/navigation': { notFound() { throw new Error('NOT_FOUND'); }, redirect(url) { throw new Error(`REDIRECT ${url}`); } },
    'next/link': { default: 'a' },
    'lucide-react': new Proxy({}, { get: (_, name) => name }),
    '@/components/ui/button': { Button: 'button' },
    '@/components/ui/badge': { Badge: 'span' },
    '@/components/ui/card': Object.fromEntries(['Card', 'CardContent', 'CardDescription', 'CardHeader', 'CardTitle'].map(name => [name, 'div'])),
    '@/components/workspace/UserWorkspaceSwitches': { default: Switches },
  };
  const find = node => !node || typeof node !== 'object' ? null : node.type === Switches ? node
    : [].concat(node.props?.children ?? []).map(find).find(Boolean) ?? null;
  const adminPage = load('src/app/admin/users/[userId]/page.tsx', pageDeps, globals).default;
  const memberPage = load('src/app/(main)/workspaces/[workspaceId]/settings/members/[userId]/page.tsx', pageDeps, globals).default;
  const admin = async userId => find(await adminPage({ params: Promise.resolve({ userId }) }));
  const members = async (workspaceId, userId) => find(await memberPage({ params: Promise.resolve({ workspaceId, userId }) }));
  const states = node => node.props.workspaces.map(row => `${row.id}:${row.state}`).join(' ');
  return { workspaces, users, audit, reads, rolePermissions, as, put, writes, member, workspace, admin, members, states };
}

test('the owner of two workspaces brings a colleague from one into the other without an invitation', async () => {
  const f = fixture();
  f.as('alice');
  const added = await f.put('w2', 'bob');
  assert.equal(added.status, 200);
  assert.equal(JSON.stringify(added.body), JSON.stringify({ active: true, changed: true }));
  assert.equal(JSON.stringify(f.member('w2', 'bob')), JSON.stringify({ status: true, userId: 'bob', role: 'MEMBER' }));
  assert.equal(JSON.stringify(f.audit), JSON.stringify([{ workspaceId: 'w2', actorId: 'alice', action: 'workspace_member.added', details: { userId: 'bob' } }]));

  const before = f.writes();
  const again = await f.put('w2', 'bob');
  assert.equal(JSON.stringify([again.status, again.body]), JSON.stringify([200, { active: true, changed: false }]));
  assert.equal(f.writes(), before, 'adding someone who is already in changes and records nothing');
});

test('adding a person is refused without the permission, for a stranger, for an agent and for bad input, and writes nothing', async () => {
  const f = fixture();
  const before = f.writes();
  for (const [user, workspaceId, userId, status, why] of [
    [null, 'w2', 'bob', 401, 'no session'],
    ['bob', 'w1', 'carol', 403, 'a member who may not manage members'],
    ['erin', 'w1', 'frank', 403, 'the owner of another workspace'],
    ['alice', 'w2', 'frank', 404, 'someone the owner shares no workspace with needs an invitation'],
    ['carol', 'w1', 'frank', 404, 'the same for an admin who holds the permission'],
    ['alice', 'w2', 'nobody', 404, 'an account that does not exist reads the same as a stranger'],
    ['root', 'missing', 'bob', 404, 'a workspace that does not exist'],
    ['alice', 'w2', 'agent', 409, 'an agent is managed on the Agent tokens page'],
    ['root', 'w3', 'agent', 409, 'also for a system admin'],
  ]) {
    f.as(user);
    assert.equal((await f.put(workspaceId, userId)).status, status, why);
  }
  f.as('alice');
  for (const body of [null, {}, { active: 'yes' }, { active: true, role: 'ADMIN' }]) {
    assert.equal((await f.put('w2', 'bob', body)).status, 400, JSON.stringify(body));
  }
  assert.equal(f.writes(), before);
});

test('a system admin puts anyone into any workspace', async () => {
  const f = fixture();
  f.as('root');
  assert.equal((await f.put('w3', 'bob')).status, 200);
  assert.equal(f.member('w3', 'bob').status, true);
  assert.equal(f.audit.at(-1).actorId, 'root');
});

test('sharing a workspace counts for its owner and for active members only', async () => {
  const f = fixture();
  f.as('alice');
  f.workspace('w3').members.push({ userId: 'alice', role: 'MEMBER', status: false });
  assert.equal((await f.put('w2', 'frank')).status, 404, 'a switched-off membership is not sharing');
  f.member('w3', 'alice').status = true;
  assert.equal((await f.put('w2', 'frank')).status, 200, 'a fellow member');
  assert.equal((await f.put('w2', 'erin')).status, 200, 'the owner of a workspace alice is in');
});

test('switching a person off keeps the membership and its role, and switching on again restores it', async () => {
  const f = fixture();
  f.as('alice');
  const off = await f.put('w1', 'carol', { active: false });
  assert.equal(JSON.stringify([off.status, off.body]), JSON.stringify([200, { active: false, changed: true }]));
  assert.equal(JSON.stringify(f.member('w1', 'carol')), JSON.stringify({ userId: 'carol', role: 'ADMIN', status: false }));
  assert.equal(f.audit.at(-1).action, 'workspace_member.switched_off');

  // carol now shares no workspace with alice, but she is not new to this one.
  assert.equal((await f.put('w1', 'carol')).status, 200);
  assert.equal(JSON.stringify(f.member('w1', 'carol')), JSON.stringify({ userId: 'carol', role: 'ADMIN', status: true }));

  const before = f.writes();
  const nothing = await f.put('w2', 'carol', { active: false });
  assert.equal(JSON.stringify([nothing.status, nothing.body]), JSON.stringify([200, { active: false, changed: false }]));
  assert.equal(f.writes(), before, 'there was nothing to switch off');
});

test('a workspace owner cannot be switched off or added as a member', async () => {
  const f = fixture();
  const before = f.writes();
  for (const [user, workspaceId, userId, active] of [['alice', 'w2', 'alice', false], ['root', 'w3', 'erin', false], ['root', 'w3', 'erin', true]]) {
    f.as(user);
    assert.equal((await f.put(workspaceId, userId, { active })).status, 409);
  }
  assert.equal(f.writes(), before);
});

test('the admin user screen is for system admins only and lists every workspace with the person\'s place in it', async () => {
  const f = fixture();
  for (const user of [null, 'alice', 'carol']) {
    f.as(user);
    await assert.rejects(f.admin('bob'), /NOT_FOUND/, String(user));
  }
  assert.deepEqual(f.reads, [], 'nothing was listed for them');

  f.as('root');
  assert.equal(f.states(await f.admin('bob')), 'w1:on w2:off w3:off');
  assert.equal(f.states(await f.admin('alice')), 'w1:owner w2:owner w3:off');
  assert.equal((await f.admin('bob')).props.userId, 'bob');
  f.member('w1', 'bob').status = false;
  assert.equal(f.states(await f.admin('bob')), 'w1:off w2:off w3:off', 'a switched-off membership shows as off');
  assert.equal(await f.admin('agent'), null, 'an agent gets no switches here');
  await assert.rejects(f.admin('nobody'), /NOT_FOUND/);
});

test('the member screen of a workspace offers only the other workspaces the viewer manages members in', async () => {
  const f = fixture();
  f.as(null);
  await assert.rejects(f.members('w1', 'bob'), /REDIRECT \/login/);
  f.as('bob');
  await assert.rejects(f.members('w1', 'carol'), /NOT_FOUND/, 'a member who may not manage members');
  f.as('alice');
  await assert.rejects(f.members('w1', 'frank'), /NOT_FOUND/, 'frank is not in this workspace');
  await assert.rejects(f.members('w1', 'agent'), /NOT_FOUND/, 'an agent is managed on the Agent tokens page');
  await assert.rejects(f.members('missing', 'bob'), /NOT_FOUND/);

  f.workspace('w3').members.push({ userId: 'alice', role: 'MEMBER', status: true }); // a member there, without the permission
  assert.equal(f.states(await f.members('w1', 'bob')), 'w2:off');
  assert.equal(f.states(await f.members('one', 'bob')), 'w2:off', 'the workspace may be named by its slug');
  await f.put('w2', 'bob');
  assert.equal(f.states(await f.members('w1', 'bob')), 'w2:on');
  assert.equal(f.states(await f.members('w2', 'bob')), 'w1:on', 'and from the other side');

  f.as('carol'); // manages members in w1 only
  assert.equal(f.states(await f.members('w1', 'bob')), '');
});
