const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir, userInfo } = require('node:os');
const { join, resolve } = require('node:path');
const { execFileSync } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');
const { isDeepStrictEqual } = require('node:util');
const { PrismaClient } = require('@prisma/client');
const { z } = require('zod');
const { load } = require('../security/helpers.cjs');

function gate() {
  let release;
  const promise = new Promise(resolve => { release = resolve; });
  return { promise, release };
}

function pauseTransaction(prisma, queryNumber, entered, resume) {
  return new Proxy(prisma, { get(target, key) {
    if (key !== '$transaction') return target[key];
    return fn => target.$transaction(tx => {
      let queries = 0;
      return fn(new Proxy(tx, { get(transaction, name) {
        if (name !== '$queryRaw') return transaction[name];
        return async (...args) => {
          const result = await transaction.$queryRaw(...args);
          if (++queries === queryNumber) { entered.release(); await resume.promise; }
          return result;
        };
      } }));
    }, { timeout: 15000 });
  } });
}

function interceptEdit(prisma, { entered, resume, fail } = {}) {
  return new Proxy(prisma, { get(target, key) {
    if (key !== '$transaction') return target[key];
    return fn => target.$transaction(tx => fn(new Proxy(tx, { get(transaction, name) {
      if (name === 'appVersion' && entered) return new Proxy(transaction.appVersion, { get(model, method) {
        if (method !== 'update') return model[method];
        return async (...args) => { const result = await model.update(...args); entered.release(); await resume.promise; return result; };
      } });
      if (name === 'appOAuthClient' && fail) return new Proxy(transaction.appOAuthClient, { get(model, method) {
        if (method !== 'updateMany') return model[method];
        return async () => { throw new Error('injected OAuth update failure'); };
      } });
      return transaction[name];
    } })), { timeout: 15000 });
  } });
}

test('approval serializes with deletion and manifest changes in PostgreSQL', { timeout: 90000 }, async t => {
  const directory = mkdtempSync(join(tmpdir(), 'collab-approval-'));
  const bindir = execFileSync('pg_config', ['--bindir'], { encoding: 'utf8' }).trim();
  let started = false, db;
  t.after(async () => {
    await db?.$disconnect();
    if (started) execFileSync(join(bindir, 'pg_ctl'), ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'], { stdio: 'pipe' });
    rmSync(directory, { recursive: true, force: true });
  });
  execFileSync(join(bindir, 'initdb'), ['-D', join(directory, 'data'), '-A', 'trust', '--no-locale', '-E', 'UTF8'], { stdio: 'pipe' });
  execFileSync(join(bindir, 'pg_ctl'), ['-D', join(directory, 'data'), '-l', join(directory, 'server.log'), '-o', `-k ${directory} -c listen_addresses='' -c fsync=off`, '-w', 'start'], { stdio: 'pipe' });
  started = true;
  const url = `postgresql://${encodeURIComponent(userInfo().username)}@localhost/postgres?host=${encodeURIComponent(directory)}`;
  execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'db', 'push', '--skip-generate', '--schema', resolve('prisma/schema.prisma')], { env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' });
  db = new PrismaClient({ datasources: { db: { url } } });
  const manifest = { scopes: ['issues:read'], oauth: { client_type: 'confidential', token_endpoint_auth_method: 'private_key_jwt', jwks_uri: 'https://example.test/jwks' } };
  const makeApp = (id, data = manifest) => db.app.create({ data: { id, slug: id, name: 'Reviewed', publisherId: 'admin', status: 'IN_REVIEW', versions: { create: { id: `${id}-version`, version: '1', manifest: data } } } });
  const dependencies = (prisma, validateJWKS = async () => ({ valid: true })) => ({
    'node:util': { isDeepStrictEqual }, zod: { z }, '@/lib/prisma': { prisma }, '@/lib/auth-options': { authOptions: {} },
    '@/lib/request-session': { getServerSession: async () => ({ user: { id: 'admin', role: 'SYSTEM_ADMIN' } }) },
    'next/server': { NextResponse: { json: (body, options = {}) => ({ body, status: options.status || 200 }) } },
    '@/lib/apps/jwks': { validateJWKS },
    '@/lib/apps/crypto': { generateClientCredentials: async () => ({ clientId: `client-${Math.random()}`, clientSecret: 'secret' }), encryptToken: async () => Buffer.from('encrypted') },
  });
  const approve = (id, prisma = db, validate) => load('src/app/api/apps/by-id/[id]/approve/route.ts', dependencies(prisma, validate), { console: { error() {} } }).POST({}, { params: Promise.resolve({ id }) });
  const remove = (id, prisma = db) => load('src/app/api/apps/[slug]/delete/route.ts', dependencies(prisma), { console: { error() {} } }).DELETE({}, { params: Promise.resolve({ slug: id }) });
  const edit = (id, prisma = db) => load('src/app/api/apps/by-id/[id]/versions/[versionId]/route.ts', dependencies(prisma), { console: { error() {}, log() {} } }).PATCH(
    { json: async () => ({ name: 'Changed', icon_url: 'https://example.test/icon', oauth: { redirect_uris: ['https://example.test/new'] } }) },
    { params: Promise.resolve({ id, versionId: `${id}-version` }) });
  const addClient = id => db.appOAuthClient.create({ data: { appId: id, clientId: `client-${id}`, redirectUris: ['https://example.test/old'], postLogoutRedirectUris: [] } });
  async function assertEditState(id, changed) {
    const app = await db.app.findUnique({ where: { id }, include: { versions: true, oauthClient: true } });
    assert.equal(app.name, changed ? 'Changed' : 'Reviewed');
    assert.equal(app.iconUrl, changed ? 'https://example.test/icon' : null);
    assert.equal(app.versions[0].manifest.name, changed ? 'Changed' : undefined);
    assert.equal(app.versions[0].manifest.icon_url, changed ? 'https://example.test/icon' : undefined);
    assert.deepEqual(app.versions[0].manifest.oauth.redirect_uris, changed ? ['https://example.test/new'] : undefined);
    assert.deepEqual(app.oauthClient.redirectUris, [changed ? 'https://example.test/new' : 'https://example.test/old']);
  }
  async function waitForLock() {
    for (let i = 0; i < 100; i++) {
      const rows = await db.$queryRaw`SELECT 1 FROM pg_stat_activity WHERE datname = current_database() AND cardinality(pg_blocking_pids(pid)) > 0`;
      if (rows.length) return;
      await delay(25);
    }
    assert.fail('concurrent operation did not wait for a PostgreSQL lock');
  }
  async function withPausedRoute(action, queryNumber, concurrent, check) {
    const entered = gate(), resume = gate();
    const running = action(pauseTransaction(db, queryNumber, entered, resume));
    let other;
    try {
      await entered.promise;
      other = Promise.resolve().then(concurrent);
      await waitForLock();
    } finally { resume.release(); }
    await check(await running, await other);
  }

  await t.test('deletion waits for approval and leaves no orphaned records', async () => {
    await makeApp('approval-first');
    await withPausedRoute(prisma => approve('approval-first', prisma), 1, () => remove('approval-first'), async (approved, deleted) => {
      assert.equal(approved.status, 200); assert.equal(deleted.status, 200);
      assert.equal(await db.app.findUnique({ where: { id: 'approval-first' } }), null);
      assert.equal(await db.appOAuthClient.count({ where: { appId: 'approval-first' } }), 0);
      assert.equal(await db.appScope.count({ where: { appId: 'approval-first' } }), 0);
    });
  });
  await t.test('approval waits for deletion and rejects the deleted snapshot', async () => {
    await makeApp('deletion-first');
    await withPausedRoute(prisma => remove('deletion-first', prisma), 1, () => approve('deletion-first'), async (deleted, approved) => {
      assert.equal(deleted.status, 200); assert.equal(approved.status, 409);
      assert.equal(await db.app.findUnique({ where: { id: 'deletion-first' } }), null);
      assert.equal(await db.appOAuthClient.count({ where: { appId: 'deletion-first' } }), 0);
    });
  });
  await t.test('manifest updates wait until approval finishes', async () => {
    await makeApp('manifest-lock');
    const changed = { ...manifest, scopes: ['issues:write'] };
    await withPausedRoute(prisma => approve('manifest-lock', prisma), 3,
      () => db.appVersion.update({ where: { id: 'manifest-lock-version' }, data: { manifest: changed } }), async (approved, version) => {
        assert.equal(approved.status, 200); assert.deepEqual(version.manifest, changed);
        assert.equal((await db.app.findUnique({ where: { id: 'manifest-lock' } })).status, 'DRAFT');
        assert.deepEqual((await db.appScope.findMany({ where: { appId: 'manifest-lock' } })).map(x => x.scope), ['issues:read']);
      });
  });
  await t.test('approval rejects the old snapshot while an edit commits atomically', async () => {
    const id = 'edit-first', entered = gate(), resume = gate();
    await makeApp(id); await addClient(id);
    const editing = edit(id, interceptEdit(db, { entered, resume }));
    let approving;
    try {
      await entered.promise;
      await assertEditState(id, false);
      approving = approve(id);
      await waitForLock();
    } finally { resume.release(); }
    assert.equal((await editing).status, 200);
    assert.equal((await approving).status, 409);
    await assertEditState(id, true);
    assert.equal((await approve(id)).status, 200);
    await assertEditState(id, true);
  });
  await t.test('an edit waits for approval and commits all related fields together', async () => {
    const id = 'approve-before-edit';
    await makeApp(id); await addClient(id);
    await withPausedRoute(prisma => approve(id, prisma), 1, () => edit(id), async (approved, edited) => {
      assert.equal(approved.status, 200); assert.equal(edited.status, 200);
      await assertEditState(id, true);
      assert.equal((await db.app.findUnique({ where: { id } })).status, 'DRAFT');
    });
  });
  await t.test('a failed OAuth update rolls back the entire version edit', async () => {
    const id = 'edit-rollback';
    await makeApp(id); await addClient(id);
    assert.equal((await edit(id, interceptEdit(db, { fail: true }))).status, 500);
    await assertEditState(id, false);
    assert.equal((await approve(id)).status, 200);
    await assertEditState(id, false);
  });
  await t.test('app and manifest changes during validation reject approval without writes', async () => {
    for (const field of ['name', 'manifest']) {
      const id = `stale-${field}`, entered = gate(), resume = gate();
      await makeApp(id);
      const running = approve(id, db, async () => { entered.release(); await resume.promise; return { valid: true }; });
      try {
        await entered.promise;
        if (field === 'name') await db.app.update({ where: { id }, data: { name: 'Changed' } });
        else await db.appVersion.update({ where: { id: `${id}-version` }, data: { manifest: { ...manifest, scopes: ['issues:write'] } } });
      } finally { resume.release(); }
      assert.equal((await running).status, 409);
      assert.equal((await db.app.findUnique({ where: { id } })).status, 'IN_REVIEW');
      assert.equal(await db.appOAuthClient.count({ where: { appId: id } }), 0);
      assert.equal(await db.appScope.count({ where: { appId: id } }), 0);
    }
  });
  await t.test('a failed approval rolls back status, client and scopes', async () => {
    const id = 'rollback';
    await makeApp(id, { ...manifest, scopes: ['duplicate', 'duplicate'] });
    assert.equal((await approve(id)).status, 500);
    assert.equal((await db.app.findUnique({ where: { id } })).status, 'IN_REVIEW');
    assert.equal(await db.appOAuthClient.count({ where: { appId: id } }), 0);
    assert.equal(await db.appScope.count({ where: { appId: id } }), 0);
  });
});
