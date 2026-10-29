import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { runCoordinator, classifyTask } from '../src/coordinator.mjs';
import { runWorker, workerKey } from '../src/worker.mjs';
import { store } from '../src/client.mjs';

const config = { workers: ['worker'], overdueSeconds: 1, stallSeconds: 60 };
const task = { id: 'task', issueId: 'issue', issue: { projectId: 'project', issueKey: 'TEST-1' }, status: 'open', previouslyClaimed: false, content: 'Read package.json only', recipientNames: ['worker'], labelIds: [], createdAt: '2026-10-27T00:00:00Z', updatedAt: '2026-10-27T00:00:00Z' };
const agent = { id: 'worker-id', name: 'worker', owned: true, labelIds: [], managedWorker: { closed: true, state: 'stopped' } };
const now = Date.parse('2026-10-29T00:00:00Z');

test('project decisions distinguish no route, liveness, progress and operational blockers', () => {
  const decide = (t = task, a = [agent]) => classifyTask(t, a, config, now);
  assert.equal(decide().action, 'dispatch');
  assert.equal(decide(task, [{ ...agent, managedWorker: null }]).reason, 'no_execution_route');
  assert.equal(decide(task, [{ ...agent, owned: false }]).action, 'blocked');
  assert.equal(decide({ ...task, status: 'claimed', claimedBy: { name: 'author' } }).reason, 'progress_overdue');
  assert.equal(decide({ ...task, status: 'claimed', updatedAt: new Date(now).toISOString() }).reason, 'working');
  for (const state of ['config', 'uncertain', 'needs-login', 'usage-limit', 'restart-limit']) {
    assert.equal(decide(task, [{ ...agent, managedWorker: { closed: true, state } }]).action, 'blocked');
  }
  assert.equal(decide(task, [{ ...agent, managedWorker: { state: 'idle', closed: false, leaseUntil: new Date(now + 60000).toISOString() } }]).reason, 'healthy_idle');
  assert.equal(decide(task, [{ ...agent, managedWorker: { state: 'working', closed: false, leaseUntil: new Date(now - 1).toISOString() } }]).reason, 'stale_heartbeat');
  assert.equal(decide({ ...task, previouslyClaimed: true }).reason, 'prior_claim');
  assert.equal(decide(task, [{ ...agent, owned: false, managedWorker: { closed: false, state: 'working', leaseUntil: new Date(now + 1000).toISOString() } }]).reason, 'busy');
  assert.equal(decide({ ...task, status: 'claimed', claimedBy: { id: agent.id, name: agent.name } }, [{ ...agent, managedWorker: { closed: true, state: 'needs-login' } }]).reason, 'needs-login');
  const second = { ...agent, name: 'worker-two', labelIds: ['label'] };
  for (const recipient of [{ recipientNames: ['worker', 'worker-two'], labelIds: [] }, { recipientNames: [], labelIds: ['label'] }]) {
    const first = { ...agent, labelIds: ['label'], managedWorker: { closed: false, state: 'working' } };
    assert.equal(classifyTask({ ...task, ...recipient }, [first, second], { ...config, workers: ['worker', 'worker-two'] }, now).agent, 'worker-two');
    assert.equal(classifyTask({ ...task, ...recipient }, [agent, second], { ...config, workers: ['worker', 'worker-two'] }, now, name => name === 'worker' ? 'requested_stop' : true).agent, 'worker-two');
  }
});

async function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coordinator-test-'));
  const old = process.env.COLLAB_CONFIG_DIR; process.env.COLLAB_CONFIG_DIR = dir;
  t.after(() => { if (old === undefined) delete process.env.COLLAB_CONFIG_DIR; else process.env.COLLAB_CONFIG_DIR = old; fs.rmSync(dir, { recursive: true, force: true }); });
  const selected = { base: 'https://example.test', workspace: 'ws', token: 'synthetic' };
  const options = { agent: 'coordinator', workspace: 'ws', project: 'project', workers: 'worker', 'overdue-seconds': '1' };
  let item = structuredClone(task), remote = structuredClone(agent.managedWorker), starts = 0, leaseCalls = 0;
  const calls = [];
  const api = async (url, extra = {}) => {
    calls.push({ url, body: extra.body });
    if (url === 'agents/worker?agent=coordinator') return { agent: { name: 'coordinator', host: 'host', sessionId: '535749ab-8486-433b-a17d-ce1cf3c6aec7', worker: null } };
    if (url === 'agents/worker?agent=worker') return { agent: { worker: remote } };
    if (url === 'agents/coordinator') { leaseCalls++; return { lease: extra.body }; }
    if (url.startsWith('agents/coordinator?')) return { project: 'project', items: ['open', 'claimed'].includes(item.status) ? [item] : [], agents: [{ ...agent, managedWorker: remote }], nextCursor: null };
    if (url === 'agents/worker') { remote = { state: extra.body.state, generation: extra.body.generation, closed: ['configure', 'close'].includes(extra.body.event) }; return { worker: remote }; }
    if (url.startsWith(`agents/handoffs/${item.id}`)) {
      if (!extra.method) return { handoff: item };
      if (extra.body.action === 'claim') { item.status = 'claimed'; item.claimedBy = { id: agent.id, name: agent.name }; }
      if (extra.body.action === 'complete') item.status = 'completed';
      return item;
    }
    if (url === 'issues/issue') return { id: 'issue', project: { id: 'project' } };
    throw Error(`unexpected endpoint ${url}`);
  };
  const runner = { doctor: async () => ({ ready: true }), execute: async (_config, _job, _context, _signal, started) => {
    starts++; started(); return { outcome: 'complete', content: 'package.json evidence', estimatedUSD: 0.001, tokens: {}, error: false };
  } };
  await runWorker('worker setup', { agent: 'worker', workspace: 'ws', host: 'host', cwd: dir, claude: process.execPath, 'attempt-usd': '0.1', 'daily-usd': '0.1' }, selected, 'user', { api, runner });
  const deps = { api, once: true, now: () => now, workerDependencies: { runner } };
  const run = command => runCoordinator(`coordinator ${command}`, options, selected, 'user', deps);
  await run('setup');
  return { dir, run, options, selected, deps, calls, starts: () => starts, leaseCalls: () => leaseCalls,
    item: () => item, setItem: value => { item = value; }, workerDisk: store(`worker-${workerKey(selected, 'user', 'worker')}`),
    coordDisk: store(`coord-${createHash('sha256').update(JSON.stringify([selected.base, 'ws', 'project', 'user', 'coordinator'])).digest('base64url')}`) };
}

test('coordinator executes only the bound task through the actual fenced worker and replay does not repeat model', async t => {
  const f = await fixture(t);
  const result = await f.run('run');
  assert.equal(result.error, undefined);
  assert.equal(f.starts(), 1); assert.equal(f.item().status, 'completed');
  assert.equal(f.calls.filter(c => c.body?.action === 'claim').length, 1);
  assert.equal(result.attempts.task.pending, false);
  await f.run('run'); assert.equal(f.starts(), 1);
  assert.equal(f.workerDisk.load().usage.totalStarts, 1);
  f.setItem({ ...task, id: 'task-two' });
  const next = await f.run('run');
  assert.equal(f.starts(), 1, 'budget prevents another model');
  assert.equal(next.paused, false); assert.ok(next.decisions.some(d => d.reason === 'usage_limit'));
});

test('explicit worker stop and uncertain local state are never blindly restarted', async t => {
  const f = await fixture(t);
  await f.workerDisk.exclusive((s, save) => save({ ...s, stopReason: 'requested_stop' }));
  assert.equal((await f.run('run')).decisions.at(-1).action, 'blocked');
  assert.equal(f.starts(), 0);
  await f.workerDisk.exclusive((s, save) => save({ ...s, stopReason: null, runId: 'old', closed: false }));
  assert.equal((await f.run('run')).decisions.at(-1).reason, 'worker_closure_or_binding');
  assert.equal(f.starts(), 0);
});

test('unknown dispatch outcome remains pending after a new coordinator invocation', async t => {
  const f = await fixture(t);
  f.deps.worker = async () => { throw Object.assign(Error('unknown'), { code: 'outcome_unknown' }); };
  const first = await f.run('run');
  assert.equal(first.attempts.task.pending, true); assert.equal(first.paused, true);
  assert.equal((await f.run('run')).state, 'paused');
  await f.run('setup');
  const recovered = await f.run('run');
  assert.equal(recovered.decisions.at(-1).reason, 'uncertain_prior_dispatch');
  assert.equal(f.starts(), 0);
});

test('foreign project task fails closed before dispatch and lease conflict is not retried', async t => {
  const f = await fixture(t);
  f.setItem({ ...task, issue: { projectId: 'other' } });
  assert.equal((await f.run('run')).error, 'coordinator_response'); assert.equal(f.starts(), 0);
  await f.run('setup');
  const api = f.deps.api;
  f.deps.api = async (url, extra) => { if (url === 'agents/coordinator') throw Object.assign(Error(), { code: 'coordinator_conflict' }); return api(url, extra); };
  assert.equal((await f.run('run')).error, 'coordinator_conflict'); assert.equal(f.starts(), 0);
});

test('closed transient failures back off and stop at the retained retry limit', async t => {
  const f = await fixture(t); let clock = now, calls = 0;
  f.deps.now = () => clock;
  f.deps.worker = async () => {
    calls++;
    await f.workerDisk.exclusive((s, save) => save({ ...s, closed: true, stopReason: 'transport_failed' }));
    throw Object.assign(Error(), { code: 'transport_failed' });
  };
  await f.run('run'); assert.equal(calls, 1);
  assert.equal((await f.run('run')).decisions.at(-1).reason, 'backoff'); assert.equal(calls, 1);
  clock += 30001; await f.run('run'); assert.equal(calls, 2);
  clock += 60001; await f.run('run'); assert.equal(calls, 3);
  clock += 120001; assert.equal((await f.run('run')).decisions.at(-1).reason, 'retry_limit'); assert.equal(calls, 3);
});

test('real worker closes a transient read failure and retries after backoff', async t => {
  const f = await fixture(t); let clock = now, failRead = true;
  f.deps.now = () => clock;
  f.deps.workerDependencies.sleep = async (ms, _value, { signal } = {}) => { if (ms === 10000 && signal) await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true })); };
  const api = f.deps.api;
  f.deps.api = async (url, extra) => {
    if (failRead && url.startsWith('agents/handoffs/task?')) throw Object.assign(Error(), { code: 'transport_failed' });
    return api(url, extra);
  };
  const first = await f.run('run');
  assert.equal(first.decisions.at(-1).reason, 'transport_failed');
  assert.equal(f.workerDisk.load().status, 'retrying');
  failRead = false; clock += 30001;
  const second = await f.run('run');
  assert.equal(second.attempts.task.count, 2); assert.equal(f.starts(), 1);
});

for (const phase of ['reserved', 'claimed']) test(`closed transient ${phase} reservation resumes the same task`, async t => {
  const f = await fixture(t); let clock = now, reads = 0, failing = true;
  f.deps.now = () => clock;
  f.deps.workerDependencies.sleep = async (ms, _value, { signal } = {}) => { if (ms === 10000 && signal) await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true })); };
  const api = f.deps.api;
  f.deps.api = async (url, extra) => {
    if (url.startsWith('agents/handoffs/task?')) reads++;
    if (failing && (phase === 'reserved' ? url.startsWith('agents/handoffs/task?') && reads >= 2 : url === 'issues/issue')) throw Object.assign(Error(), { code: 'transport_failed' });
    return api(url, extra);
  };
  const first = await f.run('run');
  assert.equal(first.attempts.task.pending, false); assert.equal(f.workerDisk.load().active.phase, phase); assert.equal(f.starts(), 0);
  assert.equal((await f.run('run')).decisions.at(-1).reason, 'backoff');
  failing = false; clock += 30001;
  const resumed = await f.run('run');
  assert.equal(resumed.attempts.task.count, 2); assert.equal(f.item().status, 'completed'); assert.equal(f.starts(), 1);
  assert.equal(f.workerDisk.load().usage.totalStarts, 1);
});

test('a changed claimant never resumes a retained claimed reservation', async t => {
  const f = await fixture(t); let clock = now;
  f.deps.now = () => clock;
  f.deps.workerDependencies.sleep = async (ms, _value, { signal } = {}) => { if (ms === 10000 && signal) await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true })); };
  const api = f.deps.api;
  f.deps.api = async (url, extra) => { if (url === 'issues/issue') throw Object.assign(Error(), { code: 'transport_failed' }); return api(url, extra); };
  await f.run('run');
  f.setItem({ ...f.item(), claimedBy: { id: 'other', name: 'other' } }); clock += 30001;
  await f.run('run'); assert.equal(f.starts(), 0); assert.equal(f.workerDisk.load().active.phase, 'claimed');
});

test('a transient model failure remains uncertain and is never replayed', async t => {
  const f = await fixture(t); let starts = 0;
  f.deps.workerDependencies.runner.execute = async (_config, _job, _context, _signal, started) => { starts++; started(); throw Object.assign(Error(), { code: 'transport_failed' }); };
  const result = await f.run('run');
  assert.equal(result.paused, true); assert.equal(result.attempts.task.pending, true);
  assert.equal(f.workerDisk.load().active.phase, 'uncertain');
  await f.run('run'); assert.equal(starts, 1);
});

test('monitoring continues across pages while one worker is running', { timeout: 15000 }, async t => {
  const f = await fixture(t), api = f.deps.api; let release, started, scans = 0, workerCalls = 0;
  const running = new Promise(resolve => { started = resolve; });
  const held = new Promise(resolve => { release = resolve; }); t.after(() => release());
  const runner = f.deps.workerDependencies.runner;
  f.deps.workerDependencies.runner = { ...runner, execute: async (...args) => { workerCalls++; args[4](); started(); await held; return runner.execute(...args); } };
  f.deps.once = false; f.deps.sleep = (ms, value, options) => delay(ms === 1000 ? 5 : ms, value, options);
  await f.coordDisk.exclusive((s, save) => { s.config.pollSeconds = 1; save(s); });
  const other = { ...task, id: 'remote-task', recipientNames: ['remote'] };
  f.deps.api = async (url, extra) => {
    if (url.startsWith('agents/coordinator?')) {
      scans++;
      const current = await api(url, extra);
      return { ...current, items: [...current.items, other], agents: [...current.agents, { ...agent, id: 'remote-id', name: 'remote', owned: false, managedWorker: { closed: false, state: 'working', leaseUntil: new Date(now + 60000).toISOString() } }] };
    }
    return api(url, extra);
  };
  const run = f.run('run'); await running;
  while (scans < 2 || !f.coordDisk.load().scan?.complete) await delay(5);
  const status = await runCoordinator('coordinator status', f.options, f.selected, 'user', f.deps);
  assert.ok(status.scan.decisions.some(d => d.handoffId === 'remote-task' && d.reason === 'busy'));
  assert.equal(workerCalls, 1); release();
  while (f.coordDisk.load().attempts.task?.pending) await delay(5);
  await f.run('stop'); await run; assert.equal(workerCalls, 1);
});

for (const cause of ['coordinator abort', 'SIGTERM']) test(`${cause} does not persist public stop intent`, async t => {
  const f = await fixture(t), api = f.deps.api, interrupt = new AbortController();
  let reached; const reading = new Promise(resolve => { reached = resolve; });
  const interruptedApi = async (url, extra) => {
    if (url.startsWith('agents/handoffs/task?')) { reached(); await new Promise(resolve => extra.signal.addEventListener('abort', resolve, { once: true })); throw extra.signal.reason; }
    return api(url, extra);
  };
  const run = runWorker('worker run', { agent: 'worker', workspace: 'ws' }, f.selected, 'user', { ...f.deps.workerDependencies, api: interruptedApi, task: { id: 'task', project: 'project' }, signal: interrupt.signal });
  await reading; if (cause === 'SIGTERM') process.emit('SIGTERM'); else interrupt.abort(); await run;
  assert.equal(f.workerDisk.load().stopReason, 'interrupted');
  assert.equal(store(`ctl-${workerKey(f.selected, 'user', 'worker')}`).load().stopRequested, false);
  await f.run('run'); assert.equal(f.starts(), 1);
});

test('task-bound worker exits after losing a claim race and preserves decision history', async t => {
  const f = await fixture(t); const api = f.deps.api; let claims = 0;
  f.deps.api = async (url, extra) => {
    if (extra?.body?.action === 'claim') { claims++; throw Object.assign(Error(), { code: 'already_claimed' }); }
    return api(url, extra);
  };
  const first = await f.run('run');
  assert.equal(claims, 1); assert.equal(f.starts(), 0); assert.equal(first.attempts.task.pending, false);
  f.setItem({ ...task, status: 'completed' });
  const second = await f.run('run');
  assert.equal(second.decisions.length, 1); assert.equal(second.decisions[0].handoffId, 'task');
});

test('five completed coordinator tasks do not consume crash restart allowance', async t => {
  const f = await fixture(t);
  await f.workerDisk.exclusive((s, save) => { s.config.dailyUSD = 5; save(s); });
  for (let i = 0; i < 5; i++) {
    f.setItem({ ...task, id: `task-${i}` });
    const result = await f.run('run');
    assert.equal(result.error, undefined); assert.equal(f.item().status, 'completed');
  }
  assert.equal(f.starts(), 5); assert.equal(f.workerDisk.load().usage.restarts, 0);
  await f.workerDisk.exclusive((s, save) => { s.closed = false; s.stopReason = 'interrupted_attempt'; s.restarts = Array(3).fill(Date.now()); save(s); });
  f.setItem({ ...task, id: 'crash-limit' });
  const result = await runWorker('worker run', { agent: 'worker', workspace: 'ws' }, f.selected, 'user', f.deps.workerDependencies);
  assert.equal(result.stopReason, 'restart_limit');
});

test('public stop of a closed worker persists until setup', async t => {
  const f = await fixture(t);
  assert.equal((await runWorker('worker stop', { agent: 'worker', workspace: 'ws' }, f.selected, 'user')).stopped, true);
  assert.equal(f.workerDisk.load().stopReason, 'requested_stop');
  assert.equal((await f.run('run')).decisions.at(-1).reason, 'requested_stop'); assert.equal(f.starts(), 0);
  await runWorker('worker setup', { agent: 'worker', workspace: 'ws' }, f.selected, 'user', { ...f.deps.workerDependencies, api: f.deps.api });
  await f.run('run'); assert.equal(f.starts(), 1);
});

test('public stop racing a claimed task prevents model dispatch', async t => {
  const f = await fixture(t); const api = f.deps.api;
  let release, reached;
  const atIssue = new Promise(resolve => { reached = resolve; });
  const proceed = new Promise(resolve => { release = resolve; });
  f.deps.api = async (url, extra) => { if (url === 'issues/issue') { reached(); await proceed; } return api(url, extra); };
  const running = f.run('run'); await atIssue;
  const stopping = runWorker('worker stop', { agent: 'worker', workspace: 'ws' }, f.selected, 'user');
  const controls = store(`ctl-${workerKey(f.selected, 'user', 'worker')}`);
  for (let i = 0; i < 1000 && !controls.load().stopRequested; i++) await new Promise(resolve => setImmediate(resolve));
  assert.ok(controls.load().stopRequested); release();
  assert.equal((await stopping).stopped, true); await running;
  assert.equal(f.starts(), 0); assert.equal(f.workerDisk.load().stopReason, 'requested_stop');
});

test('status pages cover the complete current scan and retain history', async t => {
  const f = await fixture(t), api = f.deps.api;
  await f.run('run');
  const items = Array.from({ length: 51 }, (_, i) => ({ ...task, id: `task-${String(i).padStart(2, '0')}` }));
  f.deps.api = async (url, extra) => url.startsWith('agents/coordinator?') ? { project: 'project', items: url.includes('&cursor=') ? items.slice(50) : items.slice(0, 50), nextCursor: url.includes('&cursor=') ? null : items[49].id, agents: [{ ...agent, owned: false, managedWorker: { closed: false, state: 'working', leaseUntil: new Date(now + 10000).toISOString() } }] } : api(url, extra);
  const result = await f.run('run'); assert.equal(result.scan.count, 51); assert.equal(result.decisions.length, 50);
  for (const page of [1, 2, 3]) {
    const status = await runCoordinator('coordinator status', { ...f.options, page }, f.selected, 'user', f.deps);
    assert.equal(status.scan.pages, 3); assert.equal(status.scan.decisions.length, page === 3 ? 1 : 25);
    assert.equal(status.scan.decisions[0].handoffId, items[(page - 1) * 25].id);
    assert.equal(status.dispatchHistory[0].handoffId, 'task');
  }
  assert.equal(f.starts(), 1);
});

test('full journal prunes only reconciled terminal work and preserves uncertainty', async t => {
  const f = await fixture(t), api = f.deps.api;
  const records = Object.fromEntries(Array.from({ length: 99 }, (_, i) => [`held-${i}`, { count: 1, pending: true, worker: 'worker', at: now }]));
  records.resolved = { count: 1, pending: false, worker: 'worker', at: now };
  await f.coordDisk.exclusive((s, save) => { s.attempts = records; save(s); });
  await f.workerDisk.exclusive((s, save) => { s.closed = true; save(s); });
  f.deps.api = async (url, extra) => url.startsWith('agents/handoffs/resolved?') ? { handoff: { id: 'resolved', status: 'completed', issue: { projectId: 'project' } } } : api(url, extra);
  const result = await f.run('run');
  assert.equal(result.attempts.resolved, undefined); assert.equal(result.attempts['held-0'].pending, true); assert.equal(f.starts(), 1);
  f.setItem({ ...task, id: 'new-task' });
  const blocked = await f.run('run');
  assert.equal(blocked.decisions.at(-1).reason, 'journal_retention_unresolved'); assert.equal(f.starts(), 1);
});

test('explicit coordinator stop persists a pause; setup preserves prior task history', async t => {
  const f = await fixture(t);
  await f.run('run');
  await f.run('stop');
  assert.equal((await f.run('run')).state, 'paused');
  await f.run('setup');
  const resumed = await f.run('run');
  assert.equal(resumed.attempts.task.count, 1); assert.equal(f.starts(), 1);
});

test('coordinator service definition carries exact project and installation identity', async t => {
  const f = await fixture(t);
  f.options['dry-run'] = true;
  const result = await f.run('install');
  assert.equal(result.dryRun, true); assert.equal(result.installed, false);
  assert.ok(result.content.includes('coordinator'));
  assert.ok(result.content.includes('--project'));
  assert.ok(result.content.includes(result.installationId));
  assert.equal(f.starts(), 0);
});

test('coordinator and claim conflict codes survive HTTP without exposing response text', async t => {
  const { createServer } = await import('node:http');
  const { once } = await import('node:events');
  const { request } = await import('../src/client.mjs');
  const server = createServer((req, res) => { res.writeHead(409, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: req.url.startsWith('/api/apps/auth/agents/handoffs/') ? 'already_claimed' : 'coordinator_fenced', error_description: 'secret details' })); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  await assert.rejects(request(`http://127.0.0.1:${server.address().port}`, '/api/apps/auth/agents/coordinator', { method: 'POST', body: {} }), error => error.code === 'coordinator_fenced' && !error.message.includes('secret'));
  await assert.rejects(request(`http://127.0.0.1:${server.address().port}`, '/api/apps/auth/agents/handoffs/task', { method: 'PATCH', body: {} }), error => error.code === 'already_claimed' && !error.message.includes('secret'));
});
