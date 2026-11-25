const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('../security/helpers.cjs');
const { seatsDatabase } = require('./seats-db.cjs');

// Two members share the first name Bob; the stranger is in no workspace.
const owner = 'cowner00001', deniz = 'cdeniz00001', bob = 'cbob0000001', bobToo = 'cbob0000002', uma = 'cuma0000001', lale = 'clale000001', named = 'cnamed00001', stranger = 'cstranger01';
// More people called Deniz, two of them with the same full name and one with no last name; two called Ece; two called Ada.
const nil = 'cnil0000001', person = 'cperson0001', kara = 'cdeniz00002', kurt = 'cdeniz00003', kurtToo = 'cdeniz00004', mono = 'cdeniz00005', ece = 'cece0000001', eceToo = 'cece0000002', ada = 'cada0000001', adaToo = 'cada0000002';
const P = 'cprojectp001', OLD = 'cprojecto001';
const scopes = ['issues:read', 'issues:write', 'user:read'];

let db;
after(() => db?.stop());

test('a member adds their own seats to a project, once its owner has switched that on', async t => {
  db = await seatsDatabase(async prisma => {
    await prisma.user.createMany({ data: [[owner, 'Cem Owner'], [deniz, 'Deniz Kaya'], [bob, 'Bob Stone'], [bobToo, 'Bob Other'], [uma, 'Uma Late'], [lale, 'Lale Race'], [named, '@deniz kaya'], [stranger, 'Sam Stranger'],
      [kara, 'Deniz Kara'], [kurt, 'Deniz  Kurt'], [kurtToo, 'Deniz Kurt'], [mono, 'Deniz'], [ece, 'Ece First'], [eceToo, 'Ece aydin'], [ada, 'Ada Stone'], [adaToo, 'Ada Moss'], [nil, 'Nil Tan'], [person, 'collab security (nil)']]
      .map(([id, name]) => ({ id, name, email: `${id}@example.test` })) });
    await prisma.workspace.create({ data: { id: 'w', name: 'w', slug: 'w', ownerId: owner } });
    await prisma.workspaceMember.createMany({ data: [deniz, bob, bobToo, uma, lale, named, kara, kurt, kurtToo, mono, ece, eceToo, ada, adaToo, nil, person].map(userId => ({ workspaceId: 'w', userId })) });
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
    '@/lib/permissions': { Permission: { MANAGE_AGENTS: 'MANAGE_AGENTS' }, checkUserPermission: async userId => ({ hasPermission: userId === owner }) } };
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
  const allow = (as, membersMayAddSeats) => call(as, mode.PATCH, { projectSlug: 'clb' }, { body: { membersMayAddSeats } });
  const rows = (where = {}) => prisma.agentSeat.findMany({ where: { projectId: P, retiredAt: null, ...where }, orderBy: [{ role: 'asc' }, { name: 'asc' }],
    select: { name: true, role: true, ownerId: true, byRunner: true, isDefault: true } });
  const names = async where => (await rows(where)).map(seat => seat.name);
  const refuses = (promise, code, status) => assert.rejects(promise, error => {
    assert.deepEqual([error.code, error.status], [code, status], error.message);
    return true;
  });
  const own = { projectId: P, role: { in: ['developer', 'reviewer', 'security'] } };
  const made = (name, role, ownerId, by = owner) => seats.createSeat({ workspaceId: 'w', actorId: by, projectId: P, role, ownerId, name, expiresInDays: 30 });

  // The project as it is before any member arrives: the owner's lead, and a default developer and reviewer seat.
  await made('Collab Lead', 'lead', owner);
  await made('Collab Developer', 'developer', owner);
  await made('Collab Reviewer', 'reviewer', owner);
  const before = await rows();
  const accounts = await prisma.user.count();

  await t.test('the switch is off for every project, and while it is off nothing is made', async () => {
    assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: P } })).membersMayAddSeats, false);
    const [status, body] = await add(deniz);
    assert.deepEqual([status, body.code, body.error], [403, 'members_add_off', 'The project owner has not switched this on.']);
    assert.deepEqual(await rows(), before);
    assert.equal(await prisma.user.count(), accounts, 'no agent account is left behind by a refusal');
  });

  await t.test('only someone who manages the workspace changes the switch', async () => {
    assert.equal((await allow(deniz, true))[0], 403);
    assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: P } })).membersMayAddSeats, false);
    const [status, body] = await allow(owner, true);
    assert.deepEqual([status, body.membersMayAddSeats, body.mode], [200, true, 'seats']);
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
    assert.deepEqual(await add(deniz), [201, { created: [], refused: [] }]);
    assert.equal(await prisma.agentSeat.count({ where: { ownerId: deniz } }), 3);
    await refuses(seats.createSeat({ workspaceId: 'w', actorId: deniz, projectId: P, role: 'developer', ownerId: deniz,
      name: 'Collab Developer (Deniz)', expiresInDays: 30, byRunner: true, own: true }), 'own_seat_exists', 409);
  });

  await t.test('seat names preserve the first word of a name and use the email local part as fallback', async () => {
    assert.deepEqual((await add(named))[1].created, ['Collab Developer (@deniz)', 'Collab Reviewer (@deniz)', 'Collab Security (@deniz)']);
    await remove(named);
    await prisma.user.update({ where: { id: named }, data: { name: null, email: 'fallback@example.test' } });
    assert.deepEqual((await add(named))[1].created, ['Collab Developer (fallback)', 'Collab Reviewer (fallback)', 'Collab Security (fallback)']);
    await remove(named);
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
    assert.deepEqual((await add(bob))[1], { created: ['Collab Developer (Bob)', 'Collab Security (Bob)'], refused: [] });
    assert.deepEqual(await names({ ownerId: bob }), ['Collab Developer (Bob)', 'Bob reviews', 'Collab Security (Bob)']);
    // The same is decided again where the seat is written, for a seat the member was given while the request ran.
    const accountsNow = await prisma.user.count();
    await refuses(seats.createSeat({ workspaceId: 'w', actorId: bob, projectId: P, role: 'reviewer', ownerId: bob, name: 'Collab Reviewer (Bob)', expiresInDays: 30, byRunner: true, own: true }), 'own_seat_exists', 409);
    assert.deepEqual([await prisma.user.count(), await names({ ownerId: bob, role: 'reviewer' })], [accountsNow, ['Bob reviews']]);
    assert.deepEqual((await rows({ isDefault: true })).map(seat => seat.name), ['Collab Developer', 'Collab Lead', 'Collab Reviewer', 'Collab Security (Deniz)']);
  });

  await t.test('a second member with the same first name gets the last initial on every seat, and the first member\'s seats stay as they were', async () => {
    const seen = await rows({ ownerId: bob }), accountsNow = await prisma.user.count();
    // Bob's reviewer seat has another name, so "Collab Reviewer (Bob)" is free. The form is still one for all three.
    assert.deepEqual(await add(bobToo), [201, { created: ['Collab Developer (Bob O.)', 'Collab Reviewer (Bob O.)', 'Collab Security (Bob O.)'], refused: [] }]);
    assert.deepEqual(await names({ ownerId: bobToo }), ['Collab Developer (Bob O.)', 'Collab Reviewer (Bob O.)', 'Collab Security (Bob O.)']);
    assert.deepEqual(await rows({ ownerId: bob }), seen);
    assert.equal(await prisma.user.count(), accountsNow + 3, 'the form that was taken leaves no agent account behind');
    // Bob has a reviewer seat under another name. That the derived name is someone else's is nothing to refuse: he has the role.
    await refuses(seats.createSeat({ workspaceId: 'w', actorId: bob, projectId: P, role: 'reviewer', ownerId: bob, name: 'Collab Reviewer (Bob O.)', expiresInDays: 30, byRunner: true, own: true }), 'own_seat_exists', 409);
    assert.deepEqual(await names({ ownerId: bob }), ['Collab Developer (Bob)', 'Bob reviews', 'Collab Security (Bob)']);
    // A token that is not a seat holds a name too, and the name it holds is the last one made: no seat gets the first form.
    const token = await tokens.createAgentToken({ workspaceId: 'w', actorId: owner, name: 'Collab Security (Uma)', access: 'write', expiresInDays: 30 });
    assert.deepEqual((await add(uma))[1], { created: ['Collab Developer (Uma L.)', 'Collab Reviewer (Uma L.)', 'Collab Security (Uma L.)'], refused: [] });
    assert.equal(await prisma.user.count({ where: { name: { in: ['Collab Developer (Uma)', 'Collab Reviewer (Uma)'] } } }), 0);
    assert.equal(await prisma.agentSeat.count({ where: { user: { name: 'Collab Security (Uma)' } } }), 0, 'the token is still a token that is not a seat');
    assert.ok(token.token);
  });

  await t.test('someone outside the workspace, and an archived project, get nothing', async () => {
    assert.deepEqual((await add(stranger)).map(part => part.code ?? part), [404, 'project_not_found']);
    await prisma.project.update({ where: { id: OLD }, data: { membersMayAddSeats: true } });
    assert.deepEqual((await add(deniz, OLD)).map(part => part.code ?? part), [409, 'project_archived']);
    assert.equal(await prisma.agentSeat.count({ where: { OR: [{ ownerId: stranger }, { projectId: OLD }] } }), 0);
  });

  await t.test('a switch-off after the check is the request\'s refusal while nothing is made, and is named per seat once one is', async () => {
    // The same service, with the switch turned off just before its first, or its second, seat is written.
    const racing = before => {
      let calls = 0;
      return load('src/lib/agent-seat-setup.ts', { ...deps, '@/lib/agent-seats': { ...seats, createSeat: async input => {
        if (calls++ === before) await prisma.project.update({ where: { id: P }, data: { membersMayAddSeats: false } });
        return seats.createSeat(input);
      } } }, { Date });
    };
    await refuses(racing(0).addMySeats({ workspaceId: 'w', userId: lale, projectId: P }), 'members_add_off', 403);
    assert.equal(await prisma.agentSeat.count({ where: { ownerId: lale } }), 0);
    await prisma.project.update({ where: { id: P }, data: { membersMayAddSeats: true } });
    const partial = JSON.parse(JSON.stringify(await racing(1).addMySeats({ workspaceId: 'w', userId: lale, projectId: P })));
    assert.deepEqual([partial.created, partial.refused.map(seat => [seat.name, seat.code])],
      [['Collab Developer (Lale)'], [['Collab Reviewer (Lale)', 'members_add_off'], ['Collab Security (Lale)', 'members_add_off']]]);
    assert.deepEqual(await names({ ownerId: lale }), ['Collab Developer (Lale)']);
    await prisma.project.update({ where: { id: P }, data: { membersMayAddSeats: true } });
  });

  await t.test('an archive committed while a seat is being made stops the seat', async () => {
    let release, ready;
    const held = new Promise(resolve => { release = resolve; });
    const started = new Promise(resolve => { ready = resolve; });
    const archive = prisma.$transaction(async tx => {
      await tx.project.update({ where: { id: P }, data: { isArchived: true } });
      ready();
      await held;
    });
    await started;
    const attempt = seats.createSeat({ workspaceId: 'w', actorId: deniz, projectId: P, role: 'developer', ownerId: deniz,
      name: 'Archive race', expiresInDays: 30, byRunner: true, own: true }).then(() => null, error => error);
    await new Promise(resolve => setTimeout(resolve, 100));
    release();
    await archive;
    assert.equal((await attempt)?.code, 'project_archived');
    assert.equal(await prisma.agentSeat.count({ where: { name: 'Archive race' } }), 0);
    await prisma.project.update({ where: { id: P }, data: { isArchived: false } });
  });

  await t.test('a switch-off committed during an add with no missing roles refuses it', async () => {
    let release, ready;
    const held = new Promise(resolve => { release = resolve; });
    const started = new Promise(resolve => { ready = resolve; });
    const switching = prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`agent-seat:${P}`}))`;
      await tx.project.update({ where: { id: P }, data: { membersMayAddSeats: false } });
      ready();
      await held;
    });
    await started;
    const attempt = add(deniz);
    await new Promise(resolve => setTimeout(resolve, 100));
    release();
    await switching;
    assert.deepEqual((await attempt).map(part => part.code ?? part), [403, 'members_add_off']);
    await prisma.project.update({ where: { id: P }, data: { membersMayAddSeats: true } });
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
    // The security default went with its seat, so the role's requests go to the oldest seat that is left.
    assert.deepEqual((await rows({ role: 'security' })).map(seat => [seat.name, seat.isDefault]), [['Collab Security (Bob O.)', false], ['Collab Security (Bob)', true], ['Collab Security (Uma L.)', false]]);

    await prisma.agentRun.update({ where: { id: run.id }, data: { state: 'finished', endedAt: new Date() } });
    assert.deepEqual((await remove(deniz))[1], { removed: ['Collab Developer (Deniz)'], kept: [] });
    assert.deepEqual(await names({ ownerId: deniz }), []);
    // Nobody else's seat is touched, and the lead and the other defaults are where they were.
    assert.deepEqual((await rows({ ownerId: { not: deniz } })).map(seat => seat.name), others.map(seat => seat.name));
    assert.deepEqual(await remove(deniz), [200, { removed: [], kept: [] }]);
  });

  await t.test('removing never reaches a lead seat, even one the member owns', async () => {
    await prisma.agentSeat.updateMany({ where: { name: 'Collab Lead' }, data: { ownerId: bob } });
    // Asked for by id, as if the row had become a lead, or another project's seat, after it was listed: not found, and it stays.
    const lead = await prisma.agentSeat.findFirstOrThrow({ where: { name: 'Collab Lead' } }), developer = await prisma.agentSeat.findFirstOrThrow({ where: { name: 'Collab Developer (Bob)' } });
    await refuses(seats.retireSeat({ workspaceId: 'w', actorId: bob, seatId: lead.id, only: { ...own, ownerId: bob } }), 'not_found', 404);
    await refuses(seats.retireSeat({ workspaceId: 'w', actorId: bob, seatId: developer.id, only: { ...own, ownerId: bob, projectId: OLD } }), 'not_found', 404);
    await refuses(seats.retireSeat({ workspaceId: 'w', actorId: deniz, seatId: developer.id, only: { ...own, ownerId: deniz } }), 'not_found', 404);
    assert.equal(await prisma.agentSeat.count({ where: { id: { in: [lead.id, developer.id] }, retiredAt: null } }), 2);
    assert.deepEqual((await remove(bob))[1].removed, ['Collab Developer (Bob)', 'Bob reviews', 'Collab Security (Bob)']);
    assert.deepEqual(await names({ ownerId: bob }), ['Collab Lead']);
    await prisma.agentSeat.updateMany({ where: { name: 'Collab Lead' }, data: { ownerId: owner } });
  });

  await t.test('seats a member removed come back under the same names, and switching off stops adding but not removing', async () => {
    assert.deepEqual((await add(deniz))[1], { created: ['Collab Developer (Deniz)', 'Collab Reviewer (Deniz)', 'Collab Security (Deniz)'], refused: [] });
    assert.equal(await prisma.agentSeat.count({ where: { ownerId: deniz } }), 3, 'the same three rows, in use again');
    // Bob's seats are retired and their names are still his: the other Bob's seats come back with the initial.
    assert.equal((await remove(bobToo))[1].removed.length, 3);
    assert.deepEqual((await add(bobToo))[1], { created: ['Collab Developer (Bob O.)', 'Collab Reviewer (Bob O.)', 'Collab Security (Bob O.)'], refused: [] });

    assert.deepEqual((await allow(owner, false))[1].membersMayAddSeats, false);
    assert.equal((await add(bob))[1].code, 'members_add_off');
    // Also for someone who has every seat already: the answer while it is off is always the refusal.
    assert.deepEqual((await add(deniz)).map(part => part.code ?? part), [403, 'members_add_off']);
    // And where the seat is written, for a switch-off that lands while a request is on its way.
    await refuses(seats.createSeat({ workspaceId: 'w', actorId: bob, projectId: P, role: 'developer', ownerId: bob, name: 'Collab Developer (Bob)', expiresInDays: 30, byRunner: true, own: true }), 'members_add_off', 403);
    assert.deepEqual(await names({ ownerId: deniz }), ['Collab Developer (Deniz)', 'Collab Reviewer (Deniz)', 'Collab Security (Deniz)'], 'the seats already added stay');
    assert.equal((await remove(deniz))[1].removed.length, 3);
  });

  await t.test('a taken first name gives the last initial, a taken initial the full name, and after that the seat is refused', async () => {
    await allow(owner, true);
    await add(deniz);
    const first = await prisma.agentSeat.findMany({ where: { ownerId: deniz }, orderBy: { role: 'asc' } });
    assert.deepEqual(first.map(seat => [seat.name, seat.retiredAt]), [['Collab Developer (Deniz)', null], ['Collab Reviewer (Deniz)', null], ['Collab Security (Deniz)', null]]);
    const all = label => ['Developer', 'Reviewer', 'Security'].map(role => `Collab ${role} (${label})`);

    assert.deepEqual((await add(kara))[1], { created: all('Deniz K.'), refused: [] });
    // The initial is Deniz Kara's by now, so the next Deniz K. gets the full name, with one space between its words.
    assert.deepEqual((await add(kurt))[1], { created: all('Deniz Kurt'), refused: [] });
    // Nothing is left to try for a fourth with that full name, or for someone with no last name: refused as before.
    const accountsNow = await prisma.user.count();
    const fourth = (await add(kurtToo))[1];
    assert.deepEqual([fourth.created, fourth.refused.map(seat => [seat.name, seat.code])], [[], all('Deniz Kurt').map(name => [name, 'name_taken'])]);
    assert.match(fourth.refused[0].reason, /An agent named Collab Developer \(Deniz Kurt\) already exists/);
    const single = (await add(mono))[1];
    assert.deepEqual([single.created, single.refused.map(seat => [seat.name, seat.code])], [[], all('Deniz').map(name => [name, 'name_taken'])]);
    assert.equal(await prisma.agentSeat.count({ where: { ownerId: { in: [kurtToo, mono] } } }), 0);
    assert.equal(await prisma.user.count(), accountsNow, 'no agent account is left behind by a refusal');
    // Nobody's seat was renamed or given to someone else on the way.
    assert.deepEqual(await prisma.agentSeat.findMany({ where: { ownerId: deniz }, orderBy: { role: 'asc' } }), first);
    assert.deepEqual([await names({ ownerId: kara }), await names({ ownerId: kurt })], [all('Deniz K.'), all('Deniz Kurt')]);
  });

  await t.test('one taken name moves all of a member\'s seats to the next form, also when it is the last one made and is written in other letters', async () => {
    await made('collab security (ECE)', 'security', ece);
    assert.deepEqual((await add(eceToo))[1], { created: ['Collab Developer (Ece A.)', 'Collab Reviewer (Ece A.)', 'Collab Security (Ece A.)'], refused: [] });
    assert.equal(await prisma.user.count({ where: { name: { in: ['Collab Developer (Ece)', 'Collab Reviewer (Ece)'] } } }), 0);
    assert.deepEqual(await names({ ownerId: ece }), ['collab security (ECE)']);
    // A person is not an agent, whatever their name and whatever other app they gave a token to: the first form is free.
    await prisma.appToken.create({ data: { workspaceId: 'w', userId: person, accessToken: 'another-app', scopes: [] } });
    assert.deepEqual((await add(nil))[1], { created: ['Collab Developer (Nil)', 'Collab Reviewer (Nil)', 'Collab Security (Nil)'], refused: [] });
  });

  await t.test('two members with the same first name who add at the same moment get different names, each in one form', async () => {
    const setup = deps['@/lib/agent-seat-setup'];
    const replies = JSON.parse(JSON.stringify(await Promise.all([ada, adaToo].map(userId => setup.addMySeats({ workspaceId: 'w', userId, projectId: P })))));
    assert.deepEqual(replies.map(reply => reply.refused), [[], []]);
    const labels = replies.map(reply => reply.created.map(name => name.match(/\((.*)\)$/)[1]));
    // Whoever wrote first has the first name alone; the other one has the initial, on all three seats.
    assert.ok(labels.every(mine => mine.length === 3 && new Set(mine).size === 1), JSON.stringify(labels));
    assert.deepEqual(labels.map(mine => mine[0]).sort(), ['Ada', labels[0][0] === 'Ada' ? 'Ada M.' : 'Ada S.'].sort());
    for (const [index, userId] of [ada, adaToo].entries()) assert.deepEqual(await names({ ownerId: userId }), replies[index].created);
    assert.equal(await prisma.user.count({ where: { name: { startsWith: 'Collab ', contains: '(Ada' } } }), 6);
  });
});
