const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

test('board reads authorize the session and active tenant before credentials or upstream access', async () => {
  let session = null;
  let role = null;
  let project = { id: 'project-a', name: 'Example project' };
  let credentialReads = 0;
  let providerReads = 0;
  const filename = path.resolve(__dirname, '../../src/lib/forge/board.ts');
  const loaded = new Module(filename, module);
  const bindings = [{ workspaceId: 'workspace-a', projectId: 'project-a' }];
  const dependencies = {
    'server-only': {},
    '@/lib/auth': { getAuthSession: async () => session },
    '@/lib/permissions': { getUserWorkspaceRole: async (user, workspace) => { assert.equal(user, 'member'); assert.equal(workspace, 'workspace-a'); return role; } },
    '@/lib/slug-resolvers': { resolveWorkspaceSlug: async () => 'workspace-a' },
    '@/lib/prisma': { prisma: { project: { findFirst: async query => {
      assert.deepEqual(query.where, { workspaceId: 'workspace-a', slug: 'example' }); return project;
    } } } },
    './reader': {
      readForgeBindings: async () => { credentialReads++; return bindings; },
      readForgeIssues: async binding => { providerReads++; assert.equal(binding, bindings[0]); return { tasks: [], truncated: false, fetchedAt: '2026-09-23T12:00:00Z' }; },
    },
  };
  loaded.require = id => { if (!(id in dependencies)) throw Error(`Unexpected dependency: ${id}`); return dependencies[id]; };
  loaded._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
  const { loadForgeBoard } = loaded.exports;
  assert.deepEqual(await loadForgeBoard('workspace-a', 'example'), { kind: 'denied' });
  session = { user: { id: 'member' } };
  assert.deepEqual(await loadForgeBoard('workspace-a', 'example'), { kind: 'denied' });
  assert.equal(credentialReads, 0);
  role = 'MEMBER';
  project = null;
  assert.deepEqual(await loadForgeBoard('workspace-a', 'example'), { kind: 'denied' });
  assert.equal(providerReads, 0);
  project = { id: 'project-a', name: 'Example project' };
  const board = await loadForgeBoard('workspace-a', 'example');
  assert.equal(board.kind, 'ready');
  assert.equal(providerReads, 1);
  assert.match(board.today, /^\d{4}-\d{2}-\d{2}$/);
  bindings[0].workspaceId = 'foreign-workspace';
  assert.equal((await loadForgeBoard('workspace-a', 'example')).kind, 'not-connected');
  assert.equal(providerReads, 1);
});
