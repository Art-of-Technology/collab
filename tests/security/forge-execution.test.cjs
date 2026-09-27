const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const Module = require('node:module');
const ts = require('typescript');
const { randomUUID } = require('node:crypto');
function compile(name, mocks = {}) {
  const file = path.resolve(__dirname, '../../src/lib/forge', name + '.ts');
  const loaded = new Module(file, module);
  loaded.filename = file; loaded.paths = Module._nodeModulePaths(path.dirname(file));
  const original = loaded.require.bind(loaded);
  loaded.require = key => key === 'server-only' ? {} : Object.hasOwn(mocks, key) ? mocks[key] : original(key);
  loaded._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file);
  return loaded.exports;
}
const reader = compile('reader', { './tasks': compile('tasks') });
const stech = compile('stech', { './reader': reader });
const stream = text => new ReadableStream({ start(controller) { for (const byte of Buffer.from(text)) controller.enqueue(Uint8Array.of(byte)); controller.close(); } });
const frame = data => 'data: ' + JSON.stringify(data) + '\n\n';
test('Stech native stream framing, deployment qualification, single launch and cancellation acknowledgment', async () => {
  const values = [];
  for await (const value of stech.parseRunStream(stream(frame({ type: 'started', runId: 'r1' }) + frame({ type: 'delta', text: 'ignored' }) + frame({ type: 'done', runId: 'r1', stopReason: 'end_turn', finalText: 'Review é' })))) values.push(value);
  assert.equal(values.length, 2); assert.equal(values[1].finalText, 'Review é');
  await assert.rejects(async () => { for await (const _ of stech.parseRunStream(stream('data: {'))) {} });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'collab-stech-'));
  try {
    const tokenFile = path.join(dir, 'token'); fs.writeFileSync(tokenFile, 'synthetic', { mode: 0o600 });
    const deployment = { origin: 'https://executor.example.test', organization: 'org', agentId: 'agent', revision: 'a'.repeat(64), tokenFile };
    let drift = false, launches = 0;
    const request = async (url, options) => {
      assert.equal(options.redirect, 'error'); assert.equal(options.cache, 'no-store');
      if (url.endsWith('/channels')) return Response.json({ channels: [{ deploymentId: drift ? 'other' : 'agent' }] });
      if (url.endsWith('/run-stream')) { launches++; assert.deepEqual(JSON.parse(options.body), { prompt: 'Task' }); return new Response('', { status: 200 }); }
      if (url.endsWith('/cancel')) return Response.json({ requestedAt: new Date().toISOString(), acknowledgedAt: null }, { status: 202 });
      return Response.json({ deployment: { id: 'agent', status: 'live', artifactSha256: deployment.revision, agentName: 'agent-name', runToken: 'must-not-retain' } });
    };
    assert.equal(await stech.qualifyDeployment(deployment, request), undefined);
    drift = true; await assert.rejects(stech.qualifyDeployment(deployment, request)); assert.equal(launches, 0);
    await stech.openExecution(deployment, 'Task', request); assert.equal(launches, 1);
    assert.equal(await stech.requestExecutionCancellation(deployment, 'r1', request), null);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('actual PostgreSQL attempt constraints and worker lifecycle never duplicate or guess an unknown run', { skip: !process.env.COLLAB_READY_TEST_DATABASE_URL }, async () => {
  const { PrismaClient } = require('@prisma/client');
  const url = new URL(process.env.COLLAB_READY_TEST_DATABASE_URL);
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname), 'fixture database must be local');
  const schema = 'ready_test_' + randomUUID().replaceAll('-', ''); url.searchParams.set('schema', schema);
  const prisma = new PrismaClient({ datasourceUrl: url.href });
  const journal = await import('../../src/lib/forge/execution-journal.mjs');
  const journalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'collab-ready-pg-journal-'));
  const priorJournal = [process.env.COLLAB_READY_JOURNAL_DIR, process.env.COLLAB_READY_JOURNAL_ID];
  process.env.COLLAB_READY_JOURNAL_DIR = journalDir;
  process.env.COLLAB_READY_JOURNAL_ID = await journal.initializeExecutionJournal(journalDir);
  const receipts = compile('execution-receipts', { '@/lib/prisma': { prisma }, './execution-journal.mjs': journal });
  const publish = row => journal.withExecutionJournal({ origin: 'https://forge.example.test', projectId: 'p', workspaceId: 'w', repositoryId: 1, issueNumber: row.issueNumber }, async authority => {
    const fields = ['id','projectId','workspaceId','repositoryId','issueNumber','generation','requestedBy','retryOf','state','safeToRetry','sourceFingerprint','readyFingerprint','memorySha','deploymentKey','configuredModel','deploymentRevision','deploymentIdentity','input','providerRunId'];
    await authority.write(Object.fromEntries(fields.map(key => [key, row[key]])));
  });
  try {
    await prisma.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    await prisma.$executeRawUnsafe('CREATE TABLE "Project" ("id" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL, "slug" TEXT NOT NULL)');
    await prisma.$executeRawUnsafe('INSERT INTO "Project" VALUES (\'p\', \'w\', \'project\')');
    const migration = fs.readFileSync(path.resolve(__dirname, '../../prisma/migrations/20260924010000_forge_execution_attempt/migration.sql'), 'utf8');
    for (const sql of migration.split(';').map(value => value.trim()).filter(Boolean)) await prisma.$executeRawUnsafe(sql);
    let launches = 0, mode = 'done', currentId, role = 'OWNER';
    const binding = { origin: 'https://forge.example.test', projectId: 'p', workspaceId: 'w', repositoryId: 1, memory: {}, execution: { deployments: [{ key: 'd', revision: 'a'.repeat(64), configuredModel: 'model', origin: 'https://executor.example.test', organization: 'org', agentId: 'agent' }] } };
    const worker = compile('execution-worker', {
      '@/lib/prisma': { prisma },
      '@/lib/permissions': { Permission: { VIEW_NOTES: 'notes', VIEW_TASKS: 'tasks' }, getUserWorkspaceRole: async () => role, checkUserPermission: async () => ({ hasPermission: true }) },
      './reader': { readForgeBindings: async () => mode === 'deployment-drift' ? [{ ...binding, execution: { deployments: [{ ...binding.execution.deployments[0], origin: 'https://other.example.test' }] } }] : [binding] },
      './issue-store': { readForgeIssue: async () => ({ issue: { state: mode === 'closed' ? 'closed' : 'open', body: '' }, fingerprint: 'b'.repeat(64), discussionFingerprint: mode === 'discussion-changed' ? 'changed' : 'c'.repeat(64), partialComments: false }) },
      './memory-store': { readProjectMemory: async () => ({ sha: 'd'.repeat(40) }) },
      './issue-content': { splitIssueBody: () => ({ metadata: { execution: { attemptId: currentId, status: 'ready' } } }) },
      './execution-receipts': receipts,
      './stech': { ...stech, qualifyDeployment: async () => {}, requestExecutionCancellation: async () => {}, openExecution: async () => {
        launches++;
        if (mode === 'lost') throw new Error('Lost response after possible launch');
        return new Response(stream(frame({ type: 'started', runId: 'run' }) + (mode === 'disconnect' ? '' : frame({ type: 'done', runId: 'run', stopReason: mode === 'cancelled' ? 'cancelled' : 'end_turn', finalText: mode === 'empty' ? '' : 'Draft PR ready for review' }))), { headers: { 'content-type': 'text/event-stream' } });
      } },
    });
    const create = async (issueNumber, state = 'READY', generation = 1) => {
      currentId = randomUUID();
      const row = await prisma.forgeExecutionAttempt.create({ data: { id: currentId, projectId: 'p', workspaceId: 'w', issueNumber, generation, repositoryId: 1, requestedBy: 'actor', state,
        sourceFingerprint: 'a'.repeat(64), readyFingerprint: 'b'.repeat(64), memorySha: 'd'.repeat(40), deploymentKey: 'd', deploymentRevision: 'a'.repeat(64), deploymentIdentity: stech.deploymentIdentity(binding.execution.deployments[0]), configuredModel: 'model', input: { prompt: 'Task', discussionFingerprint: 'c'.repeat(64), relevantIds: [], journalAuthority: process.env.COLLAB_READY_JOURNAL_ID, journalOrigin: binding.origin } } });
      await publish(row); return row;
    };
    const first = await create(1);
    await assert.rejects(create(1, 'READY', 2)); currentId = first.id;
    assert.deepEqual((await Promise.all([worker.runReadyAttempt(first.id, 'one'), worker.runReadyAttempt(first.id, 'two')])).sort(), [false, true]);
    assert.equal(launches, 1); assert.equal((await prisma.forgeExecutionAttempt.findUnique({ where: { id: first.id } })).state, 'REVIEW_REQUIRED');
    let issue = 2;
    for (const [nextMode, expected, safe] of [['empty', 'RESULT_MISSING', true], ['lost', 'UNKNOWN', false], ['disconnect', 'UNKNOWN', false], ['cancelled', 'CANCELLED', true], ['closed', 'FAILED', true], ['discussion-changed', 'FAILED', true], ['deployment-drift', 'FAILED', true]]) {
      mode = nextMode; const row = await create(issue++); const before = launches;
      await worker.runReadyAttempt(row.id, 'worker');
      const result = await prisma.forgeExecutionAttempt.findUnique({ where: { id: row.id } });
      assert.equal(result.state, expected); assert.equal(result.safeToRetry, safe);
      assert.equal(await worker.runReadyAttempt(row.id, 'replacement'), false);
      assert.equal(launches, before + (['closed', 'discussion-changed', 'deployment-drift'].includes(mode) ? 0 : 1));
    }
    mode = 'done'; role = null; const revoked = await create(issue++); const before = launches;
    await worker.runReadyAttempt(revoked.id, 'worker'); assert.equal(launches, before); role = 'OWNER';
    const orphan = await create(issue++, 'RUNNING');
    await prisma.forgeExecutionAttempt.update({ where: { id: orphan.id }, data: { heartbeatAt: new Date(0) } });
    await worker.recoverStaleAttempts();
    assert.equal((await prisma.forgeExecutionAttempt.findUnique({ where: { id: orphan.id } })).state, 'UNKNOWN');
    assert.equal(await worker.runReadyAttempt(orphan.id, 'replacement'), false); assert.equal(launches, before);
    const content = compile('issue-content', { './tasks': compile('tasks') });
    const memory = compile('memory');
    let document = { version: 1, projectId: 'p', revisions: [] };
    const actor = { id: 'actor', canManage: true }, now = new Date().toISOString();
    for (const [id, type, approved] of [['rules', 'Rules', true], ['strategy', 'Strategy', true], ['draft', 'Handoffs', false]]) {
      document = memory.saveMemoryDraft(document, id, { title: id, type, body: id + ' body', sources: [] }, actor, now);
      if (approved) document = memory.approveMemoryDraft(document, id, 1, actor, now);
    }
    const snapshot = { issue: { number: 50, title: 'Task', body: 'Body', state: 'open', updated_at: now }, fingerprint: 'a'.repeat(64), discussionFingerprint: 'c'.repeat(64), partialComments: false,
      comments: [{ id: 1, body: 'Reviewed discussion', updated_at: now, user: { login: 'human' } }] };
    const serviceBinding = { ...binding, issues: {}, owner: 'owner', repository: 'repo' };
    let sourceWrites = 0, binds = 0, cancellations = 0, editDuringReady = false;
    const service = compile('execution-service', {
      '@/lib/prisma': { prisma }, '@/lib/auth': { getAuthSession: async () => ({ user: { id: 'actor' } }) },
      '@/lib/slug-resolvers': { resolveWorkspaceSlug: async () => 'w' },
      '@/lib/permissions': { Permission: { VIEW_NOTES: 'notes', VIEW_TASKS: 'tasks' }, getUserWorkspaceRole: async () => role, checkUserPermission: async () => ({ hasPermission: true }) },
      './reader': { readForgeBindings: async () => { binds++; return [serviceBinding]; } },
      './execution-receipts': receipts, './memory': memory, './memory-store': { readProjectMemory: async () => ({ sha: 'd'.repeat(40), document }) },
      './issue-content': content,
      './issue-store': { readForgeIssue: async () => structuredClone(snapshot), writeForgeIssue: async (_binding, command) => { sourceWrites++; currentId = command.ready.attemptId; snapshot.issue.body = content.readyIssueContent(snapshot.issue, command.ready).body; snapshot.fingerprint = 'b'.repeat(64); if (editDuringReady) snapshot.issue.title = 'Concurrent title'; return { kind: 'saved' }; } },
      './stech': { deploymentIdentity: stech.deploymentIdentity, requestExecutionCancellation: async () => { cancellations++; return null; } },
    });
    const command = () => ({ number: 50, expected: snapshot.fingerprint, expectedDiscussion: snapshot.discussionFingerprint, memorySha: 'd'.repeat(40), deploymentKey: 'd', expectedDeployment: stech.deploymentIdentity(binding.execution.deployments[0]), relevantIds: ['strategy'], retryOf: null });
    role = 'MEMBER'; assert.equal((await service.prepareExecution('workspace', 'project', command())).kind, 'denied'); assert.equal(binds, 0); role = 'OWNER';
    snapshot.partialComments = true; assert.equal((await service.prepareExecution('workspace', 'project', command())).kind, 'conflict'); snapshot.partialComments = false;
    assert.equal((await service.prepareExecution('workspace', 'project', { ...command(), relevantIds: ['draft'] })).kind, 'invalid');
    const outcomes = await Promise.all([service.prepareExecution('workspace', 'project', command()), service.prepareExecution('workspace', 'project', command())]);
    assert.equal(outcomes.filter(value => value.kind === 'ready').length, 1); assert.equal(sourceWrites, 1);
    const prepared = await prisma.forgeExecutionAttempt.findFirstOrThrow({ where: { issueNumber: 50 } });
    const payload = JSON.parse(prepared.input.prompt.split('\n\n')[1]);
    assert.deepEqual(payload.approvedProjectMemory.map(note => note.id), ['rules', 'strategy']);
    assert.equal(payload.discussion[0].body, 'Reviewed discussion');
    assert.equal((await service.cancelExecution('workspace', 'project', prepared.id)).kind, 'cancelled');
    assert.equal((await service.prepareExecution('workspace', 'project', { ...command(), retryOf: prepared.id })).kind, 'ready');
    const retried = await prisma.forgeExecutionAttempt.findFirstOrThrow({ where: { issueNumber: 50 }, orderBy: { generation: 'desc' } });
    await prisma.forgeExecutionAttempt.update({ where: { id: retried.id }, data: { state: 'RUNNING', providerRunId: 'run', heartbeatAt: new Date() } });
    await publish(await prisma.forgeExecutionAttempt.findUniqueOrThrow({ where: { id: retried.id } }));
    assert.equal((await service.cancelExecution('workspace', 'project', retried.id)).kind, 'pending');
    const cancelling = await prisma.forgeExecutionAttempt.findUnique({ where: { id: retried.id } });
    assert.equal(cancelling.state, 'CANCEL_REQUESTED'); assert.equal(cancelling.cancelAcknowledgedAt, null);
    assert.equal(cancellations, 1);
    binding.execution.deployments[0].agentId = 'changed';
    assert.equal((await service.cancelExecution('workspace', 'project', retried.id)).kind, 'pending'); assert.equal(cancellations, 1);
    binding.execution.deployments[0].agentId = 'agent';
    assert.equal((await service.prepareExecution('workspace', 'project', { ...command(), retryOf: retried.id })).kind, 'conflict');
    editDuringReady = true; snapshot.issue.number = 51;
    assert.equal((await service.prepareExecution('workspace', 'project', { ...command(), number: 51 })).kind, 'conflict');
    assert.equal((await prisma.forgeExecutionAttempt.findFirstOrThrow({ where: { issueNumber: 51 } })).state, 'FAILED');
    // Independent client/process view sees persisted unknown state, not an in-memory queue.
    const restarted = new PrismaClient({ datasourceUrl: url.href });
    try { assert.equal((await restarted.forgeExecutionAttempt.findUnique({ where: { id: orphan.id } })).safeToRetry, false); } finally { await restarted.$disconnect(); }
  } finally {
    try { await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); } finally {
      await prisma.$disconnect();
      for (const [i, key] of ['COLLAB_READY_JOURNAL_DIR', 'COLLAB_READY_JOURNAL_ID'].entries()) {
        if (priorJournal[i] === undefined) delete process.env[key]; else process.env[key] = priorJournal[i];
      }
      fs.rmSync(journalDir, { recursive: true, force: true });
    }
  }
});
