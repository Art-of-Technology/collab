const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('../security/helpers.cjs');
const { seatsDatabase } = require('./seats-db.cjs');

// CLB-1185: a seat that belongs to someone else follows the rank rule, besides MANAGE_AGENTS.
// One person per level: the primary owner, two Owners, two Admins, a standard member, a standard member whose own role
// holds MANAGE_AGENTS, a platform admin who is a standard member, and a member who was switched off.
const P = 'cprimary001', O = 'cowner00001', O2 = 'cowner00002', A = 'cadmin00001', A2 = 'cadmin00002', M = 'cmember0001',
  S = 'cstandard01', X = 'csysadmin01', G = 'cgone000001';
const REFUSAL = 'A seat of someone at or above your own level is managed by someone above them';
const scopes = ['issues:read', 'issues:write', 'user:read'];

let db;
after(() => db?.stop());

let fixture;
async function setUp() {
  if (fixture) return fixture;
  db = await seatsDatabase(async prisma => {
    await prisma.user.createMany({ data: [P, O, O2, A, A2, M, S, X, G].map(id => ({ id, name: id, email: `${id}@example.test`, ...(id === X && { role: 'SYSTEM_ADMIN' }) })) });
    await prisma.workspace.create({ data: { id: 'w', name: 'w', slug: 'w', ownerId: P } });
    await prisma.workspace.create({ data: { id: 'w2', name: 'w2', slug: 'w2', ownerId: P } });
    await prisma.workspaceMember.createMany({ data: [[O, 'OWNER'], [O2, 'OWNER'], [A, 'ADMIN'], [A2, 'ADMIN'], [M, 'MEMBER'], [S, 'Agent keeper'], [X, 'MEMBER'], [G, 'MEMBER', false]]
      .map(([userId, role, status = true]) => ({ workspaceId: 'w', userId, role, status })) });
    await prisma.project.create({ data: { id: 'p', workspaceId: 'w', name: 'Collab', slug: 'collab', issuePrefix: 'CLB' } });
    await prisma.app.create({ data: { id: 'agent-app', name: 'collab-agent', slug: 'collab-agent', publisherId: 'system', status: 'PUBLISHED', visibility: 'PRIVATE', isSystemApp: true,
      scopes: { create: scopes.map(scope => ({ scope })) } } });
  });
  const { prisma } = db;
  // Tokens are stored readable here: who may act is under test, not encryption.
  const crypto = { encryptToken: async value => Buffer.from(value), decryptToken: async data => Buffer.from(data).toString(), getEncryptionKey: () => {} };
  const zod = require('zod');
  const handoffs = load('src/lib/agent-handoffs.ts', { 'node:crypto': require('node:crypto'), 'node:buffer': require('node:buffer'), zod,
    '@/lib/prisma': { prisma }, '@/lib/issue-finder': load('src/lib/issue-finder.ts', { '@/lib/prisma': { prisma } }), '@/lib/oauth-scopes': load('src/lib/oauth-scopes.ts') }, { Date });
  const tokens = load('src/lib/agent-tokens.ts', { crypto: require('node:crypto'), '@/lib/prisma': { prisma }, '@/lib/apps/crypto': crypto }, { Buffer, Date });
  const assignee = load('src/lib/issue-assignee.ts', { './agent-handoffs': handoffs });
  const seats = load('src/lib/agent-seats.ts', { '@/lib/prisma': { prisma }, '@/lib/agent-handoffs': handoffs, '@/lib/agent-tokens': tokens, '@/lib/issue-assignee': assignee }, { Date });
  // Everyone here but the plain member and the switched-off one holds MANAGE_AGENTS in both workspaces; a platform admin passes the check anywhere, as today.
  const managers = new Set([P, O, O2, A, A2, S, X]);
  let user = null;
  const deps = { zod, 'next/server': { NextResponse: Response }, '@/lib/prisma': { prisma }, '@/lib/agent-seats': seats, '@/lib/agent-tokens': tokens,
    '@/lib/post-access': load('src/lib/post-access.ts'), '@/lib/issue-finder': load('src/lib/issue-finder.ts', { '@/lib/prisma': { prisma } }),
    '@/lib/request-session': { getServerSession: async () => user && { user: { id: user } } }, '@/lib/auth-options': { authOptions: {} },
    '@/lib/permissions': { Permission: { MANAGE_AGENTS: 'MANAGE_AGENTS' }, checkUserPermission: async (userId, workspaceId) => ({ hasPermission: managers.has(userId) && ['w', 'w2'].includes(workspaceId) }) } };
  deps['@/lib/agent-seat-instructions'] = load('src/lib/agent-seat-instructions.ts', deps);
  const routes = {
    seats: load('src/app/api/workspaces/[workspaceId]/agent-seats/route.ts', deps),
    seat: load('src/app/api/workspaces/[workspaceId]/agent-seats/[seatId]/route.ts', deps),
    instructions: load('src/app/api/workspaces/[workspaceId]/agent-seats/[seatId]/instructions/route.ts', deps),
    tokens: load('src/app/api/workspaces/[workspaceId]/agent-tokens/route.ts', deps),
    token: load('src/app/api/workspaces/[workspaceId]/agent-tokens/[tokenId]/route.ts', deps),
  };
  const call = async (as, handler, method, params, body) => {
    user = as;
    const reply = await handler(new Request('https://collab.test/api', { method, headers: { 'Content-Type': 'application/json' }, ...(body && { body: JSON.stringify(body) }) }),
      { params: Promise.resolve({ workspaceId: 'w', ...params }) });
    return [reply.status, await reply.json()];
  };
  let made = 0;
  /** A seat run by hand for `person` (null for none), with one token, set up by the primary owner. */
  const seatFor = async person => {
    const name = `seat-${++made}`;
    const minted = await tokens.createAgentToken({ workspaceId: 'w', actorId: P, name, access: 'write', expiresInDays: 30 });
    const { userId } = await prisma.appToken.findUniqueOrThrow({ where: { id: minted.id } });
    const seat = await prisma.agentSeat.create({ data: { workspaceId: 'w', projectId: 'p', role: 'developer', userId, ownerId: person, name } });
    return { id: seat.id, name, tokenId: minted.id };
  };
  /** Each path that acts on an existing seat or its account, in an order that leaves the next one something to act on: [path, status]. */
  const actOn = async (as, seat) => [
    ['instructions', (await call(as, routes.instructions.PUT, 'PUT', { seatId: seat.id }, { text: `from ${as}` }))],
    ['token', (await call(as, routes.tokens.POST, 'POST', {}, { name: seat.name, access: 'write' }))],
    ['access', (await call(as, routes.token.PATCH, 'PATCH', { tokenId: seat.tokenId }, { workspaceId: 'w2', allowed: true }))],
    ['revoke', (await call(as, routes.token.DELETE, 'DELETE', { tokenId: seat.tokenId }))],
    ['retire', (await call(as, routes.seat.DELETE, 'DELETE', { seatId: seat.id }))],
  ];
  const create = (as, ownerId) => call(as, routes.seats.POST, 'POST', {}, { name: `new-${++made}`, projectId: 'p', role: 'developer', ownerId });
  /** Everything a call could write. */
  const written = async () => JSON.stringify(await Promise.all([
    prisma.agentSeat.findMany({ orderBy: { id: 'asc' }, select: { id: true, ownerId: true, retiredAt: true, instructions: true } }),
    prisma.appToken.findMany({ orderBy: { id: 'asc' }, select: { id: true, isRevoked: true } }),
    prisma.workspaceMember.findMany({ orderBy: [{ workspaceId: 'asc' }, { userId: 'asc' }], select: { userId: true, workspaceId: true, status: true, role: true } }),
    prisma.appAuditLog.count(), prisma.user.count(),
  ]));
  const passed = { instructions: 200, token: 201, access: 200, revoke: 200, retire: 200 };
  // Whether the seat's page offers the viewer an edit box: what saving would answer.
  const canEdit = async (as, seat) => (await deps['@/lib/agent-seat-instructions'].readSeatPage(as, 'w', seat.id)).canEdit;
  fixture = { prisma, seatFor, actOn, create, written, passed, call, routes, canEdit };
  return fixture;
}

// Whose seats each actor acts on, among the people who are not themself.
const BELOW = { [P]: [O2, A2, M, G], [O]: [A2, M, G], [A]: [M, G], [S]: [], [X]: [P, O2, A2, M, G] };
const PEOPLE = [P, O2, A2, M, G];

test('a seat that belongs to someone else is made, instructed, retired and given or denied tokens only by someone above that person', async () => {
  const { seatFor, actOn, create, written, passed, canEdit } = await setUp();
  // The seat's page offers the edit box only where saving passes: an Admin on an Owner's seat and an Owner on the primary owner's do not.
  assert.equal(await canEdit(A, await seatFor(O2)), false);
  assert.equal(await canEdit(A, await seatFor(M)), true);
  assert.equal(await canEdit(O, await seatFor(P)), false);
  for (const [actor, below] of Object.entries(BELOW)) {
    for (const person of PEOPLE.filter(id => id !== actor)) {
      const label = `${actor} on ${person}'s seat`;
      const seat = await seatFor(person);
      if (below.includes(person)) {
        assert.deepEqual((await actOn(actor, seat)).map(([path, [status]]) => [path, status]), Object.entries(passed), label);
      } else {
        const before = await written();
        for (const [path, [status, body]] of await actOn(actor, seat)) assert.deepEqual([path, status, body.error], [path, 403, REFUSAL], label);
        assert.equal(await written(), before, `${label}: nothing written`);
      }
      // Making one for that person: a switched-off person stays refused as today, by the existing active-member check.
      const [status, body] = await create(actor, person);
      if (!below.includes(person)) assert.deepEqual([status, body.error], [403, REFUSAL], `${actor} makes one for ${person}`);
      else if (person === G) assert.deepEqual([status, body.code], [400, 'owner_not_found'], `${actor} makes one for ${person}`);
      else assert.equal(status, 201, `${actor} makes one for ${person}`);
    }
  }
});

test("a person's own seats and seats with no owner work as before", async () => {
  const { seatFor, actOn, create, passed, canEdit } = await setUp();
  for (const actor of Object.keys(BELOW)) {
    for (const person of [actor, null]) {
      assert.equal(await canEdit(actor, await seatFor(person)), true, `${actor} sees an edit box on ${person}'s seat`);
      assert.deepEqual((await actOn(actor, await seatFor(person))).map(([path, [status]]) => [path, status]), Object.entries(passed), `${actor} on ${person}`);
      assert.equal((await create(actor, person))[0], 201, `${actor} makes one for ${person}`);
    }
  }
});

test('a refused call writes nothing, and a platform admin keeps today\'s answer', async () => {
  const { prisma, seatFor, actOn, create, written, passed, call, routes, canEdit } = await setUp();
  // An Admin on the primary owner's seat: refused on every path, and not one row changes, the audit log included.
  const theirs = await seatFor(P);
  const before = await written();
  const audit = await prisma.appAuditLog.count();
  for (const [path, [status]] of await actOn(A, theirs)) assert.equal(status, 403, path);
  assert.equal((await create(A, P))[0], 403);
  assert.equal(await written(), before);
  assert.equal(await prisma.appAuditLog.count(), audit);
  // A platform admin who is a standard member passes on the primary owner's seat, as today, and its page offers the edit box.
  assert.equal(await canEdit(X, await seatFor(P)), true);
  assert.deepEqual((await actOn(X, await seatFor(P))).map(([path, [status]]) => [path, status]), Object.entries(passed));
  assert.equal((await create(X, P))[0], 201);

  const afterRead = async (model, method, change, action) => {
    const read = model[method];
    let once = false;
    model[method] = async (...args) => {
      const rows = await read.apply(model, args);
      if (!once && (once = true)) await change(...args);
      return rows;
    };
    try { return await action(); } finally { model[method] = read; }
  };
  // Two Owners, levels read in one batch, both demoted right after: at no instant was the actor above the seat's person.
  const owners = { workspaceId: 'w', userId: { in: [O, O2] } };
  const peer = await seatFor(O2);
  const refusedBefore = await written();
  for (const [path, act] of [
    ['instructions', () => call(O, routes.instructions.PUT, 'PUT', { seatId: peer.id }, { text: 'x' })],
    ['revoke', () => call(O, routes.token.DELETE, 'DELETE', { tokenId: peer.tokenId })],
    ['retire', () => call(O, routes.seat.DELETE, 'DELETE', { seatId: peer.id })],
    ['token', () => call(O, routes.tokens.POST, 'POST', {}, { name: peer.name, access: 'write' })],
  ]) {
    const [status] = await afterRead(prisma, '$transaction', batch => Array.isArray(batch) && prisma.workspaceMember.updateMany({ where: owners, data: { role: 'ADMIN' } }), act);
    assert.equal(status, 403, path);
    await prisma.workspaceMember.updateMany({ where: owners, data: { role: 'OWNER' } });
  }
  assert.equal(await written(), refusedBefore);

  // The seat's person changes between the read and the write: the seat reads as not found and nothing is written.
  for (const [path, model, method, act] of [
    ['retire', prisma.agentSeat, 'findFirst', seat => call(O, routes.seat.DELETE, 'DELETE', { seatId: seat.id })],
    ['instructions', prisma.agentSeat, 'findFirst', seat => call(O, routes.instructions.PUT, 'PUT', { seatId: seat.id }, { text: 'x' })],
    ['revoke', prisma.agentSeat, 'findUnique', seat => call(O, routes.token.DELETE, 'DELETE', { tokenId: seat.tokenId })],
  ]) {
    const seat = await seatFor(M);
    const unchanged = await written();
    const [status] = await afterRead(model, method, () => prisma.agentSeat.update({ where: { id: seat.id }, data: { ownerId: O2 } }), () => act(seat));
    assert.equal(status, 404, path);
    await prisma.agentSeat.update({ where: { id: seat.id }, data: { ownerId: M } });
    assert.equal(await written(), unchanged, path);
  }
});
