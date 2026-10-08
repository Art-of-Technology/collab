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
  await prisma.$executeRaw`INSERT INTO "Issue"
    SELECT CASE WHEN n = 50000 THEN 'needle' ELSE 'large-issue-' || n END, 'LARGE-' || n,
      CASE WHEN n = 1 THEN 'needle' ELSE 'Routine task' END, '', 'lexical-w'
    FROM generate_series(1, 50000) AS n`;
  await prisma.$executeRaw`INSERT INTO "Note"
    SELECT CASE WHEN n = 50000 THEN 'needle' ELSE 'large-note-' || n END,
      CASE WHEN n = 1 THEN 'needle' ELSE 'Routine note' END, ''
    FROM generate_series(1, 50000) AS n`;
  await prisma.$executeRaw`INSERT INTO "BoardItemActivity"
    SELECT CASE WHEN n = 50000 THEN 'needle' ELSE 'large-activity-' || n END, 'login', 'w',
      CASE WHEN n = 1 THEN 'needle' ELSE 'UPDATED' END, 'status', '', '', ''
    FROM generate_series(1, 50000) AS n`;
  const largeDocuments = Object.fromEntries(['issue', 'note', 'activity'].map(type => [type,
    Array.from({ length: 50000 }, (_, i) => ({ id: i === 49999 ? 'needle' : `large-${type}-${i + 1}`, type })),
  ]));
  for (const type of ['issue', 'note', 'activity']) {
    await t.test(`all lexical modes accept 50000 ${type} IDs with exact-first global ranking`, async () => {
      for (const mode of ['exact', 'keyword', 'semantic', 'hybrid', 'fuzzy']) {
        const result = await lexical.searchLexical(queryModule.searchQuerySchema.parse({ query: 'needle', mode }), largeDocuments[type]);
        assert.deepEqual(ids(result), ['needle', `large-${type}-1`]);
        assert.equal(result[0].exactIdentifier, true);
        assert.ok(result.every(row => row.type === type));
      }
    });
  }
  await t.test('combined lexical scopes above the bind limit preserve cross-type ordering', async () => {
    const scope = Object.values(largeDocuments).flatMap(rows => [...rows.slice(0, 15000), rows.at(-1)]);
    const result = await lexical.searchLexical(queryModule.searchQuerySchema.parse({ query: 'needle' }), scope);
    assert.equal(result.length, 6);
    assert.deepEqual(Array.from(result.slice(0, 3), row => [row.id, row.type]),
      [['needle', 'activity'], ['needle', 'issue'], ['needle', 'note']]);
    assert.ok(result.slice(0, 3).every(row => row.exactIdentifier));
    assert.ok(result.slice(3).every(row => !row.exactIdentifier));
  });

  await t.test('activity search and hydration accept 50000 authorized parents across projects', async () => {
    for (const statement of [
      `CREATE TABLE "Workspace" (id text PRIMARY KEY, name text, slug text, description text, "logoUrl" text,
        "createdAt" timestamp DEFAULT now(), "updatedAt" timestamp DEFAULT now(), "ownerId" text,
        "dockEnabled" boolean DEFAULT true, "timeTrackingEnabled" boolean DEFAULT true)`,
      'CREATE TABLE "WorkspaceMember" (id text PRIMARY KEY, "userId" text, "workspaceId" text, status boolean, "updatedAt" timestamp DEFAULT now())',
      'CREATE TABLE "Project" (id text PRIMARY KEY, "workspaceId" text)',
      'CREATE TABLE "ProjectStatus" (id text PRIMARY KEY, name text, "projectId" text)',
      `ALTER TABLE "Issue" ADD "projectId" text, ADD "statusId" text, ADD "statusValue" text,
        ADD status text, ADD "assigneeId" text, ADD "updatedAt" timestamp DEFAULT '2020-01-01'`,
      `ALTER TABLE "BoardItemActivity" ADD "projectId" text, ADD "itemType" text DEFAULT 'ISSUE',
        ADD "createdAt" timestamp DEFAULT '2020-01-01'`,
    ]) await prisma.$executeRawUnsafe(statement);
    await prisma.$executeRaw`INSERT INTO "Workspace" (id, name, slug, "ownerId")
      VALUES ('activity-w', 'Team', 'team', 'bob'), ('foreign-w', 'Foreign', 'foreign', 'eve')`;
    await prisma.$executeRaw`INSERT INTO "WorkspaceMember" (id, "userId", "workspaceId", status) VALUES ('member', 'alice', 'activity-w', true)`;
    await prisma.$executeRaw`INSERT INTO "Project" VALUES ('p1', 'activity-w'), ('p2', 'activity-w'), ('foreign-p', 'foreign-w')`;
    await prisma.$executeRaw`INSERT INTO "ProjectStatus" VALUES ('todo', 'TODO', 'p1'), ('done', 'DONE', 'p1'), ('foreign-status', 'TODO', 'foreign-p')`;
    await prisma.$executeRaw`INSERT INTO "Issue" (id, title, "issueKey", "workspaceId", "projectId", status, "statusId", "assigneeId")
      SELECT 'parent-' || n, 'Parent', 'P-' || n, 'activity-w', CASE WHEN n <= 25000 THEN 'p1' ELSE 'p2' END,
        'TODO', 'todo', 'alice' FROM generate_series(1, 50000) AS n`;
    await prisma.$executeRaw`INSERT INTO "Issue" (id, title, "workspaceId", "projectId", status, "statusId", "assigneeId") VALUES
      ('foreign-parent', 'Foreign', 'foreign-w', 'foreign-p', 'TODO', null, 'alice'),
      ('bad-project-parent', 'Foreign project', 'activity-w', 'foreign-p', 'TODO', null, 'alice'),
      ('bad-status-parent', 'Foreign status', 'activity-w', 'p1', 'TODO', 'foreign-status', 'alice')`;
    await prisma.$executeRaw`INSERT INTO "BoardItemActivity" (id, "itemId", "workspaceId", "projectId", action, details, "createdAt") VALUES
      ('release', 'parent-50000', 'activity-w', 'p2', 'UPDATED', 'Release exact', '2026-10-01'),
      ('first-release', 'parent-1', 'activity-w', null, 'UPDATED', 'Release update', '2026-10-01'),
      ('foreign-release', 'foreign-parent', 'activity-w', 'foreign-p', 'UPDATED', 'Release private', '2026-10-01'),
      ('bad-project-release', 'bad-project-parent', 'activity-w', 'foreign-p', 'UPDATED', 'Release private', '2026-10-01'),
      ('bad-status-release', 'bad-status-parent', 'activity-w', 'p1', 'UPDATED', 'Release private', '2026-10-01'),
      ('orphan-release', 'missing', 'activity-w', null, 'UPDATED', 'Release deleted', '2026-10-01'),
      ('mismatched-release', 'parent-1', 'activity-w', 'p2', 'UPDATED', 'Release mismatch', '2026-10-01'),
      ('future-release', 'parent-1', 'activity-w', 'p1', 'UPDATED', 'Release future', '2030-01-01')`;
    await prisma.$executeRaw`INSERT INTO "BoardItemActivity" (id, "itemId", "workspaceId", "projectId", action, details)
      SELECT 'old-release-' || n, 'parent-1', 'activity-w', 'p1', 'UPDATED', 'Release old'
      FROM generate_series(1, 50001) AS n`;
    const finder = load('src/lib/issue-finder.ts', { '@/lib/prisma': { prisma },
      '@/lib/shared-issue-key-utils': load('src/lib/shared-issue-key-utils.ts') });
    const access = load('src/lib/secrets/access.ts', { '@/lib/prisma': { prisma }, '@/lib/issue-finder': finder });
    let beforeHydrate;
    const service = load('src/lib/agent-search.ts', {
      '@/lib/prisma': { prisma }, '@/lib/issue-finder': finder, '@/lib/secrets/access': access,
      '@/lib/oauth-scopes': load('src/lib/oauth-scopes.ts'), '@/lib/html-sanitizer': { stripHtmlToPlainText: text => text },
      './agent-search-query': queryModule,
      './agent-search-lexical': { searchLexical: async (...args) => {
        const result = await lexical.searchLexical(...args);
        if (beforeHydrate) await beforeHydrate();
        return result;
      } },
      './agent-search-vectors': { searchVectors: () => { throw new Error('Unexpected vector request'); } },
    }, { Buffer });
    const context = { user: { id: 'alice' }, workspace: { id: 'activity-w', slug: 'team' }, token: { scopes: ['issues:read'] } };
    const query = queryModule.searchQuerySchema.parse({ query: 'release', type: 'activity', mode: 'keyword', status: 'TODO',
      assigneeId: 'alice', after: '2026-10-01T00:00:00Z', before: '2026-10-01T00:00:00Z', limit: 1 });
    const first = await service.searchProjectContent(context, query);
    assert.deepEqual(ids(first.results), ['release']);
    assert.equal(first.results[0].issueId, 'parent-50000');
    assert.equal(first.results[0].projectId, 'p2');
    assert.equal(first.pagination.nextOffset, 1);
    const second = await service.searchProjectContent(context, { ...query, offset: 1 });
    assert.deepEqual(ids(second.results), ['first-release']);
    assert.equal(second.results[0].projectId, 'p1');
    assert.equal(second.pagination.nextOffset, null);
    assert.deepEqual(ids((await service.searchProjectContent(context, { ...query, projectId: 'p1' })).results), ['first-release']);
    beforeHydrate = () => prisma.issue.update({ where: { id: 'parent-50000' }, data: { statusId: 'done' }, select: { id: true } });
    assert.deepEqual(ids((await service.searchProjectContent(context, query)).results), []);
    beforeHydrate = () => prisma.workspaceMember.update({ where: { id: 'member' }, data: { status: false }, select: { id: true } });
    await assert.rejects(service.searchProjectContent(context, query), error => error.code === 'workspace_access_denied');
    beforeHydrate = null;
    await prisma.workspaceMember.update({ where: { id: 'member' }, data: { status: true }, select: { id: true } });
    await assert.rejects(service.searchCorpus(context, { ...query, after: undefined, before: undefined }), error => error.code === 'scope_too_large');
  });

});
