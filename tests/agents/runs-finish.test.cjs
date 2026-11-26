const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { Prisma, PrismaClient } = require('@prisma/client');
const { load } = require('../security/helpers.cjs');
const { seatsDatabase } = require('./seats-db.cjs');

// Token-facing routes accept only cuid-shaped ids.
const owner = 'cowner00001', person = 'cperson0001', gone = 'cgone000001';
const A = 'cprojecta001', B = 'cprojectb001', C = 'cprojectc001';
const scopes = ['issues:read', 'issues:write', 'user:read'];
const ago = seconds => new Date(Date.now() - seconds * 1000);
const HEADINGS = ['Done', 'Decisions', 'Evidence', 'Next'];
/** An exit note with every heading except the ones named. */
const note = (...without) => HEADINGS.filter(heading => !without.includes(heading)).map(heading => `## ${heading}\n\nWhat there is to say under ${heading}.`).join('\n\n');
const usage = { day: '2026-11-15', chargedUSD: 0, reservedUSD: 0, estimatedUSD: 1.25, unknownUSD: 0, restarts: 0, starts: 1, totalStarts: 1,
  inputTokens: 1000, outputTokens: 200, cacheReadTokens: 5000, cacheWriteTokens: 300 };

let db;
after(() => db?.stop());

test('runs: finishing, the exit note and where the issue goes', async t => {
  db = await seatsDatabase(async prisma => {
    await prisma.user.createMany({ data: [owner, person, gone].map(id => ({ id, name: id, email: `${id}@example.test` })) });
    await prisma.workspace.create({ data: { id: 'w', name: 'w', slug: 'w', ownerId: owner } });
    await prisma.workspaceMember.createMany({ data: [{ workspaceId: 'w', userId: person }, { workspaceId: 'w', userId: gone, status: false }] });
    // A has three statuses in the done group, the final one not first by order, and three in the review group: one switched off,
    // and one stored before "in_review" but ordered after it. B has no review or blocked status, and C no done status that is in use.
    for (const [id, statuses] of [[A, { old_review: -1, to_do: 0, in_progress: 1, qa_testing: 3, in_review: 2, blocked: 4, waiting_for_deploy: 5, done: 6, deprecated: 7 }],
      [B, { to_do: 0, done: 1 }], [C, { to_do: 0, in_progress: 1, old_done: 2 }]]) {
      await prisma.project.create({ data: { id, workspaceId: 'w', name: id, slug: id, issuePrefix: id.slice(8, 9).repeat(2).toUpperCase() } });
      await prisma.projectStatus.createMany({ data: Object.entries(statuses).map(([name, order]) => ({ id: `${id}-${name}`, projectId: id, name, displayName: name,
        order, isFinal: name === 'done', isActive: !name.startsWith('old_') })) });
      // Every project has its repository connected, as a project whose seats take issues does. It is `tests/agents/runs-repository.test.cjs` that works it out.
      await prisma.repository.create({ data: { projectId: id, githubRepoId: id, owner: 'acme', name: id, fullName: `acme/${id}`, webhookSecret: 'secret' } });
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
  let forge = false, session = person;
  class ForgeProjectWriteError extends Error {}
  const deps = { '@/lib/forge/legacy-write-guard': { ForgeProjectWriteError,
    assertLegacyIssueWriteAllowed: async () => { if (forge) throw new ForgeProjectWriteError('Use the Forge board'); } }, zod, 'next/server': response, '@/lib/prisma': { prisma }, '@/lib/apps/auth-middleware': middleware, '@/lib/agent-seats': seats,
    '@/lib/agent-handoff-http': load('src/lib/agent-handoff-http.ts', { zod, 'next/server': response, './agent-handoffs': handoffs }, globals),
    '@/lib/issue-finder': load('src/lib/issue-finder.ts', { '@/lib/prisma': { prisma } }),
    '@/lib/permissions': load('src/lib/permissions.ts', { './prisma': { prisma } }, { console }),
    '@/lib/session': { getCurrentUser: async () => session && { id: session } }, '@/lib/agent-tokens': tokens };
  // The deployment's settings, as a finish reads them: none is set until a test sets one.
  const env = {};
  // The declared-stop email: its real checks and wording, the real sender module with a provider no test may reach, and in
  // front of it a sender the tests replace. The deployment has no mail key until the email's own tests set one, so no other
  // test's finish sends or records anything.
  const sent = [], mailLogs = [], provider = [], reads = [];
  const mailEnv = { NEXT_PUBLIC_APP_URL: 'https://collab.example.test' };
  const mailConsole = { error: (...args) => mailLogs.push(args) };
  const email = load('src/lib/email.ts', { 'server-only': {} }, { process: { env: mailEnv }, URL, AbortSignal,
    console: mailConsole, fetch: async (...args) => { provider.push(args); throw new Error('A test reached the mail provider'); } });
  const record = async message => { sent.push(message); return { success: true, messageId: 'test' }; };
  let sender = record;
  // What the email asks of the database, in order, with the moment the sender is handed the email.
  const traced = prisma.$extends({ query: { $allModels: { $allOperations({ model, operation, args, query }) { reads.push(`${model}.${operation}`); return query(args); } } } });
  const stopEmail = load('src/lib/agent-stop-email.ts', { ...deps, '@/lib/prisma': { prisma: traced },
    '@/lib/email': { ...email, sendEmail: message => { reads.push('send'); return sender(message); } } }, { Date, URL, console: mailConsole, process: { env: mailEnv } });
  // A finish starts the send and does not wait for it. Each send it started is kept here, so a test can wait until they are over.
  const sends = [];
  const settled = () => Promise.all(sends.splice(0));
  deps['@/lib/agent-stop-email'] = { emailDeclaredStop: stop => { const send = stopEmail.emailDeclaredStop(stop); sends.push(send); return send; } };
  deps['@/lib/agent-runs'] = load('src/lib/agent-runs.ts', deps, { Date, process: { env } });
  const inboxRoute = load('src/app/api/apps/auth/seats/me/inbox/route.ts', deps, globals);
  const runs = load('src/app/api/apps/auth/runs/route.ts', deps, globals);
  const one = load('src/app/api/apps/auth/runs/[id]/route.ts', deps, globals);
  const openRoute = load('src/app/api/issues/[issueId]/runs/route.ts', {
    ...deps, '@/lib/gateway-identity': { authMode: () => 'nextauth' },
  }, globals);
  const contextRoute = load('src/app/api/apps/auth/issues/[issueIdOrKey]/run-context/route.ts', deps, globals);

  const seat = async (name, projectId, role = 'developer') => {
    const made = await seats.createSeat({ workspaceId: 'w', actorId: owner, projectId, role, ownerId: person, name, expiresInDays: 30 });
    return { ...made.seat, token: made.token.token };
  };
  const devA = await seat('dev-a', A), otherA = await seat('other-a', A), devB = await seat('dev-b', B), devC = await seat('dev-c', C), release = await seat('release-a', A, 'release');
  const personToken = 'collab_person_token';
  /** The person, shaped like a seat for the helpers below. */
  const me = { token: personToken, userId: person, projectId: A };
  await raw.appToken.create({ data: { appId: 'person-app', workspaceId: 'w', userId: person, installationId: null,
    accessToken: Buffer.from(personToken).toString('base64'), scopes } });

  /** Calls a token route and returns [status, body]. */
  const call = async (handler, token, { body, id } = {}) => {
    const reply = await handler(new Request('https://collab.test/api', { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}` },
      ...(body && { body: JSON.stringify(body) }) }), { params: Promise.resolve({ id }) });
    return [reply.status, await reply.json()];
  };
  const checkout = async (by, target, generation = 'g1') => (await call(runs.POST, by.token ?? by, { body: { issue: target.issueKey, generation, runner: 'test' } }))[1].run;
  const act = (by, id, event, generation = 'g1') => call(one.PATCH, by.token ?? by, { id, body: { event, generation } });
  const finish = (by, id, body, generation = 'g1') => call(one.PATCH, by.token ?? by, { id, body: { event: 'finish', generation, note: note(), ...body } });
  const read = (by, id) => call(one.GET, by.token ?? by, { id });
  const offered = async (by, target) => (await call(inboxRoute.GET, by.token ?? by))[1].items.filter(item => item.issueId === target.id).map(item => item.reason);
  /** Asserts the refusal and returns its body. */
  const refused = async (pending, status, code) => {
    const [got, body] = await pending;
    assert.deepEqual([got, body.error], [status, code], body.error_description);
    return body;
  };
  let count = 0;
  /** An issue assigned to `to` (a seat or a user id), in status `status` of its project. */
  const issue = async (to, { project = to?.projectId ?? A, status = 'to_do', ...data } = {}) => {
    const userId = to?.userId ?? to;
    const made = await raw.issue.create({ data: { workspaceId: 'w', projectId: project, title: `Issue ${++count}`, issueKey: `K-${count}`,
      statusId: `${project}-${status}`, assigneeId: userId, createdAt: ago(900), ...data } });
    if (userId) await raw.issueAssignee.create({ data: { issueId: made.id, userId, role: 'ASSIGNEE', status: 'APPROVED', assignedAt: ago(600), approvedAt: ago(600) } });
    return made;
  };
  /** An issue of `by` with its run open. */
  const started = async (by, data) => { const target = await issue(by, data); return { target, run: await checkout(by, target) }; };
  const link = (source, relationType, target) => raw.issueRelation.create({ data: { sourceIssueId: source.id, targetIssueId: target.id, relationType } });
  /** A review request `by` filed for `source`, as filing one will write it. */
  const reviewRequest = async (by, source, data) => {
    const request = await issue(null, { agentRequestRole: 'review', reporterId: by.userId ?? by, ...data });
    await link(request, 'RELATES_TO', source);
    return request;
  };
  const move = (target, status) => raw.issue.update({ where: { id: target.id }, data: { statusId: `${target.projectId}-${status}` } });
  const stored = id => raw.agentRun.findUniqueOrThrow({ where: { id } });
  const fresh = target => raw.issue.findUniqueOrThrow({ where: { id: target.id } });
  const statusOf = async target => (await fresh(target)).statusId;
  const activities = (target, action) => raw.issueActivity.findMany({ where: { itemId: target.id, action }, orderBy: { createdAt: 'asc' } });
  /** A refused finish leaves the run open and unjudged, and the issue where the checkout put it. */
  const untouched = async (target, run, status = `${target.projectId}-in_progress`) => {
    const row = await stored(run.id);
    assert.deepEqual([row.state, row.outcome, row.note, row.endedAt, await statusOf(target)], ['running', null, null, null, status]);
    assert.deepEqual(await activities(target, 'AGENT_RUN_FINISHED'), []);
  };

  await t.test('finishing a run sets the issue finish date and a run that reopens it clears the date', async () => {
    const { target, run } = await started(devA);
    assert.equal((await fresh(target)).finishedAt, null);
    assert.equal((await finish(devA, run.id, { outcome: 'done' }))[0], 200);
    const finished = await fresh(target);
    assert.ok(finished.finishedAt instanceof Date);
    // An assignee may explicitly start an issue in a final status; starting it records the reopen.
    const reopened = await checkout(devA, target, 'reopen-finished');
    assert.ok(reopened.id);
    assert.equal((await fresh(target)).finishedAt, null);
    assert.equal(await statusOf(target), `${A}-in_progress`);
  });

  await t.test('a project made through the API has statuses a run can move its issue to (CLB-506)', async () => {
    // The rule for a new status gives every status here the group the migration gave it.
    const { statusGroup } = load('src/constants/project-statuses.ts');
    for (const status of await raw.projectStatus.findMany({ where: { projectId: { in: [A, B, C] } } })) assert.equal(statusGroup(status.name, status.isFinal), status.category, status.name);

    const token = 'collab_project_token';
    await raw.appScope.create({ data: { appId: 'person-app', scope: 'projects:write' } });
    await raw.appToken.create({ data: { appId: 'person-app', workspaceId: 'w', userId: person, installationId: null,
      accessToken: Buffer.from(token).toString('base64'), scopes: [...scopes, 'projects:write'] } });
    const [made, project] = await call(load('src/app/api/apps/auth/projects/route.ts', deps, globals).POST, token, { body: { name: 'Data Flow', slug: 'data-flow', issuePrefix: 'DF' } });
    assert.equal(made, 201, JSON.stringify(project));
    assert.deepEqual(Object.fromEntries(project.statuses.map(status => [status.name, status.category])),
      { backlog: 'todo', todo: 'todo', in_progress: 'in_progress', in_review: 'in_review', done: 'done', cancelled: 'done' });
    const statusId = name => project.statuses.find(status => status.name === name).id;
    // A project made through the API has no repository: its seat gets one connected, as a person would before the seat runs.
    await raw.repository.create({ data: { projectId: project.id, githubRepoId: 'df', owner: 'acme', name: 'data-flow', fullName: 'acme/data-flow', webhookSecret: 'secret' } });
    const dev = await seat('dev-df', project.id);
    const target = await issue(dev, { statusId: statusId('backlog') });
    const run = await checkout(dev, target);
    assert.equal(await statusOf(target), statusId('in_progress'), 'the checkout moves the issue');
    const [status, body] = await finish(dev, run.id, { outcome: 'in_review', askedUser: person, status: 'in_review' });
    assert.deepEqual([status, body.statusUnmapped, await statusOf(target)], [200, false, statusId('in_review')]);
  });

  await t.test('rule 6: a note without all four headings is refused, with the headings that are missing', async () => {
    const { target, run } = await started(devA);
    assert.deepEqual((await refused(finish(devA, run.id, { outcome: 'done', note: note('Evidence') }), 422, 'exit_note_required')).missing, ['Evidence']);
    // A heading is a line of its own, at that level, with that word.
    const loose = `${note('Done', 'Next')}\n\n### Done\n\nNext: nothing. ## Next\n\n## Next steps\n\n## done`;
    assert.deepEqual((await refused(finish(devA, run.id, { outcome: 'done', note: loose }), 422, 'exit_note_required')).missing, ['Done', 'Next']);
    await refused(finish(devA, run.id, { outcome: 'done', note: '   ' }), 400, 'invalid_request');
    await refused(finish(devA, run.id, { outcome: 'done', note: `${note()}\n${'x'.repeat(16_000)}` }), 400, 'invalid_request');
    await untouched(target, run);
    // Headings in another order, with text before the first, are a note.
    assert.equal((await finish(devA, run.id, { outcome: 'done', note: `Summary first.\n\n## Next\nA\n## Evidence\nB\n## Decisions  \nC\n## Done\nD` }))[0], 200);
  });

  await t.test('rule 6: in review and blocked say what they wait for, and done waits for nothing', async () => {
    const { target, run } = await started(devA);
    assert.deepEqual((await refused(finish(devA, run.id, { outcome: 'in_review' }), 422, 'exit_state_required')).missing, ['reviewRequest', 'askedUser']);
    assert.deepEqual((await refused(finish(devA, run.id, { outcome: 'blocked' }), 422, 'exit_state_required')).missing, ['blockedBy', 'askedUser']);
    // What an outcome does not wait for is not accepted with it.
    await refused(finish(devA, run.id, { outcome: 'done', askedUser: person }), 400, 'invalid_request');
    await refused(finish(devA, run.id, { outcome: 'in_review', blockedBy: 'K-1', askedUser: person }), 400, 'invalid_request');
    await refused(finish(devA, run.id, { outcome: 'blocked', reviewRequest: 'K-1', askedUser: person }), 400, 'invalid_request');
    for (const outcome of ['blocked', 'in_review']) for (const field of [{ verdict: 'passed' }, { reviewed: 'commit' }]) {
      await refused(finish(devA, run.id, { outcome, ...field }), 400, 'invalid_request');
    }
    await refused(finish(devA, run.id, { outcome: 'done', verdict: 'passed' }), 400, 'invalid_request');
    await refused(finish(devA, run.id, { outcome: 'finished' }), 400, 'invalid_request');
    await refused(finish(devA, run.id, { outcome: 'done', surprise: true }), 400, 'invalid_request');
    await refused(finish(devA, run.id, { outcome: 'done', usage: { estimatedUSD: -1 } }), 400, 'invalid_request');
    await untouched(target, run);
  });

  await t.test('rule 6: a pull request comes with the full commit it was left at, in review and blocked say the next step, and the next session reads them as fields', async () => {
    const { target, run } = await started(devA);
    const pullRequest = 'acme/app#12', headCommit = 'a1'.repeat(20), nextStep = 'Merge when the review approves this head';
    const missing = async body => (await refused(finish(devA, run.id, body), 422, 'exit_note_required')).missing;
    const facts = async issue => (await contextRoute.GET(new Request('https://collab.test/api', { headers: { Authorization: `Bearer ${devA.token}` } }),
      { params: Promise.resolve({ issueIdOrKey: issue.issueKey }) })).json().then(reply => reply.lastExitFacts);
    assert.equal(await facts(target), null);
    // A pull request without the commit, or with one that is not a full hash; a commit without its pull request.
    assert.deepEqual(await missing({ outcome: 'done', pullRequest }), ['headCommit']);
    for (const short of ['', 'a1b2c3d', 'A1'.repeat(20), `${headCommit}0`, 'a'.repeat(65)]) assert.deepEqual(await missing({ outcome: 'done', pullRequest, headCommit: short }), ['headCommit']);
    assert.deepEqual(await missing({ outcome: 'done', headCommit }), ['pullRequest']);
    for (const loose of ['', 'x'.repeat(221), '12', 'app#12', 'https://github.com/acme/app/pull/12', 'acme/app#0']) assert.deepEqual(await missing({ outcome: 'done', pullRequest: loose, headCommit }), ['pullRequest']);
    // In review and blocked need a next step: nothing under ## Next, or only the next heading, is none. It is one line.
    const bare = [`${note('Next')}\n\n## Next`, `## Next\n\n${note('Next')}`];
    for (const outcome of ['in_review', 'blocked']) for (const empty of bare) assert.deepEqual(await missing({ outcome, askedUser: person, note: empty }), ['nextStep']);
    for (const outcome of ['in_review', 'blocked']) assert.deepEqual(await missing({ outcome, askedUser: person, note: `${bare[0]}\n\n###` }), ['nextStep']);
    // Nor is a list item with nothing in it.
    assert.deepEqual(await missing({ outcome: 'blocked', askedUser: person, note: `${bare[0]}\n\n- \n1.` }), ['nextStep']);
    assert.deepEqual(await missing({ outcome: 'blocked', askedUser: person, nextStep: 'First this.\nThen that.' }), ['nextStep']);
    for (const separator of ['\u2028', '\u2029']) for (const outcome of ['done', 'in_review', 'blocked']) {
      assert.deepEqual(await missing({ outcome, ...(outcome !== 'done' && { askedUser: person }), nextStep: `Review${separator}Deploy` }), ['nextStep']);
      if (outcome !== 'done') assert.deepEqual(await missing({ outcome, askedUser: person, note: `${bare[0]}\n\nReview${separator}Deploy` }), ['nextStep']);
    }
    assert.deepEqual(await missing({ outcome: 'in_review', askedUser: person, note: bare[0], pullRequest }), ['headCommit', 'nextStep']);
    for (const outcome of ['done', 'in_review', 'blocked']) for (const nextStep of ['', 'x'.repeat(301)])
      assert.deepEqual(await missing({ outcome, ...(outcome !== 'done' && { askedUser: person }), nextStep }), ['nextStep']);
    await untouched(target, run);

    assert.equal((await finish(devA, run.id, { outcome: 'blocked', askedUser: person, pullRequest, headCommit, nextStep }))[0], 200);
    const details = JSON.parse((await activities(target, 'AGENT_RUN_FINISHED'))[0].details);
    assert.deepEqual([details.pullRequest, details.headCommit, details.nextStep], [pullRequest, headCommit, nextStep]);
    assert.deepEqual(await facts(target), { pullRequest, headCommit, nextStep });
    // A pull request number is as long as a provider's can be.
    const numbered = await started(devA);
    assert.equal((await finish(devA, numbered.run.id, { outcome: 'done', pullRequest: 'acme/app#2147483647', headCommit }))[0], 200);
    assert.equal((await facts(numbered.target)).pullRequest, 'acme/app#2147483647');

    // A CLI before 0.12.0 cannot send the field: the first line under ## Next is the next step. Work without a pull request names none.
    const old = await started(devA);
    assert.equal((await finish(devA, old.run.id, { outcome: 'blocked', askedUser: person, note: `${note('Next')}\n\n## Next\n\n1. Wait for the release.\n2. Check the page.` }))[0], 200);
    assert.deepEqual(await facts(old.target), { pullRequest: null, headCommit: null, nextStep: 'Wait for the release.' });
    // Any Markdown list mark is taken off the line.
    for (const mark of ['- ', '* ', '+ ', '2) ']) {
      const listed = await started(devA);
      assert.equal((await finish(devA, listed.run.id, { outcome: 'blocked', askedUser: person, note: `${note('Next')}\n\n## Next\n\n${mark}Deploy it.` }))[0], 200);
      assert.equal((await facts(listed.target)).nextStep, 'Deploy it.');
    }
    // Done may leave the next step out, and then the note's text is not read for one.
    const done = await started(devA);
    assert.equal((await finish(devA, done.run.id, { outcome: 'done', note: bare[0] }))[0], 200);
    assert.deepEqual(await facts(done.target), { pullRequest: null, headCommit: null, nextStep: null });
  });

  await t.test('declared stops: a finish that names a person may say what it asks, a decision or work for their hands', async () => {
    const { target, run } = await started(devA);
    const decision = { kind: 'decision', questions: [{ question: ' The migration rewrites the orders table, about four minutes with the app stopped. Run it in tonight\'s window, or split it into two releases? ',
      options: ['window', ' split '], suggested: 'split' }] };
    const hands = { kind: 'hands', steps: '1. Open the repository settings.\n2. Under Webhooks, add the pull request event.\n3. Save.', doneWord: 'webhook added' };
    const [question] = decision.questions;
    const asks = body => finish(devA, run.id, { outcome: 'blocked', askedUser: person, ...body });
    // Only a finish that names a person asks one.
    assert.deepEqual((await refused(finish(devA, run.id, { outcome: 'in_review', ask: decision }), 422, 'exit_state_required')).missing, ['askedUser']);
    assert.deepEqual((await refused(finish(devA, run.id, { outcome: 'done', ask: hands }), 422, 'exit_state_required')).missing, ['askedUser']);
    // A wrong one is refused like a wrong exit fact, and says where it is wrong.
    const one = (changed, more = []) => ({ kind: 'decision', questions: [{ ...question, ...changed }, ...more] });
    for (const [ask, missing] of [
      ['Run it tonight or split it? Reply `window` or `split`.', ['ask']],
      [{ kind: 'status', text: 'Nothing new since yesterday.' }, ['ask.kind']],
      [{ ...decision, replyOn: 'K-1' }, ['ask']],
      [{ kind: 'decision', questions: [] }, ['ask.questions']],
      [one({}, Array(5).fill(question)), ['ask.questions']],
      [one({ question: 'x'.repeat(2001) }), ['ask.questions.0.question']],
      [one({ question: '  ' }), ['ask.questions.0.question']],
      [one({ options: ['window'], suggested: undefined }), ['ask.questions.0.options']],
      [one({ options: ['window', 'split', 'later', 'never', 'ask again'], suggested: undefined }), ['ask.questions.0.options']],
      [one({ options: ['window', 'window'], suggested: undefined }), ['ask.questions.0.options']],
      [one({ options: ['window', 'x'.repeat(41)], suggested: undefined }), ['ask.questions.0.options.1']],
      [one({ options: ['window/split', 'later'], suggested: undefined }), ['ask.questions.0.options.0']],
      [one({ options: ['window', 'split\nlater'], suggested: undefined }), ['ask.questions.0.options.1']],
      [one({ suggested: 'later' }), ['ask.questions.0.suggested']],
      [one({}, [{ question: 'And the backfill?', options: ['now'] }]), ['ask.questions.1.options']],
      [{ kind: 'hands', steps: hands.steps }, ['ask.doneWord']],
      [{ ...hands, steps: 'x'.repeat(4001) }, ['ask.steps']],
      [{ ...hands, doneWord: 'done/not done' }, ['ask.doneWord']],
    ]) assert.deepEqual((await refused(asks({ ask }), 422, 'exit_note_required')).missing, missing, JSON.stringify(ask).slice(0, 80));
    await untouched(target, run);

    // It is kept with the finish's other checked facts, trimmed, and nowhere else.
    assert.equal((await asks({ ask: decision }))[0], 200);
    const [entry] = await activities(target, 'AGENT_RUN_FINISHED');
    assert.deepEqual(JSON.parse(entry.details).ask, { kind: 'decision', questions: [{ question: question.question.trim(), options: ['window', 'split'], suggested: 'split' }] });
    assert.equal((await stored(run.id)).ask, null);
    const second = await started(devA);
    assert.equal((await finish(devA, second.run.id, { outcome: 'in_review', askedUser: person, ask: hands }))[0], 200);
    assert.deepEqual(JSON.parse((await activities(second.target, 'AGENT_RUN_FINISHED'))[0].details).ask, hands);
  });

  await t.test('a finish naming a person accepts both ask-file examples from the seat instructions', async () => {
    const { ROLE_CATALOGUE } = load('src/lib/agent-role-catalogue.ts');
    const [platform] = ROLE_CATALOGUE.instructionLayers('developer', { ownerId: person });
    const shared = platform.text.split('\n\nAsking a person.')[1];
    const examples = Array.from(shared.matchAll(/`(\{[^`]*\})`/g), match => JSON.parse(match[1]));
    assert.deepEqual(examples.map(ask => ask.kind).sort(), ['decision', 'hands']);
    for (const ask of examples) {
      const { run } = await started(devA);
      const [status, body] = await finish(devA, run.id, { outcome: 'blocked', askedUser: person, ask });
      assert.equal(status, 200, body.error_description);
    }
  });

  await t.test('declared stops: the person a seat names is told by email, once, after the finish is stored', async t => {
    const observer = new PrismaClient({ datasources: { db: { url: db.url } } });
    mailEnv.RESEND_API_KEY = 'test-resend-key';
    t.after(() => { sender = record; delete mailEnv.RESEND_API_KEY; return observer.$disconnect(); });
    const EMAILED = 'AGENT_STOP_EMAILED';
    const question = { question: "Run the migration in tonight's window, or split it into two releases?", options: ['window', 'split'], suggested: 'split' };
    const decision = { kind: 'decision', questions: [question] };
    const several = { kind: 'decision', questions: [question, { question: 'Backfill the old rows as well?', options: ['yes', 'no', 'later'] }] };
    const hands = { kind: 'hands', steps: '1. Open the repository settings.\n2. Under Webhooks, add the pull request event.\n3. Save.', doneWord: 'webhook added' };
    const footer = 'You get this because a seat named you on this issue. To stop these emails, turn off email notifications in your Collab settings.';
    // Comments at set times, in a run that began a minute ago: two written in one millisecond would have no order.
    const says = (target, authorId, content, seconds) => raw.issueComment.create({ data: { issueId: target.id, authorId, content, createdAt: ago(seconds) } });
    const asking = async () => { const stop = await open(); await raw.agentRun.update({ where: { id: stop.run.id }, data: { startedAt: ago(60) } }); return stop; };
    // Another workspace of the same owner, which the person is no member of.
    await raw.workspace.create({ data: { id: 'mail-w2', name: 'w2', slug: 'mail-w2', ownerId: owner } });
    await raw.project.create({ data: { id: 'cprojectm001', workspaceId: 'mail-w2', name: 'm', slug: 'm', issuePrefix: 'MM' } });
    let mails = 0;
    /** An issue of the seat with its run open, under a key and a title the email is asserted with. */
    const open = data => started(devA, { issueKey: `MAIL-${++mails}`, title: 'Orders migration', ...data });
    /** The emails one finish sent. */
    const finished = async (run, body) => {
      await settled();
      sent.length = 0;
      assert.equal((await finish(devA, run.id, { outcome: 'blocked', ...body }))[0], 200);
      await settled();
      return sent.splice(0);
    };
    /** A stop that names the person and says what it asks, and the emails its finish sent. */
    const stopped = async (ask, data) => {
      const { target, run } = await open(data);
      return { target, run, ask, mails: await finished(run, { askedUser: person, ask }) };
    };
    /** The same stop judged again, as it is at the moment of sending and as if no email about its issue had gone out: the emails that sends. */
    const resent = async ({ run, ask }, userId = person) => {
      await settled();
      await raw.issueActivity.deleteMany({ where: { itemId: run.issueId, action: EMAILED } });
      sent.length = 0;
      await stopEmail.emailDeclaredStop({ runId: run.id, userId, ask });
      return sent.splice(0);
    };
    const again = async (stop, userId) => (await resent(stop, userId)).length;
    // The time is the finish's own, so it is asserted apart, on a finish whose time the test sets.
    const timeless = text => text.replace(/ at \d\d:\d\d UTC on [1-9]\d? [A-Z][a-z]+ \d{4}/, ' at TIME');

    await t.test('a decision with one question', async () => {
      const first = await stopped(decision);
      assert.deepEqual(first.mails.map(mail => [mail.to, mail.subject, Object.keys(mail).sort()]),
        [['cperson0001@example.test', 'MAIL-1: dev-a needs a decision from you', ['html', 'subject', 'text', 'to']]]);
      assert.equal(timeless(first.mails[0].text), `dev-a stopped work on MAIL-1 (Orders migration) at TIME and is waiting for your answer.

Run the migration in tonight's window, or split it into two releases?

Reply with one of: window, split. dev-a suggests split.

Answer here: https://collab.example.test/w/issues/MAIL-1

The work on this issue waits until someone answers.

${footer}`);
      // The same sentences as paragraphs, the link as a link, and nothing that loads or tracks.
      assert.equal(timeless(first.mails[0].html), `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
<p>dev-a stopped work on MAIL-1 (Orders migration) at TIME and is waiting for your answer.</p>
<p>Run the migration in tonight&#39;s window, or split it into two releases?</p>
<p>Reply with one of: window, split. dev-a suggests split.</p>
<p>Answer here: <a href="https://collab.example.test/w/issues/MAIL-1" style="color: #22c55e; text-decoration: underline;">https://collab.example.test/w/issues/MAIL-1</a></p>
<p>The work on this issue waits until someone answers.</p>
<p style="color: #666; font-size: 14px;">${footer}</p>
</div>`);
      // The finish's time, in UTC: two digits for the hour, none added to the day.
      await raw.agentRun.update({ where: { id: first.run.id }, data: { startedAt: new Date('2026-12-03T09:00:00Z'), endedAt: new Date('2026-12-03T09:05:00Z') } });
      assert.equal((await resent(first))[0].text.split('\n')[0], 'dev-a stopped work on MAIL-1 (Orders migration) at 09:05 UTC on 3 December 2026 and is waiting for your answer.');
      // A question without a suggested reply word says nothing of one.
      const plain = await stopped({ kind: 'decision', questions: [{ question: 'Ship it today?', options: ['go', 'hold'] }] });
      assert.equal(plain.mails[0].text.split('\n\n')[2], 'Reply with one of: go, hold.');
    });

    await t.test('a decision with several questions', async () => {
      const { mails: [mail, ...more] } = await stopped(several, { issueKey: 'ASKS-2' });
      assert.deepEqual([more.length, mail.to, mail.subject], [0, 'cperson0001@example.test', 'ASKS-2: dev-a has 2 questions for you']);
      assert.equal(timeless(mail.text), `dev-a stopped work on ASKS-2 (Orders migration) at TIME and is waiting for 2 answers from you.

1. Run the migration in tonight's window, or split it into two releases?
   Reply words: window, split. Suggested: split.
2. Backfill the old rows as well?
   Reply words: yes, no, later.

Answer on the issue: https://collab.example.test/w/issues/ASKS-2

The work on this issue waits until someone answers.

${footer}`);
      assert.ok(mail.html.includes('<p>1. Run the migration in tonight&#39;s window, or split it into two releases?<br>   Reply words: window, split. Suggested: split.<br>'
        + '2. Backfill the old rows as well?<br>   Reply words: yes, no, later.</p>'), mail.html);
    });

    await t.test('work for the hands of the person', async () => {
      const { mails: [mail, ...more] } = await stopped(hands, { issueKey: 'HANDS-3' });
      assert.deepEqual([more.length, mail.to, mail.subject], [0, 'cperson0001@example.test', 'HANDS-3: dev-a is waiting for you to do something']);
      assert.equal(timeless(mail.text), `dev-a stopped work on HANDS-3 (Orders migration) at TIME. The next step is one only you can take.

1. Open the repository settings.
2. Under Webhooks, add the pull request event.
3. Save.

When it is done, reply "webhook added" on the issue: https://collab.example.test/w/issues/HANDS-3

${footer}`);
      assert.ok(mail.html.includes('<p>1. Open the repository settings.<br>2. Under Webhooks, add the pull request event.<br>3. Save.</p>\n'
        + '<p>When it is done, reply &quot;webhook added&quot; on the issue: <a href="https://collab.example.test/w/issues/HANDS-3"'), mail.html);
    });

    await t.test('what the seat wrote is escaped in the HTML part and literal in the text part', async () => {
      const markup = '<img src=x onerror=alert(1)> **bold** & "quoted"';
      const escaped = '&lt;img src=x onerror=alert(1)&gt; **bold** &amp; &quot;quoted&quot;';
      const marked = { question: markup, options: ['<b>', 'no'], suggested: '<b>' };
      for (const ask of [{ kind: 'decision', questions: [marked] }, { kind: 'decision', questions: [marked, question] }, { kind: 'hands', steps: markup, doneWord: '<u>done' }]) {
        const { mails: [mail] } = await stopped(ask, { title: `Title ${markup}` });
        assert.ok(mail.text.includes(markup) && mail.text.includes(`(Title ${markup})`), mail.text);
        assert.ok(mail.text.includes(ask.kind === 'hands' ? 'reply "<u>done" on' : ': <b>, no. '), mail.text);
        assert.ok(mail.html.includes(escaped) && mail.html.includes(`(Title ${escaped})`), mail.html);
        assert.ok(mail.html.includes(ask.kind === 'hands' ? 'reply &quot;&lt;u&gt;done&quot; on' : ': &lt;b&gt;, no. '), mail.html);
        // The only tags are the ones the email itself is made of, and the only address in an attribute is the issue's.
        assert.deepEqual([...new Set(mail.html.match(/<\/?[a-z]+/g))].filter(tag => tag !== '<br').sort(), ['</a', '</div', '</p', '<a', '<div', '<p']);
        assert.deepEqual(mail.html.match(/href="[^"]*"/g), [`href="https://collab.example.test/w/issues/MAIL-${mails}"`]);
      }
    });

    await t.test('nothing is sent for a finish that asks nothing, or one answered before it finished', async () => {
      const silent = await open();
      assert.deepEqual(await finished(silent.run, { askedUser: person }), []);
      const waiting = await open();
      const blocker = await issue(null);
      await link(blocker, 'BLOCKS', waiting.target);
      assert.deepEqual(await finished(waiting.run, { blockedBy: blocker.issueKey }), []);
      // The seat asked in a comment, and the person replied before the seat finished: the stop is answered already.
      const answered = await asking();
      await says(answered.target, devA.userId, 'Window or split?', 30);
      await says(answered.target, person, 'split', 20);
      assert.deepEqual(await finished(answered.run, { askedUser: person, ask: decision }), []);
      // What another seat wrote in that time is not the answer of the person.
      const unanswered = await asking();
      await says(unanswered.target, devA.userId, 'Window or split?', 30);
      await says(unanswered.target, otherA.userId, 'I would split.', 20);
      assert.equal((await finished(unanswered.run, { askedUser: person, ask: decision })).length, 1);
    });

    await t.test('nothing is sent once anybody but the seat has commented after the finish, as the row on Home clears', async () => {
      const stop = await stopped(decision);
      assert.deepEqual([stop.mails.length, await again(stop)], [1, 1]);
      // What the seat itself adds after its finish answers nothing.
      const own = await says(stop.target, devA.userId, 'One more detail.', -5);
      assert.equal(await again(stop), 1);
      // A person's comment answers, and so does another seat's: either clears the row on Home.
      for (const authorId of [person, owner, otherA.userId]) {
        const reply = await says(stop.target, authorId, 'split', -10);
        assert.equal(await again(stop), 0, authorId);
        await raw.issueComment.delete({ where: { id: reply.id } });
      }
      // A comment on another issue says nothing about this one.
      await says((await stopped(decision)).target, person, 'split', -10);
      assert.equal(await again(stop), 1);
      await raw.issueComment.delete({ where: { id: own.id } });
      assert.deepEqual(mailLogs, []);
    });

    await t.test('at most one email per person per issue in an hour: a second finish sends nothing, another person or another issue still gets one, and after the hour it sends again', async () => {
      const first = await stopped(decision);
      /** The seat takes the issue again and stops again, naming `askedUser`: who that finish emailed. */
      const once = async (askedUser = person, { target } = first) => {
        const run = await checkout(devA, target);
        return (await finished(run, { askedUser, ask: decision })).map(mail => mail.to);
      };
      const records = async ({ target } = first) => (await activities(target, EMAILED)).map(row => [row.userId, row.newValue, JSON.parse(row.details).runId === undefined]);
      assert.deepEqual([first.mails.map(mail => mail.to), await records()], [['cperson0001@example.test'], [[devA.userId, person, false]]]);
      // The same person on the same issue, twice more inside the hour: nothing, and nothing more is recorded.
      assert.deepEqual([await once(), await once(), await records()], [[], [], [[devA.userId, person, false]]]);
      // Another person on the same issue gets theirs, once.
      assert.deepEqual([await once(owner), await once(owner), await once()], [['cowner00001@example.test'], [], []]);
      assert.deepEqual((await records()).map(([, to]) => to), [person, owner]);
      // The same person on another issue gets theirs, once.
      const second = await stopped(decision);
      assert.deepEqual([second.mails.map(mail => mail.to), await once(person, second), await once()], [['cperson0001@example.test'], [], []]);
      // The clock is turned back on what was recorded for the person: under an hour ago holds, over an hour ago sends again, once.
      const recorded = { itemId: first.target.id, action: EMAILED, newValue: person };
      await raw.issueActivity.updateMany({ where: recorded, data: { createdAt: ago(59 * 60) } });
      assert.deepEqual([await once(), await once(owner)], [[], []]);
      await raw.issueActivity.updateMany({ where: recorded, data: { createdAt: ago(61 * 60) } });
      assert.deepEqual([await once(), await once(), await once(owner)], [['cperson0001@example.test'], [], []]);
      assert.deepEqual((await records()).map(([, to]) => to), [person, owner, person]);
      // The timeline says it in words.
      const { getActionText } = load('src/components/issue/sections/activity/utils/activityHelpers.ts');
      assert.equal(getActionText({ action: EMAILED, user: { name: 'dev-a' }, details: {} }), 'Collab attempted to email the person dev-a named on this issue');
      assert.deepEqual(mailLogs, []);
    });

    await t.test('the recipient, their access and their preference are the last thing read before the email is handed to the sender', async () => {
      const stop = await stopped(decision);
      await again(stop);
      // Only what it writes down for the hourly limit comes between that read and the sender.
      assert.deepEqual(reads.splice(0).slice(-3), ['Issue.findFirst', 'IssueActivity.create', 'send']);
      // Whoever lost access during the earlier reads is still refused: every read but that one comes before it.
      reads.length = 0;
      await raw.workspaceMember.updateMany({ where: { workspaceId: 'w', userId: person }, data: { status: false } });
      assert.equal(await again(stop), 0);
      await raw.workspaceMember.updateMany({ where: { workspaceId: 'w', userId: person }, data: { status: true } });
      assert.deepEqual([reads.at(-1), reads.filter(read => read === 'Issue.findFirst').length, reads.includes('IssueActivity.create')], ['Issue.findFirst', 1, false]);
    });

    await t.test('nothing is sent to somebody who, at the moment of sending, is not a member, may not read the issue or is no person', async () => {
      const stop = await stopped(decision);
      assert.deepEqual([stop.mails.length, await again(stop)], [1, 1]);
      const membership = { workspaceId: 'w', userId: person };
      await raw.workspaceMember.updateMany({ where: membership, data: { status: false } });
      assert.equal(await again(stop), 0);
      await raw.workspaceMember.updateMany({ where: membership, data: { status: true } });
      assert.equal(await again(stop), 1);
      // The owner of the workspace is told like a member; a member who was switched off and somebody who was never in it are not.
      assert.deepEqual([await again(stop, owner), await again(stop, gone), await again(stop, 'cstranger001')], [1, 0, 0]);

      // A member of the workspace who may not read the issue: its project is another workspace's.
      await raw.issue.update({ where: { id: stop.target.id }, data: { projectId: 'cprojectm001', statusId: null } });
      assert.deepEqual([await again(stop), await again(stop, owner)], [0, 1]);
      await raw.issue.update({ where: { id: stop.target.id }, data: { projectId: A, statusId: `${A}-blocked` } });
      assert.equal(await again(stop), 1);

      // The account of a seat is a member of the workspace and no person, with an email address or without one.
      assert.equal(await again(stop, otherA.userId), 0);
      await raw.user.update({ where: { id: otherA.userId }, data: { email: 'seat@example.test' } });
      assert.equal(await again(stop, otherA.userId), 0);
      await raw.user.update({ where: { id: otherA.userId }, data: { email: null } });
      // A run that has not finished is no stop.
      assert.equal(await again({ run: (await open()).run, ask: decision }), 0);
      assert.deepEqual(mailLogs, []);
    });

    await t.test('email switched off on the row of the workspace or on the row with no workspace sends nothing, and both on or missing sends', async () => {
      const stop = await stopped(decision);
      const row = (workspaceId, emailNotificationsEnabled) => raw.notificationPreferences.create({ data: { userId: person, workspaceId, emailNotificationsEnabled } });
      const set = (preference, emailNotificationsEnabled) => raw.notificationPreferences.update({ where: { id: preference.id }, data: { emailNotificationsEnabled } });
      // No row at all is on. So is the switch of another workspace, whatever it says, and that of somebody else.
      assert.deepEqual([stop.mails.length, await again(stop)], [1, 1]);
      await row('mail-w2', false);
      await raw.notificationPreferences.create({ data: { userId: owner, workspaceId: 'w', emailNotificationsEnabled: false } });
      await raw.notificationPreferences.create({ data: { userId: owner, emailNotificationsEnabled: false } });
      assert.equal(await again(stop), 1);
      // Off for this workspace, as the settings page stores it.
      const here = await row('w', false);
      assert.equal(await again(stop), 0);
      assert.deepEqual(await finished((await open()).run, { askedUser: person, ask: hands }), []);
      await set(here, true);
      assert.equal(await again(stop), 1);
      // Off on the row with no workspace, as the notification service and push read it.
      const everywhere = await row(null, false);
      assert.equal(await again(stop), 0);
      assert.deepEqual(await finished((await open()).run, { askedUser: person, ask: hands }), []);
      // Off on either row is off; both on sends.
      await set(here, false);
      assert.equal(await again(stop), 0);
      await set(everywhere, true);
      assert.equal(await again(stop), 0);
      await set(here, true);
      assert.equal(await again(stop), 1);
      assert.equal((await finished((await open()).run, { askedUser: person, ask: hands })).length, 1);
      await raw.notificationPreferences.deleteMany({ where: { userId: { in: [person, owner] } } });
      assert.deepEqual(mailLogs, []);
    });

    await t.test('the email is sent after the finish is committed, and a sender that fails leaves the finish stored', async () => {
      // Another connection sees only what is committed.
      const seen = [];
      let current = await open();
      sender = async () => {
        const { target, run } = current;
        seen.push([(await observer.agentRun.findUniqueOrThrow({ where: { id: run.id } })).state,
          await observer.issueActivity.count({ where: { itemId: target.id, action: 'AGENT_RUN_FINISHED' } }),
          (await observer.issue.findUniqueOrThrow({ where: { id: target.id } })).statusId]);
        // The row of the issue is free again: inside the lock of the finish this would be refused at once.
        await observer.$transaction(tx => tx.$queryRaw`SELECT "id" FROM "Issue" WHERE "id" = ${target.id} FOR UPDATE NOWAIT`);
        return { success: true };
      };
      assert.equal((await finish(devA, current.run.id, { outcome: 'blocked', askedUser: person, ask: decision }))[0], 200);
      await settled();
      assert.deepEqual([seen, mailLogs], [[['finished', 1, `${A}-blocked`]], []]);

      // The real sender does not throw when the provider fails: it returns that it failed. One that throws is caught as well.
      // The address, the question and what the provider said are in the failure, and in nothing that is logged: one fixed line each time.
      for (const failing of [
        async message => ({ success: false, error: `The email service did not accept ${message.to}: ${message.text}` }),
        async message => { throw new Error(`Provider refused ${message.to}: ${message.text}`); },
      ]) {
        sender = failing;
        current = await open();
        const [status, body] = await finish(devA, current.run.id, { outcome: 'blocked', askedUser: person, ask: decision });
        await settled();
        assert.deepEqual([status, body.run.state, body.run.outcome], [200, 'finished', 'blocked']);
        assert.deepEqual([(await stored(current.run.id)).state, (await activities(current.target, 'AGENT_RUN_FINISHED')).length, await statusOf(current.target)],
          ['finished', 1, `${A}-blocked`]);
        assert.deepEqual(mailLogs.splice(0), [['Declared stop email was not sent']]);
      }
    });

    // A reply that waited for the mail provider would never come here, so the test is given a limit and not a pause.
    await t.test('the finish reply returns while the send is still pending, and a sender that rejects later changes nothing and logs once', { timeout: 10_000 }, async t => {
      let reached, refuse;
      const called = new Promise(resolve => { reached = resolve; });
      const refusal = new Promise((_, reject) => { refuse = reject; });
      // Whatever becomes of this test, no send is left waiting for it, and a refusal nobody waited for is no error of its own.
      refusal.catch(() => {});
      t.after(() => refuse(new Error('The test is over')));
      let calls = 0;
      sender = message => { calls++; reached(message); return refusal; };
      const { target, run } = await open();
      await settled();
      const [status, body] = await finish(devA, run.id, { outcome: 'blocked', askedUser: person, ask: decision });
      assert.deepEqual([status, body.run.state, body.run.outcome, sends.length], [200, 'finished', 'blocked', 1]);
      // The send reached the provider after the reply was given, and is not over.
      const [send] = sends.splice(0);
      let over = false;
      send.then(() => { over = true; });
      const message = await called;
      const state = async () => [(await stored(run.id)).state, (await activities(target, 'AGENT_RUN_FINISHED')).length, await statusOf(target), over, calls, mailLogs.length];
      assert.deepEqual(await state(), ['finished', 1, `${A}-blocked`, false, 1, 0]);
      // The provider refuses at last: the send is over without an error for anybody, the finish is as it was, and one line is logged.
      refuse(new Error(`Provider refused ${message.to}: ${message.text}`));
      assert.equal(await send, undefined);
      assert.deepEqual(await state(), ['finished', 1, `${A}-blocked`, true, 1, 1]);
      assert.deepEqual(mailLogs.splice(0), [['Declared stop email was not sent']]);
    });

    /** A finish that names the person and asks, with the sender `through`: what was handed to it, logged and recorded for the hourly limit. */
    const outcome = async through => {
      sender = through;
      const { target, run } = await open();
      const mails = await finished(run, { askedUser: person, ask: hands });
      return [(await stored(run.id)).state, mails.map(mail => mail.html.match(/href="([^"]*)"/)[1]), mailLogs.splice(0), (await activities(target, EMAILED)).length, provider.length];
    };

    await t.test('without an address of this Collab nothing is sent and the fixed line is logged: no link to another installation', async t => {
      const address = mailEnv.NEXT_PUBLIC_APP_URL;
      t.after(() => { delete mailEnv.NEXTAUTH_URL; mailEnv.NEXT_PUBLIC_APP_URL = address; });
      delete mailEnv.NEXT_PUBLIC_APP_URL;
      assert.deepEqual(await outcome(record), ['finished', [], [['Declared stop email was not sent']], 0, 0]);
      // Either setting is an address, the first before the second.
      mailEnv.NEXTAUTH_URL = 'https://second.example.test';
      assert.deepEqual(await outcome(record), ['finished', [`https://second.example.test/w/issues/MAIL-${mails}`], [], 1, 0]);
      mailEnv.NEXT_PUBLIC_APP_URL = address;
      assert.deepEqual(await outcome(record), ['finished', [`${address}/w/issues/MAIL-${mails}`], [], 1, 0]);
    });

    await t.test('without a mail key nothing is sent, logged or recorded, and nothing fails', async t => {
      const key = mailEnv.RESEND_API_KEY;
      t.after(() => { mailEnv.RESEND_API_KEY = key; });
      // With a key the real sender goes to the provider, and says it failed when the provider does: that is logged once for this email.
      assert.deepEqual((await outcome(email.sendEmail)).slice(2), [[['Resend email request could not be confirmed'], ['Declared stop email was not sent']], 1, 1]);
      provider.length = 0;
      // What the sender does today without a key: it says so to its caller, reaches no provider and logs nothing.
      delete mailEnv.RESEND_API_KEY;
      assert.deepEqual({ ...await email.sendEmail({ to: 'cperson0001@example.test', subject: 's', html: '<p>h</p>', text: 't' }) },
        { success: false, error: 'Email delivery is not configured. Contact your workspace administrator.' });
      // So the email is not attempted at all, with either sender in front, and no address of this Collab is missed either.
      delete mailEnv.NEXT_PUBLIC_APP_URL;
      t.after(() => { mailEnv.NEXT_PUBLIC_APP_URL = 'https://collab.example.test'; });
      for (const through of [email.sendEmail, record]) assert.deepEqual(await outcome(through), ['finished', [], [], 0, 0]);
    });
  });

  await t.test('declared stops: one setting of the deployment refuses a finish that names a person without ask, and it is off until set', async () => {
    const { target, run } = await started(devA);
    const blocker = await issue(null);
    await link(blocker, 'BLOCKS', target);
    t.after(() => { delete env.COLLAB_STOP_ASK_REQUIRED; });
    env.COLLAB_STOP_ASK_REQUIRED = 'true';
    for (const outcome of ['blocked', 'in_review']) {
      assert.deepEqual((await refused(finish(devA, run.id, { outcome, askedUser: person }), 422, 'exit_state_required')).missing, ['ask']);
    }
    await untouched(target, run);
    // A stop that names no person asks nothing, and one that says what it asks is taken.
    assert.equal((await finish(devA, run.id, { outcome: 'blocked', blockedBy: blocker.issueKey }))[0], 200);
    const asked = await started(devA);
    assert.equal((await finish(devA, asked.run.id, { outcome: 'blocked', askedUser: person, ask: { kind: 'hands', steps: 'Merge pull request 12 after the backup.', doneWord: 'merged' } }))[0], 200);

    // Off, and with any other value, a finish without ask is accepted as before and records none.
    for (const value of [undefined, 'false', '1']) {
      if (value === undefined) delete env.COLLAB_STOP_ASK_REQUIRED; else env.COLLAB_STOP_ASK_REQUIRED = value;
      const legacy = await started(devA);
      assert.equal((await finish(devA, legacy.run.id, { outcome: 'blocked', askedUser: person }))[0], 200, String(value));
      const details = JSON.parse((await activities(legacy.target, 'AGENT_RUN_FINISHED'))[0].details);
      assert.deepEqual([details.askedUser, 'ask' in details], [person, false]);
    }
  });

  await t.test('a valid finish ends the run, keeps note and usage, writes the timeline and moves the issue', async () => {
    const { target, run } = await started(devA);
    const [status, body] = await finish(devA, run.id, { outcome: 'done', usage });
    assert.deepEqual([status, body.statusUnmapped, body.run.state, body.run.outcome, body.run.note, body.run.usage], [200, false, 'finished', 'done', note(), usage]);
    assert.ok(body.run.endedAt);
    // Rule 10: the usage is read back with the run.
    assert.deepEqual((await read(devA, run.id))[1].run.usage, usage);
    // The done group has three statuses: the final one is taken, though another comes first by order.
    const after = await fresh(target);
    assert.deepEqual([after.statusId, after.status, after.statusValue], [`${A}-done`, 'done', 'done']);
    assert.ok(after.lastProgressAt >= new Date(body.run.endedAt));
    const [entry, ...more] = await activities(target, 'AGENT_RUN_FINISHED');
    assert.deepEqual([more.length, entry.userId, entry.projectId, JSON.parse(entry.details)],
      [0, devA.userId, A, { runId: run.id, seatId: devA.id, outcome: 'done', content: note() }]);
    const moved = (await activities(target, 'STATUS_CHANGED')).at(-1);
    assert.deepEqual([moved.oldStatusId, moved.newStatusId, moved.userId], [`${A}-in_progress`, `${A}-done`, devA.userId]);
    assert.deepEqual(await offered(devA, target), []);
    // A run that finished is over: nothing more is taken from it, and a second finish leaves no late note.
    for (const event of ['renew', 'close']) await refused(act(devA, run.id, event), 409, 'run_fenced');
    await refused(finish(devA, run.id, { outcome: 'blocked', askedUser: person }), 409, 'run_fenced');
    assert.deepEqual([(await stored(run.id)).outcome, await statusOf(target), await activities(target, 'AGENT_RUN_LATE')], ['done', `${A}-done`, []]);
  });

  await t.test('two finishes at the same moment end the run once', async () => {
    const { target, run } = await started(devA);
    const replies = await Promise.all([finish(devA, run.id, { outcome: 'done' }), finish(devA, run.id, { outcome: 'done', status: 'deprecated' })]);
    assert.deepEqual(replies.map(([status]) => status).sort(), [200, 409]);
    assert.equal(replies.find(([status]) => status === 409)[1].error, 'run_fenced');
    assert.deepEqual([(await activities(target, 'AGENT_RUN_FINISHED')).length, (await activities(target, 'AGENT_RUN_LATE')).length], [1, 0]);
  });

  await t.test('the caller can name the status; it must be an active one of the outcome\'s group', async () => {
    const named = await started(devA);
    assert.deepEqual((await refused(finish(devA, named.run.id, { outcome: 'done', status: 'in_review' }), 422, 'exit_state_required')).missing, ['status']);
    await refused(finish(devA, named.run.id, { outcome: 'done', status: 'no_such_status' }), 422, 'exit_state_required');
    await refused(finish(devA, named.run.id, { outcome: 'in_review', status: 'old_review', askedUser: person }), 422, 'exit_state_required');
    await untouched(named.target, named.run);
    assert.deepEqual((await finish(devA, named.run.id, { outcome: 'done', status: 'waiting_for_deploy' }))[1].statusUnmapped, false);
    assert.equal(await statusOf(named.target), `${A}-waiting_for_deploy`);

    // An issue a person already put in the group stays where it is, unless the finish names another status.
    const placed = await started(devA);
    await move(placed.target, 'waiting_for_deploy');
    assert.equal((await finish(devA, placed.run.id, { outcome: 'done' }))[0], 200);
    assert.equal(await statusOf(placed.target), `${A}-waiting_for_deploy`);
    assert.equal((await activities(placed.target, 'STATUS_CHANGED')).length, 1, 'only the checkout moved it');
    const renamed = await started(devA);
    await move(renamed.target, 'waiting_for_deploy');
    assert.equal((await finish(devA, renamed.run.id, { outcome: 'done', status: 'deprecated' }))[0], 200);
    assert.equal(await statusOf(renamed.target), `${A}-deprecated`);

    // In review goes to the first status of its group that is in use.
    const reviewed = await started(devA);
    assert.equal((await finish(devA, reviewed.run.id, { outcome: 'in_review', askedUser: person }))[0], 200);
    assert.equal(await statusOf(reviewed.target), `${A}-in_review`);
  });

  await t.test('in review names an open review request the caller filed for the issue, or a person', async () => {
    const { target, run } = await started(devA);
    const wrong = [
      await issue(null),                                               // linked, but not a request
      await reviewRequest(otherA, target),                             // someone else's request
      await reviewRequest(devA, await issue(devA)),                    // the caller's request, for another issue
      await reviewRequest(devA, target, { status: 'done' }),           // already answered
      await reviewRequest(devA, target, { agentRequestRole: 'release' }),
      await reviewRequest(devA, target, { deletedAt: new Date() }),    // in Trash
    ];
    await link(wrong[0], 'RELATES_TO', target);
    // The caller's request, linked from another issue's side.
    wrong.push(await issue(null, { agentRequestRole: 'review', reporterId: devA.userId }));
    await link(await issue(devA), 'RELATES_TO', wrong.at(-1));
    for (const other of [...wrong, { issueKey: 'K-0' }]) {
      assert.deepEqual((await refused(finish(devA, run.id, { outcome: 'in_review', reviewRequest: other.issueKey }), 422, 'exit_state_required')).missing, ['reviewRequest']);
    }
    for (const user of [devA.userId, otherA.userId, gone, 'cnobody0001']) {
      assert.deepEqual((await refused(finish(devA, run.id, { outcome: 'in_review', askedUser: user }), 422, 'exit_state_required')).missing, ['askedUser']);
    }
    await untouched(target, run);

    const request = await reviewRequest(devA, target);
    assert.equal((await finish(devA, run.id, { outcome: 'in_review', reviewRequest: request.id }))[0], 200);
    assert.equal(await statusOf(target), `${A}-in_review`);
    assert.deepEqual(JSON.parse((await activities(target, 'AGENT_RUN_FINISHED'))[0].details).reviewRequest, request.issueKey);
    // It waits for that request, and comes back when the request is done.
    assert.deepEqual(await offered(devA, target), []);
    await move(request, 'done');
    assert.deepEqual(await offered(devA, target), ['review_returned']);
  });

  await t.test('blocked names an open issue that blocks this one, or a person', async () => {
    const { target, run } = await started(devA);
    const related = await issue(null), relatedTo = await issue(null), solved = await issue(null, { status: 'done' });
    await link(related, 'RELATES_TO', target);
    await link(target, 'RELATES_TO', relatedTo);
    await link(solved, 'BLOCKS', target);
    for (const other of [related, relatedTo, solved, await issue(null), { issueKey: 'K-0' }]) {
      assert.deepEqual((await refused(finish(devA, run.id, { outcome: 'blocked', blockedBy: other.issueKey }), 422, 'exit_state_required')).missing, ['blockedBy']);
    }
    await untouched(target, run);
    await raw.issueRelation.deleteMany({ where: { sourceIssueId: solved.id } });

    const blocker = await issue(null);
    await link(target, 'BLOCKED_BY', blocker);
    assert.equal((await finish(devA, run.id, { outcome: 'blocked', blockedBy: blocker.issueKey }))[0], 200);
    assert.equal(await statusOf(target), `${A}-blocked`);
    assert.deepEqual(await offered(devA, target), []);
    await move(blocker, 'done');
    assert.deepEqual(await offered(devA, target), ['blocker_resolved']);

    // The link may be written from either side.
    const second = await started(devA), other = await issue(null);
    await link(other, 'BLOCKS', second.target);
    assert.equal((await finish(devA, second.run.id, { outcome: 'blocked', blockedBy: other.id }))[0], 200);
  });

  await t.test('review focus 3: a project with no status in the group still finishes, and says the status was left alone', async () => {
    const { target, run } = await started(devB);
    const [status, body] = await finish(devB, run.id, { outcome: 'blocked', askedUser: person });
    assert.deepEqual([status, body.statusUnmapped, body.run.outcome, await statusOf(target)], [200, true, 'blocked', `${B}-to_do`]);
    assert.deepEqual(JSON.parse((await activities(target, 'AGENT_RUN_FINISHED'))[0].details).askedUser, person);
    // The outcome, not the status, says where the issue stands: it waits, and the person's answer brings it back.
    assert.deepEqual(await offered(devB, target), []);
    await raw.issueComment.create({ data: { issueId: target.id, authorId: person, content: 'Answer' } });
    assert.deepEqual(await offered(devB, target), ['reply']);
    // A named status that the project lacks is refused: only the default may be missing.
    const named = await started(devB);
    await refused(finish(devB, named.run.id, { outcome: 'blocked', askedUser: person, status: 'blocked' }), 422, 'exit_state_required');
    await untouched(named.target, named.run, `${B}-to_do`);
  });

  await t.test('review focus 3: an issue finished done in a project with no done status is not offered again until it is assigned again', async () => {
    const { target, run } = await started(devC);
    const [status, body] = await finish(devC, run.id, { outcome: 'done' });
    assert.deepEqual([status, body.statusUnmapped, body.run.outcome, await statusOf(target)], [200, true, 'done', `${C}-in_progress`]);
    // The status still says in progress; the run says done, and nothing else can.
    assert.deepEqual(await offered(devC, target), []);
    await raw.issueComment.create({ data: { issueId: target.id, authorId: person, content: 'Thanks' } });
    assert.deepEqual(await offered(devC, target), []);
    await raw.issueAssignee.updateMany({ where: { issueId: target.id }, data: { approvedAt: new Date(Date.now() + 1000) } });
    assert.deepEqual(await offered(devC, target), ['assigned']);
    // Where the project has a done status, the status speaks: an issue reopened after a done run is offered again.
    const reopened = await started(devA);
    await finish(devA, reopened.run.id, { outcome: 'done' });
    assert.deepEqual(await offered(devA, reopened.target), []);
    await move(reopened.target, 'to_do');
    assert.deepEqual(await offered(devA, reopened.target), ['assigned']);
  });

  await t.test('review focus 4: a finish after the run was lost is fenced, and its note is kept as a late entry', async () => {
    const { target, run } = await started(devA);
    await raw.agentRun.update({ where: { id: run.id }, data: { leaseUntil: ago(1) } });
    await refused(finish(devA, run.id, { outcome: 'done' }), 409, 'run_fenced');
    const row = await stored(run.id);
    assert.deepEqual([row.state, row.outcome, row.note, row.endedAt, await statusOf(target)], ['lost', null, null, null, `${A}-in_progress`]);
    const [late, ...more] = await activities(target, 'AGENT_RUN_LATE');
    assert.deepEqual([more.length, late.userId, JSON.parse(late.details)], [0, devA.userId, { runId: run.id, seatId: devA.id, outcome: 'done', content: note() }]);
    assert.deepEqual(await activities(target, 'AGENT_RUN_FINISHED'), []);
    // A late note is a note: one without its headings is refused like any other, and nothing is kept.
    await refused(finish(devA, run.id, { outcome: 'done', note: note('Next') }), 422, 'exit_note_required');
    // Another session of the same account does not speak for this run.
    await refused(finish(devA, run.id, { outcome: 'done' }, 'g2'), 409, 'run_fenced');
    await refused(finish(otherA, run.id, { outcome: 'done' }), 404, 'not_found');
    assert.equal((await activities(target, 'AGENT_RUN_LATE')).length, 1);

    // The same after the runner closed the run, or a person cleared it: the work is not lost.
    assert.equal((await act(devA, run.id, 'close'))[0], 200);
    await refused(finish(devA, run.id, { outcome: 'in_review', askedUser: person }), 409, 'run_fenced');
    const kept = await activities(target, 'AGENT_RUN_LATE');
    assert.deepEqual([kept.length, JSON.parse(kept[1].details).outcome, (await stored(run.id)).state], [2, 'in_review', 'stopped']);
  });

  await t.test('review focus 1: a finish on an issue given to someone else is fenced, keeps its note and changes nothing', async () => {
    const { target, run } = await started(devA);
    await raw.issue.update({ where: { id: target.id }, data: { assigneeId: person } });
    await refused(finish(devA, run.id, { outcome: 'done', usage }), 409, 'run_fenced');
    const row = await stored(run.id);
    assert.deepEqual([row.state, row.outcome, row.note, row.usage, row.endedAt, await statusOf(target)], ['running', null, null, null, null, `${A}-in_progress`]);
    assert.equal((await activities(target, 'AGENT_RUN_LATE')).length, 1);
    assert.equal((await act(devA, run.id, 'close'))[0], 200);
  });

  await t.test('a seat leaves nothing on an issue that is no longer in its project, not even a late note', async () => {
    const { target, run } = await started(devA);
    await raw.issue.update({ where: { id: target.id }, data: { projectId: B, statusId: `${B}-to_do`, assigneeId: null } });
    await refused(finish(devA, run.id, { outcome: 'done' }), 403, 'wrong_project');
    assert.deepEqual([(await stored(run.id)).state, await activities(target, 'AGENT_RUN_LATE'), await statusOf(target)], ['running', [], `${B}-to_do`]);
    await act(devA, run.id, 'close');
  });

  await t.test('a finish waits for a reassignment that is under way and is then fenced', async () => {
    const { target, run } = await started(devA);
    let release, ready;
    const held = new Promise(resolve => { release = resolve; }), locked = new Promise(resolve => { ready = resolve; });
    const competing = raw.$transaction(async tx => { await tx.issue.update({ where: { id: target.id }, data: { assigneeId: person } }); ready(); await held; }, { timeout: 15000 });
    await locked;
    const finishing = finish(devA, run.id, { outcome: 'done' });
    try {
      const deadline = Date.now() + 5000;
      let blocked = false;
      while (!blocked && Date.now() < deadline) {
        const rows = await raw.$queryRaw`SELECT 1 FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND query LIKE '%"Issue"%FOR UPDATE%' AND pid <> pg_backend_pid()`;
        blocked = rows.length > 0;
        if (!blocked) await new Promise(resolve => setTimeout(resolve, 20));
      }
      assert.ok(blocked, 'the finish waits for the issue');
    } finally {
      release();
      await competing;
    }
    await refused(finishing, 409, 'run_fenced');
    assert.deepEqual([(await stored(run.id)).state, await statusOf(target)], ['running', `${A}-in_progress`]);
    await act(devA, run.id, 'close');
  });

  await t.test('a release seat finishes the other requests of its batch with the same note, all or none', async () => {
    const to = { agentRequestRole: 'release' };
    const { target, run } = await started(release, to);
    const second = await issue(release, to), third = await issue(release, to);
    const batch = [second.issueKey, third.id];
    const nothingWritten = async () => {
      await untouched(target, run);
      assert.equal(await raw.agentRun.count({ where: { issueId: { in: [second.id, third.id] } } }), 0);
      assert.deepEqual([await statusOf(second), await statusOf(third)], [`${A}-to_do`, `${A}-to_do`]);
    };

    // Only for a batch that is done.
    await refused(finish(release, run.id, { outcome: 'blocked', askedUser: person, alsoFinish: batch }), 422, 'exit_state_required');
    // Each one is a to do issue of this seat, named once.
    const taken = await started(devA), begun = await issue(release, { ...to, status: 'in_progress' }), elsewhere = await issue(release.userId, { ...to, project: B });
    await refused(finish(release, run.id, { outcome: 'done', alsoFinish: [...batch, taken.target.issueKey] }), 403, 'not_assigned');
    await refused(finish(release, run.id, { outcome: 'done', alsoFinish: [...batch, begun.issueKey] }), 422, 'exit_state_required');
    await refused(finish(release, run.id, { outcome: 'done', alsoFinish: [...batch, elsewhere.issueKey] }), 403, 'wrong_project');
    await refused(finish(release, run.id, { outcome: 'done', alsoFinish: [...batch, 'K-0'] }), 404, 'not_found');
    await refused(finish(release, run.id, { outcome: 'done', alsoFinish: [...batch, second.id] }), 404, 'not_found');
    await refused(finish(release, run.id, { outcome: 'done', alsoFinish: [...batch, target.issueKey] }), 422, 'exit_state_required');
    await refused(finish(release, run.id, { outcome: 'done', alsoFinish: [] }), 400, 'invalid_request');
    // One that already has a run refuses the whole finish and is named.
    const busy = await raw.agentRun.create({ data: { workspaceId: 'w', issueId: third.id, seatId: release.id, userId: release.userId, runner: 'test', generation: 'g0', state: 'lost' } });
    const refusal = await refused(finish(release, run.id, { outcome: 'done', alsoFinish: batch }), 409, 'already_running');
    assert.match(refusal.error_description, new RegExp(`\\b${third.issueKey}\\b`));
    await raw.agentRun.delete({ where: { id: busy.id } });
    await nothingWritten();
    // Only a release seat has a batch.
    const mine = await started(devA), extra = await issue(devA);
    await refused(finish(devA, mine.run.id, { outcome: 'done', alsoFinish: [extra.issueKey] }), 422, 'role_mismatch');
    await untouched(mine.target, mine.run);

    const [status, body] = await finish(release, run.id, { outcome: 'done', status: 'waiting_for_deploy', usage, alsoFinish: batch });
    assert.deepEqual([status, body.statusUnmapped, body.run.id, body.run.state], [200, false, run.id, 'finished']);
    for (const done of [second, third]) {
      const [extraRun, ...more] = await raw.agentRun.findMany({ where: { issueId: done.id } });
      assert.deepEqual([more.length, extraRun.state, extraRun.outcome, extraRun.note, extraRun.seatId, extraRun.userId, extraRun.leaseUntil, extraRun.usage],
        [0, 'finished', 'done', note(), release.id, release.userId, null, null]);
      assert.ok(extraRun.endedAt);
      assert.equal(await statusOf(done), `${A}-waiting_for_deploy`);
      const [entry] = await activities(done, 'AGENT_RUN_FINISHED');
      assert.deepEqual(JSON.parse(entry.details), { runId: extraRun.id, seatId: release.id, outcome: 'done', content: note(), finishedWith: run.id });
      assert.equal((await activities(done, 'STATUS_CHANGED')).length, 1);
      assert.deepEqual(await offered(release, done), []);
    }
    // The cost of the batch is on the run that did the work, once.
    assert.deepEqual((await stored(run.id)).usage, usage);
  });

  await t.test('two finishes that name the same extra issue finish it once', async () => {
    const to = { agentRequestRole: 'release' };
    const first = await started(release, to), shared = await issue(release, to);
    // A second open run for the same seat, as two release sessions would hold.
    const second = await issue(release, to);
    const other = await checkout(release, second, 'g2');
    const replies = await Promise.all([finish(release, first.run.id, { outcome: 'done', alsoFinish: [shared.issueKey] }),
      finish(release, other.id, { outcome: 'done', alsoFinish: [shared.issueKey] }, 'g2')]);
    assert.deepEqual(replies.map(([status]) => status).sort(), [200, 422]);
    assert.equal(await raw.agentRun.count({ where: { issueId: shared.id } }), 1);
    // The one that lost wrote nothing: its own run is still open.
    const lost = replies[0][0] === 200 ? other.id : first.run.id;
    assert.deepEqual([(await stored(lost)).state, replies.find(([status]) => status !== 200)[1].error], ['running', 'exit_state_required']);
  });

  await t.test("a person finishes a run on their own issue, and a Forge-connected project's issue is not finished here", async () => {
    const { target, run } = await started(me);
    forge = true;
    try { await refused(finish(personToken, run.id, { outcome: 'done' }), 409, 'forge_connected_project'); } finally { forge = false; }
    await untouched(target, run);
    // A person asks another person; a batch is a release seat's.
    await refused(finish(personToken, run.id, { outcome: 'in_review', askedUser: person }), 422, 'exit_state_required');
    await refused(finish(personToken, run.id, { outcome: 'done', alsoFinish: ['K-1'] }), 422, 'role_mismatch');
    await raw.agentRun.update({ where: { id: run.id }, data: { startedAt: ago(60) } });
    await raw.issueComment.createMany({ data: [
      { issueId: target.id, authorId: person, content: 'Proceed?', createdAt: ago(30) },
      { issueId: target.id, authorId: owner, content: 'Yes', createdAt: ago(20) },
    ] });
    const [status, body] = await finish(personToken, run.id, { outcome: 'in_review', askedUser: owner });
    assert.deepEqual([status, body.run.state, body.run.outcome, await statusOf(target)], [200, 'finished', 'in_review', `${A}-in_review`]);
    assert.deepEqual(JSON.parse((await activities(target, 'AGENT_RUN_FINISHED'))[0].details), { runId: run.id, seatId: null, outcome: 'in_review', content: note(), nextStep: 'What there is to say under Next.', askedUser: owner });
    assert.deepEqual(await offered(me, target), []);
    await raw.issueComment.create({ data: { issueId: target.id, authorId: owner, content: 'I can review it now.', createdAt: new Date(Date.parse(body.run.endedAt) + 1) } });
    assert.deepEqual(await offered(me, target), ['reply']);
    const response = await contextRoute.GET(new Request('https://collab.test/api', { headers: { Authorization: `Bearer ${personToken}` } }),
      { params: Promise.resolve({ issueIdOrKey: target.issueKey }) });
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).commentsSince.map(comment => comment.content), ['I can review it now.']);
  });

  await t.test('a run on an issue in Trash is out of reach, so a finish writes nothing until the issue is restored', async () => {
    const { target, run } = await started(devA);
    await raw.issue.update({ where: { id: target.id }, data: { deletedAt: new Date() } });
    await refused(finish(devA, run.id, { outcome: 'done' }), 404, 'not_found');
    assert.deepEqual([(await stored(run.id)).state, await activities(target, 'AGENT_RUN_LATE')], ['running', []]);
    await raw.issue.update({ where: { id: target.id }, data: { deletedAt: null } });
    assert.equal((await finish(devA, run.id, { outcome: 'done' }))[0], 200);
  });

  await t.test('the issue page reads the open run: who holds it, since when, and whether this person may clear it', async () => {
    const open = async target => {
      const reply = await openRoute.GET(new Request('https://collab.test/api'), { params: Promise.resolve({ issueId: target.issueKey }) });
      return [reply.status, await reply.json()];
    };
    const { target, run } = await started(devA);
    const [status, body] = await open(target);
    assert.deepEqual([status, body.run.id, body.run.state, body.run.by, body.run.clearable, body.run.startedAt], [200, run.id, 'running', 'dev-a', false, run.startedAt]);
    // Reading the page is a read like the others: a lapsed lease is lost by then, and a person who may assign can clear it.
    await raw.agentRun.update({ where: { id: run.id }, data: { leaseUntil: ago(1) } });
    const lapsed = (await open(target))[1].run;
    assert.deepEqual([lapsed.state, lapsed.clearable], ['lost', false], 'lost on this read; a member without the assign permission does not clear it');
    session = owner;
    // A run under a lease that still holds is its runner's.
    const held = await started(devA);
    assert.deepEqual([(await open(held.target))[1].run.state, (await open(held.target))[1].run.clearable], ['running', false]);
    await act(devA, held.run.id, 'close');
    assert.deepEqual([(await open(target))[1].run.state, (await open(target))[1].run.clearable], ['lost', true]);
    // A person's run has no lease, so it can be cleared at any time.
    const own = await started(me);
    assert.deepEqual([(await open(own.target))[1].run.by, (await open(own.target))[1].run.clearable], [person, true]);
    // No open run, no access, no login.
    await finish(personToken, own.run.id, { outcome: 'done' });
    assert.deepEqual(await open(own.target), [200, { run: null, security: [] }]);
    session = 'cstranger001';
    assert.equal((await open(target))[0], 404);
    session = null;
    assert.equal((await open(target))[0], 401);
    session = person;
    await act(devA, run.id, 'close');
  });

  await t.test('declared stops: an answer from Home is posted only while the stop it was shown for is still open', async () => {
    const events = [];
    // No answer here mentions anybody, so nothing is asked of the notification service.
    const replyRoute = load('src/app/api/issues/[issueId]/runs/[runId]/reply/route.ts', { ...deps, '@/lib/redis': { publishEvent: async (...sent) => events.push(sent) },
      '@/utils/mentions': load('src/utils/mentions.ts'), '@/lib/notification-service': {} }, globals);
    const reply = async (target, runId, content = 'split') => {
      const response = await replyRoute.POST(new Request('https://collab.test/api', { method: 'POST', body: JSON.stringify({ content }) }),
        { params: Promise.resolve({ issueId: target.id, runId }) });
      return [response.status, await response.json()];
    };
    const comments = async target => (await raw.issueComment.findMany({ where: { issueId: target.id }, orderBy: { createdAt: 'asc' } })).map(row => [row.authorId, row.content]);
    const says = (target, authorId, content) => raw.issueComment.create({ data: { issueId: target.id, authorId, content } });
    const ask = { kind: 'decision', questions: [{ question: "Run the migration in tonight's window, or split it into two releases?", options: ['window', 'split'], suggested: 'split' }] };
    /** An issue whose seat stopped and named the person. */
    const stopped = async (body = { askedUser: person, ask }) => {
      const { target, run } = await started(devA);
      assert.equal((await finish(devA, run.id, { outcome: 'blocked', ...body }))[0], 200);
      return { target, run };
    };
    /** The press is refused and leaves the issue's comments as they were. */
    const closed = async ({ target, run }, runId = run.id, content) => {
      const before = await comments(target);
      await refused(reply(target, runId, content), 409, 'stop_closed');
      assert.deepEqual(await comments(target), before);
    };

    // While the run is open there is no stop to answer.
    const open = await started(devA);
    await closed(open);
    const first = await stopped();
    // Another issue's run, no login, somebody who may not read the issue, an empty answer, a project that is worked on the Forge board.
    await closed(first, open.run.id);
    session = null;
    assert.equal((await reply(first.target, first.run.id))[0], 401);
    for (const outsider of ['cstranger001', gone]) {
      session = outsider;
      await refused(reply(first.target, first.run.id), 404, 'not_found');
    }
    session = person;
    await refused(reply(first.target, first.run.id, '   '), 400, 'invalid_request');
    forge = true;
    try { await refused(reply(first.target, first.run.id), 409, 'forge_connected_project'); } finally { forge = false; }
    assert.deepEqual([await comments(first.target), events], [[], []]);

    // Two presses at once post one comment, as the person who pressed, and the next press finds the stop answered.
    // Both are made to wait for the issue, so each checks only after the other has written or been refused.
    let release, ready;
    const held = new Promise(resolve => { release = resolve; }), locked = new Promise(resolve => { ready = resolve; });
    const holding = raw.$transaction(async tx => { await tx.$queryRaw`SELECT "id" FROM "Issue" WHERE "id" = ${first.target.id} FOR UPDATE`; ready(); await held; }, { timeout: 15000 });
    await locked;
    const pressing = Promise.all([reply(first.target, first.run.id, '  split '), reply(first.target, first.run.id, 'window')]);
    try {
      let waiting = 0;
      for (const deadline = Date.now() + 5000; waiting < 2 && Date.now() < deadline; await new Promise(resolve => setTimeout(resolve, 20))) {
        waiting = (await raw.$queryRaw`SELECT 1 FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND query LIKE '%"Issue"%FOR UPDATE%' AND pid <> pg_backend_pid()`).length;
      }
      assert.equal(waiting, 2, 'both presses wait for the issue');
    } finally {
      release();
      await holding;
    }
    const presses = await pressing;
    assert.deepEqual(presses.map(([status, body]) => status === 200 ? 200 : body.error).sort(), [200, 'stop_closed']);
    const [, posted] = presses.find(([status]) => status === 200);
    assert.deepEqual([posted.authorId, posted.issueId], [person, first.target.id]);
    assert.deepEqual(await comments(first.target), [[person, posted.content]]);
    assert.ok(['split', 'window'].includes(posted.content));
    assert.deepEqual(JSON.parse(JSON.stringify(events)), [['workspace:w:events', { type: 'issue.comments.changed', workspaceId: 'w', issueId: first.target.id }, 1000]]);
    await closed(first);
    assert.deepEqual(await offered(devA, first.target), ['reply']);

    // Someone answered on the issue itself; the seat's own later comment is no answer.
    const answered = await stopped();
    await says(answered.target, owner, 'Split it: the window is taken tonight.');
    await closed(answered);
    const noted = await stopped();
    await says(noted.target, devA.userId, 'Still waiting for the choice above.');
    session = owner;
    assert.equal((await reply(noted.target, noted.run.id, 'window'))[0], 200);
    assert.deepEqual((await comments(noted.target)).at(-1), [owner, 'window']);
    session = person;

    // An answer written after the seat's question and before its finish has answered the stop: the seat has the issue back.
    const asking = async (seatSaid, otherSaid, other = owner) => {
      const { target, run } = await started(devA);
      await raw.agentRun.update({ where: { id: run.id }, data: { startedAt: ago(60) } });
      await raw.issueComment.create({ data: { issueId: target.id, authorId: devA.userId, content: ask.questions[0].question, createdAt: ago(seatSaid) } });
      await raw.issueComment.create({ data: { issueId: target.id, authorId: other, content: 'Split it: the window is taken tonight.', createdAt: ago(otherSaid) } });
      assert.equal((await finish(devA, run.id, { outcome: 'blocked', askedUser: person, ask }))[0], 200);
      return { target, run };
    };
    const early = await asking(30, 20);
    await closed(early);
    assert.deepEqual(await offered(devA, early.target), ['reply']);
    // What was said before the question is no answer to it.
    const before = await asking(20, 30);
    assert.deepEqual(await offered(devA, before.target), []);
    assert.equal((await reply(before.target, before.run.id))[0], 200);
    const agent = await raw.user.create({ data: { name: 'Seatless agent', email: null } });
    for (const authorId of [otherA.userId, agent.id]) {
      const { target, run } = await asking(30, 20, authorId);
      assert.deepEqual(await offered(devA, target), []);
      assert.equal((await reply(target, run.id))[0], 200);
      assert.deepEqual((await comments(target)).at(-1), [person, 'split']);
    }

    // The issue is done, went to another seat, or was given to its seat again since the stop: Home shows none of them.
    const done = await stopped();
    await move(done.target, 'done');
    await closed(done);
    const legacyStops = { id: { in: [done.target.id, early.target.id] } };
    for (const fields of [{ statusValue: ' Resolved ', status: 'open' }, { statusValue: ' ', status: ' CLOSED ' }]) {
      await raw.issue.updateMany({ where: legacyStops, data: { statusId: null, ...fields } });
      await closed(done);
      assert.deepEqual(await offered(devA, early.target), []);
    }
    await raw.issue.updateMany({ where: legacyStops, data: { statusValue: 'open' } });
    assert.equal((await reply(done.target, done.run.id))[0], 200);
    assert.deepEqual(await offered(devA, early.target), ['reply']);
    const moved = await stopped();
    await raw.issue.update({ where: { id: moved.target.id }, data: { assigneeId: otherA.userId } });
    await closed(moved);
    const returned = await stopped();
    await raw.issueAssignee.updateMany({ where: { issueId: returned.target.id, userId: devA.userId }, data: { approvedAt: new Date(Date.now() + 1000) } });
    await closed(returned);

    // A later run has started: the old row's press posts nothing, also after that run stopped with a question of its own.
    const later = await stopped();
    const again = await checkout(devA, later.target, 'g2');
    await closed(later);
    assert.equal((await finish(devA, again.id, { outcome: 'blocked', askedUser: person, ask }, 'g2'))[0], 200);
    await closed(later);
    assert.equal((await reply(later.target, again.id))[0], 200);

    // A stop that waits for another issue asks no person.
    const waits = await started(devA);
    const blocker = await issue(null);
    await link(blocker, 'BLOCKS', waits.target);
    assert.equal((await finish(devA, waits.run.id, { outcome: 'blocked', blockedBy: blocker.issueKey }))[0], 200);
    await closed(waits);

    // Continue is the fixed answer the row's button sends. It is posted once, by anyone who may comment on the issue,
    // on a stop that names somebody else: an older one that says nothing of what it asks, and work for a person's hands.
    const { CONTINUE_ANSWER } = load('src/app/(main)/[workspaceId]/dashboard/components/NeedsYouPanel.tsx',
      { react: require('react'), 'react/jsx-runtime': require('react/jsx-runtime'), 'next/navigation': {} });
    for (const body of [{ askedUser: owner }, { askedUser: owner, ask: { kind: 'hands', steps: '1. Merge the pull request.', doneWord: 'merged' } }]) {
      const other = await stopped(body);
      for (const outsider of [null, 'cstranger001', gone]) {
        session = outsider;
        assert.equal((await reply(other.target, other.run.id, CONTINUE_ANSWER))[0], outsider ? 404 : 401);
      }
      session = person;
      assert.equal((await reply(other.target, other.run.id, CONTINUE_ANSWER))[0], 200);
      assert.deepEqual(await comments(other.target), [[person, 'Continue. Go on with the work as agreed.']]);
      await closed(other, other.run.id, CONTINUE_ANSWER);
      assert.deepEqual(await offered(devA, other.target), ['reply']);
    }
  });

  await t.test('declared stops: an answer from Home does what the same comment on the issue page does besides being stored', async t => {
    const events = [];
    const observer = new PrismaClient({ datasources: { db: { url: db.url } } });
    t.after(() => observer.$disconnect());
    const commentsAtNotification = [];
    const mentionsAtPublication = [];
    const notifications = load('src/lib/notification-service.ts', { '@/lib/prisma': { prisma }, '@/lib/push-notifications': { sendPushNotification: async () => false },
      '@/lib/permissions': load('src/lib/permission-types.ts'), 'date-fns': require('date-fns'), '@/lib/logger': { logger: { info() {}, error() {} } }, '@/lib/html-sanitizer': {} });
    // The signed-in person as the session gives them, with their name: a mention's notification says who wrote it.
    const told = { ...deps, '@/lib/session': { getCurrentUser: async () => raw.user.findUnique({ where: { id: session } }) },
      '@/lib/redis': { publishEvent: async (...sent) => {
        mentionsAtPublication.push(await observer.notification.count({ where: { type: 'ISSUE_MENTION', userId: owner, senderId: person } }));
        events.push(sent);
      } }, '@/utils/mentions': load('src/utils/mentions.ts'), '@/lib/notification-service': notifications };
    const replyRoute = load('src/app/api/issues/[issueId]/runs/[runId]/reply/route.ts', told, globals);
    const commentRoute = load('src/app/api/issues/[issueId]/comments/route.ts', told, globals);
    const request = content => new Request('https://collab.test/api', { method: 'POST', body: JSON.stringify({ content }) });
    const stopped = async () => {
      const { target, run } = await started(devA);
      assert.equal((await finish(devA, run.id, { outcome: 'blocked', askedUser: person }))[0], 200);
      return { target, run };
    };
    const content = `@[The owner](${owner}) Split it: the window is taken tonight.`;
    const { target, run } = await stopped();
    const notifyUsers = notifications.NotificationService.notifyUsers.bind(notifications.NotificationService);
    t.mock.method(notifications.NotificationService, 'notifyUsers', async (...args) => {
      commentsAtNotification.push(await observer.issueComment.count({ where: { issueId: target.id, authorId: person, content } }));
      return notifyUsers(...args);
    });
    /** What a post left besides its comment: the notifications and the issue's new activity, without ids and times, and the events. */
    const left = async post => {
      const known = (await raw.issueActivity.findMany({ where: { itemId: target.id }, select: { id: true } })).map(row => row.id);
      // A second notification with the same words to the same person is dropped as a repeat, so each post starts with none.
      await raw.notification.deleteMany();
      events.length = 0;
      assert.ok((await post()).ok);
      const rows = found => found.map(({ id: _id, createdAt: _createdAt, ...row }) => row);
      return JSON.parse(JSON.stringify({ notifications: rows(await raw.notification.findMany()),
        activity: rows(await raw.issueActivity.findMany({ where: { itemId: target.id, id: { notIn: known } } })), events }));
    };
    const fromHome = await left(() => replyRoute.POST(request(content), { params: Promise.resolve({ issueId: target.id, runId: run.id }) }));
    const fromPage = await left(() => commentRoute.POST(request(content), { params: Promise.resolve({ issueId: target.id }) }));
    assert.deepEqual(commentsAtNotification, [1, 2]);
    assert.deepEqual(mentionsAtPublication, [1, 1]);
    assert.deepEqual(fromHome, fromPage);
    assert.deepEqual(fromPage.notifications.map(row => [row.type, row.userId, row.senderId, row.content]),
      [['ISSUE_MENTION', owner, person, `@[${person}](${person}) mentioned you in a comment on #[${target.issueKey}](${target.id})`]]);
    assert.deepEqual(fromPage.events, [['workspace:w:events', { type: 'issue.comments.changed', workspaceId: 'w', issueId: target.id }, 1000]]);
    assert.equal(await raw.issueComment.count({ where: { issueId: target.id, authorId: person, content } }), 2);

    // The answer is saved before anyone is told, so a notifier that fails does not fail it or undo it.
    const second = await stopped();
    await raw.notification.deleteMany();
    const where = { issueId: second.target.id, authorId: person, content };
    const visibleAtNotification = [];
    const failing = load('src/app/api/issues/[issueId]/runs/[runId]/reply/route.ts', { ...told, '@/lib/notification-service': {
      ...notifications, NotificationService: { notifyUsers: async () => {
        visibleAtNotification.push(await observer.issueComment.count({ where }));
        throw new Error('The notifier is down');
      } },
    } }, { ...globals, console: { error() {} } });
    events.length = 0;
    const response = await failing.POST(request(content), { params: Promise.resolve({ issueId: second.target.id, runId: second.run.id }) });
    assert.deepEqual(visibleAtNotification, [1]);
    assert.equal(mentionsAtPublication.at(-1), 0);
    assert.deepEqual([response.status, events.length, await raw.issueComment.count({ where })], [200, 1, 1]);
  });
  // Someone outside the workspace, and `gone`, whose membership is not active: neither may read an issue of the workspace. The owner may.
  const stranger = 'cmention0001';
  await raw.user.create({ data: { id: stranger, name: stranger } });
  /** The notification service on the test database, and the pushes it sends: who to, and the page they open. */
  const notifier = () => {
    const pushed = [];
    const notifications = load('src/lib/notification-service.ts', { '@/lib/prisma': { prisma },
      '@/lib/push-notifications': { sendPushNotification: async (userId, payload) => { pushed.push([userId, payload.url]); return true; } },
      '@/lib/permissions': load('src/lib/permission-types.ts'), 'date-fns': require('date-fns'), '@/lib/logger': { logger: { info() {}, error() {} } }, '@/lib/html-sanitizer': {} });
    return { notifications, pushed };
  };

  await t.test('a mention in a comment tells only the people who may read the issue, and the comment is stored as written', async () => {
    const { notifications, pushed } = notifier();
    const commentRoute = load('src/app/api/issues/[issueId]/comments/route.ts', { ...deps, '@/lib/session': { getCurrentUser: async () => raw.user.findUnique({ where: { id: person } }) },
      '@/lib/redis': { publishEvent: async () => {} }, '@/utils/mentions': load('src/utils/mentions.ts'), '@/lib/notification-service': notifications }, globals);
    const { target } = await started(devA);
    await raw.notification.deleteMany();
    const content = `@[The owner](${owner}) @[A stranger](${stranger}) @[Gone](${gone}) Please look at this.`;
    const response = await commentRoute.POST(new Request('https://collab.test/api', { method: 'POST', body: JSON.stringify({ content }) }), { params: Promise.resolve({ issueId: target.id }) });
    assert.equal(response.status, 201);
    assert.deepEqual((await raw.notification.findMany()).map(row => [row.type, row.userId, row.senderId, row.content]),
      [['ISSUE_MENTION', owner, person, `@[${person}](${person}) mentioned you in a comment on #[${target.issueKey}](${target.id})`]]);
    assert.deepEqual(pushed, [[owner, `/issues/${target.id}`]]);
    assert.deepEqual((await raw.issueComment.findMany({ where: { issueId: target.id } })).map(row => [row.authorId, row.content]), [[person, content]]);
  });

  // The mentions handler names an issue, or a comment on one, and sends its own two types.
  for (const [sourceType, type] of [['issue', 'issue_mention'], ['issueComment', 'issueComment_mention']]) {
    await t.test(`a mention sent as ${type} tells only the people who may read the issue, and what was written stays as written`, async () => {
      const { notifications, pushed } = notifier();
      const mentions = load('src/app/api/mentions/route.ts', { zod, 'next/server': response, '@/lib/prisma': { prisma }, '@/lib/session': { getCurrentUser: async () => ({ id: person }) },
        '@/lib/html-sanitizer': { sanitizeHtmlToPlainText: text => text }, '@/lib/notification-service': notifications }, globals);
      const { target } = await started(devA, { description: 'The description as written' });
      const comment = await raw.issueComment.create({ data: { issueId: target.id, authorId: person, content: 'The comment as written' } });
      await raw.notification.deleteMany();
      const reply = await mentions.POST(new Request('https://collab.test/api', { method: 'POST', body: JSON.stringify({
        userIds: [owner, stranger, gone], sourceType, sourceId: sourceType === 'issue' ? target.id : comment.id, content: 'Please look at this.' }) }));
      assert.deepEqual([reply.status, (await reply.json()).notificationsCreated], [200, 1]);
      assert.deepEqual((await raw.notification.findMany()).map(row => [row.type, row.userId, row.senderId, row.content]), [[type, owner, person, 'Please look at this.']]);
      assert.deepEqual(pushed, [[owner, `/issues/${target.id}`]]);
      assert.deepEqual([(await raw.issue.findUniqueOrThrow({ where: { id: target.id } })).description, (await raw.issueComment.findMany({ where: { issueId: target.id } })).map(row => row.content)],
        ['The description as written', ['The comment as written']]);
    });

    await t.test(`${type} gives an inactive sender the same acknowledgement for unreadable and missing sources`, async () => {
      const { notifications } = notifier();
      const mentions = load('src/app/api/mentions/route.ts', { ...deps, '@/lib/session': { getCurrentUser: async () => ({ id: gone }) },
        '@/lib/html-sanitizer': { sanitizeHtmlToPlainText: text => text }, '@/lib/notification-service': notifications }, globals);
      const target = await issue(devA);
      const source = sourceType === 'issue' ? target : await raw.issueComment.create({ data: { issueId: target.id, authorId: person, content: 'Private comment' } });
      for (const [sourceId, recipient, expectedDeliveries] of [
        [source.id, owner, 1],
        [source.id, stranger, 0],
        ['missing', owner, sourceType === 'issueComment' ? 1 : 0],
      ]) {
        const content = `Mention from ${sourceType} ${sourceId} to ${recipient}`;
        const reply = await mentions.POST(new Request('https://collab.test/api', { method: 'POST', body: JSON.stringify({
          userIds: [recipient], sourceType, sourceId, content }) }));
        assert.equal(reply.status, 200);
        assert.deepEqual(await reply.json(), { message: 'Mentions processed successfully', mentionsCount: 1, notificationsCreated: 0 });
        assert.equal(await raw.notification.count({ where: { type, senderId: gone, userId: recipient, content } }), expectedDeliveries);
      }
    });
  }
});
