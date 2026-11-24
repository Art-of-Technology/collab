const { assert, test, load } = require('./helpers.cjs');

// One project read through the summary route and, in the same call, through the Overview and Work tab
// (loadProjectHome), against one fixture database. The finished-work numbers must be the same everywhere.
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
  if (args.orderBy && !Array.isArray(args.orderBy)) {
    const [key, direction] = Object.entries(args.orderBy)[0];
    result = result.slice().sort((a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0) * (direction === 'desc' ? -1 : 1));
  }
  return args.take == null ? result : result.slice(0, args.take);
}

function groupBy(rows, args) {
  const groups = new Map();
  for (const row of query(rows, args)) {
    const key = JSON.stringify(args.by.map(field => row[field] ?? null));
    const group = groups.get(key) ?? { ...Object.fromEntries(args.by.map(field => [field, row[field] ?? null])), _count: { id: 0 } };
    group._count.id += 1;
    groups.set(key, group);
  }
  return [...groups.values()];
}

function fixture() {
  const project = { id: 'project', name: 'Project', slug: 'project', description: null, color: '#fff',
    workspaceId: 'workspace', issuePrefix: 'DEMO', createdAt: date(-90), updatedAt: now, workspace: {} };
  const status = (id, fields) => ({ id, name: id, displayName: id, color: '#fff', category: null, isFinal: false,
    isActive: true, order: 0, projectId: project.id, project, ...fields });
  const statuses = [
    status('todo', { displayName: 'To Do', order: 0 }),
    status('done', { displayName: 'Done', isFinal: true, order: 1 }),
    // A status taken out of use that still holds a finished issue.
    status('closed', { displayName: 'Closed', isFinal: true, isActive: false, order: 2 }),
  ];
  const byId = Object.fromEntries(statuses.map(row => [row.id, row]));
  const issue = (id, fields = {}) => {
    const row = {
      id, title: id, issueKey: id, type: 'TASK', projectId: project.id, workspaceId: project.workspaceId, deletedAt: null,
      statusId: null, status: null, statusValue: null, dueDate: null, startDate: null, milestoneId: null, parentId: null,
      createdAt: date(-60), updatedAt: date(-1), firstStartedAt: null, finishedAt: null, baselineStartDate: null,
      baselineDueDate: null, priority: 'MEDIUM', reporterId: 'alice', assigneeId: null, assignee: null, parent: null,
      targetRelations: [], sourceRelations: [], agentRequestRole: null, ...fields,
    };
    row.projectStatus = row.statusId ? byId[row.statusId] : null;
    return row;
  };
  const issues = [
    issue('linked-open', { statusId: 'todo', status: 'todo', dueDate: date(-3), assigneeId: 'alice' }),
    issue('linked-done', { statusId: 'done', status: 'done' }),
    issue('inactive-done', { statusId: 'closed', status: 'closed' }),
    // Issues from before project statuses: no status link, only the label they were saved with.
    issue('legacy-done', { status: 'done' }),
    issue('legacy-Done', { status: 'Done', statusValue: 'Done', dueDate: date(-5) }),
    issue('legacy-open', { status: 'to_do' }),
    issue('legacy-unknown', { status: 'Parked' }),
    issue('no-label'),
    // Neither a milestone nor a request to a seat is counted as work.
    issue('milestone', { type: 'MILESTONE', statusId: 'todo', status: 'todo' }),
    issue('request', { statusId: 'done', status: 'done', agentRequestRole: 'review' }),
  ];
  const none = { findMany: async () => [], findFirst: async () => null };
  const db = {
    project: { findFirst: async ({ where }) => (where.id === project.id ? project : null) },
    projectStatus: { findMany: async args => query(statuses, args) },
    issue: {
      findMany: async args => query(issues, args),
      count: async args => query(issues, args).length,
      groupBy: async args => groupBy(issues, args),
    },
    repository: none, gitConnection: none, featureRequest: none, note: none, issueActivity: none, agentRun: none,
    workspace: none, projectBaseline: none, agentSeat: none, pullRequest: none, workLog: none, user: none,
  };
  const prisma = { prisma: db };
  const access = { postWorkspaceAccessWhere: () => ({}) };
  const finder = { issueReadAccessWhere: () => ({}) };
  const overview = load('src/lib/project-overview.ts', {
    '@/lib/prisma': prisma, '@/lib/post-access': access, '@/lib/issue-finder': finder,
    '@/lib/project-burn': load('src/lib/project-burn.ts'),
  });
  const route = load('src/app/api/projects/[projectId]/summary/route.ts', {
    '@/lib/prisma': prisma,
    '@/lib/session': { getCurrentUser: async () => ({ id: 'alice' }) },
    '@/lib/post-access': access,
    '@/lib/issue-finder': finder,
    '@/lib/secrets/access': { noteAccessWhere: () => ({}) },
    '@/lib/note-tag-access': { noteTagAccessWhere: () => ({}) },
    '@/lib/github/version-access': { versionAccessWhere: () => ({}) },
    '@/lib/project-overview': overview,
    'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status || 200 }) } },
  }, { console: { error(...args) { console.error(...args); } } });
  return { call: () => route.GET({}, { params: Promise.resolve({ projectId: project.id }) }) };
}

test('the summary, its status counts and the Overview count the same finished work', async () => {
  const { status, body } = await fixture().call();
  assert.equal(status, 200);
  const { stats } = body.overview;
  // The Overview: 8 work issues, 4 of them finished (two linked, two by their old label "done" or "Done").
  assert.deepEqual({ total: stats.total, done: stats.done, open: stats.open }, { total: 8, done: 4, open: 4 });

  assert.deepEqual(
    { total: body.stats.totalIssues, done: body.stats.completedIssues, open: body.stats.openIssues },
    { total: stats.total, done: stats.done, open: stats.open },
  );
  assert.equal(body.stats.completionRate, stats.donePercent);

  const counts = body.statusDistribution;
  assert.equal(counts.reduce((sum, row) => sum + row.count, 0), stats.total, 'every work issue is in one status count');
  assert.equal(counts.filter(row => row.isFinal).reduce((sum, row) => sum + row.count, 0), stats.done);

  // Each status count is the number of issues the Work tab's board puts in that status.
  const board = new Map();
  for (const item of body.overview.work) board.set(item.statusId, (board.get(item.statusId) ?? 0) + 1);
  assert.deepEqual(new Map(counts.map(row => [row.id, row.count])), board);
  assert.deepEqual(counts.map(row => [row.id, row.displayName, row.count]), [
    ['todo', 'To Do', 2], ['done', 'Done', 3], ['closed', 'Closed', 1], [null, 'No status', 2],
  ]);
});

test('an issue finished under its old label is not open, overdue or unassigned in the summary', async () => {
  const { body } = await fixture().call();
  assert.deepEqual({
    overdue: body.stats.overdueCount, withoutDates: body.stats.issuesWithoutDates, unassigned: body.stats.unassignedIssues,
  }, { overdue: 1, withoutDates: 3, unassigned: 3 });
  assert.deepEqual(body.atRisk.overdue.map(row => row.id), ['linked-open']);
  assert.equal(body.stats.overdueCount, body.overview.stats.overdue);
});
