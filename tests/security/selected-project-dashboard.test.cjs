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
function fixture() {
  const state = { actorId: 'actor', permissions: new Set(['VIEW_TASKS', 'VIEW_NOTES']), failedPermissions: new Set(), reads: [], provider: [], writes: 0 };
  const workspace = { id: 'ws', slug: 'space', name: 'Team space', ownerId: 'other', members: [{ userId: 'actor', status: true, role: 'MEMBER' }] };
  const other = { id: 'foreign', slug: 'foreign', name: 'Secret workspace', ownerId: 'other', members: [] };
  const projects = [
    { id: 'a', slug: 'alpha', name: 'Alpha', workspaceId: 'ws', workspace, privateField: 'not-selected' },
    { id: 'b', slug: 'beta', name: 'Beta', workspaceId: 'ws', workspace, privateField: 'not-selected' },
    { id: 'hidden', slug: 'hidden', name: 'Secret project', workspaceId: 'foreign', workspace: other },
  ];
  const select = (row, fields) => row ? Object.fromEntries(Object.keys(fields).map(key => [key, row[key]])) : null;
  const forbidden = () => { state.writes++; throw Error('Unexpected mutation'); };
  const model = methods => new Proxy(methods, { get: (target, key) => key in target ? target[key] : forbidden });
  const prisma = new Proxy({
    workspace: model({ findFirst: async ({ where, select: fields }) => {
      state.reads.push('workspace');
      if (state.failDatabase) throw Error('private database failure');
      const result = select([workspace, other].find(row => matches(row, where)), fields);
      state.afterWorkspace?.(); return result;
    } }),
    project: model({
      findMany: async ({ where, select: fields }) => { state.reads.push('projects'); return projects.filter(row => matches(row, where)).map(row => select(row, fields)); },
      findFirst: async ({ where, select: fields }) => { state.reads.push('selected'); state.beforeSelected?.(); return select(projects.find(row => matches(row, where)), fields); },
    }),
    user: model({ findUnique: async ({ where, include }) => {
      if (state.failUserLookup) throw Error('private user lookup failure');
      if (where.id !== 'actor' || state.deletedActor) return null;
      const membership = workspace.members.filter(row => row.userId === where.id && matches({ ...row, workspaceId: workspace.id }, include.workspaceMemberships.where));
      return { id: 'actor', role: 'DEVELOPER', workspaceMemberships: membership, ownedWorkspaces: workspace.ownerId === where.id && matches(workspace, include.ownedWorkspaces.where) ? [workspace] : [] };
    } }),
    rolePermission: model({ findUnique: async ({ where }) => {
      const { permission } = where.workspaceId_role_permission;
      if (state.failedPermissions.has(permission)) throw Error('private role lookup failure');
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
  const page = load(root + 'page.tsx', dependencies).default;
  function render(project, ws = 'space') {
    if (arguments.length === 0) project = 'a';
    return page({ params: Promise.resolve({ workspaceId: ws }), searchParams: Promise.resolve(project === undefined ? {} : { project }) });
  }
  return { state, workspace, projects, render, html: async (...args) => renderToStaticMarkup(await render(...args)) };
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
test('successful empty issue response is distinct from disconnected or denied', async () => { const f = fixture(); f.state.board = { kind: 'ready', projectName: 'Alpha', tasks: [], fetchedAt: 'now', today: '2026-01-01', truncated: false }; assert.match(await f.html(), /No issues in this loaded result/); f.state.board = { kind: 'not-connected', projectName: 'Alpha' }; assert.match(await f.html(), /Issues is not connected/); f.state.board = { kind: 'denied' }; const html = await f.html(); assert.match(html, /do not have access to Issues/); assert.doesNotMatch(html, /Open issue board/); });
test('loaded counts and truncation remain qualified', async () => { const f = fixture(); const node = await f.render(); node.props.data.selected.board.truncated = true; const html = renderToStaticMarkup(node); assert.match(html, /1 loaded issues/); assert.match(html, /1 need attention/); assert.match(html, /Counts are not repository totals/); });
test('memory counts notes separately from revisions and preserves lifecycle', async () => { const f = fixture(); const node = await f.render(); node.props.data.selected.memory.snapshot.document.revisions = ['Draft', 'Approved', 'Superseded'].map((state, i) => ({ id: 'rule', title: 'Project rule', type: 'Rules', state, revision: 3 - i })); const html = renderToStaticMarkup(node); assert.match(html, /1 notes/); assert.match(html, /1 draft revisions/); assert.match(html, /1 approved revisions/); assert.match(html, /Superseded/); assert.match(html, /revision 3/); });
test('switching project creates only new scoped payload and canonical links', async () => { const f = fixture(); const first = await f.html('a'); const second = await f.html('b'); assert.match(first, /alpha task/); assert.doesNotMatch(second, /alpha task/); assert.match(second, /beta task/); assert.match(second, /href="\/space\/projects\/beta\/board"/); assert.match(second, /href="\/space\/projects\/beta\/notes\/memory"/); assert.match(second, /Open an issue for Ready review/); assert.match(second, /Ready does not grant merge or deploy permission/); assert.deepEqual(f.state.provider, [['issues', 'space', 'alpha'], ['memory', 'space', 'alpha'], ['issues', 'space', 'beta'], ['memory', 'space', 'beta']]); assert.equal(f.state.writes, 0); });
test('chooser is a GET navigation and overview exposes no mutation form', async () => { const f = fixture(); const html = await f.html(); assert.match(html, /<form\b[^>]*action="\/space\/dashboard"[^>]*method="get"/); assert.doesNotMatch(html, /method="post"|All clear|Ready to Deploy/); assert.equal(f.state.writes, 0); });

test('memory read failures and revocation do not masquerade as no revisions', async () => { const f = fixture(); f.state.memory = { kind: 'unavailable', projectName: 'Alpha' }; let html = await f.html(); assert.match(html, /Project memory could not be loaded/); assert.doesNotMatch(html, /No project memory revisions|0 notes|Open an issue for Ready review/); f.state.memory = { kind: 'denied' }; html = await f.html(); assert.match(html, /do not have access to Project memory/); assert.doesNotMatch(html, /Review project memory/); });
