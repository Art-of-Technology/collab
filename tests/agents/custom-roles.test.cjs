const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('../security/helpers.cjs');
const { seatsDatabase } = require('./seats-db.cjs');

// The owner may manage the workspace's permissions; the member may only read it; the stranger is in no workspace.
const owner = 'cowner00001', member = 'cmember0001', stranger = 'cstranger01', seatUser = 'cseatuser01', retiredUser = 'cseatuser02';

let db;
after(() => db?.stop());

test("an organisation's own seat roles (CLB-626)", async t => {
  db = await seatsDatabase(async prisma => {
    await prisma.user.createMany({ data: [owner, member, stranger, seatUser, retiredUser].map(id => ({ id, name: id })) });
    await prisma.workspace.create({ data: { id: 'w', name: 'w', slug: 'w-slug', ownerId: owner } });
    await prisma.workspace.create({ data: { id: 'x', name: 'x', slug: 'x', ownerId: stranger } });
    await prisma.workspaceMember.create({ data: { workspaceId: 'w', userId: member } });
    await prisma.project.create({ data: { id: 'p', workspaceId: 'w', name: 'p', slug: 'p', issuePrefix: 'PP' } });
  });
  const { prisma } = db;
  // Each loaded module has its own realm: compare plain values.
  const plain = value => JSON.parse(JSON.stringify(value));
  let user = owner;
  const deps = { zod: require('zod'), '@/lib/prisma': { prisma }, '@/lib/post-access': load('src/lib/post-access.ts'), 'next/server': { NextResponse: Response },
    '@/lib/request-session': { getServerSession: async () => user ? { user: { id: user } } : null }, '@/lib/auth-options': { authOptions: {} },
    '@/lib/permissions': { Permission: { MANAGE_WORKSPACE_PERMISSIONS: 'MANAGE_WORKSPACE_PERMISSIONS' }, checkUserPermission: async (userId, workspaceId) => ({ hasPermission: userId === owner && workspaceId === 'w' }) } };
  deps['@/lib/agent-role-instructions'] = load('src/lib/agent-role-instructions.ts', deps);
  deps['@/lib/agent-custom-roles'] = load('src/lib/agent-custom-roles.ts', deps);
  const { readRoleInstructions } = deps['@/lib/agent-role-instructions'];
  const all = load('src/app/api/workspaces/[workspaceId]/agent-custom-roles/route.ts', deps);
  const one = load('src/app/api/workspaces/[workspaceId]/agent-custom-roles/[roleId]/route.ts', deps);

  /** Calls `handler` as the signed-in person `as`: the status and the body. */
  const call = async (handler, as, body, params) => {
    user = as;
    const reply = await handler(new Request('https://collab.test/api', { method: 'POST', ...(body !== undefined && { body: JSON.stringify(body) }) }), { params: Promise.resolve(params) });
    return [reply.status, await reply.json()];
  };
  const create = (as, body, workspaceId = 'w') => call(all.POST, as, body, { workspaceId });
  const change = (as, roleId, body, workspaceId = 'w') => call(one.PATCH, as, body, { workspaceId, roleId });
  const remove = (as, roleId, workspaceId = 'w') => call(one.DELETE, as, undefined, { workspaceId, roleId });
  const stored = () => prisma.agentCustomRole.findMany({ orderBy: { name: 'asc' }, select: { workspaceId: true, name: true, baseRole: true, instructions: true, retiredAt: true, createdById: true } });
  let qa;

  await t.test('a permission manager adds a role that behaves like a built-in one, and every member sees it under Your organisation', async () => {
    const [status, body] = await create(owner, { name: '  QA Tester ', baseRole: 'developer', instructions: '  Write the test first.\nNever merge.  ' });
    assert.equal(status, 201, JSON.stringify(body));
    qa = body.role;
    assert.deepEqual(plain(body.role), { id: qa.id, name: 'QA Tester', baseRole: 'developer', baseName: 'Developer', instructions: 'Write the test first.\nNever merge.', retired: false, seats: 0 });
    assert.deepEqual(plain(await stored()), [{ workspaceId: 'w', name: 'QA Tester', baseRole: 'developer', instructions: 'Write the test first.\nNever merge.', retiredAt: null, createdById: owner }]);
    for (const as of [owner, member]) {
      const view = await readRoleInstructions(as, 'w-slug');
      assert.deepEqual(plain(view.custom), [body.role], as);
    }
    // Empty instructions are allowed: the role layer is then present and empty.
    const [blank, made] = await create(owner, { name: 'Night reviewer', baseRole: 'reviewer', instructions: '' });
    assert.deepEqual([blank, made.role.instructions, made.role.baseName], [201, '', 'Reviewer']);
    assert.deepEqual(plain((await readRoleInstructions(member, 'w')).custom.map(role => role.name)), ['Night reviewer', 'QA Tester']);
  });

  await t.test("a built-in role's name, a name already used here, an unknown base role or an oversized text is refused", async () => {
    const before = await stored();
    for (const name of ['Developer', ' developer ', 'RELEASE', 'Planner', 'lead']) {
      const [status, body] = await create(owner, { name, baseRole: 'developer', instructions: 'x' });
      assert.deepEqual([status, body.code], [409, 'built_in_name'], name);
      assert.match(body.error, /built-in role/);
    }
    assert.deepEqual((await create(owner, { name: 'qa tester', baseRole: 'reviewer', instructions: 'x' }))[1].code, 'name_taken');
    assert.equal((await create(owner, { name: 'qa tester', baseRole: 'reviewer', instructions: 'x' }))[0], 409);
    assert.equal((await create(owner, { name: 'Tester', baseRole: 'tester', instructions: 'x' }))[0], 400);
    assert.equal((await create(owner, { name: '   ', baseRole: 'developer', instructions: 'x' }))[0], 400);
    assert.equal((await create(owner, { name: 'x'.repeat(61), baseRole: 'developer', instructions: 'x' }))[0], 400);
    assert.equal((await create(owner, { name: 'Tester', baseRole: 'developer', instructions: 'x'.repeat(16_001) }))[0], 400);
    assert.equal((await create(owner, { name: 'Tester', baseRole: 'developer' }))[0], 400);
    assert.equal((await create(owner, { name: 'Tester', baseRole: 'developer', instructions: 'x', retired: true }))[0], 400);
    assert.deepEqual(await stored(), before);
    // The same name in another workspace is that workspace's own.
    await prisma.agentCustomRole.create({ data: { workspaceId: 'x', name: 'QA Tester', baseRole: 'developer', instructions: 'theirs' } });
  });

  await t.test('no one else may add, change or delete a role, and nothing changes when they try', async () => {
    const before = await stored();
    for (const [as, status] of [[member, 403], [stranger, 403], [null, 401]]) {
      assert.equal((await create(as, { name: 'Mine', baseRole: 'developer', instructions: 'x' }))[0], status);
      assert.equal((await change(as, qa.id, { instructions: 'mine' }))[0], status);
      assert.equal((await remove(as, qa.id))[0], status);
    }
    // A permission manager of another workspace changes nothing here either, nor reaches this role through their own.
    assert.equal((await create(owner, { name: 'Mine', baseRole: 'developer', instructions: 'x' }, 'x'))[0], 403);
    const theirs = await prisma.agentCustomRole.findFirstOrThrow({ where: { workspaceId: 'x' } });
    assert.equal((await change(owner, theirs.id, { instructions: 'mine' }))[0], 404);
    assert.equal((await remove(owner, theirs.id))[0], 404);
    assert.deepEqual(await stored(), before);
    assert.equal(await readRoleInstructions(stranger, 'w'), null);
  });

  await t.test('a permission manager edits the name and the instructions; the base role stays', async () => {
    const [status, body] = await change(owner, qa.id, { name: 'QA tester ', instructions: ' Write the failing test first. ' });
    assert.equal(status, 200, JSON.stringify(body));
    assert.deepEqual(plain([body.role.name, body.role.instructions, body.role.baseRole]), ['QA tester', 'Write the failing test first.', 'developer']);
    assert.deepEqual((await change(owner, qa.id, { name: 'Reviewer' }))[1].code, 'built_in_name');
    assert.deepEqual((await change(owner, qa.id, { name: 'night REVIEWER' }))[1].code, 'name_taken');
    assert.equal((await change(owner, qa.id, { baseRole: 'reviewer' }))[0], 400);
    assert.equal((await change(owner, qa.id, { instructions: 'x'.repeat(16_001) }))[0], 400);
    assert.equal((await change(owner, 'cnosuchrole1', { instructions: 'x' }))[0], 404);
    const row = await prisma.agentCustomRole.findUniqueOrThrow({ where: { id: qa.id } });
    assert.deepEqual([row.name, row.instructions, row.baseRole], ['QA tester', 'Write the failing test first.', 'developer']);
  });

  await t.test('a role with seats cannot be deleted; it is retired instead, and can be brought back', async () => {
    // A live seat and a retired one have the role.
    await prisma.agentSeat.create({ data: { workspaceId: 'w', projectId: 'p', role: 'developer', userId: seatUser, name: 'qa-1', customRoleId: qa.id } });
    await prisma.agentSeat.create({ data: { workspaceId: 'w', projectId: 'p', role: 'developer', userId: retiredUser, name: 'qa-0', customRoleId: qa.id, retiredAt: new Date() } });
    const [status, body] = await remove(owner, qa.id);
    assert.deepEqual([status, body.code], [409, 'has_seats']);
    assert.match(body.error, /retire/i);
    assert.equal(await prisma.agentCustomRole.count({ where: { id: qa.id } }), 1);
    // The database holds it too, should two deletes race the check.
    await assert.rejects(prisma.agentCustomRole.delete({ where: { id: qa.id } }));
    assert.equal((await readRoleInstructions(member, 'w')).custom.find(role => role.id === qa.id).seats, 2);

    const [retired, gone] = await change(owner, qa.id, { retired: true });
    assert.deepEqual([retired, gone.role.retired], [200, true]);
    assert.ok((await prisma.agentCustomRole.findUniqueOrThrow({ where: { id: qa.id } })).retiredAt);
    // Still listed, marked retired, and its seats keep it.
    assert.equal((await readRoleInstructions(member, 'w')).custom.find(role => role.id === qa.id).retired, true);
    assert.equal(await prisma.agentSeat.count({ where: { customRoleId: qa.id } }), 2);
    const [back, again] = await change(owner, qa.id, { retired: false });
    assert.deepEqual([back, again.role.retired], [200, false]);
  });

  await t.test('a role no seat has is deleted', async () => {
    const night = (await readRoleInstructions(owner, 'w')).custom.find(role => role.name === 'Night reviewer');
    assert.deepEqual(await remove(owner, night.id), [200, { deleted: night.id }]);
    assert.deepEqual(plain((await readRoleInstructions(owner, 'w')).custom.map(role => role.name)), ['QA tester']);
    assert.equal((await remove(owner, night.id))[0], 404);
  });

  await t.test('a workspace that goes takes its roles, and their seats, with it', async () => {
    await prisma.workspace.delete({ where: { id: 'w' } });
    assert.deepEqual((await stored()).map(row => row.workspaceId), ['x']);
  });
});
