const assert = require('node:assert/strict');
const { test } = require('node:test');
const { spawnSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const root = path.resolve(__dirname, '../..');
const run = (command, args, env) => spawnSync(command, args, { cwd: root, env: { ...process.env, ...env }, encoding: 'utf8', timeout: 180000 });

test('bootstrap requires explicit empty-database intent before any connection', () => {
  const result = run(process.execPath, ['scripts/bootstrap-empty-database.mjs'], { DATABASE_URL: 'postgresql://fixture@127.0.0.1:1/not-contacted' });
  assert.equal(result.status, 1); assert.match(result.stderr, /Use --empty-database-only/);
});

test('native fresh bootstrap, subsequent migrations, and populated-target refusal', { skip: !process.env.COLLAB_BOOTSTRAP_TEST_SERVER_URL, timeout: 180000 }, () => {
  const server = new URL(process.env.COLLAB_BOOTSTRAP_TEST_SERVER_URL);
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(server.hostname), 'only a disposable loopback test server is allowed');
  const pg = { PGHOST: server.hostname.replace(/^\[|\]$/g, ''), PGPORT: server.port || '5432', PGUSER: decodeURIComponent(server.username), PGPASSWORD: decodeURIComponent(server.password), PGDATABASE: decodeURIComponent(server.pathname.slice(1)) };
  const names = ['fresh', 'legacy', 'namespace', 'unknown'].map(kind => 'collab_bootstrap_test_' + kind + '_' + randomUUID().replaceAll('-', ''));
  const query = (name, sql) => {
    const result = run('psql', ['-X', '-At', '-v', 'ON_ERROR_STOP=1', '-c', sql], { ...pg, PGDATABASE: name });
    assert.equal(result.status, 0, 'fixture SQL must succeed'); return result.stdout.trim();
  };
  const target = name => { const url = new URL(server); url.pathname = '/' + name; return { DATABASE_URL: url.href }; };
  const wrapper = fs.mkdtempSync(path.join(os.tmpdir(), 'collab-bootstrap-ack-'));
  try {
    for (const name of names) assert.equal(run('createdb', [name], pg).status, 0, 'create isolated database');
    const [fresh, legacy, namespace, unknown] = names;
    assert.equal(run(process.execPath, ['scripts/bootstrap-empty-database.mjs', '--empty-database-only'], { ...target(fresh), PGHOSTADDR: '127.0.0.2', PGHOST: 'ignored.example.test', PGPORT: '1', PGDATABASE: 'ignored' }).status, 0, 'bootstrap a truly empty target');
    for (const command of ['status', 'deploy']) assert.equal(run(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', command], target(fresh)).status, 0, 'native migration command succeeds after baseline');
    assert.equal(query(fresh, 'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL'), '12');
    assert.equal(query(fresh, "SELECT count(*) FROM pg_constraint WHERE conname='ForgeExecutionAttempt_state_check' AND contype='c'"), '1');
    assert.equal(query(fresh, "SELECT count(*) FROM pg_constraint WHERE conname='ForgeExecutionAttempt_projectId_fkey' AND confdeltype='r'"), '1');
    assert.equal(query(fresh, "SELECT count(*) FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid WHERE c.relname='ForgeExecutionAttempt_active_issue_key' AND i.indisunique AND i.indpred IS NOT NULL"), '1');
    const catalog = JSON.parse(fs.readFileSync(path.join(root, 'prisma/bootstrap-contract.json'), 'utf8')).unmodeledCatalog;
    for (const { name, table } of catalog.versionFunctionsAndTriggers) {
      assert.equal(query(fresh, `SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='${name}' AND p.prorettype='trigger'::regtype`), '1');
      assert.equal(query(fresh, `SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid WHERE n.nspname='public' AND c.relname='${table}' AND t.tgname='${name}' AND p.proname='${name}' AND NOT t.tgisinternal AND t.tgenabled='O'`), '1');
    }
    query(legacy, "CREATE TABLE sentinel (value text); INSERT INTO sentinel VALUES ('keep'); CREATE SCHEMA pgcustom; CREATE TABLE pgcustom.hidden (id int)");
    query(namespace, 'CREATE SCHEMA pgcustom; CREATE TABLE pgcustom.sentinel (id int)');
    const psql = run('which', ['psql'], {}).stdout.trim();
    assert.ok(path.isAbsolute(psql));
    fs.writeFileSync(path.join(wrapper, 'psql'), '#!' + process.execPath + '\nconst {spawnSync}=require("node:child_process");const r=spawnSync(' + JSON.stringify(psql) + ',process.argv.slice(2),{stdio:"inherit",env:process.env});process.exit(r.status===0?74:(r.status??1));\n', {mode:0o700});
    const lost = run(process.execPath, ['scripts/bootstrap-empty-database.mjs', '--empty-database-only'], { ...target(unknown), PATH: wrapper + path.delimiter + process.env.PATH });
    assert.equal(lost.status, 1); assert.match(lost.stderr, /outcome is unconfirmed/);
    assert.equal(query(unknown, "SELECT to_regclass('public.\"Project\"') IS NOT NULL"), 't');
    assert.equal(query(unknown, "SELECT to_regclass('public._prisma_migrations') IS NULL"), 't');
    for (const name of names) {
      const result = run(process.execPath, ['scripts/bootstrap-empty-database.mjs', '--empty-database-only'], target(name));
      assert.equal(result.status, 1); assert.match(result.stderr, /database is not empty/);
    }
    assert.equal(query(namespace, "SELECT count(*) FROM pg_tables WHERE schemaname IN ('public','pgcustom')"), '1');
    assert.equal(query(legacy, 'SELECT value FROM sentinel'), 'keep');
    assert.equal(query(legacy, "SELECT count(*) FROM pg_tables WHERE schemaname IN ('public','pgcustom')"), '2');
    assert.equal(query(legacy, "SELECT to_regclass('public._prisma_migrations') IS NULL"), 't');
    assert.equal(query(fresh, 'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL'), '12');
  } finally {
    fs.rmSync(wrapper, {recursive:true,force:true});
    for (const name of names) assert.equal(run('dropdb', ['--if-exists', name], pg).status, 0, 'remove owned disposable database');
  }
});
