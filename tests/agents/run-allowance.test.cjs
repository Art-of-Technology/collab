const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('../security/helpers.cjs');
const { seatsDatabase } = require('./seats-db.cjs');

// Token-facing routes accept only cuid-shaped ids.
const owner = 'cowner00001', person = 'cperson0001', other = 'cother00001';
const A = 'cprojecta001';
const scopes = ['issues:read', 'issues:write', 'user:read'];

let db;
after(() => db?.stop());

test('run allowance: a runner reports the program each run used, and the issue shows whose allowance it was (CLB-779)', async t => {
  db = await seatsDatabase(async prisma => {
    await prisma.user.createMany({ data: [[owner, 'Olga Owner'], [person, 'Bob Builder'], [other, 'Cem Second']].map(([id, name]) => ({ id, name, email: `${id}@example.test` })) });
    await prisma.workspace.create({ data: { id: 'w', name: 'w', slug: 'w', ownerId: owner } });
    await prisma.workspaceMember.createMany({ data: [{ workspaceId: 'w', userId: person }, { workspaceId: 'w', userId: other }] });
    await prisma.project.create({ data: { id: A, workspaceId: 'w', name: A, slug: A, issuePrefix: 'AA' } });
    await prisma.app.create({ data: { id: 'agent-app', name: 'collab-agent', slug: 'collab-agent', publisherId: 'system', status: 'PUBLISHED', visibility: 'PRIVATE', isSystemApp: true,
      scopes: { create: scopes.map(scope => ({ scope })) } } });
  });
  const { prisma } = db;

  const crypto = { encryptToken: async value => Buffer.from(value), decryptToken: async data => Buffer.from(data).toString(), getEncryptionKey: () => {} };
  const zod = require('zod');
  const response = { NextResponse: Response };
  const globals = { console, URL, Date, Buffer, process: { env: { NEXTAUTH_URL: 'https://collab.test' } } };
  const handoffs = load('src/lib/agent-handoffs.ts', { 'node:crypto': require('node:crypto'), 'node:buffer': require('node:buffer'), zod,
    '@/lib/prisma': { prisma }, '@/lib/issue-finder': load('src/lib/issue-finder.ts', { '@/lib/prisma': { prisma } }), '@/lib/oauth-scopes': load('src/lib/oauth-scopes.ts') }, { Date });
  const tokens = load('src/lib/agent-tokens.ts', { crypto: require('node:crypto'), '@/lib/prisma': { prisma }, '@/lib/apps/crypto': crypto }, { Buffer, Date });
  const assignee = load('src/lib/issue-assignee.ts', { './agent-handoffs': handoffs });
  const seats = load('src/lib/agent-seats.ts', { '@/lib/prisma': { prisma }, '@/lib/agent-handoffs': handoffs, '@/lib/agent-tokens': tokens, '@/lib/issue-assignee': assignee }, { Date });
  const runners = load('src/lib/agent-runners.ts', { crypto: require('node:crypto'), '@/lib/prisma': { prisma }, '@/lib/agent-handoffs': handoffs, '@/lib/agent-tokens': tokens,
    '@/lib/agent-seats': seats }, { Date });
  const http = load('src/lib/agent-handoff-http.ts', { zod, 'next/server': response, './agent-handoffs': handoffs }, globals);
  const deps = { zod, 'next/server': response, '@/lib/agent-handoff-http': http, '@/lib/agent-runners': runners };
  const pairRoute = load('src/app/api/runner/pair/route.ts', deps, globals), fetchRoute = load('src/app/api/runner/seats/route.ts', deps, globals);
  let signedIn = person;
  const activitiesRoute = load('src/app/api/issues/[issueId]/activities/route.ts', { 'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
    '@/lib/auth': { getAuthSession: async () => ({ user: { id: signedIn } }) }, '@/lib/prisma': { prisma } }, globals);

  const post = async (handler, bearer, sent) => {
    const reply = await handler(new Request('https://collab.test/api', { method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(bearer && { Authorization: `Bearer ${bearer}` }) }, body: JSON.stringify(sent) }));
    return [reply.status, await reply.json()];
  };
  const ask = (credential, sent = {}) => post(fetchRoute.POST, credential, sent);
  const seat = async (name, role, ownerId, extra = {}) => (await seats.createSeat({ workspaceId: 'w', actorId: owner, projectId: A, role, ownerId, name, expiresInDays: 30, ...extra })).seat;
  const runner = async (name, ownerId) => {
    const [, started] = await post(pairRoute.POST, null, { name });
    await runners.admitRunner({ workspaceId: 'w', actorId: ownerId, code: started.code });
    return started.credential;
  };

  const issue = await prisma.issue.create({ data: { workspaceId: 'w', projectId: A, title: 'Runner reports its room', issueKey: 'AA-1', reporterId: owner } });
  let count = 0;
  const run = async (of, extra = {}) => (await prisma.agentRun.create({ data: { workspaceId: 'w', issueId: issue.id, seatId: of?.id ?? null, userId: of?.userId ?? person,
    runner: 'test', generation: `g${++count}`, state: 'finished', outcome: 'done', endedAt: new Date(), ...extra } })).id;
  const programOf = async id => (await prisma.agentRun.findUniqueOrThrow({ where: { id } })).program;

  const dev = await seat('dev', 'developer', person, { byRunner: true });
  const rev = await seat('rev', 'reviewer', other, { byRunner: true });
  const hand = await seat('hand', 'developer', person);
  const gone = await seat('gone', 'security', person, { byRunner: true });
  const mac = await runner('mac', person), theirs = await runner('their-mac', other);
  const [, first] = await ask(mac, { have: [] });
  const have = first.seats.map(found => found.tokenId);

  await t.test('rule 5: a call without ended is answered as before', async () => {
    const [status, answer] = await ask(mac, { have });
    assert.equal(status, 200, JSON.stringify(answer));
    assert.deepEqual(Object.keys(answer), ['runner', 'seats']);
  });

  await t.test('rules 2 and 3: a run of a seat this runner works takes the program, and the first value stays', async () => {
    const mine = await run(dev);
    const [status, answer] = await ask(mac, { have, ended: [{ run: mine, program: '  Codex ' }] });
    assert.equal(status, 200, JSON.stringify(answer));
    assert.deepEqual(Object.keys(answer), ['runner', 'seats'], 'nothing was skipped, so the answer is as before');
    assert.equal(await programOf(mine), 'Codex');
    // A later entry for the same run is ignored, not an error.
    const [again, later] = await ask(mac, { have, ended: [{ run: mine, program: 'Claude Code' }] });
    assert.deepEqual([again, later.refusedRuns], [200, undefined]);
    assert.equal(await programOf(mine), 'Codex');
    // With a room report in the same call both are stored.
    const next = await run(dev);
    assert.equal((await ask(mac, { have, state: 'working', rooms: [{ seat: dev.id, room: 40, program: 'Claude Code' }], ended: [{ run: next, program: 'Claude Code' }] }))[0], 200);
    assert.equal(await programOf(next), 'Claude Code');
    assert.equal((await prisma.agentSeat.findUniqueOrThrow({ where: { id: dev.id } })).room, 40);
  });

  await t.test('rule 4: a run that is not this runner\'s, or does not exist, is skipped and named in refusedRuns, all alike', async () => {
    const mine = await run(dev);
    const archivedSeat = await seat('arch', 'reviewer', person, { byRunner: true });
    const others = [await run(rev), await run(hand), await run(gone), await run(null), 'cnosuchrun01'];
    await seats.retireSeat({ workspaceId: 'w', actorId: owner, seatId: gone.id });
    const [status, answer] = await ask(mac, { have, ended: [...others, mine].map(id => ({ run: id, program: 'Codex' })) });
    assert.equal(status, 200, JSON.stringify(answer));
    assert.deepEqual(answer.refusedRuns, others, 'another person\'s seat, a seat run by hand, a retired seat, a person\'s own run and no run at all read the same');
    assert.equal(answer.refused, undefined);
    assert.deepEqual(answer.seats.map(found => found.name), ['dev', 'arch']);
    for (const id of others.slice(0, 4)) assert.equal(await programOf(id), null);
    assert.equal(await programOf(mine), 'Codex');
    // The other person's runner sets its own run, and not this one.
    const [, their] = await ask(theirs, { have: [], ended: [{ run: others[0], program: 'Claude Code' }, { run: mine, program: 'Claude Code' }] });
    assert.deepEqual(their.refusedRuns, [mine]);
    assert.deepEqual([await programOf(others[0]), await programOf(mine)], ['Claude Code', 'Codex']);
    // A seat whose project is archived takes no program, also when it is archived while the call runs.
    const late = await run(archivedSeat);
    const find = prisma.agentSeat.findMany;
    prisma.agentSeat.findMany = async (...args) => {
      const found = await find.apply(prisma.agentSeat, args);
      if (args[0]?.where?.ownerId === person) await prisma.project.update({ where: { id: A }, data: { isArchived: true } });
      return found;
    };
    let racing;
    try { racing = await ask(mac, { have, ended: [{ run: late, program: 'Codex' }] }); } finally { prisma.agentSeat.findMany = find; }
    assert.deepEqual([racing[0], racing[1].refusedRuns], [200, [late]]);
    assert.equal(await programOf(late), null);
    await prisma.project.update({ where: { id: A }, data: { isArchived: false } });
    assert.equal((await ask(mac, { have, ended: [{ run: late, program: 'Codex' }] }))[1].refusedRuns, undefined);
    assert.equal(await programOf(late), 'Codex');
  });

  await t.test('rule 1: a value outside the contract is 400 invalid_request, and nothing of the call is stored', async () => {
    const mine = await run(dev);
    const room = (await prisma.agentSeat.findUniqueOrThrow({ where: { id: dev.id } })).room;
    const entry = extra => ({ have, rooms: [{ seat: dev.id, room: 5, program: 'Codex' }], ended: [{ run: mine, program: 'Codex', ...extra }] });
    const invalid = [
      entry({ run: '' }), entry({ run: 'x'.repeat(129) }), entry({ run: 7 }), entry({ run: undefined }),
      entry({ program: '' }), entry({ program: '   ' }), entry({ program: 'x'.repeat(65) }), entry({ program: 'Co\ndex' }), entry({ program: 'Cödex' }),
      entry({ program: undefined }), entry({ program: null }), entry({ minutes: 9 }),
      { have, ended: { run: mine, program: 'Codex' } }, { have, ended: [mine] }, { have, ended: null },
      { have, ended: [{ run: mine, program: 'Codex' }, { run: mine, program: 'Claude Code' }] },
      { have, ended: Array.from({ length: 101 }, (_, n) => ({ run: `crun${String(n).padStart(8, '0')}`, program: 'Codex' })) },
    ];
    for (const sent of invalid) {
      const [status, answer] = await ask(mac, sent);
      assert.deepEqual([status, answer.error], [400, 'invalid_request'], JSON.stringify(sent).slice(0, 200));
    }
    assert.equal(await programOf(mine), null);
    assert.equal((await prisma.agentSeat.findUniqueOrThrow({ where: { id: dev.id } })).room, room);
    // 100 entries is the most a call takes.
    const hundred = Array.from({ length: 99 }, (_, n) => ({ run: `crun${String(n).padStart(8, '0')}`, program: 'Codex' }));
    const [status, answer] = await ask(mac, { have, ended: [...hundred, { run: mine, program: 'Codex' }] });
    assert.deepEqual([status, answer.refusedRuns.length], [200, 99]);
    assert.equal(await programOf(mine), 'Codex');
  });

  await t.test('the issue shows beside each run whose allowance it used: with the program, the owner alone, or nothing without an owner', async () => {
    await prisma.issueActivity.deleteMany({});
    const withProgram = await run(dev, { program: 'Claude Code' }), byHand = await run(rev);
    const apiKeySeat = await seat('api', 'developer', undefined);
    assert.equal(apiKeySeat.ownerId, null);
    const noOwner = await run(apiKeySeat, { program: 'Codex' }), ownRun = await run(null);
    const entries = [[withProgram, 'AGENT_RUN_FINISHED'], [byHand, 'AGENT_RUN_LOST'], [noOwner, 'AGENT_RUN_FINISHED'], [ownRun, 'AGENT_RUN_FINISHED'], [withProgram, 'AGENT_RUN_LATE']];
    for (const [index, [runId, action]] of entries.entries()) {
      await prisma.issueActivity.create({ data: { action, itemType: 'ISSUE', itemId: issue.id, userId: person, workspaceId: 'w', projectId: A,
        details: JSON.stringify({ runId }), createdAt: new Date(Date.now() - (10 - index) * 1000) } });
    }
    const read = async () => {
      const reply = await activitiesRoute.GET(new Request(`https://collab.test/api/issues/${issue.id}/activities?limit=50`), { params: Promise.resolve({ issueId: issue.id }) });
      return [reply.status, await reply.json()];
    };
    // Every member who can read the issue sees the same, and never a percentage or a room figure.
    for (const reader of [person, other]) {
      signedIn = reader;
      const [status, body] = await read();
      assert.equal(status, 200, JSON.stringify(body));
      assert.deepEqual(body.reverse().map(row => [row.details.runId, row.action, row.allowance]), [
        [withProgram, 'AGENT_RUN_FINISHED', { owner: 'Bob', program: 'Claude Code' }],
        [byHand, 'AGENT_RUN_LOST', { owner: 'Cem', program: null }],
        [noOwner, 'AGENT_RUN_FINISHED', null],
        [ownRun, 'AGENT_RUN_FINISHED', null],
        [withProgram, 'AGENT_RUN_LATE', undefined],
      ]);
    }
    // Someone outside the workspace reads nothing.
    await prisma.user.create({ data: { id: 'coutside001', name: 'Out Side', email: 'out@example.test' } });
    signedIn = 'coutside001';
    assert.equal((await read())[0], 403);
  });
});
