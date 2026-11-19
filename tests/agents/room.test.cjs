const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('../security/helpers.cjs');
const { seatsDatabase } = require('./seats-db.cjs');

// Token-facing routes accept only cuid-shaped ids.
const owner = 'cowner00001', person = 'cperson0001', other = 'cother00001';
const A = 'cprojecta001', B = 'cprojectb001';
const scopes = ['issues:read', 'issues:write', 'user:read'];
const MINUTE = 60_000;

let db;
after(() => db?.stop());

test('room: a runner reports room for its seats, and a read gives a number, no room or unknown', async t => {
  db = await seatsDatabase(async prisma => {
    await prisma.user.createMany({ data: [owner, person, other].map(id => ({ id, name: id, email: `${id}@example.test` })) });
    await prisma.workspace.create({ data: { id: 'w', name: 'w', slug: 'w', ownerId: owner } });
    await prisma.workspace.create({ data: { id: 'w2', name: 'w2', slug: 'w2', ownerId: owner } });
    await prisma.workspaceMember.createMany({ data: [{ workspaceId: 'w', userId: person }, { workspaceId: 'w', userId: other }, { workspaceId: 'w2', userId: person }] });
    await prisma.project.create({ data: { id: A, workspaceId: 'w', name: A, slug: A, issuePrefix: 'AA' } });
    await prisma.project.create({ data: { id: B, workspaceId: 'w2', name: B, slug: B, issuePrefix: 'BB' } });
    await prisma.app.create({ data: { id: 'agent-app', name: 'collab-agent', slug: 'collab-agent', publisherId: 'system', status: 'PUBLISHED', visibility: 'PRIVATE', isSystemApp: true,
      scopes: { create: scopes.map(scope => ({ scope })) } } });
  });
  const { prisma } = db;

  // Tokens are stored readable here: room is under test, not encryption.
  const crypto = { encryptToken: async value => Buffer.from(value), decryptToken: async data => Buffer.from(data).toString(), getEncryptionKey: () => {} };
  const zod = require('zod');
  const response = { NextResponse: Response };
  const globals = { console, URL, Date, Buffer, process: { env: { NEXTAUTH_URL: 'https://collab.test' } } };
  const handoffs = load('src/lib/agent-handoffs.ts', { 'node:crypto': require('node:crypto'), 'node:buffer': require('node:buffer'), zod,
    '@/lib/prisma': { prisma }, '@/lib/issue-finder': load('src/lib/issue-finder.ts', { '@/lib/prisma': { prisma } }), '@/lib/oauth-scopes': load('src/lib/oauth-scopes.ts') }, { Date });
  const tokens = load('src/lib/agent-tokens.ts', { crypto: require('node:crypto'), '@/lib/prisma': { prisma }, '@/lib/apps/crypto': crypto }, { Buffer, Date });
  const assignee = load('src/lib/issue-assignee.ts', { './agent-handoffs': handoffs });
  const seats = load('src/lib/agent-seats.ts', { '@/lib/prisma': { prisma }, '@/lib/agent-handoffs': handoffs, '@/lib/agent-tokens': tokens, '@/lib/issue-assignee': assignee }, { Date });
  const runners = load('src/lib/agent-runners.ts', { crypto: require('node:crypto'), '@/lib/prisma': { prisma }, '@/lib/agent-handoffs': handoffs, '@/lib/agent-tokens': tokens }, { Date });
  const http = load('src/lib/agent-handoff-http.ts', { zod, 'next/server': response, './agent-handoffs': handoffs }, globals);
  const deps = { zod, 'next/server': response, '@/lib/agent-handoff-http': http, '@/lib/agent-runners': runners };
  const pairRoute = load('src/app/api/runner/pair/route.ts', deps, globals), fetchRoute = load('src/app/api/runner/seats/route.ts', deps, globals);

  const post = async (handler, bearer, sent) => {
    const reply = await handler(new Request('https://collab.test/api', { method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(bearer && { Authorization: `Bearer ${bearer}` }) }, body: JSON.stringify(sent) }));
    return [reply.status, await reply.json()];
  };
  /** What a runner's regular call is answered with: [status, body]. */
  const ask = (credential, sent = {}) => post(fetchRoute.POST, credential, sent);
  const seat = async (name, role, ownerId, extra = {}) => (await seats.createSeat({ workspaceId: 'w', actorId: owner, projectId: A, role, ownerId, name, expiresInDays: 30, ...extra })).seat;
  /** A runner admitted for `ownerId` in `workspaceId`; its credential. */
  const runner = async (name, ownerId, workspaceId = 'w') => {
    const [, started] = await post(pairRoute.POST, null, { name });
    await runners.admitRunner({ workspaceId, actorId: ownerId, code: started.code });
    return started.credential;
  };
  const row = id => prisma.agentSeat.findUniqueOrThrow({ where: { id }, select: { room: true, roomProgram: true, roomAt: true } });
  const runnerOf = ownerId => prisma.agentRunner.findFirst({ where: { workspaceId: 'w', ownerId, removedAt: null } });
  /** What a reader gets: the seat's row and the runner of its person, through the one function every reader uses. */
  const read = async (id, now) => {
    const found = await prisma.agentSeat.findUniqueOrThrow({ where: { id } });
    const result = seats.seatRoom(found, found.ownerId ? await runnerOf(found.ownerId) : null, now);
    return [result.kind, result.kind === 'room' ? result.room : result.reason];
  };

  const dev = await seat('dev', 'developer', person, { byRunner: true });
  const sec = await seat('sec', 'security', person, { byRunner: true });
  const rev = await seat('rev', 'reviewer', other, { byRunner: true });
  const hand = await seat('hand', 'developer', person);
  const lone = await seat('lone', 'developer', owner, { byRunner: true });
  const gone = await seat('gone', 'reviewer', person, { byRunner: true });
  await seats.retireSeat({ workspaceId: 'w', actorId: owner, seatId: gone.id });
  // The same person's seat in another workspace, which a runner admitted in `w` does not run.
  const elsewhere = (await seats.createSeat({ workspaceId: 'w2', actorId: owner, projectId: B, role: 'developer', ownerId: person, name: 'far', expiresInDays: 30, byRunner: true })).seat;
  const mac = await runner('mac', person), theirs = await runner('their-mac', other);
  let have;

  await t.test('a runner that sends none of the new fields is answered as before and changes nothing', async () => {
    const [status, answer] = await ask(mac, { have: [] });
    assert.equal(status, 200, JSON.stringify(answer));
    assert.deepEqual(Object.keys(answer), ['runner', 'seats']);
    assert.deepEqual(answer.seats.map(found => found.name), ['dev', 'sec']);
    assert.deepEqual(Object.keys(answer.seats[0]).sort(), ['expiresAt', 'id', 'name', 'project', 'role', 'token', 'tokenId']);
    have = answer.seats.map(found => found.tokenId);
    assert.deepEqual(await row(dev.id), { room: null, roomProgram: null, roomAt: null });
    assert.equal((await runnerOf(person)).state, null);
    // The runner is seen and reports nothing: its seats are unknown, which is today's behaviour.
    assert.deepEqual(await read(dev.id), ['unknown', 'no figure was reported']);
  });

  await t.test('a figure is stored with the time it arrived, and reads as a number', async () => {
    const before = Date.now();
    const [status, answer] = await ask(mac, { have, state: 'working', rooms: [{ seat: dev.id, room: 60, program: '  Claude Code ' }] });
    assert.equal(status, 200, JSON.stringify(answer));
    assert.deepEqual(Object.keys(answer), ['runner', 'seats'], 'nothing was refused, so the answer is as before');
    const stored = await row(dev.id);
    assert.deepEqual([stored.room, stored.roomProgram], [60, 'Claude Code']);
    assert.ok(stored.roomAt.getTime() >= before && stored.roomAt.getTime() <= Date.now(), 'the server\'s time, not one the runner sent');
    assert.equal((await runnerOf(person)).state, 'working');
    const found = await prisma.agentSeat.findUniqueOrThrow({ where: { id: dev.id } });
    const result = seats.seatRoom(found, await runnerOf(person));
    assert.deepEqual({ ...result }, { kind: 'room', room: 60, program: 'Claude Code', at: stored.roomAt });
    // The other seat of the same runner got no figure.
    assert.deepEqual(await read(sec.id), ['unknown', 'no figure was reported']);
    // The lowest and the highest figure are taken.
    assert.equal((await ask(mac, { have, rooms: [{ seat: sec.id, room: 100, program: 'Codex' }] }))[0], 200);
    assert.deepEqual(await read(sec.id), ['room', 100]);
  });

  await t.test('a call without the new fields keeps the figure, its time and the runner\'s state', async () => {
    const stored = await row(dev.id);
    assert.equal((await ask(mac, { have }))[0], 200);
    assert.deepEqual(await row(dev.id), stored);
    assert.equal((await runnerOf(person)).state, 'working');
  });

  await t.test('a figure older than 15 minutes is unknown', async () => {
    const { roomAt } = await row(dev.id);
    assert.equal(seats.ROOM_FRESH_MS, 15 * MINUTE);
    // The clock is the reader's: the runner stays seen, the figure ages.
    const at = async age => {
      const found = await prisma.agentSeat.findUniqueOrThrow({ where: { id: dev.id } });
      const result = seats.seatRoom(found, { state: 'working', lastSeenAt: new Date(roomAt.getTime() + age) }, new Date(roomAt.getTime() + age));
      return [result.kind, result.kind === 'room' ? result.room : result.reason];
    };
    assert.deepEqual(await at(15 * MINUTE - 1), ['room', 60]);
    assert.deepEqual(await at(15 * MINUTE), ['unknown', 'the figure is older than 15 minutes']);
    // And with the time as it is stored.
    await prisma.agentSeat.update({ where: { id: dev.id }, data: { roomAt: new Date(Date.now() - 14 * MINUTE) } });
    assert.deepEqual(await read(dev.id), ['room', 60]);
    await prisma.agentSeat.update({ where: { id: dev.id }, data: { roomAt: new Date(Date.now() - 15 * MINUTE) } });
    assert.deepEqual(await read(dev.id), ['unknown', 'the figure is older than 15 minutes']);
    // The next report makes it a number again.
    await ask(mac, { have, rooms: [{ seat: dev.id, room: 45, program: 'Claude Code' }] });
    assert.deepEqual(await read(dev.id), ['room', 45]);
  });

  await t.test('no room, with the reason: the allowance is used up, the runner is paused, its disk is full, it is offline, or none is connected', async () => {
    await ask(mac, { have, rooms: [{ seat: dev.id, room: 0, program: 'Claude Code' }] });
    assert.deepEqual(await read(dev.id), ['no_room', 'the allowance is used up']);
    await ask(mac, { have, state: 'paused', rooms: [{ seat: dev.id, room: 45, program: 'Claude Code' }] });
    assert.deepEqual(await read(dev.id), ['no_room', 'the runner is paused']);
    // The state is the runner's, so it counts for each of its seats, and for one whose figure is old or missing too.
    assert.deepEqual(await read(sec.id), ['no_room', 'the runner is paused']);
    await prisma.agentSeat.update({ where: { id: sec.id }, data: { roomAt: new Date(Date.now() - 20 * MINUTE) } });
    assert.deepEqual(await read(sec.id), ['no_room', 'the runner is paused']);
    await ask(mac, { have, state: 'disk_full' });
    assert.deepEqual(await read(dev.id), ['no_room', 'the runner\'s disk is full']);
    await ask(mac, { have, state: 'working' });
    assert.deepEqual(await read(dev.id), ['room', 45]);
    assert.deepEqual(await read(sec.id), ['unknown', 'the figure is older than 15 minutes']);

    // Not seen for as long as a seat counts as idle: the one threshold, not a second one.
    assert.equal(seats.IDLE_MS, 10 * MINUTE);
    const { id, lastSeenAt } = await runnerOf(person);
    await prisma.agentRunner.update({ where: { id }, data: { lastSeenAt: new Date(Date.now() - 10 * MINUTE) } });
    assert.deepEqual(await read(dev.id), ['no_room', 'the runner is offline']);
    await prisma.agentRunner.update({ where: { id }, data: { lastSeenAt: new Date(Date.now() - 9 * MINUTE) } });
    assert.deepEqual(await read(dev.id), ['room', 45]);
    // Admitted and never asked.
    await prisma.agentRunner.update({ where: { id }, data: { lastSeenAt: null } });
    assert.deepEqual(await read(dev.id), ['no_room', 'the runner is offline']);
    await prisma.agentRunner.update({ where: { id }, data: { lastSeenAt } });

    // A seat for a runner whose person has connected none.
    assert.deepEqual(await read(lone.id), ['no_room', 'no runner is connected']);
    // A seat run by hand has no runner to report for it: unknown, as before.
    assert.deepEqual(await read(hand.id), ['unknown', 'the seat is run by hand']);
  });

  await t.test('a runner sets figures only for the seats it runs: any other is refused by id and not stored', async () => {
    const mine = await row(dev.id);
    const others = [rev.id, hand.id, gone.id, elsewhere.id, 'cnosuchseat1'];
    const [status, answer] = await ask(mac, { have, rooms: [...others, dev.id].map(id => ({ seat: id, room: 77, program: 'Claude Code' })) });
    assert.equal(status, 200, JSON.stringify(answer));
    assert.deepEqual(answer.refused, others, 'another person\'s seat, a seat run by hand, a retired seat, a seat in another workspace and no seat at all read the same');
    assert.deepEqual(answer.seats.map(found => found.name), ['dev', 'sec'], 'the rest of the answer is as before');
    for (const id of others.slice(0, 4)) assert.deepEqual(await row(id), { room: null, roomProgram: null, roomAt: null });
    // Its own seat in the same call is stored.
    assert.equal((await row(dev.id)).room, 77);
    assert.ok((await row(dev.id)).roomAt >= mine.roomAt);
    // The other person's runner sets its own seat, and not this one.
    const [, their] = await ask(theirs, { have: [], state: 'working', rooms: [{ seat: rev.id, room: 30, program: 'Codex' }, { seat: dev.id, room: 1, program: 'Codex' }] });
    assert.deepEqual(their.refused, [dev.id]);
    assert.deepEqual(await read(rev.id), ['room', 30]);
    assert.deepEqual(await read(dev.id), ['room', 77]);
    // Its state is its own too.
    await ask(theirs, { have: their.seats.map(found => found.tokenId), state: 'paused' });
    assert.deepEqual([(await runnerOf(person)).state, (await runnerOf(other)).state], ['working', 'paused']);
    assert.deepEqual(await read(dev.id), ['room', 77]);
  });

  await t.test('a seat retired since the runner last asked is refused by id, and the call still answers', async () => {
    const leaving = await seat('leaving', 'reviewer', person, { byRunner: true });
    const [, first] = await ask(mac, { have, rooms: [{ seat: leaving.id, room: 50, program: 'Codex' }] });
    assert.equal(first.refused, undefined);
    const held = [...have, first.seats.find(found => found.id === leaving.id).tokenId];
    const stored = await row(leaving.id);
    // Retired between the ask's read of the runner's seats and the storing of the figure.
    const find = prisma.agentSeat.findMany;
    prisma.agentSeat.findMany = async (...args) => {
      const found = await find.apply(prisma.agentSeat, args);
      if (args[0]?.where?.ownerId === person) await prisma.agentSeat.update({ where: { id: leaving.id }, data: { retiredAt: new Date() } });
      return found;
    };
    let racing;
    try { racing = await ask(mac, { have: held, rooms: [{ seat: leaving.id, room: 10, program: 'Codex' }, { seat: dev.id, room: 77, program: 'Claude Code' }] }); }
    finally { prisma.agentSeat.findMany = find; }
    assert.deepEqual([racing[0], racing[1].refused], [200, [leaving.id]]);
    assert.deepEqual(await row(leaving.id), stored);
    // The next ask no longer lists the seat, which is how the runner learns it is gone; its figure is still refused.
    const [status, answer] = await ask(mac, { have, rooms: [{ seat: leaving.id, room: 10, program: 'Codex' }] });
    assert.deepEqual([status, answer.refused, answer.seats.map(found => found.name)], [200, [leaving.id], ['dev', 'sec']]);
    assert.deepEqual(await row(leaving.id), stored);
  });

  await t.test('a seat whose project is archived takes no figure, also when it is archived while the call runs', async () => {
    const stored = await row(dev.id);
    const sent = { have, rooms: [{ seat: dev.id, room: 3, program: 'Codex' }] };
    // Archived between the ask's read of the runner's seats and the storing of the figure.
    const find = prisma.agentSeat.findMany;
    prisma.agentSeat.findMany = async (...args) => {
      const found = await find.apply(prisma.agentSeat, args);
      if (args[0]?.where?.ownerId === person) await prisma.project.update({ where: { id: A }, data: { isArchived: true } });
      return found;
    };
    let racing;
    try { racing = await ask(mac, sent); } finally { prisma.agentSeat.findMany = find; }
    assert.deepEqual([racing[0], racing[1].refused], [200, [dev.id]]);
    assert.deepEqual(await row(dev.id), stored);
    // Archived before the call: the seat is not listed, and its figure is refused the same way.
    const [status, answer] = await ask(mac, sent);
    assert.deepEqual([status, answer.refused, answer.seats], [200, [dev.id], []]);
    assert.deepEqual(await row(dev.id), stored);
    await prisma.project.update({ where: { id: A }, data: { isArchived: false } });
    assert.equal((await ask(mac, sent))[1].refused, undefined);
    assert.equal((await row(dev.id)).room, 3);
    await ask(mac, { have, rooms: [{ seat: dev.id, room: 77, program: 'Claude Code' }] });
  });

  await t.test('a value outside the contract is refused as invalid_request, and nothing of the call is stored', async () => {
    const stored = await row(dev.id), state = (await runnerOf(person)).state;
    const figure = extra => ({ have, state: 'paused', rooms: [{ seat: dev.id, room: 5, program: 'Claude Code', ...extra }] });
    const invalid = [
      figure({ room: -1 }), figure({ room: 101 }), figure({ room: 60.5 }), figure({ room: '60' }), figure({ room: null }), figure({ room: undefined }),
      figure({ program: '' }), figure({ program: '   ' }), figure({ program: 'x'.repeat(65) }), figure({ program: 'Claude\nCode' }), figure({ program: 'Cläude' }),
      figure({ program: 7 }), figure({ program: undefined }), figure({ seat: '' }), figure({ seat: undefined }), figure({ plan: 'max' }),
      { have, state: 'sleeping' }, { have, state: '' }, { have, state: null }, { have, state: ['working'] },
      { have, rooms: { seat: dev.id, room: 5, program: 'Claude Code' } }, { have, rooms: [5] }, { have, login: 'someone@example.test' },
      // A seat is named once: two figures for one seat have no order.
      { have, state: 'paused', rooms: [{ seat: dev.id, room: 5, program: 'Claude Code' }, { seat: dev.id, room: 6, program: 'Claude Code' }] },
    ];
    for (const sent of invalid) {
      const [status, answer] = await ask(mac, sent);
      assert.deepEqual([status, answer.error, typeof answer.error_description], [400, 'invalid_request', 'string'], JSON.stringify(sent));
    }
    assert.deepEqual(await row(dev.id), stored);
    assert.equal((await runnerOf(person)).state, state);
    // A credential that is not accepted stores nothing either.
    assert.equal((await ask('collab_rc_unknown', { have: [], state: 'paused', rooms: [{ seat: dev.id, room: 5, program: 'Claude Code' }] }))[0], 401);
    assert.deepEqual(await row(dev.id), stored);
  });

  await t.test('reports recheck authorization and write the supplied state after a stale read', async () => {
    const find = prisma.agentSeat.findMany;
    const duringRead = async (change, sent) => {
      prisma.agentSeat.findMany = async (...args) => {
        const found = await find.apply(prisma.agentSeat, args);
        await change();
        return found;
      };
      try { return await ask(mac, sent); } finally { prisma.agentSeat.findMany = find; }
    };
    const current = await runnerOf(person);
    const sent = { have, state: 'working', rooms: [{ seat: dev.id, room: 12, program: 'Codex' }] };
    assert.equal((await duringRead(() => prisma.agentRunner.update({ where: { id: current.id }, data: { state: 'paused' } }), sent))[0], 200);
    assert.equal((await runnerOf(person)).state, 'working');

    const stored = await row(dev.id);
    const member = await prisma.workspaceMember.findFirstOrThrow({ where: { workspaceId: 'w', userId: person } });
    const denied = { ...sent, state: 'paused' };
    assert.equal((await duringRead(() => prisma.workspaceMember.update({ where: { id: member.id }, data: { status: false } }), denied))[0], 401);
    assert.deepEqual(await row(dev.id), stored);
    assert.equal((await runnerOf(person)).state, 'working');
    await prisma.workspaceMember.update({ where: { id: member.id }, data: { status: true } });

    assert.equal((await duringRead(() => runners.removeRunner({ workspaceId: 'w', actorId: person, runnerId: current.id }), denied))[0], 401);
    assert.deepEqual(await row(dev.id), stored);
    assert.equal((await prisma.agentRunner.findUniqueOrThrow({ where: { id: current.id } })).state, 'working');
  });
});
