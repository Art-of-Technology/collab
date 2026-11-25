const { assert, test, load } = require('./helpers.cjs');
const { after, before } = require('node:test');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, readFileSync, rmSync, statSync } = require('node:fs');
const { tmpdir, userInfo } = require('node:os');
const { join } = require('node:path');
const { Prisma, PrismaClient } = require('@prisma/client');

const now = new Date('2026-10-23T12:00:00.000Z');
const date = days => new Date(now.getTime() + days * 86400000);
const plain = value => JSON.parse(JSON.stringify(value));
const visibility = load('src/lib/issue-visibility.ts').issueVisibilityExtension(Prisma.dmmf.datamodel.models);
let directory, pgCtl, serverLog, logOffset, started, db;

before(() => {
  const bindir = execFileSync('pg_config', ['--bindir'], { encoding: 'utf8' }).trim();
  pgCtl = join(bindir, 'pg_ctl');
  directory = mkdtempSync(join(tmpdir(), 'collab-home-pg-'));
  const data = join(directory, 'data');
  serverLog = join(directory, 'server.log');
  execFileSync(join(bindir, 'initdb'), ['-D', data, '-A', 'trust', '--no-locale', '-E', 'UTF8'], { stdio: 'pipe' });
  // Compare due dates against UTC even when the database session uses a local time zone.
  execFileSync(pgCtl, ['-D', data, '-l', serverLog, '-o',
    `-k ${directory} -c listen_addresses='' -c fsync=off -c TimeZone=America/Los_Angeles -c log_line_prefix=pg:%p: -c log_statement=all -c log_parameter_max_length=0`,
    '-w', 'start'], { stdio: 'pipe' });
  started = true;
  const user = userInfo().username;
  const url = `postgresql://${encodeURIComponent(user)}@localhost/postgres?host=${encodeURIComponent(directory)}`;
  const schema = execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'diff',
    '--from-empty', '--to-schema-datamodel', 'prisma/schema.prisma', '--script'],
    { env: { ...process.env, DATABASE_URL: url } });
  execFileSync(join(bindir, 'psql'), ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-h', directory, '-U', user, '-d', 'postgres'],
    { input: schema, stdio: ['pipe', 'pipe', 'pipe'] });
  db = new PrismaClient({ datasources: { db: { url } } });
});

after(async () => {
  await db?.$disconnect();
  if (started) execFileSync(pgCtl, ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'], { stdio: 'pipe' });
  if (directory) rmSync(directory, { recursive: true, force: true });
});

async function fixture(access = 'member', options = {}) {
  const workspace = { id: 'workspace', ownerId: access === 'owner' ? 'alice' : 'bob',
    members: access === 'foreign' || access === 'owner' ? [] : [{ userId: 'alice', status: access !== 'inactive', role: 'MEMBER' }] };
  const foreign = { id: 'foreign', ownerId: 'mallory', members: [] };
  const revoked = { id: 'revoked', ownerId: 'mallory', members: [{ userId: 'alice', status: false }] };
  const makeProject = (id, extra = {}) => ({ id, slug: id, name: id === 'p0' ? 'Alpha' : id === 'p1' ? 'Beta' : `Project ${id}`,
    color: null, workspaceId: workspace.id, issuePrefix: id, isArchived: false, updatedAt: date(20), ...extra });
  const projects = [
    ...Array.from({ length: 12 }, (_, i) => makeProject(`p${i}`, { isArchived: i === 1 ? null : false })),
    makeProject('archived', { isArchived: true }),
    makeProject('foreign-project', { workspaceId: foreign.id }),
    makeProject('revoked-project', { workspaceId: revoked.id }),
  ];
  const status = (id, projectId, isFinal, extra = {}) => ({ id, name: id, projectId,
    isFinal, isActive: true, displayName: id, ...extra });
  const statuses = [status('custom-final', 'p1', true, { isActive: false, displayName: 'Released' }),
    status('nonfinal-done', 'p1', false, { displayName: 'Done' }), status('foreign-status', 'foreign-project', false)];
  const issue = (id, extra = {}) => ({
    id, issueKey: `CLB-${id}`, title: id, workspaceId: workspace.id,
    projectId: 'p0', assigneeId: 'alice', statusId: null, status: 'open', statusValue: null,
    dueDate: date(-1), updatedAt: date(-2), deletedAt: null, ...extra,
  });
  const issues = [
    ...Array.from({ length: 12 }, (_, i) => issue(`overdue-${i.toString().padStart(2, '0')}`, { dueDate: date(-20 + i), assigneeId: i % 2 ? 'bob' : 'alice' })),
    issue('due-now', { dueDate: now }), issue('due-boundary', { projectId: 'p1', dueDate: date(7) }),
    issue('later', { projectId: 'p1', dueDate: date(7.01), assigneeId: 'bob' }),
    issue('undated', { projectId: 'p1', dueDate: null }),
    issue('legacy-done', { status: ' DONE ', updatedAt: now }),
    issue('legacy-value', { status: 'open', statusValue: '\tCompleted\u00a0', updatedAt: date(-0.1) }),
    issue('custom-final', { projectId: 'p1', statusId: 'custom-final', updatedAt: date(-0.2) }),
    issue('nonfinal-done', { projectId: 'p1', statusId: 'nonfinal-done', status: 'done', assigneeId: 'bob' }),
    ...['Complete', 'Closed', 'Resolved', 'Cancelled', 'Canceled'].map(value => issue(`legacy-${value}`, { status: value })),
    issue('trashed', { deletedAt: now, updatedAt: date(1) }),
    issue('archived', { projectId: 'archived' }), issue('foreign-project', { projectId: 'foreign-project' }),
    issue('revoked-project', { projectId: 'revoked-project' }),
    issue('foreign-workspace', { workspaceId: foreign.id }),
    issue('foreign-status', { statusId: 'foreign-status', updatedAt: date(1) }),
    issue('cross-project-status', { statusId: 'custom-final', updatedAt: date(1) }),
  ];
  await db.$executeRaw`TRUNCATE "User" CASCADE`;
  await db.user.createMany({ data: ['alice', 'bob', 'mallory'].map(id => ({ id })) });
  for (const { id, ownerId, members } of [workspace, foreign, revoked]) {
    await db.workspace.create({ data: { id, name: id, slug: id, ownerId, members: { create: members } } });
  }
  if (access !== 'notes-only') {
    await db.rolePermission.create({ data: { workspaceId: workspace.id, role: 'MEMBER', permission: 'VIEW_TASKS' } });
  }
  if (!options.empty) {
    await db.project.createMany({ data: projects });
    await db.projectStatus.createMany({ data: statuses });
    await db.issue.createMany({ data: issues });
  }
  const database = db.$extends(visibility).$extends({
    query: {
      workspace: { findFirst({ args, query }) {
        if (options.workspaceFailure) throw new Error('private workspace lookup failure');
        return query(args);
      } },
      user: { async findUnique({ args, query }) {
        if (options.permissionFailure) throw new Error('private permission lookup failure');
        return access === 'deleted' ? null : query(args);
      } },
      project: { async findMany({ args, query }) {
        const rows = await query(args);
        if (options.revokeAfterProjectRead) {
          await db.workspaceMember.updateMany({ where: { workspaceId: workspace.id, userId: 'alice' }, data: { status: false } });
        }
        return rows;
      } },
      issue: { $allOperations({ args, query }) {
        if (options.failure) throw new Error('private database query failure');
        return query(args);
      } },
      $queryRaw({ args, query }) {
        if (options.failure) throw new Error('private database query failure');
        return query(args);
      },
    },
  });
  const deps = { 'server-only': {}, '@/lib/prisma': { prisma: database },
    '@/lib/permissions': load('src/lib/permissions.ts', { './prisma': { prisma: database } }, { console: { error() {} } }),
    '@/lib/post-access': load('src/lib/post-access.ts'),
  };
  const loader = load('src/lib/dashboard/workspace-overview.ts', deps).loadWorkspaceIssueOverview;
  return { issues, invoke: async input => {
    logOffset = statSync(serverLog).size;
    return loader({ actorId: 'alice', workspaceId: 'workspace', scope: 'all', projectSearch: '', projectPage: 1, now, ...input });
  } };
}

function payloadSql() {
  // PostgreSQL logs statements before execution. Prisma query events can arrive after the loader resolves.
  return readFileSync(serverLog).subarray(logOffset).toString('utf8')
    .split(/^pg:\d+:/m)
    .flatMap(entry => {
      const match = /^LOG:\s+(?:execute [^:]*|statement): ([\s\S]*)$/.exec(entry);
      return match && /"Project"|"Issue"/.test(match[1]) ? [match[1].trim()] : [];
    });
}

test('exact workspace totals exceed bounded attention rows and exclude terminal, archived, foreign and trashed work', async () => {
  const f = await fixture();
  const result = await f.invoke();
  assert.equal(result.kind, 'ready');
  assert.deepEqual(plain(result.summary), { visibleProjects: 12, projectsWithOpenWork: 2, openIssues: 17, overdueIssues: 13, dueSoonIssues: 2 });
  assert.equal(result.attention.length, 8);
  assert.deepEqual(plain(result.attention.map(row => row.id)), Array.from({ length: 8 }, (_, i) => `overdue-0${i}`));
  assert.equal(result.recent[0].id, 'legacy-done');
  assert.equal(result.recent.length, 6);
  assert.equal(result.projects[0].id, 'p0');
  assert.equal(result.projects[0].lastIssueUpdatedAt, now.toISOString(), 'latest actual issue date, not project timestamp');
  assert.equal(result.projects.find(row => row.id === 'p1').openIssues, 4, 'non-final linked status named Done remains open');
  assert.equal(result.projects.length, 10);
  assert.equal(result.projectPages, 2);
});

test('My work filters every issue query to the actor assignee; helpers or reporters do not qualify', async () => {
  const f = await fixture();
  await db.issue.update({ where: { id: 'later' }, data: { reporterId: 'alice', helpers: { create: { userId: 'alice' } } } });
  const result = await f.invoke({ scope: 'mine' });
  assert.equal(result.kind, 'ready');
  assert.deepEqual(plain(result.summary), { visibleProjects: 12, projectsWithOpenWork: 2, openIssues: 9, overdueIssues: 6, dueSoonIssues: 2 });
  assert.deepEqual(plain(result.attention.map(row => row.id)), ['overdue-00', 'overdue-02', 'overdue-04', 'overdue-06', 'overdue-08', 'overdue-10', 'due-now', 'due-boundary']);
  assert.ok(result.recent.every(row => f.issues.find(issue => issue.id === row.id).assigneeId === 'alice'));
});

test('search and page affect only the project table, keep exact global counts and clamp invalid pages', async () => {
  const f = await fixture();
  const first = await f.invoke();
  const searched = await f.invoke({ projectSearch: '  BETA ', projectPage: 999 });
  assert.deepEqual(plain(searched.summary), plain(first.summary));
  assert.deepEqual(plain(searched.attention), plain(first.attention));
  assert.equal(searched.projectSearch, 'BETA');
  assert.equal(searched.projects[0].id, 'p1');
  assert.equal(searched.matchingProjects, 1);
  assert.equal(searched.projectPage, 1);
  assert.equal((await f.invoke({ projectPage: 2 })).projects.length, 2);
  assert.equal((await f.invoke({ projectPage: NaN })).projectPage, 1);
  assert.equal((await f.invoke({ projectSearch: 'absent' })).matchingProjects, 0);
});

test('owner without a membership is allowed; inactive, foreign, deleted and notes-only actors get no payload', async () => {
  assert.equal((await (await fixture('owner')).invoke()).kind, 'ready');
  for (const access of ['inactive', 'foreign', 'deleted', 'notes-only']) {
    const f = await fixture(access);
    assert.deepEqual(plain(await f.invoke()), { kind: 'denied' }, access);
    assert.equal(payloadSql().length, 0, 'deny before project or issue payload queries');
  }
  const f = await fixture();
  assert.equal((await f.invoke({ workspaceId: 'foreign' })).kind, 'denied');
  assert.equal((await f.invoke({ actorId: '' })).kind, 'denied');
});

test('query failures are unavailable without raw errors; an empty workspace remains a successful zero state', async () => {
  assert.deepEqual(plain(await (await fixture('member', { failure: true })).invoke()), { kind: 'unavailable' });
  const f = await fixture('member', { empty: true });
  const result = await f.invoke();
  assert.equal(result.kind, 'ready');
  assert.equal(result.summary.visibleProjects, 0);
  assert.equal(result.summary.openIssues, 0);
  assert.deepEqual(plain(result.attention), []);
  assert.equal(result.projectPages, 1);
  assert.equal(payloadSql().some(sql => sql.includes('"Issue"')), false);
});

test('workspace and permission lookup errors are unavailable, never disguised as access denial', async () => {
  for (const option of ['workspaceFailure', 'permissionFailure']) {
    const f = await fixture('member', { [option]: true });
    assert.deepEqual(plain(await f.invoke()), { kind: 'unavailable' });
    assert.equal(payloadSql().length, 0, 'failed access checks must not read project or issue payloads');
  }
});

test('issue reads recheck membership after the project list was fetched', async () => {
  const f = await fixture('member', { revokeAfterProjectRead: true });
  const result = await f.invoke();
  assert.equal(result.kind, 'ready');
  assert.equal(result.summary.openIssues, 0);
  assert.equal(result.summary.overdueIssues, 0);
  assert.deepEqual(plain(result.attention), []);
  assert.deepEqual(plain(result.recent), []);
});

test('Prisma sends the same Home statements after adding projects with new statuses and issues', async () => {
  const f = await fixture();
  assert.equal((await f.invoke()).summary.visibleProjects, 12);
  const before = payloadSql();
  assert.ok(before.some(sql => sql.includes('"Issue"')));

  for (const id of ['extra-1', 'extra-2']) {
    await db.project.create({ data: { id, workspaceId: 'workspace', name: id, slug: id, issuePrefix: id } });
    await db.projectStatus.create({ data: { id, name: id, displayName: id, projectId: id } });
    await db.issue.create({ data: { id, title: id, workspaceId: 'workspace', projectId: id, statusId: id, dueDate: date(-1) } });
  }

  const result = await f.invoke();
  assert.equal(result.summary.visibleProjects, 14);
  assert.equal(result.summary.openIssues, 19);
  const after = payloadSql();
  assert.equal(after.length, before.length, 'the query count stays fixed');
  assert.deepEqual(after.map(sql => sql.length).sort(), before.map(sql => sql.length).sort(), 'statement sizes stay fixed');
  assert.deepEqual(after.sort(), before.sort(), 'statement text stays fixed');
  assert.equal(before.filter(sql => sql.includes('"Issue"')).length, 3);
});

test('the workspace dashboard counts no request', async () => {
  const f = await fixture();
  const work = { all: await f.invoke(), mine: await f.invoke({ scope: 'mine' }) };
  const request = (id, extra) => ({ id, issueKey: `CLB-${id}`, title: id, workspaceId: 'workspace', projectId: 'p0',
    assigneeId: 'alice', status: 'open', agentRequestRole: 'review', updatedAt: date(2), ...extra });
  await db.issue.createMany({ data: [
    request('request-overdue', { dueDate: date(-30) }),
    request('request-due-soon', { projectId: 'p1', dueDate: date(1) }),
    request('request-undated', { projectId: 'p2', dueDate: null }),
    request('request-done', { status: 'done', dueDate: date(-30) }),
  ] });

  for (const scope of ['all', 'mine']) {
    const before = work[scope];
    const result = await f.invoke({ scope });
    assert.equal(result.kind, 'ready');
    assert.deepEqual(plain(result.summary), plain(before.summary), `${scope}: counts are of the work alone`);
    assert.deepEqual(plain(result.projects), plain(before.projects), `${scope}: project rows are of the work alone`);
    for (const row of [...result.attention, ...result.recent]) {
      assert.ok(!row.id.startsWith('request-'), `${scope}: ${row.id} is a request`);
    }
  }
});
