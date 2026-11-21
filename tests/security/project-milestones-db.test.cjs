const { assert, test, load } = require('./helpers.cjs');
const { Prisma } = require('@prisma/client');
const { seatsDatabase } = require('../agents/seats-db.cjs');

test('milestones, repeated baselines and finish dates use the project issue write paths', async t => {
  const userId = 'cfixtureowner';
  const projectId = 'cfixtureproject';
  const workspaceId = 'cfixtureworkspace';
  const foreignProject = 'cfixtureotherproject';
  const oldCreated = new Date('2025-01-01T00:00:00Z');
  const entry = new Date('2025-01-02T00:00:00Z');
  const later = new Date('2025-01-03T00:00:00Z');
  const historical = ['web', 'agent', 'app', 'final-to-final', 'missing', 'reopened', 'gap', 'tie'];
  const db = await seatsDatabase(async prisma => {
    await prisma.user.create({ data: { id: userId, email: 'owner@example.test' } });
    await prisma.workspace.create({ data: { id: workspaceId, name: 'Workspace', slug: 'workspace', ownerId: userId } });
    for (const [index, id] of [projectId, foreignProject].entries()) {
      await prisma.project.create({ data: { id, workspaceId, name: id, slug: id, issuePrefix: `TEST${index}` } });
    }
    await prisma.projectStatus.createMany({ data: [
      { id: 'open', name: 'todo', displayName: 'To Do', projectId, isDefault: true },
      { id: 'done', name: 'done', displayName: 'Done', projectId, isFinal: true },
      { id: 'second', name: 'closed', displayName: 'Closed', projectId, isFinal: true },
    ] });
    await prisma.issue.createMany({ data: historical.map(id => ({
      id, title: id, workspaceId, projectId, createdAt: oldCreated,
      statusId: id === 'reopened' ? 'open' : ['final-to-final', 'gap'].includes(id) ? 'second' : 'done',
    })) });
    const explicit = { action: 'STATUS_CHANGED', fieldName: 'statusId', oldStatusId: 'open', newStatusId: 'done' };
    const appHistory = { action: 'UPDATED', fieldName: 'status', oldValue: 'todo', newValue: 'Done' };
    await prisma.issueActivity.createMany({ data: [
      { ...explicit, itemId: 'web', projectId },
      { ...explicit, itemId: 'agent', projectId, oldValue: 'todo', newValue: 'done' },
      { ...appHistory, itemId: 'app' },
      { ...appHistory, itemId: 'final-to-final' },
      { ...explicit, itemId: 'final-to-final', oldStatusId: 'done', newStatusId: 'second', createdAt: later },
      { ...explicit, itemId: 'reopened' },
      { ...explicit, itemId: 'reopened', oldStatusId: 'done', newStatusId: 'open', createdAt: later },
      { ...explicit, itemId: 'gap' },
      { ...explicit, itemId: 'tie' },
      { ...appHistory, itemId: 'tie' },
    ].map(event => ({ userId, workspaceId, createdAt: entry, ...event })) });
  });
  t.after(db.stop);
  const raw = db.prisma;
  const prisma = raw.$extends(load('src/lib/issue-visibility.ts').issueVisibilityExtension(Prisma.dmmf.datamodel.models));
  const issue = (id, data = {}) => raw.issue.create({ data: { id, title: id, workspaceId, projectId, statusId: 'open', ...data } });
  const fresh = id => raw.issue.findUniqueOrThrow({ where: { id } });
  for (const id of historical) {
    assert.deepEqual((await fresh(id)).finishedAt, ['web', 'agent', 'app', 'final-to-final'].includes(id) ? entry : null, id);
  }

  let actorId = userId;
  const deps = {
    '@/lib/prisma': { prisma }, 'next/server': { NextResponse: Response }, zod: require('zod'),
    '@/lib/session': { getCurrentUser: async () => ({ id: actorId }) },
    '@/lib/event-bus': { emitIssueCreated: async () => {}, emitIssueUpdated: async () => {} },
    '@/lib/redis': { publishEvent: async () => {} }, '@/utils/mentions': { extractMentionUserIds: () => [] },
    '@/lib/notification-service': {},
    '@/utils/html-normalizer': { normalizeDescriptionHTML: value => value },
    '@/lib/forge/legacy-write-guard': {
      assertLegacyIssueWriteAllowed: async () => {}, assertLegacyProjectWriteAllowed: async () => {},
    },
    '@/lib/apps/auth-middleware': { withAppAuth: handler => (request, params) =>
      handler(request, { user: { id: userId }, workspace: { id: workspaceId } }, params) },
  };
  deps['@/lib/permissions'] = load('src/lib/permissions.ts', { './prisma': { prisma } }, { console });
  deps['@/lib/board-item-activity-service'] = load('src/lib/board-item-activity-service.ts', {
    '@/lib/prisma': { prisma }, './prisma': { prisma },
  }, { console, Date });
  const globals = { URL, console, Date };
  const web = load('src/app/api/issues/[issueId]/route.ts', deps, globals);
  const app = load('src/app/api/apps/auth/issues/[issueIdOrKey]/route.ts', deps, globals);
  const apps = load('src/app/api/apps/auth/issues/route.ts', deps, globals);
  const baseline = load('src/app/api/projects/[projectId]/baseline/route.ts', deps, globals);
  const milestones = load('src/app/api/projects/[projectId]/milestones/route.ts', deps, globals);
  const request = (method, data, query = '') => new Request(`https://example.test/issues${query}`, {
    method, ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  const webPut = (id, data) => web.PUT(request('PUT', data, `?workspaceId=${workspaceId}`), { params: Promise.resolve({ issueId: id }) });
  const appPatch = (id, data) => app.PATCH(request('PATCH', data), { params: Promise.resolve({ issueIdOrKey: id }) });
  const projectParams = { params: Promise.resolve({ projectId }) };

  const target = await issue('cfixtureissue', { status: 'todo' });
  const launch = await issue('cfixturemilestone', { type: 'MILESTONE', startDate: entry, dueDate: later });
  const notMilestone = await issue('cfixturenotmilestone');
  const other = await issue('cfixtureforeign', { type: 'MILESTONE', projectId: foreignProject, statusId: null });
  const trashed = await issue('cfixturetrashed', { type: 'MILESTONE', deletedAt: entry, dueDate: entry });
  const listed = await milestones.GET(request('GET'), projectParams);
  assert.deepEqual((await listed.json()).milestones.map(row => row.id), [launch.id]);

  const invalidDates = await webPut(launch.id, { dueDate: oldCreated.toISOString() });
  assert.equal(invalidDates.status, 400);
  assert.equal((await invalidDates.json()).error, 'The due date is before the start.');
  assert.deepEqual((await fresh(launch.id)).dueDate, later);

  for (const put of [webPut, appPatch]) {
    assert.equal((await put(target.id, { milestoneId: launch.id })).status, 200);
    assert.equal((await fresh(target.id)).milestoneId, launch.id);
    assert.equal((await put(launch.id, { type: 'TASK' })).status, 400);
    for (const invalid of [target.id, notMilestone.id, other.id, trashed.id]) {
      assert.equal((await put(target.id, { milestoneId: invalid })).status, 400);
      assert.equal((await fresh(target.id)).milestoneId, launch.id);
    }
    assert.equal((await put(target.id, { milestoneId: null })).status, 200);
    assert.equal((await fresh(target.id)).milestoneId, null);
    let completed;
    for (const status of ['done', 'closed', 'todo']) {
      assert.equal((await put(target.id, { status })).status, 200);
      const finishedAt = (await fresh(target.id)).finishedAt;
      if (status === 'done') {
        assert.ok(finishedAt instanceof Date);
        completed = finishedAt;
      } else if (status === 'closed') assert.deepEqual(finishedAt, completed);
      else assert.equal(finishedAt, null);
    }
  }

  for (const invalid of [target.id, notMilestone.id, other.id, trashed.id]) {
    assert.equal((await apps.POST(request('POST', { title: 'New', projectId, milestoneId: invalid }))).status, 400);
  }
  const created = await apps.POST(request('POST', { title: 'New', projectId, milestoneId: launch.id }));
  assert.equal(created.status, 201);
  const filtered = await apps.GET(request('GET', undefined, `?milestoneId=${launch.id}`));
  assert.deepEqual((await filtered.json()).issues.map(row => row.title), ['New']);

  const setBaseline = () => baseline.POST(request('POST'), projectParams);
  actorId = 'unrelated-user';
  assert.equal((await setBaseline()).status, 404);
  actorId = userId;
  assert.equal((await setBaseline()).status, 201);
  assert.equal((await webPut(launch.id, { startDate: null, dueDate: entry })).status, 200);
  assert.equal((await setBaseline()).status, 201);
  assert.equal((await webPut(launch.id, { dueDate: later })).status, 200);
  const records = await raw.projectBaseline.findMany({ where: { projectId }, orderBy: { createdAt: 'asc' } });
  assert.deepEqual(records.map(row => [row.setById, row.dates]), [
    [userId, [{ issueId: launch.id, startDate: entry.toISOString(), dueDate: later.toISOString() }]],
    [userId, [{ issueId: launch.id, startDate: null, dueDate: entry.toISOString() }]],
  ]);
  const current = await fresh(launch.id);
  assert.deepEqual([current.baselineStartDate, current.baselineDueDate, current.dueDate], [null, entry, later]);
  assert.equal((await fresh(trashed.id)).baselineDueDate, null);
});
