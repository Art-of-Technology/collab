const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync, readFileSync } = require('node:fs');
const { tmpdir, userInfo } = require('node:os');
const { join, resolve } = require('node:path');
const { execFileSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { load } = require('../security/helpers.cjs');

// Same socket-only disposable PostgreSQL pattern as tests/search; no application DB.
const directory = mkdtempSync(join(tmpdir(), 'collab-handoffs-pg-'));
const bindir = execFileSync('pg_config', ['--bindir'], { encoding: 'utf8' }).trim();
let started = false, prisma;
after(async () => {
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
  // Exercise the additive migration itself against existing rows, rather than only db push.
  await prisma.$executeRawUnsafe('DROP TABLE "AgentReceipt", "AgentHandoff", "AgentRegistration"');
  await prisma.user.createMany({ data: ['alice', 'bob', 'outsider'].map(id => ({ id, name: id })) });
  await prisma.workspace.createMany({ data: [{ id: 'w', name: 'Work', slug: 'work', ownerId: 'alice' }, { id: 'foreign', name: 'Foreign', slug: 'foreign', ownerId: 'outsider' }] });
  await prisma.workspaceMember.create({ data: { workspaceId: 'w', userId: 'bob' } });
  await prisma.project.createMany({ data: ['w', 'foreign'].map(id => ({ id: `p-${id}`, workspaceId: id, name: id, slug: id, issuePrefix: id })) });
  await prisma.issue.createMany({ data: ['w', 'foreign'].map(id => ({ id: `i-${id}`, workspaceId: id, projectId: `p-${id}`, title: id, issueKey: `${id}-1` })) });
  await prisma.taskLabel.createMany({ data: ['w', 'foreign'].map(id => ({ id: `label-${id}`, workspaceId: id, name: 'backend', color: '#123456' })) });
  const migration = readFileSync(resolve('prisma/migrations/20261017000100_agent_handoffs/migration.sql'), 'utf8');
  for (const statement of migration.split(';').filter(s => s.trim())) await prisma.$executeRawUnsafe(statement);
  assert.equal(await prisma.issue.count(), 2, 'migration preserves existing work');
  const finder = load('src/lib/issue-finder.ts', { '@/lib/prisma': { prisma } });
  const service = load('src/lib/agent-handoffs.ts', { 'node:crypto': require('node:crypto'), zod: require('zod'),
    '@/lib/prisma': { prisma }, '@/lib/issue-finder': finder, '@/lib/oauth-scopes': load('src/lib/oauth-scopes.ts') });
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

  await t.test('names belong to users; subscriptions cannot reference foreign labels', async () => {
    await assert.rejects(register(bob, 'lead'), e => e.code === 'agent_name_taken');
    await assert.rejects(register(alice, 'bad', ['label-foreign']), e => e.code === 'invalid_labels');
    await assert.rejects(inbox(bob, 'worker-a'), e => e.code === 'agent_not_found');
    await assert.rejects(send({ issue: 'foreign-1' }), e => e.code === 'issue_not_found');
  });
  const requestId = randomUUID(), handoff = await send({ requestId, requestAck: true });
  await t.test('one durable request fans out and a retry does not duplicate work or history', async () => {
    assert.equal((await send({ requestId, requestAck: true })).id, handoff.id);
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
    assert.equal(event.kind, 'label_added');
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
  });

});
