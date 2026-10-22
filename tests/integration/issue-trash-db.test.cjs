const { assert, test, load } = require('../security/helpers.cjs');
const { Prisma, PrismaClient } = require('@prisma/client');
const { randomUUID } = require('node:crypto');

const url = process.env.COLLAB_TRASH_TEST_DATABASE_URL;
test('PostgreSQL retains issue content through Trash/Restore, filters nested reads, and prevents cascade bypass', { skip: !url }, async () => {
  const raw = new PrismaClient({ datasources: { db: { url } } });
  const visibility = load('src/lib/issue-visibility.ts');
  const prisma = raw.$extends(visibility.issueVisibilityExtension(Prisma.dmmf.datamodel.models));
  const suffix = randomUUID();
  const owner = await raw.user.create({ data: { name: 'Trash fixture owner', expertise: [] } });
  const member = await raw.user.create({ data: { name: 'Trash fixture member', expertise: [] } });
  const outsider = await raw.user.create({ data: { name: 'Trash fixture outsider', expertise: [] } });
  const workspace = await raw.workspace.create({ data: { name: suffix, slug: suffix, ownerId: owner.id } });
  const project = await raw.project.create({ data: { name: suffix, slug: suffix, issuePrefix: 'TRASH', workspaceId: workspace.id } });
  await raw.workspaceMember.create({ data: { userId: member.id, workspaceId: workspace.id, role: 'MEMBER', expertise: [] } });
  const events = [];
  const dependencies = {
    'server-only': {}, '@/lib/prisma': { prisma, issueTrashPrisma: raw },
    '@/lib/permissions': load('src/lib/permissions.ts', { './prisma': { prisma } }),
    '@/lib/forge/legacy-write-guard': load('src/lib/forge/legacy-write-guard.ts', {
      'server-only': {}, '@/lib/prisma': { prisma, issueTrashPrisma: raw }, './reader': { readForgeBindings: async () => [] },
    }),
    '@/lib/event-bus': { emitIssueCreated: async issue => events.push(['restored', issue.id]), emitIssueDeleted: async issue => events.push(['deleted', issue.id]) },
  };
  const lifecycle = load('src/lib/issue-trash.ts', dependencies, { Date });
  const actor = { userId: owner.id, client: 'app', appId: 'fixture-cli', installationId: 'fixture-token' };
  let root;
  try {
    root = await prisma.issue.create({ data: { title: 'Keep this exact issue', issueKey: 'TRASH-1', projectId: project.id, workspaceId: workspace.id, reporterId: owner.id } });
    const child = await prisma.issue.create({ data: { title: 'Keep this relationship', issueKey: 'TRASH-2', parentId: root.id, projectId: project.id, workspaceId: workspace.id } });
    const comment = await prisma.issueComment.create({ data: { issueId: root.id, authorId: owner.id, content: 'Original comment' } });
    const relation = await prisma.issueRelation.create({ data: { sourceIssueId: root.id, targetIssueId: child.id, relationType: 'RELATES_TO', createdBy: owner.id } });
    const log = await prisma.workLog.create({ data: { issueId: root.id, workspaceId: workspace.id, userId: owner.id, timeSpent: 15, description: 'Original work' } });
    await raw.issueActivity.create({ data: { itemId: root.id, action: 'CREATED', userId: owner.id, workspaceId: workspace.id, projectId: project.id } });
    const input = { idOrKey: root.id, workspaceId: workspace.id, projectId: project.id, action: 'TRASHED', actor };
    const preview = await lifecycle.previewIssueTrash(owner.id, workspace.id, project.id, root.issueKey);
    assert.equal(preview.id, root.id);
    assert.deepEqual(JSON.parse(JSON.stringify(preview.counts)), { issues: 1, comments: 1, relations: 1, workLogs: 1 });
    await assert.rejects(lifecycle.changeIssueTrash({ ...input, projectId: 'wrong-project' }), error => error.status === 404);
    await assert.rejects(lifecycle.changeIssueTrash({ ...input, actor: { ...actor, userId: outsider.id } }), error => error.status === 404);
    await assert.rejects(prisma.issue.delete({ where: { id: root.id } }), /trash lifecycle/);
    await assert.rejects(raw.project.delete({ where: { id: project.id } }), error => error.code === 'P2003');

    // An audit write failure must roll the tombstone back with it.
    const failing = raw.$extends({ query: { issueDeletionAudit: { create() { throw new Error('audit unavailable'); } } } });
    const failingLifecycle = load('src/lib/issue-trash.ts', { ...dependencies, '@/lib/prisma': { prisma, issueTrashPrisma: failing } }, { Date });
    await assert.rejects(failingLifecycle.changeIssueTrash(input), /audit unavailable/);
    assert.equal((await raw.issue.findUnique({ where: { id: root.id } })).deletedAt, null);
    assert.equal(await raw.issueDeletionAudit.count({ where: { issueId: root.id } }), 0);
    assert.equal(events.length, 0);

    await lifecycle.changeIssueTrash(input);
    assert.equal(await prisma.issue.findUnique({ where: { id: root.id } }), null);
    assert.equal(await prisma.issue.count({ where: { projectId: project.id } }), 1);
    assert.equal(await prisma.issueComment.count({ where: { issueId: root.id } }), 0);
    assert.equal(await prisma.workLog.count({ where: { issueId: root.id } }), 0);
    assert.equal(await prisma.issueRelation.count({ where: { id: relation.id } }), 0);
    assert.equal(await prisma.$transaction(tx => tx.issue.count({ where: { projectId: project.id } })), 1);
    const projected = await prisma.project.findUnique({ where: { id: project.id }, include: { issues: true, _count: true } });
    assert.deepEqual(projected.issues.map(row => row.id), [child.id]);
    assert.equal(projected._count.issues, 1);
    assert.equal((await prisma.issue.findUnique({ where: { id: child.id }, include: { parent: true } })).parent, null);
    assert.equal(await prisma.project.count({ where: { id: project.id, issues: { some: { id: root.id } } } }), 0);
    await assert.rejects(prisma.issue.update({ where: { id: root.id }, data: { title: 'Should fail' } }), error => error.code === 'P2025');
    await assert.rejects(prisma.issueComment.update({ where: { id: comment.id }, data: { content: 'Should fail' } }), error => error.code === 'P2025');
    await assert.rejects(prisma.issueComment.create({ data: { issueId: root.id, authorId: owner.id, content: 'Should fail' } }), error => error.code === 'P2025');
    await assert.rejects(prisma.workLog.create({ data: { issueId: root.id, workspaceId: workspace.id, userId: owner.id, timeSpent: 1 } }), error => error.code === 'P2025');
    assert.deepEqual(await raw.issueComment.findUnique({ where: { id: comment.id } }), comment);
    assert.deepEqual(await raw.workLog.findUnique({ where: { id: log.id } }), log);
    assert.deepEqual(await raw.issueRelation.findUnique({ where: { id: relation.id } }), relation);
    await assert.rejects(raw.workspace.delete({ where: { id: workspace.id } }), error => error.code === 'P2003');
    await assert.rejects(lifecycle.assertNoRetainedIssues({ workspaceId: workspace.id }), error => error.status === 409);
    const trash = await lifecycle.listIssueTrash(owner.id, workspace.slug, project.id);
    assert.deepEqual(trash.issues.map(row => row.id), [root.id]);
    assert.equal(trash.canPurge, true);
    assert.equal((await lifecycle.listIssueTrash(member.id, workspace.id, project.id)).canPurge, false);

    await lifecycle.changeIssueTrash({ ...input, action: 'RESTORED' });
    const restored = await prisma.issue.findUnique({ where: { id: root.id }, include: { comments: true, children: true, sourceRelations: true } });
    assert.equal(restored.issueKey, 'TRASH-1');
    assert.equal(restored.comments[0].content, 'Original comment');
    assert.equal(restored.children[0].id, child.id);
    assert.equal(restored.sourceRelations[0].id, relation.id);
    assert.equal(await raw.issueActivity.count({ where: { itemId: root.id } }), 3);
    await assert.rejects(lifecycle.changeIssueTrash({ ...input, action: 'PURGED', actor: { userId: owner.id, client: 'browser' }, confirmIssueKey: 'TRASH-1' }), error => error.status === 404);
    await lifecycle.changeIssueTrash(input);
    await assert.rejects(lifecycle.changeIssueTrash({ ...input, action: 'PURGED', confirmIssueKey: 'TRASH-1' }), error => error.status === 403);
    await assert.rejects(lifecycle.changeIssueTrash({ ...input, action: 'PURGED', actor: { userId: member.id, client: 'browser' }, confirmIssueKey: 'TRASH-1' }), error => error.status === 403);
    await assert.rejects(lifecycle.changeIssueTrash({ ...input, action: 'PURGED', actor: { userId: owner.id, client: 'browser' }, confirmIssueKey: 'TRASH-2' }), error => error.status === 400);
    await lifecycle.changeIssueTrash({ ...input, action: 'PURGED', actor: { userId: owner.id, client: 'browser' }, confirmIssueKey: 'TRASH-1' });
    assert.equal(await raw.issue.findUnique({ where: { id: root.id } }), null);
    assert.equal(await raw.issueComment.count({ where: { id: comment.id } }), 0);
    const audit = await raw.issueDeletionAudit.findMany({ where: { issueId: root.id }, orderBy: { createdAt: 'asc' } });
    assert.deepEqual(audit.map(row => row.action), ['TRASHED', 'RESTORED', 'TRASHED', 'PURGED']);
    assert.equal(audit[0].actorId, owner.id);
    assert.equal(audit[0].client, 'app');
    assert.equal(audit[0].appId, actor.appId);
    assert.equal(audit[3].client, 'browser');
    assert.equal(audit[3].issueKey, root.issueKey);
    assert.equal((await raw.issue.findUnique({ where: { id: child.id } })).parentId, null);
  } finally {
    await raw.issue.deleteMany({ where: { workspaceId: workspace.id } });
    await raw.workspace.delete({ where: { id: workspace.id } });
    // Audit snapshots have no cascading parent relation.
    if (events.length === 4) assert.equal(await raw.issueDeletionAudit.count({ where: { issueId: root.id } }), 4);
    await raw.issueDeletionAudit.deleteMany({ where: { workspaceId: workspace.id } });
    await raw.user.deleteMany({ where: { id: { in: [owner.id, member.id, outsider.id] } } });
    await raw.$disconnect();
  }
});
