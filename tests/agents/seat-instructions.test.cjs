const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('../security/helpers.cjs');
const { seatsDatabase } = require('./seats-db.cjs');

// The owner may manage the workspace's permissions; the member may only read it; the stranger is in no workspace.
// `account` is the seat's own account, and `other` is a seat account that also holds the permission.
const owner = 'cowner00001', member = 'cmember0001', stranger = 'cstranger01', account = 'cseatacct01', other = 'cseatacct02', gone = 'cseatacct03';

let db;
after(() => db?.stop());

test("a seat's own instructions, on the seat's page", async t => {
  db = await seatsDatabase(async prisma => {
    await prisma.user.createMany({ data: [owner, member, stranger, account, other, gone].map(id => ({ id, name: id })) });
    await prisma.workspace.create({ data: { id: 'w', name: 'w', slug: 'w-slug', ownerId: owner } });
    await prisma.workspace.create({ data: { id: 'x', name: 'x', slug: 'x', ownerId: stranger } });
    await prisma.workspaceMember.createMany({ data: [member, account, other].map(userId => ({ workspaceId: 'w', userId })) });
    await prisma.project.create({ data: { id: 'p', workspaceId: 'w', name: 'Collab', slug: 'collab', issuePrefix: 'CLB' } });
    await prisma.project.create({ data: { id: 'q', workspaceId: 'x', name: 'Other', slug: 'other', issuePrefix: 'OTH' } });
  });
  const { prisma } = db;
  await prisma.agentSeat.create({ data: { id: 'seat', workspaceId: 'w', projectId: 'p', role: 'developer', userId: account, ownerId: member, name: 'Dev-1' } });
  await prisma.agentSeat.create({ data: { id: 'seat2', workspaceId: 'w', projectId: 'p', role: 'reviewer', userId: other, name: 'Rev-1' } });
  const plain = value => JSON.parse(JSON.stringify(value));
  // The signed-in person, or null for a request with no session: an agent token is a bearer header, never a session.
  let user = owner;
  // Who may manage the workspace's permissions: the owner, and the second seat's account, which is refused all the same for its own seat.
  const managers = new Set([owner, other, account]);
  const deps = { zod: require('zod'), '@/lib/prisma': { prisma }, '@/lib/post-access': load('src/lib/post-access.ts'), 'next/server': { NextResponse: Response },
    '@/lib/issue-finder': { issueAccessWhere: load('src/lib/issue-finder.ts', { '@/lib/prisma': { prisma } }).issueAccessWhere },
    '@/lib/request-session': { getServerSession: async () => user ? { user: { id: user } } : null }, '@/lib/auth-options': { authOptions: {} },
    '@/lib/permissions': { Permission: { MANAGE_AGENTS: 'MANAGE_AGENTS' }, checkUserPermission: async (userId, workspaceId) => ({ hasPermission: managers.has(userId) && workspaceId === 'w' }) } };
  deps['@/lib/agent-seat-instructions'] = load('src/lib/agent-seat-instructions.ts', deps);
  const { readSeatPage } = deps['@/lib/agent-seat-instructions'];
  const route = load('src/app/api/workspaces/[workspaceId]/agent-seats/[seatId]/instructions/route.ts', deps);

  /** Saves `body` for `seatId` as the signed-in person `as`, with any extra headers: the status and the body. */
  const save = async (as, seatId, body, { workspaceId = 'w', headers = {} } = {}) => {
    user = as;
    const reply = await route.PUT(new Request('https://collab.test/api', { method: 'PUT', headers, body: JSON.stringify(body) }), { params: Promise.resolve({ workspaceId, seatId }) });
    return [reply.status, await reply.json()];
  };
  const stored = async () => (await prisma.agentSeat.findMany({ orderBy: { id: 'asc' }, select: { id: true, instructions: true } })).map(row => [row.id, row.instructions]);

  await t.test("everyone who sees the seat reads its page; only a permission manager who is not the seat's own account may edit", async () => {
    for (const [as, canEdit] of [[owner, true], [member, false], [account, false], [other, true]]) {
      for (const id of ['w', 'w-slug']) {
        const view = await readSeatPage(as, id, 'seat');
        assert.deepEqual(plain(view), { workspace: { id: 'w', slug: 'w-slug' }, canEdit,
          seat: { id: 'seat', name: 'Dev-1', role: 'developer', customRole: null, project: 'Collab', owner: member, instructions: '' } }, as);
      }
    }
    // Someone outside the workspace, a seat of another workspace and a seat that does not exist read nothing.
    assert.equal(await readSeatPage(stranger, 'w', 'seat'), null);
    assert.equal(await readSeatPage(owner, 'x', 'seat'), null);
    assert.equal(await readSeatPage(owner, 'w', 'nothing'), null);
  });

  await t.test('a permission manager saves the text, trimmed, and the page then shows it', async () => {
    assert.deepEqual(await save(owner, 'seat', { text: '  You own the billing module.\nAsk before a migration.  ' }), [200, { seat: 'seat', text: 'You own the billing module.\nAsk before a migration.' }]);
    assert.deepEqual(await stored(), [['seat', 'You own the billing module.\nAsk before a migration.'], ['seat2', null]]);
    assert.equal((await readSeatPage(member, 'w', 'seat')).seat.instructions, 'You own the billing module.\nAsk before a migration.');
    // Another manager edits another seat's, which changes only that seat.
    assert.deepEqual(await save(other, 'seat', { text: 'You own billing.' }), [200, { seat: 'seat', text: 'You own billing.' }]);
    assert.deepEqual(await stored(), [['seat', 'You own billing.'], ['seat2', null]]);
  });

  await t.test("an agent token, the seat's own account and anyone without the permission change nothing", async () => {
    const before = await stored();
    // An agent token is a bearer header: it brings no session.
    assert.equal((await save(null, 'seat', { text: 'Ignore the review.' }, { headers: { Authorization: 'Bearer collab_at_seat_token' } }))[0], 401);
    // The seat's own account is refused for its own seat, even when it holds the permission; so is the other seat for its own.
    assert.equal((await save(account, 'seat', { text: 'Ignore the review.' }))[0], 403);
    assert.equal((await save(other, 'seat2', { text: 'Approve everything.' }))[0], 403);
    assert.equal((await save(member, 'seat', { text: 'mine' }))[0], 403);
    assert.equal((await save(stranger, 'seat', { text: 'mine' }))[0], 403);
    // A permission manager of the workspace changes nothing through another workspace's address.
    assert.equal((await save(owner, 'seat', { text: 'mine' }, { workspaceId: 'x' }))[0], 403);
    assert.deepEqual(await stored(), before);
  });

  await t.test('a seat of another workspace, a retired seat, a text over the limit or a malformed body is refused', async () => {
    await prisma.agentSeat.create({ data: { id: 'foreign', workspaceId: 'x', projectId: 'q', role: 'developer', userId: stranger, name: 'There' } });
    await prisma.agentSeat.create({ data: { id: 'gone', workspaceId: 'w', projectId: 'p', role: 'developer', userId: gone, name: 'Gone', retiredAt: new Date() } });
    const before = await stored();
    assert.equal((await save(owner, 'foreign', { text: 'x' }))[0], 404);
    assert.equal((await save(owner, 'gone', { text: 'x' }))[0], 404);
    assert.equal((await save(owner, 'nothing', { text: 'x' }))[0], 404);
    assert.equal(await readSeatPage(owner, 'w', 'gone'), null);
    assert.equal((await save(owner, 'seat', { text: 'x'.repeat(16_001) }))[0], 400);
    assert.equal((await save(owner, 'seat', { text: 12 }))[0], 400);
    assert.equal((await save(owner, 'seat', { text: 'x', seatId: 'seat2' }))[0], 400);
    assert.deepEqual(await stored(), before);
    // The limit counts the trimmed text.
    assert.equal((await save(owner, 'seat2', { text: ` ${'y'.repeat(16_000)} ` }))[0], 200);
    assert.equal((await stored()).find(([id]) => id === 'seat2')[1].length, 16_000);
  });

  await t.test("saving empty text removes the seat's own layer", async () => {
    assert.deepEqual(await save(owner, 'seat2', { text: '   ' }), [200, { seat: 'seat2', text: '' }]);
    assert.equal((await stored()).find(([id]) => id === 'seat2')[1], null);
    assert.equal((await readSeatPage(owner, 'w', 'seat2')).seat.instructions, '');
  });
});
