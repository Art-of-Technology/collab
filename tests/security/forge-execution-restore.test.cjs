const { assert, test, load, matches } = require('./helpers.cjs');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const zod = require('zod');
const globals = { Buffer, URL, TextDecoder, fetch, AbortSignal, AbortController, setInterval, clearInterval, process };
const content = load('src/lib/forge/issue-content.ts', { 'node:crypto': crypto, zod,
  './tasks': load('src/lib/forge/tasks.ts', { zod }) }, globals);
const memory = load('src/lib/forge/memory.ts', { zod }, globals);
const stech = load('src/lib/forge/stech.ts', { 'server-only': {}, 'node:crypto': crypto,
  'node:fs/promises': require('node:fs/promises'), zod, './reader': {} }, globals);
const clone = value => structuredClone(value);
const frame = data => 'data: ' + JSON.stringify(data) + '\n\n';

async function fixture(t) {
  const journal = await import('../../src/lib/forge/execution-journal.mjs');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'collab-ready-restore-'));
  const previous = [process.env.COLLAB_READY_JOURNAL_DIR, process.env.COLLAB_READY_JOURNAL_ID];
  process.env.COLLAB_READY_JOURNAL_DIR = directory;
  process.env.COLLAB_READY_JOURNAL_ID = await journal.initializeExecutionJournal(directory);
  t.after(() => {
    for (const [i, key] of ['COLLAB_READY_JOURNAL_DIR', 'COLLAB_READY_JOURNAL_ID'].entries()) {
      if (previous[i] === undefined) delete process.env[key]; else process.env[key] = previous[i];
    }
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const target = { origin: 'https://forge.example.test', repositoryId: 4, issueNumber: 12, projectId: 'p', workspaceId: 'w' };
  const deployment = { key: 'd', label: 'Fixture', origin: 'https://executor.example.test', organization: 'org', agentId: 'agent', revision: 'a'.repeat(64), configuredModel: 'model' };
  const binding = { ...target, owner: 'owner', repository: 'repo', memory: {}, issues: {}, execution: { deployments: [deployment] } };
  const snapshot = { issue: { number: 12, title: 'Task', body: 'Body', state: 'open', updated_at: new Date().toISOString() }, fingerprint: 'a'.repeat(64), discussionFingerprint: 'c'.repeat(64), partialComments: false, comments: [] };
  const document = { version: 1, projectId: 'p', revisions: [] };
  const status = { role: 'OWNER', mode: 'done', launches: 0, cancels: 0, writes: 0 };
  function app(initial = []) {
    const rows = clone(initial);
    const model = {
      async findFirst({ where, orderBy } = {}) {
        const selected = rows.filter(row => matches(row, where || {}));
        if (orderBy?.generation) selected.sort((a, b) => orderBy.generation === 'desc' ? b.generation - a.generation : a.generation - b.generation);
        const result = clone(selected[0] || null);
        await status.afterFind?.(where, rows);
        return result;
      },
      async findUnique(args) { return model.findFirst(args); },
      async findUniqueOrThrow(args) { const row = await model.findFirst(args); assert.ok(row); return row; },
      async findMany({ where }) { return clone(rows.filter(row => matches(row, where))); },
      async updateMany({ where, data }) { let count = 0; for (const row of rows) if (matches(row, where)) { Object.assign(row, clone(data)); count++; } return { count }; },
      async create({ data }) {
        assert.ok(!rows.some(row => row.id === data.id || (row.projectId === data.projectId && row.issueNumber === data.issueNumber && row.generation === data.generation)), 'unique attempt');
        const row = { createdAt: new Date(), heartbeatAt: new Date(), result: null, cancelAcknowledgedAt: null, ...clone(data) }; rows.push(row); return clone(row);
      },
      async upsert({ where, create, update }) { const row = rows.find(row => matches(row, where)); if (row) { Object.assign(row, clone(update)); return clone(row); } return model.create({ data: create }); },
    };
    const prisma = { forgeExecutionAttempt: model, project: { findFirst: async () => ({ id: 'p' }) },
      async $transaction(callback) { const saved = clone(rows); try { return await callback(prisma); } catch (error) { rows.splice(0, rows.length, ...saved); throw error; } } };
    const receipts = load('src/lib/forge/execution-receipts.ts', { 'server-only': {}, zod, '@prisma/client': { Prisma: { TransactionIsolationLevel: { Serializable: 'Serializable' } } }, '@/lib/prisma': { prisma }, './execution-journal.mjs': journal }, globals);
    const dependencies = { 'server-only': {}, zod, 'node:crypto': crypto, '@/lib/prisma': { prisma },
      '@/lib/auth': { getAuthSession: async () => ({ user: { id: 'actor' } }) },
      '@/lib/slug-resolvers': { resolveWorkspaceSlug: async () => 'w' },
      '@/lib/permissions': { Permission: { VIEW_NOTES: 'notes', VIEW_TASKS: 'tasks' }, getUserWorkspaceRole: async () => status.role, checkUserPermission: async () => ({ hasPermission: true }) },
      './reader': { readForgeBindings: async () => [binding] }, './memory': memory,
      './memory-store': { readProjectMemory: async () => ({ sha: 'd'.repeat(40), document }) }, './issue-content': content,
      './issue-store': { readForgeIssue: async () => clone(snapshot), writeForgeIssue: async (_binding, command) => {
        status.writes++; snapshot.issue.body = content.readyIssueContent(snapshot.issue, command.ready).body;
        snapshot.fingerprint = content.issueFingerprint(snapshot.issue); return { kind: 'saved' };
      } }, './execution-receipts': receipts,
      './stech': { ...stech, qualifyDeployment: async () => { if (status.mode === 'deployment-drift') throw new Error('Changed deployment'); },
        requestExecutionCancellation: async () => { status.cancels++; return null; },
        openExecution: async () => {
          status.launches++;
          if (status.mode === 'lost') throw new Error('Lost acknowledgment');
          if (status.mode === 'http') return new Response('', { status: 409 });
          const start = frame({ type: 'started', runId: 'run' });
          const finish = status.mode === 'disconnect' ? '' : status.mode === 'error' ? frame({ type: 'error' }) : frame({ type: 'done', runId: 'run', stopReason: status.mode === 'unqualified' ? 'error' : 'end_turn', finalText: 'Draft result' });
          return new Response(start + finish, { headers: { 'content-type': 'text/event-stream' } });
        } },
    };
    return { rows, receipts, worker: load('src/lib/forge/execution-worker.ts', dependencies, globals), service: load('src/lib/forge/execution-service.ts', dependencies, globals) };
  }
  const command = retryOf => ({ number: 12, expected: snapshot.fingerprint, expectedDiscussion: snapshot.discussionFingerprint, memorySha: 'd'.repeat(40), deploymentKey: 'd', expectedDeployment: stech.deploymentIdentity(deployment), relevantIds: [], retryOf: retryOf ?? null });
  const prepare = async a => { assert.equal((await a.service.prepareExecution('workspace', 'project', command())).kind, 'ready'); return a.rows.at(-1).id; };
  return { journal, directory, target, status, snapshot, app, command, prepare };
}

test('actual preparation and competing workers issue one launch and persist review-required completion', async t => {
  const f = await fixture(t), a = f.app(), id = await f.prepare(a);
  assert.equal(f.status.writes, 1);
  assert.deepEqual((await Promise.all([a.worker.runReadyAttempt(id, 'one'), a.worker.runReadyAttempt(id, 'two')])).sort(), [false, true]);
  assert.equal(f.status.launches, 1); assert.equal(a.rows[0].state, 'REVIEW_REQUIRED');
  assert.equal(a.rows[0].safeToRetry, false);
  assert.equal(await a.worker.runReadyAttempt(id, 'restart'), false);
});

test('two restored SQL copies share one independent claim and launch at most once', async t => {
  const f = await fixture(t), a = f.app(), id = await f.prepare(a), b = f.app(a.rows);
  await Promise.all([a.worker.runReadyAttempt(id, 'one'), b.worker.runReadyAttempt(id, 'two')]);
  assert.equal(f.status.launches, 1);
  assert.deepEqual([a.rows[0].state, b.rows[0].state].sort(), ['REVIEW_REQUIRED', 'UNKNOWN']);
  const loser = a.rows[0].state === 'UNKNOWN' ? a : b;
  assert.equal(loser.rows[0].safeToRetry, false); assert.equal(await loser.worker.runReadyAttempt(id, 'again'), false);
});

test('newer independent launch evidence fences restored READY across worker, retry and cancellation', async t => {
  const f = await fixture(t), a = f.app(), id = await f.prepare(a), saved = clone(a.rows);
  f.status.mode = 'lost'; await a.worker.runReadyAttempt(id, 'original'); assert.equal(f.status.launches, 1);
  for (const entry of ['worker', 'retry', 'cancel']) {
    const restored = f.app(saved);
    if (entry === 'worker') await restored.worker.runReadyAttempt(id, 'restored');
    if (entry === 'retry') assert.equal((await restored.service.prepareExecution('workspace', 'project', f.command(id))).kind, 'conflict');
    if (entry === 'cancel') assert.equal((await restored.service.cancelExecution('workspace', 'project', id)).kind, 'pending');
    assert.equal(restored.rows[0].state, 'UNKNOWN'); assert.equal(restored.rows[0].safeToRetry, false);
    await restored.worker.runReadyAttempt(id, 'restart');
  }
  assert.equal(f.status.launches, 1); assert.equal(f.status.cancels, 0); assert.equal(f.status.writes, 1);
});

test('receipt absent from restored SQL creates UNKNOWN before preparation can write or launch', async t => {
  const f = await fixture(t), original = f.app(); await f.prepare(original);
  const empty = f.app(); assert.equal((await empty.service.prepareExecution('workspace', 'project', f.command())).kind, 'conflict');
  assert.equal(empty.rows.length, 1); assert.equal(empty.rows[0].state, 'UNKNOWN'); assert.equal(empty.rows[0].safeToRetry, false);
  assert.equal(f.status.writes, 1); assert.equal(f.status.launches, 0);
});

for (const problem of ['missing-authority', 'missing-receipt', 'corrupt-receipt', 'held-lock', 'legacy-input']) test(`unavailable evidence (${problem}) fences READY without provider POST`, async t => {
  const f = await fixture(t), a = f.app(), id = await f.prepare(a);
  const record = fs.readdirSync(f.directory).find(name => name !== 'authority.json' && name.endsWith('.json'));
  if (problem === 'missing-authority') fs.unlinkSync(path.join(f.directory, 'authority.json'));
  if (problem === 'missing-receipt') fs.unlinkSync(path.join(f.directory, record));
  if (problem === 'corrupt-receipt') fs.writeFileSync(path.join(f.directory, record), '{');
  if (problem === 'held-lock') fs.writeFileSync(path.join(f.directory, record.replace(/\.json$/, '.lock')), 'crashed');
  if (problem === 'legacy-input') delete a.rows[0].input.journalAuthority;
  assert.equal(await a.worker.runReadyAttempt(id, 'restored'), false);
  assert.equal(a.rows[0].state, 'UNKNOWN'); assert.equal(a.rows[0].safeToRetry, false);
  assert.equal((await a.service.cancelExecution('workspace', 'project', id)).kind, 'pending');
  assert.equal((await a.service.prepareExecution('workspace', 'project', f.command(id))).kind, 'conflict');
  assert.equal(f.status.launches, 0); assert.equal(f.status.cancels, 0); assert.equal(f.status.writes, 1);
});

for (const mode of ['lost', 'disconnect', 'http', 'error', 'unqualified']) test(`ambiguous provider outcome (${mode}) never authorizes retry`, async t => {
  const f = await fixture(t), a = f.app(), id = await f.prepare(a); f.status.mode = mode;
  await a.worker.runReadyAttempt(id, 'worker');
  assert.equal(a.rows[0].state, 'UNKNOWN'); assert.equal(a.rows[0].safeToRetry, false);
  assert.equal(await a.worker.runReadyAttempt(id, 'replacement'), false);
  assert.equal((await a.service.prepareExecution('workspace', 'project', f.command(id))).kind, 'conflict');
  assert.equal(f.status.launches, 1); assert.equal(f.status.writes, 1);
});

test('verified prelaunch cancellation permits explicit retry; live cancellation acknowledgment remains pending', async t => {
  const f = await fixture(t), a = f.app(), id = await f.prepare(a);
  assert.equal((await a.service.cancelExecution('workspace', 'project', id)).kind, 'cancelled');
  assert.equal((await a.service.prepareExecution('workspace', 'project', f.command(id))).kind, 'ready');
  const next = a.rows.at(-1);
  assert.equal(next.generation, 2); assert.equal(next.retryOf, id);
  await a.receipts.claimExecution(next.id, 'worker');
  await a.receipts.transitionExecution({ id: next.id, state: 'LAUNCHING' }, { state: 'RUNNING', providerRunId: 'run' });
  assert.equal((await a.service.cancelExecution('workspace', 'project', next.id)).kind, 'pending');
  assert.equal(next.state, 'CANCEL_REQUESTED'); assert.equal(next.safeToRetry, false); assert.equal(next.cancelAcknowledgedAt, null);
  assert.equal(f.status.cancels, 1); assert.equal(f.status.launches, 0);
});

for (const change of ['role', 'discussion', 'deployment-drift']) test(`current prelaunch ${change} prevents launch`, async t => {
  const f = await fixture(t), a = f.app(), id = await f.prepare(a);
  if (change === 'role') f.status.role = 'MEMBER';
  if (change === 'discussion') f.snapshot.discussionFingerprint = 'e'.repeat(64);
  if (change === 'deployment-drift') f.status.mode = change;
  await a.worker.runReadyAttempt(id, 'worker');
  assert.equal(f.status.launches, 0); assert.equal(a.rows[0].state, 'FAILED'); assert.equal(a.rows[0].safeToRetry, true);
});

test('expiry of restored PREPARING or live SQL never creates retry authority', async t => {
  const f = await fixture(t), a = f.app(), id = await f.prepare(a);
  for (const state of ['PREPARING', 'RUNNING']) {
    a.rows[0].state = state; a.rows[0].createdAt = new Date(0); a.rows[0].heartbeatAt = new Date(0);
    await a.worker.recoverStaleAttempts(); assert.equal(a.rows[0].state, 'UNKNOWN'); assert.equal(a.rows[0].safeToRetry, false);
    assert.equal((await a.service.prepareExecution('workspace', 'project', f.command(id))).kind, 'conflict');
  }
  assert.equal(f.status.launches, 0); assert.equal(f.status.writes, 1);
});

test('concurrent preparations preserve one reviewed reservation', async t => {
  const f = await fixture(t), a = f.app();
  const results = await Promise.all([a.service.prepareExecution('workspace', 'project', f.command()), a.service.prepareExecution('workspace', 'project', f.command())]);
  assert.equal(results.filter(result => result.kind === 'ready').length, 1);
  assert.equal(f.status.writes, 1); assert.equal(a.rows.length, 1); assert.equal(a.rows[0].state, 'READY');
});

test('UNKNOWN established between cancel lookup and transition cannot be promoted or posted', async t => {
  const f = await fixture(t), a = f.app(), id = await f.prepare(a);
  await a.receipts.claimExecution(id, 'worker');
  await a.receipts.transitionExecution({ id, state: 'LAUNCHING' }, { state: 'RUNNING', providerRunId: 'run' });
  f.status.afterFind = async (where, rows) => {
    if (where.id !== id || where.projectId !== 'p') return;
    delete f.status.afterFind;
    rows[0].state = 'UNKNOWN'; rows[0].safeToRetry = false;
    await f.journal.withExecutionJournal(f.target, async journal => journal.write({ ...journal.receipt, state: 'UNKNOWN', safeToRetry: false }));
  };
  assert.equal((await a.service.cancelExecution('workspace', 'project', id)).kind, 'pending');
  assert.equal(a.rows[0].state, 'UNKNOWN'); assert.equal(f.status.cancels, 0); assert.equal(f.status.launches, 0);
});
