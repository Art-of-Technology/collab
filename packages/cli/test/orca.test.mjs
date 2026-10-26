import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { terminalBinding, checkTerminal, deliverOrca, deliveryStore, runOrca, orcaCall } from '../src/orca.mjs';

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

test('setup preserves registration; verification requires actual named claim and completion, not acceptance', async t => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'collab-orca-'));
  const previous = process.env.COLLAB_CONFIG_DIR; process.env.COLLAB_CONFIG_DIR = directory;
  t.after(() => { if (previous === undefined) delete process.env.COLLAB_CONFIG_DIR; else process.env.COLLAB_CONFIG_DIR = previous; rmSync(directory, { recursive: true, force: true }); });
  let events = [], calls = [];
  const api = async (url, extra) => {
    calls.push([url, extra]);
    if (url === 'agents') return { agents: [{ name: 'pilot', host: 'laptop', sessionId: 'session-one', labelIds: ['preserve'] }] };
    if (url.startsWith('agents/handoffs/')) return { handoff: { id: 'h1', issueId: 'issue1', status: 'completed' } };
    return { activities: events };
  };
  const selected = { base: binding.origin, workspace: binding.workspace, token: 'not-forwarded' };
  const opts = { agent: 'pilot', workspace: 'workspace', host: 'laptop', 'session-id': 'session-one', terminal: 'term_one', orca: path.resolve('/trusted/orca') };
  const setup = await runOrca('orca setup', opts, selected, 'user', { api, call: async () => shown });
  assert.equal(setup.watcherStarted, false); assert.ok(calls.every(([, opts]) => !opts?.method));
  const actualBinding = { ...binding, orca: opts.orca };
  await deliveryStore(actualBinding, 'h1').exclusive((_old, save) => save({ phase: 'accepted', at: '2026-10-26T12:00:00Z' }));
  const verify = () => runOrca('orca verify', { agent: 'pilot', workspace: 'workspace', handoff: 'h1' }, selected, 'user', { api, call: async () => shown });
  assert.equal((await verify()).verified, false);
  events = ['AGENT_CLAIM', 'AGENT_COMPLETE'].map(action => ({ action, createdAt: '2026-10-26T12:01:00Z', details: { agent: { name: 'other' }, handoffId: 'h1', content: 'reply' } }));
  assert.equal((await verify()).verified, false);
  events.forEach(e => { e.details.agent.name = 'pilot'; });
  assert.equal((await verify()).verified, true);
  events.forEach(e => { e.createdAt = '2026-10-26T11:00:00Z'; });
  assert.equal((await verify()).verified, false, 'historical activity cannot prove this wake');
});

test('Orca child never inherits COLLAB_TOKEN and cancellation closes it', async () => {
  const prior = process.env.COLLAB_TOKEN; process.env.COLLAB_TOKEN = 'private-value';
  try {
    const output = await orcaCall(process.execPath, ['-e', 'console.log(JSON.stringify({ok:true,hasToken:!!process.env.COLLAB_TOKEN}))', '--']);
    assert.equal(output.hasToken, false);
    const controller = new AbortController();
    const pending = orcaCall(process.execPath, ['-e', 'setTimeout(()=>{},30000)', '--'], controller.signal);
    controller.abort(); await assert.rejects(pending, /Orca failed/);
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
