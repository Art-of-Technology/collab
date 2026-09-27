const { assert, test, load, matches } = require('./helpers.cjs');
const clone = value => JSON.parse(JSON.stringify(value));

function fixture() {
  const state = { member: true, owner: false, admin: false, manage: true, targetMember: true, mapping: true, legacy: 0, actorReads: [], writes: [], seeds: 0, transactions: 0, failCreate: false,
    rows: [{ workspaceId: 'workspace', role: 'HR', permission: 'MANAGE_WORKSPACE_PERMISSIONS' }, { workspaceId: 'workspace', role: 'DEVELOPER', permission: 'DELETE_ANY_POST' }, { workspaceId: 'workspace', role: 'VIEWER', permission: 'VIEW_POSTS' }, { workspaceId: 'foreign', role: 'DEVELOPER', permission: 'DELETE_ANY_POST' }] };
  const actor = { id: 'actor', email: 'actor@weezboo.com', get role() { return state.admin ? 'SYSTEM_ADMIN' : 'DEVELOPER'; }, get workspaceMemberships() { return [{ workspaceId: 'workspace', role: 'HR', status: state.member }]; }, get ownedWorkspaces() { return state.owner ? [{ id: 'workspace' }] : []; } };
  const target = { id: 'target', role: 'DEVELOPER', get workspaceMemberships() { return [{ workspaceId: 'workspace', role: 'DEVELOPER', status: state.targetMember }]; }, ownedWorkspaces: [] };
  const pick = (row, args = {}) => {
    if (!row) return null; const result = args.select ? {} : { ...row };
    for (const [key, value] of Object.entries(args.select || args.include || {})) {
      if (value === true) result[key] = row[key];
      else if (Array.isArray(row[key])) result[key] = row[key].filter(item => matches(item, value.where || {})).map(item => pick(item, value));
    }
    return result;
  };
  const prisma = {
    account: { findUnique: async () => state.mapping ? { user: { ...actor, accounts: [{ id: 'mapping' }] } } : null },
    user: { findUnique: async args => { state.actorReads.push(args.where.id); return pick([actor, target].find(row => matches(row, args.where)), args); } },
    rolePermission: {
      findUnique: async args => state.manage ? state.rows.find(row => matches(row, args.where.workspaceId_role_permission)) || null : null,
      findMany: async args => state.rows.filter(row => matches(row, args.where)).map(row => pick(row, args)),
      count: async args => state.rows.filter(row => matches(row, args.where)).length,
      deleteMany: async args => { state.writes.push(['delete', clone(args)]); state.rows = state.rows.filter(row => !matches(row, args.where)); return { count: 1 }; },
      createMany: async args => { state.writes.push(['create', clone(args)]); if (state.failCreate) throw new Error('synthetic create failure'); state.rows.push(...clone(args.data)); return { count: args.data.length }; },
      upsert: async args => { state.writes.push(['upsert', clone(args)]); const row = state.rows.find(row => matches(row, args.where.workspaceId_role_permission)); if (!row) state.rows.push(clone(args.create)); return row || args.create; },
    },
    $transaction: async callback => { state.transactions++; const saved = clone(state.rows); try { return await callback(prisma); } catch (error) { state.rows = saved; throw error; } },
  };
  const options = {}, env = { env: { COLLAB_AUTH_MODE: 'nextauth', COLLAB_GATEWAY_ISSUER: 'https://identity.example.test' } };
  const nextAuth = { getServerSession: async value => { assert.equal(value, options); state.legacy++; return { user: { id: 'actor', email: actor.email } }; } };
  const adapter = load('src/lib/request-session.ts', { 'server-only': {}, './gateway-identity': load('src/lib/gateway-identity.ts', { 'node:crypto': require('node:crypto') }, { process: env, Buffer, TextDecoder, URL }), 'next-auth': nextAuth,
    'next/headers': { headers: () => new Headers({ 'x-collab-issuer': Buffer.from(env.env.COLLAB_GATEWAY_ISSUER).toString('base64url'), 'x-collab-subject': Buffer.from('permissions-actor').toString('base64url'), 'x-collab-email': Buffer.from(actor.email).toString('base64url'), 'x-collab-email-verified': 'true' }) }, '@/lib/prisma': { prisma },
  }, { process: env });
  const globals = { URL, console: { error() {} } };
  const permissions = load('src/lib/permissions.ts', { './prisma': { prisma } }, globals);
  const defaults = load('src/lib/role-permission-defaults.ts', { '@/lib/prisma': { prisma } });
  const handlers = load('src/app/api/workspaces/[workspaceId]/permissions/route.ts', { '@/lib/prisma': { prisma }, '@/lib/request-session': adapter, 'next-auth': nextAuth, '@/lib/auth-options': { authOptions: options }, 'next/server': { NextResponse: Response },
    '@/lib/permissions': permissions, '@/lib/role-permission-defaults': defaults,
    // Never import or execute the real all-workspace operational seed script.
    '@prisma/scripts/seed-default-permissions': { seedDefaultPermissions: async () => { state.seeds++; } },
  }, globals);
  return { state, env, defaults: defaults.defaultRolePermissions, invoke: (method, body, userId) => handlers[method](new Request('https://example.test/' + (userId ? '?userId=' + userId : ''), { method, ...(body ? { body: JSON.stringify(body) } : {}) }), { params: Promise.resolve({ workspaceId: 'workspace' }) }) };
}

test('foreign permission reads require caller management before target lookups', async () => {
  const f = fixture(); f.state.manage = false;
  const denied = await f.invoke('GET', undefined, 'target'); assert.equal(denied.status, 403); assert.equal(denied.headers.get('cache-control'), 'no-store');
  assert.equal(f.state.actorReads.includes('target'), false); assert.deepEqual(f.state.writes, []);
  f.state.manage = true; const response = await f.invoke('GET', undefined, 'target'); assert.equal(response.status, 200); assert.equal((await response.json()).role, 'DEVELOPER');
});

test('self lookup keeps active role/owner controls and revoked404', async () => {
  const f = fixture(); f.state.manage = false; assert.equal((await f.invoke('GET', undefined, 'actor')).status, 200);
  f.state.member = false; assert.equal((await f.invoke('GET', undefined, 'actor')).status, 404);
  f.state.owner = true; assert.equal((await f.invoke('GET', undefined, 'actor')).status, 200);
});

test('reset replaces only selected workspace role with existing application defaults', async () => {
  const f = fixture(); const unaffected = clone(f.state.rows.filter(row => row.workspaceId !== 'workspace' || row.role !== 'DEVELOPER'));
  assert.equal((await f.invoke('POST', { role: 'DEVELOPER' })).status, 200); assert.equal(f.state.seeds, 0); assert.equal(f.state.transactions, 1);
  assert.deepEqual(f.state.rows.filter(row => row.workspaceId !== 'workspace' || row.role !== 'DEVELOPER'), unaffected);
  assert.deepEqual(f.state.rows.filter(row => row.workspaceId === 'workspace' && row.role === 'DEVELOPER').map(row => row.permission).sort(), [...f.defaults.DEVELOPER].sort());
});

test('reset insert failure rolls back the modeled selected role deletion', async () => {
  const f = fixture(); const before = clone(f.state.rows); f.state.failCreate = true;
  assert.equal((await f.invoke('POST', { role: 'DEVELOPER' })).status, 500); assert.equal(f.state.transactions, 1); assert.equal(f.state.seeds, 0); assert.deepEqual(f.state.rows, before);
});

test('reset rejects unknown/prototype/object roles without writes or seed use', async () => {
  for (const role of ['unknown', '__proto__', 'constructor', { not: 'HR' }]) {
    const f = fixture(); assert.equal((await f.invoke('POST', { role })).status, 400); assert.deepEqual(f.state.writes, []); assert.equal(f.state.seeds, 0);
  }
});

test('PUT rejects Prisma operator inputs and invalid permissions before writes', async () => {
  for (const body of [{ role: { equals: 'HR' }, permission: 'MANAGE_WORKSPACE_PERMISSIONS', enabled: false }, { role: 'HR', permission: { not: 'VIEW_POSTS' }, enabled: false }, { role: 'HR', permission: 'UNKNOWN', enabled: true }]) {
    const f = fixture(); assert.equal((await f.invoke('PUT', body)).status, 400); assert.deepEqual(f.state.writes, []);
  }
});

test('both mutation paths preserve own management access while owners/admins may reset', async () => {
  const f = fixture();
  assert.equal((await f.invoke('PUT', { role: 'HR', permission: 'MANAGE_WORKSPACE_PERMISSIONS', enabled: false })).status, 400);
  assert.equal((await f.invoke('POST', { role: 'HR' })).status, 400); assert.deepEqual(f.state.writes, []); assert.equal(f.state.seeds, 0);
  for (const field of ['owner', 'admin']) { const f = fixture(); f.state.member = false; f.state.manage = false; f.state[field] = true; assert.equal((await f.invoke('POST', { role: 'DEVELOPER' })).status, 200); }
});

for (const method of ['GET', 'PUT', 'POST']) {
  test(`${method}: gateway actor and revoked manager denial`, async () => {
    const body = method === 'PUT' ? { role: 'DEVELOPER', permission: 'VIEW_POSTS', enabled: true } : method === 'POST' ? { role: 'DEVELOPER' } : undefined;
    const f = fixture(); f.env.env.COLLAB_AUTH_MODE = 'gateway'; assert.equal((await f.invoke(method, body)).status, 200); assert.equal(f.state.legacy, 0);
    const denied = fixture(); denied.env.env.COLLAB_AUTH_MODE = 'gateway'; denied.state.mapping = false; assert.equal((await denied.invoke(method, body)).status, 401); assert.equal(denied.state.legacy, 0); assert.deepEqual(denied.state.writes, []);
    const revoked = fixture(); revoked.state.member = false; assert.equal((await revoked.invoke(method, body)).status, 403); assert.deepEqual(revoked.state.writes, []); assert.equal(revoked.state.seeds, 0);
  });
}

test('legacy management reads and permission toggles retain workspace scoping', async () => {
  const f = fixture(); const result = await f.invoke('GET'); assert.equal(result.status, 200); assert.equal(result.headers.get('cache-control'), 'no-store'); assert.ok((await result.json()).permissions.every(row => row.workspaceId === 'workspace'));
  assert.equal((await f.invoke('PUT', { role: 'DEVELOPER', permission: 'VIEW_POSTS', enabled: true })).status, 200);
  assert.equal((await f.invoke('PUT', { role: 'DEVELOPER', permission: 'VIEW_POSTS', enabled: false })).status, 200);
  assert.deepEqual(f.state.rows.filter(row => row.workspaceId === 'foreign'), [{ workspaceId: 'foreign', role: 'DEVELOPER', permission: 'DELETE_ANY_POST' }]);
});
