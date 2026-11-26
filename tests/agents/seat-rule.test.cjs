const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('../security/helpers.cjs');
const { seatsDatabase } = require('./seats-db.cjs');

// Seats rule 6 (CLB-519): the workspace owner's rule gives every new project its four seats, at most five a UTC day.
const owner = 'cowner00001', admin = 'cadmin00001', member = 'cmember0001', other = 'cother00001';
const scopes = ['issues:read', 'issues:write', 'projects:write', 'user:read'];

let db;
after(() => db?.stop());

test('seats rule: a workspace rule gives every new project its four seats, with a daily cap', async t => {
  db = await seatsDatabase(async prisma => {
    await prisma.user.createMany({ data: [owner, admin, member, other].map(id => ({ id, name: `Name ${id}`, email: `${id}@example.test` })) });
    await prisma.workspace.create({ data: { id: 'w', name: 'w', slug: 'w', ownerId: owner } });
    await prisma.workspace.create({ data: { id: 'w2', name: 'w2', slug: 'w2', ownerId: other } });
    await prisma.workspaceMember.create({ data: { workspaceId: 'w', userId: admin, role: 'ADMIN' } });
    await prisma.workspaceMember.create({ data: { workspaceId: 'w', userId: member } });
    // The statuses the web app gives a new project.
    await prisma.statusTemplate.createMany({ data: ['todo', 'in_progress', 'done'].map((name, order) => ({ name, displayName: name, color: '#000000', order, isDefault: true })) });
    for (const [id, slug] of [['agent-app', 'collab-agent'], ['cli-app', 'collab-cli']]) {
      await prisma.app.create({ data: { id, name: slug, slug, publisherId: 'system', status: 'PUBLISHED', visibility: 'PRIVATE', isSystemApp: true,
        scopes: { create: scopes.map(scope => ({ scope })) } } });
    }
    // The member's own CLI token, which creating a project must leave as it was.
    await prisma.appToken.create({ data: { id: 'member-cli', appId: 'cli-app', workspaceId: 'w', userId: member, accessToken: 'member-cli-token', scopes } });
  });
  const { prisma } = db;

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
    // The owners and the Admin may manage agents; the member may not.
    '@/lib/permissions': { Permission: { MANAGE_AGENTS: 'MANAGE_AGENTS' }, checkUserPermission: async userId => ({ hasPermission: [owner, admin, other].includes(userId) }) } };
  deps['@/lib/agent-runs'] = load('src/lib/agent-runs.ts', deps, { Date });
  deps['@/lib/agent-mode'] = load('src/lib/agent-mode.ts', deps, { Date });
  const setup = load('src/lib/agent-seat-setup.ts', deps, { Date, console });

  // The two server paths that create a project. The CLI is a client of the token API.
  const routeDeps = { zod, '@/lib/prisma': { prisma }, 'next/server': { NextResponse: Response }, '@/lib/agent-seat-setup': setup,
    '@/lib/apps/auth-middleware': { withAppAuth: handler => handler } };
  const tokenApi = load('src/app/api/apps/auth/projects/route.ts', routeDeps, { console });
  let signedIn = null;
  const webApp = load('src/app/api/workspaces/[workspaceId]/projects/route.ts', { ...routeDeps,
    '@/lib/request-session': { getServerSession: async () => signedIn && { user: { id: signedIn } } }, '@/lib/auth': { authConfig: {} },
    '@/lib/issue-finder': load('src/lib/issue-finder.ts', { '@/lib/prisma': { prisma } }), '@/lib/slug-resolvers': { resolveWorkspaceSlug: async id => id },
    '@/lib/utils': { generateUniqueViewSlug: async name => name.toLowerCase().replace(/[^a-z0-9]+/g, '-') } }, { console });

  const viaToken = async (slug, userId, name, workspaceId = 'w') => {
    const prefix = name.toUpperCase().replace(/[^A-Z]/g, '');
    const response = await tokenApi.POST(new Request('http://collab.test/api/apps/auth/projects', { method: 'POST',
      body: JSON.stringify({ name, slug: prefix.toLowerCase(), issuePrefix: prefix }) }),
    { app: { id: slug === 'collab-agent' ? 'agent-app' : 'cli-app', slug, name: slug, status: 'PUBLISHED' }, user: { id: userId }, workspace: { id: workspaceId, slug: workspaceId, name: workspaceId },
      installation: { id: 'i', appId: 'a', workspaceId, userId, scopes, status: 'ACTIVE' } });
    assert.equal(response.status, 201, await response.clone().text());
    return response.json();
  };
  const viaWeb = async (userId, name) => {
    signedIn = userId;
    const response = await webApp.POST(new Request('http://collab.test/api/workspaces/w/projects', { method: 'POST', body: JSON.stringify({ name }) }),
      { params: Promise.resolve({ workspaceId: 'w' }) });
    assert.equal(response.status, 201, await response.clone().text());
    return (await response.json()).project;
  };
  const refuses = (promise, code, status) => assert.rejects(promise, error => {
    assert.deepEqual([error.code, error.status], [code, status], error.message);
    return true;
  });
  const seatsOf = projectId => prisma.agentSeat.findMany({ where: { projectId, retiredAt: null }, orderBy: { role: 'asc' }, select: { name: true, role: true, byRunner: true, ownerId: true } });
  const modeOf = async projectId => (await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).agentMode;
  const notices = () => prisma.notification.findMany({ where: { type: 'AGENT_SEATS_SKIPPED' }, orderBy: { createdAt: 'asc' } });
  const admit = async (name, workspaceId, actorId) => {
    const started = await runners.startPairing(name);
    await runners.admitRunner({ workspaceId, actorId, code: started.code });
    return started.credential;
  };
  const tokensBefore = await prisma.appToken.findMany({ orderBy: { id: 'asc' } });
  let credential;

  await t.test('only the workspace owner switches the rule, and not while no runner is connected', async () => {
    await refuses(setup.setSeatRule({ workspaceId: 'w', actorId: admin, on: true }), 'owner_only', 403);
    await refuses(setup.setSeatRule({ workspaceId: 'w', actorId: member, on: true }), 'owner_only', 403);
    await refuses(setup.setSeatRule({ workspaceId: 'w', actorId: owner, on: true }), 'no_runner', 409);
    assert.equal((await setup.seatRuleState('w', owner)).on, false);
  });

  await t.test('with the rule off a new project gets no seats and nobody is told', async () => {
    const project = await viaToken('collab-cli', member, 'Offline');
    assert.deepEqual([await seatsOf(project.id), await modeOf(project.id)], [[], 'handoffs']);
    assert.equal((await notices()).length, 0);
  });

  await t.test('with a runner connected the owner switches the rule on, and only the owner sees it as theirs to switch', async () => {
    credential = await admit('mac', 'w', owner);
    const state = await setup.seatRuleState('w', owner);
    assert.deepEqual([state.on, state.owner, state.perDay, state.today, state.runner], [false, true, 5, 0, 'mac']);
    assert.equal((await setup.setSeatRule({ workspaceId: 'w', actorId: owner, on: true })).on, true);
    assert.deepEqual([(await setup.seatRuleState('w', admin)).owner, (await setup.seatRuleState('w', admin)).on], [false, true]);
    assert.equal(await setup.seatRuleState('w', other), null, 'someone outside the workspace reads nothing');
  });

  await t.test("a project created through the token API, with a person's CLI token or an agent token, gets four seats and seats mode, and no token", async () => {
    const byPerson = await viaToken('collab-cli', member, 'Alpha');
    const byAgent = await viaToken('collab-agent', admin, 'Bravo');
    for (const [reply, name] of [[byPerson, 'Alpha'], [byAgent, 'Bravo']]) {
      assert.deepEqual((await seatsOf(reply.id)).map(seat => [seat.role, seat.name, seat.byRunner, seat.ownerId]), [
        ['developer', `${name} Developer`, true, owner], ['release', `${name} Release`, true, owner],
        ['reviewer', `${name} Reviewer`, true, owner], ['security', `${name} Security`, true, owner]]);
      assert.equal(await modeOf(reply.id), 'seats');
      assert.equal(reply.agentMode, 'seats');
      assert.ok(!JSON.stringify(reply).includes('collab_at_'), 'the reply carries no token');
    }
    // No token was made, and the caller's own token is as it was.
    assert.deepEqual(await prisma.appToken.findMany({ orderBy: { id: 'asc' } }), tokensBefore);
  });

  await t.test('a project created in the web app gets four seats and seats mode', async () => {
    const project = await viaWeb(member, 'Charlie');
    assert.deepEqual((await seatsOf(project.id)).map(seat => seat.role), ['developer', 'release', 'reviewer', 'security']);
    assert.equal(await modeOf(project.id), 'seats');
    assert.ok(!JSON.stringify(project).includes('collab_at_'));
  });

  await t.test("the runner has the seats' tokens after its next ask", async () => {
    const fetched = await runners.fetchSeats(credential, []);
    assert.deepEqual([...fetched.seats.map(seat => seat.name)].sort(), ['Alpha', 'Bravo', 'Charlie'].flatMap(name =>
      ['Developer', 'Release', 'Reviewer', 'Security'].map(role => `${name} ${role}`)).sort());
    assert.ok(fetched.seats.every(seat => seat.token.startsWith('collab_at_')));
  });

  await t.test('the sixth project of a UTC day gets no seats, and the owner gets one notification naming it and who created it', async () => {
    await viaToken('collab-cli', member, 'Delta');
    await viaWeb(member, 'Echo');
    assert.equal((await setup.seatRuleState('w', owner)).today, 5);
    const sixth = await viaToken('collab-agent', admin, 'Foxtrot');
    assert.deepEqual([await seatsOf(sixth.id), await modeOf(sixth.id), sixth.agentMode], [[], 'handoffs', 'handoffs']);
    const told = await notices();
    assert.equal(told.length, 1);
    assert.deepEqual([told[0].userId, told[0].senderId], [owner, admin]);
    assert.match(told[0].content, /Foxtrot/);
    assert.match(told[0].content, /^created the project Foxtrot \(FOXTROT\), which got no seats: the rule has given 5 new projects their seats today \(UTC\), its limit for a day\. To give it the seats still missing \(developer, reviewer, release, security\), run collab seat setup FOXTROT\.$/);
  });

  await t.test('switching the rule off and on again does not raise the count', async () => {
    await setup.setSeatRule({ workspaceId: 'w', actorId: owner, on: false });
    await setup.setSeatRule({ workspaceId: 'w', actorId: owner, on: true });
    const seventh = await viaToken('collab-cli', member, 'Golf');
    assert.deepEqual([await seatsOf(seventh.id), await modeOf(seventh.id)], [[], 'handoffs']);
    assert.equal((await notices()).length, 2, 'one notification for each project created without seats');
  });

  await t.test('the count is per workspace', async () => {
    await admit('linux', 'w2', other);
    await setup.setSeatRule({ workspaceId: 'w2', actorId: other, on: true });
    const project = await viaToken('collab-cli', other, 'Hotel', 'w2');
    assert.deepEqual([(await seatsOf(project.id)).length, await modeOf(project.id)], [4, 'seats']);
  });

  await t.test('with the runner gone since the rule went on, the project is still created, without seats, and the owner is told why', async () => {
    const runner = await prisma.agentRunner.findFirstOrThrow({ where: { workspaceId: 'w2', removedAt: null } });
    await runners.removeRunner({ workspaceId: 'w2', actorId: other, runnerId: runner.id });
    const project = await viaToken('collab-cli', other, 'Kilo', 'w2');
    assert.deepEqual([await seatsOf(project.id), await modeOf(project.id)], [[], 'handoffs']);
    const told = (await notices()).filter(notice => notice.userId === other);
    assert.equal(told.length, 1);
    assert.match(told[0].content, /Kilo/);
    assert.match(told[0].content, /No runner is connected/);
    assert.equal((await setup.seatRuleState('w2', other)).today, 1, 'a project the rule could not give seats takes no place in the day');
  });

  await t.test('a new UTC day counts from zero again', async () => {
    await prisma.workspace.update({ where: { id: 'w' }, data: { autoSeatsDay: new Date(Date.now() - 86_400_000) } });
    const project = await viaToken('collab-cli', member, 'India');
    assert.deepEqual([(await seatsOf(project.id)).length, await modeOf(project.id)], [4, 'seats']);
    assert.equal((await setup.seatRuleState('w', owner)).today, 1);
  });

  await t.test('a setup that fails before any seat is made gives its place in the day back; one that made seats keeps it', async () => {
    // Names the rule would give, already taken by seats made by hand in another project: the first, and the third in order.
    const offline = await prisma.project.findFirstOrThrow({ where: { name: 'Offline' } });
    for (const [role, name] of [['developer', 'Lima Developer'], ['release', 'Mike Release']]) {
      assert.ok((await seats.createSeat({ workspaceId: 'w', actorId: owner, projectId: offline.id, role, ownerId: owner, name, expiresInDays: 30 })).seat);
    }
    const before = (await setup.seatRuleState('w', owner)).today;
    const told = (await notices()).filter(notice => notice.userId === owner).length;

    const lima = await viaToken('collab-cli', member, 'Lima');
    assert.deepEqual([await seatsOf(lima.id), await modeOf(lima.id), lima.agentMode], [[], 'handoffs', 'handoffs']);
    assert.equal((await setup.seatRuleState('w', owner)).today, before, 'no seat was made, so no place was used');

    const mike = await viaToken('collab-cli', member, 'Mike');
    assert.deepEqual((await seatsOf(mike.id)).map(seat => seat.role), ['developer', 'reviewer'], 'the seats made before the failure stay');
    assert.equal(await modeOf(mike.id), 'handoffs');
    assert.equal((await setup.seatRuleState('w', owner)).today, before + 1, 'seats were made, so the place stays used');

    const latest = (await notices()).filter(notice => notice.userId === owner).slice(told);
    assert.equal(latest.length, 2, 'the owner is told about each');
    // Lima got nothing: the owner is told so, with the cause and what to do about the name before the setup can work.
    assert.match(latest[0].content, /^created the project Lima \(LIMA\), which got no seats: Lima Developer is already a developer seat; retire it/);
    assert.match(latest[0].content, /or add its developer seat under another name\. Then, to give it the seats still missing \(developer, reviewer, release, security\), run collab seat setup LIMA\.$/);
    // Mike kept the two seats made before the failure: the owner is told which, and that setup makes only the rest.
    assert.doesNotMatch(latest[1].content, /got no seats/);
    assert.match(latest[1].content, /^created the project Mike \(MIKE\), which got only its developer and reviewer seats and stays in handoffs: Mike Release is already a release seat; retire it/);
    assert.match(latest[1].content, /or add its release seat under another name\. Then, to give it the seats still missing \(release, security\), run collab seat setup MIKE\.$/);
  });

  await t.test('with the rule switched off new projects get no seats, and the seats already made stay', async () => {
    const before = await prisma.agentSeat.count({ where: { workspaceId: 'w', retiredAt: null } });
    const told = (await notices()).filter(notice => notice.userId === owner).length;
    await setup.setSeatRule({ workspaceId: 'w', actorId: owner, on: false });
    const project = await viaWeb(member, 'Juliet');
    assert.deepEqual([await seatsOf(project.id), await modeOf(project.id)], [[], 'handoffs']);
    assert.equal(await prisma.agentSeat.count({ where: { workspaceId: 'w', retiredAt: null } }), before);
    assert.equal((await notices()).filter(notice => notice.userId === owner).length, told, 'a rule that is off tells nobody');
  });

  await t.test('the route switches the rule for a signed-in person on Collab\'s own page only', async () => {
    let session = null;
    const route = load('src/app/api/workspaces/[workspaceId]/agent-seats/rule/route.ts', { zod, 'next/server': { NextResponse: Response },
      '@/lib/request-session': { getServerSession: async () => session }, '@/lib/auth-options': { authOptions: {} }, '@/lib/agent-seat-setup': setup },
    { process: { env: { NEXTAUTH_URL: 'http://collab.test' } }, URL });
    const params = { params: Promise.resolve({ workspaceId: 'w2' }) };
    const put = (body, origin = 'http://collab.test') => route.PUT(new Request('http://collab.test/api/workspaces/w2/agent-seats/rule', { method: 'PUT',
      headers: { 'content-type': 'application/json', origin }, body: JSON.stringify(body) }), params);
    assert.equal((await route.GET(new Request('http://collab.test/x'), params)).status, 401, 'a token or nobody: no session');
    assert.equal((await put({ on: false })).status, 401);
    session = { user: { id: other } };
    assert.equal((await put({ on: false }, 'https://elsewhere.test')).status, 403);
    assert.equal((await put({ on: false, perDay: 50 })).status, 400, 'nothing but on or off is accepted');
    const switched = await put({ on: false });
    assert.equal(switched.status, 200);
    assert.deepEqual([(await switched.json()).on, (await setup.seatRuleState('w2', other)).on], [false, false]);
    session = { user: { id: owner } };
    assert.equal((await route.GET(new Request('http://collab.test/x'), params)).status, 404, 'someone outside the workspace reads nothing');
  });

  await t.test('switching off works with no runner, switching on does not', async () => {
    await prisma.agentRunner.updateMany({ where: { workspaceId: 'w' }, data: { removedAt: new Date() } });
    await refuses(setup.setSeatRule({ workspaceId: 'w', actorId: owner, on: true }), 'no_runner', 409);
    assert.equal((await setup.setSeatRule({ workspaceId: 'w', actorId: owner, on: false })).on, false);
  });
});
