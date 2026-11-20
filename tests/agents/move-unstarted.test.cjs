const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { Prisma } = require('@prisma/client');
const { load } = require('../security/helpers.cjs');
const { seatsDatabase } = require('./seats-db.cjs');

// Token-facing routes accept only cuid-shaped ids.
const owner = 'cowner00001', cem = 'ccem0000001', bob = 'cbob0000001', deniz = 'cdeniz00001';
const A = 'cprojecta001';
const scopes = ['issues:read', 'issues:write', 'user:read'];
const ago = minutes => new Date(Date.now() - minutes * 60_000);
const NOTE = '## Done\nx\n## Decisions\nx\n## Evidence\nx\n## Next\nx';
const SPELL = ['agent_seat.no_room', 'agent_seat.room_back'];

let db;
after(() => db?.stop());

test('work no run has started on leaves a seat that has had no room for 10 minutes', async t => {
  db = await seatsDatabase(async prisma => {
    await prisma.user.createMany({ data: [owner, cem, bob, deniz].map(id => ({ id, name: id, email: `${id}@example.test` })) });
    await prisma.workspace.create({ data: { id: 'w', name: 'w', slug: 'w', ownerId: owner } });
    await prisma.workspaceMember.createMany({ data: [cem, bob, deniz].map(userId => ({ workspaceId: 'w', userId })) });
    await prisma.project.create({ data: { id: A, workspaceId: 'w', name: A, slug: A, issuePrefix: 'AA' } });
    await prisma.projectStatus.createMany({ data: ['to_do', 'in_progress', 'done'].map((name, order) => ({ id: `${A}-${name}`, projectId: A, name, displayName: name,
      order, isDefault: !order, isFinal: name === 'done' })) });
    await prisma.repository.create({ data: { projectId: A, githubRepoId: A, owner: 'acme', name: A, fullName: `acme/${A}`, webhookSecret: 'secret' } });
    for (const [id, slug] of [['agent-app', 'collab-agent'], ['person-app', 'collab-cli']]) {
      await prisma.app.create({ data: { id, name: slug, slug, publisherId: 'system', status: 'PUBLISHED', visibility: 'PRIVATE', isSystemApp: true,
        scopes: { create: scopes.map(scope => ({ scope })) } } });
    }
  });
  // The application's client, so Trash is hidden here as it is in production.
  const raw = db.prisma;
  const prisma = raw.$extends(load('src/lib/issue-visibility.ts').issueVisibilityExtension(Prisma.dmmf.datamodel.models));

  const crypto = { encryptToken: async value => Buffer.from(value), decryptToken: async data => Buffer.from(data).toString(), getEncryptionKey: () => {} };
  const zod = require('zod');
  const response = { NextResponse: Response };
  const globals = { console, URL, Date, Buffer, process: { env: { NEXTAUTH_URL: 'https://collab.test' } } };
  const finder = load('src/lib/issue-finder.ts', { '@/lib/prisma': { prisma } });
  const handoffs = load('src/lib/agent-handoffs.ts', { 'node:crypto': require('node:crypto'), 'node:buffer': require('node:buffer'), zod,
    '@/lib/prisma': { prisma }, '@/lib/issue-finder': finder, '@/lib/oauth-scopes': load('src/lib/oauth-scopes.ts') }, { Date });
  const tokens = load('src/lib/agent-tokens.ts', { crypto: require('node:crypto'), '@/lib/prisma': { prisma }, '@/lib/apps/crypto': crypto }, { Buffer, Date });
  const assignee = load('src/lib/issue-assignee.ts', { './agent-handoffs': handoffs });
  const seats = load('src/lib/agent-seats.ts', { '@/lib/prisma': { prisma }, '@/lib/agent-handoffs': handoffs, '@/lib/agent-tokens': tokens, '@/lib/issue-assignee': assignee }, { Date });
  const runners = load('src/lib/agent-runners.ts', { crypto: require('node:crypto'), '@/lib/prisma': { prisma }, '@/lib/agent-handoffs': handoffs, '@/lib/agent-tokens': tokens,
    '@/lib/agent-seats': seats }, { Date });
  const middleware = load('src/lib/apps/auth-middleware.ts', { crypto: require('node:crypto'), 'next/server': response,
    '@/lib/apps/crypto': crypto, '@/lib/oauth-scopes': load('src/lib/oauth-scopes.ts'), '@/lib/post-access': load('src/lib/post-access.ts'),
    '@/lib/auth-error-diagnostics': load('src/lib/auth-error-diagnostics.ts'), '@/lib/prisma': { prisma } }, globals);
  const http = load('src/lib/agent-handoff-http.ts', { zod, 'next/server': response, './agent-handoffs': handoffs }, globals);
  let forgeConnected = false;
  const updates = [];
  class ForgeProjectWriteError extends Error {}
  const deps = {
    '@/lib/redis': { publishEvent: async () => true }, zod, '@prisma/client': require('@prisma/client'), 'next/server': response,
    '@/lib/prisma': { prisma, issueTrashPrisma: raw }, '@/lib/issue-finder': finder, '@/lib/issue-assignee': assignee, '@/lib/agent-seats': seats, '@/lib/agent-tokens': tokens,
    '@/lib/agent-handoffs': handoffs, '@/lib/agent-handoff-http': http, '@/lib/agent-runners': runners,
    '@/lib/agent-label-triggers': load('src/lib/agent-label-triggers.ts', { 'node:crypto': require('node:crypto') }),
    '@/lib/permissions': { Permission: {}, canActOnOwnContent: () => true, checkUserPermission: async () => ({ hasPermission: true }),
      checkUserPermissions: async () => ({ undefined: { hasPermission: true } }) },
    '@/utils/html-normalizer': { normalizeDescriptionHTML: value => value },
    '@/lib/forge/legacy-write-guard': { assertLegacyProjectWriteAllowed: async () => { if (forgeConnected) throw new ForgeProjectWriteError(); }, assertLegacyIssueWriteAllowed: async () => {}, assertLegacyIssueDeleteAllowed: async () => {}, ForgeProjectWriteError },
    '@/lib/apps/auth-middleware': middleware,
    '@/lib/event-bus': { emitIssueCreated: async () => {}, emitIssueUpdated: async (...args) => { updates.push(args); }, emitIssueDeleted: async () => {} },
  };
  deps['@/lib/agent-runs'] = load('src/lib/agent-runs.ts', deps, { Date });
  deps['@/lib/agent-requests'] = load('src/lib/agent-requests.ts', deps, { Date });
  deps['@/lib/issue-mutation'] = load('src/lib/issue-mutation.ts', deps);
  const route = path => load(`src/app/api/apps/auth/${path}/route.ts`, deps, globals);
  const item = route('issues/[issueIdOrKey]'), requests = route('seats/me/requests'), inboxRoute = route('seats/me/inbox'), runs = route('runs'), one = route('runs/[id]');
  const pairRoute = load('src/app/api/runner/pair/route.ts', deps, globals), fetchRoute = load('src/app/api/runner/seats/route.ts', deps, globals);
  const page = load('src/lib/agents-page.ts', { '@/lib/prisma': { prisma }, '@/lib/post-access': load('src/lib/post-access.ts'), '@/lib/issue-finder': finder,
    '@/lib/agent-runs': deps['@/lib/agent-runs'], '@/lib/agent-runners': runners, '@/lib/agent-seats': seats }, { Date });
  const { getActionText } = load('src/components/issue/sections/activity/utils/activityHelpers.ts');

  const send = async (handler, token, method, { body, params = {} } = {}) => {
    const reply = await handler(new Request('https://collab.test/api', { method, headers: { Authorization: `Bearer ${token}` },
      ...(body && { body: JSON.stringify(body) }) }), { params: Promise.resolve(params) });
    return { status: reply.status, body: await reply.json().catch(() => null) };
  };
  const all = [];
  const seat = async (name, role, ownerId) => {
    const made = await seats.createSeat({ workspaceId: 'w', actorId: owner, projectId: A, role, ownerId, name, expiresInDays: 30 });
    all.push({ ...made.seat, token: made.token.token });
    return all.at(-1);
  };
  // Made in this order: the default seat of a role is its first. The lead is run by hand; the rest by their owner's runner.
  const lead = await seat('lead', 'lead', owner);
  const devCem = await seat('dev-cem', 'developer', cem), revCem = await seat('rev-cem', 'reviewer', cem), secCem = await seat('sec-cem', 'security', cem), relCem = await seat('rel-cem', 'release', cem);
  const devBob = await seat('dev-bob', 'developer', bob), revBob = await seat('rev-bob', 'reviewer', bob);
  const devDeniz = await seat('dev-deniz', 'developer', deniz), revDeniz = await seat('rev-deniz', 'reviewer', deniz);
  await raw.agentSeat.updateMany({ where: { ownerId: { in: [cem, bob, deniz] } }, data: { byRunner: true } });
  // The seats are not new: a seat without a runner counts its time without room from its own first day at the earliest.
  for (const found of all) await raw.agentSeat.update({ where: { id: found.id }, data: { createdAt: new Date(found.createdAt.getTime() - 600 * 60_000) } });
  const of = person => all.filter(found => found.ownerId === person);

  /** A runner admitted for a person, the way a person admits one. It holds the tokens of that person's seats, so its calls make none. */
  const credentials = {};
  const connect = async person => {
    const reply = await pairRoute.POST(new Request('https://collab.test/api', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: person }) }));
    const started = await reply.json();
    await runners.admitRunner({ workspaceId: 'w', actorId: person, code: started.code });
    credentials[person] = started.credential;
    const admitted = await raw.agentRunner.findFirstOrThrow({ where: { ownerId: person, removedAt: null } });
    await raw.appToken.updateMany({ where: { userId: { in: of(person).map(found => found.userId) } }, data: { runnerId: admitted.id, isRevoked: false, revokedAt: null } });
  };
  for (const person of [cem, bob, deniz]) await connect(person);
  /** A runner's regular call, as the runner makes it: its state, and one figure for all its seats (none with `null`). */
  const report = async (person, room, state = 'working') => {
    const have = (await raw.appToken.findMany({ where: { userId: { in: of(person).map(found => found.userId) } }, select: { id: true } })).map(found => found.id);
    const reply = await fetchRoute.POST(new Request('https://collab.test/api', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${credentials[person]}` },
      body: JSON.stringify({ have, state, ...(room !== null && { rooms: of(person).map(found => ({ seat: found.id, room, program: 'Claude Code' })) }) }) }));
    assert.equal(reply.status, 200, JSON.stringify(await reply.clone().json()));
    assert.ok((await reply.json()).seats.every(found => !found.token), 'the runner holds its tokens');
  };
  /** Time is written, not waited for: this many minutes pass for a person's seats, so every row that opened or ended a spell on them is that much older. */
  const passes = async (person, minutes) => {
    for (const row of await raw.appAuditLog.findMany({ where: { actorId: { in: of(person).map(found => found.userId) }, action: { in: SPELL } } })) {
      await raw.appAuditLog.update({ where: { id: row.id }, data: { createdAt: new Date(row.createdAt.getTime() - minutes * 60_000) } });
    }
  };
  /** A figure that is too old to say anything. */
  const stale = person => raw.agentSeat.updateMany({ where: { ownerId: person }, data: { roomAt: ago(16) } });
  const spells = async found => (await raw.appAuditLog.findMany({ where: { actorId: found.userId, action: { in: SPELL } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] })).map(row => row.action);

  let count = 0;
  const issue = (data = {}) => raw.issue.create({ data: { workspaceId: 'w', projectId: A, title: `Issue ${++count}`, issueKey: `K-${count}`, statusId: `${A}-to_do`, ...data } });
  /** What a person's edit on the web leaves: the assignee, and the person's hand on the row that made it so. */
  const personGives = async (target, userId, at = new Date()) => {
    await raw.issue.update({ where: { id: target.id }, data: { assigneeId: userId } });
    const row = { role: 'ASSIGNEE', status: 'APPROVED', approvedAt: at, approvedBy: owner };
    await raw.issueAssignee.upsert({ where: { issueId_userId: { issueId: target.id, userId } }, create: { issueId: target.id, userId, ...row }, update: row });
  };
  const items = async who => { const reply = await send(inboxRoute.GET, who.token, 'GET'); assert.equal(reply.status, 200, JSON.stringify(reply.body)); return reply.body.items; };
  const inbox = async who => (await items(who)).map(entry => [entry.issueKey, entry.reason]);
  const holder = async target => (await raw.issue.findUniqueOrThrow({ where: { id: target.id } })).assigneeId;
  const begin = (who, target, generation = 'g1') => send(runs.POST, who.token, 'POST', { body: { issue: target.issueKey, generation, runner: 'test' } });
  const start = async (who, target) => { const reply = await begin(who, target); assert.equal(reply.status, 200, JSON.stringify(reply.body)); return reply.body.run.id; };
  const finish = async (who, id, outcome) => assert.equal((await send(one.PATCH, who.token, 'PATCH', { body: { event: 'finish', generation: 'g1', outcome, note: NOTE, nextStep: 'wait' }, params: { id } })).status, 200);
  const give = async (token, target, assigneeId) => (await send(item.PATCH, token, 'PATCH', { body: { assigneeId }, params: { issueIdOrKey: target.issueKey } })).status;
  /** The entries that say Collab moved a request, oldest first. */
  const moves = async target => (await raw.issueActivity.findMany({ where: { itemId: target.id, action: 'REQUEST_PLACED' }, orderBy: { createdAt: 'asc' } }))
    .map(entry => ({ ...entry, details: JSON.parse(entry.details) })).filter(entry => entry.details.fromSeatId);

  const source = await issue();
  await personGives(source, devDeniz.userId);
  /** A request as a seat files it, at a moment when `on` is where Collab places it: its owner has the most room. */
  const request = async (on, role = 'review', filer = devDeniz) => {
    for (const person of [cem, bob, deniz]) await report(person, person === on.ownerId ? 90 : 20);
    const reply = await send(requests.POST, filer.token, 'POST', { body: { role, title: `A ${role} request`, body: 'What is asked.', fromIssue: source.issueKey } });
    assert.equal(reply.status, 200, JSON.stringify(reply.body));
    const made = await raw.issue.findUniqueOrThrow({ where: { id: reply.body.issue.id } });
    assert.equal(made.assigneeId, on.userId, 'the request starts on the seat under test');
    return made;
  };
  /** Requests of an earlier case are done with, so the next case reads only its own. */
  const settle = async () => {
    await raw.agentRun.updateMany({ where: { endedAt: null }, data: { endedAt: new Date(), state: 'stopped' } });
    await raw.issue.updateMany({ where: { agentRequestRole: { not: null } }, data: { statusId: `${A}-done` } });
  };

  await t.test('a changed or cleared reporter cannot receive or take credit for a filed request', async () => {
    for (const [reporterId, removePlacement] of [[owner, false], [null, true]]) {
      const target = await request(revCem, 'review', revDeniz);
      if (removePlacement) {
        await raw.issueActivity.deleteMany({ where: { itemId: target.id, action: 'REQUEST_PLACED' } });
        await raw.issueRelation.updateMany({ where: { sourceIssueId: target.id }, data: { createdAt: new Date(target.createdAt.getTime() + 1000) } });
        const later = await issue();
        await raw.issueRelation.create({ data: { sourceIssueId: target.id, targetIssueId: later.id, relationType: 'RELATES_TO', createdBy: owner,
          createdAt: new Date(target.createdAt.getTime() + 2000) } });
      }
      await raw.issue.update({ where: { id: target.id }, data: { reporterId } });
      await report(bob, 60); await report(deniz, 90); await report(cem, 0); await passes(cem, 11);
      await inbox(revBob);
      assert.equal(await holder(target), revBob.userId);
      assert.equal((await moves(target))[0].userId, revDeniz.userId);
      assert.equal((await raw.issueAssignee.findUniqueOrThrow({ where: { issueId_userId: { issueId: target.id, userId: revBob.userId } } })).approvedBy, revDeniz.userId);
      await settle();
    }
  });

  await t.test('a request whose first placing and link are gone still moves, and not to its reporter', async () => {
    // Filed by a reviewer seat, the seat with the most room afterwards: it must not get its own request back.
    for (const reporterId of [revDeniz.userId, null]) {
      const target = await request(revCem, 'review', revDeniz);
      await raw.issueActivity.deleteMany({ where: { itemId: target.id, action: 'REQUEST_PLACED' } });
      await raw.issueRelation.deleteMany({ where: { sourceIssueId: target.id } });
      await raw.issue.update({ where: { id: target.id }, data: { reporterId } });
      await report(bob, 60); await report(deniz, 90); await report(cem, 0); await passes(cem, 11);
      await inbox(revBob);
      // With a reporter it goes past the reporter's seat; with no trace of who filed it, it goes where any request would.
      const to = reporterId ? revBob : revDeniz;
      assert.equal(await holder(target), to.userId);
      assert.equal((await moves(target))[0].userId, reporterId ?? to.userId);
      await settle();
    }
  });

  let moved;
  await t.test('Collab places a request again, on the seat with room, once its seat has had no room for 10 minutes', async () => {
    moved = await request(revCem);
    await report(bob, 60);
    await report(cem, 0);
    assert.deepEqual(await inbox(revBob), [], 'inside the 10 minutes nothing moves');
    assert.equal(await holder(moved), revCem.userId);
    await passes(cem, 11);
    assert.deepEqual(await inbox(devBob), []);
    assert.equal(await holder(moved), revCem.userId, 'the read of a seat that takes no such request moves none');
    assert.deepEqual(await inbox(revBob), [[moved.issueKey, 'assigned']], 'the read that moved it already lists it');
    assert.equal(await holder(moved), revBob.userId);
    const emitted = updates.filter(([issue]) => issue.id === moved.id);
    assert.equal(emitted.length, 1);
    assert.equal(emitted[0][0].assigneeId, revBob.userId);
    assert.equal(+emitted[0][0].updatedAt, +(await raw.issue.findUniqueOrThrow({ where: { id: moved.id } })).updatedAt);
    assert.deepEqual(await inbox(revCem), []);

    const [entry, ...more] = await moves(moved);
    assert.deepEqual(more, []);
    assert.deepEqual(entry.details, { fromSeatId: revCem.id, from: 'rev-cem', toSeatId: revBob.id, to: 'rev-bob', why: 'rev-cem had no room for 10 minutes (the allowance is used up)' });
    assert.deepEqual([entry.userId, entry.oldValue, entry.newValue], [devDeniz.userId, revCem.userId, revBob.userId], 'under the name of the seat that filed it');
    const line = getActionText({ ...entry, user: { name: 'dev-deniz' } });
    assert.equal(line, 'Collab moved this request from rev-cem to rev-bob: rev-cem had no room for 10 minutes (the allowance is used up)');
    assert.ok(!/\d\s*%/.test(line), 'no percentage: room is its owner\'s to see');
    // The row that makes a seat the assignee went with the request.
    assert.deepEqual((await raw.issueAssignee.findMany({ where: { issueId: moved.id } })).map(row => [row.userId, row.approvedBy]), [[revBob.userId, devDeniz.userId]]);
    await inbox(revBob); await inbox(revDeniz);
    assert.equal((await moves(moved)).length, 1, 'a later read moves nothing more');
  });

  await t.test('when the first seat has room again the request stays where it went, and it never goes back to a seat it left', async () => {
    await report(cem, 80);
    assert.deepEqual(await inbox(revCem), []);
    assert.equal(await holder(moved), revBob.userId);
    // The seat it went to has no room now, and the only seat with room is the one it left.
    await report(bob, 0); await passes(bob, 11); await stale(deniz);
    await inbox(revCem); await inbox(revDeniz); await inbox(revBob);
    assert.equal(await holder(moved), revBob.userId);
    // A seat it was never on may take it.
    await report(deniz, 40);
    assert.deepEqual(await inbox(revDeniz), [[moved.issueKey, 'assigned']]);
    assert.deepEqual((await moves(moved)).map(entry => [entry.details.from, entry.details.to]), [['rev-cem', 'rev-bob'], ['rev-bob', 'rev-deniz']]);
    await settle();
  });

  await t.test('a Forge-connected project keeps its request and still answers the inbox', async () => {
    const kept = await request(revCem);
    await report(bob, 60); await report(cem, 0); await passes(cem, 11);
    forgeConnected = true;
    try {
      assert.deepEqual(await inbox(revBob), []);
      assert.equal(await holder(kept), revCem.userId);
      assert.deepEqual(await moves(kept), []);
      assert.equal(updates.filter(([issue]) => issue.id === kept.id).length, 0);
    } finally {
      forgeConnected = false;
      await settle();
    }
  });

  await t.test('a seat that gets room back inside the 10 minutes keeps its work, and a spell that ended earlier does not count', async () => {
    const kept = await request(revCem);
    await report(bob, 60);
    // A spell an hour ago that ended twenty minutes later, then one that has just begun.
    await report(cem, 0); await passes(cem, 20);
    await report(cem, 50); await passes(cem, 40);
    assert.deepEqual(await inbox(revBob), []);
    await report(cem, 0);
    assert.deepEqual(await inbox(revBob), [], 'the old spell says nothing about this one');
    assert.equal(await holder(kept), revCem.userId);
    // A runner that keeps saying the same thing keeps the spell it has: 9 minutes in, then 11.
    await passes(cem, 9); await report(cem, 0);
    assert.deepEqual(await inbox(revBob), []);
    await passes(cem, 2); await report(cem, 0);
    assert.deepEqual(await inbox(revBob), [[kept.issueKey, 'assigned']]);
    // One row per change of what the runner says, however often it says it.
    assert.deepEqual((await spells(revCem)).slice(-3), ['agent_seat.no_room', 'agent_seat.room_back', 'agent_seat.no_room']);
    await report(cem, 50); await report(cem, 55);
    assert.deepEqual((await spells(revCem)).slice(-2), ['agent_seat.no_room', 'agent_seat.room_back']);
    await settle();
  });

  await t.test('a report handled later ends up later, whatever a clock said, and room is read again behind the locks', async () => {
    const kept = await request(revCem);
    await report(bob, 60);
    await report(cem, 0);
    // The row that opened the spell carries a time ahead of this server's clock, as another server's clock could have left it.
    const ahead = new Date(Date.now() + 5_000);
    await raw.appAuditLog.updateMany({ where: { actorId: revCem.userId, action: 'agent_seat.no_room', createdAt: { gt: ago(1) } }, data: { createdAt: ahead } });
    await report(cem, 50);
    const rows = await raw.appAuditLog.findMany({ where: { actorId: revCem.userId, action: { in: SPELL } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 2 });
    assert.deepEqual(rows.map(row => row.action), ['agent_seat.room_back', 'agent_seat.no_room'], 'the report that gave it room is the last word');
    assert.ok(rows[0].createdAt > ahead);
    await passes(cem, 11);
    await report(cem, 0);
    assert.deepEqual(await inbox(revBob), [], 'the spell that ended does not come back');

    // The seat gets room back while the move waits for the request: nothing moves on what was read before.
    await passes(cem, 11);
    let release;
    const held = raw.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "Issue" WHERE "id" = ${kept.id} FOR UPDATE`;
      await new Promise(resolve => { release = resolve; });
    });
    while (!release) await new Promise(resolve => setImmediate(resolve));
    let answered = false;
    const reading = items(revBob).finally(() => { answered = true; });
    // Nothing is slept through: the database says when the read waits for the request's row.
    while (!answered && !(await raw.$queryRaw`SELECT 1 AS waiting FROM pg_stat_activity WHERE wait_event_type = 'Lock'`).length);
    assert.equal(answered, false, 'the read waits for the request');
    await report(cem, 50);
    release(); await held;
    assert.deepEqual(await reading, []);
    assert.equal(await holder(kept), revCem.userId);
    assert.deepEqual(await moves(kept), []);
    await settle();
  });

  await t.test('nothing moves while the figure is unknown, or while no other seat of the role has a number', async () => {
    const waits = await request(revCem);
    await report(bob, 60);
    await report(cem, 0); await passes(cem, 30);
    await stale(cem);
    assert.deepEqual(await inbox(revBob), [], 'a figure that is too old is unknown, not none');
    // The same figure again after that gap opens a spell of its own.
    await report(cem, 0);
    assert.deepEqual(await inbox(revBob), []);
    await passes(cem, 11);
    await stale(bob); await report(deniz, 0);
    assert.deepEqual([await inbox(revBob), await inbox(revDeniz)], [[], []], 'unknown is not room, and no room is not room');
    assert.equal(await holder(waits), revCem.userId);
    await report(bob, 5);
    assert.deepEqual(await inbox(revBob), [[waits.issueKey, 'assigned']]);
    await settle();
  });

  await t.test('a paused runner, an offline runner and no runner each count as no room', async () => {
    const why = async target => (await moves(target)).at(-1)?.details.why;
    const paused = await request(revCem);
    await report(bob, 60);
    await report(cem, 50, 'paused');
    assert.deepEqual(await inbox(revBob), []);
    await passes(cem, 11);
    assert.deepEqual(await inbox(revBob), [[paused.issueKey, 'assigned']]);
    assert.equal(await why(paused), 'rev-cem had no room for 10 minutes (the runner is paused)');
    await settle();

    // Offline is 10 minutes of silence already: it is not waited for a second time.
    const offline = await request(revCem);
    await report(bob, 60);
    const mine = { ownerId: cem, removedAt: null };
    await raw.agentRunner.updateMany({ where: mine, data: { lastSeenAt: ago(9) } });
    assert.deepEqual(await inbox(revBob), [], 'silent for 9 minutes, it still has the room it reported');
    await raw.agentRunner.updateMany({ where: mine, data: { lastSeenAt: ago(11) } });
    assert.deepEqual(await inbox(revBob), [[offline.issueKey, 'assigned']]);
    assert.equal(await why(offline), 'rev-cem had no room for 10 minutes (the runner is offline)');
    await settle();

    const none = await request(revCem);
    await report(bob, 60);
    const { id: runnerId } = await raw.agentRunner.findFirstOrThrow({ where: mine });
    await runners.removeRunner({ workspaceId: 'w', actorId: cem, runnerId });
    assert.deepEqual(await inbox(revBob), [], 'removed a moment ago');
    await raw.agentRunner.update({ where: { id: runnerId }, data: { removedAt: ago(11) } });
    assert.deepEqual(await inbox(revBob), [[none.issueKey, 'assigned']]);
    assert.equal(await why(none), 'rev-cem had no room for 10 minutes (no runner is connected)');
    await connect(cem);
    await settle();
  });

  await t.test('work a run has started on stays on its seat, whatever became of the run', async () => {
    const started = await request(revCem);
    await raw.agentRun.create({ data: { workspaceId: 'w', issueId: started.id, seatId: revCem.id, userId: revCem.userId, runner: 'test', generation: 'g0',
      state: 'stopped', startedAt: ago(30), endedAt: ago(29) } });
    await report(bob, 60);
    await report(cem, 0); await passes(cem, 11);
    assert.deepEqual([await inbox(revBob), await inbox(revDeniz)], [[], []]);
    assert.equal(await holder(started), revCem.userId);
    assert.deepEqual(await moves(started), []);
    await settle();
  });

  await t.test('a role with one seat has nowhere to move to, and developer work is not Collab\'s to move', async () => {
    const security = await request(secCem, 'security'), release = await request(relCem, 'release'), developer = await request(devCem, 'developer');
    await report(bob, 60);
    await report(cem, 50, 'disk_full'); await passes(cem, 11);
    for (const reader of [secCem, relCem, devBob, devDeniz, revBob]) await items(reader);
    assert.deepEqual([await holder(security), await holder(release), await holder(developer)], [secCem.userId, relCem.userId, devCem.userId]);
    await settle();
  });

  await t.test('a request is moved or started, never both, and two reads at once move it once', async () => {
    for (let round = 0; round < 4; round++) {
      const raced = await request(revCem);
      await report(bob, 60);
      await report(cem, 0); await passes(cem, 11);
      const [, begun] = await Promise.all([items(revBob), begin(revCem, raced, `race-${round}`)]);
      await items(revBob);
      const ran = await raw.agentRun.count({ where: { issueId: raced.id } });
      assert.equal(begun.status === 200, ran === 1, JSON.stringify(begun.body));
      if (!ran) assert.equal(begun.body.error, 'not_assigned');
      assert.equal(await holder(raced), ran ? revCem.userId : revBob.userId, 'moved exactly when no run started on it');
      assert.equal((await moves(raced)).length, ran ? 0 : 1);
      await settle();
    }
    const twice = await request(revCem);
    await report(bob, 60); await report(deniz, 60);
    await report(cem, 0); await passes(cem, 11);
    await Promise.all([items(revBob), items(revDeniz), items(revBob), items(revDeniz)]);
    assert.equal((await moves(twice)).length, 1);
    await settle();
  });

  await t.test('the inbox is answered even when moving work fails', async () => {
    const logged = [];
    const failing = load('src/app/api/apps/auth/seats/me/inbox/route.ts', { ...deps, '@/lib/agent-requests': { moveUnstarted: async () => { throw new Error('the sweep broke'); } } },
      { ...globals, console: { error: (...told) => logged.push(told) } });
    const reply = await send(failing.GET, devDeniz.token, 'GET');
    assert.equal(reply.status, 200, JSON.stringify(reply.body));
    assert.deepEqual(reply.body.items.map(entry => [entry.issueKey, entry.reason]), [[source.issueKey, 'assigned']]);
    assert.equal(logged.length, 1);
    assert.match(String(logged[0].at(-1)), /the sweep broke/);
  });

  await t.test('the lead is woken with child_no_room for a developer issue it placed, once per spell, and Collab moves no developer work', async () => {
    const epic = await issue({ type: 'EPIC' });
    await personGives(epic, lead.userId, ago(1000));
    const child = () => issue({ parentId: epic.id });
    const first = await child(), second = await child(), byPerson = await child(), busy = [await child(), await child(), await child()];
    for (const person of [cem, bob, deniz]) await report(person, 50);
    let run = await start(lead, epic);
    for (const target of [first, second]) assert.equal(await give(lead.token, target, devCem.userId), 200);
    // The other seat with room holds its limit of issues from the lead.
    for (const target of busy) assert.equal(await give(lead.token, target, devBob.userId), 200);
    await finish(lead, run, 'blocked');
    await personGives(byPerson, devCem.userId);
    // A run started on the second child and stopped.
    await raw.agentRun.create({ data: { workspaceId: 'w', issueId: second.id, seatId: devCem.id, userId: devCem.userId, runner: 'test', generation: 'g0',
      state: 'stopped', startedAt: ago(30), endedAt: ago(29) } });
    /** The lead's last run on the epic, put back: what happens to a child is measured from when that run started. */
    const looked = minutes => raw.agentRun.updateMany({ where: { issueId: epic.id }, data: { startedAt: ago(minutes + 1), endedAt: ago(minutes) } });
    await looked(100);
    assert.deepEqual(await inbox(lead), []);

    await report(deniz, 40);
    await report(cem, 0);
    assert.deepEqual(await inbox(lead), [], 'inside the 10 minutes the lead is not woken');
    await passes(cem, 11);
    const [woken, ...others] = await items(lead);
    assert.deepEqual(others, []);
    assert.deepEqual([woken.issueKey, woken.reason], [epic.issueKey, 'child_no_room']);
    // Which issue, on which seat, and why. Not the child a run started on, and not the one a person assigned: the lead may move neither.
    assert.deepEqual(woken.noRoom, [{ issueKey: first.issueKey, seat: 'dev-cem', reason: 'the allowance is used up' }]);
    // The Agents page shows the reason to whoever may see the seat, and not whose seat is full.
    const shown = (await page.readSeats(owner, 'w')).seats.find(found => found.name === 'lead').waiting;
    assert.deepEqual(shown.map(entry => [entry.issueKey, entry.reason, 'noRoom' in entry]), [[epic.issueKey, 'child_no_room', false]]);

    // Collab itself moves no developer issue, whoever reads.
    for (const reader of [devBob, devDeniz, revBob, revDeniz, devCem]) await items(reader);
    assert.deepEqual([await holder(first), await holder(byPerson)], [devCem.userId, devCem.userId]);

    // No other developer seat to give it to: one is at its limit, and the other has no number.
    await stale(deniz);
    assert.deepEqual(await inbox(lead), [], 'the only seat with room is at its limit');
    await stale(bob);
    assert.deepEqual(await inbox(lead), [], 'no other seat has a number');
    await report(bob, 60); await report(deniz, 40);
    assert.deepEqual(await inbox(lead), [[epic.issueKey, 'child_no_room']]);

    // The reasons that were there before come first, and carry nothing new.
    const done = busy[0];
    await raw.issue.update({ where: { id: done.id }, data: { statusId: `${A}-done` } });
    const [told] = await items(lead);
    assert.deepEqual([told.reason, 'noRoom' in told], ['child_done', false]);
    await raw.issue.update({ where: { id: done.id }, data: { statusId: `${A}-to_do`, updatedAt: ago(500) } });
    assert.deepEqual(await inbox(lead), [[epic.issueKey, 'child_no_room']]);

    // The lead takes its turn and moves nothing: it is not woken again for the same spell.
    await finish(lead, await start(lead, epic), 'blocked');
    assert.deepEqual(await inbox(lead), []);
    // A spell that reaches its 10 minutes after the lead last looked wakes it again.
    await report(cem, 50); await report(cem, 0); await passes(cem, 11);
    await looked(5);
    assert.deepEqual(await inbox(lead), [[epic.issueKey, 'child_no_room']]);

    // The lead moves it; when the first seat has room again it stays where it went.
    run = await start(lead, epic);
    assert.equal(await give(lead.token, first, devDeniz.userId), 200);
    await finish(lead, run, 'blocked');
    await looked(5);
    assert.deepEqual(await inbox(lead), []);
    assert.ok((await inbox(devDeniz)).some(([key, reason]) => key === first.issueKey && reason === 'assigned'));
    await report(cem, 80);
    assert.deepEqual(await inbox(lead), []);
    assert.equal(await holder(first), devDeniz.userId);

    // A run that starts between the wake and the lead's assignment keeps its seat.
    const late = await child();
    run = await start(lead, epic);
    assert.equal(await give(lead.token, late, devCem.userId), 200);
    await start(devCem, late);
    const refused = await send(item.PATCH, lead.token, 'PATCH', { body: { assigneeId: devDeniz.userId }, params: { issueIdOrKey: late.issueKey } });
    assert.deepEqual([refused.status, refused.body.error], [409, 'already_running']);
    assert.equal(await holder(late), devCem.userId);
    await finish(lead, run, 'blocked');
  });
});
