// The token issue routes tell the notifier, against a real PostgreSQL, with the real notification libraries: a seat's
// status change, a seat's assignment and a token create reach a person's Slack; a person with everything off gets nothing.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { Prisma } = require('@prisma/client');
const { load } = require('../security/helpers.cjs');
const { seatsDatabase } = require('./seats-db.cjs');

// Token-facing routes accept only cuid-shaped ids.
const owner = 'cowner00001', person = 'cperson0001';
const A = 'cprojecta001';
const scopes = ['issues:read', 'issues:write', 'user:read'];
const SLACK = 'https://hooks.slack.com/services/TTEST/BTEST/testonlytail9999';
const STARTING_SET = { mineAssigned: true, mineReported: true, mineFollowed: true, onStatus: true, onAssigned: true, onReactions: true, comments: 'mentions' };
const NOTHING = { mineAssigned: false, mineReported: false, mineFollowed: false, onStatus: false, onAssigned: false, onReactions: false, comments: 'off' };

process.env.APP_TOKENS_KEY = 'test-key-of-exactly-32-chars-000';
process.env.NEXT_PUBLIC_APP_URL = 'https://collab.example';

let db;
after(() => db?.stop());

test('issue notifications from the token routes: status, assignment and create reach Slack; everything off sends nothing', async t => {
  db = await seatsDatabase(async prisma => {
    // People sign in with an email; a seat's account has none.
    await prisma.user.createMany({ data: [owner, person].map(id => ({ id, name: id, email: `${id}@example.test` })) });
    await prisma.workspace.create({ data: { id: 'w', name: 'w', slug: 'w', ownerId: owner } });
    await prisma.workspaceMember.create({ data: { workspaceId: 'w', userId: person } });
    await prisma.project.create({ data: { id: A, workspaceId: 'w', name: A, slug: A, issuePrefix: 'AA' } });
    await prisma.projectStatus.createMany({ data: [['to_do', 'To Do'], ['in_progress', 'In Progress'], ['in_review', 'In Review'], ['done', 'Done']]
      .map(([name, displayName], order) => ({ id: `${A}-${name}`, projectId: A, name, displayName, order, isFinal: name === 'done' })) });
    await prisma.repository.create({ data: { projectId: A, githubRepoId: A, owner: 'acme', name: A, fullName: `acme/${A}`, webhookSecret: 'secret' } });
    for (const [id, slug] of [['agent-app', 'collab-agent'], ['person-app', 'collab-cli']]) {
      await prisma.app.create({ data: { id, name: slug, slug, publisherId: 'system', status: 'PUBLISHED', visibility: 'PRIVATE', isSystemApp: true,
        scopes: { create: scopes.map(scope => ({ scope })) } } });
    }
  });
  // The application's client, so Trash is hidden here as it is in production.
  const raw = db.prisma;
  const prisma = raw.$extends(load('src/lib/issue-visibility.ts').issueVisibilityExtension(Prisma.dmmf.datamodel.models));

  // Slack is a fake that answers 200 and records what it was sent.
  const sent = [];
  const fetch = async (url, init) => { sent.push({ url: String(url), text: JSON.parse(init.body).text }); return { status: 200 }; };
  const timers = { setTimeout, clearTimeout, AbortController };
  const crypto = { encryptToken: async value => Buffer.from(value), decryptToken: async data => Buffer.from(data).toString(), getEncryptionKey: () => {} };
  const zod = require('zod');
  const response = { NextResponse: Response };
  const globals = { console, URL, Date, Buffer };
  const finder = load('src/lib/issue-finder.ts', { '@/lib/prisma': { prisma } });
  const handoffs = load('src/lib/agent-handoffs.ts', { 'node:crypto': require('node:crypto'), 'node:buffer': require('node:buffer'), zod,
    '@/lib/prisma': { prisma }, '@/lib/issue-finder': finder, '@/lib/oauth-scopes': load('src/lib/oauth-scopes.ts') }, { Date });
  const tokens = load('src/lib/agent-tokens.ts', { crypto: require('node:crypto'), '@/lib/prisma': { prisma }, '@/lib/apps/crypto': crypto }, { Buffer, Date });
  const seats = load('src/lib/agent-seats.ts', { '@/lib/prisma': { prisma }, '@/lib/agent-handoffs': handoffs, '@/lib/agent-tokens': tokens,
    '@/lib/issue-assignee': load('src/lib/issue-assignee.ts', { './agent-handoffs': handoffs }) }, { Date });
  const middleware = load('src/lib/apps/auth-middleware.ts', { crypto: require('node:crypto'), 'next/server': response,
    '@/lib/apps/crypto': crypto, '@/lib/oauth-scopes': load('src/lib/oauth-scopes.ts'), '@/lib/post-access': load('src/lib/post-access.ts'),
    '@/lib/auth-error-diagnostics': load('src/lib/auth-error-diagnostics.ts'), '@/lib/prisma': { prisma } }, globals);

  // The real notification libraries: the address is encrypted with the real key, and the sender posts through the fake.
  const appCrypto = load('src/lib/apps/crypto.ts', { crypto: require('node:crypto'), bcrypt: require('bcrypt'), util: require('node:util') },
    { process, Buffer, TextEncoder, TextDecoder });
  const slack = load('src/lib/notification-slack.ts', {}, { URL, fetch, JSON, ...timers });
  const settings = load('src/lib/notification-settings.ts', { '@/lib/prisma': { prisma }, '@/lib/apps/crypto': appCrypto,
    '@/lib/notification-slack': slack }, { ...globals, process });
  const events = load('src/lib/notification-issue-events.ts', { '@/lib/prisma': { prisma }, '@/lib/issue-finder': finder,
    '@/utils/mentions': load('src/utils/mentions.ts'), '@/lib/apps/crypto': appCrypto, '@/lib/notification-slack': slack,
    '@/lib/notification-settings': settings }, { ...globals, process, ...timers });

  const deps = { '@/lib/forge/legacy-write-guard': { ForgeProjectWriteError: class extends Error {}, assertLegacyIssueWriteAllowed: async () => {},
    assertLegacyProjectWriteAllowed: async () => {} },
  zod, 'next/server': response, '@/lib/prisma': { prisma }, '@/lib/apps/auth-middleware': middleware, '@/lib/agent-seats': seats,
  '@/lib/issue-finder': finder, '@/lib/event-bus': { emitIssueCreated: async () => {}, emitIssueUpdated: async () => {} },
  '@/lib/notification-issue-events': events };
  const createRoute = load('src/app/api/apps/auth/issues/route.ts', deps, globals);
  const issueRoute = load('src/app/api/apps/auth/issues/[issueIdOrKey]/route.ts', deps, globals);
  const assignRoute = load('src/app/api/apps/auth/issues/[issueIdOrKey]/assign/route.ts', deps, globals);
  // The same route with a notifier that does nothing: what the answer was before the routes told anyone.
  const quietIssueRoute = load('src/app/api/apps/auth/issues/[issueIdOrKey]/route.ts',
    { ...deps, '@/lib/notification-issue-events': { tellIssueEvent() {}, issueEventsSettled: async () => {} } }, globals);

  const made = await seats.createSeat({ workspaceId: 'w', actorId: owner, projectId: A, role: 'developer', ownerId: person, name: 'dev-a', expiresInDays: 30 });
  const devA = { ...made.seat, token: made.token.token };
  const seatName = (await raw.user.findUnique({ where: { id: devA.userId }, select: { name: true } })).name;
  // A seat may never change who an issue is assigned to (`seat_scope`), so assignments come from the owner's own token.
  const ownerToken = 'collab_owner_token';
  await raw.appToken.create({ data: { appId: 'person-app', workspaceId: 'w', userId: owner, installationId: null,
    accessToken: Buffer.from(ownerToken).toString('base64'), scopes } });

  await raw.issueNotificationSetting.create({ data: { userId: person, workspaceId: 'w', slackUrlEnc: await appCrypto.encrypt(SLACK), slackOn: true,
    slackEverOn: true, ...STARTING_SET } });

  const call = async (handler, token, method, issueIdOrKey, body) => {
    const reply = await handler(new Request('https://collab.test/api', { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body) }), { params: Promise.resolve(issueIdOrKey ? { issueIdOrKey } : {}) });
    return [reply.status, await reply.json()];
  };
  let count = 0;
  /** An issue the person reported, held by the seat. */
  const issue = async () => {
    const created = await raw.issue.create({ data: { workspaceId: 'w', projectId: A, title: `Issue ${++count}`, issueKey: `AA-${100 + count}`,
      statusId: `${A}-to_do`, status: 'to_do', statusValue: 'to_do', reporterId: person, assigneeId: devA.userId } });
    await raw.issueAssignee.create({ data: { issueId: created.id, userId: devA.userId, role: 'ASSIGNEE', status: 'APPROVED', assignedAt: new Date(), approvedAt: new Date() } });
    return created;
  };
  const link = target => `<https://collab.example/w/issues/${target.issueKey}|${target.issueKey}>`;
  // The sender sleeps on unref'd timers, which do not keep this process alive: hold it open while the deliveries end.
  const settled = async () => {
    const hold = setInterval(() => {}, 50);
    try { await events.issueEventsSettled(); } finally { clearInterval(hold); }
    return sent.splice(0);
  };

  await t.test("a seat's status change through the token PATCH reaches the reporter's Slack", async () => {
    const target = await issue();
    const [status, reply] = await call(issueRoute.PATCH, devA.token, 'PATCH', target.issueKey, { status: 'in_progress' });
    assert.equal(status, 200, JSON.stringify(reply));
    const messages = await settled();
    assert.deepEqual(messages, [{ url: SLACK, text: `*${seatName}* moved ${link(target)} “${target.title}” from To Do to In Progress` }]);
  });

  await t.test('assigning the issue to the person through the token assign route says so', async () => {
    const target = await issue();
    const [status, reply] = await call(assignRoute.POST, ownerToken, 'POST', target.issueKey, { assigneeId: person });
    assert.equal(status, 200, JSON.stringify(reply));
    const messages = await settled();
    assert.deepEqual(messages, [{ url: SLACK, text: `*${owner}* assigned ${link(target)} “${target.title}” to you` }]);
    // Unassigning tells nothing.
    const [unassigned] = await call(assignRoute.POST, ownerToken, 'POST', target.issueKey, { unassign: true });
    assert.equal(unassigned, 200);
    assert.deepEqual(await settled(), []);
  });

  await t.test('a token create with the person as assignee says so', async () => {
    const [status, reply] = await call(createRoute.POST, ownerToken, 'POST', null, { projectId: A, title: 'Made by a token', assigneeId: person });
    assert.equal(status, 201, JSON.stringify(reply));
    assert.equal(reply.assigneeId, person, JSON.stringify(reply));
    const messages = await settled();
    assert.deepEqual(messages, [{ url: SLACK, text: `*${owner}* assigned ${link(reply)} “Made by a token” to you` }]);
  });

  await t.test('a person with everything off gets nothing', async () => {
    await raw.issueNotificationSetting.update({ where: { userId_workspaceId: { userId: person, workspaceId: 'w' } }, data: NOTHING });
    try {
      const target = await issue();
      const [status, reply] = await call(issueRoute.PATCH, devA.token, 'PATCH', target.issueKey, { status: 'in_progress' });
      assert.equal(status, 200, JSON.stringify(reply));
      const [assigned] = await call(assignRoute.POST, ownerToken, 'POST', target.issueKey, { assigneeId: person });
      assert.equal(assigned, 200);
      assert.deepEqual(await settled(), []);
    } finally {
      await raw.issueNotificationSetting.update({ where: { userId_workspaceId: { userId: person, workspaceId: 'w' } }, data: STARTING_SET });
    }
  });

  await t.test('the token PATCH answer has the same keys as before', async () => {
    const told = await issue();
    const quiet = await issue();
    const [toldStatus, toldReply] = await call(issueRoute.PATCH, devA.token, 'PATCH', told.issueKey, { status: 'in_review' });
    const [quietStatus, quietReply] = await call(quietIssueRoute.PATCH, devA.token, 'PATCH', quiet.issueKey, { status: 'in_review' });
    assert.equal(toldStatus, 200, JSON.stringify(toldReply));
    assert.equal(quietStatus, 200, JSON.stringify(quietReply));
    assert.deepEqual(Object.keys(toldReply).sort(), Object.keys(quietReply).sort());
    await settled();
  });
});
