const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir, userInfo } = require('node:os');
const { join, resolve } = require('node:path');
const { execFileSync } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');
const { load } = require('../security/helpers.cjs');

// Socket-only temporary PostgreSQL; never an application DB. The unique key and the row lock in
// src/lib/workspace-membership.ts only mean something against real transactions.
test('workspace membership changes against a real database', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'collab-membership-'));
  const bindir = execFileSync('pg_config', ['--bindir'], { encoding: 'utf8' }).trim();
  let started = false, prisma;
  t.after(async () => {
    await prisma?.$disconnect();
    if (started) execFileSync(join(bindir, 'pg_ctl'), ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'], { stdio: 'pipe' });
    rmSync(directory, { recursive: true, force: true });
  });
  execFileSync(join(bindir, 'initdb'), ['-D', join(directory, 'data'), '-A', 'trust', '--no-locale', '-E', 'UTF8'], { stdio: 'pipe' });
  execFileSync(join(bindir, 'pg_ctl'), ['-D', join(directory, 'data'), '-l', join(directory, 'server.log'), '-o', `-k ${directory} -c listen_addresses='' -c fsync=off -c max_connections=60`, '-w', 'start'], { stdio: 'pipe' });
  started = true;
  const url = `postgresql://${encodeURIComponent(userInfo().username)}@localhost/postgres?host=${encodeURIComponent(directory)}&connection_limit=20`;
  execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'db', 'push', '--skip-generate', '--schema', resolve('prisma/schema.prisma')], { env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' });
  prisma = new PrismaClient({ datasources: { db: { url } } });

  for (const [id, role] of [['root', 'SYSTEM_ADMIN'], ['alice', 'DEVELOPER'], ['bob', 'DEVELOPER'], ['frank', 'DEVELOPER']]) {
    await prisma.user.create({ data: { id, name: id, email: `${id}@example.test`, role } });
  }
  const workspace = (id, ownerId) => prisma.workspace.create({ data: { id, name: id, slug: id, ownerId } });
  await workspace('w1', 'alice'); await workspace('w2', 'alice'); await workspace('w3', 'root');
  await prisma.workspaceMember.create({ data: { userId: 'bob', workspaceId: 'w1', role: 'ADMIN' } });
  const { setWorkspaceMembership, membershipRows } = load('src/lib/workspace-membership.ts', {
    '@/lib/prisma': { prisma }, '@/lib/post-access': load('src/lib/post-access.ts'),
  });
  const set = (actorId, workspaceId, userId, active = true) => setWorkspaceMembership({ actorId, workspaceId, userId, active });
  const audits = workspaceId => prisma.appAuditLog.count({ where: { workspaceId } });

  await t.test('simultaneous first adds of one person make one membership and one record', async () => {
    const results = await Promise.all(Array.from({ length: 6 }, () => set('root', 'w3', 'frank')));
    assert.deepEqual(results.sort(), ['changed', 'unchanged', 'unchanged', 'unchanged', 'unchanged', 'unchanged']);
    assert.equal(await prisma.workspaceMember.count({ where: { userId: 'frank', workspaceId: 'w3' } }), 1);
    assert.equal(await audits('w3'), 1);
  });

  await t.test('an owner adds a colleague but not a stranger, and switching off keeps the role', async () => {
    assert.equal(await set('alice', 'w2', 'frank'), 'not_found', 'frank shares no workspace with alice');
    assert.equal(await set('alice', 'w2', 'bob'), 'changed');
    assert.equal(await set('alice', 'w1', 'bob', false), 'changed');
    assert.deepEqual(await prisma.workspaceMember.findUnique({ where: { userId_workspaceId: { userId: 'bob', workspaceId: 'w1' } }, select: { role: true, status: true } }), { role: 'ADMIN', status: false });
    assert.equal(await set('alice', 'w1', 'bob'), 'changed', 'he is not new to this workspace');
    assert.equal(await set('alice', 'w1', 'bob'), 'unchanged');
    assert.equal(await audits('w1'), 2);
    const rows = await membershipRows('bob', await prisma.workspace.findMany({ select: { id: true, name: true, slug: true, ownerId: true }, orderBy: { id: 'asc' } }));
    assert.deepEqual(rows.map(row => `${row.id}:${row.state}`), ['w1:on', 'w2:on', 'w3:off']);
    assert.equal((await membershipRows('alice', [{ id: 'w1', name: 'w1', slug: 'w1', ownerId: 'alice' }]))[0].state, 'owner');
  });
});
