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

let db;
after(() => db?.stop());

test('run context: what a fresh session needs to work an issue, in one read', async t => {
  db = await seatsDatabase(async prisma => {
    // People sign in with an email; a seat's account has none.
    await prisma.user.createMany({ data: [owner, person].map(id => ({ id, name: id, email: `${id}@example.test` })) });
    await prisma.workspace.create({ data: { id: 'w', name: 'w', slug: 'w', ownerId: owner } });
    await prisma.workspace.create({ data: { id: 'x', name: 'x', slug: 'x', ownerId: owner } });
    await prisma.workspaceMember.create({ data: { workspaceId: 'w', userId: person } });
    for (const [id, workspaceId] of [[A, 'w'], [B, 'w'], ['cprojectx001', 'x']]) {
      await prisma.project.create({ data: { id, workspaceId, name: id, slug: id, issuePrefix: id.slice(8, 9).repeat(2).toUpperCase() } });
      await prisma.projectStatus.createMany({ data: ['to_do', 'in_review', 'done'].map((name, order) => ({ id: `${id}-${name}`, projectId: id, name, displayName: name, order, isFinal: name === 'done' })) });
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
  const handoffs = load('src/lib/agent-handoffs.ts', { 'node:crypto': require('node:crypto'), 'node:buffer': require('node:buffer'), zod,
    '@/lib/prisma': { prisma }, '@/lib/issue-finder': load('src/lib/issue-finder.ts', { '@/lib/prisma': { prisma } }), '@/lib/oauth-scopes': load('src/lib/oauth-scopes.ts') }, { Date });
  const tokens = load('src/lib/agent-tokens.ts', { crypto: require('node:crypto'), '@/lib/prisma': { prisma }, '@/lib/apps/crypto': crypto }, { Buffer, Date });
  const seats = load('src/lib/agent-seats.ts', { '@/lib/prisma': { prisma }, '@/lib/agent-handoffs': handoffs, '@/lib/agent-tokens': tokens,
    '@/lib/issue-assignee': load('src/lib/issue-assignee.ts', { './agent-handoffs': handoffs }) }, { Date });
  const middleware = load('src/lib/apps/auth-middleware.ts', { crypto: require('node:crypto'), 'next/server': response,
    '@/lib/apps/crypto': crypto, '@/lib/oauth-scopes': load('src/lib/oauth-scopes.ts'), '@/lib/post-access': load('src/lib/post-access.ts'),
    '@/lib/auth-error-diagnostics': load('src/lib/auth-error-diagnostics.ts'), '@/lib/prisma': { prisma } }, globals);
  const route = load('src/app/api/apps/auth/issues/[issueIdOrKey]/run-context/route.ts', { '@/lib/apps/auth-middleware': middleware,
    '@/lib/agent-handoff-http': load('src/lib/agent-handoff-http.ts', { zod, 'next/server': response, './agent-handoffs': handoffs }, globals),
    '@/lib/agent-runs': load('src/lib/agent-runs.ts', { zod, '@/lib/prisma': { prisma }, '@/lib/agent-seats': seats, '@/lib/issue-finder': {}, '@/lib/permissions': {}, '@/lib/agent-tokens': tokens }, { Date }) }, globals);

  const seat = async (name, projectId) => {
    const made = await seats.createSeat({ workspaceId: 'w', actorId: owner, projectId, role: 'developer', ownerId: person, name, expiresInDays: 30 });
    return { ...made.seat, token: made.token.token };
  };
  const devA = await seat('dev-a', A), devB = await seat('dev-b', B);
  const personToken = 'collab_person_token';
  await raw.appToken.create({ data: { appId: 'person-app', workspaceId: 'w', userId: person, installationId: null,
    accessToken: Buffer.from(personToken).toString('base64'), scopes } });

  const read = async (token, issueIdOrKey) => {
    const reply = await route.GET(new Request('https://collab.test/api', { headers: { Authorization: `Bearer ${token}` } }), { params: Promise.resolve({ issueIdOrKey }) });
    return [reply.status, await reply.json()];
  };
  const context = async target => { const [status, reply] = await read(devA.token, target.issueKey); assert.equal(status, 200, JSON.stringify(reply)); return reply; };
  let count = 0;
  const issue = (data = {}) => raw.issue.create({ data: { workspaceId: 'w', projectId: A, title: `Issue ${++count}`, issueKey: `K-${count}`, statusId: `${data.projectId ?? A}-to_do`, ...data } });
  /** A run on the issue that ended `ended` minutes ago. */
  const run = (target, ended, data) => raw.agentRun.create({ data: { workspaceId: 'w', issueId: target.id, seatId: devA.id, userId: devA.userId,
    runner: 'test', generation: 'g1', state: 'finished', outcome: 'in_review', startedAt: ago(ended + 30), endedAt: ago(ended), ...data } });
  const comment = (target, authorId, minutes, content) => raw.issueComment.create({ data: { issueId: target.id, authorId, content, createdAt: ago(minutes) } });
  const link = (source, relationType, target) => raw.issueRelation.create({ data: { sourceIssueId: source.id, targetIssueId: target.id, relationType } });
  const said = reply => reply.commentsSince.map(row => row.content);

  await t.test('the issue, the last exit note, and only the comments made after the run that left it', async () => {
    const target = await issue({ description: 'What to do', priority: 'high', assigneeId: devA.userId });
    await comment(target, owner, 90, 'first'); await comment(target, devA.userId, 40, 'second'); await comment(target, person, 10, 'third');

    // No run yet: everything that was said.
    const fresh = await context(target);
    assert.deepEqual(fresh.issue, { id: target.id, issueKey: target.issueKey, title: target.title, description: 'What to do', type: 'TASK', priority: 'high',
      projectId: A, status: 'to_do', category: 'todo', assigneeId: devA.userId, agentRequestRole: null });
    assert.deepEqual([fresh.lastExitNote, fresh.lastExitFacts], [null, null]);
    assert.deepEqual(said(fresh), ['first', 'second', 'third']);
    assert.deepEqual(fresh.commentsSince[2], { id: fresh.commentsSince[2].id, content: 'third', createdAt: fresh.commentsSince[2].createdAt, parentId: null, author: { id: person, name: person } });
    assert.deepEqual(fresh.commands, [`collab context get --project-id ${A}`, `collab comments list ${target.issueKey}`, `collab issues activity ${target.issueKey}`,
      `collab seat request --from-issue ${target.issueKey} --role review|release|security|developer --title TITLE --body-file FILE`,
      "collab run finish RUN_ID --generation GENERATION --outcome done|in_review|blocked --note-file FILE --next-step 'ONE LINE' [--pull-request OWNER/REPO#NUMBER --head-commit FULL_HASH]"]);
    assert.deepEqual([fresh.blockers, fresh.requests, fresh.requestFor], [[], [], []]);

    await run(target, 60, { note: 'The first note' });
    const second = await context(target);
    assert.equal(second.lastExitNote, 'The first note');
    // A run that finished before the facts were fields has none.
    assert.deepEqual(second.lastExitFacts, { pullRequest: null, headCommit: null, nextStep: null });
    assert.deepEqual(said(second), ['second', 'third']);

    // A later run that stopped without a note changes neither: the comments since the note are still what the next session lacks.
    await run(target, 20, { state: 'stopped', outcome: null });
    const resumed = await context(target);
    assert.deepEqual([resumed.lastExitNote, said(resumed)], ['The first note', ['second', 'third']]);
    // Nor does a run that is open now.
    await run(target, 0, { state: 'running', outcome: null, endedAt: null });
    assert.deepEqual(said(await context(target)), ['second', 'third']);
    await raw.agentRun.updateMany({ where: { issueId: target.id, endedAt: null }, data: { state: 'finished', outcome: 'done', note: 'The second note', endedAt: ago(5) } });
    const third = await context(target);
    assert.deepEqual([third.lastExitNote, said(third)], ['The second note', []]);
  });

  await t.test("declared stops: an answer written after the seat's question and before the finish is in the next run's context", async () => {
    /** An issue whose run started 90 minutes ago and finished blocked 60 minutes ago, naming the person when `named`. */
    const stopped = async named => {
      const target = await issue({ assigneeId: devA.userId });
      const made = await run(target, 60, { outcome: 'blocked', note: 'Asked which way to run the migration' });
      if (named) await raw.issueActivity.create({ data: { workspaceId: 'w', projectId: A, itemType: 'ISSUE', itemId: target.id, userId: devA.userId, action: 'AGENT_RUN_FINISHED',
        details: JSON.stringify({ runId: made.id, outcome: 'blocked', askedUser: person, nextStep: 'Run the migration the way the answer says' }) } });
      return target;
    };
    const question = "Run the migration in tonight's window, or split it? Reply `window` or `split`.";
    const asked = await stopped(true);
    // What a person wrote before the seat's question, also between two of the seat's comments, is not an answer to it.
    await comment(asked, person, 85, 'Is the backup done?');
    await comment(asked, devA.userId, 80, 'The backup is done.');
    await comment(asked, owner, 75, 'Thanks.');
    await comment(asked, devA.userId, 70, question);
    await comment(asked, person, 65, 'split');
    await comment(asked, person, 10, 'And keep the old column for one release.');
    assert.deepEqual(said(await context(asked)), ['split', 'And keep the old column for one release.']);
    // Before the finish only a person answers: what another seat wrote then is not an answer the next session is handed.
    const bySeat = await stopped(true);
    await comment(bySeat, devA.userId, 70, question);
    await comment(bySeat, devB.userId, 65, 'The review of this change passed.');
    await comment(bySeat, person, 10, 'window');
    assert.deepEqual(said(await context(bySeat)), ['window']);

    // A run that named no person, and one in which the seat wrote nothing: the finish is the boundary, as it was.
    const unnamed = await stopped(false);
    await comment(unnamed, devA.userId, 70, 'Filed the release request.');
    await comment(unnamed, person, 65, 'Seen.');
    await comment(unnamed, person, 10, 'It is released.');
    assert.deepEqual(said(await context(unnamed)), ['It is released.']);
    const silent = await stopped(true);
    await comment(silent, devA.userId, 100, question);
    await comment(silent, person, 65, 'Any news?');
    await comment(silent, person, 10, 'window');
    assert.deepEqual(said(await context(silent)), ['window']);
  });

  await t.test('what blocks the issue, and the requests filed for it', async () => {
    const target = await issue();
    const open = await issue(), settled = await issue({ statusId: `${A}-done` }), related = await issue(), blocked = await issue();
    const review = await issue({ agentRequestRole: 'review', reporterId: devA.userId, statusId: `${A}-in_review` });
    const elsewhere = await issue({ projectId: B, agentRequestRole: 'developer', reporterId: devA.userId });
    await link(open, 'BLOCKS', target); await link(target, 'BLOCKED_BY', settled); await link(related, 'RELATES_TO', target);
    // The issue blocks this one; that is not something it waits for.
    await link(target, 'BLOCKS', blocked);
    await link(review, 'RELATES_TO', target); await link(elsewhere, 'BLOCKS', target);

    const reply = await context(target);
    const ref = (row, status, category, role) => ({ id: row.id, issueKey: row.issueKey, title: row.title, projectId: row.projectId, status, category, ...(role && { requestRole: role }) });
    const byKey = rows => [...rows].sort((a, b) => a.id.localeCompare(b.id));
    assert.deepEqual(byKey(reply.blockers), byKey([ref(open, 'to_do', 'todo'), ref(settled, 'done', 'done'), ref(elsewhere, 'to_do', 'todo', 'developer')]));
    assert.deepEqual(byKey(reply.requests), byKey([ref(review, 'in_review', 'in_review', 'review'), ref(elsewhere, 'to_do', 'todo', 'developer')]));
    assert.deepEqual(reply.requestFor, []);

    // Read as the request, the same links say what it was filed for.
    const asRequest = await context(review);
    assert.deepEqual([asRequest.issue.agentRequestRole, asRequest.requestFor, asRequest.requests, asRequest.blockers], ['review', [ref(target, 'to_do', 'todo')], [], []]);
    assert.deepEqual((await context(elsewhere)).requestFor, [ref(target, 'to_do', 'todo')]);
    // What a request waits on, or is a child of, is not what it was filed for.
    await link(review, 'BLOCKED_BY', open); await link(review, 'PARENT', related);
    const waiting = await context(review);
    assert.deepEqual([waiting.requestFor, waiting.blockers], [[ref(target, 'to_do', 'todo')], [ref(open, 'to_do', 'todo')]]);
  });

  await t.test('security request context uses its own latest verdict, not a nested request verdict', async () => {
    const target = await issue(), request = await issue({ agentRequestRole: 'security' }), child = await issue({ agentRequestRole: 'security' });
    await link(request, 'BLOCKS', target); await link(child, 'BLOCKS', request);
    const verdict = (item, subject, result, reviewed, minutes) => raw.issueActivity.create({ data: {
      itemType: 'ISSUE', itemId: item.id, action: 'SECURITY_VERDICT', workspaceId: 'w', projectId: A, userId: person,
      details: JSON.stringify({ requestId: subject.id, verdict: result, reviewed }), createdAt: ago(minutes),
    } });
    await verdict(request, child, 'failed', 'child commit', 10);
    assert.equal((await context(target)).requests[0].verdict, undefined);
    await verdict(request, request, 'failed', 'old commit', 30);
    await verdict(request, request, 'passed', 'new commit', 20);
    const result = (await context(target)).requests[0];
    assert.deepEqual([result.verdict, result.reviewed], ['passed', 'new commit']);
  });

  await t.test('it is a read: any token of the workspace gets it, by key or by id, and nothing outside the workspace', async () => {
    const target = await issue();
    for (const [token, name] of [[devB.token, target.issueKey], [personToken, target.id]]) {
      const [status, reply] = await read(token, name);
      assert.deepEqual([status, reply.issue?.id], [200, target.id]);
    }
    const foreign = await raw.issue.create({ data: { workspaceId: 'x', projectId: 'cprojectx001', title: 'Elsewhere', issueKey: 'XX-1' } });
    for (const name of [foreign.id, foreign.issueKey, 'K-0']) {
      const [status, reply] = await read(devA.token, name);
      assert.deepEqual([status, reply.error], [404, 'not_found']);
    }
    const trashed = await issue({ deletedAt: new Date() });
    assert.equal((await read(devA.token, trashed.issueKey))[0], 404);
    assert.equal((await read('collab_at_unknown', target.issueKey))[0], 401);
  });

  await t.test('linked issues from another workspace never appear in context', async () => {
    const target = await issue({ agentRequestRole: 'review' });
    const foreign = data => raw.issue.create({ data: { workspaceId: 'x', projectId: 'cprojectx001', title: 'Private', ...data } });
    const outgoingBlocker = await foreign({}), incomingBlocker = await foreign({ agentRequestRole: 'developer' });
    const outgoingRequest = await foreign({ agentRequestRole: 'release' }), filedFor = await foreign({});
    await link(target, 'BLOCKED_BY', outgoingBlocker);
    await link(incomingBlocker, 'BLOCKS', target);
    await link(target, 'RELATES_TO', outgoingRequest);
    await link(target, 'RELATES_TO', filedFor);
    const reply = await context(target);
    assert.deepEqual([reply.blockers, reply.requests, reply.requestFor], [[], [], []]);
  });
  await t.test('the instructions for the run, in three layers, for every role', async () => {
    const { ROLE_CATALOGUE } = load('src/lib/agent-role-catalogue.ts');
    const layers = reply => reply.instructions.map(layer => layer.layer);
    // The organisation's own text for developers here, and for reviewers in another workspace only.
    await raw.agentRoleInstructions.create({ data: { workspaceId: 'w', role: 'developer', text: 'We use British English.' } });
    await raw.agentRoleInstructions.create({ data: { workspaceId: 'x', role: 'reviewer', text: 'Not for w.' } });
    for (const role of ROLE_CATALOGUE.roles) {
      const worker = role.id === 'developer' ? devA : (await seats.createSeat({ workspaceId: 'w', actorId: owner, projectId: B, role: role.id, ownerId: person, name: `${role.id}-b`, expiresInDays: 30 })).seat;
      const target = await issue({ projectId: B, assigneeId: worker.userId, ...(role.requests[0] && { agentRequestRole: role.requests[0].id }) });
      const reply = await context(target);
      // Platform first, then the organisation's for the seat's role in this workspace, then the seat's; a layer with nothing saved is present and empty.
      assert.deepEqual(layers(reply), ['platform', 'organisation', 'seat'], role.id);
      assert.deepEqual(reply.instructions.slice(1).map(layer => layer.text), [role.id === 'developer' ? 'We use British English.' : '', ''], role.id);
      // The role's own prompt, with the seat owner as the person to ask.
      assert.equal(reply.instructions[0].text, role.platformPrompt.replaceAll('{{ownerId}}', person), role.id);
    }
    // An issue no seat works has no role: the three layers are there and empty.
    for (const data of [{}, { assigneeId: person }]) {
      const reply = await context(await issue(data));
      assert.deepEqual(reply.instructions, [{ layer: 'platform', text: '' }, { layer: 'organisation', text: '' }, { layer: 'seat', text: '' }]);
    }
    // A retired seat's issue gets none of its role's instructions.
    const gone = (await seats.createSeat({ workspaceId: 'w', actorId: owner, projectId: A, role: 'reviewer', ownerId: person, name: 'gone', expiresInDays: 30 })).seat;
    const left = await issue({ assigneeId: gone.userId, agentRequestRole: 'review' });
    await raw.agentSeat.update({ where: { id: gone.id }, data: { retiredAt: new Date() } });
    assert.equal((await context(left)).instructions[0].text, '');
  });

  await t.test("the text saved on a seat's page is the seat layer of its next run, and only of that seat's", async () => {
    const mine = await issue({ assigneeId: devA.userId });
    const theirs = await issue({ projectId: B, assigneeId: devB.userId });
    await raw.agentSeat.update({ where: { id: devA.id }, data: { instructions: 'You own the billing module.' } });
    assert.deepEqual((await context(mine)).instructions.map(layer => layer.layer), ['platform', 'organisation', 'seat']);
    assert.equal((await context(mine)).instructions[2].text, 'You own the billing module.');
    // Another seat of the same role and owner keeps its own, empty, layer.
    assert.equal((await context(theirs)).instructions[2].text, '');
    // Removed on the page, the next run gets an empty seat layer again.
    await raw.agentSeat.update({ where: { id: devA.id }, data: { instructions: null } });
    assert.equal((await context(mine)).instructions[2].text, '');
  });

  await t.test("a seat with the organisation's own role gets four layers: its base role's platform and organisation layers, the role's, the seat's (CLB-626)", async () => {
    const { ROLE_CATALOGUE } = load('src/lib/agent-role-catalogue.ts');
    const qa = await raw.agentCustomRole.create({ data: { workspaceId: 'w', name: 'QA Tester', baseRole: 'developer', instructions: 'Write the failing test first.' } });
    const tester = (await seats.createSeat({ workspaceId: 'w', actorId: owner, projectId: B, role: 'developer', ownerId: person, name: 'qa-b', expiresInDays: 30 })).seat;
    await raw.agentSeat.update({ where: { id: tester.id }, data: { customRoleId: qa.id, instructions: 'You own the test suite.' } });
    const target = await issue({ projectId: B, assigneeId: tester.userId });
    const organisation = (await raw.agentRoleInstructions.findUnique({ where: { workspaceId_role: { workspaceId: 'w', role: 'developer' } } }))?.text ?? '';
    assert.deepEqual((await context(target)).instructions, [
      { layer: 'platform', text: ROLE_CATALOGUE.getRole('developer').platformPrompt.replaceAll('{{ownerId}}', person) },
      { layer: 'organisation', text: organisation },
      { layer: 'role', text: 'Write the failing test first.' },
      { layer: 'seat', text: 'You own the test suite.' },
    ]);
    // A retired role is one no new seat takes: the seats that have it keep its layer.
    await raw.agentCustomRole.update({ where: { id: qa.id }, data: { retiredAt: new Date(), instructions: '' } });
    assert.deepEqual((await context(target)).instructions.map(layer => [layer.layer, layer.text]).slice(2), [['role', ''], ['seat', 'You own the test suite.']]);
    // A seat of a built-in role still gets three.
    assert.deepEqual((await context(await issue({ assigneeId: devA.userId }))).instructions.map(layer => layer.layer), ['platform', 'organisation', 'seat']);
  });

  await t.test("a system admin's edit of a role's platform prompt is the platform layer of the next run, in every workspace", async () => {
    const { ROLE_CATALOGUE } = load('src/lib/agent-role-catalogue.ts');
    const shipped = ROLE_CATALOGUE.getRole('developer').platformPrompt.replaceAll('{{ownerId}}', person);
    const platform = async target => (await context(target)).instructions[0].text;
    const target = await issue({ assigneeId: devA.userId });
    // With no edit, the repository's text exactly.
    assert.equal(await platform(target), shipped);
    // A run that started before the edit keeps what it received.
    await run(target, 0, { state: 'running', outcome: null, endedAt: null, startedAt: ago(10) });
    const edit = (version, text, minutes) => raw.agentPlatformPrompt.create({ data: { role: 'developer', version, text, reason: `Version ${version}`, shippedSha256: 'x', createdById: owner, createdAt: ago(minutes) } });
    await edit(1, 'Before the run. Ask {{ownerId}}.', 20);
    await edit(2, 'Edited during the run. Ask {{ownerId}}.', 5);
    assert.equal(await platform(target), `Before the run. Ask ${person}.`);
    // The next run gets the latest edit, with the seat owner named.
    await raw.agentRun.updateMany({ where: { issueId: target.id, endedAt: null }, data: { state: 'finished', outcome: 'done', endedAt: ago(1) } });
    assert.equal(await platform(target), `Edited during the run. Ask ${person}.`);
    // A seat of the role in another workspace gets it too; another role does not.
    const elsewhere = (await seats.createSeat({ workspaceId: 'x', actorId: owner, projectId: 'cprojectx001', role: 'developer', ownerId: owner, name: 'dev-x', expiresInDays: 30 })).seat;
    const foreign = await raw.issue.create({ data: { workspaceId: 'x', projectId: 'cprojectx001', title: 'There', issueKey: 'XX-9', assigneeId: elsewhere.userId } });
    // Read with a person's token of that workspace: the run context is the same whoever reads it.
    await raw.appToken.create({ data: { appId: 'person-app', workspaceId: 'x', userId: owner, installationId: null, accessToken: Buffer.from('collab_owner_x_token').toString('base64'), scopes } });
    const [status, reply] = await read('collab_owner_x_token', foreign.issueKey);
    assert.deepEqual([status, reply.instructions[0].text], [200, `Edited during the run. Ask ${owner}.`]);
    const reviewer = (await seats.createSeat({ workspaceId: 'w', actorId: owner, projectId: A, role: 'reviewer', ownerId: person, name: 'rev-a', expiresInDays: 30 })).seat;
    assert.equal(await platform(await issue({ assigneeId: reviewer.userId, agentRequestRole: 'review' })), ROLE_CATALOGUE.getRole('reviewer').platformPrompt.replaceAll('{{ownerId}}', person));
    // Back to the repository's text: runs receive the shipped text again.
    await edit(3, null, 0);
    assert.equal(await platform(target), shipped);
  });
});
