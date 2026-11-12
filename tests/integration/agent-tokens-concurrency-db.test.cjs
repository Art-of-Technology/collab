const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir, userInfo } = require('node:os');
const { join, resolve } = require('node:path');
const { execFileSync } = require('node:child_process');
const { setTimeout: sleep } = require('node:timers/promises');
const { PrismaClient } = require('@prisma/client');
const { load } = require('../security/helpers.cjs');

// Socket-only temporary PostgreSQL; never an application DB. The locks in src/lib/agent-tokens.ts only mean
// something against real transactions, so these cases run the real code against a real database.
test('agent token lifecycle stays consistent under concurrent requests', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'collab-agent-tokens-'));
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

  await prisma.user.create({ data: { id: 'alice', name: 'Alice' } });
  await prisma.app.create({ data: { id: 'agent-app', name: 'Collab agent tokens', slug: 'collab-agent', publisherId: 'system', status: 'PUBLISHED', visibility: 'PRIVATE', isSystemApp: true,
    scopes: { create: ['issues:read', 'issues:write'].map(scope => ({ scope })) } } });
  const lib = load('src/lib/agent-tokens.ts', {
    crypto: require('node:crypto'), '@/lib/prisma': { prisma },
    // Synthetic tokens only: persistence and locking are under test, not encryption.
    '@/lib/apps/crypto': { encryptToken: async value => Buffer.from(value) },
  }, { Buffer });
  let workspaces = 0;
  const workspace = async () => (await prisma.workspace.create({ data: { name: `Work ${++workspaces}`, slug: `work-${workspaces}`, ownerId: 'alice' }, select: { id: true } })).id;
  const mint = (workspaceId, name = 'Claude') => lib.createAgentToken({ workspaceId, actorId: 'alice', name, access: 'write', expiresInDays: 90 });
  const revoke = (workspaceId, tokenId) => lib.revokeAgentToken({ workspaceId, actorId: 'alice', tokenId });
  const allow = (workspaceId, tokenId, targetWorkspaceId, allowed = true) => lib.setAgentWorkspaceAccess({ workspaceId, actorId: 'alice', tokenId, targetWorkspaceId, allowed });
  const accounts = async workspaceId => [...new Set((await prisma.appToken.findMany({ where: { workspaceId, appId: 'agent-app' }, select: { userId: true } })).map(row => row.userId))];
  const member = (workspaceId, userId) => prisma.workspaceMember.findUnique({ where: { userId_workspaceId: { userId, workspaceId } } });

  await t.test('simultaneous mints of one new name create one account', async () => {
    const w = await workspace();
    const minted = await Promise.all(Array.from({ length: 8 }, (_, i) => mint(w, i % 2 ? '  claude ' : 'Claude')));
    assert.equal(minted.filter(result => result.token).length, 8);
    const [account, ...others] = await accounts(w);
    assert.deepEqual(others, [], 'every token belongs to the same service account');
    assert.equal(await prisma.user.count({ where: { name: { in: ['Claude', 'claude'] } } }), 1);
    assert.equal((await member(w, account)).status, true);
    assert.equal(await prisma.appAuditLog.count({ where: { workspaceId: w, action: 'agent_token.created' } }), 8);
  });

  await t.test('simultaneous revocations of the last two tokens leave the account switched off', async () => {
    const w = await workspace();
    const first = await mint(w, 'Pair'), second = await mint(w, 'Pair');
    assert.deepEqual(await Promise.all([revoke(w, first.id), revoke(w, second.id)]), [true, true]);
    const [account] = await accounts(w);
    assert.equal((await member(w, account)).status, false);
  });

  await t.test('simultaneous revocations of one token succeed once', async () => {
    const w = await workspace();
    const { id } = await mint(w, 'Once');
    const results = await Promise.all(Array.from({ length: 6 }, () => revoke(w, id)));
    assert.equal(results.filter(Boolean).length, 1);
    assert.equal(await prisma.appAuditLog.count({ where: { workspaceId: w, action: 'agent_token.revoked' } }), 1);
  });

  await t.test('a mint that overlaps an admin switching the account off cannot switch it back on', async () => {
    const w = await workspace();
    await mint(w, 'Paused');
    const [account] = await accounts(w);
    // The pause holds the member row until it commits; the mint starts while it is still open.
    const pause = prisma.$transaction(async tx => {
      await tx.workspaceMember.update({ where: { userId_workspaceId: { userId: account, workspaceId: w } }, data: { status: false } });
      await sleep(400);
    }, { timeout: 10_000 });
    await sleep(100);
    const overlapping = await mint(w, 'Paused');
    await pause;
    assert.equal(overlapping.error, 'paused');
    assert.equal((await member(w, account)).status, false, 'the pause stands');
    assert.equal(await prisma.appToken.count({ where: { workspaceId: w, appId: 'agent-app' } }), 1, 'no second token was issued');
  });

  await t.test('an account that was switched off or removed is not revived while it has usable tokens', async () => {
    for (const stop of ['off', 'removed']) {
      const w = await workspace();
      const old = await mint(w, 'Stopped');
      const [account] = await accounts(w);
      const key = { userId_workspaceId: { userId: account, workspaceId: w } };
      if (stop === 'off') await prisma.workspaceMember.update({ where: key, data: { status: false } });
      else await prisma.workspaceMember.delete({ where: key });
      assert.equal((await mint(w, 'Stopped')).error, 'paused', stop);
      assert.notEqual((await member(w, account))?.status, true, stop);

      // Once its tokens are revoked nothing can be revived by accident, so the name can be used again.
      assert.equal(await revoke(w, old.id), true);
      const fresh = await mint(w, 'Stopped');
      assert.ok(fresh.token, stop);
      assert.deepEqual(await accounts(w), [account], 'the same account is reused');
      assert.equal((await member(w, account)).status, true);
    }
  });

  await t.test('an agent let into a second workspace is switched off everywhere with its last token', async () => {
    const home = await workspace(), other = await workspace();
    const first = await mint(home, 'Roamer');
    const [account] = await accounts(home);
    assert.equal(await allow(home, first.id, other), true);
    assert.equal(await allow(home, first.id, other), true, 'giving it twice changes nothing');
    assert.equal(await allow(home, first.id, other, false), true);
    assert.equal((await member(other, account)).status, false);
    assert.equal(await allow(home, first.id, other, false), false, 'nothing left to take away');
    assert.equal(await allow(home, first.id, other), true);
    assert.equal((await member(other, account)).status, true);
    assert.deepEqual((await lib.listAgentTokens(home))[0].workspaces.map(row => row.id), [other]);
    assert.equal(await allow(other, first.id, home), false, 'the token is not of that workspace');

    assert.equal(await revoke(home, first.id), true);
    assert.equal((await member(home, account)).status, false);
    assert.equal((await member(other, account)).status, false);
    const fresh = await mint(home, 'Roamer');
    assert.deepEqual(await accounts(home), [account], 'the same account is reused');
    assert.equal((await member(home, account)).status, true);
    assert.equal((await member(other, account)).status, false, 'a new token does not bring the other workspace back');
    assert.deepEqual((await lib.listAgentTokens(home))[0].workspaces, []);
    assert.equal(await prisma.appAuditLog.count({ where: { workspaceId: other, action: { in: ['agent_token.workspace_added', 'agent_token.workspace_removed'] } } }), 4, 'one record per change');
  });

  await t.test('letting an agent into a workspace while its last token is being revoked does not switch it on', async () => {
    const home = await workspace(), other = await workspace();
    const { id } = await mint(home, 'Racer');
    const [account] = await accounts(home);
    // What a revocation does, held open: the grant starts while the token still reads as usable.
    const revoking = prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${account} FOR UPDATE`;
      await tx.appToken.updateMany({ where: { id }, data: { isRevoked: true, revokedAt: new Date() } });
      await tx.workspaceMember.updateMany({ where: { userId: account }, data: { status: false } });
      await sleep(400);
    }, { timeout: 10_000 });
    await sleep(100);
    const overlapping = await allow(home, id, other);
    await revoking;
    assert.equal(overlapping, false);
    assert.equal(await member(other, account), null, 'no membership was created');
  });

  await t.test('concurrent member status changes do not create false transition audits', async () => {
    for (const operation of ['remove', 'revoke', 'mint', 'grant']) {
      const home = await workspace(), other = await workspace();
      const first = await mint(home, `Transition ${operation}`);
      const [account] = await accounts(home);
      await allow(home, first.id, other);
      if (operation === 'mint') await prisma.appToken.update({ where: { id: first.id }, data: { tokenExpiresAt: new Date(0) } });
      const key = { userId_workspaceId: { userId: account, workspaceId: other } };
      if (operation === 'grant') await prisma.workspaceMember.update({ where: key, data: { status: false, role: 'ADMIN' } });
      const before = await prisma.appAuditLog.count({ where: { workspaceId: other } });
      const changing = prisma.$transaction(async tx => {
        await tx.workspaceMember.update({ where: key, data: { status: operation === 'grant' } });
        await sleep(400);
      }, { timeout: 10_000 });
      await sleep(100);
      const result = operation === 'remove' ? await allow(home, first.id, other, false)
        : operation === 'revoke' ? await revoke(home, first.id)
        : operation === 'mint' ? await mint(home, `Transition ${operation}`)
        : await allow(home, first.id, other);
      await changing;
      if (operation === 'remove') assert.equal(result, false);
      if (operation === 'grant') {
        assert.equal(result, true);
        assert.equal((await member(other, account)).role, 'ADMIN');
      }
      assert.equal(await prisma.appAuditLog.count({ where: { workspaceId: other } }), before, operation);
    }
  });
});
