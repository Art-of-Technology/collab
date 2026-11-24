const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('../security/helpers.cjs');
const { seatsDatabase } = require('./seats-db.cjs');

// The owner may manage the workspace's permissions; the member may only read it; the stranger is in no workspace.
const owner = 'cowner00001', member = 'cmember0001', stranger = 'cstranger01';

let db;
after(() => db?.stop());

test("an organisation's own instructions per role", async t => {
  db = await seatsDatabase(async prisma => {
    await prisma.user.createMany({ data: [owner, member, stranger].map(id => ({ id, name: id })) });
    await prisma.workspace.create({ data: { id: 'w', name: 'w', slug: 'w-slug', ownerId: owner } });
    await prisma.workspace.create({ data: { id: 'x', name: 'x', slug: 'x', ownerId: stranger } });
    await prisma.workspaceMember.create({ data: { workspaceId: 'w', userId: member } });
  });
  const { prisma } = db;
  const { ROLE_CATALOGUE } = load('src/lib/agent-role-catalogue.ts');
  // Each loaded module has its own realm: compare plain values.
  const plain = value => JSON.parse(JSON.stringify(value));
  let user = owner;
  const deps = { zod: require('zod'), '@/lib/prisma': { prisma }, '@/lib/post-access': load('src/lib/post-access.ts'), 'next/server': { NextResponse: Response },
    '@/lib/request-session': { getServerSession: async () => user ? { user: { id: user } } : null }, '@/lib/auth-options': { authOptions: {} },
    '@/lib/permissions': { Permission: { MANAGE_WORKSPACE_PERMISSIONS: 'MANAGE_WORKSPACE_PERMISSIONS' }, checkUserPermission: async (userId, workspaceId) => ({ hasPermission: userId === owner && workspaceId === 'w' }) } };
  deps['@/lib/agent-custom-roles'] = load('src/lib/agent-custom-roles.ts', deps);
  deps['@/lib/agent-role-instructions'] = load('src/lib/agent-role-instructions.ts', deps);
  const { readRoleInstructions } = deps['@/lib/agent-role-instructions'];
  const route = load('src/app/api/workspaces/[workspaceId]/agent-roles/[role]/route.ts', deps);

  /** Saves `text` for `role` as the signed-in person `as`: the status and the body. */
  const save = async (as, role, body, workspaceId = 'w') => {
    user = as;
    const reply = await route.PUT(new Request('https://collab.test/api', { method: 'PUT', body: JSON.stringify(body) }), { params: Promise.resolve({ workspaceId, role }) });
    return [reply.status, await reply.json()];
  };
  const stored = () => prisma.agentRoleInstructions.findMany({ orderBy: [{ workspaceId: 'asc' }, { role: 'asc' }], select: { workspaceId: true, role: true, text: true, updatedById: true } });

  await t.test('every member reads each role with its locked platform layer; only a permission manager may edit', async () => {
    for (const [as, canEdit] of [[owner, true], [member, false]]) {
      for (const id of ['w', 'w-slug']) {
        const view = await readRoleInstructions(as, id);
        assert.equal(view.workspace.id, 'w');
        assert.equal(view.canEdit, canEdit, as);
        assert.deepEqual(plain(view.roles.map(role => role.id)), plain(ROLE_CATALOGUE.roles.map(role => role.id)));
        const developer = view.roles.find(role => role.id === 'developer');
        assert.deepEqual(plain([developer.name, developer.takes, developer.repository]), ['Developer', ['Ordinary issues', 'Developer request'], 'yes']);
        assert.deepEqual(plain(view.roles.find(role => role.id === 'reviewer').takes), ['Review request']);
        // The platform layer as a run gets it, with no one owner named, and nothing from the organisation yet.
        assert.equal(developer.platform, ROLE_CATALOGUE.instructionLayers('developer', { ownerId: null })[0].text);
        assert.equal(developer.organisation, '');
      }
    }
    // Someone outside the workspace does not see it at all.
    assert.equal(await readRoleInstructions(stranger, 'w'), null);
    assert.equal(await readRoleInstructions(member, 'x'), null);
  });

  await t.test('a permission manager saves the text, trimmed, and every member then reads it', async () => {
    assert.deepEqual(await save(owner, 'developer', { text: '  We use British English.\nNever force-push.  ' }), [200, { role: 'developer', text: 'We use British English.\nNever force-push.' }]);
    assert.deepEqual(await stored(), [{ workspaceId: 'w', role: 'developer', text: 'We use British English.\nNever force-push.', updatedById: owner }]);
    for (const as of [owner, member]) {
      const roles = (await readRoleInstructions(as, 'w')).roles;
      assert.deepEqual(plain(roles.map(role => [role.id, role.organisation])), plain(ROLE_CATALOGUE.roles.map(role => [role.id, role.id === 'developer' ? 'We use British English.\nNever force-push.' : ''])));
    }
    // Saved again, the one row for the role changes.
    assert.deepEqual(await save(owner, 'developer', { text: 'Never force-push.' }), [200, { role: 'developer', text: 'Never force-push.' }]);
    assert.deepEqual((await stored()).map(row => row.text), ['Never force-push.']);
    // One row per workspace and role, also when two saves race.
    await assert.rejects(prisma.agentRoleInstructions.create({ data: { workspaceId: 'w', role: 'developer', text: 'second' } }));
  });

  await t.test('no one else may change it, and nothing is saved when they try', async () => {
    const before = await stored();
    assert.equal((await save(member, 'developer', { text: 'mine' }))[0], 403);
    assert.equal((await save(stranger, 'developer', { text: 'mine' }))[0], 403);
    assert.equal((await save(null, 'developer', { text: 'mine' }))[0], 401);
    // A permission manager of another workspace changes nothing here either.
    assert.equal((await save(owner, 'developer', { text: 'mine' }, 'x'))[0], 403);
    assert.deepEqual(await stored(), before);
  });

  await t.test('a role outside the catalogue, a text over the limit or a malformed body is refused', async () => {
    const before = await stored();
    assert.equal((await save(owner, 'qa-tester', { text: 'x' }))[0], 404);
    assert.equal((await save(owner, 'developer', { text: 'x'.repeat(16_001) }))[0], 400);
    assert.equal((await save(owner, 'developer', { text: 12 }))[0], 400);
    assert.equal((await save(owner, 'developer', { text: 'x', role: 'lead' }))[0], 400);
    assert.deepEqual(await stored(), before);
    // The limit counts the trimmed text.
    assert.equal((await save(owner, 'security', { text: ` ${'y'.repeat(16_000)} ` }))[0], 200);
    assert.equal((await stored()).find(row => row.role === 'security').text.length, 16_000);
  });

  await t.test('saving empty text removes the organisation layer of that role', async () => {
    assert.deepEqual(await save(owner, 'security', { text: '   ' }), [200, { role: 'security', text: '' }]);
    assert.deepEqual((await stored()).map(row => row.role), ['developer']);
    assert.equal((await readRoleInstructions(member, 'w')).roles.find(role => role.id === 'security').organisation, '');
  });

  await t.test("a seat's own instructions have a column, empty for every seat that exists", async () => {
    const columns = await prisma.$queryRawUnsafe(`SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'AgentSeat' AND column_name = 'instructions'`);
    assert.deepEqual(columns, [{ column_name: 'instructions', data_type: 'text', is_nullable: 'YES' }]);
  });

  await t.test('a workspace that goes takes its instructions with it', async () => {
    await prisma.agentRoleInstructions.create({ data: { workspaceId: 'x', role: 'developer', text: 'x rules' } });
    await prisma.workspace.delete({ where: { id: 'x' } });
    assert.deepEqual((await stored()).map(row => row.workspaceId), ['w']);
  });
});
