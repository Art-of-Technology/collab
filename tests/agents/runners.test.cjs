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
  // The routes a signed-in person calls, as `signedIn`.
  let signedIn = null;
  const session = { '@/lib/request-session': { getServerSession: async () => signedIn && { user: { id: signedIn } } } };
  const admitRoute = load('src/app/api/workspaces/[workspaceId]/agent-runners/route.ts', { ...deps, ...session }, globals);
  const removeRoute = load('src/app/api/workspaces/[workspaceId]/agent-runners/[runnerId]/route.ts', { ...deps, ...session }, globals);

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

  await t.test('a token the runner holds is not sent again; a token ends only when the runner shows it holds a newer one', async () => {
    const [, holding] = await ask(first.credential, [mine.token.tokenId, 'something-else']);
    assert.deepEqual(holding.seats.map(row => [row.tokenId, row.token]), [[mine.token.tokenId, undefined]]);
    assert.equal(await prisma.appToken.count({ where: { userId: mine.userId } }), 1);
    // Two asks that overlap, as when a slow one is sent again: whichever answer arrives last, the runner holds a token that works.
    const [[, one], [, two]] = await Promise.all([ask(first.credential), ask(first.credential)]);
    // In the order the server made them, which is not the order they were asked for.
    const made = (await prisma.appToken.findMany({ where: { id: { in: [one.seats[0].tokenId, two.seats[0].tokenId] } }, orderBy: { createdAt: 'asc' }, select: { id: true } })).map(row => row.id);
    const [older, newer] = made.map(id => [one.seats[0], two.seats[0]].find(row => row.tokenId === id));
    assert.notEqual(older.tokenId, newer.tokenId);
    assert.deepEqual([await me(older.token), await me(newer.token)], [200, 200]);
    assert.equal(await me(mine.token.token), 401, 'two newer tokens were made since: the first one ended');
    // Holding the older of the two changes nothing: the newer answer may still arrive.
    assert.equal((await ask(first.credential, [older.tokenId]))[1].seats[0].tokenId, older.tokenId);
    assert.deepEqual([await me(older.token), await me(newer.token)], [200, 200]);
    // Holding the newer one ends the older.
    assert.deepEqual((await ask(first.credential, [older.tokenId, newer.tokenId]))[1].seats.map(row => [row.tokenId, row.token]), [[newer.tokenId, undefined]]);
    assert.deepEqual([await me(older.token), await me(newer.token)], [401, 200]);
    // A runner that lost its file gets a new token; the lost one works until the runner asks holding the new one.
    const [, again] = await ask(first.credential);
    assert.deepEqual([await me(newer.token), await me(again.seats[0].token)], [200, 200]);
    await ask(first.credential, [again.seats[0].tokenId]);
    assert.deepEqual([await me(newer.token), await me(again.seats[0].token)], [401, 200]);
    // A token that ended while the seat's agent stayed on (as when another of its tokens still works) reads as one the runner does not hold.
    await prisma.appToken.update({ where: { id: again.seats[0].tokenId }, data: { isRevoked: true } });
    const [, renewed] = await ask(first.credential, [again.seats[0].tokenId]);
    assert.equal(await me(renewed.seats[0].token), 200);
    mine.token = renewed.seats[0];
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

  await t.test('a retired seat is not made again by hand while a token a runner fetched for it still works', async () => {
    const made = (await seat('again', 'security', person, { byRunner: true })).seat;
    const [, answer] = await ask(mine.credential, [mine.token.tokenId]);
    const got = answer.seats.find(row => row.id === made.id);
    assert.equal(await me(got.token), 200);
    await seats.retireSeat({ workspaceId: 'w', actorId: owner, seatId: made.id });
    assert.equal(await me(got.token), 403, 'a retired seat');
    // For another owner, by hand: the first owner's runner would hold a token of the new seat.
    await refuses(seat('again', 'security', other), 'tokens_exist', 409);
    assert.equal(await prisma.appToken.count({ where: { userId: made.userId } }), 1, 'no token was made for the refused seat');
    assert.equal((await prisma.agentSeat.findUniqueOrThrow({ where: { id: made.id } })).ownerId, person);
    assert.equal(await tokens.revokeAgentToken({ workspaceId: 'w', actorId: owner, tokenId: got.tokenId }), true);
    const again = await seat('again', 'security', other);
    assert.deepEqual([again.seat.id, again.seat.ownerId, again.seat.byRunner], [made.id, other, false]);
    assert.deepEqual([await me(got.token), await me(again.token.token)], [401, 200]);
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
