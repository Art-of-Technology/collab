const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir, userInfo } = require('node:os');
const { join, resolve } = require('node:path');
const { execFileSync } = require('node:child_process');
const { Prisma, PrismaClient } = require('@prisma/client');
const { load } = require('../security/helpers.cjs');

const directory = mkdtempSync(join(tmpdir(), 'collab-supersession-pg-'));
const bindir = execFileSync('pg_config', ['--bindir'], { encoding: 'utf8' }).trim();
let started = false, raw;
after(async () => {
  await raw?.$disconnect();
  if (started) execFileSync(join(bindir, 'pg_ctl'), ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'], { stdio: 'pipe' });
  rmSync(directory, { recursive: true, force: true });
});

test('supersession uses the production visibility guard and preserves ownership and atomicity', async () => {
  execFileSync(join(bindir, 'initdb'), ['-D', join(directory, 'data'), '-A', 'trust', '--no-locale', '-E', 'UTF8'], { stdio: 'pipe' });
  execFileSync(join(bindir, 'pg_ctl'), ['-D', join(directory, 'data'), '-l', join(directory, 'server.log'),
    '-o', `-k ${directory} -c listen_addresses='' -c fsync=off`, '-w', 'start'], { stdio: 'pipe' });
  started = true;
  const url = `postgresql://${encodeURIComponent(userInfo().username)}@localhost/postgres?host=${encodeURIComponent(directory)}`;
  execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'db', 'push', '--skip-generate', '--schema', resolve('prisma/schema.prisma')],
    { env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' });
  raw = new PrismaClient({ datasources: { db: { url } } });
  await raw.user.createMany({ data: [{ id: 'alice' }, { id: 'bob' }] });
  await raw.workspace.createMany({ data: ['alice', 'bob'].map(id => ({ id, name: id, slug: id, ownerId: id })) });
  await raw.project.create({ data: { id: 'p', workspaceId: 'alice', name: 'Project', slug: 'project', issuePrefix: 'TEST' } });
  await raw.issue.createMany({ data: ['one', 'two'].map(id => ({ id, workspaceId: 'alice', projectId: 'p', title: id, issueKey: id })) });
  const { issueVisibilityExtension } = load('src/lib/issue-visibility.ts');
  const prisma = raw.$extends(issueVisibilityExtension(Prisma.dmmf.datamodel.models));
  const service = load('src/lib/agent-handoffs.ts', { 'node:crypto': require('node:crypto'), zod: require('zod'),
    '@/lib/prisma': { prisma }, '@/lib/issue-finder': load('src/lib/issue-finder.ts', { '@/lib/prisma': { prisma } }),
    '@/lib/oauth-scopes': load('src/lib/oauth-scopes.ts') });
  const context = user => ({ user: { id: user }, workspace: { id: user }, token: { scopes: ['issues:read', 'issues:write', 'workspace:write'] } });
  const alice = context('alice'), bob = context('bob');
  for (const [ctx, name] of [[alice, 'lead'], [alice, 'worker'], [bob, 'outsider']]) {
    await service.registerAgent(ctx, service.registrationSchema.parse({ name }));
  }
  const send = (issue = 'one') => service.sendHandoff(alice, service.sendSchema.parse({ agent: 'lead', issue, content: 'Request', toAgents: ['worker'] }));
  const act = (target, action, agent = 'lead', replacement, ctx = alice) => service.actOnHandoff(ctx, target.id,
    service.actionSchema.parse({ agent, action, content: 'Result or rerouting reason', ...(replacement && { replacementId: replacement.id }) }));
  const old = await send(), replacement = await send();
  await act(replacement, 'claim', 'worker');
  await act(replacement, 'complete', 'worker');
  const done = await act(old, 'supersede', 'lead', replacement);
  assert.equal(done.status, 'superseded');
  assert.equal(done.supersededById, replacement.id);
  assert.equal((await act(old, 'supersede', 'lead', replacement)).id, old.id);
  assert.equal(await raw.issueActivity.count({ where: { action: 'AGENT_SUPERSEDED' } }), 1, 'retry does not duplicate history');
  assert.equal((await service.agentInbox(alice, service.inboxSchema.parse({ agent: 'worker' }))).items.some(h => h.id === old.id), false);
  assert.equal((await raw.agentHandoff.findUniqueOrThrow({ where: { id: replacement.id } })).status, 'completed');

  const claimed = await send();
  await act(claimed, 'claim', 'worker');
  const before = await raw.agentHandoff.findUniqueOrThrow({ where: { id: claimed.id } });
  await assert.rejects(act(claimed, 'supersede', 'lead', replacement), e => e.code === 'supersede_conflict');
  assert.deepEqual(await raw.agentHandoff.findUniqueOrThrow({ where: { id: claimed.id } }), before);
  assert.equal(await raw.issueActivity.count({ where: { action: 'AGENT_SUPERSEDED' } }), 1);
  assert.equal((await act(claimed, 'supersede', 'worker', replacement)).status, 'superseded');

  const a = await send(), b = await send(), otherIssue = await send('two');
  await assert.rejects(act(a, 'supersede', 'lead', a), e => e.code === 'invalid_replacement');
  await assert.rejects(act(a, 'supersede', 'lead', otherIssue), e => e.code === 'invalid_replacement');
  await assert.rejects(act(a, 'supersede', 'outsider', b, bob), e => e.code === 'handoff_not_found');
  await assert.rejects(act(a, 'supersede', 'lead', b, { ...alice, token: { scopes: ['issues:read'] } }), e => e.code === 'insufficient_scope');
  const race = await Promise.allSettled([act(a, 'supersede', 'lead', b), act(b, 'supersede', 'lead', a)]);
  assert.equal(race.filter(r => r.status === 'fulfilled').length, 1, 'concurrent replacements cannot form a cycle');
  assert.equal(race.find(r => r.status === 'rejected').reason.code, 'invalid_replacement');

  const hidden = await send('two');
  await raw.issue.update({ where: { id: 'two' }, data: { deletedAt: new Date() } });
  await assert.rejects(act(hidden, 'supersede', 'lead', otherIssue), e => e.code === 'handoff_not_found');
  assert.equal((await raw.agentHandoff.findUniqueOrThrow({ where: { id: hidden.id } })).status, 'open');
});
