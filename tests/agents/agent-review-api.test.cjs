const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFileSync, mkdtempSync, rmSync } = require('node:fs');
const { tmpdir, userInfo } = require('node:os');
const { join, resolve } = require('node:path');
const { execFileSync } = require('node:child_process');
const { createServer } = require('node:http');
const { once } = require('node:events');
const { PrismaClient } = require('@prisma/client');
const { load } = require('../security/helpers.cjs');

test('identity-bound review guards custody, authorizes participants and records no private activity', { timeout: 120000 }, async t => {
  const directory = mkdtempSync(join(tmpdir(), 'collab-review-api-'));
  const bindir = execFileSync('pg_config', ['--bindir'], { encoding: 'utf8' }).trim();
  let started = false, prisma, server;
  t.after(async () => {
    if (server) await new Promise(close => server.close(close));
    await prisma?.$disconnect();
    if (started) execFileSync(join(bindir, 'pg_ctl'), ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'], { stdio: 'pipe' });
    rmSync(directory, { recursive: true, force: true });
  });
  execFileSync(join(bindir, 'initdb'), ['-D', join(directory, 'data'), '-A', 'trust', '--no-locale', '-E', 'UTF8'], { stdio: 'pipe' });
  execFileSync(join(bindir, 'pg_ctl'), ['-D', join(directory, 'data'), '-l', join(directory, 'server.log'), '-o', `-k ${directory} -c listen_addresses='' -c fsync=off`, '-w', 'start'], { stdio: 'pipe' });
  started = true;
  const url = `postgresql://${encodeURIComponent(userInfo().username)}@localhost/postgres?host=${encodeURIComponent(directory)}`;
  execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'db', 'push', '--skip-generate', '--schema', resolve('prisma/schema.prisma')], { env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' });
  // db push omits PostgreSQL trigger functions and partial indexes.
  const migration = readFileSync(resolve('prisma/migrations/20261107000100_agent_review_guard/migration.sql'), 'utf8');
  prisma = new PrismaClient({ datasources: { db: { url } } });
  await prisma.user.createMany({ data: ['owner', 'reviewer', 'outsider'].map(id => ({ id, name: id })) });
  await prisma.workspace.create({ data: { id: 'w', name: 'Work', slug: 'work', ownerId: 'owner' } });
  await prisma.workspaceMember.createMany({ data: ['reviewer', 'outsider'].map(userId => ({ workspaceId: 'w', userId })) });
  await prisma.project.create({ data: { id: 'project', workspaceId: 'w', name: 'Project', slug: 'project', issuePrefix: 'SBK' } });
  await prisma.issue.create({ data: { id: 'issue', workspaceId: 'w', projectId: 'project', title: 'Test', issueKey: 'SBK-1' } });
  await prisma.agentRegistration.createMany({ data: ['owner', 'reviewer', 'outsider'].map(name => ({ id: name + '-id', workspaceId: 'w', userId: name, name })) });
  await prisma.agentHandoff.create({ data: { id: 'handoff', sourceKey: 'source', workspaceId: 'w', issueId: 'issue', content: 'Original', status: 'claimed', claimedById: 'owner-id' } });
  const scopes = ['issues:read', 'issues:write'];
  const context = user => ({ user: { id: user }, workspace: { id: 'w' }, token: { scopes } });
  const oauth = load('src/lib/oauth-scopes.ts', {}, { URL });
  const finder = load('src/lib/issue-finder.ts', { '@/lib/prisma': { prisma } });
  const handoffs = load('src/lib/agent-handoffs.ts', { 'node:crypto': require('node:crypto'), 'node:buffer': require('node:buffer'), zod: require('zod'), '@/lib/prisma': { prisma }, '@/lib/issue-finder': finder, '@/lib/oauth-scopes': oauth }, { Date });
  const api = load('src/lib/agent-reviews.ts', { zod: require('zod'), '@/lib/prisma': { prisma }, '@/lib/agent-handoffs': handoffs, '@/lib/oauth-scopes': oauth }, { Buffer, Date });
  const rev = 'a'.repeat(40);
  const input = api.createReviewSchema.parse({ agent: 'owner', handoffId: 'handoff', reviewerAgentId: 'reviewer-id', requestId: randomUUID(), repository: 'owner/repo', pullRequestNumber: 7, revision: rev, content: 'private request' });
  const create = () => api.createReview(context('owner'), input);
  await assert.rejects(create(), error => error.code === 'review_guard_unavailable', 'db push alone fails closed');
  assert.equal(await prisma.agentReviewRequest.count(), 0);
  const partialIndex = migration.split('\n').find(line => line.startsWith('CREATE UNIQUE INDEX "AgentReviewRequest_one_active_per_handoff"'));
  execFileSync(join(bindir, 'psql'), ['-X', '-v', 'ON_ERROR_STOP=1', '-h', directory, '-d', 'postgres'], { input: partialIndex + '\n' + migration.slice(migration.indexOf('-- Review creation and transfer creation')), stdio: ['pipe', 'pipe', 'pipe'] });
  await prisma.$executeRawUnsafe('DROP INDEX "AgentReviewRequest_one_active_per_handoff"');
  await prisma.$executeRawUnsafe('CREATE UNIQUE INDEX "AgentReviewRequest_one_active_per_handoff" ON "AgentReviewRequest"(id) WHERE status = \'pending\'');
  await assert.rejects(create(), error => error.code === 'review_guard_unavailable', 'same-name wrong index fails closed');
  await prisma.$executeRawUnsafe('DROP INDEX "AgentReviewRequest_one_active_per_handoff"');
  await prisma.$executeRawUnsafe(partialIndex);
  await prisma.$executeRawUnsafe('CREATE OR REPLACE FUNCTION "guard_pending_review_claim"() RETURNS trigger AS $$ BEGIN RETURN NEW; END; $$ LANGUAGE plpgsql');
  await assert.rejects(create(), error => error.code === 'review_guard_unavailable', 'same-name altered trigger function fails closed');
  const originalFunction = migration.match(/CREATE FUNCTION "guard_pending_review_claim"\(\) RETURNS trigger AS \$\$[\s\S]*?\$\$ LANGUAGE plpgsql;/)[0];
  await prisma.$executeRawUnsafe(originalFunction.replace('CREATE FUNCTION', 'CREATE OR REPLACE FUNCTION'));
  const generation = randomUUID();
  const managed = { generation, closed: false, leaseUntil: new Date(Date.now() + 60000).toISOString(), coordinator: { project: 'project', generation: randomUUID() } };
  await prisma.agentRegistration.update({ where: { id: 'owner-id' }, data: { managedWorker: managed } });
  await assert.rejects(api.createReview(context('owner'), { ...input, generation }), error => error.code === 'coordinator_review_unsupported');
  await prisma.agentRegistration.update({ where: { id: 'owner-id' }, data: { managedWorker: { ...managed, leaseUntil: new Date(Date.now() - 1000).toISOString() } } });
  await assert.rejects(api.createReview(context('owner'), { ...input, generation }), error => error.code === 'worker_fenced');
  await prisma.agentRegistration.update({ where: { id: 'owner-id' }, data: { managedWorker: { ...managed, closed: true } } });
  await assert.rejects(api.createReview(context('owner'), { ...input, generation }), error => error.code === 'worker_fenced');
  await prisma.agentRegistration.update({ where: { id: 'owner-id' }, data: { managedWorker: managed } });
  await assert.rejects(api.createReview(context('owner'), { ...input, generation: randomUUID() }), error => error.code === 'worker_fenced');
  await prisma.agentRegistration.update({ where: { id: 'owner-id' }, data: { managedWorker: require('@prisma/client').Prisma.DbNull } });
  const review = await create();
  assert.equal((await create()).id, review.id, 'idempotent creation');
  await assert.rejects(api.getReview(context('outsider'), 'outsider', review.id));
  await assert.rejects(api.createReview({ ...context('owner'), token: { scopes: ['issues:read'] } }, input));
  const action = (user, data) => api.actOnReview(context(user), review.id, api.reviewActionSchema.parse({ agent: user, ...data }));
  await prisma.agentRegistration.update({ where: { id: 'reviewer-id' }, data: { managedWorker: managed } });
  await assert.rejects(action('reviewer', { action: 'claim', generation }), error => error.code === 'coordinator_review_unsupported');
  await prisma.agentRegistration.update({ where: { id: 'reviewer-id' }, data: { managedWorker: require('@prisma/client').Prisma.DbNull } });
  await assert.rejects(prisma.agentHandoff.update({ where: { id: 'handoff' }, data: { status: 'completed' } }), 'legacy completion cannot bypass review');
  await assert.rejects(action('outsider', { action: 'claim' }));
  await action('reviewer', { action: 'claim' });
  await assert.rejects(action('reviewer', { action: 'reply', verdict: 'approved', reviewedRevision: 'b'.repeat(40), content: 'private response' }));
  await action('owner', { action: 'hold', reason: 'private hold', expectedHoldVersion: 0 });
  await assert.rejects(action('owner', { action: 'cancel', reason: 'cannot bypass hold' }), error => error.code === 'review_held');
  await action('owner', { action: 'hold', reason: 'private newer hold', expectedHoldVersion: 1 });
  await assert.rejects(action('owner', { action: 'hold', reason: 'private hold', expectedHoldVersion: 0 }), error => error.code === 'hold_changed');
  await assert.rejects(action('owner', { action: 'release_hold', expectedHoldVersion: 1 }), error => error.code === 'hold_changed');
  await action('reviewer', { action: 'reply', verdict: 'approved', reviewedRevision: rev, content: 'private response' });
  await assert.rejects(action('owner', { action: 'resolve' }));
  await action('owner', { action: 'release_hold', expectedHoldVersion: 2 });
  await action('owner', { action: 'resolve' });
  assert.equal((await prisma.agentHandoff.findUniqueOrThrow({ where: { id: 'handoff' } })).status, 'claimed', 'review receipt does not complete or merge');
  await prisma.agentHandoff.create({ data: { id: 'handoff2', sourceKey: 'source2', workspaceId: 'w', issueId: 'issue', content: 'Second', status: 'claimed', claimedById: 'owner-id' } });
  const second = await api.createReview(context('owner'), { ...input, handoffId: 'handoff2', requestId: randomUUID() });
  const secondAction = data => api.actOnReview(context('owner'), second.id, api.reviewActionSchema.parse({ agent: 'owner', ...data }));
  await secondAction({ action: 'hold', reason: 'awaiting review', expectedHoldVersion: 0 });
  await prisma.workspaceMember.updateMany({ where: { workspaceId: 'w', userId: 'reviewer' }, data: { status: false } });
  await assert.rejects(api.getReview(context('reviewer'), 'reviewer', second.id), 'revoked issue access is rechecked');
  await assert.rejects(secondAction({ action: 'release_hold', expectedHoldVersion: 0 }), error => error.code === 'hold_changed');
  assert.equal((await secondAction({ action: 'release_hold', expectedHoldVersion: 1 })).holdReason, null);
  await prisma.workspaceMember.updateMany({ where: { workspaceId: 'w', userId: 'reviewer' }, data: { status: true } });
  await secondAction({ action: 'hold', reason: 'awaiting review again', expectedHoldVersion: 2 });
  await prisma.agentRegistration.delete({ where: { id: 'reviewer-id' } });
  await prisma.agentRegistration.create({ data: { id: 'replacement-id', workspaceId: 'w', userId: 'reviewer', name: 'reviewer' } });
  await assert.rejects(api.getReview(context('reviewer'), 'reviewer', second.id), 'a same-name replacement cannot read the request');
  await assert.rejects(secondAction({ action: 'cancel', reason: 'reviewer unavailable' }), error => error.code === 'review_held');
  await assert.rejects(secondAction({ action: 'release_hold', expectedHoldVersion: 2 }), error => error.code === 'hold_changed');
  assert.equal((await secondAction({ action: 'release_hold', expectedHoldVersion: 3 })).holdReason, null);
  await secondAction({ action: 'cancel', reason: 'reviewer unavailable' });
  assert.equal((await prisma.agentHandoff.findUniqueOrThrow({ where: { id: 'handoff2' } })).status, 'claimed', 'cancellation retains the owner claim');
  const activities = await prisma.issueActivity.findMany({ where: { itemId: 'issue' } });
  assert.ok(activities.length);
  assert.doesNotMatch(JSON.stringify(activities), /private (request|response|hold)/);

  // Real user deletion must serialize with request admission in both lock orders.
  const sleep = ms => new Promise(resolveSleep => setTimeout(resolveSleep, ms));
  async function waitForBlocked(minimum) {
    for (let i = 0; i < 100; i++) {
      const rows = await prisma.$queryRaw`SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND cardinality(pg_blocking_pids(pid)) > 0`;
      if (rows[0].n >= minimum) return;
      await sleep(20);
    }
    assert.fail('Expected database lock wait was not observed');
  }
  for (const first of ['review', 'transfer']) {
    const handoffId = 'transfer-race-' + first;
    await prisma.agentHandoff.create({ data: { id: handoffId, sourceKey: handoffId, workspaceId: 'w', issueId: 'issue', content: 'Concurrent transfer', status: 'claimed', claimedById: 'owner-id' } });
    const reviewInput = { ...input, handoffId, reviewerAgentId: 'replacement-id', requestId: randomUUID() };
    const offerInput = handoffs.transferOfferSchema.parse({ agent: 'owner', handoffId, toAgent: 'reviewer', requestId: randomUUID(), content: 'Transfer offer' });
    const runReview = () => api.createReview(context('owner'), reviewInput).then(value => ({ value }), error => ({ error }));
    const runOffer = () => handoffs.createTransferOffer(context('owner'), offerInput).then(value => ({ value }), error => ({ error }));
    let reviewResult, offerResult;
    await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${'project'} FOR UPDATE`;
      if (first === 'review') reviewResult = runReview(); else offerResult = runOffer();
      await waitForBlocked(1);
      if (first === 'review') offerResult = runOffer(); else reviewResult = runReview();
      await waitForBlocked(2);
    }, { timeout: 10000 });
    const reviewRace = await reviewResult, offerRace = await offerResult;
    assert.equal(Boolean(reviewRace.value), first === 'review', String(reviewRace.error));
    assert.equal(Boolean(offerRace.value), first === 'transfer', String(offerRace.error));
    assert.doesNotMatch(String(reviewRace.error ?? offerRace.error), /40P01|deadlock/i);
  }
  const repositoryData = { id: 'repo', projectId: 'project', githubRepoId: 'synthetic', owner: 'other', name: 'repo', fullName: 'other/repo', webhookSecret: 'synthetic' };
  await prisma.agentHandoff.create({ data: { id: 'binding-handoff', sourceKey: 'binding', workspaceId: 'w', issueId: 'issue', content: 'Binding race', status: 'claimed', claimedById: 'owner-id' } });
  const bindingInput = { ...input, handoffId: 'binding-handoff', reviewerAgentId: 'replacement-id', requestId: randomUUID() };
  let admissionBeforeInsert, inserted;
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "AgentHandoff" WHERE id = ${'binding-handoff'} FOR UPDATE`;
    admissionBeforeInsert = api.createReview(context('owner'), bindingInput).then(value => ({ value }), error => ({ error }));
    await waitForBlocked(1);
    inserted = prisma.repository.create({ data: repositoryData }).then(value => ({ value }), error => ({ error }));
    await waitForBlocked(2);
  }, { timeout: 10000 });
  const admittedUnbound = await admissionBeforeInsert, insertAfter = await inserted;
  assert.ok(admittedUnbound.value, String(admittedUnbound.error));
  assert.ok(insertAfter.value, String(insertAfter.error));
  await api.actOnReview(context('owner'), admittedUnbound.value.id, api.reviewActionSchema.parse({ agent: 'owner', action: 'cancel', reason: 'binding changed' }));
  await prisma.repository.delete({ where: { id: 'repo' } });

  const insertFirstInput = { ...bindingInput, requestId: randomUUID() };
  let admissionAfterInsert;
  await prisma.$transaction(async tx => {
    await tx.repository.create({ data: repositoryData });
    admissionAfterInsert = api.createReview(context('owner'), insertFirstInput).then(value => ({ value }), error => ({ error }));
    await waitForBlocked(1);
  }, { timeout: 10000 });
  assert.equal((await admissionAfterInsert).error?.code, 'repository_mismatch');
  await prisma.repository.update({ where: { id: 'repo' }, data: { fullName: 'owner/repo' } });
  const updateInput = { ...bindingInput, requestId: randomUUID() };
  let admissionBeforeUpdate, updateResult;
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "AgentHandoff" WHERE id = ${'binding-handoff'} FOR UPDATE`;
    admissionBeforeUpdate = api.createReview(context('owner'), updateInput).then(value => ({ value }), error => ({ error }));
    await waitForBlocked(1);
    updateResult = prisma.repository.update({ where: { id: 'repo' }, data: { fullName: 'other/repo' } }).then(value => ({ value }), error => ({ error }));
    await waitForBlocked(2);
  }, { timeout: 10000 });
  const admittedBound = await admissionBeforeUpdate, updateAfter = await updateResult;
  assert.ok(admittedBound.value, String(admittedBound.error));
  assert.ok(updateAfter.value, String(updateAfter.error));
  await api.actOnReview(context('owner'), admittedBound.value.id, api.reviewActionSchema.parse({ agent: 'owner', action: 'cancel', reason: 'binding changed again' }));
  await prisma.repository.delete({ where: { id: 'repo' } });

  await prisma.agentHandoff.create({ data: { id: 'ddl-handoff', sourceKey: 'ddl', workspaceId: 'w', issueId: 'issue', content: 'DDL race', status: 'claimed', claimedById: 'owner-id' } });
  const ddlInput = { ...input, handoffId: 'ddl-handoff', reviewerAgentId: 'replacement-id', requestId: randomUUID() };
  let reviewDuringDDL, disableResult;
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "AgentRegistration" WHERE id = ${'owner-id'} FOR UPDATE`;
    reviewDuringDDL = api.createReview(context('owner'), ddlInput).then(value => ({ value }), error => ({ error }));
    await waitForBlocked(1);
    disableResult = prisma.$executeRawUnsafe('ALTER TABLE "AgentHandoff" DISABLE TRIGGER "guard_pending_review_claim"').then(value => ({ value }), error => ({ error }));
    await waitForBlocked(2);
  }, { timeout: 10000 });
  const ddlReview = await reviewDuringDDL, disabled = await disableResult;
  assert.ok(ddlReview.value, String(ddlReview.error));
  assert.ok(!disabled.error, String(disabled.error));
  await assert.rejects(api.actOnReview(context('owner'), ddlReview.value.id, api.reviewActionSchema.parse({ agent: 'owner', action: 'cancel', reason: 'disabled guard' })), error => error.code === 'review_guard_unavailable');
  await prisma.$executeRawUnsafe('ALTER TABLE "AgentHandoff" ENABLE TRIGGER "guard_pending_review_claim"');
  await api.actOnReview(context('owner'), ddlReview.value.id, api.reviewActionSchema.parse({ agent: 'owner', action: 'cancel', reason: 'guard restored' }));
  await prisma.agentHandoff.create({ data: { id: 'takeover-handoff', sourceKey: 'takeover', workspaceId: 'w', issueId: 'issue', content: 'Takeover', status: 'claimed', claimedById: 'owner-id' } });
  const takeoverInput = { ...input, handoffId: 'takeover-handoff', reviewerAgentId: 'replacement-id', requestId: randomUUID(), generation };
  let takeoverResult;
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "AgentRegistration" WHERE id = ${'owner-id'} FOR UPDATE`;
    takeoverResult = api.createReview(context('owner'), takeoverInput).then(value => ({ value }), error => ({ error }));
    await waitForBlocked(1);
    await tx.agentRegistration.update({ where: { id: 'owner-id' }, data: { managedWorker: managed } });
  }, { timeout: 10000 });
  assert.equal((await takeoverResult).error?.code, 'coordinator_review_unsupported', 'the locked fresh binding controls admission');
  assert.equal(await prisma.agentReviewRequest.count({ where: { originalHandoffId: 'takeover-handoff' } }), 0);
  await prisma.agentRegistration.update({ where: { id: 'owner-id' }, data: { managedWorker: require('@prisma/client').Prisma.DbNull } });
  async function makeRace(suffix) {
    await prisma.user.create({ data: { id: 'race-user-' + suffix } });
    await prisma.workspaceMember.create({ data: { workspaceId: 'w', userId: 'race-user-' + suffix } });
    await prisma.agentRegistration.create({ data: { id: 'race-agent-' + suffix, workspaceId: 'w', userId: 'race-user-' + suffix, name: 'race-' + suffix } });
    await prisma.agentHandoff.create({ data: { id: 'race-handoff-' + suffix, sourceKey: 'race-' + suffix, workspaceId: 'w', issueId: 'issue', content: 'Race', status: 'claimed', claimedById: 'owner-id' } });
    return { ...input, reviewerAgentId: 'race-agent-' + suffix, handoffId: 'race-handoff-' + suffix, requestId: randomUUID() };
  }
  const firstRace = await makeRace('delete-first');
  let firstResult;
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${'race-user-delete-first'} FOR UPDATE`;
    firstResult = api.createReview(context('owner'), firstRace).then(value => ({ value }), error => ({ error }));
    await waitForBlocked(1);
    await tx.user.delete({ where: { id: 'race-user-delete-first' } });
  }, { timeout: 10000 });
  const deletionFirst = await firstResult;
  assert.ok(deletionFirst.error, 'request fails when reviewer deletion wins');
  assert.doesNotMatch(String(deletionFirst.error), /40P01|deadlock/i);
  assert.equal(await prisma.agentReviewRequest.count({ where: { originalHandoffId: firstRace.handoffId } }), 0);

  const secondRace = await makeRace('request-first');
  let secondResult, deletionResult;
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "AgentRegistration" WHERE id = ${'race-agent-request-first'} FOR UPDATE`;
    secondResult = api.createReview(context('owner'), secondRace).then(value => ({ value }), error => ({ error }));
    await waitForBlocked(1);
    deletionResult = prisma.user.delete({ where: { id: 'race-user-request-first' } }).then(value => ({ value }), error => ({ error }));
    await waitForBlocked(2);
  }, { timeout: 10000 });
  const requestFirst = await secondResult, deletionAfter = await deletionResult;
  assert.ok(requestFirst.value, String(requestFirst.error));
  assert.ok(deletionAfter.value, String(deletionAfter.error));
  const inaccessible = await prisma.agentReviewRequest.findUniqueOrThrow({ where: { id: requestFirst.value.id } });
  assert.equal(inaccessible.reviewerAgentId, null);
  await api.actOnReview(context('owner'), inaccessible.id, api.reviewActionSchema.parse({ agent: 'owner', action: 'cancel', reason: 'reviewer deleted' }));

  // Exercise the real auth middleware and routes over loopback HTTP, with synthetic tokens.
  await prisma.app.create({ data: { id: 'fixture-app', name: 'Fixture', slug: 'fixture', publisherId: 'owner', status: 'PUBLISHED', isSystemApp: true, scopes: { create: scopes.map(scope => ({ scope })) } } });
  await prisma.appToken.createMany({ data: [['owner', 'fixture-owner', scopes], ['reviewer', 'fixture-reviewer', scopes], ['outsider', 'fixture-outsider', scopes], ['owner', 'fixture-readonly', ['issues:read']]].map(([userId, token, granted]) => ({ id: token, appId: 'fixture-app', workspaceId: 'w', userId, accessToken: Buffer.from(token).toString('base64'), scopes: granted })) });
  const auth = load('src/lib/apps/auth-middleware.ts', { 'next/server': { NextResponse: Response }, '@/lib/prisma': { prisma }, '@/lib/post-access': load('src/lib/post-access.ts'), '@/lib/oauth-scopes': oauth, '@/lib/apps/crypto': { getEncryptionKey: () => Buffer.alloc(32), decryptToken: async bytes => bytes.toString() } }, { Buffer, URL, Date, console });
  const http = load('src/lib/agent-handoff-http.ts', { './agent-handoffs': handoffs, zod: require('zod'), 'next/server': { NextResponse: Response } }, { Buffer, console });
  const logged = [];
  const reviewHttp = load('src/lib/agent-review-http.ts', { './agent-handoffs': handoffs, zod: require('zod'), 'next/server': { NextResponse: Response } }, { console: { error: (...args) => logged.push(args) } });
  const failed = await reviewHttp.reviewResponse(async () => { throw new Error('private review data in database error'); });
  assert.equal(failed.status, 503);
  assert.doesNotMatch(JSON.stringify(logged) + await failed.text(), /private review data/);
  const deps = { '@/lib/apps/auth-middleware': auth, '@/lib/agent-reviews': api, '@/lib/agent-handoff-http': http, '@/lib/agent-review-http': reviewHttp };
  const workerRoute = load('src/app/api/apps/auth/agents/worker/route.ts', { '@/lib/apps/auth-middleware': auth, '@/lib/agent-handoffs': handoffs, '@/lib/agent-handoff-http': http }, { URL });
  const collection = load('src/app/api/apps/auth/agents/reviews/route.ts', deps, { URL });
  const item = load('src/app/api/apps/auth/agents/reviews/[id]/route.ts', deps, { URL });
  server = createServer(async (req, res) => {
    try {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const request = new Request(`http://127.0.0.1:${server.address().port}${req.url}`, { method: req.method, headers: req.headers, ...(['POST', 'PATCH'].includes(req.method) && { body: Buffer.concat(chunks) }) });
      request.nextUrl = new URL(request.url);
      const path = new URL(request.url).pathname;
      const response = path.endsWith('/worker') ? await workerRoute[req.method](request) : path.endsWith('/reviews') ? await collection[req.method](request) :
        await item[req.method](request, { params: Promise.resolve({ id: decodeURIComponent(path.split('/').at(-1)) }) });
      res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer()));
    } catch { res.writeHead(500); res.end(); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');

  // Invoke the actual CLI as a child against the real HTTP route and isolated database.
  const { promisify } = require('node:util');
  const runCli = promisify(require('node:child_process').execFile);
  const cliEnv = { ...process.env, COLLAB_URL: `http://127.0.0.1:${server.address().port}`, COLLAB_CONFIG_DIR: join(directory, 'cli-config') };
  const cli = async (user, args, fail = false) => {
    let out;
    try {
      out = await runCli(process.execPath, [resolve('packages/cli/bin/collab.mjs'), ...args, '--workspace', 'w'], { env: { ...cliEnv, COLLAB_TOKEN: `fixture-${user}` }, timeout: 12000 });
    } catch (e) {
      if (!fail) throw e;
      return JSON.parse(e.stderr);
    }
    assert.equal(fail, false, 'expected CLI command to fail');
    return JSON.parse(out.stdout);
  };
  // More than 100 legacy pages precede a fresh incoming review.
  const historic = Array.from({ length: 5001 }, (_, i) => i.toString().padStart(5, '0'));
  const past = new Date('2020-01-01T00:00:00.000Z');
  await prisma.agentHandoff.createMany({ data: historic.map(i => ({ id: 'history-h-' + i, sourceKey: 'history-' + i, workspaceId: 'w', issueId: 'issue', content: 'old', status: 'claimed', claimedById: 'owner-id', createdAt: past })) });
  await prisma.agentReviewRequest.createMany({ data: historic.map(i => ({ id: 'history-r-' + i, workspaceId: 'w', issueId: 'issue', originalHandoffId: 'history-h-' + i, ownerAgentId: 'owner-id', reviewerAgentId: 'replacement-id', requestId: 'history-' + i, repository: 'owner/repo', pullRequestNumber: 7, revision: rev, requestContent: 'old', createdAt: past })) });
  await prisma.agentReviewRequest.updateMany({ where: { id: { startsWith: 'history-r-' } }, data: { status: 'cancelled', cancelReason: 'finished' } });
  await prisma.agentHandoff.create({ data: { id: 'cli-handoff', sourceKey: 'cli-source', workspaceId: 'w', issueId: 'issue', content: 'CLI original', status: 'claimed', claimedById: 'owner-id' } });
  const idempotency = randomUUID();
  const reviewRequestArgs = ['reviews','request','--agent','owner','--handoff-id','cli-handoff','--reviewer-agent-id','replacement-id','--request-id',idempotency,'--repository','owner/repo','--pull-request-number','7','--revision',rev,'--content','private CLI review'];
  const sentByCli = await cli('owner', reviewRequestArgs);
  assert.ok(sentByCli.id);
  assert.equal((await cli('owner', reviewRequestArgs)).id, sentByCli.id, 'same request UUID and payload are idempotent');
  const listByCli = await cli('reviewer', ['reviews','list','--agent','reviewer']);
  assert.ok(listByCli.items.every(row => row.status === 'cancelled'), 'legacy pagination still starts with historic records');
  const waitByCli = await cli('reviewer', ['reviews','wait','--agent','reviewer','--reviewer-id','replacement-id','--wait-seconds','10']);
  assert.ok(waitByCli.items.some(row => row.id === sentByCli.id));
  assert.doesNotMatch(JSON.stringify(waitByCli), /private CLI review/);
  // More than a page of active work must be traversable without duplicates or a loop.
  const active = historic.slice(0, 55);
  await prisma.agentReviewRequest.createMany({ data: active.map(i => ({ id: 'active-r-' + i, workspaceId: 'w', issueId: 'issue', originalHandoffId: 'history-h-' + i, ownerAgentId: 'owner-id', reviewerAgentId: 'replacement-id', requestId: 'active-' + i, repository: 'owner/repo', pullRequestNumber: 7, revision: rev, requestContent: 'active', createdAt: new Date('2021-01-01T00:00:00.000Z') })) });
  const collected = [], cursors = new Set();
  let cursor = null, passes = 0;
  do {
    const args = ['reviews','wait','--agent','reviewer','--reviewer-id','replacement-id','--wait-seconds','10'];
    if (cursor) args.push('--cursor', cursor);
    const page = await cli('reviewer', args);
    collected.push(...page.items.map(row => row.id));
    cursor = page.nextCursor;
    if (cursor) { assert.ok(!cursors.has(cursor), 'continuation never repeats'); cursors.add(cursor); }
    assert.ok(++passes <= 4, 'pagination terminates');
  } while (cursor);
  assert.equal(new Set(collected).size, collected.length, 'each review appears once in a stable pass');
  assert.ok(active.every(i => collected.includes('active-r-' + i)));
  assert.ok(collected.includes(sentByCli.id), 'new review is not hidden behind older active work');
  await prisma.agentReviewRequest.updateMany({ where: { id: { startsWith: 'active-r-' } }, data: { status: 'cancelled', cancelReason: 'fixture cleanup' } });

  await cli('reviewer',['reviews','claim',sentByCli.id,'--agent','reviewer']);
  await cli('reviewer',['reviews','reply',sentByCli.id,'--agent','reviewer','--verdict','approved','--reviewed-revision',rev,'--content','CLI reply']);
  const readByCli = await cli('owner',['reviews','get',sentByCli.id,'--agent','owner']);
  assert.equal(readByCli.review.status,'replied');
  assert.equal(readByCli.review.responseOutcome,'approved');
  await cli('owner',['reviews','hold',sentByCli.id,'--agent','owner','--reason','first hold','--expected-hold-version','0']);
  await cli('owner',['reviews','release-hold',sentByCli.id,'--agent','owner','--expected-hold-version','1']);
  await cli('owner',['reviews','hold',sentByCli.id,'--agent','owner','--reason','second hold','--expected-hold-version','2']);
  const stale = await cli('owner',['reviews','release-hold',sentByCli.id,'--agent','owner','--expected-hold-version','1'],true);
  assert.equal(stale.error, 'hold_changed');
  const currentByCli = await cli('owner',['reviews','get',sentByCli.id,'--agent','owner']);
  assert.equal(currentByCli.review.holdReason,'second hold');
  assert.equal(currentByCli.review.holdVersion,3);
  assert.equal((await prisma.agentHandoff.findUniqueOrThrow({ where: {id:'cli-handoff'} })).status,'claimed');
  const base = `http://127.0.0.1:${server.address().port}/api/apps/auth/agents/reviews`;
  const request = (path, token, method = 'GET', body) => fetch(base + path, { method, headers: { ...(token && { authorization: `Bearer ${token}` }), ...(body && { 'content-type': 'application/json' }) }, ...(body && { body: JSON.stringify(body) }) });
  await prisma.agentHandoff.create({ data: { id: 'handoff3', sourceKey: 'source3', workspaceId: 'w', issueId: 'issue', content: 'Third', status: 'claimed', claimedById: 'owner-id' } });
  const httpInput = { ...input, handoffId: 'handoff3', reviewerAgentId: 'replacement-id', requestId: randomUUID() };
  assert.equal((await request('?workspaceId=w', null, 'POST', httpInput)).status, 401);
  assert.equal((await request('?workspaceId=w', 'fixture-readonly', 'POST', httpInput)).status, 403);
  const sent = await request('?workspaceId=w', 'fixture-owner', 'POST', httpInput);
  assert.equal(sent.status, 200); const sentReview = await sent.json();
  const view = '?workspaceId=w&agent=reviewer&view=incoming-v1&limit=1';
  const page1 = await (await request(view, 'fixture-reviewer')).json();
  assert.equal(page1.view, 'incoming-v1');
  const allIncoming = await (await request(view.replace('limit=1', 'limit=50'), 'fixture-reviewer')).json();
  assert.ok(allIncoming.items.some(row => row.id === sentReview.id));
  assert.ok(allIncoming.items.every(row => row.reviewerAgentId === 'replacement-id' && ['pending', 'claimed'].includes(row.status)));
  assert.ok(!allIncoming.items.some(row => row.id === sentByCli.id), 'replied reviews are terminal for discovery');
  assert.deepEqual((await (await request('?workspaceId=w&agent=owner&view=incoming-v1', 'fixture-owner')).json()).items, [], 'owner cannot see outgoing requests in incoming view');
  assert.deepEqual((await (await request('?workspaceId=w&agent=outsider&view=incoming-v1', 'fixture-outsider')).json()).items, [], 'other reviewer cannot see requests');
  assert.equal((await request('?workspaceId=w&agent=reviewer&view=unknown', 'fixture-reviewer')).status, 400);
  await prisma.agentHandoff.create({ data: { id: 'page-handoff', sourceKey: 'page-source', workspaceId: 'w', issueId: 'issue', content: 'page', status: 'claimed', claimedById: 'owner-id' } });
  const secondPageReview = await api.createReview(context('owner'), { ...input, handoffId: 'page-handoff', reviewerAgentId: 'replacement-id', requestId: randomUUID() });
  const first = await (await request(view, 'fixture-reviewer')).json();
  assert.ok(first.nextCursor);
  const secondPage = await (await request(view + '&cursor=' + first.nextCursor, 'fixture-reviewer')).json();
  assert.notEqual(secondPage.items[0].id, first.items[0].id);
  assert.ok((await (await request(view.replace('limit=1', 'limit=50'), 'fixture-reviewer')).json()).items.some(row => row.id === secondPageReview.id));
  assert.equal((await request('?workspaceId=w&agent=reviewer&cursor=' + first.nextCursor, 'fixture-reviewer')).status, 400, 'incoming cursor cannot be used in legacy view');
  assert.equal((await request('?workspaceId=w&agent=outsider&view=incoming-v1&cursor=' + first.nextCursor, 'fixture-outsider')).status, 400, 'cursor is bound to agent');
  const wrongWorkspace = JSON.parse(Buffer.from(first.nextCursor, 'base64url').toString());
  wrongWorkspace[0] = 'other-workspace';
  assert.equal((await request(view + '&cursor=' + Buffer.from(JSON.stringify(wrongWorkspace)).toString('base64url'), 'fixture-reviewer')).status, 400, 'cursor is bound to workspace');
  const legacy = await (await request('?workspaceId=w&agent=reviewer&limit=1', 'fixture-reviewer')).json();
  assert.equal(legacy.view, undefined);
  assert.equal((await request(view + '&cursor=' + legacy.nextCursor, 'fixture-reviewer')).status, 400, 'legacy cursor cannot be used in incoming view');
  assert.equal((await request(view + '&cursor=invalid', 'fixture-reviewer')).status, 400);
  assert.equal((await request(`/${sentReview.id}?workspaceId=w&agent=outsider`, 'fixture-outsider')).status, 404);
  assert.equal((await request(`/${sentReview.id}?workspaceId=w&agent=reviewer`, 'fixture-reviewer')).status, 200);
  assert.equal((await request(`/${sentReview.id}?workspaceId=w`, 'fixture-owner', 'PATCH', { agent: 'owner', action: 'hold', reason: 'first hold', expectedHoldVersion: 0 })).status, 200);
  assert.equal((await request(`/${sentReview.id}?workspaceId=w`, 'fixture-owner', 'PATCH', { agent: 'owner', action: 'release_hold', expectedHoldVersion: 1 })).status, 200);
  assert.equal((await request(`/${sentReview.id}?workspaceId=w`, 'fixture-owner', 'PATCH', { agent: 'owner', action: 'hold', reason: 'second hold', expectedHoldVersion: 2 })).status, 200);
  assert.equal((await request(`/${sentReview.id}?workspaceId=w`, 'fixture-owner', 'PATCH', { agent: 'owner', action: 'hold', reason: 'first hold', expectedHoldVersion: 0 })).status, 409);
  assert.equal((await request(`/${sentReview.id}?workspaceId=w`, 'fixture-owner', 'PATCH', { agent: 'owner', action: 'release_hold', expectedHoldVersion: 1 })).status, 409);
  assert.equal((await request(`/${sentReview.id}?workspaceId=w`, 'fixture-owner', 'PATCH', { agent: 'owner', action: 'cancel', reason: 'held' })).status, 409);
  assert.ok((await (await request(view.replace('limit=1', 'limit=50'), 'fixture-reviewer')).json()).items.some(row => row.id === sentReview.id), 'held pending reviews remain visible');
  assert.equal((await request(`/${sentReview.id}?workspaceId=w`, 'fixture-reviewer', 'PATCH', { agent: 'reviewer', action: 'claim' })).status, 200);
  assert.equal((await request(`/${sentReview.id}?workspaceId=w`, 'fixture-reviewer', 'PATCH', { agent: 'reviewer', action: 'reply', verdict: 'approved', reviewedRevision: rev, content: 'HTTP review' })).status, 200);
  await prisma.workspaceMember.updateMany({ where: { workspaceId: 'w', userId: 'reviewer' }, data: { status: false } });
  assert.equal((await request(`/${sentReview.id}?workspaceId=w&agent=reviewer`, 'fixture-reviewer')).status, 403);
  assert.equal((await request(view, 'fixture-reviewer')).status, 403, 'revocation applies to incoming view');
});
