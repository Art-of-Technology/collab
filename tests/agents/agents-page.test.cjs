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
  const runners = load('src/lib/agent-runners.ts', { crypto: require('node:crypto'), '@/lib/prisma': { prisma }, '@/lib/agent-handoffs': handoffs,
    '@/lib/agent-tokens': { AGENT_APP_SLUG: 'collab-agent' } }, { Date });
  const page = load('src/lib/agents-page.ts', { '@/lib/prisma': { prisma }, '@/lib/post-access': load('src/lib/post-access.ts'), '@/lib/issue-finder': finder,
    '@/lib/agent-runs': runs, '@/lib/agent-runners': runners, '@/lib/agent-seats': seats,
    // The real rule for who manages the workspace: it decides whose room a person reads.
    '@/lib/permissions': load('src/lib/permissions.ts', { './prisma': { prisma } }) }, { Date });
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
    assert.deepEqual(Object.keys(view.seats[0]).sort(), ['customRole', 'id', 'isDefault', 'name', 'noRunner', 'owner', 'ownerId', 'project', 'role', 'room', 'runner', 'tokenExpired', 'waiting', 'working']);
    // Who pays for the seat: the owner's own sign-in, or nobody's when the seat has no owner.
    assert.deepEqual(view.seats.map(row => row.owner), [null, null]);
    // The projects that use seats, each with its owner's switch and the roles this person has a seat of there.
    assert.deepEqual(plain(view.projects), [{ id: A, slug: A, name: 'Alpha', membersMayAddSeats: false, mine: [], addable: true }]);
    await raw.agentSeat.update({ where: { id: 'dev-a' }, data: { ownerId: member } });
    await raw.project.update({ where: { id: A }, data: { membersMayAddSeats: true } });
    assert.deepEqual((await page.readSeats(member, 'team')).seats.map(row => row.owner), [member, null]);
    assert.deepEqual(plain((await page.readSeats(member, 'team')).projects), [{ id: A, slug: A, name: 'Alpha', membersMayAddSeats: true, mine: ['developer'], addable: true }]);
    assert.deepEqual(plain((await page.readSeats(owner, 'w')).projects), [{ id: A, slug: A, name: 'Alpha', membersMayAddSeats: true, mine: [], addable: true }]);
    // A project that went back to handoffs is listed for the person who still has a seat to remove there, and for nobody else.
    await raw.user.create({ data: { id: 'cseatbeta01', name: 'cseatbeta01' } });
    await seat('sec-b', 'cseatbeta01', B, 'security', { ownerId: member });
    assert.deepEqual(plain((await page.readSeats(member, 'team')).projects.map(row => [row.name, row.mine, row.addable])), [['Alpha', ['developer'], true], ['Beta', ['security'], false]]);
    assert.deepEqual((await page.readSeats(owner, 'w')).projects.map(row => row.name), ['Alpha']);
    await raw.user.delete({ where: { id: 'cseatbeta01' } });
    assert.deepEqual((await page.readSeats(member, 'team')).projects.map(row => row.name), ['Alpha']);
    // A seat a runner runs has no runner until one holds a usable token for it; a seat run by hand never says so.
    const states = async () => (await page.readSeats(member, 'team')).seats.map(row => [row.noRunner, row.tokenExpired]);
    assert.deepEqual(await states(), [[false, false], [false, false]]);
    await raw.agentSeat.update({ where: { id: 'rev-a' }, data: { byRunner: true } });
    assert.deepEqual(await states(), [[false, false], [true, false]]);
    const fetched = await raw.appToken.create({ data: { userId: 'cseatrev001', accessToken: 'fetched', scopes: [], runnerId: 'crunner00001', tokenExpiresAt: ago(-60) } });
    assert.deepEqual(await states(), [[false, false], [false, false]]);
    // A runner that stayed away through the renewal window leaves a token that ran out: the seat says so, and no
    // longer says that no runner has fetched one.
    await raw.appToken.update({ where: { id: fetched.id }, data: { tokenExpiresAt: ago(60) } });
    assert.deepEqual(await states(), [[false, false], [false, true]]);
    await raw.appToken.update({ where: { id: fetched.id }, data: { isRevoked: true } });
    assert.deepEqual(await states(), [[false, false], [true, false]]);
    await raw.agentSeat.update({ where: { id: 'rev-a' }, data: { byRunner: false } });
    // The Runners tab: the owner gets the people a runner can be admitted for, a member gets nobody, a stranger nothing.
    await raw.user.update({ where: { id: member }, data: { email: 'member@example.test' } });
    assert.deepEqual(plain(await page.readRunnersTab(owner, 'team')), { workspace: { id: 'w', slug: 'team' }, people: [{ id: member, name: member }, { id: owner, name: owner }] });
    assert.deepEqual(plain(await page.readRunnersTab(member, 'team')), { workspace: { id: 'w', slug: 'team' }, people: [] });
    assert.equal(await page.readRunnersTab(stranger, 'team'), null);
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
  await t.test('room: who manages the workspace reads every person\'s, a member only their own', async () => {
    const other = 'cother00001';
    await raw.user.create({ data: { id: other, name: 'Other' } });
    await raw.workspaceMember.create({ data: { workspaceId: 'w', userId: other } });
    const accounts = ['o-dev', 'o-rev', 'm-dev', 'm-rev', 'm-lead', 'x-dev', 'x-old', 'n-dev'];
    await raw.user.createMany({ data: accounts.map(id => ({ id: `acc-${id}`, name: id })) });
    const when = ago(1), at = when.toISOString(), early = ago(2);
    const figure = (room, roomProgram, roomAt = when) => ({ byRunner: true, isDefault: false, room, roomProgram, roomAt });
    // The owner's two seats read the same; the member's two differ; the third person's runner is paused.
    await seat('o-dev', 'acc-o-dev', B, 'developer', { ownerId: owner, ...figure(61, 'OwnerProgram', early) });
    await seat('o-rev', 'acc-o-rev', B, 'reviewer', { ownerId: owner, ...figure(61, 'OwnerProgram', early) });
    await seat('m-dev', 'acc-m-dev', B, 'developer', { ownerId: member, ...figure(7, 'MemberProgram') });
    await seat('m-rev', 'acc-m-rev', B, 'reviewer', { ownerId: member, ...figure(0, 'MemberProgram') });
    await seat('x-dev', 'acc-x-dev', B, 'developer', { ownerId: other, ...figure(83, 'OtherProgram') });
    await seat('x-old', 'acc-x-old', B, 'security', { ownerId: other, ...figure(84, 'OtherProgram', ago(20)) });
    // A seat nobody owns has no runner to report for it.
    await seat('n-dev', 'acc-n-dev', B, 'release', { byRunner: true, isDefault: false });
    const runner = (id, ownerId, data = {}) => raw.agentRunner.create({ data: { id, workspaceId: 'w', ownerId, name: `${id} space`, credentialHash: id, admittedAt: ago(60), lastSeenAt: ago(1), ...data } });
    await runner('r-owner', owner); await runner('r-member', member);
    const rooms = async reader => Object.fromEntries((await page.readSeats(reader, 'team')).seats.filter(row => /^[omxn]-/.test(row.id)).map(row => [row.id, plain(row.room)]));
    const all = await page.readSeats(owner, 'team');
    assert.equal(all.canManage, true);
    const same = { kind: 'room', room: 61, program: 'OwnerProgram', at: early.toISOString() };
    const theirs = { 'm-dev': { kind: 'room', room: 7, program: 'MemberProgram', at },
      // A fresh figure of 0 is no room, and so is every seat of a person without a runner, whatever was stored for it.
      'm-rev': { kind: 'no_room', reason: 'its runner reports no room' } };
    assert.deepEqual(await rooms(owner), { 'o-dev': same, 'o-rev': same, ...theirs,
      'x-dev': { kind: 'no_room', reason: 'no runner is connected' }, 'x-old': { kind: 'no_room', reason: 'no runner is connected' }, 'n-dev': { kind: 'no_room', reason: 'no runner is connected' } });
    // The runner's name is on every person's card, and it is the person's own runner.
    assert.deepEqual(all.seats.filter(row => /^[omxn]-/.test(row.id)).map(row => [row.id, row.ownerId, row.runner]), [['m-dev', member, 'r-member space'], ['o-dev', owner, 'r-owner space'],
      ['x-dev', other, null], ['n-dev', null, null], ['m-rev', member, 'r-member space'], ['o-rev', owner, 'r-owner space'], ['x-old', other, null]]);
    // A seat run by hand is unknown: the member's own from before.
    assert.deepEqual(plain(all.seats.find(row => row.id === 'dev-a').room), { kind: 'unknown', reason: 'the seat is run by hand' });

    // The member: their own two figures, which differ, and nobody else's room, program or time.
    const mine = await page.readSeats(member, 'team');
    assert.equal(mine.canManage, false);
    assert.deepEqual(await rooms(member), { 'o-dev': null, 'o-rev': null, ...theirs, 'x-dev': null, 'x-old': null, 'n-dev': null });
    for (const figure of ['OwnerProgram', 'OtherProgram', early.toISOString(), 'no runner is connected']) assert.equal(JSON.stringify(mine).includes(figure), false, figure);
    assert.deepEqual(mine.seats.map(row => [row.id, row.ownerId, row.runner]), all.seats.map(row => [row.id, row.ownerId, row.runner]));
    // Owning the project's lead seat shows a person nothing more: the lead's list is the lead seat's own, in its run context.
    await seat('m-lead', 'acc-m-lead', B, 'lead', { ownerId: member, byRunner: true });
    assert.deepEqual([(await rooms(member))['o-dev'], (await rooms(member))['x-dev']], [null, null]);

    // The third person's runner connects: a fresh figure is a number, an old one is unknown, and a paused runner has no room.
    await runner('r-other', other);
    assert.deepEqual((await rooms(other))['x-old'], { kind: 'unknown', reason: 'the figure is older than 15 minutes' });
    await raw.agentRunner.update({ where: { id: 'r-other' }, data: { state: 'working' } });
    assert.deepEqual(await rooms(other), { 'o-dev': null, 'o-rev': null, 'm-dev': null, 'm-rev': null, 'm-lead': null, 'n-dev': null,
      'x-dev': { kind: 'room', room: 83, program: 'OtherProgram', at },
      'x-old': { kind: 'unknown', reason: 'the figure is older than 15 minutes', live: true } });
    await raw.agentRunner.update({ where: { id: 'r-other' }, data: { state: 'paused' } });
    assert.deepEqual([(await rooms(owner))['x-dev'], (await rooms(owner))['x-old']], [{ kind: 'no_room', reason: 'the runner is paused' }, { kind: 'no_room', reason: 'the runner is paused' }]);
    // A removed runner is nobody's, and of two the one admitted last is the person's.
    await runner('r-other-2', other, { admittedAt: ago(5) });
    assert.equal((await page.readSeats(owner, 'team')).seats.find(row => row.id === 'x-dev').runner, 'r-other-2 space');
    assert.equal((await rooms(other))['x-dev'].kind, 'room');
    await raw.agentRunner.updateMany({ where: { ownerId: other }, data: { removedAt: new Date() } });
    assert.deepEqual((await rooms(other))['x-dev'], { kind: 'no_room', reason: 'no runner is connected' });

    // The rule is the permission that manages the workspace, not the word "owner": a member whose role has it reads everyone's.
    await raw.rolePermission.create({ data: { workspaceId: 'w', role: 'MEMBER', permission: 'MANAGE_AGENTS' } });
    assert.equal((await page.readSeats(member, 'team')).canManage, true);
    assert.deepEqual((await rooms(member))['o-dev'], same);
    await raw.rolePermission.deleteMany({ where: { workspaceId: 'w' } });
    assert.equal((await rooms(member))['o-dev'], null);
  });
});
