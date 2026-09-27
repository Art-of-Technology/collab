import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
try {
  if (process.argv.length !== 3 || process.argv[2] !== '--empty-database-only') throw new Error('Use --empty-database-only with an explicitly selected new database.');
  const url = new URL(process.env.DATABASE_URL ?? '');
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.username || !url.pathname.slice(1)) throw new Error('A PostgreSQL DATABASE_URL is required.');
  if (url.searchParams.has('schema') && url.searchParams.get('schema') !== 'public') throw new Error('Bootstrap supports only the public schema.');
  url.searchParams.delete('schema');
  for (const key of url.searchParams.keys()) {
    if (!['sslmode', 'sslcert', 'sslkey', 'sslrootcert', 'connect_timeout', 'application_name', 'options', 'target_session_attrs'].includes(key)) throw new Error('Remove unsupported connection-pool URL options for this one-off bootstrap.');
  }
  const modes = url.searchParams.getAll('sslmode');
  if (modes.length !== 1 || (modes[0] !== 'require' && !(modes[0] === 'disable' && ['127.0.0.1', '[::1]'].includes(url.hostname)))) throw new Error('Select sslmode=require explicitly, or sslmode=disable only for a numeric loopback fixture.');
  const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG')));
  const contract = JSON.parse(readFileSync(resolve(root, 'prisma/bootstrap-contract.json'), 'utf8'));
  const sha256 = value => createHash('sha256').update(value).digest('hex');
  if (contract.format !== 'collab-empty-bootstrap-v1' || sha256(readFileSync(resolve(root, 'prisma/schema.prisma'))) !== contract.schemaSha256) throw new Error('Requalify bootstrap for the changed schema or contract.');
  // Keep bootstrap qualification tied to the reviewed schema, complete migration bytes and locked CLI.
  if (require('prisma/package.json').version !== contract.prismaVersion) throw new Error('Requalify bootstrap before changing the Prisma CLI version.');
  const migrations = readdirSync(resolve(root, 'prisma/migrations'), { withFileTypes: true }).filter(item => item.isDirectory()).map(item => item.name).sort();
  if (JSON.stringify(migrations) !== JSON.stringify(contract.migrations.map(row => row.name))) throw new Error('Requalify bootstrap supplements for the changed migration history.');
  const rows = migrations.map(name => ({ name, sql: readFileSync(resolve(root, 'prisma/migrations', name, 'migration.sql'), 'utf8') }));
  if (rows.some((row, index) => sha256(row.sql) !== contract.migrations[index].sha256)) throw new Error('Requalify bootstrap for changed migration bytes.');
  const ready = rows.find(row => row.name === '20260924010000_forge_execution_attempt').sql;
  const version = rows.find(row => row.name === '20260924130000_version_access_invalidation').sql;
  // The fresh Prisma schema already contains the modeled false-default flag; existing-row invalidation is upgrade-only.
  const versionStart = version.indexOf('CREATE FUNCTION "retain_version_access_invalidation"');
  if (versionStart < 0) throw new Error('Version provenance supplements need review.');
  const versionSupplements = version.slice(versionStart);
  // Reuse the exact unmodeled SQL contracts; fail closed if their format changes.
  const stateCheck = ready.match(/^  CONSTRAINT "ForgeExecutionAttempt_state_check" CHECK .+$/m)?.[0].trim();
  const activeIndex = ready.match(/^CREATE UNIQUE INDEX "ForgeExecutionAttempt_active_issue_key"[\s\S]*?;/m)?.[0];
  if (!stateCheck || !activeIndex) throw new Error('Ready database supplements need review.');
  const generated = spawnSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', resolve(root, 'prisma/schema.prisma'), '--script'], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 120000, env: { ...cleanEnv, NO_COLOR: '1' } });
  if (generated.status !== 0 || !generated.stdout.trim()) throw new Error('Current schema generation failed; no bootstrap was attempted.');
  const sql = `BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';
SET LOCAL search_path = public;
SELECT pg_advisory_xact_lock(19240924, 1);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname !~ '^pg_' AND nspname NOT IN ('public','information_schema'))
    OR EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema')
    OR EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema')
    OR EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema')
  THEN RAISE EXCEPTION 'COLLAB_BOOTSTRAP_DATABASE_NOT_EMPTY'; END IF;
END $$;
${generated.stdout}
ALTER TABLE "ForgeExecutionAttempt" ADD ${stateCheck};
${activeIndex}
${versionSupplements}
COMMIT;
`;
  // Keep credentials out of command arguments, logs and generated files.
  const connectionEnv = { ...cleanEnv, PGHOST: url.hostname.replace(/^\[|\]$/g, ''), PGPORT: url.port || '5432', PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password), PGDATABASE: decodeURIComponent(url.pathname.slice(1)), PGCONNECT_TIMEOUT: '10' };
  const pgOptions = { sslmode: 'PGSSLMODE', sslcert: 'PGSSLCERT', sslkey: 'PGSSLKEY', sslrootcert: 'PGSSLROOTCERT', connect_timeout: 'PGCONNECT_TIMEOUT', application_name: 'PGAPPNAME', options: 'PGOPTIONS', target_session_attrs: 'PGTARGETSESSIONATTRS' };
  for (const [key, value] of url.searchParams) connectionEnv[pgOptions[key]] = value;
  const applied = spawnSync('psql', ['-X', '-q', '-w', '-v', 'ON_ERROR_STOP=1', '--file=-'], { cwd: root, input: sql, encoding: 'utf8', maxBuffer: 1024 * 1024, timeout: 150000, env: connectionEnv });
  if (applied.error?.code === 'ENOENT') throw new Error('Install the PostgreSQL psql client before bootstrap. No SQL was sent.');
  if (applied.status !== 0) throw new Error(applied.stderr?.includes('COLLAB_BOOTSTRAP_DATABASE_NOT_EMPTY') ? 'Refused: database is not empty. Nothing was changed by bootstrap.' : 'Bootstrap outcome is unconfirmed. Keep the app and worker disabled; inspect the selected database before any retry or reset.');
  for (const name of migrations) {
    const baseline = spawnSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'resolve', '--schema', resolve(root, 'prisma/schema.prisma'), '--applied', name], { cwd: root, encoding: 'utf8', maxBuffer: 1024 * 1024, timeout: 120000, env: { ...cleanEnv, NO_COLOR: '1' } });
    if (baseline.status !== 0) throw new Error('Schema committed but native migration baseline is incomplete. Keep the app and worker disabled; follow the explicit bootstrap recovery guide. Do not reset or rerun bootstrap.');
  }
  console.log('Created current schema, Ready constraints and Version provenance triggers; recorded the historical baseline with native Prisma. Run migrate status and migrate deploy before enabling the app.');
} catch (error) {
  // URL parsing and process errors may contain connection details; emit only owned messages.
  const message = error instanceof Error && !['TypeError', 'SyntaxError'].includes(error.name) ? error.message : 'Invalid bootstrap configuration.';
  console.error(message.startsWith('Cannot find') ? 'Install the locked project dependencies before bootstrap.' : message);
  process.exitCode = 1;
}
