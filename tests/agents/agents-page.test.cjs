const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { Prisma } = require('@prisma/client');
const { load } = require('../security/helpers.cjs');
const { seatsDatabase } = require('./seats-db.cjs');

const owner = 'cowner00001', member = 'cmember0001', stranger = 'cstranger01';
const A = 'cprojecta001', B = 'cprojectb001';
const ago = minutes => new Date(Date.now() - minutes * 60_000);
// What the loaded code returns was made in its own context: compared as data.
const plain = value => JSON.parse(JSON.stringify(value));

let db;
after(() => db?.stop());

test('the Agents page reads the seats a person may see, what each works on and what waits for it, and changes nothing', async t => {
  db = await seatsDatabase(async prisma => {
    await prisma.user.createMany({ data: [owner, member, stranger, 'cseatdev001', 'cseatrev001', 'cseatold001', 'cseatelse01'].map(id => ({ id, name: id })) });
    await prisma.workspace.create({ data: { id: 'w', name: 'w', slug: 'team', ownerId: owner } });
    await prisma.workspaceMember.create({ data: { workspaceId: 'w', userId: member } });
    await prisma.workspace.create({ data: { id: 'w2', name: 'w2', slug: 'elsewhere', ownerId: stranger } });
    for (const [id, workspaceId, name] of [[A, 'w', 'Alpha'], [B, 'w', 'Beta'], ['cprojectc001', 'w2', 'Gamma']]) {
      await prisma.project.create({ data: { id, workspaceId, name, slug: id, issuePrefix: name.slice(0, 2).toUpperCase() } });
      await prisma.projectStatus.createMany({ data: ['to_do', 'in_review', 'done'].map((status, order) => ({ id: `${id}-${status}`, projectId: id, name: status, displayName: status, order, isFinal: status === 'done' })) });
    }
  });
  const raw = db.prisma;
  // The application's client, so Trash is hidden here as it is in production.
  const prisma = raw.$extends(load('src/lib/issue-visibility.ts').issueVisibilityExtension(Prisma.dmmf.datamodel.models));
  const finder = load('src/lib/issue-finder.ts', { '@/lib/prisma': { prisma } });
  // The real module: the inbox read takes the rule for "not done" and the lead's limits from it.
  const handoffs = load('src/lib/agent-handoffs.ts', { 'node:crypto': require('node:crypto'), 'node:buffer': require('node:buffer'), zod: require('zod'),
    '@/lib/prisma': { prisma }, '@/lib/issue-finder': finder, '@/lib/oauth-scopes': load('src/lib/oauth-scopes.ts') }, { Date });
  const seats = load('src/lib/agent-seats.ts', { '@/lib/prisma': { prisma }, '@/lib/agent-handoffs': handoffs, '@/lib/agent-tokens': { AGENT_APP_SLUG: 'collab-agent' },
    '@/lib/issue-assignee': load('src/lib/issue-assignee.ts', { './agent-handoffs': handoffs }) }, { Date });
  const runs = load('src/lib/agent-runs.ts', { zod: require('zod'), '@/lib/prisma': { prisma }, '@/lib/agent-seats': seats, '@/lib/issue-finder': finder,
    '@/lib/permissions': {}, '@/lib/agent-tokens': { AGENT_APP_SLUG: 'collab-agent' } }, { Date });
  const page = load('src/lib/agents-page.ts', { '@/lib/prisma': { prisma }, '@/lib/post-access': load('src/lib/post-access.ts'), '@/lib/issue-finder': finder, '@/lib/agent-runs': runs }, { Date });
  let user = member;
  const route = load('src/app/api/workspaces/[workspaceId]/agent-seats/waiting/route.ts', { 'next/server': { NextResponse: Response },
    '@/lib/request-session': { getServerSession: async () => user ? { user: { id: user } } : null }, '@/lib/auth-options': { authOptions: {} }, '@/lib/agents-page': page });
  const waiting = async workspaceId => { const reply = await route.GET(new Request('https://collab.test/api'), { params: Promise.resolve({ workspaceId }) }); return [reply.status, await reply.json(), reply.headers.get('cache-control')]; };

  await raw.project.update({ where: { id: A }, data: { agentMode: 'seats' } });
  const seat = (id, userId, projectId, role, data = {}) => raw.agentSeat.create({ data: { id, workspaceId: projectId === 'cprojectc001' ? 'w2' : 'w', projectId, role, userId, name: id, isDefault: true, ...data } });
  const dev = await seat('dev-a', 'cseatdev001', A, 'developer');
  await seat('rev-a', 'cseatrev001', A, 'reviewer');
  await seat('old-a', 'cseatold001', A, 'release', { retiredAt: ago(5) });
  await seat('dev-c', 'cseatelse01', 'cprojectc001', 'developer');
  let count = 0;
  const issue = async (userId, status = 'to_do', data = {}) => {
    const made = await raw.issue.create({ data: { workspaceId: 'w', projectId: A, title: `Issue ${++count}`, issueKey: `AL-${count}`, statusId: `${A}-${status}`, assigneeId: userId, createdAt: ago(900), ...data } });
    if (userId) await raw.issueAssignee.create({ data: { issueId: made.id, userId, role: 'ASSIGNEE', status: 'APPROVED', assignedAt: ago(600), approvedAt: ago(600) } });
    return made;
  };
  const run = (target, data) => raw.agentRun.create({ data: { workspaceId: 'w', issueId: target.id, seatId: dev.id, userId: dev.userId, runner: 'test', generation: 'g1', startedAt: ago(90), ...data } });
  const fresh = await issue(dev.userId, 'to_do', { priority: 'low' });
  const resumed = await issue(dev.userId, 'to_do', { priority: 'low' });
  await run(resumed, { state: 'stopped', endedAt: ago(60) });
  const busy = await issue(dev.userId, 'to_do', { issueKey: null });
  const open = await run(busy, { state: 'running', leaseUntil: ago(-1), startedAt: ago(10) });
  // In review with nothing new since its run, done, trashed, unassigned and a person's own: none of them waits for a seat.
  await run(await issue(dev.userId, 'in_review'), { state: 'finished', outcome: 'in_review', endedAt: ago(30) });
  await issue(dev.userId, 'done'); await issue(dev.userId, 'to_do', { deletedAt: new Date() }); await issue(null); await issue(member);

  await t.test('a member sees the seats of the workspace, not retired ones and not another workspace\'s', async () => {
    const view = await page.readSeats(member, 'team');
    assert.deepEqual(view.workspace, { id: 'w', slug: 'team' });
    assert.deepEqual(view.seats.map(row => [row.id, row.role, row.project, row.isDefault]), [['dev-a', 'developer', 'Alpha', true], ['rev-a', 'reviewer', 'Alpha', true]]);
    assert.deepEqual(Object.keys(view.seats[0]).sort(), ['id', 'isDefault', 'name', 'project', 'role', 'waiting', 'working']);
    assert.deepEqual(plain(view.seats[0].working), [{ id: open.id, issueId: busy.id, issueKey: null, title: busy.title, since: open.startedAt.toISOString(), lost: false }]);
    // What waits is the seat's own inbox: the issue to resume first, then the one never started.
    assert.deepEqual(view.seats[0].waiting.map(item => [item.issueKey, item.reason]), [[resumed.issueKey, 'resume'], [fresh.issueKey, 'assigned']]);
    assert.deepEqual(plain(view.seats[0].waiting), plain((await runs.seatInbox({ user: { id: dev.userId }, workspace: { id: 'w' } })).items));
    assert.deepEqual(plain([view.seats[1].working, view.seats[1].waiting]), [[], []]);
    assert.deepEqual((await page.readSeats(owner, 'w')).seats.map(row => row.id), ['dev-a', 'rev-a']);
    assert.deepEqual((await page.readSeats(stranger, 'elsewhere')).seats.map(row => [row.id, row.waiting.length]), [['dev-c', 0]]);
  });

  await t.test('someone outside the workspace reads nothing, by slug or by id', async () => {
    for (const workspace of ['team', 'w', 'missing']) assert.equal(await page.readSeats(stranger, workspace), null);
    assert.equal(await page.readSeats('', 'team'), null);
    await raw.workspaceMember.updateMany({ where: { userId: member }, data: { status: false } });
    assert.equal(await page.readSeats(member, 'team'), null);
    await raw.workspaceMember.updateMany({ where: { userId: member }, data: { status: true } });
  });

  await t.test('looking marks no run lost and gives no sign of life; a lapsed lease is shown as lost', async () => {
    await raw.agentSeat.update({ where: { id: dev.id }, data: { lastSeenAt: null } });
    await raw.agentRun.update({ where: { id: open.id }, data: { leaseUntil: ago(5) } });
    // The seat's runner went on to the next issue: the lost run stays open beside the new one, and both are shown.
    const next = await run(await issue(dev.userId), { state: 'running', leaseUntil: ago(-1), startedAt: ago(2) });
    const view = await page.readSeats(member, 'team');
    assert.deepEqual(view.seats[0].working.map(row => [row.id, row.lost]), [[next.id, false], [open.id, true]]);
    assert.equal(view.seats[0].waiting.length, 2);
    assert.equal((await raw.agentSeat.findUnique({ where: { id: dev.id } })).lastSeenAt, null);
    assert.equal((await raw.agentRun.findUnique({ where: { id: open.id } })).state, 'running');
    assert.equal(await raw.issueActivity.count({ where: { action: 'AGENT_RUN_LOST' } }), 0);
  });

  await t.test('the number in the menu is the sum of what waits, for who may see it', async () => {
    assert.deepEqual(await waiting('team'), [200, { waiting: 2 }, 'no-store']);
    assert.deepEqual(await waiting('w'), [200, { waiting: 2 }, 'no-store']);
    user = stranger;
    assert.deepEqual((await waiting('team')).slice(0, 2), [404, { error: 'Not found' }]);
    assert.deepEqual(await waiting('elsewhere'), [200, { waiting: 0 }, 'no-store']);
    user = null;
    assert.deepEqual((await waiting('team')).slice(0, 2), [401, { error: 'Unauthorized' }]);
  });

  await t.test('"Handoffs (old)" lasts until the last project that is not archived uses seats', async () => {
    assert.equal(await page.usesHandoffs('w'), true);
    await raw.project.update({ where: { id: B }, data: { isArchived: true } });
    assert.equal(await page.usesHandoffs('w'), false);
    await raw.project.update({ where: { id: B }, data: { isArchived: false, agentMode: 'seats' } });
    assert.equal(await page.usesHandoffs('w'), false);
    assert.equal(await page.usesHandoffs('w2'), true);
  });

  await t.test('a lead seat\'s issue that waits for its children is shown when one of them is done', async () => {
    await raw.user.create({ data: { id: 'cseatlead01', name: 'cseatlead01' } });
    const lead = await seat('lead-a', 'cseatlead01', A, 'lead');
    const epic = await issue(lead.userId);
    await run(epic, { seatId: lead.id, userId: lead.userId, state: 'finished', outcome: 'blocked', endedAt: ago(60) });
    const waits = async () => (await page.readSeats(member, 'team')).seats.find(row => row.id === 'lead-a').waiting.map(item => [item.issueKey, item.reason]);
    assert.deepEqual(await waits(), []);
    await issue(dev.userId, 'done', { parentId: epic.id });
    assert.deepEqual(await waits(), [[epic.issueKey, 'child_done']]);
  });

  await t.test('the page and menu count all waiting issues while the seat inbox remains limited to 50', async () => {
    for (let i = 0; i < 50; i++) await issue(dev.userId);
    const view = await page.readSeats(member, 'team');
    assert.equal(view.seats.find(row => row.id === dev.id).waiting.length, 52);
    assert.equal((await runs.seatInbox({ user: { id: dev.userId }, workspace: { id: 'w' } })).items.length, 50);
    user = member;
    assert.deepEqual((await waiting('team')).slice(0, 2), [200, { waiting: 53 }]);
  });
});
