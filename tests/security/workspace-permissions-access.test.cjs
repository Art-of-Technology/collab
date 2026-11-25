const { assert, test, load, matches } = require('./helpers.cjs');
const clone = value => JSON.parse(JSON.stringify(value));

function fixture() {
  const state = { member: true, memberRole: 'HR', owner: false, admin: false, manage: true, targetMember: true, mapping: true, legacy: 0, actorReads: [], writes: [], seeds: 0, transactions: 0, failCreate: false,
    rows: [{ workspaceId: 'workspace', role: 'HR', permission: 'MANAGE_WORKSPACE_PERMISSIONS' }, { workspaceId: 'workspace', role: 'DEVELOPER', permission: 'DELETE_ANY_POST' }, { workspaceId: 'workspace', role: 'VIEWER', permission: 'VIEW_POSTS' }, { workspaceId: 'foreign', role: 'DEVELOPER', permission: 'DELETE_ANY_POST' }] };
  const actor = { id: 'actor', email: 'actor@weezboo.com', get role() { return state.admin ? 'SYSTEM_ADMIN' : 'DEVELOPER'; }, get workspaceMemberships() { return [{ workspaceId: 'workspace', role: state.memberRole, status: state.member }]; }, get ownedWorkspaces() { return state.owner ? [{ id: 'workspace' }] : []; } };
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
    workspace: { findUnique: async () => ({ ownerId: state.owner ? 'actor' : 'owner' }) },
    customRole: { findFirst: async ({ where }) => where.workspaceId === 'workspace' && where.name === 'Support' ? { id: 'custom', name: 'Support' } : null },
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
  return { state, env, permissions, defaults: defaults.defaultRolePermissions, invoke: (method, body, userId) => handlers[method](new Request('https://example.test/' + (userId ? '?userId=' + userId : ''), { method, ...(body ? { body: JSON.stringify(body) } : {}) }), { params: Promise.resolve({ workspaceId: 'workspace' }) }) };
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

test('a system admin without membership receives workspace permissions', async () => {
  const f = fixture();
  f.state.member = false;
  f.state.admin = true;
  const response = await f.invoke('GET', undefined, 'actor');
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.role, 'OWNER');
  assert.ok(body.permissions.includes('MANAGE_WORKSPACE_MEMBERS'));
});

test('reset replaces only selected workspace role with existing application defaults', async () => {
  const f = fixture(); f.state.memberRole = 'OWNER'; const unaffected = clone(f.state.rows.filter(row => row.workspaceId !== 'workspace' || row.role !== 'DEVELOPER'));
  assert.equal((await f.invoke('POST', { role: 'DEVELOPER' })).status, 200); assert.equal(f.state.seeds, 0); assert.equal(f.state.transactions, 1);
  assert.deepEqual(f.state.rows.filter(row => row.workspaceId !== 'workspace' || row.role !== 'DEVELOPER'), unaffected);
  assert.deepEqual(f.state.rows.filter(row => row.workspaceId === 'workspace' && row.role === 'DEVELOPER').map(row => row.permission).sort(), [...f.defaults.DEVELOPER].sort());
});

test('reset insert failure rolls back the modeled selected role deletion', async () => {
  const f = fixture(); f.state.memberRole = 'OWNER'; const before = clone(f.state.rows); f.state.failCreate = true;
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
  assert.equal((await f.invoke('PUT', { role: 'HR', permission: 'MANAGE_WORKSPACE_PERMISSIONS', enabled: false })).status, 403);
  assert.equal((await f.invoke('POST', { role: 'HR' })).status, 403); assert.deepEqual(f.state.writes, []); assert.equal(f.state.seeds, 0);
  for (const field of ['owner', 'admin']) { const f = fixture(); f.state.member = false; f.state.manage = false; f.state[field] = true; assert.equal((await f.invoke('POST', { role: 'DEVELOPER' })).status, 200); }
});

for (const method of ['GET', 'PUT', 'POST']) {
  test(`${method}: gateway actor and revoked manager denial`, async () => {
    const body = method === 'PUT' ? { role: 'DEVELOPER', permission: 'VIEW_POSTS', enabled: true } : method === 'POST' ? { role: 'DEVELOPER' } : undefined;
    const f = fixture(); f.state.memberRole = 'OWNER'; f.env.env.COLLAB_AUTH_MODE = 'gateway'; assert.equal((await f.invoke(method, body)).status, 200); assert.equal(f.state.legacy, 0);
    const denied = fixture(); denied.env.env.COLLAB_AUTH_MODE = 'gateway'; denied.state.mapping = false; assert.equal((await denied.invoke(method, body)).status, 401); assert.equal(denied.state.legacy, 0); assert.deepEqual(denied.state.writes, []);
    const revoked = fixture(); revoked.state.member = false; assert.equal((await revoked.invoke(method, body)).status, 403); assert.deepEqual(revoked.state.writes, []); assert.equal(revoked.state.seeds, 0);
  });
}

test('legacy management reads and permission toggles retain workspace scoping', async () => {
  const f = fixture(); f.state.memberRole = 'OWNER'; const result = await f.invoke('GET'); assert.equal(result.status, 200); assert.equal(result.headers.get('cache-control'), 'no-store'); assert.ok((await result.json()).permissions.every(row => row.workspaceId === 'workspace'));
  assert.equal((await f.invoke('PUT', { role: 'DEVELOPER', permission: 'VIEW_POSTS', enabled: true })).status, 200);
  assert.equal((await f.invoke('PUT', { role: 'DEVELOPER', permission: 'VIEW_POSTS', enabled: false })).status, 200);
  assert.deepEqual(f.state.rows.filter(row => row.workspaceId === 'foreign'), [{ workspaceId: 'foreign', role: 'DEVELOPER', permission: 'DELETE_ANY_POST' }]);
});

test('a member whose role is Owner has every permission with no permission rows', async () => {
  for (const role of ['OWNER', 'owner']) {
    const f = fixture(); f.state.memberRole = role; f.state.rows = [];
    const all = Object.keys(f.permissions.Permission);
    for (const permission of ['MANAGE_APPS', 'DELETE_ANY_POST', 'MANAGE_WORKSPACE_PERMISSIONS']) {
      const result = await f.permissions.checkUserPermission('actor', 'workspace', permission);
      assert.equal(result.hasPermission, true, `${role} ${permission}`);
      assert.equal(result.userRole, role);
    }
    assert.deepEqual([...await f.permissions.getUserPermissions('actor', 'workspace')].sort(), all.sort());
  }
});

test('a platform admin and a deactivated member get the answers they got before', async () => {
  const ask = async (setup, permission) => { const f = fixture(); setup(f.state); return { ...await f.permissions.checkUserPermission('actor', 'workspace', permission) }; };
  const list = async setup => { const f = fixture(); setup(f.state); return [...await f.permissions.getUserPermissions('actor', 'workspace')]; };
  const all = Object.keys(fixture().permissions.Permission).sort();
  // A platform admin without a membership row: every permission, reported as OWNER.
  const admin = state => { state.admin = true; state.member = false; state.rows = []; };
  assert.deepEqual(await ask(admin, 'MANAGE_APPS'), { hasPermission: true, userRole: 'OWNER' });
  assert.deepEqual((await list(admin)).sort(), all);
  // A deactivated member, whatever the role on the row, has nothing.
  for (const memberRole of ['HR', 'OWNER', 'owner', 'ADMIN']) {
    const gone = state => { state.member = false; state.memberRole = memberRole; };
    assert.deepEqual(await ask(gone, 'MANAGE_WORKSPACE_PERMISSIONS'), { hasPermission: false, reason: 'User is not a member of this workspace' });
    assert.deepEqual(await list(gone), []);
  }
  // Any other active role, Admin included, has exactly its rows.
  assert.deepEqual(await ask(() => {}, 'MANAGE_WORKSPACE_PERMISSIONS'), { hasPermission: true, userRole: 'HR' });
  assert.deepEqual(await ask(() => {}, 'MANAGE_APPS'), { hasPermission: false, reason: 'Permission not configured for this role', userRole: 'HR' });
  assert.deepEqual(await list(() => {}), ['MANAGE_WORKSPACE_PERMISSIONS']);
  for (const memberRole of ['ADMIN', 'admin', 'DEVELOPER', 'Release Captain']) {
    const other = state => { state.memberRole = memberRole; };
    assert.deepEqual(await ask(other, 'MANAGE_APPS'), { hasPermission: false, reason: 'Permission not configured for this role', userRole: memberRole });
  }
  assert.deepEqual(await ask(state => { state.memberRole = 'DEVELOPER'; }, 'DELETE_ANY_POST'), { hasPermission: true, userRole: 'DEVELOPER' });
  assert.deepEqual(await list(state => { state.memberRole = 'DEVELOPER'; }), ['DELETE_ANY_POST']);
});

test('the permission routes are for Owner and above', async () => {
  for (const [method, body] of [['GET'], ['PUT', { role: 'DEVELOPER', permission: 'VIEW_POSTS', enabled: true }], ['POST', { role: 'DEVELOPER' }]]) {
    for (const [why, setup] of [['primary owner without a row', state => { state.owner = true; state.member = false; }], ['OWNER', state => { state.memberRole = 'OWNER'; }], ['owner', state => { state.memberRole = 'owner'; }]]) {
      const f = fixture(); setup(f.state);
      assert.equal((await f.invoke(method, body)).status, 200, `${method}: ${why}`);
    }
    for (const memberRole of ['ADMIN', 'admin', 'HR']) {
      const f = fixture(); f.state.memberRole = memberRole;
      f.state.rows.push({ workspaceId: 'workspace', role: memberRole, permission: 'MANAGE_WORKSPACE_PERMISSIONS' });
      const response = await f.invoke(method, body);
      assert.equal(response.status, 403, `${method}: ${memberRole} holding the permission`);
      assert.match((await response.json()).error, /^Only Owners [^.]*$/);
      assert.deepEqual(f.state.writes, []);
    }
  }
});

test("the Owner role's permissions cannot be changed or reset, and an unknown role name is refused", async () => {
  for (const [why, setup] of [['primary owner', state => { state.owner = true; }], ['Owner', state => { state.memberRole = 'OWNER'; }]]) {
    for (const [method, body, status] of [
      ['PUT', { role: 'OWNER', permission: 'VIEW_POSTS', enabled: false }, 403],
      ['PUT', { role: 'owner', permission: 'VIEW_POSTS', enabled: true }, 403],
      ['POST', { role: 'OWNER' }, 403],
      ['PUT', { role: 'Nope', permission: 'VIEW_POSTS', enabled: true }, 400],
      ['PUT', { role: 'support', permission: 'VIEW_POSTS', enabled: true }, 400],
    ]) {
      const f = fixture(); setup(f.state);
      const response = await f.invoke(method, body);
      assert.equal(response.status, status, `${why}: ${method} ${body.role}`);
      assert.match((await response.json()).error, /^[A-Z][^.]*$/);
      assert.deepEqual(f.state.writes, [], `${why}: ${method} ${body.role} wrote nothing`);
    }
    const f = fixture(); setup(f.state);
    assert.equal((await f.invoke('PUT', { role: 'Support', permission: 'VIEW_POSTS', enabled: true })).status, 200, `${why}: an existing custom role`);
    assert.ok(f.state.rows.some(row => row.role === 'Support' && row.permission === 'VIEW_POSTS'));
    // A built-in role stored in another letter case keeps its rows editable, under the spelling that was sent.
    const g = fixture(); setup(g.state);
    assert.equal((await g.invoke('PUT', { role: 'admin', permission: 'VIEW_POSTS', enabled: true })).status, 200, `${why}: a built-in role in another letter case`);
    assert.ok(g.state.rows.some(row => row.role === 'admin' && row.permission === 'VIEW_POSTS'));
  }
});
