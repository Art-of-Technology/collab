import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { runWorker, workerKey, workerConfig, budget } from '../src/worker.mjs';
import { claudeRunner, childProcess } from '../src/worker-runner.mjs';
import { serviceDefinition, workerService } from '../src/worker-service.mjs';
import { CliError, store, request } from '../src/client.mjs';

function fixture(t, execute) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'collab-worker-'));
  const previous = process.env.COLLAB_CONFIG_DIR; process.env.COLLAB_CONFIG_DIR = dir;
  t.after(() => { if (previous === undefined) delete process.env.COLLAB_CONFIG_DIR; else process.env.COLLAB_CONFIG_DIR = previous; rmSync(dir, { recursive: true, force: true }); });
  const options = { agent: 'worker', workspace: 'ws', host: 'laptop', cwd: dir, claude: process.execPath };
  const selected = { base: 'https://example.test', workspace: 'ws', token: 'private' };
  const calls = [], sessions = [];
  let handoff = { id: 'task-one', issueId: 'issue-one', content: 'untrusted $(do not execute)', status: 'open', updatedAt: '2026-10-27T00:00:00Z' }, remote;
  const result = { outcome: 'complete', content: 'Evidence', reviewAgent: null, estimatedUSD: 0.1, error: false, tokens: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 2, cacheWriteTokens: 1 } };
  const dependencies = {
    sleep: (ms, value, extra) => delay(ms === 10000 ? ms : 1, value, extra),
    runner: { doctor: async () => ({ ready: true }), execute: async (config, attempt, context, signal, spawned) => {
      spawned(); sessions.push(attempt.sessionId);
      const ledger = store(`worker-${workerKey(selected, 'user', 'worker')}`).load();
      assert.ok(ledger.usage.chargedUSD >= config.attemptUSD);
      assert.equal(ledger.active.phase, 'dispatched');
      assert.equal(context.handoff.content, handoff.content);
      return execute ? execute({ config, attempt, context, signal, result, calls: sessions.length }) : result;
    } },
    api: async (url, extra = {}) => {
      calls.push({ url, ...extra });
      if (url === 'agents/worker') { remote = { generation: extra.body.generation || null, closed: ['configure', 'close'].includes(extra.body.event) }; return { worker: remote }; }
      if (url === 'agents/worker?agent=worker') return { agent: { name: 'worker', worker: remote } };
      if (url.startsWith('agents/inbox')) {
        if (handoff.status === 'completed') { process.emit('SIGINT'); return { items: [], hasMore: false }; }
        return { items: [handoff], hasMore: false };
      }
      if (url.startsWith('agents/handoffs/task-one')) {
        if (!extra.method) return { handoff };
        assert.ok(extra.body.generation);
        if (extra.body.action === 'claim') handoff = { ...handoff, status: 'claimed' };
        if (extra.body.action === 'complete') handoff = { ...handoff, status: 'completed' };
        return handoff;
      }
      if (url === 'issues/issue-one') return { id: 'issue-one', title: 'Safe fixture' };
      throw Error('unexpected request');
    },
  };
  const run = command => runWorker(`worker ${command}`, options, selected, 'user', dependencies);
  return { dir, options, selected, calls, sessions, dependencies, run, state: () => store(`worker-${workerKey(selected, 'user', 'worker')}`).load() };
}

test('worker conflicts expose only scoped, valid reason codes without remote text', async t => {
  let status = 409, contentType = 'application/json', rawResponse, response = { error: 'worker_fenced', message: 'PRIVATE_REMOTE_TEXT' };
  const server = createServer((_req, res) => { res.writeHead(status, { 'content-type': contentType }); res.end(rawResponse ?? JSON.stringify(response)); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`, endpoint = '/api/apps/auth/agents/worker?workspaceId=ws';
  async function rejected(pathname = endpoint, method = 'POST', event = 'renew') {
    try { await request(base, pathname, { method, body: { event } }); assert.fail('expected rejection'); }
    catch (error) { assert.equal((error.message + JSON.stringify(error)).includes('PRIVATE_REMOTE_TEXT'), false); return error.code; }
  }
  for (const event of ['start', 'renew', 'close']) {
    for (const code of ['worker_fenced', 'worker_binding_changed']) { response.error = code; assert.equal(await rejected(endpoint, 'POST', event), code); }
  }
  for (const code of ['worker_active', 'worker_conversion_required']) { response.error = code; assert.equal(await rejected(endpoint, 'POST', 'configure'), code); }
  response.error = 'worker_fenced';
  assert.equal(await rejected(endpoint, 'POST', 'configure'), 'conflict');
  assert.equal(await rejected('/api/apps/auth/agents/worker-extra', 'POST', 'renew'), 'conflict');
  assert.equal(await rejected(endpoint, 'PATCH', 'renew'), 'conflict');
  assert.equal(await rejected(endpoint, 'POST', 'other'), 'conflict');
  contentType = 'application/json-malicious'; assert.equal(await rejected(), 'conflict');
  contentType = 'application/json'; status = 400; assert.equal(await rejected(), 'invalid_request');
  status = 409; response.error = 'PRIVATE_REMOTE_TEXT'; assert.equal(await rejected(), 'conflict');
  rawResponse = '{PRIVATE_REMOTE_TEXT'; assert.equal(await rejected(), 'conflict');
});

test('worker status records a sanitized start conflict and operation without retry', async t => {
  const f = fixture(t); await f.run('setup');
  let starts = 0;
  const server = createServer((req, res) => {
    let body = ''; req.on('data', chunk => { body += chunk; }); req.on('end', () => {
      const event = JSON.parse(body).event;
      if (event === 'start') { starts++; res.writeHead(409, { 'content-type': 'application/json' }); res.end('{"error":"worker_fenced","message":"PRIVATE_REMOTE_TEXT"}'); }
      else { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"worker":{"closed":true}}'); }
    });
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  f.dependencies.api = (endpoint, extra) => request(base, `/api/apps/auth/${endpoint}?workspaceId=ws`, extra);
  const result = await f.run('run');
  assert.equal(result.stopReason, 'worker_fenced'); assert.equal(result.stopOperation, 'start'); assert.equal(starts, 1);
  const status = await f.run('status'); assert.equal(status.stopReason, 'worker_fenced'); assert.equal(status.stopOperation, 'start');
  assert.equal(JSON.stringify(status).includes('PRIVATE_REMOTE_TEXT'), false); assert.equal(f.sessions.length, 0);
});

test('worker status records a failed lease renewal and still closes its generation', async t => {
  const f = fixture(t); await f.run('setup');
  const events = [];
  const server = createServer((req, res) => {
    let body = ''; req.on('data', chunk => { body += chunk; }); req.on('end', () => {
      const event = JSON.parse(body).event; events.push(event);
      if (event === 'renew') { res.writeHead(409, { 'content-type': 'application/json' }); res.end('{"error":"worker_fenced","message":"PRIVATE_REMOTE_TEXT"}'); }
      else { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"worker":{}}'); }
    });
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  f.dependencies.sleep = (_ms, value, extra) => delay(10, value, extra);
  f.dependencies.api = (endpoint, extra = {}) => endpoint.startsWith('agents/inbox')
    ? new Promise((_resolve, reject) => extra.signal.addEventListener('abort', () => reject(extra.signal.reason), { once: true }))
    : request(base, `/api/apps/auth/${endpoint}?workspaceId=ws`, extra);
  const result = await f.run('run');
  assert.equal(result.stopReason, 'worker_fenced'); assert.equal(result.stopOperation, 'renew');
  assert.deepEqual(events, ['start', 'renew', 'close']); assert.equal(f.state().closed, true);
  assert.equal((await f.run('status')).stopOperation, 'renew'); assert.equal(f.sessions.length, 0);
});

for (const prior of ['none', 'start', 'renew', 'recovery']) test(`unconfirmed closure preserves ${prior} failure diagnostics`, async t => {
  const f = fixture(t); await f.run('setup');
  const api = f.dependencies.api, events = [];
  if (prior === 'recovery') await store(`worker-${workerKey(f.selected, 'user', 'worker')}`).exclusive(async (state, save) => {
    state.runId = 'old'; state.closed = false;
    await api('agents/worker', { method: 'POST', body: { event: 'start', generation: state.runId } }); save(state);
  });
  if (prior === 'renew') f.dependencies.sleep = (_ms, value, extra) => delay(10, value, extra);
  f.dependencies.api = async (url, extra = {}) => {
    const event = extra.body?.event;
    if (event) events.push(event);
    if (event === 'close' || event === prior) throw new CliError('worker_fenced', 'Safe conflict');
    if (prior === 'renew' && url.startsWith('agents/inbox')) return new Promise((_resolve, reject) => extra.signal.addEventListener('abort', () => reject(extra.signal.reason), { once: true }));
    return api(url, extra);
  };
  const result = await f.run('run');
  assert.equal(result.stopReason, 'worker_fenced'); assert.equal(result.stopOperation, ['start', 'renew'].includes(prior) ? prior : 'close');
  assert.equal(result.closureUnconfirmed, true); assert.equal(f.state().closed, false);
  const status = await f.run('status');
  assert.equal(status.stopReason, result.stopReason); assert.equal(status.stopOperation, result.stopOperation);
  assert.equal(status.closureUnconfirmed, true); assert.equal(status.stopped, false);
  await assert.rejects(f.run('stop'), { code: 'stop_unconfirmed' });
  assert.equal(events.filter(event => event === 'close').length, 1);
});

test('failed close cannot acknowledge a live stop', async t => {
  const f = fixture(t); await f.run('setup');
  let ready; const polled = new Promise(resolve => { ready = resolve; });
  const api = f.dependencies.api;
  f.dependencies.api = async (url, extra = {}) => {
    if (extra.body?.event === 'close') throw new CliError('worker_fenced', 'Safe conflict');
    if (url.startsWith('agents/inbox')) { ready(); return { items: [], hasMore: false }; }
    return api(url, extra);
  };
  const running = f.run('run'); await polled;
  await assert.rejects(f.run('stop'), { code: 'stop_unconfirmed' });
  const result = await running;
  assert.equal(result.stopReason, 'worker_fenced'); assert.equal(result.stopOperation, 'close');
  assert.equal(result.closureUnconfirmed, true); assert.equal(f.state().closed, false);
});

test('setup and retired service clear stale failure operations', async t => {
  const f = fixture(t); await f.run('setup');
  const stateStore = store(`worker-${workerKey(f.selected, 'user', 'worker')}`);
  await stateStore.exclusive((state, save) => { state.stopReason = 'worker_fenced'; state.stopOperation = 'start'; save(state); });
  const retired = await runWorker('worker run', { ...f.options, 'service-id': 'retired' }, f.selected, 'user', f.dependencies);
  assert.equal(retired.stopReason, 'service_retired'); assert.equal(retired.stopOperation, null);
  f.dependencies.api = async () => { throw new CliError('worker_active', 'Rejected', 2, { configureRejected: true }); };
  await assert.rejects(f.run('setup'), { code: 'worker_active' });
  assert.equal(f.state().stopReason, 'worker_active'); assert.equal(f.state().stopOperation, 'configure');
  const status = await f.run('status'); assert.equal(status.stopOperation, 'configure');
});

for (const pending of ['generation', 'child']) test(`offline summaries retain failure during unresolved ${pending} closure`, async t => {
  const f = fixture(t); await f.run('setup');
  const stateStore = store(`worker-${workerKey(f.selected, 'user', 'worker')}`);
  await stateStore.exclusive((state, save) => {
    if (pending === 'generation') { state.runId = 'old'; state.closed = false; }
    else state.active = { phase: 'dispatched', closed: false };
    state.stopReason = 'worker_binding_changed'; state.stopOperation = 'renew'; save(state);
  });
  const check = result => {
    assert.equal(result.closureUnconfirmed, true); assert.equal(result.stopReason, 'worker_binding_changed'); assert.equal(result.stopOperation, 'renew');
  };
  check(await f.run('doctor'));
  check(await runWorker('worker run', { ...f.options, 'service-id': 'retired' }, f.selected, 'user', f.dependencies));
  f.dependencies.startupError = new CliError('token_expired', 'Login expired');
  const startup = await f.run('run'); check(startup); assert.equal(startup.state, 'needs-login');
  delete f.dependencies.startupError;
  f.dependencies.api = async url => {
    if (url === 'agents/worker?agent=worker') return { agent: { worker: { generation: 'old', closed: false } } };
    throw new CliError('worker_fenced', 'Safe conflict');
  };
  check(await f.run('run')); check(await f.run('status'));
  assert.equal(f.sessions.length, 0);
});

test('resolved recovery permits a new generation to report its own failure', async t => {
  const f = fixture(t); await f.run('setup');
  const stateStore = store(`worker-${workerKey(f.selected, 'user', 'worker')}`), api = f.dependencies.api;
  await stateStore.exclusive(async (state, save) => {
    state.runId = 'old'; state.closed = false; state.stopReason = 'worker_binding_changed'; state.stopOperation = 'renew';
    await api('agents/worker', { method: 'POST', body: { event: 'start', generation: 'old' } }); save(state);
  });
  f.dependencies.api = async (url, extra = {}) => {
    if (extra.body?.event === 'start') throw new CliError('worker_fenced', 'Safe conflict');
    return api(url, extra);
  };
  const result = await f.run('run');
  assert.equal(result.stopReason, 'worker_fenced'); assert.equal(result.stopOperation, 'start');
  assert.equal(result.closureUnconfirmed, false); assert.equal(f.state().closed, true);
});

test('worker setup/run claims before an owned session and suppresses completed duplicates', async t => {
  const f = fixture(t);
  assert.equal((await f.run('setup')).started, false);
  const done = await f.run('run');
  assert.equal(done.state, 'stopped');
  assert.equal(f.sessions.length, 1);
  assert.equal(done.usage.estimatedUSD, 0.1);
  assert.ok(Math.abs(done.usage.chargedUSD - 0.1) < 1e-9);
  assert.equal(done.usage.reservedUSD, 0);
  assert.ok(f.calls.findIndex(c => c.body?.action === 'claim') < f.calls.findIndex(c => c.body?.action === 'complete'));
  await f.run('run');
  assert.equal(f.sessions.length, 1);
  await f.run('setup');
  assert.equal(f.state().usage.estimatedUSD, 0.1);
});

test('missing result keeps the reservation and daemon restart never repeats dispatch', async t => {
  const f = fixture(t, () => { throw Object.assign(Error(), { code: 'worker_uncertain' }); });
  await f.run('setup');
  const result = await f.run('run');
  assert.equal(result.state, 'uncertain');
  assert.equal(result.usage.reservedUSD, 0.5); assert.equal(result.usage.unknownUSD, 0.5);
  assert.equal(result.usage.estimatedUSD, 0);
  await f.run('run'); assert.equal(f.sessions.length, 1);
  assert.equal(f.calls.filter(c => c.body?.action === 'complete').length, 0);
});

test('provider budget exhaustion charges failed usage and pauses without retry', async t => {
  const f = fixture(t, ({ result }) => ({ ...result, error: true, errorCode: 'usage_limit', estimatedUSD: 0.51168,
    tokens: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 } }));
  await f.run('setup');
  const result = await f.run('run');
  assert.equal(result.state, 'usage-limit');
  assert.equal(f.sessions.length, 1);
  assert.equal(result.usage.estimatedUSD, 0.51168);
  assert.equal(result.usage.reservedUSD, 0);
  assert.equal(result.usage.chargedUSD, 0.51168);
  assert.equal(f.calls.filter(c => c.body?.action === 'complete').length, 0);
  await f.run('run');
  assert.equal(f.sessions.length, 1);
});

test('closed child without durable result remains uncertain across restart', async t => {
  const f = fixture(t); await f.run('setup');
  await store(`worker-${workerKey(f.selected, 'user', 'worker')}`).exclusive((state, save) => {
    budget(state, state.config, Date.now(), true);
    state.active = { handoffId: 'task-one', phase: 'dispatched', closed: true, attemptId: 'old', sessionId: 'old', reservedUSD: 0.5, day: state.usage.day };
    save(state);
  });
  assert.equal((await f.run('run')).state, 'uncertain');
  assert.equal(f.sessions.length, 0);
  assert.equal(f.state().usage.reservedUSD, 0.5);
});

test('losing a claim race refunds the unused reservation and continues without a child', async t => {
  const f = fixture(t); await f.run('setup');
  const api = f.dependencies.api;
  f.dependencies.api = async (url, extra) => {
    if (extra?.body?.action === 'claim') throw Object.assign(Error(), { code: 'already_claimed' });
    if (extra?.body?.action === 'seen') process.emit('SIGINT');
    return api(url, extra);
  };
  const result = await f.run('run');
  assert.equal(result.state, 'stopped');
  assert.equal(f.sessions.length, 0);
  assert.equal(result.usage.chargedUSD, 0);
  assert.equal(result.usage.reservedUSD, 0);
});

test('unproven child closure stays blocked and never releases remote ownership', async t => {
  const f = fixture(t); await f.run('setup');
  await store(`worker-${workerKey(f.selected, 'user', 'worker')}`).exclusive((state, save) => save({ ...state, runId: 'old', closed: false, active: { handoffId: 'task-one', phase: 'dispatched', closed: false } }));
  const before = f.calls.length;
  assert.equal((await f.run('run')).state, 'uncertain');
  assert.equal(f.calls.length, before); assert.equal(f.sessions.length, 0);
});

test('persisted reservation before dispatch resumes once without double charging', async t => {
  const f = fixture(t); await f.run('setup');
  await store(`worker-${workerKey(f.selected, 'user', 'worker')}`).exclusive((state, save) => {
    budget(state, state.config, Date.now(), true);
    state.active = { handoffId: 'task-one', phase: 'reserved', closed: true, attemptId: 'prior-attempt', sessionId: 'prior-session', reservedUSD: 0.5, day: state.usage.day };
    save(state);
  });
  const result = await f.run('run');
  assert.equal(f.sessions.length, 1); assert.equal(result.usage.totalStarts, 1);
  assert.ok(Math.abs(result.usage.chargedUSD - 0.1) < 1e-9);
});

test('saved validated result reconciles completion without relaunching a child', async t => {
  const f = fixture(t); await f.run('setup');
  await f.dependencies.api('agents/handoffs/task-one', { method: 'PATCH', body: { action: 'claim', generation: 'prior-generation' } });
  await store(`worker-${workerKey(f.selected, 'user', 'worker')}`).exclusive((state, save) => {
    state.active = { handoffId: 'task-one', phase: 'result', closed: true, attemptId: 'prior-attempt', sessionId: 'prior-session', reservedUSD: 0.5,
      result: { outcome: 'complete', content: 'Saved evidence', reviewAgent: null } };
    save(state);
  });
  assert.equal((await f.run('run')).state, 'stopped'); assert.equal(f.sessions.length, 0);
});

test('transient reads recover; auth pauses without retrying or invoking the model', async t => {
  const f = fixture(t); await f.run('setup');
  const original = f.dependencies.api; let failures = 0;
  f.dependencies.api = async (url, extra) => { if (url.startsWith('agents/inbox') && failures++ === 0) throw Object.assign(Error(), { code: 'transport_failed' }); return original(url, extra); };
  assert.equal((await f.run('run')).state, 'stopped'); assert.equal(f.sessions.length, 1);
  f.dependencies.api = async () => { throw Object.assign(Error(), { code: 'unauthorized' }); };
  assert.equal((await f.run('run')).state, 'needs-login'); assert.equal(f.sessions.length, 1);
});

test('owned control stop waits for child closure and refuses competing runs', async t => {
  let started;
  const ready = new Promise(resolve => { started = resolve; });
  const f = fixture(t, async ({ signal }) => { started(); await delay(30000, undefined, { signal }); });
  await f.run('setup'); const running = f.run('run'); await ready;
  await assert.rejects(f.run('run'), { code: 'state_locked' });
  assert.equal((await f.run('status')).online, true);
  assert.equal((await f.run('stop')).stopped, true);
  assert.equal((await running).state, 'uncertain');
  assert.equal(f.state().active.closed, true);
  assert.equal((await f.run('status')).online, false);
});

for (const mode of ['foreground', 'scheduled']) test(`${mode} startup stop and status require lock proof before control is published`, { timeout: 5000 }, async t => {
  const f = fixture(t); await f.run('setup');
  const identity = workerKey(f.selected, 'user', 'worker'), stateStore = store(`worker-${identity}`);
  const options = { ...f.options };
  if (mode === 'scheduled') {
    await stateStore.exclusive((state, save) => workerService('worker install', identity, f.options, state, save, {
      platform: 'linux', home: f.dir, command: ['/trusted/collab'], execute: async () => ({ stdout: '' }),
    }));
    options['service-id'] = f.state().service.installationId;
  }
  let entered, release, polled;
  const preflight = new Promise(resolve => { entered = resolve; });
  const pending = new Promise(resolve => { release = resolve; });
  const ready = new Promise(resolve => { polled = resolve; });
  f.dependencies.runner.doctor = async () => { entered(); await pending; return { ready: true }; };
  f.dependencies.runner.execute = async () => assert.fail('Idle startup must not launch a model');
  const api = f.dependencies.api;
  f.dependencies.api = async (url, extra) => {
    if (url.startsWith('agents/inbox')) { polled(); return { items: [], hasMore: false }; }
    return api(url, extra);
  };
  const running = runWorker('worker run', options, f.selected, 'user', f.dependencies);
  let finished = false;
  t.after(async () => { release(); if (!finished) { process.emit('SIGINT'); await running; } });
  await preflight;
  assert.equal(f.state().runId, undefined); assert.equal(store(`ctl-${identity}`).load().port, undefined);
  await assert.rejects(f.run('stop'), { code: 'stop_unconfirmed' });
  const starting = await f.run('status');
  assert.equal(starting.stopped, false); assert.equal(starting.online, false);
  assert.equal(starting.state, 'starting'); assert.equal(starting.stopReason, 'stop_unconfirmed');
  assert.equal(f.sessions.length, 0); assert.equal(f.calls.some(call => call.body?.event === 'start'), false);
  release(); await ready;
  const online = await f.run('status'); assert.equal(online.online, true); assert.equal(online.stopped, false);
  assert.equal((await f.run('stop')).stopped, true);
  assert.equal((await running).state, 'stopped'); finished = true;
  assert.equal(f.state().closed, true); assert.equal(f.sessions.length, 0);
  assert.equal((await f.run('status')).stopped, true);
});

for (const record of ['missing', 'unreachable']) test(`absence proof requires the worker lock with ${record} control metadata`, async t => {
  const f = fixture(t); await f.run('setup');
  const identity = workerKey(f.selected, 'user', 'worker'), stateStore = store(`worker-${identity}`);
  if (record === 'unreachable') {
    const server = createServer((_req, res) => { res.writeHead(503); res.end(); });
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
    await store(`ctl-${identity}`).exclusive((_state, save) => save({ port: server.address().port, nonce: 'old-control' }));
  }
  const before = f.state();
  await stateStore.exclusive(async () => {
    await assert.rejects(f.run('stop'), { code: 'stop_unconfirmed' });
    const status = await f.run('status');
    assert.equal(status.stopped, false); assert.equal(status.state, 'starting');
  });
  assert.deepEqual(await f.run('stop'), { online: false, stopped: true });
  const status = await f.run('status'); assert.equal(status.stopped, true); assert.equal(status.online, false);
  assert.deepEqual(f.state(), before); assert.equal(f.sessions.length, 0);
});

for (const unresolved of [{ runId: 'old-run', closed: false }, { active: { phase: 'dispatched', closed: false } }]) test(`unresolved ${unresolved.runId ? 'generation' : 'child'} closure refuses stop despite a free lock`, async t => {
  const f = fixture(t); await f.run('setup');
  await store(`worker-${workerKey(f.selected, 'user', 'worker')}`).exclusive((state, save) => save({ ...state, ...unresolved }));
  await assert.rejects(f.run('stop'), { code: 'stop_unconfirmed' });
  const status = await f.run('status');
  assert.equal(status.stopped, false); assert.equal(status.state, 'uncertain'); assert.equal(status.stopReason, 'stop_unconfirmed');
});

test('daily ledger, reservations and clock rollback cannot mint spend', () => {
  const config = { attemptUSD: 0.5, dailyUSD: 1 };
  const state = {};
  const day = Date.parse('2026-10-27T12:00:00Z');
  assert.equal(budget(state, config, day, true), true);
  assert.equal(budget(state, config, day, true), true);
  assert.equal(budget(state, config, day, true), false);
  const restored = JSON.parse(JSON.stringify(state));
  assert.equal(budget(restored, config, day, true), false);
  assert.equal(budget(restored, config, day + 86400000, true), true);
  assert.equal(restored.usage.reservedUSD, 1.5);
  assert.throws(() => budget(restored, config, day, true), { code: 'clock_rollback' });
});

test('runner validates owned result/session/usage and sends content only on stdin', async t => {
  const f = fixture(t), config = workerConfig(f.options);
  const attempt = { sessionId: 'dedicated-session', reservedUSD: 0.5 };
  const valid = { type: 'result', subtype: 'success', session_id: attempt.sessionId, is_error: false, total_cost_usd: 0.1,
    usage: { input_tokens: 1, output_tokens: 2 }, structured_output: { outcome: 'complete', content: 'Evidence', reviewAgent: null } };
  const invoke = data => claudeRunner.execute(config, attempt, { content: 'PRIVATE_TASK_BODY' }, undefined, () => {}, async (_exe, args, options) => {
    assert.equal(args.some(arg => arg.includes('PRIVATE_TASK_BODY')), false);
    assert.ok(options.input.includes('PRIVATE_TASK_BODY'));
    assert.ok(args.includes('--restricted')); assert.equal(args.includes('bypassPermissions'), false);
    assert.equal(args.includes('--max-turns'), false);
    assert.equal(args[args.indexOf('--max-budget-usd') + 1], String(attempt.reservedUSD));
    assert.equal(options.timeout, config.timeoutSeconds * 1000);
    assert.equal(args[args.indexOf('--session-id') + 1], attempt.sessionId);
    assert.equal(args[args.indexOf('--tools') + 1], 'Read,Glob,Grep');
    assert.equal(args[args.indexOf('--permission-mode') + 1], 'dontAsk');
    assert.equal(args[args.indexOf('--permission-prompts') + 1], 'none');
    return { code: 0, output: JSON.stringify(data) };
  });
  assert.equal((await invoke(valid)).estimatedUSD, 0.1);
  const exhausted = await invoke({ ...valid, subtype: 'error_max_budget_usd', is_error: true, total_cost_usd: 0.51168,
    usage: { input_tokens: 0, output_tokens: 0 }, structured_output: undefined });
  assert.equal(exhausted.errorCode, 'usage_limit');
  assert.equal(exhausted.estimatedUSD, 0.51168);
  for (const change of [{ session_id: 'other' }, { usage: undefined }, { total_cost_usd: undefined }, { structured_output: undefined }, { is_error: undefined }]) await assert.rejects(invoke({ ...valid, ...change }), { code: 'worker_uncertain' });
  await assert.rejects(childProcess(process.execPath, ['-e', 'setTimeout(()=>{},30000)'], { timeout: 20 }), { code: 'worker_timeout' });
});

test('doctor refuses unsupported budget capabilities before executing work', async t => {
  const f = fixture(t), config = workerConfig(f.options); const calls = [];
  await assert.rejects(claudeRunner.doctor(config, async (_exe, args) => { calls.push(args); return { code: 0, output: args[0] === '--version' ? '2.1.311' : 'no required flags' }; }), { code: 'unsupported_runner' });
  assert.deepEqual(calls, [['--version'], ['--help']]);
  for (const change of [{ 'daily-usd': 'NaN' }, { 'max-restarts': '100' }, { 'timeout-seconds': '0' }, { tools: 'Bash(*)' }, { 'attempt-usd': '3', 'daily-usd': '2' }]) assert.throws(() => workerConfig({ ...f.options, ...change }));
});

test('service installation is explicit, bounded and refuses unowned definitions', async t => {
  const f = fixture(t); const state = { config: workerConfig(f.options) }, calls = [];
  const deps = { platform: 'linux', home: f.dir, command: [process.execPath, '/trusted/collab.mjs'], execute: async (...args) => { calls.push(args); } };
  const preview = await workerService('worker install', 'test', { ...f.options, 'dry-run': true }, state, () => {}, deps);
  assert.equal(preview.installed, false); assert.equal(calls.length, 0);
  await workerService('worker install', 'test', f.options, state, () => {}, deps);
  assert.equal(calls.length, 2);
  const installedContent = readFileSync(state.service.file);
  writeFileSync(state.service.file, 'unowned definition');
  await assert.rejects(workerService('worker uninstall', 'test', f.options, state, () => {}, deps), { code: 'worker_service' });
  assert.equal(calls.length, 2);
  writeFileSync(state.service.file, installedContent);
  await workerService('worker uninstall', 'test', f.options, state, () => {}, deps);
  assert.equal(calls.length, 3);
  assert.throws(() => serviceDefinition('test', ['executable'], '/state', { platform: 'unsupported' }), { code: 'worker_service' });
});

test('actual CLI recovers a crashed daemon with bounded restarts and an owned fake Claude child', { skip: process.platform === 'win32' }, async t => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'collab-worker-cli-'));
  const capture = path.join(dir, 'child.json'), fake = path.join(dir, 'fake-claude.mjs');
  writeFileSync(fake, `#!${process.execPath}
import fs from 'node:fs';
const args=process.argv.slice(2);
if(args[0]==='--version') console.log('2.1.311');
else if(args[0]==='--help') console.log('--max-budget-usd --session-id --output-format --json-schema --restricted --permission-prompts --tools --strict-mcp-config');
else if(args[0]==='auth') console.log(JSON.stringify({loggedIn:true}));
else {
  process.stdin.setEncoding('utf8');
  let input=''; for await(const b of process.stdin) input+=b;
  const session=args[args.indexOf('--session-id')+1];
  fs.writeFileSync(${JSON.stringify(capture)},JSON.stringify({args,input,hasCollab:Object.keys(process.env).some(k=>k.startsWith('COLLAB_')),session}));
  console.log(JSON.stringify({type:'result',subtype:'success',session_id:session,is_error:false,total_cost_usd:0.02,usage:{input_tokens:3,output_tokens:4},structured_output:{outcome:'complete',content:'Fixture evidence',reviewAgent:null}}));
}
`, { mode: 0o700 });
  let completed, polled, allowWork = false, status = 'open', remote;
  const polling = new Promise(resolve => { polled = resolve; });
  const completion = new Promise(resolve => { completed = resolve; });
  const calls = [];
  const server = createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks)) : null;
    calls.push({ url: req.url, body });
    assert.equal(req.headers.authorization, 'Bearer PRIVATE_FIXTURE_TOKEN');
    res.setHeader('content-type', 'application/json');
    if (req.url.includes('/agents/worker') && req.method === 'POST') { remote = { generation: body.generation, closed: ['configure', 'close'].includes(body.event) }; res.end(JSON.stringify({ worker: remote })); }
    else if (req.url.includes('/agents/inbox')) {
      res.end(JSON.stringify({ items: !allowWork || status === 'completed' ? [] : [{ id: 'h', status, updatedAt: '2026-10-27T00:00:00Z' }], hasMore: false })); polled();
    }
    else if (req.url.startsWith('/api/apps/auth/agents/worker?agent=worker&')) res.end(JSON.stringify({ agent: { name: 'worker', worker: remote } }));
    else if (req.url.includes('/agents/handoffs/h')) {
      if (body?.action === 'claim') status = 'claimed';
      if (body?.action === 'complete') status = 'completed';
      res.end(JSON.stringify({ handoff: { id: 'h', issueId: 'i', status, content: 'PRIVATE_HANDOFF_BODY' } }));
      if (status === 'completed') completed();
    } else if (req.url.includes('/issues/i')) res.end(JSON.stringify({ id: 'i', title: 'Fixture' }));
    else { res.writeHead(404); res.end('{}'); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  writeFileSync(path.join(dir, 'default.json'), JSON.stringify({ origin: base, userId: 'user', accessToken: 'PRIVATE_FIXTURE_TOKEN', expiresAt: Date.now() + 60000 }), { mode: 0o600 });
  const bin = fileURLToPath(new URL('../bin/collab.mjs', import.meta.url));
  const cli = (command, killed = false) => {
    const env = { ...process.env }; for (const key of Object.keys(env)) if (/^COLLAB_/i.test(key)) delete env[key];
    env.COLLAB_CONFIG_DIR = dir;
    const child = spawn(process.execPath, [bin, 'worker', ...command, '--workspace', 'ws', '--agent', 'worker'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    let output = '', errors = ''; child.stdout.on('data', b => { output += b; }); child.stderr.on('data', b => { errors += b; });
    const timer = setTimeout(() => child.kill('SIGKILL'), 10000);
    const finished = once(child, 'close').then(([code, signal]) => {
      clearTimeout(timer);
      if (killed) { assert.equal(signal, 'SIGKILL'); return; }
      assert.equal(code, 0, errors); assert.equal((output + errors).includes('PRIVATE_'), false); return JSON.parse(output);
    });
    finished.child = child; return finished;
  };
  assert.equal((await cli(['setup', '--host', 'laptop', '--cwd', dir, '--claude', fake, '--max-restarts', '1'])).started, false);
  const crashed = cli(['run'], true);
  await polling; crashed.child.kill('SIGKILL'); await crashed;
  assert.equal(calls.filter(c => c.body?.action === 'claim').length, 0);
  allowWork = true;
  const running = cli(['run']);
  await Promise.race([completion, delay(8000).then(() => { throw Error('fixture completion timeout'); })]);
  assert.equal((await cli(['status'])).online, true);
  assert.equal((await cli(['stop'])).stopped, true);
  const final = await running;
  assert.equal(final.state, 'stopped'); assert.equal(final.usage.estimatedUSD, 0.02);
  assert.equal(final.usage.restarts, 1);
  const exhausted = await cli(['run']);
  assert.equal(exhausted.state, 'restart-limit'); assert.equal(exhausted.usage.restarts, 1);
  const starts = calls.filter(c => c.body?.event === 'start');
  assert.equal(starts.length, 2); assert.notEqual(starts[0].body.generation, starts[1].body.generation);
  const child = JSON.parse(readFileSync(capture, 'utf8'));
  assert.equal(child.hasCollab, false);
  assert.equal(child.args.some(value => value.includes('PRIVATE_HANDOFF_BODY')), false);
  assert.ok(child.input.includes('PRIVATE_HANDOFF_BODY'));
  assert.match(child.session, /^[0-9a-f-]{36}$/);
  assert.ok(calls.find(c => c.body?.action === 'claim').body.generation);
  assert.equal(calls.filter(c => c.body?.action === 'complete').length, 1);
});

test('configure intent survives a lost response and preserves identity and budget', async t => {
  const f = fixture(t), original = f.dependencies.api;
  let lost = true, intent;
  f.dependencies.api = async (url, extra) => {
    if (extra?.body?.event === 'configure') {
      const saved = f.state();
      assert.deepEqual(saved.configure.body, extra.body);
      if (!intent) intent = extra.body;
      assert.deepEqual(extra.body, intent);
      const result = await original(url, extra);
      if (lost) { lost = false; throw Object.assign(Error(), { code: 'outcome_unknown' }); }
      return result;
    }
    return original(url, extra);
  };
  await assert.rejects(f.run('setup'), { code: 'outcome_unknown' });
  assert.equal((await f.run('status')).setupPending, true);
  assert.equal((await f.run('run')).stopReason, 'worker_setup_pending');
  await store(`worker-${workerKey(f.selected, 'user', 'worker')}`).exclusive((state, save) => {
    budget(state, state.configure.config, Date.now(), true); save(state);
  });
  const savedUsage = f.state().usage;
  f.options.host = 'different';
  await assert.rejects(f.run('setup'), { code: 'worker_setup_pending' });
  f.options.host = 'laptop';
  await f.run('setup');
  assert.equal(f.state().config.sessionId, intent.sessionId);
  assert.deepEqual(f.state().usage, savedUsage);
  assert.equal((await f.run('status')).setupPending, false);
});

for (const phase of ['idle', 'pre-dispatch', 'model', 'usage-limit']) test(`serialized lease renewals survive lost replies throughout ${phase}`, { timeout: 5000 }, async t => {
  let release, target = Infinity, pulses = 0, clock = Date.now(), leaseUntil = 0, generation, reports = 0, maxReports = 0;
  const sustained = new Promise(resolve => { release = resolve; });
  const hold = () => { target = pulses + 8; return sustained; };
  const f = fixture(t, phase === 'model' ? async ({ result }) => { await hold(); return result; } : undefined);
  f.options['poll-seconds'] = '60';
  await f.run('setup');
  if (phase === 'usage-limit') await store(`worker-${workerKey(f.selected, 'user', 'worker')}`).exclusive((state, save) => {
    budget(state, state.config, clock); state.usage.chargedUSD = state.config.dailyUSD; save(state);
  });
  const original = f.dependencies.api, lost = new Set();
  f.dependencies.now = () => clock;
  f.dependencies.sleep = async (ms, value, extra) => {
    if (ms === 10000) { await delay(1, value, extra); clock += ms; }
    else if (ms === 60000) { await hold(); process.emit('SIGINT'); }
    else await delay(1, value, extra);
  };
  f.dependencies.api = async (url, extra) => {
    if (url === 'agents/worker') {
      const { event, generation: next } = extra.body;
      reports++; maxReports = Math.max(maxReports, reports);
      try {
        if (event === 'start') { if (generation) assert.equal(next, generation); generation = next; leaseUntil = clock + 60000; }
        if (event === 'renew') {
          assert.equal(next, generation); assert.ok(clock < leaseUntil, 'lease stays live'); leaseUntil = clock + 60000;
          pulses++; if (pulses >= target) release();
        }
        const result = await original(url, extra);
        if (!lost.has(event)) { lost.add(event); throw Object.assign(Error(), { code: 'outcome_unknown' }); }
        return result;
      } finally { reports--; }
    }
    if (phase === 'idle' && url.startsWith('agents/inbox')) return { items: [], hasMore: false };
    if (phase === 'pre-dispatch' && url === 'issues/issue-one') await hold();
    return original(url, extra);
  };
  const done = await f.run('run');
  assert.equal(done.state, 'stopped'); assert.equal(f.state().closed, true);
  assert.ok(pulses >= 8); assert.equal(maxReports, 1);
  assert.equal(f.sessions.length, ['model', 'pre-dispatch'].includes(phase) ? 1 : 0);
  assert.ok(lost.has('start') && lost.has('renew') && lost.has('close'));
});

test('unknown claim is not retried and never launches a model on restart', async t => {
  const f = fixture(t); await f.run('setup'); const original = f.dependencies.api;
  let claims = 0;
  f.dependencies.api = async (url, extra) => {
    const result = await original(url, extra);
    if (extra?.body?.action === 'claim') { claims++; throw Object.assign(Error(), { code: 'outcome_unknown' }); }
    return result;
  };
  assert.equal((await f.run('run')).state, 'uncertain');
  assert.equal((await f.run('run')).state, 'uncertain');
  assert.equal(claims, 1); assert.equal(f.sessions.length, 0);
});

for (const committed of [false, true]) test(`uncertain result settlement reconciles without repeating work (committed=${committed})`, async t => {
  const f = fixture(t); await f.run('setup'); const original = f.dependencies.api;
  let settlements = 0;
  f.dependencies.api = async (url, extra) => {
    if (extra?.body?.action === 'complete') {
      settlements++; if (committed) await original(url, extra);
      throw Object.assign(Error(), { code: 'outcome_unknown' });
    }
    return original(url, extra);
  };
  assert.equal((await f.run('run')).state, 'uncertain');
  const resumed = await f.run('run');
  assert.equal(resumed.state, committed ? 'stopped' : 'uncertain');
  assert.equal(f.sessions.length, 1); assert.equal(settlements, 1);
});

test('inbox cleanup drains terminal and other-owned pages without spending', async t => {
  const f = fixture(t); await f.run('setup'); const original = f.dependencies.api;
  const rows = Array.from({ length: 51 }, (_, i) => ({ id: `seen-${i}`, status: i % 2 ? 'claimed' : 'completed', claimedBy: { name: 'other' } }));
  const seen = [];
  f.dependencies.api = async (url, extra) => {
    if (url.includes('state=claimed')) return { items: [], hasMore: false };
    if (url.includes('state=unseen')) {
      if (!rows.length) process.emit('SIGINT');
      return { items: rows.slice(0, 50), hasMore: rows.length > 50 };
    }
    if (extra?.body?.action === 'seen') { seen.push(rows.shift().id); return {}; }
    return original(url, extra);
  };
  assert.equal((await f.run('run')).state, 'stopped');
  assert.equal(seen.length, 51); assert.equal(new Set(seen).size, 51); assert.equal(f.sessions.length, 0);
});

test('uninstall uses saved ownership after runner paths disappear; setup cannot orphan it', async t => {
  const f = fixture(t); await f.run('setup'); const calls = [];
  f.dependencies.service = { platform: 'linux', home: f.dir, command: ['/trusted/collab'], execute: async (...args) => calls.push(args) };
  await f.run('install');
  f.options.cwd = path.join(f.dir, 'changed');
  await assert.rejects(f.run('setup'), { code: 'worker_service' });
  await store(`worker-${workerKey(f.selected, 'user', 'worker')}`).exclusive((state, save) => {
    state.config.cwd = path.join(f.dir, 'missing-repo'); state.config.executable = path.join(f.dir, 'missing-claude'); save(state);
  });
  assert.equal((await f.run('uninstall')).uninstalled, true);
  assert.equal(calls.length, 3);
});

test('real Claude result classification pauses provider failures without model retry', async t => {
  const f = fixture(t, ({ config, attempt, context, signal }) => claudeRunner.execute(config, attempt, context, signal, () => {}, async () => ({ code: 1,
    output: JSON.stringify({ type: 'result', subtype: 'error_during_execution', session_id: attempt.sessionId, is_error: true, total_cost_usd: 0.12, usage: { input_tokens: 1, output_tokens: 0 } }) })));
  await f.run('setup');
  const paused = await f.run('run');
  assert.equal(paused.stopReason, 'provider_error'); assert.equal(paused.usage.estimatedUSD, 0.12);
  assert.equal(f.sessions.length, 1);
  await f.run('run'); assert.equal(f.sessions.length, 1);
});

async function configureServer(t, f, respond) {
  const server = createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    res.setHeader('content-type', 'application/json');
    respond(req, res, body);
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  f.selected.base = `http://127.0.0.1:${server.address().port}`;
  f.dependencies.api = (endpoint, extra) => request(f.selected.base, `/api/apps/auth/${endpoint}?workspaceId=ws`, { ...extra, token: f.selected.token, timeout: 250 });
}

for (const rejection of ['conversion', 'labels']) test(`confirmed ${rejection} rejection permits corrected setup without changing identity or usage`, async t => {
  const f = fixture(t), bodies = [];
  await configureServer(t, f, (_req, res, body) => {
    bodies.push(body);
    if (rejection === 'conversion' && !body.convert || rejection === 'labels' && body.labelIds?.length) {
      res.statusCode = rejection === 'conversion' ? 409 : 400;
      res.end(JSON.stringify({ error: rejection === 'conversion' ? 'worker_conversion_required' : 'invalid_labels' }));
    } else res.end(JSON.stringify({ worker: { closed: true, generation: null } }));
  });
  await store(`worker-${workerKey(f.selected, 'user', 'worker')}`).exclusive((state, save) => { budget(state, workerConfig(f.options), Date.now(), true); save(state); });
  const usage = f.state().usage;
  if (rejection === 'labels') f.options['label-ids'] = '["bad-label"]';
  await assert.rejects(f.run('setup'), e => e.details.configureRejected === true);
  assert.equal(f.state().configure.body, undefined);
  assert.equal(f.state().stopReason, rejection === 'conversion' ? 'worker_conversion_required' : 'configure_rejected');
  assert.equal(f.state().stopOperation, rejection === 'conversion' ? 'configure' : null);
  if (rejection === 'conversion') f.options['manage-existing'] = true;
  else f.options['label-ids'] = '[]';
  await f.run('setup');
  assert.equal(bodies.length, 2); assert.equal(bodies[0].sessionId, bodies[1].sessionId);
  assert.equal(f.state().config.sessionId, bodies[0].sessionId); assert.deepEqual(f.state().usage, usage);
});

for (const code of ['worker_active', 'worker_conversion_required']) test(`configure ${code} persists only safe conflict details`, async t => {
  const f = fixture(t); let reject = true;
  await configureServer(t, f, (_req, res) => {
    if (reject) { res.statusCode = 409; res.end(JSON.stringify({ error: code, message: 'PRIVATE_REMOTE_TEXT' })); }
    else res.end(JSON.stringify({ worker: { closed: true } }));
  });
  await assert.rejects(f.run('setup'), { code });
  const status = await f.run('status');
  assert.equal(status.stopReason, code); assert.equal(status.stopOperation, 'configure');
  assert.equal(status.setupPending, true); assert.equal(JSON.stringify(status).includes('PRIVATE_REMOTE_TEXT'), false);
  reject = false; const setup = await f.run('setup');
  assert.equal(setup.stopReason, null); assert.equal(setup.stopOperation, null); assert.equal(setup.setupPending, false);
});

for (const outcome of ['lost-reply', 'timeout', 'server-error', 'unknown-rejection', 'invalid-response']) test(`configure ${outcome} retains the exact request until replay succeeds`, async t => {
  const f = fixture(t), bodies = [];
  await configureServer(t, f, (req, res, body) => {
    bodies.push(body);
    if (bodies.length === 1) {
      if (outcome === 'lost-reply') { req.socket.destroy(); return; }
      if (outcome === 'timeout') return;
      if (outcome === 'invalid-response') { res.end('{'); return; }
      res.statusCode = outcome === 'server-error' ? 503 : 409;
      res.end(JSON.stringify({ error: outcome === 'server-error' ? 'invalid_labels' : 'unknown_conflict' })); return;
    }
    res.end(JSON.stringify({ worker: { closed: true, generation: null } }));
  });
  await assert.rejects(f.run('setup'));
  assert.deepEqual(f.state().configure.body, bodies[0]);
  f.options['manage-existing'] = true;
  await assert.rejects(f.run('setup'), { code: 'worker_setup_pending' });
  assert.equal(bodies.length, 1);
  delete f.options['manage-existing'];
  await f.run('setup');
  assert.deepEqual(bodies[1], bodies[0]); assert.equal(f.state().configure, undefined);
});

function absentService(platform, definition) {
  if (platform === 'linux') return { stdout: 'not-found\n', stderr: '' };
  throw Object.assign(Error(), platform === 'darwin' ? { code: 113,
    stderr: `Bad request.\nCould not find service "${definition.label}" in domain for user gui: 501\n` } : { code: 0x80070002 });
}

for (const platform of ['darwin', 'linux', 'win32']) {
  for (const interrupted of ['install', 'uninstall', 'local-cleanup']) test(`${platform} teardown reconciles exact service absence after interrupted ${interrupted}`, async t => {
    const f = fixture(t), state = { config: workerConfig(f.options) }, calls = [];
    const dependencies = { platform, home: f.dir, uid: 501, command: ['/trusted/collab'] };
    const definition = serviceDefinition('partial', ['/trusted/collab'], f.dir, dependencies);
    dependencies.execute = async (command, args) => {
      calls.push([command, args]);
      if (interrupted === 'install') throw Object.assign(Error('fixture install failure'), { code: 5 });
      return { stdout: '' };
    };
    if (interrupted === 'install') await assert.rejects(workerService('worker install', 'partial', f.options, state, () => {}, dependencies), { code: 'worker_service' });
    else await workerService('worker install', 'partial', f.options, state, () => {}, dependencies);
    assert.ok(state.service); assert.ok(existsSync(state.service.file));
    if (interrupted === 'local-cleanup') rmSync(state.service.file);
    calls.length = 0;
    dependencies.execute = async (command, args) => {
      calls.push([command, args]);
      if (JSON.stringify([command, args]) === JSON.stringify(definition.inspect)) return absentService(platform, definition);
      if (platform === 'win32' && command === 'powershell.exe') return { stdout: JSON.stringify({ label: definition.label, closed: true }) };
      if (platform === 'win32' && args[0] === '/Change') assert.deepEqual(args, ['/Change', '/TN', definition.label, '/Disable']);
      else assert.deepEqual([command, args], definition.uninstall[0]);
      throw Object.assign(Error('fixture removal failure'), { code: 5 });
    };
    assert.equal((await workerService('worker uninstall', 'partial', f.options, state, () => {}, dependencies)).uninstalled, true);
    assert.equal(state.service, undefined); assert.equal(existsSync(definition.file), false);
    assert.deepEqual(calls.at(-1), platform === 'win32' && interrupted === 'local-cleanup' ? calls.find(([command]) => command === 'powershell.exe') : definition.inspect);
    assert.equal(calls.length, platform === 'win32' ? interrupted === 'local-cleanup' ? 2 : 5 : interrupted === 'local-cleanup' ? 1 : 2);
  });

  for (const outcome of ['present', 'permission', 'transport', 'other-service', 'killed']) test(`${platform} teardown retains ownership after ${outcome} inspection`, async t => {
    const f = fixture(t), state = { config: workerConfig(f.options) };
    const dependencies = { platform, home: f.dir, uid: 501, command: ['/trusted/collab'], execute: async () => ({ stdout: '' }) };
    await workerService('worker install', 'guarded', f.options, state, () => {}, dependencies);
    const owned = { ...state.service }, contents = readFileSync(owned.file, 'utf8');
    const definition = serviceDefinition('guarded', ['/trusted/collab'], f.dir, dependencies);
    dependencies.execute = async (command, args) => {
      if (JSON.stringify([command, args]) !== JSON.stringify(definition.inspect)) throw Object.assign(Error(), { code: 5 });
      if (outcome === 'present') return { stdout: platform === 'linux' ? 'loaded\n' : 'present' };
      if (outcome === 'other-service') {
        if (platform === 'darwin') return absentService(platform, { ...definition, label: 'unrelated' });
        if (platform === 'linux') return { stdout: 'not-found\nloaded\n' };
        throw Object.assign(Error(), { code: 1 });
      }
      throw Object.assign(Error(), outcome === 'permission' ? { code: platform === 'win32' ? 0x80070005 : 5 } : outcome === 'transport' ? { code: 'ETIMEDOUT' } : { code: 0x80070002, killed: true });
    };
    await assert.rejects(workerService('worker uninstall', 'guarded', f.options, state, () => {}, dependencies), { code: 'worker_service' });
    assert.deepEqual(state.service, { ...owned, retired: true }); assert.equal(readFileSync(owned.file, 'utf8'), contents);
  });
}

test('childProcess preserves UTF-8 split across real stdout chunks', async () => {
  const value = { content: 'Evidence: İstanbul/猫/🧪.ts' };
  const child = `const bytes = Buffer.from(${JSON.stringify(JSON.stringify(value))});
    process.stdin.resume(); process.stdin.once('end', () => {
      let offset = 0; const send = () => { if (offset === bytes.length) return;
        process.stdout.write(bytes.subarray(offset, ++offset)); setTimeout(send, 4); }; send();
    });`;
  const result = await childProcess(process.execPath, ['-e', child]);
  assert.equal(result.code, 0); assert.deepEqual(JSON.parse(result.output), value);
});

test('Windows uninstall closes a delayed native launch before deletion and fences retired invocations', async t => {
  const f = fixture(t); await f.run('setup');
  const identity = workerKey(f.selected, 'user', 'worker'), stateStore = store(`worker-${identity}`);
  const bin = fileURLToPath(new URL('../bin/collab.mjs', import.meta.url));
  const loader = path.join(f.dir, 'delayed.mjs');
  writeFileSync(loader, `process.send('ready'); await new Promise(resolve => process.once('message', resolve)); process.disconnect(); await import(${JSON.stringify(new URL('../bin/collab.mjs', import.meta.url).href)});`);
  writeFileSync(path.join(f.dir, 'default.json'), JSON.stringify({ origin: f.selected.base, userId: 'user', accessToken: 'FIXTURE', expiresAt: Date.now() + 60000 }), { mode: 0o600 });
  const dependencies = { platform: 'win32', command: [process.execPath, bin], execute: async () => ({ stdout: '' }) };
  await stateStore.exclusive((state, save) => workerService('worker install', identity, f.options, state, save, dependencies));
  const owned = f.state().service;
  const args = ['worker', 'run', '--agent', 'worker', '--workspace', 'ws', '--config-dir', f.dir, '--service-id', owned.installationId];
  const child = spawn(process.execPath, [loader, ...args], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  const timeout = setTimeout(() => child.kill(), 10000);
  t.after(() => { clearTimeout(timeout); if (child.exitCode === null) child.kill(); });
  child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
  let output = '', errors = '', closed = false;
  child.stdout.on('data', value => { output += value; }); child.stderr.on('data', value => { errors += value; });
  const exit = once(child, 'close').then(value => { closed = true; return value; });
  await once(child, 'message');
  assert.equal((await f.run('stop')).stopped, true);
  const actions = [];
  dependencies.execute = async (command, argv) => {
    actions.push(command === 'powershell.exe' ? 'closure' : argv[0]);
    assert.equal(f.state().service.retired, true);
    if (command === 'powershell.exe') {
      child.send('resume');
      const [code] = await exit;
      assert.equal(code, 2, output + errors); assert.match(errors, /state_locked/);
      return { stdout: JSON.stringify({ label: owned.label, closed }) };
    }
    if (argv[0] === '/Change') assert.deepEqual(argv, ['/Change', '/TN', owned.label, '/Disable']);
    else { assert.deepEqual(argv, ['/Delete', '/TN', owned.label, '/F']); assert.equal(closed, true); }
    return { stdout: '' };
  };
  const removed = await stateStore.exclusive((state, save) => workerService('worker uninstall', identity, f.options, state, save, dependencies));
  assert.equal(removed.uninstalled, true); assert.deepEqual(actions, ['/Change', 'closure', '/Delete']);
  const retired = await childProcess(process.execPath, [bin, ...args]);
  assert.equal(retired.code, 0); assert.equal(JSON.parse(retired.output).stopReason, 'service_retired');
  assert.equal(f.state().runId, undefined); assert.equal(f.state().daemonStartedAt, undefined); assert.equal(f.sessions.length, 0);
  dependencies.execute = async () => ({ stdout: '' });
  await stateStore.exclusive((state, save) => workerService('worker install', identity, f.options, state, save, dependencies));
  const before = f.state();
  const stale = await runWorker('worker run', { ...f.options, 'service-id': owned.installationId }, f.selected, 'user', f.dependencies);
  assert.equal(stale.stopReason, 'service_retired'); assert.deepEqual(f.state(), before);
  await f.run('run'); assert.equal(f.sessions.length, 1);
});

for (const proof of ['running', 'wrong-task', 'malformed', 'unavailable']) test(`Windows uninstall retains retired ownership when exact closure is ${proof}`, async t => {
  const f = fixture(t), state = { config: workerConfig(f.options) }, actions = [];
  const dependencies = { platform: 'win32', command: ['/trusted/collab'], execute: async () => ({ stdout: '' }) };
  await workerService('worker install', 'closure', f.options, state, () => {}, dependencies);
  const owned = { ...state.service };
  dependencies.execute = async (command, args) => {
    actions.push(command === 'powershell.exe' ? 'closure' : args[0]);
    if (command !== 'powershell.exe') return { stdout: '' };
    if (proof === 'unavailable') throw Object.assign(Error(), { code: 'ETIMEDOUT' });
    return { stdout: proof === 'malformed' ? '{}' : JSON.stringify({ label: proof === 'wrong-task' ? 'other' : owned.label, closed: proof !== 'running' }) };
  };
  await assert.rejects(workerService('worker uninstall', 'closure', f.options, state, () => {}, dependencies), { code: 'worker_service' });
  assert.deepEqual(actions, ['/Change', 'closure']); assert.deepEqual(state.service, { ...owned, retired: true }); assert.ok(existsSync(owned.file));
});

for (const failure of ['idle-crash', 'failed-close']) test(`exact owned lookup recovers ${failure} without the capped agents list`, async t => {
  const f = fixture(t); await f.run('setup');
  const api = f.dependencies.api;
  let failClose = failure === 'failed-close';
  f.dependencies.api = async (url, extra = {}) => {
    assert.notEqual(url, 'agents');
    if (extra.body?.event === 'close' && failClose) throw Object.assign(Error(), { code: 'outcome_unknown' });
    return api(url, extra);
  };
  if (failClose) {
    await f.run('run'); assert.equal(f.state().closed, false);
  } else {
    await store(`worker-${workerKey(f.selected, 'user', 'worker')}`).exclusive(async (state, save) => {
      state.runId = '00000000-0000-4000-8000-000000000001'; state.closed = false;
      await api('agents/worker', { method: 'POST', body: { event: 'start', generation: state.runId } }); save(state);
    });
  }
  const prior = f.state().runId; failClose = false; f.calls.length = 0;
  await f.run('run');
  assert.equal(f.calls[0].url, 'agents/worker?agent=worker');
  assert.equal(f.calls[1].body.event, 'close'); assert.equal(f.calls[1].body.generation, prior);
  assert.equal(f.state().closed, true); assert.notEqual(f.state().runId, prior); assert.equal(f.sessions.length, 1);
});

test('missing owned recovery lookup never admits another generation', async t => {
  const f = fixture(t); await f.run('setup');
  await store(`worker-${workerKey(f.selected, 'user', 'worker')}`).exclusive((state, save) => { state.runId = 'old'; state.closed = false; save(state); });
  const api = f.dependencies.api;
  f.dependencies.api = async (url, extra) => {
    if (url === 'agents/worker?agent=worker') throw Object.assign(Error(), { code: 'agent_not_found' });
    return api(url, extra);
  };
  assert.equal((await f.run('run')).stopReason, 'agent_not_found');
  assert.equal(f.state().runId, 'old'); assert.equal(f.state().closed, false); assert.equal(f.sessions.length, 0);
});

for (const stream of ['stdout', 'stderr']) test(`childProcess retains its combined byte bound and owned closure on ${stream}`, async t => {
  const f = fixture(t), pidFile = path.join(f.dir, 'bounded-child.pid');
  const child = `require('node:fs').writeFileSync(process.argv[1], String(process.pid)); process.stdin.resume();
    process.stdin.once('end', () => { process.stdout.write(Buffer.alloc(128 * 1024, 120));
      process.${stream}.write(Buffer.alloc(129 * 1024, 120)); setInterval(() => {}, 1000); });`;
  await assert.rejects(childProcess(process.execPath, ['-e', child, pidFile]), { code: 'worker_output_limit' });
  assert.throws(() => process.kill(Number(readFileSync(pidFile, 'utf8')), 0), { code: 'ESRCH' });
});
