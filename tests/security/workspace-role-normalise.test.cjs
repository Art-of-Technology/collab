// CLB-1077: the data-only migration that stores the built-in workspace role names in upper case and gives
// every workspace's owner an active OWNER membership, run as the release step runs it: plain SQL through psql
// against a throwaway PostgreSQL with the current schema, twice, the second time changing nothing.
const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, readFileSync, rmSync } = require('node:fs');
const { userInfo } = require('node:os');
const { join, resolve } = require('node:path');

const MIGRATION = resolve('prisma/migrations/20261124000300_workspace_role_normalise/migration.sql');
const OLD = '2026-01-01 00:00:00';
let bindir, directory, started;

const psql = (sql, extra = []) => execFileSync(join(bindir, 'psql'),
  ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-h', directory, '-p', '5432', '-U', userInfo().username, '-d', 'postgres', ...extra],
  { input: sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    env: Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG'))) });
const rows = table => JSON.parse(psql(`SELECT coalesce(json_agg(t ORDER BY id), '[]') FROM "${table}" t;`, ['-At']));
const snapshot = () => ({ members: rows('WorkspaceMember'), permissions: rows('RolePermission') });

before(() => {
  bindir = execFileSync('pg_config', ['--bindir'], { encoding: 'utf8' }).trim();
  directory = mkdtempSync('/tmp/collab-role-normalise-pg-');
  const data = join(directory, 'data');
  execFileSync(join(bindir, 'initdb'), ['-D', data, '-A', 'trust', '--no-locale', '-E', 'UTF8'], { stdio: 'pipe' });
  execFileSync(join(bindir, 'pg_ctl'), ['-D', data, '-l', join(directory, 'server.log'), '-o',
    `-p 5432 -c listen_addresses='' -k ${directory} -c fsync=off`, '-w', 'start'], { stdio: 'pipe' });
  started = true;
  psql(execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'diff', '--from-empty',
    '--to-schema-datamodel', resolve('prisma/schema.prisma'), '--script'], { encoding: 'utf8', stdio: 'pipe' }));
  const users = ['o1', 'o2', 'o3', 'o4', 'o5', 'a', 'm', 'c', 'r', 'q', 's'];
  psql(`
    INSERT INTO "User" (id, "updatedAt") VALUES ${users.map(id => `('${id}', '${OLD}')`).join(', ')};
    INSERT INTO "Workspace" (id, name, slug, "ownerId", "updatedAt") VALUES
      ('w1', 'w1', 'w1', 'o1', '${OLD}'), ('w2', 'w2', 'w2', 'o2', '${OLD}'), ('w3', 'w3', 'w3', 'o3', '${OLD}'),
      ('w4', 'w4', 'w4', 'o4', '${OLD}'), ('w5', 'w5', 'w5', 'o5', '${OLD}');
    INSERT INTO "WorkspaceMember" (id, "userId", "workspaceId", role, status, "createdAt", "updatedAt") VALUES
      ('m-o1', 'o1', 'w1', 'owner', true, '${OLD}', '${OLD}'),
      ('m-a', 'a', 'w1', 'Admin', true, '${OLD}', '${OLD}'),
      ('m-m', 'm', 'w1', 'MEMBER', true, '${OLD}', '${OLD}'),
      ('m-c', 'c', 'w1', 'Owner-Lite', true, '${OLD}', '${OLD}'),
      ('m-r', 'r', 'w1', 'reviewer', true, '${OLD}', '${OLD}'),
      ('m-q', 'q', 'w1', 'qa_tester', false, '${OLD}', '${OLD}'),
      ('m-s', 's', 'w1', 'member ', true, '${OLD}', '${OLD}'),
      ('m-a2', 'a', 'w2', 'member', true, '${OLD}', '${OLD}'),
      ('m-o3', 'o3', 'w3', 'owner', false, '${OLD}', '${OLD}'),
      ('m-o4', 'o4', 'w4', 'MEMBER', true, '${OLD}', '${OLD}'),
      ('m-o5', 'o5', 'w5', 'OWNER', true, '${OLD}', '${OLD}');
    INSERT INTO "RolePermission" (id, "workspaceId", role, permission, "createdAt", "updatedAt") VALUES
      ('p-admin-lower', 'w1', 'admin', 'CREATE_POST', '${OLD}', '${OLD}'),
      ('p-admin-upper', 'w1', 'ADMIN', 'CREATE_POST', '${OLD}', '${OLD}'),
      ('p-admin-only-lower', 'w1', 'admin', 'VIEW_POSTS', '${OLD}', '${OLD}'),
      ('p-member-a', 'w1', 'member', 'EDIT_SELF_POST', '${OLD}', '${OLD}'),
      ('p-member-b', 'w1', 'Member', 'EDIT_SELF_POST', '${OLD}', '${OLD}'),
      ('p-member-upper', 'w1', 'MEMBER', 'VIEW_POSTS', '${OLD}', '${OLD}'),
      ('p-custom-lite', 'w1', 'Owner-Lite', 'CREATE_POST', '${OLD}', '${OLD}'),
      ('p-custom-reviewer', 'w1', 'reviewer', 'VIEW_POSTS', '${OLD}', '${OLD}'),
      ('p-w2-admin', 'w2', 'admin', 'CREATE_POST', '${OLD}', '${OLD}');
  `);
});

after(() => {
  if (started) execFileSync(join(bindir, 'pg_ctl'), ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'], { stdio: 'pipe' });
  if (directory) rmSync(directory, { recursive: true, force: true });
});

// Both tests read the same three snapshots: before, after the first run, after the second run.
let runs;
const migrate = () => runs ??= (() => {
  const sql = readFileSync(MIGRATION, 'utf8');
  const before = snapshot();
  psql(sql);
  const first = snapshot();
  psql(sql);
  return { before, first, second: snapshot() };
})();

const BUILT_IN = ['OWNER', 'ADMIN', 'MODERATOR', 'DEVELOPER', 'PROJECT_MANAGER', 'DESIGNER', 'QA_TESTER', 'CONTENT_CREATOR',
  'ANALYST', 'HR', 'MARKETING', 'SALES', 'CUSTOMER_SUPPORT', 'MEMBER', 'VIEWER', 'GUEST'];
const byId = list => Object.fromEntries(list.map(row => [row.id, row]));

test('the migration SQL upper-cases the built-in role names in memberships and permission rows and leaves every other role name alone', () => {
  const { before, first, second } = migrate();
  for (const row of [...first.members, ...first.permissions]) {
    assert.ok(!(BUILT_IN.includes(row.role.toUpperCase()) && row.role !== row.role.toUpperCase()), `${row.id} keeps ${row.role}`);
  }
  const members = byId(first.members), was = byId(before.members);
  assert.deepEqual(Object.fromEntries(['m-a', 'm-m', 'm-c', 'm-r', 'm-q', 'm-s', 'm-a2'].map(id => [id, members[id].role])), {
    'm-a': 'ADMIN', 'm-m': 'MEMBER', 'm-c': 'Owner-Lite', 'm-r': 'reviewer', 'm-q': 'QA_TESTER', 'm-s': 'member ', 'm-a2': 'MEMBER',
  });
  // Only the role and the time it changed move; an inactive member stays inactive.
  assert.equal(members['m-q'].status, false);
  for (const id of ['m-m', 'm-c', 'm-r', 'm-s']) assert.deepEqual(members[id], was[id], `${id} untouched`);
  assert.notEqual(members['m-a'].updatedAt, was['m-a'].updatedAt);
  assert.deepEqual({ ...members['m-a'], role: 'Admin', updatedAt: was['m-a'].updatedAt }, was['m-a']);

  // The lowercase duplicate goes, the row already in upper case stays; with no upper-case row, one of the two is kept.
  const survivor = first.permissions.filter(row => row.workspaceId === 'w1' && row.role === 'MEMBER' && row.permission === 'EDIT_SELF_POST');
  assert.equal(survivor.length, 1);
  assert.ok(['p-member-a', 'p-member-b'].includes(survivor[0].id));
  const permissions = first.permissions.filter(row => row !== survivor[0]).map(({ id, workspaceId, role, permission }) => `${id} ${workspaceId} ${role} ${permission}`);
  assert.deepEqual(permissions, [
    'p-admin-only-lower w1 ADMIN VIEW_POSTS', 'p-admin-upper w1 ADMIN CREATE_POST', 'p-custom-lite w1 Owner-Lite CREATE_POST',
    'p-custom-reviewer w1 reviewer VIEW_POSTS', 'p-member-upper w1 MEMBER VIEW_POSTS',
    'p-w2-admin w2 ADMIN CREATE_POST',
  ]);
  const kept = byId(first.permissions), old = byId(before.permissions);
  for (const id of ['p-admin-upper', 'p-custom-lite', 'p-custom-reviewer', 'p-member-upper']) assert.deepEqual(kept[id], old[id], `${id} untouched`);
  assert.deepEqual(second, first, 'a second run changes nothing');
});

test("the migration SQL gives every workspace's owner an active OWNER membership", () => {
  const { before, first, second } = migrate();
  for (const [workspace, owner] of [['w1', 'o1'], ['w2', 'o2'], ['w3', 'o3'], ['w4', 'o4'], ['w5', 'o5']]) {
    const mine = first.members.filter(row => row.workspaceId === workspace && row.userId === owner);
    assert.equal(mine.length, 1, `${owner} has one membership in ${workspace}`);
    assert.equal(mine[0].role, 'OWNER'); assert.equal(mine[0].status, true);
  }
  const members = byId(first.members), was = byId(before.members);
  // Existing rows are updated in place, not replaced; the one already right is not touched.
  for (const id of ['m-o1', 'm-o3', 'm-o4']) {
    assert.equal(members[id].createdAt, was[id].createdAt);
    assert.notEqual(members[id].updatedAt, was[id].updatedAt);
  }
  assert.deepEqual(members['m-o5'], was['m-o5']);
  // The missing one is inserted with an id and both timestamps, and nothing else is added.
  assert.equal(first.members.length, before.members.length + 1);
  const added = first.members.find(row => row.workspaceId === 'w2' && row.userId === 'o2');
  assert.ok(!was[added.id] && added.id.length > 0 && added.createdAt && added.updatedAt);
  assert.deepEqual(second, first, 'a second run changes nothing');
});
