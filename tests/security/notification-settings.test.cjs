const { assert, test, load } = require('./helpers.cjs');

const URL_OK = 'https://hooks.slack.com/services/T024ABCDE/B07ABCDEF/x9y8z7w6v5u4h3Qz';
const SECRET_TAIL = 'x9y8z7w6v5u4';

// The real Slack helpers (the check, the mask and the test text); only the sending is a fake.
const realSlack = load('src/lib/notification-slack.ts', {}, { URL, setTimeout, clearTimeout, AbortController });
function slackFake(results = []) {
  const sent = [];
  return { sent, module: { ...realSlack,
    postToSlack: async (url, text) => { sent.push({ url, text }); return results.shift() ?? 'ok'; },
  } };
}

// A small in-memory table keyed on userId_workspaceId.
function store({ failUpdate } = {}) {
  const rows = new Map();
  const writes = [];
  const id = where => `${where.userId_workspaceId.userId}|${where.userId_workspaceId.workspaceId}`;
  const defaults = { slackUrlEnc: null, slackOn: false, slackEverOn: false, slackOffAt: null, slackFailedAt: null,
    mineAssigned: false, mineReported: false, mineFollowed: false, onStatus: false, onAssigned: false, onReactions: false, comments: 'off' };
  const table = {
    findUnique: async ({ where }) => (rows.has(id(where)) ? { ...rows.get(id(where)) } : null),
    upsert: async ({ where, create, update }) => {
      writes.push(['upsert', rows.has(id(where)) ? update : create]);
      const row = rows.has(id(where)) ? { ...rows.get(id(where)), ...update } : { ...defaults, ...create };
      rows.set(id(where), row);
      return { ...row };
    },
    update: async ({ where, data }) => {
      if (failUpdate) throw new Error('database down ' + URL_OK);
      if (!rows.has(id(where))) throw new Error('not found');
      writes.push(['update', data]);
      const row = { ...rows.get(id(where)), ...data };
      rows.set(id(where), row);
      return { ...row };
    },
  };
  return { rows, writes, table, get: () => rows.get('u|w') };
}

function setup({ results, failUpdate, encryptThrows } = {}) {
  const db = store({ failUpdate });
  const slack = slackFake(results);
  const crypto = { encrypted: [],
    encrypt: async data => { if (encryptThrows) throw new Error('no key'); crypto.encrypted.push(data); return Buffer.from('enc:' + data); },
    decrypt: async data => Buffer.from(data).toString().replace(/^enc:/, ''),
  };
  const lib = load('src/lib/notification-settings.ts', {
    '@/lib/prisma': { prisma: { issueNotificationSetting: db.table } },
    '@/lib/apps/crypto': crypto,
    '@/lib/notification-slack': slack.module,
  }, { Buffer, Date });
  return { lib, db, slack, crypto };
}

const plain = value => JSON.parse(JSON.stringify(value));
const OFF_VIEW = { mineAssigned: false, mineReported: false, mineFollowed: false, onStatus: false, onAssigned: false, onReactions: false,
  comments: 'off', slack: { address: null, on: false, offAt: null, failedAt: null } };

test('a person without a row has everything off, and reading writes nothing', async () => {
  const { lib, db } = setup();
  assert.deepEqual(plain(await lib.readSettings('u', 'w')), OFF_VIEW);
  assert.equal(db.writes.length, 0);
  assert.equal(db.rows.size, 0);
  assert.deepEqual(plain(lib.NO_CHOICES), { mineAssigned: false, mineReported: false, mineFollowed: false, onStatus: false, onAssigned: false, onReactions: false, comments: 'off' });
  assert.deepEqual(plain(lib.STARTING_SET), { mineAssigned: true, mineReported: true, mineFollowed: true, onStatus: true, onAssigned: true, onReactions: true, comments: 'mentions' });
});

test('choices are saved one key at a time; an unknown key, a wrong type and a wrong word are refused and change nothing', async () => {
  const { lib, db } = setup();
  const first = await lib.updateChoices('u', 'w', { onStatus: true });
  assert.equal(first.onStatus, true);
  assert.equal(first.onAssigned, false);
  const second = await lib.updateChoices('u', 'w', { comments: 'all' });
  assert.equal(second.onStatus, true);
  assert.equal(second.comments, 'all');
  const writes = db.writes.length;
  for (const bad of [{ shout: true }, { onStatus: 'yes' }, { comments: 'some' }, { onStatus: false, comments: 1 }, null, 'onStatus', [true]]) {
    assert.deepEqual(plain(await lib.updateChoices('u', 'w', bad)), { error: 'invalid' });
  }
  assert.equal(db.writes.length, writes);
  assert.equal(db.get().onStatus, true);
  assert.equal(db.get().comments, 'all');
});

test('saving an address switches Slack on, and the view shows only the mask', async () => {
  const { lib, db } = setup();
  await lib.updateChoices('u', 'w', { onStatus: true });
  db.rows.set('u|w', { ...db.get(), slackOffAt: new Date(), slackFailedAt: new Date() });
  const saved = await lib.saveSlackAddress('u', 'w', URL_OK);
  assert.equal(saved.slack.on, true);
  assert.equal(saved.slack.address, 'https://hooks.slack.com/services/T02•••/B07•••/••••••h3Qz');
  assert.equal(saved.slack.offAt, null);
  assert.equal(saved.slack.failedAt, null);
  assert.ok(!JSON.stringify(saved).includes(SECRET_TAIL));
  assert.equal(Buffer.from(db.get().slackUrlEnc).toString(), 'enc:' + URL_OK);
  assert.equal(db.get().slackOn, true);
  assert.equal(db.get().slackEverOn, true);
  assert.equal((await lib.readSettings('u', 'w')).slack.address, saved.slack.address);
});

test('saving the first address with nothing ticked ticks the starting set', async () => {
  const { lib, db } = setup();
  const saved = await lib.saveSlackAddress('u', 'w', URL_OK);
  assert.equal(saved.slack.on, true);
  assert.deepEqual({ ...plain(saved), slack: undefined }, { ...plain(lib.STARTING_SET), slack: undefined });
  assert.equal(db.get().slackEverOn, true);
});

test('saving an address keeps ticks made before', async () => {
  const { lib, db } = setup();
  await lib.updateChoices('u', 'w', { onStatus: true, comments: 'all' });
  const saved = await lib.saveSlackAddress('u', 'w', URL_OK);
  assert.equal(saved.slack.on, true);
  assert.deepEqual({ ...plain(saved), slack: undefined }, { ...plain(lib.NO_CHOICES), onStatus: true, comments: 'all', slack: undefined });
  assert.equal(db.get().slackEverOn, true);
});

test('replacing the address while Slack is off switches it on', async () => {
  const { lib, db } = setup();
  await lib.saveSlackAddress('u', 'w', URL_OK);
  await lib.updateChoices('u', 'w', { onReactions: false, comments: 'off' });
  const off = await lib.setSlackOn('u', 'w', false);
  assert.equal(off.slack.on, false);
  const replaced = await lib.saveSlackAddress('u', 'w', URL_OK.replace('h3Qz', 'k9Wp'));
  assert.equal(replaced.slack.on, true);
  assert.equal(replaced.slack.address, 'https://hooks.slack.com/services/T02•••/B07•••/••••••k9Wp');
  // Not the first switch-on: the choices made since stay as they are.
  assert.equal(replaced.onReactions, false);
  assert.equal(replaced.comments, 'off');
  assert.equal(replaced.onStatus, true);
  assert.equal(db.get().slackOn, true);
});

test("an address that is not Slack's is refused", async () => {
  const { lib, db, crypto } = setup();
  assert.deepEqual(plain(await lib.saveSlackAddress('u', 'w', 'https://example.com/x')), { error: 'not_slack' });
  for (const bad of [42, 'https://hooks.slack.com.evil.example/services/T/B/x', 'http://hooks.slack.com/services/T/B/x']) {
    assert.deepEqual(plain(await lib.saveSlackAddress('u', 'w', bad)), { error: 'not_slack' });
  }
  assert.equal(db.writes.length, 0);
  assert.equal(crypto.encrypted.length, 0);
});

test('a server without an encryption key says so', async () => {
  const { lib, db } = setup({ encryptThrows: true });
  assert.deepEqual(plain(await lib.saveSlackAddress('u', 'w', URL_OK)), { error: 'not_configured' });
  assert.equal(db.writes.length, 0);
});

test('first switch-on with nothing ticked ticks the starting set', async () => {
  const { lib, db } = setup();
  await lib.saveSlackAddress('u', 'w', URL_OK);
  db.rows.set('u|w', { ...db.get(), slackFailedAt: new Date(), slackOffAt: new Date() });
  const on = await lib.setSlackOn('u', 'w', true);
  assert.equal(on.slack.on, true);
  assert.equal(on.slack.failedAt, null);
  assert.equal(on.slack.offAt, null);
  assert.deepEqual({ ...plain(on), slack: undefined }, { ...plain(lib.STARTING_SET), slack: undefined });
  assert.equal(db.get().slackEverOn, true);
  await lib.updateChoices('u', 'w', { onReactions: false, comments: 'off' });
  const off = await lib.setSlackOn('u', 'w', false);
  assert.equal(off.slack.on, false);
  assert.deepEqual(plain(db.writes.at(-1)), ['upsert', { slackOn: false }]);
  const again = await lib.setSlackOn('u', 'w', true);
  assert.equal(again.slack.on, true);
  assert.equal(again.onReactions, false);
  assert.equal(again.comments, 'off');
});

test('first switch-on keeps ticks made while Slack was off', async () => {
  const { lib, db } = setup();
  await lib.updateChoices('u', 'w', { onStatus: true });
  await lib.saveSlackAddress('u', 'w', URL_OK);
  const on = await lib.setSlackOn('u', 'w', true);
  assert.equal(on.slack.on, true);
  assert.deepEqual({ ...plain(on), slack: undefined }, { ...plain(lib.NO_CHOICES), onStatus: true, slack: undefined });
  assert.equal(db.get().slackEverOn, true);
  const comments = setup();
  await comments.lib.updateChoices('u', 'w', { comments: 'all' });
  await comments.lib.saveSlackAddress('u', 'w', URL_OK);
  const kept = await comments.lib.setSlackOn('u', 'w', true);
  assert.equal(kept.comments, 'all');
  assert.equal(kept.mineAssigned, false);
  assert.equal(comments.db.get().slackEverOn, true);
});

test('Slack cannot be switched on without an address', async () => {
  const { lib, db } = setup();
  assert.deepEqual(plain(await lib.setSlackOn('u', 'w', true)), { error: 'no_address' });
  await lib.updateChoices('u', 'w', { onStatus: true });
  assert.deepEqual(plain(await lib.setSlackOn('u', 'w', true)), { error: 'no_address' });
  assert.equal(db.get().slackOn, false);
});

test('removing the address switches Slack off and keeps the ticks', async () => {
  const { lib, db } = setup();
  await lib.saveSlackAddress('u', 'w', URL_OK);
  await lib.setSlackOn('u', 'w', true);
  await lib.updateChoices('u', 'w', { onStatus: false });
  const removed = await lib.removeSlackAddress('u', 'w');
  assert.deepEqual(plain(removed.slack), { address: null, on: false, offAt: null, failedAt: null });
  assert.equal(removed.onStatus, false);
  assert.equal(removed.onAssigned, true);
  assert.equal(db.get().slackUrlEnc, null);
  assert.equal(db.get().slackEverOn, true);
});

test('a test message: ok clears the failure date; gone switches Slack off with a date; failed sets the failure date; none without an address', async () => {
  const { lib, db, slack } = setup({ results: ['failed', 'ok', 'gone'] });
  const none = await lib.sendSlackTest('u', 'w');
  assert.equal(none.result, 'no_address');
  assert.equal(slack.sent.length, 0);
  await lib.saveSlackAddress('u', 'w', URL_OK);
  await lib.setSlackOn('u', 'w', true);
  const failed = await lib.sendSlackTest('u', 'w');
  assert.equal(failed.result, 'failed');
  assert.deepEqual(plain(slack.sent[0]), { url: URL_OK, text: slack.module.SLACK_TEST_TEXT });
  assert.ok(failed.settings.slack.failedAt);
  assert.equal(failed.settings.slack.on, true);
  const ok = await lib.sendSlackTest('u', 'w');
  assert.equal(ok.result, 'ok');
  assert.equal(ok.settings.slack.failedAt, null);
  const gone = await lib.sendSlackTest('u', 'w');
  assert.equal(gone.result, 'gone');
  assert.equal(gone.settings.slack.on, false);
  assert.ok(gone.settings.slack.offAt);
  assert.equal(slack.sent.length, 3);
  assert.ok(!JSON.stringify([none, failed, ok, gone]).includes(SECRET_TAIL));
  assert.ok(db.get().slackUrlEnc);
});

test('markSlackResult never throws', async () => {
  const { lib, db } = setup({ failUpdate: true });
  await lib.saveSlackAddress('u', 'w', URL_OK);
  for (const result of ['ok', 'gone', 'failed']) assert.equal(await lib.markSlackResult('u', 'w', result), undefined);
  const healthy = setup();
  await healthy.lib.saveSlackAddress('u', 'w', URL_OK);
  await healthy.lib.markSlackResult('u', 'w', 'failed');
  assert.ok(healthy.db.get().slackFailedAt instanceof Date);
  await healthy.lib.markSlackResult('u', 'w', 'ok');
  assert.equal(healthy.db.get().slackFailedAt, null);
  assert.deepEqual(plain(healthy.db.writes.at(-1)), ['update', { slackFailedAt: null }]);
  await healthy.lib.markSlackResult('u', 'w', 'gone');
  assert.equal(healthy.db.get().slackOn, false);
  assert.ok(healthy.db.get().slackOffAt instanceof Date);
  // The failing store kept the row as saving left it: Slack on, no dates.
  assert.equal(db.get().slackOn, true);
  assert.equal(db.get().slackOffAt, null);
});
