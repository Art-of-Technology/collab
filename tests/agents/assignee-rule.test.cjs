const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('../security/helpers.cjs');
const { seatsDatabase } = require('./seats-db.cjs');

// Token-facing routes accept only cuid-shaped ids.
const owner = 'cowner00001', active = 'cactive0001', switchedOff = 'cswitchedoff1', stranger = 'cstranger001';
const project = 'cprojectw001';

let db;
after(() => db?.stop());

test('who may be assigned an issue is one rule on every path that sets an assignee', async t => {
  db = await seatsDatabase(async prisma => {
    await prisma.user.createMany({ data: [owner, active, switchedOff, stranger].map(id => ({ id, name: id })) });
    await prisma.workspace.create({ data: { id: 'w', name: 'w', slug: 'w', ownerId: owner } });
    await prisma.workspaceMember.createMany({ data: [{ workspaceId: 'w', userId: active }, { workspaceId: 'w', userId: switchedOff, status: false }] });
    await prisma.project.create({ data: { id: project, workspaceId: 'w', name: 'w', slug: 'w', issuePrefix: 'w' } });
  });
  const { prisma } = db;
  const finder = load('src/lib/issue-finder.ts', { '@/lib/prisma': { prisma } });
  const handoffs = load('src/lib/agent-handoffs.ts', { 'node:crypto': require('node:crypto'), 'node:buffer': require('node:buffer'), zod: require('zod'),
    '@/lib/prisma': { prisma }, '@/lib/issue-finder': finder, '@/lib/oauth-scopes': load('src/lib/oauth-scopes.ts') }, { Date });
  const deps = { zod: require('zod'), '@prisma/client': require('@prisma/client'), 'next/server': { NextResponse: Response },
    '@/lib/prisma': { prisma }, '@/lib/issue-finder': finder,
    '@/lib/issue-assignee': load('src/lib/issue-assignee.ts', { './agent-handoffs': handoffs }),
    '@/lib/agent-label-triggers': load('src/lib/agent-label-triggers.ts', { 'node:crypto': require('node:crypto') }),
    '@/lib/permissions': { Permission: {}, canActOnOwnContent: () => true, checkUserPermission: async () => ({ hasPermission: true }),
      checkUserPermissions: async () => ({ undefined: { hasPermission: true } }) },
    '@/utils/html-normalizer': { normalizeDescriptionHTML: value => value },
    '@/lib/forge/legacy-write-guard': { assertLegacyProjectWriteAllowed: async () => {}, assertLegacyIssueWriteAllowed: async () => {}, ForgeProjectWriteError: class extends Error {} },
    '@/lib/apps/auth-middleware': { withAppAuth: handler => handler },
    '@/lib/event-bus': { emitIssueCreated: async () => {}, emitIssueUpdated: async () => {} },
    '@/lib/request-session': { getServerSession: async () => ({ user: { id: owner } }) }, '@/lib/auth-options': {},
    '@/lib/session': { getCurrentUser: async () => ({ id: owner }) },
    '@/lib/board-item-activity-service': { trackCreation: async () => {} }, '@/lib/redis': { publishEvent: async () => {} },
    '@/utils/mentions': { extractMentionUserIds: () => [] },
    '@/lib/notification-service': { NotificationService: { notifyUsers: async () => {} }, NotificationType: {} }, '@/utils/issueRelations': {},
  };
  deps['@/lib/issue-mutation'] = load('src/lib/issue-mutation.ts', deps);
  const globals = { console, URL, Date };
  const web = load('src/app/api/issues/route.ts', deps, globals);
  const collection = load('src/app/api/apps/auth/issues/route.ts', deps, globals);
  const item = load('src/app/api/apps/auth/issues/[issueIdOrKey]/route.ts', deps, globals);
  const assignment = load('src/app/api/apps/auth/issues/[issueIdOrKey]/assign/route.ts', deps, globals);
  const assistant = load('src/app/api/ai/action/route.ts', deps, globals);

  const token = { user: { id: owner }, workspace: { id: 'w' }, token: { scopes: ['issues:read', 'issues:write'] } };
  const request = (method, body) => new Request('https://example.test/api', { method, body: JSON.stringify(body) });
  let count = 0;
  const existing = async () => (await prisma.issue.create({ data: { workspaceId: 'w', projectId: project, title: 'Existing', issueKey: `w-${++count}`, assigneeId: owner } })).id;
  const at = id => ({ params: Promise.resolve({ issueIdOrKey: id }) });
  const stored = async where => prisma.issue.findFirst({ where });
  const created = async (title, send) => [(await send(title)).status, await stored({ title })];
  const updated = async send => { const id = await existing(); return [(await send(id)).status, await stored({ id })]; };
  const paths = {
    'web create': userId => created(`web ${++count}`, title => web.POST(request('POST', { title, workspaceId: 'w', projectId: project, assigneeId: userId }))),
    'web update': userId => updated(async id => { const result = await deps['@/lib/issue-mutation'].updateIssue(owner, id, { assigneeId: userId }, 'w'); return { status: result.status ?? 200 }; }),
    'assistant create': userId => created(`assistant ${++count}`, title => assistant.POST(request('POST', { action: { type: 'create_issue', params: { title, projectId: project, assigneeId: userId } }, context: { workspace: { id: 'w' } } }))),
    'token create': userId => created(`token ${++count}`, title => collection.POST(request('POST', { title, projectId: project, assigneeId: userId }), token)),
    'token update': userId => updated(id => item.PATCH(request('PATCH', { assigneeId: userId }), token, at(id))),
    'token assign': userId => updated(id => assignment.POST(request('POST', { assigneeId: userId }), token, at(id))),
  };

  for (const [path, assign] of Object.entries(paths)) {
    await t.test(`${path}: refused for a switched-off membership and for a stranger, accepted for an active member and the owner`, async () => {
      for (const userId of [switchedOff, stranger]) {
        const [status, issue] = await assign(userId);
        assert.equal(status, 400, `${userId} got ${status}`);
        if (path.includes('create')) assert.equal(issue, null);
        else assert.equal(issue?.assigneeId, owner);
      }
      for (const userId of [active, owner]) {
        const started = new Date();
        const [status, issue] = await assign(userId);
        assert.ok(status >= 200 && status < 300, `${userId} got ${status}`);
        assert.equal(issue?.assigneeId, userId);
        if (path.includes('create') || userId === owner) continue;
        // A change of assignee records when: the seat inbox counts an issue's last run only if it ended after this.
        const row = await prisma.issueAssignee.findUnique({ where: { issueId_userId: { issueId: issue.id, userId } } });
        assert.ok(row?.approvedAt >= started, `${path} did not record when the issue was assigned`);
      }
    });
  }

  await t.test('token paths name the refusal', async () => {
    const response = await assignment.POST(request('POST', { assigneeId: switchedOff }), token, at(await existing()));
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, 'assignee_not_found');
  });

  await t.test('web create rejects non-string assignees without creating an issue', async () => {
    for (const value of [false, 0, true, 1, {}, []]) {
      const title = `invalid ${++count}`;
      const response = await web.POST(request('POST', { title, workspaceId: 'w', projectId: project, assigneeId: value }));
      assert.equal(response.status, 400);
      assert.equal(await prisma.issue.count({ where: { title } }), 0);
    }
  });

  await t.test('web create with no assignee, or null as the assignee selector sends for Unassigned, creates an unassigned issue', async () => {
    for (const body of [{}, { assigneeId: null }]) {
      const title = `unassigned ${++count}`;
      const response = await web.POST(request('POST', { title, workspaceId: 'w', projectId: project, ...body }));
      assert.equal(response.status, 201, await response.clone().text());
      assert.equal((await prisma.issue.findFirstOrThrow({ where: { title } })).assigneeId, null);
    }
  });

  await t.test('onboarding checks the welcome assignee in its transaction', async () => {
    await prisma.statusTemplate.create({ data: { name: 'todo', displayName: 'To Do', order: 0, isDefault: true } });
    const rule = deps['@/lib/issue-assignee'];
    const onboarding = assignmentRule => load('src/lib/onboarding-helpers.ts', {
      '@/lib/prisma': { prisma }, '@/lib/seed-status-templates': { ensureDefaultStatusTemplates: async () => {} },
      '@/lib/issue-assignee': { assertAssignable: assignmentRule },
    });
    const result = await onboarding(rule.assertAssignable).createPersonalWorkspaceForUser(active, 'Active');
    assert.equal(result.welcomeIssue.assigneeId, active);
    await assert.rejects(onboarding(async (tx, issue, userId) => {
      await rule.assertAssignable(tx, issue, userId);
      throw new rule.HandoffError('assignee_not_found', 'Refused');
    }).createPersonalWorkspaceForUser(stranger, 'Stranger'), { code: 'assignee_not_found' });
    assert.equal(await prisma.workspace.count({ where: { ownerId: stranger } }), 0);
  });
});
