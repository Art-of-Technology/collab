// Slack notifications for runs against a real PostgreSQL: a seat's run start that moves the issue, and a person's reply
// to a stopped run, reach a person's Slack address through the real settings row, the real libraries and a fake `fetch`.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { Prisma } = require('@prisma/client');
const { load } = require('../security/helpers.cjs');
const { seatsDatabase } = require('./seats-db.cjs');

// Token-facing routes accept only cuid-shaped ids.
const owner = 'cowner00001', person = 'cperson0001';
const A = 'cprojecta001';
const scopes = ['issues:read', 'issues:write', 'user:read'];
const BASE = 'https://collab.test';
const HOOK = 'https://hooks.slack.com/services/TTEST/BTEST/testonlytail9999';
const DISPLAY = { to_do: 'To Do', in_progress: 'In Progress', in_review: 'In Review', done: 'Done' };
const ago = seconds => new Date(Date.now() - seconds * 1000);
/** Deliveries are detached from the call that starts them: wait for a condition, up to `ms`. */
const eventually = async (check, ms = 3000) => {
  const end = Date.now() + ms;
  for (;;) {
    const value = await check();
    if (value || Date.now() > end) return value;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
};

let db;
// The Slack sender waits on unref'd timers (a server's listener keeps its loop alive); here a held interval does.
const keepAlive = setInterval(() => {}, 1000);
after(() => { clearInterval(keepAlive); return db?.stop(); });

test('Slack messages for a run start and a reply to a stopped run, from real rows', async t => {
  db = await seatsDatabase(async prisma => {
    // People sign in with an email; a seat's account has none.
    await prisma.user.createMany({ data: [owner, person].map(id => ({ id, name: id, email: `${id}@example.test` })) });
    await prisma.workspace.create({ data: { id: 'w', name: 'w', slug: 'w', ownerId: owner } });
    await prisma.workspaceMember.create({ data: { workspaceId: 'w', userId: person } });
    await prisma.project.create({ data: { id: A, workspaceId: 'w', name: A, slug: A, issuePrefix: 'AA' } });
    // Display names unlike the internal names, so a message shows which one it reads.
    await prisma.projectStatus.createMany({ data: Object.entries(DISPLAY).map(([name, displayName], order) => ({ id: `${A}-${name}`, projectId: A, name,
      displayName, order, isFinal: name === 'done' })) });
    await prisma.repository.create({ data: { projectId: A, githubRepoId: A, owner: 'acme', name: A, fullName: `acme/${A}`, webhookSecret: 'secret' } });
    for (const [id, slug] of [['agent-app', 'collab-agent'], ['person-app', 'collab-cli']]) {
      await prisma.app.create({ data: { id, name: slug, slug, publisherId: 'system', status: 'PUBLISHED', visibility: 'PRIVATE', isSystemApp: true,
        scopes: { create: scopes.map(scope => ({ scope })) } } });
    }
  });
  // The application's client, so Trash is hidden here as it is in production.
  const raw = db.prisma;
  const prisma = raw.$extends(load('src/lib/issue-visibility.ts').issueVisibilityExtension(Prisma.dmmf.datamodel.models));

  // Tokens are stored in the clear here; the Slack address goes through the real cipher.
  const tokenCrypto = { encryptToken: async value => Buffer.from(value), decryptToken: async data => Buffer.from(data).toString(), getEncryptionKey: () => {} };
  const cipher = load('src/lib/apps/crypto.ts', { crypto: require('node:crypto'), util: require('node:util'), bcrypt: {} },
    { Buffer, process: { env: { APP_TOKENS_KEY: 'k'.repeat(32) } }, console });
  const zod = require('zod');
  const response = { NextResponse: Response };
  const globals = { console, URL, Date, Buffer };
  const issueFinder = load('src/lib/issue-finder.ts', { '@/lib/prisma': { prisma } });

  // Slack itself is a fake `fetch` that records every post and answers 200.
  const sent = [];
  const fetch = async (url, init) => { sent.push({ url, text: JSON.parse(init.body).text }); return { status: 200 }; };
  const slack = load('src/lib/notification-slack.ts', {}, { fetch, AbortController, setTimeout, clearTimeout, URL });
  const settingsLib = load('src/lib/notification-settings.ts', { '@/lib/prisma': { prisma }, '@/lib/apps/crypto': cipher, '@/lib/notification-slack': slack }, globals);
  const events = load('src/lib/notification-issue-events.ts', {
    '@/lib/prisma': { prisma },
    '@/lib/agent-stop-boundary': load('src/lib/agent-stop-boundary.ts', { '@/constants/project-statuses': load('src/constants/project-statuses.ts') }),
    '@/lib/issue-finder': issueFinder, '@/utils/mentions': load('src/utils/mentions.ts'),
    '@/lib/apps/crypto': cipher, '@/lib/notification-slack': slack, '@/lib/notification-settings': settingsLib,
  }, { ...globals, process: { env: { NEXT_PUBLIC_APP_URL: BASE } } });

  const handoffs = load('src/lib/agent-handoffs.ts', { 'node:crypto': require('node:crypto'), 'node:buffer': require('node:buffer'), zod,
    '@/lib/prisma': { prisma }, '@/lib/issue-finder': issueFinder, '@/lib/oauth-scopes': load('src/lib/oauth-scopes.ts') }, { Date });
  const tokens = load('src/lib/agent-tokens.ts', { crypto: require('node:crypto'), '@/lib/prisma': { prisma }, '@/lib/apps/crypto': tokenCrypto }, { Buffer, Date });
  const seats = load('src/lib/agent-seats.ts', { '@/lib/prisma': { prisma }, '@/lib/agent-handoffs': handoffs, '@/lib/agent-tokens': tokens,
    '@/lib/issue-assignee': load('src/lib/issue-assignee.ts', { './agent-handoffs': handoffs }) }, { Date });
  const middleware = load('src/lib/apps/auth-middleware.ts', { crypto: require('node:crypto'), 'next/server': response,
    '@/lib/apps/crypto': tokenCrypto, '@/lib/oauth-scopes': load('src/lib/oauth-scopes.ts'), '@/lib/post-access': load('src/lib/post-access.ts'),
    '@/lib/auth-error-diagnostics': load('src/lib/auth-error-diagnostics.ts'), '@/lib/prisma': { prisma } }, globals);
  const deps = { '@/lib/forge/legacy-write-guard': { ForgeProjectWriteError: class extends Error {}, assertLegacyIssueWriteAllowed: async () => {} },
    zod, 'next/server': response, '@/lib/prisma': { prisma }, '@/lib/apps/auth-middleware': middleware, '@/lib/agent-seats': seats,
    '@/lib/agent-handoff-http': load('src/lib/agent-handoff-http.ts', { zod, 'next/server': response, './agent-handoffs': handoffs }, globals),
    '@/lib/issue-finder': issueFinder,
    '@/lib/permissions': load('src/lib/permissions.ts', { './prisma': { prisma } }, { console }),
    '@/lib/session': { getCurrentUser: async () => ({ id: person }) }, '@/lib/agent-tokens': tokens,
    '@/lib/redis': { publishEvent: async () => true }, '@/lib/notification-issue-events': events };
  deps['@/lib/issue-comment-acks'] = load('src/lib/issue-comment-acks.ts', deps, globals);
  deps['@/lib/agent-runs'] = load('src/lib/agent-runs.ts', deps, globals);
  const runsRoute = load('src/app/api/apps/auth/runs/route.ts', deps, globals);
  // The browser reply route, with the mention notifier left out: its in-app work is not what is told here.
  const replyRoute = load('src/app/api/issues/[issueId]/runs/[runId]/reply/route.ts', { ...deps, '@/lib/issue-comment-mentions': { notifyCommentMentions: async () => {} } }, globals);

  const made = await seats.createSeat({ workspaceId: 'w', actorId: owner, projectId: A, role: 'developer', ownerId: person, name: 'dev-a', expiresInDays: 30 });
  const devA = { ...made.seat, token: made.token.token };
  const seatName = (await raw.user.findUnique({ where: { id: devA.userId }, select: { name: true } })).name;
  assert.ok(seatName);

  const headers = token => ({ Authorization: `Bearer ${token}` });
  const checkout = async target => {
    const reply = await runsRoute.POST(new Request('https://collab.test/api', { method: 'POST', headers: headers(devA.token),
      body: JSON.stringify({ issue: target.issueKey, generation: 'g1', runner: 'test' }) }), { params: Promise.resolve({}) });
    return [reply.status, await reply.json()];
  };
  let count = 0;
  const issue = async (reporterId = person) => {
    const created = await raw.issue.create({ data: { workspaceId: 'w', projectId: A, title: `Issue ${++count}`, issueKey: `AA-${count}`, statusId: `${A}-to_do`,
      assigneeId: devA.userId, reporterId, createdAt: ago(3600) } });
    await raw.issueAssignee.create({ data: { issueId: created.id, userId: devA.userId, role: 'ASSIGNEE', status: 'APPROVED', assignedAt: ago(3000), approvedAt: ago(3000) } });
    return created;
  };
  const link = target => `<${BASE}/w/issues/${target.issueKey}|${target.issueKey}> “${target.title}”`;
  const choose = async (choices, userId = person) => {
    const data = { slackUrlEnc: await cipher.encrypt(HOOK), slackOn: true, mineAssigned: false, mineReported: true, mineFollowed: false,
      onStatus: false, onAssigned: false, onReactions: false, comments: 'off', ...choices };
    await raw.issueNotificationSetting.upsert({ where: { userId_workspaceId: { userId, workspaceId: 'w' } }, create: { userId, workspaceId: 'w', ...data }, update: data });
  };

  /** Lets every delivery in flight land, so a message nobody expected would be seen. */
  const quiet = async () => {
    await events.issueEventsSettled();
    await new Promise(resolve => setTimeout(resolve, 200));
    await events.issueEventsSettled();
  };

  await t.test("a seat starting a run on the person's issue: moved from To Do to In Progress", async () => {
    await choose({ mineReported: true, onStatus: true });
    const target = await issue();
    sent.length = 0;
    const [status, reply] = await checkout(target);
    assert.equal(status, 200, JSON.stringify(reply));
    assert.ok(await eventually(() => sent.length > 0), 'the start told the notifier');
    await quiet();
    assert.deepEqual(sent, [{ url: HOOK, text: `*${seatName}* moved ${link(target)} from ${DISPLAY.to_do} to ${DISPLAY.in_progress}` }]);
    // The issue moved as before: the notifier changed nothing of the start.
    assert.equal((await raw.issue.findUnique({ where: { id: target.id }, select: { statusId: true } })).statusId, `${A}-in_progress`);
  });

  await t.test("a reply to a stopped run reaches the reporter who has 'all comments'", async () => {
    // The issue's assignee is the seat whose run stopped, and a seat is never told: the person told is the reporter.
    await choose({ mineReported: true, comments: 'all' }, owner);
    await choose({ comments: 'off' });
    const target = await issue(owner);
    // The seat's run finished in review asking the person, as a finish that names `askedUser` writes it.
    const run = await raw.agentRun.create({ data: { workspaceId: 'w', issueId: target.id, seatId: devA.id, userId: devA.userId, runner: 'test', generation: 'g1',
      state: 'finished', outcome: 'in_review', note: 'stopped', startedAt: ago(120), endedAt: ago(60) } });
    await raw.issueActivity.create({ data: { action: 'AGENT_RUN_FINISHED', itemType: 'ISSUE', itemId: target.id, userId: devA.userId, workspaceId: 'w', projectId: A,
      details: JSON.stringify({ runId: run.id, seatId: devA.id, outcome: 'in_review', askedUser: person }), createdAt: ago(60) } });
    sent.length = 0;
    const reply = await replyRoute.POST(new Request(`${BASE}/api`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content: 'Go with option B' }) }),
      { params: Promise.resolve({ issueId: target.issueKey, runId: run.id }) });
    const body = await reply.json();
    assert.equal(reply.status, 200, JSON.stringify(body));
    assert.equal(body.content, 'Go with option B');
    await quiet();
    assert.deepEqual(sent, [{ url: HOOK, text: `*${person}* commented on ${link(target)}: Go with option B` }]);
  });
});
