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

test('waiting issues missing from the visibility-filtered details are omitted', async () => {
  const createdAt = ago(60);
  const candidates = ['in_review', 'blocked', 'todo'].map(category => ({
    id: category, issueKey: category, title: category, priority: 'medium', createdAt,
    projectStatus: { category, isFinal: false }, helpers: [], agentRuns: [],
  }));
  const prisma = { issue: { findMany: async query => query.where.workspaceId ? candidates : [] }, agentRun: { findMany: async () => [] } };
  const { seatInbox } = load('src/lib/agent-runs.ts', { zod: require('zod'), '@/lib/prisma': { prisma }, '@/lib/issue-finder': {}, '@/lib/permissions': {}, '@/lib/agent-tokens': { AGENT_APP_SLUG: 'collab-agent' },
    '@/lib/agent-seats': { seatFor: async () => null } }, { Date });
  const result = await seatInbox({ user: { id: person }, workspace: { id: 'w' } });
  assert.deepEqual(result.items.map(item => [item.issueId, item.reason]), [['todo', 'assigned']]);
});

let db;
after(() => db?.stop());

test('seat inbox: only what was assigned, in a fixed order, each with its reason', async t => {
  db = await seatsDatabase(async prisma => {
    // People sign in with an email; a seat's account has none.
    await prisma.user.createMany({ data: [owner, person].map(id => ({ id, name: id, email: `${id}@example.test` })) });
    await prisma.workspace.create({ data: { id: 'w', name: 'w', slug: 'w', ownerId: owner } });
    await prisma.workspaceMember.create({ data: { workspaceId: 'w', userId: person } });
    await prisma.workspace.create({ data: { id: 'w2', name: 'w2', slug: 'w2', ownerId: person } });
    await prisma.project.create({ data: { id: 'cprojectc001', workspaceId: 'w2', name: 'c', slug: 'c', issuePrefix: 'CC' } });
    // B has no "blocked" and no "in review" status: where an issue stands there can only come from its last run.
    for (const [id, names] of [[A, ['to_do', 'in_progress', 'in_review', 'blocked', 'done']], [B, ['to_do', 'done']]]) {
      await prisma.project.create({ data: { id, workspaceId: 'w', name: id, slug: id, issuePrefix: id === A ? 'AA' : 'BB' } });
      await prisma.projectStatus.createMany({ data: names.map((name, order) => ({ id: `${id}-${name}`, projectId: id, name, displayName: name, order, isFinal: name === 'done' })) });
    }
    for (const [id, slug] of [['agent-app', 'collab-agent'], ['person-app', 'collab-cli']]) {
      await prisma.app.create({ data: { id, name: slug, slug, publisherId: 'system', status: 'PUBLISHED', visibility: 'PRIVATE', isSystemApp: true,
        scopes: { create: scopes.map(scope => ({ scope })) } } });
    }
  });
  // The application's client, so Trash is hidden here as it is in production.
  const raw = db.prisma;
  const prisma = raw.$extends(load('src/lib/issue-visibility.ts').issueVisibilityExtension(Prisma.dmmf.datamodel.models));
  // Statuses made after the backfill have no group.
  await raw.projectStatus.createMany({ data: [
    { id: `${A}-custom`, projectId: A, name: 'custom', displayName: 'Custom', order: 8 },
    { id: `${A}-archived`, projectId: A, name: 'archived', displayName: 'Archived', order: 9, isFinal: true },
  ] });

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
  const runs = load('src/lib/agent-runs.ts', { zod, '@/lib/prisma': { prisma }, '@/lib/agent-seats': seats, '@/lib/issue-finder': {}, '@/lib/permissions': {}, '@/lib/agent-tokens': tokens }, { Date });
  const route = load('src/app/api/apps/auth/seats/me/inbox/route.ts', { '@/lib/apps/auth-middleware': middleware,
    '@/lib/agent-handoff-http': load('src/lib/agent-handoff-http.ts', { zod, 'next/server': response, './agent-handoffs': handoffs }, globals),
    '@/lib/agent-runs': runs }, globals);

  const seat = async (name, projectId) => {
    const made = await seats.createSeat({ workspaceId: 'w', actorId: owner, projectId, role: 'developer', ownerId: person, name, expiresInDays: 30 });
    return { ...made.seat, token: made.token.token };
  };
  const devA = await seat('dev-a', A), otherA = await seat('other-a', A), devB = await seat('dev-b', B);
  const personToken = 'collab_person_token';
  await raw.appToken.create({ data: { appId: 'person-app', workspaceId: 'w', userId: person, installationId: null,
    accessToken: Buffer.from(personToken).toString('base64'), scopes } });

  const inbox = async token => {
    const reply = await route.GET(new Request('https://collab.test/api', { headers: { Authorization: `Bearer ${token}` } }), { params: Promise.resolve({}) });
    assert.equal(reply.status, 200);
    return (await reply.json()).items;
  };
  const offered = async (token, issue) => (await inbox(token)).find(item => item.issueId === issue.id);
  let count = 0;
  /** An issue assigned to `to` (a seat or a user id) `assigned` minutes ago, in status `status` of its project. */
  const issue = async (to, { project = to?.projectId ?? A, status = 'to_do', assigned = 600, ...data } = {}) => {
    const userId = to?.userId ?? to;
    const made = await raw.issue.create({ data: { workspaceId: 'w', projectId: project, title: `Issue ${++count}`, issueKey: `K-${count}`,
      statusId: `${project}-${status}`, assigneeId: userId, createdAt: ago(900), ...data } });
    if (userId) await raw.issueAssignee.create({ data: { issueId: made.id, userId, role: 'ASSIGNEE', status: 'APPROVED', assignedAt: ago(assigned), approvedAt: ago(assigned) } });
    return made;
  };
  /** A run of `seat` on the issue that ended `ended` minutes ago (null: still open). */
  const run = (target, by, { ended = 60, ...data } = {}) => raw.agentRun.create({ data: { workspaceId: 'w', issueId: target.id, seatId: by.id, userId: by.userId,
    runner: 'test', generation: 'g1', state: 'finished', startedAt: ago((ended ?? 0) + 30), endedAt: ended === null ? null : ago(ended), ...data } });
  const comment = (target, authorId, minutes) => raw.issueComment.create({ data: { issueId: target.id, authorId, content: 'note', createdAt: ago(minutes) } });
  const move = (target, status, minutes) => raw.issue.update({ where: { id: target.id }, data: { statusId: `${target.projectId}-${status}`, updatedAt: ago(minutes) } });
  const link = (source, relationType, target) => raw.issueRelation.create({ data: { sourceIssueId: source.id, targetIssueId: target.id, relationType } });
  const clear = async () => { await raw.issueRelation.deleteMany(); await raw.issue.deleteMany(); };

  await t.test('rule 1: nothing unassigned and nothing assigned to someone else ever appears', async () => {
    const mine = await issue(devA);
    await issue(null); await issue(otherA); await issue(person);
    // A seat never sees another project's issue, even one that carries its name.
    await issue(devA.userId, { project: B });
    const trashed = await issue(devA);
    await raw.issue.update({ where: { id: trashed.id }, data: { deletedAt: new Date() } });
    const items = await inbox(devA.token);
    assert.deepEqual(items.map(item => item.issueId), [mine.id]);
    assert.deepEqual(items[0], { issueId: mine.id, issueKey: mine.issueKey, title: mine.title, priority: 'medium', category: 'todo', reason: 'assigned', lastRunAt: null });
    // A person's login reads the issues assigned to that person, in the token's workspace only.
    await raw.issue.create({ data: { workspaceId: 'w2', projectId: 'cprojectc001', title: 'Elsewhere', assigneeId: person } });
    const own = await inbox(personToken);
    assert.equal(own.length, 1);
    assert.equal(own[0].reason, 'assigned');
    await clear();
  });

  await t.test('an issue with an open run is never offered; once a lost run is confirmed stopped it comes first, to resume', async () => {
    const todo = await issue(devA, { priority: 'urgent' });
    for (const state of ['running', 'waiting', 'lost']) {
      const busy = await issue(devA);
      const open = await run(busy, devA, { state, ended: null });
      assert.equal(await offered(devA.token, busy), undefined, state);
      if (state !== 'lost') continue;
      const endedAt = ago(1);
      await raw.agentRun.update({ where: { id: open.id }, data: { state: 'stopped', endedAt } });
      const items = await inbox(devA.token);
      assert.deepEqual(items.map(item => [item.issueId, item.reason]), [[busy.id, 'resume'], [todo.id, 'assigned']]);
      assert.equal(items[0].lastRunAt, endedAt.toISOString());
    }
    await clear();
  });

  await t.test('rule 3: resume, in review with something new, blocked with something new, then to do by priority and age', async () => {
    const highNew = await issue(devA, { priority: 'high', createdAt: ago(100) });
    const blocked = await issue(devA, { priority: 'urgent' });
    await run(blocked, devA, { outcome: 'blocked' });
    await link(await issue(null, { status: 'done', updatedAt: ago(10) }), 'BLOCKS', blocked);
    const urgent = await issue(devA, { priority: 'urgent', createdAt: ago(50) });
    const review = await issue(devA, { priority: 'low' });
    await run(review, devA, { outcome: 'in_review' });
    await comment(review, person, 10);
    const highOld = await issue(devA, { priority: 'high', createdAt: ago(200) });
    const resume = await issue(devA, { priority: 'low', status: 'in_progress' });
    await run(resume, devA, { state: 'stopped' });
    const quiet = await issue(devA, { priority: 'urgent' });
    await run(quiet, devA, { outcome: 'in_review' });
    const highMid = await issue(devA, { priority: 'high', createdAt: ago(150) });

    assert.deepEqual((await inbox(devA.token)).map(item => [item.issueKey, item.category, item.reason]), [
      [resume.issueKey, 'in_progress', 'resume'], [review.issueKey, 'in_review', 'reply'], [blocked.issueKey, 'blocked', 'blocker_resolved'],
      [urgent.issueKey, 'todo', 'assigned'], [highOld.issueKey, 'todo', 'assigned'], [highMid.issueKey, 'todo', 'assigned'], [highNew.issueKey, 'todo', 'assigned'],
    ]);
    await clear();
  });

  await t.test('at most 50 items', async () => {
    await raw.issue.createMany({ data: Array.from({ length: 55 }, (_, index) => ({ workspaceId: 'w', projectId: A, title: `Many ${index}`, statusId: `${A}-to_do`, assigneeId: person })) });
    assert.equal((await inbox(personToken)).length, 50);
    await clear();
  });

  await t.test('a status without a group counts as done when final, otherwise as to do', async () => {
    const custom = await issue(devA, { status: 'custom' });
    await issue(devA, { status: 'archived' });
    await issue(devA, { status: 'done' });
    assert.deepEqual((await inbox(devA.token)).map(item => [item.issueId, item.category]), [[custom.id, 'todo']]);
    await clear();
  });

  await t.test('where an issue stands comes from its last run, so a project without a "blocked" status still holds it back', async () => {
    const held = await issue(devB);
    await run(held, devB, { outcome: 'blocked' });
    const blocker = await issue(null, { project: B, updatedAt: ago(90) });
    await link(held, 'BLOCKED_BY', blocker);
    assert.deepEqual(await inbox(devB.token), []);
    await move(blocker, 'done', 5);
    const item = await offered(devB.token, held);
    assert.deepEqual([item.category, item.reason], ['blocked', 'blocker_resolved']);

    // A run that finished done says nothing about an issue someone reopened: its status group speaks again.
    const reopened = await issue(devB);
    await run(reopened, devB, { outcome: 'done' });
    const again = await offered(devB.token, reopened);
    assert.deepEqual([again.category, again.reason], ['todo', 'assigned']);
    // And an issue a person closed is not offered, whatever its last run was waiting for.
    await run(await issue(devB, { status: 'done' }), devB, { outcome: 'in_review' });
    assert.equal((await inbox(devB.token)).length, 2);
    await clear();
  });

  await t.test('a blocked issue returns on a reply or when its last blocker is done, and not before', async () => {
    const asked = await issue(devA);
    await run(asked, devA, { outcome: 'blocked', ask: { askedUser: person } });
    const byStatus = await issue(devA, { status: 'blocked', assigned: 60 });
    await comment(byStatus, person, 120);
    const stale = await issue(devA);
    await run(stale, devA, { outcome: 'blocked' });
    const early = await issue(null, { status: 'done', updatedAt: ago(90) });
    await link(early, 'BLOCKS', stale);
    // The seat's own comments are not news to it.
    for (const waiting of [asked, byStatus, stale]) await comment(waiting, devA.userId, 5);
    assert.deepEqual(await inbox(devA.token), []);

    await comment(stale, person, 5);
    assert.equal((await offered(devA.token, stale)).reason, 'reply');
    await comment(byStatus, person, 5);
    assert.equal((await offered(devA.token, byStatus)).reason, 'reply');

    // Three blockers: the issue waits for the last of them.
    const late = await issue(null), last = await issue(null);
    for (const blocker of [early, late, last]) await link(blocker, 'BLOCKS', asked);
    await move(late, 'done', 5);
    assert.equal(await offered(devA.token, asked), undefined);
    await move(last, 'done', 4);
    assert.equal((await offered(devA.token, asked)).reason, 'blocker_resolved');
    await clear();
  });

  await t.test('a reply on a request the seat filed brings its blocked issue back; a finished review request brings an in review issue back', async () => {
    const blocked = await issue(devA);
    await run(blocked, devA, { outcome: 'blocked' });
    const request = await issue(devB, { reporterId: devA.userId, agentRequestRole: 'developer' });
    await link(blocked, 'RELATES_TO', request);
    // Linked, but not a request this seat filed.
    const foreign = await issue(devB, { reporterId: otherA.userId, agentRequestRole: 'developer' });
    await link(blocked, 'RELATES_TO', foreign);
    await comment(foreign, person, 5);
    // Linked and reported by this seat, but an ordinary issue.
    const ordinary = await issue(null, { reporterId: devA.userId });
    await link(blocked, 'RELATES_TO', ordinary);
    await comment(ordinary, person, 5);
    assert.equal(await offered(devA.token, blocked), undefined);
    await comment(request, person, 5);
    assert.equal((await offered(devA.token, blocked)).reason, 'reply');

    const review = await issue(devA);
    await run(review, devA, { outcome: 'in_review' });
    const reviewRequest = await issue(null, { reporterId: devA.userId, agentRequestRole: 'review', status: 'in_review' });
    await link(review, 'RELATES_TO', reviewRequest);
    // A request for another role that is done is not a review that came back.
    await link(review, 'RELATES_TO', await issue(null, { reporterId: devA.userId, agentRequestRole: 'developer', status: 'done', updatedAt: ago(5) }));
    assert.equal(await offered(devA.token, review), undefined);
    await move(reviewRequest, 'done', 5);
    assert.equal((await offered(devA.token, review)).reason, 'review_returned');
    await clear();
  });

  await t.test('an issue that never had a run measures "new" from when it was last assigned', async () => {
    const review = await issue(devA, { status: 'in_review', assigned: 60 });
    await comment(review, person, 120);
    assert.equal(await offered(devA.token, review), undefined);
    await comment(review, person, 30);
    const item = await offered(devA.token, review);
    assert.deepEqual([item.category, item.reason, item.lastRunAt], ['in_review', 'reply', null]);
    await clear();
  });

  await t.test('an issue assigned after its last run ended is new work: that run no longer says where it stands', async () => {
    // Another seat left it blocked, then a person gave it to this seat.
    const taken = await issue(devA, { assigned: 30 });
    const before = await run(taken, otherA, { outcome: 'blocked' });
    const item = await offered(devA.token, taken);
    assert.deepEqual([item.category, item.reason, item.lastRunAt], ['todo', 'assigned', before.endedAt.toISOString()]);
    // The seat's own run stopped, the issue went elsewhere and came back: assigned, not a run to resume.
    const back = await issue(devA, { assigned: 30 });
    await run(back, devA, { state: 'stopped' });
    assert.equal((await offered(devA.token, back)).reason, 'assigned');
    // A run that ended after the assignment still speaks.
    const waiting = await issue(devA, { assigned: 90 });
    await run(waiting, devA, { outcome: 'blocked' });
    assert.equal(await offered(devA.token, waiting), undefined);
    await clear();
  });

  await t.test("declared stops: an answer written after the seat's question brings the issue back, also when it came before the finish", async () => {
    /** A run that finished naming the person, as its finish records it. It started 90 minutes ago and ended 60 minutes ago. */
    const stop = async (target, outcome = 'blocked') => {
      const made = await run(target, devA, { outcome });
      await raw.issueActivity.create({ data: { workspaceId: 'w', projectId: target.projectId, itemType: 'ISSUE', itemId: target.id, userId: devA.userId,
        action: 'AGENT_RUN_FINISHED', details: JSON.stringify({ runId: made.id, outcome, askedUser: person }) } });
    };
    const early = await issue(devA);
    // Only the last run's finish is read: what an earlier run left on the timeline, readable or not, says nothing here.
    await raw.issueActivity.create({ data: { workspaceId: 'w', projectId: A, itemType: 'ISSUE', itemId: early.id, userId: devA.userId,
      action: 'AGENT_RUN_FINISHED', details: '{"runId":"an earlier run","askedUser":', createdAt: ago(200) } });
    await stop(early);
    await comment(early, devA.userId, 70);
    await comment(early, person, 65);
    const inboxReadCount = async () => {
      let reads = 0;
      const counted = prisma.$extends({ query: { $allOperations({ args, query }) { reads++; return query(args); } } });
      await runs.inboxOf('w', devA.userId, devA, counted);
      return reads;
    };
    const singleIssueReads = await inboxReadCount();
    // Before the finish only a person answers: what another seat wrote then does not bring the issue back.
    const bySeat = await issue(devA);
    await stop(bySeat);
    await comment(bySeat, devA.userId, 70);
    await comment(bySeat, otherA.userId, 65);
    // A finish whose record cannot be read names nobody: no early answer, and the rest of the inbox is still read.
    const unreadable = await issue(devA);
    await run(unreadable, devA, { outcome: 'blocked' });
    await raw.issueActivity.create({ data: { workspaceId: 'w', projectId: A, itemType: 'ISSUE', itemId: unreadable.id, userId: devA.userId,
      action: 'AGENT_RUN_FINISHED', details: '{"runId":' } });
    await comment(unreadable, devA.userId, 70);
    await comment(unreadable, person, 65);
    // The seat's last comment of the run is the question: an earlier one is a progress note.
    const review = await issue(devA);
    await stop(review, 'in_review');
    await comment(review, devA.userId, 80);
    await comment(review, devA.userId, 70);
    await comment(review, person, 61);
    // Written before the seat's question, also between two of its comments: not an answer to it.
    const before = await issue(devA);
    await stop(before);
    await comment(before, devA.userId, 80);
    await comment(before, person, 75);
    await comment(before, devA.userId, 70);
    // The seat wrote nothing in its run, only before it: the finish is the boundary, as it was.
    const silent = await issue(devA);
    await stop(silent);
    await comment(silent, devA.userId, 100);
    await comment(silent, person, 65);
    // A run that named no person waits for what it named.
    const unnamed = await issue(devA);
    await run(unnamed, devA, { outcome: 'blocked' });
    await comment(unnamed, devA.userId, 70);
    await comment(unnamed, person, 65);
    // What the seat wrote after the finish moves nothing: the answer came after its last comment of the run.
    const noted = await issue(devA);
    await stop(noted);
    await comment(noted, devA.userId, 70);
    await comment(noted, person, 65);
    await comment(noted, devA.userId, 30);
    assert.equal(await inboxReadCount(), singleIssueReads, 'additional early answers require no additional database calls');
    assert.deepEqual((await inbox(devA.token)).map(item => [item.issueKey, item.reason]), [[review.issueKey, 'reply'], [early.issueKey, 'reply'], [noted.issueKey, 'reply']]);

    // A comment after the finish is a reply, as it was, whoever but the seat wrote it.
    await comment(before, person, 5);
    assert.equal((await offered(devA.token, before)).reason, 'reply');
    await comment(bySeat, otherA.userId, 5);
    assert.equal((await offered(devA.token, bySeat)).reason, 'reply');
    await clear();
  });

  await t.test("reading the inbox records that the seat was seen, at most once a minute", async () => {
    const seen = async () => (await raw.agentSeat.findUniqueOrThrow({ where: { id: devA.id } })).lastSeenAt;
    await raw.agentSeat.update({ where: { id: devA.id }, data: { lastSeenAt: null } });
    await inbox(devA.token);
    const first = await seen();
    assert.ok(first);
    await inbox(devA.token);
    assert.deepEqual(await seen(), first);
    await raw.agentSeat.update({ where: { id: devA.id }, data: { lastSeenAt: ago(2) } });
    await inbox(devA.token);
    assert.ok(await seen() > first);
  });
});
