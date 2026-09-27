const { assert, test, load, matches, workspaces } = require('./helpers.cjs');

function fixture(subject = { id: 'alice', email: 'bob@example.test' }, cookie = 'joined', before = () => {}) {
  const users = ['alice', 'bob'].map(id => ({ id, email: `${id}@example.test` }));
  const spaces = structuredClone(workspaces);
  const labels = spaces.flatMap(workspace => ['Zulu', 'Alpha'].map(name => ({ id: `${workspace.id}-${name}`, name, color: '#112233', workspaceId: workspace.id, workspace })));
  const writes = [], reads = [];
  const output = (row, spec = {}) => !row ? null : spec.select ? Object.fromEntries(Object.keys(spec.select).map(key => [key, row[key]])) : Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'workspace' || spec.include?.workspace));
  const db = {
    user: { findUnique: async spec => output(users.find(row => matches(row, spec.where)), spec) },
    workspace: { findFirst: async spec => output(spaces.find(row => matches(row, spec.where)), spec) },
    taskLabel: {
      findMany: async spec => { before('read', spaces, labels); reads.push(spec); return labels.filter(row => matches(row, spec.where)).sort((a, b) => a.name.localeCompare(b.name)).map(row => output(row, spec)); },
      findUnique: async spec => { reads.push(spec); return output(labels.find(row => matches(row, spec.where)), spec); },
      findFirst: async spec => { reads.push(spec); return output(labels.find(row => matches(row, spec.where)), spec); },
      create: async ({ data }) => {
        before('create', spaces, labels);
        const workspace = spaces.find(row => matches(row, data.workspace?.connect || { id: data.workspaceId }));
        if (!workspace) throw new Error('Workspace relation not found');
        if (labels.some(row => row.name === data.name && row.workspaceId === workspace.id)) throw new Error('Unique label conflict');
        const row = { id: 'new-label', name: data.name, color: data.color, workspaceId: workspace.id, workspace }; labels.push(row); writes.push('create'); return output(row);
      },
      update: async ({ where, data }) => {
        before('update', spaces, labels); const row = labels.find(row => matches(row, where));
        if (!row) throw new Error('Label write denied'); Object.assign(row, data); writes.push('update'); return output(row);
      },
      delete: async ({ where }) => {
        before('delete', spaces, labels); const index = labels.findIndex(row => matches(row, where));
        if (index < 0) throw new Error('Label write denied'); writes.push('delete'); return output(labels.splice(index, 1)[0]);
      },
    },
  };
  const deps = { '@/lib/prisma': { prisma: db }, '@/lib/auth-options': {},
    'next-auth': { getServerSession: async () => subject && { user: subject } },
    'next/headers': { cookies: async () => ({ get: () => cookie ? { value: cookie } : undefined }) },
    'next/navigation': { redirect: () => { throw new Error('Unexpected redirect'); } },
  };
  deps['@/lib/workspace-helpers'] = load('src/lib/workspace-helpers.ts', deps);
  return { actions: load('src/actions/label.ts', deps, { console: { error() {} } }), users, spaces, labels, writes, reads };
}

test('all label actions bind live subject and reject missing/deleted IDs before label IO', async () => {
  for (const subject of [null, { email: 'alice@example.test' }, { id: 'deleted', email: 'alice@example.test' }]) {
    const f = fixture(subject);
    for (const [name, args] of [['getWorkspaceLabels', []], ['createLabel', [{ name: 'New', workspaceId: 'own' }]], ['updateLabel', ['own-Alpha', { name: 'New' }]], ['deleteLabel', ['own-Alpha']]]) {
      await assert.rejects(f.actions[name](...args), /Unauthorized|User not found/);
    }
    assert.equal(f.reads.length, 0); assert.equal(f.writes.length, 0);
  }
});

test('stale session email cannot authorize foreign or inactive membership mutations', async () => {
  for (const workspaceId of ['foreign', 'revoked']) {
    const f = fixture();
    await assert.rejects(f.actions.createLabel({ name: 'New', workspaceId }), /Workspace not found or access denied/);
    await assert.rejects(f.actions.updateLabel(`${workspaceId}-Alpha`, { color: '#000000' }), /You do not have access to this label/);
    await assert.rejects(f.actions.deleteLabel(`${workspaceId}-Alpha`), /You do not have access to this label/);
    assert.equal(f.writes.length, 0);
  }
});

test('owner and active member create/update/delete preserve trimming/default/color/result behavior', async () => {
  for (const workspaceId of ['own', 'joined']) {
    const f = fixture({ id: 'alice' }, workspaceId);
    const created = await f.actions.createLabel({ name: '  New  ' });
    assert.equal(created.workspaceId, workspaceId); assert.equal(created.name, 'New'); assert.equal(created.color, '#6366F1'); assert.ok(!created.workspace);
    const updated = await f.actions.updateLabel(created.id, { name: ' Renamed ', color: '#abcdef' });
    assert.equal(updated.name, 'Renamed'); assert.equal(updated.color, '#abcdef');
    assert.equal((await f.actions.deleteLabel(created.id)).success, true);
    assert.deepEqual(f.writes, ['create', 'update', 'delete']);
  }
});

test('workspace label read keeps cookie/fallback selection and alphabetical scalar payload', async () => {
  for (const [cookie, selected] of [['joined', 'joined'], ['foreign', 'own'], ['revoked', 'own'], [null, 'own']]) {
    const f = fixture({ id: 'alice', email: 'bob@example.test' }, cookie);
    const result = await f.actions.getWorkspaceLabels();
    assert.equal(result.workspaceId, selected); assert.deepEqual(Array.from(result.labels, row => row.name), ['Alpha', 'Zulu']);
    assert.ok(result.labels.every(row => row.workspaceId === selected && !row.workspace));
  }
});

test('label payload denies membership lost after workspace selection', async () => {
  const f = fixture({ id: 'alice', email: 'alice@example.test' }, 'joined', (phase, spaces) => { if (phase === 'read') spaces[1].members[0].status = false; });
  assert.equal((await f.actions.getWorkspaceLabels()).labels.length, 0);
});

for (const operation of ['create', 'update', 'delete']) test(`${operation} rechecks workspace access at the write boundary`, async () => {
  const f = fixture({ id: 'alice', email: 'alice@example.test' }, 'joined', (phase, spaces) => { if (phase === operation) spaces[1].members[0].status = false; });
  if (operation === 'create') await assert.rejects(f.actions.createLabel({ name: 'New', workspaceId: 'joined' }));
  if (operation === 'update') await assert.rejects(f.actions.updateLabel('joined-Alpha', { name: 'New' }));
  if (operation === 'delete') await assert.rejects(f.actions.deleteLabel('joined-Alpha'));
  assert.equal(f.writes.length, 0); assert.equal(f.labels.length, 8);
  assert.equal(f.labels.find(row => row.id === 'joined-Alpha').name, 'Alpha');
});

test('existing validation, duplicate and missing-label errors remain intact', async () => {
  const f = fixture({ id: 'alice', email: 'alice@example.test' });
  await assert.rejects(f.actions.createLabel({ name: '  ', workspaceId: 'joined' }), /Label name is required/);
  await assert.rejects(f.actions.createLabel({ name: ' Alpha ', workspaceId: 'joined' }), /A label with this name already exists/);
  await assert.rejects(f.actions.updateLabel('joined-Zulu', { name: 'Alpha' }), /A label with this name already exists/);
  await assert.rejects(f.actions.updateLabel('missing', { color: '#000000' }), /Label not found/);
  await assert.rejects(f.actions.deleteLabel('missing'), /Label not found/);
  assert.equal(f.writes.length, 0);
});

for (const operation of ['update', 'delete']) test(`${operation} rejects a label moved after metadata resolution`, async () => {
  const f = fixture({ id: 'alice', email: 'alice@example.test' }, 'joined', (phase, spaces, labels) => {
    if (phase === operation) {
      const row = labels.find(label => label.id === 'joined-Alpha');
      row.workspaceId = 'own'; row.workspace = spaces[0];
    }
  });
  if (operation === 'update') await assert.rejects(f.actions.updateLabel('joined-Alpha', { name: 'New' }));
  else await assert.rejects(f.actions.deleteLabel('joined-Alpha'));
  assert.equal(f.writes.length, 0); assert.equal(f.labels.length, 8);
  assert.equal(f.labels.find(row => row.id === 'joined-Alpha').name, 'Alpha');
});
