const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { Prisma } = require('@prisma/client');
const { load } = require('../security/helpers.cjs');
const { seatsDatabase } = require('./seats-db.cjs');

// CLB-614: a seat may have no project (its scope is the whole workspace, CLB-613). The database holds at most one default
// seat per role among a workspace's seats without a project, and such a seat changes nothing for the project seats.
const owner = 'cowner00001', A = 'cprojecta001', C = 'cprojectc001';
const accounts = ['cseatdev001', 'cseatrev001', 'cwsdev00001', 'cwsdev00002', 'cwsdev00003', 'cwsrev00001', 'cwsdevw2001'];
const plain = value => JSON.parse(JSON.stringify(value));

let db;
after(() => db?.stop());

test('a seat without a project', async t => {
  db = await seatsDatabase(async prisma => {
    await prisma.user.createMany({ data: [owner, ...accounts].map(id => ({ id, name: id })) });
    await prisma.workspace.create({ data: { id: 'w', name: 'w', slug: 'team', ownerId: owner } });
    await prisma.workspace.create({ data: { id: 'w2', name: 'w2', slug: 'elsewhere', ownerId: owner } });
    for (const [id, workspaceId] of [[A, 'w'], [C, 'w2']]) {
      await prisma.project.create({ data: { id, workspaceId, name: id, slug: id, issuePrefix: id.slice(-4, -2).toUpperCase(), agentMode: 'seats' } });
      await prisma.projectStatus.createMany({ data: ['to_do', 'done'].map((name, order) => ({ id: `${id}-${name}`, projectId: id, name, displayName: name, order, isFinal: name === 'done' })) });
    }
  });
  const raw = db.prisma;
  const prisma = raw.$extends(load('src/lib/issue-visibility.ts').issueVisibilityExtension(Prisma.dmmf.datamodel.models));
  const finder = load('src/lib/issue-finder.ts', { '@/lib/prisma': { prisma } });
  const handoffs = load('src/lib/agent-handoffs.ts', { 'node:crypto': require('node:crypto'), 'node:buffer': require('node:buffer'), zod: require('zod'),
    '@/lib/prisma': { prisma }, '@/lib/issue-finder': finder, '@/lib/oauth-scopes': load('src/lib/oauth-scopes.ts') }, { Date });
  const seats = load('src/lib/agent-seats.ts', { '@/lib/prisma': { prisma }, '@/lib/agent-handoffs': handoffs, '@/lib/agent-tokens': { AGENT_APP_SLUG: 'collab-agent' },
    '@/lib/issue-assignee': load('src/lib/issue-assignee.ts', { './agent-handoffs': handoffs }),
    // Every seat here has no owner, which the rank rule passes.
    '@/lib/workspace-authority': { SEAT_RANK_REFUSAL: 'outranked', seatOwnerAccess: async () => () => 'pass' } }, { Date });
  const runs = load('src/lib/agent-runs.ts', { zod: require('zod'), '@/lib/prisma': { prisma }, '@/lib/agent-seats': seats, '@/lib/issue-finder': finder,
    '@/lib/permissions': {}, '@/lib/agent-tokens': { AGENT_APP_SLUG: 'collab-agent' } }, { Date });
  const runners = load('src/lib/agent-runners.ts', { crypto: require('node:crypto'), '@/lib/prisma': { prisma }, '@/lib/agent-handoffs': handoffs,
    '@/lib/agent-tokens': { AGENT_APP_SLUG: 'collab-agent' } }, { Date });
  const page = load('src/lib/agents-page.ts', { '@/lib/prisma': { prisma }, '@/lib/post-access': load('src/lib/post-access.ts'), '@/lib/issue-finder': finder,
    '@/lib/agent-runs': runs, '@/lib/agent-runners': runners, '@/lib/agent-seats': seats,
    '@/lib/permissions': load('src/lib/permissions.ts', { './prisma': { prisma } }) }, { Date });

  const seat = (id, userId, projectId, role, data = {}) => raw.agentSeat.create({ data: { id, workspaceId: projectId === C ? 'w2' : 'w', projectId, role, userId, name: id, ...data } });
  const inWorkspace = (id, userId, role, data = {}) => raw.agentSeat.create({ data: { id, workspaceId: 'w', projectId: null, role, userId, name: id, ...data } });
  await seat('dev-a', 'cseatdev001', A, 'developer', { isDefault: true });
  await seat('rev-a', 'cseatrev001', A, 'reviewer', { isDefault: true });
  const issue = await raw.issue.create({ data: { workspaceId: 'w', projectId: A, title: 'Work', issueKey: 'AL-1', statusId: `${A}-to_do`, assigneeId: 'cseatdev001' } });
  await raw.issueAssignee.create({ data: { issueId: issue.id, userId: 'cseatdev001', role: 'ASSIGNEE', status: 'APPROVED' } });
  const caller = userId => ({ user: { id: userId }, workspace: { id: 'w', name: 'w', slug: 'team' } });
  // What the project seats get before any seat without a project exists.
  const before = {
    room: plain((await seats.seatsWithRoom(prisma, A, 'developer')).map(row => row.id)),
    inbox: plain((await runs.seatInbox(caller('cseatdev001'))).items),
    page: plain((await page.readSeats(owner, 'team')).seats.map(row => [row.id, row.project, row.waiting.map(item => item.issueKey)])),
  };

  await t.test('the database takes a seat without a project and holds one default per role in a workspace', async () => {
    const column = await raw.$queryRaw`SELECT is_nullable FROM information_schema.columns WHERE table_name = 'AgentSeat' AND column_name = 'projectId'`;
    assert.equal(column[0].is_nullable, 'YES');
    const [index] = await raw.$queryRaw`SELECT indexdef FROM pg_indexes WHERE indexname = 'AgentSeat_one_workspace_default'`;
    assert.equal(index?.indexdef, 'CREATE UNIQUE INDEX "AgentSeat_one_workspace_default" ON public."AgentSeat" USING btree ("workspaceId", role) WHERE (("projectId" IS NULL) AND "isDefault" AND ("retiredAt" IS NULL))');

    await inWorkspace('ws-dev', 'cwsdev00001', 'developer', { isDefault: true });
    // The other workspace's, made before ws-dev2 so it is the older one when a default is handed on below.
    await raw.agentSeat.create({ data: { id: 'ws-dev-w2', workspaceId: 'w2', projectId: null, role: 'developer', userId: 'cwsdevw2001', name: 'ws-dev-w2', isDefault: true } });
    await assert.rejects(inWorkspace('ws-dev2', 'cwsdev00002', 'developer', { isDefault: true }), { code: 'P2002' });
    // Not default, another role, another workspace: each is allowed. A project's own default stands beside it.
    await inWorkspace('ws-dev2', 'cwsdev00002', 'developer');
    await inWorkspace('ws-rev', 'cwsrev00001', 'reviewer', { isDefault: true });
    assert.equal(await raw.agentSeat.count({ where: { workspaceId: 'w', role: 'developer', isDefault: true } }), 2);
    // A retired default does not count.
    await raw.agentSeat.update({ where: { id: 'ws-dev' }, data: { retiredAt: new Date() } });
    await raw.agentSeat.update({ where: { id: 'ws-dev2' }, data: { isDefault: true } });
    await raw.agentSeat.update({ where: { id: 'ws-dev2' }, data: { isDefault: false } });
    await raw.agentSeat.update({ where: { id: 'ws-dev' }, data: { retiredAt: null, isDefault: true } });
  });

  await t.test('the project seats get what they got before', async () => {
    assert.deepEqual(plain((await seats.seatsWithRoom(prisma, A, 'developer')).map(row => row.id)), before.room);
    assert.deepEqual(plain((await runs.seatInbox(caller('cseatdev001'))).items), before.inbox);
    assert.deepEqual(plain((await page.readSeats(owner, 'team')).seats.map(row => [row.id, row.project, row.waiting.map(item => item.issueKey)])), before.page);
  });

  await t.test('a seat without a project is refused where a project is needed, not treated as no seat', async () => {
    // Its account even has an issue assigned: it is still not offered.
    await raw.issue.update({ where: { id: issue.id }, data: { assigneeId: 'cwsdev00001' } });
    await assert.rejects(runs.seatInbox(caller('cwsdev00001')), { code: 'workspace_seat' });
    await assert.rejects(seats.seatFor(prisma, caller('cwsdev00001')), { code: 'workspace_seat' });
    await assert.rejects(seats.seatWriteGuard(prisma, caller('cwsdev00001'), A), { code: 'wrong_project' });
    await raw.issue.update({ where: { id: issue.id }, data: { assigneeId: 'cseatdev001' } });
  });

  await t.test('retiring a default seat without a project hands the default on only inside its own workspace', async () => {
    await seats.retireSeat({ workspaceId: 'w', actorId: owner, seatId: 'ws-dev' });
    const defaults = await raw.agentSeat.findMany({ where: { projectId: null, role: 'developer', isDefault: true, retiredAt: null }, orderBy: { id: 'asc' }, select: { id: true } });
    assert.deepEqual(defaults.map(row => row.id), ['ws-dev-w2', 'ws-dev2']);
  });
});
