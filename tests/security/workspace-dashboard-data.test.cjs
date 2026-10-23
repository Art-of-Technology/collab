const { assert, test, load } = require('./helpers.cjs');
const { Prisma } = require('@prisma/client');

const now = new Date('2026-10-23T12:00:00.000Z');
const date = days => new Date(now.getTime() + days * 86400000);
const plain = value => JSON.parse(JSON.stringify(value));
const visibility = load('src/lib/issue-visibility.ts').issueVisibilityExtension(Prisma.dmmf.datamodel.models).query.$allModels.$allOperations;

// Evaluate the actual loader and visibility extension against scoped records, including date bounds.
function matches(row, where) {
  return Object.entries(where).every(([key, value]) => {
    if (value === undefined) return true;
    if (key === 'AND') return (Array.isArray(value) ? value : [value]).every(part => matches(row, part));
    if (key === 'OR') return value.some(part => matches(row, part));
    if (key === 'NOT') return !(Array.isArray(value) ? value : [value]).some(part => matches(row, part));
    const actual = row?.[key];
    if (value === null || typeof value !== 'object') return actual === value;
    if (Object.prototype.toString.call(value) === '[object Date]') return actual?.getTime() === value.getTime();
    if ('some' in value) return actual?.some(part => matches(part, value.some)) || false;
    if ('is' in value) return value.is === null ? actual === null : matches(actual, value.is);
    if ('in' in value || 'notIn' in value || 'not' in value || 'lt' in value || 'lte' in value || 'gte' in value) {
      return (!('in' in value) || value.in.includes(actual))
        && (!('notIn' in value) || (actual !== null && !value.notIn.includes(actual)))
        && (!('not' in value) || actual !== value.not)
        && (!('lt' in value) || (actual !== null && actual < value.lt))
        && (!('lte' in value) || (actual !== null && actual <= value.lte))
        && (!('gte' in value) || (actual !== null && actual >= value.gte));
    }
    return actual != null && matches(actual, value);
  });
}

function fixture(access = 'member', options = {}) {
  const workspace = { id: 'workspace', ownerId: access === 'owner' ? 'alice' : 'bob',
    members: access === 'foreign' || access === 'owner' ? [] : [{ userId: 'alice', status: access !== 'inactive', role: 'MEMBER' }] };
  const foreign = { id: 'foreign', ownerId: 'mallory', members: [] };
  const revoked = { id: 'revoked', ownerId: 'mallory', members: [{ userId: 'alice', status: false }] };
  const makeProject = (id, extra = {}) => ({ id, slug: id, name: id === 'p0' ? 'Alpha' : id === 'p1' ? 'Beta' : `Project ${id}`,
    color: null, workspaceId: workspace.id, workspace, isArchived: false, updatedAt: date(20), ...extra });
  const projects = [
    ...Array.from({ length: 12 }, (_, i) => makeProject(`p${i}`, { isArchived: i === 1 ? null : false })),
    makeProject('archived', { isArchived: true }),
    makeProject('foreign-project', { workspace: foreign, workspaceId: foreign.id }),
    makeProject('revoked-project', { workspace: revoked, workspaceId: revoked.id }),
  ];
  const status = (id, projectId, isFinal, extra = {}) => ({ id, projectId, project: projects.find(p => p.id === projectId),
    isFinal, isActive: true, displayName: id, ...extra });
  const statuses = [status('custom-final', 'p1', true, { isActive: false, displayName: 'Released' }),
    status('nonfinal-done', 'p1', false, { displayName: 'Done' }), status('foreign-status', 'foreign-project', false)];
  const issue = (id, extra = {}) => {
    const value = { id, issueKey: `CLB-${id}`, title: id, workspaceId: workspace.id, workspace,
      projectId: 'p0', assigneeId: 'alice', statusId: null, status: 'open', statusValue: null,
      dueDate: date(-1), updatedAt: date(-2), deletedAt: null, ...extra };
    value.project = projects.find(p => p.id === value.projectId);
    value.projectStatus = statuses.find(s => s.id === value.statusId) || null;
    return value;
  };
  const issues = [
    ...Array.from({ length: 12 }, (_, i) => issue(`overdue-${i.toString().padStart(2, '0')}`, { dueDate: date(-20 + i), assigneeId: i % 2 ? 'bob' : 'alice' })),
    issue('due-now', { dueDate: now }), issue('due-boundary', { projectId: 'p1', dueDate: date(7) }),
    issue('later', { projectId: 'p1', dueDate: date(7.01), assigneeId: 'bob' }),
    issue('undated', { projectId: 'p1', dueDate: null }),
    issue('legacy-done', { status: ' DONE ', updatedAt: now }),
    issue('legacy-value', { status: 'open', statusValue: ' Completed ', updatedAt: date(-0.1) }),
    issue('custom-final', { projectId: 'p1', statusId: 'custom-final', updatedAt: date(-0.2) }),
    issue('nonfinal-done', { projectId: 'p1', statusId: 'nonfinal-done', status: 'done', assigneeId: 'bob' }),
    ...['Complete', 'Closed', 'Resolved', 'Cancelled', 'Canceled'].map(value => issue(`legacy-${value}`, { status: value })),
    issue('trashed', { deletedAt: now, updatedAt: date(1) }),
    issue('archived', { projectId: 'archived' }), issue('foreign-project', { projectId: 'foreign-project' }),
    issue('revoked-project', { projectId: 'revoked-project' }),
    issue('foreign-workspace', { workspaceId: foreign.id, workspace: foreign }),
    issue('foreign-status', { statusId: 'foreign-status' }),
    issue('cross-project-status', { statusId: 'custom-final' }),
  ];
  const calls = [];
  const database = {
    workspace: { findFirst: async ({ where }) => {
      if (options.workspaceFailure) throw new Error('private workspace lookup failure');
      return [workspace, foreign, revoked].find(row => matches(row, where)) || null;
    } },
    user: { findUnique: async ({ where, include }) => {
      if (options.permissionFailure) throw new Error('private permission lookup failure');
      assert.equal(where.id, 'alice');
      return access === 'deleted' ? null : { id: 'alice', role: 'USER',
        workspaceMemberships: workspace.members.filter(row => row.userId === 'alice' && matches({ ...row, workspaceId: workspace.id }, include.workspaceMemberships.where)),
        ownedWorkspaces: [workspace].filter(row => row.ownerId === 'alice' && matches(row, include.ownedWorkspaces.where)),
      };
    } },
    rolePermission: { findUnique: async ({ where }) => {
      assert.equal(where.workspaceId_role_permission.permission, 'VIEW_TASKS');
      assert.equal(where.workspaceId_role_permission.workspaceId, workspace.id);
      return access === 'notes-only' ? null : { id: 'view-tasks' };
    } },
    project: { findMany: async ({ where }) => { calls.push({ model: 'Project' }); return projects.filter(row => matches(row, where)); } },
    projectStatus: { findMany: async ({ where }) => statuses.filter(row => matches(row, where)) },
    issue: {},
  };
  for (const operation of ['groupBy', 'findMany']) database.issue[operation] = async args => {
    if (options.failure) throw new Error('private database credentials and query');
    return visibility({ model: 'Issue', operation, args, query: async query => {
      calls.push({ model: 'Issue', operation, query });
      const selected = issues.filter(row => matches(row, query.where));
      if (operation === 'groupBy') {
        const groups = new Map();
        for (const row of selected) {
          const key = JSON.stringify(query.by.map(field => row[field]));
          if (!groups.has(key)) groups.set(key, { ...Object.fromEntries(query.by.map(field => [field, row[field]])), _count: { id: 0 }, _max: { updatedAt: null } });
          const group = groups.get(key);
          group._count.id++;
          if (!group._max.updatedAt || row.updatedAt > group._max.updatedAt) group._max.updatedAt = row.updatedAt;
        }
        return [...groups.values()];
      }
      assert.ok(query.take > 0 && query.take <= 8, 'issue rows must remain bounded');
      selected.sort((a, b) => {
        for (const part of query.orderBy) for (const [field, direction] of Object.entries(part)) {
          const order = a[field] < b[field] ? -1 : a[field] > b[field] ? 1 : 0;
          if (order) return direction === 'asc' ? order : -order;
        }
        return 0;
      });
      return selected.slice(0, query.take).map(row => ({ ...row, project: Object.fromEntries(['id', 'slug', 'name', 'color'].map(field => [field, row.project[field]])) }));
    } });
  };
  const deps = { 'server-only': {}, '@/lib/prisma': { prisma: database },
    '@/lib/permissions': load('src/lib/permissions.ts', { './prisma': { prisma: database } }, { console: { error() {} } }),
    '@/lib/post-access': load('src/lib/post-access.ts'),
  };
  deps['@/lib/issue-finder'] = load('src/lib/issue-finder.ts', deps);
  const loader = load('src/lib/dashboard/workspace-overview.ts', deps).loadWorkspaceIssueOverview;
  return { calls, projects, issues, invoke: input => loader({ actorId: 'alice', workspaceId: 'workspace', scope: 'all', projectSearch: '', projectPage: 1, now, ...input }) };
}

test('exact workspace totals exceed bounded attention rows and exclude terminal, archived, foreign and trashed work', async () => {
  const f = fixture();
  const result = await f.invoke();
  assert.equal(result.kind, 'ready');
  assert.deepEqual(plain(result.summary), { visibleProjects: 12, projectsWithOpenWork: 2, openIssues: 17, overdueIssues: 13, dueSoonIssues: 2 });
  assert.equal(result.attention.length, 8);
  assert.deepEqual(plain(result.attention.map(row => row.id)), Array.from({ length: 8 }, (_, i) => `overdue-0${i}`));
  assert.equal(result.recent[0].id, 'legacy-done');
  assert.equal(result.recent.length, 6);
  assert.equal(result.projects[0].id, 'p0');
  assert.equal(result.projects[0].lastIssueUpdatedAt, now.toISOString(), 'latest actual issue date, not project timestamp');
  assert.equal(result.projects.find(row => row.id === 'p1').openIssues, 4, 'non-final linked status named Done remains open');
  assert.equal(result.projects.length, 10);
  assert.equal(result.projectPages, 2);
  assert.equal(f.calls.filter(call => call.operation === 'groupBy').length, 3);
});

test('My work filters every issue query to the actor assignee; helpers or reporters do not qualify', async () => {
  const f = fixture();
  f.issues.find(row => row.id === 'later').reporterId = 'alice';
  f.issues.find(row => row.id === 'later').helpers = [{ userId: 'alice' }];
  const result = await f.invoke({ scope: 'mine' });
  assert.equal(result.kind, 'ready');
  assert.deepEqual(plain(result.summary), { visibleProjects: 12, projectsWithOpenWork: 2, openIssues: 9, overdueIssues: 6, dueSoonIssues: 2 });
  assert.deepEqual(plain(result.attention.map(row => row.id)), ['overdue-00', 'overdue-02', 'overdue-04', 'overdue-06', 'overdue-08', 'overdue-10', 'due-now', 'due-boundary']);
  assert.ok(result.recent.every(row => f.issues.find(issue => issue.id === row.id).assigneeId === 'alice'));
});

test('search and page affect only the project table, keep exact global counts and clamp invalid pages', async () => {
  const f = fixture();
  const first = await f.invoke();
  const searched = await f.invoke({ projectSearch: '  BETA ', projectPage: 999 });
  assert.deepEqual(plain(searched.summary), plain(first.summary));
  assert.deepEqual(plain(searched.attention), plain(first.attention));
  assert.equal(searched.projectSearch, 'BETA');
  assert.equal(searched.projects[0].id, 'p1');
  assert.equal(searched.matchingProjects, 1);
  assert.equal(searched.projectPage, 1);
  assert.equal((await f.invoke({ projectPage: 2 })).projects.length, 2);
  assert.equal((await f.invoke({ projectPage: NaN })).projectPage, 1);
  assert.equal((await f.invoke({ projectSearch: 'absent' })).matchingProjects, 0);
});

test('owner without a membership is allowed; inactive, foreign, deleted and notes-only actors get no payload', async () => {
  assert.equal((await fixture('owner').invoke()).kind, 'ready');
  for (const access of ['inactive', 'foreign', 'deleted', 'notes-only']) {
    const f = fixture(access);
    assert.deepEqual(plain(await f.invoke()), { kind: 'denied' }, access);
    assert.equal(f.calls.length, 0, 'deny before project or issue payload queries');
  }
  const f = fixture();
  assert.equal((await f.invoke({ workspaceId: 'foreign' })).kind, 'denied');
  assert.equal((await f.invoke({ actorId: '' })).kind, 'denied');
});

test('query failures are unavailable without raw errors; an empty workspace remains a successful zero state', async () => {
  assert.deepEqual(plain(await fixture('member', { failure: true }).invoke()), { kind: 'unavailable' });
  const f = fixture();
  f.projects.splice(0);
  const result = await f.invoke();
  assert.equal(result.kind, 'ready');
  assert.equal(result.summary.visibleProjects, 0);
  assert.equal(result.summary.openIssues, 0);
  assert.deepEqual(plain(result.attention), []);
  assert.equal(result.projectPages, 1);
  assert.equal(f.calls.some(call => call.model === 'Issue'), false);
});

test('workspace and permission lookup errors are unavailable, never disguised as access denial', async () => {
  for (const option of ['workspaceFailure', 'permissionFailure']) {
    const f = fixture('member', { [option]: true });
    assert.deepEqual(plain(await f.invoke()), { kind: 'unavailable' });
    assert.equal(f.calls.length, 0, 'failed access checks must not read project or issue payloads');
  }
});
