const { assert, test, load, matches } = require('./helpers.cjs');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const jsx = require('react/jsx-runtime');
const root = 'src/app/(main)/[workspaceId]/dashboard/';
const ui = {
  'react/jsx-runtime': jsx, react: React,
  '@/lib/utils': { cn: (...values) => values.filter(Boolean).join(' ') },
};
const Overview = load(root + 'components/DashboardClient.tsx', {
  ...ui,
  '@/lib/forge/tasks': load('src/lib/forge/tasks.ts'),
  '@/components/ui/page-layout': load('src/components/ui/page-layout.tsx', ui),
  '@/components/ui/page-header': load('src/components/ui/page-header.tsx', ui),
}).default;
function fixture(actualLoaders = false) {
  const state = { actorId: 'actor', permissions: new Set(['VIEW_TASKS', 'VIEW_NOTES']), failedPermissions: new Set(), failedRechecks: new Set(), deniedRechecks: new Set(), permissionReads: new Map(), bindingReads: 0, reads: [], provider: [], writes: 0 };
  const workspace = { id: 'ws', slug: 'space', name: 'Team space', ownerId: 'other', members: [{ userId: 'actor', status: true, role: 'MEMBER' }] };
  const other = { id: 'foreign', slug: 'foreign', name: 'Secret workspace', ownerId: 'other', members: [] };
  const projects = [
    { id: 'a', slug: 'alpha', name: 'Alpha', workspaceId: 'ws', workspace, privateField: 'not-selected' },
    { id: 'b', slug: 'beta', name: 'Beta', workspaceId: 'ws', workspace, privateField: 'not-selected' },
    { id: 'hidden', slug: 'hidden', name: 'Secret project', workspaceId: 'foreign', workspace: other },
  ];
  projects[0].issues = [
    { id: 'native-a', issueKey: 'ALPHA-1', title: 'Restored native issue', status: 'TODO', workspaceId: 'ws', projectId: 'a' },
    { id: 'native-foreign-workspace', issueKey: 'HIDDEN-1', title: 'Foreign workspace issue', status: 'TODO', workspaceId: 'foreign', projectId: 'a' },
    { id: 'native-foreign-project', issueKey: 'BETA-1', title: 'Other project issue', status: 'TODO', workspaceId: 'ws', projectId: 'b' },
  ].map(issue => ({ ...issue, statusId: null, projectStatus: null,
    workspace: [workspace, other].find(ws => ws.id === issue.workspaceId), project: projects.find(project => project.id === issue.projectId) }));
  projects[1].issues = [];
  const select = (row, fields) => row ? Object.fromEntries(Object.keys(fields).map(key => [key,
    key === 'issues' ? (row.issues ?? []).filter(issue => matches(issue, fields.issues.where)).slice(0, fields.issues.take).map(issue => select(issue, fields.issues.select)) : row[key]
  ])) : null;
  const forbidden = () => { state.writes++; throw Error('Unexpected mutation'); };
  const model = methods => new Proxy(methods, { get: (target, key) => key in target ? target[key] : forbidden });
  const prisma = new Proxy({
    workspace: model({ findFirst: async ({ where, select: fields }) => {
      state.reads.push('workspace');
      if (state.failDatabase) throw Error('private database failure');
      const result = select([workspace, other].find(row => matches(row, where)), fields);
      state.afterWorkspace?.(); return result;
    }, findUnique: async ({ where, select: fields }) => {
      if (state.failWorkspaceLookup) throw Error('private workspace lookup failure');
      if (state.missingWorkspaceLookup) return null;
      return select([workspace, other].find(row => matches(row, where)), fields);
    } }),
    project: model({
      findMany: async ({ where, select: fields }) => { state.reads.push('projects'); return projects.filter(row => matches(row, where)).map(row => select(row, fields)); },
      findFirst: async ({ where, select: fields }) => {
        state.reads.push(fields.issues ? 'native-issues' : 'selected'); state.beforeSelected?.();
        if (fields.issues && state.failNativeIssues) throw Error('private native database failure');
        const result = select(projects.find(row => matches(row, where)), fields);
        if (where.id) state.afterSelected?.();
        return result;
      },
    }),
    user: model({ findUnique: async ({ where, include }) => {
      if (state.failUserLookup) throw Error('private user lookup failure');
      if (where.id !== 'actor' || state.deletedActor) return null;
      const membership = [workspace, other].flatMap(ws => ws.members.filter(row => row.userId === where.id && matches({ ...row, workspaceId: ws.id }, include.workspaceMemberships.where)));
      return { id: 'actor', role: 'DEVELOPER', workspaceMemberships: membership, ownedWorkspaces: [workspace, other].filter(ws => ws.ownerId === where.id && matches(ws, include.ownedWorkspaces.where)) };
    } }),
    rolePermission: model({ findUnique: async ({ where }) => {
      const { permission } = where.workspaceId_role_permission;
      const count = (state.permissionReads.get(permission) ?? 0) + 1;
      state.permissionReads.set(permission, count);
      if (state.failedPermissions.has(permission) || (count > 1 && state.failedRechecks.has(permission))) throw Error('private role lookup failure');
      if (count > 1 && state.deniedRechecks.has(permission)) return null;
      return state.permissions.has(permission) ? { id: 'grant' } : null;
    } }),
  }, { get: (target, key) => key in target ? target[key] : model({}) });
  const task = title => ({ number: 1, title, description: '', status: 'blocked', priority: 'normal', owner: '', dueDate: '', followUpDate: '', nextAction: '', sourceUrl: '', updatedAt: '2026-01-01', comments: 0, warning: '' });
  const readBoard = async (ws, project) => {
    state.provider.push(['issues', ws, project]);
    if (state.boardError) throw Error('private provider token');
    return state.board ?? { kind: 'ready', projectName: project, tasks: [task(project + ' task')], truncated: false, fetchedAt: '2026-01-01T00:00:00Z', today: '2026-01-01' };
  };
  const readMemory = async (ws, project) => {
    state.provider.push(['memory', ws, project]);
    return state.memory ?? { kind: 'ready', projectName: project, snapshot: { sha: null, document: { version: 1, projectId: project, revisions: [] } }, actorId: 'actor', canCreate: true, canEditOwn: true, canEditAny: false, canApprove: false };
  };
  const slugResolvers = load('src/lib/slug-resolvers.ts', { '@/lib/prisma': { prisma }, '@/lib/url-utils': load('src/lib/url-utils.ts') });
  const dependencies = {
    'react/jsx-runtime': jsx,
    '@/lib/auth': { getAuthSession: async () => ({ user: { id: state.actorId, email: 'stale@example.test' } }) },
    '@/lib/prisma': { prisma },
    '@/lib/post-access': load('src/lib/post-access.ts'),
    '@/lib/permissions': load('src/lib/permissions.ts', { './prisma': { prisma } }),
    '@/lib/forge/board': { loadForgeBoard: readBoard },
    '@/lib/forge/memory-service': { loadProjectMemory: readMemory },
    './components/DashboardClient': { default: Overview },
    'next/navigation': { redirect: path => { throw Error('redirect:' + path); }, notFound: () => { throw Error('not-found'); } },
  };
  if (actualLoaders) {
    const loaderDependencies = {
      ...dependencies,
      'server-only': {},
      '@/lib/slug-resolvers': slugResolvers,
      './reader': {
        readForgeBindings: async () => { state.bindingReads++; state.afterBinding?.(); if (state.noBinding) return []; return projects.map(project => ({ workspaceId: project.workspaceId, projectId: project.id, memory: { branch: 'main' } })); },
        readForgeIssues: async binding => { state.provider.push(['issues', binding.workspaceId, binding.projectId]); return { tasks: [task(binding.projectId + ' task')], truncated: false, fetchedAt: '2026-01-01T00:00:00Z' }; },
      },
      './memory-store': {
        readProjectMemory: async binding => { state.provider.push(['memory', binding.workspaceId, binding.projectId]); return { sha: null, document: { version: 1, projectId: binding.projectId, revisions: [] } }; },
        writeProjectMemory: forbidden,
      },
      './memory': load('src/lib/forge/memory.ts', { zod: require('zod') }, { URL }),
      'node:crypto': require('node:crypto'), zod: require('zod'),
    };
    dependencies['@/lib/forge/board'] = load('src/lib/forge/board.ts', loaderDependencies);
    dependencies['@/lib/forge/memory-service'] = load('src/lib/forge/memory-service.ts', loaderDependencies);
  }
  const page = load(root + 'page.tsx', dependencies).default;
  const nativePage = load('src/app/(main)/[workspaceId]/projects/[projectSlug]/page.tsx', {
    ...dependencies, '@/lib/request-session': { getServerSession: async () => ({ user: { id: state.actorId, email: 'stale@example.test' } }) },
    '@/lib/slug-resolvers': slugResolvers, './ProjectDashboard': { ProjectDashboard: () => null },
  }).default;
  function render(project, ws = 'space') {
    if (arguments.length === 0) project = 'a';
    return page({ params: Promise.resolve({ workspaceId: ws }), searchParams: Promise.resolve(project === undefined ? {} : { project }) });
  }
  return { state, workspace, other, projects, render, native: () => nativePage({ params: Promise.resolve({ workspaceId: 'space', projectSlug: 'alpha' }) }), html: async (...args) => renderToStaticMarkup(await render(...args)), loadBoard: dependencies['@/lib/forge/board'].loadForgeBoard, ...dependencies['@/lib/forge/memory-service'], resolveWorkspaceSlug: slugResolvers.resolveWorkspaceSlug, getUserWorkspaceRole: dependencies['@/lib/permissions'].getUserWorkspaceRole };
}

test('missing stable actor redirects before data', async () => { const f = fixture(); f.state.actorId = undefined; await assert.rejects(f.render(), { message: 'redirect:/login' }); assert.equal(f.state.reads.length, 0); });
test('foreign URL does not fall back to an accessible workspace', async () => { const f = fixture(); await assert.rejects(f.render('a', 'foreign'), { message: 'not-found' }); assert.deepEqual(f.state.reads, ['workspace']); assert.equal(f.state.provider.length, 0); });
test('inactive membership is refused before project payload', async () => { const f = fixture(); f.workspace.members[0].status = false; await assert.rejects(f.render(), { message: 'not-found' }); assert.deepEqual(f.state.reads, ['workspace']); });
test('owner without membership retains access', async () => { const f = fixture(); f.workspace.ownerId = 'actor'; f.workspace.members = []; assert.match(await f.html(), /alpha task/); });
test('current member ID works independently of stale session email', async () => { const f = fixture(); assert.match(await f.html(), /alpha task/); assert.equal(f.state.writes, 0); });
test('no section permissions means no chooser/project query', async () => { const f = fixture(); f.state.permissions.clear(); await assert.rejects(f.render(), { message: 'not-found' }); assert.deepEqual(f.state.reads, ['workspace']); });
for (const failure of ['user', 'role']) {
  test(`${failure} lookup failures make the overview unavailable before project reads`, async () => {
    const f = fixture();
    if (failure === 'user') f.state.failUserLookup = true;
    else f.state.failedPermissions = new Set(['VIEW_TASKS', 'VIEW_NOTES']);
    const html = await f.html();
    assert.match(html, /Project overview could not be loaded/);
    assert.doesNotMatch(html, /do not have access|Team space|Alpha|private|All clear/);
    assert.deepEqual(f.state.reads, ['workspace']);
    assert.deepEqual(f.state.provider, []);
  });
}
for (const [permission, label, allowedLoader] of [['VIEW_TASKS', 'Issues', 'memory'], ['VIEW_NOTES', 'Project memory', 'issues']]) {
  test(`${permission} lookup failure is unavailable while only the allowed section loads`, async () => {
    const f = fixture(); f.state.failedPermissions.add(permission);
    const node = await f.render();
    const html = renderToStaticMarkup(node);
    assert.equal(node.props.data.selected[allowedLoader === 'memory' ? 'memory' : 'board'].kind, 'ready');
    assert.match(html, new RegExp(label + ' could not be loaded'));
    assert.doesNotMatch(html, /do not have access|private|All clear|Open an issue for Ready review/);
    assert.deepEqual(f.state.provider, [[allowedLoader, 'space', 'alpha']]);
  });
}
test('failed permission with the other denied exposes no chooser or project payload', async () => {
  for (const permission of ['VIEW_TASKS', 'VIEW_NOTES']) {
    const f = fixture(); f.state.permissions.clear(); f.state.failedPermissions.add(permission);
    assert.match(await f.html(), /Project overview could not be loaded/);
    assert.deepEqual(f.state.reads, ['workspace']);
    assert.deepEqual(f.state.provider, []);
  }
});
test('notes-only permission does not call issue loader or offer Ready link', async () => { const f = fixture(); f.state.permissions.delete('VIEW_TASKS'); const html = await f.html(); assert.match(html, /do not have access to Issues/); assert.doesNotMatch(html, /Open an issue for Ready review/); assert.deepEqual(f.state.provider, [['memory', 'space', 'alpha']]); });
test('issues-only permission does not call memory loader', async () => { const f = fixture(); f.state.permissions.delete('VIEW_NOTES'); const html = await f.html(); assert.match(html, /do not have access to Project memory/); assert.deepEqual(f.state.provider, [['issues', 'space', 'alpha']]); });
test('explicit foreign/missing/multiple project selector is denied without provider reads', async () => { for (const selector of ['hidden', 'missing', ['a', 'b']]) { const f = fixture(); await assert.rejects(f.render(selector), { message: 'not-found' }); assert.equal(f.state.provider.length, 0); } });
test('chooser has only scoped projections and no cross-project reads', async () => { const f = fixture(); const node = await f.render(''); assert.equal(node.props.data.selected, null); assert.deepEqual(JSON.parse(JSON.stringify(node.props.data.projects)), [{ id: 'a', slug: 'alpha', name: 'Alpha' }, { id: 'b', slug: 'beta', name: 'Beta' }]); assert.equal(f.state.provider.length, 0); assert.doesNotMatch(renderToStaticMarkup(node), /Secret|not-selected/); });
test('absent project parameter auto-selects the sole eligible project', async () => { const f = fixture(); f.projects.splice(1, 1); assert.match(await f.html(undefined), /alpha task/); assert.deepEqual(f.state.provider, [['issues', 'space', 'alpha'], ['memory', 'space', 'alpha']]); });
test('explicit empty project parameter leaves the sole eligible project unselected', async () => { const f = fixture(); f.projects.splice(1, 1); const node = await f.render(''); assert.equal(node.props.data.selected, null); assert.match(renderToStaticMarkup(node), /Choose a project to see/); assert.deepEqual(f.state.reads, ['workspace', 'projects']); assert.deepEqual(f.state.provider, []); });
test('empty project list remains distinct for absent and empty selectors', async () => { for (const selector of [undefined, '']) { const f = fixture(); f.projects.splice(0, 2); assert.match(await f.html(selector), /No projects are available/); assert.deepEqual(f.state.reads, ['workspace', 'projects']); assert.deepEqual(f.state.provider, []); } });
test('selected payload repeats current access after chooser', async () => { const f = fixture(); f.state.beforeSelected = () => { f.workspace.members[0].status = false; }; await assert.rejects(f.render(), { message: 'not-found' }); assert.equal(f.state.provider.length, 0); });
test('project moving workspaces between chooser and payload is refused', async () => { const f = fixture(); f.state.beforeSelected = () => { f.projects[0].workspaceId = 'foreign'; }; await assert.rejects(f.render(), { message: 'not-found' }); assert.equal(f.state.provider.length, 0); });
test('provider error is explicit, sanitized and never All clear/empty success', async () => { const f = fixture(); f.state.boardError = true; const html = await f.html(); assert.match(html, /Issues could not be loaded/); assert.doesNotMatch(html, /All clear|No issues in this loaded result|private provider token|0 loaded issues/); });
test('database failure is an unavailable overview without protected metadata', async () => { const f = fixture(); f.state.failDatabase = true; const html = await f.html(); assert.match(html, /Project overview could not be loaded/); assert.doesNotMatch(html, /private database|Team space|Alpha/); });
test('successful empty issue response is distinct from disconnected or denied', async () => { const f = fixture(); f.state.board = { kind: 'ready', projectName: 'Alpha', tasks: [], fetchedAt: 'now', today: '2026-01-01', truncated: false }; assert.match(await f.html(), /No issues in this loaded result/); f.state.board = { kind: 'not-connected', projectName: 'Alpha' }; assert.match(await f.html(), /Restored native issue/); f.state.board = { kind: 'denied' }; const html = await f.html(); assert.match(html, /do not have access to Issues/); assert.doesNotMatch(html, /Open issue board/); });
test('loaded counts and truncation remain qualified', async () => { const f = fixture(); const node = await f.render(); node.props.data.selected.board.truncated = true; const html = renderToStaticMarkup(node); assert.match(html, /1 loaded issues/); assert.match(html, /1 need attention/); assert.match(html, /Counts are not repository totals/); });
test('memory counts notes separately from revisions and preserves lifecycle', async () => { const f = fixture(); const node = await f.render(); node.props.data.selected.memory.snapshot.document.revisions = ['Draft', 'Approved', 'Superseded'].map((state, i) => ({ id: 'rule', title: 'Project rule', type: 'Rules', state, revision: 3 - i })); const html = renderToStaticMarkup(node); assert.match(html, /1 notes/); assert.match(html, /1 draft revisions/); assert.match(html, /1 approved revisions/); assert.match(html, /Superseded/); assert.match(html, /revision 3/); });
test('switching project creates only new scoped payload and canonical links', async () => { const f = fixture(); const first = await f.html('a'); const second = await f.html('b'); assert.match(first, /alpha task/); assert.doesNotMatch(second, /alpha task/); assert.match(second, /beta task/); assert.match(second, /href="\/space\/projects\/beta\/board"/); assert.match(second, /href="\/space\/projects\/beta\/notes\/memory"/); assert.match(second, /Open an issue for Ready review/); assert.match(second, /Ready does not grant merge or deploy permission/); assert.deepEqual(f.state.provider, [['issues', 'space', 'alpha'], ['memory', 'space', 'alpha'], ['issues', 'space', 'beta'], ['memory', 'space', 'beta']]); assert.equal(f.state.writes, 0); });
test('chooser is a GET navigation and overview exposes no mutation form', async () => { const f = fixture(); const html = await f.html(); assert.match(html, /<form\b[^>]*action="\/space\/dashboard"[^>]*method="get"/); assert.doesNotMatch(html, /method="post"|All clear|Ready to Deploy/); assert.equal(f.state.writes, 0); });

test('memory read failures and revocation do not masquerade as no revisions', async () => { const f = fixture(); f.state.memory = { kind: 'unavailable', projectName: 'Alpha' }; let html = await f.html(); assert.match(html, /Project memory could not be loaded/); assert.doesNotMatch(html, /No project memory revisions|0 notes|Open an issue for Ready review/); f.state.memory = { kind: 'denied' }; html = await f.html(); assert.match(html, /do not have access to Project memory/); assert.doesNotMatch(html, /Review project memory/); });

test('actual loaders retain matching selected IDs through permission rechecks and provider reads', async () => {
  const f = fixture(true); const node = await f.render();
  assert.equal(node.props.data.selected.project.id, 'a');
  assert.equal(node.props.data.selected.board.kind, 'ready');
  assert.equal(node.props.data.selected.memory.kind, 'ready');
  assert.match(renderToStaticMarkup(node), /a task/);
  assert.equal(node.props.data.selected.memory.snapshot.document.projectId, 'a');
  assert.deepEqual(f.state.provider, [['issues', 'ws', 'a'], ['memory', 'ws', 'a']]);
  assert.equal(f.state.permissionReads.get('VIEW_TASKS'), 2);
  assert.equal(f.state.permissionReads.get('VIEW_NOTES'), 2);
  assert.equal(f.state.writes, 0);
});
for (const reassignment of ['workspace', 'project']) {
  test(`actual loaders refuse ${reassignment} slug reassignment before any binding or payload read`, async () => {
    const f = fixture(true);
    f.state.afterSelected = () => {
      if (reassignment === 'workspace') {
        f.workspace.slug = 'old-space'; f.other.slug = 'space';
        f.other.members = [{ userId: 'actor', status: true, role: 'MEMBER' }];
        f.projects[2].slug = 'alpha';
      } else {
        f.projects[0].slug = 'old-alpha'; f.projects[1].slug = 'alpha';
      }
    };
    const node = await f.render();
    assert.equal(node.props.data.selected.project.name, 'Alpha');
    assert.equal(node.props.data.selected.board.kind, 'denied');
    assert.equal(node.props.data.selected.memory.kind, 'denied');
    assert.equal(f.state.bindingReads, 0);
    assert.deepEqual(f.state.provider, []);
    assert.equal(f.state.writes, 0);
  });
}
for (const [permission, failedSection, allowedProvider] of [['VIEW_TASKS', 'board', 'memory'], ['VIEW_NOTES', 'memory', 'issues']]) {
  test(`actual loader ${permission} recheck failure is unavailable and never reads that provider`, async () => {
    const f = fixture(true); f.state.failedRechecks.add(permission);
    const node = await f.render();
    assert.equal(node.props.data.selected[failedSection].kind, 'unavailable');
    assert.equal(node.props.data.selected[failedSection === 'board' ? 'memory' : 'board'].kind, 'ready');
    assert.equal(f.state.permissionReads.get(permission), 2);
    assert.equal(f.state.bindingReads, 1);
    assert.deepEqual(f.state.provider, [[allowedProvider, 'ws', 'a']]);
    assert.doesNotMatch(renderToStaticMarkup(node), /do not have access|private|All clear|Open an issue for Ready review/);
  });
}
test('both actual loader permission recheck failures prevent all binding and provider reads', async () => {
  const f = fixture(true); f.state.failedRechecks = new Set(['VIEW_TASKS', 'VIEW_NOTES']);
  const node = await f.render();
  assert.equal(node.props.data.selected.board.kind, 'unavailable');
  assert.equal(node.props.data.selected.memory.kind, 'unavailable');
  assert.equal(f.state.bindingReads, 0);
  assert.deepEqual(f.state.provider, []);
});
test('actual loader permission revocation remains denied without provider reads', async () => {
  const f = fixture(true); f.state.deniedRechecks = new Set(['VIEW_TASKS', 'VIEW_NOTES']);
  const node = await f.render();
  assert.equal(node.props.data.selected.board.kind, 'denied');
  assert.equal(node.props.data.selected.memory.kind, 'denied');
  assert.equal(f.state.bindingReads, 0);
  assert.deepEqual(f.state.provider, []);
});
test('existing two-argument loader callers still load their authorized project', async () => {
  const f = fixture(true);
  assert.equal((await f.loadBoard('space', 'alpha')).kind, 'ready');
  assert.equal((await f.loadProjectMemory('space', 'alpha')).kind, 'ready');
  assert.deepEqual(f.state.provider, [['issues', 'ws', 'a'], ['memory', 'ws', 'a']]);
});
test('memory mutations retain denial on permission lookup failure without reads or writes', async () => {
  const f = fixture(true); f.state.failedPermissions.add('VIEW_NOTES');
  const result = await f.changeProjectMemory('space', 'alpha', { action: 'save', noteId: null, expectedSha: null, draft: { title: 'Rules', type: 'Rules', body: 'Draft', sources: [] } });
  assert.equal(result.kind, 'denied');
  assert.equal(f.state.bindingReads, 0);
  assert.deepEqual(f.state.provider, []);
  assert.equal(f.state.writes, 0);
});

for (const [section, permission, otherPermission] of [['board', 'VIEW_TASKS', 'VIEW_NOTES'], ['memory', 'VIEW_NOTES', 'VIEW_TASKS']]) {
  for (const lookup of ['workspace', 'role']) {
    test(`${section} ${lookup} lookup failure after overview authorization is unavailable without provider reads`, async () => {
      const f = fixture(true); f.state.permissions.delete(otherPermission);
      f.state.afterSelected = () => {
        assert.equal(f.state.permissionReads.get(permission), 1);
        f.state[lookup === 'workspace' ? 'failWorkspaceLookup' : 'failUserLookup'] = true;
      };
      const node = await f.render();
      assert.equal(node.props.data.selected[section].kind, 'unavailable');
      assert.equal(node.props.data.selected[section === 'board' ? 'memory' : 'board'].kind, 'denied');
      const html = renderToStaticMarkup(node);
      assert.match(html, new RegExp((section === 'board' ? 'Issues' : 'Project memory') + ' could not be loaded'));
      assert.doesNotMatch(html, /private|All clear|Open an issue for Ready review/);
      assert.equal(f.state.bindingReads, 0);
      assert.deepEqual(f.state.provider, []);
      assert.equal(f.state.writes, 0);
    });
  }
  for (const missing of ['workspace', 'user', 'membership']) {
    test(`${section} missing ${missing} after overview authorization remains denied`, async () => {
      const f = fixture(true); f.state.permissions.delete(otherPermission);
      f.state.afterSelected = () => {
        if (missing === 'workspace') f.state.missingWorkspaceLookup = true;
        else if (missing === 'user') f.state.deletedActor = true;
        else f.workspace.members = [];
      };
      const node = await f.render();
      assert.equal(node.props.data.selected[section].kind, 'denied');
      assert.equal(f.state.bindingReads, 0);
      assert.deepEqual(f.state.provider, []);
      assert.equal(f.state.writes, 0);
    });
  }
}
test('workspace lookup propagation is opt-in for both slugs and legacy IDs', async () => {
  const f = fixture(true); f.state.failWorkspaceLookup = true;
  for (const selector of ['space', '123e4567-e89b-12d3-a456-426614174000']) {
    assert.equal(await f.resolveWorkspaceSlug(selector), null);
    await assert.rejects(f.resolveWorkspaceSlug(selector, true), { message: 'private workspace lookup failure' });
  }
  f.state.failWorkspaceLookup = false;
  assert.equal(await f.resolveWorkspaceSlug('space'), 'ws');
  assert.equal(await f.resolveWorkspaceSlug('space', true), 'ws');
});
test('role lookup propagation is opt-in and preserves successful roles', async () => {
  const f = fixture(true); f.state.failUserLookup = true;
  assert.equal(await f.getUserWorkspaceRole('actor', 'ws'), null);
  await assert.rejects(f.getUserWorkspaceRole('actor', 'ws', true), { message: 'private user lookup failure' });
  f.state.failUserLookup = false;
  assert.equal(await f.getUserWorkspaceRole('actor', 'ws'), 'MEMBER');
  assert.equal(await f.getUserWorkspaceRole('actor', 'ws', true), 'MEMBER');
});
for (const lookup of ['workspace', 'role']) {
  test(`memory mutations retain denial on ${lookup} lookup failure without reads or writes`, async () => {
    const f = fixture(true); f.state[lookup === 'workspace' ? 'failWorkspaceLookup' : 'failUserLookup'] = true;
    const result = await f.changeProjectMemory('space', 'alpha', { action: 'save', noteId: null, expectedSha: null, draft: { title: 'Rules', type: 'Rules', body: 'Draft', sources: [] } });
    assert.equal(result.kind, 'denied');
    assert.equal(f.state.bindingReads, 0);
    assert.deepEqual(f.state.provider, []);
    assert.equal(f.state.writes, 0);
  });
}


test('unconnected selected project reads restored native issues with scoped links', async () => {
  const f = fixture(true); f.state.noBinding = true;
  f.other.members = [{ userId: 'actor', status: true, role: 'MEMBER' }];
  Object.assign(f.projects[0].issues[0], { status: 'Deleted status', statusId: 'replacement',
    projectStatus: { id: 'replacement', name: 'Current status', project: f.projects[0] } });
  const node = await f.render();
  assert.deepEqual(JSON.parse(JSON.stringify(node.props.data.selected.nativeIssues)), [
    { id: 'native-a', issueKey: 'ALPHA-1', title: 'Restored native issue' },
  ]);
  const html = renderToStaticMarkup(node);
  assert.match(html, /Restored native issue/);
  assert.match(html, /href="\/space\/issues\/native-a"/);
  assert.match(html, /href="\/space\/projects\/alpha"/);
  assert.doesNotMatch(html, /Foreign workspace issue|Other project issue|Deleted status|Current status|Issues is not connected|Open issue board|Open an issue for Ready review/);
  assert.deepEqual(f.state.provider, []);
  assert.equal(f.state.reads.filter(value => value === 'native-issues').length, 1);
  assert.equal(f.state.writes, 0);
});
test('native overview rechecks linked-status membership and preserves owner and unlinked access', async () => {
  const f = fixture(true); f.state.noBinding = true;
  f.other.members = [{ userId: 'actor', status: true, role: 'MEMBER' }];
  const issue = f.projects[0].issues[0];
  f.projects[0].issues.push({ ...issue, id: 'native-visible', issueKey: 'ALPHA-2', title: 'Unlinked issue' });
  issue.statusId = 'foreign-status';
  issue.projectStatus = { id: 'foreign-status', name: 'Private status', project: f.projects[2] };
  assert.match(await f.html(), /href="\/space\/issues\/native-a"/);

  f.state.afterBinding = () => { f.other.members[0].status = false; };
  const revoked = await f.render();
  assert.deepEqual(JSON.parse(JSON.stringify(revoked.props.data.selected.nativeIssues)), [
    { id: 'native-visible', issueKey: 'ALPHA-2', title: 'Unlinked issue' },
  ]);
  assert.doesNotMatch(renderToStaticMarkup(revoked), /native-a|ALPHA-1|Restored native issue|Private status/);
  f.state.afterBinding = undefined;
  f.other.members = [];
  assert.doesNotMatch(await f.html(), /native-a|ALPHA-1|Restored native issue/);

  f.other.ownerId = 'actor';
  f.workspace.ownerId = 'actor'; f.workspace.members = [];
  assert.match(await f.html(), /href="\/space\/issues\/native-a"/);
  assert.deepEqual(f.state.provider, []);
  assert.equal(f.state.writes, 0);
});
test('native issue read failure stays unavailable and reveals no private exception', async () => {
  const f = fixture(true); f.state.noBinding = true; f.state.failNativeIssues = true;
  const html = await f.html();
  assert.match(html, /Project overview could not be loaded/);
  assert.doesNotMatch(html, /private native|No issues|Restored native/);
});
test('revocation before native project read prevents restored payload', async () => {
  const f = fixture(true); f.state.noBinding = true;
  f.state.afterBinding = () => { f.workspace.members[0].status = false; };
  await assert.rejects(f.render(), { message: 'not-found' });
  assert.deepEqual(f.state.provider, []);
});
test('connected Forge project never queries native issue rows', async () => {
  const f = fixture(true); await f.html();
  assert.equal(f.state.reads.includes('native-issues'), false);
  assert.deepEqual(f.state.provider, [['issues', 'ws', 'a'], ['memory', 'ws', 'a']]);
});

test('native project entry uses current ID for members and owners, and rejects inactive access', async () => {
  const f = fixture();
  assert.equal((await f.native()).props.projectId, 'a');
  f.workspace.ownerId = 'actor'; f.workspace.members = [];
  assert.equal((await f.native()).props.projectId, 'a');
  f.workspace.ownerId = 'other'; f.workspace.members = [{ userId: 'actor', status: false }];
  await assert.rejects(f.native(), { message: 'redirect:/' });
});
