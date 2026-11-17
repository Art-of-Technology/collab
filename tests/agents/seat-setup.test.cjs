const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('../security/helpers.cjs');
const { seatsDatabase } = require('./seats-db.cjs');

const owner = 'cowner00001', person = 'cperson0001', bystander = 'cbystand001';
// S is the project to set up, N has no status a run could use, E already has a release seat.
const S = 'cprojects001', N = 'cprojectn001', E = 'cprojecte001';
const scopes = ['issues:read', 'issues:write', 'user:read'];

let db;
after(() => db?.stop());

test('seat setup: one command gives an existing project its seats and switches it', async t => {
  db = await seatsDatabase(async prisma => {
    await prisma.user.createMany({ data: [owner, person, bystander].map(id => ({ id, name: id, email: `${id}@example.test` })) });
    await prisma.workspace.create({ data: { id: 'w', name: 'w', slug: 'w', ownerId: owner } });
    await prisma.workspaceMember.createMany({ data: [person, bystander].map(userId => ({ workspaceId: 'w', userId })) });
    for (const [id, name, issuePrefix, names] of [[S, 'Seatlense', 'SE'], [N, 'Nowhere', 'NO', ['backlog', 'shipping']], [E, 'Elsewhere', 'EL']]) {
      await prisma.project.create({ data: { id, workspaceId: 'w', name, slug: issuePrefix.toLowerCase(), issuePrefix } });
      await prisma.projectStatus.createMany({ data: (names ?? ['to_do', 'in_progress', 'done']).map((status, order) => ({ id: `${id}-${status}`, projectId: id, name: status,
        displayName: status, order, isDefault: order === 0, isFinal: status === 'done' })) });
    }
    await prisma.app.create({ data: { id: 'agent-app', name: 'collab-agent', slug: 'collab-agent', publisherId: 'system', status: 'PUBLISHED', visibility: 'PRIVATE', isSystemApp: true,
      scopes: { create: scopes.map(scope => ({ scope })) } } });
  });
  const { prisma } = db;

  // Tokens are stored readable here: the setup is under test, not encryption.
  const crypto = { encryptToken: async value => Buffer.from(value), decryptToken: async data => Buffer.from(data).toString(), getEncryptionKey: () => {} };
  const zod = require('zod');
  const handoffs = load('src/lib/agent-handoffs.ts', { 'node:crypto': require('node:crypto'), 'node:buffer': require('node:buffer'), zod,
    '@/lib/prisma': { prisma }, '@/lib/issue-finder': load('src/lib/issue-finder.ts', { '@/lib/prisma': { prisma } }), '@/lib/oauth-scopes': load('src/lib/oauth-scopes.ts') }, { Date });
  const tokens = load('src/lib/agent-tokens.ts', { crypto: require('node:crypto'), '@/lib/prisma': { prisma }, '@/lib/apps/crypto': crypto }, { Buffer, Date });
  const assignee = load('src/lib/issue-assignee.ts', { './agent-handoffs': handoffs });
  const seats = load('src/lib/agent-seats.ts', { '@/lib/prisma': { prisma }, '@/lib/agent-handoffs': handoffs, '@/lib/agent-tokens': tokens, '@/lib/issue-assignee': assignee }, { Date });
  const runners = load('src/lib/agent-runners.ts', { crypto: require('node:crypto'), '@/lib/prisma': { prisma }, '@/lib/agent-handoffs': handoffs, '@/lib/agent-tokens': tokens }, { Date });
  const deps = { zod, '@/lib/prisma': { prisma }, '@/lib/agent-handoffs': handoffs, '@/lib/agent-seats': seats, '@/lib/issue-assignee': assignee,
    '@/lib/agent-tokens': tokens, '@/lib/agent-runners': runners, 'next/server': { NextResponse: Response }, '@/lib/apps/auth-middleware': {},
    // Only the workspace's owner and `person` may manage its permissions here.
    '@/lib/permissions': { Permission: { MANAGE_WORKSPACE_PERMISSIONS: 'MANAGE_WORKSPACE_PERMISSIONS' },
      checkUserPermission: async userId => ({ hasPermission: [owner, person].includes(userId) }) } };
  deps['@/lib/agent-runs'] = load('src/lib/agent-runs.ts', deps, { Date });
  deps['@/lib/agent-mode'] = load('src/lib/agent-mode.ts', deps, { Date });
  const setup = load('src/lib/agent-seat-setup.ts', deps, { Date });

  /** A person signed in to the CLI: the CLI's own app, not the agent app. */
  const asPerson = userId => ({ user: { id: userId }, app: { slug: 'collab-cli' }, workspace: { id: 'w', name: 'w', slug: 'w' } });
  const asAgent = userId => ({ ...asPerson(userId), app: { slug: 'collab-agent' } });
  const refuses = (promise, code, status) => assert.rejects(promise, error => {
    assert.deepEqual([error.code, error.status], [code, status], error.message);
    return true;
  });
  const plain = value => JSON.parse(JSON.stringify(value));
  const preview = async (context, project) => plain(await setup.seatSetupState(context, project));
  const apply = async (context, project, input = {}) => plain(await setup.setupSeats(context, project, input));
  const admit = async name => {
    const started = await runners.startPairing(name);
    await runners.admitRunner({ workspaceId: 'w', actorId: owner, code: started.code, ownerId: person });
    return started.credential;
  };
  const seatRows = projectId => prisma.agentSeat.findMany({ where: { projectId, retiredAt: null }, orderBy: { role: 'asc' },
    select: { name: true, role: true, byRunner: true, ownerId: true, isDefault: true } });

  // An issue an agent claimed three days ago, which is what a switch carries over.
  await prisma.agentRegistration.create({ data: { id: 'reg', workspaceId: 'w', userId: person, name: 'worker' } });
  const claimed = await prisma.issue.create({ data: { workspaceId: 'w', projectId: S, title: 'Half done', issueKey: 'SE-1', statusId: `${S}-in_progress` } });
  await prisma.agentHandoff.create({ data: { workspaceId: 'w', issueId: claimed.id, sourceKey: 'k1', content: 'Carry on', status: 'claimed', claimedById: 'reg',
    updatedAt: new Date(Date.now() - 3 * 86_400_000) } });
  let credential;

  await t.test('an agent token, a seat token and a person who cannot manage the workspace are all refused, and nothing is made', async () => {
    for (const context of [asAgent('cagent00001'), asAgent(person)]) {
      await refuses(setup.seatSetupState(context, 'SE'), 'person_required', 403);
      await refuses(setup.setupSeats(context, 'SE', {}), 'person_required', 403);
    }
    await refuses(setup.seatSetupState(asPerson(bystander), 'SE'), 'forbidden', 403);
    await refuses(setup.setupSeats(asPerson(bystander), 'SE', {}), 'forbidden', 403);
    await refuses(setup.seatSetupState(asPerson(owner), 'NOT-A-PROJECT'), 'project_not_found', 404);
    assert.deepEqual(await seatRows(S), []);
  });

  await t.test('with no runner admitted it stops after the preview and says so', async () => {
    const seen = await preview(asPerson(owner), 'SE');
    assert.deepEqual([seen.blocked, seen.runner], ['no_runner', null]);
    assert.match(seen.reason, /No runner is admitted/);
    await refuses(setup.setupSeats(asPerson(owner), 'SE', {}), 'setup_blocked', 409);
    assert.deepEqual(await seatRows(S), []);
    assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: S } })).agentMode, 'handoffs');
  });

  await t.test('the preview names the missing seats, the runner and the claims, and changes nothing', async () => {
    credential = await admit('mac');
    const seen = await preview(asPerson(owner), 'SE');
    assert.deepEqual([seen.blocked, seen.reason], [null, null]);
    assert.deepEqual(seen.project, { id: S, name: 'Seatlense', issuePrefix: 'SE', mode: 'handoffs' });
    assert.deepEqual(seen.seats.map(seat => [seat.role, seat.name, seat.exists]), [
      ['developer', 'Seatlense Developer', false], ['reviewer', 'Seatlense Reviewer', false],
      ['release', 'Seatlense Release', false], ['security', 'Seatlense Security', false]]);
    assert.deepEqual(seen.missing, ['developer', 'reviewer', 'release', 'security']);
    assert.deepEqual([seen.runner.name, seen.runner.yours], ['mac', false]);
    assert.deepEqual(seen.claims.map(claim => [claim.issueKey, claim.agent]), [['SE-1', 'worker']]);
    // Read twice over, nothing was made and the project still gives agents work by handoffs.
    assert.deepEqual(await seatRows(S), []);
    assert.equal(await prisma.appToken.count(), 0);
    assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: S } })).agentMode, 'handoffs');
  });

  await t.test('a status group the switch needs stops it after the preview, and names which', async () => {
    const seen = await preview(asPerson(owner), 'NO');
    assert.deepEqual([seen.blocked, seen.missingGroups], ['status_groups', ['in_progress', 'done']]);
    await refuses(setup.setupSeats(asPerson(owner), 'NO', {}), 'setup_blocked', 409);
    assert.deepEqual(await seatRows(N), []);
  });

  await t.test('it creates the missing seats for the runner, switches the project and carries the claims over', async () => {
    const done = await apply(asPerson(owner), 'SE');
    assert.deepEqual(done.created, ['Seatlense Developer', 'Seatlense Reviewer', 'Seatlense Release', 'Seatlense Security']);
    assert.deepEqual([done.project.mode, done.carriedOver], ['seats', ['SE-1']]);
    assert.deepEqual((await seatRows(S)).map(seat => [seat.role, seat.byRunner, seat.ownerId, seat.isDefault]),
      [['developer', true, person, true], ['release', true, person, true], ['reviewer', true, person, true], ['security', true, person, true]]);
    // No token is made for a seat a runner runs, so the reply has none to print and none exists yet.
    assert.deepEqual(done.seats.map(seat => [seat.role, seat.runner, seat.state]),
      [['developer', null, null], ['release', null, null], ['reviewer', null, null], ['security', null, null]]);
    assert.ok(!JSON.stringify(done).includes('collab_at_'));
    assert.equal(await prisma.appToken.count(), 0);
    // The claim's issue now belongs to the developer seat.
    const developer = (await seatRows(S)).find(seat => seat.role === 'developer');
    const moved = await prisma.issue.findUniqueOrThrow({ where: { id: claimed.id }, select: { assignee: { select: { name: true } } } });
    assert.equal(moved.assignee.name, developer.name);
  });

  await t.test('the runner fetches each seat, and the reply then says which it has', async () => {
    const fetched = plain(await runners.fetchSeats(credential, []));
    assert.deepEqual(fetched.seats.map(seat => seat.name).sort(), ['Seatlense Developer', 'Seatlense Release', 'Seatlense Reviewer', 'Seatlense Security']);
    const again = await apply(asPerson(owner), 'SE');
    assert.deepEqual([again.created, again.carriedOver], [[], []]);
    assert.deepEqual(again.seats.map(seat => [seat.role, seat.runner, seat.state]),
      [['developer', 'mac', 'held'], ['release', 'mac', 'held'], ['reviewer', 'mac', 'held'], ['security', 'mac', 'held']]);
    assert.equal((await seatRows(S)).length, 4, 'running it twice creates nothing the second time');
    assert.equal(await prisma.appToken.count(), 4);
  });

  await t.test('a seat of a role that already exists is left alone, whoever made it', async () => {
    const made = await seats.createSeat({ workspaceId: 'w', actorId: owner, projectId: E, role: 'release', ownerId: person, name: 'Local release', expiresInDays: 30 });
    assert.ok(made.token.token, 'made by hand, with a token a person saw');
    const seen = await preview(asPerson(person), 'EL');
    assert.deepEqual(seen.seats.map(seat => [seat.role, seat.name, seat.exists]), [
      ['developer', 'Elsewhere Developer', false], ['reviewer', 'Elsewhere Reviewer', false],
      ['release', 'Local release', true], ['security', 'Elsewhere Security', false]]);
    assert.equal(seen.runner.yours, true);
    const done = await apply(asPerson(person), 'EL');
    assert.deepEqual(done.created, ['Elsewhere Developer', 'Elsewhere Reviewer', 'Elsewhere Security']);
    assert.deepEqual((await seatRows(E)).map(seat => [seat.role, seat.name, seat.byRunner]),
      [['developer', 'Elsewhere Developer', true], ['release', 'Local release', false], ['reviewer', 'Elsewhere Reviewer', true], ['security', 'Elsewhere Security', true]]);
    assert.equal(done.seats.length, 3, 'the seat run by hand is not one the runner fetches');
  });
});
