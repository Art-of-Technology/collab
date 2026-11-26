const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { Prisma } = require('@prisma/client');
const { load } = require('../security/helpers.cjs');
const { seatsDatabase } = require('./seats-db.cjs');

// Token-facing routes accept only cuid-shaped ids.
const owner = 'cowner00001', cem = 'ccem0000001', bob = 'cbob0000001', deniz = 'cdeniz00001';
const A = 'cprojecta001', B = 'cprojectb001';
const scopes = ['issues:read', 'issues:write', 'user:read'];
const ago = minutes => new Date(Date.now() - minutes * 60_000);

let db;
after(() => db?.stop());

test('place by room: the lead is given seats in order of room, and a request goes to the seat with the most', async t => {
  db = await seatsDatabase(async prisma => {
    await prisma.user.createMany({ data: [owner, cem, bob, deniz].map(id => ({ id, name: id, email: `${id}@example.test` })) });
    await prisma.workspace.create({ data: { id: 'w', name: 'w', slug: 'w', ownerId: owner } });
    await prisma.workspaceMember.createMany({ data: [cem, bob, deniz].map(userId => ({ workspaceId: 'w', userId })) });
    for (const [id, issuePrefix] of [[A, 'AA'], [B, 'BB']]) {
      await prisma.project.create({ data: { id, workspaceId: 'w', name: id, slug: id, issuePrefix } });
      await prisma.projectStatus.createMany({ data: ['to_do', 'done'].map((name, order) => ({ id: `${id}-${name}`, projectId: id, name, displayName: name,
        order, isDefault: name === 'to_do', isFinal: name === 'done' })) });
    }
    for (const [id, slug] of [['agent-app', 'collab-agent'], ['person-app', 'collab-cli']]) {
      await prisma.app.create({ data: { id, name: slug, slug, publisherId: 'system', status: 'PUBLISHED', visibility: 'PRIVATE', isSystemApp: true,
        scopes: { create: scopes.map(scope => ({ scope })) } } });
    }
    await prisma.taskLabel.create({ data: { id: 'review-label', workspaceId: 'w', name: 'Review request', color: '#123456' } });
  });
  // The application's client, so Trash is hidden here as it is in production.
  const raw = db.prisma;
  const prisma = raw.$extends(load('src/lib/issue-visibility.ts').issueVisibilityExtension(Prisma.dmmf.datamodel.models));

  const crypto = { encryptToken: async value => Buffer.from(value), decryptToken: async data => Buffer.from(data).toString(), getEncryptionKey: () => {} };
  const zod = require('zod');
  const response = { NextResponse: Response };
  const globals = { console, URL, Date, Buffer };
  const handoffs = load('src/lib/agent-handoffs.ts', { 'node:crypto': require('node:crypto'), 'node:buffer': require('node:buffer'), zod,
    '@/lib/prisma': { prisma }, '@/lib/issue-finder': load('src/lib/issue-finder.ts', { '@/lib/prisma': { prisma } }), '@/lib/oauth-scopes': load('src/lib/oauth-scopes.ts') }, { Date });
  const tokens = load('src/lib/agent-tokens.ts', { crypto: require('node:crypto'), '@/lib/prisma': { prisma }, '@/lib/apps/crypto': crypto }, { Buffer, Date });
  const assignee = load('src/lib/issue-assignee.ts', { './agent-handoffs': handoffs });
  const seats = load('src/lib/agent-seats.ts', { '@/lib/prisma': { prisma }, '@/lib/agent-handoffs': handoffs, '@/lib/agent-tokens': tokens, '@/lib/issue-assignee': assignee }, { Date });
  const middleware = load('src/lib/apps/auth-middleware.ts', { crypto: require('node:crypto'), 'next/server': response,
    '@/lib/apps/crypto': crypto, '@/lib/oauth-scopes': load('src/lib/oauth-scopes.ts'), '@/lib/post-access': load('src/lib/post-access.ts'),
    '@/lib/auth-error-diagnostics': load('src/lib/auth-error-diagnostics.ts'), '@/lib/prisma': { prisma } }, globals);
  const deps = { zod, 'next/server': response, '@/lib/prisma': { prisma }, '@/lib/apps/auth-middleware': middleware, '@/lib/agent-seats': seats, '@/lib/issue-assignee': assignee,
    '@/lib/agent-handoff-http': load('src/lib/agent-handoff-http.ts', { zod, 'next/server': response, './agent-handoffs': handoffs }, globals),
    '@/lib/forge/legacy-write-guard': { ForgeProjectWriteError: class extends Error {}, assertLegacyIssueWriteAllowed: async () => {}, assertLegacyProjectWriteAllowed: async () => {} },
    '@/lib/permissions': {}, '@/lib/agent-tokens': tokens, '@/lib/event-bus': { emitIssueCreated: async () => {} } };
  deps['@/lib/agent-runs'] = load('src/lib/agent-runs.ts', deps, { Date });
  const lib = deps['@/lib/agent-requests'] = load('src/lib/agent-requests.ts', deps, { Date });
  const route = path => load(`src/app/api/apps/auth/${path}/route.ts`, deps, globals);
  const requests = route('seats/me/requests'), contextRoute = route('issues/[issueIdOrKey]/run-context');
  const { getActionText } = load('src/components/issue/sections/activity/utils/activityHelpers.ts');

  const call = async (handler, token, { body, params = {} } = {}) => {
    const reply = await handler(new Request('https://collab.test/api', { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}` },
      ...(body && { body: JSON.stringify(body) }) }), { params: Promise.resolve(params) });
    return [reply.status, await reply.json()];
  };
  const seat = async (name, role, ownerId, projectId = A) => {
    const made = await seats.createSeat({ workspaceId: 'w', actorId: owner, projectId, role, ownerId, name, expiresInDays: 30 });
    return { ...made.seat, token: made.token.token };
  };
  // Made in this order, which is the order a project's seats had before room: the default seat of a role is its first.
  const lead = await seat('lead', 'lead', cem);
  const dev1 = await seat('dev-cem', 'developer', cem), rev1 = await seat('rev-cem', 'reviewer', cem), sec1 = await seat('sec-cem', 'security', cem);
  const dev2 = await seat('dev-bob', 'developer', bob), rev2 = await seat('rev-bob', 'reviewer', bob);
  const dev3 = await seat('dev-deniz', 'developer', deniz), rev3 = await seat('rev-deniz', 'reviewer', deniz);
  const devB = await seat('dev-b', 'developer', cem, B);
  // Every seat is run by its owner's runner, which holds a usable token for it.
  await raw.agentSeat.updateMany({ data: { byRunner: true } });
  await raw.appToken.updateMany({ data: { runnerId: 'fetched' } });
  const personToken = 'collab_person_token';
  await raw.appToken.create({ data: { appId: 'person-app', workspaceId: 'w', userId: owner, installationId: null, accessToken: Buffer.from(personToken).toString('base64'), scopes } });

  /** What Collab holds from a person's runner: the runner's row, and the figure on that person's seats. Times are written, not waited for. */
  const runner = async (ownerId, { room = null, at = ago(1), state = 'working', seen = ago(1), connected = true } = {}) => {
    await raw.agentRunner.deleteMany({ where: { ownerId } });
    if (connected) await raw.agentRunner.create({ data: { workspaceId: 'w', ownerId, name: ownerId, credentialHash: ownerId, admittedAt: ago(60), lastSeenAt: seen, state } });
    await raw.agentSeat.updateMany({ where: { ownerId }, data: { room, roomProgram: room === null ? null : 'Claude Code', roomAt: room === null ? null : at } });
  };
  const rooms = (ofCem, ofBob, ofDeniz) => Promise.all([runner(cem, ofCem), runner(bob, ofBob), runner(deniz, ofDeniz)]);
  const stale = { room: 70, at: ago(16) };
  let count = 0;
  const issue = (data = {}) => raw.issue.create({ data: { workspaceId: 'w', projectId: A, title: `Issue ${++count}`, issueKey: `K-${count}`, statusId: `${A}-to_do`, ...data } });
  /** A run that is open now on one of a person's seats. */
  const openRun = async on => raw.agentRun.create({ data: { workspaceId: 'w', issueId: (await issue()).id, seatId: on.id, userId: on.userId, runner: 'test', generation: 'g' } });
  const endRuns = () => raw.agentRun.updateMany({ data: { endedAt: new Date(), state: 'finished' } });

  const epic = await issue({ type: 'EPIC', assigneeId: lead.userId });
  /** `lead.seats` of the epic's run context, as `token` reads it. */
  const listed = async (token = lead.token) => {
    const [status, body] = await call(contextRoute.GET, token, { params: { issueIdOrKey: epic.issueKey } });
    assert.equal(status, 200, JSON.stringify(body));
    return body.lead.seats;
  };
  const names = (list, role) => list.filter(entry => entry.role === role).map(entry => entry.name);

  await t.test('the lead: different room puts the most room first, and every field that was there stays', async () => {
    await rooms({ room: 6 }, { room: 60 }, { room: 85 });
    const list = await listed();
    assert.deepEqual(names(list, 'developer'), ['dev-deniz', 'dev-bob', 'dev-cem']);
    assert.deepEqual(names(list, 'reviewer'), ['rev-deniz', 'rev-bob', 'rev-cem'], 'each role is in its own order');
    assert.deepEqual(list.map(entry => entry.role), ['developer', 'reviewer', 'security', 'developer', 'reviewer', 'developer', 'reviewer'], 'a role keeps the places its seats had');
    const { room, ...first } = list[0];
    assert.deepEqual(first, { userId: dev3.userId, name: 'dev-deniz', role: 'developer', openFromLead: 0, owner: { id: deniz, name: deniz }, openRuns: 0 });
    assert.deepEqual([room.kind, room.room, room.program, typeof room.at], ['room', 85, 'Claude Code', 'string']);
  });

  await t.test('the lead: equal room goes to the owner with the fewest open runs, then to the default seat', async () => {
    await rooms({ room: 60 }, { room: 60 }, { room: 60 });
    // A person's open runs count on whichever of their seats they are.
    await openRun(dev1); await openRun(rev1); await openRun(rev2);
    const list = await listed();
    assert.deepEqual(names(list, 'developer'), ['dev-deniz', 'dev-bob', 'dev-cem']);
    assert.deepEqual(list.filter(entry => entry.role === 'developer').map(entry => entry.openRuns), [0, 1, 2]);
    await endRuns();
    assert.deepEqual(names(await listed(), 'developer'), ['dev-cem', 'dev-bob', 'dev-deniz'], 'a run that ended counts no more');
    await rooms({ room: 60 }, { room: 10 }, { room: 60 });
    assert.deepEqual(names(await listed(), 'developer'), ['dev-cem', 'dev-deniz', 'dev-bob']);
  });

  await t.test('the lead: a working runner with no figure stands level with the most room, a seat run by hand comes after every number, and no room comes last', async () => {
    await rooms(stale, { room: 1 }, { room: 90, state: 'paused' });
    const order = async () => (await listed()).filter(entry => entry.role === 'developer').map(entry => [entry.name, entry.room.kind, entry.room.reason]);
    // Cem's runner works and its figure went stale: level with Bob's 1, and the default seat goes first of the two.
    assert.deepEqual(await order(),
      [['dev-cem', 'unknown', 'the figure is older than 15 minutes'], ['dev-bob', 'room', undefined], ['dev-deniz', 'no_room', 'the runner is paused']]);
    // With a run open for Cem the tie goes to Bob.
    await openRun(rev1);
    assert.deepEqual((await order()).map(entry => entry[0]), ['dev-bob', 'dev-cem', 'dev-deniz']);
    await endRuns();
    // A seat run by hand has no runner to vouch for it: unknown, and behind the number.
    await raw.agentSeat.update({ where: { id: dev1.id }, data: { byRunner: false } });
    assert.deepEqual(await order(),
      [['dev-bob', 'room', undefined], ['dev-cem', 'unknown', 'the seat is run by hand'], ['dev-deniz', 'no_room', 'the runner is paused']]);
    await raw.agentSeat.update({ where: { id: dev1.id }, data: { byRunner: true } });
    // Among the seats that are not known, the same tie-break.
    await rooms({ room: 0 }, stale, stale);
    await openRun(dev2);
    assert.deepEqual(names(await listed(), 'developer'), ['dev-deniz', 'dev-bob', 'dev-cem']);
    await endRuns();
  });

  await t.test('the lead: when every seat is unknown the order is the one before room', async () => {
    await rooms(stale, stale, {});
    await openRun(dev1);
    assert.deepEqual(names(await listed(), 'developer'), ['dev-cem', 'dev-bob', 'dev-deniz']);
    await endRuns();
  });

  await t.test('room is the lead\'s to read: another reader gets the list as it was', async () => {
    await rooms({ room: 6 }, { room: 60 }, { room: 85 });
    const list = await listed(personToken);
    assert.deepEqual(list.map(entry => entry.name), ['dev-cem', 'rev-cem', 'sec-cem', 'dev-bob', 'rev-bob', 'dev-deniz', 'rev-deniz']);
    assert.deepEqual(list[0], { userId: dev1.userId, name: 'dev-cem', role: 'developer', openFromLead: 0 });
  });

  const body = '## What\n\nThe change.';
  const file = (by, sent = {}, from = source) => call(requests.POST, by.token, { body: { role: 'review', title: 'Please look at this', body, fromIssue: from.issueKey, ...sent } });
  /** Files a request and returns the reply, who got it and what its timeline says of that. */
  const filed = async (by, sent, from) => {
    const [status, reply] = await file(by, sent, from);
    assert.equal(status, 200, JSON.stringify(reply));
    const row = await raw.issue.findUniqueOrThrow({ where: { id: reply.issue.id }, include: { assignee: true } });
    const placed = await raw.issueActivity.findMany({ where: { itemId: row.id, action: 'REQUEST_PLACED' } });
    return { reply, to: row.assignee.name, placed };
  };
  /** Who got a review request from `dev2`, and why. */
  const review = async () => { const { reply, to } = await filed(dev2); return [to, reply.placed?.why, reply.warning]; };
  const source = await issue({ assigneeId: dev2.userId });

  await t.test('a request goes to the seat of the role with the most room, and the reply and the timeline say so', async () => {
    await rooms({ room: 6 }, { room: 60 }, { room: 85 });
    const { reply, to, placed } = await filed(dev2);
    assert.equal(to, 'rev-deniz');
    assert.deepEqual(reply, { issue: reply.issue, placed: { seat: 'rev-deniz', why: 'most room' } });
    assert.deepEqual(placed.map(entry => [entry.userId, JSON.parse(entry.details)]), [[dev2.userId, { toSeatId: rev3.id, to: 'rev-deniz', why: 'most room' }]]);
    assert.equal(getActionText({ ...placed[0], details: JSON.parse(placed[0].details), user: { name: 'dev-bob' } }), 'Collab sent this request to rev-deniz: most room');
  });

  await t.test('equal room: the owner with the fewest open runs, then the default seat', async () => {
    await rooms({ room: 5 }, { room: 60 }, { room: 60 });
    await openRun(dev3);
    assert.deepEqual(await review(), ['rev-bob', 'equal room, fewer open runs', undefined]);
    await endRuns();
    await rooms({ room: 60 }, { room: 60 }, { room: 10 });
    assert.deepEqual(await review(), ['rev-cem', 'equal room and open runs: the default seat first', undefined]);
  });

  await t.test('a working runner with no figure counts as the most room: the request goes by open runs, and says why', async () => {
    const level = 'a working runner with no figure counts as the most room';
    // Cem's reviewer reports 60; Deniz's runner works and has sent nothing; Bob files, so his seat is out.
    await rooms({ room: 60 }, { room: 5 }, {});
    assert.deepEqual(await review(), ['rev-cem', `${level}; equal open runs: the default seat first`, undefined]);
    await openRun(dev1);
    assert.deepEqual(await review(), ['rev-deniz', `${level}, fewer open runs`, undefined]);
    await endRuns();
    // A runner that is not seen, or says it is paused, vouches for nothing: its seat is no room, and the number wins.
    for (const off of [{ seen: ago(11) }, { state: 'paused' }]) {
      await rooms({ room: 60 }, { room: 5 }, off);
      await openRun(dev1);
      assert.deepEqual(await review(), ['rev-cem', 'most room', undefined], JSON.stringify(off));
      await endRuns();
    }
  });

  await t.test('a third tied unknown seat changes the reason in the timeline', async () => {
    await raw.project.update({ where: { id: A }, data: { agentMode: 'seats' } });
    await rooms({ room: 60 }, { room: 60 }, {});
    await openRun(dev3);
    const level = 'a working runner with no figure counts as the most room';
    for (const [extraRun, reason] of [[false, `${level}; equal open runs: the default seat first`], [true, `${level}, fewer open runs`]]) {
      if (extraRun) await openRun(dev2);
      const labelled = await issue();
      await raw.$transaction(tx => lib.labelRequests(tx, owner, labelled, [{ id: 'review-label', name: 'Review request' }]));
      const made = await raw.issue.findFirstOrThrow({ where: { agentRequestRole: 'review', sourceRelations: { some: { targetIssueId: labelled.id } } }, include: { assignee: true } });
      const activity = await raw.issueActivity.findFirstOrThrow({ where: { itemId: made.id, action: 'REQUEST_PLACED' } });
      assert.equal(made.assignee.name, 'rev-cem');
      assert.equal(JSON.parse(activity.details).why, reason);
    }
    await endRuns();
  });

  await t.test('no seat with a number: the default seat, unless Collab knows it has no room', async () => {
    await rooms(stale, stale, {});
    await openRun(rev1);
    assert.deepEqual(await review(), ['rev-cem', 'no fresh figure: the default seat', undefined]);
    await endRuns();
    // Bob has a run open, so Deniz's seat is the first of the two that are not known.
    await openRun(dev2);
    const elsewhere = 'no fresh figure and the default seat cannot start: the next seat whose figure is unknown';
    for (const known of [{ room: 70, seen: ago(11) }, { room: 70, state: 'paused' }, { room: 70, state: 'disk_full' }, { connected: false }, { room: 0 }]) {
      await rooms(known, stale, stale);
      assert.deepEqual(await review(), ['rev-deniz', elsewhere, undefined], JSON.stringify(known));
    }
    await endRuns();
  });

  await t.test('every seat known to have no room: the request waits at the default seat, with the seat_idle warning', async () => {
    await rooms({ room: 70, state: 'paused' }, { room: 70, seen: ago(11) }, { room: 0 });
    assert.deepEqual(await review(), ['rev-cem', 'no seat can start now: it waits at the default seat', 'seat_idle']);
  });

  await t.test('a role with one seat, and developer work, go where they went before, with nothing new said', async () => {
    for (const known of [{ room: 6 }, { room: 70, state: 'paused' }, stale]) {
      await rooms(known, { room: 60 }, { room: 85 });
      const security = await filed(dev2, { role: 'security' });
      assert.deepEqual([security.to, security.reply, security.placed], ['sec-cem', { issue: security.reply.issue, blocks: true }, []], JSON.stringify(known));
      const developer = await filed(dev2, { role: 'developer' });
      assert.deepEqual([developer.to, developer.reply, developer.placed], ['dev-cem', { issue: developer.reply.issue }, []], JSON.stringify(known));
    }
    // A seat that has no owner takes its request as before, too.
    await raw.agentSeat.update({ where: { id: sec1.id }, data: { ownerId: null } });
    assert.equal((await filed(dev2, { role: 'security' })).to, 'sec-cem');
    await raw.agentSeat.update({ where: { id: sec1.id }, data: { ownerId: cem } });
  });

  await t.test('a seat is not sent its own request, and a role with no default seat takes none', async () => {
    await rooms({ room: 6 }, { room: 60 }, { room: 85 });
    assert.equal((await filed(rev3)).to, 'rev-bob', 'the seat with the most room asks: the next one gets it');
    assert.deepEqual((await file(rev1)).map(part => part.error ?? part), [400, 'invalid_request'], 'the default seat asking is refused, as before');
    assert.deepEqual((await file(dev2, { role: 'release' })).map(part => part.error ?? part), [409, 'no_default_seat']);
    await raw.agentSeat.update({ where: { id: rev1.id }, data: { isDefault: false } });
    assert.deepEqual((await file(dev2)).map(part => part.error ?? part), [409, 'no_default_seat']);
    await raw.agentSeat.update({ where: { id: rev1.id }, data: { isDefault: true } });
  });

  await t.test('the cap on requests from another project holds, wherever they are placed', async () => {
    const theirs = await issue({ projectId: B, statusId: `${B}-to_do`, assigneeId: devB.userId });
    for (let n = 0; n < 5; n++) assert.equal((await filed(devB, { project: 'AA' }, theirs)).to, 'rev-deniz');
    assert.deepEqual((await file(devB, { project: 'AA' }, theirs)).map(part => part.error ?? part), [429, 'request_cap']);
  });

  await t.test('a label holds the row of the seat that gets the request and no other, and a seat retired meanwhile gets none', async () => {
    await raw.project.update({ where: { id: A }, data: { agentMode: 'seats' } });
    const label = [{ id: 'review-label', name: 'Review request' }];
    const assigned = async to => (await raw.issue.findFirstOrThrow({ where: { agentRequestRole: 'review', sourceRelations: { some: { targetIssueId: to.id } } }, include: { assignee: true } })).assignee.name;
    // While the label's transaction is open: the seat that got the request cannot be changed, the role's other seats can,
    // which is what lets a retirement make one of them the default.
    const held = await issue();
    await raw.$transaction(async tx => {
      await lib.labelRequests(tx, owner, held, label);
      await raw.agentSeat.update({ where: { id: rev2.id }, data: { lastSeenAt: new Date() } });
      await assert.rejects(raw.$transaction(async other => {
        await other.$executeRaw`SET LOCAL lock_timeout = '200ms'`;
        await other.agentSeat.update({ where: { id: rev3.id }, data: { lastSeenAt: new Date() } });
      }), 'the row of the seat that got the request is held');
    });
    assert.equal(await assigned(held), 'rev-deniz');
    // Retired between the read of the seats and the lock on the one chosen: the seats are read again.
    const raced = await issue();
    await raw.$transaction(async tx => {
      const find = tx.agentSeat.findMany;
      tx.agentSeat.findMany = async (...args) => {
        const found = await find.apply(tx.agentSeat, args);
        tx.agentSeat.findMany = find;
        await raw.agentSeat.update({ where: { id: rev3.id }, data: { retiredAt: new Date() } });
        return found;
      };
      await lib.labelRequests(tx, owner, raced, label);
    });
    assert.equal(await assigned(raced), 'rev-bob', 'the next seat by room, not the one that was retired');
    await raw.agentSeat.update({ where: { id: rev3.id }, data: { retiredAt: null } });
    const recreated = await issue();
    await raw.$transaction(async tx => {
      const find = tx.agentSeat.findMany;
      tx.agentSeat.findMany = async (...args) => {
        const found = await find.apply(tx.agentSeat, args);
        tx.agentSeat.findMany = find;
        await raw.agentSeat.update({ where: { id: rev3.id }, data: { retiredAt: new Date() } });
        await raw.agentSeat.update({ where: { id: rev3.id }, data: { retiredAt: null, ownerId: bob, room: null, roomProgram: null, roomAt: null } });
        return found;
      };
      await lib.labelRequests(tx, owner, recreated, label);
    });
    assert.equal(await assigned(recreated), 'rev-bob');
    await raw.agentSeat.update({ where: { id: rev3.id }, data: { ownerId: deniz, room: 85, roomProgram: 'Claude Code', roomAt: ago(1) } });
    // As an issue edit runs it, serializable, the seats are read as they were when the edit began: a seat retired since
    // then is a lost race the edit reports, never a request for a retired seat.
    const late = await issue(), before = await raw.issue.count({ where: { agentRequestRole: 'review' } });
    await assert.rejects(raw.$transaction(async tx => {
      await tx.issue.findUniqueOrThrow({ where: { id: late.id } });
      await raw.agentSeat.update({ where: { id: rev3.id }, data: { retiredAt: new Date() } });
      await lib.labelRequests(tx, owner, late, label);
    }, { isolationLevel: 'Serializable' }), error => error.code === 'P2010' && error.meta?.code === '40001');
    assert.equal(await raw.issue.count({ where: { agentRequestRole: 'review' } }), before);
    await raw.agentSeat.update({ where: { id: rev3.id }, data: { retiredAt: null } });
  });

  await t.test('a request asked for by label is placed the same way', async () => {
    await raw.project.update({ where: { id: A }, data: { agentMode: 'seats' } });
    const labelled = await issue();
    assert.equal(await raw.$transaction(tx => lib.labelRequests(tx, owner, labelled, [{ id: 'review-label', name: 'Review request' }])), true);
    const made = await raw.issue.findFirstOrThrow({ where: { agentRequestRole: 'review', sourceRelations: { some: { targetIssueId: labelled.id } } }, include: { assignee: true } });
    assert.equal(made.assignee.name, 'rev-deniz');
    assert.equal(JSON.parse((await raw.issueActivity.findFirstOrThrow({ where: { itemId: made.id, action: 'REQUEST_PLACED' } })).details).why, 'most room');
  });
});
