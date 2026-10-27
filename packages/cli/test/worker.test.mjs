import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
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
import { store } from '../src/client.mjs';

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
      if (url === 'agents') return { agents: [{ name: 'worker', worker: remote }] };
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
  writeFileSync(state.service.file, 'unowned definition');
  await assert.rejects(workerService('worker uninstall', 'test', f.options, state, () => {}, deps), { code: 'worker_service' });
  assert.equal(calls.length, 2);
  writeFileSync(state.service.file, preview.content);
  await workerService('worker uninstall', 'test', f.options, state, () => {}, deps);
  assert.equal(calls.length, 3);
  assert.throws(() => serviceDefinition('test', ['executable'], '/repo', '/state', { platform: 'unsupported' }), { code: 'worker_service' });
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
    if (req.url.includes('/agents/worker')) { remote = { generation: body.generation, closed: ['configure', 'close'].includes(body.event) }; res.end(JSON.stringify({ worker: remote })); }
    else if (req.url.includes('/agents/inbox')) {
      res.end(JSON.stringify({ items: !allowWork || status === 'completed' ? [] : [{ id: 'h', status, updatedAt: '2026-10-27T00:00:00Z' }], hasMore: false })); polled();
    }
    else if (req.url.startsWith('/api/apps/auth/agents?')) res.end(JSON.stringify({ agents: [{ name: 'worker', worker: remote }] }));
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
