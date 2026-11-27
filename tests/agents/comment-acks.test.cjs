// Acks on issue comments against a real PostgreSQL: a run's start, a run-context read and a `since` read of the token
// comments route record them; likes are unaffected; `commentAcks` reads acked, waiting and not_given from real rows.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { Prisma } = require('@prisma/client');
const { load } = require('../security/helpers.cjs');
const { seatsDatabase } = require('./seats-db.cjs');

// Token-facing routes accept only cuid-shaped ids.
const owner = 'cowner00001', person = 'cperson0001';
const A = 'cprojecta001';
const scopes = ['issues:read', 'issues:write', 'user:read'];
const ago = seconds => new Date(Date.now() - seconds * 1000);
/** The ack of a run start or a run-context read is written after the answer leaves: wait for it, up to `ms`. */
const eventually = async (check, ms = 3000) => {
  const end = Date.now() + ms;
  for (;;) {
    const value = await check();
    if (value || Date.now() > end) return value;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
};

let db;
after(() => db?.stop());

test('comment acks: recorded by a run start, a run-context read and a since read; likes unchanged; states from real rows', async t => {
  db = await seatsDatabase(async prisma => {
    // People sign in with an email; a seat's account has none.
    await prisma.user.createMany({ data: [owner, person].map(id => ({ id, name: id, email: `${id}@example.test` })) });
    await prisma.workspace.create({ data: { id: 'w', name: 'w', slug: 'w', ownerId: owner } });
    await prisma.workspaceMember.create({ data: { workspaceId: 'w', userId: person } });
    await prisma.project.create({ data: { id: A, workspaceId: 'w', name: A, slug: A, issuePrefix: 'AA' } });
    await prisma.projectStatus.createMany({ data: ['to_do', 'in_progress', 'in_review', 'done'].map((name, order) => ({ id: `${A}-${name}`, projectId: A, name,
      displayName: name, order, isFinal: name === 'done' })) });
    await prisma.repository.create({ data: { projectId: A, githubRepoId: A, owner: 'acme', name: A, fullName: `acme/${A}`, webhookSecret: 'secret' } });
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
  const deps = { '@/lib/forge/legacy-write-guard': { ForgeProjectWriteError: class extends Error {}, assertLegacyIssueWriteAllowed: async () => {} },
    zod, 'next/server': response, '@/lib/prisma': { prisma }, '@/lib/apps/auth-middleware': middleware, '@/lib/agent-seats': seats,
    '@/lib/agent-handoff-http': load('src/lib/agent-handoff-http.ts', { zod, 'next/server': response, './agent-handoffs': handoffs }, globals),
    '@/lib/issue-finder': load('src/lib/issue-finder.ts', { '@/lib/prisma': { prisma } }),
    '@/lib/permissions': load('src/lib/permissions.ts', { './prisma': { prisma } }, { console }),
    '@/lib/session': { getCurrentUser: async () => ({ id: person }) }, '@/lib/agent-tokens': tokens,
    '@/lib/redis': { publishEvent: async () => true } };
  // The real ack library, through the same client the routes use.
  deps['@/lib/issue-comment-acks'] = load('src/lib/issue-comment-acks.ts', { '@/lib/prisma': { prisma }, '@/lib/redis': deps['@/lib/redis'] }, globals);
  deps['@/lib/agent-runs'] = load('src/lib/agent-runs.ts', deps, globals);
  const runsRoute = load('src/app/api/apps/auth/runs/route.ts', deps, globals);
  const contextRoute = load('src/app/api/apps/auth/issues/[issueIdOrKey]/run-context/route.ts', deps, globals);
  const commentsRoute = load('src/app/api/apps/auth/issues/[issueIdOrKey]/comments/route.ts', deps, globals);
  const likeRoute = load('src/app/api/issues/[issueId]/comments/[commentId]/like/route.ts', deps, globals);
  const { commentAcks, forgetAckStarts } = deps['@/lib/issue-comment-acks'];

  const made = await seats.createSeat({ workspaceId: 'w', actorId: owner, projectId: A, role: 'developer', ownerId: person, name: 'dev-a', expiresInDays: 30 });
  const devA = { ...made.seat, token: made.token.token };
  const personToken = 'collab_person_token';
  await raw.appToken.create({ data: { appId: 'person-app', workspaceId: 'w', userId: person, installationId: null,
    accessToken: Buffer.from(personToken).toString('base64'), scopes } });

  const headers = token => ({ Authorization: `Bearer ${token}` });
  const checkout = async (token, target) => {
    const reply = await runsRoute.POST(new Request('https://collab.test/api', { method: 'POST', headers: headers(token),
      body: JSON.stringify({ issue: target.issueKey, generation: 'g1', runner: 'test' }) }), { params: Promise.resolve({}) });
    return [reply.status, await reply.json()];
  };
  const runContext = async (token, target) => {
    const reply = await contextRoute.GET(new Request('https://collab.test/api', { headers: headers(token) }), { params: Promise.resolve({ issueIdOrKey: target.issueKey }) });
    return [reply.status, await reply.json()];
  };
  const list = async (token, target, query = '') => {
    const reply = await commentsRoute.GET(new Request(`https://collab.test/api${query}`, { headers: headers(token) }), { params: Promise.resolve({ issueIdOrKey: target.issueKey }) });
    return [reply.status, await reply.json()];
  };
  const like = async (target, comment) => {
    const reply = await likeRoute.POST(new Request('https://collab.test/api', { method: 'POST' }), { params: Promise.resolve({ issueId: target.issueKey, commentId: comment.id }) });
    return [reply.status, await reply.json()];
  };
  let count = 0;
  const issue = async () => {
    const created = await raw.issue.create({ data: { workspaceId: 'w', projectId: A, title: `Issue ${++count}`, issueKey: `AA-${count}`, statusId: `${A}-to_do`,
      assigneeId: devA.userId, createdAt: ago(3600) } });
    await raw.issueAssignee.create({ data: { issueId: created.id, userId: devA.userId, role: 'ASSIGNEE', status: 'APPROVED', assignedAt: ago(3000), approvedAt: ago(3000) } });
    return created;
  };
  const comment = (target, authorId, content, createdAt) => raw.issueComment.create({ data: { issueId: target.id, authorId, content, ...(createdAt && { createdAt }) } });
  const ackOf = comment => raw.issueCommentReaction.findFirst({ where: { commentId: comment.id, type: 'ack', authorId: devA.userId } });

  const target = await issue();
  const first = await comment(target, person, 'please look', ago(600));
  const own = await comment(target, devA.userId, 'on it', ago(500));

  await t.test("a seat's checkout acks a person's comment, not its own; a comment after the start is not acked by it", async () => {
    const [status, reply] = await checkout(devA.token, target);
    assert.equal(status, 200, JSON.stringify(reply));
    // Written after the run started: outside the start's window, which is closed at the run's start.
    const late = await comment(target, person, 'one more thing');
    assert.ok(await eventually(() => ackOf(first)), 'the start acked the person comment');
    assert.equal(await ackOf(own), null);
    // Give the detached recorder time to finish, then check it left the late comment alone.
    await new Promise(resolve => setTimeout(resolve, 200));
    assert.equal(await ackOf(late), null);

    // A run-context read with the run open acks the comments it returned, the late one included.
    const [readStatus, read] = await runContext(devA.token, target);
    assert.equal(readStatus, 200, JSON.stringify(read));
    assert.ok(read.commentsSince.some(row => row.id === late.id));
    assert.ok(await eventually(() => ackOf(late)), 'the run-context read acked the late comment');
    assert.equal(await ackOf(own), null);
  });

  await t.test('the token comments route acks on a since read only, and the answer already shows it', async () => {
    const baseline = await comment(target, person, 'baseline', ago(60));
    // A plain list, what `collab comments wait` sends for its baseline, acks nothing.
    const [plainStatus, plain] = await list(devA.token, target, '?flat=true');
    assert.equal(plainStatus, 200, JSON.stringify(plain));
    assert.ok(plain.comments.some(row => row.id === baseline.id));
    assert.equal(await ackOf(baseline), null);

    const since = ago(30);
    const fresh = await comment(target, person, 'fresh', new Date());
    const [status, reply] = await list(devA.token, target, `?since=${encodeURIComponent(since.toISOString())}`);
    assert.equal(status, 200, JSON.stringify(reply));
    const row = reply.comments.find(item => item.id === fresh.id);
    assert.ok(row, JSON.stringify(reply));
    assert.equal(row.ack.state, 'acked');
    assert.deepEqual(row.ack.seats.map(seat => seat.userId), [devA.userId]);
    assert.ok(await ackOf(fresh));
    // The baseline comment was written before `since`, so this read did not return it and did not ack it.
    assert.ok(!reply.comments.some(item => item.id === baseline.id));
    assert.equal(await ackOf(baseline), null);
  });

  await t.test('a like on an acked comment still toggles, and reactionCounts counts only likes', async () => {
    const [addStatus, added] = await like(target, first);
    assert.equal(addStatus, 200);
    assert.equal(added.status, 'added');
    let [, reply] = await list(personToken, target);
    let row = reply.comments.find(item => item.id === first.id);
    assert.deepEqual(row.reactionCounts, { like: 1 });
    assert.deepEqual(row.reactions.map(reaction => reaction.type), ['like']);
    assert.equal(row.ack.state, 'acked');

    const [removeStatus, removed] = await like(target, first);
    assert.equal(removeStatus, 200);
    assert.equal(removed.status, 'removed');
    [, reply] = await list(personToken, target);
    row = reply.comments.find(item => item.id === first.id);
    assert.deepEqual(row.reactionCounts, {});
    assert.deepEqual(row.reactions, []);
    assert.equal(row.ack.state, 'acked');
    assert.ok(await ackOf(first), 'the ack row outlives the like toggling');
  });

  await t.test('commentAcks gives acked, waiting and not_given on real rows', async () => {
    const other = await issue();
    // The workspace's acks began before these comments: the first ack, on a comment of its own, two hours ago.
    const old = await comment(other, person, 'long ago', ago(7300));
    await raw.issueCommentReaction.create({ data: { type: 'ack', commentId: old.id, authorId: devA.userId, createdAt: ago(7200) } });
    // The last run ended 10 minutes ago and none is open: the next run is given comments from then on.
    await raw.agentRun.create({ data: { workspaceId: 'w', issueId: other.id, seatId: devA.id, userId: devA.userId, runner: 'test', generation: 'g0',
      state: 'finished', outcome: 'in_review', startedAt: ago(1800), endedAt: ago(600) } });
    const before = await comment(other, person, 'during the run', ago(900));
    const afterwards = await comment(other, person, 'after the run', ago(300));
    const rows = await raw.issueComment.findMany({ where: { issueId: other.id },
      include: { reactions: { include: { author: { select: { id: true, name: true } } } } } });
    // The first ack this process remembered for the workspace is the later one of the cases above: forget it, so the
    // older ack written here is the start.
    forgetAckStarts();
    // The library runs in its own context: its answer is compared as data.
    const acks = new Map([...await commentAcks(other.id, rows)].map(([id, ack]) => [id, JSON.parse(JSON.stringify(ack))]));
    assert.equal(acks.get(old.id).state, 'acked');
    assert.deepEqual(acks.get(old.id).seats.map(seat => seat.userId), [devA.userId]);
    assert.deepEqual(acks.get(before.id), { state: 'none', seats: [], waitingFor: 'dev-a', reason: 'not_given' });
    assert.deepEqual(acks.get(afterwards.id), { state: 'waiting', seats: [], waitingFor: 'dev-a' });
  });
});
