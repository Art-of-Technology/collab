const { assert, test, load, matches } = require('./helpers.cjs');

function fixture(sessionUser = { id: 'alice', email: 'bob@example.test' }) {
  const users = ['alice', 'bob', 'carol'].map(id => ({ id, email: `${id}@example.test`, role: id === 'carol' ? 'SYSTEM_ADMIN' : 'DEVELOPER', createdAt: new Date(), updatedAt: new Date() }));
  const spaces = [
    { id: 'own', slug: 'own-slug', ownerId: 'alice', members: [{ id: 'carol-member', workspaceId: 'own', userId: 'carol', status: true, role: 'MEMBER' }] },
    ...['active', 'revoked', 'foreign'].map(id => ({ id, slug: `${id}-slug`, ownerId: 'bob', members: id === 'foreign' ? [] : [
      { id: `${id}-member`, workspaceId: id, userId: 'alice', status: id === 'active', role: 'admin' },
    ] })),
  ];
  const calls = { users: [], reads: [], writes: [] };
  const project = (row, spec) => !row ? null : { ...row, members: row.members.filter(member =>
    !spec.include?.members?.where || matches(member, spec.include.members.where)) };
  const db = {
    user: { findUnique: async ({ where }) => { calls.users.push(where); return users.find(row => matches(row, where)) ?? null; } },
    workspace: {
      findUnique: async spec => { calls.reads.push(spec); return project(spaces.find(row => matches(row, spec.where)), spec); },
      findFirst: async ({ where }) => { calls.reads.push(where); return spaces.find(row => matches(row, where)) ?? null; },
      findMany: async ({ where }) => { calls.reads.push(where); return spaces.filter(row => matches(row, where)); },
      count: async ({ where }) => { calls.reads.push(where); return spaces.filter(row => matches(row, where)).length; },
      create: async spec => { calls.writes.push({ operation: 'create', ...spec }); return { id: 'created', ...spec.data }; },
      update: async spec => { calls.writes.push({ operation: 'update', ...spec }); return { ...spaces.find(row => matches(row, spec.where)), ...spec.data }; },
      delete: async spec => { calls.writes.push({ operation: 'delete', ...spec }); return {}; },
    },
    workspaceMember: {
      findFirst: async ({ where }) => { calls.reads.push(where); return spaces.flatMap(row => row.members).find(row => matches(row, where)) ?? null; },
      create: async spec => { calls.writes.push({ operation: 'member-create', ...spec }); return spec.data; },
      delete: async spec => { calls.writes.push({ operation: 'member-delete', ...spec }); return {}; },
      update: async spec => { calls.writes.push({ operation: 'member-update', ...spec }); return spec.data; },
    },
  };
  const deps = {
    'next-auth': { getServerSession: async () => sessionUser && { user: sessionUser } },
    '@/lib/auth-options': {}, '@/lib/auth': {}, '@/lib/prisma': { prisma: db },
    '@/lib/utils': { generateWorkspaceSlug: value => value.toLowerCase().replaceAll(' ', '-') },
    'next/server': { NextResponse: Response },
  };
  deps['@/lib/session'] = load('src/lib/session.ts', deps, { console });
  return { actions: load('src/actions/workspace.ts', deps),
    rest: load('src/app/api/workspaces/[workspaceId]/route.ts', deps, { console }), calls, spaces, users };
}

const cases = [
  ['getUserWorkspaces', a => a.getUserWorkspaces(), result => assert.equal(result.owned[0].id, 'own')],
  ['getWorkspaceById', a => a.getWorkspaceById('own-slug'), result => assert.equal(result.isOwner, true)],
  ['createWorkspace', a => a.createWorkspace({ name: 'New Space' }), result => assert.equal(result.owner.connect.id, 'alice')],
  ['updateWorkspace', a => a.updateWorkspace('own', { name: 'Updated' }), result => assert.equal(result.name, 'Updated')],
  ['deleteWorkspace', a => a.deleteWorkspace('own'), result => assert.equal(result.success, true)],
  ['addWorkspaceMember', a => a.addWorkspaceMember({ workspaceId: 'own', email: 'bob@example.test' }), result => assert.equal(result.user.connect.id, 'bob')],
  ['removeWorkspaceMember', a => a.removeWorkspaceMember({ workspaceId: 'own', userId: 'carol' }), result => assert.equal(result.success, true)],
  ['checkWorkspaceLimit', a => a.checkWorkspaceLimit(), result => assert.equal(result.currentCount, 1)],
  ['updateWorkspaceMemberStatus', a => a.updateWorkspaceMemberStatus({ workspaceId: 'own', memberId: 'carol-member', status: false }), result => assert.equal(result.status, false)],
];
for (const [name, invoke, check] of cases) test(`${name} binds the actor to subject ID and denies absent/deleted subjects`, async () => {
  for (const email of ['bob@example.test', undefined]) {
    const { actions } = fixture({ id: 'alice', email });
    check(await invoke(actions));
  }
  for (const user of [null, { email: 'alice@example.test' }, { id: '', email: 'alice@example.test' }, { id: 'deleted', email: 'alice@example.test' }]) {
    const { actions, calls } = fixture(user);
    await assert.rejects(invoke(actions), user?.id === 'deleted' ? /User not found/ : /Unauthorized/);
    assert.equal(calls.reads.length, 0);
    assert.equal(calls.writes.length, 0);
    assert.equal(calls.users.length, user?.id === 'deleted' ? 1 : 0);
  }
});

test('workspace action owner, self-removal, status-admin and validation restrictions remain intact', async () => {
  const { actions, calls, spaces } = fixture({ id: 'alice' });
  for (const invoke of [
    () => actions.updateWorkspace('foreign', { name: 'Denied' }),
    () => actions.deleteWorkspace('foreign'),
    () => actions.addWorkspaceMember({ workspaceId: 'foreign', email: 'carol@example.test' }),
    () => actions.removeWorkspaceMember({ workspaceId: 'foreign', userId: 'bob' }),
    () => actions.updateWorkspaceMemberStatus({ workspaceId: 'revoked', memberId: 'revoked-member', status: false }),
  ]) await assert.rejects(invoke(), /Only/);
  assert.equal(calls.writes.length, 0);
  await actions.removeWorkspaceMember({ workspaceId: 'active', userId: 'alice' });
  assert.equal(calls.writes.at(-1).where.id, 'active-member');
  spaces[1].members[0].role = 'ADMIN';
  spaces[1].members.push({ id: 'target', workspaceId: 'active', userId: 'carol', status: true });
  await actions.updateWorkspaceMemberStatus({ workspaceId: 'active', memberId: 'target', status: false });
  assert.equal(calls.writes.at(-1).where.id, 'target');
  spaces[1].members[0].status = false;
  const before = calls.writes.length;
  await assert.rejects(actions.updateWorkspaceMemberStatus({ workspaceId: 'active', memberId: 'target', status: false }), /Only/);
  await assert.rejects(actions.createWorkspace({ name: '' }), /Workspace name is required/);
  assert.equal(calls.writes.length, before);
});

const request = (method, workspaceId) => new Request(`https://example.test/api/workspaces/${workspaceId}`, {
  method, ...(method === 'PATCH' ? { body: JSON.stringify({ name: 'Updated' }) } : {}),
});
const params = workspaceId => ({ params: Promise.resolve({ workspaceId }) });

test('workspace REST requires subject ID before reads/writes in all methods', async () => {
  for (const user of [null, { email: 'alice@example.test', role: 'SYSTEM_ADMIN' }, { id: '', role: 'SYSTEM_ADMIN' }, { id: 'deleted', email: 'alice@example.test', role: 'SYSTEM_ADMIN' }]) {
    const { rest, calls } = fixture(user);
    for (const method of ['GET', 'PATCH', 'DELETE']) {
      const response = await rest[method](request(method, 'own'), params('own'));
      assert.equal(response.status, 401);
    }
    assert.equal(calls.reads.length, 0);
    assert.equal(calls.writes.length, 0);
  }
});

test('workspace REST update rejects revoked admins and preserves active-admin/owner rules', async () => {
  const { rest, calls } = fixture({ id: 'alice', email: 'bob@example.test' });
  for (const id of ['revoked', 'foreign']) {
    const response = await rest.PATCH(request('PATCH', id), params(id));
    assert.equal(response.status, 403);
    assert.equal(calls.writes.length, 0);
  }
  for (const id of ['own', 'active']) {
    assert.equal((await rest.PATCH(request('PATCH', id), params(id))).status, 200);
    assert.equal(calls.writes.at(-1).where.id, id);
  }
  assert.equal((await rest.GET(request('GET', 'own-slug'), params('own-slug'))).status, 200);
  assert.equal((await rest.GET(request('GET', 'revoked'), params('revoked'))).status, 403);
  const before = calls.writes.length;
  assert.equal((await rest.DELETE(request('DELETE', 'active'), params('active'))).status, 403);
  assert.equal(calls.writes.length, before);
  assert.equal((await rest.DELETE(request('DELETE', 'own'), params('own'))).status, 200);
});

for (const method of ['PATCH', 'DELETE']) test(`workspace REST ${method} uses current SYSTEM_ADMIN authority and denies ordinary/demoted users without writes`, async () => {
  const staleAdmin = fixture({ id: 'alice', role: 'SYSTEM_ADMIN' });
  assert.equal((await staleAdmin.rest[method](request(method, 'foreign'), params('foreign'))).status, 403);
  assert.equal(staleAdmin.calls.writes.length, 0);
  const admin = fixture({ id: 'carol', role: 'DEVELOPER' });
  assert.equal((await admin.rest[method](request(method, 'foreign'), params('foreign'))).status, 200);
  assert.equal(admin.calls.writes.length, 1);
  assert.equal(admin.calls.writes[0].operation, method === 'PATCH' ? 'update' : 'delete');
  assert.equal(admin.calls.writes[0].where.id, 'foreign');
  admin.users.find(user => user.id === 'carol').role = 'DEVELOPER';
  admin.calls.writes.length = 0;
  assert.equal((await admin.rest[method](request(method, 'foreign'), params('foreign'))).status, 403);
  assert.equal(admin.calls.writes.length, 0);
});
