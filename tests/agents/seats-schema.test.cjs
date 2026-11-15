const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const { seatsDatabase } = require('./seats-db.cjs');

// Status names as projects have them, and the group each must get. `shipped` is final by its flag, not its name.
const groups = {
  canceled: 'done', waiting_for_deploy: 'done', shipped: 'done', testing_done: 'done',
  code_review: 'in_review', qa_testing: 'in_review', PR: 'in_review',
  blocked: 'blocked', in_progress: 'in_progress',
  prioritized: 'todo', stories: 'todo', sprint: 'todo',
};

let db;
after(() => db?.stop());

test('the seats migration over a database that already has rows', async t => {
  db = await seatsDatabase(async prisma => {
    await prisma.user.createMany({ data: ['owner', 'a', 'b', 'c', 'd'].map(id => ({ id, name: id })) });
    await prisma.workspace.create({ data: { id: 'w', name: 'Work', slug: 'work', ownerId: 'owner' } });
    await prisma.project.createMany({ data: ['p', 'q'].map(id => ({ id, workspaceId: 'w', name: id, slug: id, issuePrefix: id })) });
    await prisma.projectStatus.createMany({ data: Object.keys(groups).map(name => ({ projectId: 'p', name, displayName: name, isFinal: name === 'shipped' })) });
    await prisma.issue.createMany({ data: ['1', '2'].map(n => ({ id: `i${n}`, workspaceId: 'w', projectId: 'p', title: 'old', issueKey: `p-${n}` })) });
  });
  const { prisma } = db;
  const seat = (userId, role, extra = {}) => prisma.agentSeat.create({ data: { workspaceId: 'w', projectId: 'p', role, userId, name: userId, ...extra } });
  const run = (issueId, extra = {}) => prisma.agentRun.create({ data: { workspaceId: 'w', issueId, userId: 'owner', runner: 'test', generation: 'g', ...extra } });

  await t.test('every existing status gets its group from its name', async () => {
    const statuses = await prisma.$queryRaw`SELECT name, category FROM "ProjectStatus" WHERE "projectId" = 'p'`;
    assert.deepEqual(Object.fromEntries(statuses.map(status => [status.name, status.category])), groups);
  });

  await t.test('existing projects stay on handoffs and existing issues are not requests', async () => {
    const [project] = await prisma.$queryRaw`SELECT "agentMode", "agentSwitchedAt" FROM "Project" WHERE id = 'p'`;
    assert.equal(project.agentMode, 'handoffs'); assert.equal(project.agentSwitchedAt, null);
    const [issue] = await prisma.$queryRaw`SELECT "agentRequestRole" FROM "Issue" WHERE id = 'i1'`;
    assert.equal(issue.agentRequestRole, null);
  });

  await t.test('ordinary Prisma reads omit the new columns', async () => {
    const client = new PrismaClient({ datasources: { db: { url: db.url } }, log: [{ emit: 'event', level: 'query' }] });
    const queries = [];
    client.$on('query', event => queries.push(event.query));
    try {
      const project = await client.project.findUniqueOrThrow({ where: { id: 'p' }, include: { statuses: true, issues: true } });
      assert.equal(Object.hasOwn(project, 'agentMode'), false);
      assert.equal(Object.hasOwn(project, 'agentSwitchedAt'), false);
      assert.equal(Object.hasOwn(project.statuses[0], 'category'), false);
      assert.equal(Object.hasOwn(project.issues[0], 'agentRequestRole'), false);
      assert.ok(queries.length >= 3);
      for (const query of queries) assert.doesNotMatch(query, /"(?:agentMode|agentSwitchedAt|agentRequestRole|category)"/);
    } finally {
      await client.$disconnect();
    }
  });

  await t.test('an issue has one open run; a run that ended makes room for the next', async () => {
    const first = await run('i1');
    assert.equal(first.state, 'running'); assert.equal(first.leaseUntil, null);
    await assert.rejects(run('i1'), { code: 'P2002' });
    await run('i2');
    await prisma.agentRun.update({ where: { id: first.id }, data: { endedAt: new Date() } });
    await run('i1');
  });

  await t.test('a project has one active release seat; a retired one does not count', async () => {
    const release = await seat('a', 'release');
    await assert.rejects(seat('b', 'release'), { code: 'P2002' });
    await prisma.agentSeat.create({ data: { workspaceId: 'w', projectId: 'q', role: 'release', userId: 'b', name: 'b' } });
    await prisma.agentSeat.update({ where: { id: release.id }, data: { retiredAt: new Date() } });
    await seat('c', 'release');
    await assert.rejects(seat('c', 'developer'), { code: 'P2002' }, 'one account is one seat');
  });

  await t.test('a project has one default seat per role; other seats of the role are allowed', async () => {
    await prisma.agentSeat.deleteMany();
    await seat('a', 'developer', { isDefault: true });
    await seat('b', 'developer');
    await assert.rejects(seat('c', 'developer', { isDefault: true }), { code: 'P2002' });
    await seat('c', 'reviewer', { isDefault: true });
    await prisma.agentSeat.updateMany({ where: { userId: 'a' }, data: { retiredAt: new Date() } });
    await seat('d', 'developer', { isDefault: true });
  });
});
