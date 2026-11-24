const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { Prisma } = require('@prisma/client');
const { load } = require('../security/helpers.cjs');
const { seatsDatabase } = require('./seats-db.cjs');

// Token-facing routes accept only cuid-shaped ids.
const owner = 'cowner00001', person = 'cperson0001', stranger = 'cstranger01';
const P = 'cprojectp001';
const scopes = ['issues:read', 'issues:write', 'user:read'];
const ago = seconds => new Date(Date.now() - seconds * 1000);
// What the loaded code returns was made in its own context: compared as data.
const plain = value => JSON.parse(JSON.stringify(value));

let db;
after(() => db?.stop());

test("a seat with the organisation's own role: created from the form, listed by the role's name, working as its base role (CLB-628)", async t => {
  db = await seatsDatabase(async prisma => {
    await prisma.user.createMany({ data: [owner, person, stranger].map(id => ({ id, name: id })) });
    await prisma.workspace.create({ data: { id: 'w', name: 'w', slug: 'w-slug', ownerId: owner } });
    await prisma.workspace.create({ data: { id: 'x', name: 'x', slug: 'x', ownerId: stranger } });
    await prisma.workspaceMember.create({ data: { workspaceId: 'w', userId: person } });
    await prisma.project.create({ data: { id: P, workspaceId: 'w', name: 'Project P', slug: 'p', issuePrefix: 'PP', agentMode: 'seats' } });
    await prisma.projectStatus.createMany({ data: ['to_do', 'in_progress', 'done'].map((name, order) => ({ id: `${P}-${name}`, projectId: P, name, displayName: name,
      order, category: name, isFinal: name === 'done' })) });
    await prisma.repository.create({ data: { projectId: P, githubRepoId: 'acme/p', owner: 'acme', name: 'p', fullName: 'acme/p', webhookSecret: 'secret', accessToken: 'token' } });
    for (const [id, slug] of [['agent-app', 'collab-agent'], ['person-app', 'collab-cli']]) {
      await prisma.app.create({ data: { id, name: slug, slug, publisherId: 'system', status: 'PUBLISHED', visibility: 'PRIVATE', isSystemApp: true,
        scopes: { create: scopes.map(scope => ({ scope })) } } });
    }
  });
  const raw = db.prisma;
  // The application's client, so Trash is hidden here as it is in production.
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
  class ForgeProjectWriteError extends Error {}
  // Who is signed in to the app: null is nobody.
  let actor = owner;
  const permissions = load('src/lib/permissions.ts', { './prisma': { prisma } }, { console });
  const deps = { '@/lib/forge/legacy-write-guard': { ForgeProjectWriteError, assertLegacyIssueWriteAllowed: async () => {} },
    zod, 'next/server': response, '@/lib/prisma': { prisma }, '@/lib/apps/auth-middleware': middleware, '@/lib/agent-seats': seats,
    '@/lib/agent-repository': repositories, '@/lib/issue-assignee': assignee,
    '@/lib/agent-handoff-http': load('src/lib/agent-handoff-http.ts', { zod, 'next/server': response, './agent-handoffs': handoffs }, globals),
    '@/lib/issue-finder': finder, '@/lib/permissions': permissions, '@/lib/agent-tokens': tokens,
    '@/lib/session': { getCurrentUser: async () => actor ? { id: actor } : null }, '@/lib/post-access': load('src/lib/post-access.ts'),
    '@/lib/slug-resolvers': { resolveWorkspaceSlug: async id => id },
    '@/lib/request-session': { getServerSession: async () => actor ? { user: { id: actor } } : null }, '@/lib/auth-options': { authOptions: {} } };
  deps['@/lib/agent-runs'] = load('src/lib/agent-runs.ts', deps, { Date });
  deps['@/lib/agent-runners'] = load('src/lib/agent-runners.ts', { crypto: require('node:crypto'), '@/lib/prisma': { prisma }, '@/lib/agent-handoffs': handoffs,
    '@/lib/agent-tokens': tokens }, { Date });
  const runs = load('src/app/api/apps/auth/runs/route.ts', deps, globals);
  const contextRoute = load('src/app/api/apps/auth/issues/[issueIdOrKey]/run-context/route.ts', deps, globals);
  const seatsRoute = load('src/app/api/workspaces/[workspaceId]/agent-seats/route.ts', deps, globals);
  const membersRoute = load('src/app/api/workspaces/[workspaceId]/members/route.ts', deps, globals);
  const page = load('src/lib/agents-page.ts', deps, { Date });
  const seatPage = load('src/lib/agent-seat-instructions.ts', deps);
  const { ROLE_CATALOGUE } = load('src/lib/agent-role-catalogue.ts');

  /** The create-seat form's request, as the signed-in person: the status and the body. */
  const create = async (name, extra) => {
    const reply = await seatsRoute.POST(new Request('https://collab.test/api', { method: 'POST',
      body: JSON.stringify({ name, projectId: P, ownerId: person, expiresInDays: 30, ...extra }) }), { params: Promise.resolve({ workspaceId: 'w' }) });
    return [reply.status, await reply.json()];
  };
  const role = (name, baseRole, data = {}) => raw.agentCustomRole.create({ data: { workspaceId: 'w', name, baseRole, instructions: `${name}: test the way a user would.`, ...data } });
  const qa = await role('QA Tester', 'developer');
  const gate = await role('Gatekeeper', 'release');
  const old = await role('Old Hand', 'developer', { retiredAt: ago(60) });
  const theirs = await raw.agentCustomRole.create({ data: { workspaceId: 'x', name: 'QA Tester', baseRole: 'developer', instructions: 'theirs' } });
  let tester;

  await t.test("a seat is created with the organisation's role: it has the role, and the base role in `role`", async () => {
    const [status, body] = await create('qa-1', { customRoleId: qa.id });
    assert.equal(status, 201, JSON.stringify(body));
    tester = { ...body.seat, token: body.token.token };
    const row = await raw.agentSeat.findUniqueOrThrow({ where: { id: tester.id } });
    assert.deepEqual([row.role, row.customRoleId, row.projectId, row.ownerId], ['developer', qa.id, P, person]);
    // The audit row says which role it was made with.
    const audit = await raw.appAuditLog.findFirstOrThrow({ where: { action: 'agent_seat.created', details: { path: ['seatId'], equals: tester.id } } });
    assert.deepEqual([audit.details.role, audit.details.customRoleId], ['developer', qa.id]);
    // Asked again under the same name and role, it is the same seat with a further token.
    const [again, more] = await create('qa-1', { customRoleId: qa.id });
    assert.deepEqual([again, more.seat.id, typeof more.token.token], [201, tester.id, 'string']);
  });

  await t.test("a retired role, another workspace's role, an unknown one, or a built-in role named beside it is refused, and nothing is made", async () => {
    const before = await raw.agentSeat.count();
    const refused = async (name, extra, status, code) => {
      const [got, body] = await create(name, extra);
      assert.deepEqual([got, body.code], [status, code], `${name}: ${JSON.stringify(body)}`);
      return body;
    };
    assert.match((await refused('old-1', { customRoleId: old.id }, 409, 'role_retired')).error, /retired/i);
    await refused('their-1', { customRoleId: theirs.id }, 400, 'invalid_role');
    await refused('none-1', { customRoleId: 'cnosuchrole1' }, 400, 'invalid_role');
    // The role is the custom role's base role: a request names one or the other, never both, and always one.
    assert.equal((await create('both-1', { role: 'developer', customRoleId: qa.id }))[0], 400);
    assert.equal((await create('neither-1', {}))[0], 400);
    // The same name as a built-in seat of the same base role is another seat: the name is taken.
    await refused('qa-1', { role: 'developer' }, 409, 'seat_exists');
    assert.equal(await raw.agentSeat.count(), before);
    // Nobody but a permission manager makes one.
    actor = person;
    assert.equal((await create('qa-2', { customRoleId: qa.id }))[0], 403);
    actor = owner;
  });

  await t.test("the base role's rules hold: a project's one release seat counts a seat whose role behaves like Release", async () => {
    const [status, body] = await create('gate-1', { customRoleId: gate.id });
    assert.equal(status, 201, JSON.stringify(body));
    assert.equal((await raw.agentSeat.findUniqueOrThrow({ where: { id: body.seat.id } })).role, 'release');
    assert.deepEqual((await create('rel-1', { role: 'release' }))[1].code, 'release_seat_exists');
    // A Release-like seat takes release requests and no ordinary issue.
    await assignee.assertAssignable(prisma, { workspaceId: 'w', projectId: P, agentRequestRole: 'release' }, body.seat.userId);
    await assert.rejects(assignee.assertAssignable(prisma, { workspaceId: 'w', projectId: P, agentRequestRole: null }, body.seat.userId), { code: 'role_mismatch' });
    // And the QA Tester takes what a Developer takes.
    await assignee.assertAssignable(prisma, { workspaceId: 'w', projectId: P, agentRequestRole: null }, tester.userId);
    await assert.rejects(assignee.assertAssignable(prisma, { workspaceId: 'w', projectId: P, agentRequestRole: 'review' }, tester.userId), { code: 'role_mismatch' });
  });

  await t.test("the seat works an issue as a Developer, with the role's instructions as a fourth layer", async () => {
    const made = await raw.issue.create({ data: { workspaceId: 'w', projectId: P, title: 'Try it', issueKey: 'PP-1', statusId: `${P}-to_do`, assigneeId: tester.userId, createdAt: ago(900) } });
    await raw.issueAssignee.create({ data: { issueId: made.id, userId: tester.userId, role: 'ASSIGNEE', status: 'APPROVED', assignedAt: ago(600), approvedAt: ago(600) } });
    const headers = { Authorization: `Bearer ${tester.token}` };
    const checkout = await runs.POST(new Request('https://collab.test/api', { method: 'POST', headers,
      body: JSON.stringify({ issue: made.issueKey, generation: 'g1', runner: 'test' }) }), { params: Promise.resolve({}) });
    assert.equal(checkout.status, 200, JSON.stringify(await checkout.clone().json()));
    assert.equal((await checkout.json()).repository.name, 'acme/p');
    const context = await (await contextRoute.GET(new Request('https://collab.test/api', { headers }), { params: Promise.resolve({ issueIdOrKey: made.issueKey }) })).json();
    assert.deepEqual(context.instructions, [
      { layer: 'platform', text: ROLE_CATALOGUE.getRole('developer').platformPrompt.replaceAll('{{ownerId}}', person) },
      { layer: 'organisation', text: '' },
      { layer: 'role', text: 'QA Tester: test the way a user would.' },
      { layer: 'seat', text: '' },
    ]);
  });

  await t.test("every list of seats names the organisation's role, and keeps the base role beside it", async () => {
    // The Agents page, in the order of the roles they behave as.
    const view = await page.readSeats(owner, 'w-slug');
    assert.deepEqual(plain(view.seats.map(seat => [seat.name, seat.role, seat.customRole])), [['qa-1', 'developer', 'QA Tester'], ['gate-1', 'release', 'Gatekeeper']]);
    // A seat's own page.
    assert.deepEqual(plain((await seatPage.readSeatPage(owner, 'w', tester.id)).seat).customRole, 'QA Tester');
    // The Agent tokens settings: the live seats, each token's seat, and the roles the form offers, retired ones left out.
    const choices = await tokens.listSeatOwnerChoices('w');
    assert.deepEqual(plain(choices.seats.map(seat => [seat.name, seat.role, seat.customRole]).sort()), [['gate-1', 'release', 'Gatekeeper'], ['qa-1', 'developer', 'QA Tester']]);
    assert.deepEqual(plain(choices.customRoles), [{ id: gate.id, name: 'Gatekeeper', baseRole: 'release' }, { id: qa.id, name: 'QA Tester', baseRole: 'developer' }]);
    const listed = await tokens.listAgentTokens('w');
    assert.deepEqual(plain([...new Set(listed.map(token => `${token.name}: ${token.seat.role} ${token.seat.customRole}`))].sort()), ['gate-1: release Gatekeeper', 'qa-1: developer QA Tester']);
    // The project's runner seats.
    assert.deepEqual(plain((await deps['@/lib/agent-runners'].runnerSeats(prisma, P)).map(seat => seat.customRole)), []);
    await raw.agentSeat.update({ where: { id: tester.id }, data: { byRunner: true } });
    assert.deepEqual(plain((await deps['@/lib/agent-runners'].runnerSeats(prisma, P)).map(seat => [seat.role, seat.customRole])), [['developer', 'QA Tester']]);
    await raw.agentSeat.update({ where: { id: tester.id }, data: { byRunner: false } });
    // The assignee picker's members.
    const members = await (await membersRoute.GET(new Request('https://collab.test/api'), { params: Promise.resolve({ workspaceId: 'w' }) })).json();
    const seatOf = id => members.find(member => member.user.id === id)?.user.agentSeat;
    assert.deepEqual(plain(seatOf(tester.userId)), { projectId: P, role: 'developer', retiredAt: null, customRole: { name: 'QA Tester' } });
  });

  await t.test('a seat whose role is retired afterwards keeps it and is still listed by its name', async () => {
    await raw.agentCustomRole.update({ where: { id: qa.id }, data: { retiredAt: new Date() } });
    const view = await page.readSeats(owner, 'w');
    assert.equal(view.seats.find(seat => seat.id === tester.id).customRole, 'QA Tester');
    assert.deepEqual(plain((await tokens.listSeatOwnerChoices('w')).customRoles.map(row => row.name)), ['Gatekeeper']);
    // No new seat takes it.
    assert.equal((await create('qa-3', { customRoleId: qa.id }))[1].code, 'role_retired');
  });
});
