const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync, readFileSync } = require('node:fs');
const { tmpdir, userInfo } = require('node:os');
const { join, resolve } = require('node:path');
const { execFileSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { Prisma, PrismaClient } = require('@prisma/client');
const { load } = require('../security/helpers.cjs');
const { monitorAgreesWithInboxes } = require('./monitor-agreement.cjs');

// Same socket-only disposable PostgreSQL pattern as tests/search; no application DB.
const directory = mkdtempSync(join(tmpdir(), 'collab-handoffs-pg-'));
const bindir = execFileSync('pg_config', ['--bindir'], { encoding: 'utf8' }).trim();
let started = false, prisma, publicPrisma;
after(async () => {
  await publicPrisma?.$disconnect();
  await prisma?.$disconnect();
  if (started) execFileSync(join(bindir, 'pg_ctl'), ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'], { stdio: 'pipe' });
  rmSync(directory, { recursive: true, force: true });
});

test('durable agent handoffs: fanout, atomic claim, context access and a complete timeline', async t => {
  execFileSync(join(bindir, 'initdb'), ['-D', join(directory, 'data'), '-A', 'trust', '--no-locale', '-E', 'UTF8'], { stdio: 'pipe' });
  execFileSync(join(bindir, 'pg_ctl'), ['-D', join(directory, 'data'), '-l', join(directory, 'server.log'),
    '-o', `-k ${directory} -c listen_addresses='' -c fsync=off`, '-w', 'start'], { stdio: 'pipe' });
  started = true;
  const url = `postgresql://${encodeURIComponent(userInfo().username)}@localhost/postgres?host=${encodeURIComponent(directory)}`;
  execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'db', 'push', '--skip-generate', '--schema', resolve('prisma/schema.prisma')],
    { env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' });
  prisma = new PrismaClient({ datasources: { db: { url } } });
  class TestPrismaClient extends PrismaClient {
    constructor(options) { super({ ...options, datasources: { db: { url } } }); }
  }
  publicPrisma = load('src/lib/prisma.ts', { '@prisma/client': { Prisma, PrismaClient: TestPrismaClient },
    './database-diagnostics': load('src/lib/database-diagnostics.ts', {}, { performance, setTimeout, console }),
    './issue-visibility': load('src/lib/issue-visibility.ts') }, { global: {}, process: { env: { NODE_ENV: 'production' } } }).prisma;
  // Exercise the additive migration itself against existing rows, rather than only db push.
  await prisma.$executeRawUnsafe('DROP TABLE "AgentReviewRequest", "AgentTransferOffer", "AgentReceipt", "AgentHandoff", "AgentRegistration"');
  await prisma.user.createMany({ data: ['alice', 'bob', 'outsider'].map(id => ({ id, name: id })) });
  await prisma.workspace.createMany({ data: [{ id: 'w', name: 'Work', slug: 'work', ownerId: 'alice' }, { id: 'foreign', name: 'Foreign', slug: 'foreign', ownerId: 'outsider' }] });
  await prisma.workspaceMember.create({ data: { workspaceId: 'w', userId: 'bob' } });
  await prisma.project.createMany({ data: ['w', 'foreign'].map(id => ({ id: `p-${id}`, workspaceId: id, name: id, slug: id, issuePrefix: id })) });
  await prisma.issue.createMany({ data: ['w', 'foreign'].map(id => ({ id: `i-${id}`, workspaceId: id, projectId: `p-${id}`, title: id, issueKey: `${id}-1` })) });
  await prisma.taskLabel.createMany({ data: ['w', 'foreign'].map(id => ({ id: `label-${id}`, workspaceId: id, name: 'backend', color: '#123456' })) });
  const migration = readFileSync(resolve('prisma/migrations/20261017000100_agent_handoffs/migration.sql'), 'utf8');
  for (const statement of migration.split(';').filter(s => s.trim())) await prisma.$executeRawUnsafe(statement);
  await prisma.$executeRawUnsafe(`INSERT INTO "AgentRegistration" (id, "workspaceId", "userId", name, "updatedAt") VALUES ('legacy-agent', 'w', 'alice', 'legacy-agent', NOW())`);
  const operationsMigration = readFileSync(resolve('prisma/migrations/20261026000100_agent_operations/migration.sql'), 'utf8');
  for (const statement of operationsMigration.split(';').filter(s => s.trim())) await prisma.$executeRawUnsafe(statement);
  const managedWorkersMigration = readFileSync(resolve('prisma/migrations/20261027000100_managed_workers/migration.sql'), 'utf8');
  for (const statement of managedWorkersMigration.split(';').filter(s => s.trim())) await prisma.$executeRawUnsafe(statement);
  const offerMigration = readFileSync(resolve('prisma/migrations/20261030000200_agent_transfer_offer/migration.sql'), 'utf8');
  execFileSync(join(bindir, 'psql'), ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-h', directory, '-U', userInfo().username, '-d', 'postgres'], { input: offerMigration, stdio: ['pipe', 'pipe', 'pipe'] });
  const workerGuard = readFileSync(resolve('prisma/migrations/20261031000100_transfer_worker_guard/migration.sql'), 'utf8');
  execFileSync(join(bindir, 'psql'), ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-h', directory, '-U', userInfo().username, '-d', 'postgres'], { input: workerGuard, stdio: ['pipe', 'pipe', 'pipe'] });
  const recipientGuard = readFileSync(resolve('prisma/migrations/20261031000200_transfer_recipient_guard/migration.sql'), 'utf8');
  execFileSync(join(bindir, 'psql'), ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-h', directory, '-U', userInfo().username, '-d', 'postgres'], { input: recipientGuard, stdio: ['pipe', 'pipe', 'pipe'] });
  const pendingGuard = readFileSync(resolve('prisma/migrations/20261031000300_pending_offer_serialization/migration.sql'), 'utf8');
  execFileSync(join(bindir, 'psql'), ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-h', directory, '-U', userInfo().username, '-d', 'postgres'], { input: pendingGuard, stdio: ['pipe', 'pipe', 'pipe'] });
  // A handoff from before the claim marker comes out of its migration as unknown, not as never claimed.
  await prisma.$executeRawUnsafe(`INSERT INTO "AgentHandoff" (id, "workspaceId", "issueId", "sourceKey", content, "updatedAt") VALUES ('legacy-handoff', 'w', 'i-w', 'legacy-handoff', 'old', NOW())`);
  const claimedOnceMigration = readFileSync(resolve('prisma/migrations/20261114000100_handoff_claimed_once/migration.sql'), 'utf8');
  execFileSync(join(bindir, 'psql'), ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-h', directory, '-U', userInfo().username, '-d', 'postgres'], { input: claimedOnceMigration, stdio: ['pipe', 'pipe', 'pipe'] });
  assert.equal((await prisma.agentHandoff.findUniqueOrThrow({ where: { id: 'legacy-handoff' } })).claimedOnce, null);
  await prisma.agentHandoff.delete({ where: { id: 'legacy-handoff' } });
  const legacy = await prisma.agentRegistration.findUniqueOrThrow({ where: { id: 'legacy-agent' } });
  assert.equal(legacy.host, null); assert.equal(legacy.sessionId, null); assert.equal(legacy.watcher, null);
  assert.equal(legacy.managedWorker, null, 'migration preserves existing agents as unmanaged');
  await prisma.agentRegistration.delete({ where: { id: legacy.id } });
  assert.equal(await prisma.issue.count(), 2, 'migration preserves existing work');
  const finder = load('src/lib/issue-finder.ts', { '@/lib/prisma': { prisma: publicPrisma } });
  const service = load('src/lib/agent-handoffs.ts', { 'node:crypto': require('node:crypto'), 'node:buffer': require('node:buffer'), zod: require('zod'),
    '@/lib/prisma': { prisma: publicPrisma }, '@/lib/issue-finder': finder, '@/lib/oauth-scopes': load('src/lib/oauth-scopes.ts') }, { Date });
  await t.test('HTTP parsing bounds streamed bodies and rejects malformed input', async () => {
    const http = load('src/lib/agent-handoff-http.ts', { './agent-handoffs': service, zod: require('zod'), 'next/server': { NextResponse: Response } }, { Buffer });
    const request = body => new Request('https://example.test', { method: 'POST', body });
    assert.equal((await http.handoffBody(request('{"agent":"lead"}'))).agent, 'lead');
    assert.equal((await http.handoffResponse(() => http.handoffBody(request('{')))).status, 400);
    assert.equal((await http.handoffResponse(() => http.handoffBody(request('x'.repeat(65537))))).status, 413);
  });
  const context = (user = 'alice', workspace = 'w', scopes = ['issues:read', 'issues:write', 'workspace:write']) => ({ user: { id: user }, workspace: { id: workspace }, token: { scopes } });
  const alice = context(), bob = context('bob'), outsider = context('outsider', 'foreign');
  const register = (ctx, name, labels = []) => service.registerAgent(ctx, service.registrationSchema.parse({ name, labelIds: labels }));
  const send = data => service.sendHandoff(alice, service.sendSchema.parse({ agent: 'lead', issue: 'w-1', content: 'Objective: implement the route. Evidence: reviewed specification. Next: run focused tests.', toLabels: ['label-w'], ...data }));
  const inbox = (ctx, agent, state = 'unseen') => service.agentInbox(ctx, service.inboxSchema.parse({ agent, state }));
  const act = (ctx, handoff, agent, action, content) => service.actOnHandoff(ctx, handoff.id, service.actionSchema.parse({ agent, action, ...(content && { content }) }));
  await register(alice, 'lead'); await register(alice, 'worker-a', ['label-w']); await register(bob, 'worker-b', ['label-w']);
  await register(outsider, 'outsider', ['label-foreign']);

  t.afterEach(() => monitorAgreesWithInboxes({ prisma, service, context, viewer: alice }));

  await t.test('owned inbox cursor pages tied timestamps without leaking inaccessible work', async () => {
    const worker = await prisma.agentRegistration.findUniqueOrThrow({ where: { workspaceId_name: { workspaceId: 'w', name: 'worker-b' } } });
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    const ids = Array.from({ length: 58 }, (_, i) => `cursor-${String(i).padStart(3, '0')}`);
    const rows = ids.map(id => ({ id, sourceKey: id, workspaceId: 'w', issueId: 'i-w', content: id,
      recipientNames: ['worker-b'], status: 'claimed', claimedById: worker.id, createdAt, updatedAt: createdAt }));
    await prisma.agentHandoff.createMany({ data: [...rows, { id: 'cursor-foreign', sourceKey: 'cursor-foreign',
      workspaceId: 'foreign', issueId: 'i-foreign', content: 'foreign', recipientNames: ['worker-b'], createdAt, updatedAt: createdAt }] });
    const get = (ctx, agent, state, cursor) => service.agentInbox(ctx, service.inboxSchema.parse({ agent, state, limit: 20, ...(cursor && { cursor }) }));
    try {
      const first = await get(bob, 'worker-b', 'claimed');
      assert.deepEqual(Array.from(first.items, row => row.id), ids.slice(0, 20));
      assert.equal(first.hasMore, true); assert.ok(first.nextCursor);
      const http = load('src/lib/agent-handoff-http.ts', { './agent-handoffs': service, zod: require('zod'), 'next/server': { NextResponse: Response } }, { Buffer });
      const route = load('src/app/api/apps/auth/agents/inbox/route.ts', {
        '@/lib/apps/auth-middleware': { withAppAuth: (fn, options) => { assert.deepEqual(Array.from(options.requiredScopes), ['issues:read']); return fn; } },
        '@/lib/agent-handoffs': service, '@/lib/agent-handoff-http': http,
      }, { URL });
      const url = new URL('https://example.test/api/apps/auth/agents/inbox');
      for (const [key, value] of Object.entries({ agent: 'worker-b', state: 'claimed', limit: '20', cursor: first.nextCursor })) url.searchParams.set(key, value);
      const response = await route.GET(new Request(url), bob);
      assert.equal(response.status, 200);
      assert.equal((await response.json()).items[0].id, ids[20]);
      url.searchParams.set('cursor', 'bm90LWpzb24');
      assert.equal((await route.GET(new Request(url), bob)).status, 400);
      await assert.rejects(get(alice, 'worker-a', 'claimed', first.nextCursor), e => e.code === 'invalid_cursor');
      await assert.rejects(get(bob, 'worker-b', 'unseen', first.nextCursor), e => e.code === 'invalid_cursor');
      await assert.rejects(get(bob, 'worker-b', 'claimed', 'bm90LWpzb24'), e => e.code === 'invalid_cursor');
      assert.equal(service.inboxSchema.safeParse({ agent: 'worker-b', cursor: '%%%'}).success, false);
      assert.equal(service.inboxSchema.safeParse({ agent: 'worker-b', cursor: 'a'.repeat(4097) }).success, false);

      // A deleted cursor row and status changes must not alter the remaining keyset.
      await prisma.agentHandoff.delete({ where: { id: ids[19] } });
      await prisma.agentHandoff.update({ where: { id: ids[20] }, data: { status: 'completed' } });
      const second = await get(bob, 'worker-b', 'claimed', first.nextCursor);
      assert.deepEqual(Array.from(second.items, row => row.id), ids.slice(21, 41));
      const third = await get(bob, 'worker-b', 'claimed', second.nextCursor);
      assert.deepEqual(Array.from(third.items, row => row.id), ids.slice(41));
      assert.equal(third.hasMore, false); assert.equal(third.nextCursor, null);

      const unseen = await get(bob, 'worker-b', 'unseen');
      await prisma.agentReceipt.create({ data: { agentId: worker.id, handoffId: ids[21], seenAt: new Date() } });
      const remaining = await get(bob, 'worker-b', 'unseen', unseen.nextCursor);
      assert.ok(!remaining.items.some(row => row.id === ids[21]), 'seen status is rechecked on the next page');
      await prisma.workspaceMember.updateMany({ where: { userId: 'bob' }, data: { status: false } });
      assert.equal((await get(bob, 'worker-b', 'claimed', first.nextCursor)).items.length, 0, 'revoked access is rechecked on the next page');
    } finally {
      await prisma.workspaceMember.updateMany({ where: { userId: 'bob' }, data: { status: true } });
      await prisma.agentHandoff.deleteMany({ where: { id: { in: [...ids, 'cursor-foreign'] } } });
    }
  });

  await t.test('unbound registration and list JSON contracts survive creation and label replacement', async () => {
    let agentId;
    for (const labelIds of [['label-w'], []]) {
      const result = await register(alice, 'compat-agent', labelIds);
      agentId ??= result.id;
      const stored = await prisma.agentRegistration.findUniqueOrThrow({ where: { id: agentId } });
      assert.deepEqual(JSON.parse(JSON.stringify(result)), { id: agentId, workspaceId: 'w', userId: 'alice',
        name: 'compat-agent', labelIds, createdAt: stored.createdAt.toISOString(), updatedAt: stored.updatedAt.toISOString() });
      const listed = (await service.listAgents(alice)).find(a => a.id === agentId);
      assert.deepEqual(JSON.parse(JSON.stringify(listed)), { id: agentId, name: 'compat-agent', labelIds, worker: null });
      for (const state of ['unseen', 'claimed']) for (const agent of [undefined, 'compat-agent']) {
        const monitor = await service.workspaceAgentInbox(alice, { state, agent, limit: 50 });
        assert.deepEqual(JSON.parse(JSON.stringify(monitor.agents.find(a => a.name === 'compat-agent'))), { name: 'compat-agent' });
      }
    }
    await prisma.agentRegistration.delete({ where: { id: agentId } });
  });

  await t.test('names belong to users; subscriptions cannot reference foreign labels', async () => {
    await assert.rejects(register(bob, 'lead'), e => e.code === 'agent_name_taken');
    await assert.rejects(register(alice, 'bad', ['label-foreign']), e => e.code === 'invalid_labels');
    await assert.rejects(inbox(bob, 'worker-a'), e => e.code === 'agent_not_found');
    await assert.rejects(send({ issue: 'foreign-1' }), e => e.code === 'issue_not_found');
  });
  const requestId = randomUUID(), handoff = await send({ requestId, requestAck: true });
  await t.test('one durable request fans out and a retry does not duplicate work or history', async () => {
    const retry = await send({ requestId, requestAck: true });
    assert.equal(retry.id, handoff.id);
    for (const row of [handoff, retry, (await service.getHandoff(alice, 'worker-a', handoff.id)).handoff,
      (await inbox(alice, 'worker-a')).items[0], (await service.workspaceAgentInbox(alice, { state: 'unseen', limit: 50 })).items[0]]) {
      assert.equal(Object.hasOwn(row, 'claimedOnce'), false);
    }
    assert.equal((await publicPrisma.agentHandoff.findUniqueOrThrow({ where: { id: handoff.id }, select: { claimedOnce: true } })).claimedOnce, false);
    await assert.rejects(send({ requestId, content: 'Different' }), e => e.code === 'request_conflict');
    assert.equal((await inbox(alice, 'worker-a')).items[0].id, handoff.id);
    assert.equal((await inbox(bob, 'worker-b')).items[0].id, handoff.id);
    assert.equal((await inbox(outsider, 'outsider')).items.length, 0);
    await assert.rejects(service.getHandoff(outsider, 'outsider', handoff.id), e => e.code === 'handoff_not_found');
  });
  await t.test('workspace monitor includes other owners, deduplicates fanout, and respects both users access', async () => {
    const query = { state: 'unseen', limit: 50 };
    const all = await service.workspaceAgentInbox(alice, query);
    assert.deepEqual(Array.from(all.agents, a => a.name), ['lead', 'worker-a', 'worker-b']);
    assert.deepEqual(Array.from(all.items, h => h.id), [handoff.id]);
    assert.equal((await service.workspaceAgentInbox(alice, { ...query, agent: 'worker-b' })).items[0].id, handoff.id);
    await assert.rejects(service.workspaceAgentInbox(alice, { ...query, agent: 'outsider' }), e => e.code === 'agent_not_found');
    assert.equal((await service.workspaceAgentInbox(context('outsider'), query)).items.length, 0);
    await prisma.workspaceMember.updateMany({ where: { userId: 'bob' }, data: { status: false } });
    assert.equal((await service.workspaceAgentInbox(alice, { ...query, agent: 'worker-b' })).items.length, 0);
    await prisma.workspaceMember.updateMany({ where: { userId: 'bob' }, data: { status: true } });
    await act(alice, handoff, 'worker-a', 'seen');
    assert.equal((await service.workspaceAgentInbox(alice, query)).items.length, 1, 'another recipient still has unseen work');
    assert.equal((await service.workspaceAgentInbox(alice, { ...query, agent: 'worker-a' })).items.length, 0);
    assert.equal(await prisma.agentReceipt.count(), 1, 'monitor never marks another agent seen');
    await prisma.agentReceipt.deleteMany();
    await assert.rejects(act(alice, handoff, 'worker-b', 'claim'), e => e.code === 'agent_not_found');
  });
  await t.test('workspace monitor does not list a claim that was completed while it was reading', async () => {
    const worker = await prisma.agentRegistration.findUniqueOrThrow({ where: { workspaceId_name: { workspaceId: 'w', name: 'worker-a' } } });
    const row = await prisma.agentHandoff.create({ data: { id: 'changing-handoff', sourceKey: 'changing-handoff', workspaceId: 'w', issueId: 'i-w',
      content: 'changing', recipientNames: ['worker-a'], claimedById: worker.id, status: 'claimed' } });
    // The monitor first asks which handoffs are candidates, then reads them. This client completes the claim in between.
    let changed = false;
    const between = new Proxy(publicPrisma, { get(target, key) {
      if (key !== '$queryRaw') return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
      return async (...args) => {
        const candidates = await target.$queryRaw(...args);
        if (!changed) await prisma.agentHandoff.update({ where: { id: row.id }, data: { status: 'completed' } });
        changed = true;
        return candidates;
      };
    } });
    const monitor = load('src/lib/agent-handoffs.ts', { 'node:crypto': require('node:crypto'), 'node:buffer': require('node:buffer'), zod: require('zod'),
      '@/lib/prisma': { prisma: between }, '@/lib/issue-finder': finder, '@/lib/oauth-scopes': load('src/lib/oauth-scopes.ts') }, { Date });
    try {
      const claimed = { state: 'claimed', agent: 'worker-a', limit: 50 };
      assert.ok((await service.workspaceAgentInbox(alice, claimed)).items.some(item => item.id === row.id), 'listed while it is claimed');
      const result = await monitor.workspaceAgentInbox(alice, claimed);
      assert.equal(changed, true);
      assert.equal(result.items.some(item => item.id === row.id), false);
    } finally {
      await prisma.agentHandoff.delete({ where: { id: row.id } });
    }
  });
  await t.test('workspace monitor reads on past a window of candidates that may not be shown', async () => {
    // 505 old handoffs for bob's agent, then three for alice's. The monitor takes candidates 500 at a time.
    const at = seconds => new Date(Date.UTC(2020, 0, 1, 0, 0, seconds));
    const row = (id, recipient, seconds) => ({ id, sourceKey: id, workspaceId: 'w', issueId: 'i-w', content: id,
      recipientNames: [recipient], createdAt: at(seconds), updatedAt: at(seconds) });
    const bobs = Array.from({ length: 505 }, (_, i) => row(`window-${String(i).padStart(3, '0')}`, 'worker-b', i));
    await prisma.agentHandoff.createMany({ data: [...bobs, ...['x', 'y', 'z'].map((id, i) => row(`window-${id}`, 'worker-a', 600 + i))] });
    const monitor = limit => service.workspaceAgentInbox(alice, { state: 'unseen', limit });
    const ids = page => Array.from(page.items, item => item.id);
    try {
      const first = await monitor(50);
      assert.deepEqual([ids(first), first.hasMore], [bobs.slice(0, 50).map(item => item.id), true]);
      await monitorAgreesWithInboxes({ prisma, service, context, viewer: alice });
      // Bob loses access: the whole first window is his, and the page is filled from the next one.
      await prisma.workspaceMember.updateMany({ where: { userId: 'bob' }, data: { status: false } });
      const two = await monitor(2);
      assert.deepEqual([ids(two), two.hasMore], [['window-x', 'window-y'], true]);
      const three = await monitor(3);
      assert.deepEqual(ids(three), ['window-x', 'window-y', 'window-z']);
      assert.equal(three.hasMore, (await monitor(50)).items.length > 3);
      await monitorAgreesWithInboxes({ prisma, service, context, viewer: alice });
    } finally {
      await prisma.workspaceMember.updateMany({ where: { userId: 'bob' }, data: { status: true } });
      await prisma.agentHandoff.deleteMany({ where: { id: { startsWith: 'window-' } } });
    }
  });
  await t.test('retiring an agent releases its work, leaves what was addressed to it, and frees its name', async () => {
    await register(bob, 'leaver');
    const leaver = await prisma.agentRegistration.findUniqueOrThrow({ where: { workspaceId_name: { workspaceId: 'w', name: 'leaver' } } });
    const workerA = await prisma.agentRegistration.findUniqueOrThrow({ where: { workspaceId_name: { workspaceId: 'w', name: 'worker-a' } } });
    const row = (id, data) => ({ id, sourceKey: id, workspaceId: 'w', issueId: 'i-w', content: id, ...data });
    await prisma.agentHandoff.createMany({ data: [
      row('retire-claimed', { recipientNames: ['leaver'], status: 'claimed', claimedById: leaver.id }),
      row('retire-own', { recipientNames: ['leaver'] }),
      row('retire-shared', { recipientNames: ['leaver', 'worker-a'] }),
      row('retire-labelled', { recipientNames: ['leaver'], labelIds: ['label-w'] }),
      row('retire-sent', { recipientNames: ['worker-a'], senderId: leaver.id }),
    ] });
    await prisma.agentReceipt.create({ data: { agentId: workerA.id, handoffId: 'retire-claimed', seenAt: new Date() } });
    const state = id => prisma.agentHandoff.findUniqueOrThrow({ where: { id } });
    const activities = () => prisma.issueActivity.count({ where: { itemId: 'i-w' } });
    const before = await activities();
    try {
      // The routes: the preview only reads, retiring needs both write scopes, and errors are answers, not crashes.
      const http = load('src/lib/agent-handoff-http.ts', { './agent-handoffs': service, zod: require('zod'), 'next/server': { NextResponse: Response } }, { Buffer });
      const route = (file, verb) => load(file, {
        '@/lib/apps/auth-middleware': { withAppAuth: (fn, options) => Object.assign(fn, { scopes: Array.from(options.requiredScopes) }) },
        '@/lib/agent-handoffs': service, '@/lib/agent-handoff-http': http,
      }, { URL })[verb];
      const previewRoute = route('src/app/api/apps/auth/agents/delete-preview/route.ts', 'GET');
      const retire = route('src/app/api/apps/auth/agents/route.ts', 'DELETE');
      assert.deepEqual([previewRoute.scopes, retire.scopes], [['issues:read'], ['workspace:write', 'issues:write']]);
      const call = async (handler, query, ctx) => { const response = await handler(new Request(`https://example.test/api/apps/auth/agents${query}`), ctx); return [response.status, (await response.json()).error ?? null]; };
      assert.deepEqual(await call(retire, '?agent=lead', bob), [404, 'agent_not_found']);
      assert.deepEqual(await call(retire, '', alice), [400, 'invalid_request']);
      assert.deepEqual(await call(previewRoute, '?agent=leaver', bob), [200, null]);
      assert.equal(await prisma.agentRegistration.count({ where: { id: leaver.id } }), 1);

      // Only the agent's own user or the workspace owner may retire it; bob is neither for alice's agent.
      await assert.rejects(service.retireAgent(bob, 'lead', false), e => e.code === 'agent_not_found' && e.status === 404);
      await assert.rejects(service.retireAgent(alice, 'nobody', false), e => e.code === 'agent_not_found');
      await assert.rejects(service.retireAgent(alice, 'Not A Name', false), e => e.name === 'ZodError');

      // The preview says what would happen and changes nothing.
      const preview = await service.retireAgent(bob, 'leaver', true);
      assert.deepEqual(JSON.parse(JSON.stringify(preview)), { agent: 'leaver', id: leaver.id,
        released: [{ id: 'retire-claimed', issueKey: 'w-1' }], releasedHidden: 0, unowned: { count: 1, handoffs: [{ id: 'retire-own', issueKey: 'w-1' }] } });
      assert.deepEqual([(await state('retire-claimed')).status, await prisma.agentRegistration.count({ where: { id: leaver.id } }), await activities()], ['claimed', 1, before]);

      // Not while its watcher runs, and not a managed worker.
      const now = new Date().toISOString();
      await prisma.agentRegistration.update({ where: { id: leaver.id }, data: { host: 'laptop', sessionId: 'session', watcher: { id: 'watcher', state: 'running', startedAt: now, heartbeatAt: now, lastPollAt: null, lastWakeAt: null, errorCode: null } } });
      await assert.rejects(service.retireAgent(bob, 'leaver', false), e => e.code === 'watcher_active' && e.status === 409);
      await prisma.agentRegistration.update({ where: { id: leaver.id }, data: { watcher: Prisma.DbNull, managedWorker: { state: 'stopped' } } });
      await assert.rejects(service.retireAgent(bob, 'leaver', false), e => e.code === 'managed_agent');
      await prisma.agentRegistration.update({ where: { id: leaver.id }, data: { managedWorker: Prisma.DbNull } });
      assert.deepEqual([(await state('retire-claimed')).status, await activities()], ['claimed', before], 'a refusal changes nothing');

      // The removal can name the registration that was previewed; another one under the same name is not touched.
      await assert.rejects(service.retireAgent(alice, 'leaver', false, 'some-other-registration'), e => e.code === 'agent_changed' && e.status === 409);
      assert.deepEqual(await call(retire, '?agent=leaver&id=some-other-registration', alice), [409, 'agent_changed']);
      assert.deepEqual([(await state('retire-claimed')).status, await prisma.agentRegistration.count({ where: { id: leaver.id } }), await activities()], ['claimed', 1, before]);

      // The workspace owner retires another user's agent.
      const done = await service.retireAgent(alice, 'leaver', false, leaver.id);
      assert.deepEqual(JSON.parse(JSON.stringify(done)), { ...JSON.parse(JSON.stringify(preview)), retired: true });
      assert.equal(await prisma.agentRegistration.count({ where: { id: leaver.id } }), 0);
      const released = await state('retire-claimed');
      assert.deepEqual([released.status, released.claimedById, await prisma.agentReceipt.count({ where: { handoffId: 'retire-claimed' } })], ['open', null, 0]);
      const entry = await prisma.issueActivity.findFirstOrThrow({ where: { itemId: 'i-w', action: 'AGENT_RELEASE' }, orderBy: { createdAt: 'desc' } });
      assert.deepEqual([entry.userId, JSON.parse(entry.details)], ['alice', { agent: { id: leaver.id, name: 'leaver' }, handoffId: 'retire-claimed', content: 'Released: this agent was retired.', retired: true }]);
      assert.equal(await activities(), before + 1, 'one entry, for the one released claim');
      // What was addressed to it stays open as it was; what it had sent keeps its content and loses the sender link.
      for (const id of ['retire-own', 'retire-shared', 'retire-labelled']) assert.deepEqual([(await state(id)).status, (await state(id)).recipientNames.includes('leaver')], ['open', true], id);
      assert.equal((await state('retire-sent')).senderId, null);
      assert.ok((await service.listAgents(alice)).every(agent => agent.name !== 'leaver'));
      // The name is free again, and whoever takes it gets the handoffs still addressed to it.
      await register(alice, 'leaver');
      assert.deepEqual(Array.from((await inbox(alice, 'leaver')).items, item => item.id).sort(), ['retire-claimed', 'retire-labelled', 'retire-own', 'retire-shared']);
    } finally {
      await prisma.agentHandoff.deleteMany({ where: { id: { startsWith: 'retire-' } } });
      await prisma.issueActivity.deleteMany({ where: { itemId: 'i-w', details: { contains: 'retire-claimed' } } });
      await prisma.agentRegistration.deleteMany({ where: { workspaceId: 'w', name: 'leaver' } });
    }
  });
  await t.test('retirement hides inaccessible issues while releasing every claim', async () => {
    await register(bob, 'restricted-leaver');
    const agent = await prisma.agentRegistration.findFirstOrThrow({ where: { workspaceId: 'w', name: 'restricted-leaver' } });
    await prisma.projectStatus.create({ data: { id: 'foreign-status', name: 'foreign', displayName: 'Foreign', projectId: 'p-foreign' } });
    await prisma.issue.create({ data: { id: 'restricted-issue', issueKey: 'w-restricted', title: 'Restricted', workspaceId: 'w', projectId: 'p-w', statusId: 'foreign-status' } });
    await prisma.agentHandoff.createMany({ data: [
      { id: 'restricted-claimed', sourceKey: 'restricted-claimed', workspaceId: 'w', issueId: 'restricted-issue', content: 'Claim', status: 'claimed', claimedById: agent.id },
      { id: 'restricted-open', sourceKey: 'restricted-open', workspaceId: 'w', issueId: 'restricted-issue', content: 'Open', recipientNames: ['restricted-leaver'] },
    ] });
    try {
      for (const preview of [true, false]) {
        const result = await service.retireAgent(bob, 'restricted-leaver', preview);
        // Bob cannot read that issue: its key is not shown to him, but he is told that one more claim is released.
        assert.deepEqual(JSON.parse(JSON.stringify([result.released, result.releasedHidden, result.unowned])), [[], 1, { count: 0, handoffs: [] }]);
        assert.doesNotMatch(JSON.stringify(result), /w-restricted|restricted-issue|restricted-claimed|restricted-open/);
      }
      const claim = await prisma.agentHandoff.findUniqueOrThrow({ where: { id: 'restricted-claimed' } });
      assert.deepEqual([claim.status, claim.claimedById], ['open', null]);
      // The issue still gets its entry, for those who can read it.
      assert.equal(await prisma.issueActivity.count({ where: { itemId: 'restricted-issue', action: 'AGENT_RELEASE' } }), 1);
    } finally {
      await prisma.issue.delete({ where: { id: 'restricted-issue' } });
      await prisma.projectStatus.delete({ where: { id: 'foreign-status' } });
      await prisma.agentRegistration.deleteMany({ where: { id: agent.id } });
    }
  });
  await t.test('workspace monitor and agent floor state a recipient user\'s issue access once, however many agents that user has', async () => {
    // In production 76 agents under three users made this one query exceed the database's memory.
    const sent = [];
    const logged = new PrismaClient({ datasources: { db: { url } }, log: [{ emit: 'event', level: 'query' }] });
    logged.$on('query', event => sent.push(event.query));
    const monitor = load('src/lib/agent-handoffs.ts', { 'node:crypto': require('node:crypto'), 'node:buffer': require('node:buffer'), zod: require('zod'),
      '@/lib/prisma': { prisma: logged }, '@/lib/issue-finder': finder, '@/lib/oauth-scopes': load('src/lib/oauth-scopes.ts') }, { Date });
    // What the monitor and the floor send to read handoffs, without the agent list itself.
    const handoffSql = () => sent.filter(sql => sql.includes('"AgentHandoff"'));
    const { commentHtml } = load('src/lib/comment-html.ts', { 'isomorphic-dompurify': { default: require('isomorphic-dompurify') }, marked: require('marked') });
    const floor = load('src/lib/agent-floor.ts', { 'server-only': {}, '@/lib/prisma': { prisma: logged }, '@/lib/issue-finder': finder,
      '@/lib/post-access': load('src/lib/post-access.ts', { '@/lib/prisma': { prisma: logged } }),
      '@/lib/agent-floor-model': load('src/lib/agent-floor-model.ts'), '@/lib/comment-html': { commentHtml } }, { Date, console });
    await monitor.workspaceAgentInbox(alice, { state: 'unseen', limit: 50 });
    await monitor.workspaceAgentInbox(alice, { state: 'claimed', limit: 50 });
    const fewAgents = handoffSql();
    sent.length = 0;
    await floor.readAgentFloor('alice', 'w');
    const fewOnBoard = handoffSql().find(sql => sql.includes('"public"."Issue"'));
    await prisma.agentRegistration.createMany({ data: Array.from({ length: 40 }, (_, index) => ({ id: `crowd-${index}`, workspaceId: 'w', userId: 'alice', name: `crowd-${index}` })) });
    try {
      sent.length = 0;
      const inbox = await monitor.workspaceAgentInbox(alice, { state: 'unseen', limit: 50 });
      assert.deepEqual(Array.from(inbox.items, h => h.id), [handoff.id], 'the same work is listed as before');
      assert.equal(inbox.agents.length, 43);
      const at = sent.findLastIndex(sql => sql.includes('FROM "public"."AgentHandoff"') && sql.includes('"public"."Issue"'));
      // Once for the viewer and once for each of the two users who have agents here: not once per agent.
      assert.equal(sent[at].split('LEFT JOIN "public"."Issue"').length - 1, 3);
      // Compiling this statement with PostgreSQL's JIT took minutes in production; it runs with JIT off.
      assert.equal(sent[at - 1], 'SET LOCAL jit = off');
      // Forty more agents change nothing in what the monitor sends: the statements are the same text.
      await monitor.workspaceAgentInbox(alice, { state: 'claimed', limit: 50 });
      assert.deepEqual(handoffSql(), fewAgents);
      // The agent floor asks the same question for its board and had the same shape.
      sent.length = 0;
      const snapshot = await floor.readAgentFloor('alice', 'w');
      assert.deepEqual([snapshot.agents.length, Array.from(snapshot.tasks, task => task.id)], [43, [handoff.id]]);
      const board = sent.find(sql => sql.includes('FROM "public"."AgentHandoff"') && sql.includes('"public"."Issue"'));
      assert.equal(board.split('LEFT JOIN "public"."Issue"').length - 1, 3);
      // Its agents are in lists, so the board statement has as many conditions with 43 agents as with 3.
      const conditions = sql => sql.split(/ (?:AND|OR) /).length;
      assert.equal(conditions(board), conditions(fewOnBoard));
    } finally {
      await prisma.agentRegistration.deleteMany({ where: { id: { startsWith: 'crowd-' } } });
      await logged.$disconnect();
    }
  });
  let winner, loser, winnerName, loserName;
  await t.test('two actual concurrent PostgreSQL claims have exactly one winner', async () => {
    await assert.rejects(act(alice, handoff, 'lead', 'claim'), e => e.code === 'not_a_recipient');
    const results = await Promise.allSettled([act(alice, handoff, 'worker-a', 'claim'), act(bob, handoff, 'worker-b', 'claim')]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    const failure = results.find(r => r.status === 'rejected'); assert.equal(failure.reason.code, 'already_claimed');
    const monitor = await service.workspaceAgentInbox(alice, { state: 'claimed', limit: 50 });
    assert.deepEqual(Array.from(monitor.items, h => h.id), [handoff.id]);
    const aWon = results[0].status === 'fulfilled';
    [winner, loser, winnerName, loserName] = aWon ? [alice, bob, 'worker-a', 'worker-b'] : [bob, alice, 'worker-b', 'worker-a'];
    await assert.rejects(act(loser, handoff, loserName, 'complete', 'Wrong owner'), e => e.code === 'claim_required');
    await act(winner, handoff, winnerName, 'claim');
    assert.equal(await prisma.issueActivity.count({ where: { action: 'AGENT_CLAIM' } }), 1);
  });
  await t.test('seen and ACK are independent from ownership; scopes and revoked membership stay enforced', async () => {
    assert.equal(service.inboxSchema.safeParse({ agent: 'worker-b', state: 'all' }).success, false);
    assert.equal((await inbox(bob, 'worker-b')).items[0].id, handoff.id);
    await prisma.workspaceMember.updateMany({ where: { userId: 'bob' }, data: { status: false } });
    assert.equal((await inbox(bob, 'worker-b')).items.length, 0);
    assert.equal((await inbox(bob, 'worker-b', 'claimed')).items.length, 0);
    await assert.rejects(service.getHandoff(bob, 'worker-b', handoff.id), e => e.code === 'handoff_not_found');
    await prisma.workspaceMember.updateMany({ where: { userId: 'bob' }, data: { status: true } });
    await act(loser, handoff, loserName, 'seen');
    assert.equal((await inbox(loser, loserName)).items.length, 0);
    await Promise.all([act(winner, handoff, winnerName, 'ack'), act(winner, handoff, winnerName, 'ack')]);
    assert.equal(await prisma.issueActivity.count({ where: { action: 'AGENT_ACKNOWLEDGED' } }), 1);
    assert.equal((await inbox(winner, winnerName)).items.length, 0);
    assert.equal((await inbox(winner, winnerName, 'claimed')).items[0].id, handoff.id);
    await assert.rejects(act(context(winner.user.id, 'w', ['issues:read']), handoff, winnerName, 'progress', 'No write scope'), e => e.code === 'insufficient_scope');
  });
  await t.test('release reopens delivery and handoff chains retain ordered named-agent history', async () => {
    await act(winner, handoff, winnerName, 'progress', 'Implementation done; tests next');
    await act(winner, handoff, winnerName, 'release', 'Let another agent finish');
    assert.equal((await inbox(loser, loserName)).items[0].status, 'open');
    await act(loser, handoff, loserName, 'claim');
    const next = await service.sendHandoff(loser, service.sendSchema.parse({ agent: loserName, issue: 'w-1', content: 'Review the test results and finish.', toAgents: [winnerName], afterId: handoff.id }));
    assert.equal((await prisma.agentHandoff.findUnique({ where: { id: handoff.id } })).status, 'completed');
    assert.equal(next.afterId, handoff.id);
    await act(winner, next, winnerName, 'claim');
    await act(winner, next, winnerName, 'complete', 'Tests passed; ready for review');
    const timeline = await prisma.issueActivity.findMany({ where: { itemId: 'i-w' }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
    assert.deepEqual(timeline.map(x => x.action), ['AGENT_SENT', 'AGENT_CLAIM', 'AGENT_ACKNOWLEDGED', 'AGENT_PROGRESS', 'AGENT_RELEASE', 'AGENT_CLAIM', 'AGENT_PASSED', 'AGENT_SENT', 'AGENT_CLAIM', 'AGENT_COMPLETE']);
    assert.equal(JSON.parse(timeline.at(-1).details).agent.name, winnerName);
    const result = await service.getHandoff(winner, winnerName, next.id);
    assert.equal(result.context.issue.projectId, 'p-w');
    assert.deepEqual(Array.from(result.context.commands), [
      'collab issues get i-w --workspace w',
      'collab comments list i-w --workspace w',
      'collab issues activity i-w --workspace w',
      'collab context get --project p-w --workspace w',
    ]);
  });
  await t.test('one current host/session identity and honest watcher health survive restart without takeover', async () => {
    const binding = { name: 'bound-worker', host: 'test-host', sessionId: 'session-1' };
    const bind = values => service.registerAgent(alice, service.registrationSchema.parse(values));
    await bind(binding);
    assert.equal(service.registrationSchema.safeParse({ name: 'partial', host: 'test-host' }).success, false);
    await assert.rejects(bind({ ...binding, name: 'duplicate-alias' }), e => e.code === 'agent_identity_conflict');
    const unchanged = await bind({ name: binding.name });
    assert.equal(unchanged.sessionId, binding.sessionId);
    assert.equal(unchanged.watcher, null);
    const listed = await service.listAgents(alice);
    const legacy = listed.find(a => a.name === 'lead');
    assert.deepEqual(JSON.parse(JSON.stringify(legacy)), { id: legacy.id, name: 'lead', labelIds: [], worker: null });
    assert.deepEqual(JSON.parse(JSON.stringify(listed.find(a => a.name === binding.name))), {
      id: unchanged.id, name: binding.name, labelIds: [], worker: null, host: binding.host, sessionId: binding.sessionId, watcher: null,
    });
    const watcherId = randomUUID();
    const heartbeat = (event, extra = {}, ctx = alice) => service.reportWatcher(ctx, service.heartbeatSchema.parse({
      agent: binding.name, host: binding.host, sessionId: binding.sessionId, watcherId, event, ...extra,
    }));
    await assert.rejects(heartbeat('started', {}, bob), e => e.code === 'agent_not_found');
    await assert.rejects(heartbeat('started', { sessionId: 'wrong-session' }), e => e.code === 'agent_session_mismatch');
    await heartbeat('started');
    await assert.rejects(heartbeat('started', { watcherId: randomUUID() }), e => e.code === 'watcher_active');
    await assert.rejects(bind({ ...binding, sessionId: 'session-2' }), e => e.code === 'watcher_active');
    await heartbeat('poll');
    const woke = await heartbeat('wake');
    assert.ok(woke.watcher.lastPollAt); assert.ok(woke.watcher.lastWakeAt);
    await heartbeat('error', { errorCode: 'wake_callback_failed' });
    let row = (await service.listAgents(alice)).find(a => a.name === binding.name);
    assert.equal(row.watcher.state, 'error'); assert.equal(row.watcher.lastWakeAt, woke.watcher.lastWakeAt);
    assert.equal(row.watcher.errorCode, 'wake_callback_failed');
    const next = randomUUID();
    await heartbeat('started', { watcherId: next });
    await assert.rejects(heartbeat('poll'), e => e.code === 'watcher_changed');
    row = await prisma.agentRegistration.findUniqueOrThrow({ where: { workspaceId_name: { workspaceId: 'w', name: binding.name } } });
    await prisma.agentRegistration.update({ where: { id: row.id }, data: { watcher: { ...row.watcher, heartbeatAt: '2000-01-01T00:00:00.000Z' } } });
    assert.equal((await service.listAgents(alice)).find(a => a.name === binding.name).watcher.state, 'stale');
    await heartbeat('started');
    await assert.rejects(heartbeat('stopped', { watcherId: next }), e => e.code === 'watcher_changed');
    await heartbeat('stopped');
    assert.equal((await service.workspaceAgentInbox(alice, { state: 'unseen', limit: 50 })).agents.find(a => a.name === binding.name).watcher.state, 'stopped');
    const rebound = await bind({ ...binding, sessionId: 'session-2' });
    assert.equal(rebound.watcher, null);
    await assert.rejects(heartbeat('started'), e => e.code === 'agent_session_mismatch');
    assert.equal((await service.listAgents(outsider)).some(a => a.name === binding.name), false);
    const concurrent = await Promise.allSettled(['concurrent-a', 'concurrent-b'].map(name => bind({ name, host: 'test-host', sessionId: 'same-session' })));
    assert.equal(concurrent.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(concurrent.find(r => r.status === 'rejected').reason.code, 'agent_identity_conflict');
  });
  await t.test('superseding closes obsolete work, links evidence and never overrides another claimant', async () => {
    const old = await send({ toAgents: ['worker-a'], toLabels: [] });
    const replacement = await send({ toAgents: ['worker-b'], toLabels: [], content: 'Current request' });
    const supersede = (ctx, agent, target = old, next = replacement) => service.actOnHandoff(ctx, target.id,
      service.actionSchema.parse({ agent, action: 'supersede', replacementId: next.id, content: 'Request rerouted to the current reviewer' }));
    await assert.rejects(supersede(alice, 'lead', old, old), e => e.code === 'invalid_replacement');
    await assert.rejects(supersede(alice, 'worker-a'), e => e.code === 'handoff_not_found');
    await act(alice, old, 'worker-a', 'claim');
    await assert.rejects(supersede(alice, 'lead'), e => e.code === 'supersede_conflict');
    await act(alice, old, 'worker-a', 'release', 'Sender may now reroute');
    const done = await supersede(alice, 'lead');
    assert.equal(done.status, 'superseded'); assert.equal(done.supersededById, replacement.id);
    assert.equal((await supersede(alice, 'lead')).id, old.id, 'retry is idempotent');
    assert.equal((await inbox(alice, 'worker-a')).items.some(h => h.id === old.id), false);
    await assert.rejects(act(alice, old, 'worker-a', 'claim'), e => e.code === 'already_claimed');
    assert.equal((await service.getHandoff(alice, 'lead', old.id)).handoff.supersededById, replacement.id);
    const history = await prisma.issueActivity.findMany({ where: { action: 'AGENT_SUPERSEDED' } });
    assert.equal(history.length, 1); assert.equal(JSON.parse(history[0].details).replacementId, replacement.id);
    const claimed = await send({ toAgents: ['worker-a'], toLabels: [] });
    const theirNext = await send({ toAgents: ['worker-a'], toLabels: [] });
    await act(alice, claimed, 'worker-a', 'claim');
    assert.equal((await supersede(alice, 'worker-a', claimed, theirNext)).status, 'superseded');
    await act(alice, theirNext, 'worker-a', 'claim');
    await act(alice, theirNext, 'worker-a', 'complete', 'Review already answered');
    const obsolete = await send({ toAgents: ['worker-a'], toLabels: [] });
    assert.equal((await supersede(alice, 'lead', obsolete, theirNext)).supersededById, theirNext.id, 'answered work can be linked without repeating it');
    const a = await send({ toAgents: ['worker-a'], toLabels: [] });
    const b = await send({ toAgents: ['worker-a'], toLabels: [] });
    const race = await Promise.allSettled([supersede(alice, 'lead', a, b), supersede(alice, 'lead', b, a)]);
    assert.equal(race.filter(r => r.status === 'fulfilled').length, 1, 'concurrent replacements cannot form a cycle');
    await assert.rejects(supersede(context('alice', 'w', ['issues:read']), 'lead', a, b), e => e.code === 'insufficient_scope');
    await assert.rejects(supersede(outsider, 'outsider', a, b), e => e.code === 'handoff_not_found');
  });
  await t.test('label triggers are atomic, deduplicated on retry, scoped and claimable', async () => {
    const { enqueueLabelHandoff, InvalidIssueLabels } = load('src/lib/agent-label-triggers.ts', { 'node:crypto': require('node:crypto') });
    await prisma.issue.create({ data: { id: 'label-issue', workspaceId: 'w', projectId: 'p-w', title: 'Label trigger', issueKey: 'w-2' } });
    const change = (labels, fail = false) => prisma.$transaction(async tx => {
      const before = await tx.issue.findUniqueOrThrow({ where: { id: 'label-issue' }, include: { labels: true } });
      const issue = await tx.issue.update({ where: { id: before.id }, data: { labels: { set: labels.map(id => ({ id })) } }, include: { labels: true } });
      const event = await enqueueLabelHandoff(tx, 'alice', issue, before.labels.map(label => label.id));
      if (fail) throw new Error('abort issue edit');
      return event;
    }, { isolationLevel: 'Serializable' });
    await assert.rejects(change(['label-w'], true), /abort issue edit/);
    assert.equal(await prisma.agentHandoff.count({ where: { issueId: 'label-issue' } }), 0);
    assert.equal((await prisma.issue.findUnique({ where: { id: 'label-issue' }, include: { labels: true } })).labels.length, 0);
    await assert.rejects(change(['label-foreign']), e => e instanceof InvalidIssueLabels);
    const concurrent = await Promise.allSettled([change(['label-w']), change(['label-w'])]);
    assert.ok(concurrent.some(r => r.status === 'fulfilled'));
    for (const r of concurrent.filter(r => r.status === 'rejected')) assert.equal(r.reason.code, 'P2034');
    await change(['label-w']); // retry after a conflict or an identical save
    const events = await prisma.agentHandoff.findMany({ where: { issueId: 'label-issue' } });
    assert.equal(events.length, 1);
    const event = events[0];
    assert.equal(event.kind, 'label_added'); assert.equal(event.claimedOnce, false);
    assert.equal((await inbox(alice, 'worker-a')).items.some(h => h.id === event.id), true);
    assert.equal((await inbox(bob, 'worker-b')).items.some(h => h.id === event.id), true);
    assert.equal((await inbox(outsider, 'outsider')).items.some(h => h.id === event.id), false);
    const claims = await Promise.allSettled([act(alice, event, 'worker-a', 'claim'), act(bob, event, 'worker-b', 'claim')]);
    assert.equal(claims.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(claims.find(r => r.status === 'rejected').reason.code, 'already_claimed');
    await change([]);
    assert.equal((await prisma.agentHandoff.findUnique({ where: { id: event.id } })).status, 'claimed');
    await change(['label-w']);
    assert.equal(await prisma.agentHandoff.count({ where: { issueId: 'label-issue' } }), 2);
    assert.equal(await prisma.issueActivity.count({ where: { itemId: 'label-issue', action: 'AGENT_LABEL_ADDED' } }), 2);
    await prisma.taskLabel.create({ data: { id: 'unsubscribed', workspaceId: 'w', name: 'ordinary', color: '#123456' } });
    await change(['label-w', 'unsubscribed']);
    assert.equal(await prisma.agentHandoff.count({ where: { issueId: 'label-issue' } }), 2);
    // Creating an issue with a subscribed label uses the same transaction helper.
    await prisma.$transaction(async tx => {
      const issue = await tx.issue.create({ data: { id: 'label-created', workspaceId: 'w', projectId: 'p-w', title: 'New issue', labels: { connect: { id: 'label-w' } } }, include: { labels: true } });
      await enqueueLabelHandoff(tx, 'alice', issue, []);
    });
    assert.equal(await prisma.agentHandoff.count({ where: { issueId: 'label-created' } }), 1);
  });

  await t.test('web mutation and CLI HTTP route commit label handoffs and reject foreign labels', async () => {
    const triggers = load('src/lib/agent-label-triggers.ts', { 'node:crypto': require('node:crypto') });
    const deps = { zod: require('zod'), '@prisma/client': require('@prisma/client'), '@/lib/prisma': { prisma },
      '@/lib/agent-label-triggers': triggers, '@/lib/issue-finder': finder,
      '@/lib/permissions': { Permission: {}, canActOnOwnContent: () => true,
        checkUserPermissions: async () => ({ undefined: { hasPermission: true } }) },
      '@/utils/html-normalizer': { normalizeDescriptionHTML: value => value },
      '@/lib/forge/legacy-write-guard': { assertLegacyProjectWriteAllowed: async () => {}, assertLegacyIssueWriteAllowed: async () => {}, ForgeProjectWriteError: class extends Error {} },
      '@/lib/apps/auth-middleware': { withAppAuth: fn => fn },
      '@/lib/event-bus': { emitIssueUpdated: async () => {} }, 'next/server': { NextResponse: Response },
    };
    const { updateIssue } = load('src/lib/issue-mutation.ts', deps);
    const { PATCH } = load('src/app/api/apps/auth/issues/[issueIdOrKey]/route.ts', deps, { console });
    await prisma.issue.create({ data: { id: 'route-labels', workspaceId: 'w', projectId: 'p-w', title: 'Routes', issueKey: 'w-3' } });
    const result = await updateIssue('alice', 'route-labels', { labels: ['label-w'] }, 'w');
    assert.equal(result.error, undefined);
    assert.equal(await prisma.agentHandoff.count({ where: { issueId: 'route-labels' } }), 1);
    const patch = labels => PATCH(new Request('https://example.test', { method: 'PATCH', body: JSON.stringify({ labels }) }), alice, { params: Promise.resolve({ issueIdOrKey: 'route-labels' }) });
    assert.equal((await patch(['label-w'])).status, 200);
    assert.equal(await prisma.agentHandoff.count({ where: { issueId: 'route-labels' } }), 1);
    assert.equal((await patch(['label-foreign'])).status, 400);
    assert.deepEqual((await prisma.issue.findUnique({ where: { id: 'route-labels' }, include: { labels: true } })).labels.map(l => l.id), ['label-w']);
    assert.equal((await patch([])).status, 200);
    assert.equal((await patch(['label-w'])).status, 200);
    assert.equal(await prisma.agentHandoff.count({ where: { issueId: 'route-labels' } }), 2);
    assert.equal((await updateIssue('outsider', 'route-labels', { labels: [] }, 'w')).status, 404);
    // A parent must be an issue of this workspace, as it must be on create: an ID from another
    // workspace would otherwise show that issue's key and title on this one.
    await prisma.issue.createMany({ data: [
      { id: 'cparentlocal0001', workspaceId: 'w', projectId: 'p-w', title: 'Local parent', issueKey: 'w-parent' },
      { id: 'cparentforeign01', workspaceId: 'foreign', projectId: 'p-foreign', title: 'Foreign parent', issueKey: 'foreign-parent' },
    ] });
    const reparent = parentId => PATCH(new Request('https://example.test', { method: 'PATCH', body: JSON.stringify({ parentId }) }), alice, { params: Promise.resolve({ issueIdOrKey: 'route-labels' }) });
    const parentOf = async () => (await prisma.issue.findUnique({ where: { id: 'route-labels' } })).parentId;
    const refused = await reparent('cparentforeign01');
    assert.equal(refused.status, 404);
    assert.equal((await refused.json()).error, 'parent_issue_not_found');
    assert.equal(await parentOf(), null);
    assert.equal((await reparent('cparentlocal0001')).status, 200);
    assert.equal(await parentOf(), 'cparentlocal0001');
    assert.equal((await reparent(null)).status, 200);
    assert.equal(await parentOf(), null);
    // The web app's own create route holds a parent to the same rule.
    const guardedParents = [];
    const { POST: createInBrowser } = load('src/app/api/issues/route.ts', { ...deps,
      '@/lib/forge/legacy-write-guard': { ...deps['@/lib/forge/legacy-write-guard'], assertLegacyIssueWriteAllowed: async id => guardedParents.push(id) },
      '@/lib/request-session': { getServerSession: async () => ({ user: { id: 'alice' } }) }, '@/lib/auth-options': {},
      '@/lib/board-item-activity-service': { trackCreation: async () => {} }, '@/lib/redis': { publishEvent: async () => {} },
      '@/utils/mentions': { extractMentionUserIds: () => [] }, '@/lib/notification-service': { NotificationService: {}, NotificationType: {} },
      '@/lib/event-bus': { emitIssueCreated: async () => {} }, '@/utils/issueRelations': {} }, { console, URL, Date });
    const createChild = (title, parentId) => createInBrowser(new Request('https://example.test', { method: 'POST', body: JSON.stringify({ title, workspaceId: 'w', projectId: 'p-w', parentId }) }));
    const foreignChild = await createChild('Foreign child', 'cparentforeign01');
    assert.equal(foreignChild.status, 400, await foreignChild.clone().text());
    assert.deepEqual(await foreignChild.json(), { error: 'Invalid parent issue' });
    assert.equal(await prisma.issue.count({ where: { title: 'Foreign child' } }), 0);
    for (const [title, parentId] of [['Missing child', 'missing-parent'], ['Operator child', { not: 'cparentforeign01' }]]) {
      const response = await createChild(title, parentId);
      assert.equal(response.status, 400, await response.clone().text());
      assert.deepEqual(await response.json(), { error: 'Invalid parent issue' });
      assert.equal(await prisma.issue.count({ where: { title } }), 0);
    }
    assert.deepEqual(guardedParents, []);
    const localChild = await createChild('Local child', 'cparentlocal0001');
    assert.equal(localChild.status, 201, await localChild.clone().text());
    assert.equal((await prisma.issue.findFirst({ where: { title: 'Local child' } })).parentId, 'cparentlocal0001');
    await prisma.project.create({ data: { id: 'p-other', workspaceId: 'w', name: 'Other', slug: 'other', issuePrefix: 'other' } });
    await prisma.issue.create({ data: { id: 'other-parent', workspaceId: 'w', projectId: 'p-other', title: 'Other project parent', issueKey: 'other-1' } });
    const otherChild = await createChild('Other project child', 'other-parent');
    assert.equal(otherChild.status, 201, await otherChild.clone().text());
    const stored = await prisma.issue.findFirstOrThrow({ where: { title: 'Other project child' } });
    assert.equal(stored.parentId, 'other-parent');
    assert.equal(await prisma.issueRelation.count({ where: { sourceIssueId: stored.id, targetIssueId: 'other-parent', relationType: 'PARENT' } }), 1);
  });

  await t.test('project coordinator migration, single owner lease and tenant-filtered snapshots', async () => {
    await prisma.$executeRawUnsafe('ALTER TABLE "Project" DROP COLUMN "coordinator"');
    await prisma.$executeRawUnsafe(readFileSync(resolve('prisma/migrations/20261029000100_project_coordinator/migration.sql'), 'utf8'));
    assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: 'p-w' } })).coordinator, null);
    const coordinator = load('src/lib/project-coordinator.ts', { zod: require('zod'), '@/lib/prisma': { prisma: publicPrisma },
      '@/lib/issue-finder': finder, '@/lib/agent-handoffs': service }, { Date });
    const sessionId = randomUUID();
    await service.registerAgent(alice, service.registrationSchema.parse({ name: 'coordinator', host: 'host', sessionId }));
    const generation = expires => { const random = randomUUID().replaceAll('-', ''), stamp = Date.parse(expires).toString(16).padStart(12, '0'); return `${stamp.slice(0, 8)}-${stamp.slice(8)}-7${random.slice(13, 16)}-${random.slice(16, 20)}-${random.slice(20)}`; };
    const attemptExpires = new Date(Date.now() + 30000).toISOString();
    const binding = { project: 'p-w', agent: 'coordinator', host: 'host', sessionId, generation: generation(attemptExpires), attemptExpires, event: 'acquire' };
    const lease = body => coordinator.coordinatorLease(alice, coordinator.coordinatorSchema.parse({ ...binding, ...body }));
    const absentExpiry = new Date(Date.now() + 100).toISOString();
    const absent = { ...binding, generation: generation(absentExpiry), attemptExpires: absentExpiry };
    await assert.rejects(lease({ ...absent, event: 'reconcile' }), e => e.code === 'coordinator_pending');
    await new Promise(resolve => setTimeout(resolve, 150));
    assert.equal((await lease({ ...absent, event: 'reconcile' })).reconciled, true);
    await assert.rejects(lease(absent), e => e.code === 'coordinator_fenced');
    const matchedExpiry = new Date(Date.now() + 150).toISOString();
    const matched = { ...binding, generation: generation(matchedExpiry), attemptExpires: matchedExpiry };
    await lease(matched);
    await assert.rejects(lease({ ...matched, attemptExpires: absentExpiry, event: 'reconcile' }), e => e.code === 'coordinator_fenced');
    await assert.rejects(lease({ ...matched, event: 'reconcile' }), e => e.code === 'coordinator_pending');
    await new Promise(resolve => setTimeout(resolve, 200));
    assert.equal((await lease({ ...matched, event: 'reconcile' })).reconciled, true);
    await assert.rejects(lease(matched), e => e.code === 'coordinator_fenced');
    const races = await Promise.allSettled([lease({}), lease({ generation: generation(attemptExpires) })]);
    assert.equal(races.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(races.find(r => r.status === 'rejected').reason.code, 'coordinator_conflict');
    binding.generation = races.find(r => r.status === 'fulfilled').value.lease.generation;
    const laterExpiry = new Date(Date.now() + 100).toISOString();
    const later = { ...binding, generation: generation(laterExpiry), attemptExpires: laterExpiry };
    await assert.rejects(lease({ ...later, event: 'reconcile' }), e => e.code === 'coordinator_pending');
    await new Promise(resolve => setTimeout(resolve, 150));
    assert.equal((await lease({ ...later, event: 'reconcile' })).reconciled, true);
    assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: 'p-w' } })).coordinator.generation, binding.generation);
    await assert.rejects(lease(later), e => e.code === 'coordinator_fenced');
    assert.equal((await lease({ event: 'renew' })).lease.generation, binding.generation);
    await assert.rejects(coordinator.coordinatorLease(bob, binding), e => e.status === 403);
    await assert.rejects(lease({ project: 'p-foreign' }), e => e.status === 404);
    await assert.rejects(lease({ host: 'other-host' }), e => e.status === 403);
    await prisma.project.update({ where: { id: 'p-w' }, data: { coordinator: { ...(await lease({ event: 'renew' })).lease, leaseUntil: new Date(0).toISOString() } } });
    await assert.rejects(lease({ event: 'renew' }), e => e.code === 'coordinator_fenced');
    binding.generation = generation(attemptExpires);
    await lease({});
    await prisma.project.update({ where: { id: 'p-w' }, data: { isArchived: true } });
    await assert.rejects(lease({ event: 'renew' }), e => e.code === 'project_not_found');
    await assert.rejects(lease({ generation: generation(attemptExpires) }), e => e.code === 'project_not_found');
    await assert.rejects(lease({ event: 'close', generation: randomUUID() }), e => e.code === 'coordinator_conflict');
    await assert.rejects(coordinator.coordinatorLease(bob, { ...binding, event: 'close' }), e => e.status === 403);
    await lease({ event: 'close' });
    await prisma.project.update({ where: { id: 'p-w' }, data: { isArchived: false } });
    await assert.rejects(lease({}), e => e.code === 'coordinator_fenced');
    const own = await send({ toAgents: ['worker-a'], toLabels: [] });
    await prisma.agentRegistration.createMany({ data: Array.from({ length: 501 }, (_, i) => ({ workspaceId: 'w', userId: 'alice', name: `unrelated-${i}` })) });
    const snapshot = await coordinator.coordinatorSnapshot(alice, 'p-w', undefined, ['worker-a', 'worker-b']);
    assert.equal(snapshot.agentsTruncated, false); assert.equal(snapshot.agents.length, 2);
    const bulk = Array.from({ length: 5001 }, (_, i) => ({ id: `bulk-${String(i).padStart(5, '0')}`, sourceKey: `bulk-${i}`, workspaceId: 'w', issueId: 'i-w', content: 'boundary', recipientNames: ['worker-a'] }));
    await prisma.agentHandoff.createMany({ data: bulk });
    const beyond = await coordinator.coordinatorSnapshot(alice, 'p-w', 'bulk-04999', ['worker-a']);
    assert.equal(beyond.items[0].id, 'bulk-05000'); assert.equal(beyond.agentsTruncated, false);
    await prisma.agentHandoff.deleteMany({ where: { id: { in: bulk.map(item => item.id) } } });
    assert.ok(snapshot.items.some(item => item.id === own.id));
    assert.ok(snapshot.items.every(item => item.issue.projectId === 'p-w'));
    assert.equal(snapshot.agents.find(a => a.name === 'worker-b').owned, false);
    await assert.rejects(coordinator.coordinatorSnapshot(outsider, 'p-w'), e => e.status === 404);
    await prisma.agentHandoff.delete({ where: { id: own.id } });

    binding.generation = generation(attemptExpires);
    await lease({});
    const workerSession = randomUUID(), workerGeneration = randomUUID();
    const workerBody = { agent: 'coordinated', host: 'host', sessionId: workerSession };
    const manage = body => service.manageWorker(alice, service.workerSchema.parse({ ...workerBody, ...body }));
    await manage({ event: 'configure' });
    const admission = { project: 'p-w', generation: binding.generation };
    await manage({ event: 'start', generation: workerGeneration, coordinator: admission });
    const http = load('src/lib/agent-handoff-http.ts', { './agent-handoffs': service, zod: require('zod'), 'next/server': { NextResponse: Response } }, { Buffer });
    const route = load('src/app/api/apps/auth/agents/coordinator/route.ts', {
      '@/lib/apps/auth-middleware': { withAppAuth: (fn, options) => { assert.ok(options.requiredScopes.includes('projects:read')); return fn; } },
      '@/lib/agent-handoff-http': http, '@/lib/project-coordinator': coordinator,
    });
    for (const reader of [alice, bob]) {
      const response = await route.GET({ nextUrl: new URL('https://example.test/api/apps/auth/agents/coordinator?project=p-w') }, reader);
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.deepEqual(Object.keys(body).sort(), ['agents', 'agentsTruncated', 'items', 'nextCursor', 'observedAt', 'project']);
      assert.equal(body.project, 'p-w'); assert.equal(Object.hasOwn(body, 'lease'), false);
    }
    const currentWorker = await prisma.agentRegistration.findUniqueOrThrow({ where: { workspaceId_name: { workspaceId: 'w', name: 'coordinated' } } });
    await prisma.agentRegistration.update({ where: { id: currentWorker.id }, data: { managedWorker: { ...currentWorker.managedWorker, taskId: 'private-other-project-task' } } });
    const visibleWorker = (await coordinator.coordinatorSnapshot(alice, 'p-w', undefined, ['coordinated'])).agents.find(a => a.name === 'coordinated').managedWorker;
    assert.equal(visibleWorker.taskId, undefined); assert.equal(visibleWorker.coordinator, undefined);
    const released = await send({ toAgents: ['worker-a', 'coordinated'], toLabels: [] });
    await act(alice, released, 'worker-a', 'claim');
    const handoffRoute = load('src/app/api/apps/auth/agents/handoffs/[id]/route.ts', {
      '@/lib/apps/auth-middleware': { withAppAuth: fn => fn }, '@/lib/agent-handoffs': service, '@/lib/agent-handoff-http': http,
    }, { URL });
    const handoffResponse = await handoffRoute.GET(new Request('https://example.test/api/apps/auth/agents/handoffs/' + released.id + '?agent=worker-a'), alice, { params: Promise.resolve({ id: released.id }) });
    assert.equal(handoffResponse.status, 200);
    const handoffBody = (await handoffResponse.json()).handoff;
    assert.equal(handoffBody.claimedById, (await prisma.agentRegistration.findUniqueOrThrow({ where: { workspaceId_name: { workspaceId: 'w', name: 'worker-a' } } })).id);
    assert.equal(Object.hasOwn(handoffBody, 'claimedBy'), false);
    const claim = handoff => service.actOnHandoff(alice, handoff.id, service.actionSchema.parse({ agent: 'coordinated', action: 'claim', generation: workerGeneration, coordinator: admission }));
    await assert.rejects(claim(released), e => e.code === 'already_claimed');
    await act(alice, released, 'worker-a', 'release', 'Hand back');
    const afterRelease = await coordinator.coordinatorSnapshot(alice, 'p-w');
    assert.equal(afterRelease.items.find(item => item.id === released.id).previouslyClaimed, true);
    await assert.rejects(claim(released), e => e.code === 'coordinator_fenced');

    // The proof that work was claimed outlives the user who claimed it: the timeline entry goes with its author.
    await prisma.user.create({ data: { id: 'leaver', name: 'leaver' } });
    await prisma.workspaceMember.create({ data: { workspaceId: 'w', userId: 'leaver' } });
    const leaver = context('leaver');
    await register(leaver, 'leaving-worker');
    const orphaned = await send({ toAgents: ['leaving-worker', 'coordinated'], toLabels: [] });
    await act(leaver, orphaned, 'leaving-worker', 'claim');
    await act(leaver, orphaned, 'leaving-worker', 'release', 'Hand back');
    await prisma.user.delete({ where: { id: 'leaver' } });
    assert.equal(await prisma.issueActivity.count({ where: { userId: 'leaver' } }), 0, 'the claim entry is gone with its author');
    assert.equal((await prisma.agentHandoff.findUniqueOrThrow({ where: { id: orphaned.id } })).status, 'open');
    assert.equal((await coordinator.coordinatorSnapshot(alice, 'p-w')).items.find(item => item.id === orphaned.id).previouslyClaimed, true);
    await assert.rejects(claim(orphaned), e => e.code === 'coordinator_fenced');
    const marker = async handoff => (await prisma.agentHandoff.findUniqueOrThrow({ where: { id: handoff.id } })).claimedOnce;
    assert.equal(await marker(released), true, 'a release does not take the marker back');

    // A handoff written without the marker (older than it, or by a version that does not know it) is unknown, not unclaimed.
    const unknown = await prisma.agentHandoff.create({ data: { workspaceId: 'w', issueId: 'i-w', sourceKey: 'unknown-history', content: 'old', recipientNames: ['coordinated', 'worker-a'] } });
    assert.equal(unknown.claimedOnce, null);
    assert.equal((await coordinator.coordinatorSnapshot(alice, 'p-w')).items.find(item => item.id === unknown.id).previouslyClaimed, true);
    await assert.rejects(claim(unknown), e => e.code === 'coordinator_fenced');
    await act(alice, unknown, 'worker-a', 'claim');
    assert.equal(await marker(unknown), true, 'an agent that is not coordinated can still take it, and that is recorded');
    await act(alice, unknown, 'worker-a', 'complete', 'Done by hand');

    const fresh = await send({ toAgents: ['coordinated'], toLabels: [] });
    assert.equal(await marker(fresh), false, 'a new handoff is known to be unclaimed');
    const claimedFresh = await claim(fresh);
    assert.equal(Object.hasOwn(claimedFresh, 'claimedOnce'), false);
    assert.equal(Object.hasOwn(await claim(fresh), 'claimedOnce'), false);
    assert.equal(await marker(fresh), true);
    const current = await prisma.project.findUniqueOrThrow({ where: { id: 'p-w' } });
    await prisma.project.update({ where: { id: 'p-w' }, data: { coordinator: { ...current.coordinator, leaseUntil: new Date(0).toISOString() } } });
    await assert.rejects(lease({ generation: generation(attemptExpires) }), e => e.code === 'coordinator_conflict');
    await assert.rejects(claim(fresh), e => e.code === 'coordinator_fenced');
    await manage({ event: 'close', generation: workerGeneration, coordinator: admission });
    await lease({ generation: generation(attemptExpires) });
    assert.equal((await coordinator.coordinatorSnapshot(alice, 'p-w')).items.find(item => item.id === released.id).previouslyClaimed, true, 'a new coordinator generation reads the same history');

    const direct = await publicPrisma.project.findUniqueOrThrow({ where: { id: 'p-w' } });
    const nested = await publicPrisma.issue.findUniqueOrThrow({ where: { id: 'i-w' }, include: { project: true } });
    assert.equal(Object.hasOwn(direct, 'coordinator'), false); assert.equal(Object.hasOwn(nested.project, 'coordinator'), false);
    const privateLease = await publicPrisma.project.findUniqueOrThrow({ where: { id: 'p-w' }, select: { coordinator: true } });
    assert.equal(privateLease.coordinator.sessionId, sessionId);

    let actor = null;
    const session = load('src/lib/session.ts', { '@/lib/request-session': { getServerSession: async () => actor ? { user: actor } : null },
      '@/lib/auth-options': { authOptions: {} }, '@/lib/prisma': { prisma: publicPrisma } }, { console: { error() {} } });
    const archive = load('src/app/api/projects/[projectId]/archive/route.ts', {
      'next/server': { NextResponse: Response }, '@/lib/prisma': { prisma: publicPrisma },
      '@/lib/session': session, '@/lib/post-access': load('src/lib/post-access.ts'),
    }, { console: { error() {} } });
    const archiveRequest = body => archive.PATCH(new Request('https://example.test', { method: 'PATCH', body }), { params: Promise.resolve({ projectId: 'p-w' }) });
    const beforeArchive = (await prisma.project.findUniqueOrThrow({ where: { id: 'p-w' } })).isArchived;
    assert.equal((await archiveRequest('{')).status, 401);
    actor = { id: 'outsider' };
    assert.equal((await archiveRequest(JSON.stringify({ isArchived: true }))).status, 404);
    assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: 'p-w' } })).isArchived, beforeArchive);
    actor = { id: 'alice' };
    for (const value of [null, 'true', 1, [], {}]) assert.equal((await archiveRequest(JSON.stringify({ isArchived: value }))).status, 400);
    assert.equal((await archiveRequest('{')).status, 400);
    assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: 'p-w' } })).isArchived, beforeArchive);
    const archived = await archiveRequest(JSON.stringify({ isArchived: true }));
    assert.equal(archived.status, 200); assert.equal((await archived.json()).project.coordinator, undefined);
    assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: 'p-w' } })).isArchived, true);
    actor = { id: 'bob' };
    assert.equal((await archiveRequest(JSON.stringify({ isArchived: false }))).status, 200);
    await prisma.workspaceMember.updateMany({ where: { workspaceId: 'w', userId: 'bob' }, data: { status: false } });
    assert.equal((await archiveRequest(JSON.stringify({ isArchived: true }))).status, 404);
    assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: 'p-w' } })).isArchived, false);
    await prisma.workspaceMember.updateMany({ where: { workspaceId: 'w', userId: 'bob' }, data: { status: true } });

    const appProjects = load('src/app/api/apps/auth/projects/[projectId]/route.ts', {
      'next/server': { NextResponse: Response }, '@/lib/prisma': { prisma: publicPrisma }, zod: require('zod'),
      '@/lib/apps/auth-middleware': { withAppAuth: (fn, options) => { assert.ok(options.requiredScopes.includes('projects:read') || options.requiredScopes.includes('projects:write')); return fn; } },
    }, { console: { error() {} } });
    const appResponse = await appProjects.PATCH(new Request('https://example.test', { method: 'PATCH', body: JSON.stringify({ name: 'Updated project' }) }), alice, { params: Promise.resolve({ projectId: 'p-w' }) });
    assert.equal(appResponse.status, 200); const appProject = await appResponse.json();
    assert.equal(appProject.name, 'Updated project'); assert.equal(Object.hasOwn(appProject, 'coordinator'), false);
    const foreignAppResponse = await appProjects.PATCH(new Request('https://example.test', { method: 'PATCH', body: JSON.stringify({ name: 'Foreign change' }) }), outsider, { params: Promise.resolve({ projectId: 'p-w' }) });
    assert.equal(foreignAppResponse.status, 404);
    assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: 'p-w' } })).name, 'Updated project');
  });


});
