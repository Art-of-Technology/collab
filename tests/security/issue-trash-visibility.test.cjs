const test = require('node:test');
const assert = require('node:assert/strict');
const { Prisma } = require('@prisma/client');
const { load, matches } = require('./helpers.cjs');
const { issueVisibilityExtension } = load('src/lib/issue-visibility.ts');
const run = issueVisibilityExtension(Prisma.dmmf.datamodel.models).query.$allModels.$allOperations;
const plain = value => JSON.parse(JSON.stringify(value));
const argsFor = (model, operation, args = {}) => run({ model, operation, args, query: async args => plain(args) });
const active = { id: 'active', deletedAt: null };
const deleted = { id: 'deleted', deletedAt: new Date('2026-10-22') };

test('ordinary Issue reads, counts and mutations exclude trash while keeping unique selectors', async () => {
  for (const operation of ['findUnique', 'findUniqueOrThrow', 'findFirst', 'findMany', 'count', 'aggregate', 'groupBy', 'update', 'updateMany', 'upsert']) {
    const { where } = await argsFor('Issue', operation, { where: { id: 'active', OR: [{ title: 'match' }, {}] } });
    assert.equal(where.id, 'active');
    assert.equal(matches(active, where), true, operation);
    assert.equal(matches({ ...deleted, id: 'active' }, where), false, operation);
  }
  const args = await argsFor('Issue', 'update', { where: { issueKey_projectId: { issueKey: 'CLB-1', projectId: 'project' } }, data: { title: 'new' } });
  assert.deepEqual(args.where.issueKey_projectId, { issueKey: 'CLB-1', projectId: 'project' });
});

test('nested Issue collections, optional links and implicit counts exclude trash', async () => {
  const project = await argsFor('Project', 'findUnique', { where: { id: 'project' }, include: { issues: { include: { children: true, parent: true } }, _count: true } });
  assert.equal(matches(deleted, project.include.issues.where), false);
  assert.equal(matches(active, project.include.issues.where), true);
  assert.equal(matches(deleted, project.include.issues.include.children.where), false);
  assert.equal(matches(deleted, project.include.issues.include.parent.where), false);
  assert.equal(matches(deleted, project.include._count.select.issues.where), false);
  const branch = await argsFor('Branch', 'findMany', { include: { issue: true } });
  assert.equal(matches(deleted, branch.include.issue.where), false);
  assert.equal(branch.where, undefined, 'provider object itself remains visible when the Issue link is hidden');
});

test('required Issue links guard the containing row, never add invalid required-to-one where', async () => {
  const comment = await argsFor('IssueComment', 'findMany', { include: { issue: true, reactions: true } });
  assert.equal(comment.include.issue, true);
  assert.equal(matches({ issue: active }, comment.where), true);
  assert.equal(matches({ issue: deleted }, comment.where), false);
  const reaction = await argsFor('IssueCommentReaction', 'findUnique', { where: { id: 'reaction' }, include: { comment: { include: { issue: true } } } });
  assert.equal(reaction.include.comment.where, undefined);
  assert.equal(matches({ id: 'reaction', comment: { issue: deleted } }, reaction.where), false);
  const relation = await argsFor('IssueRelation', 'findMany');
  assert.equal(matches({ sourceIssue: active, targetIssue: deleted }, relation.where), false);
  assert.equal(matches({ sourceIssue: deleted, targetIssue: active }, relation.where), false);
  assert.equal(matches({ sourceIssue: active, targetIssue: active }, relation.where), true);
  const version = await argsFor('Version', 'findMany', { include: { issues: { include: { issue: true } }, _count: { select: { issues: true } } } });
  assert.equal(matches({ issue: deleted }, version.include.issues.where), false);
  assert.equal(matches({ issue: deleted }, version.include._count.select.issues.where), false);
});

test('relation predicates scope some/none/every while preserving explicit null links', async () => {
  const args = await argsFor('Project', 'findMany', { where: { issues: { some: { title: 'A' }, none: { title: 'B' }, every: { priority: 'high' } } } });
  assert.equal(matches({ ...deleted, title: 'A' }, args.where.issues.some), false);
  assert.equal(matches({ ...deleted, title: 'B' }, args.where.issues.none), false);
  assert.equal(matches({ ...deleted, priority: 'low' }, args.where.issues.every), true);
  assert.equal(matches({ ...active, priority: 'low' }, args.where.issues.every), false);
  const optional = await argsFor('Branch', 'findMany', { where: { issue: { is: null } } });
  assert.deepEqual(optional.where, { issue: { is: null } });
});

test('scalar foreign keys become atomic checked connects without mixing input forms', async () => {
  const data = { issueId: 'active', authorId: 'author', parentId: null, content: 'hello' };
  const comment = await argsFor('IssueComment', 'create', { data });
  assert.deepEqual(data, { issueId: 'active', authorId: 'author', parentId: null, content: 'hello' }, 'caller input is unchanged');
  assert.equal(comment.data.issueId, undefined);
  assert.equal(comment.data.authorId, undefined);
  assert.equal(comment.data.parentId, undefined);
  assert.deepEqual(comment.data.author, { connect: { id: 'author' } });
  assert.equal(comment.data.issue.connect.id, 'active');
  assert.equal(matches({ ...deleted, id: 'active' }, comment.data.issue.connect), false);
  const workLog = await argsFor('WorkLog', 'create', { data: { issueId: 'active', userId: 'user', loggedById: 'logger', workspaceId: 'workspace', timeSpent: 10 } });
  assert.equal(workLog.data.issueId, undefined);
  assert.deepEqual(workLog.data.workspace, { connect: { id: 'workspace' } });
  const update = await argsFor('Issue', 'update', { where: { id: 'child' }, data: { parentId: 'active', assigneeId: null } });
  assert.deepEqual(update.data.assignee, { disconnect: true });
  assert.equal(matches({ ...deleted, id: 'active' }, update.data.parent.connect), false);
});

test('ordinary operations cannot bypass lifecycle metadata, nested guards or permanent delete', async () => {
  await assert.rejects(argsFor('Issue', 'delete', { where: { id: 'active' } }), /trash lifecycle/);
  await assert.rejects(argsFor('Issue', 'deleteMany'), /trash lifecycle/);
  await assert.rejects(argsFor('Issue', 'update', { where: { id: 'active' }, data: { deletedAt: null } }), /trash lifecycle/);
  await assert.rejects(argsFor('Project', 'update', { where: { id: 'project' }, data: { issues: { delete: { id: 'active' } } } }), /guarded model operation/);
  await assert.rejects(argsFor('User', 'update', { where: { id: 'user' }, data: { ownedWorkspaces: { update: { where: { id: 'workspace' }, data: { projects: { update: { where: { id: 'project' }, data: { issues: { update: { where: { id: 'deleted' }, data: { title: 'hidden mutation' } } } } } } } } } } }), /guarded model operation/);
});

test('guarded bulk create and linking reject; ordinary bulk status changes remain supported', async () => {
  await assert.rejects(argsFor('IssueComment', 'createMany', { data: [{ issueId: 'deleted', authorId: 'author', content: 'hidden' }] }), /individually/);
  await assert.rejects(argsFor('Project', 'update', { where: { id: 'project' }, data: { issues: { createMany: { data: [{ title: 'bulk' }] } } } }), /individually/);
  await assert.rejects(argsFor('WorkLog', 'updateMany', { data: { issueId: 'deleted' } }), /individually/);
  const args = await argsFor('Issue', 'updateMany', { where: { projectId: 'project' }, data: { statusId: 'status' } });
  assert.deepEqual(args.data, { statusId: 'status' });
  assert.equal(matches({ ...deleted, projectId: 'project' }, args.where), false);
});

test('vector search discards stale deleted-issue and activity payloads after current DB checks', async () => {
  const points = [
    { id: 'a', payload: { type: 'issue', source_id: 'active' } },
    { id: 'd', payload: { type: 'issue', source_id: 'deleted' } },
    { id: 'aa', payload: { type: 'issue_activity', source_id: 'active-activity' } },
    { id: 'da', payload: { type: 'issue_activity', source_id: 'deleted-activity' } },
  ];
  let issueScope;
  const sync = load('src/lib/qdrant-sync.ts', {
    crypto: { default: require('node:crypto') },
    './embedding': { createEmbeddingService: () => ({ embed: async () => [1, 0, 0] }) },
    './qdrant-client': { withQdrantRetry: fn => fn(), qdrantClient: {
      getCollections: async () => ({ collections: [{ name: 'collab_context' }] }), search: async () => points,
    } },
    './prisma': { prisma: {
      issueActivity: { findMany: async () => [{ id: 'active-activity', itemId: 'active' }, { id: 'deleted-activity', itemId: 'deleted' }] },
      issue: { findMany: async ({ where }) => { issueScope = where; return [{ id: 'active' }]; } },
    } },
  }, { process: { env: {} }, console });
  const results = await sync.searchQdrant('hidden', { workspaceId: 'workspace', projectId: 'project' });
  assert.deepEqual(results.map(result => result.id), ['a', 'aa']);
  assert.equal(issueScope.workspaceId, 'workspace');
  assert.equal(issueScope.projectId, 'project');
});

test('activity search summary and workspace feed counts exclude retained historical rows', async () => {
  const activityRows = ['active', 'deleted'].map(id => ({ id: `event-${id}`, itemId: id,
    itemType: 'ISSUE', workspaceId: 'workspace', action: 'UPDATED', userId: 'user', details: null }));
  const prisma = {
    issue: { findMany: async () => [{ id: 'active', title: 'Visible' }], count: async () => 1 },
    issueActivity: {
      findMany: async ({ where }) => activityRows.filter(row => matches(row, where)),
      count: async ({ where }) => activityRows.filter(row => matches(row, where)).length,
    },
  };
  const deps = {
    'next/server': { NextResponse: Response }, '@/lib/prisma': { prisma },
    '@/lib/apps/auth-middleware': { withAppAuth: handler => handler },
  };
  const context = { workspace: { id: 'workspace' } };
  const search = load('src/app/api/apps/auth/search/issues-by-activity/route.ts', deps, { URL, console });
  const result = await search.GET(new Request('https://example.test?includeActivity=false'), context);
  assert.equal(result.status, 200);
  const body = await result.json();
  assert.deepEqual(body.summary, { totalMatchingActivities: 1, uniqueIssuesWithActivity: 1 });
  assert.deepEqual(body.results.map(issue => issue.id), ['active']);
  const feed = load('src/app/api/apps/auth/workspace/activity/route.ts', deps, { URL, console });
  const feedResult = await feed.GET(new Request('https://example.test'), context);
  assert.equal(feedResult.status, 200);
  const feedBody = await feedResult.json();
  assert.equal(feedBody.pagination.total, 1);
  assert.deepEqual(feedBody.activities.map(activity => activity.itemId), ['active']);
});
