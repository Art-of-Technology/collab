const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir, userInfo } = require('node:os');
const { join } = require('node:path');
const { execFileSync } = require('node:child_process');
const { PrismaClient, Prisma } = require('@prisma/client');
const { load } = require('../security/helpers.cjs');

// A disposable, socket-only PostgreSQL instance: never use DATABASE_URL or a shared database.
const directory = mkdtempSync(join(tmpdir(), 'collab-search-pg-'));
const bindir = execFileSync('pg_config', ['--bindir'], { encoding: 'utf8' }).trim();
let started = false, prisma;
after(async () => {
  await prisma?.$disconnect();
  if (started) execFileSync(join(bindir, 'pg_ctl'), ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'], { stdio: 'pipe' });
  rmSync(directory, { recursive: true, force: true });
});

test('lexical search executes against PostgreSQL: exact, full-text, fuzzy, isolation and bounded query inputs', async t => {
  execFileSync(join(bindir, 'initdb'), ['-D', join(directory, 'data'), '-A', 'trust', '--no-locale', '-E', 'UTF8'], { stdio: 'pipe' });
  execFileSync(join(bindir, 'pg_ctl'), ['-D', join(directory, 'data'), '-l', join(directory, 'server.log'),
    '-o', `-k ${directory} -c listen_addresses='' -c fsync=off`, '-w', 'start'], { stdio: 'pipe' });
  started = true;
  const url = `postgresql://${encodeURIComponent(userInfo().username)}@localhost/postgres?host=${encodeURIComponent(directory)}`;
  prisma = new PrismaClient({ datasources: { db: { url } } });
  for (const statement of [
    'CREATE TABLE "Issue" (id text PRIMARY KEY, "issueKey" text, title text, description text, "workspaceId" text)',
    'CREATE TABLE "Note" (id text PRIMARY KEY, title text, content text)',
    'CREATE TABLE "BoardItemActivity" (id text PRIMARY KEY, "itemId" text, "workspaceId" text, action text, "fieldName" text, details text, "oldValue" text, "newValue" text)',
  ]) await prisma.$executeRawUnsafe(statement);
  const columns = await prisma.$queryRaw`SELECT table_name, column_name, data_type
    FROM information_schema.columns WHERE table_schema = 'public'`;
  for (const column of columns) {
    const model = Prisma.dmmf.datamodel.models.find(m => (m.dbName || m.name) === column.table_name);
    const field = model?.fields.find(f => (f.dbName || f.name) === column.column_name);
    assert.equal(field?.type, 'String', `Reduced fixture must match generated schema: ${column.table_name}.${column.column_name}`);
    assert.equal(column.data_type, 'text');
  }
  await prisma.$executeRaw`INSERT INTO "Issue" VALUES
    ('login', 'APP-42', 'Authentication failure', 'Users cannot log in after password reset', 'w'),
    ('deploy', 'APP-43', 'Deployment pipeline stalled', 'Build awaits approval from release owner', 'w'),
    ('quoted', 'APP-44', 'The deployment pipeline needs authentication', 'Related work', 'w'),
    ('foreign', 'SECRET-1', 'Authentication private customer', 'Never return this record', 'foreign')`;
  await prisma.$executeRaw`INSERT INTO "Note" VALUES ('guide', 'Authentication guide', '<p>Reset password using the login screen.</p>')`;
  await prisma.$executeRaw`INSERT INTO "BoardItemActivity" VALUES
    ('activity', 'deploy', 'w', 'UPDATED', 'status', 'Deployment unblocked', 'BLOCKED', 'IN_PROGRESS'),
    ('orphan', 'missing', 'w', 'UPDATED', 'status', 'Deployment orphan', '', ''),
    ('mismatch', 'foreign', 'w', 'UPDATED', 'status', 'Authentication foreign mismatch', '', '')`;
  const queryModule = load('src/lib/agent-search-query.ts', { zod: require('zod') }, { Buffer });
  const lexical = load('src/lib/agent-search-lexical.ts', { '@/lib/prisma': { prisma } });
  const documents = ['login', 'deploy', 'quoted'].map(id => ({ id, type: 'issue' })).concat([
    { id: 'guide', type: 'note' }, ...['activity', 'orphan', 'mismatch'].map(id => ({ id, type: 'activity' })),
  ]);
  const search = (query, mode) => lexical.searchLexical(queryModule.searchQuerySchema.parse({ query, mode }), documents);
  const ids = rows => Array.from(rows, r => r.id);

  await t.test('exact keys are case-insensitive and prioritize the identifier', async () => {
    for (const mode of ['exact', 'keyword', 'hybrid', 'fuzzy']) {
      const result = await search('app-42', mode);
      assert.equal(result[0].id, 'login'); assert.equal(result[0].exactIdentifier, true); assert.equal(result[0].matchType, 'exact');
    }
    assert.deepEqual(ids(await search('deployment pipeline', 'exact')), ['deploy', 'quoted']);
  });
  await t.test('full-text matches words, phrases and OR while excluding unauthorized IDs', async () => {
    assert.deepEqual(ids(await search('authentication', 'keyword')).sort(), ['guide', 'login', 'quoted']);
    assert.deepEqual(ids(await search('password reset', 'keyword')).sort(), ['guide', 'login']);
    assert.deepEqual(ids(await search('"deployment pipeline"', 'keyword')).sort(), ['deploy', 'quoted']);
    const alternatives = ids(await search('authentication OR unblocked', 'keyword'));
    assert.ok(alternatives.includes('activity')); assert.ok(alternatives.includes('login'));
    for (const id of ['foreign', 'orphan', 'mismatch']) assert.equal(alternatives.includes(id), false);
  });
  await t.test('fuzzy handles misspellings that keyword search misses', async () => {
    assert.deepEqual(ids(await search('authentcation', 'keyword')), []);
    const rows = await search('authentcation', 'fuzzy');
    assert.ok(ids(rows).includes('login')); assert.ok(ids(rows).includes('guide'));
    assert.ok(rows.every(r => r.matchType === 'fuzzy'));
  });
  await t.test('user input remains a value, including SQL punctuation and empty lexemes', async () => {
    assert.deepEqual(ids(await search("'; DROP TABLE \"Issue\"; --", 'exact')), []);
    assert.deepEqual(ids(await search('!!!', 'keyword')), []);
    assert.equal((await prisma.$queryRaw`SELECT count(*)::int AS n FROM "Issue"`)[0].n, 4);
  });
  await t.test('record local query timings on a 2500-issue corpus without treating them as live CLI latency', async () => {
    await prisma.$executeRaw`INSERT INTO "Issue"
      SELECT 'fixture-' || n, 'SAMPLE-' || n, 'Routine task ' || n,
        'A routine project task with an owner and progress update.', 'w'
      FROM generate_series(1, 2497) AS n`;
    documents.push(...Array.from({ length: 2497 }, (_, i) => ({ id: `fixture-${i + 1}`, type: 'issue' })));
    const timings = {};
    for (const mode of ['keyword', 'fuzzy']) {
      const samples = [];
      for (let i = 0; i < 5; i++) {
        const start = performance.now();
        const result = await search(mode === 'fuzzy' ? 'authentcation' : 'authentication', mode);
        samples.push(performance.now() - start);
        assert.ok(ids(result).includes('login'));
        assert.equal(ids(result).includes('foreign'), false);
      }
      samples.sort((a, b) => a - b);
      timings[mode] = { p50Ms: samples[2], maxMs: samples[4] };
    }
    t.diagnostic(JSON.stringify({ benchmark: 'local_postgres_lexical_only', issueCount: 2500, samples: 5, timings,
      limits: 'Synthetic corpus; excludes auth, HTTP, CLI and providers. Full CLI comparison is a separate acceptance step.' }));
  });
});
