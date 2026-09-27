const { assert, test, load, matches } = require('./helpers.cjs');
const { NextResponse } = require('next/server');
const zod = require('zod');

// Handler/guard composition only; OAuth middleware has its own existing checks.
test('app handlers deny bound issue writes before mutation while allowing unconnected assignment', async () => {
  const issues = [
    { id: 'c000000000000000000000001', issueKey: 'B-1', workspaceId: 'workspace', projectId: 'c000000000000000000000003', assigneeId: null },
    { id: 'c000000000000000000000002', issueKey: 'L-1', workspaceId: 'workspace', projectId: 'c000000000000000000000004', assigneeId: null },
  ];
  let writes = 0, bindingReads = 0;
  const mutate = async () => { writes++; return {}; };
  const db = {
    issue: { findFirst: async ({ where }) => issues.find(row => matches(row, where)), findMany: async ({ where }) => issues.filter(row => matches(row, where)), update: mutate, delete: mutate },
    project: { findFirst: async ({ where }) => [{ id: 'c000000000000000000000003', workspaceId: 'workspace' }, { id: 'c000000000000000000000004', workspaceId: 'workspace' }].find(row => matches(row, where)) },
    issueActivity: { create: mutate }, issueAssignee: { deleteMany: mutate },
    $transaction: async () => { writes++; throw new Error('Unexpected transaction'); },
    issueComment: { create: mutate },
    workLog: { findFirst: async ({ where }) => ({ ...where, timeSpent: 5 }), update: mutate, delete: mutate },
    issueRelation: { findUnique: async () => ({ id: 'relation', sourceIssueId: issues[1].id, targetIssueId: issues[0].id }), delete: mutate },
  };
  const guard = load('src/lib/forge/legacy-write-guard.ts', { 'server-only': {}, '@/lib/prisma': { prisma: db }, './reader': { readForgeBindings: async () => { bindingReads++; return [{ projectId: 'c000000000000000000000003', workspaceId: 'workspace' }]; } } });
  const deps = { 'next/server': { NextResponse }, zod, '@/lib/prisma': { prisma: db }, '@/lib/forge/legacy-write-guard': guard,
    '@/lib/apps/auth-middleware': { withAppAuth: handler => handler }, '@/lib/event-bus': {} };
  const base = 'src/app/api/apps/auth/issues/[issueIdOrKey]/';
  const routes = [
    [load(base + 'assign/route.ts', deps), 'POST', { unassign: true }],
    [load(base + 'comments/route.ts', deps), 'POST', { content: 'Comment' }],
    [load(base + 'work-logs/route.ts', deps), 'POST', { timeSpent: 5 }],
    [load(base + 'route.ts', deps), 'PATCH', { title: 'Changed' }],
    [load(base + 'route.ts', deps), 'DELETE', undefined],
    [load(base + 'work-logs/[workLogId]/route.ts', deps), 'PATCH', { timeSpent: 10 }],
    [load(base + 'work-logs/[workLogId]/route.ts', deps), 'DELETE', undefined],
    [load(base + 'relations/[relationId]/route.ts', deps), 'DELETE', undefined],
  ];
  const call = (route, method, body, id, workspaceId = 'workspace') => route[method](new Request('https://example.test', { method, ...(body ? { body: JSON.stringify(body) } : {}) }), { workspace: { id: workspaceId }, user: { id: 'actor' } }, { params: Promise.resolve({ issueIdOrKey: id, workLogId: 'log', relationId: 'relation' }) });
  for (const [route, method, body] of routes) {
    assert.equal((await call(route, method, body, 'c000000000000000000000001')).status, 409);
    assert.equal(writes, 0);
    const before = bindingReads;
    assert.equal((await call(route, method, body, 'c000000000000000000000001', 'foreign')).status, 404);
    assert.equal(bindingReads, before); assert.equal(writes, 0);
  }
  const relations = load(base + 'relations/route.ts', deps);
  for (const [source, target] of [['c000000000000000000000001', 'c000000000000000000000002'], ['c000000000000000000000002', 'c000000000000000000000001']]) {
    assert.equal((await call(relations, 'POST', { targetIssueId: target, relationType: 'RELATES_TO' }, source)).status, 409);
    assert.equal(writes, 0);
  }
  assert.equal((await call(routes[7][0], 'DELETE', undefined, issues[1].id)).status, 409);
  assert.equal(writes, 0);
  issues[0].parent = { id: issues[1].id };
  assert.equal((await call(routes[4][0], 'DELETE', undefined, issues[1].id)).status, 409);
  delete issues[0].parent;
  assert.equal(writes, 0);
  issues[1].parentId = issues[0].id;
  for (const parentId of [null, issues[1].id]) {
    assert.equal((await call(routes[3][0], 'PATCH', { parentId }, issues[1].id)).status, 409);
    assert.equal(writes, 0);
  }
  delete issues[1].parentId;
  const collection = load('src/app/api/apps/auth/issues/route.ts', deps);
  for (const body of [{ title: 'New', projectId: 'c000000000000000000000003' }, { title: 'New', projectId: 'c000000000000000000000004', parentId: 'c000000000000000000000001' }]) {
    assert.equal((await call(collection, 'POST', body, 'unused')).status, 409);
    assert.equal(writes, 0);
  }
  assert.equal((await call(...routes[0], 'c000000000000000000000002')).status, 200);
  assert.equal(writes, 2);
});
