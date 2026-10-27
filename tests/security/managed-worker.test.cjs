const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { load, matches } = require('./helpers.cjs');
const health = load('src/lib/managed-worker-health.ts');
function fixture() {
  const agents = [], handoffs = [{ id: 'h', workspaceId: 'w', recipientNames: ['worker'], labelIds: [], senderId: null, claimedById: null, status: 'open', issueId: 'i', issue: { id: 'i', workspaceId: 'w', projectId: 'p', project: { workspaceId: 'w' } } }];
  const activities = [];
  let clock = Date.now(), lock = Promise.resolve();
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } }
  const db = {
    $queryRaw: async () => [],
    $transaction: async fn => { const prior = lock; let release; lock = new Promise(resolve => { release = resolve; }); await prior; try { return await fn(db); } finally { release(); } },
    agentRegistration: {
      findUnique: async ({ where }) => agents.find(a => matches(a, where.workspaceId_name)),
      findFirst: async ({ where }) => agents.find(a => matches(a, where)),
      findMany: async ({ where }) => agents.filter(a => matches(a, where)),
      create: async ({ data }) => { const row = { id: randomUUID(), labelIds: [], managedWorker: null, ...data }; agents.push(row); return row; },
      update: async ({ where, data }) => Object.assign(agents.find(a => a.id === where.id), data),
      count: async ({ where }) => agents.filter(a => matches(a, where)).length,
    },
    agentHandoff: {
      count: async ({ where }) => handoffs.filter(a => matches(a, where)).length,
      findFirst: async ({ where }) => handoffs.find(a => matches(a, where)),
      findUnique: async ({ where }) => handoffs.find(a => a.sourceKey === where.workspaceId_sourceKey?.sourceKey),
      findUniqueOrThrow: async ({ where }) => handoffs.find(a => a.id === where.id),
      updateMany: async ({ where, data }) => { const rows = handoffs.filter(a => matches(a, where)); rows.forEach(row => Object.assign(row, data)); return { count: rows.length }; },
      create: async ({ data }) => { const row = { id: randomUUID(), ...data }; handoffs.push(row); return row; },
    },
    issue: { findFirst: async ({ where }) => matches(handoffs[0].issue, where) ? handoffs[0].issue : null },
    taskLabel: { count: async () => 0 },
    issueActivity: { create: async ({ data }) => { activities.push(data); return data; } },
    agentReceipt: { deleteMany: async () => {}, upsert: async () => {}, updateMany: async () => ({ count: 1 }) },
  };
  const service = load('src/lib/agent-handoffs.ts', { 'node:crypto': require('node:crypto'), zod: require('zod'), '@/lib/prisma': { prisma: db },
    '@/lib/issue-finder': { issueReadAccessWhere: user => user === 'owner' ? {} : { id: 'denied' } }, '@/lib/oauth-scopes': { hasScope: (scope, scopes) => scopes.includes(scope) },
    '@/lib/managed-worker-health': health }, { Date: Clock });
  const context = { user: { id: 'owner' }, workspace: { id: 'w' }, token: { scopes: ['workspace:write', 'issues:read', 'issues:write'] } };
  const binding = { agent: 'worker', host: 'laptop', sessionId: 'stable' };
  const manage = (event, generation, extra = {}, ctx = context) => service.manageWorker(ctx, service.workerSchema.parse({ ...binding, event, generation, ...extra }));
  const act = (action, generation, ctx = context) => service.actOnHandoff(ctx, 'h', service.actionSchema.parse({ agent: 'worker', action, generation, ...(['progress', 'complete', 'release'].includes(action) && { content: 'Evidence' }) }));
  return { db, service, context, agents, handoffs, activities, manage, act, expire: () => { clock += 61000; } };
}
test('managed generations fence missing/stale mutation paths and refuse expired takeover', async () => {
  const f = fixture(), first = randomUUID(), second = randomUUID();
  await f.manage('configure'); await f.manage('start', first);
  for (const action of ['claim', 'progress', 'release', 'complete', 'seen', 'ack']) for (const generation of [undefined, second]) await assert.rejects(f.act(action, generation), e => e.code === 'worker_fenced');
  await assert.rejects(f.service.sendHandoff(f.context, f.service.sendSchema.parse({ agent: 'worker', issue: 'i', afterId: 'h', toAgents: ['worker'], content: 'review' })), e => e.code === 'worker_fenced');
  await assert.rejects(f.manage('start', second), e => e.code === 'worker_fenced');
  assert.equal((await f.act('claim', first)).status, 'claimed');
  assert.equal((await f.act('claim', first)).status, 'claimed');
  await f.act('progress', first);
  f.expire();
  await assert.rejects(f.act('complete', first), e => e.code === 'worker_fenced');
  await assert.rejects(f.manage('start', second), e => e.code === 'worker_fenced');
  await f.manage('close', first);
  await f.manage('start', second);
  await assert.rejects(f.act('complete', first), e => e.code === 'worker_fenced');
  assert.equal((await f.act('complete', second)).status, 'completed');
});
test('managed own-user/workspace/scopes checks and explicit conversion preserve legacy agents', async () => {
  const f = fixture();
  f.agents.push({ id: 'a', name: 'worker', workspaceId: 'w', userId: 'owner', labelIds: [], managedWorker: null });
  assert.equal((await f.act('claim')).status, 'claimed');
  await assert.rejects(f.manage('configure'), e => e.code === 'worker_conversion_required');
  await f.act('release');
  await f.manage('configure', undefined, { convert: true });
  const generation = randomUUID(); await f.manage('start', generation);
  for (const ctx of [{ ...f.context, user: { id: 'other' } }, { ...f.context, workspace: { id: 'other' } }]) {
    await assert.rejects(f.manage('start', randomUUID(), {}, ctx));
    await assert.rejects(f.act('claim', generation, ctx), e => e.code === 'agent_not_found');
  }
  await assert.rejects(f.manage('renew', generation, {}, { ...f.context, token: { scopes: ['issues:read'] } }), e => e.code === 'insufficient_scope');
  await assert.rejects(f.service.registerAgent(f.context, { name: 'worker', labelIds: [] }), e => e.code === 'managed_agent');
});
test('concurrent starts admit only one generation; managed pass uses the fence', async () => {
  const f = fixture(); await f.manage('configure');
  const generations = [randomUUID(), randomUUID()];
  const outcomes = await Promise.allSettled(generations.map(id => f.manage('start', id)));
  assert.equal(outcomes.filter(r => r.status === 'fulfilled').length, 1);
  const generation = generations[outcomes.findIndex(r => r.status === 'fulfilled')];
  await f.act('claim', generation);
  const passed = await f.service.sendHandoff(f.context, f.service.sendSchema.parse({ agent: 'worker', generation, issue: 'i', afterId: 'h', content: 'Evidence for review', toAgents: ['worker'], requestId: randomUUID() }));
  assert.equal(passed.afterId, 'h'); assert.equal(f.handoffs[0].status, 'completed');
});
test('managed health distinguishes idle daemon, working child and expired lease without task leakage', () => {
  const state = { generation: randomUUID(), closed: false, state: 'idle', leaseUntil: new Date(Date.now() + 60000).toISOString(), taskId: 'private-task' };
  assert.equal(health.managedStatus(state).online, true);
  assert.equal(health.managedStatus(state).working, false);
  assert.equal(health.managedStatus(state).taskId, undefined);
  assert.equal(health.managedStatus({ ...state, state: 'working' }).working, true);
  assert.equal(health.managedStatus({ ...state, state: 'working', leaseUntil: new Date(0).toISOString() }).working, false);
});
test('worker HTTP endpoint validates input and retains mutation scope requirement', async () => {
  const f = fixture(); let required;
  const http = load('src/lib/agent-handoff-http.ts', { 'next/server': { NextResponse: Response }, zod: require('zod'), './agent-handoffs': f.service }, { Buffer });
  const route = load('src/app/api/apps/auth/agents/worker/route.ts', { '@/lib/apps/auth-middleware': { withAppAuth: (fn, options) => { required = options.requiredScopes; return fn; } }, '@/lib/agent-handoffs': f.service, '@/lib/agent-handoff-http': http });
  assert.deepEqual(Array.from(required), ['issues:write']);
  const request = body => new Request('https://example.test', { method: 'POST', body: JSON.stringify(body) });
  assert.equal((await route.POST(request({ agent: 'worker', host: 'laptop', sessionId: 'stable', event: 'configure' }), f.context)).status, 200);
  assert.equal((await route.POST(request({ agent: 'worker', host: 'laptop', sessionId: 'stable', event: 'start' }), f.context)).status, 400);
});

test('Prisma accepts the additive optional managed state while preserving agent uniqueness', async () => {
  const model = require('@prisma/client').Prisma.dmmf;
  const agent = model.datamodel.models.find(row => row.name === 'AgentRegistration');
  const field = agent.fields.find(row => row.name === 'managedWorker');
  assert.equal(field.type, 'Json'); assert.equal(field.isRequired, false);
  assert.ok(agent.uniqueFields.some(fields => fields.join(',') === 'workspaceId,name'));
  assert.ok(agent.uniqueFields.some(fields => fields.join(',') === 'workspaceId,userId,host,sessionId'));
});

test('launchd and Scheduled Task definitions parse into bounded per-user invocations', async () => {
  const { JSDOM } = require('jsdom');
  const { serviceDefinition } = await import('../../packages/cli/src/worker-service.mjs');
  const args = ['/trusted/worker & tool', 'worker', 'run', '--agent', 'a'];
  const mac = serviceDefinition('identity', args, '/repo & files', '/private state', { platform: 'darwin', home: '/user', uid: 501 });
  const document = new JSDOM(mac.content, { contentType: 'text/xml' }).window.document;
  assert.equal(document.querySelector('parsererror'), null);
  const entries = [...document.querySelector('plist > dict').children];
  const dictionary = new Map();
  for (let i = 0; i < entries.length; i += 2) dictionary.set(entries[i].textContent, entries[i + 1]);
  assert.deepEqual([...dictionary.get('ProgramArguments').children].map(value => value.textContent), args);
  assert.equal(dictionary.get('ThrottleInterval').textContent, '30');
  assert.equal(dictionary.get('KeepAlive').querySelector('false')?.tagName, 'false');
  const win = serviceDefinition('identity', args, '/repo', '/state', { platform: 'win32' });
  const task = new JSDOM(win.content, { contentType: 'text/xml' }).window.document;
  assert.equal(task.querySelector('Command').textContent, args[0]);
  assert.equal(task.querySelector('LogonType').textContent, 'InteractiveToken');
  assert.equal(task.querySelector('RunLevel').textContent, 'LeastPrivilege');
  assert.equal(task.querySelector('RestartOnFailure Count').textContent, '3');
  assert.equal(task.querySelector('MultipleInstancesPolicy').textContent, 'IgnoreNew');
});


test('configure enforces registration scopes on creation, subscriptions and manual conversion', async () => {
  for (const existing of ['absent', 'managed', 'manual']) for (const missing of ['workspace:write', 'issues:read', 'issues:write']) {
    const f = fixture();
    if (existing === 'managed') await f.manage('configure');
    if (existing === 'manual') f.agents.push({ id: 'a', name: 'worker', workspaceId: 'w', userId: 'owner', labelIds: [], managedWorker: null });
    const before = JSON.stringify(f.agents);
    const context = { ...f.context, token: { scopes: f.context.token.scopes.filter(scope => scope !== missing) } };
    await assert.rejects(f.manage('configure', undefined, { convert: true, labelIds: [] }, context), e => e.code === 'insufficient_scope');
    assert.equal(JSON.stringify(f.agents), before);
  }
  const f = fixture(); await f.manage('configure');
  const context = { ...f.context, token: { scopes: ['issues:write'] } }, generation = randomUUID();
  for (const event of ['start', 'renew', 'close']) await f.manage(event, generation, {}, context);
});

test('same-generation start and close retry safely but expired or closed generations never revive', async () => {
  const f = fixture(), generation = randomUUID();
  await f.manage('configure'); await f.manage('configure');
  await f.manage('start', generation); await f.manage('start', generation); await f.manage('renew', generation);
  f.expire();
  for (const event of ['start', 'renew']) await assert.rejects(f.manage(event, generation), e => e.code === 'worker_fenced');
  await f.manage('close', generation); await f.manage('close', generation);
  for (const event of ['start', 'renew']) await assert.rejects(f.manage(event, generation), e => e.code === 'worker_fenced');
  await f.manage('start', randomUUID());
});
