// The one authority module: the four workspace levels, the named actions and the rank rule.
const { assert, test, load, matches } = require('./helpers.cjs');

const BUILT_IN = ['OWNER', 'ADMIN', 'MODERATOR', 'DEVELOPER', 'PROJECT_MANAGER', 'DESIGNER', 'QA_TESTER', 'CONTENT_CREATOR',
  'ANALYST', 'HR', 'MARKETING', 'SALES', 'CUSTOMER_SUPPORT', 'MEMBER', 'VIEWER', 'GUEST'];
const LEVELS = ['PRIMARY_OWNER', 'OWNER', 'ADMIN', 'STANDARD'];

function fixture({ users = [], members = [], workspaces = [{ id: 'workspace', ownerId: 'primary' }] } = {}) {
  const reads = [];
  const prisma = {
    workspace: { findUnique: async args => { reads.push(['workspace', args]); const row = workspaces.find(w => matches(w, args.where)); return row ? { ownerId: row.ownerId } : null; } },
    user: {
      findUnique: async args => {
        reads.push(['user', args]);
        const user = users.find(u => matches(u, args.where));
        if (!user) return null;
        const where = args.select.workspaceMemberships.where;
        return { role: user.role, workspaceMemberships: members.filter(m => m.userId === user.id && matches(m, where)).map(m => ({ role: m.role })) };
      },
    },
  };
  return { reads, authority: load('src/lib/workspace-authority.ts', { './prisma': { prisma } }) };
}
const pure = () => fixture().authority;
const actor = (level, userId = 'actor') => ({ userId, level, role: null, platformAdmin: false });

test('each stored role maps to one level, whatever its letter case', () => {
  const { levelOfRole } = pure();
  for (const role of ['OWNER', 'owner', 'Owner']) assert.equal(levelOfRole(role), 'OWNER');
  for (const role of ['ADMIN', 'admin', 'Admin']) assert.equal(levelOfRole(role), 'ADMIN');
  for (const role of BUILT_IN.filter(role => role !== 'OWNER' && role !== 'ADMIN')) {
    assert.equal(levelOfRole(role), 'STANDARD', role);
    assert.equal(levelOfRole(role.toLowerCase()), 'STANDARD', role);
  }
  for (const role of ['Release Captain', 'owners', 'administrator', '', 'SYSTEM_ADMIN']) assert.equal(levelOfRole(role), 'STANDARD', role);
});

test("the workspace's owner is PRIMARY_OWNER with no membership row, an inactive one, or another role on it", async () => {
  const users = [{ id: 'primary', role: 'DEVELOPER' }];
  const cases = [[], [{ userId: 'primary', workspaceId: 'workspace', role: 'OWNER', status: false }], [{ userId: 'primary', workspaceId: 'workspace', role: 'MEMBER', status: true }]];
  for (const members of cases) {
    const result = await fixture({ users, members }).authority.getWorkspaceAuthority('primary', 'workspace');
    assert.equal(result.level, 'PRIMARY_OWNER');
    assert.equal(result.userId, 'primary');
    assert.equal(result.platformAdmin, false);
  }
  // The others: an active Owner, Admin and standard member, a platform admin with no row, and outsiders.
  const people = [{ id: 'primary', role: 'DEVELOPER' }, { id: 'o', role: 'DEVELOPER' }, { id: 'a', role: 'DEVELOPER' }, { id: 'h', role: 'DEVELOPER' },
    { id: 'gone', role: 'DEVELOPER' }, { id: 'root', role: 'SYSTEM_ADMIN' }, { id: 'stranger', role: 'DEVELOPER' }];
  const rows = [['o', 'owner', true], ['a', 'Admin', true], ['h', 'HR', true], ['gone', 'OWNER', false],
    ['o', 'ADMIN', true, 'foreign']].map(([userId, role, status, workspaceId = 'workspace']) => ({ userId, role, status, workspaceId }));
  const { authority } = fixture({ users: people, members: rows, workspaces: [{ id: 'workspace', ownerId: 'primary' }, { id: 'foreign', ownerId: 'o' }] });
  assert.deepEqual({ ...await authority.getWorkspaceAuthority('o', 'workspace') }, { userId: 'o', level: 'OWNER', role: 'owner', platformAdmin: false });
  assert.deepEqual({ ...await authority.getWorkspaceAuthority('a', 'workspace') }, { userId: 'a', level: 'ADMIN', role: 'Admin', platformAdmin: false });
  assert.deepEqual({ ...await authority.getWorkspaceAuthority('h', 'workspace') }, { userId: 'h', level: 'STANDARD', role: 'HR', platformAdmin: false });
  assert.deepEqual({ ...await authority.getWorkspaceAuthority('root', 'workspace') }, { userId: 'root', level: null, role: null, platformAdmin: true });
  assert.equal(await authority.getWorkspaceAuthority('gone', 'workspace'), null);
  assert.equal(await authority.getWorkspaceAuthority('stranger', 'workspace'), null);
  assert.equal(await authority.getWorkspaceAuthority('missing', 'workspace'), null);
  assert.equal(await authority.getWorkspaceAuthority('a', 'nowhere'), null);
  assert.equal((await authority.getWorkspaceAuthority('o', 'foreign')).level, 'PRIMARY_OWNER');
});

test('each action answers yes from its minimum level and no below it', () => {
  const { may } = pure();
  const minimum = {
    'workspace.delete': 'PRIMARY_OWNER', 'workspace.transfer': 'PRIMARY_OWNER', 'owners.manage': 'PRIMARY_OWNER',
    'workspace.settings': 'OWNER', 'roles.edit': 'OWNER', 'apps.manage': 'OWNER',
    'members.manage': 'ADMIN', 'members.invite': 'ADMIN',
  };
  for (const [action, level] of Object.entries(minimum)) {
    for (const held of LEVELS) assert.equal(may(actor(held), action), LEVELS.indexOf(held) <= LEVELS.indexOf(level), `${held} ${action}`);
    // No level, no access and an unknown action are all no.
    assert.equal(may({ userId: 'root', level: null, role: null, platformAdmin: true }, action), false);
    assert.equal(may(null, action), false);
  }
  assert.equal(may(actor('PRIMARY_OWNER'), 'workspace.anything'), false);
  assert.equal(may(actor('PRIMARY_OWNER'), 'toString'), false);
});

test('content.manage and spend.view start at Admin; integrations.manage and runners.manage start at Owner; a standard role and an unknown action get no', () => {
  const { may } = pure();
  const minimum = { 'content.manage': 'ADMIN', 'spend.view': 'ADMIN', 'integrations.manage': 'OWNER', 'runners.manage': 'OWNER' };
  for (const [action, level] of Object.entries(minimum)) {
    for (const held of LEVELS) assert.equal(may(actor(held), action), LEVELS.indexOf(held) <= LEVELS.indexOf(level), `${held} ${action}`);
    assert.equal(may(actor('STANDARD'), action), false);
    assert.equal(may({ userId: 'root', level: null, role: null, platformAdmin: true }, action), false);
    assert.equal(may(null, action), false);
  }
  assert.equal(may(actor('PRIMARY_OWNER'), 'content.anything'), false);
});

test('nobody may act on themselves, on their own level or on a level above', () => {
  const { mayActOn } = pure();
  for (const holdsChangeRoles of [false, true]) {
    for (const level of LEVELS) {
      assert.equal(mayActOn(actor(level, 'same'), actor(level, 'same'), { holdsChangeRoles }), false, `${level} on self`);
      for (const other of LEVELS) {
        // The one exception to "not on your own level" is criterion 5: standard on standard with change-roles.
        const expected = level === 'STANDARD' ? holdsChangeRoles && other === 'STANDARD' : LEVELS.indexOf(other) > LEVELS.indexOf(level);
        assert.equal(mayActOn(actor(level, 'a'), actor(other, 'b'), { holdsChangeRoles }), expected, `${level} on ${other}`);
      }
    }
  }
  assert.equal(mayActOn(null, actor('STANDARD', 'b'), { holdsChangeRoles: true }), false);
  assert.equal(mayActOn(actor(null, 'a'), actor('STANDARD', 'b'), { holdsChangeRoles: true }), false);
  assert.equal(mayActOn(actor('PRIMARY_OWNER', 'a'), actor(null, 'b'), { holdsChangeRoles: true }), false);
  assert.equal(mayActOn(actor('PRIMARY_OWNER', 'a'), null, { holdsChangeRoles: true }), false);
});

test('a standard role acts on standard roles only, and only when it holds change-roles', () => {
  const { mayActOn, rolesMayGrant } = pure();
  assert.equal(mayActOn(actor('STANDARD', 'hr'), actor('STANDARD', 'dev'), { holdsChangeRoles: true }), true);
  assert.equal(mayActOn(actor('STANDARD', 'hr'), actor('STANDARD', 'dev'), { holdsChangeRoles: false }), false);
  for (const above of ['ADMIN', 'OWNER', 'PRIMARY_OWNER']) assert.equal(mayActOn(actor('STANDARD', 'hr'), actor(above, 'x'), { holdsChangeRoles: true }), false, above);
  const roles = ['OWNER', 'ADMIN', 'MEMBER', 'HR', 'Release Captain', 'admin'];
  assert.deepEqual([...rolesMayGrant(actor('STANDARD'), roles, { holdsChangeRoles: true })], ['MEMBER', 'HR', 'Release Captain']);
  assert.deepEqual([...rolesMayGrant(actor('STANDARD'), roles, { holdsChangeRoles: false })], []);
});

test('only the primary owner may grant the Owner role', () => {
  const { rolesMayGrant } = pure();
  const roles = ['OWNER', 'owner', 'ADMIN', 'MEMBER', 'VIEWER', 'Release Captain'];
  const grant = (level, holdsChangeRoles = true) => [...rolesMayGrant(actor(level), roles, { holdsChangeRoles })];
  assert.deepEqual(grant('PRIMARY_OWNER'), roles);
  assert.deepEqual(grant('OWNER'), ['ADMIN', 'MEMBER', 'VIEWER', 'Release Captain']);
  assert.deepEqual(grant('ADMIN'), ['MEMBER', 'VIEWER', 'Release Captain']);
  assert.deepEqual(grant('ADMIN', false), ['MEMBER', 'VIEWER', 'Release Captain']);
  assert.deepEqual(grant('STANDARD'), ['MEMBER', 'VIEWER', 'Release Captain']);
  assert.deepEqual(grant(null), []);
  assert.deepEqual([...rolesMayGrant(null, roles, { holdsChangeRoles: true })], []);
});
