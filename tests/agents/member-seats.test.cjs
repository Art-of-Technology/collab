const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('../security/helpers.cjs');
const { seatsDatabase } = require('./seats-db.cjs');

// Two members share the first name Bob; the stranger is in no workspace.
const owner = 'cowner00001', deniz = 'cdeniz00001', bob = 'cbob0000001', bobToo = 'cbob0000002', stranger = 'cstranger01';
const P = 'cprojectp001', OLD = 'cprojecto001';
const scopes = ['issues:read', 'issues:write', 'user:read'];

let db;
after(() => db?.stop());

test('a member adds their own seats to a project, once its owner has switched that on', async t => {
  db = await seatsDatabase(async prisma => {
    await prisma.user.createMany({ data: [[owner, 'Cem Owner'], [deniz, 'Deniz Kaya'], [bob, 'Bob Stone'], [bobToo, 'Bob Other'], [stranger, 'Sam Stranger']]
      .map(([id, name]) => ({ id, name, email: `${id}@example.test` })) });
    await prisma.workspace.create({ data: { id: 'w', name: 'w', slug: 'w', ownerId: owner } });
    await prisma.workspaceMember.createMany({ data: [deniz, bob, bobToo].map(userId => ({ workspaceId: 'w', userId })) });
    for (const [id, name, issuePrefix, isArchived] of [[P, 'Collab', 'CLB', false], [OLD, 'Old', 'OLD', true]]) {
      await prisma.project.create({ data: { id, workspaceId: 'w', name, slug: issuePrefix.toLowerCase(), issuePrefix, isArchived } });
      await prisma.projectStatus.createMany({ data: ['to_do', 'in_progress', 'done'].map((status, order) => ({ id: `${id}-${status}`, projectId: id, name: status,
        displayName: status, order, isDefault: order === 0, isFinal: status === 'done' })) });
    }
    await prisma.app.create({ data: { id: 'agent-app', name: 'collab-agent', slug: 'collab-agent', publisherId: 'system', status: 'PUBLISHED', visibility: 'PRIVATE', isSystemApp: true,
      scopes: { create: scopes.map(scope => ({ scope })) } } });
  });
  const { prisma } = db;
  // Set here: the seats migration ran after the seed and made the column again.
  await prisma.project.updateMany({ data: { agentMode: 'seats' } });

  // Tokens are stored readable here: the seats are under test, not encryption.
  const crypto = { encryptToken: async value => Buffer.from(value), decryptToken: async data => Buffer.from(data).toString(), getEncryptionKey: () => {} };
  const zod = require('zod');
  const finder = load('src/lib/issue-finder.ts', { '@/lib/prisma': { prisma } });
  const handoffs = load('src/lib/agent-handoffs.ts', { 'node:crypto': require('node:crypto'), 'node:buffer': require('node:buffer'), zod,
    '@/lib/prisma': { prisma }, '@/lib/issue-finder': finder, '@/lib/oauth-scopes': load('src/lib/oauth-scopes.ts') }, { Date });
  const tokens = load('src/lib/agent-tokens.ts', { crypto: require('node:crypto'), '@/lib/prisma': { prisma }, '@/lib/apps/crypto': crypto }, { Buffer, Date });
  const assignee = load('src/lib/issue-assignee.ts', { './agent-handoffs': handoffs });
  const seats = load('src/lib/agent-seats.ts', { '@/lib/prisma': { prisma }, '@/lib/agent-handoffs': handoffs, '@/lib/agent-tokens': tokens, '@/lib/issue-assignee': assignee }, { Date });
  const runners = load('src/lib/agent-runners.ts', { crypto: require('node:crypto'), '@/lib/prisma': { prisma }, '@/lib/agent-handoffs': handoffs, '@/lib/agent-tokens': tokens }, { Date });
  let user = owner;
  const deps = { zod, '@/lib/prisma': { prisma }, '@/lib/agent-handoffs': handoffs, '@/lib/agent-seats': seats, '@/lib/issue-assignee': assignee, '@/lib/issue-finder': finder,
    '@/lib/agent-tokens': tokens, '@/lib/agent-runners': runners, 'next/server': { NextResponse: Response }, '@/lib/apps/auth-middleware': {},
    '@/lib/request-session': { getServerSession: async () => user ? { user: { id: user } } : null }, '@/lib/auth-options': { authOptions: {} },
    '@/lib/slug-resolvers': { resolveWorkspaceSlug: async id => id },
    // Only the workspace's owner may manage its permissions here.
    '@/lib/permissions': { Permission: { MANAGE_WORKSPACE_PERMISSIONS: 'MANAGE_WORKSPACE_PERMISSIONS' }, checkUserPermission: async userId => ({ hasPermission: userId === owner }) } };
  deps['@/lib/agent-runs'] = load('src/lib/agent-runs.ts', deps, { Date });
  deps['@/lib/agent-mode'] = load('src/lib/agent-mode.ts', deps, { Date });
  deps['@/lib/agent-seat-setup'] = load('src/lib/agent-seat-setup.ts', deps, { Date });
  const mine = load('src/app/api/workspaces/[workspaceId]/agent-seats/mine/route.ts', deps, { URL });
  const anySeat = load('src/app/api/workspaces/[workspaceId]/agent-seats/route.ts', deps);
  const mode = load('src/app/api/workspaces/[workspaceId]/projects/[projectSlug]/agent-mode/route.ts', deps);

  /** One call as the signed-in person `as`: the status and the body. */
  const call = async (as, handler, params, { body, query = '' } = {}) => {
    user = as;
    const reply = await handler(new Request(`https://collab.test/api${query}`, { method: 'POST', ...(body && { body: JSON.stringify(body) }) }), { params: Promise.resolve({ workspaceId: 'w', ...params }) });
    return [reply.status, await reply.json()];
  };
  const add = (as, projectId = P, extra = {}) => call(as, mine.POST, {}, { body: { projectId, ...extra } });
  const remove = (as, projectId = P) => call(as, mine.DELETE, {}, { query: `?projectId=${projectId}` });
  const allow = (as, membersAddSeats) => call(as, mode.PATCH, { projectSlug: 'clb' }, { body: { membersAddSeats } });
  const rows = (where = {}) => prisma.agentSeat.findMany({ where: { projectId: P, retiredAt: null, ...where }, orderBy: [{ role: 'asc' }, { name: 'asc' }],
    select: { name: true, role: true, ownerId: true, byRunner: true, isDefault: true } });
  const names = async where => (await rows(where)).map(seat => seat.name);
  const made = (name, role, ownerId, by = owner) => seats.createSeat({ workspaceId: 'w', actorId: by, projectId: P, role, ownerId, name, expiresInDays: 30 });

  // The project as it is before any member arrives: the owner's lead, and a default developer and reviewer seat.
  await made('Collab Lead', 'lead', owner);
  await made('Collab Developer', 'developer', owner);
  await made('Collab Reviewer', 'reviewer', owner);
  const before = await rows();
  const accounts = await prisma.user.count();

  await t.test('the switch is off for every project, and while it is off nothing is made', async () => {
    assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: P } })).membersAddSeats, false);
    const [status, body] = await add(deniz);
    assert.deepEqual([status, body.code, body.error], [403, 'members_add_off', 'The project owner has not switched this on.']);
    assert.deepEqual(await rows(), before);
    assert.equal(await prisma.user.count(), accounts, 'no agent account is left behind by a refusal');
  });

  await t.test('only someone who manages the workspace changes the switch', async () => {
    assert.equal((await allow(deniz, true))[0], 403);
    assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: P } })).membersAddSeats, false);
    const [status, body] = await allow(owner, true);
    assert.deepEqual([status, body.membersAddSeats, body.mode], [200, true, 'seats']);
    assert.equal(await prisma.appAuditLog.count({ where: { actorId: owner, action: 'project.members_add_seats' } }), 1);
    // Saying the same again is no change, and is not logged as one.
    await allow(owner, true);
    assert.equal(await prisma.appAuditLog.count({ where: { action: 'project.members_add_seats' } }), 1);
  });

  await t.test('one press makes a developer, a reviewer and a security seat of the member, run by the member\'s runner', async () => {
    const [status, body] = await add(deniz);
    assert.deepEqual([status, body.created], [201, ['Collab Developer (Deniz)', 'Collab Reviewer (Deniz)', 'Collab Security (Deniz)']]);
    // A default that exists stays where it is; security had no seat, so the first one is its default as for any seat.
    assert.deepEqual(await rows({ ownerId: deniz }), [
      { name: 'Collab Developer (Deniz)', role: 'developer', ownerId: deniz, byRunner: true, isDefault: false },
      { name: 'Collab Reviewer (Deniz)', role: 'reviewer', ownerId: deniz, byRunner: true, isDefault: false },
      { name: 'Collab Security (Deniz)', role: 'security', ownerId: deniz, byRunner: true, isDefault: true }]);
    assert.deepEqual(await rows({ ownerId: owner }), before, 'the seats that were there keep their owner and their default');
    assert.equal(await prisma.agentSeat.count({ where: { ownerId: deniz, role: { in: ['lead', 'release'] } } }), 0);
    // A runner fetches the tokens: none is made here, and none is in the reply.
    const accountIds = (await prisma.agentSeat.findMany({ where: { ownerId: deniz }, select: { userId: true } })).map(seat => seat.userId);
    assert.equal(await prisma.appToken.count({ where: { userId: { in: accountIds } } }), 0);
    assert.ok(!JSON.stringify(body).includes('collab_at_'));
    // Pressing again makes nothing.
    assert.deepEqual(await add(deniz), [201, { created: [] }]);
    assert.equal(await prisma.agentSeat.count({ where: { ownerId: deniz } }), 3);
  });

  await t.test('a member cannot add seats for someone else', async () => {
    const seen = await rows();
    // The member's own route takes no owner, and the route that does is not a member's.
    assert.equal((await add(bob, P, { ownerId: deniz }))[0], 400);
    assert.equal((await call(bob, anySeat.POST, {}, { body: { name: 'Collab Developer (Deniz 2)', projectId: P, role: 'developer', ownerId: deniz, byRunner: true } }))[0], 403);
    assert.deepEqual(await rows(), seen);
    assert.equal((await call(null, mine.POST, {}, { body: { projectId: P } }))[0], 401);
  });

  await t.test('only the roles the member has no seat of are made', async () => {
    await made('Bob reviews', 'reviewer', bob);
    assert.deepEqual((await add(bob))[1], { created: ['Collab Developer (Bob)', 'Collab Security (Bob)'] });
    assert.deepEqual(await names({ ownerId: bob }), ['Collab Developer (Bob)', 'Bob reviews', 'Collab Security (Bob)']);
    assert.deepEqual((await rows({ isDefault: true })).map(seat => seat.name), ['Collab Developer', 'Collab Lead', 'Collab Reviewer', 'Collab Security (Deniz)']);
  });

  await t.test('a name an agent of someone else already has is refused, and that agent stays as it was', async () => {
    const [status, body] = await add(bobToo);
    assert.deepEqual([status, body.code], [409, 'name_taken']);
    assert.match(body.error, /Collab Developer \(Bob\)/);
    assert.equal(await prisma.agentSeat.count({ where: { ownerId: bobToo } }), 0);
    assert.equal(await prisma.agentSeat.count({ where: { ownerId: bob, retiredAt: null } }), 3);
  });

  await t.test('someone outside the workspace, and an archived project, get nothing', async () => {
    assert.deepEqual((await add(stranger)).map(part => part.code ?? part), [404, 'project_not_found']);
    await prisma.project.update({ where: { id: OLD }, data: { membersAddSeats: true } });
    assert.deepEqual((await add(deniz, OLD)).map(part => part.code ?? part), [409, 'project_archived']);
    assert.equal(await prisma.agentSeat.count({ where: { OR: [{ ownerId: stranger }, { projectId: OLD }] } }), 0);
  });

  await t.test('the member removes their own seats; a seat with a run open stays, and an open issue is given back', async () => {
    const [developer, reviewer] = await prisma.agentSeat.findMany({ where: { ownerId: deniz }, orderBy: { role: 'asc' } });
    const working = await prisma.issue.create({ data: { workspaceId: 'w', projectId: P, title: 'Being worked', issueKey: 'CLB-1', statusId: `${P}-in_progress`, assigneeId: developer.userId } });
    const waiting = await prisma.issue.create({ data: { workspaceId: 'w', projectId: P, title: 'A review', issueKey: 'CLB-2', statusId: `${P}-to_do`, assigneeId: reviewer.userId, agentRequestRole: 'review' } });
    const run = await prisma.agentRun.create({ data: { workspaceId: 'w', issueId: working.id, seatId: developer.id, userId: developer.userId, runner: 'test', generation: 'g1' } });
    const others = await rows({ ownerId: { not: deniz } });

    const [status, body] = await remove(deniz);
    assert.deepEqual([status, body.removed, body.kept.map(seat => seat.name)], [200, ['Collab Reviewer (Deniz)', 'Collab Security (Deniz)'], ['Collab Developer (Deniz)']]);
    assert.match(body.kept[0].reason, /has a run open/);
    assert.deepEqual(await names({ ownerId: deniz }), ['Collab Developer (Deniz)']);
    assert.equal((await prisma.issue.findUniqueOrThrow({ where: { id: waiting.id } })).assigneeId, null);
    assert.equal((await prisma.issue.findUniqueOrThrow({ where: { id: working.id } })).assigneeId, developer.userId);
    // The security default went with its seat, so the role's requests go to the seat that is left.
    assert.deepEqual((await rows({ role: 'security' })).map(seat => [seat.name, seat.isDefault]), [['Collab Security (Bob)', true]]);

    await prisma.agentRun.update({ where: { id: run.id }, data: { state: 'finished', endedAt: new Date() } });
    assert.deepEqual((await remove(deniz))[1], { removed: ['Collab Developer (Deniz)'], kept: [] });
    assert.deepEqual(await names({ ownerId: deniz }), []);
    // Nobody else's seat is touched, and the lead and the other defaults are where they were.
    assert.deepEqual((await rows({ ownerId: { not: deniz } })).map(seat => seat.name), others.map(seat => seat.name));
    assert.deepEqual(await remove(deniz), [200, { removed: [], kept: [] }]);
  });

  await t.test('removing never reaches a lead seat, even one the member owns', async () => {
    await prisma.agentSeat.updateMany({ where: { name: 'Collab Lead' }, data: { ownerId: bob } });
    assert.deepEqual((await remove(bob))[1].removed, ['Collab Developer (Bob)', 'Bob reviews', 'Collab Security (Bob)']);
    assert.deepEqual(await names({ ownerId: bob }), ['Collab Lead']);
    await prisma.agentSeat.updateMany({ where: { name: 'Collab Lead' }, data: { ownerId: owner } });
  });

  await t.test('seats a member removed come back under the same names, and switching off stops adding but not removing', async () => {
    assert.deepEqual((await add(deniz))[1], { created: ['Collab Developer (Deniz)', 'Collab Reviewer (Deniz)', 'Collab Security (Deniz)'] });
    assert.equal(await prisma.agentSeat.count({ where: { ownerId: deniz } }), 3, 'the same three rows, in use again');
    // Bob's seats are retired, so the other Bob now meets a name that was someone else's: still refused.
    assert.equal((await add(bobToo))[1].code, 'name_taken');

    assert.deepEqual((await allow(owner, false))[1].membersAddSeats, false);
    assert.equal((await add(bob))[1].code, 'members_add_off');
    assert.deepEqual(await names({ ownerId: deniz }), ['Collab Developer (Deniz)', 'Collab Reviewer (Deniz)', 'Collab Security (Deniz)'], 'the seats already added stay');
    assert.equal((await remove(deniz))[1].removed.length, 3);
  });
});
