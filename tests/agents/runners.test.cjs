const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('../security/helpers.cjs');
const { seatsDatabase } = require('./seats-db.cjs');

// Token-facing routes accept only cuid-shaped ids.
const owner = 'cowner00001', person = 'cperson0001', other = 'cother00001', stranger = 'cstranger01';
const A = 'cprojecta001';
const scopes = ['issues:read', 'issues:write', 'user:read'];

let db;
after(() => db?.stop());

test('runners: a runner is admitted by its code and fetches the tokens of its person\'s seats, and nothing else', async t => {
  db = await seatsDatabase(async prisma => {
    await prisma.user.createMany({ data: [owner, person, other, stranger].map(id => ({ id, name: id, email: `${id}@example.test` })) });
    await prisma.workspace.create({ data: { id: 'w', name: 'w', slug: 'w', ownerId: owner } });
    await prisma.workspace.create({ data: { id: 'elsewhere', name: 'elsewhere', slug: 'elsewhere', ownerId: stranger } });
    await prisma.workspaceMember.createMany({ data: [person, other].map(userId => ({ workspaceId: 'w', userId })) });
    await prisma.project.create({ data: { id: A, workspaceId: 'w', name: A, slug: A, issuePrefix: 'AA' } });
    await prisma.app.create({ data: { id: 'agent-app', name: 'collab-agent', slug: 'collab-agent', publisherId: 'system', status: 'PUBLISHED', visibility: 'PRIVATE', isSystemApp: true,
      scopes: { create: scopes.map(scope => ({ scope })) } } });
  });
  const { prisma } = db;

  // Tokens are stored readable here: runners are under test, not encryption.
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
  const middleware = load('src/lib/apps/auth-middleware.ts', { crypto: require('node:crypto'), 'next/server': response,
    '@/lib/apps/crypto': crypto, '@/lib/oauth-scopes': load('src/lib/oauth-scopes.ts'), '@/lib/post-access': load('src/lib/post-access.ts'),
    '@/lib/auth-error-diagnostics': load('src/lib/auth-error-diagnostics.ts'), '@/lib/prisma': { prisma } }, globals);
  const http = load('src/lib/agent-handoff-http.ts', { zod, 'next/server': response, './agent-handoffs': handoffs }, globals);
  const deps = { zod, 'next/server': response, '@/lib/prisma': { prisma }, '@/lib/apps/auth-middleware': middleware, '@/lib/agent-seats': seats,
    '@/lib/agent-handoff-http': http, '@/lib/agent-runners': runners, '@/lib/auth-options': { authOptions: {} } };
  const seatsMe = load('src/app/api/apps/auth/seats/me/route.ts', deps, globals);
  const pairRoute = load('src/app/api/runner/pair/route.ts', deps, globals), fetchRoute = load('src/app/api/runner/seats/route.ts', deps, globals);
  const goodbyeRoute = load('src/app/api/runner/goodbye/route.ts', deps, globals);
  // The routes a signed-in person calls, as `signedIn`.
  let signedIn = null;
  const session = { '@/lib/request-session': { getServerSession: async () => signedIn && { user: { id: signedIn } } } };
  const admitRoute = load('src/app/api/workspaces/[workspaceId]/agent-runners/route.ts', { ...deps, ...session }, globals);
  const removeRoute = load('src/app/api/workspaces/[workspaceId]/agent-runners/[runnerId]/route.ts', { ...deps, ...session }, globals);
  const renewRoute = load('src/app/api/workspaces/[workspaceId]/agent-runners/[runnerId]/renew/route.ts', { ...deps, ...session }, globals);
  // Archiving a project is a person's own route, which reads its own session.
  const archiveRoute = load('src/app/api/projects/[projectId]/archive/route.ts', { ...deps, '@/lib/post-access': load('src/lib/post-access.ts'),
    '@/lib/session': { getCurrentUser: async () => signedIn && { id: signedIn } } }, globals);

  // As Collab's own page sends it, unless a test says otherwise.
  const post = async (handler, bearer, sent, params = {}, headers = { 'Content-Type': 'application/json', Origin: 'https://collab.test' }) => {
    const reply = await handler(new Request('https://collab.test/api', { method: 'POST', headers: { ...headers, ...(bearer && { Authorization: `Bearer ${bearer}` }) }, body: JSON.stringify(sent) }),
      { params: Promise.resolve(params) });
    return [reply.status, await reply.json(), reply.headers.get('cache-control')];
  };
  /** What a runner's ask is answered with: [status, body]. */
  const ask = (credential, have = []) => post(fetchRoute.POST, credential, { have });
  /** What a token route answers this bearer. */
  const me = async bearer => (await seatsMe.GET(new Request('https://collab.test/api', { headers: { Authorization: `Bearer ${bearer}` } }), { params: Promise.resolve({}) })).status;
  const refuses = (promise, code, status) => assert.rejects(promise, error => error.code === code && error.status === status, `expected ${code}`);
  const seat = (name, role, ownerId, extra = {}) => seats.createSeat({ workspaceId: 'w', actorId: owner, projectId: A, role, ownerId, name, expiresInDays: 30, ...extra });
  const pair = async name => (await post(pairRoute.POST, null, { name }))[1];
  const admit = (as, sent, workspaceId = 'w', headers) => { signedIn = as; return post(admitRoute.POST, null, sent, { workspaceId }, headers); };
  /** Until another session waits for a lock on this table. */
  const waitsFor = async table => {
    for (let attempt = 0; attempt < 100; attempt++) {
      if ((await prisma.$queryRaw`SELECT 1 FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND query LIKE ${`%${table}%`} AND pid <> pg_backend_pid()`).length) return true;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    return false;
  };

  let mine, theirs, first;

  await t.test('a seat made for a runner has no token: none is returned, none is stored, and none can be made by hand', async () => {
    await refuses(seat('nobody', 'developer', null, { byRunner: true }), 'owner_required', 400);
    const made = await seat('dev', 'developer', person, { byRunner: true });
    assert.equal(made.token, null);
    assert.equal(made.seat.byRunner, true);
    mine = made.seat;
    theirs = (await seat('rev', 'reviewer', other, { byRunner: true })).seat;
    assert.equal(await prisma.appToken.count(), 0);
    // Under the seat's name, as a plain token and as a seat.
    assert.equal((await tokens.createAgentToken({ workspaceId: 'w', actorId: owner, name: 'Dev', access: 'write', expiresInDays: 30 })).error, 'runner_seat');
    assert.equal((await seat('dev', 'developer', person)).error, 'runner_seat');
    assert.equal(await prisma.appToken.count(), 0);
    assert.equal(await prisma.user.count({ where: { name: { in: ['dev', 'Dev'] } } }), 1, 'the name finds the seat\'s account, not a second one');
    // A seat run by hand is not given to a runner under the same name, and an account whose tokens a person saw is not either.
    const hand = await seat('hand', 'developer', person);
    assert.ok(hand.token.token);
    await refuses(seat('hand', 'developer', person, { byRunner: true }), 'seat_exists', 409);
    await seats.retireSeat({ workspaceId: 'w', actorId: owner, seatId: hand.seat.id });
    await refuses(seat('hand', 'developer', person, { byRunner: true }), 'tokens_exist', 409);
    const audit = JSON.stringify(await prisma.appAuditLog.findMany());
    assert.ok(!audit.includes('collab_at_') && !audit.includes('collab_rc_'));
  });

  await t.test('a pairing gives the runner its credential and a code; the credential fetches nothing until a person admits the code', async () => {
    const [status, started, cache] = await post(pairRoute.POST, null, { name: 'mac' });
    assert.equal(status, 200);
    assert.equal(cache, 'no-store');
    assert.match(started.code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    assert.match(started.credential, /^collab_rc_/);
    first = started;
    const row = await prisma.agentRunner.findFirstOrThrow();
    assert.ok(!JSON.stringify(row).includes(started.credential), 'only the hash of the credential is stored');
    assert.deepEqual((await ask(started.credential)).slice(0, 2).map(part => part.error ?? part), [403, 'runner_pending']);
    assert.equal((await ask('collab_rc_unknown'))[0], 401);
    assert.equal((await post(fetchRoute.POST, null, { have: [] }))[0], 401);
    assert.equal((await post(pairRoute.POST, null, { name: '' }))[0], 400);
  });

  await t.test('a member admits a runner for themselves only; the owner for anyone; a code works once', async () => {
    assert.equal((await admit(null, { code: first.code }))[0], 401);
    // Only Collab's own page admits: another origin, no origin and a body that is not sent as JSON are refused, and the code is not used up.
    for (const headers of [{ 'Content-Type': 'application/json', Origin: 'https://other.example' }, { 'Content-Type': 'application/json' }, { 'Content-Type': 'text/plain', Origin: 'https://collab.test' }]) {
      assert.deepEqual((await admit(person, { code: first.code }, 'w', headers)).slice(0, 2).map(part => part.code ?? part), [403, 'same_origin']);
    }
    assert.equal(await prisma.agentRunner.count({ where: { workspaceId: { not: null } } }), 0);
    assert.equal((await admit(stranger, { code: first.code }))[0], 404, 'not a member of this workspace');
    assert.deepEqual((await admit(person, { code: first.code, ownerId: other })).slice(0, 2).map(part => part.code ?? part), [403, 'owner_only']);
    assert.equal((await admit(person, { code: 'AAAA-AAAA' }))[1].code, 'code_not_found');
    // As typed: lower case, a space for the dash.
    const [status, admitted] = await admit(person, { code: first.code.toLowerCase().replace('-', ' ') });
    assert.equal(status, 201, JSON.stringify(admitted));
    assert.deepEqual([admitted.runner.name, admitted.runner.ownerId, admitted.replaced], ['mac', person, []]);
    assert.equal((await admit(other, { code: first.code }))[1].code, 'code_not_found');
    // The owner admits one for someone else, but not for an agent's account or for someone outside the workspace.
    const second = await pair('their-mac');
    for (const ownerId of [mine.userId, stranger]) assert.equal((await admit(owner, { code: second.code, ownerId }))[1].code, 'owner_not_found');
    assert.equal((await admit(owner, { code: second.code, ownerId: other }))[0], 201);
    theirs.credential = second.credential;
  });

  await t.test('a runner is given the seats of its person, each with a token that works, and never another person\'s', async () => {
    const [status, answer, cache] = await ask(first.credential);
    assert.equal(status, 200, JSON.stringify(answer));
    assert.equal(cache, 'no-store');
    assert.deepEqual(answer.runner, { id: answer.runner.id, name: 'mac', workspaceId: 'w', ownerId: person });
    assert.equal(answer.seats.length, 1, 'not the seat of someone else, and not the retired one');
    const [got] = answer.seats;
    assert.deepEqual({ ...got, token: null, tokenId: null, expiresAt: null }, { id: mine.id, name: 'dev', role: 'developer', project: { id: A, name: A, issuePrefix: 'AA' }, token: null, tokenId: null, expiresAt: null });
    assert.match(got.token, /^collab_at_/);
    const days = (new Date(got.expiresAt) - Date.now()) / 86_400_000;
    assert.ok(days > 29.9 && days <= 30);
    assert.equal(await me(got.token), 200);
    mine.token = got;
    // The other person's runner gets the other person's seat.
    assert.deepEqual((await ask(theirs.credential))[1].seats.map(row => row.name), ['rev']);
    const audit = JSON.stringify(await prisma.appAuditLog.findMany());
    assert.ok(!audit.includes(got.token) && !audit.includes(first.credential));
  });

  await t.test('a runner credential does nothing else: a token route refuses it', async () => {
    assert.equal(await me(first.credential), 401);
  });

  await t.test('retirement that holds the seat row prevents a new runner token', async () => {
    const changing = (await seat('changing', 'security', person, { byRunner: true })).seat;
    let pending;
    await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "AgentSeat" WHERE "id" = ${changing.id} FOR UPDATE`;
      pending = ask(first.credential, [mine.token.tokenId]);
      const waiting = await waitsFor('AgentSeat');
      await tx.agentSeat.update({ where: { id: changing.id }, data: { retiredAt: new Date() } });
      assert.ok(waiting, 'the mint must wait for the seat row');
    }, { timeout: 10000 });
    const [, result] = await pending;
    const changed = result.seats.find(row => row.id === changing.id);
    assert.equal(changed.problem, 'seat_changed');
    assert.equal(changed.tokenId, null);
    assert.equal(await prisma.appToken.count({ where: { userId: changing.userId } }), 0);
  });

  await t.test('a token the runner holds is not sent again; a token ends when the runner uses the one that replaces it', async () => {
    const [, holding] = await ask(first.credential, [mine.token.tokenId, 'something-else']);
    assert.deepEqual(holding.seats.map(row => [row.tokenId, row.token]), [[mine.token.tokenId, undefined]]);
    assert.equal(await prisma.appToken.count({ where: { userId: mine.userId } }), 1);
    // Two asks that overlap, as when a slow one is sent again: whichever answer arrives last, the runner holds a token that works.
    const [[, one], [, two]] = await Promise.all([ask(first.credential), ask(first.credential)]);
    // In the order the server made them, which is not the order they were asked for.
    const made = (await prisma.appToken.findMany({ where: { id: { in: [one.seats[0].tokenId, two.seats[0].tokenId] } }, orderBy: { createdAt: 'asc' }, select: { id: true } })).map(row => row.id);
    const [older, newer] = made.map(id => [one.seats[0], two.seats[0]].find(row => row.tokenId === id));
    assert.notEqual(older.tokenId, newer.tokenId);
    assert.equal(await me(mine.token.token), 401, 'two newer tokens were made since: the first one ended');
    // Holding the older of the two changes nothing: the newer answer may still arrive.
    assert.equal((await ask(first.credential, [older.tokenId]))[1].seats[0].tokenId, older.tokenId);
    // Saying it holds the newer one ends nothing either: a token the runner never uses must leave the one it
    // replaces working, so the seat is not left without one.
    assert.deepEqual((await ask(first.credential, [older.tokenId, newer.tokenId]))[1].seats.map(row => [row.tokenId, row.token]), [[newer.tokenId, undefined]]);
    assert.equal(await me(older.token), 200);
    // The first request made with the newer one ends it.
    assert.equal(await me(newer.token), 200);
    assert.equal(await me(older.token), 401);
    // A runner that lost its file gets a new token; the lost one works until the new one is used.
    const [, again] = await ask(first.credential);
    assert.deepEqual([await me(newer.token), await me(again.seats[0].token)], [200, 200]);
    assert.equal(await me(newer.token), 401);
    // A token that ended while the seat's agent stayed on (as when another of its tokens still works) reads as one the runner does not hold.
    await prisma.appToken.update({ where: { id: again.seats[0].tokenId }, data: { isRevoked: true } });
    const [, renewed] = await ask(first.credential, [again.seats[0].tokenId]);
    assert.equal(await me(renewed.seats[0].token), 200);
    mine.token = renewed.seats[0];
  });

  await t.test('a token near its end is renewed on the next ask: the seat holds a working new token before the old one ends', async () => {
    const left = async days => {
      await prisma.appToken.update({ where: { id: mine.token.tokenId }, data: { tokenExpiresAt: new Date(Date.now() + days * 86_400_000) } });
      return (await ask(first.credential, [mine.token.tokenId]))[1].seats[0];
    };
    // Outside the window the ask is answered with the token the runner already holds.
    const kept = await left(8);
    assert.deepEqual([kept.tokenId, kept.token], [mine.token.tokenId, undefined]);
    // Inside it the ask carries a new token as well, and both work: the seat is never without a valid token.
    const renewed = await left(6);
    assert.notEqual(renewed.tokenId, mine.token.tokenId);
    assert.match(renewed.token, /^collab_at_/);
    const days = (new Date(renewed.expiresAt) - Date.now()) / 86_400_000;
    assert.ok(days > 29.9 && days <= 30, 'the new token lasts 30 days of its own');
    assert.equal(await prisma.appToken.count({ where: { userId: mine.userId, isRevoked: false } }), 2);
    // A renewal the runner does not pick up leaves the old token working, and the seat says so.
    const waiting = (await runners.runnerSeats(prisma, A)).find(row => row.name === 'dev');
    assert.equal(waiting.state, 'renewing');
    assert.equal(await me(mine.token.token), 200);
    assert.equal((await ask(first.credential, [mine.token.tokenId, renewed.tokenId]))[1].seats[0].tokenId, renewed.tokenId, 'the newest token it holds, with no third one made');
    assert.equal(await prisma.appToken.count({ where: { userId: mine.userId, isRevoked: false } }), 2);
    // Asking again while it still works with the old one renews again, and the one it is working with is kept.
    const third = (await ask(first.credential, [mine.token.tokenId]))[1].seats[0];
    assert.notEqual(third.tokenId, renewed.tokenId);
    assert.deepEqual([await me(mine.token.token), await me(renewed.token)], [200, 401], 'the runner keeps the token it holds; the renewal it never took ends');
    // The first request with the new token ends the old one, and the seat reads as held again.
    assert.equal(await me(third.token), 200);
    assert.equal(await me(mine.token.token), 401);
    assert.equal((await runners.runnerSeats(prisma, A)).find(row => row.name === 'dev').state, 'held');
    mine.token = third;
  });

  await t.test('a seat whose token ran out while its runner was away shows it, and its runner gets a new one when it comes back', async () => {
    await prisma.appToken.update({ where: { id: mine.token.tokenId }, data: { tokenExpiresAt: new Date(Date.now() - 1000) } });
    const row = (await runners.runnerSeats(prisma, A)).find(seat => seat.name === 'dev');
    assert.deepEqual([row.state, row.runner, row.fetchedAt], ['expired', null, null]);
    assert.equal(await me(mine.token.token), 401);
    // The runner comes back after the token ran out: it holds nothing usable, so it is given a new one.
    const back = (await ask(first.credential, [mine.token.tokenId]))[1].seats[0];
    assert.match(back.token, /^collab_at_/);
    assert.equal(await me(back.token), 200);
    assert.equal((await runners.runnerSeats(prisma, A)).find(seat => seat.name === 'dev').state, 'held');
    mine.token = back;
  });

  await t.test('a person sees per seat whether a runner fetched its token, and a runner is listed for its person and the owner', async () => {
    const third = await seat('sec', 'security', person, { byRunner: true });
    const states = await runners.runnerSeats(prisma, A);
    assert.deepEqual(states.map(row => [row.name, row.owner, row.runner, !!row.fetchedAt]), [['dev', person, 'mac', true], ['rev', other, 'their-mac', true], ['sec', person, null, false]]);
    const list = async as => { signedIn = as; return (await admitRoute.GET(new Request('https://collab.test/api'), { params: Promise.resolve({ workspaceId: 'w' }) })).json(); };
    assert.deepEqual((await list(person)).runners.map(row => [row.name, row.seats]), [['mac', 2]]);
    assert.deepEqual((await list(owner)).runners.map(row => row.name).sort(), ['mac', 'their-mac']);
    assert.equal((await list(stranger)).error, 'Workspace not found');
    await seats.retireSeat({ workspaceId: 'w', actorId: owner, seatId: third.seat.id });
  });

  await t.test('admitting another runner for the same person ends the one before, with the tokens it fetched', async () => {
    const next = await pair('new-mac');
    signedIn = person;
    const [status, admitted] = await post(admitRoute.POST, null, { code: next.code }, { workspaceId: 'w' });
    assert.equal(status, 201);
    assert.deepEqual(admitted.replaced, ['mac']);
    assert.equal((await ask(first.credential))[0], 401);
    assert.equal(await me(mine.token.token), 401);
    const [, answer] = await ask(next.credential);
    assert.equal(await me(answer.seats[0].token), 200);
    mine.token = answer.seats[0];
    mine.credential = next.credential;
    mine.runnerId = admitted.runner.id;
  });

  await t.test('a runner is removed by its person or the owner, not by another member; its credential and its tokens end', async () => {
    const remove = async (as, runnerId) => { signedIn = as; return (await removeRoute.DELETE(new Request('https://collab.test/api', { method: 'DELETE' }), { params: Promise.resolve({ workspaceId: 'w', runnerId }) })); };
    assert.equal((await remove(null, mine.runnerId)).status, 401);
    assert.equal((await remove(other, mine.runnerId)).status, 404);
    assert.equal((await ask(mine.credential, [mine.token.tokenId]))[0], 200);
    const removed = await remove(owner, mine.runnerId);
    assert.deepEqual([removed.status, await removed.json()], [200, { revokedTokens: 1 }]);
    assert.equal((await ask(mine.credential))[0], 401);
    assert.equal(await me(mine.token.token), 401);
    assert.equal((await remove(owner, mine.runnerId)).status, 404, 'already removed');
    assert.equal((await runners.runnerSeats(prisma, A)).find(row => row.name === 'dev').runner, null, 'the seat is back to no runner');
    // Their own.
    const { id } = await prisma.agentRunner.findFirstOrThrow({ where: { ownerId: other, removedAt: null } });
    assert.equal((await remove(other, id)).status, 200);
  });

  await t.test('a runner never switches a seat\'s agent back on: switched off or removed, the seat gets no token until a person makes it again', async () => {
    const key = { userId_workspaceId: { userId: mine.userId, workspaceId: 'w' } };
    const member = async () => (await prisma.workspaceMember.findUnique({ where: key, select: { status: true } }))?.status ?? null;
    const usable = () => prisma.appToken.count({ where: { userId: mine.userId, isRevoked: false, tokenExpiresAt: { gt: new Date() } } });
    /** The ask gives the seat a problem and no token, and the agent is as a person left it. */
    const stays = async (credential, left) => {
      const [status, answer] = await ask(credential);
      assert.equal(status, 200, JSON.stringify(answer));
      assert.deepEqual(answer.seats.map(row => [row.name, row.problem, row.tokenId, row.token]), [['dev', 'paused', null, undefined]]);
      assert.deepEqual([await member(), await usable()], [left, 0]);
    };
    const fetched = async credential => {
      const [, answer] = await ask(credential);
      assert.equal(await me(answer.seats[0].token), 200);
      return answer.seats[0];
    };
    const one = await pair('one');
    assert.equal((await admit(person, { code: one.code }))[0], 201);
    let held = await fetched(one.credential);

    for (const removed of [false, true]) {
      if (removed) await prisma.workspaceMember.delete({ where: key });
      else await prisma.workspaceMember.update({ where: key, data: { status: false } });
      await refuses(seat('dev', 'reviewer', person, { byRunner: true }), 'seat_exists', 409);
      assert.equal(await member(), removed ? null : false);
      assert.equal((await seat('dev', 'developer', person, { byRunner: true })).seat.id, mine.id);
      assert.equal(await member(), true);
      assert.equal(await me(held.token), 200);
    }

    // Someone who manages members switches the agent off; its person then replaces the runner, which revokes what it fetched.
    await prisma.workspaceMember.update({ where: key, data: { status: false } });
    assert.equal(await me(held.token), 403);
    const two = await pair('two');
    const [, admitted] = await admit(person, { code: two.code });
    assert.deepEqual(admitted.replaced, ['one']);
    await stays(two.credential, false);

    // Switched off, and the token runs out.
    await prisma.workspaceMember.update({ where: key, data: { status: true } });
    held = await fetched(two.credential);
    await prisma.workspaceMember.update({ where: key, data: { status: false } });
    await prisma.appToken.update({ where: { id: held.tokenId }, data: { tokenExpiresAt: new Date(Date.now() - 1000) } });
    await stays(two.credential, false);

    // Its last usable token revoked on the Agent tokens page, which switches the agent off; then removed from the workspace.
    await prisma.workspaceMember.update({ where: key, data: { status: true } });
    held = await fetched(two.credential);
    assert.equal(await tokens.revokeAgentToken({ workspaceId: 'w', actorId: owner, tokenId: held.tokenId }), true);
    await stays(two.credential, false);
    await prisma.workspaceMember.delete({ where: key });
    await stays(two.credential, null);

    // A person who manages agent tokens makes the seat again, and its runner fetches as before.
    assert.equal((await seat('dev', 'developer', person, { byRunner: true })).seat.id, mine.id);
    assert.equal(await member(), true);
    mine.token = await fetched(two.credential);
    mine.credential = two.credential;
    mine.runnerId = admitted.runner.id;
  });

  await t.test('retiring a seat leaves no token a runner fetched for it, and the runner is not given it again', async () => {
    const made = (await seat('again', 'security', person, { byRunner: true })).seat;
    const [, answer] = await ask(mine.credential, [mine.token.tokenId]);
    const got = answer.seats.find(row => row.id === made.id);
    assert.equal(await me(got.token), 200);
    const retired = await seats.retireSeat({ workspaceId: 'w', actorId: owner, seatId: made.id });
    assert.equal(retired.revokedTokens, 1);
    assert.equal(await me(got.token), 401, 'revoked, not only refused as a retired seat');
    assert.deepEqual((await ask(mine.credential, [mine.token.tokenId]))[1].seats.map(row => row.id), [mine.id], 'the retired seat is not listed any more');
    // Nothing is left to refuse the name to a seat made again by hand, for another owner.
    const again = await seat('again', 'security', other);
    assert.deepEqual([again.seat.id, again.seat.ownerId, again.seat.byRunner], [made.id, other, false]);
    assert.deepEqual([await me(got.token), await me(again.token.token)], [401, 200]);
  });

  await t.test('archiving a project leaves its runner seats no token, and they are not fetched again until it is back', async () => {
    const [, before] = await ask(mine.credential, [mine.token.tokenId]);
    assert.deepEqual(before.seats.map(row => row.id), [mine.id]);
    assert.equal(await me(mine.token.token), 200);
    const archive = async isArchived => {
      signedIn = owner;
      const reply = await archiveRoute.PATCH(new Request('https://collab.test/api', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isArchived }) }),
        { params: Promise.resolve({ projectId: A }) });
      assert.equal(reply.status, 200, JSON.stringify(await reply.json()));
    };
    await archive(true);
    assert.equal(await me(mine.token.token), 401);
    assert.deepEqual((await ask(mine.credential))[1].seats, [], 'an archived project\'s seats are not the runner\'s to run');
    await archive(false);
    const back = (await ask(mine.credential))[1].seats[0];
    assert.equal(await me(back.token), 200);
    mine.token = back;
  });

  await t.test('a project archived while a token is being made leaves none behind', async () => {
    // Asked a moment ago, so the ask below only reads rows until it makes a token.
    assert.equal((await ask(mine.credential, [mine.token.tokenId]))[0], 200);
    let pending;
    await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "Project" WHERE "id" = ${A} FOR UPDATE`;
      // Holding nothing, so a token is made for the seat.
      pending = ask(mine.credential);
      const waiting = await waitsFor('Project');
      await tx.project.update({ where: { id: A }, data: { isArchived: true } });
      assert.ok(waiting, 'the mint must wait for the project row');
    }, { timeout: 10000 });
    const [status, answer] = await pending;
    assert.equal(status, 200, JSON.stringify(answer));
    assert.deepEqual(answer.seats.map(row => [row.problem, row.tokenId]), [['seat_changed', null]]);
    assert.equal(await prisma.appToken.count({ where: { userId: mine.userId, isRevoked: false, tokenExpiresAt: { gt: new Date() } } }), 1, 'only the token the runner already held');
    await prisma.project.update({ where: { id: A }, data: { isArchived: false } });
  });

  await t.test('the owner asks for a renewal now: what the runner fetched is revoked at once and it gets a new token on its next ask', async () => {
    const renew = async (as, runnerId, headers) => {
      signedIn = as;
      const reply = await renewRoute.POST(new Request('https://collab.test/api', { method: 'POST', headers: headers ?? { 'Content-Type': 'application/json', Origin: 'https://collab.test' } }),
        { params: Promise.resolve({ workspaceId: 'w', runnerId }) });
      return [reply.status, await reply.json()];
    };
    assert.equal((await renew(null, mine.runnerId))[0], 401);
    assert.equal((await renew(person, mine.runnerId, { 'Content-Type': 'application/json' }))[1].code, 'same_origin');
    assert.equal((await renew(other, mine.runnerId))[0], 404, 'not this person\'s runner');
    assert.equal(await me(mine.token.token), 200);
    assert.deepEqual(await renew(owner, mine.runnerId), [200, { revokedTokens: 1 }]);
    assert.equal(await me(mine.token.token), 401, 'the token that may have leaked stops at once');
    const row = (await runners.runnerSeats(prisma, A)).find(seat => seat.name === 'dev');
    assert.deepEqual([row.state, row.runner], [null, null], 'the seat waits for a runner to fetch again, as before the first fetch');
    // The runner itself is not ended by this: it asks on, and the seat is working again a minute later.
    const fresh = (await ask(mine.credential, [mine.token.tokenId]))[1].seats[0];
    assert.equal(await me(fresh.token), 200);
    assert.deepEqual(await renew(person, mine.runnerId), [200, { revokedTokens: 1 }], 'a person renews their own runner');
    mine.token = (await ask(mine.credential))[1].seats[0];
    assert.equal(await me(mine.token.token), 200);
  });

  await t.test('a runner says goodbye: its tokens are revoked at once and its credential is refused from then on', async () => {
    assert.equal((await post(goodbyeRoute.POST, 'collab_rc_unknown', {}))[0], 401);
    assert.equal((await post(goodbyeRoute.POST, null, {}))[0], 401);
    // A pairing nobody admitted is simply dropped, so its code cannot be typed afterwards.
    const waiting = await pair('going');
    assert.deepEqual((await post(goodbyeRoute.POST, waiting.credential, {})).slice(0, 2), [200, { revokedTokens: 0 }]);
    assert.equal((await admit(person, { code: waiting.code }))[1].code, 'code_not_found');
    assert.equal(await me(mine.token.token), 200);
    const [status, said, cache] = await post(goodbyeRoute.POST, mine.credential, {});
    assert.deepEqual([status, said, cache], [200, { revokedTokens: 1 }, 'no-store']);
    assert.equal(await me(mine.token.token), 401, 'the machine is deleted with the token on it: it stops now, not in 30 days');
    assert.equal((await ask(mine.credential))[0], 401);
    assert.equal((await post(goodbyeRoute.POST, mine.credential, {}))[0], 401, 'said once');
    assert.equal((await runners.runnerSeats(prisma, A)).find(seat => seat.name === 'dev').runner, null, 'its seats show no runner');
    const audit = await prisma.appAuditLog.findFirst({ where: { action: 'agent_runner.removed' }, orderBy: { createdAt: 'desc' } });
    assert.equal(audit.details.reason, 'goodbye');
    // The machine that comes back pairs again.
    const back = await pair('back');
    assert.equal((await admit(person, { code: back.code }))[0], 201);
    mine.credential = back.credential;
    mine.token = (await ask(back.credential))[1].seats[0];
    assert.equal(await me(mine.token.token), 200);
    mine.runnerId = (await prisma.agentRunner.findFirstOrThrow({ where: { name: 'back' } })).id;
  });

  await t.test('a runner removed while its token is being made gets none', async () => {
    // Asked a moment ago, so the ask below only reads the runner's row until it makes a token.
    assert.equal((await ask(mine.credential, [mine.token.tokenId]))[0], 200);
    const usable = () => prisma.appToken.count({ where: { runnerId: mine.runnerId, isRevoked: false } });
    const before = await usable();
    let pending;
    await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "AgentRunner" WHERE "id" = ${mine.runnerId} FOR UPDATE`;
      // Holding nothing, so a token is made for the seat.
      pending = ask(mine.credential);
      const waiting = await waitsFor('AgentRunner');
      await tx.agentRunner.update({ where: { id: mine.runnerId }, data: { removedAt: new Date() } });
      assert.ok(waiting, 'the mint must wait for the runner row');
    }, { timeout: 10000 });
    assert.equal((await pending)[0], 401);
    assert.equal(await usable(), before);
  });

  await t.test('a runner whose person left the workspace, or whose pairing ran out, is refused; and pairings are capped', async () => {
    const gone = await pair('gone');
    signedIn = other;
    assert.equal((await post(admitRoute.POST, null, { code: gone.code }, { workspaceId: 'w' }))[0], 201);
    assert.equal((await ask(gone.credential))[0], 200);
    await prisma.workspaceMember.updateMany({ where: { userId: other }, data: { status: false } });
    assert.equal((await ask(gone.credential))[0], 401);
    // Switched off between the ask's first look and the making of a token: the token is not made.
    await prisma.workspaceMember.updateMany({ where: { userId: other }, data: { status: true } });
    const live = () => prisma.appToken.count({ where: { userId: theirs.userId, isRevoked: false } });
    const before = await live(), find = prisma.agentSeat.findMany;
    prisma.agentSeat.findMany = async (...args) => {
      const found = await find.apply(prisma.agentSeat, args);
      if (args[0]?.where?.ownerId === other) await prisma.workspaceMember.updateMany({ where: { userId: other }, data: { status: false } });
      return found;
    };
    try { assert.equal((await ask(gone.credential))[0], 401); } finally { prisma.agentSeat.findMany = find; }
    assert.equal(await live(), before);

    const late = await pair('late');
    await prisma.agentRunner.updateMany({ where: { pairingCode: late.code.replace('-', '') }, data: { pairingExpiresAt: new Date(Date.now() - 1000) } });
    assert.equal((await ask(late.credential))[0], 401);
    signedIn = person;
    assert.equal((await post(admitRoute.POST, null, { code: late.code }, { workspaceId: 'w' }))[1].code, 'code_not_found');
    // Starting a pairing clears the ones that ran out, then counts.
    for (let index = 0; index < 50; index++) await pair(`waiting-${index}`);
    assert.equal(await prisma.agentRunner.count({ where: { name: 'late' } }), 0);
    const [status, busy] = await post(pairRoute.POST, null, { name: 'one-too-many' });
    assert.deepEqual([status, busy.error], [429, 'pairing_busy']);
  });
});
