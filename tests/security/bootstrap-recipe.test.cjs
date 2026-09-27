const assert = require('node:assert/strict');
const { test } = require('node:test');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const root = path.resolve(__dirname, '../..');
const schemaSql = 'CREATE TABLE "GeneratedFixture" (id INTEGER);';

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'collab-bootstrap-recipe-'));
  for (const name of ['scripts', 'prisma/migrations']) fs.mkdirSync(path.join(dir, name), { recursive: true });
  fs.copyFileSync(path.join(root, 'scripts/bootstrap-empty-database.mjs'), path.join(dir, 'scripts/bootstrap-empty-database.mjs'));
  for (const name of ['schema.prisma', 'bootstrap-contract.json']) fs.copyFileSync(path.join(root, 'prisma', name), path.join(dir, 'prisma', name));
  const contract = JSON.parse(fs.readFileSync(path.join(dir, 'prisma/bootstrap-contract.json'), 'utf8'));
  for (const { name } of contract.migrations) fs.cpSync(path.join(root, 'prisma/migrations', name), path.join(dir, 'prisma/migrations', name), { recursive: true });
  const capture = path.join(dir, 'calls.json'), loader = path.join(dir, 'intercept.cjs');
  fs.writeFileSync(loader, `
const fs = require('node:fs'), Module = require('node:module'), child = require('node:child_process');
const calls = [], originalLoad = Module._load, originalResolve = Module._resolveFilename;
Module._load = function(name, ...args) { if (name === 'prisma/package.json') return { version: process.env.FIXTURE_VERSION || '6.19.3' }; return originalLoad.call(this, name, ...args); };
Module._resolveFilename = function(name, ...args) { if (name === 'prisma/build/index.js') return '/fixture/prisma-cli.cjs'; return originalResolve.call(this, name, ...args); };
child.spawnSync = (command, args, options) => {
  calls.push({ command, args, input: options.input, pg: Object.fromEntries(Object.entries(options.env).filter(([key]) => key.startsWith('PG'))) });
  fs.writeFileSync(${JSON.stringify(capture)}, JSON.stringify(calls));
  if (command === 'psql' && ['ENOENT', 'ETIMEDOUT'].includes(process.env.FIXTURE_PSQL)) return { status: null, stdout: null, stderr: null, error: { code: process.env.FIXTURE_PSQL } };
  if (command === 'psql') return { status: process.env.FIXTURE_PSQL === 'lost' ? 74 : process.env.FIXTURE_PSQL === 'nonempty' ? 1 : 0, stderr: process.env.FIXTURE_PSQL === 'nonempty' ? 'COLLAB_BOOTSTRAP_DATABASE_NOT_EMPTY' : '' };
  if (args[2] === 'diff') return { status: process.env.FIXTURE_DIFF === 'fail' ? 1 : 0, stdout: ${JSON.stringify(schemaSql)} };
  if (args[2] === 'resolve') return { status: process.env.FIXTURE_RESOLVE === 'fail' ? 1 : 0 };
  throw new Error('Unexpected process');
};
Module.syncBuiltinESMExports();
`);
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const run = (env = {}, args = ['--empty-database-only']) => {
    fs.rmSync(capture, { force: true });
    const result = spawnSync(process.execPath, ['--require', loader, path.join(dir, 'scripts/bootstrap-empty-database.mjs'), ...args], {
      cwd: dir, encoding: 'utf8', timeout: 10000,
      env: { ...process.env, DATABASE_URL: 'postgresql://fixture:synthetic@127.0.0.1:5432/empty?schema=public&sslmode=require', PGHOSTADDR: 'wrong', PGDATABASE: 'wrong', ...env },
    });
    const calls = fs.existsSync(capture) ? JSON.parse(fs.readFileSync(capture, 'utf8')) : [];
    assert.ok(!result.stdout.includes('synthetic') && !result.stderr.includes('synthetic'), 'no credential output');
    assert.ok(calls.every(call => !JSON.stringify(call.args).includes('synthetic')), 'no credential arguments');
    return { ...result, calls };
  };
  return { dir, contract, run };
}

test('actual bootstrap CLI emits one guarded schema transaction with exact supplements then 12 native baselines', t => {
  const { contract, run } = fixture(t), result = run();
  assert.equal(result.status, 0, result.stderr); assert.equal(result.calls.length, 14);
  assert.deepEqual(result.calls[0].args.slice(1, 4), ['migrate', 'diff', '--from-empty']);
  const apply = result.calls[1]; assert.equal(apply.command, 'psql');
  assert.deepEqual(apply.args, ['-X', '-q', '-w', '-v', 'ON_ERROR_STOP=1', '--file=-']);
  assert.equal(apply.pg.PGHOST, '127.0.0.1'); assert.equal(apply.pg.PGDATABASE, 'empty'); assert.equal(apply.pg.PGHOSTADDR, undefined);
  assert.equal(apply.pg.PGSSLMODE, 'require');
  // The emitted psql input is the reviewed bootstrap protocol, not an implementation-text proxy.
  assert.match(apply.input, /^BEGIN;[\s\S]*SELECT pg_advisory_xact_lock\(19240924, 1\);/);
  assert.ok(apply.input.indexOf('COLLAB_BOOTSTRAP_DATABASE_NOT_EMPTY') < apply.input.indexOf(schemaSql));
  assert.match(apply.input, /COMMIT;\n$/);
  const ready = fs.readFileSync(path.join(root, 'prisma/migrations/20260924010000_forge_execution_attempt/migration.sql'), 'utf8');
  const check = ready.match(/^  CONSTRAINT "ForgeExecutionAttempt_state_check" CHECK .+$/m)[0].trim();
  const active = ready.match(/^CREATE UNIQUE INDEX "ForgeExecutionAttempt_active_issue_key"[\s\S]*?;/m)[0];
  const version = fs.readFileSync(path.join(root, 'prisma/migrations/20260924130000_version_access_invalidation/migration.sql'), 'utf8');
  const tail = version.slice(version.indexOf('CREATE FUNCTION "retain_version_access_invalidation"'));
  assert.ok(apply.input.includes(schemaSql + '\nALTER TABLE "ForgeExecutionAttempt" ADD ' + check + ';\n' + active + '\n' + tail + '\nCOMMIT;'));
  assert.ok(!apply.input.includes('ADD COLUMN "issueAccessInvalidated"'), 'modeled flag is generated once; historical existing-row backfill is not replayed');
  assert.deepEqual(result.calls.slice(2).map(call => call.args.at(-1)), contract.migrations.map(row => row.name));
  assert.ok(result.calls.slice(2).every(call => call.args[2] === 'resolve' && call.args.at(-2) === '--applied'));
});

for (const change of ['schema', 'migration', 'added-history', 'cli']) test(`changed ${change} refuses before generation or connection`, t => {
  const { dir, contract, run } = fixture(t);
  if (change === 'schema') fs.appendFileSync(path.join(dir, 'prisma/schema.prisma'), '\n// drift\n');
  if (change === 'migration') fs.appendFileSync(path.join(dir, 'prisma/migrations', contract.migrations[0].name, 'migration.sql'), '\n-- drift\n');
  if (change === 'added-history') fs.mkdirSync(path.join(dir, 'prisma/migrations/new-migration'));
  const result = run(change === 'cli' ? { FIXTURE_VERSION: '7.0.0' } : {});
  assert.equal(result.status, 1); assert.equal(result.calls.length, 0); assert.match(result.stderr, /Requalify/);
});

for (const failure of ['nonempty', 'lost', 'diff', 'resolve']) test(`${failure} does not retry, reset or guess successful baselining`, t => {
  const { run } = fixture(t);
  const result = run(failure === 'diff' ? { FIXTURE_DIFF: 'fail' } : failure === 'resolve' ? { FIXTURE_RESOLVE: 'fail' } : { FIXTURE_PSQL: failure });
  assert.equal(result.status, 1);
  assert.equal(result.calls.length, failure === 'diff' ? 1 : failure === 'resolve' ? 3 : 2);
  assert.match(result.stderr, failure === 'nonempty' ? /database is not empty/ : failure === 'lost' ? /outcome is unconfirmed/ : failure === 'resolve' ? /baseline is incomplete/ : /no bootstrap was attempted/);
});

test('invalid intent and unsupported target options never generate or connect', t => {
  const { run } = fixture(t);
  for (const [env, args] of [[{}, []], [{ DATABASE_URL: 'postgresql://fixture@127.0.0.1/empty?schema=private' }], [{ DATABASE_URL: 'postgresql://fixture@127.0.0.1/empty?connection_limit=1' }]]) {
    const result = run(env, args); assert.equal(result.status, 1); assert.equal(result.calls.length, 0);
  }
});


test('transport must be explicit and remote plaintext refuses before child processes', t => {
  const { run } = fixture(t);
  for (const url of ['postgresql://fixture@127.0.0.1/empty', 'postgresql://fixture@db.example.test/empty?sslmode=disable', 'postgresql://fixture@db.example.test/empty?sslmode=prefer', 'postgresql://fixture@db.example.test/empty?sslmode=require&sslmode=disable']) {
    const result = run({ DATABASE_URL: url });
    assert.equal(result.status, 1); assert.equal(result.calls.length, 0);
  }
  for (const [host, mode] of [['127.0.0.1', 'disable'], ['[::1]', 'disable'], ['db.example.test', 'require']]) {
    const result = run({ DATABASE_URL: `postgresql://fixture@${host}/empty?sslmode=${mode}` });
    assert.equal(result.status, 0, result.stderr); assert.equal(result.calls[1].pg.PGSSLMODE, mode);
  }
});

for (const failure of ['ENOENT', 'ETIMEDOUT']) test(`psql ${failure} classification stops without baselines`, t => {
  const { run } = fixture(t), result = run({ FIXTURE_PSQL: failure });
  assert.equal(result.status, 1); assert.equal(result.calls.length, 2);
  assert.match(result.stderr, failure === 'ENOENT' ? /Install the PostgreSQL psql client/ : /outcome is unconfirmed/);
  if (failure === 'ENOENT') assert.doesNotMatch(result.stderr, /outcome is unconfirmed/);
});
