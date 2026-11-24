const { assert, test, load } = require('./helpers.cjs');

const DAY = 86_400_000;
const now = new Date();
const date = days => new Date(now.getTime() + days * DAY);

function matches(row, where = {}) {
  return Object.entries(where).every(([key, value]) => {
    if (value === undefined) return true;
    if (key === 'AND') return [].concat(value).every(part => matches(row, part));
    if (key === 'OR') return value.some(part => matches(row, part));
    if (key === 'NOT') return !matches(row, value);
    const actual = row?.[key] ?? null;
    if (value === null || typeof value !== 'object') return actual === value;
    if (value instanceof Date) return actual?.getTime() === value.getTime();
    const operators = { in: x => value.in.includes(x), notIn: x => !value.notIn.includes(x), not: x => x !== value.not,
      lt: x => x !== null && x < value.lt, lte: x => x !== null && x <= value.lte,
      gt: x => x !== null && x > value.gt, gte: x => x !== null && x >= value.gte };
    const named = Object.keys(value).filter(op => op in operators);
    if (named.length) return named.every(op => operators[op](actual));
    return actual !== null && matches(actual, value);
  });
}

function query(rows, args = {}) {
  let result = rows.filter(row => matches(row, args.where));
  if (args.orderBy) {
    const [key, direction] = Object.entries(args.orderBy)[0];
    result = result.slice().sort((a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0) * (direction === 'desc' ? -1 : 1));
  }
  return args.take == null ? result : result.slice(0, args.take);
}

function fixture() {
  const project = { id: 'project', name: 'Project', slug: 'project', description: null, color: '#fff',
    workspaceId: 'workspace', issuePrefix: 'DEMO', createdAt: date(-60), updatedAt: now, workspace: {} };
  const statuses = [
    { id: 'todo', name: 'todo', displayName: 'Todo', color: '#fff', isFinal: false, isActive: true, projectId: project.id, project },
    { id: 'done', name: 'done', displayName: 'Done', color: '#000', isFinal: true, isActive: true, projectId: project.id, project },
  ];
  const issue = (id, fields = {}) => ({
    id, title: id, issueKey: id, projectId: project.id, workspaceId: project.workspaceId, deletedAt: null,
    statusId: 'todo', projectStatus: statuses[0], dueDate: null, updatedAt: date(-1), priority: 'MEDIUM',
    assigneeId: null, assignee: null, parent: null, targetRelations: [], agentRequestRole: null, ...fields,
  });
  const done = { statusId: 'done', projectStatus: statuses[1], updatedAt: date(-2) };
  // Each piece of work has a request of the same shape, so any list or count that keeps requests doubles.
  const shapes = {
    overdue: { dueDate: date(-3) },
    'at-risk': { dueDate: date(1) },
    upcoming: { dueDate: date(10), assigneeId: 'alice' },
    completed: done,
    undated: {},
  };
  const issues = Object.entries(shapes).flatMap(([id, fields]) => [
    issue(`work-${id}`, fields),
    issue(`request-${id}`, { ...fields, agentRequestRole: 'review', updatedAt: now }),
  ]);
  const db = {
    project: { findFirst: async ({ where }) => (where.id === project.id ? project : null) },
    projectStatus: { findMany: async args => query(statuses, args) },
    issue: {
      findMany: async args => query(issues, args),
      count: async args => query(issues, args).length,
      groupBy: async args => {
        const groups = new Map();
        for (const row of query(issues, args)) groups.set(row.statusId, (groups.get(row.statusId) ?? 0) + 1);
        return [...groups].map(([statusId, id]) => ({ statusId, _count: { id } }));
      },
    },
    repository: { findFirst: async () => null },
    gitConnection: { findMany: async () => [] },
    featureRequest: { findMany: async () => [] },
    note: { findMany: async () => [] },
  };
  const route = load('src/app/api/projects/[projectId]/summary/route.ts', {
    '@/lib/prisma': { prisma: db },
    '@/lib/session': { getCurrentUser: async () => ({ id: 'alice' }) },
    '@/lib/post-access': { postWorkspaceAccessWhere: () => ({}) },
    '@/lib/issue-finder': { issueReadAccessWhere: () => ({}) },
    '@/lib/secrets/access': { noteAccessWhere: () => ({}) },
    '@/lib/note-tag-access': { noteTagAccessWhere: () => ({}) },
    '@/lib/github/version-access': { versionAccessWhere: () => ({}) },
    '@/lib/project-overview': { loadProjectHome: async () => ({ overview: {}, burn: {} }) },
    'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status || 200 }) } },
  }, { console: { error() {} } });
  return { call: () => route.GET({}, { params: Promise.resolve({ projectId: project.id }) }) };
}

test('the project summary counts no request', async () => {
  const { status, body } = await fixture().call();
  assert.equal(status, 200);
  assert.deepEqual({ ...body.stats }, {
    totalIssues: 5, openIssues: 4, completedIssues: 1, overdueCount: 1, atRiskCount: 1,
    issuesWithoutDates: 1, unassignedIssues: 3, completionRate: 20,
  });
  assert.deepEqual(body.statusDistribution.map(row => [row.id, row.count]), [['todo', 4], ['done', 1]]);
  const ids = rows => rows.map(row => row.id);
  assert.deepEqual(ids(body.atRisk.overdue), ['work-overdue']);
  assert.deepEqual(ids(body.atRisk.upcoming), ['work-at-risk']);
  assert.deepEqual(ids(body.recentIssues).sort(), ['work-at-risk', 'work-completed', 'work-overdue', 'work-undated', 'work-upcoming']);
  assert.deepEqual(ids(body.recentlyCompleted), ['work-completed']);
  assert.deepEqual(ids(body.timeline), ['work-at-risk', 'work-upcoming']);
});
