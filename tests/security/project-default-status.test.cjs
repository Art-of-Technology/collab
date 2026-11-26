const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers.cjs');
const { seatsDatabase } = require('../agents/seats-db.cjs');

// Token-facing routes accept only cuid-shaped ids.
const owner = 'cowner00001', newcomer = 'cnewcomer001';
const legacy = 'cprojectold1';

let db;
after(() => db?.stop());

test('a project has one default status, and a new issue starts in the first one by order (CLB-524)', async t => {
  const statuses = load('src/constants/project-statuses.ts');
  // The settings page saves this set, flags included, for a project that has no statuses.
  assert.equal(statuses.DEFAULT_PROJECT_STATUSES.filter(status => status.isDefault).map(status => status.name).join(), 'backlog');
  // Stored last status first, so a read without an order returns "done" first.
  const standard = [...statuses.DEFAULT_PROJECT_STATUSES].reverse();
  db = await seatsDatabase(async prisma => {
    await prisma.user.createMany({ data: [owner, newcomer].map(id => ({ id, name: id })) });
    await prisma.workspace.create({ data: { id: 'w', name: 'w', slug: 'w', ownerId: owner } });
    // As `seedDefaultStatusTemplates` writes them: on a template, isDefault means "part of the standard set".
    for (const { name, displayName, color, order } of standard) await prisma.statusTemplate.create({ data: { name, displayName, color, order, isDefault: true } });
    // A project made before the fix: every status is stored as the default.
    await prisma.project.create({ data: { id: legacy, workspaceId: 'w', name: 'old', slug: 'old', issuePrefix: 'OLD' } });
    for (const [order, name] of [[2, 'done'], [1, 'in_progress'], [0, 'todo']]) await prisma.projectStatus.create({ data: { id: `${legacy}-${name}`, projectId: legacy, name, displayName: name, order, isDefault: true } });
  });
  const { prisma } = db;
  const defaults = async projectId => (await prisma.projectStatus.findMany({ where: { projectId, isDefault: true }, orderBy: { order: 'asc' } })).map(status => status.name);
  const finals = async projectId => (await prisma.projectStatus.findMany({ where: { projectId, isFinal: true } })).map(status => status.name);

  const finder = load('src/lib/issue-finder.ts', { '@/lib/prisma': { prisma } });
  const session = { getServerSession: async () => ({ user: { id: owner } }) };
  const request = body => new Request('https://example.test/api', { method: 'POST', body: JSON.stringify(body) });

  await t.test('web create: only the first to do status is the default', async () => {
    const { POST } = load('src/app/api/workspaces/[workspaceId]/projects/route.ts', { 'next/server': { NextResponse: Response }, '@/lib/request-session': session, '@/lib/auth': {},
      '@/lib/prisma': { prisma }, '@/lib/issue-finder': finder, '@/lib/slug-resolvers': { resolveWorkspaceSlug: async value => value },
      '@/lib/utils': { generateUniqueViewSlug: async () => 'web-made-default' }, '@/constants/project-statuses': statuses,
      // The workspace rule for seats (CLB-519) is off here; tests/agents/seat-rule.test.cjs runs it.
      '@/lib/agent-seat-setup': { applySeatRule: async () => ({ mode: 'handoffs', seats: [] }) } }, { console });
    const response = await POST(request({ name: 'Web made' }), { params: Promise.resolve({ workspaceId: 'w' }) });
    assert.equal(response.status, 201, JSON.stringify(await response.clone().json()));
    const { id } = (await response.json()).project;
    assert.equal(await prisma.projectStatus.count({ where: { projectId: id } }), 5);
    assert.deepEqual([await defaults(id), await finals(id)], [['backlog'], ['done']]);
  });

  await t.test('onboarding: only the first to do status is the default, and the welcome issue starts there', async () => {
    const { createPersonalWorkspaceForUser } = load('src/lib/onboarding-helpers.ts', { '@/lib/prisma': { prisma }, '@/constants/project-statuses': statuses,
      '@/lib/seed-status-templates': load('src/lib/seed-status-templates.ts', { '@/lib/prisma': { prisma }, '@/constants/project-statuses': statuses }, { console }) }, { console });
    await createPersonalWorkspaceForUser(newcomer, 'New Comer');
    const project = await prisma.project.findFirstOrThrow({ where: { workspace: { ownerId: newcomer } }, include: { issues: { include: { projectStatus: true } } } });
    assert.deepEqual([await defaults(project.id), await finals(project.id)], [['backlog'], ['done']]);
    assert.deepEqual(project.issues.map(issue => issue.projectStatus.name), ['backlog']);
  });

  // The stored rows of older projects stay as they are until the data migration; a reader must not depend on row order.
  const deps = { zod: require('zod'), '@prisma/client': require('@prisma/client'), 'next/server': { NextResponse: Response }, '@/lib/prisma': { prisma }, '@/lib/issue-finder': finder,
    '@/lib/agent-label-triggers': load('src/lib/agent-label-triggers.ts', { 'node:crypto': require('node:crypto') }),
    '@/lib/permissions': { Permission: {}, checkUserPermission: async () => ({ hasPermission: true }) },
    '@/lib/forge/legacy-write-guard': { assertLegacyProjectWriteAllowed: async () => {}, assertLegacyIssueWriteAllowed: async () => {}, ForgeProjectWriteError: class extends Error {} },
    '@/lib/apps/auth-middleware': { withAppAuth: handler => handler }, '@/lib/event-bus': { emitIssueCreated: async () => {} },
    '@/lib/request-session': session, '@/lib/auth-options': {}, '@/lib/board-item-activity-service': { trackCreation: async () => {} }, '@/lib/redis': { publishEvent: async () => {} },
    '@/utils/mentions': { extractMentionUserIds: () => [] }, '@/lib/notification-service': { NotificationService: { notifyUsers: async () => {} }, NotificationType: {} }, '@/utils/issueRelations': {} };
  const token = { user: { id: owner }, workspace: { id: 'w' }, token: { scopes: ['issues:read', 'issues:write'] } };
  const web = load('src/app/api/issues/route.ts', deps, { console, URL, Date });
  const collection = load('src/app/api/apps/auth/issues/route.ts', deps, { console, URL, Date });
  for (const [path, send] of Object.entries({
    'web issue': title => web.POST(request({ title, workspaceId: 'w', projectId: legacy })),
    'token issue': title => collection.POST(request({ title, projectId: legacy }), token),
  })) {
    await t.test(`${path}: where every status is stored as the default, an issue without a status starts in the first by order`, async () => {
      const response = await send(path);
      assert.ok(response.status >= 200 && response.status < 300, `${response.status} ${JSON.stringify(await response.clone().json())}`);
      assert.equal((await prisma.issue.findFirstOrThrow({ where: { title: path } })).statusId, `${legacy}-todo`);
    });
  }
});
