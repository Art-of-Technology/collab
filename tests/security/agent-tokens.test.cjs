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
    { id: 'w3', slug: 'three', name: 'Three', ownerId: 'alice', members: [] },
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
      findMany: async ({ where }) => workspaces.filter(row => matches(row, where)),
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
      findUnique: async ({ where }) => workspace(where.userId_workspaceId.workspaceId)?.members.find(row => row.userId === where.userId_workspaceId.userId) ?? null,
      upsert: async ({ where, update, create }) => {
        const { userId, workspaceId } = where.userId_workspaceId;
        const members = workspace(workspaceId).members;
        const existing = members.find(row => row.userId === userId);
        if (existing) return Object.assign(existing, update);
        const row = { role: 'MEMBER', status: true, ...create };
        members.push(row);
        return row;
      },
      findMany: async ({ where }) => workspaces
        .flatMap(row => row.members.map(member => ({ ...member, workspaceId: row.id, workspace: row })))
        .filter(row => matches(row, where)),
      updateMany: async ({ where, data }) => {
        const rows = workspaces.flatMap(row => row.members.map(member => ({ member, workspaceId: row.id })))
          .filter(row => matches({ ...row.member, workspaceId: row.workspaceId }, where)).map(row => row.member);
        rows.forEach(row => Object.assign(row, data));
        return { count: rows.length };
      },
      updateManyAndReturn: async ({ where, data }) => {
        const rows = workspaces.flatMap(row => row.members.map(member => ({ member, workspaceId: row.id })))
          .filter(row => matches({ ...row.member, workspaceId: row.workspaceId }, where));
        rows.forEach(row => Object.assign(row.member, data));
        return rows.map(row => ({ workspaceId: row.workspaceId }));
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
    // Lock statements do nothing here; tests/integration/agent-tokens-concurrency-db.test.cjs runs them against PostgreSQL.
    $queryRaw: async () => [],
    $executeRaw: async () => 1,
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
  const access = (tokenId, target, allowed = true, workspaceId = 'w1') => item.PATCH(
    { json: async () => ({ workspaceId: target, allowed }) }, { params: Promise.resolve({ workspaceId, tokenId }) });
  // What a token's own request sees, with or without naming another workspace.
  const switched = (token, query = '') => withAppAuth(async (request, context) => ({ status: 200, workspace: context.workspace.id, user: context.user.id }), { requiredScopes: ['issues:read'] })(
    { url: `https://collab.test/api/apps/auth/issues${query}`, headers: new Headers({ Authorization: `Bearer ${token}` }) });
  const auth = (token, scope = 'issues:read') => authenticateAppRequest({ headers: new Headers({ Authorization: `Bearer ${token}` }) }, { requiredScopes: [scope] });
  const writes = () => JSON.stringify([users.length, tokens.length, audit.length, workspaces.map(row => row.members)]);
  deps.item = item;
  return { apps, agentApp, cliApp, workspaces, users, tokens, audit, logs, prisma, deps, collection, as, mint, revoke, access, switched, auth, writes, withAppAuth, workspace };
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
    const refused = await f.mint();
    assert.equal(refused.status, status, `${user} must be refused`);
    assert.equal(JSON.stringify(refused.headers), JSON.stringify(noStore));
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

test('simultaneous revocations of one token record one successful revocation', async () => {
  const f = fixture();
  f.as('alice');
  const { id } = (await f.mint()).body;
  const results = await Promise.all([f.revoke(id), f.revoke(id)]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 404]);
  assert.equal(f.audit.filter(row => row.action === 'agent_token.revoked').length, 1);
});

test('a person who shares the name is never reused as the service account', async () => {
  const f = fixture();
  // bob has a CLI login here, as any member who uses the CLI or the assistant does.
  f.tokens.push({ id: 'bob-cli', appId: 'cli-app', workspaceId: 'w1', userId: 'bob', installationId: null, isRevoked: false });
  f.as('alice');
  const { id } = (await f.mint({ name: 'bob' })).body;
  assert.notEqual(f.tokens.find(row => row.id === id).userId, 'bob');
});

test('a service token cannot switch to a workspace it was not given and stops when its member is switched off', async () => {
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
  assert.equal((await p.render('one')).props.workspaceId, 'w1');
  assert.equal(JSON.stringify(manager.props.tokens.map(row => [row.id, row.name, row.access, row.expired]).sort()),
    JSON.stringify([[fresh.id, 'Claude', 'write', false], [stale.id, 'Old bot', 'read', true]].sort()));
  assert.equal(typeof manager.props.tokens[0].createdAt, 'string');
  assert.doesNotMatch(JSON.stringify(manager.props), /collab_at_/);
  f.agentApp.status = 'SUSPENDED';
  assert.equal((await p.render('w1')).props.tokens, null);
});

test('minting for an account that was switched off is refused while its tokens are live, so a pause is never undone by accident', async () => {
  const f = fixture();
  f.as('alice');
  const old = (await f.mint()).body;
  const member = f.workspace('w1').members.find(row => row.userId === f.tokens[0].userId);
  member.status = false; // an admin pauses the agent in the Members list
  const before = f.writes();
  const refused = await f.mint();
  assert.equal(refused.status, 409);
  assert.match(refused.body.error, /switched off/);
  assert.equal(f.writes(), before);
  assert.equal((await f.auth(old.token)).error.statusCode, 403, 'the paused token stays paused');

  // With no live token left there is nothing to switch back on by accident, so minting may reactivate the account.
  await f.revoke(old.id);
  const fresh = await f.mint();
  assert.equal(fresh.status, 201);
  assert.equal(member.status, true);
  assert.equal((await f.auth(fresh.body.token)).success, true);
  assert.equal((await f.auth(old.token)).error.statusCode, 401);
});

test('a switched-off account whose only tokens have expired can be given a new token', async () => {
  const f = fixture();
  f.as('alice');
  await f.mint();
  f.tokens[0].tokenExpiresAt = new Date(Date.now() - 1000);
  const member = f.workspace('w1').members.find(row => row.userId === f.tokens[0].userId);
  member.status = false;
  assert.equal((await f.mint()).status, 201);
  assert.equal(member.status, true);
});

test('an account removed from the workspace is not brought back while it still has usable tokens', async () => {
  const f = fixture();
  f.as('alice');
  const old = (await f.mint()).body;
  const account = f.tokens[0].userId;
  const members = f.workspace('w1').members;
  members.splice(members.findIndex(row => row.userId === account), 1); // the owner removes the member
  const before = f.writes();
  const refused = await f.mint();
  assert.equal(refused.status, 409);
  assert.equal(f.writes(), before);
  assert.equal((await f.auth(old.token)).error.statusCode, 403, 'the removed account\'s token stays unusable');

  await f.revoke(old.id);
  const fresh = await f.mint();
  assert.equal(fresh.status, 201);
  assert.equal(f.tokens.find(row => row.id === fresh.body.id).userId, account, 'the same account is used again');
  assert.equal((await f.auth(fresh.body.token)).success, true);
  assert.equal((await f.auth(old.token)).error.statusCode, 401);
});

const three = [{ id: 'w3', name: 'Three', slug: 'three' }];

test('someone who manages both workspaces lets an agent into a second one, and its token can then switch there', async () => {
  const f = fixture();
  f.as('alice');
  const { token, id } = (await f.mint({ access: 'write' })).body;
  const account = f.tokens[0].userId;
  assert.equal((await f.switched(token, '?workspaceId=w3')).status, 403);

  const granted = await f.access(id, 'w3');
  assert.equal(granted.status, 200);
  assert.equal(JSON.stringify(granted.headers), JSON.stringify(noStore));
  const member = f.workspace('w3').members.find(row => row.userId === account);
  assert.equal(member.role, 'MEMBER');
  assert.equal(member.status, true);
  assert.equal(JSON.stringify(await f.switched(token, '?workspaceId=w3')), JSON.stringify({ status: 200, workspace: 'w3', user: account }));
  assert.equal((await f.switched(token, '?workspace=three')).workspace, 'w3');
  assert.equal((await f.switched(token)).workspace, 'w1', 'without the argument it stays in its own workspace');
  assert.equal((await f.switched(token, '?workspaceId=w2')).status, 403, 'only the workspace it was given');

  const listed = await f.deps['@/lib/agent-tokens'].listAgentTokens('w1');
  assert.equal(JSON.stringify(listed[0].workspaces), JSON.stringify(three));
  const row = f.audit.at(-1);
  assert.equal(JSON.stringify([row.workspaceId, row.actorId, row.action, row.details.serviceUserId, row.details.name, row.details.homeWorkspaceId]),
    JSON.stringify(['w3', 'alice', 'agent_token.workspace_added', account, 'Claude', 'w1']));
  const before = f.writes();
  assert.equal((await f.access(id, 'w3')).status, 200);
  assert.equal(f.writes(), before, 'giving it again changes and records nothing');
});

test('letting an agent into another workspace needs the permission in both, and a refusal writes nothing', async () => {
  const f = fixture();
  f.as('alice');
  const { id } = (await f.mint()).body, gone = (await f.mint({ name: 'Gone' })).body;
  await f.revoke(gone.id);
  f.tokens.push({ id: 'cli-token', appId: 'cli-app', workspaceId: 'w1', userId: 'alice', installationId: null, isRevoked: false });
  const before = f.writes();
  for (const [user, tokenId, target, through, status, why, allowed = true] of [
    [null, id, 'w3', 'w1', 401, 'no session'],
    ['bob', id, 'w3', 'w1', 403, 'a member without the permission'],
    ['alice', id, 'w2', 'w1', 403, 'manages the agent\'s workspace but not the other one'],
    ['erin', id, 'w2', 'w1', 403, 'manages the other workspace but not the agent\'s'],
    ['root', id, 'w3', 'w2', 404, 'the token is not of the workspace in the path'],
    ['root', id, 'missing', 'w1', 404, 'the other workspace does not exist'],
    ['alice', id, 'w1', 'w1', 404, 'its own workspace is not another one'],
    ['alice', gone.id, 'w3', 'w1', 404, 'a revoked token'],
    ['alice', 'cli-token', 'w3', 'w1', 404, 'a CLI login is not an agent token'],
    ['alice', id, 'w2', 'w1', 404, 'nothing to take away in a workspace the agent was never in', false],
    ['alice', id, 'missing', 'w1', 404, 'nor in one that does not exist', false],
  ]) {
    f.as(user);
    const refused = await f.access(tokenId, target, allowed, through);
    assert.equal(refused.status, status, why);
    assert.equal(JSON.stringify(refused.headers), JSON.stringify(noStore));
  }
  f.as('alice');
  for (const body of [null, {}, { workspaceId: 'w3' }, { allowed: true }, { workspaceId: '', allowed: true }, { workspaceId: 'w3', allowed: 'yes' },
    { workspaceId: 'w3', allowed: true, role: 'ADMIN' }]) {
    const invalid = await f.deps.item.PATCH({ json: async () => body }, { params: Promise.resolve({ workspaceId: 'w1', tokenId: id }) });
    assert.equal(invalid.status, 400, JSON.stringify(body));
  }
  assert.equal(f.writes(), before);
});

test('taking the workspace away stops the switch, and the last revoked token switches the agent off everywhere', async () => {
  const f = fixture();
  f.as('alice');
  const first = (await f.mint()).body;
  const account = f.tokens[0].userId;
  const member = () => f.workspace('w3').members.find(row => row.userId === account);
  await f.access(first.id, 'w3');
  assert.equal((await f.switched(first.token, '?workspaceId=w3')).status, 200);

  f.as('carol'); // manages agent tokens in w1 only: enough to pull the agent back, not to send it anywhere
  assert.equal((await f.access(first.id, 'w3')).status, 403);
  assert.equal((await f.access(first.id, 'w3', false)).status, 200);
  assert.equal(member().status, false);
  assert.equal((await f.switched(first.token, '?workspaceId=w3')).status, 403);
  assert.equal((await f.switched(first.token)).workspace, 'w1', 'its own workspace is untouched');
  assert.equal(JSON.stringify((await f.deps['@/lib/agent-tokens'].listAgentTokens('w1'))[0].workspaces), '[]');
  assert.equal(JSON.stringify([f.audit.at(-1).workspaceId, f.audit.at(-1).actorId, f.audit.at(-1).action]), JSON.stringify(['w3', 'carol', 'agent_token.workspace_removed']));

  f.as('alice');
  await f.access(first.id, 'w3');
  assert.equal(member().status, true);
  await f.revoke(first.id);
  assert.equal(member().status, false, 'no usable token left: off in every workspace');
  const fresh = (await f.mint()).body;
  assert.equal(f.tokens.find(row => row.id === fresh.id).userId, account, 'the same account is used again');
  assert.equal((await f.switched(fresh.token)).workspace, 'w1');
  assert.equal((await f.switched(fresh.token, '?workspaceId=w3')).status, 403, 'a new token does not bring the other workspace back');
});

test('a workspace an agent was let into can switch it off without touching its own workspace', async () => {
  const f = fixture();
  f.as('alice');
  const { token, id } = (await f.mint()).body;
  await f.access(id, 'w3');
  f.workspace('w3').members.find(row => row.userId === f.tokens[0].userId).status = false; // switched off in that workspace's Members list
  assert.equal((await f.switched(token, '?workspaceId=w3')).status, 403);
  assert.equal((await f.switched(token)).workspace, 'w1');
});

test('expired tokens cannot grant access and a fresh token clears stale grants', async () => {
  const f = fixture();
  f.as('alice');
  const first = (await f.mint()).body;
  await f.access(first.id, 'w3');
  f.tokens[0].tokenExpiresAt = new Date(Date.now() - 1000);
  assert.equal((await f.access(first.id, 'w2')).status, 403);
  f.as('root');
  const unchanged = f.writes();
  assert.equal((await f.access(first.id, 'w2')).status, 404, 'an account with no usable token is not let into a new workspace');
  assert.equal((await f.access(first.id, 'w3')).status, 200, 'the workspace it is already in stays a no-op');
  assert.equal(f.writes(), unchanged);
  f.as('alice');
  const before = f.audit.length;
  const fresh = (await f.mint()).body;
  assert.equal((await f.switched(fresh.token, '?workspaceId=w3')).status, 403);
  assert.equal(f.audit.slice(before).filter(row => row.workspaceId === 'w3' && row.action === 'agent_token.workspace_removed').length, 1);
});

test('an expired token can manage grants while another token is usable', async () => {
  const f = fixture();
  f.as('alice');
  const first = (await f.mint()).body;
  const second = (await f.mint()).body;
  f.tokens[0].tokenExpiresAt = new Date(Date.now() - 1000);
  assert.equal((await f.access(first.id, 'w3')).status, 200);
  assert.equal((await f.switched(second.token, '?workspaceId=w3')).status, 200);
  await f.revoke(first.id);
  assert.equal((await f.access(first.id, 'w3')).status, 404);
});

test('reactivated memberships have member role and revocation audits every changed workspace', async () => {
  const f = fixture();
  f.as('alice');
  const first = (await f.mint()).body;
  await f.access(first.id, 'w3');
  const member = f.workspace('w3').members.find(row => row.userId === f.tokens[0].userId);
  member.role = 'ADMIN';
  await f.access(first.id, 'w3', false);
  await f.access(first.id, 'w3');
  assert.equal(member.role, 'MEMBER');
  const before = f.audit.length;
  await f.revoke(first.id);
  assert.equal(member.status, false);
  assert.equal(f.audit.slice(before).filter(row => row.workspaceId === 'w3' && row.action === 'agent_token.workspace_removed').length, 1);
  const home = f.workspace('w1').members.find(row => row.userId === f.tokens[0].userId);
  home.role = 'ADMIN';
  await f.mint();
  assert.equal(home.role, 'MEMBER');
});

test('the agent tokens page offers only the other workspaces the viewer manages', async () => {
  const f = fixture(), p = page(f);
  f.as('alice');
  const { id } = (await f.mint()).body;
  await f.access(id, 'w3');
  f.workspace('w2').members.push({ userId: 'alice', role: 'MEMBER', status: true }); // a member there, without the permission
  const manager = await p.render('w1');
  assert.equal(JSON.stringify(manager.props.workspaces), JSON.stringify(three));
  assert.equal(JSON.stringify(manager.props.tokens[0].workspaces), JSON.stringify(three));
  f.as('carol');
  const limited = await p.render('w1');
  assert.equal(JSON.stringify(limited.props.workspaces), '[]', 'carol manages no other workspace');
  assert.equal(JSON.stringify(limited.props.tokens[0].workspaces), JSON.stringify(three), 'but she sees where the agent can go');
});
