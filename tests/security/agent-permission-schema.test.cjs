// CLB-1163: the MANAGE_AGENTS permission. The two migrations run as the release step runs them: plain SQL through psql
// against a throwaway PostgreSQL that has the schema as it was before (no MANAGE_AGENTS), twice, the second run
// changing nothing.
const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { userInfo } = require('node:os');
const { join, resolve } = require('node:path');
const { load } = require('./helpers.cjs');

const ENUM = resolve('prisma/migrations/20261125000200_manage_agents_permission/migration.sql');
const ROWS = resolve('prisma/migrations/20261125000300_manage_agents_rows/migration.sql');
const OLD = '2026-01-01 00:00:00';
let bindir, directory, started;

const psql = (sql, extra = []) => execFileSync(join(bindir, 'psql'),
  ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-h', directory, '-p', '5432', '-U', userInfo().username, '-d', 'postgres', ...extra],
  { input: sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    env: Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG'))) });
const permissions = () => JSON.parse(psql(`SELECT coalesce(json_agg(t ORDER BY id), '[]') FROM "RolePermission" t;`, ['-At']));
const enumValues = () => psql(`SELECT unnest(enum_range(NULL::"Permission"))::text;`, ['-At']).trim().split('\n');

before(() => {
  bindir = execFileSync('pg_config', ['--bindir'], { encoding: 'utf8' }).trim();
  directory = mkdtempSync('/tmp/collab-agent-permission-pg-');
  const data = join(directory, 'data');
  execFileSync(join(bindir, 'initdb'), ['-D', data, '-A', 'trust', '--no-locale', '-E', 'UTF8'], { stdio: 'pipe' });
  execFileSync(join(bindir, 'pg_ctl'), ['-D', data, '-l', join(directory, 'server.log'), '-o',
    `-p 5432 -c listen_addresses='' -k ${directory} -c fsync=off`, '-w', 'start'], { stdio: 'pipe' });
  started = true;
  // The schema production has today: the current one without the new enum value.
  const schema = join(directory, 'schema.prisma');
  writeFileSync(schema, readFileSync(resolve('prisma/schema.prisma'), 'utf8').replace(/^ {2}MANAGE_AGENTS\n/m, ''));
  psql(execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'diff', '--from-empty',
    '--to-schema-datamodel', schema, '--script'], { encoding: 'utf8', stdio: 'pipe' }));
  const row = (id, workspace, role, permission) => `('${id}', '${workspace}', '${role}', '${permission}', '${OLD}', '${OLD}')`;
  psql(`
    INSERT INTO "User" (id, "updatedAt") VALUES ('o', '${OLD}');
    INSERT INTO "Workspace" (id, name, slug, "ownerId", "updatedAt") VALUES
      ('w1', 'w1', 'w1', 'o', '${OLD}'), ('w2', 'w2', 'w2', 'o', '${OLD}'), ('w3', 'w3', 'w3', 'o', '${OLD}'),
      ('w4', 'w4', 'w4', 'o', '${OLD}'), ('w5', 'w5', 'w5', 'o', '${OLD}');
    INSERT INTO "RolePermission" (id, "workspaceId", role, permission, "createdAt", "updatedAt") VALUES
      ${row('w1-owner-mwp', 'w1', 'OWNER', 'MANAGE_WORKSPACE_PERMISSIONS')},
      ${row('w1-admin-mwp', 'w1', 'ADMIN', 'MANAGE_WORKSPACE_PERMISSIONS')},
      ${row('w1-admin-post', 'w1', 'ADMIN', 'CREATE_POST')},
      ${row('w1-lead-mwp', 'w1', 'Team Lead', 'MANAGE_WORKSPACE_PERMISSIONS')},
      ${row('w1-member-post', 'w1', 'MEMBER', 'CREATE_POST')},
      ${row('w2-admin-leave', 'w2', 'ADMIN', 'MANAGE_LEAVE')},
      ${row('w2-admin-post', 'w2', 'ADMIN', 'CREATE_POST')},
      ${row('w3-custom-mwp', 'w3', 'reviewer', 'MANAGE_WORKSPACE_PERMISSIONS')},
      ${row('w3-member-post', 'w3', 'MEMBER', 'VIEW_POSTS')},
      ${row('w5-admin-post', 'w5', 'ADMIN', 'CREATE_POST')};
  `);
});

after(() => {
  if (started) execFileSync(join(bindir, 'pg_ctl'), ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'], { stdio: 'pipe' });
  if (directory) rmSync(directory, { recursive: true, force: true });
});

test('the migration adds MANAGE_AGENTS, gives it to every role that holds MANAGE_WORKSPACE_PERMISSIONS, gives ADMIN MANAGE_LEAVE, and removes no row', () => {
  const enumSql = readFileSync(ENUM, 'utf8');
  const rowsSql = readFileSync(ROWS, 'utf8');
  const before = permissions();
  const expectedEnum = [...enumValues(), 'MANAGE_AGENTS'];
  psql(enumSql);
  // Appended last, where Prisma puts it for a database built from the schema.
  assert.deepEqual(enumValues(), expectedEnum);
  assert.deepEqual(permissions(), before);

  psql(rowsSql);
  const first = permissions();
  assert.deepEqual(enumValues(), expectedEnum);

  // Every row that was there is there byte for byte.
  const byId = new Map(first.map(item => [item.id, item]));
  for (const item of before) assert.deepEqual(byId.get(item.id), item);

  const key = item => `${item.workspaceId}/${item.role}/${item.permission}`;
  const added = first.filter(item => !before.some(old => old.id === item.id));
  assert.deepEqual(added.map(key).sort(), [
    'w1/ADMIN/MANAGE_AGENTS', 'w1/ADMIN/MANAGE_LEAVE', 'w1/OWNER/MANAGE_AGENTS', 'w1/Team Lead/MANAGE_AGENTS',
    'w3/reviewer/MANAGE_AGENTS', 'w5/ADMIN/MANAGE_LEAVE',
  ]);
  assert.ok(added.every(item => item.id && item.updatedAt));

  // A second run changes nothing.
  psql(enumSql);
  assert.deepEqual(enumValues(), expectedEnum);
  assert.deepEqual(permissions(), first);
  psql(rowsSql);
  assert.deepEqual(enumValues(), expectedEnum);
  assert.deepEqual(permissions(), first);
});

test("a new workspace's Admin defaults hold MANAGE_AGENTS and MANAGE_LEAVE", () => {
  const { defaultRolePermissions } = load('src/lib/role-permission-defaults.ts', { '@prisma/client': {}, '@/lib/prisma': { prisma: {} } });
  for (const permission of ['MANAGE_AGENTS', 'MANAGE_LEAVE']) assert.ok(defaultRolePermissions.ADMIN.includes(permission), permission);
  assert.ok(defaultRolePermissions.OWNER.includes('MANAGE_AGENTS'));
  const { Permission, getPermissionDisplayName } = load('src/lib/permission-types.ts');
  assert.equal(Permission.MANAGE_AGENTS, 'MANAGE_AGENTS');
  assert.equal(getPermissionDisplayName(Permission.MANAGE_AGENTS), 'Manage agent seats and tokens');
});
