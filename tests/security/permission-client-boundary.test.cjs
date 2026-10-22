const assert = require('node:assert/strict');
const { test } = require('node:test');
const { existsSync, readFileSync } = require('node:fs');
const { dirname, resolve } = require('node:path');
const { runInNewContext } = require('node:vm');
const ts = require('typescript');

test('workspace permission clients evaluate without loading server or database code', () => {
  const root = resolve(__dirname, '../..');
  const cache = new Map();
  const imports = [];
  const fixtures = {
    '@tanstack/react-query': { useQuery: () => ({ data: { permissions: ['MANAGE_WORKSPACE_SETTINGS'], role: 'MEMBER' }, isLoading: false }) },
    'next-auth/react': { useSession: () => ({ data: { user: { id: 'member', role: 'DEVELOPER' } } }) },
    '@/context/WorkspaceContext': { useWorkspace: () => ({ currentWorkspace: { id: 'space', ownerId: 'owner' }, isLoading: false }) },
    '@/hooks/queries/useUser': { useCurrentUser: () => ({ data: { id: 'member' } }) },
    '@/hooks/queries/useCustomRoles': {},
    '@/hooks/use-toast': {},
  };

  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const exports = {};
    cache.set(file, exports);
    const source = ts.transpileModule(readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    runInNewContext(source, {
      exports,
      require(name) {
        imports.push(name);
        assert.ok(name !== 'server-only' && !name.startsWith('@prisma/'), `Browser requested ${name}`);
        if (name in fixtures) return fixtures[name];
        // UI widgets are unrelated to permission evaluation; permission imports load real source.
        if (name.startsWith('@/components/ui/')) return {};
        if (name.startsWith('@/') || name.startsWith('.')) {
          const base = name.startsWith('@/') ? resolve(root, 'src', name.slice(2)) : resolve(dirname(file), name);
          const target = ['.ts', '.tsx'].map(extension => base + extension).find(existsSync);
          assert.ok(target, `Missing client dependency ${name}`);
          return load(target);
        }
        return require(name);
      },
    }, { filename: file });
    return exports;
  }

  for (const file of [
    'src/hooks/use-permissions.ts',
    'src/hooks/use-workspace-permissions.ts',
    'src/components/workspace/CustomRolesManager.tsx',
    'src/components/workspace/MemberManager.tsx',
    'src/components/workspace/PermissionsManager.tsx',
  ]) load(resolve(root, file));

  const hooks = load(resolve(root, 'src/hooks/use-permissions.ts'));
  assert.equal(hooks.useCanManageWorkspace('space').hasPermission, true);
  assert.equal(hooks.useCanManageTasks('space').hasPermission, false);
  const workspaceHooks = load(resolve(root, 'src/hooks/use-workspace-permissions.ts'));
  assert.equal(workspaceHooks.useWorkspacePermissions().isWorkspaceAdmin, true);
  const shared = load(resolve(root, 'src/lib/permission-types.ts'));
  assert.equal(shared.Permission.MANAGE_WORKSPACE_SETTINGS, 'MANAGE_WORKSPACE_SETTINGS');
  assert.equal(shared.WorkspaceRole.ADMIN, 'ADMIN');
  assert.equal(shared.UserRole.SYSTEM_ADMIN, 'SYSTEM_ADMIN');
  assert.equal(shared.getRoleDisplayName(shared.WorkspaceRole.ADMIN), 'Administrator');
  assert.equal(shared.getRoleDisplayName('Support'), 'Support');
  assert.equal(shared.getPermissionDisplayName(shared.Permission.MANAGE_WORKSPACE_SETTINGS), 'Manage Workspace Settings');
  assert.equal(shared.getPermissionDisplayName('CUSTOM_PERMISSION'), 'CUSTOM PERMISSION');
  assert.ok(!imports.includes('@/lib/permissions'));
});
