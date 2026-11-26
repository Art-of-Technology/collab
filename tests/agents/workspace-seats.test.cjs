const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { Prisma } = require('@prisma/client');
const { load } = require('../security/helpers.cjs');
const { seatsDatabase } = require('./seats-db.cjs');

// CLB-613: a seat whose scope is the whole workspace. Only someone who may manage the workspace's permissions makes one;
// it is stored without a project, reads itself with that scope, and is listed with it. Release stays one per project.
const owner = 'cowner00001', manager = 'cmanager001', person = 'cperson0001';
const P = 'cprojectp001';
const scopes = ['issues:read', 'issues:write', 'user:read'];
const plain = value => JSON.parse(JSON.stringify(value));

let db;
after(() => db?.stop());

test('a seat with the scope "whole workspace" (CLB-613)', async t => {
  db = await seatsDatabase(async prisma => {
    await prisma.user.createMany({ data: [owner, manager, person].map(id => ({ id, name: id })) });
    await prisma.workspace.create({ data: { id: 'w', name: 'w', slug: 'w-slug', ownerId: owner } });
    // The manager may manage agents, not the workspace's permissions.
    await prisma.workspaceMember.create({ data: { workspaceId: 'w', userId: manager, role: 'ADMIN' } });
    await prisma.rolePermission.create({ data: { workspaceId: 'w', role: 'ADMIN', permission: 'MANAGE_AGENTS' } });
    await prisma.workspaceMember.create({ data: { workspaceId: 'w', userId: person } });
    await prisma.project.create({ data: { id: P, workspaceId: 'w', name: 'Project P', slug: 'p', issuePrefix: 'PP', agentMode: 'seats' } });
    await prisma.repository.create({ data: { id: 'crepop00001', projectId: P, githubRepoId: 'acme/p', owner: 'acme', name: 'p', fullName: 'acme/p', webhookSecret: 'secret', accessToken: 'token' } });
    for (const [id, slug] of [['agent-app', 'collab-agent'], ['person-app', 'collab-cli']]) {
      await prisma.app.create({ data: { id, name: slug, slug, publisherId: 'system', status: 'PUBLISHED', visibility: 'PRIVATE', isSystemApp: true,
        scopes: { create: scopes.map(scope => ({ scope })) } } });
    }
  });
  const raw = db.prisma;
  const prisma = raw.$extends(load('src/lib/issue-visibility.ts').issueVisibilityExtension(Prisma.dmmf.datamodel.models));

  const crypto = { encryptToken: async value => Buffer.from(value), decryptToken: async data => Buffer.from(data).toString(), getEncryptionKey: () => {} };
  const zod = require('zod');
  const response = { NextResponse: Response };
  const globals = { console, URL, Date, Buffer, process: { env: {} } };
  const finder = load('src/lib/issue-finder.ts', { '@/lib/prisma': { prisma } });
  const handoffs = load('src/lib/agent-handoffs.ts', { 'node:crypto': require('node:crypto'), 'node:buffer': require('node:buffer'), zod,
    '@/lib/prisma': { prisma }, '@/lib/issue-finder': finder, '@/lib/oauth-scopes': load('src/lib/oauth-scopes.ts') }, { Date });
  const tokens = load('src/lib/agent-tokens.ts', { crypto: require('node:crypto'), '@/lib/prisma': { prisma }, '@/lib/apps/crypto': crypto }, { Buffer, Date });
  const repositories = load('src/lib/agent-repository.ts', {}, { URL });
  const assignee = load('src/lib/issue-assignee.ts', { './agent-handoffs': handoffs });
  const seats = load('src/lib/agent-seats.ts', { '@/lib/prisma': { prisma }, '@/lib/agent-handoffs': handoffs, '@/lib/agent-tokens': tokens,
    '@/lib/agent-repository': repositories, '@/lib/issue-assignee': assignee }, { Date });
  const middleware = load('src/lib/apps/auth-middleware.ts', { crypto: require('node:crypto'), 'next/server': response,
    '@/lib/apps/crypto': crypto, '@/lib/oauth-scopes': load('src/lib/oauth-scopes.ts'), '@/lib/post-access': load('src/lib/post-access.ts'),
    '@/lib/auth-error-diagnostics': load('src/lib/auth-error-diagnostics.ts'), '@/lib/prisma': { prisma } }, globals);
  // Who is signed in to the app.
  let actor = owner;
  const permissions = load('src/lib/permissions.ts', { './prisma': { prisma } }, { console });
  const deps = { zod, 'next/server': response, '@/lib/prisma': { prisma }, '@/lib/apps/auth-middleware': middleware, '@/lib/agent-seats': seats,
    '@/lib/agent-repository': repositories, '@/lib/issue-assignee': assignee,
    '@/lib/agent-handoff-http': load('src/lib/agent-handoff-http.ts', { zod, 'next/server': response, './agent-handoffs': handoffs }, globals),
    '@/lib/issue-finder': finder, '@/lib/permissions': permissions, '@/lib/agent-tokens': tokens, '@/lib/post-access': load('src/lib/post-access.ts'),
    '@/lib/request-session': { getServerSession: async () => actor ? { user: { id: actor } } : null }, '@/lib/auth-options': { authOptions: {} } };
  deps['@/lib/agent-runs'] = load('src/lib/agent-runs.ts', deps, { Date });
  deps['@/lib/agent-runners'] = load('src/lib/agent-runners.ts', { crypto: require('node:crypto'), '@/lib/prisma': { prisma }, '@/lib/agent-handoffs': handoffs,
    '@/lib/agent-tokens': tokens }, { Date });
  const seatsRoute = load('src/app/api/workspaces/[workspaceId]/agent-seats/route.ts', deps, globals);
  const seatsMe = load('src/app/api/apps/auth/seats/me/route.ts', deps, globals);
  const page = load('src/lib/agents-page.ts', deps, { Date });

  /** The create-seat form's request, as the signed-in person: the status and the body. */
  const create = async (name, extra, as = owner) => {
    actor = as;
    const reply = await seatsRoute.POST(new Request('https://collab.test/api', { method: 'POST',
      body: JSON.stringify({ name, ownerId: person, expiresInDays: 30, ...extra }) }), { params: Promise.resolve({ workspaceId: 'w' }) });
    actor = owner;
    return [reply.status, await reply.json()];
  };
  const whole = { scope: 'workspace' };
  const me = async token => {
    const reply = await seatsMe.GET(new Request('https://collab.test/api', { headers: { Authorization: `Bearer ${token}` } }), { params: Promise.resolve({}) });
    return [reply.status, await reply.json()];
  };
  const created = (status, body) => assert.equal(status, 201, JSON.stringify(body));

  // A project seat made before any workspace seat, to compare what it reads afterwards.
  const [devStatus, projectDev] = await create('dev-p', { projectId: P, role: 'developer' });
  created(devStatus, projectDev);
  const before = { me: plain(await me(projectDev.token.token)) };
  let wsDev;

  await t.test('only who may manage the workspace\'s permissions creates a workspace seat; the server refuses everyone else', async () => {
    const count = await raw.agentSeat.count();
    const [refused, body] = await create('ws-x', { ...whole, role: 'developer' }, manager);
    assert.equal(refused, 403, JSON.stringify(body));
    assert.equal(await raw.agentSeat.count(), count);
    // The same person still makes a project seat.
    const [status, made] = await create('dev-m', { projectId: P, role: 'developer' }, manager);
    created(status, made);
    // And a member who may not manage agents makes neither.
    assert.equal((await create('ws-y', { ...whole, role: 'developer' }, person))[0], 403);
  });

  await t.test('a workspace seat is stored without a project; a project seat still needs its project', async () => {
    const [status, body] = await create('ws-dev', { ...whole, role: 'developer' });
    created(status, body);
    wsDev = body;
    const row = await raw.agentSeat.findUniqueOrThrow({ where: { id: body.seat.id } });
    assert.deepEqual([row.workspaceId, row.projectId, row.role, row.isDefault], ['w', null, 'developer', true]);
    const audit = await raw.appAuditLog.findFirstOrThrow({ where: { action: 'agent_seat.created', details: { path: ['seatId'], equals: body.seat.id } } });
    assert.equal(audit.details.projectId, null);
    // A workspace seat names no project, and a seat without a scope is one project's, which it must name.
    assert.equal((await create('ws-both', { ...whole, projectId: P, role: 'developer' }))[0], 400);
    assert.equal((await create('ws-none', { role: 'developer' }))[0], 400);
    assert.equal((await create('ws-p', { scope: 'project', role: 'developer' }))[0], 400);
    // The repository comes from each issue's project, so a workspace seat picks none.
    const [repo, refusal] = await create('ws-repo', { ...whole, role: 'developer', repositoryId: 'crepop00001' });
    assert.deepEqual([repo, refusal.code], [400, 'repository_not_needed']);
  });

  await t.test('a release seat cannot have the scope "whole workspace", built-in or as the organisation\'s own role', async () => {
    const count = await raw.agentSeat.count();
    const [status, body] = await create('ws-rel', { ...whole, role: 'release' });
    assert.deepEqual([status, body.code], [400, 'release_one_project']);
    const gate = await raw.agentCustomRole.create({ data: { workspaceId: 'w', name: 'Gatekeeper', baseRole: 'release', instructions: 'Ship it.' } });
    assert.deepEqual((await create('ws-gate', { ...whole, customRoleId: gate.id }))[1].code, 'release_one_project');
    assert.equal(await raw.agentSeat.count(), count);
  });

  await t.test('a workspace has at most one workspace Lead, beside each project\'s own', async () => {
    created(...await create('ws-lead', { ...whole, role: 'lead' }));
    const [status, body] = await create('ws-lead2', { ...whole, role: 'lead' });
    assert.deepEqual([status, body.code], [409, 'lead_seat_exists']);
    assert.match(body.error, /workspace/);
    created(...await create('lead-p', { projectId: P, role: 'lead' }));
  });

  await t.test('at most one default workspace seat per role; the project\'s default is untouched', async () => {
    const [, second] = await create('ws-dev2', { ...whole, role: 'developer' });
    assert.equal(second.seat.isDefault, false);
    const [, third] = await create('ws-dev3', { ...whole, role: 'developer', isDefault: true });
    assert.equal(third.seat.isDefault, true);
    const defaults = await raw.agentSeat.findMany({ where: { workspaceId: 'w', role: 'developer', isDefault: true, retiredAt: null }, select: { name: true }, orderBy: { name: 'asc' } });
    assert.deepEqual(defaults.map(seat => seat.name), ['dev-p', 'ws-dev3']);
  });

  await t.test('GET seats/me returns the scope and no project', async () => {
    const [status, body] = await me(wsDev.token.token);
    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(body.scope, 'workspace');
    assert.equal(body.project, null);
    assert.deepEqual(body.seat, { id: wsDev.seat.id, projectId: null, role: 'developer', ownerId: person, name: 'ws-dev', isDefault: false });
    // A project seat reads what it read before, with its scope.
    const [, mine] = await me(projectDev.token.token);
    assert.deepEqual({ seat: mine.seat, project: mine.project }, { seat: before.me[1].seat, project: before.me[1].project });
    assert.equal(mine.scope, 'project');
  });

  await t.test('the seats list shows each seat\'s scope: a workspace seat has no project', async () => {
    const view = plain(await page.readSeats(owner, 'w'));
    const scopeOf = Object.fromEntries(view.seats.map(seat => [seat.name, seat.project]));
    assert.deepEqual(scopeOf, { 'dev-p': 'Project P', 'dev-m': 'Project P', 'lead-p': 'Project P', 'ws-dev': null, 'ws-dev2': null, 'ws-dev3': null, 'ws-lead': null });
    // It waits for nothing until a workspace seat has an inbox.
    assert.deepEqual(view.seats.find(seat => seat.name === 'ws-dev').waiting, []);
    // A member sees the workspace's seats too.
    assert.ok(plain(await page.readSeats(person, 'w')).seats.some(seat => seat.name === 'ws-dev'));
  });
});
