const { assert, test, load } = require('./helpers.cjs');

const URL_A = 'https://hooks.slack.com/services/T000/B000/secretA';
const URL_B = 'https://hooks.slack.com/services/T000/B000/secretB';
const SLACK_HOST = 'hooks.slack.com';
// Whether a log line carries a secret anywhere in it; a plain split, not a URL check.
const mentions = (text, part) => String(text).split(part).length > 1;
// The real escaper: the Slack module has no imports.
const { slackEscape } = load('src/lib/notification-slack.ts', {}, { setTimeout, clearTimeout, AbortController, URL });

function lib({ prisma = {}, sendCapped, markSlackResult, decrypt, env = { NEXT_PUBLIC_APP_URL: 'https://c.example' }, errors = [] } = {}) {
  return load('src/lib/notification-issue-events.ts', {
    '@/lib/prisma': { prisma },
    '@/lib/issue-finder': { issueReadAccessWhere: userId => ({ readableBy: userId }) },
    '@/utils/mentions': load('src/utils/mentions.ts'),
    '@/lib/apps/crypto': { decrypt: decrypt ?? (async buffer => buffer.toString('utf8')) },
    '@/lib/notification-slack': { slackEscape, sendCapped: sendCapped ?? (async () => 'ok') },
    '@/lib/notification-settings': { markSlackResult: markSlackResult ?? (async () => {}) },
  }, { console: { error: (...args) => errors.push(args) }, process: { env }, URL, Buffer, Promise, Set, Map });
}

// The module runs in its own realm; compare its answers as plain data.
const plain = value => JSON.parse(JSON.stringify(value));
const loaded = lib();
const pure = { excerpt: loaded.excerpt, messagesFor: (...args) => plain(loaded.messagesFor(...args)) };
const facts = (extra = {}) => ({ key: 'CLB-123', title: 'Fix the login redirect', url: 'https://c.example/w/issues/CLB-123', assigneeId: 'a', reporterId: 'r', followerIds: ['f'], actorName: 'Collab Developer', fromStatus: 'In Progress', toStatus: 'In Review', ...extra });
const on = (userId, extra = {}) => ({ userId, mineAssigned: true, mineReported: true, mineFollowed: true, onStatus: true, onAssigned: true, onReactions: true, comments: 'all', ...extra });
const LINK = '<https://c.example/w/issues/CLB-123|CLB-123>';
const T = '“Fix the login redirect”';
const sorted = list => [...list].sort((x, y) => x.userId.localeCompare(y.userId));

test('excerpt: tags go, mentions stay as names', () => {
  assert.equal(pure.excerpt('<p>Hi <span data-type="mention" data-user-id="u1">@Erdem</span> &amp; all</p>'), 'Hi @Erdem & all');
  assert.equal(pure.excerpt('see @[Erdem](u1) now'), 'see @Erdem now');
  const long = pure.excerpt('x'.repeat(250));
  assert.equal(long, 'x'.repeat(200) + '…');
  assert.equal(pure.excerpt('<p>a</p><p>b&nbsp;&lt;c&gt; &quot;d&quot; &#39;e&#39;</p>'), 'a b <c> "d" \'e\'');
});

test('excerpt keeps plain text that only looks like a tag, and cuts on whole characters', () => {
  assert.equal(pure.excerpt('if a < b and c > d'), 'if a < b and c > d');
  assert.equal(pure.excerpt('<p>if a < b and c > d</p>'), 'if a < b and c > d');
  const emoji = pure.excerpt('😀'.repeat(250));
  assert.equal(Array.from(emoji).length, 201);
  assert.ok(emoji.endsWith('😀…'));
});

test('a tag cannot be rebuilt from the pieces of another', () => {
  const out = pure.excerpt('<scr<script>ipt>alert(1)</scr</script>ipt>');
  assert.equal(mentions(out.toLowerCase(), '<script'), false, out);
  assert.equal(pure.excerpt('<p>x <b>bold</b> <span data-type="mention" data-label="Mia">Mia</span> <span data-type="mention" data-label="Ann"></span></p>'), 'x bold @Mia @Ann');
});

test('a huge comment cannot hold the event loop', () => {
  for (const text of ['<'.repeat(1_000_000), '<span>'.repeat(170_000)]) {
    const started = Date.now();
    pure.excerpt(text);
    pure.messagesFor({ kind: 'comment', issueId: 'i', actorId: 'x', commentId: 'c', text }, facts(), [on('a')]);
    pure.messagesFor({ kind: 'comment', issueId: 'i', actorId: 'x', commentId: 'c', text }, facts(), []);
    assert.ok(Date.now() - started < 1000, `took ${Date.now() - started} ms`);
  }
});

test('status: assignee, reporter and follower are told, with the exact text', () => {
  const out = pure.messagesFor({ kind: 'status', issueId: 'i', actorId: 'x', fromStatusId: 's1', toStatusId: 's2' }, facts(), [on('a'), on('r'), on('f')]);
  const text = `*Collab Developer* moved ${LINK} ${T} from In Progress to In Review`;
  assert.equal(text, '*Collab Developer* moved <https://c.example/w/issues/CLB-123|CLB-123> “Fix the login redirect” from In Progress to In Review');
  assert.deepEqual(sorted(out), [{ userId: 'a', text }, { userId: 'f', text }, { userId: 'r', text }]);
  const noFrom = pure.messagesFor({ kind: 'status', issueId: 'i', actorId: 'x', fromStatusId: null, toStatusId: 's2' }, facts({ fromStatus: null }), [on('a')]);
  assert.deepEqual(noFrom, [{ userId: 'a', text: `*Collab Developer* moved ${LINK} ${T} to In Review` }]);
  assert.deepEqual(pure.messagesFor({ kind: 'status', issueId: 'i', actorId: 'x', fromStatusId: 's1', toStatusId: null }, facts({ toStatus: null }), [on('a')]), []);
});

test("a status change is not sent to a reporter whose 'Issues I reported' box is off", () => {
  const out = pure.messagesFor({ kind: 'status', issueId: 'i', actorId: 'x', fromStatusId: 's1', toStatusId: 's2' }, facts(), [on('r', { mineReported: false })]);
  assert.deepEqual(out, []);
});

test("…nor to anyone with 'The status changes' off", () => {
  const out = pure.messagesFor({ kind: 'status', issueId: 'i', actorId: 'x', fromStatusId: 's1', toStatusId: 's2' }, facts(), [on('a', { onStatus: false }), on('r', { onStatus: false }), on('f', { onStatus: false })]);
  assert.deepEqual(out, []);
});

test('assigned: the assignee is told', () => {
  const out = pure.messagesFor({ kind: 'assigned', issueId: 'i', actorId: 'x', assigneeId: 'a' }, facts(), [on('a'), on('r')]);
  assert.deepEqual(out, [{ userId: 'a', text: `*Collab Developer* assigned ${LINK} ${T} to you` }]);
  assert.deepEqual(pure.messagesFor({ kind: 'assigned', issueId: 'i', actorId: 'x', assigneeId: 'a' }, facts(), [on('a', { onAssigned: false })]), []);
});

test('comment: a mention, and a comment for the roles', () => {
  const text = '<p>Look <span data-type="mention" data-user-id="m">@Mia</span></p>';
  const out = pure.messagesFor({ kind: 'comment', issueId: 'i', actorId: 'x', commentId: 'c', text }, facts(), [on('m', { comments: 'mentions' }), on('a'), on('r', { comments: 'mentions' }), on('f')]);
  assert.deepEqual(sorted(out), [
    { userId: 'a', text: `*Collab Developer* commented on ${LINK} ${T}: Look @Mia` },
    { userId: 'f', text: `*Collab Developer* commented on ${LINK} ${T}: Look @Mia` },
    { userId: 'm', text: `*Collab Developer* mentioned you on ${LINK} ${T}: Look @Mia` },
  ]);
});

test('a mention reaches a person who has no role on the issue; with comments off it does not', () => {
  const event = { kind: 'comment', issueId: 'i', actorId: 'x', commentId: 'c', text: 'hey @[Mia](m)' };
  assert.deepEqual(pure.messagesFor(event, facts(), [on('m', { comments: 'mentions' })]), [{ userId: 'm', text: `*Collab Developer* mentioned you on ${LINK} ${T}: hey @Mia` }]);
  assert.deepEqual(pure.messagesFor(event, facts(), [on('m', { comments: 'off' })]), []);
});

test('a comment that mentions the assignee arrives once, with the mention wording', () => {
  const event = { kind: 'comment', issueId: 'i', actorId: 'x', commentId: 'c', text: 'hey @[Ann](a)' };
  assert.deepEqual(pure.messagesFor(event, facts(), [on('a')]), [{ userId: 'a', text: `*Collab Developer* mentioned you on ${LINK} ${T}: hey @Ann` }]);
});

test('described: the mentioned are told', () => {
  const out = pure.messagesFor({ kind: 'described', issueId: 'i', actorId: 'x', mentionedIds: ['m', 'n'] }, facts(), [on('m', { comments: 'mentions' }), on('n', { comments: 'off' })]);
  assert.deepEqual(out, [{ userId: 'm', text: `*Collab Developer* mentioned you in the description of ${LINK} ${T}` }]);
});

test('like: the comment author is told', () => {
  const out = pure.messagesFor({ kind: 'like', issueId: 'i', actorId: 'x', commentAuthorId: 'p' }, facts(), [on('p')]);
  assert.deepEqual(out, [{ userId: 'p', text: `*Collab Developer* liked your comment on ${LINK} ${T}` }]);
  assert.deepEqual(pure.messagesFor({ kind: 'like', issueId: 'i', actorId: 'x', commentAuthorId: 'p' }, facts(), [on('p', { onReactions: false })]), []);
});

test('three acked comments of one author are one message', () => {
  const out = pure.messagesFor({ kind: 'ack', issueId: 'i', actorId: 'x', commentAuthorIds: ['p', 'p', 'p', 'q'] }, facts(), [on('p'), on('q')]);
  assert.deepEqual(sorted(out), [
    { userId: 'p', text: `*Collab Developer* acked 3 of your comments on ${LINK} ${T}` },
    { userId: 'q', text: `*Collab Developer* acked your comment on ${LINK} ${T}` },
  ]);
});

test('a person who is assignee and follower gets one message', () => {
  const out = pure.messagesFor({ kind: 'status', issueId: 'i', actorId: 'x', fromStatusId: 's1', toStatusId: 's2' }, facts({ followerIds: ['a'] }), [on('a')]);
  assert.equal(out.length, 1);
  const comment = pure.messagesFor({ kind: 'comment', issueId: 'i', actorId: 'x', commentId: 'c', text: 'ok' }, facts({ followerIds: ['a'], reporterId: 'a' }), [on('a')]);
  assert.equal(comment.length, 1);
});

test('the actor is never told', () => {
  assert.deepEqual(pure.messagesFor({ kind: 'status', issueId: 'i', actorId: 'a', fromStatusId: 's1', toStatusId: 's2' }, facts({ reporterId: null, followerIds: [] }), [on('a')]), []);
  assert.deepEqual(pure.messagesFor({ kind: 'assigned', issueId: 'i', actorId: 'a', assigneeId: 'a' }, facts(), [on('a')]), []);
  assert.deepEqual(pure.messagesFor({ kind: 'comment', issueId: 'i', actorId: 'm', commentId: 'c', text: '@[Me](m)' }, facts({ assigneeId: null, reporterId: null, followerIds: [] }), [on('m')]), []);
  assert.deepEqual(pure.messagesFor({ kind: 'described', issueId: 'i', actorId: 'm', mentionedIds: ['m'] }, facts(), [on('m')]), []);
  assert.deepEqual(pure.messagesFor({ kind: 'like', issueId: 'i', actorId: 'p', commentAuthorId: 'p' }, facts(), [on('p')]), []);
  assert.deepEqual(pure.messagesFor({ kind: 'ack', issueId: 'i', actorId: 'p', commentAuthorIds: ['p'] }, facts(), [on('p')]), []);
});

test('a title with < & > and a name with * cannot break the message', () => {
  const out = pure.messagesFor({ kind: 'assigned', issueId: 'i', actorId: 'x', assigneeId: 'a' }, facts({ title: 'a <b> & c', actorName: '*Bad*Name*' }), [on('a')]);
  assert.deepEqual(out, [{ userId: 'a', text: `*BadName* assigned ${LINK} “a &lt;b&gt; &amp; c” to you` }]);
  const nameless = pure.messagesFor({ kind: 'assigned', issueId: 'i', actorId: 'x', assigneeId: 'a' }, facts({ actorName: '' }), [on('a')]);
  assert.equal(nameless[0].text, `*Someone* assigned ${LINK} ${T} to you`);
  const comment = pure.messagesFor({ kind: 'comment', issueId: 'i', actorId: 'x', commentId: 'c', text: '<p>&lt;!channel&gt;</p>' }, facts(), [on('a')]);
  assert.equal(comment[0].text, `*Collab Developer* commented on ${LINK} ${T}: &lt;!channel&gt;`);
  const evilKey = 'X> <https://evil.example|CLB';
  const linked = pure.messagesFor({ kind: 'assigned', issueId: 'i', actorId: 'x', assigneeId: 'a' }, facts({ key: evilKey }), [on('a')]);
  assert.equal(linked[0].text, `*Collab Developer* assigned <https://c.example/w/issues/CLB-123|X&gt; &lt;https://evil.example|CLB> ${T} to you`);
  const unlinked = pure.messagesFor({ kind: 'assigned', issueId: 'i', actorId: 'x', assigneeId: 'a' }, facts({ key: evilKey, url: null }), [on('a')]);
  assert.equal(unlinked[0].text, `*Collab Developer* assigned X&gt; &lt;https://evil.example|CLB ${T} to you`);
});

test('line breaks in a title, a name or a status name become one space', () => {
  const out = pure.messagesFor({ kind: 'status', issueId: 'i', actorId: 'x', fromStatusId: 's1', toStatusId: 's2' },
    facts({ title: 'Fix\n\nthe   login', actorName: 'Collab\r\nDeveloper', fromStatus: 'In\nProgress', toStatus: ' In \t Review ' }), [on('a')]);
  assert.equal(out[0].text, `*Collab Developer* moved ${LINK} “Fix the login” from In Progress to In Review`);
});

test('without a site address the key is not a link', () => {
  const out = pure.messagesFor({ kind: 'assigned', issueId: 'i', actorId: 'x', assigneeId: 'a' }, facts({ url: null }), [on('a')]);
  assert.deepEqual(out, [{ userId: 'a', text: `*Collab Developer* assigned CLB-123 ${T} to you` }]);
});

// Delivery, with a fake database.
function database({ issue = { id: 'i', issueKey: 'CLB-9', title: 'Title', workspaceId: 'w', assigneeId: 'a', reporterId: 'r', workspace: { slug: 'acme' } }, settings, unreadable = [], calls = [] } = {}) {
  const rows = settings ?? [
    { ...on('a'), slackUrlEnc: Buffer.from(URL_A) },
    { ...on('r'), slackUrlEnc: Buffer.from(URL_B) },
  ];
  return {
    calls,
    issue: {
      async findUnique(args) { calls.push(['issue', args]); return issue; },
      async findFirst(args) { calls.push(['access', args]); const userId = args.where.AND[0].readableBy; return unreadable.includes(userId) ? null : { id: args.where.id }; },
    },
    projectStatus: { async findMany(args) { calls.push(['status', args]); return [{ id: 's1', name: 'todo', displayName: 'To Do' }, { id: 's2', name: 'done', displayName: '' }]; } },
    user: { async findUnique(args) { calls.push(['user', args]); return { name: 'Actor' }; } },
    issueFollower: { async findMany(args) { calls.push(['followers', args]); return [{ userId: 'f' }]; } },
    issueNotificationSetting: { async findMany(args) { calls.push(['settings', args]); return rows; } },
  };
}
const statusEvent = { kind: 'status', issueId: 'i', actorId: 'x', fromStatusId: 's1', toStatusId: 's2' };

test('one event, two people with Slack on: two sends, keyed by workspace and person', async () => {
  const sends = [];
  const prisma = database();
  const events = lib({ prisma, sendCapped: async (...args) => { sends.push(args); return 'ok'; } });
  assert.equal(events.tellIssueEvent(statusEvent), undefined);
  await events.issueEventsSettled();
  const text = '*Actor* moved <https://c.example/acme/issues/CLB-9|CLB-9> “Title” from To Do to done';
  assert.deepEqual(sends.sort((x, y) => x[0].localeCompare(y[0])), [['w:a', URL_A, text], ['w:r', URL_B, text]]);
});

test('a person who cannot read the issue is skipped', async () => {
  const sends = [];
  const events = lib({ prisma: database({ unreadable: ['a'] }), sendCapped: async (...args) => { sends.push(args); return 'ok'; } });
  events.tellIssueEvent(statusEvent);
  await events.issueEventsSettled();
  assert.deepEqual(sends.map(send => send[0]), ['w:r']);
});

test("a seat's account and a person with Slack off are never read as recipients", async () => {
  const prisma = database();
  const events = lib({ prisma });
  events.tellIssueEvent(statusEvent);
  await events.issueEventsSettled();
  const args = plain(prisma.calls.find(call => call[0] === 'settings')[1]);
  assert.deepEqual(args.where.user, { email: { not: null }, agentSeat: { is: null } });
  assert.equal(args.where.slackOn, true);
  assert.deepEqual(args.where.slackUrlEnc, { not: null });
  assert.equal(args.where.workspaceId, 'w');
  assert.deepEqual([...args.where.userId.in].sort(), ['a', 'f', 'r']);
});

test('gone and failed are reported to the settings store, ok is not', async () => {
  const marks = [];
  const settings = [{ ...on('a'), slackUrlEnc: Buffer.from(URL_A) }, { ...on('r'), slackUrlEnc: Buffer.from(URL_B) }, { ...on('f'), slackUrlEnc: Buffer.from(URL_A) }];
  const results = { 'w:a': 'gone', 'w:r': 'failed', 'w:f': 'ok' };
  const events = lib({ prisma: database({ settings }), sendCapped: async key => results[key], markSlackResult: async (...args) => { marks.push(args); } });
  events.tellIssueEvent(statusEvent);
  await events.issueEventsSettled();
  assert.deepEqual(marks.sort((x, y) => x[0].localeCompare(y[0])), [['a', 'w', 'gone'], ['r', 'w', 'failed']]);
});

test('an ok send clears an earlier failure, and only then', async () => {
  const marks = [];
  const settings = [{ ...on('a'), slackUrlEnc: Buffer.from(URL_A), slackFailedAt: new Date() }, { ...on('r'), slackUrlEnc: Buffer.from(URL_B), slackFailedAt: null }];
  const prisma = database({ settings });
  const events = lib({ prisma, sendCapped: async () => 'ok', markSlackResult: async (...args) => { marks.push(args); } });
  events.tellIssueEvent(statusEvent);
  await events.issueEventsSettled();
  assert.deepEqual(marks, [['a', 'w', 'ok']]);
  assert.equal(plain(prisma.calls.find(call => call[0] === 'settings')[1]).select.slackFailedAt, true);
});

test('followers are read only for status and comment events', async () => {
  for (const [event, reads] of [
    [statusEvent, true],
    [{ kind: 'comment', issueId: 'i', actorId: 'x', commentId: 'c', text: 'hi' }, true],
    [{ kind: 'assigned', issueId: 'i', actorId: 'x', assigneeId: 'a' }, false],
    [{ kind: 'like', issueId: 'i', actorId: 'x', commentAuthorId: 'a' }, false],
    [{ kind: 'ack', issueId: 'i', actorId: 'x', commentAuthorIds: ['a'] }, false],
    [{ kind: 'described', issueId: 'i', actorId: 'x', mentionedIds: ['a'] }, false],
  ]) {
    const prisma = database();
    const events = lib({ prisma });
    events.tellIssueEvent(event);
    await events.issueEventsSettled();
    assert.equal(prisma.calls.some(call => call[0] === 'followers'), reads, event.kind);
  }
});

test('one dead address does not hold the others', async () => {
  const sends = [];
  let release;
  const held = new Promise(resolve => { release = resolve; });
  const events = lib({ prisma: database(), sendCapped: async key => { sends.push(key); if (key === 'w:a') { await held; return 'failed'; } return 'ok'; } });
  events.tellIssueEvent(statusEvent);
  for (let i = 0; i < 50 && sends.length < 2; i++) await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(sends.sort(), ['w:a', 'w:r']);
  release();
  await events.issueEventsSettled();
});

test('a database that throws, and a sender that throws, are caught', async () => {
  const errors = [];
  const broken = { issue: { async findUnique() { throw new Error('db down'); } } };
  const events = lib({ prisma: broken, errors });
  assert.doesNotThrow(() => events.tellIssueEvent(statusEvent));
  await events.issueEventsSettled();
  assert.ok(errors.length >= 1);
  const sends = [];
  const sender = lib({ prisma: database(), errors, sendCapped: async (key, ...rest) => { sends.push(key); if (key === 'w:a') throw new Error('network'); return 'ok'; } });
  assert.doesNotThrow(() => sender.tellIssueEvent(statusEvent));
  await sender.issueEventsSettled();
  assert.deepEqual(sends.sort(), ['w:a', 'w:r']);
  assert.ok(errors.every(args => String(args[0]).startsWith('[issue-notify]')));
});

test('an event for an issue that does not exist sends nothing', async () => {
  const sends = [];
  const events = lib({ prisma: database({ issue: null }), sendCapped: async (...args) => { sends.push(args); return 'ok'; } });
  events.tellIssueEvent(statusEvent);
  await events.issueEventsSettled();
  assert.deepEqual(sends, []);
});

test('the log line never contains the address', async () => {
  const errors = [];
  const events = lib({ prisma: database(), errors, sendCapped: async (key, url) => { const error = new Error(`could not reach ${url}`); error.cause = url; throw error; } });
  events.tellIssueEvent(statusEvent);
  await events.issueEventsSettled();
  assert.ok(errors.length >= 2);
  for (const args of errors) {
    const line = args.map(arg => (arg instanceof Error ? `${arg.message} ${arg.stack} ${arg.cause}` : typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' ');
    assert.equal(mentions(line, URL_A), false, line);
    assert.equal(mentions(line, URL_B), false, line);
    assert.equal(mentions(line, SLACK_HOST), false, line);
  }
});

test("the loader's stub: a module that imports the events library loads through helpers.cjs", () => {
  // A file that requires the events library without handing its own gets the silent stub.
  const helpers = require('./helpers.cjs');
  const fs = require('node:fs');
  const path = require('node:path');
  const dir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'notify-stub-'));
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'src/uses.ts'), "import * as events from '@/lib/notification-issue-events';\nexport const got = events;\n");
  const before = process.env.SECURITY_TEST_ROOT;
  process.env.SECURITY_TEST_ROOT = dir;
  try {
    const { got } = helpers.load('src/uses.ts');
    assert.equal(typeof got.tellIssueEvent, 'function');
    assert.equal(typeof got.issueEventsSettled, 'function');
  } finally {
    if (before === undefined) delete process.env.SECURITY_TEST_ROOT; else process.env.SECURITY_TEST_ROOT = before;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
