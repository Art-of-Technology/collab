const assert = require('node:assert/strict');
const { test } = require('node:test');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, readFileSync, rmSync } = require('node:fs');
const { resolve, join } = require('node:path');
const { createServer } = require('node:net');
const { runInNewContext } = require('node:vm');
const ts = require('typescript');
const { PrismaClient } = require('@prisma/client');

function load(file, dependencies) {
  const exports = {};
  const source = readFileSync(resolve(process.env.SECURITY_TEST_ROOT || '.', file), 'utf8');
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022 } }).outputText, { exports, require: name => {
    if (!(name in dependencies)) throw new Error(`Unexpected dependency ${name}`);
    return dependencies[name];
  } });
  return exports;
}

test('saved version provenance survives actual PostgreSQL cascade unlink and scope changes', {
  skip: process.env.RUN_POSTGRES_SECURITY_TEST !== '1', timeout: 60000,
}, async () => {
  const dir = mkdtempSync(resolve('.version-provenance-'));
  const server = createServer();
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const port = server.address().port;
  await new Promise(done => server.close(done));
  const dataDir = join(dir, 'data');
  const url = `postgresql://fixture@127.0.0.1:${port}/postgres`;
  const run = (cmd, args, input) => execFileSync(cmd, args, { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  let db, started = false;
  try {
    run('initdb', ['-D', dataDir, '-A', 'trust', '-U', 'fixture', '--no-locale']);
    run('pg_ctl', ['-D', dataDir, '-l', join(dir, 'postgres.log'), '-o', `-F -h 127.0.0.1 -p ${port} -k ''`, '-w', 'start']);
    started = true;
    const sql = run(resolve('node_modules/.bin/prisma'), ['migrate', 'diff', '--from-empty', '--to-schema-datamodel', 'prisma/schema.prisma', '--script']);
    const apply = text => run('psql', [url, '-X', '-v', 'ON_ERROR_STOP=1', '-q'], text);
    apply(sql);
    db = new PrismaClient({ datasources: { db: { url } } });
    await db.user.createMany({ data: [{ id: 'alice', email: 'alice@fixture.test' }, { id: 'bob', email: 'bob@fixture.test' }] });
    await db.workspace.create({ data: { id: 'a', slug: 'a', name: 'A', ownerId: 'alice' } });
    await db.project.create({ data: { id: 'pa', slug: 'pa', name: 'A', workspaceId: 'a', issuePrefix: 'A' } });
    await db.repository.create({ data: { id: 'repo', projectId: 'pa', githubRepoId: 'fixture', owner: 'fixture', name: 'fixture', fullName: 'fixture/fixture', webhookSecret: 'unused' } });
    const version = (id, parentVersionId) => db.version.create({ data: { id, repositoryId: 'repo', version: id,
      major: 1, minor: 0, patch: 0, status: 'RELEASED', releaseType: 'PATCH', environment: 'production', parentVersionId,
      aiSummary: 'retained private summary', aiChangelog: 'retained private changelog' } });
    await version('legacy');
    apply('ALTER TABLE "Version" DROP COLUMN "issueAccessInvalidated";');
    apply(readFileSync('prisma/migrations/20260924130000_version_access_invalidation/migration.sql', 'utf8'));
    const dependencies = { 'server-only': {}, '@/lib/prisma': { prisma: db }, '@/lib/session': {} };
    dependencies['@/lib/issue-finder'] = load('src/lib/issue-finder.ts', dependencies);
    const { versionAccessWhere, releaseAccessWhere } = load('src/lib/github/repository-access.ts', dependencies);
    const visible = id => db.version.findMany({ where: { id, ...versionAccessWhere('alice') } });
    assert.equal((await db.version.findUnique({ where: { id: 'legacy' } })).aiChangelog, 'retained private changelog');
    await version('empty-new');
    assert.equal((await visible('empty-new')).length, 1);
    for (const operation of ['delete-issue', 'unlink', 'reassign-link', 'delete-status', 'delete-project',
      'delete-workspace', 'move-issue', 'move-project', 'move-status']) {
      const workspaceId = `b-${operation}`, projectId = `p-${operation}`, statusId = `s-${operation}`, issueId = `i-${operation}`;
      await db.workspace.create({ data: { id: workspaceId, slug: workspaceId, name: 'B', ownerId: 'bob' } });
      const member = await db.workspaceMember.create({ data: { workspaceId, userId: 'alice', status: true } });
      await db.project.create({ data: { id: projectId, workspaceId, slug: projectId, name: 'B', issuePrefix: 'B' } });
      await db.projectStatus.create({ data: { id: statusId, projectId, name: 'secret', displayName: 'Secret' } });
      await db.issue.create({ data: { id: issueId, workspaceId: 'a', projectId, statusId, title: 'Private issue' } });
      await version(operation);
      const link = await db.versionIssue.create({ data: { versionId: operation, issueId } });
      await version(`child-${operation}`, operation);
      await db.release.create({ data: { id: `r-${operation}`, repositoryId: 'repo', versionId: operation, tagName: operation, name: 'private release', description: 'retained release text' } });
      await db.versionFile.create({ data: { repositoryId: 'repo', versionId: operation, environment: operation, content: { features: ['Private issue'] } } });
      assert.equal((await visible(operation)).length, 1);
      await db.workspaceMember.update({ where: { id: member.id }, data: { status: false } });
      assert.equal((await visible(operation)).length, 0);
      if (operation === 'delete-issue') await db.issue.delete({ where: { id: issueId } });
      if (operation === 'unlink') await db.versionIssue.delete({ where: { id: link.id } });
      if (operation === 'reassign-link') await db.versionIssue.update({ where: { id: link.id }, data: { versionId: 'empty-new' } });
      if (operation === 'delete-status') await db.projectStatus.delete({ where: { id: statusId } });
      if (operation === 'delete-project') await db.project.delete({ where: { id: projectId } });
      if (operation === 'delete-workspace') await db.workspace.delete({ where: { id: workspaceId } });
      if (operation === 'move-issue') await db.issue.update({ where: { id: issueId }, data: { projectId: 'pa', statusId: null } });
      if (operation === 'move-project') await db.project.update({ where: { id: projectId }, data: { workspaceId: 'a' } });
      if (operation === 'move-status') await db.projectStatus.update({ where: { id: statusId }, data: { projectId: 'pa' } });
      assert.equal((await visible(operation)).length, 0, operation);
      assert.equal((await visible(`child-${operation}`)).length, 0, `child ${operation}`);
      assert.deepEqual(await db.release.findMany({ where: { id: `r-${operation}`, ...releaseAccessWhere('alice') } }), []);
      assert.deepEqual(await db.versionFile.findMany({ where: { environment: operation, version: versionAccessWhere('alice') } }), []);
      const saved = await db.version.findUnique({ where: { id: operation } });
      assert.equal(saved.issueAccessInvalidated, true);
      assert.equal(saved.aiSummary, 'retained private summary');
      assert.equal(saved.aiChangelog, 'retained private changelog');
      assert.equal((await db.release.findUnique({ where: { id: `r-${operation}` } })).description, 'retained release text');
      assert.deepEqual((await db.versionFile.findFirst({ where: { environment: operation } })).content, { features: ['Private issue'] });
      await db.version.update({ where: { id: operation }, data: { issueAccessInvalidated: false } });
      assert.equal((await visible(operation)).length, 0, 'invalidation cannot be cleared');
    }
    assert.equal((await visible('legacy')).length, 0);
  } finally {
    if (db) await db.$disconnect();
    if (started) run('pg_ctl', ['-D', dataDir, '-m', 'immediate', '-w', 'stop']);
    rmSync(dir, { recursive: true, force: true });
  }
});
