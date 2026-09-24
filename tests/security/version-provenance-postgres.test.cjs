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
    apply(readFileSync(resolve(process.env.SECURITY_TEST_ROOT || '.', 'prisma/migrations/20260924130000_version_access_invalidation/migration.sql'), 'utf8'));
    const dependencies = { 'server-only': {}, '@/lib/prisma': { prisma: db }, '@/lib/session': { getCurrentUser: async () => ({ id: 'alice' }) }, '@prisma/client': require('@prisma/client'), 'node:crypto': require('node:crypto') };
    dependencies['@/lib/issue-finder'] = load('src/lib/issue-finder.ts', dependencies);
    dependencies['@/lib/github/repository-access'] = load('src/lib/github/repository-access.ts', dependencies);
    const { versionAccessWhere, releaseAccessWhere } = dependencies['@/lib/github/repository-access'];
    const visible = id => db.version.findMany({ where: { id, ...versionAccessWhere('alice') } });
    assert.equal((await db.version.findUnique({ where: { id: 'legacy' } })).aiChangelog, 'retained private changelog');
    await version('empty-new');
    assert.equal((await visible('empty-new')).length, 1);
    await db.projectStatus.createMany({ data: ['todo', 'done'].map(id => ({ id, projectId: 'pa', name: id, displayName: id })) });
    await db.issue.create({ data: { id: 'ordinary', workspaceId: 'a', projectId: 'pa', statusId: 'todo', title: 'Current authorized title' } });
    await version('ordinary-version');
    await db.versionIssue.create({ data: { versionId: 'ordinary-version', issueId: 'ordinary' } });
    await version('ordinary-child', 'ordinary-version');
    await db.release.create({ data: { id: 'ordinary-release', repositoryId: 'repo', versionId: 'ordinary-version', tagName: 'ordinary', name: 'Ordinary' } });
    await db.versionFile.create({ data: { repositoryId: 'repo', versionId: 'ordinary-version', environment: 'ordinary', content: { features: ['ordinary'] } } });
    await db.issue.update({ where: { id: 'ordinary' }, data: { statusId: 'done' } });
    assert.equal((await visible('ordinary-version')).length, 1, 'same-scope status change retains history');
    assert.equal((await visible('ordinary-child')).length, 1);
    assert.equal(await db.release.count({ where: { id: 'ordinary-release', ...releaseAccessWhere('alice') } }), 1);
    assert.equal(await db.versionFile.count({ where: { environment: 'ordinary', version: versionAccessWhere('alice') } }), 1);
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
    const { regenerateVersion } = load('src/lib/github/version-recovery.ts', dependencies);
    dependencies.semver = { default: require('semver') };
    const { VersionManager } = load('src/lib/github/version-manager.ts', dependencies);
    const manager = new VersionManager();
    for (const environment of ['production', 'development']) {
      for (const state of ['fresh', 'legacy']) {
        const id = `canonical-${environment}-${state}`;
        await db.project.create({ data: { id, slug: id, name: id, workspaceId: 'a', issuePrefix: id } });
        await db.repository.create({ data: { id, projectId: id, githubRepoId: id, owner: 'fixture', name: id, fullName: `fixture/${id}`, webhookSecret: 'unused' } });
        await db.version.create({ data: { id, repositoryId: id, version: '2.3.4', major: 2, minor: 3, patch: 4,
          environment, releaseType: 'PATCH', status: 'RELEASED', issueAccessInvalidated: state === 'legacy',
          issues: { create: { issueId: 'ordinary' } } } });
        const calculation = () => manager.calculateNextVersion(id, [{ id: 'ordinary', type: 'BUG', issueKey: 'A-1' }],
          environment, 'main', { versioningStrategy: 'MULTI_BRANCH', issueTypeMapping: { BUG: 'PATCH' }, branchEnvironmentMap: {} });
        const before = await calculation();
        const recovered = await regenerateVersion(id, id, 'alice', async () => ({ changelog: 'Reviewed replacement', summary: 'Fresh' }));
        assert.equal(await manager.getCurrentVersion(id, environment), '2.3.4');
        assert.deepEqual(await calculation(), before);
        assert.equal(before.version, '2.3.5');
        const saved = await db.version.findUnique({ where: { id: recovered.id } });
        assert.ok(require('semver').valid(saved.version));
        assert.equal(saved.environment, 'recovery');
        if (environment === 'development') assert.equal((await manager.findLatestDevelopmentVersion(id)).id, id);
      }
    }
    for (const state of ['fresh', 'legacy', 'invalidated']) {
      const id = state === 'legacy' ? 'legacy' : `recover-${state}`;
      if (state !== 'legacy') await version(id);
      await db.versionIssue.create({ data: { versionId: id, issueId: 'ordinary' } });
      if (state === 'invalidated') await db.version.update({ where: { id }, data: { issueAccessInvalidated: true } });
      const original = await db.version.findUnique({ where: { id } });
      let calls = 0;
      const result = await regenerateVersion('repo', id, 'alice', async issues => {
        calls++; assert.equal(issues[0].title, 'Current authorized title');
        assert.equal(JSON.stringify(issues).includes('retained private'), false);
        return { changelog: 'Fresh changelog', summary: 'Fresh summary' };
      });
      assert.equal(calls, 1); assert.equal((await visible(result.id)).length, 1);
      assert.deepEqual(await db.version.findUnique({ where: { id } }), original);
      assert.equal(result.aiChangelog, 'Fresh changelog');
    }
    for (const change of ['title', 'link', 'scope', 'membership']) {
      const id = `race-${change}`;
      await version(id); await db.versionIssue.create({ data: { versionId: id, issueId: 'ordinary' } });
      const before = await db.version.count();
      await assert.rejects(regenerateVersion('repo', id, 'alice', async () => {
        if (change === 'title') await db.issue.update({ where: { id: 'ordinary' }, data: { title: 'Changed concurrently' } });
        if (change === 'link') await db.versionIssue.deleteMany({ where: { versionId: id } });
        if (change === 'scope') await db.issue.update({ where: { id: 'ordinary' }, data: { statusId: 'todo' } });
        if (change === 'membership') await db.workspace.update({ where: { id: 'a' }, data: { ownerId: 'bob' } });
        return { changelog: 'Discarded generation', summary: 'Discarded summary' };
      }));
      assert.equal(await db.version.count(), before);
      assert.equal((await db.version.findUnique({ where: { id } })).aiChangelog, 'retained private changelog');
      await db.workspace.update({ where: { id: 'a' }, data: { ownerId: 'alice' } });
    }
    let inputDeniedCalls = 0;
    const beforeInputDenied = await db.version.count();
    await assert.rejects(regenerateVersion('repo', 'move-status', 'alice', async () => {
      inputDeniedCalls++; return { changelog: 'Denied', summary: 'Denied' };
    }));
    assert.equal(inputDeniedCalls, 0); assert.equal(await db.version.count(), beforeInputDenied);
    await db.account.create({ data: { id: 'mapping', userId: 'alice', type: 'oauth', provider: 'maestro', providerAccountId: 'one' } });
    const currentMember = await db.workspaceMember.create({ data: { workspaceId: 'a', userId: 'alice', status: true } });
    const transact = db.$transaction.bind(db);
    db.$transaction = (callback, options) => transact(tx => callback(new Proxy(tx, { get(target, key) {
      if (key !== 'version') return target[key];
      return new Proxy(target.version, { get(model, method) {
        if (method !== 'create') return model[method];
        return async args => {
          await assert.rejects(transact(async other => {
            await other.$executeRawUnsafe("SET LOCAL lock_timeout = '50ms'");
            await other.issue.update({ where: { id: 'ordinary' }, data: { title: 'Must wait until commit' } });
          }));
          for (const mutation of [
            other => other.account.update({ where: { id: 'mapping' }, data: { providerAccountId: 'changed' } }),
            other => other.workspaceMember.update({ where: { id: currentMember.id }, data: { status: false } }),
            other => other.account.create({ data: { userId: 'alice', type: 'oauth', provider: 'maestro', providerAccountId: 'second' } }),
          ]) {
            await assert.rejects(transact(async other => {
              await other.$executeRawUnsafe("SET LOCAL lock_timeout = '50ms'");
              await mutation(other);
            }), 'identity and membership must remain stable through final save');
          }
          return model.create(args);
        };
      } });
    } })), options);
    try {
      const result = await regenerateVersion('repo', 'legacy', 'alice', async () => ({ changelog: 'Locked output', summary: 'Locked summary' }));
      assert.equal((await visible(result.id)).length, 1);
      assert.notEqual((await db.issue.findUnique({ where: { id: 'ordinary' } })).title, 'Must wait until commit');
      assert.equal(await db.account.count({ where: { userId: 'alice', provider: 'maestro' } }), 1);
      assert.equal((await db.account.findUnique({ where: { id: 'mapping' } })).providerAccountId, 'one');
      assert.equal((await db.workspaceMember.findUnique({ where: { id: currentMember.id } })).status, true);
    } finally { db.$transaction = transact; }
    await db.workspaceMember.delete({ where: { id: currentMember.id } });
    await db.workspace.update({ where: { id: 'a' }, data: { ownerId: 'bob' } });
    let deniedCalls = 0;
    const beforeDenied = await db.version.count();
    await assert.rejects(regenerateVersion('repo', 'legacy', 'alice', async () => { deniedCalls++; return { changelog: 'Denied', summary: 'Denied' }; }));
    assert.equal(deniedCalls, 0); assert.equal(await db.version.count(), beforeDenied);
    await db.workspace.update({ where: { id: 'a' }, data: { ownerId: 'alice' } });
    assert.equal((await visible('legacy')).length, 0);
  } finally {
    if (db) await db.$disconnect();
    if (started) run('pg_ctl', ['-D', dataDir, '-m', 'immediate', '-w', 'stop']);
    rmSync(dir, { recursive: true, force: true });
  }
});
