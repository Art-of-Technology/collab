const { assert, test, load, matches } = require('./helpers.cjs');

// Pinning a note and reading a secret note's audit log: the author, or anyone at the Admin level and
// above in the note's workspace, asked through the one authority module with the real handlers.
const ROWS = [
  ['carol', 'MEMBER'], ['adam', 'ADMIN'], ['adal', 'admin'], ['otto', 'OWNER'], ['ola', 'Owner'],
  ['sam', 'MEMBER'], ['dev', 'Developer'], ['off', 'ADMIN', false], ['padm', 'MEMBER'],
];
const PLATFORM_ADMINS = ['root', 'padm'];

function note(id, fields = {}) {
  return { id, authorId: 'carol', scope: 'WORKSPACE', workspaceId: 'w', projectId: null, project: null, folder: null,
    isRestricted: false, isEncrypted: false, expiresAt: null, sharedWith: [], isPinned: false, ...fields };
}

function fixture(userId) {
  // The primary owner, olivia, has no membership row.
  const workspace = { id: 'w', ownerId: 'olivia',
    members: ROWS.map(([user, role, status = true]) => ({ userId: user, workspaceId: 'w', role, status })) };
  const notes = [
    note('plain'),
    note('secret', { isEncrypted: true }),
    note('locked', { isEncrypted: true, isRestricted: true }),
    note('personal', { scope: 'PERSONAL' }),
    note('in-project', { workspaceId: null, projectId: 'p', project: { workspaceId: 'w' } }),
  ];
  const state = { updates: 0 };
  const membersWhere = (where) => workspace.members.filter(member => matches(member, where));
  const prisma = {
    note: {
      findUnique: async ({ where, include }) => {
        const row = notes.find(item => item.id === where.id);
        if (!row || !include?.workspace) return row ?? null;
        return { ...row, workspace: row.workspaceId === 'w'
          ? { ...workspace, members: membersWhere(include.workspace.include.members.where) } : null };
      },
      update: async ({ where, data }) => { state.updates++; const row = notes.find(item => item.id === where.id); Object.assign(row, data); return row; },
    },
    workspace: {
      findFirst: async ({ where, select }) => matches(workspace, where)
        ? { ...workspace, members: membersWhere(select.members.where) } : null,
      findUnique: async ({ where }) => (where.id === 'w' ? workspace : null),
    },
    user: {
      findUnique: async ({ where, select }) => ({
        role: PLATFORM_ADMINS.includes(where.id) ? 'SYSTEM_ADMIN' : 'USER',
        workspaceMemberships: membersWhere({ userId: where.id, ...select.workspaceMemberships.where }),
      }),
    },
    workspaceMember: {
      findUnique: async ({ where: { userId_workspaceId: key } }) =>
        workspace.members.find(member => member.userId === key.userId && member.workspaceId === key.workspaceId) ?? null,
    },
    noteActivityLog: { findMany: async () => [], count: async () => 0 },
  };
  const dependencies = {
    'next/server': { NextResponse: Response },
    '@/lib/request-session': { getServerSession: async () => ({ user: { id: userId } }) },
    '@/lib/auth-options': { authOptions: {} },
    '@/lib/prisma': { prisma },
  };
  const globals = { URL, console };
  const pin = (id, value = true) => load('src/app/api/notes/[id]/pin/route.ts', dependencies, globals).POST(
    new Request('https://example.test/api/notes/pin', { method: 'POST', body: JSON.stringify({ pin: value }) }),
    { params: Promise.resolve({ id }) },
  );
  const auditLog = (id) => load('src/app/api/notes/[id]/secrets/audit-log/route.ts', dependencies, globals).GET(
    new Request('https://example.test/api/notes/audit-log'), { params: Promise.resolve({ id }) },
  );
  const access = () => load('src/lib/secrets/access.ts', dependencies, globals);
  return { pin, auditLog, access, notes, state };
}

test('pinning and the secret audit log: the author, an Admin, an Owner and the primary owner pass in any letter case of the stored role; a standard member is refused', async () => {
  for (const user of ['carol', 'adam', 'adal', 'otto', 'ola', 'olivia']) {
    const f = fixture(user);
    assert.equal((await f.pin('plain')).status, 200, `${user} pins`);
    assert.equal(f.notes[0].isPinned, true, user);
    assert.equal((await f.auditLog('secret')).status, 200, `${user} reads the audit log`);
  }
  for (const user of ['sam', 'dev', 'padm']) {
    const f = fixture(user);
    assert.equal((await f.pin('plain')).status, 403, `${user} pins`);
    assert.equal((await f.auditLog('secret')).status, 403, `${user} reads the audit log`);
    assert.equal(f.state.updates, 0, user);
  }
});

test('a platform admin who is not a member and a switched-off Admin are refused, and a restricted secret note stays closed', async () => {
  for (const user of ['root', 'off']) {
    const f = fixture(user);
    assert.equal((await f.pin('plain')).status, 404, `${user} pins`);
    assert.equal((await f.auditLog('secret')).status, 404, `${user} reads the audit log`);
    assert.equal((await f.auditLog('locked')).status, 404, `${user} reads a restricted note's audit log`);
    assert.equal((await f.access().canAccessNote(user, 'locked')).canAccess, false, user);
    assert.equal(f.state.updates, 0, user);
  }
  // A restricted note needs a share even at the Admin level and above; its author keeps it.
  for (const user of ['adam', 'olivia']) {
    assert.equal((await fixture(user).auditLog('locked')).status, 404, user);
    assert.equal((await fixture(user).access().canAccessNote(user, 'locked')).canAccess, false, user);
  }
  assert.equal((await fixture('carol').auditLog('locked')).status, 200);
});

test('the personal-note rule and a note that reaches its workspace through a project are as before', async () => {
  // Only the author pins a personal note, whatever the level.
  assert.equal((await fixture('olivia').pin('personal')).status, 403);
  assert.equal((await fixture('carol').pin('personal')).status, 200);
  // A note with no workspace of its own has no admin line on these paths: only its author passes.
  for (const user of ['adam', 'olivia']) {
    assert.equal((await fixture(user).pin('in-project')).status, 403, user);
    assert.equal((await fixture(user).auditLog('in-project')).status, 403, user);
  }
  assert.equal((await fixture('carol').pin('in-project')).status, 200);
  assert.equal((await fixture('carol').auditLog('in-project')).status, 200);
});
