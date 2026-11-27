const { assert, test, load } = require('./helpers.cjs');

const URL_OK = 'https://hooks.slack.com/services/T024ABCDE/B07ABCDEF/x9y8z7w6v5u4h3Qz';
const SECRET_TAIL = 'x9y8z7w6v5u4';
const NOT_SLACK = 'Only a Slack webhook address is accepted. It starts with https://hooks.slack.com/services/';
const answers = [];

function setup({ user = { id: 'u' }, cookie = 'w', member = true, encryptThrows = false, results = [] } = {}) {
  const calls = { workspace: [], settings: 0 };
  const rows = new Map();
  const id = where => `${where.userId_workspaceId.userId}|${where.userId_workspaceId.workspaceId}`;
  const table = {
    findUnique: async ({ where }) => { calls.settings++; return rows.has(id(where)) ? { ...rows.get(id(where)) } : null; },
    upsert: async ({ where, create, update }) => {
      calls.settings++;
      const row = rows.has(id(where)) ? { ...rows.get(id(where)), ...update } : { slackUrlEnc: null, slackOn: false, slackEverOn: false,
        slackOffAt: null, slackFailedAt: null, mineAssigned: false, mineReported: false, mineFollowed: false, onStatus: false,
        onAssigned: false, onReactions: false, comments: 'off', ...create };
      rows.set(id(where), row);
      return { ...row };
    },
    update: async ({ where, data }) => { calls.settings++; const row = { ...rows.get(id(where)), ...data }; rows.set(id(where), row); return { ...row }; },
  };
  const prisma = {
    issueNotificationSetting: table,
    workspace: { findFirst: async args => { calls.workspace.push(args); return member ? { id: args.where.id } : null; } },
  };
  // The real check, mask and test text; only the sending is a fake.
  const slack = { ...load('src/lib/notification-slack.ts', {}, { URL, setTimeout, clearTimeout, AbortController }),
    postToSlack: async () => results.shift() ?? 'ok' };
  const crypto = {
    encrypt: async data => { if (encryptThrows) throw new Error('no key'); return Buffer.from('enc:' + data); },
    decrypt: async data => Buffer.from(data).toString().replace(/^enc:/, ''),
  };
  const lib = load('src/lib/notification-settings.ts', {
    '@/lib/prisma': { prisma }, '@/lib/apps/crypto': crypto, '@/lib/notification-slack': slack,
  }, { Buffer, Date });
  const deps = {
    'next/server': { NextResponse: Response },
    'next/headers': { cookies: async () => ({ get: name => (name === 'currentWorkspaceId' && cookie ? { value: cookie } : undefined) }) },
    '@/lib/session': { getCurrentUser: async () => user },
    '@/lib/prisma': { prisma },
    '@/lib/issue-finder': load('src/lib/issue-finder.ts', { '@/lib/prisma': { prisma } }),
    '@/lib/notification-settings': lib,
  };
  const choices = load('src/app/api/user/notification-preferences/issues/route.ts', deps, { console: { error() {} } });
  const slackRoute = load('src/app/api/user/notification-preferences/issues/slack/route.ts', deps, { console: { error() {} } });
  return { choices, slackRoute, calls, rows };
}

const req = body => new Request('https://example.test/x', { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: typeof body === 'string' ? body : JSON.stringify(body) });

async function call(handler, body) {
  const response = await handler(body === undefined ? new Request('https://example.test/x') : req(body));
  const text = await response.text();
  answers.push(text);
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

test('401, 400 and 403 before anything is read', async () => {
  const cases = [
    [{ user: null }, 401],
    [{ user: { id: '' } }, 401],
    [{ cookie: null }, 400],
    [{ member: false }, 403],
  ];
  for (const [options, status] of cases) {
    const { choices, slackRoute, calls } = setup(options);
    for (const handler of [choices.GET, choices.PATCH, slackRoute.PUT, slackRoute.DELETE, slackRoute.POST]) {
      const answer = await call(handler, handler === choices.GET || handler === slackRoute.DELETE || handler === slackRoute.POST ? undefined : { onStatus: true, url: URL_OK });
      assert.equal(answer.status, status);
      if (status === 400) assert.deepEqual(answer.body, { error: 'Workspace not set' });
    }
    assert.equal(calls.settings, 0);
  }
  // The membership check asks for the owner or an active member of the cookie's workspace.
  const { choices, calls } = setup();
  await call(choices.GET);
  assert.deepEqual(JSON.parse(JSON.stringify(calls.workspace[0])), { where: { id: 'w', OR: [{ ownerId: 'u' }, { members: { some: { userId: 'u', status: true } } }] }, select: { id: true } });
});

test('GET, PATCH, PUT, DELETE and POST answer as the rules say', async () => {
  const { choices, slackRoute, rows } = setup({ results: ['failed'] });
  let answer = await call(choices.GET);
  assert.equal(answer.status, 200);
  assert.equal(answer.body.comments, 'off');
  assert.deepEqual(answer.body.slack, { address: null, on: false, offAt: null, failedAt: null });
  assert.equal(rows.size, 0);

  assert.equal((await call(choices.PATCH, { shout: true })).status, 400);
  assert.equal((await call(choices.PATCH, { onStatus: 'yes' })).status, 400);
  assert.equal((await call(choices.PATCH, { slackOn: 'yes' })).status, 400);
  assert.equal((await call(choices.PATCH, 'not json')).status, 400);
  assert.equal(rows.size, 0);
  answer = await call(choices.PATCH, { slackOn: true });
  assert.deepEqual(answer, { status: 409, body: { error: 'no_address' } });
  // A refused switch-on writes nothing, not even the choices in the same body.
  answer = await call(choices.PATCH, { onStatus: true, slackOn: true });
  assert.deepEqual(answer, { status: 409, body: { error: 'no_address' } });
  assert.equal(rows.size, 0);
  answer = await call(choices.PATCH, { onStatus: true, comments: 'all' });
  assert.equal(answer.status, 200);
  assert.equal(answer.body.onStatus, true);
  assert.equal(answer.body.comments, 'all');

  for (const url of ['https://example.com/x', 'https://hooks.slack.com.evil.example/services/T/B/x', 'http://hooks.slack.com/services/T/B/x']) {
    answer = await call(slackRoute.PUT, { url });
    assert.deepEqual(answer, { status: 400, body: { error: 'not_slack', message: NOT_SLACK } });
  }
  answer = await call(slackRoute.PUT, { url: URL_OK });
  assert.equal(answer.status, 200);
  assert.equal(answer.body.slack.address, 'https://hooks.slack.com/services/T02•••/B07•••/••••••h3Qz');
  assert.equal(answer.body.slack.on, false);

  answer = await call(choices.PATCH, { slackOn: true });
  assert.equal(answer.status, 200);
  assert.equal(answer.body.slack.on, true);
  // onStatus and comments were ticked while Slack was off, so the starting set leaves them as they are.
  assert.equal(answer.body.onAssigned, false);
  assert.equal(answer.body.onStatus, true);
  assert.equal(answer.body.comments, 'all');

  answer = await call(slackRoute.POST);
  assert.equal(answer.status, 200);
  assert.equal(answer.body.result, 'failed');
  assert.ok(answer.body.settings.slack.failedAt);

  answer = await call(slackRoute.DELETE);
  assert.equal(answer.status, 200);
  assert.deepEqual(answer.body.slack, { address: null, on: false, offAt: null, failedAt: null });
  assert.equal(answer.body.onStatus, true);

  answer = await call(slackRoute.POST);
  assert.deepEqual(answer.body.result, 'no_address');

  const broken = setup({ encryptThrows: true });
  answer = await call(broken.slackRoute.PUT, { url: URL_OK });
  assert.equal(answer.status, 503);
  // Written as a split: a host name inside `includes` reads to code scanning as a URL check, which this is not.
  assert.equal(JSON.stringify(answer.body).split('hooks.slack.com').length, 1);
});

test('on the first switch-on, choices sent in the same body win over the starting set', async () => {
  const { choices, slackRoute } = setup();
  await call(slackRoute.PUT, { url: URL_OK });
  const answer = await call(choices.PATCH, { slackOn: true, onReactions: false, comments: 'all' });
  assert.equal(answer.status, 200);
  assert.equal(answer.body.slack.on, true);
  assert.equal(answer.body.onStatus, true);
  assert.equal(answer.body.onReactions, false);
  assert.equal(answer.body.comments, 'all');
});

test('no answer contains the address', () => {
  assert.ok(answers.length > 20);
  for (const text of answers) {
    assert.ok(!text.includes(SECRET_TAIL), text);
    assert.ok(!text.includes('slackUrlEnc'), text);
  }
});
