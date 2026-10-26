import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { terminalBinding, checkTerminal, deliverOrca, deliveryStore, runOrca, orcaCall } from '../src/orca.mjs';
import { watchInbox } from '../src/inbox-watch.mjs';

const shown = { ok: true, _meta: { runtimeId: 'runtime-one' }, result: { terminal: {
  handle: 'term_one', incarnationId: 'process-one', worktreePath: '/pilot', agentIdentity: 'codex',
  executionHostId: 'local', connected: true, writable: true,
} } };
const target = terminalBinding(shown);
const binding = { origin: 'https://collab.example', workspace: 'workspace', userId: 'user', agent: 'pilot', host: 'laptop', sessionId: 'session-one', orca: '/trusted/orca', target };
const event = { agent: 'pilot', workspaceId: 'workspace', origin: binding.origin, claimed: { items: [] }, unseen: { items: [{ id: 'handoff-one', status: 'open' }] } };
const accepted = { ok: true, result: { send: { accepted: true, handle: 'term_one', prompt: { processIncarnation: 'process-one', requestId: 'request-one', provider: 'codex', stages: ['input_accepted'] } } } };
function receipts() {
  const rows = new Map();
  return (_binding, id) => ({ load: () => rows.get(id) || {}, exclusive: async cb => cb(rows.get(id) || {}, value => rows.set(id, value)) });
}

test('terminal binding rejects shell, remote, stale and replaced processes', () => {
  for (const change of [{ connected: false }, { writable: false }, { agentIdentity: 'shell' }, { executionHostId: 'remote' }, { orphaned: true }]) {
    assert.throws(() => terminalBinding({ ...shown, result: { terminal: { ...shown.result.terminal, ...change } } }));
  }
  assert.throws(() => checkTerminal({ ...shown, _meta: { runtimeId: 'replacement' } }, target));
  assert.throws(() => checkTerminal({ ...shown, result: { terminal: { ...shown.result.terminal, incarnationId: 'replacement' } } }, target));
});

test('persistent per-handoff receipts suppress restart, queue permutation and claim transition duplicates', async () => {
  const receiptStore = receipts(); let sends = 0, last;
  const call = async (_exe, args) => { if (args[1] === 'show') return shown; sends++; assert.ok(!args.join(' ').includes('SECRET TASK CONTENT')); return accepted; };
  await deliverOrca(binding, event, value => { last = value; }, undefined, call, receiptStore);
  assert.equal(last.phase, 'accepted'); assert.equal(last.turnStarted, false); assert.equal(sends, 1);
  // A new adapter invocation has no in-memory delivery cache.
  assert.equal(await deliverOrca(binding, { ...event, claimed: { items: event.unseen.items }, unseen: { items: [] } }, () => {}, undefined, call, receiptStore), false);
  assert.equal(sends, 1);
  await deliverOrca(binding, { ...event, unseen: { items: [...event.unseen.items, { id: 'handoff-two', content: 'SECRET TASK CONTENT' }] } }, () => {}, undefined, call, receiptStore);
  assert.equal(sends, 2);
});

test('unknown outcome and negative/old-host/wrong-process receipts stop without resending', async () => {
  for (const response of [null, { ok: true, result: { accepted: true } }, { ...accepted, result: { send: { ...accepted.result.send, prompt: { ...accepted.result.send.prompt, processIncarnation: 'other' } } } }, { ...accepted, result: { send: { ...accepted.result.send, accepted: false } } }]) {
    const receiptStore = receipts(); let sends = 0;
    const call = async (_exe, args) => { if (args[1] === 'show') return shown; sends++; if (!response) throw Error('transport lost'); return response; };
    await assert.rejects(deliverOrca(binding, event, () => {}, undefined, call, receiptStore));
    await assert.rejects(deliverOrca(binding, event, () => {}, undefined, call, receiptStore), /uncertain/);
    assert.equal(sends, 1);
  }
});

test('foreign workspace/agent and unsafe IDs are rejected before invoking Orca', async () => {
  for (const altered of [{ ...event, workspaceId: 'foreign' }, { ...event, agent: 'other' }, { ...event, unseen: { items: [{ id: '$(touch /tmp/bad)' }] } }]) {
    await assert.rejects(deliverOrca(binding, altered, () => {}, undefined, () => assert.fail('must not call host'), receipts()));
  }
});

test('private receipts persist on disk and are separated by user/workspace/incarnation', async t => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'collab-orca-'));
  const previous = process.env.COLLAB_CONFIG_DIR; process.env.COLLAB_CONFIG_DIR = directory;
  t.after(() => { if (previous === undefined) delete process.env.COLLAB_CONFIG_DIR; else process.env.COLLAB_CONFIG_DIR = previous; rmSync(directory, { recursive: true, force: true }); });
  // Windows uses the same existing tested private-ACL store as credentials.
  await deliveryStore(binding, 'h1').exclusive((_old, save) => save({ phase: 'accepted' }));
  assert.equal(deliveryStore(binding, 'h1').load().phase, 'accepted');
  assert.deepEqual(deliveryStore({ ...binding, userId: 'another' }, 'h1').load(), {});
  assert.deepEqual(deliveryStore({ ...binding, target: { ...target, incarnationId: 'new' } }, 'h1').load(), {});
});

test('setup preserves registration; verification uses open server revisions despite local clock skew', async t => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'collab-orca-'));
  const previous = process.env.COLLAB_CONFIG_DIR; process.env.COLLAB_CONFIG_DIR = directory;
  t.after(() => { if (previous === undefined) delete process.env.COLLAB_CONFIG_DIR; else process.env.COLLAB_CONFIG_DIR = previous; rmSync(directory, { recursive: true, force: true }); });
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-26T11:59:00Z') });
  let events = [], calls = [];
  const api = async (url, extra) => {
    calls.push([url, extra]);
    if (url === 'agents') return { agents: [{ name: 'pilot', host: 'laptop', sessionId: 'session-one', labelIds: ['preserve'] }] };
    if (url.startsWith('agents/handoffs/')) return { handoff: { id: url.split('/')[2].split('?')[0], issueId: 'issue1', status: 'completed' } };
    return { activities: events };
  };
  const selected = { base: binding.origin, workspace: binding.workspace, token: 'not-forwarded' };
  const opts = { agent: 'pilot', workspace: 'workspace', host: 'laptop', 'session-id': 'session-one', terminal: 'term_one', orca: path.resolve('/trusted/orca') };
  const setup = await runOrca('orca setup', opts, selected, 'user', { api, call: async () => shown });
  assert.equal(setup.watcherStarted, false); assert.ok(calls.every(([, opts]) => !opts?.method));
  const actualBinding = { ...binding, orca: opts.orca };
  const wake = item => deliverOrca(actualBinding, { ...event, unseen: { items: [item] } }, () => {}, undefined,
    async (_exe, args) => args[1] === 'show' ? shown : accepted);
  await wake({ id: 'h1', status: 'open', updatedAt: '2026-10-26T12:02:00Z' });
  assert.equal(deliveryStore(actualBinding, 'h1').load().at, '2026-10-26T11:59:00.000Z');
  const verify = (handoff = 'h1') => runOrca('orca verify', { agent: 'pilot', workspace: 'workspace', handoff }, selected, 'user', { api, call: async () => shown });
  assert.equal((await verify()).verified, false);
  events = ['AGENT_CLAIM', 'AGENT_COMPLETE'].map((action, index) => ({ action, createdAt: `2026-10-26T12:0${index}:00Z`, details: { agent: { name: 'pilot' }, handoffId: 'h1', content: 'reply' } }));
  assert.equal((await verify()).verified, false, 'historical activity after a slow local clock cannot prove this wake');
  events.forEach(e => { e.createdAt = '2026-10-26T12:03:00Z'; e.details.agent.name = 'other'; });
  assert.equal((await verify()).verified, false);
  events.forEach(e => { e.details.agent.name = 'pilot'; });
  assert.equal((await verify()).verified, true);
  for (const e of events) {
    e.createdAt = '2026-10-26T12:02:00Z';
    assert.equal((await verify()).verified, false, 'both events must be strictly later than the baseline');
    e.createdAt = '2026-10-26T12:03:00Z';
  }
  events[1].details.content = ' ';
  assert.equal((await verify()).verified, false);
  events[1].details.content = 'reply';
  t.mock.timers.setTime(Date.parse('2026-10-26T13:00:00Z'));
  await wake({ id: 'h1', status: 'open', updatedAt: '2026-10-26T12:04:00Z' });
  assert.equal((await verify()).verified, false, 'release replaces the baseline for both events');
  events.forEach(e => { e.createdAt = '2026-10-26T12:05:00Z'; });
  assert.equal((await verify()).verified, true, 'a fast local clock does not reject new server activity');
  t.mock.timers.setTime(Date.parse('2026-10-26T11:59:00Z'));
  for (const item of [
    { id: 'completed', status: 'completed', updatedAt: '2026-10-26T12:01:00Z' },
    { id: 'claimed', status: 'claimed', updatedAt: '2026-10-26T12:00:00Z' },
    { id: 'missing-revision', status: 'open' },
    { id: 'invalid-revision', status: 'open', updatedAt: 'invalid' },
  ]) {
    await wake(item);
    events.forEach(e => { e.details.handoffId = item.id; });
    const result = await verify(item.id);
    assert.equal(result.hostAccepted, true);
    assert.equal(result.verified, false, `${item.id} cannot supply an open server baseline`);
  }
  await deliveryStore(actualBinding, 'old-receipt').exclusive((_old, save) => save({ phase: 'accepted', at: '2026-10-26T11:59:00Z' }));
  events.forEach(e => { e.details.handoffId = 'old-receipt'; });
  assert.equal((await verify('old-receipt')).verified, false);
});

test('Orca child never inherits COLLAB_TOKEN and cancellation closes it', async () => {
  const prior = process.env.COLLAB_TOKEN; process.env.COLLAB_TOKEN = 'private-value';
  try {
    const output = await orcaCall(process.execPath, ['-e', 'console.log(JSON.stringify({ok:true,hasToken:!!process.env.COLLAB_TOKEN}))', '--']);
    assert.equal(output.hasToken, false);
    const controller = new AbortController();
    const pending = orcaCall(process.execPath, ['-e', 'setTimeout(()=>{},30000)', '--'], controller.signal);
    controller.abort(); await assert.rejects(pending, error => error === controller.signal.reason);
  } finally { if (prior === undefined) delete process.env.COLLAB_TOKEN; else process.env.COLLAB_TOKEN = prior; }
});

test('released work wakes again but ordinary claimed progress does not', async () => {
  const receiptStore = receipts(); let sends = 0;
  const call = async (_exe, args) => { if (args[1] === 'show') return shown; sends++; return accepted; };
  const open = date => ({ ...event, unseen: { items: [{ id: 'handoff-one', status: 'open', updatedAt: date }] } });
  await deliverOrca(binding, open('2026-10-26T20:00:00Z'), () => {}, undefined, call, receiptStore);
  await deliverOrca(binding, { ...event, unseen: { items: [{ id: 'handoff-one', status: 'claimed', updatedAt: '2026-10-26T20:01:00Z' }] } }, () => {}, undefined, call, receiptStore);
  assert.equal(sends, 1);
  await deliverOrca(binding, open('2026-10-26T20:02:00Z'), () => {}, undefined, call, receiptStore);
  assert.equal(sends, 2);
});

test('watcher retains Orca revisions for release detection across both inbox queues', async () => {
  const receiptStore = receipts(), controller = new AbortController();
  const states = ['open', 'claimed', 'claimed', 'open'];
  let poll = 0, sends = 0;
  const result = await watchInbox({ agent: binding.agent, workspaceId: binding.workspace, origin: binding.origin,
    signal: controller.signal, durationMs: 2000, intervalMs: 1,
    read: async state => {
      if (poll === states.length) { controller.abort(); controller.signal.throwIfAborted(); }
      const item = { id: 'handoff-one', status: states[poll], updatedAt: `2026-10-26T20:0${poll}:00Z` };
      if (state === 'unseen') poll++;
      return { items: state === 'claimed' && item.status !== 'claimed' ? [] : [item], hasMore: false };
    },
    deliver: (payload, signal) => deliverOrca(binding, payload, () => {}, signal,
      async (_exe, args) => { if (args[1] === 'show') return shown; sends++; return accepted; }, receiptStore),
  });
  assert.equal(result.stopped, true);
  assert.equal(result.callbacks, 2);
  assert.equal(sends, 2);
  assert.equal(receiptStore(binding, 'handoff-one').load().openRevision, '2026-10-26T20:03:00Z');
});

test('preflight expiry and stop cancel cleanly without receipts or dispatch', async () => {
  for (const mode of ['expiry', 'stop']) {
    const receiptStore = receipts(), controller = new AbortController(), reports = [];
    let sends = 0, last;
    const result = await watchInbox({ agent: binding.agent, workspaceId: binding.workspace, origin: binding.origin,
      signal: controller.signal, durationMs: mode === 'expiry' ? 30 : 2000, intervalMs: 1,
      read: async state => ({ ...event[state], hasMore: false }),
      report: async name => { reports.push(name); },
      deliver: (payload, signal) => deliverOrca(binding, payload, value => { last = value; }, signal,
        async (_exe, args, probeSignal) => {
          if (args[1] === 'send') { sends++; return accepted; }
          const pending = orcaCall(process.execPath, ['-e', 'setTimeout(()=>{},30000)', '--'], probeSignal);
          if (mode === 'stop') controller.abort();
          return pending;
        }, receiptStore),
    });
    assert.equal(result.callbacks, 0);
    assert.equal(result.timedOut, mode === 'expiry');
    assert.equal(result.stopped, mode === 'stop');
    assert.equal(sends, 0);
    assert.equal(last, undefined);
    assert.deepEqual(receiptStore(binding, 'handoff-one').load(), {});
    assert.deepEqual(reports, ['started', 'poll', 'stopped']);
  }
});

test('cancellation after dispatch remains uncertain and never resends', async () => {
  const receiptStore = receipts(), controller = new AbortController(), reports = [];
  let sends = 0, last;
  const call = async (_exe, args, signal) => {
    if (args[1] === 'show') return shown;
    sends++;
    controller.abort();
    throw signal.reason;
  };
  await assert.rejects(watchInbox({ agent: binding.agent, workspaceId: binding.workspace, origin: binding.origin,
    signal: controller.signal, durationMs: 2000, intervalMs: 1,
    read: async state => ({ ...event[state], hasMore: false }),
    report: async (name, _signal, errorCode) => { reports.push([name, errorCode]); },
    deliver: (payload, signal) => deliverOrca(binding, payload, value => { last = value; }, signal, call, receiptStore),
  }), { code: 'orca_delivery_uncertain' });
  assert.equal(last.phase, 'attempting');
  assert.deepEqual(last.handoffIds, ['handoff-one']);
  assert.equal(receiptStore(binding, 'handoff-one').load().phase, 'attempting');
  assert.deepEqual(reports.at(-1), ['error', 'orca_delivery_uncertain']);
  await assert.rejects(deliverOrca(binding, event, () => {}, undefined, call, receiptStore), { code: 'orca_delivery_uncertain' });
  assert.equal(sends, 1);
});

test('supervisor cancellation reaches registration and terminal checks initially and on renewal', async t => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'collab-orca-'));
  const previous = process.env.COLLAB_CONFIG_DIR; process.env.COLLAB_CONFIG_DIR = directory;
  t.after(() => { if (previous === undefined) delete process.env.COLLAB_CONFIG_DIR; else process.env.COLLAB_CONFIG_DIR = previous; rmSync(directory, { recursive: true, force: true }); });
  const selected = { base: binding.origin, workspace: binding.workspace, token: 'private' };
  const options = { agent: 'pilot', workspace: 'workspace', host: 'laptop', 'session-id': 'session-one', terminal: 'term_one', orca: path.resolve('/trusted/orca') };
  const agent = { name: 'pilot', host: 'laptop', sessionId: 'session-one' };
  await runOrca('orca setup', options, selected, 'user', { api: async () => ({ agents: [agent] }), call: async () => shown });
  for (const stage of ['registration', 'terminal']) for (const window of [0, 1]) for (const stopSignal of ['SIGINT', 'SIGTERM']) {
    let windows = 0;
    const listeners = process.listenerCount(stopSignal);
    const cancel = signal => {
      assert.ok(signal instanceof AbortSignal);
      process.emit(stopSignal);
      signal.throwIfAborted();
      assert.fail('supervisor did not cancel the read');
    };
    const result = await runOrca('orca watch', options, selected, 'user', {
      api: async (_url, { signal }) => { if (stage === 'registration' && windows === window) cancel(signal); return { agents: [agent] }; },
      call: async (_exe, args, signal) => { assert.equal(args[1], 'show'); if (stage === 'terminal' && windows === window) cancel(signal); return shown; },
      watch: async () => { windows++; return { callbacks: 0, timedOut: true }; },
    });
    assert.deepEqual(result, { stopped: true, windows: window, callbacks: 0 });
    assert.equal(process.listenerCount(stopSignal), listeners);
  }
  assert.equal((await runOrca('orca setup', options, selected, 'user', { api: async () => ({ agents: [agent] }), call: async () => shown })).configured, true);
});

test('status retains private recovery metadata during live failures while verification fails closed', async t => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'collab-orca-'));
  const previous = process.env.COLLAB_CONFIG_DIR; process.env.COLLAB_CONFIG_DIR = directory;
  t.after(() => { if (previous === undefined) delete process.env.COLLAB_CONFIG_DIR; else process.env.COLLAB_CONFIG_DIR = previous; rmSync(directory, { recursive: true, force: true }); });
  const selected = { base: binding.origin, workspace: binding.workspace, token: 'PRIVATE-TOKEN' };
  const options = { agent: 'pilot', workspace: 'workspace', host: 'laptop', 'session-id': 'session-one', terminal: 'term_one', orca: path.resolve('/trusted/orca') };
  let outage, phase, sends = 0;
  const dependencies = {
    api: async () => {
      if (outage === 'registration') throw Object.assign(Error('PRIVATE-TOKEN response body'), { code: 'unauthorized' });
      return { agents: [{ name: 'pilot', host: 'laptop', sessionId: 'session-one', watcher: { state: 'stopped' } }] };
    },
    call: async (_exe, args) => {
      if (args[1] === 'show') { if (outage === 'terminal') throw Error('PRIVATE-TOKEN host failure'); return shown; }
      sends++;
      if (phase === 'attempting') throw Error('PRIVATE-TOKEN connection lost');
      return accepted;
    },
    watch: async ({ deliver, signal }) => {
      await deliver({ ...event, unseen: { items: [{ id: phase, status: 'open', updatedAt: '2026-10-26T12:00:00Z' }] } }, signal);
      process.emit('SIGINT');
      return { callbacks: 1 };
    },
  };
  await runOrca('orca setup', options, selected, 'user', dependencies);
  for (phase of ['accepted', 'attempting']) {
    outage = undefined;
    const pending = runOrca('orca watch', options, selected, 'user', dependencies);
    if (phase === 'attempting') await assert.rejects(pending, { code: 'orca_delivery_uncertain' });
    else assert.equal((await pending).callbacks, 1);
    for (outage of ['registration', 'terminal']) {
      const result = await runOrca('orca status', options, selected, 'user', dependencies);
      assert.deepEqual(result.target, target);
      assert.equal(result.agent, binding.agent);
      assert.equal(result.host, binding.host);
      assert.equal(result.sessionId, binding.sessionId);
      assert.equal(result.lastDelivery.phase, phase);
      assert.deepEqual(result.lastDelivery.handoffIds, [phase]);
      if (phase === 'accepted') assert.equal(result.lastDelivery.requestId, 'request-one');
      assert.deepEqual(result.liveHealth, { ok: false, error: outage === 'registration' ? 'unauthorized' : 'orca_status_failed' });
      assert.equal(result.watcher, null);
      assert.equal(result.modelExecutionVerified, false);
      assert.equal(JSON.stringify(result).includes('PRIVATE-TOKEN'), false);
      await assert.rejects(runOrca('orca verify', { ...options, handoff: phase }, selected, 'user', dependencies));
    }
  }
  outage = undefined;
  const status = await runOrca('orca status', options, selected, 'user', dependencies);
  assert.deepEqual(status.liveHealth, { ok: true });
  assert.deepEqual(status.watcher, { state: 'stopped' });
  assert.equal(status.lastDelivery.phase, 'attempting');
  await assert.rejects(runOrca('orca watch', options, selected, 'user', dependencies), { code: 'orca_delivery_uncertain' });
  assert.equal(sends, 2);
});

test('supervisor renews normal expiry, stops on operational failure and releases its lock', async t => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'collab-orca-'));
  const previous = process.env.COLLAB_CONFIG_DIR; process.env.COLLAB_CONFIG_DIR = directory;
  t.after(() => { if (previous === undefined) delete process.env.COLLAB_CONFIG_DIR; else process.env.COLLAB_CONFIG_DIR = previous; rmSync(directory, { recursive: true, force: true }); });
  const selected = { base: binding.origin, workspace: binding.workspace, token: 'private' };
  const options = { agent: 'pilot', workspace: 'workspace', host: 'laptop', 'session-id': 'session-one', terminal: 'term_one', orca: path.resolve('/trusted/orca') };
  let windows = 0;
  const dependencies = { api: async () => ({ agents: [{ name: 'pilot', host: 'laptop', sessionId: 'session-one' }] }), call: async () => shown,
    watch: async () => { windows++; if (windows === 3) throw Error('auth failure'); return { callbacks: 0, timedOut: true }; } };
  await runOrca('orca setup', options, selected, 'user', dependencies);
  await assert.rejects(runOrca('orca watch', options, selected, 'user', dependencies), /auth failure/);
  assert.equal(windows, 3);
  assert.equal((await runOrca('orca setup', options, selected, 'user', dependencies)).configured, true);
});
