const { assert, test, load, matches } = require('./helpers.cjs');

function fixture() {
  const state = { session: true, id: 'actor', mapping: true, email: 'current@weezboo.com', currentEmail: 'current@weezboo.com', userExists: true, member: true, owner: false, admin: false, permission: true, legacy: 0, reads: [], writes: [], emails: [], foreignInvite: false, duplicate: false, existingMember: false, limit: false };
  const workspace = { id: 'workspace', slug: 'WS', name: 'Workspace', get ownerId() { return state.owner ? 'actor' : 'other'; }, get members() { return [{ workspaceId: 'workspace', userId: 'actor', status: state.member, role: 'HR' }]; } };
  const rows = [workspace, { id: 'owned', ownerId: 'actor', members: [] }, { id: 'revoked', ownerId: 'other', members: [{ userId: 'actor', status: false }] }, { id: 'foreign', ownerId: 'other', members: [] }];
  const actor = { id: 'actor', name: 'Actor', get email() { return state.currentEmail; }, get role() { return state.admin ? 'SYSTEM_ADMIN' : 'DEVELOPER'; }, get workspaceMemberships() { return workspace.members; }, get ownedWorkspaces() { return state.owner ? [workspace] : []; } };
  const invitations = [
    { id: 'current', email: 'current@weezboo.com', workspaceId: 'workspace', status: 'pending', expiresAt: new Date('2099-01-01'), createdAt: new Date('2026-01-01'), workspace, invitedBy: actor },
    { id: 'stale', email: 'stale@weezboo.com', workspaceId: 'workspace', status: 'pending', expiresAt: new Date('2099-01-01'), createdAt: new Date('2025-01-01'), workspace, invitedBy: actor },
    { id: 'expired', email: 'current@weezboo.com', workspaceId: 'workspace', status: 'pending', expiresAt: new Date('2000-01-01'), workspace, invitedBy: actor },
    { id: 'accepted', email: 'current@weezboo.com', workspaceId: 'workspace', status: 'accepted', expiresAt: new Date('2099-01-01'), workspace, invitedBy: actor },
  ];
  const pick = (row, args = {}) => {
    if (!row) return null; const result = args.select ? {} : { ...row };
    for (const [key, value] of Object.entries(args.select || args.include || {})) {
      if (value === true) result[key] = row[key];
      else if (Array.isArray(row[key])) result[key] = row[key].filter(item => matches(item, value.where || {})).map(item => pick(item, value));
      else result[key] = pick(row[key], value);
    }
    return result;
  };
  const prisma = {
    account: { findUnique: async () => state.mapping ? { user: { ...actor, accounts: [{ id: 'mapping' }] } } : null },
    user: {
      findUnique: async args => { state.reads.push(['actor', args]); return state.userExists && matches(actor, args.where) ? pick(actor, args) : null; },
      findFirst: async args => { state.reads.push(['existing-member', args]); return state.existingMember ? { id: 'existing' } : null; },
    },
    rolePermission: { findUnique: async () => state.permission ? { permission: 'INVITE_MEMBERS' } : null },
    workspace: {
      findUnique: async args => { state.reads.push(['workspace', args]); return pick(rows.find(row => matches(row, args.where)), args); },
      findMany: async args => { state.reads.push(['workspaces', args]); return rows.filter(row => matches(row, args.where)); },
      count: async () => state.limit ? 3 : 1,
      create: async args => { state.writes.push(['workspace-create', args]); return { id: 'created', ...args.data }; },
    },
    workspaceInvitation: {
      findMany: async args => { state.reads.push(['invitations', args]); return invitations.filter(row => matches(row, args.where)).map(row => pick(row, args)); },
      findFirst: async () => state.duplicate ? invitations[0] : null,
      findUnique: async () => ({ ...invitations[0], workspaceId: state.foreignInvite ? 'foreign' : 'workspace' }),
      create: async args => { state.writes.push(['invite-create', args]); return { id: 'created', ...args.data }; },
      delete: async args => { state.writes.push(['invite-delete', args]); return invitations[0]; },
    },
  };
  const options = {}, env = { env: { COLLAB_AUTH_MODE: 'nextauth', COLLAB_GATEWAY_ISSUER: 'https://identity.example.test' } };
  const nextAuth = { getServerSession: async value => { assert.equal(value, options); state.legacy++; return state.session ? { user: { id: state.id, email: state.email, name: 'Actor' } } : null; } };
  const adapter = load('src/lib/request-session.ts', { 'server-only': {}, './gateway-identity': load('src/lib/gateway-identity.ts', { 'node:crypto': require('node:crypto') }, { process: env, Buffer, TextDecoder, URL }), 'next-auth': nextAuth,
    'next/headers': { headers: () => new Headers({ 'x-collab-issuer': Buffer.from(env.env.COLLAB_GATEWAY_ISSUER).toString('base64url'), 'x-collab-subject': Buffer.from('workspace-actor').toString('base64url'), 'x-collab-email': Buffer.from('current@weezboo.com').toString('base64url'), 'x-collab-email-verified': 'true' }) }, '@/lib/prisma': { prisma },
  }, { process: env });
  const globals = { URL, console: { error() {} } };
  const deps = { '@/lib/prisma': { prisma }, '@/lib/request-session': adapter, 'next-auth': nextAuth, '@/lib/auth-options': { authOptions: options }, 'next/server': { NextResponse: Response },
    '@/lib/permissions': load('src/lib/permissions.ts', { './prisma': { prisma } }, globals),
    '@/lib/utils': load('src/lib/utils.ts', { clsx: { clsx: () => '' }, 'tailwind-merge': { twMerge: () => '' } }),
    'node:crypto': { randomUUID: () => 'synthetic-invitation-token' },
    '@/lib/email': { sendWorkspaceInvitationEmail: async args => { state.emails.push(args); return { success: true, messageId: 'synthetic-message' }; } },
  };
  return { state, env, invoke: (path, method, body) => load(`src/app/api/workspaces${path}/route.ts`, deps, globals)[method](new Request('https://example.test/?id=current', { method, ...(body ? { body: JSON.stringify(body) } : {}) }), { params: Promise.resolve({ workspaceId: 'workspace' }) }) };
}
const routes = [['', 'GET'], ['', 'POST', { name: 'Fresh Workspace' }, 201], ['/invitations', 'GET'], ['/[workspaceId]/invitations', 'GET'], ['/[workspaceId]/invitations', 'POST', { email: 'invitee@weezboo.com' }, 201], ['/[workspaceId]/invitations', 'DELETE']];
for (const [path, method, body, expected = 200] of routes) {
  test(`${method} ${path || '/'} requires ID and accepts mapped gateway without fallback`, async () => {
    const f = fixture(); f.state.id = undefined;
    assert.equal((await f.invoke(path, method, body)).status, 401); assert.deepEqual(f.state.reads, []); assert.deepEqual(f.state.writes, []); assert.deepEqual(f.state.emails, []);
    const g = fixture(); g.env.env.COLLAB_AUTH_MODE = 'gateway';
    assert.equal((await g.invoke(path, method, body)).status, expected); assert.equal(g.state.legacy, 0);
    const denied = fixture(); denied.env.env.COLLAB_AUTH_MODE = 'gateway'; denied.state.mapping = false;
    assert.equal((await denied.invoke(path, method, body)).status, 401); assert.equal(denied.state.legacy, 0); assert.deepEqual(denied.state.writes, []); assert.deepEqual(denied.state.emails, []);
  });
}

test('legacy positive controls retain all six endpoint contracts', async () => {
  for (const [path, method, body, expected = 200] of routes) assert.equal((await fixture().invoke(path, method, body)).status, expected);
});

test('recipient list resolves current database email, preserving pending/expiry/projection/order', async () => {
  const f = fixture(); f.state.email = 'stale@weezboo.com';
  const response = await f.invoke('/invitations', 'GET'); assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).map(row => row.id), ['current']);
  const query = f.state.reads.find(([name]) => name === 'invitations')[1]; assert.equal(query.orderBy.createdAt, 'desc'); assert.equal(query.include.workspace.select.id, true);
  f.state.userExists = false; f.state.reads.length = 0;
  assert.equal((await f.invoke('/invitations', 'GET')).status, 401); assert.equal(f.state.reads.some(([name]) => name === 'invitations'), false);
  f.state.userExists = true; f.state.currentEmail = null; f.state.reads.length = 0;
  assert.equal((await f.invoke('/invitations', 'GET')).status, 401); assert.equal(f.state.reads.some(([name]) => name === 'invitations'), false);
});

test('workspace collection retains owner/active filtering, owner creation and free-plan limit', async () => {
  const f = fixture(); assert.deepEqual((await (await f.invoke('', 'GET')).json()).map(row => row.id), ['workspace', 'owned']);
  const created = await (await f.invoke('', 'POST', { name: 'Fresh Workspace' })).json(); assert.equal(created.ownerId, 'actor'); assert.equal(created.members.create.userId, 'actor');
  f.state.limit = true; f.state.writes.length = 0; assert.equal((await f.invoke('', 'POST', { name: 'Fresh Workspace' })).status, 403); assert.deepEqual(f.state.writes, []);
});

test('invitation management preserves current permission, owner/admin and foreign-ID rejection', async () => {
  for (const method of ['GET', 'POST', 'DELETE']) {
    for (const field of ['member', 'permission']) {
      const f = fixture(); f.state[field] = false;
      assert.equal((await f.invoke('/[workspaceId]/invitations', method, method === 'POST' ? { email: 'invitee@weezboo.com' } : undefined)).status, 403);
      assert.deepEqual(f.state.writes, []); assert.deepEqual(f.state.emails, []);
    }
    for (const field of ['owner', 'admin']) {
      const f = fixture(); f.state.member = false; f.state.permission = false; f.state[field] = true;
      assert.equal((await f.invoke('/[workspaceId]/invitations', method, method === 'POST' ? { email: 'invitee@weezboo.com' } : undefined)).status, method === 'POST' ? 201 : 200);
    }
  }
  const foreign = fixture(); foreign.state.foreignInvite = true; assert.equal((await foreign.invoke('/[workspaceId]/invitations', 'DELETE')).status, 403); assert.deepEqual(foreign.state.writes, []);
  for (const field of ['duplicate', 'existingMember']) { const f = fixture(); f.state[field] = true; assert.equal((await f.invoke('/[workspaceId]/invitations', 'POST', { email: 'invitee@weezboo.com' })).status, 400); assert.deepEqual(f.state.writes, []); assert.deepEqual(f.state.emails, []); }
});
