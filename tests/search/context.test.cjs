const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir, userInfo } = require('node:os');
const { join, resolve } = require('node:path');
const { execFileSync } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');
const { load } = require('../security/helpers.cjs');

// Socket-only disposable PostgreSQL; schema setup never touches the application's database.
const directory = mkdtempSync(join(tmpdir(), 'collab-context-pg-'));
const bindir = execFileSync('pg_config', ['--bindir'], { encoding: 'utf8' }).trim();
let started = false, prisma;
after(async () => {
  await prisma?.$disconnect();
  if (started) execFileSync(join(bindir, 'pg_ctl'), ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'], { stdio: 'pipe' });
  rmSync(directory, { recursive: true, force: true });
});

test('project context uses the real schema and PostgreSQL above the bind limit with globally ordered activity and readable cross-project parents', async t => {
  execFileSync(join(bindir, 'initdb'), ['-D', join(directory, 'data'), '-A', 'trust', '--no-locale', '-E', 'UTF8'], { stdio: 'pipe' });
  execFileSync(join(bindir, 'pg_ctl'), ['-D', join(directory, 'data'), '-l', join(directory, 'server.log'),
    '-o', `-k ${directory} -c listen_addresses='' -c fsync=off`, '-w', 'start'], { stdio: 'pipe' });
  started = true;
  const url = `postgresql://${encodeURIComponent(userInfo().username)}@localhost/postgres?host=${encodeURIComponent(directory)}&options=-c%20statement_timeout%3D30000`;
  execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'db', 'push', '--skip-generate', '--schema', resolve('prisma/schema.prisma')],
    { env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' });
  prisma = new PrismaClient({ datasources: { db: { url } } });
  await prisma.user.createMany({ data: [{ id: 'reader', name: 'Reader' }, { id: 'other', name: 'Other' }] });
  await prisma.workspace.createMany({ data: [
    { id: 'w', name: 'Workspace', slug: 'workspace', ownerId: 'reader' },
    { id: 'foreign', name: 'Foreign', slug: 'foreign', ownerId: 'other' },
  ] });
  await prisma.project.createMany({ data: ['p', 'dependency', 'foreign'].map(id => ({ id, name: id, slug: id, issuePrefix: id,
    workspaceId: id === 'foreign' ? 'foreign' : 'w' })) });
  await prisma.$executeRaw`INSERT INTO "Issue" (id, title, "issueKey", "projectId", "workspaceId", "updatedAt")
    SELECT 'issue-' || n, 'Task ' || n, 'APP-' || n, 'p', 'w', TIMESTAMP '2020-01-01' FROM generate_series(1, 40000) n`;
  await prisma.issue.createMany({ data: [
    { id: 'child', title: 'External child', projectId: 'dependency', workspaceId: 'w', parentId: 'issue-1' },
    { id: 'hidden', title: 'Private child', projectId: 'foreign', workspaceId: 'foreign', parentId: 'issue-1' },
  ] });
  await prisma.issueActivity.createMany({ data: [
    { id: 'early', itemId: 'issue-1', action: 'UPDATED', userId: 'reader', workspaceId: 'w', projectId: 'p', createdAt: new Date('2026-01-01') },
    { id: 'latest', itemId: 'issue-39999', action: 'UPDATED', userId: 'reader', workspaceId: 'w', projectId: null, createdAt: new Date('2026-02-01') },
    { id: 'orphan', itemId: 'missing', action: 'UPDATED', userId: 'reader', workspaceId: 'w', projectId: 'p' },
  ] });
  await prisma.issueRelation.createMany({ data: [
    { id: 'inverse', sourceIssueId: 'issue-1', targetIssueId: 'child', relationType: 'BLOCKED_BY', createdBy: 'reader' },
    { id: 'hidden-inverse', sourceIssueId: 'issue-1', targetIssueId: 'hidden', relationType: 'BLOCKED_BY', createdBy: 'reader' },
  ] });
  const finder = load('src/lib/issue-finder.ts', { '@/lib/prisma': { prisma }, '@/lib/shared-issue-key-utils': load('src/lib/shared-issue-key-utils.ts') });
  const access = load('src/lib/secrets/access.ts', { '@/lib/prisma': { prisma }, '@/lib/issue-finder': finder });
  const query = load('src/lib/agent-search-query.ts', { zod: require('zod') }, { Buffer });
  const service = load('src/lib/agent-project-context.ts', { '@/lib/prisma': { prisma }, '@/lib/issue-finder': finder,
    '@/lib/secrets/access': access, '@/lib/oauth-scopes': load('src/lib/oauth-scopes.ts'), zod: require('zod'),
    '@/lib/html-sanitizer': load('src/lib/html-sanitizer.ts'), './agent-search-query': query }, { Buffer });
  const context = { user: { id: 'reader' }, workspace: { id: 'w', slug: 'workspace' }, token: { scopes: ['issues:read', 'context:read'] } };
  const start = performance.now();
  const options = service.contextOptionsSchema.parse({ projectId: 'p', since: '2025-01-01T00:00:00Z', limit: 1 });
  const first = await service.getProjectContext(context, options);
  assert.equal(first.summary.totalIssues, 40000);
  assert.equal(first.recentChanges.items[0].id, 'latest');
  assert.equal(first.recentChanges.pagination.nextOffset, 1);
  assert.equal(first.parents.items[0].source.id, 'child');
  assert.equal(first.parents.pagination.total, 1);
  assert.deepEqual(Array.from(first.dependencies.items, r => [r.type, r.source.id, r.target.id]), [['BLOCKS', 'child', 'issue-1']]);
  assert.equal(first.blockers.items[0].id, 'inverse');
  const second = await service.getProjectContext(context, { ...options, offset: 1 });
  assert.equal(second.recentChanges.items[0].id, 'early');
  assert.equal(second.recentChanges.pagination.nextOffset, null);
  assert.ok(!JSON.stringify(first).includes('Private child'));
  assert.ok(Buffer.byteLength(JSON.stringify(first)) <= first.metadata.budget.tokenUpperBound);
  t.diagnostic(JSON.stringify({ benchmark: 'local_postgres_project_context', issues: 40000, requests: 2, elapsedMs: performance.now() - start,
    limits: 'Synthetic database and service calls; excludes HTTP, CLI and production latency.' }));
});
