const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { Prisma } = require('@prisma/client');
const { load } = require('../security/helpers.cjs');
const { seatsDatabase } = require('./seats-db.cjs');

// CLB-793: Collab moves a story the lead placed when the lead's own seat has no room either.
// Token-facing routes accept only cuid-shaped ids.
const owner = 'cowner00001', lee = 'clee0000001', cem = 'ccem0000001', bob = 'cbob0000001', deniz = 'cdeniz00001';
const A = 'cprojecta001';
const scopes = ['issues:read', 'issues:write', 'user:read'];
const ago = minutes => new Date(Date.now() - minutes * 60_000);
const NOTE = '## Done\nx\n## Decisions\nx\n## Evidence\nx\n## Next\nx';
const SPELL = ['agent_seat.no_room', 'agent_seat.room_back'];

let db;
after(() => db?.stop());

test('Collab moves an unstarted story the lead placed when the lead cannot run either', async t => {
  db = await seatsDatabase(async prisma => {
    await prisma.user.createMany({ data: [owner, lee, cem, bob, deniz].map(id => ({ id, name: id, email: `${id}@example.test` })) });
    await prisma.workspace.create({ data: { id: 'w', name: 'w', slug: 'w', ownerId: owner } });
    await prisma.workspaceMember.createMany({ data: [lee, cem, bob, deniz].map(userId => ({ workspaceId: 'w', userId })) });
    await prisma.project.create({ data: { id: A, workspaceId: 'w', name: A, slug: A, issuePrefix: 'AA' } });
    await prisma.projectStatus.createMany({ data: ['to_do', 'in_progress', 'done'].map((name, order) => ({ id: `${A}-${name}`, projectId: A, name, displayName: name,
      order, isDefault: !order, isFinal: name === 'done' })) });
    await prisma.repository.create({ data: { projectId: A, githubRepoId: A, owner: 'acme', name: A, fullName: `acme/${A}`, webhookSecret: 'secret' } });
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
  const seats = load('src/lib/agent-seats.ts', { '@/lib/prisma': { prisma }, '@/lib/agent-handoffs': handoffs, '@/lib/agent-tokens': tokens, '@/lib/issue-assignee': assignee }, { Date });
  const runners = load('src/lib/agent-runners.ts', { crypto: require('node:crypto'), '@/lib/prisma': { prisma }, '@/lib/agent-handoffs': handoffs, '@/lib/agent-tokens': tokens,
    '@/lib/agent-seats': seats }, { Date });
  const middleware = load('src/lib/apps/auth-middleware.ts', { crypto: require('node:crypto'), 'next/server': response,
    '@/lib/apps/crypto': crypto, '@/lib/oauth-scopes': load('src/lib/oauth-scopes.ts'), '@/lib/post-access': load('src/lib/post-access.ts'),
    '@/lib/auth-error-diagnostics': load('src/lib/auth-error-diagnostics.ts'), '@/lib/prisma': { prisma } }, globals);
  const http = load('src/lib/agent-handoff-http.ts', { zod, 'next/server': response, './agent-handoffs': handoffs }, globals);
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
    '@/lib/forge/legacy-write-guard': { assertLegacyProjectWriteAllowed: async () => {}, assertLegacyIssueWriteAllowed: async () => {}, assertLegacyIssueDeleteAllowed: async () => {}, ForgeProjectWriteError },
    '@/lib/apps/auth-middleware': middleware,
    '@/lib/event-bus': { emitIssueCreated: async () => {}, emitIssueUpdated: async (...args) => { updates.push(args); }, emitIssueDeleted: async () => {} },
  };
  deps['@/lib/agent-runs'] = load('src/lib/agent-runs.ts', deps, { Date });
  deps['@/lib/agent-requests'] = load('src/lib/agent-requests.ts', deps, { Date, console });
  deps['@/lib/issue-mutation'] = load('src/lib/issue-mutation.ts', deps);
  const route = path => load(`src/app/api/apps/auth/${path}/route.ts`, deps, globals);
  const item = route('issues/[issueIdOrKey]'), requests = route('seats/me/requests'), inboxRoute = route('seats/me/inbox'), runs = route('runs'), one = route('runs/[id]');
  const pairRoute = load('src/app/api/runner/pair/route.ts', deps, globals), fetchRoute = load('src/app/api/runner/seats/route.ts', deps, globals);
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
  // Every seat is run by its owner's runner, the lead's too: its room is what this story is about.
  const lead = await seat('lead', 'lead', lee);
  const devCem = await seat('dev-cem', 'developer', cem), revCem = await seat('rev-cem', 'reviewer', cem);
  const devBob = await seat('dev-bob', 'developer', bob), revBob = await seat('rev-bob', 'reviewer', bob);
  const devDeniz = await seat('dev-deniz', 'developer', deniz), revDeniz = await seat('rev-deniz', 'reviewer', deniz);
  await raw.agentSeat.updateMany({ data: { byRunner: true } });
  for (const found of all) await raw.agentSeat.update({ where: { id: found.id }, data: { createdAt: new Date(found.createdAt.getTime() - 600 * 60_000) } });
  const of = person => all.filter(found => found.ownerId === person);

  const credentials = {};
  const connect = async person => {
    const reply = await pairRoute.POST(new Request('https://collab.test/api', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: person }) }));
    const started = await reply.json();
    await runners.admitRunner({ workspaceId: 'w', actorId: person, code: started.code });
    credentials[person] = started.credential;
    const admitted = await raw.agentRunner.findFirstOrThrow({ where: { ownerId: person, removedAt: null } });
    await raw.appToken.updateMany({ where: { userId: { in: of(person).map(found => found.userId) } }, data: { runnerId: admitted.id, isRevoked: false, revokedAt: null } });
  };
  for (const person of [lee, cem, bob, deniz]) await connect(person);
  const report = async (person, room, state = 'working') => {
    const have = (await raw.appToken.findMany({ where: { userId: { in: of(person).map(found => found.userId) } }, select: { id: true } })).map(found => found.id);
    const reply = await fetchRoute.POST(new Request('https://collab.test/api', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${credentials[person]}` },
      body: JSON.stringify({ have, state, ...(room !== null && { rooms: of(person).map(found => ({ seat: found.id, room, program: 'Claude Code' })) }) }) }));
    assert.equal(reply.status, 200, JSON.stringify(await reply.clone().json()));
  };
  /** Time is written, not waited for: this many minutes pass for a person's spells without room. */
  const passes = async (person, minutes) => {
    for (const row of await raw.appAuditLog.findMany({ where: { actorId: { in: of(person).map(found => found.userId) }, action: { in: SPELL } } })) {
      await raw.appAuditLog.update({ where: { id: row.id }, data: { createdAt: new Date(row.createdAt.getTime() - minutes * 60_000) } });
    }
  };
  const stale = person => raw.agentSeat.updateMany({ where: { ownerId: person }, data: { roomAt: ago(16) } });

  let count = 0;
  const issue = (data = {}) => raw.issue.create({ data: { workspaceId: 'w', projectId: A, title: `Issue ${++count}`, issueKey: `K-${count}`, statusId: `${A}-to_do`, ...data } });
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
  const give = async (target, assigneeId) => assert.equal((await send(item.PATCH, lead.token, 'PATCH', { body: { assigneeId }, params: { issueIdOrKey: target.issueKey } })).status, 200);
  const moves = async target => (await raw.issueActivity.findMany({ where: { itemId: target.id, action: 'STORY_MOVED' }, orderBy: { createdAt: 'asc' } }))
    .map(entry => ({ ...entry, details: JSON.parse(entry.details) }));
  const comments = async target => raw.issueComment.findMany({ where: { issueId: target.id }, orderBy: { createdAt: 'asc' } });

  const epic = await issue({ type: 'EPIC' });
  await personGives(epic, lead.userId, ago(1000));
  /** Stories as the lead places them: in a run of its own on the epic, which then finishes blocked. Rooms are set for the case afterwards. */
  const place = async pairs => {
    for (const person of [lee, cem, bob, deniz]) await report(person, 50);
    const run = await start(lead, epic);
    const made = [];
    for (const [on, data] of pairs) { const story = await issue({ parentId: epic.id, ...data }); await give(story, on.userId); made.push(story); }
    await finish(lead, run, 'blocked');
    // The lead looked long ago: what happens to a child is measured from when its last run started.
    await raw.agentRun.updateMany({ where: { issueId: epic.id }, data: { startedAt: ago(101), endedAt: ago(100) } });
    return made;
  };
  /** The stories of an earlier case are done with. */
  const settle = async () => {
    await raw.agentRun.updateMany({ where: { endedAt: null }, data: { endedAt: new Date(), state: 'stopped' } });
    // Done long ago, so they do not bring the epic back.
    await raw.issue.updateMany({ where: { parentId: epic.id }, data: { statusId: `${A}-done`, updatedAt: ago(500) } });
    await raw.issue.updateMany({ where: { agentRequestRole: { not: null } }, data: { statusId: `${A}-done` } });
  };
  /** Cem's seat has had no room for 11 minutes, Bob has the most room and Deniz some. */
  const cemFull = async () => { await report(bob, 60); await report(deniz, 40); await report(cem, 0); await passes(cem, 11); };

  let first, byPerson;
  await t.test('nothing moves while the lead has room, while its room is unknown, or inside its 10 minutes', async () => {
    [first] = await place([[devCem]]);
    byPerson = await issue({ parentId: epic.id });
    await personGives(byPerson, devCem.userId);
    await cemFull();
    await report(lee, 50);
    assert.deepEqual(await inbox(devBob), [], 'the lead has room: it is woken and moves the story itself');
    assert.deepEqual((await inbox(lead)).map(([, reason]) => reason), ['child_no_room']);
    await stale(lee);
    assert.deepEqual(await inbox(devBob), [], 'unknown is not no room');
    await report(lee, 0); await passes(lee, 9);
    assert.deepEqual(await inbox(devBob), [], 'nine minutes are not ten');
    assert.equal(await holder(first), devCem.userId);
    assert.deepEqual(await moves(first), []);
  });

  await t.test('when the lead has had no room for 10 minutes too, Collab moves the story to the seat with the most room and says so twice', async () => {
    await passes(lee, 2);
    // The read of a seat of another role moves no story.
    await items(revBob);
    assert.equal(await holder(first), devCem.userId);
    assert.deepEqual(await inbox(devDeniz), [], 'any developer seat\'s read moves it, to the seat the order puts first');
    assert.equal(await holder(first), devBob.userId);
    assert.deepEqual(await inbox(devBob), [[first.issueKey, 'assigned']], 'the new seat\'s inbox offers it');
    assert.equal(await holder(byPerson), devCem.userId, 'a story a person assigned is left');

    const [entry, ...more] = await moves(first);
    assert.deepEqual(more, []);
    const why = 'dev-cem had no room for 10 minutes (the allowance is used up), and so had the lead seat lead (the allowance is used up)';
    assert.deepEqual(entry.details, { fromSeatId: devCem.id, from: 'dev-cem', toSeatId: devBob.id, to: 'dev-bob', why });
    assert.deepEqual([entry.userId, entry.oldValue, entry.newValue], [lead.userId, devCem.userId, devBob.userId]);
    assert.equal(getActionText({ ...entry, user: { name: 'lead' } }), `Collab moved this issue from dev-cem to dev-bob: ${why}`);
    // The lead's hand stays on the row: the story counts toward its limit and it may still move it.
    assert.deepEqual((await raw.issueAssignee.findMany({ where: { issueId: first.id } })).map(row => [row.userId, row.approvedBy]), [[devBob.userId, lead.userId]]);
    const emitted = updates.filter(([found, , by]) => found.id === first.id && by.source === 'agent-request');
    assert.deepEqual(emitted.map(([found]) => found.assigneeId), [devBob.userId]);

    const [onStory, ...moreOnStory] = await comments(first);
    assert.deepEqual(moreOnStory, []);
    assert.equal(onStory.authorId, lead.userId);
    assert.equal(onStory.content, `Collab moved this story from dev-cem to dev-bob, because ${why}. No run had started on it.`);
    const onEpic = await comments(epic);
    assert.equal(onEpic.length, 1);
    assert.equal(onEpic[0].authorId, lead.userId);
    assert.match(onEpic[0].content, new RegExp(`^Collab moved ${first.issueKey} from dev-cem to dev-bob, because`));
    assert.match(onEpic[0].content, /same files/);
    for (const found of [onStory, ...onEpic]) assert.ok(!/\d\s*%/.test(found.content), 'no percentage');

    // Later reads move nothing more, and the lead is not offered a child that sits on a seat with room.
    await inbox(devBob); await inbox(devDeniz);
    assert.equal((await moves(first)).length, 1);
    assert.equal((await comments(epic)).length, 1);
    assert.deepEqual(await inbox(lead), []);
  });

  await t.test('moved work is not moved back, and a seat it was never on may take it', async () => {
    await report(cem, 80);
    await report(bob, 0); await passes(bob, 11); await stale(deniz);
    await inbox(devCem); await inbox(devDeniz);
    assert.equal(await holder(first), devBob.userId, 'the only seat with room is the one it left');
    await report(deniz, 40);
    await inbox(devDeniz);
    assert.equal(await holder(first), devDeniz.userId);
    assert.deepEqual((await moves(first)).map(entry => [entry.details.from, entry.details.to]), [['dev-cem', 'dev-bob'], ['dev-bob', 'dev-deniz']]);
    await settle();
  });

  await t.test('a story a run ever started on, one under an epic the lead is running, and a lone story stay', async () => {
    const [ran, lone, waits] = await place([[devCem], [devCem], [devCem]]);
    await raw.agentRun.create({ data: { workspaceId: 'w', issueId: ran.id, seatId: devCem.id, userId: devCem.userId, runner: 'test', generation: 'g0',
      state: 'stopped', startedAt: ago(30), endedAt: ago(29) } });
    // Taken out of the lead's epic: Collab moves only a child of the issue the lead holds, as the lead is woken only for those.
    await raw.issue.update({ where: { id: lone.id }, data: { parentId: null } });
    await cemFull(); await report(lee, 0); await passes(lee, 11);
    // A run of the lead's is open on the epic: the lead is deciding now.
    await raw.agentRun.create({ data: { workspaceId: 'w', issueId: epic.id, seatId: lead.id, userId: lead.userId, runner: 'test', generation: 'g-open', state: 'running' } });
    await inbox(devBob);
    assert.deepEqual([await holder(ran), await holder(lone), await holder(waits)], [devCem.userId, devCem.userId, devCem.userId]);
    await raw.agentRun.deleteMany({ where: { issueId: epic.id, generation: 'g-open' } });
    await inbox(devBob);
    assert.deepEqual([await holder(ran), await holder(lone), await holder(waits)], [devCem.userId, devCem.userId, devBob.userId]);
    await raw.issue.update({ where: { id: lone.id }, data: { statusId: `${A}-done` } });
    await settle();
  });

  await t.test('a lead that already saw the no-room spell keeps its story', async () => {
    const [kept] = await place([[devCem]]);
    await cemFull(); await report(lee, 0); await passes(lee, 11);
    const latest = await raw.agentRun.findFirstOrThrow({ where: { issueId: epic.id }, orderBy: { startedAt: 'desc' } });
    await raw.agentRun.updateMany({ where: { issueId: epic.id, id: { not: latest.id } }, data: { startedAt: ago(301), endedAt: ago(300) } });
    await raw.agentRun.update({ where: { id: latest.id }, data: { startedAt: ago(1), endedAt: ago(0.5) } });
    await inbox(devBob);
    assert.equal(await holder(kept), devCem.userId);
    await raw.agentRun.update({ where: { id: latest.id }, data: { startedAt: ago(101), endedAt: ago(100), outcome: 'done' } });
    await inbox(devBob);
    assert.equal(await holder(kept), devCem.userId);
    await raw.agentRun.update({ where: { id: latest.id }, data: { outcome: 'blocked' } });
    await raw.issueAssignee.update({ where: { issueId_userId: { issueId: epic.id, userId: lead.userId } }, data: { approvedAt: ago(1) } });
    await inbox(devBob);
    assert.equal(await holder(kept), devCem.userId);
    await raw.issueAssignee.update({ where: { issueId_userId: { issueId: epic.id, userId: lead.userId } }, data: { approvedAt: ago(1000) } });
    await inbox(devBob);
    assert.equal(await holder(kept), devBob.userId);
    await settle();
  });

  await t.test('a lead checkout committed while the move waits on the parent wins', async () => {
    const [kept] = await place([[devCem]]);
    await cemFull(); await report(lee, 0); await passes(lee, 11);
    let moving;
    let entered;
    const ready = new Promise(resolve => { entered = resolve; });
    const observed = new Proxy(prisma, { get(target, key) {
      if (key === '$transaction') return (...args) => { entered(); return target.$transaction(...args); };
      const value = target[key];
      return typeof value === 'function' ? value.bind(target) : value;
    } });
    const sweep = load('src/lib/agent-requests.ts', { ...deps, '@/lib/prisma': { prisma: observed, issueTrashPrisma: raw } }, { Date, console });
    await raw.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "Issue" WHERE "id" = ${epic.id} FOR UPDATE`;
      moving = sweep.moveUnstarted({ user: { id: devBob.userId }, workspace: { id: 'w', name: 'w', slug: 'w' } });
      await ready;
      await tx.agentRun.create({ data: { workspaceId: 'w', issueId: epic.id, seatId: lead.id, userId: lead.userId, runner: 'test', generation: 'parent-race', state: 'running' } });
    });
    await moving;
    assert.equal(await holder(kept), devCem.userId);
    assert.equal((await moves(kept)).length, 0);
    await settle();
  });

  await t.test('nothing moves when no other developer seat has a number', async () => {
    const [kept] = await place([[devCem]]);
    await cemFull(); await report(lee, 0); await passes(lee, 11);
    await stale(bob); await report(deniz, 0);
    await inbox(devBob); await inbox(devDeniz);
    assert.equal(await holder(kept), devCem.userId);
    await report(bob, 5);
    await inbox(devBob);
    assert.equal(await holder(kept), devBob.userId);
    await settle();
  });

  await t.test('Collab moves at most what the lead\'s limit lets a seat hold', async () => {
    // Bob holds 2 open stories from the lead, Deniz 3: room is left for one more, on Bob.
    const [s1, s2] = await place([[devCem], [devCem], [devBob], [devBob], [devDeniz], [devDeniz], [devDeniz]]);
    await cemFull(); await report(lee, 0); await passes(lee, 11);
    await inbox(devDeniz); await inbox(devBob);
    assert.deepEqual([await holder(s1), await holder(s2)], [devBob.userId, devCem.userId]);
    // One of Deniz's is done: there is room under the limit there now.
    const [done] = await raw.issue.findMany({ where: { parentId: epic.id, assigneeId: devDeniz.userId, statusId: `${A}-to_do` }, take: 1 });
    await raw.issue.update({ where: { id: done.id }, data: { statusId: `${A}-done` } });
    await inbox(devBob);
    assert.equal(await holder(s2), devDeniz.userId);
    await settle();
  });

  await t.test('a target filled while the move waits gives way to the next seat', async () => {
    const [story, , , filling] = await place([[devCem], [devBob], [devBob], [devBob]]);
    await raw.issue.update({ where: { id: filling.id }, data: { statusId: `${A}-done` } });
    await cemFull(); await report(lee, 0); await passes(lee, 11);
    let entered;
    const ready = new Promise(resolve => { entered = resolve; });
    const observed = new Proxy(prisma, { get(target, key) {
      if (key === '$transaction') return callback => target.$transaction(tx => callback(new Proxy(tx, { get(inner, prop) {
        if (prop === '$queryRaw') return (...args) => { entered(); return inner.$queryRaw(...args); };
        const value = inner[prop];
        return typeof value === 'function' ? value.bind(inner) : value;
      } })));
      const value = target[key];
      return typeof value === 'function' ? value.bind(target) : value;
    } });
    const sweep = load('src/lib/agent-requests.ts', { ...deps, '@/lib/prisma': { prisma: observed, issueTrashPrisma: raw } }, { Date, console });
    let moving;
    await raw.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "AgentSeat" WHERE "id" = ${devBob.id} FOR UPDATE`;
      moving = sweep.moveUnstarted({ user: { id: devBob.userId }, workspace: { id: 'w', name: 'w', slug: 'w' } });
      await ready;
      await tx.issue.update({ where: { id: filling.id }, data: { statusId: `${A}-to_do` } });
    });
    await moving;
    assert.equal(await holder(story), devDeniz.userId);
    assert.equal((await moves(story)).length, 1);
    await settle();
  });

  await t.test('a story is moved or started, never both, and two reads at once move it once', async () => {
    for (let round = 0; round < 4; round++) {
      const [raced] = await place([[devCem]]);
      await cemFull(); await report(lee, 0); await passes(lee, 11);
      const [, begun] = await Promise.all([items(devBob), begin(devCem, raced, `race-${round}`)]);
      await items(devBob);
      const ran = await raw.agentRun.count({ where: { issueId: raced.id } });
      assert.equal(begun.status === 200, ran === 1, JSON.stringify(begun.body));
      if (!ran) assert.equal(begun.body.error, 'not_assigned');
      assert.equal(await holder(raced), ran ? devCem.userId : devBob.userId, 'moved exactly when no run started on it');
      assert.equal((await moves(raced)).length, ran ? 0 : 1);
      assert.equal((await comments(raced)).length, ran ? 0 : 1);
      await settle();
    }
    const twice = await place([[devCem]]);
    await cemFull(); await report(lee, 0); await passes(lee, 11);
    await Promise.all([items(devBob), items(devDeniz), items(devBob), items(devDeniz)]);
    assert.equal((await moves(twice[0])).length, 1);
    await settle();
  });

  await t.test('one item that fails to move does not stop the next one in the same read', async () => {
    // The first transaction of the sweep throws; the second runs as usual.
    let thrown = 0;
    const flaky = new Proxy(prisma, { get(target, key) {
      if (key === '$transaction') return (...args) => thrown++ ? target.$transaction(...args) : Promise.reject(new Error('the first move broke'));
      const value = target[key];
      return typeof value === 'function' ? value.bind(target) : value;
    } });
    const logged = [];
    const sweep = load('src/lib/agent-requests.ts', { ...deps, '@/lib/prisma': { prisma: flaky, issueTrashPrisma: raw } },
      { Date, console: { error: (...told) => logged.push(told) } });
    const caller = who => ({ user: { id: who.userId }, workspace: { id: 'w', name: 'w', slug: 'w' } });

    // Two review requests on Cem's reviewer seat.
    const filed = [];
    for (let n = 0; n < 2; n++) {
      for (const person of [cem, bob, deniz]) await report(person, person === cem ? 90 : 20);
      const reply = await send(requests.POST, devDeniz.token, 'POST', { body: { role: 'review', title: `Review ${n}`, body: 'What is asked.', fromIssue: epic.issueKey } });
      assert.equal(reply.status, 200, JSON.stringify(reply.body));
      filed.push(reply.body.issue);
    }
    await cemFull();
    await sweep.moveUnstarted(caller(revBob));
    assert.equal(logged.length, 1);
    assert.match(String(logged[0].at(-1)), /the first move broke/);
    assert.deepEqual([await holder(filed[0]), await holder(filed[1])], [revCem.userId, revBob.userId]);
    await settle();

    // The same for two stories.
    thrown = 0; logged.length = 0;
    const [one, two] = await place([[devCem], [devCem]]);
    await cemFull(); await report(lee, 0); await passes(lee, 11);
    await sweep.moveUnstarted(caller(devBob));
    assert.equal(logged.length, 1);
    assert.deepEqual([await holder(one), await holder(two)], [devCem.userId, devBob.userId]);
    await settle();
  });

  await t.test('a lead that has room again moves its own stories: Collab leaves them', async () => {
    const [kept] = await place([[devCem]]);
    await cemFull(); await report(lee, 0); await passes(lee, 11);
    await report(lee, 30);
    await inbox(devBob);
    assert.equal(await holder(kept), devCem.userId);
    assert.deepEqual(await inbox(lead), [[epic.issueKey, 'child_no_room']]);
    await settle();
  });
});
