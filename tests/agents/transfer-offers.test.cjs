const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync, readFileSync } = require('node:fs');
const { tmpdir, userInfo } = require('node:os');
const { join, resolve } = require('node:path');
const { execFileSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { Prisma, PrismaClient } = require('@prisma/client');
const { load } = require('../security/helpers.cjs');

const directory = mkdtempSync(join(tmpdir(), 'collab-offer-pg-'));
const bindir = execFileSync('pg_config', ['--bindir'], { encoding: 'utf8' }).trim();
let started = false, prisma, servicePrisma;
after(async () => {
  await servicePrisma?.$disconnect(); await prisma?.$disconnect();
  if (started) execFileSync(join(bindir, 'pg_ctl'), ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'], { stdio: 'pipe' });
  rmSync(directory, { recursive: true, force: true });
});

test('manual transfer offers preserve the original claim until acceptance', async t => {
  execFileSync(join(bindir, 'initdb'), ['-D', join(directory, 'data'), '-A', 'trust', '--no-locale', '-E', 'UTF8'], { stdio: 'pipe' });
  execFileSync(join(bindir, 'pg_ctl'), ['-D', join(directory, 'data'), '-l', join(directory, 'server.log'),
    '-o', `-k ${directory} -c listen_addresses='' -c fsync=off`, '-w', 'start'], { stdio: 'pipe' });
  started = true;
  const username = userInfo().username;
  const url = `postgresql://${encodeURIComponent(username)}@localhost/postgres?host=${encodeURIComponent(directory)}`;
  execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'db', 'push', '--skip-generate', '--schema', resolve('prisma/schema.prisma')],
    { env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' });
  const migration = readFileSync(resolve('prisma/migrations/20261030000200_agent_transfer_offer/migration.sql'), 'utf8');
  const trigger = migration.slice(migration.indexOf('CREATE FUNCTION "guard_pending_transfer_offer"'));
  execFileSync(join(bindir, 'psql'), ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-h', directory, '-U', username, '-d', 'postgres'], { input: trigger, stdio: ['pipe', 'pipe', 'pipe'] });
  prisma = new PrismaClient({ datasources: { db: { url } } });
  class TestPrismaClient extends PrismaClient { constructor(options) { super({ ...options, datasources: { db: { url } } }); } }
  servicePrisma = load('src/lib/prisma.ts', { '@prisma/client': { Prisma, PrismaClient: TestPrismaClient }, './issue-visibility': load('src/lib/issue-visibility.ts') }, { global: {}, process: { env: { NODE_ENV: 'production' } } }).prisma;
  const finder = load('src/lib/issue-finder.ts', { '@/lib/prisma': { prisma: servicePrisma } });
  const service = load('src/lib/agent-handoffs.ts', { 'node:crypto': require('node:crypto'), 'node:buffer': require('node:buffer'), zod: require('zod'),
    '@/lib/prisma': { prisma: servicePrisma }, '@/lib/issue-finder': finder, '@/lib/oauth-scopes': load('src/lib/oauth-scopes.ts') }, { Date, Buffer });
  const context = (user, workspace = 'w', scopes = ['issues:read', 'issues:write', 'workspace:write']) => ({ user: { id: user }, workspace: { id: workspace }, token: { scopes } });
  const alice = context('alice'), bob = context('bob'), carol = context('carol'), dave = context('dave'), foreign = context('outsider', 'foreign');
  await prisma.user.createMany({ data: ['alice', 'bob', 'carol', 'dave', 'outsider'].map(id => ({ id, name: id })) });
  await prisma.workspace.createMany({ data: [{ id: 'w', name: 'Work', slug: 'work', ownerId: 'alice' }, { id: 'foreign', name: 'Foreign', slug: 'foreign', ownerId: 'outsider' }] });
  await prisma.workspaceMember.createMany({ data: ['bob', 'carol', 'dave'].map(userId => ({ workspaceId: 'w', userId })) });
  await prisma.project.createMany({ data: ['w', 'foreign'].map(id => ({ id: `p-${id}`, workspaceId: id, name: id, slug: id, issuePrefix: id })) });
  await prisma.issue.createMany({ data: ['w', 'foreign'].map(id => ({ id: `i-${id}`, workspaceId: id, projectId: `p-${id}`, title: id, issueKey: `${id}-1` })) });
  for (const [ctx, name] of [[alice, 'alice'], [bob, 'bob'], [carol, 'carol'], [dave, 'dave'], [foreign, 'outsider']]) await service.registerAgent(ctx, service.registrationSchema.parse({ name }));
  const original = async () => {
    const row = await service.sendHandoff(alice, service.sendSchema.parse({ agent: 'alice', issue: 'w-1', content: 'Owned task', toAgents: ['alice'], requestId: randomUUID() }));
    return service.actOnHandoff(alice, row.id, service.actionSchema.parse({ agent: 'alice', action: 'claim' }));
  };
  const offer = (row, opts = {}) => service.createTransferOffer(alice, service.transferOfferSchema.parse({ agent: 'alice', handoffId: row.id, toAgent: 'bob', content: 'Please take over after I stop', requestId: randomUUID(), ...opts }));
  const act = (ctx, row, agent, action) => service.actOnTransferOffer(ctx, row.id, service.transferOfferActionSchema.parse({ agent, action }));
  const parent = async row => prisma.agentHandoff.findUniqueOrThrow({ where: { id: row.id } });
  const waitForLock = async fragment => {
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      const [state] = await prisma.$queryRaw`SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE pid <> pg_backend_pid()
        AND wait_event_type = 'Lock' AND query LIKE ${'%' + fragment + '%'}) AS waiting`;
      if (state.waiting) return;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error(`Expected a PostgreSQL lock wait on ${fragment}`);
  };
  const waitForLockCount = async count => {
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      const [state] = await prisma.$queryRaw`SELECT COUNT(*)::int AS waiting FROM pg_stat_activity WHERE pid <> pg_backend_pid() AND wait_event_type = 'Lock'`;
      if (state.waiting >= count) return;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error(`Expected ${count} PostgreSQL lock waiters`);
  };

  await t.test('offer content stays out of issue activity and search before and after acceptance', async () => {
    const row = await original(), secret = `privateoffer${randomUUID().replaceAll('-', '')}`;
    const pending = await offer(row, { content: secret });
    assert.equal((await service.listTransferOffers(bob, service.transferOfferListSchema.parse({ agent: 'bob' }))).items.find(x => x.id === pending.id).content, secret);
    assert.equal((await service.listTransferOffers(carol, service.transferOfferListSchema.parse({ agent: 'carol' }))).items.some(x => x.id === pending.id), false);
    const activityRoute = load('src/app/api/issues/[issueId]/activities/route.ts', {
      'next/server': { NextResponse: Response }, '@/lib/auth': { getAuthSession: async () => ({ user: { id: 'carol' } }) },
      '@/lib/prisma': { prisma: servicePrisma },
    }, { URL, console });
    const queryModule = load('src/lib/agent-search-query.ts', { zod: require('zod') }, { Buffer });
    const lexical = load('src/lib/agent-search-lexical.ts', { '@prisma/client': { Prisma }, '@/lib/prisma': { prisma: servicePrisma } });
    const search = load('src/lib/agent-search.ts', { '@prisma/client': { Prisma }, '@/lib/prisma': { prisma: servicePrisma },
      '@/lib/issue-finder': finder, '@/lib/secrets/access': load('src/lib/secrets/access.ts', { '@/lib/prisma': { prisma: servicePrisma }, '@/lib/issue-finder': finder }),
      '@/lib/oauth-scopes': load('src/lib/oauth-scopes.ts'), '@/lib/html-sanitizer': load('src/lib/html-sanitizer.ts'),
      './agent-search-query': queryModule, './agent-search-lexical': lexical, './agent-search-vectors': {} }, { Buffer });
    const check = async () => {
      const response = await activityRoute.GET(new Request('https://example.test'), { params: Promise.resolve({ issueId: 'i-w' }) });
      assert.equal(response.status, 200);
      const activities = await response.json();
      assert.ok(activities.some(x => x.action === 'AGENT_TRANSFER_OFFERED' && x.details.offerId === pending.id));
      assert.equal(JSON.stringify(activities).includes(secret), false);
      const result = await search.searchProjectContent(carol, queryModule.searchQuerySchema.parse({ query: secret, mode: 'exact', type: 'activity' }));
      assert.equal(result.results.length, 0);
      for (const state of ['unseen', 'claimed']) {
        const inbox = await service.workspaceAgentInbox(carol, { state, limit: 50 });
        assert.equal(JSON.stringify(inbox).includes(secret), false);
        const ownInbox = await service.agentInbox(carol, service.inboxSchema.parse({ agent: 'carol', state }));
        assert.equal(JSON.stringify(ownInbox).includes(secret), false);
      }
    };
    await check();
    const accepted = await act(bob, pending, 'bob', 'accept');
    assert.equal(accepted.handoff.content, `Transfer offer: ${pending.id}`);
    assert.equal(accepted.offer.content, secret);
    assert.equal((await act(bob, pending, 'bob', 'accept')).offer.content, secret);
    for (const [ctx, agent] of [[alice, 'alice'], [bob, 'bob']]) {
      const result = await service.listTransferOffers(ctx, service.transferOfferListSchema.parse({ agent, status: 'accepted' }));
      assert.equal(result.items.find(x => x.id === pending.id).content, secret);
    }
    assert.equal((await service.listTransferOffers(carol, service.transferOfferListSchema.parse({ agent: 'carol', status: 'accepted' }))).items.some(x => x.id === pending.id), false);
    await check();
  });

  await t.test('pagination cursors are bound to the offer status', async () => {
    await offer(await original());
    await offer(await original());
    const pending = await service.listTransferOffers(bob, service.transferOfferListSchema.parse({ agent: 'bob', limit: 1 }));
    assert.ok(pending.nextCursor);
    await assert.rejects(service.listTransferOffers(bob, service.transferOfferListSchema.parse({
      agent: 'bob', status: 'accepted', cursor: pending.nextCursor,
    })), e => e.code === 'invalid_cursor');
    const page = await service.listTransferOffers(bob, service.transferOfferListSchema.parse({ agent: 'bob', limit: 1, cursor: pending.nextCursor }));
    assert.notEqual(page.items[0].id, pending.items[0].id);
    const first = await offer(await original()), second = await offer(await original());
    await act(bob, first, 'bob', 'accept');
    await act(bob, second, 'bob', 'accept');
    const accepted = await service.listTransferOffers(bob, service.transferOfferListSchema.parse({ agent: 'bob', status: 'accepted', limit: 1 }));
    assert.ok(accepted.nextCursor);
    await assert.rejects(service.listTransferOffers(bob, service.transferOfferListSchema.parse({ agent: 'bob', cursor: accepted.nextCursor })), e => e.code === 'invalid_cursor');
    await assert.rejects(service.listTransferOffers(carol, service.transferOfferListSchema.parse({ agent: 'carol', status: 'accepted', cursor: accepted.nextCursor })), e => e.code === 'invalid_cursor');
  });

  await t.test('accept and cancel retries preserve response shape and return current state', async () => {
    const acceptedOffer = await offer(await original());
    const accepted = await act(bob, acceptedOffer, 'bob', 'accept');
    const cancelledOffer = await offer(await original());
    const cancelled = await act(bob, cancelledOffer, 'bob', 'cancel');
    await service.actOnHandoff(bob, accepted.handoff.id, service.actionSchema.parse({ agent: 'bob', action: 'release', content: 'Released' }));
    await prisma.issue.update({ where: { id: 'i-w' }, data: { title: 'Updated issue' } });
    const retry = await act(bob, acceptedOffer, 'bob', 'accept');
    const cancelledRetry = await act(bob, cancelledOffer, 'bob', 'cancel');
    const keys = value => Object.keys(value).sort();
    assert.deepEqual(keys(retry), keys(accepted));
    assert.deepEqual(keys(retry.offer), keys(accepted.offer));
    assert.deepEqual(keys(retry.handoff), keys(accepted.handoff));
    assert.deepEqual(keys(cancelledRetry), keys(cancelled));
    assert.equal(retry.offer.id, accepted.offer.id);
    assert.equal(retry.handoff.id, accepted.handoff.id);
    assert.equal(retry.handoff.status, 'open');
    assert.equal(retry.handoff.claimedById, null);
    assert.equal(retry.offer.issue.title, 'Updated issue');
    assert.equal(retry.handoff.issue.title, 'Updated issue');
    assert.equal(cancelledRetry.id, cancelled.id);
    assert.equal(cancelledRetry.issue.title, 'Updated issue');
    assert.equal(await prisma.agentHandoff.count({ where: { afterId: acceptedOffer.parentId } }), 1);
  });

  await t.test('closed retries remain authorized after conversion to a managed worker', async () => {
    const registration = await service.registerAgent(bob, service.registrationSchema.parse({ name: 'retry-worker' }));
    const acceptedOffer = await offer(await original(), { toAgent: 'retry-worker', content: 'Private accepted offer' });
    const accepted = await act(bob, acceptedOffer, 'retry-worker', 'accept');
    const cancelledOffer = await offer(await original(), { toAgent: 'retry-worker', content: 'Private cancelled offer' });
    const cancelled = await act(bob, cancelledOffer, 'retry-worker', 'cancel');
    const pending = await offer(await original(), { toAgent: 'retry-worker' });
    const senderHandoff = await service.sendHandoff(bob, service.sendSchema.parse({ agent: 'retry-worker', issue: 'w-1', content: 'Owned task', toAgents: ['retry-worker'] }));
    await service.actOnHandoff(bob, senderHandoff.id, service.actionSchema.parse({ agent: 'retry-worker', action: 'claim' }));
    const senderOffer = await service.createTransferOffer(bob, service.transferOfferSchema.parse({ agent: 'retry-worker', handoffId: senderHandoff.id, toAgent: 'carol', content: 'Private sender offer', requestId: randomUUID() }));
    const senderCancelled = await act(bob, senderOffer, 'retry-worker', 'cancel');
    await service.actOnHandoff(bob, senderHandoff.id, service.actionSchema.parse({ agent: 'retry-worker', action: 'release', content: 'Released' }));
    await service.actOnHandoff(bob, accepted.handoff.id, service.actionSchema.parse({ agent: 'retry-worker', action: 'release', content: 'Released' }));
    await service.manageWorker(bob, service.workerSchema.parse({ agent: 'retry-worker', host: 'host', sessionId: 'session', event: 'configure', convert: true }));
    const retry = await act(bob, acceptedOffer, 'retry-worker', 'accept');
    const cancelledRetry = await act(bob, cancelledOffer, 'retry-worker', 'cancel');
    const keys = value => Object.keys(value).sort();
    assert.deepEqual(keys(retry), keys(accepted));
    assert.deepEqual(keys(retry.offer), keys(accepted.offer));
    assert.deepEqual(keys(retry.handoff), keys(accepted.handoff));
    assert.deepEqual(keys(cancelledRetry), keys(cancelled));
    assert.equal(retry.offer.id, accepted.offer.id);
    assert.equal(retry.offer.content, acceptedOffer.content);
    assert.equal(retry.handoff.id, accepted.handoff.id);
    assert.equal(retry.handoff.status, 'open');
    assert.equal(retry.handoff.claimedById, null);
    assert.equal(cancelledRetry.id, cancelled.id);
    assert.equal(cancelledRetry.content, cancelledOffer.content);
    const senderRetry = await act(bob, senderOffer, 'retry-worker', 'cancel');
    assert.deepEqual(keys(senderRetry), keys(senderCancelled));
    assert.equal(senderRetry.id, senderCancelled.id);
    assert.equal(senderRetry.content, senderOffer.content);
    assert.equal(await prisma.agentHandoff.count({ where: { afterId: acceptedOffer.parentId } }), 1);
    for (const action of ['accept', 'cancel']) {
      await assert.rejects(act(bob, pending, 'retry-worker', action), e => e.code === 'managed_agent');
    }
    await assert.rejects(offer(await original(), { toAgent: 'retry-worker' }), e => e.code === 'recipient_not_found');
    await prisma.workspaceMember.updateMany({ where: { userId: 'bob', workspaceId: 'w' }, data: { status: false } });
    for (const [row, action] of [[acceptedOffer, 'accept'], [cancelledOffer, 'cancel'], [senderOffer, 'cancel']]) {
      await assert.rejects(act(bob, row, 'retry-worker', action), e => e.code === 'offer_not_found');
    }
    await prisma.workspaceMember.updateMany({ where: { userId: 'bob', workspaceId: 'w' }, data: { status: true } });
    await prisma.agentRegistration.delete({ where: { id: registration.id } });
    await service.registerAgent(carol, service.registrationSchema.parse({ name: 'retry-worker' }));
    for (const [row, action] of [[acceptedOffer, 'accept'], [cancelledOffer, 'cancel'], [senderOffer, 'cancel']]) {
      await assert.rejects(act(carol, row, 'retry-worker', action), e => e.code === 'offer_not_found');
    }
    await act(alice, pending, 'alice', 'cancel');
  });

  await t.test('reusing a recipient name does not grant access to the offer', async () => {
    await prisma.user.create({ data: { id: 'eve', name: 'eve' } });
    await prisma.workspaceMember.create({ data: { userId: 'eve', workspaceId: 'w' } });
    const eve = context('eve');
    const registration = await service.registerAgent(eve, service.registrationSchema.parse({ name: 'temporary' }));
    const row = await original(), pending = await offer(row, { toAgent: 'temporary', content: 'private identity-bound text' });
    await act(eve, pending, 'temporary', 'accept');
    await prisma.agentRegistration.delete({ where: { id: registration.id } });
    await service.registerAgent(carol, service.registrationSchema.parse({ name: 'temporary' }));
    assert.equal((await service.listTransferOffers(carol, service.transferOfferListSchema.parse({ agent: 'temporary', status: 'accepted' }))).items.some(x => x.id === pending.id), false);
    await assert.rejects(act(carol, pending, 'temporary', 'accept'), e => e.code === 'offer_not_found');
    assert.equal(JSON.stringify(await service.agentInbox(carol, service.inboxSchema.parse({ agent: 'temporary' }))).includes(pending.content), false);
  });

  await t.test('sender, recipient and workspace owner can retrieve accepted text', async () => {
    const row = await service.sendHandoff(bob, service.sendSchema.parse({ agent: 'bob', issue: 'w-1', content: 'Owned task', toAgents: ['bob'] }));
    await service.actOnHandoff(bob, row.id, service.actionSchema.parse({ agent: 'bob', action: 'claim' }));
    const pending = await service.createTransferOffer(bob, service.transferOfferSchema.parse({ agent: 'bob', handoffId: row.id, toAgent: 'carol', requestId: randomUUID(), content: 'private transfer' }));
    await act(carol, pending, 'carol', 'accept');
    for (const [ctx, agent] of [[alice, 'alice'], [bob, 'bob'], [carol, 'carol']]) {
      const result = await service.listTransferOffers(ctx, service.transferOfferListSchema.parse({ agent, status: 'accepted' }));
      assert.equal(result.items.find(x => x.id === pending.id).content, pending.content);
    }
  });

  await t.test('offer is invisible to legacy inbox; acceptance is atomic and idempotent', async () => {
    const row = await original(), requestId = randomUUID();
    const pending = await offer(row, { requestId });
    assert.equal((await offer(row, { requestId })).id, pending.id);
    await assert.rejects(offer(row, { requestId, content: 'changed' }), e => e.code === 'request_conflict');
    assert.equal((await parent(row)).status, 'claimed');
    assert.equal((await service.agentInbox(bob, service.inboxSchema.parse({ agent: 'bob' }))).items.some(x => x.id === pending.id), false);
    assert.equal((await service.listTransferOffers(bob, service.transferOfferListSchema.parse({ agent: 'bob' }))).items.some(x => x.id === pending.id), true);
    const http = load('src/lib/agent-handoff-http.ts', { './agent-handoffs': service, zod: require('zod'), 'next/server': { NextResponse: Response } }, { Buffer });
    for (const action of ['complete', 'release']) {
      const response = await http.handoffResponse(() => service.actOnHandoff(alice, row.id, service.actionSchema.parse({ agent: 'alice', action, content: 'end' })));
      assert.equal(response.status, 409); assert.equal((await response.json()).error, 'transfer_offer_pending');
    }
    const pass = await http.handoffResponse(() => service.sendHandoff(alice, service.sendSchema.parse({ agent: 'alice', issue: 'w-1', content: 'legacy pass', toAgents: ['bob'], afterId: row.id })));
    assert.equal(pass.status, 409); assert.equal((await pass.json()).error, 'transfer_offer_pending');
    await assert.rejects(prisma.user.delete({ where: { id: 'alice' } }), undefined, 'claimant deletion cannot silently remove ownership');
    assert.equal((await parent(row)).status, 'claimed');
    const results = await Promise.all([act(bob, pending, 'bob', 'accept'), act(bob, pending, 'bob', 'accept')]);
    assert.equal(results[0].handoff.id, results[1].handoff.id);
    assert.equal((await parent(row)).status, 'completed');
    assert.equal(results[0].handoff.status, 'claimed');
    assert.equal(results[0].handoff.claimedById, (await prisma.agentRegistration.findUnique({ where: { workspaceId_name: { workspaceId: 'w', name: 'bob' } } })).id);
    assert.equal(await prisma.agentHandoff.count({ where: { afterId: row.id } }), 1);
    assert.equal((await offer(row, { requestId })).status, 'accepted', 'send retry recovers the accepted result without a second transfer');
  });

  await t.test('offer retry remains identifiable after recipient deletion', async () => {
    const row = await original(), requestId = randomUUID();
    const pending = await offer(row, { toAgent: 'dave', requestId });
    await prisma.user.delete({ where: { id: 'dave' } });
    const retried = await offer(row, { toAgent: 'dave', requestId });
    assert.equal(retried.id, pending.id); assert.equal(retried.recipientId, null);
    await assert.rejects(offer(row, { toAgent: 'bob', requestId }), e => e.code === 'request_conflict');
    assert.equal((await parent(row)).status, 'claimed');
    await act(alice, pending, 'alice', 'cancel');
  });

  await t.test('only authorized recipient accepts; lost access keeps owner claimed', async () => {
    const row = await original(), pending = await offer(row);
    await assert.rejects(act(carol, pending, 'carol', 'accept'), e => e.code === 'offer_not_found');
    await assert.rejects(act(foreign, pending, 'outsider', 'accept'), e => e.code === 'offer_not_found');
    await assert.rejects(act(context('bob', 'w', ['issues:read']), pending, 'bob', 'accept'), e => e.code === 'insufficient_scope');
    await assert.rejects(act(context('bob', 'w', ['issues:write']), pending, 'bob', 'accept'), e => e.code === 'insufficient_scope');
    await prisma.workspaceMember.updateMany({ where: { userId: 'bob', workspaceId: 'w' }, data: { status: false } });
    await assert.rejects(act(bob, pending, 'bob', 'accept'), e => e.code === 'offer_not_found');
    assert.equal((await parent(row)).status, 'claimed');
    await prisma.workspaceMember.updateMany({ where: { userId: 'bob', workspaceId: 'w' }, data: { status: true } });
    await act(alice, pending, 'alice', 'cancel');
    assert.equal((await parent(row)).status, 'claimed');
    await service.actOnHandoff(alice, row.id, service.actionSchema.parse({ agent: 'alice', action: 'complete', content: 'done' }));
  });

  await t.test('recipient or authenticated workspace owner can cancel without transferring ownership', async () => {
    const first = await original(), pending = await offer(first);
    await assert.rejects(act(carol, pending, 'carol', 'cancel'), e => e.code === 'offer_not_found');
    await act(bob, pending, 'bob', 'cancel');
    assert.equal((await parent(first)).status, 'claimed');
    const second = await service.sendHandoff(bob, service.sendSchema.parse({ agent: 'bob', issue: 'w-1', content: 'Bob owns this', toAgents: ['bob'], requestId: randomUUID() }));
    await service.actOnHandoff(bob, second.id, service.actionSchema.parse({ agent: 'bob', action: 'claim' }));
    const transfer = await service.createTransferOffer(bob, service.transferOfferSchema.parse({ agent: 'bob', handoffId: second.id, toAgent: 'carol', requestId: randomUUID(), content: 'Take over' }));
    await prisma.workspaceMember.updateMany({ where: { userId: 'bob', workspaceId: 'w' }, data: { status: false } });
    await assert.rejects(act(bob, transfer, 'bob', 'cancel'), e => e.code === 'offer_not_found');
    assert.ok((await service.listTransferOffers(alice, service.transferOfferListSchema.parse({ agent: 'alice' }))).items.some(x => x.id === transfer.id));
    await assert.rejects(act(foreign, transfer, 'outsider', 'cancel'), e => e.code === 'offer_not_found');
    await act(alice, transfer, 'alice', 'cancel');
    assert.equal((await parent(second)).status, 'claimed');
    assert.equal((await parent(second)).claimedById, (await prisma.agentRegistration.findUnique({ where: { workspaceId_name: { workspaceId: 'w', name: 'bob' } } })).id);
    await prisma.workspaceMember.updateMany({ where: { userId: 'bob', workspaceId: 'w' }, data: { status: true } });
  });

  await t.test('concurrent accept and cancel have one result and never duplicate custody', async () => {
    const row = await original(), pending = await offer(row);
    const settled = await Promise.allSettled([act(bob, pending, 'bob', 'accept'), act(alice, pending, 'alice', 'cancel')]);
    assert.equal(settled.filter(x => x.status === 'fulfilled').length, 1);
    const saved = await prisma.agentTransferOffer.findUniqueOrThrow({ where: { id: pending.id } });
    const prior = await parent(row);
    if (saved.status === 'cancelled') { assert.equal(prior.status, 'claimed'); assert.equal(saved.acceptedHandoffId, null); }
    else { assert.equal(saved.status, 'accepted'); assert.equal(prior.status, 'completed'); assert.equal(await prisma.agentHandoff.count({ where: { afterId: row.id, status: 'claimed' } }), 1); }
  });

  await t.test('concurrent second offer and acceptance never deadlock or create a duplicate', async () => {
    const row = await original(), pending = await offer(row);
    let releaseLock, locked;
    const haveLock = new Promise(resolve => { locked = resolve; });
    const continueHold = new Promise(resolve => { releaseLock = resolve; });
    const hold = prisma.$transaction(async db => {
      await db.$queryRaw`SELECT id FROM "AgentRegistration" WHERE "workspaceId" = 'w' AND name = 'alice' FOR UPDATE`;
      locked(); await continueHold;
    });
    await haveLock;
    const competing = offer(row).then(value => ({ value }), error => ({ error }));
    try {
      await waitForLock('AgentRegistration');
      const acceptance = act(bob, pending, 'bob', 'accept');
      await waitForLockCount(2);
      releaseLock(); await hold;
      const [accepted, other] = await Promise.all([acceptance, competing]);
      assert.equal(accepted.handoff.status, 'claimed');
      assert.ok(['claim_required', 'offer_pending'].includes(other.error?.code));
    } finally { releaseLock(); await hold; }
    assert.equal(await prisma.agentHandoff.count({ where: { afterId: row.id } }), 1);
  });

  await t.test('unauthorized same-workspace callers do not lock another agent', async () => {
    const foreignTask = await service.sendHandoff(carol, service.sendSchema.parse({ agent: 'carol', issue: 'w-1', content: 'Carol owns this', toAgents: ['alice', 'carol'] }));
    await service.actOnHandoff(carol, foreignTask.id, service.actionSchema.parse({ agent: 'carol', action: 'claim' }));
    let releaseLock, locked;
    const haveLock = new Promise(resolve => { locked = resolve; });
    const continueHold = new Promise(resolve => { releaseLock = resolve; });
    const hold = prisma.$transaction(async db => {
      await db.$queryRaw`SELECT id FROM "AgentRegistration" WHERE "workspaceId" = 'w' AND name = 'bob' FOR UPDATE`;
      locked(); await continueHold;
    });
    await haveLock;
    const quick = async promise => Promise.race([promise.then(() => 'unexpected', error => error.code),
      new Promise(resolve => setTimeout(() => resolve('blocked'), 1000))]);
    try {
      const borrowedName = service.transferOfferSchema.parse({ agent: 'bob', handoffId: foreignTask.id, toAgent: 'carol', content: 'x', requestId: randomUUID() });
      assert.equal(await quick(service.createTransferOffer(alice, borrowedName)), 'agent_not_found');
      const notOwner = service.transferOfferSchema.parse({ agent: 'alice', handoffId: foreignTask.id, toAgent: 'bob', content: 'x', requestId: randomUUID() });
      assert.equal(await quick(service.createTransferOffer(alice, notOwner)), 'claim_required');
    } finally { releaseLock(); await hold; }
  });

  await t.test('membership revocation that commits first prevents acceptance', async () => {
    const row = await original(), pending = await offer(row);
    let releaseLock, locked;
    const haveLock = new Promise(resolve => { locked = resolve; });
    const continueRevocation = new Promise(resolve => { releaseLock = resolve; });
    const revoke = prisma.$transaction(async db => {
      await db.$queryRaw`SELECT id FROM "WorkspaceMember" WHERE "workspaceId" = 'w' AND "userId" = 'bob' FOR UPDATE`;
      locked(); await continueRevocation;
      await db.workspaceMember.updateMany({ where: { userId: 'bob', workspaceId: 'w' }, data: { status: false } });
    });
    await haveLock;
    const attempt = act(bob, pending, 'bob', 'accept').then(() => 'accepted', error => error.code);
    try { await waitForLock('WorkspaceMember'); } finally { releaseLock(); }
    await revoke;
    assert.equal(await attempt, 'offer_not_found');
    assert.equal((await parent(row)).status, 'claimed');
    await act(alice, pending, 'alice', 'cancel');
    await prisma.workspaceMember.updateMany({ where: { userId: 'bob', workspaceId: 'w' }, data: { status: true } });
  });

  await t.test('HTTP routes apply their scope contracts and accept a paged CLI workspace query', async () => {
    const row = await original();
    const http = load('src/lib/agent-handoff-http.ts', { './agent-handoffs': service, zod: require('zod'), 'next/server': { NextResponse: Response } }, { Buffer });
    const captured = [];
    const auth = { withAppAuth: (fn, options) => { captured.push(options.requiredScopes); return fn; } };
    const routes = load('src/app/api/apps/auth/agents/transfer-offers/route.ts', {
      '@/lib/apps/auth-middleware': auth, '@/lib/agent-handoffs': service, '@/lib/agent-handoff-http': http,
    }, { URL });
    const detail = load('src/app/api/apps/auth/agents/transfer-offers/[id]/route.ts', {
      '@/lib/apps/auth-middleware': auth, '@/lib/agent-handoffs': service, '@/lib/agent-handoff-http': http,
    });
    assert.deepEqual(captured.map(x => Array.from(x)), [['issues:read'], ['issues:read', 'issues:write'], ['issues:read', 'issues:write']]);
    const body = { agent: 'alice', handoffId: row.id, toAgent: 'bob', requestId: randomUUID(), content: 'Ready for transfer' };
    const response = await routes.POST(new Request('https://example.test/api/apps/auth/agents/transfer-offers?workspaceId=w', { method: 'POST', body: JSON.stringify(body) }), alice);
    assert.equal(response.status, 200); const pending = await response.json();
    const listed = await routes.GET(new Request('https://example.test/api/apps/auth/agents/transfer-offers?workspaceId=w&agent=bob&limit=1'), bob);
    assert.equal(listed.status, 200); assert.equal(typeof (await listed.json()).hasMore, 'boolean');
    const accepted = await detail.PATCH(new Request('https://example.test', { method: 'PATCH', body: JSON.stringify({ agent: 'bob', action: 'accept' }) }), bob, { params: Promise.resolve({ id: pending.id }) });
    assert.equal(accepted.status, 200); assert.equal((await accepted.json()).handoff.status, 'claimed');
  });

  await t.test('old writer racing an offer cannot release the claim once offer wins', async () => {
    const row = await original();
    let releaseLock, locked;
    const haveLock = new Promise(resolve => { locked = resolve; });
    const continueOffer = new Promise(resolve => { releaseLock = resolve; });
    const tx = prisma.$transaction(async db => {
      await db.$queryRaw`SELECT id FROM "AgentHandoff" WHERE id = ${row.id} FOR UPDATE`;
      locked(); await continueOffer;
      const sender = await db.agentRegistration.findUniqueOrThrow({ where: { workspaceId_name: { workspaceId: 'w', name: 'alice' } } });
      const recipient = await db.agentRegistration.findUniqueOrThrow({ where: { workspaceId_name: { workspaceId: 'w', name: 'bob' } } });
      return db.agentTransferOffer.create({ data: { workspaceId: 'w', issueId: 'i-w', parentId: row.id, senderId: sender.id, recipientId: recipient.id, recipientName: recipient.name, requestId: randomUUID(), content: 'pending' } });
    });
    await haveLock;
    const legacy = prisma.agentHandoff.updateMany({ where: { id: row.id, status: 'claimed' }, data: { status: 'open', claimedById: null } });
    // Start the old write before committing the offer; it must wait for the row lock.
    const raced = legacy.then(() => 'released', () => 'rejected');
    try { await waitForLock('AgentHandoff'); } finally { releaseLock(); }
    const pending = await tx;
    assert.equal(await raced, 'rejected');
    assert.equal((await parent(row)).status, 'claimed');
    await act(alice, pending, 'alice', 'cancel');
  });

  await t.test('deleting a non-owner claimant is refused until the offer is cancelled', async () => {
    const row = await service.sendHandoff(bob, service.sendSchema.parse({ agent: 'bob', issue: 'w-1', content: 'Bob owns this', toAgents: ['bob'], requestId: randomUUID() }));
    await service.actOnHandoff(bob, row.id, service.actionSchema.parse({ agent: 'bob', action: 'claim' }));
    const pending = await service.createTransferOffer(bob, service.transferOfferSchema.parse({ agent: 'bob', handoffId: row.id, toAgent: 'carol', requestId: randomUUID(), content: 'Transfer' }));
    await assert.rejects(prisma.user.delete({ where: { id: 'bob' } }), error => String(error.message).includes('Pending transfer offer must be accepted or cancelled'));
    assert.equal((await parent(row)).status, 'claimed');
    assert.equal((await prisma.agentTransferOffer.findUniqueOrThrow({ where: { id: pending.id } })).status, 'pending');
    await act(alice, pending, 'alice', 'cancel');
    await prisma.user.delete({ where: { id: 'bob' } });
    assert.equal((await parent(row)).status, 'claimed');
    assert.equal((await parent(row)).claimedById, null, 'account deletion does not prove prior work stopped');
  });
});
