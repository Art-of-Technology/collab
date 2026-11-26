const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { Prisma } = require('@prisma/client');
const { load } = require('../security/helpers.cjs');
const { seatsDatabase } = require('./seats-db.cjs');

// CLB-951: a project's lead places work on the workspace's Developer seats as it does on its project's developer seats:
// they are in its list in the one order by room, it may assign them a child of its project, their limit of open issues
// from leads counts every project's lead together, and unstarted work moves between them and the project's seats.
// Token-facing routes accept only cuid-shaped ids.
const owner = 'cowner00001', lee = 'clee0000001', lena = 'clena000001', cem = 'ccem0000001', bob = 'cbob0000001', deniz = 'cdeniz00001';
const A = 'cprojecta001', B = 'cprojectb001';
const scopes = ['issues:read', 'issues:write', 'user:read'];
const ago = minutes => new Date(Date.now() - minutes * 60_000);
const NOTE = '## Done\nx\n## Decisions\nx\n## Evidence\nx\n## Next\nx';
const SPELL = ['agent_seat.no_room', 'agent_seat.room_back'];

let db;
after(() => db?.stop());

test('a project\'s lead places work on workspace Developer seats (CLB-951)', async t => {
  db = await seatsDatabase(async prisma => {
    await prisma.user.createMany({ data: [owner, lee, lena, cem, bob, deniz].map(id => ({ id, name: id, email: `${id}@example.test` })) });
    await prisma.workspace.create({ data: { id: 'w', name: 'w', slug: 'w', ownerId: owner } });
    await prisma.workspaceMember.createMany({ data: [lee, lena, cem, bob, deniz].map(userId => ({ workspaceId: 'w', userId })) });
    for (const [id, issuePrefix, name] of [[A, 'AA', 'Alpha'], [B, 'BB', 'Beta']]) {
      await prisma.project.create({ data: { id, workspaceId: 'w', name, slug: id, issuePrefix } });
      await prisma.projectStatus.createMany({ data: ['to_do', 'in_progress', 'done'].map((status, order) => ({ id: `${id}-${status}`, projectId: id, name: status, displayName: status,
        order, isDefault: !order, isFinal: status === 'done' })) });
      await prisma.repository.create({ data: { projectId: id, githubRepoId: id, owner: 'acme', name, fullName: `acme/${name}`, webhookSecret: 'secret' } });
    }
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
  const globals = { console, URL, Date, Buffer, process: { env: { NEXTAUTH_URL: 'https://collab.test' } } };
  const finder = load('src/lib/issue-finder.ts', { '@/lib/prisma': { prisma } });
  const handoffs = load('src/lib/agent-handoffs.ts', { 'node:crypto': require('node:crypto'), 'node:buffer': require('node:buffer'), zod,
    '@/lib/prisma': { prisma }, '@/lib/issue-finder': finder, '@/lib/oauth-scopes': load('src/lib/oauth-scopes.ts') }, { Date });
  const tokens = load('src/lib/agent-tokens.ts', { crypto: require('node:crypto'), '@/lib/prisma': { prisma }, '@/lib/apps/crypto': crypto }, { Buffer, Date });
  const assignee = load('src/lib/issue-assignee.ts', { './agent-handoffs': handoffs });
  const seats = load('src/lib/agent-seats.ts', { '@/lib/prisma': { prisma }, '@/lib/agent-handoffs': handoffs, '@/lib/agent-tokens': tokens, '@/lib/issue-assignee': assignee,
    '@/lib/issue-finder': finder }, { Date });
  const runners = load('src/lib/agent-runners.ts', { crypto: require('node:crypto'), '@/lib/prisma': { prisma }, '@/lib/agent-handoffs': handoffs, '@/lib/agent-tokens': tokens,
    '@/lib/agent-seats': seats }, { Date });
  const middleware = load('src/lib/apps/auth-middleware.ts', { crypto: require('node:crypto'), 'next/server': response,
    '@/lib/apps/crypto': crypto, '@/lib/oauth-scopes': load('src/lib/oauth-scopes.ts'), '@/lib/post-access': load('src/lib/post-access.ts'),
    '@/lib/auth-error-diagnostics': load('src/lib/auth-error-diagnostics.ts'), '@/lib/prisma': { prisma } }, globals);
  const http = load('src/lib/agent-handoff-http.ts', { zod, 'next/server': response, './agent-handoffs': handoffs }, globals);
  class ForgeProjectWriteError extends Error {}
  const deps = {
    '@/lib/redis': { publishEvent: async () => true }, zod, '@prisma/client': require('@prisma/client'), 'next/server': response,
    '@/lib/prisma': { prisma, issueTrashPrisma: raw }, '@/lib/issue-finder': finder, '@/lib/issue-assignee': assignee, '@/lib/agent-seats': seats, '@/lib/agent-tokens': tokens,
    '@/lib/agent-handoffs': handoffs, '@/lib/agent-handoff-http': http, '@/lib/agent-runners': runners,
    '@/lib/agent-label-triggers': load('src/lib/agent-label-triggers.ts', { 'node:crypto': require('node:crypto') }),
    '@/lib/permissions': { Permission: {}, canActOnOwnContent: () => true, checkUserPermission: async () => ({ hasPermission: true }),
      checkUserPermissions: async () => ({ undefined: { hasPermission: true } }) },
    '@/utils/html-normalizer': { normalizeDescriptionHTML: value => value },
    '@/lib/forge/legacy-write-guard': { assertLegacyProjectWriteAllowed: async () => {}, assertLegacyIssueWriteAllowed: async () => {}, assertLegacyIssueDeleteAllowed: async () => {}, ForgeProjectWriteError },
    '@/lib/apps/auth-middleware': middleware,
    '@/lib/event-bus': { emitIssueCreated: async () => {}, emitIssueUpdated: async () => {}, emitIssueDeleted: async () => {} },
  };
  deps['@/lib/agent-runs'] = load('src/lib/agent-runs.ts', deps, { Date });
  deps['@/lib/agent-requests'] = load('src/lib/agent-requests.ts', deps, { Date, console });
  deps['@/lib/issue-mutation'] = load('src/lib/issue-mutation.ts', deps);
  const route = path => load(`src/app/api/apps/auth/${path}/route.ts`, deps, globals);
  const item = route('issues/[issueIdOrKey]'), contextRoute = route('issues/[issueIdOrKey]/run-context'), inboxRoute = route('seats/me/inbox'),
    runs = route('runs'), one = route('runs/[id]');
  const pairRoute = load('src/app/api/runner/pair/route.ts', deps, globals), fetchRoute = load('src/app/api/runner/seats/route.ts', deps, globals);

  const send = async (handler, token, method, { body, params = {} } = {}) => {
    const reply = await handler(new Request('https://collab.test/api', { method, headers: { Authorization: `Bearer ${token}` },
      ...(body && { body: JSON.stringify(body) }) }), { params: Promise.resolve(params) });
    return { status: reply.status, body: await reply.json().catch(() => null) };
  };
  const all = [];
  const seat = async (name, projectId, role, ownerId) => {
    const made = await seats.createSeat({ workspaceId: 'w', actorId: owner, projectId, role, ownerId, name, expiresInDays: 30 });
    all.push({ ...made.seat, token: made.token.token });
    return all.at(-1);
  };
  // Every seat is run by its owner's runner: room is what places and moves work.
  const leadA = await seat('lead-a', A, 'lead', lee), leadB = await seat('lead-b', B, 'lead', lena);
  const devCem = await seat('dev-cem', A, 'developer', cem);
  // Of the whole workspace: Bob's Developer, Deniz's Reviewer, and the workspace's Lead.
  const wsBob = await seat('ws-bob', null, 'developer', bob), wsRev = await seat('ws-rev', null, 'reviewer', deniz), wsLead = await seat('ws-lead', null, 'lead', deniz);
  await raw.agentSeat.updateMany({ data: { byRunner: true } });
  for (const found of all) await raw.agentSeat.update({ where: { id: found.id }, data: { createdAt: new Date(found.createdAt.getTime() - 600 * 60_000) } });
  const of = person => all.filter(found => found.ownerId === person);

  const credentials = {};
  for (const person of [lee, lena, cem, bob, deniz]) {
    const reply = await pairRoute.POST(new Request('https://collab.test/api', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: person }) }));
    const started = await reply.json();
    await runners.admitRunner({ workspaceId: 'w', actorId: person, code: started.code });
    credentials[person] = started.credential;
    const admitted = await raw.agentRunner.findFirstOrThrow({ where: { ownerId: person, removedAt: null } });
    await raw.appToken.updateMany({ where: { userId: { in: of(person).map(found => found.userId) } }, data: { runnerId: admitted.id, isRevoked: false, revokedAt: null } });
  }
  const report = async (person, room) => {
    const have = (await raw.appToken.findMany({ where: { userId: { in: of(person).map(found => found.userId) } }, select: { id: true } })).map(found => found.id);
    const reply = await fetchRoute.POST(new Request('https://collab.test/api', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${credentials[person]}` },
      body: JSON.stringify({ have, state: 'working', rooms: of(person).map(found => ({ seat: found.id, room, program: 'Claude Code' })) }) }));
    assert.equal(reply.status, 200, JSON.stringify(await reply.clone().json()));
    // A runner does not fetch a seat of the whole workspace yet (`fetchSeats`), so it reports no figure for one: the
    // figure is written here as a report stores it, with the spell without room it opens or ends.
    const wide = of(person).filter(found => found.projectId === null);
    if (wide.length) await raw.$transaction(async tx => {
      const at = new Date(), until = await tx.agentSeat.findMany({ where: { id: { in: wide.map(found => found.id) } } });
      await tx.agentSeat.updateMany({ where: { id: { in: wide.map(found => found.id) } }, data: { room, roomProgram: 'Claude Code', roomAt: at } });
      await seats.markNoRoom(tx, 'w', until.map(found => ({ id: found.id, userId: found.userId, before: seats.saysNoRoom(found, 'working', at), after: room <= 0 })), at);
    });
  };
  /** Time is written, not waited for: this many minutes pass for a person's spells without room. */
  const passes = async (person, minutes) => {
    for (const row of await raw.appAuditLog.findMany({ where: { actorId: { in: of(person).map(found => found.userId) }, action: { in: SPELL } } })) {
      await raw.appAuditLog.update({ where: { id: row.id }, data: { createdAt: new Date(row.createdAt.getTime() - minutes * 60_000) } });
    }
  };
  for (const person of [lee, lena, cem, bob, deniz]) await report(person, 50);

  let count = 0;
  const issue = (projectId, data = {}) => raw.issue.create({ data: { workspaceId: 'w', projectId, title: `Issue ${++count}`, issueKey: `K-${count}`, statusId: `${projectId}-to_do`, ...data } });
  const personGives = async (target, userId, at = new Date()) => {
    await raw.issue.update({ where: { id: target.id }, data: { assigneeId: userId } });
    const row = { role: 'ASSIGNEE', status: 'APPROVED', approvedAt: at, approvedBy: owner };
    await raw.issueAssignee.upsert({ where: { issueId_userId: { issueId: target.id, userId } }, create: { issueId: target.id, userId, ...row }, update: row });
  };
  /** The assignee as `lead` sets it through the route every token uses; `[status, error code]`. */
  const give = async (lead, target, assigneeId) => {
    const reply = await send(item.PATCH, lead.token, 'PATCH', { body: { assigneeId }, params: { issueIdOrKey: target.issueKey } });
    return [reply.status, reply.status === 200 ? undefined : reply.body.error];
  };
  const items = async who => { const reply = await send(inboxRoute.GET, who.token, 'GET'); assert.equal(reply.status, 200, JSON.stringify(reply.body)); return reply.body.items; };
  const inbox = async who => (await items(who)).map(entry => [entry.issueKey, entry.reason]);
  const holder = async target => (await raw.issue.findUniqueOrThrow({ where: { id: target.id } })).assigneeId;
  const leadView = async (lead, target) => {
    const reply = await send(contextRoute.GET, lead.token, 'GET', { params: { issueIdOrKey: target.issueKey } });
    assert.equal(reply.status, 200, JSON.stringify(reply.body));
    return reply.body.lead;
  };
  const start = async (who, target) => {
    const reply = await send(runs.POST, who.token, 'POST', { body: { issue: target.issueKey, generation: 'g1', runner: 'test' } });
    assert.equal(reply.status, 200, JSON.stringify(reply.body));
    return reply.body.run.id;
  };
  const finish = async (who, id, outcome) => assert.equal((await send(one.PATCH, who.token, 'PATCH', { body: { event: 'finish', generation: 'g1', outcome, note: NOTE, nextStep: 'wait' }, params: { id } })).status, 200);
  const moves = async target => (await raw.issueActivity.findMany({ where: { itemId: target.id, action: 'STORY_MOVED' }, orderBy: { createdAt: 'asc' } }))
    .map(entry => JSON.parse(entry.details));

  const epicA = await issue(A, { type: 'EPIC' }), epicB = await issue(B, { type: 'EPIC' });
  await personGives(epicA, leadA.userId, ago(1000));
  await personGives(epicB, leadB.userId, ago(1000));
  /** The stories of an earlier case are done with, long ago, so they bring no epic back. */
  const settle = async () => {
    await raw.agentRun.updateMany({ where: { endedAt: null }, data: { endedAt: new Date(), state: 'stopped' } });
    await raw.issue.updateMany({ where: { type: { not: 'EPIC' }, projectId: A }, data: { statusId: `${A}-done`, updatedAt: ago(500) } });
    await raw.issue.updateMany({ where: { type: { not: 'EPIC' }, projectId: B }, data: { statusId: `${B}-done`, updatedAt: ago(500) } });
    for (const person of [lee, lena, cem, bob, deniz]) await report(person, 50);
  };
  // Each case starts from settled work, so one that fails leaves the next its own.
  t.beforeEach(settle);

  await t.test('the lead\'s list has the workspace\'s Developer seats, in the one order by room with its project\'s', async () => {
    await report(bob, 80); await report(cem, 30);
    const view = await leadView(leadA, epicA);
    assert.deepEqual(view.seats.map(found => found.name), ['ws-bob', 'dev-cem'], 'not the workspace\'s Reviewer or Lead, and the most room first');
    assert.equal(view.cap, 3);
    await report(cem, 90);
    assert.deepEqual((await leadView(leadA, epicA)).seats.map(found => found.name), ['dev-cem', 'ws-bob']);
    // A project with no developer seat of its own lists the workspace's.
    assert.deepEqual((await leadView(leadB, epicB)).seats.map(found => found.name), ['ws-bob']);
    await settle();
  });

  await t.test('a lead assigns a child of its project to a workspace Developer seat, and nothing it could not before', async () => {
    const child = await issue(A, { parentId: epicA.id }), other = await issue(A, { parentId: epicA.id }), ofB = await issue(B, { parentId: epicB.id });
    assert.deepEqual(await give(leadA, child, wsBob.userId), [200, undefined]);
    assert.equal(await holder(child), wsBob.userId);
    assert.deepEqual(await inbox(wsBob), [[child.issueKey, 'assigned']]);
    // Not a workspace seat of another role, and not an issue of another project.
    assert.deepEqual(await give(leadA, other, wsRev.userId), [422, 'role_mismatch']);
    assert.deepEqual(await give(leadA, other, wsLead.userId), [403, 'seat_scope']);
    assert.deepEqual(await give(leadA, ofB, wsBob.userId), [403, 'wrong_project']);
    assert.deepEqual([await holder(other), await holder(ofB)], [null, null]);
    await settle();
  });

  await t.test('a workspace seat\'s limit counts the issues of every project\'s lead together', async () => {
    const [a1, a2, a3] = [await issue(A, { parentId: epicA.id }), await issue(A, { parentId: epicA.id }), await issue(A, { parentId: epicA.id })];
    const [b1, b2] = [await issue(B, { parentId: epicB.id }), await issue(B, { parentId: epicB.id })];
    assert.deepEqual(await give(leadA, a1, wsBob.userId), [200, undefined]);
    assert.deepEqual(await give(leadB, b1, wsBob.userId), [200, undefined]);
    assert.deepEqual(await give(leadA, a2, wsBob.userId), [200, undefined]);
    // Three open from two leads: neither lead may give it a fourth.
    assert.deepEqual(await give(leadB, b2, wsBob.userId), [429, 'lead_cap']);
    assert.deepEqual(await give(leadA, a3, wsBob.userId), [429, 'lead_cap']);
    for (const [lead, epic] of [[leadA, epicA], [leadB, epicB]]) {
      assert.equal((await leadView(lead, epic)).seats.find(found => found.name === 'ws-bob').openFromLead, 3, 'each lead reads the seat\'s whole count');
    }
    // A project seat still counts its own project's lead only.
    assert.equal((await leadView(leadA, epicA)).seats.find(found => found.name === 'dev-cem').openFromLead, 0);
    await raw.issue.update({ where: { id: a1.id }, data: { statusId: `${A}-done` } });
    assert.deepEqual(await give(leadB, b2, wsBob.userId), [200, undefined]);
    await settle();
  });

  /** Stories as the lead places them: in a run of its own on the epic, which then finishes blocked, long ago. */
  const place = async (lead, epic, pairs) => {
    const run = await start(lead, epic);
    const made = [];
    for (const on of pairs) { const story = await issue(epic.projectId, { parentId: epic.id }); assert.deepEqual(await give(lead, story, on.userId), [200, undefined]); made.push(story); }
    await finish(lead, run, 'blocked');
    await raw.agentRun.updateMany({ where: { issueId: epic.id }, data: { startedAt: ago(101), endedAt: ago(100) } });
    return made;
  };

  await t.test('the lead is offered the move off a workspace seat with no room, and off a project seat to one', async () => {
    const [onBob] = await place(leadA, epicA, [wsBob]);
    await report(cem, 60); await report(bob, 0); await passes(bob, 11);
    assert.deepEqual(await inbox(leadA), [[epicA.issueKey, 'child_no_room']]);
    await settle();
    const [onCem] = await place(leadA, epicA, [devCem]);
    await report(bob, 60); await report(cem, 0); await passes(cem, 11);
    assert.deepEqual(await inbox(leadA), [[epicA.issueKey, 'child_no_room']], 'the only seat with room is the workspace\'s');
    assert.deepEqual([await holder(onBob), await holder(onCem)], [wsBob.userId, devCem.userId]);
    await settle();
  });

  await t.test('Collab moves unstarted work between a project seat and a workspace seat as between two project seats', async () => {
    // Off the workspace seat, on the project seat's read.
    const [fromBob] = await place(leadA, epicA, [wsBob]);
    await report(cem, 60); await report(bob, 0); await passes(bob, 11); await report(lee, 0); await passes(lee, 11);
    await inbox(devCem);
    assert.equal(await holder(fromBob), devCem.userId);
    assert.deepEqual((await moves(fromBob)).map(entry => [entry.from, entry.to]), [['ws-bob', 'dev-cem']]);
    await settle();
    // Onto the workspace seat, on its own read; inside the 10 minutes nothing moves.
    const [fromCem] = await place(leadA, epicA, [devCem]);
    await report(bob, 60); await report(cem, 0); await passes(cem, 9); await report(lee, 0); await passes(lee, 11);
    await inbox(wsBob);
    assert.equal(await holder(fromCem), devCem.userId, 'nine minutes are not ten');
    await passes(cem, 2);
    assert.deepEqual(await inbox(wsBob), [[fromCem.issueKey, 'assigned']]);
    assert.deepEqual((await moves(fromCem)).map(entry => [entry.from, entry.to]), [['dev-cem', 'ws-bob']]);
    await settle();
  });

  await t.test('a move onto a workspace seat respects its limit across projects', async () => {
    // Bob holds two from lead B and one is the limit's last place: lead A's story may take it, a second may not.
    await place(leadB, epicB, [wsBob, wsBob]);
    const [s1, s2] = await place(leadA, epicA, [devCem, devCem]);
    await report(bob, 60); await report(cem, 0); await passes(cem, 11); await report(lee, 0); await passes(lee, 11);
    await inbox(wsBob);
    assert.deepEqual([await holder(s1), await holder(s2)], [wsBob.userId, devCem.userId]);
    await settle();
  });

  // Last: it retires lead B.
  await t.test('a workspace seat\'s limit still counts what a lead placed after that lead is retired', async () => {
    const [b1, b2] = [await issue(B, { parentId: epicB.id }), await issue(B, { parentId: epicB.id })];
    const [a1, a2] = [await issue(A, { parentId: epicA.id }), await issue(A, { parentId: epicA.id })];
    assert.deepEqual(await give(leadB, b1, wsBob.userId), [200, undefined]);
    assert.deepEqual(await give(leadB, b2, wsBob.userId), [200, undefined]);
    await seats.retireSeat({ workspaceId: 'w', actorId: owner, seatId: leadB.id });
    // Retiring the lead leaves its two placements open on Bob's seat: they keep their places.
    assert.deepEqual([await holder(b1), await holder(b2)], [wsBob.userId, wsBob.userId]);
    assert.equal((await leadView(leadA, epicA)).seats.find(found => found.name === 'ws-bob').openFromLead, 2);
    assert.deepEqual(await give(leadA, a1, wsBob.userId), [200, undefined]);
    assert.deepEqual(await give(leadA, a2, wsBob.userId), [429, 'lead_cap']);
    assert.equal(await holder(a2), null);
  });
});
