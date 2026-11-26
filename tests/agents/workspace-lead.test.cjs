const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { Prisma } = require('@prisma/client');
const { load } = require('../security/helpers.cjs');
const { seatsDatabase } = require('./seats-db.cjs');

// CLB-952: the workspace's one Lead seat leads the projects that have no lead of their own. A person assigns it an epic
// of such a project, never one of a project with an active lead; it reads and places the epic's children as a project's
// lead does, on that project's seats and the workspace's Developer seats, and only where the issue's project has no
// lead; and each epic's own children wake it: one done, one blocked, one idle. Token-facing routes accept only cuid-shaped ids.
const owner = 'cowner00001', lee = 'clee0000001', lena = 'clena000001', cem = 'ccem0000001', bob = 'cbob0000001', deniz = 'cdeniz00001';
const A = 'cprojecta001', C = 'cprojectc001', D = 'cprojectd001';
const scopes = ['issues:read', 'issues:write', 'user:read'];
const ago = minutes => new Date(Date.now() - minutes * 60_000);
const NOTE = '## Done\nx\n## Decisions\nx\n## Evidence\nx\n## Next\nx';

let db;
after(() => db?.stop());

test('a workspace Lead leads the projects that have no lead (CLB-952)', async t => {
  db = await seatsDatabase(async prisma => {
    await prisma.user.createMany({ data: [owner, lee, lena, cem, bob, deniz].map(id => ({ id, name: id, email: `${id}@example.test` })) });
    await prisma.workspace.create({ data: { id: 'w', name: 'w', slug: 'w', ownerId: owner } });
    await prisma.workspaceMember.createMany({ data: [lee, lena, cem, bob, deniz].map(userId => ({ workspaceId: 'w', userId })) });
    for (const [id, issuePrefix, name] of [[A, 'AA', 'Alpha'], [C, 'CC', 'Gamma'], [D, 'DD', 'Delta']]) {
      await prisma.project.create({ data: { id, workspaceId: 'w', name, slug: id, issuePrefix } });
      await prisma.projectStatus.createMany({ data: ['to_do', 'in_progress', 'done'].map((status, order) => ({ id: `${id}-${status}`, projectId: id, name: status, displayName: status,
        order, isDefault: !order, isFinal: status === 'done' })) });
      await prisma.repository.create({ data: { projectId: id, githubRepoId: id, owner: 'acme', name, fullName: `acme/${name}`, webhookSecret: 'secret' } });
    }
    for (const [id, slug] of [['agent-app', 'collab-agent'], ['person-app', 'collab-cli']]) {
      await prisma.app.create({ data: { id, name: slug, slug, publisherId: 'system', status: 'PUBLISHED', visibility: 'PRIVATE', isSystemApp: true,
        scopes: { create: scopes.map(scope => ({ scope })) } } });
    }
  });
  const raw = db.prisma;
  const prisma = raw.$extends(load('src/lib/issue-visibility.ts').issueVisibilityExtension(Prisma.dmmf.datamodel.models));

  const crypto = { encryptToken: async value => Buffer.from(value), decryptToken: async data => Buffer.from(data).toString(), getEncryptionKey: () => {} };
  const zod = require('zod');
  const response = { NextResponse: Response };
  const globals = { console, URL, Date, Buffer, process: { env: { NEXTAUTH_URL: 'https://collab.test' } } };
  const finder = load('src/lib/issue-finder.ts', { '@/lib/prisma': { prisma } });
  const handoffs = load('src/lib/agent-handoffs.ts', { 'node:crypto': require('node:crypto'), 'node:buffer': require('node:buffer'), zod,
    '@/lib/prisma': { prisma }, '@/lib/issue-finder': finder, '@/lib/oauth-scopes': load('src/lib/oauth-scopes.ts') }, { Date });
  const tokens = load('src/lib/agent-tokens.ts', { crypto: require('node:crypto'), '@/lib/prisma': { prisma }, '@/lib/apps/crypto': crypto }, { Buffer, Date });
  const assignee = load('src/lib/issue-assignee.ts', { './agent-handoffs': handoffs });
  const seats = load('src/lib/agent-seats.ts', { '@/lib/prisma': { prisma }, '@/lib/agent-handoffs': handoffs, '@/lib/agent-tokens': tokens, '@/lib/issue-assignee': assignee,
    '@/lib/issue-finder': finder }, { Date });
  const runners = load('src/lib/agent-runners.ts', { crypto: require('node:crypto'), '@/lib/prisma': { prisma }, '@/lib/agent-handoffs': handoffs, '@/lib/agent-tokens': tokens,
    '@/lib/agent-seats': seats }, { Date });
  const middleware = load('src/lib/apps/auth-middleware.ts', { crypto: require('node:crypto'), 'next/server': response,
    '@/lib/apps/crypto': crypto, '@/lib/oauth-scopes': load('src/lib/oauth-scopes.ts'), '@/lib/post-access': load('src/lib/post-access.ts'),
    '@/lib/auth-error-diagnostics': load('src/lib/auth-error-diagnostics.ts'), '@/lib/prisma': { prisma } }, globals);
  const http = load('src/lib/agent-handoff-http.ts', { zod, 'next/server': response, './agent-handoffs': handoffs }, globals);
  class ForgeProjectWriteError extends Error {}
  const deps = {
    '@/lib/redis': { publishEvent: async () => true }, zod, '@prisma/client': require('@prisma/client'), 'next/server': response,
    '@/lib/prisma': { prisma, issueTrashPrisma: raw }, '@/lib/issue-finder': finder, '@/lib/issue-assignee': assignee, '@/lib/agent-seats': seats, '@/lib/agent-tokens': tokens,
    '@/lib/agent-handoffs': handoffs, '@/lib/agent-handoff-http': http, '@/lib/agent-runners': runners,
    '@/lib/agent-label-triggers': load('src/lib/agent-label-triggers.ts', { 'node:crypto': require('node:crypto') }),
    '@/lib/permissions': { Permission: {}, canActOnOwnContent: () => true, checkUserPermission: async () => ({ hasPermission: true }),
      checkUserPermissions: async () => ({ undefined: { hasPermission: true } }) },
    '@/utils/html-normalizer': { normalizeDescriptionHTML: value => value },
    '@/lib/forge/legacy-write-guard': { assertLegacyProjectWriteAllowed: async () => {}, assertLegacyIssueWriteAllowed: async () => {}, assertLegacyIssueDeleteAllowed: async () => {}, ForgeProjectWriteError },
    '@/lib/apps/auth-middleware': middleware,
    '@/lib/event-bus': { emitIssueCreated: async () => {}, emitIssueUpdated: async () => {}, emitIssueDeleted: async () => {} },
  };
  deps['@/lib/agent-runs'] = load('src/lib/agent-runs.ts', deps, { Date });
  deps['@/lib/agent-requests'] = load('src/lib/agent-requests.ts', deps, { Date, console });
  deps['@/lib/issue-mutation'] = load('src/lib/issue-mutation.ts', deps);
  const route = path => load(`src/app/api/apps/auth/${path}/route.ts`, deps, globals);
  const item = route('issues/[issueIdOrKey]'), contextRoute = route('issues/[issueIdOrKey]/run-context'), inboxRoute = route('seats/me/inbox'),
    runs = route('runs'), one = route('runs/[id]');

  const send = async (handler, token, method, { body, params = {} } = {}) => {
    const reply = await handler(new Request('https://collab.test/api', { method, headers: { Authorization: `Bearer ${token}` },
      ...(body && { body: JSON.stringify(body) }) }), { params: Promise.resolve(params) });
    return { status: reply.status, body: await reply.json().catch(() => null) };
  };
  const seat = async (name, projectId, role, ownerId) => {
    const made = await seats.createSeat({ workspaceId: 'w', actorId: owner, projectId, role, ownerId, name, expiresInDays: 30 });
    return { ...made.seat, token: made.token.token };
  };
  const leadA = await seat('lead-a', A, 'lead', lee), devCem = await seat('dev-cem', A, 'developer', cem), devC = await seat('dev-c', C, 'developer', lena);
  // Of the whole workspace: Bob's Developer, Deniz's Reviewer, and the workspace's Lead.
  const wsBob = await seat('ws-bob', null, 'developer', bob), wsRev = await seat('ws-rev', null, 'reviewer', deniz), wsLead = await seat('ws-lead', null, 'lead', deniz);
  const personToken = 'collab_person_token';
  await raw.appToken.create({ data: { appId: 'person-app', workspaceId: 'w', userId: owner, installationId: null, accessToken: Buffer.from(personToken).toString('base64'), scopes } });

  let count = 0;
  const issue = (projectId, data = {}) => raw.issue.create({ data: { workspaceId: 'w', projectId, title: `Issue ${++count}`, issueKey: `K-${count}`, statusId: `${projectId}-to_do`, ...data } });
  /** The assignee as `token` sets it through the route every token uses; `[status, error code, its sentence]`. */
  const give = async (token, target, assigneeId) => {
    const reply = await send(item.PATCH, token, 'PATCH', { body: { assigneeId }, params: { issueIdOrKey: target.issueKey } });
    return reply.status === 200 ? [200] : [reply.status, reply.body.error, reply.body.error_description];
  };
  const code = async (token, target, assigneeId) => (await give(token, target, assigneeId)).slice(0, 2);
  const items = async who => { const reply = await send(inboxRoute.GET, who.token, 'GET'); assert.equal(reply.status, 200, JSON.stringify(reply.body)); return reply.body.items; };
  const inbox = async who => (await items(who)).map(entry => [entry.issueKey, entry.reason]);
  const holder = async target => (await raw.issue.findUniqueOrThrow({ where: { id: target.id } })).assigneeId;
  const leadView = async (who, target) => {
    const reply = await send(contextRoute.GET, who.token, 'GET', { params: { issueIdOrKey: target.issueKey } });
    assert.equal(reply.status, 200, JSON.stringify(reply.body));
    return reply.body.lead;
  };
  const start = async (who, target) => {
    const reply = await send(runs.POST, who.token, 'POST', { body: { issue: target.issueKey, generation: 'g1', runner: 'test' } });
    assert.equal(reply.status, 200, JSON.stringify(reply.body));
    return reply.body.run.id;
  };
  const finish = async (who, id, outcome) => {
    const reply = await send(one.PATCH, who.token, 'PATCH', { body: { event: 'finish', generation: 'g1', outcome, note: NOTE, nextStep: 'wait' }, params: { id } });
    assert.equal(reply.status, 200, JSON.stringify(reply.body));
  };
  /** Children as the lead places them: in a run of its own on the epic, which then finishes blocked, long ago. */
  const place = async (lead, epic, on) => {
    const run = await start(lead, epic);
    const made = [];
    for (const to of on) { const child = await issue(epic.projectId, { parentId: epic.id }); assert.deepEqual(await code(lead.token, child, to.userId), [200]); made.push(child); }
    await finish(lead, run, 'blocked');
    await raw.agentRun.updateMany({ where: { issueId: epic.id }, data: { startedAt: ago(101), endedAt: ago(100) } });
    return made;
  };
  /** The children of an earlier case are done with, long ago, so they bring no epic back. */
  const settle = async () => {
    await raw.agentRun.updateMany({ where: { endedAt: null }, data: { endedAt: new Date(), state: 'stopped' } });
    for (const project of [A, C, D]) await raw.issue.updateMany({ where: { type: { not: 'EPIC' }, projectId: project }, data: { statusId: `${project}-done`, updatedAt: ago(500) } });
  };
  t.beforeEach(settle);

  const epicA = await issue(A, { type: 'EPIC' }), epicC = await issue(C, { type: 'EPIC' }), epicD = await issue(D, { type: 'EPIC' });

  await t.test('a person assigns the workspace Lead an epic of a project without a lead, and never one of a project with its own', async () => {
    assert.deepEqual(await give(personToken, epicC, wsLead.userId), [200]);
    assert.deepEqual(await give(personToken, epicD, wsLead.userId), [200]);
    const [status, error, sentence] = await give(personToken, epicA, wsLead.userId);
    assert.deepEqual([status, error], [409, 'project_has_lead']);
    assert.match(sentence, /lead-a/, 'the refusal names the project\'s own lead');
    assert.equal(await holder(epicA), null);
    // The project's own lead is given it as before.
    assert.deepEqual(await give(personToken, epicA, leadA.userId), [200]);
    // Its inbox offers the epics of each project, each with its project.
    const offered = await items(wsLead);
    assert.deepEqual(offered.map(entry => [entry.issueKey, entry.reason, entry.project]).sort(), [
      [epicC.issueKey, 'assigned', { id: C, name: 'Gamma', issuePrefix: 'CC' }],
      [epicD.issueKey, 'assigned', { id: D, name: 'Delta', issuePrefix: 'DD' }],
    ]);
    // A project seat's inbox is as it was: no project on its items.
    assert.deepEqual((await items(leadA)).map(entry => [entry.issueKey, 'project' in entry]), [[epicA.issueKey, false]]);
  });

  await t.test('it reads the epic with the project\'s seats and the workspace\'s Developer seats, as a project\'s lead does', async () => {
    const view = await leadView(wsLead, epicC);
    assert.ok(view, 'the run context has the lead\'s list');
    assert.equal(view.cap, 3);
    assert.deepEqual(view.seats.map(found => found.name).sort(), ['dev-c', 'ws-bob'], 'the project\'s seats and the workspace\'s Developers, not itself or another role');
    assert.deepEqual((await leadView(leadA, epicA)).seats.map(found => found.name).sort(), ['dev-cem', 'ws-bob'], 'a project\'s lead reads what it read before');
  });

  await t.test('it places children of a project without a lead on that project\'s seats and the workspace\'s Developers, and nothing else', async () => {
    const run = await start(wsLead, epicC);
    const [c1, c2, c3, c4, c5] = [await issue(C, { parentId: epicC.id }), await issue(C, { parentId: epicC.id }), await issue(C, { parentId: epicC.id }),
      await issue(C, { parentId: epicC.id }), await issue(C, { parentId: epicC.id })];
    assert.deepEqual(await code(wsLead.token, c1, devC.userId), [200]);
    assert.deepEqual(await code(wsLead.token, c2, wsBob.userId), [200]);
    assert.deepEqual([await holder(c1), await holder(c2)], [devC.userId, wsBob.userId]);
    assert.deepEqual(await inbox(devC), [[c1.issueKey, 'assigned']]);
    // Not another project's seat, not a workspace seat of another role, not itself.
    assert.deepEqual(await code(wsLead.token, c3, devCem.userId), [403, 'wrong_project']);
    assert.deepEqual(await code(wsLead.token, c4, wsRev.userId), [422, 'role_mismatch']);
    assert.deepEqual(await code(wsLead.token, c5, wsLead.userId), [403, 'seat_scope']);
    // Not a child of a project with its own lead.
    const ofA = await issue(A, { parentId: epicA.id });
    assert.deepEqual(await code(wsLead.token, ofA, devCem.userId), [403, 'wrong_project']);
    assert.deepEqual([await holder(c3), await holder(c4), await holder(c5), await holder(ofA)], [null, null, null, null]);
    // The project's own lead still may not place across projects.
    assert.deepEqual(await code(leadA.token, c3, devC.userId), [403, 'wrong_project']);
    await finish(wsLead, run, 'blocked');
  });

  await t.test('the children it waits for are measured per epic: one done, one blocked and one idle each wake it once', async () => {
    // The epics were given to it long before the runs below.
    await raw.issueAssignee.updateMany({ where: { issueId: { in: [epicC.id, epicD.id] } }, data: { assignedAt: ago(1000), approvedAt: ago(1000) } });
    const [doneC, blockedC] = await place(wsLead, epicC, [devC, wsBob]);
    const [idleD] = await place(wsLead, epicD, [wsBob]);
    assert.deepEqual(await inbox(wsLead), [], 'nothing has happened to a child since its last run');
    await raw.issue.update({ where: { id: doneC.id }, data: { statusId: `${C}-done` } });
    assert.deepEqual(await inbox(wsLead), [[epicC.issueKey, 'child_done']], 'a child of epic C wakes epic C only');
    await finish(wsLead, await start(wsLead, epicC), 'blocked');
    assert.deepEqual(await inbox(wsLead), [], 'once');
    const childRun = await start(wsBob, blockedC);
    await raw.agentRun.update({ where: { id: childRun }, data: { state: 'finished', outcome: 'blocked', endedAt: new Date() } });
    assert.deepEqual(await inbox(wsLead), [[epicC.issueKey, 'child_blocked']]);
    await finish(wsLead, await start(wsLead, epicC), 'blocked');
    // A seat has held epic D's child for over two hours with no run.
    await raw.issueAssignee.updateMany({ where: { issueId: idleD.id }, data: { assignedAt: ago(130), approvedAt: ago(130) } });
    assert.deepEqual(await inbox(wsLead), [[epicD.issueKey, 'child_idle']]);
    await finish(wsLead, await start(wsLead, epicD), 'blocked');
    assert.deepEqual(await inbox(wsLead), [], 'once');
  });

  // Last: it gives project D a lead of its own.
  await t.test('a project that gets its own lead: the workspace Lead places nothing more there', async () => {
    const run = await start(wsLead, epicD);
    const before = await issue(D, { parentId: epicD.id });
    assert.deepEqual(await code(wsLead.token, before, wsBob.userId), [200]);
    await seat('lead-d', D, 'lead', lena);
    const after = await issue(D, { parentId: epicD.id });
    const [status, error, sentence] = await give(wsLead.token, after, wsBob.userId);
    assert.deepEqual([status, error], [409, 'project_has_lead']);
    assert.match(sentence, /lead-d/);
    assert.equal(await holder(after), null);
    assert.equal(await leadView(wsLead, epicD), undefined, 'its run context no longer lists seats for it there');
    await finish(wsLead, run, 'blocked');
  });
});
