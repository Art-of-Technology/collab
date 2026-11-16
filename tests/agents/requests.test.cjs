const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { Prisma } = require('@prisma/client');
const { load } = require('../security/helpers.cjs');
const { seatsDatabase } = require('./seats-db.cjs');

// Token-facing routes accept only cuid-shaped ids.
const owner = 'cowner00001', person = 'cperson0001';
const A = 'cprojecta001', B = 'cprojectb001', C = 'cprojectc001';
const scopes = ['issues:read', 'issues:write', 'user:read'];
const ago = seconds => new Date(Date.now() - seconds * 1000);
/** A request body with every section the Task template requires, except the ones named. */
const body = (...without) => ['What', 'Why', 'Done when'].filter(title => !without.includes(title)).map(title => `## ${title}\n\nSomething real about ${title}.`).join('\n\n');
const note = ['Done', 'Decisions', 'Evidence', 'Next'].map(heading => `## ${heading}\n\nWhat there is to say.`).join('\n\n');

let db;
after(() => db?.stop());

test('requests: one seat asks another, in its own project or in another one', async t => {
  db = await seatsDatabase(async prisma => {
    await prisma.user.createMany({ data: [owner, person].map(id => ({ id, name: id, email: `${id}@example.test` })) });
    await prisma.workspace.create({ data: { id: 'w', name: 'w', slug: 'w', ownerId: owner, issueTemplatesEnforced: true } });
    await prisma.workspaceMember.create({ data: { workspaceId: 'w', userId: person } });
    for (const [id, issuePrefix] of [[A, 'AA'], [B, 'BB'], [C, 'CC']]) {
      await prisma.project.create({ data: { id, workspaceId: 'w', name: id, slug: id, issuePrefix } });
      await prisma.projectStatus.createMany({ data: ['to_do', 'in_progress', 'blocked', 'done'].map((name, order) => ({ id: `${id}-${name}`, projectId: id, name, displayName: name,
        order, isDefault: name === 'to_do', isFinal: name === 'done' })) });
    }
    for (const [id, slug] of [['agent-app', 'collab-agent'], ['person-app', 'collab-cli']]) {
      await prisma.app.create({ data: { id, name: slug, slug, publisherId: 'system', status: 'PUBLISHED', visibility: 'PRIVATE', isSystemApp: true,
        scopes: { create: scopes.map(scope => ({ scope })) } } });
    }
    await prisma.taskLabel.createMany({ data: ['Review request', 'Release request'].map(name => ({ workspaceId: 'w', name, color: '#123456' })) });
  });
  // The application's client, so Trash is hidden here as it is in production.
  const raw = db.prisma;
  const prisma = raw.$extends(load('src/lib/issue-visibility.ts').issueVisibilityExtension(Prisma.dmmf.datamodel.models));

  const crypto = { encryptToken: async value => Buffer.from(value), decryptToken: async data => Buffer.from(data).toString(), getEncryptionKey: () => {} };
  const zod = require('zod');
  const response = { NextResponse: Response };
  const globals = { console, URL, Date, Buffer };
  const handoffs = load('src/lib/agent-handoffs.ts', { 'node:crypto': require('node:crypto'), 'node:buffer': require('node:buffer'), zod,
    '@/lib/prisma': { prisma }, '@/lib/issue-finder': load('src/lib/issue-finder.ts', { '@/lib/prisma': { prisma } }), '@/lib/oauth-scopes': load('src/lib/oauth-scopes.ts') }, { Date });
  const tokens = load('src/lib/agent-tokens.ts', { crypto: require('node:crypto'), '@/lib/prisma': { prisma }, '@/lib/apps/crypto': crypto }, { Buffer, Date });
  const assignee = load('src/lib/issue-assignee.ts', { './agent-handoffs': handoffs });
  const seats = load('src/lib/agent-seats.ts', { '@/lib/prisma': { prisma }, '@/lib/agent-handoffs': handoffs, '@/lib/agent-tokens': tokens, '@/lib/issue-assignee': assignee }, { Date });
  const middleware = load('src/lib/apps/auth-middleware.ts', { crypto: require('node:crypto'), 'next/server': response,
    '@/lib/apps/crypto': crypto, '@/lib/oauth-scopes': load('src/lib/oauth-scopes.ts'), '@/lib/post-access': load('src/lib/post-access.ts'),
    '@/lib/auth-error-diagnostics': load('src/lib/auth-error-diagnostics.ts'), '@/lib/prisma': { prisma } }, globals);
  const templates = load('src/lib/issue-templates.ts', { '@/lib/comment-html': load('src/lib/comment-html.ts', { 'isomorphic-dompurify': { default: require('isomorphic-dompurify') }, marked: require('marked') }) });
  const emitted = [];
  let forge = false;
  let beforeIssueGuard;
  class ForgeProjectWriteError extends Error {}
  const guard = async () => { if (forge) throw new ForgeProjectWriteError('Use the Forge board'); };
  const deps = { zod, 'next/server': response, '@/lib/prisma': { prisma }, '@/lib/apps/auth-middleware': middleware, '@/lib/agent-seats': seats, '@/lib/issue-assignee': assignee,
    '@/lib/agent-handoff-http': load('src/lib/agent-handoff-http.ts', { zod, 'next/server': response, './agent-handoffs': handoffs }, globals),
    '@/lib/forge/legacy-write-guard': { ForgeProjectWriteError, assertLegacyIssueWriteAllowed: async () => { await guard(); await beforeIssueGuard?.(); }, assertLegacyProjectWriteAllowed: guard },
    '@/lib/issue-finder': {}, '@/lib/permissions': {}, '@/lib/agent-tokens': tokens, '@/lib/issue-templates': templates,
    '@/lib/issue-template-store': load('src/lib/issue-template-store.ts', { '@/lib/prisma': { prisma }, '@/lib/issue-templates': templates }),
    '@/lib/event-bus': { emitIssueCreated: async made => { emitted.push(made.id); } } };
  deps['@/lib/agent-runs'] = load('src/lib/agent-runs.ts', deps, { Date });
  deps['@/lib/agent-requests'] = load('src/lib/agent-requests.ts', deps, { Date });
  const route = path => load(`src/app/api/apps/auth/${path}/route.ts`, deps, globals);
  const requests = route('seats/me/requests'), inboxRoute = route('seats/me/inbox'), runs = route('runs'), one = route('runs/[id]'), comments = route('issues/[issueIdOrKey]/comments');

  const seat = async (name, projectId, role = 'developer', extra = {}) => {
    const made = await seats.createSeat({ workspaceId: 'w', actorId: owner, projectId, role, ownerId: person, name, expiresInDays: 30, ...extra });
    return { ...made.seat, token: made.token.token };
  };
  const devA = await seat('dev-a', A), otherA = await seat('other-a', A), reviewerA = await seat('rev-a', A, 'reviewer');
  // Project B's default developer seat is not the one that was made first.
  const devB = await seat('dev-b', B), leadB = await seat('lead-b', B, 'developer', { isDefault: true });
  const integration = await tokens.createAgentToken({ workspaceId: 'w', actorId: owner, name: 'crm', access: 'write', expiresInDays: 30 });
  const personToken = 'collab_person_token';
  await raw.appToken.create({ data: { appId: 'person-app', workspaceId: 'w', userId: person, installationId: null,
    accessToken: Buffer.from(personToken).toString('base64'), scopes } });

  /** Calls a token route and returns [status, body]. */
  const call = async (handler, token, { body: sent, params = {} } = {}) => {
    const reply = await handler(new Request('https://collab.test/api', { method: sent ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}` },
      ...(sent && { body: JSON.stringify(sent) }) }), { params: Promise.resolve(params) });
    return [reply.status, await reply.json()];
  };
  let count = 0;
  /** An issue assigned to `to` (a seat or nobody) in its project. */
  const issue = async (to, { project = to?.projectId ?? A, ...data } = {}) => {
    const made = await raw.issue.create({ data: { workspaceId: 'w', projectId: project, title: `Issue ${++count}`, issueKey: `K-${count}`,
      statusId: `${project}-to_do`, assigneeId: to?.userId, createdAt: ago(900), ...data } });
    if (to) await raw.issueAssignee.create({ data: { issueId: made.id, userId: to.userId, role: 'ASSIGNEE', status: 'APPROVED', assignedAt: ago(600), approvedAt: ago(600) } });
    return made;
  };
  /** Files a request as `by`; `from` is the source issue. */
  const file = (by, from, sent = {}) => call(requests.POST, by.token ?? by, { body: { role: 'developer', title: 'Please look at this', body: body(), fromIssue: from.issueKey, ...sent } });
  const filed = async (by, from, sent) => {
    const [status, reply] = await file(by, from, sent);
    assert.equal(status, 200, JSON.stringify(reply));
    return { reply, row: await raw.issue.findUniqueOrThrow({ where: { id: reply.issue.id }, include: { labels: true, sourceRelations: true, helpers: true, comments: true } }) };
  };
  /** Asserts the refusal and returns its body. */
  const refused = async (pending, status, code) => {
    const [got, reply] = await pending;
    assert.deepEqual([got, reply.error], [status, code], reply.error_description);
    return reply;
  };
  const offered = async (by, target) => (await call(inboxRoute.GET, by.token))[1].items.filter(item => item.issueId === target.id).map(item => item.reason);
  const comment = (by, target, content = 'A word') => call(comments.POST, by.token ?? by, { body: { content }, params: { issueIdOrKey: target.id } });
  /** Every request in a project is done, so the cap between two projects starts again. */
  const settle = project => raw.issue.updateMany({ where: { projectId: project, agentRequestRole: { not: null } }, data: { statusId: `${project}-done` } });
  const requestCount = () => raw.issue.count({ where: { agentRequestRole: { not: null } } });

  await t.test('rule 8: a request lands in the target project, assigned to its default seat for the role and linked to its source', async () => {
    const source = await issue(devA, { priority: 'high' });
    const { reply, row } = await filed(devA, source, { project: 'BB', blocks: true });
    assert.deepEqual(Object.keys(reply), ['issue'], 'a developer seat that has not read its inbox is no warning');
    assert.match(reply.issue.issueKey, /^BB-\d+$/);
    assert.deepEqual([row.projectId, row.assigneeId, row.reporterId, row.agentRequestRole, row.type, row.priority, row.statusId, row.title, row.description],
      [B, leadB.userId, devA.userId, 'developer', 'TASK', 'high', `${B}-to_do`, 'Please look at this', body()]);
    assert.deepEqual(row.helpers.map(helper => [helper.userId, helper.role, helper.status]), [[leadB.userId, 'ASSIGNEE', 'APPROVED']]);
    assert.deepEqual(row.sourceRelations.map(relation => [relation.targetIssueId, relation.relationType, relation.createdBy]), [[source.id, 'BLOCKS', devA.userId]]);
    assert.deepEqual(row.labels, []);
    assert.deepEqual([await offered(leadB, row), await offered(devB, row)], [['assigned'], []], 'the request is work for the seat it went to, and for no other');
    assert.ok(emitted.includes(row.id), 'the request is announced like any new issue, so search finds it');

    // Inside a project it is the same call without `project`; the project's id names it as well as its prefix does.
    const review = await filed(devA, source, { role: 'review' });
    assert.deepEqual([review.row.projectId, review.row.assigneeId, review.row.agentRequestRole], [A, reviewerA.userId, 'review']);
    assert.deepEqual(review.row.sourceRelations.map(relation => relation.relationType), ['RELATES_TO']);
    assert.deepEqual(review.row.labels.map(label => label.name), ['Review request'], 'people see what it is by its label');
    assert.equal(await raw.agentHandoff.count(), 0, 'the label is for people: it hands the request to nobody');
    assert.equal((await filed(devA, source, { project: B })).row.projectId, B);
    // A seat that is not its project's default reaches the default one the same way.
    assert.equal((await filed(otherA, source)).row.assigneeId, devA.userId);
    await settle(B);
  });

  await t.test('a request comes from a seat, from an issue of its own project, and goes to a seat that is not itself', async () => {
    const mine = await issue(devA), theirs = await issue(devB), before = await requestCount();
    await refused(file(devA, theirs, { project: 'BB' }), 403, 'wrong_project');
    await refused(file(devA, theirs), 403, 'wrong_project');
    await refused(file(devA, { issueKey: 'K-0' }), 404, 'not_found');
    await refused(file(devA, mine, { project: 'ZZ' }), 404, 'project_not_found');
    await refused(file(devA, mine, { project: 'CC' }), 409, 'no_default_seat');
    await refused(file(devA, mine, { project: 'BB', role: 'release' }), 409, 'no_default_seat');
    await refused(file(devA, mine), 400, 'invalid_request');
    await refused(file(devA, mine, { role: 'reviewer' }), 400, 'invalid_request');
    await refused(file(devA, mine, { project: 'BB', priority: 'urgent' }), 400, 'invalid_request');
    for (const token of [personToken, integration.token]) await refused(file(token, mine, { project: 'BB' }), 403, 'seat_required');
    forge = true;
    await refused(file(devA, mine, { project: 'BB' }), 409, 'forge_connected_project');
    forge = false;
    // A seat that was retired takes no request, and the role has no default until another seat is made.
    const leaving = await seat('rel-c', C, 'release');
    await seats.retireSeat({ workspaceId: 'w', actorId: owner, seatId: leaving.id });
    await refused(file(devA, mine, { project: 'CC', role: 'release' }), 409, 'no_default_seat');
    // The one rule for who may be assigned holds here too: an account whose membership is switched off takes nothing.
    await raw.workspaceMember.updateMany({ where: { userId: leadB.userId }, data: { status: false } });
    await refused(file(devA, mine, { project: 'BB' }), 400, 'assignee_not_found');
    await raw.workspaceMember.updateMany({ where: { userId: leadB.userId }, data: { status: true } });
    assert.equal(await requestCount(), before, 'a refused request writes nothing');
  });

  await t.test('filing rechecks the seat and source after concurrent changes', async () => {
    const source = await issue(devA), leaving = await seat('race-a', A), before = await requestCount();
    const race = async (by, change, code) => {
      let resume, reached;
      const paused = new Promise(resolve => { resume = resolve; });
      const ready = new Promise(resolve => { reached = resolve; });
      beforeIssueGuard = async () => { reached(); await paused; };
      const pending = file(by, source, { project: 'BB' });
      await ready;
      try { await change(); } finally { beforeIssueGuard = undefined; resume(); }
      await refused(pending, 403, code);
    };
    await race(devA, () => raw.issue.update({ where: { id: source.id }, data: { projectId: C } }), 'wrong_project');
    await raw.issue.update({ where: { id: source.id }, data: { projectId: A } });
    await race(leaving, () => seats.retireSeat({ workspaceId: 'w', actorId: owner, seatId: leaving.id }), 'seat_scope');
    assert.equal(await requestCount(), before);
  });

  await t.test('the request body is held to the workspace\'s issue template', async () => {
    const source = await issue(devA), before = await requestCount();
    const refusal = await refused(file(devA, source, { project: 'BB', body: body('Done when') }), 422, 'template_required');
    assert.deepEqual([refusal.issue_type, refusal.missing_sections, refusal.missing_fields], ['TASK', ['Done when'], []]);
    assert.match(refusal.error_description, /Missing required sections: Done when\./);
    assert.equal(await requestCount(), before);
    // Only the body is held to the template. A request's fields are the server's, and the asking seat can state no
    // other: a template that requires story points and labels refused every request in its workspace (CLB-510).
    await raw.issueTemplate.create({ data: { workspaceId: 'w', issueType: 'TASK', version: 2, updatedById: owner,
      sections: [{ title: 'What', required: true, guidance: 'The change.' }], requiredFields: ['storyPoints', 'labels', 'dueDate'] } });
    await filed(devA, source, { role: 'review', body: body('Why', 'Done when') });
    await filed(devA, source, { project: 'BB', body: body('Why', 'Done when') });
    const noSection = await refused(file(devA, source, { project: 'BB', body: body('What') }), 422, 'template_required');
    assert.deepEqual([noSection.missing_sections, noSection.missing_fields, noSection.template.requiredFields], [['What'], [], []]);
    await raw.issueTemplate.deleteMany();
    // A workspace that does not hold agents to its templates does not hold requests to them either.
    await raw.workspace.update({ where: { id: 'w' }, data: { issueTemplatesEnforced: false } });
    await filed(devA, source, { project: 'BB', body: 'Just a sentence.' });
    await raw.workspace.update({ where: { id: 'w' }, data: { issueTemplatesEnforced: true } });
    await settle(B);
  });

  await t.test('rule 8: at most five open requests from one project to another', async () => {
    const source = await issue(devA), elsewhere = await issue(devB);
    for (let n = 1; n <= 4; n++) await filed(n % 2 ? devA : otherA, source, { project: 'BB' });
    // Two at the same moment for the one place left: the count is settled before either is written.
    const racing = await Promise.all([file(devA, source, { project: 'BB' }), file(otherA, source, { project: 'BB' })]);
    assert.deepEqual(racing.map(([status]) => status).sort(), [200, 429]);
    assert.equal(racing.find(([status]) => status === 429)[1].error, 'request_cap');
    for (const by of [devA, otherA]) await refused(file(by, source, { project: 'BB' }), 429, 'request_cap');
    assert.equal(await raw.issue.count({ where: { projectId: B, agentRequestRole: { not: null }, statusId: `${B}-to_do` } }), 5);
    // Requests inside a project have no count, and the other direction has its own: what project A asked itself is not B's.
    for (let n = 1; n <= 6; n++) await filed(devA, source, { role: 'review' });
    await filed(devB, elsewhere, { project: 'AA' });
    // A request in Trash is not open, and neither is one that is done.
    const [first, second] = await raw.issue.findMany({ where: { projectId: B, agentRequestRole: { not: null }, statusId: `${B}-to_do` }, take: 2 });
    await raw.issue.update({ where: { id: first.id }, data: { deletedAt: new Date() } });
    await filed(devA, source, { project: 'BB' });
    await refused(file(devA, source, { project: 'BB' }), 429, 'request_cap');
    await raw.issue.update({ where: { id: second.id }, data: { statusId: `${B}-done` } });
    await filed(devA, source, { project: 'BB' });
    await settle(B); await settle(A);
  });

  await t.test('a reply on a request brings the seat\'s blocked issue back to its inbox', async () => {
    const source = await issue(devA);
    const [, started] = await call(runs.POST, devA.token, { body: { issue: source.issueKey, generation: 'g1', runner: 'test' } });
    const { reply, row } = await filed(devA, source, { project: 'BB', blocks: true });
    // What filing wrote is what a finish accepts as the thing the issue waits for.
    const [status, finished] = await call(one.PATCH, devA.token, { params: { id: started.run.id },
      body: { event: 'finish', generation: 'g1', outcome: 'blocked', note, blockedBy: reply.issue.issueKey } });
    assert.equal(status, 200, JSON.stringify(finished));
    assert.deepEqual(await offered(devA, source), []);
    await new Promise(resolve => setTimeout(resolve, 5));
    // The seat may say more on its request; its own words are not a reply.
    assert.equal((await comment(devA, row, 'One more detail'))[0], 201);
    assert.deepEqual(await offered(devA, source), []);
    assert.equal((await comment(devB, row, 'Here is the answer'))[0], 201);
    assert.deepEqual(await offered(devA, source), ['reply']);
    await settle(B);
  });

  await t.test('a request to a release seat that has not read its inbox for ten minutes succeeds, with a warning and a comment', async () => {
    const source = await issue(devA);
    const releaseB = await seat('rel-b', B, 'release');
    const seen = at => raw.agentSeat.update({ where: { id: releaseB.id }, data: { lastSeenAt: at } });
    const never = await filed(devA, source, { project: 'BB', role: 'release' });
    assert.equal(never.reply.warning, 'seat_idle');
    assert.deepEqual([never.row.assigneeId, never.row.agentRequestRole, never.row.labels.map(label => label.name)], [releaseB.userId, 'release', ['Release request']]);
    assert.deepEqual(never.row.comments.map(row => row.authorId), [devA.userId]);
    assert.match(never.row.comments[0].content, /rel-b.*has never read its inbox/);
    await seen(ago(11 * 60));
    const stale = await filed(devA, source, { project: 'BB', role: 'release' });
    assert.equal(stale.reply.warning, 'seat_idle');
    assert.match(stale.row.comments[0].content, /rel-b.*last read its inbox at \d{4}-\d{2}-\d{2}T/);
    await seen(ago(9 * 60));
    const fresh = await filed(devA, source, { project: 'BB', role: 'release' });
    assert.deepEqual([fresh.reply.warning, fresh.row.comments], [undefined, []]);
    // Reading the inbox is what counts as being there.
    await seen(null);
    await call(inboxRoute.GET, releaseB.token);
    assert.equal((await filed(devA, source, { project: 'BB', role: 'release' })).reply.warning, undefined);
    await settle(B);
  });
});
