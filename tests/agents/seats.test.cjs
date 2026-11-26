const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('../security/helpers.cjs');
const { seatsDatabase } = require('./seats-db.cjs');

// Token-facing routes accept only cuid-shaped ids.
const owner = 'cowner00001', person = 'cperson0001';
const A = 'cprojecta001', B = 'cprojectb001';
const scopes = ['issues:read', 'issues:write', 'projects:read', 'projects:write', 'workspace:read', 'workspace:write', 'user:read'];

let db;
after(() => db?.stop());

test('agent seats: one project, one role, and only the writes a seat is given', async t => {
  db = await seatsDatabase(async prisma => {
    await prisma.user.createMany({ data: [owner, person].map(id => ({ id, name: id })) });
    await prisma.workspace.create({ data: { id: 'w', name: 'w', slug: 'w', ownerId: owner } });
    await prisma.workspaceMember.create({ data: { workspaceId: 'w', userId: person } });
    for (const id of [A, B]) {
      await prisma.project.create({ data: { id, workspaceId: 'w', name: id, slug: id, issuePrefix: id === A ? 'AA' : 'BB' } });
      await prisma.projectStatus.createMany({ data: [
        { projectId: id, name: 'to_do', displayName: 'To Do', order: 0, isDefault: true },
        { projectId: id, name: 'done', displayName: 'Done', order: 1, isFinal: true },
      ] });
    }
    for (const [id, slug] of [['agent-app', 'collab-agent'], ['person-app', 'collab-cli']]) {
      await prisma.app.create({ data: { id, name: slug, slug, publisherId: 'system', status: 'PUBLISHED', visibility: 'PRIVATE', isSystemApp: true,
        scopes: { create: scopes.map(scope => ({ scope })) } } });
    }
    await prisma.taskLabel.create({ data: { id: 'clabelrelease1', workspaceId: 'w', name: 'Release request', color: '#123456' } });
  });
  const { prisma } = db;

  // Tokens are stored readable here: seats are under test, not encryption.
  const crypto = { encryptToken: async value => Buffer.from(value), decryptToken: async data => Buffer.from(data).toString(), getEncryptionKey: () => {} };
  const zod = require('zod');
  const finder = load('src/lib/issue-finder.ts', { '@/lib/prisma': { prisma } });
  const handoffs = load('src/lib/agent-handoffs.ts', { 'node:crypto': require('node:crypto'), 'node:buffer': require('node:buffer'), zod,
    '@/lib/prisma': { prisma }, '@/lib/issue-finder': finder, '@/lib/oauth-scopes': load('src/lib/oauth-scopes.ts') }, { Date });
  const tokens = load('src/lib/agent-tokens.ts', { crypto: require('node:crypto'), '@/lib/prisma': { prisma }, '@/lib/apps/crypto': crypto }, { Buffer, Date });
  const assignee = load('src/lib/issue-assignee.ts', { './agent-handoffs': handoffs });
  const seats = load('src/lib/agent-seats.ts', { '@/lib/prisma': { prisma }, '@/lib/agent-handoffs': handoffs, '@/lib/agent-tokens': tokens, '@/lib/issue-assignee': assignee }, { Date });
  const globals = { console, URL, Date, Buffer };
  const middleware = load('src/lib/apps/auth-middleware.ts', { crypto: require('node:crypto'), 'next/server': { NextResponse: Response },
    '@/lib/apps/crypto': crypto, '@/lib/oauth-scopes': load('src/lib/oauth-scopes.ts'), '@/lib/post-access': load('src/lib/post-access.ts'),
    '@/lib/auth-error-diagnostics': load('src/lib/auth-error-diagnostics.ts'), '@/lib/prisma': { prisma } }, globals);
  const deps = {
    '@/lib/redis': { publishEvent: async (channel, event, timeoutMs) => {
      assert.equal(channel, 'workspace:w:events');
      assert.equal(event.type, 'issue.comments.changed');
      assert.equal(event.workspaceId, 'w');
      assert.equal(timeoutMs, 1000);
      assert.ok(await prisma.issueComment.count({ where: { issueId: event.issueId } }), 'publish follows a persisted comment');
      return true;
    } }, zod, '@prisma/client': require('@prisma/client'), 'next/server': { NextResponse: Response },
    '@/lib/prisma': { prisma, issueTrashPrisma: prisma }, '@/lib/issue-finder': finder, '@/lib/issue-assignee': assignee, '@/lib/agent-seats': seats,
    '@/lib/agent-handoffs': handoffs, '@/lib/agent-handoff-http': load('src/lib/agent-handoff-http.ts', { zod, 'next/server': { NextResponse: Response }, './agent-handoffs': handoffs }, globals),
    '@/lib/permissions': { Permission: {}, canActOnOwnContent: () => true, checkUserPermission: async () => ({ hasPermission: true }),
      checkUserPermissions: async () => ({ undefined: { hasPermission: true } }) },
    '@/utils/html-normalizer': { normalizeDescriptionHTML: value => value },
    '@/lib/forge/legacy-write-guard': { assertLegacyProjectWriteAllowed: async () => {}, assertLegacyIssueWriteAllowed: async () => {}, assertLegacyIssueDeleteAllowed: async () => {}, ForgeProjectWriteError: class extends Error {} },
    '@/lib/apps/auth-middleware': middleware,
    '@/lib/event-bus': { emitIssueCreated: async () => {}, emitIssueUpdated: async () => {}, emitIssueDeleted: async () => {} },
  };
  // The real label rule, so a label on an issue of a project that uses seats files its request.
  deps['@/lib/agent-tokens'] = tokens;
  deps['@/lib/agent-runs'] = load('src/lib/agent-runs.ts', deps, { Date });
  deps['@/lib/agent-label-triggers'] = load('src/lib/agent-label-triggers.ts', { 'node:crypto': require('node:crypto'),
    '@/lib/agent-requests': load('src/lib/agent-requests.ts', deps, { Date }) });
  deps['@/lib/issue-mutation'] = load('src/lib/issue-mutation.ts', deps);
  const route = path => load(`src/app/api/apps/auth/${path}/route.ts`, deps, globals);
  const issues = route('issues'), item = route('issues/[issueIdOrKey]'), assign = route('issues/[issueIdOrKey]/assign'),
    comments = route('issues/[issueIdOrKey]/comments'), relations = route('issues/[issueIdOrKey]/relations'),
    relation = route('issues/[issueIdOrKey]/relations/[relationId]'), restore = route('issues/[issueIdOrKey]/restore'),
    workLogs = route('issues/[issueIdOrKey]/work-logs'), workLog = route('issues/[issueIdOrKey]/work-logs/[workLogId]'),
    seatsMe = route('seats/me');

  const send = async (handler, token, method, { body, params = {}, query = '' } = {}) => {
    const response = await handler(new Request(`https://collab.test/api${query}`, { method, headers: { Authorization: `Bearer ${token}` },
      ...(body && { body: JSON.stringify(body) }) }), { params: Promise.resolve(params) });
    return { status: response.status, body: await response.json().catch(() => null) };
  };
  const seat = async (name, projectId, role, extra = {}) => {
    const made = await seats.createSeat({ workspaceId: 'w', actorId: owner, projectId, role, ownerId: person, name, expiresInDays: 30, ...extra });
    return { ...made.seat, token: made.token.token };
  };
  let count = 0;
  const issue = async (projectId, data = {}) => prisma.issue.create({ data: { workspaceId: 'w', projectId, title: `Issue ${++count}`, issueKey: `FIX-${count}`, ...data } });
  const refuses = (promise, code, status) => assert.rejects(promise, error => error.code === code && error.status === status, `expected ${code}`);

  const devA = await seat('dev-a', A, 'developer');
  const devB = await seat('dev-b', B, 'developer');
  const integration = (await tokens.createAgentToken({ workspaceId: 'w', actorId: owner, name: 'crm', access: 'write', expiresInDays: 30 }));
  const personToken = 'collab_person_token';
  await prisma.appToken.create({ data: { appId: 'person-app', workspaceId: 'w', userId: person, installationId: null,
    accessToken: Buffer.from(personToken).toString('base64'), scopes } });

  await t.test('a seat is created with its token in one step, authenticates, and reads itself', async () => {
    const me = await send(seatsMe.GET, devA.token, 'GET');
    assert.equal(me.status, 200, JSON.stringify(me.body));
    assert.deepEqual(me.body.seat, { id: devA.id, projectId: A, role: 'developer', ownerId: person, name: 'dev-a', isDefault: true });
    assert.deepEqual(me.body.project, { id: A, name: A, issuePrefix: 'AA', agentMode: 'handoffs' });
    const account = await prisma.user.findUniqueOrThrow({ where: { id: devA.userId } });
    assert.equal(account.name, 'dev-a');
  });

  await t.test('a token that is not a seat gets seat_required', async () => {
    for (const token of [personToken, integration.token]) {
      const me = await send(seatsMe.GET, token, 'GET');
      assert.equal(me.status, 403);
      assert.equal(me.body.error, 'seat_required');
    }
  });

  await t.test('the first active seat of a role in a project is its default; a token minted again under the name is the same seat', async () => {
    const second = await seat('dev-a2', A, 'developer');
    assert.equal(second.isDefault, false);
    const rotated = await seat('dev-a2', A, 'developer', { isDefault: true });
    assert.equal(rotated.isDefault, false);
    assert.equal((await prisma.agentSeat.findUniqueOrThrow({ where: { id: devA.id } })).isDefault, true);
    assert.equal((await seat('dev-a', A, 'developer')).isDefault, true);
    const again = await tokens.createAgentToken({ workspaceId: 'w', actorId: owner, name: 'dev-a', access: 'write', expiresInDays: 30 });
    assert.notEqual(again.token, devA.token);
    assert.equal((await send(seatsMe.GET, again.token, 'GET')).body.seat.id, devA.id);
    assert.equal(await prisma.agentSeat.count({ where: { name: 'dev-a' } }), 1);
    // Asking for the default moves it; a project never has two for one role.
    const third = await seat('dev-a3', A, 'developer', { isDefault: true });
    assert.equal(third.isDefault, true);
    assert.equal((await prisma.agentSeat.findUniqueOrThrow({ where: { id: devA.id } })).isDefault, false);
    await prisma.agentSeat.update({ where: { id: third.id }, data: { isDefault: false } });
    await prisma.agentSeat.update({ where: { id: devA.id }, data: { isDefault: true } });
  });

  await t.test('a name that is a seat stays one seat: another project or role is refused, and a project has one release seat', async () => {
    await refuses(seat('dev-a', B, 'developer'), 'seat_exists', 409);
    await refuses(seat('dev-a', A, 'reviewer'), 'seat_exists', 409);
    await seat('rel-b', B, 'release');
    await refuses(seat('rel-b2', B, 'release'), 'release_seat_exists', 409);
    await refuses(seat('ghost', 'cmissing0001', 'developer'), 'project_not_found', 404);
    await refuses(seat('odd', A, 'manager'), 'invalid_role', 400);
    assert.equal(await prisma.user.count({ where: { name: { in: ['rel-b2', 'ghost', 'odd'] } } }), 0, 'a refused seat leaves no account behind');
  });

  await t.test('rule 2 at the middleware: a seat is refused a write on a route that did not opt in', async () => {
    let ran = 0;
    const handler = async () => { ran += 1; return Response.json({ ok: true }); };
    const closed = middleware.withAppAuth(handler), open = middleware.withAppAuth(handler, { seatWrites: true });
    const refused = await send(closed, devA.token, 'POST', { body: {} });
    assert.equal(refused.status, 403);
    assert.equal(refused.body.error, 'seat_scope');
    assert.equal(ran, 0);
    assert.equal((await send(open, devA.token, 'POST', { body: {} })).status, 200);
    assert.equal((await send(closed, devA.token, 'GET')).status, 200, 'a seat reads as a member does');
    for (const wrapped of [closed, open]) for (const token of [personToken, integration.token]) {
      assert.equal((await send(wrapped, token, 'POST', { body: {} })).status, 200);
    }
    assert.equal(ran, 6);
  });

  await t.test('a seat is refused projects POST, workspace PATCH and labels POST', async () => {
    const calls = [[route('projects').POST, 'POST', { name: 'Seat made', issuePrefix: 'SM' }], [route('workspace').PATCH, 'PATCH', { name: 'Renamed' }],
      [route('labels').POST, 'POST', { name: 'seat-label', color: '#000000' }]];
    for (const [handler, method, body] of calls) {
      const refused = await send(handler, devA.token, method, { body });
      assert.equal(refused.status, 403);
      assert.equal(refused.body.error, 'seat_scope');
    }
    assert.equal(await prisma.project.count({ where: { name: 'Seat made' } }), 0);
    assert.equal((await prisma.workspace.findUniqueOrThrow({ where: { id: 'w' } })).name, 'w');
    assert.equal(await prisma.taskLabel.count({ where: { name: 'seat-label' } }), 0);
  });

  await t.test('rule 2 on every route that opts in: project B is refused, the seat\'s own project passes, reading B still works', async () => {
    const fixture = async projectId => {
      const target = await issue(projectId), other = await issue(projectId), trashed = await issue(projectId, { deletedAt: new Date() });
      const link = await prisma.issueRelation.create({ data: { sourceIssueId: target.id, targetIssueId: other.id, relationType: 'RELATES_TO' } });
      const log = await prisma.workLog.create({ data: { issueId: target.id, userId: devA.userId, workspaceId: 'w', timeSpent: 5 } });
      return { target, other, trashed, link, log };
    };
    const writes = f => ({
      'issues POST': () => send(issues.POST, devA.token, 'POST', { body: { title: `Made ${++count}`, projectId: f.target.projectId } }),
      'issue PATCH': () => send(item.PATCH, devA.token, 'PATCH', { body: { title: 'Changed' }, params: { issueIdOrKey: f.target.id } }),
      'comments POST': () => send(comments.POST, devA.token, 'POST', { body: { content: 'A note' }, params: { issueIdOrKey: f.target.id } }),
      'relations POST': () => send(relations.POST, devA.token, 'POST', { body: { targetIssueId: f.other.id, relationType: 'BLOCKS' }, params: { issueIdOrKey: f.target.id } }),
      'relation DELETE': () => send(relation.DELETE, devA.token, 'DELETE', { params: { issueIdOrKey: f.target.id, relationId: f.link.id } }),
      'work-logs POST': () => send(workLogs.POST, devA.token, 'POST', { body: { timeSpent: 10 }, params: { issueIdOrKey: f.target.id } }),
      'work-log PATCH': () => send(workLog.PATCH, devA.token, 'PATCH', { body: { timeSpent: 15 }, params: { issueIdOrKey: f.target.id, workLogId: f.log.id } }),
      'work-log DELETE': () => send(workLog.DELETE, devA.token, 'DELETE', { params: { issueIdOrKey: f.target.id, workLogId: f.log.id } }),
      'restore POST': () => send(restore.POST, devA.token, 'POST', { params: { issueIdOrKey: f.trashed.id }, query: `?projectId=${f.trashed.projectId}` }),
      'issue DELETE': () => send(item.DELETE, devA.token, 'DELETE', { params: { issueIdOrKey: f.target.id }, query: `?projectId=${f.target.projectId}` }),
    });
    const foreign = await fixture(B);
    const before = JSON.stringify(await prisma.issue.findMany({ where: { projectId: B }, orderBy: { id: 'asc' } }));
    const rows = () => Promise.all([prisma.issueComment.count(), prisma.issueRelation.count(), prisma.workLog.count(), prisma.issue.count({ where: { projectId: B } })]);
    const counted = await rows();
    for (const [name, write] of Object.entries(writes(foreign))) {
      const refused = await write();
      assert.equal(refused.status, 403, `${name} on project B answered ${refused.status} ${JSON.stringify(refused.body)}`);
      assert.equal(refused.body.error, 'wrong_project', name);
    }
    assert.deepEqual(await rows(), counted);
    assert.equal(JSON.stringify(await prisma.issue.findMany({ where: { projectId: B }, orderBy: { id: 'asc' } })), before, 'project B is unchanged');
    assert.equal((await send(item.GET, devA.token, 'GET', { params: { issueIdOrKey: foreign.target.id } })).status, 200);

    for (const [name, write] of Object.entries(writes(await fixture(A)))) {
      const done = await write();
      assert.ok(done.status >= 200 && done.status < 300, `${name} on the seat's project answered ${done.status} ${JSON.stringify(done.body)}`);
    }

    // Rule 8: on a request the seat filed in project B, creating a comment is the one write of the table that passes.
    // The token API has no route that edits or deletes a comment.
    const filed = await fixture(B);
    await prisma.issue.update({ where: { id: filed.target.id }, data: { agentRequestRole: 'review', reporterId: devA.userId } });
    const request = () => prisma.issue.findUniqueOrThrow({ where: { id: filed.target.id } }).then(JSON.stringify);
    const [said, ...others] = await rows(), unchanged = await request();
    for (const [name, write] of Object.entries(writes(filed))) {
      const reply = await write();
      assert.equal(reply.status, name === 'comments POST' ? 201 : 403, `${name} on the seat's own request answered ${reply.status} ${JSON.stringify(reply.body)}`);
      if (name !== 'comments POST') assert.equal(reply.body.error, 'wrong_project', name);
    }
    assert.deepEqual(await rows(), [said + 1, ...others]);
    assert.equal(await request(), unchanged, 'the request itself is unchanged');
    // Not on another seat's request, not on a request nobody or a person reported, and not on an issue it reported that is no request.
    for (const data of [{ agentRequestRole: 'review', reporterId: devB.userId }, { agentRequestRole: 'review' }, { agentRequestRole: 'release', reporterId: person }, { reporterId: devA.userId }]) {
      const other = await issue(B, data);
      const refused = await send(comments.POST, devA.token, 'POST', { body: { content: 'A note' }, params: { issueIdOrKey: other.id } });
      assert.equal(refused.body.error, 'wrong_project', JSON.stringify(data));
    }
    assert.equal(await prisma.issueComment.count(), said + 1);
    // A person comments on it as before.
    assert.equal((await send(comments.POST, personToken, 'POST', { body: { content: 'A reply' }, params: { issueIdOrKey: filed.target.id } })).status, 201);
  });

  await t.test('a seat cannot link its issue to another project\'s issue, or make one its parent', async () => {
    const mine = await issue(A), theirs = await issue(B);
    const linked = await send(relations.POST, devA.token, 'POST', { body: { targetIssueId: theirs.id, relationType: 'BLOCKS' }, params: { issueIdOrKey: mine.id } });
    assert.equal(linked.body.error, 'wrong_project');
    const child = await send(item.PATCH, devA.token, 'PATCH', { body: { parentId: theirs.id }, params: { issueIdOrKey: mine.id } });
    assert.equal(child.body.error, 'wrong_project');
    const made = await send(issues.POST, devA.token, 'POST', { body: { title: 'Child of B', projectId: A, parentId: theirs.id } });
    assert.equal(made.body.error, 'wrong_project');
    assert.equal(await prisma.issueRelation.count({ where: { OR: [{ sourceIssueId: theirs.id }, { targetIssueId: theirs.id }] } }), 0);
    await prisma.issue.update({ where: { id: mine.id }, data: { parentId: theirs.id } });
    for (const parentId of [null, mine.id]) {
      const denied = await send(item.PATCH, devA.token, 'PATCH', { body: { parentId }, params: { issueIdOrKey: mine.id } });
      assert.equal(denied.body.error, 'wrong_project');
    }
    await prisma.issue.update({ where: { id: theirs.id }, data: { deletedAt: new Date() } });
    const { Prisma } = require('@prisma/client');
    const visible = prisma.$extends(load('src/lib/issue-visibility.ts').issueVisibilityExtension(Prisma.dmmf.datamodel.models));
    const visibleItem = load('src/app/api/apps/auth/issues/[issueIdOrKey]/route.ts', { ...deps, '@/lib/prisma': { prisma: visible, issueTrashPrisma: prisma } }, globals);
    for (const parentId of [null, mine.id]) {
      const denied = await send(visibleItem.PATCH, devA.token, 'PATCH', { body: { parentId }, params: { issueIdOrKey: mine.id } });
      assert.equal(denied.body.error, 'wrong_project');
    }
    await prisma.issue.update({ where: { id: theirs.id }, data: { deletedAt: null } });
    // A person's token still may, as today.
    const byPerson = await send(relations.POST, personToken, 'POST', { body: { targetIssueId: theirs.id, relationType: 'BLOCKS' }, params: { issueIdOrKey: mine.id } });
    assert.equal(byPerson.status, 201, JSON.stringify(byPerson.body));
  });

  await t.test('a seat cannot change who an issue is assigned to', async () => {
    const mine = await issue(A, { assigneeId: devA.userId });
    const at = { issueIdOrKey: mine.id };
    for (const refused of [
      await send(assign.POST, devA.token, 'POST', { body: { assigneeId: person }, params: at }),
      await send(assign.POST, devA.token, 'POST', { body: { unassign: true }, params: at }),
      await send(item.PATCH, devA.token, 'PATCH', { body: { assigneeId: person }, params: at }),
      await send(item.PATCH, devA.token, 'PATCH', { body: { assigneeId: null }, params: at }),
      await send(issues.POST, devA.token, 'POST', { body: { title: 'For someone', projectId: A, assigneeId: person } }),
    ]) {
      assert.equal(refused.status, 403, JSON.stringify(refused.body));
      assert.equal(refused.body.error, 'seat_scope');
    }
    assert.equal((await prisma.issue.findUniqueOrThrow({ where: { id: mine.id } })).assigneeId, devA.userId);
    assert.equal(await prisma.issue.count({ where: { title: 'For someone' } }), 0);
  });

  const reviewerA = await seat('rev-a', A, 'reviewer');
  const releaseA = await seat('rel-a', A, 'release');

  await t.test('rule 7: a seat is assigned only issues of its project and of its role', async () => {
    const shape = (projectId, agentRequestRole) => ({ workspaceId: 'w', projectId, agentRequestRole });
    const allowed = [[devA, null], [devA, 'developer'], [reviewerA, 'review'], [releaseA, 'release']];
    const mismatched = [[devA, 'review'], [devA, 'release'], [reviewerA, null], [reviewerA, 'developer'], [reviewerA, 'release'], [releaseA, null], [releaseA, 'developer'], [releaseA, 'review']];
    for (const [who, role] of allowed) await assignee.assertAssignable(prisma, shape(A, role), who.userId);
    for (const [who, role] of mismatched) await refuses(assignee.assertAssignable(prisma, shape(A, role), who.userId), 'role_mismatch', 422);
    for (const [who, role] of allowed) await refuses(assignee.assertAssignable(prisma, shape(B, role), who.userId), 'wrong_project', 403);
    await assignee.assertAssignable(prisma, shape(B, 'release'), person);
  });

  await t.test('rule 7 on the paths people use: a label does not make a release request, and the refusal names its code', async () => {
    const labelled = await issue(A, { labels: { connect: { id: 'clabelrelease1' } } });
    const byLabel = await send(assign.POST, personToken, 'POST', { body: { assigneeId: releaseA.userId }, params: { issueIdOrKey: labelled.id } });
    assert.equal(byLabel.status, 422);
    assert.equal(byLabel.body.error, 'role_mismatch');
    const foreign = await send(item.PATCH, personToken, 'PATCH', { body: { assigneeId: devB.userId }, params: { issueIdOrKey: labelled.id } });
    assert.equal(foreign.status, 403);
    assert.equal(foreign.body.error, 'wrong_project');
    assert.equal((await deps['@/lib/issue-mutation'].updateIssue(owner, labelled.id, { assigneeId: releaseA.userId }, 'w')).status, 422);
    assert.equal((await prisma.issue.findUniqueOrThrow({ where: { id: labelled.id } })).assigneeId, null);
    const request = await issue(A, { agentRequestRole: 'release' });
    assert.equal((await send(assign.POST, personToken, 'POST', { body: { assigneeId: releaseA.userId }, params: { issueIdOrKey: request.id } })).status, 200);
    assert.equal((await deps['@/lib/issue-mutation'].updateIssue(owner, labelled.id, { assigneeId: devA.userId }, 'w')).issue.assigneeId, devA.userId);
  });

  await t.test('an agent token that is not a seat gives a seat work only by creating issues, five a day', async () => {
    const create = (token, title) => send(issues.POST, token, 'POST', { body: { title, projectId: A, assigneeId: devA.userId } });
    for (let n = 1; n <= 5; n++) {
      const made = await create(integration.token, `crm ${n}`);
      assert.equal(made.status, 201, JSON.stringify(made.body));
      assert.equal(made.body.assigneeId, devA.userId);
      assert.equal(made.body.warning, undefined);
    }
    await prisma.issue.updateMany({ where: { title: 'crm 1' }, data: { assigneeId: null } });
    const sixth = await create(integration.token, 'crm 6');
    assert.equal(sixth.status, 201);
    assert.equal(sixth.body.assigneeId, null);
    assert.equal(sixth.body.warning, 'assign_cap');
    assert.equal(await prisma.issueAssignee.count({ where: { issueId: sixth.body.id } }), 0);
    // Yesterday's issues do not count, and an issue it assigns to a person is not capped.
    await prisma.appAuditLog.updateMany({ where: { actorId: (await prisma.appToken.findUniqueOrThrow({ where: { id: integration.id } })).userId, action: 'agent_seat.issue_handed' }, data: { createdAt: new Date(Date.now() - 86_400_000) } });
    assert.equal((await create(integration.token, 'crm 7')).body.assigneeId, devA.userId);
    const toPerson = await send(issues.POST, integration.token, 'POST', { body: { title: 'crm person', projectId: A, assigneeId: person } });
    assert.equal(toPerson.body.assigneeId, person);
    // An existing issue reaches a seat only through a person.
    const waiting = { issueIdOrKey: sixth.body.id };
    for (const refused of [await send(assign.POST, integration.token, 'POST', { body: { assigneeId: devA.userId }, params: waiting }),
      await send(item.PATCH, integration.token, 'PATCH', { body: { assigneeId: devA.userId }, params: waiting })]) {
      assert.equal(refused.status, 403, JSON.stringify(refused.body));
      assert.equal(refused.body.error, 'assign_by_person');
    }
    assert.equal((await prisma.issue.findUniqueOrThrow({ where: { id: sixth.body.id } })).assigneeId, null);
    assert.equal((await send(assign.POST, integration.token, 'POST', { body: { assigneeId: person }, params: waiting })).status, 200);
    for (let n = 1; n <= 7; n++) assert.equal((await create(personToken, `person ${n}`)).body.assigneeId, devA.userId, 'a person is never capped');
    assert.equal((await send(assign.POST, personToken, 'POST', { body: { assigneeId: devA.userId }, params: waiting })).status, 200);
  });

  await t.test('CLB-527: a release request by label from a token that is not a seat counts toward its five a day', async () => {
    const actorId = (await prisma.appToken.findUniqueOrThrow({ where: { id: integration.id } })).userId;
    const handed = { actorId, action: 'agent_seat.issue_handed' };
    await prisma.project.update({ where: { id: A }, data: { agentMode: 'seats' } });
    await prisma.appAuditLog.updateMany({ where: handed, data: { createdAt: new Date(Date.now() - 86_400_000) } });
    const ask = async (token, work) => send(item.PATCH, token, 'PATCH', { body: { labels: ['clabelrelease1'] }, params: { issueIdOrKey: work.id } });
    const requests = work => prisma.issue.count({ where: { agentRequestRole: 'release', sourceRelations: { some: { targetIssueId: work.id } } } });
    // One issue for a seat and four release requests are its five.
    assert.equal((await send(issues.POST, integration.token, 'POST', { body: { title: 'crm first', projectId: A, assigneeId: devA.userId } })).body.assigneeId, devA.userId);
    for (let n = 1; n <= 4; n++) {
      const work = await issue(A), asked = await ask(integration.token, work);
      assert.equal(asked.status, 200, JSON.stringify(asked.body));
      assert.equal(await requests(work), 1);
    }
    assert.equal(await prisma.appAuditLog.count({ where: { ...handed, createdAt: { gte: new Date(Date.now() - 60_000) } } }), 5);
    // The sixth is refused whole: no request, and the label is not left on the issue asking nobody.
    const over = await issue(A), sixth = await ask(integration.token, over);
    assert.equal(sixth.status, 429, JSON.stringify(sixth.body));
    assert.equal(sixth.body.error, 'assign_cap');
    assert.equal(await requests(over), 0);
    assert.deepEqual((await prisma.issue.findUniqueOrThrow({ where: { id: over.id }, include: { labels: true } })).labels, []);
    // The same on create: a new issue that brings the label is not filed.
    const before = await prisma.issue.count();
    const born = await send(issues.POST, integration.token, 'POST', { body: { title: 'crm labelled', projectId: A, labels: ['clabelrelease1'] } });
    assert.equal(born.status, 429, JSON.stringify(born.body));
    assert.equal(born.body.error, 'assign_cap');
    assert.equal(await prisma.issue.count(), before);
    // The count is one count: an issue it creates for a seat now waits unassigned.
    assert.equal((await send(issues.POST, integration.token, 'POST', { body: { title: 'crm later', projectId: A, assigneeId: devA.userId } })).body.warning, 'assign_cap');
    // A person and a seat of the project are not counted, and tomorrow the token asks again.
    assert.equal((await ask(personToken, over)).status, 200);
    assert.equal(await requests(over), 1);
    const bySeat = await issue(A);
    assert.equal((await ask(devA.token, bySeat)).status, 200);
    assert.equal(await requests(bySeat), 1);
    await prisma.appAuditLog.updateMany({ where: handed, data: { createdAt: new Date(Date.now() - 86_400_000) } });
    const next = await issue(A);
    // One call that assigns a new issue to a seat and asks for its release hands seats two issues.
    assert.equal((await ask(integration.token, next)).status, 200);
    const two = await send(issues.POST, integration.token, 'POST', { body: { title: 'crm two', projectId: A, assigneeId: devA.userId, labels: ['clabelrelease1'] } });
    assert.equal(two.status, 201, JSON.stringify(two.body));
    assert.equal(await prisma.appAuditLog.count({ where: { ...handed, createdAt: { gte: new Date(Date.now() - 60_000) } } }), 3);
    await prisma.appAuditLog.updateMany({ where: handed, data: { createdAt: new Date(Date.now() - 86_400_000) } });
    const concurrent = await Promise.all([
      send(issues.POST, integration.token, 'POST', { body: { title: 'concurrent assigned', projectId: A, assigneeId: devA.userId } }),
      send(issues.POST, integration.token, 'POST', { body: { title: 'concurrent release', projectId: A, labels: ['clabelrelease1'] } }),
    ]);
    for (const result of concurrent) assert.equal(result.status, 201, JSON.stringify(result.body));
    assert.equal(await prisma.appAuditLog.count({ where: { ...handed, createdAt: { gte: new Date(Date.now() - 60_000) } } }), 2);
    await prisma.project.update({ where: { id: A }, data: { agentMode: 'handoffs' } });
  });

  await t.test('CLB-527: comments can be read from a time on, which is what a wait for a new comment asks', async () => {
    const work = await issue(A), params = { issueIdOrKey: work.id };
    const at = minute => new Date(Date.UTC(2026, 10, 16, 10, minute));
    const parent = await prisma.issueComment.create({ data: { issueId: work.id, authorId: person, content: 'at 0', createdAt: at(0) } });
    await prisma.issueComment.createMany({ data: [{ issueId: work.id, authorId: person, content: 'at 5', createdAt: at(5) },
      { issueId: work.id, authorId: person, parentId: parent.id, content: 'reply at 5', createdAt: at(5) }] });
    const read = async query => (await send(comments.GET, personToken, 'GET', { params, query })).body.comments.map(row => row.content);
    assert.deepEqual((await read('?flat=true')).sort(), ['at 0', 'at 5', 'reply at 5']);
    assert.deepEqual((await read(`?flat=true&since=${at(0).toISOString()}`)).sort(), ['at 5', 'reply at 5']);
    assert.deepEqual((await read(`?since=${at(0).toISOString()}`)).sort(), ['at 5', 'reply at 5']);
    assert.deepEqual(await read(''), ['at 0', 'at 5']);
    assert.deepEqual(await read(`?flat=true&since=${at(5).toISOString()}`), []);
    assert.equal((await send(comments.GET, personToken, 'GET', { params, query: '?since=yesterday' })).status, 400);
  });

  await t.test('review focus 2: an issue moved to another project loses its seat, and the activity says why', async () => {
    const moved = await issue(A, { assigneeId: devA.userId });
    const result = await deps['@/lib/issue-mutation'].updateIssue(owner, moved.id, { projectId: B }, 'w');
    assert.equal(result.status, undefined, JSON.stringify(result));
    assert.equal(result.issue.projectId, B);
    assert.equal(result.issue.assigneeId, null);
    const [entry] = await prisma.issueActivity.findMany({ where: { itemId: moved.id, action: 'UNASSIGNED' } });
    assert.equal(entry.oldValue, devA.userId);
    assert.equal(JSON.parse(entry.details).reason, 'moved_to_another_project');
    const explicit = await issue(A, { assigneeId: devA.userId });
    await prisma.issueAssignee.create({ data: { issueId: explicit.id, userId: devA.userId, role: 'ASSIGNEE', status: 'APPROVED' } });
    assert.equal((await deps['@/lib/issue-mutation'].updateIssue(owner, explicit.id, { projectId: B, assigneeId: null }, 'w')).issue.assigneeId, null);
    const activity = await prisma.issueActivity.findFirstOrThrow({ where: { itemId: explicit.id, action: 'UNASSIGNED' } });
    assert.equal(JSON.parse(activity.details).reason, 'moved_to_another_project');
    assert.equal(await prisma.issueAssignee.count({ where: { issueId: explicit.id } }), 0);
    // A person stays assigned through a move.
    const kept = await issue(A, { assigneeId: person });
    assert.equal((await deps['@/lib/issue-mutation'].updateIssue(owner, kept.id, { projectId: B }, 'w')).issue.assigneeId, person);
    // A seat without a project (CLB-614) belongs to neither project, so it leaves with the issue too.
    const free = await seat('dev-without-project', A, 'developer');
    const held = await issue(A, { assigneeId: free.userId });
    await prisma.agentSeat.update({ where: { id: free.id }, data: { projectId: null } });
    assert.equal((await deps['@/lib/issue-mutation'].updateIssue(owner, held.id, { projectId: B }, 'w')).issue.assigneeId, null);
    await prisma.agentSeat.delete({ where: { id: free.id } });
  });

  await t.test('retirement preserves concurrent reassignment and completion', async () => {
    const worker = await seat('dev-concurrent-retire', A, 'developer');
    const statuses = Object.fromEntries((await prisma.projectStatus.findMany({ where: { projectId: A } })).map(row => [row.name, row.id]));
    const reassigned = await issue(A, { assigneeId: worker.userId, statusId: statuses.to_do });
    const completed = await issue(A, { assigneeId: worker.userId, statusId: statuses.to_do });
    const open = await issue(A, { assigneeId: worker.userId, statusId: statuses.to_do });
    await prisma.issueAssignee.createMany({ data: [reassigned, completed, open].map(row => ({ issueId: row.id, userId: worker.userId, role: 'ASSIGNEE', status: 'APPROVED' })) });
    let release;
    const held = new Promise(resolve => { release = resolve; });
    let ready;
    const locked = new Promise(resolve => { ready = resolve; });
    const competing = prisma.$transaction(async tx => {
      await tx.issue.update({ where: { id: reassigned.id }, data: { assigneeId: person } });
      await tx.issue.update({ where: { id: completed.id }, data: { statusId: statuses.done } });
      ready();
      await held;
    }, { timeout: 15000 });
    await locked;
    const retiring = seats.retireSeat({ workspaceId: 'w', actorId: owner, seatId: worker.id });
    try {
      const deadline = Date.now() + 5000;
      let blocked = false;
      while (!blocked && Date.now() < deadline) {
        const rows = await prisma.$queryRaw`SELECT 1 FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND query LIKE '%UPDATE%' AND query LIKE '%Issue%' AND pid <> pg_backend_pid()`;
        blocked = rows.length > 0;
        if (!blocked) await new Promise(resolve => setTimeout(resolve, 20));
      }
      assert.ok(blocked, 'retirement waits for the competing issue updates');
    } finally {
      release();
      await competing;
    }
    const result = await retiring;
    assert.deepEqual(result.unassigned, [open.issueKey]);
    assert.equal((await prisma.issue.findUniqueOrThrow({ where: { id: reassigned.id } })).assigneeId, person);
    assert.equal((await prisma.issue.findUniqueOrThrow({ where: { id: completed.id } })).assigneeId, worker.userId);
    assert.equal((await prisma.issue.findUniqueOrThrow({ where: { id: open.id } })).assigneeId, null);
    const activities = await prisma.issueActivity.findMany({ where: { itemId: { in: [reassigned.id, completed.id, open.id] }, action: 'UNASSIGNED' } });
    assert.deepEqual(activities.map(row => row.itemId), [open.id]);
    const assignments = await prisma.issueAssignee.findMany({ where: { issueId: { in: [reassigned.id, completed.id, open.id] }, userId: worker.userId } });
    assert.deepEqual(assignments.map(row => row.issueId).sort(), [reassigned.id, completed.id].sort());
  });

  await t.test('a move unseats the old project\'s seat also when the request names a replacement', async () => {
    const replaced = await issue(A, { assigneeId: devA.userId });
    await prisma.issueAssignee.create({ data: { issueId: replaced.id, userId: devA.userId, role: 'ASSIGNEE', status: 'APPROVED' } });
    const result = await deps['@/lib/issue-mutation'].updateIssue(owner, replaced.id, { projectId: B, assigneeId: person }, 'w');
    assert.equal(result.issue.assigneeId, person);
    const [entry] = await prisma.issueActivity.findMany({ where: { itemId: replaced.id, action: 'UNASSIGNED' } });
    assert.equal(entry?.oldValue, devA.userId);
    assert.equal(JSON.parse(entry.details).reason, 'moved_to_another_project');
    assert.deepEqual((await prisma.issueAssignee.findMany({ where: { issueId: replaced.id } })).map(row => row.userId), [person]);
  });

  await t.test('a name that had work before it became a seat keeps only what the seat may hold', async () => {
    const legacy = await tokens.createAgentToken({ workspaceId: 'w', actorId: owner, name: 'legacy', access: 'write', expiresInDays: 30 });
    const account = (await prisma.appToken.findUniqueOrThrow({ where: { id: legacy.id } })).userId;
    const done = (await prisma.projectStatus.findFirstOrThrow({ where: { projectId: B, name: 'done' } })).id;
    const elsewhere = await issue(B, { assigneeId: account }), request = await issue(A, { assigneeId: account, agentRequestRole: 'release' });
    const fitting = await issue(A, { assigneeId: account }), finished = await issue(B, { assigneeId: account, statusId: done });
    const legacyDone = await issue(B, { assigneeId: account, status: '  CLOSED  ', statusValue: '' });
    const made = await seat('legacy', A, 'developer');
    assert.equal(made.userId, account);
    const holder = async row => (await prisma.issue.findUniqueOrThrow({ where: { id: row.id } })).assigneeId;
    assert.deepEqual([await holder(elsewhere), await holder(request), await holder(fitting), await holder(finished)], [null, null, account, account]);
    assert.equal(await holder(legacyDone), account);
    const entries = await prisma.issueActivity.findMany({ where: { itemId: { in: [elsewhere.id, request.id, fitting.id, finished.id] }, action: 'UNASSIGNED' } });
    assert.deepEqual(entries.map(row => row.itemId).sort(), [elsewhere.id, request.id].sort());
    assert.ok(entries.every(row => JSON.parse(row.details).reason === 'seat_created' && row.userId === owner && row.oldValue === account));
    // Its old token is the seat's token from that moment.
    assert.equal((await send(seatsMe.GET, legacy.token, 'GET')).body.seat.id, made.id);
    // A further token for the same seat changes nothing it holds.
    for (const ownerId of [null, owner, 'cnobody00001']) {
      const rotated = await seat('legacy', A, 'developer', { ownerId });
      assert.equal(rotated.ownerId, person);
      assert.equal((await prisma.agentSeat.findUniqueOrThrow({ where: { id: made.id } })).ownerId, person);
      assert.equal((await send(seatsMe.GET, rotated.token, 'GET')).body.seat.ownerId, person);
    }
    assert.equal(await holder(fitting), account);
  });

  await t.test('review focus 5: a seat is not retired while it has a run open; otherwise its open issues are unassigned', async () => {
    const worker = await seat('dev-retire', A, 'developer');
    const statuses = Object.fromEntries((await prisma.projectStatus.findMany({ where: { projectId: A } })).map(row => [row.name, row.id]));
    const open = await issue(A, { assigneeId: worker.userId, statusId: statuses.to_do });
    const bare = await issue(A, { assigneeId: worker.userId });
    const finished = await issue(A, { assigneeId: worker.userId, statusId: statuses.done });
    const legacyDone = await issue(A, { assigneeId: worker.userId, status: 'todo', statusValue: ' Done ' });
    const run = await prisma.agentRun.create({ data: { workspaceId: 'w', issueId: open.id, seatId: worker.id, userId: worker.userId, runner: 'test', generation: 'g1' } });
    await refuses(seats.retireSeat({ workspaceId: 'w', actorId: owner, seatId: worker.id }), 'already_running', 409);
    assert.equal((await prisma.agentSeat.findUniqueOrThrow({ where: { id: worker.id } })).retiredAt, null);
    assert.equal((await prisma.issue.findUniqueOrThrow({ where: { id: open.id } })).assigneeId, worker.userId);

    await prisma.agentRun.update({ where: { id: run.id }, data: { state: 'stopped', endedAt: new Date() } });
    const retired = await seats.retireSeat({ workspaceId: 'w', actorId: owner, seatId: worker.id });
    assert.deepEqual([...retired.unassigned].sort(), [open.issueKey, bare.issueKey].sort());
    for (const row of [open, bare]) {
      assert.equal((await prisma.issue.findUniqueOrThrow({ where: { id: row.id } })).assigneeId, null);
      const [entry] = await prisma.issueActivity.findMany({ where: { itemId: row.id, action: 'UNASSIGNED' } });
      assert.equal(entry.oldValue, worker.userId);
      assert.equal(entry.userId, owner);
      assert.equal(JSON.parse(entry.details).reason, 'seat_retired');
    }
    assert.equal((await prisma.issue.findUniqueOrThrow({ where: { id: finished.id } })).assigneeId, worker.userId, 'finished work keeps its name');
    assert.equal((await prisma.issue.findUniqueOrThrow({ where: { id: legacyDone.id } })).assigneeId, worker.userId);
    await refuses(seats.retireSeat({ workspaceId: 'w', actorId: owner, seatId: worker.id }), 'not_found', 404);
    await refuses(seats.retireSeat({ workspaceId: 'other', actorId: owner, seatId: devA.id }), 'not_found', 404);

    // Retiring never widens what the token may do: it is no seat any more, and still writes nothing.
    assert.equal((await send(seatsMe.GET, worker.token, 'GET')).body.error, 'seat_required');
    const write = await send(comments.POST, worker.token, 'POST', { body: { content: 'After retiring' }, params: { issueIdOrKey: open.id } });
    assert.equal(write.status, 403);
    assert.equal(write.body.error, 'seat_scope');
    assert.equal((await send(route('labels').POST, worker.token, 'POST', { body: { name: 'late', color: '#000000' } })).body.error, 'seat_scope');
    const filed = await issue(B, { agentRequestRole: 'review', reporterId: worker.userId });
    assert.equal((await send(comments.POST, worker.token, 'POST', { body: { content: 'After retiring' }, params: { issueIdOrKey: filed.id } })).body.error, 'seat_scope', 'nor on a request it filed');
    await refuses(assignee.assertAssignable(prisma, { workspaceId: 'w', projectId: A, agentRequestRole: null }, worker.userId), 'assignee_not_found', 400);

    // The name can take a seat again, also in another project.
    const back = await seat('dev-retire', B, 'developer');
    assert.equal(back.id, worker.id);
    assert.equal(back.projectId, B);
    assert.equal((await send(seatsMe.GET, worker.token, 'GET')).body.seat.projectId, B);
  });

  await t.test('an issue in Trash is unassigned too, so restoring it does not bring a retired or misplaced seat back', async () => {
    // The application's client hides trashed issues from ordinary queries; seats must still reach them.
    const { Prisma, PrismaClient } = require('@prisma/client');
    class TestPrismaClient extends PrismaClient { constructor(options) { super({ ...options, datasources: { db: { url: db.url } } }); } }
    const app = load('src/lib/prisma.ts', { '@prisma/client': { Prisma, PrismaClient: TestPrismaClient },
      './database-diagnostics': load('src/lib/database-diagnostics.ts', {}, { performance, setTimeout, console }),
      './issue-visibility': load('src/lib/issue-visibility.ts') }, { global: {}, process: { env: { NODE_ENV: 'production' } } }).prisma;
    t.after(() => app.$disconnect());
    const appTokens = load('src/lib/agent-tokens.ts', { crypto: require('node:crypto'), '@/lib/prisma': { prisma: app }, '@/lib/apps/crypto': crypto }, { Buffer, Date });
    const appSeats = load('src/lib/agent-seats.ts', { '@/lib/prisma': { prisma: app }, '@/lib/agent-handoffs': handoffs, '@/lib/agent-tokens': appTokens, '@/lib/issue-assignee': assignee }, { Date });
    const holder = async row => (await prisma.issue.findUniqueOrThrow({ where: { id: row.id } })).assigneeId;

    const worker = await seat('dev-trash', A, 'developer');
    const trashed = await issue(A, { assigneeId: worker.userId, deletedAt: new Date() });
    await prisma.issueAssignee.create({ data: { issueId: trashed.id, userId: worker.userId, role: 'ASSIGNEE', status: 'APPROVED' } });
    const retired = await appSeats.retireSeat({ workspaceId: 'w', actorId: owner, seatId: worker.id });
    assert.deepEqual(retired.unassigned, [trashed.issueKey]);
    assert.equal(await holder(trashed), null);
    assert.equal(await prisma.issueAssignee.count({ where: { issueId: trashed.id } }), 0);
    assert.equal(await prisma.issueActivity.count({ where: { itemId: trashed.id, action: 'UNASSIGNED' } }), 1);

    const old = await appTokens.createAgentToken({ workspaceId: 'w', actorId: owner, name: 'legacy-trash', access: 'write', expiresInDays: 30 });
    const account = (await prisma.appToken.findUniqueOrThrow({ where: { id: old.id } })).userId;
    const elsewhere = await issue(B, { assigneeId: account, deletedAt: new Date() }), fitting = await issue(A, { assigneeId: account, deletedAt: new Date() });
    await appSeats.createSeat({ workspaceId: 'w', actorId: owner, projectId: A, role: 'developer', ownerId: null, name: 'legacy-trash', expiresInDays: 30 });
    assert.deepEqual([await holder(elsewhere), await holder(fitting)], [null, account]);
  });

  await t.test('retiring the default seat of a role hands the default to the oldest seat left', async () => {
    const first = await seat('rev-b1', B, 'reviewer'), second = await seat('rev-b2', B, 'reviewer');
    assert.deepEqual([first.isDefault, second.isDefault], [true, false]);
    await seats.retireSeat({ workspaceId: 'w', actorId: owner, seatId: first.id });
    assert.equal((await prisma.agentSeat.findUniqueOrThrow({ where: { id: second.id } })).isDefault, true);
  });

  await t.test('people manage seats with the permission that manages agent tokens', async () => {
    let allowed = true, session = { user: { id: owner } };
    const people = { ...deps, '@/lib/request-session': { getServerSession: async () => session }, '@/lib/auth-options': {},
      '@/lib/permissions': { Permission: { MANAGE_AGENTS: 'manage' }, checkUserPermission: async () => ({ hasPermission: allowed }) } };
    const collection = load('src/app/api/workspaces/[workspaceId]/agent-seats/route.ts', people, globals);
    const single = load('src/app/api/workspaces/[workspaceId]/agent-seats/[seatId]/route.ts', people, globals);
    const post = body => collection.POST(new Request('https://collab.test/api', { method: 'POST', body: JSON.stringify(body) }), { params: Promise.resolve({ workspaceId: 'w' }) });
    const body = { name: 'web-seat', projectId: B, role: 'developer', ownerId: null, expiresInDays: 30 };

    const made = await post(body);
    assert.equal(made.status, 201, await made.clone().text());
    const reply = await made.json();
    assert.match(reply.token.token, /^collab_at_/);
    assert.equal(reply.seat.ownerId, null);
    assert.equal((await send(seatsMe.GET, reply.token.token, 'GET')).body.seat.id, reply.seat.id);

    const conflict = await post({ ...body, name: 'rel-web', role: 'release' });
    assert.equal(conflict.status, 409);
    assert.equal((await conflict.json()).code, 'release_seat_exists');
    assert.equal((await post({ ...body, role: 'manager' })).status, 400);
    assert.equal((await post({ ...body, name: 'stranger-owned', ownerId: 'cnobody00001' })).status, 400);

    const remove = () => single.DELETE(new Request('https://collab.test/api', { method: 'DELETE' }), { params: Promise.resolve({ workspaceId: 'w', seatId: reply.seat.id }) });
    allowed = false;
    assert.equal((await post({ ...body, name: 'denied' })).status, 403);
    assert.equal((await remove()).status, 403);
    session = null;
    assert.equal((await post({ ...body, name: 'denied' })).status, 401);
    assert.equal(await prisma.agentSeat.count({ where: { name: 'denied' } }), 0);
    allowed = true; session = { user: { id: owner } };
    const removed = await remove();
    assert.equal(removed.status, 200);
    assert.deepEqual(await removed.json(), { unassigned: [], revokedTokens: 0 });
  });

  await t.test('the agent tokens list names the owner whose sign-in runs a seat', async () => {
    // The owner is shown by name, so a person reading the list can tell whose subscription pays.
    await prisma.user.create({ data: { id: 'cdana000001', name: 'Dana', email: 'dana@example.test' } });
    await prisma.workspaceMember.create({ data: { workspaceId: 'w', userId: 'cdana000001' } });
    await seat('dev-owned', B, 'developer', { ownerId: 'cdana000001' });
    await seat('dev-unowned', B, 'developer', { ownerId: null });

    const listed = await tokens.listAgentTokens('w');
    const seatOf = name => listed.find(row => row.name === name).seat;
    assert.equal(seatOf('dev-owned').owner, 'Dana (dana@example.test)');
    assert.equal(seatOf('dev-unowned').owner, null);

    // Two accounts can share a name: the name set in this workspace's account settings wins, and the email tells them apart.
    await prisma.user.create({ data: { id: 'cdana000002', name: 'Dana', email: 'dana@other.test' } });
    await prisma.workspaceMember.create({ data: { workspaceId: 'w', userId: 'cdana000002', displayName: 'Dana Two' } });
    await prisma.user.create({ data: { id: 'cgone000001', name: 'Gone', email: 'gone@example.test' } });
    await prisma.workspaceMember.create({ data: { workspaceId: 'w', userId: 'cgone000001', status: false } });
    const choices = await tokens.listSeatOwnerChoices('w');
    const names = choices.people.map(row => row.name);
    assert.deepEqual(names.filter(name => name.startsWith('Dana')), ['Dana (dana@example.test)', 'Dana Two (dana@other.test)']);
    assert.ok(!names.some(name => name.startsWith('Gone')), 'a member switched off cannot own a seat');
    assert.equal(choices.seats.find(row => row.name === 'dev-owned').owner, 'Dana (dana@example.test)');
    // A token that is not a seat has no owner to show.
    assert.equal(seatOf('crm'), null);
  });
});
