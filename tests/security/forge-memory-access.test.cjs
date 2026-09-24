const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

test('memory actions enforce current tenant rights and exact reviewed SHA before approval or writes', async () => {
  let actor = 'owner', role = 'OWNER', allowed = true, reads = 0, writes = 0, bindings = 0;
  const deniedPermissions = new Set();
  const filename = path.resolve(__dirname, '../../src/lib/forge/memory-service.ts');
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
  const model = compile(path.join(path.dirname(filename), 'memory.ts'));
  const now = '2026-09-23T12:00:00.000Z';
  const document = model.saveMemoryDraft({ version: 1, projectId: 'project', revisions: [] }, 'rules',
    { title: 'Rules', type: 'Rules', body: 'Reviewed draft', sources: [] }, { id: 'owner', canManage: false }, now);
  const current = { sha: 'a'.repeat(40), document };
  let binding = { workspaceId: 'workspace', projectId: 'project', memory: { branch: 'main' } };
  const service = compile(filename, {
    'server-only': {}, './memory': model,
    '@/lib/auth': { getAuthSession: async () => actor ? { user: { id: actor } } : null },
    '@/lib/slug-resolvers': { resolveWorkspaceSlug: async () => 'workspace' },
    '@/lib/permissions': { Permission: { VIEW_NOTES: 'view', CREATE_NOTE: 'create', EDIT_SELF_NOTE: 'self', EDIT_ANY_NOTE: 'any' },
      getUserWorkspaceRole: async () => role, checkUserPermission: async (_id, _workspace, permission) => ({ hasPermission: allowed && !deniedPermissions.has(permission) && (role === 'OWNER' || permission !== 'any') }) },
    '@/lib/prisma': { prisma: { project: { findFirst: async ({ where }) => { assert.equal(where.workspaceId, 'workspace'); return { id: 'project', name: 'Project' }; } } } },
    './reader': { readForgeBindings: async () => { bindings++; return [binding]; } },
    './memory-store': { readProjectMemory: async () => { reads++; return current; }, writeProjectMemory: async (_binding, sha, next) => {
      writes++; assert.equal(sha, current.sha); current.document = next; current.sha = 'b'.repeat(40); return { kind: 'saved', snapshot: current };
    } },
  });
  actor = null;
  assert.equal((await service.loadProjectMemory('workspace', 'project')).kind, 'denied');
  actor = 'owner'; role = null;
  assert.equal((await service.loadProjectMemory('workspace', 'project')).kind, 'denied');
  role = 'OWNER'; allowed = false;
  assert.equal((await service.loadProjectMemory('workspace', 'project')).kind, 'denied');
  assert.equal(reads, 0); assert.equal(bindings, 0);
  allowed = true; binding = { ...binding, projectId: 'foreign' };
  assert.equal((await service.loadProjectMemory('workspace', 'project')).kind, 'not-connected');
  assert.equal(reads, 0); binding = { ...binding, projectId: 'project' };
  const approve = { action: 'approve', noteId: 'rules', revision: 1, expectedSha: 'a'.repeat(40) };
  const save = { action: 'save', noteId: null, expectedSha: current.sha,
    draft: { title: 'Rules', type: 'Rules', body: 'New draft', sources: [] } };
  bindings = 0;
  role = 'MEMBER'; actor = 'other';
  assert.equal((await service.changeProjectMemory('workspace', 'project', approve)).kind, 'denied');
  deniedPermissions.add('create'); deniedPermissions.add('self');
  for (const noteId of [null, 'rules']) {
    assert.equal((await service.changeProjectMemory('workspace', 'project', { ...save, noteId })).kind, 'denied');
  }
  assert.equal(bindings, 0); assert.equal(reads, 0); assert.equal(writes, 0);
  role = 'OWNER'; actor = 'owner'; deniedPermissions.clear();
  for (const source of ['slack.com/archives/C123/p456', 'https://', '', 'https://[invalid',
    'http://slack.com/archives/C123/p456', 'https://slack.com.attacker.test/x', 'https://user:password@slack.com/x']) {
    const draft = { ...save.draft, sources: [source] };
    assert.equal(model.memoryDraftSchema.safeParse(draft).success, false);
    assert.deepEqual(await service.changeProjectMemory('workspace', 'project', { ...save, draft }), { kind: 'invalid' });
  }
  assert.equal(bindings, 0); assert.equal(reads, 0); assert.equal(writes, 0);
  assert.equal(current.document, document);
  role = 'MEMBER'; actor = 'other'; deniedPermissions.add('create'); deniedPermissions.add('self');
  const view = await service.loadProjectMemory('workspace', 'project');
  assert.equal(view.kind, 'ready');
  assert.equal(view.canCreate, false); assert.equal(view.canEditOwn, false);
  assert.equal(view.canEditAny, false); assert.equal(view.canApprove, false);
  assert.equal(bindings, 1); assert.equal(reads, 1); assert.equal(writes, 0);
  deniedPermissions.clear();
  role = 'OWNER'; actor = 'owner';
  assert.equal((await service.changeProjectMemory('workspace', 'project', { ...approve, actorId: 'forged' })).kind, 'invalid');
  current.sha = 'c'.repeat(40); // Another editor changed the draft without changing its revision number.
  assert.equal((await service.changeProjectMemory('workspace', 'project', approve)).kind, 'conflict');
  assert.equal(writes, 0); assert.equal(current.document.revisions[0].state, 'Draft');
  assert.equal((await service.changeProjectMemory('workspace', 'project', { ...approve, expectedSha: current.sha })).kind, 'saved');
  assert.equal(writes, 1); assert.equal(current.document.revisions[0].approvedBy, 'owner');
  assert.equal((await service.getApprovedProjectContext('workspace', 'project', [])).revisions.length, 1);
  role = null;
  await assert.rejects(service.getApprovedProjectContext('workspace', 'project', []));
});
