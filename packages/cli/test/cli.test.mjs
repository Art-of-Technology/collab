import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { ChildProcess, spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, chmodSync, symlinkSync, statSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { windowsAcl } from '../src/windows-acl.mjs';
import { commands } from '../src/commands.mjs';
import { watchInbox } from '../src/inbox-watch.mjs';

const bin = fileURLToPath(new URL('../bin/collab.mjs', import.meta.url));
const executable = process.env.COLLAB_CLI_EXECUTABLE;
const windows = process.platform === 'win32';

test('agent registration, handoff and claim commands send scoped fixed API requests', async t => {
  const f = await fixture(t);
  assert.equal((await f.run(['agents', 'register', '--name', 'builder-a', '--label-ids', '["role-build"]', '--workspace', 'w'])).code, 0);
  assert.deepEqual(JSON.parse(f.calls.at(-1).body), { name: 'builder-a', labelIds: ['role-build'] });
  const content = '## Continue here\n\n- Verified source\n- Next: run tests';
  assert.equal((await f.run(['handoffs', 'send', '--agent', 'builder-a', '--issue', 'APP-1', '--to-agents', '["reviewer"]', '--content-file', '-', '--request-id', '12345678-1234-4234-8234-123456789012', '--workspace', 'w'], { input: content })).code, 0);
  assert.equal(JSON.parse(f.calls.at(-1).body).content, content);
  for (const action of ['seen', 'ack', 'claim', 'progress', 'release', 'complete']) {
    assert.equal((await f.run(['handoffs', action, 'handoff-one', '--agent', 'reviewer', '--content', 'Result and next step', '--workspace', 'w'])).code, 0);
    assert.equal(f.calls.at(-1).method, 'PATCH');
    assert.equal(JSON.parse(f.calls.at(-1).body).action, action);
    assert.equal(f.calls.at(-1).url, '/api/apps/auth/agents/handoffs/handoff-one?workspaceId=w');
  }
  assert.equal((await f.run(['inbox', 'list', '--agent', 'reviewer', '--state', 'claimed', '--workspace', 'w'])).code, 0);
  assert.match(f.calls.at(-1).url, /state=claimed/);
  const before = f.calls.length;
  assert.notEqual((await f.run(['handoffs', 'claim', 'handoff-one', '--input', '-'], { input: '{"agent":"reviewer","action":"complete"}' })).code, 0);
  assert.notEqual((await f.run(['handoffs', 'complete', 'handoff-one', '--agent', 'reviewer'])).code, 0);
  assert.notEqual((await f.run(['inbox', 'list', '--agent', 'reviewer', '--state', 'all'])).code, 0);
  assert.equal(f.calls.length, before);
});

test('inbox wait is bounded, returns arriving work, and never marks or claims it', async t => {
  const f = await fixture(t, (_req, res, _body, calls) => res.end(JSON.stringify({ items: calls.length < 2 ? [] : [{ id: 'new-work' }], hasMore: false })));
  const result = await f.run(['inbox', 'wait', '--agent', 'reviewer', '--wait-seconds', '3']);
  assert.equal(result.code, 0);
  assert.equal(result.data.items[0].id, 'new-work');
  assert.equal(f.calls.length, 2);
  assert.ok(f.calls.every(call => call.method === 'GET' && !call.url.includes('waitSeconds')));
  const empty = await fixture(t, (_req, res) => res.end('{"items":[],"hasMore":false}'));
  const start = Date.now();
  const expired = await empty.run(['inbox', 'wait', '--agent', 'reviewer', '--wait-seconds', '1']);
  assert.equal(expired.code, 0);
  assert.equal(expired.data.timedOut, true);
  assert.ok(Date.now() - start >= 900);
  assert.equal(empty.calls.length, 1);
});

test('agent session binding and explicit supersession send only the scoped contracts', async t => {
  const f = await fixture(t);
  const bound = await f.run(['agents', 'register', '--name', 'builder-a', '--host', 'my-pc', '--session-id', 'session-1', '--workspace', 'w']);
  assert.equal(bound.code, 0, bound.stderr);
  assert.deepEqual(JSON.parse(f.calls.at(-1).body), { name: 'builder-a', host: 'my-pc', sessionId: 'session-1' });
  const args = ['handoffs', 'supersede', 'old', '--agent', 'builder-a', '--replacement-id', 'current', '--content', 'Rerouted to current reviewer', '--workspace', 'w'];
  const replaced = await f.run(args);
  assert.equal(replaced.code, 0, replaced.stderr);
  assert.equal(f.calls.at(-1).method, 'PATCH');
  assert.equal(f.calls.at(-1).url, '/api/apps/auth/agents/handoffs/old?workspaceId=w');
  assert.deepEqual(JSON.parse(f.calls.at(-1).body), { agent: 'builder-a', replacementId: 'current', content: 'Rerouted to current reviewer', action: 'supersede' });
  const count = f.calls.length;
  assert.notEqual((await f.run(['handoffs', 'supersede', 'old', '--agent', 'builder-a', '--content', 'Reason'])).code, 0);
  assert.equal(f.calls.length, count);
});

test('watcher dry-run preserves legacy JSON and includes health only for a valid binding', async t => {
  const f = await fixture(t);
  const args = ['inbox', 'watch', '--agent', 'worker', '--workspace', 'w', '--callback', process.execPath, '--dry-run'];
  const legacy = await f.run(args);
  assert.equal(legacy.code, 0, legacy.stderr);
  const expected = { dryRun: true, callback: process.execPath, callbackArgs: [], agent: 'worker', workspaceId: 'w',
    duration: 300, interval: 5, callbackTimeout: 30 };
  assert.deepEqual(legacy.data, expected);
  const bound = await f.run([...args, '--host', 'my-pc', '--session-id', 'session-1']);
  assert.equal(bound.code, 0, bound.stderr);
  assert.deepEqual(bound.data, { ...expected, healthReporting: true, host: 'my-pc', sessionId: 'session-1' });
  assert.equal(f.calls.length, 0);
});

test('watcher rejects empty, partial and malformed bindings before dry-run or execution', async t => {
  const f = await fixture(t);
  const output = path.join(f.dir, 'callback-ran');
  const args = ['inbox', 'watch', '--agent', 'worker', '--workspace', 'w', '--callback', process.execPath,
    '--callback-args', JSON.stringify(['-e', 'require("node:fs").writeFileSync(process.argv[1], "called")', output]), '--watch-seconds', '1'];
  for (const dryRun of [[], ['--dry-run']]) for (const binding of [
    ['--host', '', '--session-id', ''], ['--host=', '--session-id='],
    ['--host', ''], ['--session-id', ''], ['--host', 'my-pc'], ['--session-id', 'session-1'],
    ['--host', '', '--session-id', 'session-1'], ['--host', 'my-pc', '--session-id', ''],
    ['--host', 'bad host', '--session-id', 'session-1'], ['--host', 'my-pc', '--session-id', 'bad session'],
  ]) {
    const result = await f.run([...args, ...binding, ...dryRun]);
    assert.notEqual(result.code, 0, JSON.stringify({ binding, dryRun }));
    assert.equal(result.error?.error, 'invalid_value');
    assert.equal(result.stdout, '');
  }
  assert.equal(f.calls.length, 0);
  assert.equal(existsSync(output), false);
});

test('watcher rejects superseded work in either queue before invoking a callback', async t => {
  for (const state of ['claimed', 'unseen']) await t.test(state, async t => {
    const f = await fixture(t, (req, res) => res.end(JSON.stringify({
      items: new URL(req.url, 'http://localhost').searchParams.get('state') === state ? [{ id: 'old-work', status: 'superseded' }] : [], hasMore: false,
    })));
    const output = path.join(f.dir, 'callback-ran');
    const result = await f.run(['inbox', 'watch', '--agent', 'worker', '--workspace', 'w', '--callback', process.execPath,
      '--callback-args', JSON.stringify(['-e', 'require("node:fs").writeFileSync(process.argv[1], "called")', output]), '--watch-seconds', '1']);
    assert.equal(result.error?.error, 'invalid_response');
    assert.equal(f.calls.length, state === 'claimed' ? 1 : 2);
    assert.equal(existsSync(output), false);
  });
});

test('bound watcher reports poll and successful callback separately, then stops without changing handoffs', async t => {
  const f = await fixture(t, (req, res) => res.end(req.method === 'POST' ? '{}' : '{"items":[{"id":"work","status":"open"}],"hasMore":false}'));
  const args = ['inbox', 'watch', '--agent', 'worker', '--workspace', 'w', '--host', 'my-pc', '--session-id', 'session-1',
    '--callback', process.execPath, '--callback-args', JSON.stringify(['-e', 'process.stdin.resume()']), '--watch-seconds', '2', '--poll-seconds', '1'];
  const result = await f.run(args);
  assert.equal(result.code, 0, result.stderr); assert.equal(result.data.healthReported, true);
  const posts = f.calls.filter(c => c.method === 'POST');
  assert.ok(posts.every(c => c.url === '/api/apps/auth/agents/heartbeat?workspaceId=w'));
  const events = posts.map(c => JSON.parse(c.body));
  assert.equal(events[0].event, 'started'); assert.equal(events.at(-1).event, 'stopped');
  assert.equal(events.filter(e => e.event === 'wake').length, 1);
  assert.ok(events.some(e => e.event === 'poll'));
  assert.equal(new Set(events.map(e => e.watcherId)).size, 1);
  assert.ok(events.every(e => e.host === 'my-pc' && e.sessionId === 'session-1' && e.agent === 'worker'));
  assert.ok(f.calls.every(c => c.method === 'GET' || c.url.includes('/heartbeat?')));
  const count = f.calls.length;
  assert.notEqual((await f.run(args.filter((v, i) => v !== '--session-id' && args[i - 1] !== '--session-id'))).code, 0);
  assert.equal(f.calls.length, count, 'invalid binding is rejected before requests');
});

test('watcher errors retain the original failure and never record a successful wake', async t => {
  const f = await fixture(t, (req, res, body) => {
    if (req.method === 'POST' && JSON.parse(body).event === 'error') { res.statusCode = 503; res.end('{}'); }
    else res.end(req.method === 'POST' ? '{}' : '{"items":[{"id":"work","status":"open"}],"hasMore":false}');
  });
  const args = ['inbox', 'watch', '--agent', 'worker', '--workspace', 'w', '--host', 'my-pc', '--session-id', 'session-1',
    '--callback', process.execPath, '--callback-args', JSON.stringify(['-e', 'process.stdin.resume();process.stdin.on("end",()=>process.exit(7))']), '--watch-seconds', '3'];
  const result = await f.run(args);
  assert.equal(result.error.error, 'wake_callback_failed');
  const events = f.calls.filter(c => c.method === 'POST').map(c => JSON.parse(c.body));
  assert.deepEqual(events.map(e => e.event), ['started', 'poll', 'error']);
  assert.equal(events.at(-1).errorCode, 'wake_callback_failed');
  const cancelled = await fixture(t, (req, res) => res.end(req.method === 'POST' ? '{}' : '{"items":[{"id":"work","status":"open"}],"hasMore":false}'));
  const expiry = await cancelled.run(['inbox', 'watch', '--agent', 'worker', '--workspace', 'w', '--host', 'my-pc', '--session-id', 'session-1',
    '--callback', process.execPath, '--callback-args', JSON.stringify(['-e', 'process.stdin.resume();setInterval(()=>{},1000)']), '--watch-seconds', '1']);
  assert.equal(expiry.code, 0, expiry.stderr); assert.equal(expiry.data.callbacks, 0);
  assert.deepEqual(cancelled.calls.filter(c => c.method === 'POST').map(c => JSON.parse(c.body).event), ['started', 'poll', 'stopped']);
  const refused = await fixture(t, (_req, res) => { res.statusCode = 409; res.end('{"error":"watcher_active"}'); });
  assert.notEqual((await refused.run(args)).code, 0);
  assert.equal(refused.calls.length, 1, 'a competing watcher stops before reading or invoking the callback');
});

test('watcher reports a bounded fallback for code-less failures and preserves the original error', async () => {
  const failure = new Error('synthetic unexpected failure');
  const events = [];
  await assert.rejects(watchInbox({
    read: async () => { throw failure; },
    report: async (event, _signal, errorCode) => { events.push({ event, errorCode }); },
    callback: process.execPath, callbackArgs: [], agent: 'worker', workspaceId: 'w', origin: 'http://localhost',
    durationMs: 1000, intervalMs: 100, callbackTimeoutMs: 100,
  }), error => error === failure);
  assert.deepEqual(events, [
    { event: 'started', errorCode: undefined },
    { event: 'error', errorCode: 'watcher_failed' },
  ]);
});

test('agent commands stop on permission or claim conflict errors without retry', async t => {
  const f = await fixture(t, (_req, res) => { res.statusCode = 409; res.end('{"error":"conflict"}'); });
  assert.notEqual((await f.run(['handoffs', 'claim', 'handoff-one', '--agent', 'reviewer'])).code, 0);
  assert.equal(f.calls.length, 1);
  const denied = await fixture(t, (_req, res) => { res.statusCode = 401; res.end('{"error":"unauthorized"}'); });
  assert.notEqual((await denied.run(['inbox', 'wait', '--agent', 'reviewer', '--wait-seconds', '2'])).code, 0);
  assert.equal(denied.calls.length, 1);
});

test('inbox wait does not turn an empty final window into a transport failure', async t => {
  const f = await fixture(t, (_req, res) => new Promise(resolve => setTimeout(() => {
    res.end('{"items":[],"hasMore":false}'); resolve();
  }, 750)));
  const result = await f.run(['inbox', 'wait', '--agent', 'reviewer', '--wait-seconds', '2']);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.data.timedOut, true);
  assert.equal(f.calls.length, 1, 'do not dispatch a second request with less than a second remaining');
});

test('inbox watch invokes a fixed adapter with bounded JSON, coalesces queues and never mutates', async t => {
  const items = ['open', 'claimed', 'completed'].map(status => ({ id: `handoff-${status}`, status }));
  const f = await fixture(t, (_req, res) => res.end(JSON.stringify({ items: items.map(item => ({ ...item, content: '$(touch SHOULD_NOT_EXIST)' })), hasMore: true })));
  const output = path.join(f.dir, 'wake events.jsonl');
  const adapter = path.join(f.dir, 'adapter with spaces.cjs');
  writeFileSync(adapter, `const fs = require('node:fs'); let input = ''; process.stdin.on('data', b => input += b); process.stdin.on('end', () => { if (Object.keys(process.env).some(key => key.toUpperCase() === 'COLLAB_TOKEN')) process.exit(7); fs.appendFileSync(process.argv[2], input); });`);
  const result = await f.run(['inbox', 'watch', '--agent', 'reviewer', '--workspace', 'w', '--callback', process.execPath,
    '--callback-args', JSON.stringify([adapter, output]), '--watch-seconds', '2', '--poll-seconds', '1'],
    { env: { COLLAB_TOKEN: windows ? undefined : 'synthetic-token', Collab_Token: 'synthetic-token', collab_token: 'synthetic-token' } });
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(result.data, { agent: 'reviewer', workspaceId: 'w', callbacks: 1, stopped: false, timedOut: true });
  const events = readFileSync(output, 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(events.length, 1);
  assert.equal(events[0].event, 'collab.inbox.pending');
  assert.equal(events[0].agent, 'reviewer');
  assert.equal(events[0].workspaceId, 'w');
  assert.equal(events[0].unseen.hasMore, true);
  assert.deepEqual(events[0].claimed.items, items);
  assert.deepEqual(events[0].unseen.items, items);
  assert.equal(JSON.stringify(events).includes('touch'), false, 'remote content is not a callback argument or payload');
  assert.ok(f.calls.length >= 4);
  assert.ok(f.calls.every(c => c.method === 'GET'));
  assert.ok(f.calls.every(c => c.headers.authorization === 'Bearer synthetic-token'));
  assert.ok(f.calls.some(c => c.url.includes('state=claimed')));
  assert.ok(f.calls.every(c => c.url.includes('workspaceId=w')));
});

test('watch stops on adapter failure, timeout or authentication refusal without writes/retries', async t => {
  const f = await fixture(t, (_req, res) => res.end('{"items":[{"id":"work","status":"open"}],"hasMore":false}'));
  const args = ['inbox', 'watch', '--agent', 'worker', '--workspace', 'w', '--callback', process.execPath, '--watch-seconds', '3'];
  const failed = await f.run([...args, '--callback-args', JSON.stringify(['-e', 'process.stdin.resume();process.stdin.on("end",()=>process.exit(7))'])]);
  assert.equal(failed.error.error, 'wake_callback_failed');
  assert.equal(f.calls.length, 2);
  const timed = await f.run([...args, '--callback-timeout', '1', '--callback-args', JSON.stringify(['-e', 'process.stdin.resume();setInterval(()=>{},1000)'])]);
  assert.equal(timed.error.error, 'wake_callback_failed');
  assert.equal(f.calls.length, 4);
  const denied = await fixture(t, (_req, res) => { res.statusCode = 401; res.end('{}'); });
  assert.notEqual((await denied.run(args)).code, 0);
  assert.equal(denied.calls.length, 1);
  const before = f.calls.length;
  assert.notEqual((await f.run(['inbox', 'watch', '--agent', 'worker', '--workspace', 'w', '--callback', 'relative-file'])).code, 0);
  assert.notEqual((await f.run([...args, '--callback-args', '[1]'])).code, 0);
  assert.equal(f.calls.length, before);
});

test('inbox watch distinguishes window expiry from API timeouts in both queues and response phases', async t => {
  for (const state of ['claimed', 'unseen']) for (const bodyStarted of [false, true]) for (const expires of [true, false]) {
    await t.test(`${state}, ${bodyStarted ? 'body' : 'headers'}, ${expires ? 'window expiry' : 'API timeout'}`, async t => {
      const f = await fixture(t, (req, res) => {
        if (new URL(req.url, 'http://localhost').searchParams.get('state') !== state) res.end('{"items":[],"hasMore":false}');
        else if (bodyStarted) res.write('{"items":');
      });
      const start = Date.now();
      const result = await f.run(['inbox', 'watch', '--agent', 'worker', '--workspace', 'w', '--callback', process.execPath,
        '--watch-seconds', expires ? '1' : '5', '--timeout', expires ? '120' : '1']);
      if (expires) {
        assert.equal(result.code, 0, result.stderr);
        assert.deepEqual(result.data, { agent: 'worker', workspaceId: 'w', callbacks: 0, stopped: false, timedOut: true });
      } else {
        assert.equal(result.code, 5, result.stderr);
        assert.equal(result.error.error, 'transport_failed');
        assert.equal(result.stdout, '');
      }
      assert.ok(Date.now() - start < 3000, 'the first deadline must stop the read');
      assert.equal(f.calls.length, state === 'claimed' ? 1 : 2);
      assert.ok(f.calls.every(call => call.method === 'GET' && call.headers.authorization === 'Bearer synthetic-token'));
      assert.equal(existsSync(path.join(f.dir, 'default.json')), false);
    });
  }
});

test('inbox watch preserves received HTTP refusals when cancellation interrupts either queue body', async t => {
  for (const state of ['claimed', 'unseen']) for (const stop of [false, ...(!windows ? [true] : [])]) {
    await t.test(`${state}, ${stop ? 'stop signal' : 'window expiry'}`, async t => {
      let child;
      const f = await fixture(t, (req, res) => {
        if (new URL(req.url, 'http://localhost').searchParams.get('state') !== state) res.end('{"items":[],"hasMore":false}');
        else {
          res.writeHead(401);
          res.write('{"error":"PRIVATE_SENTINEL"');
          if (stop) {
            const timer = setTimeout(() => child.kill('SIGTERM'), 100);
            t.after(() => clearTimeout(timer));
          }
        }
      });
      const result = await f.run(['inbox', 'watch', '--agent', 'worker', '--workspace', 'w', '--callback', process.execPath,
        '--watch-seconds', stop ? '30' : '1', '--timeout', '120'], { childCallback: value => { child = value; } });
      assert.equal(result.code, 3, result.stderr);
      assert.equal(result.error.error, 'unauthorized');
      assert.equal(result.error.status, 401);
      assert.equal(result.stdout, '');
      assert.ok(!result.stderr.includes('PRIVATE_SENTINEL'));
      assert.equal(f.calls.length, state === 'claimed' ? 1 : 2);
      assert.ok(f.calls.every(call => call.method === 'GET'));
      assert.equal(existsSync(path.join(f.dir, 'default.json')), false);
    });
  }
});

test('adapter failure wins over cancellation between natural exit and closure', async t => {
  for (const { code, exitSignal, action } of [
    { code: 7, exitSignal: null, action: 'process.exit(7)' },
    { code: null, exitSignal: 'SIGTERM', action: 'process.kill(process.pid, "SIGTERM")' },
  ]) for (const cancelAt of ['exit', 'close']) {
    await t.test(`${exitSignal || code}, ${cancelAt}`, { skip: windows && exitSignal !== null }, async t => {
      const controller = new AbortController();
      const emit = ChildProcess.prototype.emit;
      let closed = false;
      t.mock.method(ChildProcess.prototype, 'emit', function(event, ...args) {
        if (event === cancelAt) {
          assert.equal(args[0], code);
          assert.equal(args[1], exitSignal);
          controller.abort();
        }
        if (event === 'close') closed = true;
        return emit.call(this, event, ...args);
      });
      await assert.rejects(watchInbox({
        read: async () => ({ items: [{ id: 'work', status: 'open' }], hasMore: false }),
        callback: process.execPath, callbackArgs: ['-e', `process.stdin.resume();process.stdin.on("end",()=>${action})`],
        agent: 'worker', workspaceId: 'w', origin: 'http://localhost', durationMs: 10000, intervalMs: 1000,
        callbackTimeoutMs: 5000, signal: controller.signal,
      }), { code: 'wake_callback_failed' });
      assert.equal(controller.signal.aborted, true);
      assert.equal(closed, true, 'failure is returned only after the real child closes');
    });
  }
});

test('inbox watch stop signals cancel both queue reads and response bodies', { skip: windows }, async t => {
  for (const state of ['claimed', 'unseen']) for (const bodyStarted of [false, true]) for (const signal of ['SIGINT', 'SIGTERM']) {
    await t.test(`${signal}, ${state}, ${bodyStarted ? 'body' : 'headers'}`, async t => {
      let child;
      const f = await fixture(t, (req, res) => {
        if (new URL(req.url, 'http://localhost').searchParams.get('state') !== state) res.end('{"items":[],"hasMore":false}');
        else {
          if (bodyStarted) res.write('{"items":');
          const timer = setTimeout(() => child.kill(signal), 50);
          t.after(() => clearTimeout(timer));
        }
      });
      const start = Date.now();
      const result = await f.run(['inbox', 'watch', '--agent', 'worker', '--workspace', 'w', '--callback', process.execPath,
        '--watch-seconds', '30', '--timeout', '120'], { childCallback: value => { child = value; } });
      assert.equal(result.code, 0, result.stderr);
      assert.deepEqual(result.data, { agent: 'worker', workspaceId: 'w', callbacks: 0, stopped: true, timedOut: false });
      assert.ok(Date.now() - start < 3000, 'stop must not wait for the API or watch timeout');
      assert.equal(f.calls.length, state === 'claimed' ? 1 : 2);
      assert.ok(f.calls.every(call => call.method === 'GET'));
    });
  }
});

test('inbox watch window expiry closes a healthy adapter without reporting callback failure', async t => {
  const f = await fixture(t, (_req, res) => new Promise(resolve => setTimeout(() => {
    res.end('{"items":[{"id":"work","status":"open"}],"hasMore":false}'); resolve();
  }, 700)));
  const pidFile = path.join(f.dir, 'adapter.pid'), completed = path.join(f.dir, 'completed');
  const adapter = path.join(f.dir, 'adapter.cjs');
  writeFileSync(adapter, `const fs = require('node:fs'); process.stdin.resume(); process.stdin.on('end', () => { fs.writeFileSync(process.argv[2], String(process.pid)); setTimeout(() => fs.writeFileSync(process.argv[3], 'done'), 1200); });`);
  const start = Date.now();
  const result = await f.run(['inbox', 'watch', '--agent', 'worker', '--workspace', 'w', '--callback', process.execPath,
    '--callback-args', JSON.stringify([adapter, pidFile, completed]), '--watch-seconds', '2']);
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(result.data, { agent: 'worker', workspaceId: 'w', callbacks: 0, stopped: false, timedOut: true });
  assert.ok(Date.now() - start < 3500);
  const pid = Number(readFileSync(pidFile, 'utf8'));
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' }, 'direct child must be closed before watch returns');
  assert.equal(existsSync(completed), false);
  assert.equal(f.calls.length, 2);
  assert.ok(f.calls.every(call => call.method === 'GET'));
});

test('inbox watch stop signals close an active adapter before returning', { skip: windows }, async t => {
  for (const signal of ['SIGINT', 'SIGTERM']) {
    const f = await fixture(t, (_req, res) => res.end('{"items":[{"id":"work","status":"open"}],"hasMore":false}'));
    const pidFile = path.join(f.dir, 'adapter.pid'), adapter = path.join(f.dir, 'adapter.cjs');
    writeFileSync(adapter, `const fs = require('node:fs'); process.stdin.resume(); process.stdin.on('end', () => { fs.writeFileSync(process.argv[2], String(process.pid)); process.kill(process.ppid, process.argv[3]); setInterval(() => {}, 1000); });`);
    const start = Date.now();
    const result = await f.run(['inbox', 'watch', '--agent', 'worker', '--workspace', 'w', '--callback', process.execPath,
      '--callback-args', JSON.stringify([adapter, pidFile, signal]), '--watch-seconds', '30', '--callback-timeout', '120']);
    assert.equal(result.code, 0, result.stderr);
    assert.deepEqual(result.data, { agent: 'worker', workspaceId: 'w', callbacks: 0, stopped: true, timedOut: false });
    assert.ok(Date.now() - start < 3000);
    const pid = Number(readFileSync(pidFile, 'utf8'));
    assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
    assert.equal(f.calls.length, 2);
    assert.ok(f.calls.every(call => call.method === 'GET'));
  }
});

test('inbox watch expires normally while sleeping on an empty inbox', async t => {
  const f = await fixture(t, (_req, res) => res.end('{"items":[],"hasMore":false}'));
  const result = await f.run(['inbox', 'watch', '--agent', 'worker', '--workspace', 'w', '--callback', process.execPath,
    '--watch-seconds', '1', '--poll-seconds', '60']);
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(result.data, { agent: 'worker', workspaceId: 'w', callbacks: 0, stopped: false, timedOut: true });
  assert.equal(f.calls.length, 2);
  assert.ok(f.calls.every(call => call.method === 'GET'));
});

test('non-watch reads retain operational timeouts before headers and during response bodies', async t => {
  for (const bodyStarted of [false, true]) {
    const f = await fixture(t, (_req, res) => { if (bodyStarted) res.write('{"id":'); });
    const result = await f.run(['whoami', '--timeout', '1']);
    assert.equal(result.code, 5, result.stderr);
    assert.equal(result.error.error, 'transport_failed');
    assert.equal(result.stdout, '');
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].headers.authorization, 'Bearer synthetic-token');
  }
});

test('interrupted error bodies retain sanitized status and mutation semantics', async t => {
  for (const mutation of [false, true]) for (const status of [401, 500]) {
    const f = await fixture(t, (_req, res) => { res.writeHead(status); res.write('{"error":"PRIVATE_SENTINEL"'); });
    const result = await f.run([...(mutation ? ['issues', 'update', 'AGENT-1', '--status', 'done'] : ['whoami']), '--timeout', '1']);
    assert.equal(result.code, status === 401 ? 3 : 5, result.stderr);
    assert.equal(result.error.error, status === 401 ? 'unauthorized' : mutation ? 'outcome_unknown' : 'server_error');
    assert.equal(result.error.status, status);
    assert.equal(result.stdout, '');
    assert.ok(!result.stderr.includes('PRIVATE_SENTINEL'));
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].method, mutation ? 'PATCH' : 'GET');
  }
});

function grantEveryoneRead(file) {
  const script = `$ErrorActionPreference = 'Stop'; $p = [Console]::In.ReadToEnd(); $acl = Get-Acl -LiteralPath $p; $sid = New-Object System.Security.Principal.SecurityIdentifier('S-1-1-0'); $rule = New-Object System.Security.AccessControl.FileSystemAccessRule($sid, 'Read', 'Allow'); $acl.AddAccessRule($rule); Set-Acl -LiteralPath $p -AclObject $acl`;
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { input: file, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
}
function writeCredentials(file, contents) {
  if (windows && !existsSync(file)) assert.equal(windowsAcl(file, 'file'), true, 'create owned private credential fixture');
  writeFileSync(file, contents, { mode: 0o600 });
}
async function fixture(t, handler) {
  const temporary = mkdtempSync(path.join(tmpdir(), 'collab-cli-test-'));
  const dir = windows ? path.join(temporary, 'private-state') : temporary;
  if (windows) assert.equal(windowsAcl(dir, true), true, 'create private Windows fixture');
  const calls = [];
  const server = createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString('utf8');
    calls.push({ method: req.method, url: req.url, headers: req.headers, body });
    res.setHeader('content-type', 'application/json');
    if (handler) await handler(req, res, body, calls); else res.end(JSON.stringify({ ok: true }));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); rmSync(temporary, { recursive: true, force: true }); });
  function run(args, { input, env = {}, stderrCallback, childCallback } = {}) {
    const childEnv = { ...process.env };
    for (const key of Object.keys(childEnv)) if (key.toUpperCase().startsWith('COLLAB_')) delete childEnv[key];
    Object.assign(childEnv, { COLLAB_CONFIG_DIR: dir, COLLAB_URL: url, COLLAB_TOKEN: 'synthetic-token', ...env });
    for (const key of Object.keys(childEnv)) if (childEnv[key] === undefined) delete childEnv[key];
    const child = spawn(executable || process.execPath, [...(executable ? [] : [bin]), ...args], { cwd: dir, env: childEnv, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', data => { stdout += data; });
    child.stderr.on('data', data => { stderr += data; stderrCallback?.(stderr); });
    child.stdin.end(input);
    const timer = setTimeout(() => child.kill('SIGKILL'), windows ? 30000 : 10000);
    childCallback?.(child);
    return once(child, 'close').then(([code, signal]) => {
      clearTimeout(timer);
      const diagnostics = stderr.split('\n').filter(line => line.startsWith('{')).map(line => JSON.parse(line));
      return { code, signal, stdout, stderr, diagnostics, data: stdout ? JSON.parse(stdout) : undefined, error: diagnostics.find(record => record.error) };
    });
  }
  return { run, dir, calls, url };
}

test('update is listed, takes no arguments, and refuses to run the installer outside the native executable', { skip: Boolean(executable) }, async t => {
  const f = await fixture(t);
  assert.ok((await f.run(['help'])).data.localCommands.includes('update'));
  const refused = await f.run(['update']);
  assert.equal(refused.code, 2); assert.equal(refused.error.error, 'unsupported_update');
  const extra = await f.run(['update', 'now']);
  assert.equal(extra.error.error, 'unexpected_arguments');
  assert.equal(f.calls.length, 0);
});

test('schema is offline, machine-readable and includes projects, issues and Notes', async t => {
  const f = await fixture(t);
  const result = await f.run(['schema']);
  assert.equal(result.data.version, JSON.parse(readFileSync(new URL('../package.json', import.meta.url))).version);
  assert.equal(result.code, 0); assert.ok(result.data.commands['notes update']); assert.ok(result.data.commands['projects create']); assert.ok(result.data.commands['issues create']);
  assert.equal(f.calls.length, 0); assert.equal(Object.keys(result.data.commands).length, Object.keys(commands).length);
});

test('working-directory runtime configuration cannot inject credentials or preload code', async t => {
  const f = await fixture(t);
  writeFileSync(path.join(f.dir, '.env'), 'COLLAB_TOKEN=unexpected-dotenv-token\n');
  writeFileSync(path.join(f.dir, 'bunfig.toml'), 'preload = ["./preload.js"]\n');
  writeFileSync(path.join(f.dir, 'preload.js'), 'throw new Error("unexpected preload")');
  const result = await f.run(['auth', 'status'], { env: { COLLAB_TOKEN: undefined } });
  assert.equal(result.code, 0);
  assert.equal(result.data.environmentTokenPresent, false);
  assert.equal(f.calls.length, 0);
});

test('actual entrypoint scopes filters to explicit workspace and project', async t => {
  const f = await fixture(t);
  assert.equal((await f.run(['issues', 'list', '--workspace', 'workspace-one', '--project', 'project-one', '--status', 'todo', '--limit', '25'])).code, 0);
  const call = f.calls[0], url = new URL(call.url, f.url);
  assert.equal(url.pathname, '/api/apps/auth/issues'); assert.equal(url.searchParams.get('workspaceId'), 'workspace-one'); assert.equal(url.searchParams.get('projectId'), 'project-one'); assert.equal(url.searchParams.get('status'), 'todo');
  assert.equal(call.headers.authorization, 'Bearer synthetic-token');
});

test('search sends every supported mode and filter, preserves fallback JSON, and exposes bounds offline', async t => {
  const response = { requestedMode: 'hybrid', mode: 'keyword', results: [{ id: 'issue-one', matchType: 'exact' }],
    pagination: { nextOffset: null, hasMore: false }, metadata: { fallback: { from: 'hybrid', to: 'keyword', reason: 'not_configured' } } };
  const f = await fixture(t, (_req, res) => res.end(JSON.stringify(response)));
  for (const mode of ['exact', 'keyword', 'semantic', 'hybrid', 'fuzzy']) {
    const result = await f.run(['search', '--query', 'APP-42 or login failure', '--mode', mode, '--workspace', 'w', '--project', 'p',
      '--type', 'issue', '--status', 'todo', '--assignee-id', 'user-one', '--after', '2026-01-01T00:00:00Z', '--before', '2026-02-01T00:00:00Z',
      '--limit', '5', '--offset', '2', '--max-tokens', '4000']);
    assert.equal(result.code, 0); assert.deepEqual(result.data, response);
    const url = new URL(f.calls.at(-1).url, f.url);
    assert.equal(f.calls.at(-1).method, 'GET'); assert.equal(url.pathname, '/api/apps/auth/search');
    assert.deepEqual(Object.fromEntries(url.searchParams), { workspaceId: 'w', query: 'APP-42 or login failure', mode, projectId: 'p', type: 'issue',
      status: 'todo', assigneeId: 'user-one', after: '2026-01-01T00:00:00Z', before: '2026-02-01T00:00:00Z', limit: '5', offset: '2', maxTokens: '4000' });
  }
  await f.run(['search', '--query', 'login']);
  const defaults = new URL(f.calls.at(-1).url, f.url).searchParams;
  assert.equal(defaults.get('mode'), 'hybrid'); assert.equal(defaults.get('maxTokens'), '8000');
  const schema = await f.run(['schema']);
  assert.deepEqual(schema.data.commands.search.requiredQuery, ['query']);
  assert.deepEqual(schema.data.commands.search.constraints.mode.enum, ['exact', 'keyword', 'semantic', 'hybrid', 'fuzzy']);
  assert.equal(schema.data.commands.search.constraints.limit.maximum, 50);
  for (const args of [['schema'], ['--help']]) {
    const { data } = await f.run(args);
    assert.equal(data.commands.search.defaultDescriptions.type, 'all (server default)');
    const context = data.commands['context get'];
    assert.deepEqual(context.defaults, { maxTokens: 8000 });
    assert.deepEqual(context.defaultDescriptions, {
      includePipeline: 'true with projectId unless includeKnowledge=true; false otherwise (CLI default)',
      limit: '10 (server default; includePipeline=true only)',
      offset: '0 (server default; includePipeline=true only)',
      since: '7 days before the server request time (server default; includePipeline=true only)',
    });
  }
});

test('context selects bounded project pipeline by default and keeps explicit legacy prompt requests', async t => {
  const f = await fixture(t);
  for (const [args, pipeline] of [
    [['context', 'get', '--project', 'p', '--limit', '4', '--offset', '2', '--since', '2026-01-01T00:00:00Z'], 'true'],
    [['context', 'get', '--project', 'p'], 'true'],
    [['context', 'get', '--project', 'p', '--include-pipeline', 'false'], 'false'],
    [['context', 'get', '--project', 'p', '--include-knowledge', 'true'], 'false'],
    [['context', 'get'], 'false'],
  ]) {
    assert.equal((await f.run(args)).code, 0);
    const query = new URL(f.calls.at(-1).url, f.url).searchParams;
    assert.equal(query.get('includePipeline'), pipeline); assert.equal(query.get('maxTokens'), '8000');
    for (const field of ['limit', 'offset', 'since']) {
      assert.equal(query.get(field), args.includes(`--${field}`) ? args[args.indexOf(`--${field}`) + 1] : null);
    }
  }
});

test('invalid retrieval bounds and modes fail before HTTP dispatch', async t => {
  const f = await fixture(t);
  for (const args of [
    ['search'], ['search', '--query', ' '], ['search', '--query', 'x'.repeat(501)], ['search', '--query', 'x', '--mode', 'vectorish'],
    ['search', '--query', 'x', '--type', 'secret'], ['search', '--query', 'x', '--limit', '51'], ['search', '--query', 'x', '--offset', '50001'],
    ['search', '--query', 'x', '--max-tokens', '1000'], ['search', '--query', 'x', '--max-tokens', '64001'],
    ['search', '--query', 'x', '--after', 'yesterday'], ['search', '--query', 'x', '--after', '2026-02-01T00:00:00Z', '--before', '2026-01-01T00:00:00Z'],
    ['search', '--query', 'x', '--all'], ['context', 'get', '--include-pipeline', 'true'], ['context', 'get', '--limit', '5'],
    ['context', 'get', '--project', 'p', '--include-pipeline', 'true', '--include-knowledge', 'true'],
    ['context', 'get', '--project', 'p', '--max-tokens', '1024'],
  ]) assert.notEqual((await f.run(args)).code, 0, args.join(' '));
  assert.equal(f.calls.length, 0);
});

test('retrieval identifiers and every date filter reject invalid inputs without HTTP', async t => {
  const f = await fixture(t);
  for (const command of [['search', '--query', 'release'], ['context', 'get']]) {
    for (const flag of ['--project', '--project-id', ...(command[0] === 'search' ? ['--status', '--assignee-id'] : [])]) {
      for (const value of ['', '   ', 'x'.repeat(129)]) {
        const result = await f.run([...command, flag, value]);
        assert.notEqual(result.code, 0, `${command[0]} ${flag}: ${value}`);
        assert.ok(['invalid_value', 'invalid_identifier'].includes(result.error.error));
      }
    }
    for (const project of ['   ', 'x'.repeat(129)]) {
      const result = await f.run(command, { env: { COLLAB_PROJECT: project } });
      assert.equal(result.error.error, 'invalid_value');
      writeCredentials(path.join(f.dir, 'default.json'), JSON.stringify({ origin: f.url, accessToken: 'synthetic-token', project }));
      assert.equal((await f.run(command, { env: { COLLAB_TOKEN: '' } })).error.error, 'invalid_value');
    }
  }
  for (const [command, flag] of [
    [['search', '--query', 'release'], '--after'],
    [['search', '--query', 'release'], '--before'],
    [['context', 'get', '--project', 'p'], '--since'],
  ]) {
    for (const value of ['2026-02-30T00:00:00Z', '2025-02-29T00:00:00Z', '1900-02-29T00:00:00Z',
      '2026-04-31T00:00:00+01:00', '2026-01-01T24:00:00Z', '2026-01-01T00:60:00Z', '2026-01-01T00:00:60Z']) {
      assert.equal((await f.run([...command, flag, value])).error.error, 'invalid_value', `${flag}: ${value}`);
    }
  }
  for (const flag of ['--status', '--assignee-id']) {
    assert.equal((await f.run(['search', '--query', 'release', '--type', 'note', flag, 'todo'])).error.error, 'invalid_value');
  }
  assert.equal(f.calls.length, 0);
});

test('retrieval trims text bounds and accepts valid calendar dates and sibling content types', async t => {
  const f = await fixture(t);
  for (const type of ['all', 'issue', 'activity', 'note']) {
    const args = ['search', '--query', ` ${'x'.repeat(500)} `, '--project-id', ` ${'p'.repeat(128)} `, '--type', type];
    if (type !== 'note') args.push('--status', ` ${'s'.repeat(128)} `, '--assignee-id', ` ${'a'.repeat(128)} `);
    assert.equal((await f.run(args)).code, 0);
    const query = new URL(f.calls.at(-1).url, f.url).searchParams;
    assert.equal(query.get('query'), 'x'.repeat(500));
    assert.equal(query.get('projectId'), 'p'.repeat(128));
    assert.equal(query.get('status'), type === 'note' ? null : 's'.repeat(128));
    assert.equal(query.get('assigneeId'), type === 'note' ? null : 'a'.repeat(128));
  }
  for (const value of ['2000-02-29T23:59:59Z', '2024-02-29T00:00:00.123456+01:00', '2026-01-01T23:00:00-02:00']) {
    for (const [command, flag, field] of [
      [['search', '--query', 'release'], '--after', 'after'],
      [['search', '--query', 'release'], '--before', 'before'],
      [['context', 'get', '--project', ' p '], '--since', 'since'],
    ]) {
      assert.equal((await f.run([...command, flag, value])).code, 0);
      assert.equal(new URL(f.calls.at(-1).url, f.url).searchParams.get(field), value);
    }
  }
  assert.equal((await f.run(['search', '--query', 'release', '--after', '2026-01-01T01:00:00+01:00', '--before', '2026-01-01T00:00:00Z'])).code, 0);
});

test('retrieval errors retain safe machine codes without echoing provider or record details', async t => {
  for (const [code, status] of [['semantic_unavailable', 503], ['scope_too_large', 422], ['budget_too_small', 422]]) {
    const f = await fixture(t, (_req, res) => { res.writeHead(status); res.end(JSON.stringify({ error: code, error_description: 'PRIVATE_SENTINEL' })); });
    const result = await f.run(['search', '--query', 'x', '--mode', 'semantic']);
    assert.equal(result.code, 5); assert.equal(result.error.error, code); assert.equal(result.error.status, status);
    assert.ok(!result.stderr.includes('PRIVATE_SENTINEL')); assert.equal(f.calls.length, 1);
  }
});

test('switching workspace cannot carry a saved project from another workspace', async t => {
  const f = await fixture(t);
  writeCredentials(path.join(f.dir, 'default.json'), JSON.stringify({ origin: f.url, accessToken: 'synthetic-token', expiresAt: Date.now() + 60000, workspace: 'old-space', project: 'old-project' }));
  const result = await f.run(['issues', 'list', '--workspace', 'new-space'], { env: { COLLAB_TOKEN: '' } });
  assert.equal(result.code, 0);
  const url = new URL(f.calls[0].url, f.url);
  assert.equal(url.searchParams.get('workspaceId'), 'new-space'); assert.equal(url.searchParams.has('projectId'), false);
});

test('project creation, issue updates and comments preserve exact supplied payloads', async t => {
  const f = await fixture(t);
  for (const [args, expectedPath, method, expectedBody] of [
    [['projects', 'create', '--name', 'Agent Project', '--slug', 'agent-project', '--issue-prefix', 'AGENT'], '/projects', 'POST', { name: 'Agent Project', slug: 'agent-project', issuePrefix: 'AGENT' }],
    [['issues', 'create', '--project', 'project-one', '--title', 'Investigate race', '--type', 'BUG'], '/issues', 'POST', { projectId: 'project-one', title: 'Investigate race', type: 'BUG' }],
    [['issues', 'update', 'AGENT-12', '--input', '-'], '/issues/AGENT-12', 'PATCH', { status: 'in_progress', assigneeId: null, labels: ['label-one'] }],
    [['comments', 'add', 'AGENT-12', '--content-file', '-'], '/issues/AGENT-12/comments', 'POST', { content: 'Evidence\n- tests passed\n' }],
  ]) {
    const input = args.includes('--input') ? JSON.stringify(expectedBody) : 'Evidence\n- tests passed\n';
    assert.equal((await f.run(args, { input })).code, 0);
    const call = f.calls.at(-1); assert.equal(call.url, `/api/apps/auth${expectedPath}`); assert.equal(call.method, method); assert.deepEqual(JSON.parse(call.body), expectedBody);
  }
});

test('Notes create uses project scope; updates do not silently move Notes', async t => {
  const f = await fixture(t);
  assert.equal((await f.run(['notes', 'create', '--title', 'Decision', '--content-file', '-', '--project', 'project-one', '--type', 'DECISION', '--is-ai-context', 'true'], { input: '# Decision\nUse Collab.\n' })).code, 0);
  assert.deepEqual(JSON.parse(f.calls[0].body), { title: 'Decision', content: '# Decision\nUse Collab.\n', type: 'DECISION', isAiContext: true, projectId: 'project-one', scope: 'PROJECT' });
  assert.equal((await f.run(['notes', 'update', 'note-one', '--project', 'project-other', '--content-file', '-'], { input: 'Updated' })).code, 0);
  assert.equal(f.calls[1].method, 'PUT'); assert.deepEqual(JSON.parse(f.calls[1].body), { content: 'Updated' });
});

test('issue page and Note offset pagination return all pages without partial output', async t => {
  const f = await fixture(t, (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.endsWith('issues')) { const page = Number(url.searchParams.get('page') || 1); res.end(JSON.stringify({ issues: [{ id: `issue-${page}` }], pagination: { page, pages: 2 } })); }
    else { const offset = Number(url.searchParams.get('offset') || 0); res.end(JSON.stringify({ context: [{ id: `note-${offset}` }], hasMore: offset === 0 })); }
  });
  const issues = await f.run(['issues', 'list', '--all']); assert.equal(issues.code, 0); assert.deepEqual(issues.data.issues.map(x => x.id), ['issue-1', 'issue-2']);
  const notes = await f.run(['notes', 'list', '--all']); assert.equal(notes.code, 0); assert.deepEqual(notes.data.context.map(x => x.id), ['note-0', 'note-1']); assert.equal(notes.data.snapshot, false);
});

test('invalid input, unsupported flags, empty identifiers and destructive omissions dispatch nothing', async t => {
  const f = await fixture(t);
  for (const args of [
    ['issues', 'delete', 'AGENT-1'], ['issues', 'update', 'AGENT-1'], ['issues', 'get', '../secret'],
    ['issues', 'list', '--limit', '0'], ['issues', 'list', '--limit', 'NaN'], ['issues', 'list', '--workspace', ''],
    ['projects', 'create', '--naem', 'typo'], ['notes', 'update', 'note-one', '--input', '-'],
    ['issues', 'list', '--workspace', 'a', '--workspace', 'b'], ['whoami', '--all'],
    ['auth', 'login', '--client-id', 'collab-mcp'],
    ['notes', 'create', '--title', 'Secret', '--content', 'secret', '--type', 'CREDENTIALS'],
    ['notes', 'create', '--title', 'Personal', '--content', 'text', '--scope', 'PERSONAL'],
  ]) assert.notEqual((await f.run(args, { input: '{"authorId":"someone-else"}' })).code, 0, args.join(' '));
  assert.equal(f.calls.length, 0);
});

test('other delete commands remain explicit and their dry-run never sends a request', async t => {
  const f = await fixture(t);
  const result = await f.run(['relations', 'delete', 'AGENT-1', 'relation-one', '--yes', '--dry-run']);
  assert.equal(result.code, 0); assert.equal(result.data.method, 'DELETE'); assert.equal(f.calls.length, 0);
  assert.equal((await f.run(['relations', 'delete', 'AGENT-1', 'relation-one', '--yes'])).code, 0); assert.equal(f.calls[0].method, 'DELETE');
});

const issueDeletePreview = {
  id: 'issue-one', issueKey: 'HP-1', title: 'Keep the discussion', projectId: 'project-one',
  counts: { issues: 1, comments: 16, relations: 2, workLogs: 3 },
};

test('issue trash operations require project scope and refuse bulk, filters and purge before dispatch', async t => {
  const f = await fixture(t);
  for (const args of [
    ['issues', 'delete', 'HP-1', '--yes'],
    ['issues', 'delete', 'HP-1', '--dry-run'],
    ['issues', 'trash'], ['issues', 'restore', 'HP-1'],
    ['issues', 'delete', 'HP-1', '--project', 'project-one'],
    ['issues', 'delete', '--yes', '--project', 'project-one'],
    ['issues', 'delete', 'HP-1', 'HP-2', '--yes', '--project', 'project-one'],
    ['issues', 'delete', 'HP-1', '--yes', '--project', 'project-one', '--all'],
    ['issues', 'delete', 'HP-1', '--yes', '--project', 'project-one', '--search', 'old'],
    ['issues', 'delete', 'HP-1', '--yes', '--project', 'project-one', '--filter', 'old'],
    ['issues', 'delete', 'HP-1', '--yes', '--project', 'project-one', '--project-id', 'project-two'],
    ['issues', 'restore', 'HP-1', 'HP-2', '--project', 'project-one'],
    ['issues', 'restore', 'HP-1', '--project', 'project-one', '--all'],
    ['issues', 'purge', 'HP-1', '--yes', '--project', 'project-one'],
    ['issues', 'delete', 'HP-1', '--yes', '--project', 'project-one', '--purge'],
  ]) assert.notEqual((await f.run(args)).code, 0, args.join(' '));
  assert.equal(f.calls.length, 0);
});

test('issue deletion dry-run reads the exact preview without yes and never mutates', async t => {
  const f = await fixture(t, (_req, res) => res.end(JSON.stringify(issueDeletePreview)));
  const result = await f.run(['issues', 'delete', 'HP-1', '--workspace', 'workspace-one', '--project', 'project-one', '--dry-run']);
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(result.data.preview, issueDeletePreview);
  assert.equal(result.data.dryRun, true);
  assert.equal(result.data.method, 'DELETE');
  assert.equal(result.data.url, `${f.url}/api/apps/auth/issues/issue-one?workspaceId=workspace-one&projectId=project-one`);
  assert.deepEqual(f.calls.map(({ method, url }) => ({ method, url })), [
    { method: 'GET', url: '/api/apps/auth/issues/HP-1/delete-preview?workspaceId=workspace-one&projectId=project-one' },
  ]);
  assert.equal(result.stderr, '');
});

test('issue deletion previews first, binds the resolved ID and displays identity and counts', async t => {
  const f = await fixture(t, (req, res) => res.end(JSON.stringify(req.method === 'GET' ? issueDeletePreview : { trashed: true, id: 'issue-one' })));
  const result = await f.run(['issues', 'delete', 'HP-1', '--workspace', 'workspace-one', '--project-id', 'project-one', '--yes']);
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(result.diagnostics, [{ deletePreview: issueDeletePreview }]);
  assert.deepEqual(result.data, { trashed: true, id: 'issue-one' });
  assert.deepEqual(f.calls.map(({ method, url }) => ({ method, url })), [
    { method: 'GET', url: '/api/apps/auth/issues/HP-1/delete-preview?workspaceId=workspace-one&projectId=project-one' },
    { method: 'DELETE', url: '/api/apps/auth/issues/issue-one?workspaceId=workspace-one&projectId=project-one' },
  ]);
  assert.ok(f.calls.every(call => call.body === ''));
});

test('issue deletion accepts verified profile project context', async t => {
  const f = await fixture(t, (_req, res) => res.end(JSON.stringify(issueDeletePreview)));
  writeCredentials(path.join(f.dir, 'default.json'), JSON.stringify({ origin: f.url, accessToken: 'synthetic-profile-token', expiresAt: Date.now() + 60000, workspace: 'workspace-one', project: 'project-one' }));
  const result = await f.run(['issues', 'delete', 'issue-one', '--dry-run'], { env: { COLLAB_TOKEN: undefined } });
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(result.data.preview, issueDeletePreview);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].url, '/api/apps/auth/issues/issue-one/delete-preview?workspaceId=workspace-one&projectId=project-one');
  assert.equal(f.calls[0].headers.authorization, 'Bearer synthetic-profile-token');
});

test('issue deletion refuses mismatched scope, identity and malformed previews without mutation', async t => {
  for (const preview of [
    { ...issueDeletePreview, projectId: 'project-two' },
    { ...issueDeletePreview, id: 'issue-two', issueKey: 'HP-2' },
    { ...issueDeletePreview, title: null },
    { ...issueDeletePreview, counts: { ...issueDeletePreview.counts, issues: 2 } },
    { ...issueDeletePreview, counts: { ...issueDeletePreview.counts, comments: -1 } },
    { ...issueDeletePreview, counts: { issues: 1 } },
  ]) {
    const f = await fixture(t, (_req, res) => res.end(JSON.stringify(preview)));
    const result = await f.run(['issues', 'delete', 'HP-1', '--project', 'project-one', '--yes']);
    assert.notEqual(result.code, 0);
    assert.equal(result.error.error, 'invalid_preview');
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].method, 'GET');
    assert.equal(result.diagnostics.length, 1);
  }
});

test('issue deletion stops on denied preview and does not retry uncertain mutation', async t => {
  const denied = await fixture(t, (_req, res) => { res.statusCode = 404; res.end(JSON.stringify({ error: 'not_found' })); });
  const refused = await denied.run(['issues', 'delete', 'HP-1', '--project', 'project-one', '--yes']);
  assert.equal(refused.error.error, 'not_found');
  assert.deepEqual(denied.calls.map(call => call.method), ['GET']);
  const failed = await fixture(t, (req, res) => {
    if (req.method === 'GET') res.end(JSON.stringify(issueDeletePreview));
    else { res.statusCode = 500; res.end(JSON.stringify({ error: 'server_error' })); }
  });
  const unknown = await failed.run(['issues', 'delete', 'HP-1', '--project', 'project-one', '--yes']);
  assert.equal(unknown.error.error, 'outcome_unknown');
  assert.deepEqual(unknown.diagnostics[0], { deletePreview: issueDeletePreview });
  assert.deepEqual(failed.calls.map(call => call.method), ['GET', 'DELETE']);
});

test('issue trash and restore commands use required project scope and expose no purge', async t => {
  const f = await fixture(t);
  const schema = (await f.run(['schema'])).data;
  for (const name of ['issues delete', 'issues trash', 'issues restore']) assert.deepEqual(schema.commands[name].requiredQuery, ['projectId']);
  assert.equal(schema.commands['issues trash'].method, 'GET');
  assert.equal(schema.commands['issues restore'].method, 'POST');
  assert.equal(schema.commands['issues purge'], undefined);
  assert.equal((await f.run(['issues', 'trash', '--workspace', 'workspace-one', '--project', 'project-one'])).code, 0);
  assert.equal((await f.run(['issues', 'restore', 'HP-1', '--workspace', 'workspace-one', '--project-id', 'project-one'])).code, 0);
  assert.deepEqual(f.calls.map(({ method, url }) => ({ method, url })), [
    { method: 'GET', url: '/api/apps/auth/issues/trash?workspaceId=workspace-one&projectId=project-one' },
    { method: 'POST', url: '/api/apps/auth/issues/HP-1/restore?workspaceId=workspace-one&projectId=project-one' },
  ]);
});

test('authorization failures are preserved, redacted, and never retried', async t => {
  for (const status of [401, 403, 409, 429, 500]) {
    const f = await fixture(t, (_req, res) => { res.writeHead(status); res.end(JSON.stringify({ error: 'PRIVATE_SENTINEL', error_description: 'password=PRIVATE_SENTINEL' })); });
    const result = await f.run(['issues', 'create', '--project', 'project-one', '--title', 'Test']);
    assert.notEqual(result.code, 0); assert.equal(result.stdout, ''); assert.ok(!result.stderr.includes('PRIVATE_SENTINEL')); assert.equal(f.calls.length, 1);
    if (status === 500) assert.equal(result.error.error, 'outcome_unknown');
  }
});

test('HTML and empty success bodies are not accepted as successful writes', async t => {
  for (const body of ['<html>PRIVATE_SENTINEL</html>', '']) {
    const f = await fixture(t, (_req, res) => { res.setHeader('content-type', 'text/html'); res.end(body); });
    const result = await f.run(['notes', 'create', '--title', 'Test', '--content', 'Body']);
    assert.equal(result.error.error, 'outcome_unknown'); assert.ok(!result.stderr.includes('PRIVATE_SENTINEL')); assert.equal(f.calls.length, 1);
  }
});

test('redirects never forward bearer credentials', async t => {
  const target = await fixture(t);
  const source = await fixture(t, (_req, res) => { res.writeHead(302, { location: `${target.url}/capture` }); res.end(); });
  assert.notEqual((await source.run(['whoami'])).code, 0); assert.equal(target.calls.length, 0);
});

test('credential files are private, origins are bound, and tokens never appear in status', async t => {
  const f = await fixture(t), file = path.join(f.dir, 'default.json');
  writeCredentials(file, JSON.stringify({ origin: 'https://collab.example', accessToken: 'PRIVATE_TOKEN', refreshToken: 'PRIVATE_REFRESH', expiresAt: Date.now() + 60000 }));
  const env = { COLLAB_TOKEN: '' };
  assert.equal((await f.run(['whoami'], { env })).error.error, 'origin_mismatch');
  const status = await f.run(['auth', 'status'], { env }); assert.equal(status.code, 0); assert.ok(!status.stdout.includes('PRIVATE_'));
  if (windows) grantEveryoneRead(file); else chmodSync(file, 0o644);
  assert.equal((await f.run(['whoami'], { env })).error.error, 'unsafe_credentials'); assert.equal(f.calls.length, 0);
  rmSync(file);
  if (windows) symlinkSync(f.dir, file, 'junction'); else symlinkSync('/nonexistent', file);
  assert.notEqual((await f.run(['whoami'], { env })).code, 0); assert.equal(f.calls.length, 0);
});

test('headless token requires an explicit origin and rejects non-loopback HTTP', async t => {
  const f = await fixture(t);
  assert.equal((await f.run(['whoami'], { env: { COLLAB_URL: '' } })).error.error, 'token_origin_required');
  assert.equal((await f.run(['whoami', '--url', 'http://example.com'])).error.error, 'invalid_origin');
  assert.equal(f.calls.length, 0);
});

test('Windows credential creation sets the user owner and refuses existing files', { skip: !windows }, async t => {
  const f = await fixture(t);
  const file = path.join(f.dir, 'default.json');
  const contents = JSON.stringify({ origin: f.url, accessToken: 'PRIVATE_SYNTHETIC', expiresAt: Date.now() + 60000 });
  writeFileSync(file, contents);
  const script = `$ErrorActionPreference = 'Stop'; $acl = Get-Acl -LiteralPath ([Console]::In.ReadToEnd()); @{ user = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value; owner = $acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value; sddl = $acl.Sddl } | ConvertTo-Json -Compress`;
  const inspected = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { input: file, encoding: 'utf8' });
  assert.equal(inspected.status, 0, inspected.stderr);
  const acl = JSON.parse(inspected.stdout);
  t.diagnostic(`Node default credential ownership: ${JSON.stringify(acl)}`);
  assert.equal(windowsAcl(file), acl.owner === acl.user, 'inherited private ACL does not override the owner requirement');
  if (acl.owner !== acl.user) {
    assert.equal((await f.run(['whoami'], { env: { COLLAB_TOKEN: '' } })).error.error, 'unsafe_credentials');
    assert.equal(f.calls.length, 0);
  }
  assert.equal(windowsAcl(file, 'file'), false, 'creation must not repair or replace an existing file');
  assert.equal(readFileSync(file, 'utf8'), contents);
  rmSync(file);
  assert.equal(windowsAcl(file, 'file'), true);
  assert.equal(windowsAcl(file), true);
  assert.equal(readFileSync(file, 'utf8'), '');
  writeFileSync(file, contents);
  assert.equal((await f.run(['whoami'], { env: { COLLAB_TOKEN: '' } })).code, 0);
  grantEveryoneRead(file);
  assert.equal(windowsAcl(file, 'file'), false);
  assert.equal(windowsAcl(file), false, 'creation never repairs an unsafe existing ACL');
  assert.equal(readFileSync(file, 'utf8'), contents);
});

test('unsafe Windows directory ACLs and junctions refuse credentials before dispatch', { skip: !windows }, async t => {
  const f = await fixture(t);
  const file = path.join(f.dir, 'default.json');
  const state = JSON.stringify({ origin: f.url, accessToken: 'PRIVATE_TOKEN', expiresAt: Date.now() + 60000 });
  writeCredentials(file, state);
  const junction = path.join(path.dirname(f.dir), 'linked-state');
  symlinkSync(f.dir, junction, 'junction');
  assert.equal((await f.run(['whoami'], { env: { COLLAB_TOKEN: '', COLLAB_CONFIG_DIR: junction } })).error.error, 'unsafe_credentials');
  grantEveryoneRead(f.dir);
  assert.equal((await f.run(['whoami'], { env: { COLLAB_TOKEN: '' } })).error.error, 'unsafe_credentials');
  assert.equal(readFileSync(file, 'utf8'), state);
  assert.equal(f.calls.length, 0);
});

test('explicit refresh verifies identity before saving and sends no refresh token to stdout', async t => {
  const f = await fixture(t, (req, res, body) => {
    if (req.url === '/api/oauth/mcp/token') {
      const form = new URLSearchParams(body);
      assert.equal(form.get('grant_type'), 'refresh_token'); assert.equal(form.get('refresh_token'), 'PRIVATE_REFRESH');
      res.end(JSON.stringify({ access_token: 'PRIVATE_ROTATED', token_type: 'Bearer', expires_in: 3600, workspace_id: 'workspace-one', scope: 'issues:read' }));
    } else res.end(JSON.stringify({ id: 'same-user', workspace: { id: 'workspace-one' } }));
  });
  const file = path.join(f.dir, 'default.json');
  writeCredentials(file, JSON.stringify({ origin: f.url, clientId: 'collab-cli', accessToken: 'expired', refreshToken: 'PRIVATE_REFRESH', expiresAt: 0, workspace: 'workspace-one', tokenWorkspace: 'workspace-one', userId: 'same-user' }));
  assert.equal((await f.run(['whoami'], { env: { COLLAB_TOKEN: '' } })).error.error, 'token_expired');
  const result = await f.run(['auth', 'refresh'], { env: { COLLAB_TOKEN: '' } });
  assert.equal(result.code, 0); assert.ok(!result.stdout.includes('PRIVATE_')); assert.equal(f.calls.length, 2);
  assert.equal(JSON.parse(readFileSync(file)).accessToken, 'PRIVATE_ROTATED');
});

test('read-only login requests no write scopes and denial stores no credentials', async t => {
  const f = await fixture(t); let callback;
  const result = await f.run(['auth', 'login', '--read-only'], { env: { COLLAB_TOKEN: '' }, stderrCallback: output => {
    if (callback) return;
    const match = output.match(/http:\/\/127\.0\.0\.1:\d+\/auth\/mcp\?[^\s]+/); if (!match) return;
    const authorization = new URL(match[0]);
    assert.ok(authorization.searchParams.get('scope').split(' ').every(scope => scope.endsWith(':read')));
    assert.ok(!authorization.searchParams.get('scope').split(' ').includes('comments:read'));
    assert.equal(authorization.searchParams.get('client_id'), 'collab-cli');
    const redirect = new URL(authorization.searchParams.get('redirect_uri'));
    redirect.search = new URLSearchParams({ error: 'access_denied', state: authorization.searchParams.get('state') });
    callback = fetch(redirect);
  } });
  await callback;
  assert.equal(result.code, 3); assert.equal(f.calls.length, 0); assert.throws(() => readFileSync(path.join(f.dir, 'default.json')), { code: 'ENOENT' });
});

test('timed-out mutation reports uncertain outcome after exactly one dispatch', async t => {
  const f = await fixture(t, () => {});
  const result = await f.run(['issues', 'update', 'AGENT-1', '--status', 'done', '--timeout', '1']);
  assert.equal(result.error.error, 'outcome_unknown'); assert.equal(result.stdout, ''); assert.equal(f.calls.length, 1);
});

test('actual login survives browser approval delay, verifies PKCE and identity, and stores private credentials', async t => {
  let authorization, verifier;
  const f = await fixture(t, (req, res, body) => {
    if (req.url === '/api/oauth/mcp/token') {
      const form = new URLSearchParams(body); verifier = form.get('code_verifier');
      assert.equal(form.get('grant_type'), 'authorization_code'); assert.equal(form.get('code'), 'synthetic-code'); assert.equal(form.get('client_id'), 'collab-cli');
      assert.equal(form.get('redirect_uri'), authorization.searchParams.get('redirect_uri'));
      res.end(JSON.stringify({ access_token: 'PRIVATE_ACCESS', refresh_token: 'PRIVATE_REFRESH', token_type: 'Bearer', expires_in: 3600, workspace_id: 'workspace-one', scope: 'issues:read context:write' }));
    } else res.end(JSON.stringify({ id: 'same-user', name: 'Synthetic user', workspace: { id: 'workspace-one' } }));
  });
  let callback;
  const result = await f.run(['auth', 'login'], { env: { COLLAB_TOKEN: '' }, stderrCallback: output => {
    if (callback) return;
    const match = output.match(/http:\/\/127\.0\.0\.1:\d+\/auth\/mcp\?[^\s]+/); if (!match) return;
    authorization = new URL(match[0]);
    assert.deepEqual(authorization.searchParams.get('scope').split(' '), ['user:read', 'workspace:read', 'workspace:write', 'projects:read', 'projects:write', 'issues:read', 'issues:write', 'context:read', 'context:write', 'prompts:read', 'knowledge:read']);
    callback = (async () => {
      // Human approval can leave Bun's Windows spawnSync loop idle beyond the
      // 10-second ACL timeout (oven-sh/bun#33932). Instant callbacks missed this.
      if (windows) await new Promise(resolve => setTimeout(resolve, 11000));
      const redirect = new URL(authorization.searchParams.get('redirect_uri'));
      const malformed = await new Promise((resolve, reject) => {
        const req = request({ hostname: redirect.hostname, port: redirect.port, path: 'http://[SYNTHETIC_PRIVATE_SENTINEL', agent: false }, res => {
          let body = '';
          res.setEncoding('utf8');
          res.on('data', chunk => { body += chunk; });
          res.on('end', () => resolve({ status: res.statusCode, body }));
          res.on('error', reject);
        });
        req.on('error', reject);
        req.end();
      });
      assert.deepEqual(malformed, { status: 400, body: 'Invalid callback.' });
      assert.equal(f.calls.length, 0);
      assert.throws(() => readFileSync(path.join(f.dir, 'default.json')), { code: 'ENOENT' });
      redirect.search = new URLSearchParams({ state: 'wrong', code: 'synthetic-code' });
      assert.equal((await fetch(redirect)).status, 400);
      redirect.searchParams.set('state', authorization.searchParams.get('state'));
      assert.equal((await fetch(redirect)).status, 200);
    })().catch(error => error);
  } });
  const callbackError = await callback;
  assert.equal(result.code, 0, result.stderr); assert.equal(result.data.identity.id, 'same-user');
  assert.equal(callbackError, undefined);
  assert.equal(f.calls.length, 2);
  assert.throws(() => statSync(path.join(f.dir, 'default.json.lock')), { code: 'ENOENT' });
  assert.equal(authorization.searchParams.get('code_challenge_method'), 'S256'); assert.equal(authorization.searchParams.get('code_challenge'), createHash('sha256').update(verifier).digest('base64url'));
  assert.ok(!result.stdout.includes('PRIVATE_')); assert.ok(!result.stderr.includes('PRIVATE_'));
  const file = path.join(f.dir, 'default.json'), stored = JSON.parse(readFileSync(file));
  assert.equal(stored.accessToken, 'PRIVATE_ACCESS'); assert.equal(stored.refreshToken, 'PRIVATE_REFRESH');
  assert.equal(stored.tokenWorkspace, 'workspace-one'); assert.equal(stored.userId, 'same-user');
  assert.equal(stored.workspace, 'workspace-one'); assert.equal(stored.origin, f.url); if (windows) assert.equal(windowsAcl(file), true); else assert.equal(statSync(file).mode & 0o777, 0o600);
  assert.equal((await f.run(['auth', 'logout'], { env: { COLLAB_TOKEN: '' } })).data.serverRevocationConfirmed, false);
  assert.deepEqual(JSON.parse(readFileSync(file)), {});
});

async function pendingLogin(f, args = []) {
  const ready = Promise.withResolvers();
  let child;
  const result = f.run(['auth', 'login', ...args], {
    env: { COLLAB_TOKEN: '' },
    childCallback: value => { child = value; },
    stderrCallback: output => {
      const match = output.match(/http:\/\/127\.0\.0\.1:\d+\/auth\/mcp\?[^\s]+/);
      if (match) ready.resolve(new URL(match[0]));
    },
  });
  result.then(value => ready.reject(new Error(`Login exited before authorization: ${value.stderr}`)));
  return { child, result, authorization: await ready.promise };
}

test('login recovers after a killed process and preserves credentials until approval', async t => {
  const f = await fixture(t, (req, res) => {
    res.end(JSON.stringify(req.url === '/api/oauth/mcp/token'
      ? { access_token: 'PRIVATE_NEW', token_type: 'Bearer', expires_in: 3600, workspace_id: 'workspace-one' }
      : { id: 'same-user', workspace: { id: 'workspace-one' } }));
  });
  const file = path.join(f.dir, 'default.json'), lock = `${file}.lock`;
  const saved = JSON.stringify({ origin: f.url, accessToken: 'PRIVATE_OLD' });
  writeCredentials(file, saved);
  const first = await pendingLogin(f);
  first.child.kill('SIGKILL');
  await first.result;
  assert.equal(existsSync(lock), true, 'forced termination leaves the lock behind');
  const retry = await pendingLogin(f);
  try {
    assert.equal(readFileSync(file, 'utf8'), saved);
    const redirect = new URL(retry.authorization.searchParams.get('redirect_uri'));
    redirect.search = new URLSearchParams({ code: 'synthetic-code', state: retry.authorization.searchParams.get('state') });
    assert.equal((await fetch(redirect)).status, 200);
    const result = await retry.result;
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.data.authenticated, true);
    assert.equal(JSON.parse(readFileSync(file)).accessToken, 'PRIVATE_NEW');
    assert.equal(existsSync(lock), false);
    assert.equal((await f.run(['whoami'], { env: { COLLAB_TOKEN: '' } })).data.id, 'same-user');
  } finally { retry.child.kill('SIGKILL'); await retry.result; }
});

test('active login refuses competing login and logout without changing its lock', async t => {
  const f = await fixture(t);
  const first = await pendingLogin(f);
  try {
    const lock = path.join(f.dir, 'default.json.lock'), contents = readFileSync(lock, 'utf8');
    for (const command of [['auth', 'login'], ['auth', 'logout']]) {
      const result = await f.run(command, { env: { COLLAB_TOKEN: '' } });
      assert.equal(result.error?.error, 'state_locked', result.stderr);
      assert.equal(readFileSync(lock, 'utf8'), contents);
    }
    assert.equal(f.calls.length, 0);
  } finally { first.child.kill('SIGKILL'); await first.result; }
});

test('concurrent login retries after a crash admit only one new owner', async t => {
  const f = await fixture(t);
  const first = await pendingLogin(f);
  first.child.kill('SIGKILL'); await first.result;
  const rejected = Promise.withResolvers();
  let approvals = 0, callback;
  const retry = () => f.run(['auth', 'login'], {
    env: { COLLAB_TOKEN: '' },
    stderrCallback: output => {
      if (callback) return;
      const match = output.match(/http:\/\/127\.0\.0\.1:\d+\/auth\/mcp\?[^\s]+/);
      if (!match) return;
      approvals++;
      callback = (async () => {
        await rejected.promise;
        const authorization = new URL(match[0]);
        const redirect = new URL(authorization.searchParams.get('redirect_uri'));
        redirect.search = new URLSearchParams({ error: 'access_denied', state: authorization.searchParams.get('state') });
        return fetch(redirect);
      })().catch(error => error);
    },
  }).then(result => { if (result.error?.error === 'state_locked') rejected.resolve(); return result; });
  const results = await Promise.all([retry(), retry()]);
  assert.equal((await callback)?.status, 200);
  assert.equal(approvals, 1);
  assert.deepEqual(results.map(result => result.error?.error).sort(), ['access_denied', 'state_locked']);
  assert.equal(existsSync(path.join(f.dir, 'default.json.lock')), false);
  assert.equal(f.calls.length, 0);
});

test('legacy, damaged and foreign-host locks are preserved with actionable diagnostics', async t => {
  const f = await fixture(t), lock = path.join(f.dir, 'default.json.lock');
  for (const contents of ['', '{broken', JSON.stringify({ version: 1, host: 'another-machine', port: 12345 }), 'x'.repeat(1025)]) {
    writeCredentials(lock, contents);
    const result = await f.run(['auth', 'login']);
    assert.equal(result.error?.error, 'state_locked', result.stderr);
    assert.equal(result.error.lockFile, lock);
    assert.equal(readFileSync(lock, 'utf8'), contents);
    assert.equal(f.calls.length, 0);
  }
});

test('login validation failure releases the lock for the next configuration write', async t => {
  const f = await fixture(t), lock = path.join(f.dir, 'default.json.lock');
  assert.equal((await f.run(['auth', 'login', '--url', 'invalid'])).error.error, 'invalid_origin');
  assert.equal(existsSync(lock), false);
  assert.equal((await f.run(['auth', 'logout'])).code, 0);
  assert.equal(existsSync(lock), false);
});


test('refresh retains a validated workspace and project selection while rotating the original token', async t => {
  let rotated = false;
  const f = await fixture(t, (req, res, body) => {
    if (req.url === '/api/oauth/mcp/token') {
      const form = new URLSearchParams(body);
      assert.equal(form.get('client_id'), 'collab-cli');
      assert.equal(form.get('refresh_token'), 'PRIVATE_REFRESH');
      rotated = true;
      res.end(JSON.stringify({ access_token: 'PRIVATE_ROTATED', refresh_token: 'PRIVATE_NEW_REFRESH', token_type: 'Bearer', expires_in: 3600, workspace_id: 'workspace-a', scope: 'user:read workspace:read projects:read issues:read' }));
      return;
    }
    assert.equal(req.headers.authorization, `Bearer ${rotated ? 'PRIVATE_ROTATED' : 'PRIVATE_ACCESS'}`);
    if (req.url === '/api/apps/auth/user/me') {
      res.end(JSON.stringify({ id: 'same-user', workspace: { id: 'workspace-a' } }));
    } else if (req.url === '/api/apps/auth/workspace?workspaceId=workspace-b') {
      res.end(JSON.stringify({ id: 'workspace-b' }));
    } else if (req.url === '/api/apps/auth/projects/project-b?workspaceId=workspace-b') {
      res.end(JSON.stringify({ id: 'project-b', workspaceId: 'workspace-b' }));
    } else {
      assert.equal(req.url, '/api/apps/auth/issues?workspaceId=workspace-b&projectId=project-b');
      assert.equal(rotated, true);
      res.end(JSON.stringify({ issues: [{ id: 'issue-b' }] }));
    }
  });
  const file = path.join(f.dir, 'default.json'), env = { COLLAB_TOKEN: '' };
  writeCredentials(file, JSON.stringify({ origin: f.url, clientId: 'collab-cli', accessToken: 'PRIVATE_ACCESS', refreshToken: 'PRIVATE_REFRESH', expiresAt: Date.now() + 60000, tokenWorkspace: 'workspace-a', userId: 'same-user', workspace: 'workspace-a', project: 'project-a' }));
  for (const args of [['config', 'set', '--workspace', 'workspace-b', '--project', 'project-b'], ['auth', 'refresh'], ['issues', 'list']]) {
    const result = await f.run(args, { env });
    assert.equal(result.code, 0, result.stderr);
    assert.ok(!result.stdout.includes('PRIVATE_')); assert.ok(!result.stderr.includes('PRIVATE_'));
    if (args[0] === 'issues') assert.deepEqual(result.data.issues, [{ id: 'issue-b' }]);
  }
  const stored = JSON.parse(readFileSync(file));
  assert.equal(stored.tokenWorkspace, 'workspace-a'); assert.equal(stored.userId, 'same-user');
  assert.equal(stored.workspace, 'workspace-b'); assert.equal(stored.project, 'project-b');
  assert.equal(stored.accessToken, 'PRIVATE_ROTATED'); assert.equal(stored.refreshToken, 'PRIVATE_NEW_REFRESH');
  assert.equal(f.calls.length, 5);
});

test('refresh rejects invalid local bindings before dispatch and refuses changed remote bindings without saving', async t => {
  for (const [change, responseWorkspace, identity, expected, dispatches] of [
    [{ clientId: 'collab-mcp' }, 'workspace-a', {}, 'client_mismatch', 0],
    [{ tokenWorkspace: undefined }, 'workspace-a', {}, 'invalid_credentials', 0],
    [{ userId: undefined }, 'workspace-a', {}, 'invalid_credentials', 0],
    [{ refreshToken: 'PRIVATE_ INVALID' }, 'workspace-a', {}, 'invalid_credentials', 0],
    [{ origin: 'https://example.test/path' }, 'workspace-a', {}, 'invalid_origin', 0],
    [{}, 'workspace-b', {}, 'workspace_mismatch', 1],
    [{}, 'workspace-a', { id: 'same-user', workspace: { id: 'workspace-b' } }, 'workspace_mismatch', 2],
    [{}, 'workspace-a', { id: 'other-user', workspace: { id: 'workspace-a' } }, 'identity_mismatch', 2],
    [{}, 'workspace-a', { workspace: { id: 'workspace-a' } }, 'invalid_identity', 2],
  ]) {
    const f = await fixture(t, (req, res) => res.end(JSON.stringify(req.url === '/api/oauth/mcp/token'
      ? { access_token: 'PRIVATE_ROTATED', token_type: 'Bearer', expires_in: 3600, workspace_id: responseWorkspace }
      : identity)));
    const file = path.join(f.dir, 'default.json');
    const original = JSON.stringify({ origin: f.url, clientId: 'collab-cli', accessToken: 'PRIVATE_ACCESS', refreshToken: 'PRIVATE_REFRESH', tokenWorkspace: 'workspace-a', userId: 'same-user', workspace: 'workspace-b', project: 'project-b', ...change });
    writeCredentials(file, original);
    const result = await f.run(['auth', 'refresh'], { env: { COLLAB_TOKEN: '' } });
    assert.notEqual(result.code, 0); assert.equal(result.error.error, expected);
    assert.equal(result.stdout, ''); assert.ok(!result.stderr.includes('PRIVATE_'));
    assert.equal(f.calls.length, dispatches); assert.equal(readFileSync(file, 'utf8'), original);
  }
});

test('login refuses token workspace and identity workspace mismatches without saving credentials', async t => {
  for (const [workspace, identityWorkspace, dispatches] of [['workspace-b', 'workspace-b', 1], ['workspace-a', 'workspace-b', 2]]) {
    const f = await fixture(t, (req, res) => res.end(JSON.stringify(req.url === '/api/oauth/mcp/token'
      ? { access_token: 'PRIVATE_ACCESS', refresh_token: 'PRIVATE_REFRESH', token_type: 'Bearer', expires_in: 3600, workspace_id: workspace }
      : { id: 'same-user', workspace: { id: identityWorkspace } })));
    let callback;
    const result = await f.run(['auth', 'login', '--workspace', 'workspace-a'], { env: { COLLAB_TOKEN: '' }, stderrCallback: output => {
      if (callback) return;
      const match = output.match(/http:\/\/127\.0\.0\.1:\d+\/auth\/mcp\?[^\s]+/); if (!match) return;
      const authorization = new URL(match[0]), redirect = new URL(authorization.searchParams.get('redirect_uri'));
      redirect.search = new URLSearchParams({ state: authorization.searchParams.get('state'), code: 'synthetic-code' });
      callback = fetch(redirect);
    } });
    await callback;
    assert.equal(result.code, 3); assert.match(result.stderr, /"error":"workspace_mismatch"/);
    assert.equal(result.stdout, ''); assert.ok(!result.stderr.includes('PRIVATE_')); assert.equal(f.calls.length, dispatches);
    assert.throws(() => readFileSync(path.join(f.dir, 'default.json')), { code: 'ENOENT' });
  }
});
