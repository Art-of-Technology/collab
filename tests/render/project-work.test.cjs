const { assert, test, load } = require('../security/helpers.cjs');
const { JSDOM } = require('jsdom');
const React = require('react');

const folder = 'src/app/(main)/[workspaceId]/projects/[projectSlug]';
const jsx = { 'react/jsx-runtime': require('react/jsx-runtime') };

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
  const { ProjectWork } = load(folder + '/ProjectWork.tsx', {
    ...jsx, react: React,
    'next/link': { default: ({ scroll, prefetch, ...props }) => React.createElement('a', props) },
    '@/components/issue/IssueDetailModal': { IssueDetailModal: 'aside' },
    '@/hooks/useIssueModalUrlState': { useIssueModalUrlState: () => ({ setSelectedIssueId() {} }) },
    '@/lib/utils': { cn: (...values) => values.filter(Boolean).join(' ') },
  });
  const milestone = (id, issueKey, title) => ({ id, issueKey, title, dueDate: '2026-11-21', forecastDate: '2026-11-24', driftDays: 3, completed: 0 });
  const milestones = [milestone('one', 'M9', 'Launch'), milestone('two', 'M10', 'Polish')];
  const moving = { id: 'move', issueKey: 'DEMO-1', title: 'Move me', milestoneId: 'one', status: 'Backlog', statusId: 'todo' };
  const keep = { ...moving, id: 'stay', title: 'Stay here', issueKey: 'DEMO-2' };
  const loose = { ...moving, id: 'loose', milestoneId: null, title: 'Unplanned', issueKey: 'DEMO-3' };
  const statuses = [{ id: 'todo', displayName: 'Backlog' }];
  const root = createRoot(document.querySelector('main'));
  const render = (issue, filter = {}) => React.act(async () => root.render(React.createElement(ProjectWork, {
    base: '/example/projects/studio', milestoneId: null, noMilestone: false, hasForge: false, ...filter,
    summary: { overview: { work: [issue, keep, loose], milestones }, statusDistribution: statuses },
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
    assert.match(document.body.textContent, /1 of 3 issues shown/);
    await click([...document.querySelectorAll('button')].find(button => button.textContent === 'Board'));
    assert.equal(groups().length, 1);
    assert.equal(groups()[0].getAttribute('aria-label'), 'Backlog');
    assert.match(groups()[0].textContent, /Move meM10/);
    assert.doesNotMatch(groups()[0].textContent, /Stay here|Unplanned/);
    assert.equal(document.querySelector('a').getAttribute('href'), '/example/projects/studio?tab=work');
  } finally {
    await React.act(async () => root.unmount());
    dom.window.close();
  }
});
