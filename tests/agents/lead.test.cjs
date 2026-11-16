const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { Prisma } = require('@prisma/client');
const { load } = require('../security/helpers.cjs');
const { seatsDatabase } = require('./seats-db.cjs');

// Token-facing routes accept only cuid-shaped ids.
const owner = 'cowner00001', person = 'cperson0001';
const A = 'cprojecta001', B = 'cprojectb001';
const scopes = ['issues:read', 'issues:write', 'user:read'];
const ago = minutes => new Date(Date.now() - minutes * 60_000);
const NOTE = '## Done\nx\n## Decisions\nx\n## Evidence\nx\n## Next\nx';

let db;
after(() => db?.stop());

test('lead seat: assigns its project\'s issues to seats, within a limit, and is woken by what happens to them', async t => {
  db = await seatsDatabase(async prisma => {
    await prisma.user.createMany({ data: [{ id: owner, name: owner }, { id: person, name: person, email: 'person@collab.test' }] });
    await prisma.workspace.create({ data: { id: 'w', name: 'w', slug: 'w', ownerId: owner } });
    await prisma.workspaceMember.create({ data: { workspaceId: 'w', userId: person } });
    for (const id of [A, B]) {
      await prisma.project.create({ data: { id, workspaceId: 'w', name: id, slug: id, issuePrefix: id === A ? 'AA' : 'BB' } });
      await prisma.projectStatus.createMany({ data: ['to_do', 'in_progress', 'done'].map((name, order) => ({ id: `${id}-${name}`, projectId: id, name, displayName: name, order, isDefault: !order, isFinal: name === 'done' })) });
    }
    for (const [id, slug] of [['agent-app', 'collab-agent'], ['person-app', 'collab-cli']]) {
      await prisma.app.create({ data: { id, name: slug, slug, publisherId: 'system', status: 'PUBLISHED', visibility: 'PRIVATE', isSystemApp: true,
        scopes: { create: scopes.map(scope => ({ scope })) } } });
    }
  });
  // The application's client, so Trash is hidden here as it is in production.
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
  const seats = load('src/lib/agent-seats.ts', { '@/lib/prisma': { prisma }, '@/lib/agent-handoffs': handoffs, '@/lib/agent-tokens': tokens, '@/lib/issue-assignee': assignee }, { Date });
  const middleware = load('src/lib/apps/auth-middleware.ts', { crypto: require('node:crypto'), 'next/server': response,
    '@/lib/apps/crypto': crypto, '@/lib/oauth-scopes': load('src/lib/oauth-scopes.ts'), '@/lib/post-access': load('src/lib/post-access.ts'),
    '@/lib/auth-error-diagnostics': load('src/lib/auth-error-diagnostics.ts'), '@/lib/prisma': { prisma } }, globals);
  const deps = { zod, '@prisma/client': require('@prisma/client'), 'next/server': response,
    '@/lib/prisma': { prisma, issueTrashPrisma: raw }, '@/lib/issue-finder': finder, '@/lib/issue-assignee': assignee, '@/lib/agent-seats': seats, '@/lib/agent-tokens': tokens,
    '@/lib/agent-handoffs': handoffs, '@/lib/agent-handoff-http': load('src/lib/agent-handoff-http.ts', { zod, 'next/server': response, './agent-handoffs': handoffs }, globals),
    '@/lib/agent-label-triggers': load('src/lib/agent-label-triggers.ts', { 'node:crypto': require('node:crypto') }),
    '@/lib/permissions': { Permission: {}, canActOnOwnContent: () => true, checkUserPermission: async () => ({ hasPermission: true }),
      checkUserPermissions: async () => ({ undefined: { hasPermission: true } }) },
    '@/utils/html-normalizer': { normalizeDescriptionHTML: value => value },
    '@/lib/forge/legacy-write-guard': { assertLegacyProjectWriteAllowed: async () => {}, assertLegacyIssueWriteAllowed: async () => {}, assertLegacyIssueDeleteAllowed: async () => {}, ForgeProjectWriteError: class extends Error {} },
    '@/lib/apps/auth-middleware': middleware,
    '@/lib/event-bus': { emitIssueCreated: async () => {}, emitIssueUpdated: async () => {}, emitIssueDeleted: async () => {} },
  };
  deps['@/lib/issue-mutation'] = load('src/lib/issue-mutation.ts', deps);
  deps['@/lib/agent-runs'] = load('src/lib/agent-runs.ts', deps, { Date });
  const route = path => load(`src/app/api/apps/auth/${path}/route.ts`, deps, globals);
  const issues = route('issues'), item = route('issues/[issueIdOrKey]'), assign = route('issues/[issueIdOrKey]/assign'),
    comments = route('issues/[issueIdOrKey]/comments'), contextRoute = route('issues/[issueIdOrKey]/run-context'),
    inboxRoute = route('seats/me/inbox'), runs = route('runs'), one = route('runs/[id]');

  const send = async (handler, token, method, { body, params = {} } = {}) => {
    const reply = await handler(new Request('https://collab.test/api', { method, headers: { Authorization: `Bearer ${token}` },
      ...(body && { body: JSON.stringify(body) }) }), { params: Promise.resolve(params) });
    return { status: reply.status, body: await reply.json().catch(() => null) };
  };
  const seat = async (name, projectId, role = 'developer') => {
    const made = await seats.createSeat({ workspaceId: 'w', actorId: owner, projectId, role, ownerId: person, name, expiresInDays: 30 });
    return { ...made.seat, token: made.token.token };
  };
  const personToken = 'collab_person_token';
  await raw.appToken.create({ data: { appId: 'person-app', workspaceId: 'w', userId: person, installationId: null,
    accessToken: Buffer.from(personToken).toString('base64'), scopes } });

  let count = 0;
  const issue = (projectId, data = {}) => raw.issue.create({ data: { workspaceId: 'w', projectId, title: `Issue ${++count}`, issueKey: `K-${count}`, statusId: `${projectId}-to_do`, ...data } });
  /** The assignee as `token` sets it through the route every token uses; `[status, error code]`. */
  const give = async (token, target, assigneeId) => {
    const reply = await send(item.PATCH, token, 'PATCH', { body: { assigneeId }, params: { issueIdOrKey: target.issueKey } });
    return [reply.status, reply.status === 200 ? undefined : reply.body.error];
  };
  /** What a person's edit on the web leaves: the assignee, and the person's hand on the row that made it so. */
  const personGives = async (target, userId) => {
    await raw.issue.update({ where: { id: target.id }, data: { assigneeId: userId } });
    const row = { role: 'ASSIGNEE', status: 'APPROVED', approvedAt: new Date(), approvedBy: person };
    if (userId) await raw.issueAssignee.upsert({ where: { issueId_userId: { issueId: target.id, userId } }, create: { issueId: target.id, userId, ...row }, update: row });
  };
  const inbox = async who => (await send(inboxRoute.GET, who.token, 'GET')).body.items.map(entry => [entry.issueKey, entry.reason]);
  const start = async (who, target) => {
    const reply = await send(runs.POST, who.token, 'POST', { body: { issue: target.issueKey, generation: 'g1', runner: 'test' } });
    assert.equal(reply.status, 200, JSON.stringify(reply.body));
    return reply.body.run.id;
  };
  const finish = async (who, id, outcome, extra = {}) => {
    const reply = await send(one.PATCH, who.token, 'PATCH', { body: { event: 'finish', generation: 'g1', outcome, note: NOTE, ...extra }, params: { id } });
    return [reply.status, reply.status === 200 ? undefined : reply.body.error];
  };
  /** One whole session on an issue. */
  const work = async (who, target, outcome, extra) => assert.deepEqual(await finish(who, await start(who, target), outcome, extra), [200, undefined]);
  const holder = async target => (await raw.issue.findUniqueOrThrow({ where: { id: target.id } })).assigneeId;

  const lead = await seat('lead-a', A, 'lead'), devA = await seat('dev-a', A), otherA = await seat('other-a', A), reviewerA = await seat('reviewer-a', A, 'reviewer');
  const leadB = await seat('lead-b', B, 'lead'), devB = await seat('dev-b', B);

  await t.test('lead assignment rechecks the lead and issue inside the transaction', async () => {
    let change, inside;
    const racingSeats = { ...seats, assertTokenMayAssign: async (...args) => {
      const result = await seats.assertTokenMayAssign(...args);
      if (change && (args[0] === prisma) !== inside) { const run = change; change = null; await run(); }
      return result;
    } };
    const racingItem = load('src/app/api/apps/auth/issues/[issueIdOrKey]/route.ts', { ...deps, '@/lib/agent-seats': racingSeats }, globals);
    // `within`: the change lands after the transaction's first read, not before the transaction.
    const race = async (target, action, within = false) => {
      change = action; inside = within;
      const reply = await send(racingItem.PATCH, lead.token, 'PATCH', { body: { assigneeId: devA.userId }, params: { issueIdOrKey: target.issueKey } });
      return [reply.status, reply.body.error];
    };
    const moved = await issue(A);
    assert.deepEqual(await race(moved, () => raw.issue.update({ where: { id: moved.id }, data: { projectId: B } })), [403, 'wrong_project']);
    assert.equal(await holder(moved), null);
    const request = await issue(A);
    assert.deepEqual(await race(request, () => raw.issue.update({ where: { id: request.id }, data: { agentRequestRole: 'review' } })), [422, 'role_mismatch']);
    assert.equal(await holder(request), null);
    const retired = await issue(A);
    assert.deepEqual(await race(retired, () => raw.agentSeat.update({ where: { id: lead.id }, data: { retiredAt: new Date() } })), [403, 'seat_scope']);
    assert.equal(await holder(retired), null);
    await raw.agentSeat.update({ where: { id: lead.id }, data: { retiredAt: null } });
    // A seat's row written while the placement runs (its inbox stamps it) is a conflict to retry, not a server error.
    const stamped = await issue(A);
    assert.deepEqual(await race(stamped, () => raw.agentSeat.update({ where: { id: devA.id }, data: { lastSeenAt: new Date() } }), true), [409, 'issue_conflict']);
    assert.equal(await holder(stamped), null);
    assert.deepEqual(await give(lead.token, stamped, devA.userId), [200, undefined]);
  });

  await t.test('a project has one lead seat; it takes ordinary issues and no requests', async () => {
    await assert.rejects(seat('lead-a2', A, 'lead'), error => error.code === 'lead_seat_exists' && error.status === 409);
    assert.deepEqual(await give(personToken, await issue(A, { type: 'EPIC' }), lead.userId), [200, undefined]);
    assert.deepEqual(await give(personToken, await issue(A, { agentRequestRole: 'developer' }), lead.userId), [422, 'role_mismatch']);
  });

  await t.test('a lead gives an issue of its project to another seat of that project, and nothing else', async () => {
    const child = await issue(A);
    assert.deepEqual(await give(lead.token, child, devA.userId), [200, undefined]);
    assert.equal(await holder(child), devA.userId);
    assert.equal((await raw.issueAssignee.findFirstOrThrow({ where: { issueId: child.id, userId: devA.userId } })).approvedBy, lead.userId);
    // One entry on the timeline, under the lead's name, and it names the seat.
    const entries = await raw.issueActivity.findMany({ where: { itemId: child.id, fieldName: 'assignee' } });
    assert.deepEqual(entries.map(entry => [entry.action, entry.userId, entry.newValue, JSON.parse(entry.details).to]), [['LEAD_ASSIGNED', lead.userId, devA.userId, 'dev-a']]);

    const free = () => issue(A);
    // Any other seat still changes no assignee, also to a seat of its project.
    assert.deepEqual(await give(devA.token, await free(), otherA.userId), [403, 'seat_scope']);
    // Not to a person, not to itself, and it takes an issue from nobody.
    assert.deepEqual(await give(lead.token, await free(), person), [403, 'seat_scope']);
    assert.deepEqual(await give(lead.token, await free(), lead.userId), [403, 'seat_scope']);
    assert.deepEqual(await give(lead.token, child, null), [403, 'seat_scope']);
    assert.equal(await holder(child), devA.userId);
    // Not across projects, either way.
    assert.deepEqual(await give(lead.token, await free(), devB.userId), [403, 'wrong_project']);
    assert.deepEqual(await give(lead.token, await issue(B), devB.userId), [403, 'wrong_project']);
    // A seat gets only what its role takes, and a retired seat nothing.
    assert.deepEqual(await give(lead.token, await free(), reviewerA.userId), [422, 'role_mismatch']);
    const gone = await seat('gone-a', A);
    await seats.retireSeat({ workspaceId: 'w', actorId: owner, seatId: gone.id });
    assert.deepEqual(await give(lead.token, await free(), gone.userId), [400, 'assignee_not_found']);
    // Only an existing issue, and only through the one route.
    const created = await send(issues.POST, lead.token, 'POST', { body: { title: 'New', projectId: A, assigneeId: devA.userId } });
    assert.deepEqual([created.status, created.body.error], [403, 'seat_scope']);
    const assigned = await send(assign.POST, lead.token, 'POST', { body: { assigneeId: devA.userId }, params: { issueIdOrKey: (await free()).issueKey } });
    assert.deepEqual([assigned.status, assigned.body.error], [403, 'seat_scope']);
  });

  await t.test('what someone else decided stands: the lead moves only its own placement', async () => {
    const byPerson = await issue(A);
    await personGives(byPerson, otherA.userId);
    assert.deepEqual(await give(lead.token, byPerson, devA.userId), [403, 'assign_by_person']);

    const moved = await issue(A);
    assert.deepEqual(await give(lead.token, moved, devA.userId), [200, undefined]);
    assert.deepEqual(await give(lead.token, moved, otherA.userId), [200, undefined]);
    // A person gives it back to the first seat: now it is the person's choice, though the lead once made the same one.
    await personGives(moved, devA.userId);
    assert.deepEqual(await give(lead.token, moved, otherA.userId), [403, 'assign_by_person']);

    const taken = await issue(A);
    assert.deepEqual(await give(lead.token, taken, devA.userId), [200, undefined]);
    await personGives(taken, null);
    assert.deepEqual(await give(lead.token, taken, devA.userId), [403, 'assign_by_person']);
    assert.equal(await holder(taken), null);
  });

  await t.test('a seat holds at most three open issues from the lead, and the server counts', async () => {
    const capped = await seat('capped-a', A);
    // What a person gave the seat is not the lead's.
    for (let n = 0; n < 2; n++) await personGives(await issue(A), capped.userId);
    const placed = [];
    for (let n = 0; n < 3; n++) { placed.push(await issue(A)); assert.deepEqual(await give(lead.token, placed[n], capped.userId), [200, undefined]); }
    const fourth = await issue(A);
    assert.deepEqual(await give(lead.token, fourth, capped.userId), [429, 'lead_cap']);
    assert.equal(await holder(fourth), null);
    // Another seat has its own count.
    assert.deepEqual(await give(lead.token, fourth, otherA.userId), [200, undefined]);
    // A slot is free once one of the three is done.
    await raw.issue.update({ where: { id: placed[0].id }, data: { statusId: `${A}-done` } });
    const next = await issue(A);
    assert.deepEqual(await give(lead.token, next, capped.userId), [200, undefined]);

    // A done issue is not counted, so it is not placed either, nor is one the same call marks done: reopened, they would pass the limit.
    const closed = await issue(A, { statusId: `${A}-done` }), closing = await issue(A);
    assert.deepEqual(await give(lead.token, closed, otherA.userId), [403, 'seat_scope']);
    const both = await send(item.PATCH, lead.token, 'PATCH', { body: { assigneeId: otherA.userId, status: 'done' }, params: { issueIdOrKey: closing.issueKey } });
    assert.deepEqual([both.status, both.body.error], [403, 'seat_scope']);
    assert.deepEqual([await holder(closed), await holder(closing)], [null, null]);
    assert.equal(await raw.issueActivity.count({ where: { itemId: { in: [closed.id, closing.id] }, action: 'LEAD_ASSIGNED' } }), 0);

    // Two placements at once that each fit: one gets in.
    const raced = await seat('raced-a', A);
    for (let n = 0; n < 2; n++) assert.deepEqual(await give(lead.token, await issue(A), raced.userId), [200, undefined]);
    const pair = [await issue(A), await issue(A)];
    const results = await Promise.all(pair.map(target => give(lead.token, target, raced.userId)));
    assert.equal(results.filter(([status]) => status === 200).length, 1, JSON.stringify(results));
    assert.ok(results.some(([status, code]) => (status === 409 && code === 'issue_conflict') || (status === 429 && code === 'lead_cap')), JSON.stringify(results));
    assert.equal(await raw.issue.count({ where: { assigneeId: raced.userId } }), 3);
  });

  await t.test('an epic with three children and one developer seat is worked through with no person assigning', async () => {
    const epic = await issue(B, { type: 'EPIC' });
    const [first, second, third] = [await issue(B, { parentId: epic.id }), await issue(B, { parentId: epic.id }), await issue(B, { parentId: epic.id })];
    await personGives(epic, leadB.userId);
    assert.deepEqual(await inbox(leadB), [[epic.issueKey, 'assigned']]);

    let run = await start(leadB, epic);
    const context = (await send(contextRoute.GET, leadB.token, 'GET', { params: { issueIdOrKey: epic.issueKey } })).body;
    assert.deepEqual(context.children.map(child => [child.issueKey, child.category, child.assigneeId, child.lastRun]),
      [first, second, third].map(child => [child.issueKey, 'todo', null, null]));
    assert.deepEqual(context.lead, { cap: 3, seats: [{ userId: devB.userId, name: 'dev-b', role: 'developer', openFromLead: 0 }] });
    assert.ok(context.commands.includes('collab issues update CHILD_KEY --assignee-id SEAT_USER_ID'));
    assert.deepEqual(await give(leadB.token, first, devB.userId), [200, undefined]);
    // The lead waits for its children: blocked, with nothing named.
    assert.deepEqual(await finish(leadB, run, 'blocked'), [200, undefined]);
    assert.deepEqual(await inbox(leadB), []);
    assert.deepEqual(await inbox(devB), [[first.issueKey, 'assigned']]);

    // The child blocks on a person: the lead is told, asks nobody's question itself, and waits again.
    await work(devB, first, 'blocked', { askedUser: person });
    assert.deepEqual(await inbox(leadB), [[epic.issueKey, 'child_blocked']]);
    await work(leadB, epic, 'blocked', { askedUser: person });
    assert.deepEqual(await inbox(leadB), []);
    await send(comments.POST, personToken, 'POST', { body: { content: 'Here is the answer' }, params: { issueIdOrKey: first.issueKey } });
    assert.deepEqual(await inbox(devB), [[first.issueKey, 'reply']]);

    // The first child is finished: the epic comes back, and the lead gives out the second.
    await work(devB, first, 'done');
    assert.deepEqual(await inbox(leadB), [[epic.issueKey, 'child_done']]);
    run = await start(leadB, epic);
    const later = (await send(contextRoute.GET, leadB.token, 'GET', { params: { issueIdOrKey: epic.issueKey } })).body;
    assert.deepEqual(later.children[0], { ...later.children[0], category: 'done', assigneeId: devB.userId, assignee: 'dev-b', lastRun: 'done' });
    assert.deepEqual(await give(leadB.token, second, devB.userId), [200, undefined]);
    assert.equal((await send(contextRoute.GET, leadB.token, 'GET', { params: { issueIdOrKey: epic.issueKey } })).body.lead.seats[0].openFromLead, 1);
    assert.deepEqual(await finish(leadB, run, 'blocked'), [200, undefined]);
    assert.deepEqual(await inbox(leadB), []);

    // The second child sits with its seat and no run starts: two hours after it was given, the epic comes back, once.
    const held = { where: { issueId_userId: { issueId: second.id, userId: devB.userId } } };
    // The clock is turned back for everything the lead's last run is measured against.
    await raw.issueAssignee.update({ where: { issueId_userId: { issueId: epic.id, userId: leadB.userId } }, data: { approvedAt: ago(300) } });
    await raw.issue.update({ where: { id: first.id }, data: { updatedAt: ago(200) } });
    await raw.agentRun.updateMany({ where: { issueId: epic.id }, data: { startedAt: ago(101), endedAt: ago(100) } });
    await raw.issueAssignee.update({ ...held, data: { approvedAt: ago(119) } });
    assert.deepEqual(await inbox(leadB), []);
    await raw.issueAssignee.update({ ...held, data: { approvedAt: ago(121) } });
    assert.deepEqual(await inbox(leadB), [[epic.issueKey, 'child_idle']]);
    // A run that started after the child was given means it did not sit.
    const began = await raw.agentRun.create({ data: { workspaceId: 'w', issueId: second.id, seatId: devB.id, userId: devB.userId, runner: 'test', generation: 'g0',
      state: 'stopped', startedAt: ago(110), endedAt: ago(105) } });
    assert.deepEqual(await inbox(leadB), []);
    await raw.agentRun.delete({ where: { id: began.id } });
    await work(leadB, epic, 'blocked');
    assert.deepEqual(await inbox(leadB), []);

    await work(devB, second, 'done');
    assert.deepEqual(await inbox(leadB), [[epic.issueKey, 'child_done']]);
    run = await start(leadB, epic);
    assert.deepEqual(await give(leadB.token, third, devB.userId), [200, undefined]);
    assert.deepEqual(await finish(leadB, run, 'blocked'), [200, undefined]);
    await work(devB, third, 'done');
    assert.deepEqual(await inbox(leadB), [[epic.issueKey, 'child_done']]);

    // Every child is done: there is nothing left to wait for, and the lead finishes the epic.
    run = await start(leadB, epic);
    assert.deepEqual(await finish(leadB, run, 'blocked'), [422, 'exit_state_required']);
    assert.deepEqual(await finish(leadB, run, 'done'), [200, undefined]);
    assert.equal((await raw.issue.findUniqueOrThrow({ where: { id: epic.id } })).statusId, `${B}-done`);
    assert.deepEqual(await inbox(leadB), []);
  });

  await t.test('a child that finishes while the lead\'s session runs still brings the epic back; a blocked status alone does not', async () => {
    const epic = await issue(B, { type: 'EPIC' });
    const [first, second] = [await issue(B, { parentId: epic.id }), await issue(B, { parentId: epic.id })];
    await personGives(epic, leadB.userId);
    const run = await start(leadB, epic);
    assert.deepEqual(await give(leadB.token, first, devB.userId), [200, undefined]);
    // Done before the lead's session ends: the session may not have seen it.
    await work(devB, first, 'done');
    assert.deepEqual(await finish(leadB, run, 'blocked'), [200, undefined]);
    assert.deepEqual(await inbox(leadB), [[epic.issueKey, 'child_done']]);
    // The next session starts after it, so it is not news a second time.
    await work(leadB, epic, 'blocked');
    assert.deepEqual(await inbox(leadB), []);
    await raw.issue.update({ where: { id: second.id }, data: { statusId: `${B}-done` } });
    assert.deepEqual(await inbox(leadB), [[epic.issueKey, 'child_done']]);
    await work(leadB, epic, 'done');

    // An epic that sits in a blocked status and was never run: its children say nothing yet.
    await raw.projectStatus.create({ data: { id: `${B}-blocked`, projectId: B, name: 'blocked', displayName: 'blocked', order: 5, category: 'blocked' } });
    const parked = await issue(B, { type: 'EPIC', statusId: `${B}-blocked` });
    await personGives(parked, leadB.userId);
    await issue(B, { parentId: parked.id, statusId: `${B}-done` });
    assert.deepEqual(await inbox(leadB), []);
  });

  await t.test('a seat that is not a lead waits for no child, as before', async () => {
    const parent = await issue(B), child = await issue(B, { parentId: parent.id });
    await personGives(parent, devB.userId);
    const run = await start(devB, parent);
    assert.deepEqual(await finish(devB, run, 'blocked'), [422, 'exit_state_required']);
    assert.deepEqual(await finish(devB, run, 'blocked', { askedUser: person }), [200, undefined]);
    await raw.issue.update({ where: { id: child.id }, data: { statusId: `${B}-done` } });
    assert.deepEqual(await inbox(devB), []);
    // Its run context lists the child and nothing about a lead.
    const context = (await send(contextRoute.GET, devB.token, 'GET', { params: { issueIdOrKey: parent.issueKey } })).body;
    assert.deepEqual([context.children.length, context.lead], [1, undefined]);
  });
});
