const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { Prisma } = require('@prisma/client');
const { load } = require('../security/helpers.cjs');
const { seatsDatabase } = require('./seats-db.cjs');

const startedAt = new Date('2026-11-22T12:00:00Z');
let db, route;
before(async () => {
  db = await seatsDatabase(async prisma => {
    await prisma.user.createMany({ data: [
      { id: 'reader', name: 'Reader', email: 'reader@example.test' },
      { id: 'reviewer', name: 'Security Reviewer', email: 'reviewer@example.test' },
    ] });
    await prisma.workspace.createMany({ data: [
      { id: 'local', name: 'Local', slug: 'local', ownerId: 'reader' },
      { id: 'other', name: 'Other', slug: 'other', ownerId: 'reviewer' },
    ] });
    await prisma.project.createMany({ data: [
      { id: 'app', workspaceId: 'local', name: 'Application', slug: 'app', issuePrefix: 'APP' },
      { id: 'checks', workspaceId: 'local', name: 'Checks', slug: 'checks', issuePrefix: 'CHECKS' },
      { id: 'other-app', workspaceId: 'other', name: 'Other App', slug: 'other-app', issuePrefix: 'OTHER' },
    ] });
  });
  await db.prisma.projectStatus.create({ data: { id: 'closed', projectId: 'checks',
    name: 'closed', displayName: 'Closed', category: 'done' } });
  const prisma = db.prisma.$extends(load('src/lib/issue-visibility.ts').issueVisibilityExtension(Prisma.dmmf.datamodel.models));
  const deps = { '@/lib/prisma': { prisma }, zod: require('zod'), 'next/server': { NextResponse: Response },
    '@/lib/agent-tokens': {}, '@/lib/permissions': { Permission: { ASSIGN_TASK: 'assign' }, checkUserPermission: async () => ({ hasPermission: true }) },
    '@/lib/session': { getCurrentUser: async () => ({ id: 'reader' }) }, '@/lib/gateway-identity': { authMode: () => 'nextauth' } };
  const handoffs = load('src/lib/agent-handoffs.ts', { ...deps, 'node:crypto': require('node:crypto'), 'node:buffer': require('node:buffer'),
    '@/lib/oauth-scopes': load('src/lib/oauth-scopes.ts') });
  deps['@/lib/agent-seats'] = load('src/lib/agent-seats.ts', { ...deps, '@/lib/agent-handoffs': handoffs });
  deps['@/lib/agent-runs'] = load('src/lib/agent-runs.ts', deps);
  deps['@/lib/agent-handoff-http'] = load('src/lib/agent-handoff-http.ts', { ...deps, './agent-handoffs': handoffs }, { console });
  route = load('src/app/api/issues/[issueId]/runs/route.ts', deps);
});
after(() => db?.stop());

const issue = (issueKey, data = {}, prisma = db.prisma) => prisma.issue.create({ data: {
  issueKey, title: issueKey, workspaceId: 'local', projectId: 'app', ...data,
} });
const link = (source, target, relationType, prisma = db.prisma) => prisma.issueRelation.create({ data: {
  sourceIssueId: source.id, targetIssueId: target.id, relationType, createdBy: 'reader',
} });
// Filing writes the issue and its original link in the same transaction.
const filed = (issueKey, target, role, relationType, data = {}) => db.prisma.$transaction(async tx => {
  const request = await issue(issueKey, { agentRequestRole: role, reporterId: 'reader', ...data }, tx);
  await link(request, target, relationType, tx);
  return request;
});
const activity = (target, action, details, userId = 'reader') => db.prisma.issueActivity.create({ data: {
  itemId: target.id, workspaceId: target.workspaceId, projectId: target.projectId, action, userId, details: JSON.stringify(details),
} });
const read = async target => {
  const reply = await route.GET(new Request('https://collab.test/api'), { params: Promise.resolve({ issueId: target.id }) });
  const body = await reply.json();
  assert.equal(reply.status, 200, JSON.stringify(body));
  return body;
};

test('the runs answer lists the latest request of each role and where it stands', async () => {
  const target = await issue('APP-1');
  const security = await filed('CHECKS-1', target, 'security', 'BLOCKS', { projectId: 'checks' });
  const securityDetails = { requestId: security.id, requestKey: security.issueKey };
  await activity(target, 'SECURITY_REQUESTED', securityDetails);
  const older = await filed('CHECKS-2', target, 'review', 'RELATES_TO', { projectId: 'checks',
    createdAt: new Date('2026-11-22T10:00:00Z') });
  const newer = await filed('CHECKS-3', target, 'review', 'RELATES_TO', { projectId: 'checks',
    createdAt: new Date('2026-11-22T11:00:00Z'), statusId: 'closed' });
  await db.prisma.issue.update({ where: { id: older.id }, data: { updatedAt: new Date('2026-11-22T12:30:00Z') } });
  const { id: runId } = await db.prisma.agentRun.create({ data: {
    issueId: target.id, workspaceId: 'local', userId: 'reader', runner: 'test', generation: 'g1', startedAt,
  } });

  const open = await read(target);
  assert.deepEqual(open.run, { id: runId, by: 'Reader', state: 'running', clearable: true, startedAt: startedAt.toISOString() });
  const review = { role: 'review', requestKey: newer.issueKey, state: 'done' };
  const securityOpen = { requestKey: security.issueKey, state: 'open' };
  assert.deepEqual(open.security, [securityOpen]);
  assert.deepEqual(open.requests?.sort((a, b) => a.role.localeCompare(b.role)), [review, { role: 'security', ...securityOpen }]);

  await db.prisma.issue.update({ where: { id: security.id }, data: { statusId: 'closed' } });
  const closed = await read(target);
  assert.deepEqual(closed.requests.find(request => request.role === 'security'), { role: 'security', ...securityOpen, state: 'closed' });

  const verdict = { verdict: 'passed', reviewed: 'PR 12 at abc1234' };
  await activity(target, 'SECURITY_VERDICT', { ...securityDetails, ...verdict }, 'reviewer');
  const passed = await read(target);
  const securityPassed = { requestKey: security.issueKey, state: 'passed', reviewed: verdict.reviewed, by: 'Security Reviewer' };
  assert.deepEqual(passed.security, [securityPassed]);
  assert.deepEqual(passed.requests.sort((a, b) => a.role.localeCompare(b.role)), [review, { role: 'security', ...securityPassed }]);
});

test('a request filed for another issue is not listed', async () => {
  const target = await issue('APP-2');
  const another = await issue('APP-3');
  const unrelated = await filed('APP-4', another, 'release', 'BLOCKS');
  await link(target, unrelated, 'RELATES_TO');
  await link(unrelated, target, 'RELATES_TO');
  const ordinary = await issue('APP-5');
  await link(ordinary, target, 'RELATES_TO');
  await filed('OTHER-1', target, 'developer', 'BLOCKS', { projectId: 'other-app', workspaceId: 'other', reporterId: 'reviewer' });

  assert.deepEqual(await read(target), { run: null, security: [], requests: [] });
  assert.deepEqual((await read(another)).requests, [{ role: 'release', requestKey: unrelated.issueKey, state: 'open' }]);
});
