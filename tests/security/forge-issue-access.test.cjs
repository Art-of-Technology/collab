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
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
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
  grants.delete('ASSIGN_TASK'); grants.delete('CHANGE_TASK_STATUS'); grants.add('EDIT_ANY_TASK'); grants.add('CREATE_TASK');
  const beforeBindings = bindings;
  const description = '```channel-task\n{"owner":"Other","status":"blocked"}\n```';
  assert.equal((await change(edit({ description }))).kind, 'invalid');
  assert.equal((await change({ action: 'create', title: 'Task', description })).kind, 'invalid');
  assert.equal(bindings, beforeBindings); assert.equal(writes, 3);
});

test('editor retains overlap review after unavailable reloads and comment readbacks', async () => {
  const jsx = (type, props) => ({ type, props });
  const descendants = node => !node || typeof node !== 'object' ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(descendants)];
  for (const failureAfterComment of [false, true]) {
    let slots = [], cursor = 0, effect, pending, next, writes = 0;
    const state = initial => {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
    };
    const hooks = {
      useState: state,
      useRef: initial => state({ current: initial })[0],
      useEffect: callback => { if (!effect) effect = callback; },
      useTransition: () => [false, callback => { pending = callback(); }],
    };
    const fields = { title: 'A', description: '', status: 'backlog', priority: 'normal', owner: '', dueDate: '', followUpDate: '', nextAction: '' };
    const ready = title => ({ kind: 'ready', fields: { ...fields, title }, rights: { canEdit: true, canComment: true }, snapshot: { fingerprint: title, issue: { title, state: title === 'C' ? 'closed' : 'open', body: 'Source body' }, comments: [] } });
    next = ready('A');
    const { ForgeIssueEditor } = compile(path.resolve(__dirname, '../../src/app/(main)/[workspaceId]/projects/[projectSlug]/board/ForgeIssueEditor.tsx'), {
      react: hooks, 'react/jsx-runtime': { jsx, jsxs: jsx },
      '@/components/ui/button': { Button: 'button' }, '@/components/ui/input': { Input: 'input' }, '@/components/ui/textarea': { Textarea: 'textarea' },
      '@/lib/forge/tasks': { taskStatuses: ['backlog'], taskPriorities: ['normal'] },
      './actions': { getIssue: async () => next, changeIssue: async () => { writes++; return { kind: 'saved' }; } },
    });
    const render = () => { cursor = 0; return descendants(ForgeIssueEditor({ number: 1, workspaceSlug: 'workspace', projectSlug: 'project', onSaved() {}, onDenied() {} })); };
    render(); effect(); await Promise.resolve();
    let nodes = render();
    nodes.find(node => node.type === 'input' && node.props.value === 'A').props.onChange({ target: { value: 'B' } });
    nodes = render(); next = { kind: 'unavailable' };
    if (failureAfterComment) {
      nodes.filter(node => node.type === 'form')[1].props.onSubmit({ preventDefault() {} });
    } else {
      nodes.find(node => node.type === 'button' && node.props.children === 'Reload source, keep draft').props.onClick();
    }
    await pending;
    nodes = render();
    next = ready('C');
    nodes.find(node => node.type === 'button' && node.props.children === 'Reload issue').props.onClick();
    await pending;
    nodes = render();
    assert.ok(nodes.some(node => node.type === 'input' && node.props.value === 'B'));
    const source = nodes.find(node => node.type === 'details');
    const visibleText = node => node == null ? '' : typeof node !== 'object' ? String(node) : [node.props?.children].flat(Infinity).map(visibleText).join(' ');
    assert.match(visibleText(source), /Title:\s+C/);
    assert.match(visibleText(source), /Status:\s+closed/);
    assert.match(visibleText(source), /Source body/);
    assert.equal(nodes.find(node => node.type === 'button' && node.props.children === 'Save changes').props.disabled, true);
    nodes.find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
    assert.equal(writes, failureAfterComment ? 1 : 0);
    nodes.find(node => node.type === 'input' && node.props.type === 'checkbox').props.onChange({ target: { checked: true } });
    nodes = render();
    assert.equal(nodes.find(node => node.type === 'button' && node.props.children === 'Save changes').props.disabled, false);
  }
});


test('editor preserves rejected drafts and confirmed saves when a later refresh fails', async () => {
  const jsx = (type, props) => ({ type, props });
  const nodesOf = node => !node || typeof node !== 'object' ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(nodesOf)];
  for (const outcome of ['rejected', 'saved', 'denied']) {
    const slots = []; let cursor = 0, effect, pending, failedRead = false, saved = 0, denied = 0;
    const state = initial => {
      const i = cursor++; if (!(i in slots)) slots[i] = initial;
      return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }];
    };
    const ready = { kind: 'ready', fields: { title: 'A', description: '', status: 'backlog', priority: 'normal', owner: '', dueDate: '', followUpDate: '', nextAction: '' }, rights: { canEdit: true }, snapshot: { fingerprint: 'a'.repeat(64), issue: { title: 'A', state: 'open', body: '' }, comments: [] } };
    const { ForgeIssueEditor } = compile(path.resolve(__dirname, '../../src/app/(main)/[workspaceId]/projects/[projectSlug]/board/ForgeIssueEditor.tsx'), {
      react: { useState: state, useRef: initial => state({ current: initial })[0], useEffect: cb => { if (!effect) effect = cb; }, useTransition: () => [false, cb => { pending = cb(); }] },
      'react/jsx-runtime': { jsx, jsxs: jsx }, '@/components/ui/button': { Button: 'button' }, '@/components/ui/input': { Input: 'input' }, '@/components/ui/textarea': { Textarea: 'textarea' },
      '@/lib/forge/tasks': { taskStatuses: ['backlog'], taskPriorities: ['normal'] },
      './actions': { getIssue: async () => { if (failedRead) throw new Error('refresh offline'); return ready; }, changeIssue: async () => ({ kind: outcome, number: 1 }) },
    });
    const render = () => { cursor = 0; return nodesOf(ForgeIssueEditor({ number: 1, workspaceSlug: 'workspace', projectSlug: 'project', onSaved: () => { saved++; }, onDenied: () => { denied++; } })); };
    render(); effect(); await Promise.resolve();
    render().find(n => n.type === 'input' && n.props.value === 'A').props.onChange({ target: { value: 'B' } });
    failedRead = true;
    render().find(n => n.type === 'form').props.onSubmit({ preventDefault() {} }); await pending;
    const nodes = render();
    if (outcome === 'denied') { assert.equal(denied, 1); assert.ok(!nodes.some(n => n.type === 'form')); continue; }
    assert.equal(denied, 0); assert.ok(nodes.some(n => n.type === 'input' && n.props.value === 'B'));
    assert.equal(nodes.find(n => n.type === 'fieldset').props.disabled, true);
    const message = nodes.find(n => n.props.role === 'status').props.children;
    if (outcome === 'saved') { assert.equal(saved, 1); assert.match(message, /Saved and verified/); assert.doesNotMatch(message, /unknown/); }
    else { assert.equal(saved, 0); assert.match(message, /rejected/); }
  }
});
