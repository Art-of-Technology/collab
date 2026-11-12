const { assert, test, load, matches } = require('./helpers.cjs');
const crypto = require('node:crypto');

const CEILING = ['user:read', 'workspace:read', 'workspace:write', 'issues:read', 'issues:write', 'context:read'];
const noStore = { 'Cache-Control': 'no-store' };

function fixture() {
  const agentApp = { id: 'agent-app', slug: 'collab-agent', name: 'Collab agent tokens', status: 'PUBLISHED', isSystemApp: true, scopes: CEILING.map(scope => ({ scope })) };
  const cliApp = { id: 'cli-app', slug: 'collab-cli', name: 'Collab CLI', status: 'PUBLISHED', isSystemApp: true, scopes: CEILING.map(scope => ({ scope })) };
  const apps = [agentApp, cliApp];
  const workspaces = [
    { id: 'w1', slug: 'one', name: 'One', ownerId: 'alice', members: [
      { userId: 'bob', role: 'MEMBER', status: true },
      { userId: 'carol', role: 'ADMIN', status: true },
      { userId: 'dave', role: 'ADMIN', status: false },
    ] },
    { id: 'w2', slug: 'two', name: 'Two', ownerId: 'erin', members: [] },
  ];
  const users = ['alice', 'bob', 'carol', 'dave', 'erin'].map(id => ({ id, name: id, email: `${id}@example.test`, role: 'DEVELOPER' }));
  users.push({ id: 'root', name: 'root', email: 'root@example.test', role: 'SYSTEM_ADMIN' });
  const rolePermissions = [{ workspaceId: 'w1', role: 'ADMIN', permission: 'MANAGE_WORKSPACE_PERMISSIONS' }];
  const tokens = [], audit = [], logs = [];
  const state = { session: null };
  const workspace = id => workspaces.find(row => row.id === id);
  const prisma = {
    app: { findUnique: async ({ where }) => apps.find(row => matches(row, where)) ?? null },
    workspace: {
      findUnique: async ({ where }) => workspaces.find(row => matches(row, where)) ?? null,
      findFirst: async ({ where }) => workspaces.find(row => matches(row, where)) ?? null,
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
      findMany: async ({ where }) => users.filter(row => matches(row, where)),
      create: async ({ data }) => { const row = { id: `service-${users.length}`, email: null, hashedPassword: null, role: 'DEVELOPER', ...data }; users.push(row); return row; },
    },
    workspaceMember: {
      upsert: async ({ where, update, create }) => {
        const { userId, workspaceId } = where.userId_workspaceId;
        const members = workspace(workspaceId).members;
        const existing = members.find(row => row.userId === userId);
        if (existing) return Object.assign(existing, update);
        const row = { role: 'MEMBER', status: true, ...create };
        members.push(row);
        return row;
      },
      updateMany: async ({ where, data }) => {
        const rows = (workspace(where.workspaceId)?.members ?? []).filter(row => row.userId === where.userId);
        rows.forEach(row => Object.assign(row, data));
        return { count: rows.length };
      },
    },
    rolePermission: { findUnique: async ({ where }) => rolePermissions.find(row => matches(row, where.workspaceId_role_permission)) ?? null },
    appToken: {
      findMany: async ({ where }) => tokens.filter(row => matches(row, where)),
      findFirst: async ({ where }) => tokens.find(row => matches(row, where)) ?? null,
      count: async ({ where }) => tokens.filter(row => matches(row, where)).length,
      create: async ({ data }) => {
        const row = { id: `token-${tokens.length}`, createdAt: new Date(), isRevoked: false, revokedAt: null, ...data, app: apps.find(app => app.id === data.appId), workspace: workspace(data.workspaceId) };
        tokens.push(row);
        return row;
      },
      updateMany: async ({ where, data }) => {
        const rows = tokens.filter(row => matches(row, where));
        rows.forEach(row => Object.assign(row, data));
        return { count: rows.length };
      },
    },
    appAuditLog: { create: async ({ data }) => { audit.push(data); return data; } },
    $transaction: async run => run(prisma),
  };
  const globals = { Buffer, URL, console: { log: (...args) => logs.push(args), warn: (...args) => logs.push(args), error: (...args) => logs.push(args) } };
  const deps = {
    crypto, zod: require('zod'),
    '@/lib/prisma': { prisma },
    // Synthetic tokens only: exercise persistence and lookup without a deployment key.
    '@/lib/apps/crypto': { getEncryptionKey: () => 'fixture-key', encryptToken: async value => Buffer.from(value), decryptToken: async value => value.toString() },
    '@/lib/oauth-scopes': load('src/lib/oauth-scopes.ts', {}, { URL }),
    '@/lib/post-access': load('src/lib/post-access.ts'),
    'next/server': { NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200, headers: init?.headers ?? {} }) } },
    '@/lib/request-session': { getServerSession: async () => state.session },
    '@/lib/auth-options': { authOptions: {} },
  };
  deps['@/lib/permissions'] = load('src/lib/permissions.ts', { './prisma': { prisma } }, globals);
  deps['@/lib/agent-tokens'] = load('src/lib/agent-tokens.ts', deps, globals);
  const { authenticateAppRequest, withAppAuth } = load('src/lib/apps/auth-middleware.ts', deps, globals);
  const collection = load('src/app/api/workspaces/[workspaceId]/agent-tokens/route.ts', deps, globals);
  const item = load('src/app/api/workspaces/[workspaceId]/agent-tokens/[tokenId]/route.ts', deps, globals);
  const as = userId => { state.session = userId ? { user: { id: userId } } : null; };
  const mint = (body = {}, workspaceId = 'w1') => collection.POST(
    { json: async () => ({ name: 'Claude', ...body }) }, { params: Promise.resolve({ workspaceId }) });
  const revoke = (tokenId, workspaceId = 'w1') => item.DELETE({}, { params: Promise.resolve({ workspaceId, tokenId }) });
  const auth = (token, scope = 'issues:read') => authenticateAppRequest({ headers: new Headers({ Authorization: `Bearer ${token}` }) }, { requiredScopes: [scope] });
  const writes = () => JSON.stringify([users.length, tokens.length, audit.length, workspaces.map(row => row.members)]);
  return { apps, agentApp, cliApp, workspaces, users, tokens, audit, logs, prisma, deps, collection, as, mint, revoke, auth, writes, withAppAuth, workspace };
}

test('an admin mints a token that authenticates as a named service account', async () => {
  const f = fixture();
  f.as('alice');
  const response = await f.mint();
  assert.equal(response.status, 201);
  assert.equal(JSON.stringify(response.headers), JSON.stringify(noStore));
  assert.match(response.body.token, /^collab_at_[0-9a-z]+_[A-Za-z0-9_-]{43}$/);
  assert.equal(response.body.name, 'Claude');

  const result = await f.auth(response.body.token);
  assert.equal(result.success, true);
  const account = f.users.find(row => row.id === result.context.user.id);
  assert.equal(account.name, 'Claude');
  assert.equal(account.email, null, 'a service account has no address a person could be added or signed in by');
  assert.equal(account.hashedPassword, null);
  assert.equal(result.context.workspace.id, 'w1');
  assert.equal(result.context.app.slug, 'collab-agent');
  const member = f.workspace('w1').members.find(row => row.userId === account.id);
  assert.equal(member.role, 'MEMBER');
  assert.equal(member.status, true);
  assert.equal(f.tokens[0].refreshToken ?? null, null);
  assert.equal(f.tokens[0].installationId, null);
});

test('read access grants only read scopes and write access grants the whole app ceiling', async () => {
  const f = fixture();
  f.as('alice');
  const read = (await f.mint({ name: 'Reader' })).body;
  assert.equal(String(read.scopes), 'user:read,workspace:read,issues:read,context:read');
  assert.equal((await f.auth(read.token, 'issues:read')).success, true);
  assert.equal((await f.auth(read.token, 'issues:write')).error.statusCode, 403);
  const write = (await f.mint({ name: 'Writer', access: 'write' })).body;
  assert.equal(String(write.scopes), String(CEILING));
  assert.equal((await f.auth(write.token, 'issues:write')).success, true);
});

test('a token minted before the app ceiling shrank loses the removed scopes', async () => {
  const f = fixture();
  f.as('alice');
  const { token } = (await f.mint({ access: 'write' })).body;
  f.agentApp.scopes = [{ scope: 'issues:read' }];
  assert.equal((await f.auth(token, 'issues:read')).success, true);
  assert.equal((await f.auth(token, 'issues:write')).error.statusCode, 403);
});

test('minting is refused without a session or the workspace permission, and writes nothing', async () => {
  const f = fixture();
  const before = f.writes();
  for (const [user, status] of [[null, 401], ['bob', 403], ['dave', 403], ['erin', 403]]) {
    f.as(user);
    assert.equal((await f.mint()).status, status, `${user} must be refused`);
  }
  assert.equal(f.writes(), before);
});

test('an admin role holding the permission and a system admin may mint', async () => {
  const f = fixture();
  for (const user of ['carol', 'root']) {
    f.as(user);
    const response = await f.mint({ name: `For ${user}` });
    assert.equal(response.status, 201);
    assert.equal((await f.auth(response.body.token)).success, true);
  }
});

test('invalid input is rejected and writes nothing', async () => {
  const f = fixture();
  f.as('alice');
  const before = f.writes();
  for (const body of [{ name: '' }, { name: '   ' }, { name: 'x'.repeat(51) }, { name: { not: 'text' } }, { access: 'admin' },
    { expiresInDays: 0 }, { expiresInDays: 366 }, { expiresInDays: 1.5 }, { scopes: ['secrets:read'] }]) {
    assert.equal((await f.mint(body)).status, 400, JSON.stringify(body));
  }
  const malformed = await f.collection.POST({ json: async () => { throw new SyntaxError('bad json'); } }, { params: Promise.resolve({ workspaceId: 'w1' }) });
  assert.equal(malformed.status, 400);
  assert.equal(f.writes(), before);
});

test('a system admin cannot mint for a workspace that does not exist', async () => {
  const f = fixture();
  f.as('root');
  const before = f.writes();
  assert.equal((await f.mint({}, 'missing')).status, 404);
  assert.equal(f.writes(), before);
});

test('minting reports 503 until the agent app is provisioned and published', async () => {
  const f = fixture();
  f.as('alice');
  const before = f.writes();
  for (const change of [{ status: 'SUSPENDED' }, { status: 'PUBLISHED', isSystemApp: false }, { slug: 'renamed', isSystemApp: true }]) {
    Object.assign(f.agentApp, change);
    assert.equal((await f.mint()).status, 503, JSON.stringify(change));
  }
  assert.equal(f.writes(), before);
});

test('a token expires after the chosen number of days', async () => {
  const f = fixture();
  f.as('alice');
  const { token, expiresAt } = (await f.mint({ expiresInDays: 30 })).body;
  const days = (new Date(expiresAt).getTime() - Date.now()) / 86_400_000;
  assert.ok(days > 29.9 && days <= 30, `expected about 30 days, got ${days}`);
  assert.equal((await f.auth(token)).success, true);
  f.tokens[0].tokenExpiresAt = new Date(Date.now() - 1000);
  const expired = await f.auth(token);
  assert.equal(expired.error.statusCode, 401);
  assert.equal(expired.error.code, 'token_expired');
});

test('the default lifetime is 90 days', async () => {
  const f = fixture();
  f.as('alice');
  const { expiresAt } = (await f.mint()).body;
  const days = (new Date(expiresAt).getTime() - Date.now()) / 86_400_000;
  assert.ok(days > 89.9 && days <= 90, `expected about 90 days, got ${days}`);
});

test('revoking rejects the token even after it was cached and pauses the account with its last live token', async () => {
  const f = fixture();
  f.as('alice');
  const first = (await f.mint()).body, second = (await f.mint()).body;
  assert.equal((await f.auth(first.token)).success, true);
  assert.equal((await f.auth(second.token)).success, true);
  const account = (await f.auth(first.token)).context.user.id;
  const member = () => f.workspace('w1').members.find(row => row.userId === account);

  assert.equal((await f.revoke(first.id)).status, 200);
  assert.equal((await f.auth(first.token)).error.statusCode, 401);
  assert.equal((await f.auth(second.token)).success, true);
  assert.equal(member().status, true, 'another live token keeps the account active');

  assert.equal((await f.revoke(second.id)).status, 200);
  assert.equal((await f.auth(second.token)).error.statusCode, 401);
  assert.equal(member().status, false);
  assert.equal((await f.revoke(second.id)).status, 404, 'a revoked token cannot be revoked again');
});

test('an expired token does not keep a revoked account active', async () => {
  const f = fixture();
  f.as('alice');
  const first = (await f.mint()).body;
  await f.mint();
  f.tokens[1].tokenExpiresAt = new Date(Date.now() - 1000);
  const account = f.tokens[0].userId;
  assert.equal((await f.revoke(first.id)).status, 200);
  assert.equal(f.workspace('w1').members.find(row => row.userId === account).status, false);
});

test('revoking is refused without the permission and cannot reach another workspace or another app', async () => {
  const f = fixture();
  f.as('alice');
  const { id } = (await f.mint()).body;
  f.tokens.push({ id: 'cli-token', appId: 'cli-app', workspaceId: 'w1', userId: 'alice', installationId: null, isRevoked: false });

  f.as('bob');
  assert.equal((await f.revoke(id)).status, 403);
  f.as(null);
  assert.equal((await f.revoke(id)).status, 401);
  f.as('erin');
  assert.equal((await f.revoke(id, 'w2')).status, 404, 'the owner of another workspace cannot revoke through it');
  f.as('alice');
  assert.equal((await f.revoke('cli-token')).status, 404, 'a CLI login is not an agent token');
  assert.equal(f.tokens.filter(row => row.isRevoked).length, 0);
});

test('minting with an existing name issues another token for the same account', async () => {
  const f = fixture();
  f.as('alice');
  const first = (await f.mint({ name: 'Claude' })).body, second = (await f.mint({ name: '  claude ' })).body;
  const account = token => f.tokens.find(row => row.id === token.id).userId;
  assert.equal(account(first), account(second));
  assert.equal(f.users.filter(row => row.name === 'Claude').length, 1);

  await f.revoke(first.id);
  await f.revoke(second.id);
  const third = (await f.mint({ name: 'CLAUDE' })).body;
  assert.equal(account(third), account(first));
  assert.equal(f.workspace('w1').members.find(row => row.userId === account(first)).status, true, 'minting reactivates a paused account');
  assert.equal((await f.auth(third.token)).success, true);

  f.as('erin');
  const elsewhere = (await f.mint({ name: 'Claude' }, 'w2')).body;
  assert.notEqual(account(elsewhere), account(first), 'a name is scoped to its workspace');
});

test('a person who shares the name is never reused as the service account', async () => {
  const f = fixture();
  f.as('alice');
  const { id } = (await f.mint({ name: 'bob' })).body;
  assert.notEqual(f.tokens.find(row => row.id === id).userId, 'bob');
});

test('a service token cannot switch to another workspace and stops when its member is switched off', async () => {
  const f = fixture();
  f.as('alice');
  const { token } = (await f.mint()).body;
  const handler = f.withAppAuth(async (request, context) => ({ status: 200, workspace: context.workspace.id }), { requiredScopes: ['issues:read'] });
  const call = url => handler({ url, headers: new Headers({ Authorization: `Bearer ${token}` }) });
  assert.equal((await call('https://collab.test/api/apps/auth/issues')).workspace, 'w1');
  assert.equal((await call('https://collab.test/api/apps/auth/issues?workspaceId=w2')).status, 403);
  assert.equal((await call('https://collab.test/api/apps/auth/issues?workspace=two')).status, 403);

  f.workspace('w1').members.find(row => row.userId === f.tokens[0].userId).status = false;
  const paused = await f.auth(token);
  assert.equal(paused.error.statusCode, 403);
  assert.equal(paused.error.code, 'workspace_access_denied');
});

test('minting and revoking record who acted, and the token is never logged, audited or listed', async () => {
  const f = fixture();
  f.as('carol');
  const { token, id } = (await f.mint({ access: 'write' })).body;
  f.as('alice');
  await f.revoke(id);
  assert.equal(JSON.stringify(f.audit.map(row => [row.workspaceId, row.actorId, row.action, row.details.tokenId, row.details.name])),
    JSON.stringify([['w1', 'carol', 'agent_token.created', id, 'Claude'], ['w1', 'alice', 'agent_token.revoked', id, 'Claude']]));
  const listed = await f.deps['@/lib/agent-tokens'].listAgentTokens('w1');
  assert.doesNotMatch(JSON.stringify([f.audit, f.logs, listed]), new RegExp(token));
  assert.doesNotMatch(JSON.stringify([f.audit, f.logs, listed]), /collab_at_/);
});

test('the list shows live tokens with their account name and is unavailable until provisioned', async () => {
  const f = fixture();
  const { listAgentTokens } = f.deps['@/lib/agent-tokens'];
  f.as('alice');
  const kept = (await f.mint({ name: 'Claude', access: 'write' })).body, gone = (await f.mint({ name: 'Old bot' })).body;
  await f.revoke(gone.id);
  f.as('erin');
  await f.mint({ name: 'Elsewhere' }, 'w2');
  const listed = await listAgentTokens('w1');
  assert.equal(JSON.stringify(listed.map(row => [row.id, row.name, row.access])), JSON.stringify([[kept.id, 'Claude', 'write']]));
  assert.ok(listed[0].expiresAt instanceof Date || typeof listed[0].expiresAt === 'object');
  f.agentApp.status = 'SUSPENDED';
  assert.equal(await listAgentTokens('w1'), null);
});

function page(f) {
  const calls = [];
  const Manager = () => null;
  const lib = f.deps['@/lib/agent-tokens'];
  const { default: AgentTokensPage } = load('src/app/(main)/workspaces/[workspaceId]/settings/agent-tokens/page.tsx', {
    ...f.deps,
    'react/jsx-runtime': require('react/jsx-runtime'),
    'next/navigation': { notFound() { throw new Error('NOT_FOUND'); }, redirect(url) { throw new Error(`REDIRECT ${url}`); } },
    'next/link': { default: 'a' },
    'lucide-react': new Proxy({}, { get: (_, name) => name }),
    '@/components/ui/button': { Button: 'button' },
    '@/components/workspace/AgentTokensManager': { default: Manager },
    '@/lib/agent-tokens': { ...lib, listAgentTokens: async id => { calls.push(id); return lib.listAgentTokens(id); } },
  }, { Date });
  const find = node => !node || typeof node !== 'object' ? null : node.type === Manager ? node
    : [].concat(node.props?.children ?? []).map(find).find(Boolean) ?? null;
  return { calls, render: async workspaceId => find(await AgentTokensPage({ params: Promise.resolve({ workspaceId }) })) };
}

test('the agent tokens page is hidden from non-admins before any token is read', async () => {
  const f = fixture(), p = page(f);
  f.as(null);
  await assert.rejects(p.render('w1'), /REDIRECT \/login/);
  for (const [user, workspaceId] of [['bob', 'w1'], ['dave', 'w1'], ['erin', 'w1'], ['root', 'missing']]) {
    f.as(user);
    await assert.rejects(p.render(workspaceId), /NOT_FOUND/, `${user} ${workspaceId}`);
  }
  assert.equal(p.calls.length, 0);
});

test('the agent tokens page gives an admin the live tokens and never a token value', async () => {
  const f = fixture(), p = page(f);
  f.as('alice');
  const fresh = (await f.mint({ name: 'Claude', access: 'write' })).body, stale = (await f.mint({ name: 'Old bot' })).body;
  f.tokens.find(row => row.id === stale.id).tokenExpiresAt = new Date(Date.now() - 1000);
  const manager = await p.render('w1');
  assert.equal(manager.props.workspaceId, 'w1');
  assert.equal(JSON.stringify(manager.props.tokens.map(row => [row.id, row.name, row.access, row.expired]).sort()),
    JSON.stringify([[fresh.id, 'Claude', 'write', false], [stale.id, 'Old bot', 'read', true]].sort()));
  assert.equal(typeof manager.props.tokens[0].createdAt, 'string');
  assert.doesNotMatch(JSON.stringify(manager.props), /collab_at_/);
  f.agentApp.status = 'SUSPENDED';
  assert.equal((await p.render('w1')).props.tokens, null);
});
