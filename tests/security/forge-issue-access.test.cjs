const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
function compile(file, mocks = {}) {
  const loaded = new Module(file, module);
  loaded.filename = file; loaded.paths = Module._nodeModulePaths(path.dirname(file));
  const original = loaded.require.bind(loaded);
  loaded.require = name => Object.hasOwn(mocks, name) ? mocks[name] : original(name);
  loaded._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, file);
  return loaded.exports;
}
test('Forge issue actions reauthorize tenant and individual field grants before remote writes', async () => {
  const root = path.resolve(__dirname, '../../src/lib/forge');
  const tasks = compile(path.join(root, 'tasks.ts'));
  const content = compile(path.join(root, 'issue-content.ts'), { './tasks': tasks });
  let actor = null, role = 'MEMBER', project = true, bindings = 0, writes = 0;
  const grants = new Set(['VIEW_TASKS']);
  const Permission = Object.fromEntries(['VIEW_TASKS', 'CREATE_TASK', 'EDIT_ANY_TASK', 'CHANGE_TASK_STATUS', 'ASSIGN_TASK', 'COMMENT_ON_TASK', 'EDIT_ANY_COMMENT'].map(key => [key, key]));
  const service = compile(path.join(root, 'issue-service.ts'), {
    'server-only': {}, './tasks': tasks, './issue-content': content,
    '@/lib/auth': { getAuthSession: async () => actor ? { user: { id: actor } } : null },
    '@/lib/slug-resolvers': { resolveWorkspaceSlug: async () => 'workspace' },
    '@/lib/permissions': { Permission, getUserWorkspaceRole: async () => role, checkUserPermission: async (_actor, _workspace, permission) => ({ hasPermission: grants.has(permission) }) },
    '@/lib/prisma': { prisma: { project: { findFirst: async ({ where }) => { assert.equal(where.workspaceId, 'workspace'); return project ? { id: 'project' } : null; } } } },
    './reader': { readForgeBindings: async () => { bindings++; return [{ projectId: 'project', workspaceId: 'workspace', issues: {} }]; } },
    './issue-store': { writeForgeIssue: async () => { writes++; return { kind: 'saved', number: 1 }; } },
  });
  const edit = changes => ({ action: 'edit', number: 1, expected: 'a'.repeat(64), changes });
  const change = command => service.changeForgeIssue('workspace', 'project', command);
  assert.equal((await change(edit({ title: 'New' }))).kind, 'denied');
  actor = 'actor'; role = null;
  assert.equal((await change(edit({ title: 'New' }))).kind, 'denied');
  role = 'MEMBER'; project = false;
  assert.equal((await change(edit({ title: 'New' }))).kind, 'denied');
  assert.equal(bindings, 0); project = true;
  assert.equal((await change(edit({ title: 'New' }))).kind, 'denied');
  grants.add('CHANGE_TASK_STATUS');
  assert.equal((await change(edit({ status: 'done', title: 'No grant' }))).kind, 'denied');
  assert.equal(writes, 0); assert.equal(bindings, 0);
  assert.equal((await change(edit({ status: 'done' }))).kind, 'saved');
  assert.equal((await change(edit({ owner: 'Other' }))).kind, 'denied');
  grants.add('ASSIGN_TASK');
  assert.equal((await change(edit({ owner: 'Other' }))).kind, 'saved');
  assert.equal((await change({ action: 'comment', number: 1, body: 'Text' })).kind, 'denied');
  grants.add('COMMENT_ON_TASK');
  assert.equal((await change({ action: 'comment', number: 1, body: 'Text' })).kind, 'saved');
  assert.equal((await change({ action: 'edit-comment', number: 1, commentId: 2, expected: 'a'.repeat(64), body: 'Edit' })).kind, 'denied');
  assert.equal((await change({ ...edit({ title: 'New' }), repositoryId: 999 })).kind, 'invalid');
  assert.equal((await change(edit({ title: 'New', labels: ['unexpected'] }))).kind, 'invalid');
  assert.equal(writes, 3);
});
