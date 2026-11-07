const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Prisma, PrismaClient } = require('@prisma/client');
const { load } = require('../security/helpers.cjs');

const databaseUrl = process.env.COLLAB_DIAGNOSTICS_TEST_DATABASE_URL;
test('real Prisma pool timeout is counted without changing query and transaction behavior', { skip: !databaseUrl }, async () => {
  const url = new URL(databaseUrl);
  url.searchParams.set('connection_limit', '1');
  url.searchParams.set('pool_timeout', '1');
  const logs = [], timers = [];
  const { databaseDiagnosticsExtension, instrumentDatabaseEngine, withTransactionDiagnostics } = load('src/lib/database-diagnostics.ts', {}, {
    performance,
    setTimeout: fn => { timers.push(fn); return { unref() {} }; },
    console: { warn: (...values) => logs.push(values) },
  });
  const base = new PrismaClient({ datasources: { db: { url: url.href } } });
  instrumentDatabaseEngine(base);
  const diagnostic = base.$extends(databaseDiagnosticsExtension);
  const { issueVisibilityExtension } = load('src/lib/issue-visibility.ts');
  const raw = withTransactionDiagnostics(diagnostic);
  const prisma = withTransactionDiagnostics(diagnostic.$extends(issueVisibilityExtension(Prisma.dmmf.datamodel.models)));
  let ready, release;
  const started = new Promise(resolve => { ready = resolve; });
  const released = new Promise(resolve => { release = resolve; });
  try {
    assert.deepEqual(await prisma.$queryRawUnsafe('SELECT 1 AS value'), [{ value: 1 }]);
    const array = await prisma.$transaction([prisma.$queryRawUnsafe('SELECT 1 AS value'), prisma.$queryRawUnsafe('SELECT 2 AS value')], { isolationLevel: 'ReadCommitted' });
    assert.deepEqual(array, [[{ value: 1 }], [{ value: 2 }]]);
    await prisma.$transaction(async tx => {
      await assert.rejects(tx.issue.delete({ where: { id: 'fixture' } }), /trash lifecycle/);
      assert.deepEqual(await tx.$queryRawUnsafe('SELECT 1 AS value'), [{ value: 1 }]);
    });
    const aborted = new Error('abort fixture');
    await assert.rejects(prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe('CREATE TEMP TABLE diagnostics_rollback_fixture (id integer)');
      throw aborted;
    }), error => error === aborted);
    assert.deepEqual(await prisma.$queryRawUnsafe("SELECT to_regclass('pg_temp.diagnostics_rollback_fixture')::text AS name"), [{ name: null }]);
    const held = raw.$transaction(async () => { ready(); await released; }, { timeout: 20000 });
    await started;
    try {
      let entered = false;
      await assert.rejects(prisma.$transaction(async () => { entered = true; }, { maxWait: 500 }), error => error.code === 'P2028');
      assert.equal(entered, false);
      await assert.rejects(prisma.$queryRawUnsafe('SELECT 1'), error => error.code === 'P2024');
      await assert.rejects(prisma.$transaction([
        prisma.$queryRawUnsafe('SELECT 1'), prisma.$queryRawUnsafe('SELECT 2'),
      ]), error => error.code === 'P2024');
      const batched = await Promise.allSettled([
        prisma.user.findUnique({ where: { id: 'one' } }),
        prisma.user.findUnique({ where: { id: 'two' } }),
      ]);
      for (const result of batched) {
        assert.equal(result.status, 'rejected');
        assert.equal(result.reason.code, 'P2024');
      }
      await assert.rejects(prisma.$queryRawUnsafe('SELECT 1'), error => error.code === 'P2024');
      assert.equal(timers.length, 1);
      timers[0]();
      assert.equal(logs[0][1].poolTimeoutOperations, 4);
      const independent = await Promise.allSettled([
        prisma.$queryRawUnsafe('SELECT 1'), prisma.$queryRawUnsafe('SELECT 2'),
      ]);
      for (const result of independent) {
        assert.equal(result.status, 'rejected');
        assert.equal(result.reason.code, 'P2024');
      }
    } finally {
      release();
      await held;
    }
    assert.equal(timers.length, 2);
    timers[1]();
    assert.equal(logs[1][1].poolTimeoutOperations, 2);
    assert.equal(logs[0][1].poolTimeoutTransactionStarts, 0);
    assert.equal(logs[0][1].transactionStartFailures, 1);
    assert.ok(logs[0][1].slowOperations >= 1);
    assert.doesNotMatch(JSON.stringify(logs), /pg_sleep|SELECT|postgres/);
  } finally {
    await base.$disconnect();
  }
});
