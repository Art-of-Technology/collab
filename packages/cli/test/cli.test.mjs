import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { ChildProcess, spawn, spawnSync } from 'node:child_process';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { once } from 'node:events';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, chmodSync, symlinkSync, statSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { aclFailureKind, windowsAcl } from '../src/windows-acl.mjs';
import { commands } from '../src/commands.mjs';
import { watchInbox } from '../src/inbox-watch.mjs';
import { CliError } from '../src/client.mjs';

const bin = fileURLToPath(new URL('../bin/collab.mjs', import.meta.url));
const executable = process.env.COLLAB_CLI_EXECUTABLE;
const windows = process.platform === 'win32';

test('ACL failure diagnostics classify subprocess failures without exposing output', () => {
  const run = (code, options = {}) => spawnSync(process.execPath, ['-e', code], { encoding: 'utf8', ...options });
  const exited = run("process.stderr.write('PRIVATE_SENTINEL'); process.exit(7)");
  assert.equal(aclFailureKind(exited), 'nonzero-exit');
  assert.equal(aclFailureKind(run('setInterval(() => {}, 1000)', { timeout: 100 })), 'timeout');
  assert.equal(aclFailureKind(spawnSync(path.join('missing-private-path', 'no-executable'))), 'spawn-error');
  if (!windows) assert.equal(aclFailureKind(run("process.kill(process.pid, 'SIGTERM')")), 'signal');
});

test('ACL fails closed when a subprocess timeout has a zero exit status', () => {
  const original = childProcess.spawnSync;
  try {
    childProcess.spawnSync = () => ({ status: 0, error: { code: 'ETIMEDOUT' } });
    syncBuiltinESMExports();
    let reason;
    assert.equal(windowsAcl('synthetic', true, value => { reason = value; }), false);
    assert.equal(reason, 'timeout');
  } finally {
    childProcess.spawnSync = original;
    syncBuiltinESMExports();
  }
});

test('manual transfer offer commands preserve recipient, request identity and explicit acceptance', async t => {
  const f = await fixture(t);
  const requestId = '12345678-1234-4234-8234-123456789012';
  const created = await f.run(['transfers', 'offer', '--agent', 'owner', '--handoff-id', 'original', '--to-agent', 'peer', '--request-id', requestId, '--content', 'Stopped and ready', '--workspace', 'w']);
  assert.equal(created.code, 0, created.stderr);
  assert.equal(f.calls.at(-1).url, '/api/apps/auth/agents/transfer-offers?workspaceId=w');
  assert.deepEqual(JSON.parse(f.calls.at(-1).body), { agent: 'owner', handoffId: 'original', toAgent: 'peer', requestId, content: 'Stopped and ready' });
  const list = await f.run(['transfers', 'list', '--agent', 'peer', '--limit', '10', '--workspace', 'w']);
  assert.equal(list.code, 0, list.stderr); assert.equal(f.calls.at(-1).method, 'GET');
  for (const action of ['accept', 'cancel']) {
    const result = await f.run(['transfers', action, 'offer-one', '--agent', 'peer', '--workspace', 'w']);
    assert.equal(result.code, 0, result.stderr); assert.equal(f.calls.at(-1).method, 'PATCH');
    assert.deepEqual(JSON.parse(f.calls.at(-1).body), { agent: 'peer', action });
  }
  assert.notEqual((await f.run(['transfers', 'offer', '--agent', 'owner', '--handoff-id', 'original', '--to-agent', 'peer', '--content', 'No identity'])).code, 0);
});

test('manual review commands send the exact reviewer, revision and hold version without a handoff mutation', async t => {
  const f = await fixture(t, (_req, res) => res.end(JSON.stringify({ items: [], nextCursor: 'next_cursor' })));
  const requestId = '12345678-1234-4234-8234-123456789012', revision = 'a'.repeat(40);
  const requestArgs = ['reviews', 'request', '--agent', 'author', '--handoff-id', 'claim-1', '--reviewer-agent-id', 'reviewer-id',
    '--request-id', requestId, '--repository', 'org/repo', '--pull-request-number', '42', '--revision', revision,
    '--content-file', '-', '--workspace', 'w'];
  assert.equal((await f.run(requestArgs, { input: 'Review this exact head 📝' })).code, 0);
  const first = f.calls.at(-1);
  assert.equal(first.method, 'POST'); assert.equal(first.url, '/api/apps/auth/agents/reviews?workspaceId=w');
  assert.deepEqual(JSON.parse(first.body), { agent: 'author', handoffId: 'claim-1', reviewerAgentId: 'reviewer-id', requestId,
    repository: 'org/repo', pullRequestNumber: 42, revision, content: 'Review this exact head 📝' });
  assert.equal((await f.run(requestArgs, { input: 'Review this exact head 📝' })).code, 0);
  assert.equal(f.calls.at(-1).body, first.body, 'an explicit retry preserves the request ID and payload');
  assert.equal((await f.run(['reviews', 'list', '--agent', 'reviewer', '--limit', '10', '--cursor', 'next_cursor', '--workspace', 'w'])).code, 0);
  assert.equal(f.calls.at(-1).url, '/api/apps/auth/agents/reviews?workspaceId=w&agent=reviewer&limit=10&cursor=next_cursor');
  assert.equal((await f.run(['reviews', 'get', 'review-1', '--agent', 'author', '--workspace', 'w'])).code, 0);
  assert.equal(f.calls.at(-1).url, '/api/apps/auth/agents/reviews/review-1?workspaceId=w&agent=author');
  const actions = [
    [['claim', 'review-1', '--agent', 'reviewer'], { agent: 'reviewer', action: 'claim' }],
    [['reply', 'review-1', '--agent', 'reviewer', '--verdict', 'approved', '--reviewed-revision', revision, '--content', 'Reviewed'],
      { agent: 'reviewer', verdict: 'approved', reviewedRevision: revision, content: 'Reviewed', action: 'reply' }],
    [['hold', 'review-1', '--agent', 'author', '--reason', 'Waiting for checks', '--expected-hold-version', '0'],
      { agent: 'author', reason: 'Waiting for checks', expectedHoldVersion: 0, action: 'hold' }],
    [['release-hold', 'review-1', '--agent', 'author', '--expected-hold-version', '1'],
      { agent: 'author', expectedHoldVersion: 1, action: 'release_hold' }],
    [['resolve', 'review-1', '--agent', 'author'], { agent: 'author', action: 'resolve' }],
    [['cancel', 'review-1', '--agent', 'author', '--reason', 'Superseded'], { agent: 'author', reason: 'Superseded', action: 'cancel' }],
  ];
  for (const [args, body] of actions) {
    const result = await f.run(['reviews', ...args, '--workspace', 'w']);
    assert.equal(result.code, 0, result.stderr);
    const call = f.calls.at(-1);
    assert.equal(call.method, 'PATCH'); assert.equal(call.url, '/api/apps/auth/agents/reviews/review-1?workspaceId=w');
    assert.deepEqual(JSON.parse(call.body), body);
  }
  assert.ok(f.calls.every(call => !call.url.includes('handoffs/')), 'review commands must not complete or transfer the original claim');
});

test('review commands reject malformed identity, revision, verdict, hold versions and content before HTTP', async t => {
  const f = await fixture(t), revision = 'b'.repeat(40);
  const body = { agent: 'author', handoffId: 'h', reviewerAgentId: 'reviewer-id', requestId: '12345678-1234-4234-8234-123456789012',
    repository: 'org/repo', pullRequestNumber: 42, revision, content: 'Review' };
  for (const bad of [
    { reviewerAgentId: '' }, { reviewerAgentId: 'not a stable ID' }, { requestId: 'probe-name' },
    { repository: 'https://example.com/org/repo' }, { pullRequestNumber: 0 }, { pullRequestNumber: 2147483648 },
    { revision: 'b'.repeat(39) }, { revision: 'B'.repeat(40) }, { content: ' '.repeat(3) }, { content: '\u0000' }, { content: '\ud800' }, { content: 'x'.repeat(16001) },
  ]) {
    const result = await f.run(['reviews', 'request', '--input', '-'], { input: JSON.stringify({ ...body, ...bad }) });
    assert.notEqual(result.code, 0);
  }
  for (const args of [
    ['reply', 'r', '--agent', 'peer', '--verdict', 'maybe', '--reviewed-revision', revision, '--content', 'x'],
    ['reply', 'r', '--agent', 'peer', '--verdict', 'approved', '--reviewed-revision', 'short', '--content', 'x'],
    ['hold', 'r', '--agent', 'author', '--reason', 'x', '--expected-hold-version', '-1'],
    ['release-hold', 'r', '--agent', 'author'],
    ['cancel', 'r', '--agent', 'author', '--reason', '   '],
    ['list', '--agent', 'peer', '--cursor', 'bad cursor'],
  ]) assert.notEqual((await f.run(['reviews', ...args])).code, 0);
  assert.equal(f.calls.length, 0);
});

test('review errors stay sanitized and uncertain writes are never retried automatically', async t => {
  const f = await fixture(t, (req, res, _body, calls) => {
    if (req.method === 'POST') { res.writeHead(503); res.end(JSON.stringify({ error: 'review_unavailable', error_description: 'PRIVATE_SENTINEL' })); }
    else { res.writeHead(409); res.end(JSON.stringify({ error: 'hold_changed', error_description: 'PRIVATE_SENTINEL' })); }
  });
  const args = ['reviews', 'request', '--agent', 'author', '--handoff-id', 'h', '--reviewer-agent-id', 'peer-id',
    '--request-id', '12345678-1234-4234-8234-123456789012', '--repository', 'org/repo', '--pull-request-number', '1', '--revision', 'c'.repeat(40), '--content', 'Review'];
  const result = await f.run(args);
  assert.equal(result.error.error, 'outcome_unknown'); assert.equal(f.calls.length, 1);
  assert.ok(!result.stderr.includes('PRIVATE_SENTINEL'));
  const hold = await f.run(['reviews', 'release-hold', 'r', '--agent', 'author', '--expected-hold-version', '0']);
  assert.equal(hold.error.error, 'hold_changed'); assert.match(hold.error.message, /Read this review again/);
  assert.ok(!hold.stderr.includes('PRIVATE_SENTINEL')); assert.equal(f.calls.length, 2);
});

test('review request explains an existing active review without exposing server text', async t => {
  const f = await fixture(t, (_req, res) => {
    res.writeHead(409); res.end(JSON.stringify({ error: 'review_already_active', error_description: 'PRIVATE_SENTINEL' }));
  });
  const result = await f.run(['reviews', 'request', '--agent', 'author', '--handoff-id', 'h', '--reviewer-agent-id', 'peer-id',
    '--request-id', '12345678-1234-4234-8234-123456789012', '--repository', 'org/repo', '--pull-request-number', '1', '--revision', 'c'.repeat(40), '--content', 'Review']);
  assert.equal(result.error.error, 'review_already_active');
  assert.match(result.error.message, /already has an active review/);
  assert.ok(!result.stderr.includes('PRIVATE_SENTINEL'));
  assert.equal(f.calls.length, 1);
});

test('review and transfer conflicts explain the existing work without exposing server text', async t => {
  const f = await fixture(t, (req, res) => {
    res.writeHead(409);
    res.end(JSON.stringify({ error: req.url.includes('/reviews') ? 'transfer_offer_pending' : 'review_already_active', error_description: 'PRIVATE_SENTINEL' }));
  });
  const review = await f.run(['reviews', 'request', '--agent', 'author', '--handoff-id', 'h', '--reviewer-agent-id', 'peer-id',
    '--request-id', '12345678-1234-4234-8234-123456789012', '--repository', 'org/repo', '--pull-request-number', '1', '--revision', 'c'.repeat(40), '--content', 'Review']);
  assert.equal(review.error.error, 'transfer_offer_pending');
  assert.match(review.error.message, /pending transfer offer/);
  const transfer = await f.run(['transfers', 'offer', '--agent', 'author', '--handoff-id', 'h', '--to-agent', 'peer', '--request-id', '12345678-1234-4234-8234-123456789012', '--content', 'Transfer']);
  assert.equal(transfer.error.error, 'review_already_active');
  assert.match(transfer.error.message, /active review/);
  assert.ok(!(review.stderr + transfer.stderr).includes('PRIVATE_SENTINEL'));
  assert.equal(f.calls.length, 2);
});

test('handoff review conflicts use fixed guidance only on handoff endpoints', async t => {
  const f = await fixture(t, (_req, res) => {
    res.writeHead(409); res.end(JSON.stringify({ error: 'review_already_active', error_description: 'PRIVATE_SENTINEL' }));
  });
  const close = await f.run(['handoffs', 'complete', 'h', '--agent', 'author', '--content', 'Done']);
  const pass = await f.run(['handoffs', 'send', '--agent', 'author', '--issue', 'APP-1', '--content', 'Pass', '--to-agents', '["peer"]', '--after-id', 'h']);
  for (const result of [close, pass]) {
    assert.equal(result.error.error, 'review_already_active');
    assert.match(result.error.message, /Resolve or cancel the active review/);
    assert.ok(!result.stderr.includes('PRIVATE_SENTINEL'));
  }
  const unrelated = await f.run(['agents', 'list']);
  assert.equal(unrelated.error.error, 'conflict');
  assert.ok(!unrelated.stderr.includes('PRIVATE_SENTINEL'));
});

test('a review denied by workspace scope fails without retry or leaking server details', async t => {
  const f = await fixture(t, (_req, res) => {
    res.writeHead(403); res.end(JSON.stringify({ error: 'forbidden', error_description: 'PRIVATE_SENTINEL' }));
  });
  const result = await f.run(['reviews', 'get', 'review-1', '--agent', 'reviewer', '--workspace', 'other-workspace']);
  assert.notEqual(result.code, 0);
  assert.equal(f.calls.length, 1);
  assert.match(f.calls[0].url, /workspaceId=other-workspace/);
  assert.ok(!result.stderr.includes('PRIVATE_SENTINEL'));
});

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

test('handoff send requires a recipient and distinguishes the sender before dispatch', async t => {
  const f = await fixture(t);
  const base = ['handoffs', 'send', '--agent', 'builder-a', '--issue', 'APP-1', '--content', 'Please review'];
  for (const extra of [[], ['--to-agents', '[]'], ['--to-agents', '[]', '--to-labels', '[]']]) {
    const result = await f.run([...base, ...extra]);
    assert.equal(result.error.error, 'required_field');
    assert.match(result.error.message, /--to-agents or --to-labels/);
    assert.match(result.error.message, /--agent is the sender/);
  }
  const json = await f.run(['handoffs', 'send', '--input', '-'], {
    input: JSON.stringify({ agent: 'builder-a', issue: 'APP-1', content: 'Please review', toAgents: [] }),
  });
  assert.equal(json.error.error, 'required_field');
  assert.equal(f.calls.length, 0);

  for (const [flag, values] of [['--to-agents', '["reviewer"]'], ['--to-labels', '["review-role"]']]) {
    const result = await f.run([...base, flag, values]);
    assert.equal(result.code, 0, result.stderr);
  }
  const withJsonRecipient = await f.run(['handoffs', 'send', '--input', '-'], {
    input: JSON.stringify({ agent: 'builder-a', issue: 'APP-1', content: 'Please review', toAgents: ['reviewer'] }),
  });
  assert.equal(withJsonRecipient.code, 0, withJsonRecipient.stderr);
  assert.equal(f.calls.length, 3);
  assert.match((await f.run(['schema'])).data.commands['handoffs send'].description, /--agent.*sender|Send from --agent/);
});

test('handoff validation errors do not expose server response text', async t => {
  const f = await fixture(t, (_req, res) => {
    res.writeHead(400, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'invalid_request', error_description: 'PRIVATE_SENTINEL' }));
  });
  const result = await f.run(['handoffs', 'send', '--agent', 'builder-a', '--issue', 'APP-1', '--content', 'Review', '--to-agents', '["reviewer"]']);
  assert.equal(result.error.error, 'invalid_request');
  assert.match(result.error.message, /--agent \(sender\).*--to-agents.*--issue.*--content.*--request-id.*--after-id/);
  assert.ok(!result.stderr.includes('PRIVATE_SENTINEL'));
  assert.equal(f.calls.length, 1);
  const other = await f.run(['issues', 'create', '--project', 'project-one', '--title', 'Test']);
  assert.equal(other.error.message, 'Collab refused the request (HTTP 400).');
  assert.ok(!other.stderr.includes('PRIVATE_SENTINEL'));
  assert.equal(f.calls.length, 2);
});

test('handoff and transfer request IDs match server UUID validation before dispatch', async t => {
  const f = await fixture(t);
  const send = ['handoffs', 'send', '--agent', 'builder-a', '--issue', 'APP-1', '--content', 'Review', '--to-agents', '["reviewer"]'];
  const offer = ['transfers', 'offer', '--agent', 'builder-a', '--handoff-id', 'original', '--to-agent', 'reviewer', '--content', 'Ready'];
  const invalid = 'buildwake-coordinator-probe-20261105-e527a903';
  for (const base of [send, offer]) {
    for (const value of [invalid, '12345678-1234-4234-8234-123456789012\n']) {
      const result = await f.run([...base, '--request-id', value]);
      assert.equal(result.error.error, 'invalid_value');
      assert.match(result.error.message, /--request-id must be a UUID/);
      assert.ok(!result.stderr.includes(value));
    }
  }
  for (const [command, body] of [
    [['handoffs', 'send'], { agent: 'builder-a', issue: 'APP-1', content: 'Review', toAgents: ['reviewer'] }],
    [['transfers', 'offer'], { agent: 'builder-a', handoffId: 'original', toAgent: 'reviewer', content: 'Ready' }],
  ]) for (const value of [invalid, null, 'not-a-uuid', 42, true, [], {}, ...['\n', '\r', '\r\n', '\u2028', '\u2029'].map(end => `12345678-1234-4234-8234-123456789012${end}`)]) {
    const result = await f.run([...command, '--input', '-'], { input: JSON.stringify({ ...body, requestId: value }) });
    assert.equal(result.error.error, 'invalid_value');
    assert.match(result.error.message, /--request-id must be a UUID/);
  }
  assert.equal(f.calls.length, 0, 'invalid request IDs must not reach the server');

  const validIds = ['12345678-1234-4234-8234-123456789012', 'ABCDEFAB-CDEF-ABCD-EFAB-CDEFABCDEFAB', '00000000-0000-0000-0000-000000000000'];
  for (const requestId of validIds) {
    const result = await f.run([...send, '--request-id', requestId]);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(JSON.parse(f.calls.at(-1).body).requestId, requestId);
  }
  assert.equal((await f.run([...offer, '--request-id', validIds[0]])).code, 0);
  assert.equal((await f.run(send)).code, 0, 'request ID is optional for handoffs');
  const json = await f.run(['handoffs', 'send', '--input', '-'], {
    input: JSON.stringify({ agent: 'builder-a', issue: 'APP-1', content: 'Review', toAgents: ['reviewer'], requestId: validIds[0] }),
  });
  assert.equal(json.code, 0, json.stderr);
});

test('review wait scans pages and returns only pending or claimed IDs for the exact reviewer', async t => {
  const f = await fixture(t, (req, res) => {
    if (req.url.includes('/agents/worker?')) return res.end(JSON.stringify({ agent: { id: 'reviewer-id', name: 'reviewer' } }));
    const cursor = new URL(req.url, 'http://localhost').searchParams.get('cursor');
    res.end(JSON.stringify(cursor ? { view: 'incoming-v1', items: [{ id: 'mine', reviewerAgentId: 'reviewer-id', status: 'pending', content: 'PRIVATE_SENTINEL' }], nextCursor: null } :
      { view: 'incoming-v1', items: [], nextCursor: 'next_page' }));
  });
  const result = await f.run(['reviews', 'wait', '--agent', 'reviewer', '--reviewer-id', 'reviewer-id', '--wait-seconds', '3', '--workspace', 'w']);
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(result.data, { items: [{ id: 'mine', status: 'pending' }], nextCursor: null, timedOut: false });
  assert.ok(!result.stdout.includes('PRIVATE_SENTINEL'));
  assert.equal(f.calls.length, 4);
  assert.ok(f.calls.every(call => call.method === 'GET' && call.url.includes('workspaceId=w')));
  assert.equal(new URL(f.calls[2].url, 'http://localhost').searchParams.get('cursor'), 'next_page');
});

test('review wait polls arrivals, times out empty and refuses old servers or invalid pages', async t => {
  const args = ['reviews', 'wait', '--agent', 'reviewer', '--reviewer-id', 'reviewer-id', '--wait-seconds', '3'];
  const arrival = await fixture(t, (req, res, _body, calls) => req.url.includes('/agents/worker?')
    ? res.end(JSON.stringify({ agent: { id: 'reviewer-id', name: 'reviewer' } }))
    : res.end(JSON.stringify({ view: 'incoming-v1', items: calls.filter(call => call.url.includes('/agents/reviews?')).length < 2 ? [] :
      [{ id: 'mine', reviewerAgentId: 'reviewer-id', status: 'claimed', content: 'PRIVATE_SENTINEL' }], nextCursor: null })));
  const found = await arrival.run(args);
  assert.deepEqual(found.data, { items: [{ id: 'mine', status: 'claimed' }], nextCursor: null, timedOut: false });
  assert.equal(arrival.calls.filter(call => call.url.includes('/agents/reviews?')).length, 2);
  const empty = await fixture(t, (req, res) => res.end(req.url.includes('/agents/worker?') ? '{"agent":{"id":"reviewer-id","name":"reviewer"}}' : '{"view":"incoming-v1","items":[],"nextCursor":null}'));
  const timedOut = await empty.run([...args.slice(0, -1), '1']);
  assert.deepEqual(timedOut.data, { items: [], nextCursor: null, timedOut: true });
  const old = await fixture(t, (req, res) => { if (req.url.includes('/agents/worker?')) return res.end('{"agent":{"id":"reviewer-id","name":"reviewer"}}'); res.writeHead(404); res.end('{}'); });
  const unsupported = await old.run(args);
  assert.notEqual(unsupported.code, 0); assert.equal(unsupported.error.error, 'not_found');
  const oldIgnoringFilter = await fixture(t, (req, res) => res.end(req.url.includes('/agents/worker?') ? '{"agent":{"id":"reviewer-id","name":"reviewer"}}' : '{"items":[],"nextCursor":null}'));
  const ignored = await oldIgnoringFilter.run(args);
  assert.equal(ignored.error.error, 'review_filter_unsupported');
  const oldUnfiltered = await fixture(t, (req, res) => res.end(req.url.includes('/agents/worker?') ? '{"agent":{"id":"reviewer-id","name":"reviewer"}}' : '{"items":[{"id":"old","reviewerAgentId":"reviewer-id","status":"cancelled"}],"nextCursor":null}'));
  assert.equal((await oldUnfiltered.run(args)).error.error, 'review_filter_unsupported');
  const wrongRows = await fixture(t, (req, res) => res.end(req.url.includes('/agents/worker?') ? '{"agent":{"id":"reviewer-id","name":"reviewer"}}' : '{"view":"incoming-v1","items":[{"id":"other","reviewerAgentId":"other-id","status":"pending"}],"nextCursor":null}'));
  assert.equal((await wrongRows.run(args)).error.error, 'invalid_response');
  const malformed = await fixture(t, (req, res) => res.end(req.url.includes('/agents/worker?') ? '{"agent":{"id":"reviewer-id","name":"reviewer"}}' : '{"view":"incoming-v1","items":[],"nextCursor":"repeat"}'));
  const invalid = await malformed.run(args);
  assert.notEqual(invalid.code, 0); assert.equal(invalid.error.error, 'invalid_response');
  assert.equal(malformed.calls.length, 3);
  assert.notEqual((await malformed.run(['reviews', 'wait', '--agent', 'reviewer'])).code, 0);
  assert.equal(malformed.calls.length, 3);
  const wrongIdentity = await fixture(t, (_req, res) => res.end('{"agent":{"id":"different-id","name":"reviewer"}}'));
  const mismatch = await wrongIdentity.run(args);
  assert.equal(mismatch.error.error, 'reviewer_identity_mismatch');
  assert.equal(wrongIdentity.calls.length, 1);
  const changed = await fixture(t, (req, res, _body, calls) => {
    if (req.url.includes('/agents/worker?')) return res.end(JSON.stringify({ agent: { id: calls.length === 1 ? 'reviewer-id' : 'new-id', name: 'reviewer' } }));
    res.end('{"view":"incoming-v1","items":[],"nextCursor":null}');
  });
  assert.equal((await changed.run(args)).error.error, 'reviewer_identity_mismatch');
});

test('review wait reports an incomplete scan instead of a false empty result', async t => {
  const f = await fixture(t, (req, res, _body, calls) => {
    if (req.url.includes('/agents/worker?')) return res.end('{"agent":{"id":"reviewer-id","name":"reviewer"}}');
    return res.end(JSON.stringify({ view: 'incoming-v1', items: [], nextCursor: `next_${calls.length}` }));
  });
  const result = await f.run(['reviews', 'wait', '--agent', 'reviewer', '--reviewer-id', 'reviewer-id', '--wait-seconds', '10']);
  assert.equal(result.error.error, 'review_scan_incomplete');
  assert.equal(f.calls.filter(call => call.url.includes('/agents/reviews?')).length, 100);
});

test('review wait forwards the continuation and refuses a repeated cursor with results', async t => {
  const f = await fixture(t, (req, res) => {
    if (req.url.includes('/agents/worker?')) {
      assert.equal(new URL(req.url, 'http://localhost').searchParams.has('cursor'), false);
      return res.end('{"agent":{"id":"reviewer-id","name":"reviewer"}}');
    }
    return res.end(JSON.stringify({ view: 'incoming-v1', items: [{ id: 'mine', reviewerAgentId: 'reviewer-id', status: 'pending' }], nextCursor: 'previous' }));
  });
  const result = await f.run(['reviews', 'wait', '--agent', 'reviewer', '--reviewer-id', 'reviewer-id', '--cursor', 'previous', '--wait-seconds', '3']);
  assert.equal(result.error.error, 'invalid_response');
  assert.equal(new URL(f.calls[1].url, 'http://localhost').searchParams.get('cursor'), 'previous');
});

test('review wait shares one deadline across slow identity and review reads', async t => {
  const args = ['reviews', 'wait', '--agent', 'reviewer', '--reviewer-id', 'reviewer-id', '--wait-seconds', '5'];
  for (const slowFinalIdentity of [false, true]) {
    let releaseResponse;
    const responseReleased = new Promise(resolve => { releaseResponse = resolve; });
    const f = await fixture(t, (req, res, _body, calls) => {
      const identity = req.url.includes('/agents/worker?');
      const lastRead = calls.length === (slowFinalIdentity ? 3 : 2);
      const delayMs = slowFinalIdentity && calls.length === 1 ? 0 : 3000;
      setTimeout(() => {
        if (lastRead) releaseResponse(res.destroyed);
        res.end(identity ? '{"agent":{"id":"reviewer-id","name":"reviewer"}}' : '{"view":"incoming-v1","items":[],"nextCursor":null}');
      }, delayMs);
    });
    const result = await f.run(args);
    assert.notEqual(result.code, 0);
    assert.ok(['transport_failed', 'review_scan_incomplete'].includes(result.error.error));
    assert.equal(f.calls.length, slowFinalIdentity ? 3 : 2);
    assert.equal(await responseReleased, true, 'the shared deadline aborts the final read before its response');
  }
});

test('the owner can check a specific review reply and missing records stay errors', async t => {
  const f = await fixture(t, (_req, res) => res.end(JSON.stringify({ id: 'review-1', status: 'replied', responseOutcome: 'blocked',
    reviewedRevision: 'a'.repeat(40), holdReason: 'Waiting for CI', holdVersion: 2 })));
  const args = ['reviews', 'get', 'review-1', '--agent', 'author', '--workspace', 'w'];
  const result = await f.run(args);
  assert.equal(result.data.status, 'replied'); assert.equal(result.data.responseOutcome, 'blocked');
  assert.equal(result.data.holdVersion, 2); assert.equal(result.data.reviewedRevision, 'a'.repeat(40));
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].method, 'GET');
  const missing = await fixture(t, (_req, res) => { res.writeHead(404); res.end('{}'); });
  const error = await missing.run(args);
  assert.equal(error.error.error, 'not_found'); assert.equal(missing.calls.length, 1);
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

test('inbox list forwards a bounded cursor and returns the next cursor', async t => {
  const f = await fixture(t, (_req, res) => res.end(JSON.stringify({ items: [{ id: 'next' }], hasMore: true, nextCursor: 'next_cursor' })));
  const result = await f.run(['inbox', 'list', '--agent', 'reviewer', '--state', 'claimed', '--cursor', 'current_cursor', '--workspace', 'w']);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(new URL(f.calls[0].url, 'http://localhost').searchParams.get('cursor'), 'current_cursor');
  assert.equal(result.data.nextCursor, 'next_cursor');
  assert.notEqual((await f.run(['inbox', 'list', '--agent', 'reviewer', '--cursor', 'a'.repeat(4097)])).code, 0);
  assert.equal(f.calls.length, 1);
});

test('legacy inbox responses remain unchanged and unsupported cursors fail visibly', async t => {
  const f = await fixture(t, (req, res) => {
    if (new URL(req.url, 'http://localhost').searchParams.has('cursor')) {
      res.statusCode = 400; return res.end('{"error":"invalid_input"}');
    }
    res.end('{"items":[{"id":"first"}],"hasMore":true}');
  });
  const first = await f.run(['inbox', 'list', '--agent', 'reviewer']);
  assert.equal(first.code, 0, first.stderr);
  assert.deepEqual(first.data, { items: [{ id: 'first' }], hasMore: true });
  const next = await f.run(['inbox', 'list', '--agent', 'reviewer', '--cursor', 'next_cursor']);
  assert.notEqual(next.code, 0);
  assert.equal(f.calls.length, 2, 'an unsupported cursor is not silently retried or discarded');
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

// A deploy takes the app away for a few seconds. The watcher used to exit on the first 502, and the
// server then refused a replacement for five minutes while still showing the dead one as running.
test('inbox watch rides through a server that is away and keeps the same watcher', async () => {
  const away = code => new CliError(code, 'synthetic', 5, code === 'server_error' ? { status: 502 } : undefined);
  const controller = new AbortController(), events = [];
  // One entry per poll: what the claimed read, the unseen read and the poll heartbeat do.
  const polls = [
    {},
    { claimed: away('server_error') },
    { unseen: away('transport_failed') },
    { heartbeat: away('outcome_unknown') },
    { claimed: away('rate_limited') },
    { work: true },
  ];
  let poll = 0;
  const result = await watchInbox({
    read: async state => {
      const now = polls[state === 'claimed' ? poll : poll - 1];
      if (state === 'claimed') poll++;
      if (now[state]) throw now[state];
      return { items: state === 'unseen' && now.work ? [{ id: 'work', status: 'open' }] : [], hasMore: false };
    },
    report: async event => {
      events.push(event);
      if (event === 'poll' && polls[poll - 1].heartbeat) throw polls[poll - 1].heartbeat;
      if (event === 'wake') controller.abort();
    },
    callback: process.execPath, callbackArgs: ['-e', 'process.stdin.resume()'],
    agent: 'worker', workspaceId: 'w', origin: 'http://localhost', durationMs: 20000, intervalMs: 1, callbackTimeoutMs: 5000, signal: controller.signal,
  });
  assert.deepEqual([result.callbacks, result.skippedPolls, result.stopped, result.healthReported], [1, 4, true, true]);
  // Started once: the watcher that was running before the outage is the one running after it.
  assert.deepEqual(events, ['started', 'poll', 'poll', 'poll', 'wake', 'stopped']);
});

test('inbox watch repeats a start the server did not answer, and still stops on a refusal', async () => {
  const controller = new AbortController(), events = [];
  const started = await watchInbox({
    read: async () => ({ items: [], hasMore: false }),
    report: async event => {
      events.push(event);
      if (events.length === 1) throw new CliError('outcome_unknown', 'synthetic', 5);
      if (event === 'poll') controller.abort();
    },
    callback: process.execPath, callbackArgs: [], agent: 'worker', workspaceId: 'w', origin: 'http://localhost',
    durationMs: 20000, intervalMs: 1, callbackTimeoutMs: 100, signal: controller.signal,
  });
  assert.deepEqual([events, started.skippedPolls, started.healthReported], [['started', 'started', 'poll', 'stopped'], 1, true]);

  // A refusal is an answer: a changed binding, a missing permission or a bad response end the watcher at once.
  for (const code of ['conflict', 'unauthorized', 'forbidden', 'invalid_response']) {
    const refused = new CliError(code, 'synthetic', 5), seen = [];
    let reads = 0;
    await assert.rejects(watchInbox({
      read: async () => { reads++; throw refused; },
      report: async (event, _signal, errorCode) => { seen.push([event, errorCode]); },
      callback: process.execPath, callbackArgs: [], agent: 'worker', workspaceId: 'w', origin: 'http://localhost',
      durationMs: 20000, intervalMs: 1, callbackTimeoutMs: 100,
    }), error => error === refused);
    assert.deepEqual([reads, seen], [1, [['started', undefined], ['error', code]]], code);
  }
});

test('inbox watch reconciles an uncertain start on shutdown', async () => {
  for (const mode of ['lost-response', 'interrupted-start', 'window', 'refused']) {
    const controller = new AbortController(), events = [];
    const options = {
      read: async () => { throw new Error('unexpected read'); },
      report: async (event, signal) => {
        events.push(event);
        if (event !== 'started') return;
        if (mode === 'window') {
          await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }));
          throw signal.reason;
        }
        if (mode === 'refused') throw new CliError('conflict', 'synthetic', 5);
        if (mode === 'lost-response') {
          setImmediate(() => controller.abort());
          throw new CliError('outcome_unknown', 'synthetic', 5);
        }
        controller.abort();
        throw signal.reason;
      },
      callback: process.execPath, callbackArgs: [], agent: 'worker', workspaceId: 'w', origin: 'http://localhost',
      durationMs: mode === 'window' ? 20 : 20000, intervalMs: 100, callbackTimeoutMs: 100, signal: controller.signal,
    };
    if (mode === 'refused') {
      await assert.rejects(watchInbox(options), { code: 'conflict' });
      assert.deepEqual(events, ['started']);
    } else {
      const result = await watchInbox(options);
      assert.equal(result.healthReported, false);
      assert.deepEqual(events, ['started', 'stopped'], mode);
    }
  }
  // A start the server never saw has nothing to stop: the refusal of that last report is not a failure.
  const controller = new AbortController(), events = [];
  const result = await watchInbox({
    read: async () => { throw new Error('unexpected read'); },
    report: async event => {
      events.push(event);
      if (event === 'stopped') throw new CliError('conflict', 'synthetic', 5, { status: 409 });
      setImmediate(() => controller.abort());
      throw new CliError('outcome_unknown', 'synthetic', 5);
    },
    callback: process.execPath, callbackArgs: [], agent: 'worker', workspaceId: 'w', origin: 'http://localhost',
    durationMs: 20000, intervalMs: 100, callbackTimeoutMs: 100, signal: controller.signal,
  });
  assert.deepEqual([events, result.healthReported, result.stopped], [['started', 'stopped'], false, true]);

  // But a server that stays away past the tolerated outage is an error here too: it may have recorded
  // the start, and nobody could tell it that the watcher is gone.
  const away = new CliError('outcome_unknown', 'synthetic', 5, { status: 502 }), stop = new AbortController(), reports = [];
  await assert.rejects(watchInbox({
    read: async () => { throw new Error('unexpected read'); },
    report: async event => { reports.push(event); if (event === 'started') setImmediate(() => stop.abort()); throw away; },
    callback: process.execPath, callbackArgs: [], agent: 'worker', workspaceId: 'w', origin: 'http://localhost',
    durationMs: 20000, intervalMs: 5, callbackTimeoutMs: 100, signal: stop.signal, outageMs: 40,
  }), error => error === away);
  assert.ok(reports.filter(event => event === 'stopped').length > 1, 'the last report was repeated before giving up');
});

test('inbox watch gives up when the server stays away longer than it tolerates', async () => {
  const gone = new CliError('server_error', 'synthetic', 5, { status: 502 }), events = [];
  let reads = 0;
  const started = Date.now();
  await assert.rejects(watchInbox({
    read: async () => { reads++; throw gone; },
    report: async (event, _signal, errorCode) => { events.push([event, errorCode]); },
    callback: process.execPath, callbackArgs: [], agent: 'worker', workspaceId: 'w', origin: 'http://localhost',
    durationMs: 20000, intervalMs: 5, callbackTimeoutMs: 100, outageMs: 60,
  }), error => error === gone);
  assert.ok(reads > 1, 'it tried again before giving up');
  assert.ok(Date.now() - started >= 60, 'it waited out the tolerated outage');
  assert.deepEqual(events, [['started', undefined], ['error', 'server_error']]);
});

test('inbox watch does not retry an answered 4xx server error', async () => {
  for (const stage of ['started', 'claimed', 'unseen', 'poll', 'wake', 'stopped']) {
    const controller = new AbortController(), events = [];
    const refused = new CliError('server_error', 'synthetic', 5, { status: 413 });
    await assert.rejects(watchInbox({
      read: async state => {
        events.push(state);
        if (state === stage) throw refused;
        return { items: stage === 'wake' && state === 'unseen' ? [{ id: 'work', status: 'open' }] : [], hasMore: false };
      },
      report: async event => {
        events.push(event);
        if (event === stage) throw refused;
        if (event === 'poll' && stage === 'stopped') controller.abort();
      },
      callback: process.execPath, callbackArgs: ['-e', 'process.stdin.resume()'],
      agent: 'worker', workspaceId: 'w', origin: 'http://localhost',
      durationMs: 20000, intervalMs: 1, callbackTimeoutMs: 5000, signal: controller.signal,
    }), error => error === refused);
    assert.equal(events.filter(event => event === stage).length, 1, stage);
  }
});

test('inbox watch says goodbye when the server is back, so the next watcher is not refused', async () => {
  const away = new CliError('outcome_unknown', 'synthetic', 5, { status: 502 });
  const run = (goodbye, extra = {}) => {
    const controller = new AbortController(), events = [];
    return watchInbox({
      read: async () => ({ items: [], hasMore: false }),
      report: async event => {
        events.push(event);
        if (event === 'poll') controller.abort();
        if (event === 'stopped') return goodbye(events.filter(e => e === 'stopped').length);
      },
      callback: process.execPath, callbackArgs: [], agent: 'worker', workspaceId: 'w', origin: 'http://localhost',
      durationMs: 20000, intervalMs: 1, callbackTimeoutMs: 100, signal: controller.signal, ...extra,
    }).then(result => ({ result, events }), error => ({ error, events }));
  };
  // The window ends during a restart: the last report is repeated until it is answered.
  const back = await run(attempt => { if (attempt < 3) throw away; });
  assert.deepEqual([back.events, back.result.stopped], [['started', 'poll', 'stopped', 'stopped', 'stopped'], true]);
  // Not for ever: past the tolerated outage the watcher ends with that error.
  const gone = await run(() => { throw away; }, { outageMs: 40, intervalMs: 5 });
  assert.equal(gone.error, away);
  assert.ok(gone.events.filter(e => e === 'stopped').length > 1);
  // A refusal of the goodbye is an answer and is not repeated.
  const refused = new CliError('conflict', 'synthetic', 5, { status: 409 });
  const changed = await run(() => { throw refused; });
  assert.deepEqual([changed.error, changed.events], [refused, ['started', 'poll', 'stopped']]);
});

test('inbox watch counts an outage from the last poll the server answered', async () => {
  const controller = new AbortController();
  let reads = 0;
  const result = await watchInbox({
    read: async state => {
      if (state === 'unseen') return { items: [], hasMore: false };
      reads++;
      // The first poll is answered only after the tolerated outage has passed since the watcher started.
      if (reads === 1) await new Promise(resolve => setTimeout(resolve, 300));
      if (reads === 2) throw new CliError('server_error', 'synthetic', 5, { status: 502 });
      if (reads === 3) controller.abort();
      return { items: [], hasMore: false };
    },
    callback: process.execPath, callbackArgs: [], agent: 'worker', workspaceId: 'w', origin: 'http://localhost',
    durationMs: 20000, intervalMs: 1, callbackTimeoutMs: 100, signal: controller.signal, outageMs: 200,
  });
  assert.deepEqual([reads, result.skippedPolls, result.stopped], [3, 1, true]);
});

test('a bound watcher stops at once when what answers is not Collab', async t => {
  // A proxy page or a wrong origin answers 200 with HTML. That is an answer, not an outage.
  const page = await fixture(t, (_req, res) => { res.setHeader('content-type', 'text/html'); res.end('<html>maintenance</html>'); });
  const result = await page.run(['inbox', 'watch', '--agent', 'worker', '--workspace', 'w', '--host', 'my-pc', '--session-id', 'session-1',
    '--callback', process.execPath, '--watch-seconds', '5']);
  assert.notEqual(result.code, 0);
  assert.deepEqual([result.error.error, result.error.status], ['outcome_unknown', 200]);
  assert.deepEqual(page.calls.map(call => [call.method, call.method === 'POST' && JSON.parse(call.body).event]), [['POST', 'started'], ['POST', 'error']]);
});

test('inbox watch treats an unreadable answer to its heartbeat as a refusal', async () => {
  // The client reports a heartbeat answered with something that is not JSON as outcome_unknown with the status it came with.
  const unreadable = new CliError('outcome_unknown', 'synthetic', 5, { status: 200 }), events = [];
  await assert.rejects(watchInbox({
    read: async () => ({ items: [], hasMore: false }),
    report: async (event, _signal, errorCode) => { events.push([event, errorCode]); if (event === 'poll') throw unreadable; },
    callback: process.execPath, callbackArgs: [], agent: 'worker', workspaceId: 'w', origin: 'http://localhost',
    durationMs: 20000, intervalMs: 1, callbackTimeoutMs: 100,
  }), error => error === unreadable);
  assert.deepEqual(events, [['started', undefined], ['poll', undefined], ['error', 'outcome_unknown']]);
});

test('agent commands stop on permission or claim conflict errors without retry', async t => {
  const f = await fixture(t, (_req, res) => { res.statusCode = 409; res.end('{"error":"conflict"}'); });
  assert.notEqual((await f.run(['handoffs', 'claim', 'handoff-one', '--agent', 'reviewer'])).code, 0);
  assert.equal(f.calls.length, 1);
  const denied = await fixture(t, (_req, res) => { res.statusCode = 401; res.end('{"error":"unauthorized"}'); });
  assert.notEqual((await denied.run(['inbox', 'wait', '--agent', 'reviewer', '--wait-seconds', '2'])).code, 0);
  assert.equal(denied.calls.length, 1);
});

test('claim conflict preserves only the scoped retry-safe machine code', async t => {
  const f = await fixture(t, (_req, res) => { res.statusCode = 409; res.end('{"error":"already_claimed","message":"PRIVATE_REMOTE_TEXT"}'); });
  const result = await f.run(['handoffs', 'claim', 'handoff-one', '--agent', 'reviewer']);
  assert.equal(result.error.error, 'already_claimed');
  assert.equal(result.stderr.includes('PRIVATE_REMOTE_TEXT'), false);
  assert.equal(f.calls.length, 1);
  const unrelated = await f.run(['issues', 'get', 'APP-1']);
  assert.equal(unrelated.error.error, 'conflict');
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
  const f = await fixture(t, (_req, res, _body, calls) => res.end(JSON.stringify({ items: items.map(item => ({ ...item, updatedAt: new Date(1793016000000 + calls.length * 1000).toISOString(), content: '$(touch SHOULD_NOT_EXIST)' })), hasMore: true, nextCursor: 'next_cursor' })));
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
  assert.equal(events[0].unseen.nextCursor, undefined, 'additive server cursor does not alter the legacy wake payload');
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
        '--watch-seconds', expires ? '1' : '2', '--timeout', expires ? '120' : '1']);
      // A read the server does not answer in time is one skipped poll, not the end of the watcher.
      assert.equal(result.code, 0, result.stderr);
      assert.deepEqual(result.data, { agent: 'worker', workspaceId: 'w', callbacks: 0, ...(!expires && { skippedPolls: 1 }), stopped: false, timedOut: true });
      assert.ok(Date.now() - start < 4000, 'the first deadline must stop the read');
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
  if (windows && !existsSync(file)) {
    let failure;
    const created = windowsAcl(file, 'file', kind => { failure = kind; });
    assert.equal(created, true, `create owned private credential fixture: ${failure}`);
  }
  writeFileSync(file, contents, { mode: 0o600 });
}
async function fixture(t, handler) {
  const temporary = mkdtempSync(path.join(tmpdir(), 'collab-cli-test-'));
  const dir = windows ? path.join(temporary, 'private-state') : temporary;
  if (windows) {
    let failure;
    const created = windowsAcl(dir, true, kind => { failure = kind; });
    assert.equal(created, true, `create private Windows fixture: ${failure}`);
  }
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
    const timer = setTimeout(() => child.kill('SIGKILL'), windows ? 120000 : 10000);
    childCallback?.(child);
    return once(child, 'close').then(([code, signal]) => {
      clearTimeout(timer);
      const diagnostics = stderr.split('\n').filter(line => line.startsWith('{')).map(line => JSON.parse(line));
      return { code, signal, stdout, stderr, diagnostics, data: stdout ? JSON.parse(stdout) : undefined, error: diagnostics.find(record => record.error) };
    });
  }
  return { run, dir, calls, url };
}

test('update is listed, takes no arguments, and refuses to run the installer outside the installed native executable', { skip: Boolean(executable) }, async t => {
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

test('a template refusal names the missing sections and fields, and passes on nothing else from the server', async t => {
  const refusal = {
    error: 'template_required', error_description: 'PRIVATE_SENTINEL', issue_type: 'BUG', template_version: 3,
    missing_sections: ['Summary', 'x'.repeat(200), 42, 'Steps\nto\u001b reproduce\u0085again\u2028here', ...Array.from({ length: 40 }, (_, index) => `Section ${index}`)],
    missing_fields: ['priority', 'PRIVATE_SENTINEL', 7, 'dueDate'],
    template: { sections: [{ title: 'Summary', required: true, guidance: 'PRIVATE_SENTINEL' }], requiredFields: ['priority'] },
  };
  const f = await fixture(t, (_req, res) => { res.writeHead(422); res.end(JSON.stringify(refusal)); });
  for (const args of [['issues', 'create', '--project', 'project-one', '--title', 'Broken', '--type', 'BUG'], ['issues', 'update', 'AGENT-12', '--input', '-'], ['issues', 'assign', 'AGENT-12', '--unassign', 'true']]) {
    const result = await f.run(args, { input: JSON.stringify({ description: 'Free text' }) });
    assert.equal(result.code, 5);
    assert.deepEqual(result.error, {
      error: 'template_required', status: 422, issueType: 'BUG',
      message: 'Collab refused the issue: required template sections or fields are missing. Run collab templates get BUG.',
      missingSections: ['Summary', 'x'.repeat(80), 'Steps to  reproduce again here', ...Array.from({ length: 27 }, (_, index) => `Section ${index}`)],
      missingFields: ['priority', 'dueDate'],
    });
    assert.ok(!result.stderr.includes('PRIVATE_SENTINEL'));
  }
  // Refused once each: a refusal is never retried.
  assert.equal(f.calls.length, 3);
});

test('a refusal that is not a template refusal on an issue write keeps the plain message', async t => {
  const f = await fixture(t, (req, res) => {
    res.writeHead(422);
    res.end(JSON.stringify({ error: req.url.includes('/issues') ? 'something_else' : 'template_required', issue_type: 'not a type', missing_sections: ['PRIVATE_SENTINEL'], missing_fields: ['priority'] }));
  });
  for (const args of [['issues', 'create', '--project', 'project-one', '--title', 'Broken'], ['comments', 'add', 'AGENT-12', '--content-file', '-']]) {
    const result = await f.run(args, { input: 'Text' });
    assert.deepEqual([result.code, result.error], [5, { error: 'server_error', message: 'Collab refused the request (HTTP 422).', status: 422 }]);
  }
  // A type the CLI does not know is not echoed either.
  const unknown = await fixture(t, (_req, res) => { res.writeHead(422); res.end(JSON.stringify({ error: 'template_required', issue_type: 'PRIVATE_SENTINEL', missing_sections: ['Summary'] })); });
  const result = await unknown.run(['issues', 'create', '--project', 'project-one', '--title', 'Broken']);
  assert.deepEqual(result.error, {
    error: 'template_required', status: 422, missingSections: ['Summary'], missingFields: [],
    message: 'Collab refused the issue: required template sections or fields are missing. Run collab templates get TYPE.',
  });
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

test('template commands read the workspace issue templates by list and by type', async t => {
  const template = { type: 'BUG', version: 1, standard: true, sections: [{ title: 'Summary', required: true, guidance: 'What is wrong.' }], requiredFields: ['priority'], body: '## Summary\n' };
  const f = await fixture(t, (req, res) => res.end(JSON.stringify(req.url.includes('/issue-templates/') ? { ...template, enforced: false } : { enforced: false, templates: [template] })));
  const list = await f.run(['templates', 'list', '--workspace', 'workspace-one']);
  assert.equal(list.code, 0, list.stderr);
  assert.deepEqual(list.data, { enforced: false, templates: [template] });
  const one = await f.run(['templates', 'get', 'BUG', '--workspace', 'workspace-one']);
  assert.equal(one.code, 0, one.stderr);
  assert.deepEqual(one.data, { ...template, enforced: false });
  assert.deepEqual(f.calls.map(({ method, url }) => ({ method, url })), [
    { method: 'GET', url: '/api/apps/auth/issue-templates?workspaceId=workspace-one' },
    { method: 'GET', url: '/api/apps/auth/issue-templates/BUG?workspaceId=workspace-one' },
  ]);
  assert.notEqual((await f.run(['templates', 'get', '--workspace', 'workspace-one'])).code, 0);
  assert.equal(f.calls.length, 2);
});

const notePreview = { id: 'note-one', title: 'Runbook', type: 'RUNBOOK', scope: 'WORKSPACE', projectName: null, updatedAt: '2026-11-01T00:00:00.000Z' };
const storedNote = { ...notePreview, content: 'private body', author: { id: 'user-one', name: 'Author' }, tags: [] };
const noteUrl = '/api/apps/auth/context/note-one?workspaceId=workspace-one';

test('note deletion needs confirmation and one plain ID before any request', async t => {
  const f = await fixture(t);
  for (const args of [
    ['notes', 'delete', 'note-one', '--workspace', 'workspace-one'],
    ['notes', 'delete', '--workspace', 'workspace-one', '--yes'],
    ['notes', 'delete', 'note-one', 'note-two', '--workspace', 'workspace-one', '--yes'],
    ['notes', 'delete', 'note-one', '--workspace', 'workspace-one', '--yes', '--all'],
    ['notes', 'delete', 'note-one', '--workspace', 'workspace-one', '--yes', '--search', 'old'],
  ]) assert.notEqual((await f.run(args)).code, 0, args.join(' '));
  assert.equal(f.calls.length, 0);
});

test('note deletion dry-run reads the note without yes and deletes nothing', async t => {
  const f = await fixture(t, (_req, res) => res.end(JSON.stringify(storedNote)));
  const result = await f.run(['notes', 'delete', 'note-one', '--workspace', 'workspace-one', '--dry-run']);
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(result.data, { dryRun: true, method: 'DELETE', url: f.url + noteUrl, preview: notePreview });
  assert.deepEqual(f.calls.map(({ method, url }) => ({ method, url })), [{ method: 'GET', url: noteUrl }]);
  assert.equal(result.stderr, '');
});

test('note deletion shows which note goes, without its content, then deletes that ID', async t => {
  const f = await fixture(t, (req, res) => res.end(JSON.stringify(req.method === 'GET' ? storedNote : { deleted: true, id: 'note-one', title: 'Runbook' })));
  const result = await f.run(['notes', 'delete', 'note-one', '--workspace', 'workspace-one', '--yes']);
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(result.diagnostics, [{ deletePreview: notePreview }]);
  assert.deepEqual(result.data, { deleted: true, id: 'note-one', title: 'Runbook' });
  assert.deepEqual(f.calls.map(({ method, url }) => ({ method, url })), [{ method: 'GET', url: noteUrl }, { method: 'DELETE', url: noteUrl }]);
});

test('note deletion stops when the note cannot be read or is not the one asked for', async t => {
  const denied = await fixture(t, (_req, res) => { res.statusCode = 404; res.end(JSON.stringify({ error: 'context_not_found' })); });
  const refused = await denied.run(['notes', 'delete', 'note-one', '--workspace', 'workspace-one', '--yes']);
  assert.equal(refused.error.error, 'not_found');
  assert.deepEqual(denied.calls.map(call => call.method), ['GET']);
  const other = await fixture(t, (_req, res) => res.end(JSON.stringify({ ...storedNote, id: 'note-two' })));
  const mismatched = await other.run(['notes', 'delete', 'note-one', '--workspace', 'workspace-one', '--yes']);
  assert.equal(mismatched.error.error, 'invalid_preview');
  assert.deepEqual(other.calls.map(call => call.method), ['GET']);
});

const retirePreview = { agent: 'old-agent', released: [{ id: 'handoff-one', issueKey: 'APP-1' }], unowned: { count: 1, handoffs: [{ id: 'handoff-two', issueKey: 'APP-2' }] } };
const retirePreviewUrl = '/api/apps/auth/agents/delete-preview?workspaceId=workspace-one&agent=old-agent';
const retireUrl = '/api/apps/auth/agents?workspaceId=workspace-one&agent=old-agent';

test('agent retirement asks for the agent and for --yes, and its dry-run only reads the preview', async t => {
  const f = await fixture(t, (_req, res) => res.end(JSON.stringify({ ...retirePreview, id: 'registration-one' })));
  assert.equal((await f.run(['agents', 'retire', '--workspace', 'workspace-one', '--yes'])).error.error, 'required_field');
  assert.equal((await f.run(['agents', 'retire', '--agent', 'old-agent', '--workspace', 'workspace-one'])).error.error, 'confirmation_required');
  assert.equal(f.calls.length, 0);
  const result = await f.run(['agents', 'retire', '--agent', 'old-agent', '--workspace', 'workspace-one', '--dry-run']);
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(result.data, { dryRun: true, method: 'DELETE', url: f.url + retireUrl, preview: retirePreview });
  assert.deepEqual(f.calls.map(({ method, url }) => ({ method, url })), [{ method: 'GET', url: retirePreviewUrl }]);
});

test('agent retirement shows what is released and what stays unowned, then retires that agent', async t => {
  const f = await fixture(t, (req, res) => res.end(JSON.stringify({ ...retirePreview, id: 'registration-one', ...(req.method === 'DELETE' && { retired: true }) })));
  const result = await f.run(['agents', 'retire', '--agent', 'old-agent', '--workspace', 'workspace-one', '--yes']);
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(result.diagnostics, [{ deletePreview: retirePreview }]);
  assert.deepEqual(result.data, { ...retirePreview, id: 'registration-one', retired: true });
  assert.deepEqual(f.calls.map(({ method, url }) => ({ method, url })), [{ method: 'GET', url: retirePreviewUrl }, { method: 'DELETE', url: retireUrl }]);
});

test('agent retirement stops when the server refuses the preview or answers for another agent', async t => {
  const blocked = await fixture(t, (_req, res) => { res.statusCode = 409; res.end(JSON.stringify({ error: 'watcher_active' })); });
  const refused = await blocked.run(['agents', 'retire', '--agent', 'old-agent', '--workspace', 'workspace-one', '--yes']);
  assert.equal(refused.error.error, 'conflict');
  assert.deepEqual(blocked.calls.map(call => call.method), ['GET']);
  for (const wrong of [{ ...retirePreview, agent: 'another' }, { ...retirePreview, released: 'all' }, { ...retirePreview, unowned: { count: 'many', handoffs: [] } }]) {
    const other = await fixture(t, (_req, res) => res.end(JSON.stringify(wrong)));
    const mismatched = await other.run(['agents', 'retire', '--agent', 'old-agent', '--workspace', 'workspace-one', '--yes']);
    assert.equal(mismatched.error.error, 'invalid_preview');
    assert.deepEqual(other.calls.map(call => call.method), ['GET']);
  }
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

test('refresh retains rotated credentials privately and retries only identity verification after an outage', async t => {
  let available = false;
  const f = await fixture(t, (req, res) => {
    if (req.url === '/api/oauth/mcp/token') return res.end(JSON.stringify({ access_token: 'PRIVATE_ROTATED', refresh_token: 'PRIVATE_NEW_REFRESH', token_type: 'Bearer', expires_in: 3600, workspace_id: 'workspace-one', scope: 'issues:read' }));
    if (!available) { res.statusCode = 408; return res.end('{}'); }
    res.end(JSON.stringify({ id: 'same-user', workspace: { id: 'workspace-one' } }));
  });
  const file = path.join(f.dir, 'default.json'), env = { COLLAB_TOKEN: '' };
  writeCredentials(file, JSON.stringify({ origin: f.url, clientId: 'collab-cli', accessToken: 'expired', refreshToken: 'PRIVATE_REFRESH', expiresAt: 0, workspace: 'workspace-one', tokenWorkspace: 'workspace-one', userId: 'same-user' }));
  const first = await f.run(['auth', 'refresh'], { env });
  assert.equal(first.error.error, 'refresh_verification_pending'); assert.equal(first.stdout, ''); assert.ok(!first.stderr.includes('PRIVATE_'));
  const retained = JSON.parse(readFileSync(file));
  assert.equal(retained.accessToken, 'expired'); assert.equal(retained.pendingRefresh.accessToken, 'PRIVATE_ROTATED');
  assert.equal(retained.pendingRefresh.refreshToken, 'PRIVATE_NEW_REFRESH');
  available = true;
  const second = await f.run(['auth', 'refresh'], { env });
  assert.equal(second.code, 0, second.stderr);
  assert.equal(f.calls.filter(call => call.url === '/api/oauth/mcp/token').length, 1);
  const stored = JSON.parse(readFileSync(file));
  assert.equal(stored.accessToken, 'PRIVATE_ROTATED'); assert.equal(stored.refreshToken, 'PRIVATE_NEW_REFRESH'); assert.equal('pendingRefresh' in stored, false);
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
    assert.equal(f.calls.length, dispatches);
    const stored = JSON.parse(readFileSync(file, 'utf8'));
    if (dispatches === 2) {
      assert.equal(stored.accessToken, 'PRIVATE_ACCESS'); assert.equal(stored.pendingRefresh.accessToken, 'PRIVATE_ROTATED');
    } else if (dispatches) {
      assert.equal(stored.pendingRefresh, null);
      assert.equal(stored.accessToken, 'PRIVATE_ACCESS');
    } else assert.equal(readFileSync(file, 'utf8'), original);
  }
});

test('refresh preserves identity service errors without repeating rotation', async t => {
  for (const [status, expected] of [[401, 'unauthorized'], [403, 'forbidden'], [408, 'refresh_verification_pending'], [429, 'refresh_verification_pending'], [503, 'refresh_verification_pending']]) {
    const f = await fixture(t, (req, res) => {
      if (req.url === '/api/oauth/mcp/token') return res.end(JSON.stringify({ access_token: 'rotated', token_type: 'Bearer', expires_in: 3600, workspace_id: 'workspace' }));
      res.statusCode = status; res.end('{}');
    });
    const file = path.join(f.dir, 'default.json'), env = { COLLAB_TOKEN: '' };
    writeCredentials(file, JSON.stringify({ origin: f.url, clientId: 'collab-cli', accessToken: 'old', refreshToken: 'refresh', tokenWorkspace: 'workspace', userId: 'user' }));
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await f.run(['auth', 'refresh'], { env });
      assert.equal(result.error.error, expected);
      if (status === 401 || status === 403) assert.match(result.error.message, /not activated\. Sign in again/);
    }
    assert.equal(f.calls.filter(call => call.url === '/api/oauth/mcp/token').length, 1);
    assert.equal(JSON.parse(readFileSync(file)).accessToken, 'old');
  }
});

test('uncertain refresh outcomes cannot be replayed by a later command', async t => {
  for (const response of ['server-error', 'invalid', 'workspace']) {
    const f = await fixture(t, (_req, res) => {
      if (response === 'server-error') { res.statusCode = 500; return res.end('{}'); }
      res.end(JSON.stringify(response === 'invalid' ? {} : { access_token: 'rotated', token_type: 'Bearer', expires_in: 3600, workspace_id: 'other' }));
    });
    const file = path.join(f.dir, 'default.json'), env = { COLLAB_TOKEN: '' };
    writeCredentials(file, JSON.stringify({ origin: f.url, clientId: 'collab-cli', accessToken: 'old', refreshToken: 'refresh', tokenWorkspace: 'workspace', userId: 'user' }));
    assert.notEqual((await f.run(['auth', 'refresh'], { env })).code, 0);
    assert.equal(JSON.parse(readFileSync(file)).pendingRefresh, null);
    assert.equal((await f.run(['auth', 'refresh'], { env })).error.error, 'outcome_unknown');
    assert.equal(f.calls.length, 1);
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

test('dedicated worker commands replace unsafe Orca terminal dispatch', async t => {
  const f = await fixture(t);
  const schema = await f.run(['schema']);
  assert.equal(schema.code, 0);
  assert.ok(schema.data.workerCommands['worker setup']);
  assert.ok(schema.data.workerCommands['worker run']);
  assert.equal(schema.data.orcaCommands, undefined);
  for (const command of ['setup', 'watch', 'verify', 'status']) {
    const result = await f.run(['orca', command]);
    assert.equal(result.error.error, 'orca_retired');
  }
  assert.equal(f.calls.length, 0);
});

test('worker status and stop retain local recovery after login expiry', async t => {
  const f = await fixture(t);
  const userId = 'same-user', agent = 'pilot', workspace = 'workspace-one';
  writeCredentials(path.join(f.dir, 'default.json'), JSON.stringify({ origin: f.url, accessToken: 'PRIVATE_ACCESS', refreshToken: 'PRIVATE_REFRESH', expiresAt: 0, userId, workspace }));
  const key = createHash('sha256').update(JSON.stringify([f.url, workspace, userId, agent])).digest('base64url');
  const saved = { status: 'uncertain', runId: 'run-one', active: { handoffId: 'handoff-one', phase: 'dispatched', reservedUSD: 0.5 }, usage: { reservedUSD: 0.5 } };
  const file = path.join(f.dir, `worker-${key}.json`);
  writeCredentials(file, JSON.stringify(saved));
  const env = { COLLAB_TOKEN: '' }, args = ['--agent', agent, '--workspace', workspace];
  const status = await f.run(['worker', 'status', ...args], { env });
  assert.equal(status.code, 0, status.stderr);
  assert.equal(status.data.taskId, 'handoff-one');
  assert.equal(status.data.state, 'uncertain');
  assert.deepEqual(status.data.liveHealth, { ok: false, error: 'token_expired' });
  assert.equal(status.stdout.includes('PRIVATE_'), false);
  assert.equal((await f.run(['worker', 'stop', ...args], { env })).error.error, 'stop_unconfirmed');
  for (const command of ['setup', 'install']) assert.equal((await f.run(['worker', command, ...args], { env })).error.error, 'token_expired');
  assert.deepEqual(JSON.parse(readFileSync(file)), saved);
  const paused = await f.run(['worker', 'run', ...args], { env });
  assert.equal(paused.code, 0, paused.stderr);
  assert.equal(paused.data.state, 'needs-login');
  assert.equal(paused.data.stopReason, 'token_expired');
  assert.equal(paused.data.taskId, 'handoff-one');
  assert.deepEqual(JSON.parse(readFileSync(file)).active, saved.active);
  assert.equal(f.calls.length, 0);
});

test('worker run pauses on missing login or invalid runner configuration before supervision', async t => {
  const f = await fixture(t), env = { COLLAB_TOKEN: '' }, args = ['--agent', 'worker', '--workspace', 'w'];
  const loggedOut = await f.run(['worker', 'run', ...args], { env });
  assert.equal(loggedOut.code, 0); assert.equal(loggedOut.data.state, 'needs-login');
  const userId = 'worker-user';
  writeCredentials(path.join(f.dir, 'default.json'), JSON.stringify({ origin: f.url, accessToken: 'PRIVATE_ACCESS', expiresAt: Date.now() + 60000, userId }));
  const key = createHash('sha256').update(JSON.stringify([f.url, 'w', userId, 'worker'])).digest('base64url');
  writeCredentials(path.join(f.dir, `worker-${key}.json`), JSON.stringify({ config: { host: 'laptop', cwd: f.dir, executable: path.join(f.dir, 'missing-claude') } }));
  const invalid = await f.run(['worker', 'run', ...args], { env });
  assert.equal(invalid.code, 0); assert.equal(invalid.data.state, 'config'); assert.equal(invalid.data.stopReason, 'worker_config');
  assert.equal(f.calls.length, 0);
});

test('legacy watcher coalesces revision-only changes in its emitted callback contract', async t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'collab-watch-dedup-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const output = path.join(dir, 'notifications.jsonl'), controller = new AbortController();
  let revision = 0, polls = 0;
  const result = await watchInbox({
    read: async state => ({ items: state === 'unseen' ? [{ id: 'same', status: 'open', updatedAt: new Date(++revision * 1000).toISOString() }] : [], hasMore: false }),
    callback: process.execPath, callbackArgs: ['-e', 'let input="";process.stdin.on("data",b=>input+=b);process.stdin.on("end",()=>require("node:fs").appendFileSync(process.argv[1],input));', output],
    agent: 'worker', workspaceId: 'w', origin: 'http://localhost', durationMs: 5000, intervalMs: 1, callbackTimeoutMs: 2000, signal: controller.signal,
    report: async event => { if (event === 'poll' && ++polls === 3) controller.abort(); },
  });
  assert.equal(result.callbacks, 1);
  const emitted = readFileSync(output, 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(emitted.length, 1); assert.deepEqual(emitted[0].unseen, { items: [{ id: 'same', status: 'open' }], hasMore: false });
});
