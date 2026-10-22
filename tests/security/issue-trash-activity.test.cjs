const { assert, test, load, matches } = require('./helpers.cjs');
const { Prisma } = require('@prisma/client');
const dates = require('date-fns');
const { issueVisibilityExtension } = load('src/lib/issue-visibility.ts');
const visibleQuery = issueVisibilityExtension(Prisma.dmmf.datamodel.models).query.$allModels.$allOperations;
const day = '2026-10-22';
const noon = new Date(`${day}T12:00:00Z`);
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : [noon.getTime()])); }
  static now() { return noon.getTime(); }
}
const expected = ['legacy-task', 'legacy-other', 'current-issue'];

function fixture(extra = []) {
  const user = { id: 'actor', name: 'Actor', email: 'actor@example.test', image: null };
  const issue = { id: 'active', workspaceId: 'workspace', projectId: 'project', deletedAt: null,
    title: 'Visible issue', issueKey: 'TEST-1', type: 'TASK', priority: 'MEDIUM', status: 'TODO',
    assigneeId: null, createdAt: noon, project: { id: 'project', name: 'Project' } };
  const issues = [issue, { ...issue, id: 'trashed', deletedAt: noon },
    { ...issue, id: 'foreign', workspaceId: 'elsewhere' },
    { ...issue, id: 'other-project', projectId: 'other-project' }];
  const activity = { itemId: 'active', workspaceId: 'workspace', projectId: 'project', userId: user.id,
    user, action: 'CREATED', details: null, createdAt: noon };
  const activities = [
    ...expected.map((id, index) => ({ ...activity, id, itemType: ['TASK', 'BUG', 'ISSUE'][index], createdAt: new Date(noon.getTime() - index * 1000) })),
    ...['trashed', 'foreign', 'orphan'].map(itemId => ({ ...activity, id: `hidden-${itemId}`, itemId, itemType: 'TASK' })),
    { ...activity, id: 'wrong-workspace', itemType: 'TASK', workspaceId: 'elsewhere' },
    ...extra.map(row => ({ ...activity, itemType: 'TASK', ...row })),
  ];
  const calls = { activity: [], count: [], indexed: [] };
  // Extend the shared scalar matcher only for combined date bounds used by these feeds.
  const fit = (row, where = {}) => {
    const { createdAt, ...rest } = where;
    if (!matches(row, rest)) return false;
    return !createdAt || Object.entries(createdAt).every(([operator, date]) => ({
      gte: row.createdAt >= date, lte: row.createdAt <= date, lt: row.createdAt < date,
    })[operator]);
  };
  const select = (rows, args = {}) => {
    const selected = rows.filter(row => fit(row, args.where));
    if (args.orderBy?.createdAt) selected.sort((a, b) =>
      (a.createdAt - b.createdAt) * (args.orderBy.createdAt === 'desc' ? -1 : 1));
    return selected.slice(args.skip || 0, args.take == null ? undefined : (args.skip || 0) + args.take);
  };
  const db = {
    issue: {
      findMany: args => visibleQuery({ model: 'Issue', operation: 'findMany', args, query: async scoped => select(issues, scoped) }),
      count: args => visibleQuery({ model: 'Issue', operation: 'count', args, query: async scoped => select(issues, scoped).length }),
    },
    issueActivity: {
      findMany: async args => { calls.activity.push(args); return select(activities, args); },
      count: async args => { calls.count.push(args); return select(activities, args).length; },
    },
    workspace: { findFirst: async () => ({ id: 'workspace', ownerId: user.id }) },
    workspaceMember: { findUnique: async () => ({ role: 'ADMIN' }), findFirst: async () => ({ role: 'ADMIN' }) },
    user: { findMany: async ({ where }) => [user].filter(row => matches(row, where)) },
    post: { findMany: async () => [] },
    note: { findMany: async () => [], count: async () => 0 },
  };
  const globals = { URL, Date: FixedDate, process: { env: {} }, console: { log() {}, error() {} } };
  const session = async () => ({ user });
  const deps = {
    'next/server': { NextResponse: Response }, '@/lib/prisma': { prisma: db },
    '@/lib/auth': { getAuthSession: session, authOptions: {} }, '@/lib/auth-options': { authOptions: {} },
    '@/lib/request-session': { getServerSession: session }, '@/lib/gateway-identity': { authMode: () => 'nextauth' },
    '@/lib/post-access': load('src/lib/post-access.ts', { '@/lib/prisma': { prisma: db } }),
    '@/lib/apps/auth-middleware': { withAppAuth: handler => handler }, 'date-fns': dates,
    '@/utils/teamSyncAnalyzer': load('src/utils/teamSyncAnalyzer.ts', {}, globals),
    '@/lib/qdrant-sync': {
      getCollectionInfo: async () => ({ status: 'green' }),
      batchSyncIssuesToQdrant: async rows => ({ synced: rows.length, errors: 0 }),
      batchSyncContextsToQdrant: async () => { throw Error('Unexpected context batch'); },
      batchSyncActivitiesToQdrant: async rows => { calls.indexed.push(...rows); return { synced: rows.length, errors: 0 }; },
    },
  };
  const route = path => load(`src/app/api/${path}/route.ts`, deps, globals);
  const params = { params: Promise.resolve({ workspaceId: 'workspace' }) };
  return { route, calls, params };
}

async function body(response) {
  assert.equal(response.status, 200);
  return response.json();
}

test('workspace activity keeps legacy parent types, scoped list/count and existing pagination filters', async () => {
  const f = fixture([
    { id: 'wrong-project', itemId: 'other-project', projectId: 'other-project' },
    { id: 'wrong-user', userId: 'someone-else' }, { id: 'wrong-action', action: 'VIEWED' },
  ]);
  const result = await body(await f.route('apps/auth/workspace/activity').GET(
    new Request('https://example.test?projectId=project&userId=actor&action=CREATED&limit=2&page=2'),
    { workspace: { id: 'workspace' } }));
  assert.deepEqual(result.activities.map(row => row.id), ['current-issue']);
  assert.deepEqual(result.pagination, { page: 2, limit: 2, total: 3, pages: 2 });
  assert.deepEqual(f.calls.activity[0].where, f.calls.count[0].where);
  const complete = await body(await f.route('apps/auth/workspace/activity').GET(
    new Request('https://example.test?projectId=project&userId=actor&action=CREATED'), { workspace: { id: 'workspace' } }));
  assert.deepEqual(complete.activities.map(row => row.id), expected);
  assert.deepEqual(complete.activities.map(row => row.issue.id), ['active', 'active', 'active']);
});

test('unified timeline preserves legacy rows and active-parent scope in both list and header counts', async () => {
  const f = fixture([{ id: 'noise', action: 'VIEWED' }]);
  const route = f.route('timeline/unified');
  const result = await body(await route.GET(new Request('https://example.test?workspaceId=workspace')));
  assert.deepEqual(result.timeline.map(row => row.id), expected);
  assert.deepEqual(result.stats, { todayCount: 3, weekCount: 3 });
  const filtered = fixture([{ id: 'other-actor', userId: 'someone-else', createdAt: new Date(noon.getTime() - 500) }]);
  const cursor = new Date(noon.getTime() - 500).toISOString();
  const page = await body(await filtered.route('timeline/unified').GET(new Request(`https://example.test?workspaceId=workspace&mine=true&limit=1&cursor=${cursor}`)));
  assert.deepEqual(page.timeline.map(row => row.id), ['legacy-other']);
  assert.equal(page.hasMore, true);
  assert.equal(page.nextCursor, new Date(noon.getTime() - 1000).toISOString());
});

const planningExtras = [
  { id: 'wrong-project', projectId: 'other-project' }, { id: 'wrong-user', userId: 'someone-else' },
  { id: 'before-range', createdAt: new Date('2026-10-20T12:00:00Z') },
  { id: 'after-range', createdAt: new Date('2026-10-24T12:00:00Z') },
];
const planningQuery = `startDate=${day}&endDate=${day}&projectIds=project&userIds=actor`;

test('planning activity keeps legacy rows while date/project/user/cursor/limit filters remain effective', async () => {
  const f = fixture(planningExtras);
  const route = f.route('workspaces/[workspaceId]/planning/activity');
  const result = await body(await route.GET(new Request(`https://example.test?${planningQuery}`), f.params));
  assert.deepEqual(result.feed.map(row => row.id), expected);
  assert.equal(result.hasMore, false);
  const first = await body(await route.GET(new Request(`https://example.test?${planningQuery}&limit=2`), f.params));
  assert.deepEqual(first.feed.map(row => row.id), expected.slice(0, 2));
  assert.equal(first.hasMore, true);
  assert.equal(first.nextCursor, 'legacy-other');
  const page = await body(await route.GET(new Request(`https://example.test?${planningQuery}&limit=1&cursor=legacy-other`), f.params));
  assert.deepEqual(page.feed.map(row => row.id), ['current-issue']);
  assert.equal(page.hasMore, false);
});

test('planning range retains legacy activities and excludes trashed, foreign and orphan parents from summaries', async () => {
  const f = fixture(planningExtras);
  const result = await body(await f.route('workspaces/[workspaceId]/planning/range').GET(
    new Request(`https://example.test?${planningQuery}`), f.params));
  const activities = result.members.flatMap(member => Object.values(member.days).flatMap(day => day.activities));
  assert.deepEqual(activities.map(row => row.id), expected);
  assert.equal(result.summary.totalCreated, 3);
});

test('Qdrant activity migration and status count share active-parent scope without dropping legacy types', async () => {
  const f = fixture();
  const route = f.route('workspaces/[workspaceId]/qdrant/migrate');
  const migrated = await body(await route.POST(new Request('https://example.test', { method: 'POST' }), f.params));
  assert.deepEqual(f.calls.indexed.map(row => row.id).sort(), [...expected].sort());
  assert.deepEqual(migrated.stats.activities, { total: 3, synced: 3, errors: 0 });
  const status = await body(await route.GET(new Request('https://example.test'), f.params));
  assert.equal(status.postgresql.activities, 3);
  assert.deepEqual(f.calls.activity[0].where, f.calls.count[0].where);
});

test('issues-by-activity keeps its preexisting ISSUE-only search contract', async () => {
  const f = fixture();
  const result = await body(await f.route('apps/auth/search/issues-by-activity').GET(
    new Request('https://example.test?includeActivity=false'), { workspace: { id: 'workspace' } }));
  assert.equal(result.summary.totalMatchingActivities, 1);
  assert.deepEqual(result.results.map(row => row.id), ['active']);
});
