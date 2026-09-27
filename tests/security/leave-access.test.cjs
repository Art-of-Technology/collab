const { assert, test, load, matches } = require('./helpers.cjs');
const { z } = require('zod');
const future = new Date('2099-01-10T12:00:00Z');
const createBody = { policyId: 'policy', startDate: future.toISOString(), endDate: future.toISOString(), duration: 'FULL_DAY', notes: 'Holiday' };
const policyBody = { name: 'Annual', group: null, isPaid: true, trackIn: 'DAYS', exportMode: 'DO_NOT_EXPORT', exportCode: null, accrualType: 'DOES_NOT_ACCRUE', maxBalance: null, rolloverType: null, rolloverAmount: null, rolloverDate: null, workspaceId: 'workspace' };

function fixture() {
  const state = { member: true, owner: false, manage: true, admin: false, stale: false, mapping: true, session: true, legacy: 0, reads: [], writes: [], effects: [], actors: [], transactions: 0, status: 'PENDING', past: false, requestOwner: 'actor' };
  const workspace = { id: 'workspace', slug: 'workspace', name: 'Workspace', get ownerId() { return state.owner ? 'actor' : 'owner'; }, get members() { return [{ userId: 'actor', workspaceId: 'workspace', status: state.member, role: 'HR' }]; } };
  const actor = { id: 'actor', email: 'current@weezboo.com', name: 'Actor', image: null,
    get role() { return state.admin ? 'SYSTEM_ADMIN' : 'DEVELOPER'; },
    get workspaceMemberships() { return workspace.members; }, get ownedWorkspaces() { return state.owner ? [workspace] : []; } };
  const outsider = { id: 'outsider', email: 'stale@weezboo.com', name: 'Outsider', role: 'SYSTEM_ADMIN', workspaceMemberships: [], ownedWorkspaces: [] };
  const policy = { ...policyBody, id: 'policy', workspace, isHidden: false, _count: { leaveRequests: 0, leaveBalances: 0 } };
  const request = { id: 'request', get userId() { return state.requestOwner; }, policyId: 'policy', policy, user: actor, get startDate() { return state.past ? new Date('2000-01-01') : future; }, endDate: future,
    duration: 'FULL_DAY', notes: 'Holiday', get status() { return state.status; }, createdAt: future, updatedAt: future };
  const balance = { id: 'balance', userId: 'actor', policyId: 'policy', policy, year: 2099, totalAccrued: 20, totalUsed: 2, balance: 18, rollover: 0 };
  const pick = (row, args = {}) => {
    if (!row) return null;
    const result = args.select ? {} : { ...row };
    for (const [key, value] of Object.entries(args.select || args.include || {})) {
      if (value === true) result[key] = row[key];
      else if (Array.isArray(row[key])) result[key] = query(row[key], value);
      else result[key] = row[key] ? pick(row[key], value) : null;
    }
    return result;
  };
  const query = (rows, args) => rows.filter(row => matches(row, args.where || {})).slice(args.skip || 0, (args.skip || 0) + (args.take ?? rows.length)).map(row => pick(row, args));
  const read = (name, rows, args) => { state.reads.push([name, args]); return query(rows, args); };
  const prisma = {
    account: { findUnique: async () => state.mapping ? { user: { ...actor, accounts: [{ id: 'mapping' }] } } : null },
    user: { findUnique: async args => { const row = [actor, outsider].find(row => matches(row, args.where)); if (row) state.actors.push(row.id); return pick(row, args); } },
    workspace: { findUnique: async args => read('workspace', [workspace], args)[0] || null, findFirst: async args => read('workspace', [workspace], args)[0] || null },
    rolePermission: { findUnique: async () => state.manage ? { permission: 'MANAGE_LEAVE' } : null },
    leavePolicy: {
      findUnique: async args => read('policy', [policy], args)[0] || null,
      findMany: async args => read('policies', [policy], args), count: async args => read('policy-count', [policy], args).length,
      create: async args => { state.writes.push(['policy-create', args]); return pick({ ...policy, ...args.data }, args); },
      update: async args => { state.writes.push(['policy-update', args]); return pick({ ...policy, ...args.data }, args); },
      delete: async args => { state.writes.push(['policy-delete', args]); return policy; },
    },
    leaveRequest: {
      findUnique: async args => read('request', [request], args)[0] || null,
      findMany: async args => read('requests', [request], args), count: async args => read('request-count', [request], args).length,
      create: async args => { state.writes.push(['request-create', args]); return pick({ ...request, ...args.data }, args); },
      update: async args => { state.writes.push(['request-update', args]); return pick({ ...request, ...args.data }, args); },
    },
    leaveBalance: {
      findMany: async args => read('balances', [balance], args), findFirst: async args => read('balance', [balance], args)[0] || null,
      update: async args => { state.writes.push(['balance-update', args]); return balance; },
      create: async args => { state.writes.push(['balance-create', args]); return balance; },
    },
    $transaction: async callback => { state.transactions++; return callback(prisma); },
  };
  const options = {}, env = { env: { COLLAB_AUTH_MODE: 'nextauth', COLLAB_GATEWAY_ISSUER: 'https://identity.example.test' } };
  const nextAuth = { getServerSession: async value => { assert.equal(value, options); state.legacy++; return state.session ? { user: { id: 'actor', email: state.stale ? outsider.email : actor.email } } : null; } };
  const adapter = load('src/lib/request-session.ts', { 'server-only': {},
    './gateway-identity': load('src/lib/gateway-identity.ts', { 'node:crypto': require('node:crypto') }, { process: env, Buffer, TextDecoder, URL }),
    'next-auth': nextAuth, 'next/headers': { headers: () => new Headers({ 'x-collab-issuer': Buffer.from(env.env.COLLAB_GATEWAY_ISSUER).toString('base64url'),
      'x-collab-subject': Buffer.from('leave-actor').toString('base64url'), 'x-collab-email': Buffer.from(actor.email).toString('base64url'), 'x-collab-email-verified': 'true' }) },
    '@/lib/prisma': { prisma },
  }, { process: env });
  const globals = { URL, console: { error() {} } };
  const permissions = load('src/lib/permissions.ts', { './prisma': { prisma } }, globals);
  const effects = name => async (...args) => { state.effects.push([name, args]); };
  const deps = { '@/lib/prisma': { prisma }, '@/lib/request-session': adapter, 'next-auth': nextAuth, '@/lib/auth-options': { authOptions: options },
    '@/lib/permissions': permissions, '@/lib/issue-finder': load('src/lib/issue-finder.ts', { '@/lib/prisma': { prisma } }),
    '@/lib/slug-resolvers': { resolveWorkspaceSlug: async id => id }, 'date-fns': { differenceInDays: (end, start) => Math.round((end - start) / 86400000) }, zod: { z },
    'next/server': { NextResponse: Response }, '@/lib/notification-service': { NotificationService: { notifyLeaveSubmission: effects('submission'), notifyLeaveEdit: effects('edit'), notifyLeaveStatusChange: effects('status') } },
    '@/lib/event-bus': { emitLeaveCreated: effects('created'), emitLeaveUpdated: effects('updated'), emitLeaveDeleted: effects('deleted') },
  };
  const service = load('src/lib/leave-service.ts', deps, globals); deps['@/lib/leave-service'] = service;
  const actions = load('src/actions/leave.ts', deps, globals);
  return { state, env, service, actions, route: async (path, method, body) => {
    const handler = load(`src/app/api/leave/${path}/route.ts`, deps, globals)[method];
    return handler(new Request('https://example.test/?workspaceId=workspace&year=2099', { method, ...(body ? { body: JSON.stringify(body) } : {}) }), { params: Promise.resolve({ policyId: 'policy', requestId: 'request' }) });
  } };
}

const routes = [
  ['balances', 'GET'], ['requests', 'GET'], ['requests', 'POST', createBody, 201],
  ['requests/[requestId]', 'PUT', { notes: 'Updated' }], ['requests/[requestId]', 'DELETE'], ['requests/[requestId]', 'PATCH', { status: 'REJECTED' }],
  ['requests/workspace', 'GET'], ['policies', 'GET'], ['policies', 'POST', policyBody, 201],
  ['policies/[policyId]', 'GET'], ['policies/[policyId]', 'PUT', { name: 'Updated' }], ['policies/[policyId]', 'DELETE'],
];
for (const [path, method, body, expected = 200] of routes) {
  test(`${method} ${path}: stable session subject and gateway mapping`, async () => {
    const f = fixture(); f.state.stale = true;
    assert.equal((await f.route(path, method, body)).status, expected);
    assert.ok(f.state.actors.length > 0); assert.ok(f.state.actors.every(id => id === 'actor'));
    const g = fixture(); g.env.env.COLLAB_AUTH_MODE = 'gateway';
    assert.equal((await g.route(path, method, body)).status, expected); assert.equal(g.state.legacy, 0);
    const denied = fixture(); denied.env.env.COLLAB_AUTH_MODE = 'gateway'; denied.state.mapping = false;
    assert.equal((await denied.route(path, method, body)).status, 401);
    assert.equal(denied.state.legacy, 0); assert.deepEqual(denied.state.writes, []); assert.deepEqual(denied.state.effects, []);
  });
}
const actionCalls = [
  ['getLeavePolicies', ['workspace']], ['createLeaveRequest', [{ ...createBody, startDate: future, endDate: future }]],
  ['getUserLeaveRequests', ['workspace']], ['getWorkspaceLeaveRequests', ['workspace']],
  ['approveLeaveRequest', ['request']], ['rejectLeaveRequest', ['request']],
  ['getPaginatedWorkspaceLeaveRequests', ['workspace']], ['getWorkspaceLeaveRequestsSummary', ['workspace']], ['getPaginatedLeavePolicies', ['workspace']],
];
for (const [name, args] of actionCalls) {
  test(`${name}: session subject survives stale email`, async () => {
    const f = fixture(); f.state.stale = true; await f.actions[name](...args);
    assert.ok(f.state.actors.length > 0); assert.ok(f.state.actors.every(id => id === 'actor'));
    assert.ok(f.state.effects.filter(([kind]) => kind === 'status').every(([, args]) => args[2] === 'actor'));
  });
}

test('legacy positive controls cover every route and server action', async () => {
  for (const [path, method, body, status = 200] of routes) assert.equal((await fixture().route(path, method, body)).status, status, `${method} ${path}`);
  for (const [name, args] of actionCalls) assert.ok(await fixture().actions[name](...args), name);
});

test('inactive members cannot read, create, edit or cancel; owners retain access', async () => {
  for (const [path, method, body] of routes) {
    const f = fixture(); f.state.member = false;
    assert.equal((await f.route(path, method, body)).status, method === 'PATCH' ? 500 : 403, `${method} ${path}`);
    assert.deepEqual(f.state.writes, []); assert.deepEqual(f.state.effects, []);
    const owner = fixture(); owner.state.member = false; owner.state.owner = true;
    assert.ok((await owner.route(path, method, body)).status < 300, `${method} ${path} owner`);
  }
  for (const [name, args] of actionCalls) {
    const f = fixture(); f.state.member = false;
    await assert.rejects(f.actions[name](...args), /Access denied|Insufficient permissions/);
    assert.deepEqual(f.state.writes, []); assert.deepEqual(f.state.effects, []);
  }
});

test('shared service rejects supplied actor impersonation before transaction or permission reads', async () => {
  const f = fixture();
  await assert.rejects(f.service.processLeaveRequestAction({ requestId: 'request', action: 'REJECTED', actionById: 'outsider' }), /Unauthorized|actor|identity/i);
  assert.equal(f.state.transactions, 0); assert.deepEqual(f.state.actors, []); assert.deepEqual(f.state.writes, []);
});

test('current MANAGE_LEAVE policy denies ordinary members and preserves system admin service access', async () => {
  const denied = fixture(); denied.state.manage = false;
  await assert.rejects(denied.service.processLeaveRequestAction({ requestId: 'request', action: 'APPROVED', actionById: 'actor' }), /Insufficient permissions/);
  assert.deepEqual(denied.state.writes, []);
  const admin = fixture(); admin.state.member = false; admin.state.manage = false; admin.state.admin = true;
  const result = await admin.service.processLeaveRequestAction({ requestId: 'request', action: 'APPROVED', actionById: 'actor' });
  assert.equal(result.status, 'APPROVED'); assert.equal(admin.state.writes.filter(([kind]) => kind === 'balance-update').length, 1);
});

test('edit/cancel retain ownership, pending-status and date restrictions', async () => {
  for (const method of ['PUT', 'DELETE']) for (const [key, value, status] of [['requestOwner', 'outsider', 403], ['status', 'APPROVED', 400], ['past', true, 400]]) {
    const f = fixture(); f.state[key] = value;
    assert.equal((await f.route('requests/[requestId]', method, method === 'PUT' ? { notes: 'Changed' } : undefined)).status, status);
    assert.deepEqual(f.state.writes, []); assert.deepEqual(f.state.effects, []);
  }
});

test('shared service rejects invalid actions and request IDs before any write', async () => {
  for (const data of [
    { requestId: 'request', action: { set: 'APPROVED' }, actionById: 'actor' },
    { requestId: 'request', action: 'CANCELED', actionById: 'actor' },
    { requestId: { equals: 'request' }, action: 'APPROVED', actionById: 'actor' },
  ]) {
    const f = fixture(); await assert.rejects(f.service.processLeaveRequestAction(data), /Invalid/);
    assert.equal(f.state.transactions, 0); assert.deepEqual(f.state.writes, []);
  }
});
