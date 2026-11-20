const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { Prisma, PrismaClient } = require('@prisma/client');
const { load } = require('../security/helpers.cjs');
const { seatsDatabase } = require('./seats-db.cjs');

// CLB-809: started work moves between runs when its seat stays without room for 30 minutes and its last run pushed.
// Token-facing routes accept only cuid-shaped ids.
const owner = 'cowner00001', lee = 'clee0000001', cem = 'ccem0000001', bob = 'cbob0000001', deniz = 'cdeniz00001';
const A = 'cprojecta001';
const scopes = ['issues:read', 'issues:write', 'user:read'];
const ago = minutes => new Date(Date.now() - minutes * 60_000);
const NOTE = '## Done\nPushed the branch.\n## Decisions\nx\n## Evidence\nx\n## Next\nx';
const SPELL = ['agent_seat.no_room', 'agent_seat.room_back'];
const HEAD = 'a'.repeat(40);

let db;
after(() => db?.stop());

test('started work moves between runs once its seat has had no room for 30 minutes and its last run pushed', async t => {
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
  const item = route('issues/[issueIdOrKey]'), requests = route('seats/me/requests'), inboxRoute = route('seats/me/inbox'), runs = route('runs'), one = route('runs/[id]');
  const contextRoute = route('issues/[issueIdOrKey]/run-context');
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
  const start = async (who, target, generation) => { const reply = await begin(who, target, generation); assert.equal(reply.status, 200, JSON.stringify(reply.body)); return reply.body.run.id; };
  const give = async (target, assigneeId) => send(item.PATCH, lead.token, 'PATCH', { body: { assigneeId }, params: { issueIdOrKey: target.issueKey } });
  const context = async (who, target) => { const reply = await send(contextRoute.GET, who.token, 'GET', { params: { issueIdOrKey: target.issueKey } }); assert.equal(reply.status, 200, JSON.stringify(reply.body)); return reply.body; };
  /** The entries that say Collab moved an issue, oldest first. */
  const moves = async target => (await raw.issueActivity.findMany({ where: { itemId: target.id, action: { in: ['REQUEST_PLACED', 'STORY_MOVED'] } }, orderBy: { createdAt: 'asc' } }))
    .map(entry => ({ ...entry, details: JSON.parse(entry.details) })).filter(entry => entry.details.fromSeatId);
  const comments = async target => raw.issueComment.findMany({ where: { issueId: target.id, authorId: { not: owner } }, orderBy: { createdAt: 'asc' } });

  let pulls = 0;
  /**
   * A run of the assignee on the issue that finishes blocked, on a question for a person unless `wait` names another
   * thing, with the pull request it pushed to unless `pushed` is false. Returns the pull request.
   */
  const ranAndAsked = async (who, target, { pushed = true, wait = { askedUser: owner } } = {}) => {
    const pullRequest = `acme/${A}#${++pulls}`;
    const id = await start(who, target, `g-${pulls}`);
    const reply = await send(one.PATCH, who.token, 'PATCH', { body: { event: 'finish', generation: `g-${pulls}`, outcome: 'blocked', note: NOTE, nextStep: 'wait for the answer', ...wait,
      ...(pushed && { pullRequest, headCommit: HEAD }) }, params: { id } });
    assert.equal(reply.status, 200, JSON.stringify(reply.body));
    return pullRequest;
  };
  /** The person answers: the issue is offered in its seat's inbox again, for its next run. */
  const answer = target => raw.issueComment.create({ data: { issueId: target.id, authorId: owner, content: 'The answer.', createdAt: new Date(Date.now() + 1000) } });

  const source = await issue();
  await personGives(source, devDeniz.userId);
  /** A review request filed at a moment when Cem's reviewer seat has the most room, so it starts there. */
  const request = async () => {
    for (const person of [cem, bob, deniz]) await report(person, person === cem ? 90 : 20);
    const reply = await send(requests.POST, devDeniz.token, 'POST', { body: { role: 'review', title: 'A review request', body: 'What is asked.', fromIssue: source.issueKey } });
    assert.equal(reply.status, 200, JSON.stringify(reply.body));
    const made = await raw.issue.findUniqueOrThrow({ where: { id: reply.body.issue.id } });
    assert.equal(made.assigneeId, revCem.userId);
    return made;
  };
  /** A started request on Cem's reviewer seat whose last run pushed, offered again for its next run. */
  const startedRequest = async options => { const made = await request(); made.pullRequest = await ranAndAsked(revCem, made, options); await answer(made); return made; };
  const settle = async () => {
    await raw.agentRun.updateMany({ where: { endedAt: null }, data: { endedAt: new Date(), state: 'stopped' } });
    await raw.issue.updateMany({ where: { agentRequestRole: { not: null } }, data: { statusId: `${A}-done` } });
    await raw.issue.updateMany({ where: { parentId: { not: null } }, data: { statusId: `${A}-done`, updatedAt: ago(500) } });
  };
  /** Cem's seats have had no room for this many minutes, Bob has the most room and Deniz some. */
  const cemFull = async minutes => { await report(bob, 60); await report(deniz, 40); await report(cem, 0); await passes(cem, minutes); };

  await t.test('a started request moves after 30 minutes, not 10, while an unstarted one still moves after 10, and the timeline says from where the work goes on', async () => {
    const started = await startedRequest();
    const single = new PrismaClient({ datasources: { db: { url: `${db.url}&connection_limit=1&pool_timeout=1` } } });
    try {
      const limitedRuns = load('src/lib/agent-runs.ts', { ...deps, '@/lib/prisma': { prisma: single } }, { Date });
      const offered = await single.$transaction(tx => limitedRuns.waitsPushed('w', A, revCem, tx));
      assert.equal(offered.get(started.id)?.pullRequest, started.pullRequest);
    } finally {
      await single.$disconnect();
    }
    const unstarted = await request();
    await cemFull(11);
    await inbox(revBob);
    assert.equal(await holder(unstarted), revBob.userId, 'the 10 minutes for unstarted work are unchanged');
    assert.equal(await holder(started), revCem.userId, 'started work waits 30 minutes');
    await passes(cem, 18);
    await inbox(revBob);
    assert.equal(await holder(started), revCem.userId, '29 minutes are not 30');
    await passes(cem, 2);
    assert.ok((await inbox(revBob)).some(([key, reason]) => key === started.issueKey && reason === 'assigned'), 'the read that moved it already lists it');
    assert.equal(await holder(started), revBob.userId);

    const [entry, ...more] = await moves(started);
    assert.deepEqual(more, []);
    const why = `rev-cem had no room for 30 minutes (its runner reports no room); the work continues from the branch its last run pushed (${started.pullRequest})`;
    assert.deepEqual(entry.details, { fromSeatId: revCem.id, from: 'rev-cem', toSeatId: revBob.id, to: 'rev-bob', why, pullRequest: started.pullRequest, headCommit: HEAD });
    const line = getActionText({ ...entry, user: { name: 'dev-deniz' } });
    assert.equal(line, `Collab moved this request from rev-cem to rev-bob: ${why}`);
    assert.ok(!/\d\s*%/.test(line), 'no percentage');

    // The new seat's session is told it was moved, from which seat, and what to bring in first. The note is the issue's.
    const told = await context(revBob, started);
    assert.equal(told.lastExitNote, NOTE);
    assert.deepEqual(told.lastExitFacts, { pullRequest: started.pullRequest, headCommit: HEAD, nextStep: 'wait for the answer' });
    assert.equal(told.movedFrom.seat, 'rev-cem');
    assert.deepEqual([told.movedFrom.pullRequest, told.movedFrom.headCommit, told.movedFrom.branch], [started.pullRequest, HEAD, null]);
    assert.match(told.movedFrom.first, /^This issue was moved here from rev-cem\. Before anything else: git fetch origin, then git merge a{40} /);
    assert.match(told.movedFrom.first, /What rev-cem did not push is not part of the work any more\./);
    // Where Collab has the pull request from its connected repository, the branch is named.
    const repository = await raw.repository.findFirstOrThrow({ where: { projectId: A } });
    await raw.pullRequest.create({ data: { repositoryId: repository.id, githubPrId: Number(started.pullRequest.split('#')[1]), title: 'x', state: 'OPEN', headBranchName: `seat/${started.issueKey}` } });
    const named = (await context(revBob, started)).movedFrom;
    assert.equal(named.branch, `seat/${started.issueKey}`);
    assert.ok(named.first.includes(`git fetch origin, then git merge origin/seat/${started.issueKey} (the branch of ${started.pullRequest}, left at ${HEAD})`), named.first);
    for (const [provider, baseUrl] of [['gitlab', 'https://gitlab.com'], ['github', 'https://github.enterprise.test']]) {
      const collision = await raw.gitConnection.create({ data: { projectId: A, provider, baseUrl, externalId: provider, repositoryPath: `acme/${A}`,
        name: A, url: `${baseUrl}/acme/${A}` } });
      for (const repositoryId of [repository.id, collision.id]) {
        await raw.agentSeat.update({ where: { id: revBob.id }, data: { repositoryId } });
        const ambiguous = (await context(revBob, started)).movedFrom;
        assert.equal(ambiguous.branch, null);
        assert.match(ambiguous.first, /Do not merge anything: finish the run blocked and ask a person/);
      }
      await raw.agentSeat.update({ where: { id: revBob.id }, data: { repositoryId: null } });
      await raw.gitConnection.delete({ where: { id: collision.id } });
    }
    const checkout = await start(revBob, started, 'handoff-checkout');
    assert.equal((await context(revBob, started)).movedFrom.pullRequest, started.pullRequest, 'checkout retains the previous finished run facts');
    await raw.agentRun.update({ where: { id: checkout }, data: { state: 'stopped', endedAt: new Date() } });
    assert.equal((await context(revBob, started)).movedFrom.pullRequest, started.pullRequest, 'a later stopped run retains the previous finished run facts');
    await raw.project.create({ data: { id: 'other-project', workspaceId: 'w', name: 'Other', slug: 'other', issuePrefix: 'OT' } });
    const otherRepo = await raw.repository.create({ data: { projectId: 'other-project', githubRepoId: 'other-repo', owner: 'private', name: 'repo', fullName: 'private/repo', webhookSecret: 'secret' } });
    await raw.pullRequest.create({ data: { repositoryId: otherRepo.id, githubPrId: 999, title: 'private', state: 'OPEN', headBranchName: 'private-branch' } });
    const finish = await raw.issueActivity.findFirstOrThrow({ where: { itemId: started.id, action: 'AGENT_RUN_FINISHED' }, orderBy: { createdAt: 'desc' } });
    const original = finish.details;
    await raw.issueActivity.update({ where: { id: finish.id }, data: { details: JSON.stringify({ ...JSON.parse(original), pullRequest: 'private/repo#999' }) } });
    assert.equal((await context(revBob, started)).movedFrom.branch, null, 'another project cannot disclose its branch');
    assert.match((await context(revBob, started)).movedFrom.first, /cannot be safely matched to the repository this seat works in\. Do not merge anything/,
      'a pull request of another repository than the seat works in is not merged');
    await raw.issueActivity.update({ where: { id: finish.id }, data: { details: original } });
    await raw.agentRun.delete({ where: { id: checkout } });
    // The seat that ran it last is not told it was moved.
    await personGives(started, revCem.userId);
    assert.equal((await context(revCem, started)).movedFrom, null);
    await personGives(started, revBob.userId);
  });

  await t.test('moved work is not moved back, and one move per spell', async () => {
    const [moved] = await raw.issue.findMany({ where: { agentRequestRole: 'review', assigneeId: revBob.userId, agentRuns: { some: {} } } });
    await inbox(revBob); await inbox(revDeniz);
    assert.equal((await moves(moved)).length, 1, 'a later read moves nothing more');
    await report(cem, 80);
    await report(bob, 0); await passes(bob, 31); await stale(deniz);
    await inbox(revCem); await inbox(revDeniz);
    assert.equal(await holder(moved), revBob.userId, 'the only seat with a number is the one it left');
    await report(deniz, 40);
    await inbox(revDeniz);
    assert.equal(await holder(moved), revDeniz.userId, 'a seat it was never on may take it');
    assert.deepEqual((await moves(moved)).map(entry => [entry.details.from, entry.details.to]), [['rev-cem', 'rev-bob'], ['rev-bob', 'rev-deniz']]);
    await settle();
  });

  await t.test('nothing moves while the issue waits for a person or for another issue', async () => {
    const asked = await request();
    await ranAndAsked(revCem, asked);
    const blocker = await issue();
    const waits = await request();
    await raw.issueRelation.create({ data: { sourceIssueId: blocker.id, targetIssueId: waits.id, relationType: 'BLOCKS', createdBy: owner } });
    await ranAndAsked(revCem, waits, { wait: { blockedBy: blocker.issueKey } });
    await cemFull(31);
    await inbox(revBob);
    assert.deepEqual([await holder(asked), await holder(waits)], [revCem.userId, revCem.userId], 'neither is offered in its seat\'s inbox: there is nothing to run');
    await raw.issue.update({ where: { id: blocker.id }, data: { statusId: `${A}-done` } });
    await inbox(revBob);
    assert.equal(await holder(waits), revBob.userId, 'its blocker is done: it waits for its next run, and moves');
    assert.equal(await holder(asked), revCem.userId);
    await settle();
  });

  await t.test('nothing moves when the last run pushed nothing, or when the last run did not finish', async () => {
    const quiet = await startedRequest({ pushed: false });
    const stopped = await startedRequest();
    // A later run that stopped without a finish recorded nothing: Collab cannot tell what it pushed.
    await raw.agentRun.create({ data: { workspaceId: 'w', issueId: stopped.id, seatId: revCem.id, userId: revCem.userId, runner: 'test', generation: 'g-stop', state: 'stopped', endedAt: new Date() } });
    await cemFull(31);
    assert.ok((await inbox(revCem)).some(([key, reason]) => key === quiet.issueKey && reason === 'reply'), 'it waits in its seat\'s inbox');
    await inbox(revBob);
    assert.deepEqual([await holder(quiet), await holder(stopped)], [revCem.userId, revCem.userId]);
    assert.deepEqual([await moves(quiet), await moves(stopped)], [[], []]);
    await settle();
  });

  await t.test('nothing moves while a run is open, however long its seat has had no room', async () => {
    const running = await startedRequest();
    await start(revCem, running, 'g-open');
    await cemFull(120);
    await inbox(revBob);
    assert.equal(await holder(running), revCem.userId);
    await settle();
  });

  await t.test('nothing moves when room comes back inside the 30 minutes, while the room is unknown, or with no other seat that has a number', async () => {
    const kept = await startedRequest();
    await cemFull(20);
    await report(cem, 50); await report(cem, 0); await passes(cem, 20);
    await inbox(revBob);
    assert.equal(await holder(kept), revCem.userId, 'a spell that ended does not count toward this one');
    await passes(cem, 11);
    await stale(cem);
    await inbox(revBob);
    assert.equal(await holder(kept), revCem.userId, 'unknown is not no room');
    await report(cem, 0); await passes(cem, 31);
    await stale(bob); await report(deniz, 0);
    await inbox(revBob); await inbox(revDeniz);
    assert.equal(await holder(kept), revCem.userId, 'no other seat has a number');
    await report(bob, 5);
    await inbox(revBob);
    assert.equal(await holder(kept), revBob.userId);
    await settle();
  });

  await t.test('an offline runner counts from its last call: 30 minutes of silence, not 10', async () => {
    const kept = await startedRequest();
    await report(bob, 60);
    const mine = { ownerId: cem, removedAt: null };
    await raw.agentRunner.updateMany({ where: mine, data: { lastSeenAt: ago(25) } });
    await inbox(revBob);
    assert.equal(await holder(kept), revCem.userId);
    await raw.agentRunner.updateMany({ where: mine, data: { lastSeenAt: ago(31) } });
    await inbox(revBob);
    assert.equal(await holder(kept), revBob.userId);
    assert.match((await moves(kept))[0].details.why, /^rev-cem had no room for 30 minutes \(the runner is offline\)/);
    await report(cem, 50);
    await settle();
  });

  await t.test('a run that starts while the move is made wins', async () => {
    for (let round = 0; round < 4; round++) {
      const raced = await startedRequest();
      await cemFull(31);
      const [, begun] = await Promise.all([items(revBob), begin(revCem, raced, `race-${round}`)]);
      await items(revBob);
      const open = await raw.agentRun.count({ where: { issueId: raced.id, endedAt: null } });
      assert.equal(begun.status === 200, open === 1, JSON.stringify(begun.body));
      if (!open) assert.equal(begun.body.error, 'not_assigned');
      assert.equal(await holder(raced), open ? revCem.userId : revBob.userId, 'moved exactly when no run started on it');
      assert.equal((await moves(raced)).length, open ? 0 : 1);
      await settle();
    }
  });

  const epic = await issue({ type: 'EPIC' });
  await personGives(epic, lead.userId, ago(1000));
  /** A story the lead places on Cem's developer seat; a run there finishes, with or without a pull request, and is answered. */
  const startedStory = async options => {
    for (const person of [lee, cem, bob, deniz]) await report(person, 50);
    const run = await start(lead, epic, `lead-${++pulls}`);
    const story = await issue({ parentId: epic.id });
    assert.equal((await give(story, devCem.userId)).status, 200);
    assert.equal((await send(one.PATCH, lead.token, 'PATCH', { body: { event: 'finish', generation: `lead-${pulls}`, outcome: 'blocked', note: NOTE, nextStep: 'wait' }, params: { id: run } })).status, 200);
    story.pullRequest = await ranAndAsked(devCem, story, options);
    // In time order: placed, the story's run, then the lead's last look, which saw that run. What happens to a child is
    // measured from when the lead's last run started.
    await raw.issueAssignee.updateMany({ where: { issueId: story.id }, data: { assignedAt: ago(70), approvedAt: ago(70) } });
    await raw.agentRun.updateMany({ where: { issueId: story.id }, data: { startedAt: ago(60), endedAt: ago(50) } });
    await raw.agentRun.updateMany({ where: { issueId: epic.id }, data: { startedAt: ago(46), endedAt: ago(45) } });
    await answer(story);
    return story;
  };

  await t.test('the lead is woken with child_no_room for a started story after 30 minutes, and may reassign it', async () => {
    const story = await startedStory(), quiet = await startedStory({ pushed: false });
    await cemFull(11); await report(lee, 50);
    assert.deepEqual(await inbox(lead), [], 'inside the 30 minutes the lead is not woken for started work');
    await passes(cem, 20);
    const [woken, ...others] = await items(lead);
    assert.deepEqual(others, []);
    assert.equal(woken.reason, 'child_no_room');
    assert.deepEqual(woken.noRoom, [{ issueKey: story.issueKey, seat: 'dev-cem', reason: 'its runner reports no room', pullRequest: story.pullRequest }],
      'the story whose last run pushed nothing is not listed');
    const child = (await context(lead, epic)).children.find(found => found.id === story.id);
    assert.deepEqual([child.lastRun, child.movedOff], ['blocked', []]);
    await inbox(devBob);
    assert.equal(await holder(story), devCem.userId, 'the lead has room: it moves the story itself');
    const placed = await give(story, devBob.userId);
    assert.equal(placed.status, 200, JSON.stringify(placed.body));
    assert.ok((await context(lead, epic)).children.find(child => child.id === story.id).movedOff.includes(devCem.userId));
    assert.equal(await holder(quiet), devCem.userId);
    const told = await context(devBob, story);
    assert.equal(told.lastExitNote, NOTE);
    assert.equal(told.movedFrom.seat, 'dev-cem');
    assert.equal(told.movedFrom.pullRequest, story.pullRequest);
    await settle();
  });

  await t.test('a lead move keeps Collab from returning started work to the seat it left', async () => {
    const story = await startedStory();
    assert.equal((await give(story, devBob.userId)).status, 200);
    assert.ok((await context(lead, epic)).children.find(found => found.id === story.id).movedOff.includes(devCem.userId));
    await report(cem, 80); await report(deniz, 0); await report(bob, 0); await passes(bob, 31);
    await report(lee, 0); await passes(lee, 11);
    await inbox(devCem);
    assert.equal(await holder(story), devBob.userId, 'the only seat with a number is the one the lead moved it off');
    assert.deepEqual(await moves(story), []);
    await report(deniz, 40);
    await inbox(devDeniz);
    assert.equal(await holder(story), devDeniz.userId);
    await settle();
  });

  await t.test('a lead that looked in this spell is not woken again, and Collab does not move the story past it', async () => {
    const story = await startedStory();
    await cemFull(31); await report(lee, 50);
    assert.ok((await items(lead)).some(found => found.issueKey === epic.issueKey && found.noRoom?.some(child => child.issueKey === story.issueKey)));
    await raw.agentRun.updateMany({ where: { issueId: epic.id }, data: { startedAt: ago(1), endedAt: new Date() } });
    assert.deepEqual(await inbox(lead), []);
    await report(lee, 0); await passes(lee, 11);
    await inbox(devBob);
    assert.equal(await holder(story), devCem.userId);
    assert.deepEqual(await moves(story), []);
    await settle();
  });

  await t.test('when the lead has had no room for 10 minutes, Collab moves a started story after 30 and says so', async () => {
    const story = await startedStory();
    await cemFull(11); await report(lee, 0); await passes(lee, 11);
    await inbox(devBob);
    assert.equal(await holder(story), devCem.userId, 'the story\'s seat has had no room for 11 minutes only');
    await passes(cem, 20);
    await inbox(devDeniz);
    assert.equal(await holder(story), devBob.userId);
    const [entry, ...more] = await moves(story);
    assert.deepEqual(more, []);
    const why = `dev-cem had no room for 30 minutes (its runner reports no room), and so had the lead seat lead (its runner reports no room); the work continues from the branch its last run pushed (${story.pullRequest})`;
    assert.deepEqual(entry.details, { fromSeatId: devCem.id, from: 'dev-cem', toSeatId: devBob.id, to: 'dev-bob', why, pullRequest: story.pullRequest, headCommit: HEAD });
    assert.equal(getActionText({ ...entry, user: { name: 'lead' } }), `Collab moved this issue from dev-cem to dev-bob: ${why}`);
    const [onStory, ...moreOnStory] = await comments(story);
    assert.deepEqual(moreOnStory, []);
    assert.equal(onStory.content, `Collab moved this story from dev-cem to dev-bob, because ${why}. What dev-cem did not push stays behind.`);
    assert.equal((await context(devBob, story)).movedFrom.seat, 'dev-cem');
    await settle();
  });

  await t.test('a started move needs a real figure: a working runner with no figure is passed over for the seat that has one', async () => {
    const busy = async () => raw.agentRun.create({ data: { workspaceId: 'w', issueId: (await issue()).id, seatId: devBob.id, userId: devBob.userId, runner: 'test', generation: `busy-${++pulls}` } });
    const waits = await startedRequest();
    await report(bob, 60); await report(deniz, 60); await report(cem, 0); await passes(cem, 31);
    // Deniz's runner works but its figure went stale, and Bob has a run open: for new work her seat would win the tie.
    await stale(deniz); await busy();
    assert.deepEqual(await inbox(revDeniz), [], 'not to the seat without a figure');
    assert.equal(await holder(waits), revBob.userId, 'the seat with the figure gets it');
    await settle();

    const story = await startedStory();
    await report(bob, 60); await report(deniz, 60); await report(cem, 0); await passes(cem, 31);
    await report(lee, 0); await passes(lee, 11);
    await stale(deniz); await busy();
    await inbox(devDeniz);
    assert.equal(await holder(story), devBob.userId);
    await settle();
  });

  await t.test('in a project with review and blocked statuses, moved work is offered to its new seat', async () => {
    await raw.projectStatus.createMany({ data: ['blocked', 'in_review'].map((category, order) => ({ id: `${A}-${category}`, projectId: A,
      name: category, displayName: category, category, order: order + 3 })) });
    const moved = await startedRequest();
    assert.equal((await raw.issue.findUniqueOrThrow({ where: { id: moved.id } })).statusId, `${A}-blocked`, 'the finish put it in the blocked status');
    await cemFull(31);
    assert.ok((await inbox(revBob)).some(([key, reason]) => key === moved.issueKey && reason === 'reply'), 'Collab\'s comment came after the new assignment');
    assert.equal(await holder(moved), revBob.userId);
    const [said] = await comments(moved);
    assert.equal(said.content, `Collab moved this request from rev-cem to rev-bob, because ${(await moves(moved))[0].details.why}. What rev-cem did not push stays behind.`);
    await settle();

    const story = await startedStory();
    assert.equal((await raw.issue.findUniqueOrThrow({ where: { id: story.id } })).statusId, `${A}-blocked`);
    await cemFull(31); await report(lee, 0); await passes(lee, 11);
    await inbox(devDeniz);
    assert.equal(await holder(story), devBob.userId);
    assert.ok((await inbox(devBob)).some(([key, reason]) => key === story.issueKey && reason === 'reply'));
    await settle();
  });
});
