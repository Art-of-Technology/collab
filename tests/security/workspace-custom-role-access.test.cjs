const { assert, test, load, matches } = require('./helpers.cjs');
const clone = value => JSON.parse(JSON.stringify(value));
const root = 'src/app/api/workspaces/[workspaceId]/';

function fixture() {
  const state = { active: true, manage: true, mapping: true, legacy: 0, failPermissions: false, writes: [],
    roles: [{ id: 'custom', workspaceId: 'workspace', name: 'Support' }, { id: 'foreign', workspaceId: 'foreign', name: 'Support' }],
    permissions: [{ workspaceId: 'workspace', role: 'Support', permission: 'VIEW_POSTS' }, { workspaceId: 'foreign', role: 'Support', permission: 'VIEW_POSTS' }],
    members: [{ id: 'member', userId: 'target', workspaceId: 'workspace', role: 'Support', status: true }, { id: 'foreign', userId: 'foreign', workspaceId: 'foreign', role: 'Support', status: true }] };
  const actor = { id: 'actor', email: 'actor@weezboo.com', role: 'DEVELOPER', ownedWorkspaces: [], get workspaceMemberships() { return state.active ? [{ role: 'HR' }] : []; } };
  function match(row, where) {
    if (where.name?.equals !== undefined) { const { name, ...rest } = where; return row.name.toLowerCase() === name.equals.toLowerCase() && matches(row, rest); }
    return matches(row, where);
  }
  const update = (table, where, data) => { state.writes.push([table, clone(where), clone(data)]); const rows = state[table].filter(row => match(row, where)); for (const row of rows) Object.assign(row, clone(data)); return { count: rows.length }; };
  const prisma = {
    account: { findUnique: async () => state.mapping ? { user: { ...actor, accounts: [{ id: 'mapping' }] } } : null },
    user: { findUnique: async ({ where }) => where.id === actor.id ? { ...actor } : null },
    customRole: {
      findFirst: async ({ where }) => clone(state.roles.find(row => match(row, where)) || null),
      findMany: async ({ where }) => state.roles.filter(row => match(row, where)),
      create: async ({ data }) => { state.writes.push(['role-create']); const row = { id: 'new', ...clone(data) }; state.roles.push(row); return row; },
      update: async ({ where, data }) => { update('roles', where, data); return state.roles.find(row => match(row, where)); },
      delete: async ({ where }) => { state.writes.push(['role-delete']); state.roles = state.roles.filter(row => !match(row, where)); },
    },
    rolePermission: {
      findUnique: async () => state.manage ? { permission: 'MANAGE_WORKSPACE_PERMISSIONS' } : null,
      findMany: async ({ where }) => state.permissions.filter(row => match(row, where)),
      count: async ({ where }) => state.permissions.filter(row => match(row, where)).length,
      createMany: async ({ data }) => { state.writes.push(['permissions-create']); if (state.failPermissions) throw new Error('synthetic permission insert failure'); state.permissions.push(...clone(data)); return { count: data.length }; },
      deleteMany: async ({ where }) => { state.writes.push(['permissions-delete']); state.permissions = state.permissions.filter(row => !match(row, where)); },
      updateMany: async ({ where, data }) => update('permissions', where, data),
    },
    workspaceMember: {
      findUnique: async ({ where }) => where.userId_workspaceId ? (state.active ? { userId: 'actor', role: 'HR' } : null) : state.members.find(row => match(row, where)) || null,
      count: async ({ where }) => state.members.filter(row => match(row, where)).length,
      updateMany: async ({ where, data }) => update('members', where, data),
      update: async ({ where, data }) => { update('members', where, data); return state.members.find(row => match(row, where)); },
    },
    $transaction: async callback => { const saved = clone({ roles: state.roles, permissions: state.permissions, members: state.members }); try { return await callback(prisma); } catch (error) { Object.assign(state, saved); throw error; } },
  };
  const options = {}, env = { env: { COLLAB_AUTH_MODE: 'nextauth', COLLAB_GATEWAY_ISSUER: 'https://identity.example.test' } };
  const nextAuth = { getServerSession: async value => { assert.equal(value, options); state.legacy++; return { user: { id: 'actor', email: 'stale@weezboo.com' } }; } };
  const globals = { process: env, Buffer, TextDecoder, URL, console: { error() {} } };
  const adapter = load('src/lib/request-session.ts', { 'server-only': {}, './gateway-identity': load('src/lib/gateway-identity.ts', { 'node:crypto': require('node:crypto') }, globals), 'next-auth': nextAuth,
    'next/headers': { headers: () => new Headers({ 'x-collab-issuer': Buffer.from(env.env.COLLAB_GATEWAY_ISSUER).toString('base64url'), 'x-collab-subject': Buffer.from('role-actor').toString('base64url'), 'x-collab-email': Buffer.from(actor.email).toString('base64url'), 'x-collab-email-verified': 'true' }) }, '@/lib/prisma': { prisma },
  }, globals);
  const permissions = load('src/lib/permissions.ts', { './prisma': { prisma } }, globals);
  const defaults = load('src/lib/role-permission-defaults.ts', { '@/lib/prisma': { prisma } }, globals);
  const deps = { '@/lib/prisma': { prisma }, '@/lib/request-session': adapter, 'next-auth': nextAuth, '@/lib/auth-options': { authOptions: options }, 'next/server': { NextResponse: Response }, '@/lib/permissions': permissions, '@/lib/role-permission-defaults': defaults };
  const handlers = { list: load(root + 'custom-roles/route.ts', deps, globals), detail: load(root + 'custom-roles/[roleId]/route.ts', deps, globals), member: load(root + 'members/[memberId]/role/route.ts', deps, globals) };
  return { state, env, invoke: (route, method, body, params = {}) => handlers[route][method](new Request('https://example.test/', { method, ...(body ? { body: JSON.stringify(body) } : {}) }), { params: Promise.resolve({ workspaceId: 'workspace', roleId: 'custom', memberId: 'member', ...params }) }) };
}

test('create rejects builtin aliases, prototype names and non-scalar names without writes', async () => {
  for (const name of ['ADMIN', 'owner', ' MEMBER ', '__proto__', 'constructor', '', ' ', { equals: 'Support' }]) { const f = fixture(); assert.equal((await f.invoke('list', 'POST', { name, permissions: [] })).status, 400); assert.deepEqual(f.state.writes, []); }
});
test('update rejects builtin rename and invalid permission payloads without writes', async () => {
  for (const body of [{ name: 'OWNER' }, { name: { set: 'ADMIN' } }, { permissions: ['UNKNOWN'] }, { permissions: 'VIEW_POSTS' }, { permissions: [{}] }]) { const f = fixture(); assert.equal((await f.invoke('detail', 'PUT', body)).status, 400); assert.deepEqual(f.state.writes, []); }
});
test('create rejects unknown permissions before partial role creation', async () => {
  const f = fixture(); assert.equal((await f.invoke('list', 'POST', { name: 'New', permissions: ['UNKNOWN'] })).status, 400); assert.deepEqual(f.state.writes, []);
});
test('create rolls back role if permission insertion fails', async () => {
  const f = fixture(); const saved = clone(f.state.roles); f.state.failPermissions = true; assert.equal((await f.invoke('list', 'POST', { name: 'New', permissions: ['VIEW_POSTS'] })).status, 500); assert.deepEqual(f.state.roles, saved);
});
test('rename without permission payload moves permissions and members only in selected workspace', async () => {
  const f = fixture(); assert.equal((await f.invoke('detail', 'PUT', { name: 'Helpers' })).status, 200);
  assert.deepEqual(f.state.permissions.map(x => [x.workspaceId, x.role]), [['workspace', 'Helpers'], ['foreign', 'Support']]);
  assert.deepEqual(f.state.members.map(x => [x.workspaceId, x.role]), [['workspace', 'Helpers'], ['foreign', 'Support']]);
});
test('member role rejects operator objects before writes', async () => {
  for (const role of [{ not: 'OWNER' }, { equals: 'Support' }, '', ' ', '__proto__']) { const f = fixture(); assert.equal((await f.invoke('member', 'PUT', { role })).status, 400); assert.deepEqual(f.state.writes, []); }
});
test('legacy builtin-name collisions cannot mutate builtin grants via update or delete', async () => {
  for (const method of ['PUT', 'DELETE']) { const f = fixture(); f.state.roles[0].name = 'ADMIN'; f.state.members = []; assert.equal((await f.invoke('detail', method, method === 'PUT' ? { permissions: [] } : undefined)).status, 409); assert.deepEqual(f.state.writes, []); }
});
test('legitimate create, permission replacement and deletion preserve selected scope', async () => {
  const f = fixture(); assert.equal((await f.invoke('list', 'POST', { name: 'New', permissions: ['VIEW_POSTS'] })).status, 200);
  assert.equal((await f.invoke('detail', 'PUT', { name: 'Helpers', permissions: ['VIEW_TASKS'] })).status, 200);
  assert.deepEqual(f.state.permissions.filter(x => x.role === 'Helpers').map(x => x.permission), ['VIEW_TASKS']);
  assert.equal((await f.invoke('detail', 'DELETE')).status, 400); f.state.members = f.state.members.filter(x => x.workspaceId !== 'workspace'); assert.equal((await f.invoke('detail', 'DELETE')).status, 200);
  assert.equal(f.state.roles.find(x => x.id === 'foreign').name, 'Support'); assert.equal(f.state.permissions.filter(x => x.workspaceId === 'foreign').length, 1);
});
test('rename with permissions rolls back all state on insertion error', async () => {
  const f = fixture(); const saved = clone([f.state.roles, f.state.permissions, f.state.members]); f.state.failPermissions = true; assert.equal((await f.invoke('detail', 'PUT', { name: 'Helpers', permissions: ['VIEW_TASKS'] })).status, 500); assert.deepEqual([f.state.roles, f.state.permissions, f.state.members], saved);
});
test('active read, revoked caller and foreign ID controls remain', async () => {
  const f = fixture(); assert.equal((await f.invoke('list', 'GET')).status, 200); assert.equal((await f.invoke('detail', 'GET')).status, 200);
  for (const method of ['GET', 'PUT', 'DELETE']) assert.equal((await f.invoke('detail', method, method === 'PUT' ? { name: 'New' } : undefined, { roleId: 'foreign' })).status, 404);
  assert.equal((await f.invoke('member', 'PUT', { role: 'Support' }, { memberId: 'foreign' })).status, 404);
  f.state.active = false; assert.equal((await f.invoke('list', 'GET')).status, 403); assert.equal((await f.invoke('detail', 'GET')).status, 403); assert.equal((await f.invoke('detail', 'PUT', { name: 'New' })).status, 403); assert.deepEqual(f.state.writes, []);
});
test('member self-downgrade denied; legitimate current member role update succeeds', async () => {
  const f = fixture(); f.state.members[0].userId = 'actor'; assert.equal((await f.invoke('member', 'PUT', { role: 'Support' })).status, 400); assert.deepEqual(f.state.writes, []);
  f.state.members[0].userId = 'target'; assert.equal((await f.invoke('member', 'PUT', { role: 'Support' })).status, 200);
});
for (const [route, method, body] of [['list', 'GET'], ['list', 'POST', { name: 'New', permissions: [] }], ['detail', 'GET'], ['detail', 'PUT', { description: 'Updated' }], ['detail', 'DELETE'], ['member', 'PUT', { role: 'Support' }]]) {
  test(`${route} ${method} uses gateway mapping without legacy fallback and denies revoked mapping`, async () => {
    const f = fixture(); f.env.env.COLLAB_AUTH_MODE = 'gateway'; if (method === 'DELETE') f.state.members = [];
    assert.equal((await f.invoke(route, method, body)).status, 200); assert.equal(f.state.legacy, 0);
    f.state.mapping = false; f.state.writes = []; assert.equal((await f.invoke(route, method, body)).status, 401); assert.equal(f.state.legacy, 0); assert.deepEqual(f.state.writes, []);
  });
}
