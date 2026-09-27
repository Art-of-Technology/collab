const { assert, test, load, matches, workspaces } = require('./helpers.cjs');

function fixture(subject = { id: 'alice', email: 'bob@example.test' }, beforeStatusRead = () => {}) {
  const users = ['alice', 'bob'].map(id => ({ id, email: `${id}@example.test`, role: 'DEVELOPER', createdAt: new Date(), updatedAt: new Date() }));
  const spaces = structuredClone(workspaces);
  const projects = spaces.map(workspace => ({ id: `p-${workspace.id}`, workspace }));
  const statuses = projects.flatMap(project => ['Zulu', 'Alpha', 'First'].map((name, index) => ({
    id: `${project.id}-${name}`, projectId: project.id, project, name, displayName: `${name} display`,
    order: index === 2 ? 0 : 1, color: '#123456', iconName: 'circle', isActive: index !== 0,
  })));
  const reads = [];
  const db = {
    user: { findUnique: async ({ where }) => users.find(row => matches(row, where)) ?? null },
    project: { findMany: async ({ where }) => projects.filter(row => matches(row, where)) },
    projectStatus: { findMany: async spec => {
      beforeStatusRead(spaces); reads.push(spec);
      return statuses.filter(row => matches(row, spec.where)).sort((a, b) => {
        for (const order of spec.orderBy) {
          const field = Object.keys(order)[0];
          const compared = typeof a[field] === 'number' ? a[field] - b[field] : a[field].localeCompare(b[field]);
          if (compared) return order[field] === 'asc' ? compared : -compared;
        }
        return 0;
      }).map(({ project, ...status }) => status);
    } },
  };
  const deps = { '@/lib/prisma': { prisma: db }, '@/lib/auth-options': {},
    '@/lib/auth': { getAuthSession: async () => subject && { user: subject } },
    'next-auth': { getServerSession: async () => subject && { user: subject } },
  };
  deps['@/lib/session'] = load('src/lib/session.ts', deps, { console });
  return { action: load('src/actions/status.ts', deps).getProjectStatuses, users, spaces, reads };
}
const error = /Failed to fetch project statuses\. Please try again\./;

test('statuses use live subject, preserve owner/active access, and exclude foreign/revoked projects', async () => {
  const f = fixture();
  const rows = await f.action(['p-own', 'p-joined', 'p-revoked', 'p-foreign', 'missing']);
  assert.equal(rows.length, 6);
  assert.deepEqual([...new Set(rows.map(row => row.projectId))].sort(), ['p-joined', 'p-own']);
  assert.ok(rows.every(row => !row.project));
  f.users[0].role = 'SYSTEM_ADMIN';
  assert.equal((await f.action(['p-foreign', 'p-revoked'])).length, 0);
});

test('missing, email-only, and deleted subjects fail closed before status IO', async () => {
  for (const subject of [null, { email: 'alice@example.test' }, { id: 'deleted', email: 'alice@example.test' }]) {
    const f = fixture(subject);
    await assert.rejects(f.action(['p-own']), error);
    assert.equal(f.reads.length, 0);
  }
});

test('selection, empty results, scalar projection, inactive statuses, and order remain unchanged', async () => {
  const f = fixture({ id: 'alice', email: 'alice@example.test' });
  const rows = await f.action(['p-own', 'p-own']);
  assert.deepEqual(Array.from(rows, row => row.name), ['First', 'Alpha', 'Zulu']);
  assert.equal(rows[0].displayName, 'First display'); assert.equal(rows[0].iconName, 'circle');
  assert.equal(rows[2].isActive, false);
  assert.equal((await f.action([])).length, 0);
  assert.equal((await f.action(['missing'])).length, 0);
});

test('status payload query denies membership revoked at read time', async () => {
  const f = fixture({ id: 'alice', email: 'alice@example.test' }, spaces => { spaces.find(row => row.id === 'joined').members[0].status = false; });
  assert.equal((await f.action(['p-joined'])).length, 0);
});

test('owner access needs no membership and stale email cannot select another identity', async () => {
  const f = fixture({ id: 'alice' });
  assert.equal((await f.action(['p-own'])).length, 3);
  f.users[0].email = 'renamed@example.test';
  assert.equal((await f.action(['p-own'])).length, 3);
  f.users.splice(0, 1);
  await assert.rejects(f.action(['p-own']), error);
});
