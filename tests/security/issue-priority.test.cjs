const { assert, test, load, matches } = require('./helpers.cjs');

const kanban = 'src/components/views/renderers/KanbanViewRenderer';
const { createColumns, filterIssues } = load(`${kanban}/utils.ts`, {
  './constants': load(`${kanban}/constants/index.ts`),
});
const permissions = load('src/lib/permissions.ts', { './prisma': { prisma: {} } });

function fixture() {
  const workspace = { id: 'own', ownerId: 'alice', members: [] };
  let state = {
    id: 'issue', workspaceId: workspace.id, workspace, projectId: 'project', project: { workspace }, statusId: null,
    reporterId: 'alice', priority: 'MEDIUM', parentId: null,
    updatedAt: new Date('2026-09-24T00:00:00Z'),
  };
  let writes = 0;
  const db = {
    workspace: { findFirst: async ({ where }) => matches(workspace, where) ? workspace : null },
    issue: {
      findFirst: async ({ where }) => matches(state, where) ? structuredClone(state) : null,
      update: async ({ where, data }) => {
        assert.equal(where.id, state.id);
        writes++;
        state = { ...state, ...data };
        return structuredClone(state);
      },
    },
    $transaction: async (fn, options) => {
      assert.equal(options.isolationLevel, 'Serializable');
      return fn(db);
    },
  };
  const { updateIssue } = load('src/lib/issue-mutation.ts', {
    zod: require('zod'), '@/lib/prisma': { prisma: db },
    '@/lib/permissions': {
      ...permissions,
      checkUserPermissions: async (_user, _workspace, requested) =>
        Object.fromEntries(requested.map(p => [p, { hasPermission: p === 'EDIT_SELF_TASK' }])),
    },
    '@/utils/html-normalizer': { normalizeDescriptionHTML: value => value },
  });
  return { update: priority => updateIssue('alice', 'issue', { priority }, 'own'),
    read: () => db.issue.findFirst({ where: { id: 'issue', workspaceId: 'own' } }),
    writes: () => writes };
}

for (const priority of ['HIGH', 'URGENT', 'LOW', 'MEDIUM', 'low', 'medium', 'high', 'urgent', 'HiGh']) {
  test(`priority ${priority} survives updateIssue persistence and filtering`, async () => {
    const store = fixture();
    const result = await store.update(priority);
    assert.equal(result.error, undefined);
    assert.equal(store.writes(), 1);
    const saved = await store.read();
    const filtered = filterIssues([saved], 'all', {
      assignees: [], labels: [], projects: [], priority: [priority],
    });
    const columns = createColumns([saved], { grouping: { field: 'priority' } });
    assert.deepEqual({
      returned: result.issue.priority, persisted: saved.priority,
      visible: Array.from(filtered, issue => issue.id),
      ...(priority === priority.toUpperCase() && {
        groups: Array.from(columns, column => ({ id: column.id, issues: Array.from(column.issues, issue => issue.id) })),
      }),
    }, {
      returned: priority, persisted: priority, visible: ['issue'],
      ...(priority === priority.toUpperCase() && { groups: [{ id: priority.toLowerCase(), issues: ['issue'] }] }),
    });
  });
}

test('invalid priorities return 400 without persistence', async () => {
  const store = fixture();
  const before = await store.read();
  for (const priority of ['root', 'critical', ' HIGH', 'HIGH ', '', null, 1, {}, ['HIGH']]) {
    assert.equal((await store.update(priority)).status, 400, JSON.stringify(priority));
    assert.equal(store.writes(), 0);
    assert.deepEqual(await store.read(), before);
  }
});
