const { assert, test, load } = require('../security/helpers.cjs');
const { JSDOM } = require('jsdom');
const React = require('react');

const folder = 'src/app/(main)/[workspaceId]/projects/[projectSlug]';
const jsx = { 'react/jsx-runtime': require('react/jsx-runtime') };
const loadWork = () => load(folder + '/ProjectWork.tsx', {
  ...jsx, react: React,
  'next/link': { default: ({ scroll, prefetch, ...props }) => React.createElement('a', props) },
  '@/components/issue/IssueDetailModal': { IssueDetailModal: 'aside' },
  '@/hooks/useIssueModalUrlState': { useIssueModalUrlState: () => ({ setSelectedIssueId() {} }) },
  '@/lib/utils': { cn: (...values) => values.filter(Boolean).join(' ') },
}).ProjectWork;

test('old board URLs open the correct Work sub-view, using only the matching project binding', async () => {
  const params = Promise.resolve({ workspaceId: 'example-space', projectSlug: 'studio' });
  class Redirect extends Error {}
  const redirect = url => { throw new Redirect(url); };
  const legacy = load(folder + '/board/page.tsx', { 'next/navigation': { redirect } }).default;
  const url = await legacy({ params }).catch(error => {
    assert.ok(error instanceof Redirect);
    return new URL(error.message, 'https://example.test');
  });
  assert.equal(url.pathname, '/example-space/projects/studio');
  const query = Object.fromEntries(url.searchParams);
  const searchParams = Promise.resolve(query);
  let allowed = true;
  let bindings = [
    { workspaceId: 'another-workspace', projectId: 'project' },
    { workspaceId: 'workspace', projectId: 'another-project' },
  ];
  let upstreamReads = 0;
  const rights = { canEdit: true };
  const board = { kind: 'ready', projectName: 'Studio', tasks: [] };
  const home = load(folder + '/page.tsx', {
    ...jsx,
    'next/navigation': { redirect, notFound: () => { throw new Error('Not found'); } },
    '@/lib/request-session': { getServerSession: async () => allowed ? { user: { id: 'viewer' } } : null },
    '@/lib/auth': {},
    '@/lib/prisma': { prisma: {
      workspace: { findFirst: async () => ({ id: 'workspace', slug: 'example-space' }) },
      project: { findFirst: async () => ({ id: 'project', slug: 'studio', name: 'Studio' }) },
    } },
    '@/lib/slug-resolvers': { resolveWorkspaceSlug: async () => 'workspace' },
    '@/lib/post-access': load('src/lib/post-access.ts'),
    '@/lib/forge/reader': { readForgeBindings: async () => bindings },
    '@/lib/forge/board': { loadForgeBoard: async (workspace, slug, expected) => {
      upstreamReads++;
      assert.equal(workspace, 'example-space');
      assert.equal(slug, 'studio');
      assert.deepEqual({ ...expected }, { workspaceId: 'workspace', projectId: 'project' });
      return board;
    } },
    '@/lib/forge/issue-service': { loadForgeIssueRights: async () => rights },
    './ProjectDashboard': { ProjectDashboard: 'main' },
    './board/ForgeBoardView': { ForgeBoardView: 'article' },
  }).default;
  await assert.rejects(home({ params, searchParams }), error =>
    error instanceof Redirect && error.message === '/example-space/projects/studio?tab=work');
  assert.equal(upstreamReads, 0);
  const work = await home({ params, searchParams: Promise.resolve({ tab: 'work' }) });
  assert.equal(work.props.hasForge, false);
  assert.equal(work.props.forgeBoard, undefined);

  bindings.push({ workspaceId: 'workspace', projectId: 'project' });
  const result = await home({ params, searchParams });
  assert.equal(result.props.hasForge, true);
  assert.equal(result.props.forgeBoard.type, 'article');
  assert.equal(result.props.forgeBoard.props.initial, board);
  assert.equal(result.props.forgeBoard.props.rights, rights);
  assert.equal(upstreamReads, 1);
  const issues = await home({ params, searchParams: Promise.resolve({ tab: 'work' }) });
  assert.equal(issues.props.forgeBoard, undefined);
  allowed = false;
  await assert.rejects(home({ params, searchParams }), { message: '/login' });
  assert.equal(upstreamReads, 1);
});

test('Work regroups refreshed issues in place and carries the filter between the list and status board', async () => {
  const dom = new JSDOM('<main id="root"></main>');
  global.window = dom.window;
  global.document = dom.window.document;
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const { createRoot } = require('react-dom/client');
  const ProjectWork = loadWork();
  const milestone = (id, issueKey, title) => ({ id, issueKey, title, dueDate: '2026-11-21', forecastDate: '2026-11-24', driftDays: 3, completed: 0 });
  const milestones = [milestone('one', 'M9', 'Launch'), milestone('two', 'M10', 'Polish')];
  const moving = { id: 'move', issueKey: 'DEMO-1', title: 'Move me', milestoneId: 'one', status: 'Backlog', statusId: 'todo' };
  const keep = { ...moving, id: 'stay', title: 'Stay here', issueKey: 'DEMO-2' };
  const loose = { ...moving, id: 'loose', milestoneId: null, title: 'Unplanned', issueKey: 'DEMO-3' };
  const withoutStatus = [
    { ...loose, id: 'empty', title: 'Empty', statusId: null, status: 'No status' },
    { ...loose, id: 'unknown', title: 'Unknown', statusId: null, status: 'Old workflow' },
  ];
  const statuses = [{ id: 'todo', displayName: 'Backlog' }];
  const root = createRoot(document.querySelector('main'));
  const render = (issue, filter = {}) => React.act(async () => root.render(React.createElement(ProjectWork, {
    base: '/example/projects/studio', milestoneId: null, noMilestone: false, hasForge: false, ...filter,
    summary: { overview: { work: [issue, keep, loose, ...withoutStatus], milestones }, statusDistribution: statuses },
  })));
  const groups = () => [...document.querySelectorAll('section')];
  const click = button => React.act(async () => button.click());

  try {
    await render(moving);
    assert.match(groups()[0].textContent, /M9Launch0 of 2due 21 Nov\+3d.*Move me/);
    assert.match(groups().at(-1).textContent, /No milestone.*Unplanned/);
    const first = groups()[0].querySelector('button');
    await click(first);
    assert.equal(first.getAttribute('aria-expanded'), 'false');
    assert.doesNotMatch(groups()[0].textContent, /Move me/);

    await render({ ...moving, milestoneId: 'two' });
    assert.equal(groups()[0].querySelector('button'), first);
    assert.equal(first.getAttribute('aria-expanded'), 'false');
    assert.match(groups()[1].textContent, /M10Polish.*Move me/);

    await render({ ...moving, milestoneId: 'two' }, { milestoneId: 'two' });
    assert.equal(groups().length, 1);
    assert.match(document.body.textContent, /1 of 5 issues shown/);
    await click([...document.querySelectorAll('button')].find(button => button.textContent === 'Board'));
    assert.equal(groups().length, 1);
    assert.equal(groups()[0].getAttribute('aria-label'), 'Backlog');
    assert.match(groups()[0].textContent, /Move meM10/);
    assert.doesNotMatch(groups()[0].textContent, /Stay here|Unplanned/);
    assert.equal(document.querySelector('a').getAttribute('href'), '/example/projects/studio?tab=work');

    await render({ ...moving, milestoneId: 'two' });
    assert.deepEqual(groups().map(group => group.getAttribute('aria-label')), ['Backlog', 'No status']);
    assert.match(groups()[1].textContent, /No status · 2.*Empty.*Unknown/);

    milestones[0].completed = 2;
    await render(moving, { waitingIssueIds: ['stay', 'loose'] });
    assert.match(document.body.textContent, /2 of 5 issues shown/);
    assert.match(document.body.textContent, /Stay here/);
    assert.match(document.body.textContent, /Unplanned/);
    assert.doesNotMatch(document.body.textContent, /Move me|Empty|Unknown/);
    assert.equal(document.querySelector('a').textContent, 'Show all issues');
    await click([...document.querySelectorAll('button')].find(button => button.textContent === 'By milestone'));
    assert.equal(groups().length, 2);
    assert.match(groups()[0].textContent, /0 of 1/);
    assert.doesNotMatch(document.body.textContent, /Move me|Empty|Unknown/);

    await render(moving, { waitingIssueIds: [] });
    assert.match(document.body.textContent, /0 of 5 issues shown/);
    assert.match(document.body.textContent, /No issues are waiting on this issue/);
  } finally {
    await React.act(async () => root.unmount());
    dom.window.close();
  }
});

test('a project move refreshes both open Work views through the mutation response or the workspace event', async () => {
  const dom = new JSDOM('<main></main>', { url: 'https://example.test' });
  global.window = dom.window;
  global.document = dom.window.document;
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const { createRoot } = require('react-dom/client');
  const query = require('@tanstack/react-query');
  const client = new query.QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } },
  });
  const root = createRoot(document.querySelector('main'));
  const events = [];
  const listeners = new Set();
  let issue = { id: 'move', issueKey: 'DEMO-1', projectId: 'studio', workspaceId: 'space',
    title: 'Move me', milestoneId: null, status: 'Backlog', statusId: 'todo' };
  const { PUT } = load('src/app/api/issues/[issueId]/route.ts', {
    'next/server': { NextResponse: Response },
    '@/lib/session': { getCurrentUser: async () => ({ id: 'editor' }) },
    '@/lib/prisma': { prisma: { issueFollower: { findMany: async () => [] }, projectFollower: { findMany: async () => [] } } },
    '@/lib/permissions': {}, '@/lib/issue-finder': {}, '@/lib/notification-service': {}, '@/utils/mentions': {},
    '@/lib/board-item-activity-service': { compareObjects: () => [] },
    '@/lib/event-bus': { emitIssueUpdated: async () => {} },
    '@/lib/redis': { publishEvent: async (channel, event) => { assert.equal(channel, 'workspace:space:events'); events.push(event); } },
    '@/lib/issue-mutation': { updateIssue: async (_user, id, { projectId }) => {
      assert.equal(id, issue.id);
      const oldIssue = issue;
      issue = { ...issue, projectId };
      return { issue, oldIssue, assigneeChanged: false, updateData: {} };
    } },
  }, { URL, console });
  const fetch = (url, options) => PUT(new Request(url, options), { params: Promise.resolve({ issueId: 'move' }) });
  const { useUpdateIssue } = load('src/hooks/queries/useIssues.ts', { '@tanstack/react-query': query }, { URL, window, fetch });
  const { useProjectSummary } = load('src/hooks/queries/useProjects.ts', {
    react: React, '@tanstack/react-query': query,
    '@/lib/workspace-event-source': { subscribeWorkspaceEvents: (id, listener) => {
      assert.equal(id, 'space');
      listeners.add(listener);
      return () => listeners.delete(listener);
    } },
    axios: { default: { get: async url => ({ data: {
      overview: { work: url === `/api/projects/${issue.projectId}/summary` ? [issue] : [], milestones: [] },
      statusDistribution: [],
    } }) } },
  });
  const ProjectWork = loadWork();
  let move;
  function WorkView({ id }) {
    const { data } = useProjectSummary(id, 'space');
    const { mutateAsync } = useUpdateIssue();
    if (id === 'studio') move = projectId => mutateAsync({ id: 'move', workspaceId: 'space', projectId });
    return React.createElement('div', { id }, data && React.createElement(ProjectWork, {
      base: `/example/projects/${id}`, milestoneId: null, noMilestone: false, hasForge: false, summary: data,
    }));
  }
  const hasIssue = id => document.getElementById(id)?.textContent.includes('Move me');
  async function visibleIn(source, destination) {
    for (let i = 0; i < 50 && (!document.querySelector(`#${source} button`) || hasIssue(source) || !hasIssue(destination)); i++) {
      await React.act(() => new Promise(resolve => setTimeout(resolve, 10)));
    }
    assert.equal(hasIssue(source), false, `issue should leave ${source}`);
    assert.equal(hasIssue(destination), true, `issue should appear in ${destination}`);
  }
  try {
    await React.act(async () => root.render(React.createElement(query.QueryClientProvider, { client },
      React.createElement(WorkView, { id: 'studio' }), React.createElement(WorkView, { id: 'lab' }))));
    await visibleIn('lab', 'studio');

    await React.act(async () => move('lab'));
    // The originating client updates even before its workspace event arrives.
    await visibleIn('studio', 'lab');

    const res = await fetch('https://example.test/api/issues/move', { method: 'PUT', body: JSON.stringify({ projectId: 'studio' }) });
    assert.equal(res.status, 200);
    assert.equal(events.length, 2);
    await React.act(async () => { listeners.forEach(listener => listener(events[1])); });
    await visibleIn('lab', 'studio');
  } finally {
    await React.act(async () => root.unmount());
    client.clear();
    dom.window.close();
  }
});
