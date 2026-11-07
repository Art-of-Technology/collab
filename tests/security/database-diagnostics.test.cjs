const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers.cjs');

function fixture() {
  let clock = 0;
  const scheduled = [], logs = [];
  const { databaseDiagnosticsExtension, withTransactionDiagnostics } = load('src/lib/database-diagnostics.ts', {}, {
    performance: { now: () => clock },
    setTimeout: (fn, ms) => { const timer = { fn, ms, unref() {} }; scheduled.push(timer); return timer; },
    console: { warn: (...args) => logs.push(args) },
  });
  const run = databaseDiagnosticsExtension.query.$allOperations;
  return { scheduled, logs, run, withTransactionDiagnostics, setTime: value => { clock = value; } };
}

test('fast operations preserve arguments and return values without scheduling logs', async () => {
  const f = fixture(), args = { secret: 'private-value' }, result = { id: 1 };
  assert.equal(await f.run({ args, query: async value => { assert.equal(value, args); f.setTime(999); return result; } }), result);
  assert.equal(f.scheduled.length, 0);
});

test('aggregates slow operations and pool timeouts without query, error, or argument contents', async () => {
  const f = fixture(), error = Object.assign(new Error('private database detail'), { code: 'P2024', secret: 'private-value' });
  await f.run({ args: { secret: 'private-value' }, query: async () => { f.setTime(1000); return 1; } });
  await assert.rejects(f.run({ args: { secret: 'private-value' }, query: async () => { f.setTime(6500); throw error; } }), value => value === error);
  assert.equal(f.scheduled.length, 1);
  assert.equal(f.scheduled[0].ms, 60000);
  f.scheduled[0].fn();
  assert.deepEqual(JSON.parse(JSON.stringify(f.logs)), [['[database-diagnostics]', { slowOperations: 2, poolTimeoutOperations: 1, poolTimeoutTransactionStarts: 0, maxOperationMs: 5500, slowTransactionStarts: 0, transactionStartFailures: 0, maxTransactionStartMs: 0, windowMs: 60000 }]]);
  assert.doesNotMatch(JSON.stringify(f.logs), /private/);
  await f.run({ args: {}, query: async () => { f.setTime(7500); return true; } });
  assert.equal(f.scheduled.length, 2);
});

test('other errors and unusual error objects are rethrown unchanged', async () => {
  const f = fixture(), error = new Error('secret');
  await assert.rejects(f.run({ args: {}, query: async () => { throw error; } }), value => value === error);
  const strange = Object.defineProperty({}, 'code', { get() { throw new Error('getter failed'); } });
  await assert.rejects(f.run({ args: {}, query: async () => { throw strange; } }), value => value === strange);
  assert.equal(f.scheduled.length, 0);
});

test('errorCode timeout is counted even when the operation finishes quickly', async () => {
  const f = fixture(), error = { errorCode: 'P2024' };
  await assert.rejects(f.run({ args: {}, query: async () => { throw error; } }), value => value === error);
  f.scheduled[0].fn();
  assert.equal(f.logs[0][1].poolTimeoutOperations, 1);
  assert.equal(f.logs[0][1].slowOperations, 0);
});

test('interactive transaction retains callback arguments, options, receiver, and return value', async () => {
  const f = fixture(), tx = { identity: true }, options = { maxWait: 5000 }, result = { ok: true };
  const original = { async $transaction(callback, receivedOptions) {
    assert.equal(this, original); assert.equal(receivedOptions, options);
    f.setTime(1200); return callback(tx);
  } };
  const client = f.withTransactionDiagnostics(original);
  assert.equal(await client.$transaction(received => { assert.equal(received, tx); return result; }, options), result);
  f.scheduled[0].fn();
  assert.equal(f.logs[0][1].slowTransactionStarts, 1);
  assert.equal(f.logs[0][1].maxTransactionStartMs, 1200);
  assert.equal(f.logs[0][1].transactionStartFailures, 0);
});

test('transaction start failures are recorded once without claiming they are pool timeouts', async () => {
  const f = fixture(), error = Object.assign(new Error('sensitive transaction detail'), { code: 'P2028' });
  const client = f.withTransactionDiagnostics({ $transaction: async () => { f.setTime(500); throw error; } });
  let called = false;
  await assert.rejects(client.$transaction(() => { called = true; }), value => value === error);
  assert.equal(called, false);
  f.scheduled[0].fn();
  assert.equal(f.logs[0][1].transactionStartFailures, 1);
  assert.equal(f.logs[0][1].poolTimeoutOperations, 0);
  assert.equal(f.logs[0][1].poolTimeoutTransactionStarts, 0);
  assert.equal(f.logs[0][1].maxTransactionStartMs, 500);
  assert.doesNotMatch(JSON.stringify(f.logs), /sensitive/);
});

test('array transaction overload is passed through untouched', async () => {
  const f = fixture(), actions = [{ identity: 1 }], options = { isolationLevel: 'Serializable' }, result = Promise.resolve([1]);
  const original = { $transaction(received, receivedOptions) { assert.equal(this, original); assert.equal(received, actions); assert.equal(receivedOptions, options); return result; } };
  assert.equal(f.withTransactionDiagnostics(original).$transaction(actions, options), result);
  assert.equal(f.scheduled.length, 0);
});

test('a query timeout propagated out of a started transaction is not double counted', async () => {
  const f = fixture(), error = { code: 'P2024' };
  const original = { $transaction: async callback => callback({}) };
  const client = f.withTransactionDiagnostics(original);
  await assert.rejects(client.$transaction(async () => f.run({ args: {}, query: async () => { throw error; } })), value => value === error);
  f.scheduled[0].fn();
  assert.equal(f.logs[0][1].poolTimeoutOperations, 1);
  assert.equal(f.logs[0][1].poolTimeoutTransactionStarts, 0);
  assert.equal(f.logs[0][1].transactionStartFailures, 0);
});

test('independent P2024 failures remain separate at their observed boundaries', async () => {
  const f = fixture(), errors = [{ code: 'P2024' }, { code: 'P2024' }, { code: 'P2024' }];
  for (const error of errors.slice(0, 2)) {
    await assert.rejects(f.run({ args: {}, query: async () => { throw error; } }), value => value === error);
  }
  const client = f.withTransactionDiagnostics({ $transaction: async () => { throw errors[2]; } });
  await assert.rejects(client.$transaction(() => {}), value => value === errors[2]);
  f.scheduled[0].fn();
  assert.equal(f.logs[0][1].poolTimeoutOperations, 2);
  assert.equal(f.logs[0][1].poolTimeoutTransactionStarts, 1);
  assert.equal(f.logs[0][1].transactionStartFailures, 1);
});
