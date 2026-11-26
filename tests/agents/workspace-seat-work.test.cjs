const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { Prisma } = require('@prisma/client');
const { load } = require('../security/helpers.cjs');
const { seatsDatabase } = require('./seats-db.cjs');

// CLB-615: a seat whose scope is the whole workspace (CLB-613) works the issues assigned to it in any project of its
// workspace: its inbox lists them, it checks them out with each issue's own repository, it writes where it works, and
// its requests go to the project's own seat of the role first, to the workspace's default seat of the role only when
// the project has none. A project seat behaves as before.
const owner = 'cowner00001', person = 'cperson0001';
const A = 'cprojecta001', B = 'cprojectb001', C = 'cprojectc001';
const scopes = ['issues:read', 'issues:write', 'user:read'];
const ago = seconds => new Date(Date.now() - seconds * 1000);
const body = ['What', 'Why', 'Done when'].map(title => `## ${title}\n\nSomething real about ${title}.`).join('\n\n');
const note = ['Done', 'Decisions', 'Evidence', 'Next'].map(heading => `## ${heading}\n\nWhat there is to say.`).join('\n\n');
const plain = value => JSON.parse(JSON.stringify(value));

let db;
after(() => db?.stop());

test('a workspace seat works the issues assigned to it in any project (CLB-615)', async t => {
  db = await seatsDatabase(async prisma => {
    await prisma.user.createMany({ data: [owner, person].map(id => ({ id, name: id, email: `${id}@example.test` })) });
    for (const id of ['w2', 'w']) await prisma.workspace.create({ data: { id, name: id, slug: `${id}-slug`, ownerId: owner, issueTemplatesEnforced: true } });
    await prisma.workspaceMember.createMany({ data: ['w', 'w2'].map(workspaceId => ({ workspaceId, userId: person })) });
    for (const [id, issuePrefix, name] of [[A, 'AA', 'Alpha'], [B, 'BB', 'Beta'], [C, 'CC', 'Gamma']]) {
      await prisma.project.create({ data: { id, workspaceId: 'w', name, slug: id, issuePrefix, agentMode: 'seats' } });
      await prisma.projectStatus.createMany({ data: ['to_do', 'in_progress', 'blocked', 'done'].map((status, order) => ({ id: `${id}-${status}`, projectId: id, name: status,
        displayName: status, order, isDefault: status === 'to_do', isFinal: status === 'done' })) });
      await prisma.repository.create({ data: { projectId: id, githubRepoId: id, owner: 'acme', name, fullName: `acme/${name}`, webhookSecret: 'secret' } });
    }
    for (const [id, slug] of [['agent-app', 'collab-agent'], ['person-app', 'collab-cli']]) {
      await prisma.app.create({ data: { id, name: slug, slug, publisherId: 'system', status: 'PUBLISHED', visibility: 'PRIVATE', isSystemApp: true,
        scopes: { create: scopes.map(scope => ({ scope })) } } });
    }
    await prisma.taskLabel.createMany({ data: ['Review request', 'Release request'].map(name => ({ workspaceId: 'w', name, color: '#123456' })) });
  });
  const raw = db.prisma;
  const prisma = raw.$extends(load('src/lib/issue-visibility.ts').issueVisibilityExtension(Prisma.dmmf.datamodel.models));

  const crypto = { encryptToken: async value => Buffer.from(value), decryptToken: async data => Buffer.from(data).toString(), getEncryptionKey: () => {} };
  const zod = require('zod');
  const response = { NextResponse: Response };
  const globals = { console, URL, Date, Buffer };
  const finder = load('src/lib/issue-finder.ts', { '@/lib/prisma': { prisma } });
  const handoffs = load('src/lib/agent-handoffs.ts', { 'node:crypto': require('node:crypto'), 'node:buffer': require('node:buffer'), zod,
    '@/lib/prisma': { prisma }, '@/lib/issue-finder': finder, '@/lib/oauth-scopes': load('src/lib/oauth-scopes.ts') }, { Date });
  const tokens = load('src/lib/agent-tokens.ts', { crypto: require('node:crypto'), '@/lib/prisma': { prisma }, '@/lib/apps/crypto': crypto }, { Buffer, Date });
  const assignee = load('src/lib/issue-assignee.ts', { './agent-handoffs': handoffs });
  const repositories = load('src/lib/agent-repository.ts', {}, { URL });
  const seats = load('src/lib/agent-seats.ts', { '@/lib/prisma': { prisma }, '@/lib/agent-handoffs': handoffs, '@/lib/agent-tokens': tokens,
    '@/lib/agent-repository': repositories, '@/lib/issue-assignee': assignee, '@/lib/issue-finder': finder }, { Date });
  const middleware = load('src/lib/apps/auth-middleware.ts', { crypto: require('node:crypto'), 'next/server': response,
    '@/lib/apps/crypto': crypto, '@/lib/oauth-scopes': load('src/lib/oauth-scopes.ts'), '@/lib/post-access': load('src/lib/post-access.ts'),
    '@/lib/auth-error-diagnostics': load('src/lib/auth-error-diagnostics.ts'), '@/lib/prisma': { prisma } }, globals);
  const templates = load('src/lib/issue-templates.ts', { '@/lib/comment-html': load('src/lib/comment-html.ts', { 'isomorphic-dompurify': { default: require('isomorphic-dompurify') }, marked: require('marked') }) });
  class ForgeProjectWriteError extends Error {}
  const deps = {
    '@/lib/redis': { publishEvent: async () => true }, zod, 'next/server': response, '@/lib/prisma': { prisma }, '@/lib/apps/auth-middleware': middleware,
    '@/lib/agent-seats': seats, '@/lib/issue-assignee': assignee, '@/lib/agent-repository': repositories, '@/lib/issue-finder': finder,
    '@/lib/agent-handoff-http': load('src/lib/agent-handoff-http.ts', { zod, 'next/server': response, './agent-handoffs': handoffs }, globals),
    '@/lib/forge/legacy-write-guard': { ForgeProjectWriteError, assertLegacyIssueWriteAllowed: async () => {}, assertLegacyProjectWriteAllowed: async () => {} },
    '@/lib/permissions': load('src/lib/permissions.ts', { './prisma': { prisma } }, { console }), '@/lib/agent-tokens': tokens, '@/lib/issue-templates': templates,
    '@/lib/issue-template-store': load('src/lib/issue-template-store.ts', { '@/lib/prisma': { prisma }, '@/lib/issue-templates': templates }),
    '@/lib/event-bus': { emitIssueCreated: async () => {} }, '@/lib/post-access': load('src/lib/post-access.ts') };
  deps['@/lib/agent-runs'] = load('src/lib/agent-runs.ts', deps, { Date });
  deps['@/lib/agent-requests'] = load('src/lib/agent-requests.ts', deps, { Date });
  deps['@/lib/agent-runners'] = load('src/lib/agent-runners.ts', { crypto: require('node:crypto'), '@/lib/prisma': { prisma }, '@/lib/agent-handoffs': handoffs,
    '@/lib/agent-tokens': tokens }, { Date });
  const runsLib = deps['@/lib/agent-runs'];
  const route = path => load(`src/app/api/apps/auth/${path}/route.ts`, deps, globals);
  const requests = route('seats/me/requests'), inboxRoute = route('seats/me/inbox'), runs = route('runs'), one = route('runs/[id]'), comments = route('issues/[issueIdOrKey]/comments');
  const page = load('src/lib/agents-page.ts', deps, { Date });

  const call = async (handler, token, { method, body: sent, params = {} } = {}) => {
    const reply = await handler(new Request('https://collab.test/api', { method: method ?? (sent ? 'POST' : 'GET'), headers: { Authorization: `Bearer ${token}` },
      ...(sent && { body: JSON.stringify(sent) }) }), { params: Promise.resolve(params) });
    return [reply.status, await reply.json()];
  };
  const seat = async (name, projectId, role = 'developer', extra = {}, workspaceId = 'w') => {
    const made = await seats.createSeat({ workspaceId, actorId: owner, projectId, role, ownerId: person, name, expiresInDays: 30, ...extra });
    return { ...made.seat, token: made.token.token };
  };
  // The other workspace's workspace reviewer comes first, so a request that looked past its own workspace would find it.
  await seat('ws-rev-w2', null, 'reviewer', {}, 'w2');
  const devA = await seat('dev-a', A), revA = await seat('rev-a', A, 'reviewer');
  const wsDev = await seat('ws-dev', null), wsRev = await seat('ws-rev', null, 'reviewer');
  let count = 0;
  const issue = async (to, project, data = {}) => {
    const made = await raw.issue.create({ data: { workspaceId: 'w', projectId: project, title: `Issue ${++count}`, issueKey: `K-${count}`,
      statusId: `${project}-to_do`, assigneeId: to?.userId, createdAt: ago(900), ...data } });
    if (to) await raw.issueAssignee.create({ data: { issueId: made.id, userId: to.userId, role: 'ASSIGNEE', status: 'APPROVED', assignedAt: ago(600), approvedAt: ago(600) } });
    return made;
  };
  const inbox = async who => { const [status, reply] = await call(inboxRoute.GET, who.token); assert.equal(status, 200, JSON.stringify(reply)); return reply.items.map(item => item.issueKey); };
  const checkout = (who, target, generation = `g-${target.issueKey}`) => call(runs.POST, who.token, { body: { issue: target.issueKey, generation, runner: 'test' } });
  const file = (by, from, sent = {}) => call(requests.POST, by.token, { body: { role: 'review', title: 'Please review', body, fromIssue: from.issueKey, ...sent } });
  const filed = async (by, from, sent) => {
    const [status, reply] = await file(by, from, sent);
    assert.equal(status, 200, JSON.stringify(reply));
    return raw.issue.findUniqueOrThrow({ where: { id: reply.issue.id } });
  };

  const inA = await issue(wsDev, A, { priority: 'high' }), inB = await issue(wsDev, B);
  const ownA = await issue(devA, A), devAInB = await issue(devA, B);
  const caller = who => ({ user: { id: who.userId }, workspace: { id: 'w', name: 'w', slug: 'w-slug' } });

  await t.test('a person assigns it an issue of any project of its workspace; a project seat still only its own project\'s', async () => {
    const inC = { workspaceId: 'w', projectId: C, agentRequestRole: null };
    await assignee.assertAssignable(prisma, inC, wsDev.userId);
    await assert.rejects(assignee.assertAssignable(prisma, inC, devA.userId), { code: 'wrong_project' });
    // Not in another workspace, and still only the kinds of issue its role takes.
    await assert.rejects(assignee.assertAssignable(prisma, { ...inC, workspaceId: 'w2' }, wsDev.userId));
    await assert.rejects(assignee.assertAssignable(prisma, { ...inC, agentRequestRole: 'review' }, wsDev.userId), { code: 'role_mismatch' });
  });

  await t.test('its inbox lists what is assigned to it in every project, in the usual order; a project seat\'s lists only its project', async () => {
    assert.deepEqual(await inbox(wsDev), [inA.issueKey, inB.issueKey]);
    assert.deepEqual(await inbox(devA), [ownA.issueKey]);
  });

  await t.test('it checks out an issue of any project, with that project\'s repository; a project seat is still refused outside its project', async () => {
    const [status, reply] = await checkout(wsDev, inB);
    assert.equal(status, 200, JSON.stringify(reply));
    assert.equal(reply.repository.name, 'acme/Beta');
    const [statusA, replyA] = await checkout(wsDev, inA);
    assert.equal(statusA, 200, JSON.stringify(replyA));
    assert.equal(replyA.repository.name, 'acme/Alpha');
    const [refused, refusal] = await checkout(devA, devAInB);
    assert.deepEqual([refused, refusal.error], [403, 'wrong_project']);
    // The run renews and finishes like a project seat's.
    const [renewed] = await call(one.PATCH, wsDev.token, { method: 'PATCH', body: { event: 'renew', generation: `g-${inA.issueKey}` }, params: { id: replyA.run.id } });
    assert.equal(renewed, 200);
    const [finished, done] = await call(one.PATCH, wsDev.token, { method: 'PATCH', body: { event: 'finish', generation: `g-${inA.issueKey}`, outcome: 'done', note },
      params: { id: replyA.run.id } });
    assert.equal(finished, 200, JSON.stringify(done));
  });

  await t.test('it writes in the projects where it works, and nowhere else', async () => {
    assert.equal((await call(comments.POST, wsDev.token, { body: { content: 'Working on it' }, params: { issueIdOrKey: inB.id } }))[0], 201);
    const elsewhere = await issue(null, C);
    const [status, reply] = await call(comments.POST, wsDev.token, { body: { content: 'Hello' }, params: { issueIdOrKey: elsewhere.id } });
    assert.deepEqual([status, reply.error], [403, 'wrong_project']);
  });

  await t.test('a request goes to the project\'s own seat of the role first, and to the workspace\'s default seat only when the project has none', async () => {
    // Project A has its own reviewer.
    const fromA = await filed(wsDev, await issue(wsDev, A));
    assert.deepEqual([fromA.projectId, fromA.assigneeId], [A, revA.userId]);
    // Project B has none: the workspace's reviewer takes it, in project B, the source's project.
    const fromB = await filed(wsDev, inB);
    assert.deepEqual([fromB.projectId, fromB.assigneeId, fromB.agentRequestRole], [B, wsRev.userId, 'review']);
    assert.ok((await inbox(wsRev)).includes(fromB.issueKey));
    // A project seat asking in project B reaches the workspace's reviewer the same way.
    const fromProjectSeat = await filed(devA, ownA, { project: 'BB' });
    assert.deepEqual([fromProjectSeat.projectId, fromProjectSeat.assigneeId], [B, wsRev.userId]);
    // No seat of the role in the project and none in the workspace: refused as before.
    const [status, reply] = await file(wsDev, inB, { role: 'security' });
    assert.deepEqual([status, reply.error], [409, 'no_default_seat']);
  });

  await t.test('a workspace seat files a request only into a project where it works (CLB-1245)', async () => {
    // Project C holds nothing of its: naming it is refused, and nothing is written there.
    const before = await raw.issue.count({ where: { projectId: C } });
    const [status, reply] = await file(wsDev, inB, { project: 'CC' });
    assert.deepEqual([status, reply.error], [403, 'wrong_project']);
    assert.equal(await raw.issue.count({ where: { projectId: C } }), before);
    // Project A, where it works too, may be named from an issue of project B.
    const intoA = await filed(wsDev, inB, { project: 'AA' });
    assert.deepEqual([intoA.projectId, intoA.assigneeId], [A, revA.userId]);
  });

  await t.test('it gains no access its account does not have', async () => {
    await raw.workspaceMember.update({ where: { userId_workspaceId: { userId: wsDev.userId, workspaceId: 'w' } }, data: { status: false } });
    try {
      assert.deepEqual((await runsLib.seatInbox(caller(wsDev))).items, []);
      await assert.rejects(seats.seatWriteGuard(prisma, caller(wsDev), B), { code: 'wrong_project' });
    } finally {
      await raw.workspaceMember.update({ where: { userId_workspaceId: { userId: wsDev.userId, workspaceId: 'w' } }, data: { status: true } });
    }
  });

  await t.test('the Seats and Inbox tabs list what waits for a workspace seat, each with its project', async () => {
    await issue(wsDev, C);
    const view = plain(await page.readSeats(owner, 'w'));
    assert.deepEqual(view.seats.find(row => row.name === 'ws-dev').waiting.map(item => item.project).sort(), ['Alpha', 'Gamma']);
    assert.deepEqual(view.seats.find(row => row.name === 'ws-rev').waiting.map(item => item.project), ['Beta', 'Beta']);
    // A project seat's are all of its project: they are listed as before.
    assert.deepEqual(view.seats.find(row => row.name === 'dev-a').waiting.map(item => [item.issueKey, 'project' in item]), [[ownA.issueKey, false]]);
  });
});
