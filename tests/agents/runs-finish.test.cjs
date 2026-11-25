const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { Prisma } = require('@prisma/client');
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
    const [status, body] = await finish(personToken, run.id, { outcome: 'in_review', askedUser: owner });
    assert.deepEqual([status, body.run.state, body.run.outcome, await statusOf(target)], [200, 'finished', 'in_review', `${A}-in_review`]);
    assert.deepEqual(JSON.parse((await activities(target, 'AGENT_RUN_FINISHED'))[0].details), { runId: run.id, seatId: null, outcome: 'in_review', content: note(), nextStep: 'What there is to say under Next.', askedUser: owner });
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
    const replyRoute = load('src/app/api/issues/[issueId]/runs/[runId]/reply/route.ts', { ...deps, '@/lib/redis': { publishEvent: async (...sent) => events.push(sent) } }, globals);
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
    const closed = async ({ target, run }, runId = run.id) => {
      const before = await comments(target);
      await refused(reply(target, runId), 409, 'stop_closed');
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
    const asking = async (seatSaid, ownerSaid) => {
      const { target, run } = await started(devA);
      await raw.agentRun.update({ where: { id: run.id }, data: { startedAt: ago(60) } });
      await raw.issueComment.create({ data: { issueId: target.id, authorId: devA.userId, content: ask.questions[0].question, createdAt: ago(seatSaid) } });
      await raw.issueComment.create({ data: { issueId: target.id, authorId: owner, content: 'Split it: the window is taken tonight.', createdAt: ago(ownerSaid) } });
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

    // The issue is done, or went to another seat.
    const done = await stopped();
    await move(done.target, 'done');
    await closed(done);
    const moved = await stopped();
    await raw.issue.update({ where: { id: moved.target.id }, data: { assigneeId: otherA.userId } });
    await closed(moved);

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
  });
});
