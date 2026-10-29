import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runCoordinator, classifyTask } from '../src/coordinator.mjs';
import { runWorker, workerKey } from '../src/worker.mjs';
import { store } from '../src/client.mjs';

const config = { workers: ['worker'], overdueSeconds: 1, stallSeconds: 60 };
const task = { id: 'task', issueId: 'issue', issue: { projectId: 'project', issueKey: 'TEST-1' }, status: 'open', content: 'Read package.json only', recipientNames: ['worker'], labelIds: [], createdAt: '2026-10-27T00:00:00Z', updatedAt: '2026-10-27T00:00:00Z' };
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
      if (extra.body.action === 'claim') item.status = 'claimed';
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
    item: () => item, setItem: value => { item = value; }, workerDisk: store(`worker-${workerKey(selected, 'user', 'worker')}`) };
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
  assert.equal((await f.run('run')).decisions[0].action, 'blocked');
  assert.equal(f.starts(), 0);
  await f.workerDisk.exclusive((s, save) => save({ ...s, stopReason: null, runId: 'old', closed: false }));
  assert.equal((await f.run('run')).decisions[0].reason, 'worker_closure_or_binding');
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
  assert.equal(recovered.decisions[0].reason, 'uncertain_prior_dispatch');
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
  assert.equal((await f.run('run')).decisions[0].reason, 'backoff'); assert.equal(calls, 1);
  clock += 30001; await f.run('run'); assert.equal(calls, 2);
  clock += 60001; await f.run('run'); assert.equal(calls, 3);
  clock += 120001; assert.equal((await f.run('run')).decisions[0].reason, 'retry_limit'); assert.equal(calls, 3);
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

test('coordinator conflict codes survive HTTP without exposing arbitrary response text', async t => {
  const { createServer } = await import('node:http');
  const { once } = await import('node:events');
  const { request } = await import('../src/client.mjs');
  const server = createServer((_req, res) => { res.writeHead(409, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'coordinator_fenced', error_description: 'secret details' })); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  await assert.rejects(request(`http://127.0.0.1:${server.address().port}`, '/api/apps/auth/agents/coordinator', { method: 'POST', body: {} }), error => error.code === 'coordinator_fenced' && !error.message.includes('secret'));
});
