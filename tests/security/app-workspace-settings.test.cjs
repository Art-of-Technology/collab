// PATCH /api/apps/auth/workspace: a token changes the workspace's settings only at the Owner level, as in the app.
const { assert, test, load, matches } = require('./helpers.cjs');

const SELECT = ['id', 'name', 'slug', 'description', 'logoUrl', 'ownerId', 'dockEnabled', 'timeTrackingEnabled', 'createdAt', 'updatedAt'];

function fixture() {
  const state = { actor: null, writes: [] };
  const workspace = { id: 'w', slug: 'w', name: 'Workspace', description: null, logoUrl: null, ownerId: 'primary',
    dockEnabled: false, timeTrackingEnabled: false, createdAt: new Date(0), updatedAt: new Date(0), secret: 'not selected', members: [] };
  const users = { primary: 'DEVELOPER', owner: 'DEVELOPER', admin: 'DEVELOPER', member: 'DEVELOPER', off: 'DEVELOPER',
    'root-owner': 'SYSTEM_ADMIN', 'root-admin': 'SYSTEM_ADMIN', 'root-none': 'SYSTEM_ADMIN' };
  workspace.members = [['primary', 'MEMBER', false], ['owner', 'OWNER', true], ['admin', 'ADMIN', true], ['member', 'DEVELOPER', true],
    ['off', 'OWNER', false], ['root-owner', 'Owner', true], ['root-admin', 'ADMIN', true]]
    .map(([userId, role, status]) => ({ userId, workspaceId: 'w', role, status }));
  const db = {
    appToken: { findMany: async () => [{ accessToken: 'Y2lwaGVy', userId: state.actor, scopes: ['workspace:write'], tokenExpiresAt: null,
      installation: { id: 'install', appId: 'app', workspaceId: 'w', installedById: state.actor, scopes: ['workspace:write'], status: 'ACTIVE',
        workspace: { id: 'w', slug: 'w', name: 'Workspace' },
        app: { id: 'app', slug: 'app', name: 'App', status: 'PUBLISHED', scopes: [{ scope: 'workspace:write' }] } } }] },
    user: { findUnique: async ({ where, select }) => {
      if (!(where.id in users)) return null;
      // The middleware asks who the token's user is; the authority module asks for the role and active memberships.
      if (!select.workspaceMemberships) return { id: where.id, email: null, name: where.id };
      return { role: users[where.id], workspaceMemberships: workspace.members.filter(m => m.userId === where.id && matches(m, select.workspaceMemberships.where)).map(m => ({ role: m.role })) };
    } },
    workspace: {
      findFirst: async ({ where }) => matches(workspace, where) ? { id: workspace.id } : null,
      findUnique: async ({ where }) => where.id === workspace.id ? { ownerId: workspace.ownerId } : null,
      update: async ({ where, data, select }) => {
        state.writes.push({ where, data });
        Object.assign(workspace, data);
        return Object.fromEntries(Object.keys(select).map(key => [key, workspace[key]]));
      },
    },
    workspaceMember: { findUnique: async ({ where }) => workspace.members.find(m => m.userId === where.userId_workspaceId.userId) ?? null },
  };
  const deps = { '@/lib/prisma': { prisma: db }, 'next/server': { NextResponse: Response }, zod: require('zod'),
    '@/lib/apps/crypto': { getEncryptionKey: () => 'fixture-key', decryptToken: async () => 'token' }, '@/lib/oauth-scopes': load('src/lib/oauth-scopes.ts') };
  const globals = { URL, Buffer, console };
  deps['@/lib/apps/auth-middleware'] = load('src/lib/apps/auth-middleware.ts', deps, globals);
  const { PATCH } = load('src/app/api/apps/auth/workspace/route.ts', deps, globals);
  // The same handler behind a pass-through, to show the route refuses on its own those the middleware already turns away.
  const direct = load('src/app/api/apps/auth/workspace/route.ts', { ...deps,
    '@/lib/apps/auth-middleware': { withAppAuth: handler => request => handler(request, { user: { id: state.actor }, workspace: { id: 'w' } }) } }, globals).PATCH;
  const patch = (actor, body = { name: 'Renamed' }, handler = PATCH) => {
    state.actor = actor;
    return handler(new Request('https://example.test', { method: 'PATCH', headers: { Authorization: 'Bearer token' }, body: JSON.stringify(body) }));
  };
  return { state, workspace, patch, direct };
}

test("an Owner's and the primary owner's token changes the settings; an Admin's, a standard member's and a switched-off member's token is refused", async () => {
  const { state, patch, direct } = fixture();
  for (const actor of ['owner', 'primary']) {
    const response = await patch(actor, { name: `By ${actor}` });
    assert.equal(response.status, 200, actor);
    assert.equal((await response.json()).name, `By ${actor}`);
  }
  assert.equal(state.writes.length, 2);
  for (const actor of ['admin', 'member']) {
    const response = await patch(actor);
    assert.equal(response.status, 403, actor);
    const body = await response.json();
    assert.equal(body.error, 'insufficient_permissions');
    assert.match(body.error_description, /Owner/);
  }
  // A switched-off member is turned away by the middleware, and by the route itself behind it.
  assert.equal((await patch('off')).status, 403);
  const refused = await patch('off', undefined, direct);
  assert.equal(refused.status, 403);
  assert.equal((await refused.json()).error, 'insufficient_permissions');
  assert.equal(state.writes.length, 2);
});

test('a platform admin gets the answer of their membership level, and without a membership the refusal', async () => {
  const { state, patch, direct } = fixture();
  assert.equal((await patch('root-owner')).status, 200);
  assert.equal((await patch('root-admin')).status, 403);
  assert.equal((await patch('root-none')).status, 403);
  const refused = await patch('root-none', undefined, direct);
  assert.equal(refused.status, 403);
  assert.equal((await refused.json()).error, 'insufficient_permissions');
  assert.equal(state.writes.length, 1);
});

test('the accepted fields and the answer are unchanged', async () => {
  const { state, workspace, patch } = fixture();
  const all = { name: 'New name', description: 'About', logoUrl: 'https://example.test/logo.png', dockEnabled: true, timeTrackingEnabled: true };
  const response = await patch('owner', { ...all, slug: 'taken', ownerId: 'owner' });
  assert.equal(response.status, 200);
  // Unknown fields are dropped by the schema; only the five settings are written, to this workspace.
  assert.deepEqual(JSON.parse(JSON.stringify(state.writes)), [{ where: { id: 'w' }, data: all }]);
  const body = await response.json();
  assert.deepEqual(Object.keys(body).sort(), [...SELECT].sort());
  assert.deepEqual({ ...body, createdAt: undefined, updatedAt: undefined },
    { ...Object.fromEntries(SELECT.map(key => [key, workspace[key]])), createdAt: undefined, updatedAt: undefined });
  assert.equal(body.slug, 'w'); assert.equal(body.ownerId, 'primary');
  for (const invalid of [{ name: '' }, { name: 'x'.repeat(101) }, { description: 'x'.repeat(501) }, { logoUrl: 'not a url' }, { dockEnabled: 'yes' }]) {
    const rejected = await patch('owner', invalid);
    assert.equal(rejected.status, 400, JSON.stringify(invalid));
    const answer = await rejected.json();
    assert.equal(answer.error, 'validation_error'); assert.equal(answer.error_description, 'Invalid request data'); assert.ok(Array.isArray(answer.details));
  }
  assert.equal(state.writes.length, 1);
});
