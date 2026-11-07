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
  const { databaseDiagnosticsExtension, withTransactionDiagnostics } = load('src/lib/database-diagnostics.ts', {}, {
    performance,
    setTimeout: fn => { timers.push(fn); return { unref() {} }; },
    console: { warn: (...values) => logs.push(values) },
  });
  const base = new PrismaClient({ datasources: { db: { url: url.href } } });
  const diagnostic = base.$extends(databaseDiagnosticsExtension);
  const { issueVisibilityExtension } = load('src/lib/issue-visibility.ts');
  const raw = withTransactionDiagnostics(diagnostic);
  const prisma = withTransactionDiagnostics(diagnostic.$extends(issueVisibilityExtension(Prisma.dmmf.datamodel.models)));
  let ready;
  const started = new Promise(resolve => { ready = resolve; });
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
    const held = raw.$transaction(async tx => { ready(); await tx.$queryRawUnsafe('SELECT 1 FROM pg_sleep(3)'); });
    await started;
    let entered = false;
    await assert.rejects(prisma.$transaction(async () => { entered = true; }, { maxWait: 500 }), error => error.code === 'P2028');
    assert.equal(entered, false);
    await assert.rejects(prisma.$queryRawUnsafe('SELECT 1'), error => error.code === 'P2024');
    await held;
    assert.equal(timers.length, 1);
    timers[0]();
    assert.equal(logs[0][1].poolTimeouts, 1);
    assert.equal(logs[0][1].transactionStartFailures, 1);
    assert.ok(logs[0][1].slowOperations >= 1);
    assert.doesNotMatch(JSON.stringify(logs), /pg_sleep|SELECT|postgres/);
  } finally {
    await base.$disconnect();
  }
});
