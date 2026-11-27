// The Slack sender: address check, mask, one try, retries and the per-minute cap.
const { assert, load, test } = require('./helpers.cjs');

const GOOD = 'https://hooks.slack.com/services/T0/B0/abc';

function setup(answers = [200]) {
  const calls = [];
  const logs = [];
  let n = 0;
  const fetch = async (url, init) => {
    calls.push({ url, ...init });
    const a = answers[Math.min(n++, answers.length - 1)];
    if (a === 'throw') throw new Error(`boom ${url}`);
    return { status: a };
  };
  const console = { log: (...a) => logs.push(a), warn: (...a) => logs.push(a), error: (...a) => logs.push(a), info: (...a) => logs.push(a) };
  const mod = load('src/lib/notification-slack.ts', {}, { fetch, AbortController, setTimeout, clearTimeout, URL, console });
  return { mod, calls, logs };
}

function fakeClock() {
  const state = { t: 0, pending: [] };
  return { state, now: () => state.t, later: (run, ms) => state.pending.push({ run, ms }) };
}
const settle = () => new Promise((r) => setImmediate(r));

test("only Slack's own webhook host is accepted", () => {
  const { mod } = setup();
  assert.equal(mod.isSlackWebhookUrl(GOOD), true);
  for (const bad of [
    'http://hooks.slack.com/services/T0/B0/abc',
    'https://hooks.slack.com.evil.example/services/T0/B0/abc',
    'https://hooks.slack.com:8443/services/T0/B0/abc',
    'https://user@hooks.slack.com/services/T0/B0/abc',
    'https://hooks.slack.com/services/T0/B0/abc?x=1',
    'https://hooks.slack.com/services/T0/B0/abc#x',
    'https://hooks.slack.com/other/T0',
    'https://example.com/services/T0/B0/abc',
    `https://hooks.slack.com/services/${'a'.repeat(600)}`, null, 42,
  ]) assert.equal(mod.isSlackWebhookUrl(bad), false, String(bad).slice(0, 60));
});

test('the mask shows three characters of each part and the last four', () => {
  const { mod } = setup();
  assert.equal(mod.maskSlackWebhookUrl('https://hooks.slack.com/services/T024ABCDE/B07ABCDEF/x9y8z7w6v5u4h3Qz'),
    'https://hooks.slack.com/services/T02•••/B07•••/••••••h3Qz');
});

test('escape', () => {
  const { mod } = setup();
  assert.equal(mod.slackEscape('a < b & c > d'), 'a &lt; b &amp; c &gt; d');
});

test('one try maps the answer', async () => {
  for (const [status, want] of [[200, 'ok'], [404, 'gone'], [410, 'gone'], [500, 'failed'], [302, 'failed'], ['throw', 'failed']]) {
    const { mod, calls } = setup([status]);
    assert.equal(await mod.postToSlack(GOOD, 'hi'), want, String(status));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].redirect, 'manual');
    assert.equal(calls[0].method, 'POST');
    assert.equal(calls[0].headers['Content-Type'], 'application/json');
  }
  const { mod, calls } = setup();
  assert.equal(await mod.postToSlack('http://hooks.slack.com/services/T0/B0/abc', 'hi'), 'failed');
  assert.equal(calls.length, 0);
});

test('the body is the text as JSON', async () => {
  const { mod, calls } = setup();
  await mod.postToSlack(GOOD, 'hello');
  assert.deepEqual(JSON.parse(calls[0].body), { text: 'hello' });
});

test('three tries, then failed', async () => {
  const { mod, calls } = setup([500]);
  const sleeps = [];
  assert.equal(await mod.sendToSlack(GOOD, 'x', async (ms) => { sleeps.push(ms); }), 'failed');
  assert.equal(calls.length, 3);
  assert.deepEqual(sleeps, [0, 5000, 30000]);
});

test('gone stops at once', async () => {
  const { mod, calls } = setup([404]);
  assert.equal(await mod.sendToSlack(GOOD, 'x', async () => {}), 'gone');
  assert.equal(calls.length, 1);
});

test('the second try can succeed', async () => {
  const { mod, calls } = setup([500, 200]);
  assert.equal(await mod.sendToSlack(GOOD, 'x', async () => {}), 'ok');
  assert.equal(calls.length, 2);
});

test('30 a minute, then one line', async () => {
  for (const [total, line] of [[40, '10 more notifications were not sent in the last minute'], [31, '1 more notification was not sent in the last minute']]) {
    const { mod, calls } = setup([200]);
    const clock = fakeClock();
    const sleep = async () => {};
    const results = [];
    for (let i = 0; i < total; i++) results.push(await mod.sendCapped('k', GOOD, `m${i}`, clock, sleep));
    assert.equal(results.filter((r) => r === 'ok').length, 30);
    assert.equal(results.filter((r) => r === 'capped').length, total - 30);
    assert.equal(calls.length, 30);
    assert.equal(clock.state.pending.length, 1);
    assert.equal(clock.state.pending[0].ms, 60000);
    clock.state.pending[0].run();
    await settle();
    assert.equal(calls.length, 31);
    assert.deepEqual(JSON.parse(calls[30].body), { text: line });
    // A call after the window starts a new window.
    clock.state.t = 61000;
    assert.equal(await mod.sendCapped('k', GOOD, 'again', clock, sleep), 'ok');
    assert.equal(calls.length, 32);
  }
});

test('caps are per key', async () => {
  const { mod } = setup([200]);
  const clock = fakeClock();
  const sleep = async () => {};
  for (let i = 0; i < 31; i++) await mod.sendCapped('a', GOOD, 'm', clock, sleep);
  assert.equal(await mod.sendCapped('b', GOOD, 'm', clock, sleep), 'ok');
});

test('nothing logs the address', async () => {
  const { mod, logs } = setup(['throw', 500, 404]);
  await mod.postToSlack(GOOD, 'x');
  await mod.postToSlack(GOOD, 'x');
  await mod.postToSlack(GOOD, 'x');
  await mod.sendToSlack(GOOD, 'x', async () => {});
  await mod.postToSlack('https://hooks.slack.com.evil.example/services/a', 'x');
  assert.equal(JSON.stringify(logs).includes('hooks.slack.com'), false);
});

test('a fetch that never answers is aborted and fails', async () => {
  const calls = [];
  const timers = [];
  const fetch = (url, init) => new Promise((_, reject) => {
    calls.push(init);
    init.signal.addEventListener('abort', () => reject(new Error('aborted')));
  });
  const setTimeoutFake = (run, ms) => { timers.push({ run, ms }); return 1; };
  const mod = load('src/lib/notification-slack.ts', {}, { fetch, AbortController, setTimeout: setTimeoutFake, clearTimeout() {}, URL, console });
  const pending = mod.postToSlack(GOOD, 'x');
  assert.equal(calls.length, 1);
  assert.ok(calls[0].signal);
  assert.equal(timers[0].ms, 5000);
  timers[0].run();
  assert.equal(await pending, 'failed');
});

test('the response body is released', async () => {
  let cancelled = 0;
  const fetch = async () => ({ status: 200, body: { cancel: async () => { cancelled++; } } });
  const mod = load('src/lib/notification-slack.ts', {}, { fetch, AbortController, setTimeout, clearTimeout, URL, console });
  assert.equal(await mod.postToSlack(GOOD, 'x'), 'ok');
  assert.equal(cancelled, 1);
});
