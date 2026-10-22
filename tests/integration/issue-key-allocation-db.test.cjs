const { assert, test, load } = require('../security/helpers.cjs');
const { Prisma, PrismaClient } = require('@prisma/client');
const { randomUUID } = require('node:crypto');

const url = process.env.COLLAB_TRASH_TEST_DATABASE_URL;
test('all creation routes reserve retained keys, advance counters, and serialize concurrent allocations', { skip: !url }, async () => {
  const raw = new PrismaClient({ datasources: { db: { url } } });
  const visibility = load('src/lib/issue-visibility.ts');
  const prisma = raw.$extends(visibility.issueVisibilityExtension(Prisma.dmmf.datamodel.models));
  const suffix = randomUUID();
  const owner = await raw.user.create({ data: { name: 'Allocation owner', expertise: [] } });
  const workspace = await raw.workspace.create({ data: { name: suffix, slug: suffix, ownerId: owner.id } });
  const project = await raw.project.create({ data: { name: suffix, slug: suffix, issuePrefix: 'APP', workspaceId: workspace.id } });
  const deps = {
    'server-only': {}, 'next/server': { NextResponse: Response }, zod: require('zod'),
    '@/lib/prisma': { prisma, issueTrashPrisma: raw },
    '@/lib/session': { getCurrentUser: async () => owner },
    '@/lib/request-session': { getServerSession: async () => ({ user: owner }) },
    '@/lib/auth-options': {}, '@/lib/apps/auth-middleware': { withAppAuth: handler => handler },
    '@/lib/permissions': load('src/lib/permissions.ts', { './prisma': { prisma } }),
    '@/lib/issue-mutation': {},
    '@/lib/board-item-activity-service': { trackCreation: async () => {} },
    '@/lib/redis': { publishEvent: async () => {} },
    '@/utils/mentions': { extractMentionUserIds: () => [] },
    '@/lib/notification-service': { NotificationType: {} }, '@/utils/issueRelations': {},
    '@/lib/event-bus': { emitIssueCreated: async () => {}, emitIssueDeleted: async () => {} },
  };
  const globals = { Date, console, URL };
  const ai = load('src/app/api/ai/action/route.ts', deps, globals).POST;
  const browser = load('src/app/api/issues/route.ts', deps, globals).POST;
  const app = load('src/app/api/apps/auth/issues/route.ts', deps, globals).POST;
  const lifecycle = load('src/lib/issue-trash.ts', deps, globals);
  const allocation = load('src/lib/issue-key-allocation.ts');
  const context = { user: owner, workspace };
  const request = body => new Request('https://example.test', { method: 'POST', body: JSON.stringify(body) });
  const creators = [
    title => ai(request({ action: { type: 'create_issue', params: { title, projectId: project.id } }, context: { workspace: { id: workspace.id } } })),
    title => browser(request({ title, projectId: project.id, workspaceId: workspace.id })),
    title => app(request({ title, projectId: project.id }), context),
  ];
  try {
    await raw.issue.create({ data: { title: 'First', issueKey: 'APP-1', projectId: project.id, workspaceId: workspace.id } });
    const retained = await raw.issue.create({ data: { title: 'Historical AI issue', issueKey: 'APP-2', projectId: project.id, workspaceId: workspace.id } });
    const transition = { idOrKey: retained.id, workspaceId: workspace.id, projectId: project.id, actor: { userId: owner.id, client: 'browser' } };
    await lifecycle.changeIssueTrash({ ...transition, action: 'TRASHED' });
    assert.equal(await prisma.issue.count({ where: { projectId: project.id } }), 1);
    for (const [index, create] of creators.entries()) {
      await raw.project.update({ where: { id: project.id }, data: { nextIssueNumbers: { TASK: 1, BUG: 17 } } });
      const title = `Route ${index}`;
      const response = await create(title);
      assert.equal(response.status, index === 0 ? 200 : 201, await response.text());
      const created = await raw.issue.findFirst({ where: { projectId: project.id, title } });
      assert.equal(created.issueKey, `APP-${index + 3}`);
      const saved = await raw.project.findUnique({ where: { id: project.id } });
      assert.equal(saved.nextIssueNumbers.TASK, index + 4);
      assert.equal(saved.nextIssueNumbers.BUG, 17);
    }
    const responses = await Promise.all(Array.from({ length: 6 }, (_, index) => creators[index % 3](`Concurrent ${index}`)));
    for (const response of responses) assert.ok(response.ok, await response.text());
    const concurrent = await raw.issue.findMany({ where: { projectId: project.id, title: { startsWith: 'Concurrent' } } });
    assert.deepEqual(concurrent.map(row => row.issueKey).sort(), ['APP-6', 'APP-7', 'APP-8', 'APP-9', 'APP-10', 'APP-11'].sort());
    assert.equal((await raw.project.findUnique({ where: { id: project.id } })).nextIssueNumbers.TASK, 12);
    await assert.rejects(prisma.$transaction(async tx => {
      assert.equal(await allocation.allocateIssueKey(tx, project.id), 'APP-12');
      throw new Error('Rollback allocation');
    }), /Rollback allocation/);
    assert.equal((await raw.project.findUnique({ where: { id: project.id } })).nextIssueNumbers.TASK, 12);
    await lifecycle.changeIssueTrash({ ...transition, action: 'RESTORED' });
    const restored = await prisma.issue.findUnique({ where: { id: retained.id } });
    assert.equal(restored.issueKey, retained.issueKey);
    assert.equal(restored.title, retained.title);
    assert.equal(await prisma.issue.count({ where: { projectId: project.id } }), 11);
  } finally {
    await raw.issue.deleteMany({ where: { workspaceId: workspace.id } });
    await raw.workspace.delete({ where: { id: workspace.id } });
    await raw.issueDeletionAudit.deleteMany({ where: { workspaceId: workspace.id } });
    await raw.user.delete({ where: { id: owner.id } });
    await raw.$disconnect();
  }
});
