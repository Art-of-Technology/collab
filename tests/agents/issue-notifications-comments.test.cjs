// Slack notifications for comments and acks against a real PostgreSQL: a seat's comment through the token route and a
// run start's acks reach a person's Slack address through the real settings row, the real libraries and a fake `fetch`.
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

test("Slack messages for a seat's comments and a run start's acks, from real rows", async t => {
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
  const commentsRoute = load('src/app/api/apps/auth/issues/[issueIdOrKey]/comments/route.ts', deps, globals);

  const made = await seats.createSeat({ workspaceId: 'w', actorId: owner, projectId: A, role: 'developer', ownerId: person, name: 'dev-a', expiresInDays: 30 });
  const devA = { ...made.seat, token: made.token.token };
  const seatName = (await raw.user.findUnique({ where: { id: devA.userId }, select: { name: true } })).name;
  assert.ok(seatName);

  const headers = token => ({ Authorization: `Bearer ${token}` });
  const post = async (target, content) => {
    const reply = await commentsRoute.POST(new Request('https://collab.test/api', { method: 'POST', headers: headers(devA.token), body: JSON.stringify({ content }) }),
      { params: Promise.resolve({ issueIdOrKey: target.issueKey }) });
    const body = await reply.json();
    assert.equal(reply.status, 201, JSON.stringify(body));
    await events.issueEventsSettled();
    return body;
  };
  const checkout = async target => {
    const reply = await runsRoute.POST(new Request('https://collab.test/api', { method: 'POST', headers: headers(devA.token),
      body: JSON.stringify({ issue: target.issueKey, generation: 'g1', runner: 'test' }) }), { params: Promise.resolve({}) });
    return [reply.status, await reply.json()];
  };
  let count = 0;
  const issue = async () => {
    const created = await raw.issue.create({ data: { workspaceId: 'w', projectId: A, title: `Issue ${++count}`, issueKey: `AA-${count}`, statusId: `${A}-to_do`,
      assigneeId: devA.userId, reporterId: person, createdAt: ago(3600) } });
    await raw.issueAssignee.create({ data: { issueId: created.id, userId: devA.userId, role: 'ASSIGNEE', status: 'APPROVED', assignedAt: ago(3000), approvedAt: ago(3000) } });
    return created;
  };
  const link = target => `<${BASE}/w/issues/${target.issueKey}|${target.issueKey}> “${target.title}”`;
  const choose = async choices => {
    const data = { slackUrlEnc: await cipher.encrypt(HOOK), slackOn: true, mineAssigned: false, mineReported: true, mineFollowed: false,
      onStatus: false, onAssigned: false, onReactions: false, comments: 'off', ...choices };
    await raw.issueNotificationSetting.upsert({ where: { userId_workspaceId: { userId: person, workspaceId: 'w' } }, create: { userId: person, workspaceId: 'w', ...data }, update: data });
  };

  await t.test("a seat's comment that mentions the person reaches the person's Slack with the mention wording", async () => {
    sent.length = 0;
    await choose({ comments: 'mentions' });
    const target = await issue();
    await post(target, `@[${person}](${person}) please check the redirect`);
    assert.deepEqual(sent, [{ url: HOOK, text: `*${seatName}* mentioned you on ${link(target)}: @${person} please check the redirect` }]);
  });

  await t.test("a seat's comment without a mention is not sent on 'only mentions' and is sent on 'all'", async () => {
    sent.length = 0;
    await choose({ comments: 'mentions' });
    const target = await issue();
    await post(target, 'pushed a fix');
    assert.deepEqual(sent, []);
    await choose({ comments: 'all' });
    await post(target, 'pushed another fix');
    assert.deepEqual(sent, [{ url: HOOK, text: `*${seatName}* commented on ${link(target)}: pushed another fix` }]);
  });

  await t.test('a run start that acks two of the person\'s comments sends one message: acked 2 of your comments', async () => {
    await choose({ onReactions: true, comments: 'off' });
    const target = await issue();
    await raw.issueComment.create({ data: { issueId: target.id, authorId: person, content: 'first thing', createdAt: ago(600) } });
    await raw.issueComment.create({ data: { issueId: target.id, authorId: person, content: 'second thing', createdAt: ago(500) } });
    sent.length = 0;
    const [status, reply] = await checkout(target);
    assert.equal(status, 200, JSON.stringify(reply));
    assert.ok(await eventually(() => sent.length > 0), 'the start told the notifier');
    await events.issueEventsSettled();
    // Anything else still in flight would have landed by now.
    await new Promise(resolve => setTimeout(resolve, 200));
    await events.issueEventsSettled();
    assert.deepEqual(sent, [{ url: HOOK, text: `*${seatName}* acked 2 of your comments on ${link(target)}` }]);
  });
});
