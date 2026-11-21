const { assert, test, load } = require('../security/helpers.cjs');
const { JSDOM } = require('jsdom');
const React = require('react');
const { createRoot } = require('react-dom/client');

test('Overview shows five ordered attention lines and keeps the no-milestone line visible', async () => {
  const dom = new JSDOM('<div id="root"></div>');
  global.window = dom.window;
  global.document = dom.window.document;
  global.IS_REACT_ACT_ENVIRONMENT = true;

  let summary;
  let search = new URLSearchParams();
  const { ProjectDashboard } = load('src/app/(main)/[workspaceId]/projects/[projectSlug]/ProjectDashboard.tsx', {
    react: React,
    'react/jsx-runtime': require('react/jsx-runtime'),
    'next/link': { default: ({ scroll, ...props }) => React.createElement('a', props) },
    'next/navigation': { useSearchParams: () => search },
    'lucide-react': { ChevronRight: () => null },
    '@/components/ui/button': { Button: ({ asChild, variant, ...props }) => asChild ? props.children : React.createElement('button', props) },
    '@/components/ui/card': { Card: 'div' },
    '@/components/issue/NewIssueModal': { default: () => null },
    '@/hooks/queries/useProjects': { useProjectSummary: () => ({ data: summary }) },
    '@/lib/utils': { cn: () => '' },
    './ProjectBurn': { BurnOverviewCard: () => null },
    './ProjectPlan': { ProjectPlanPreview: () => null },
    './ProjectWork': { ProjectWork: ({ waitingIssueIds }) => React.createElement('output', null, waitingIssueIds?.join(',')) },
  });
  const root = createRoot(document.getElementById('root'));
  const forecast = driftDays => ({
    id: `M-${driftDays}`, issueKey: `M-${driftDays}`, driftDays, forecastDate: '2026-11-25T00:00:00Z',
  });
  const blocked = blockedDays => ({ id: `B-${blockedDays}`, issueKey: `B-${blockedDays}`, blockedDays });
  const renderDashboard = () => React.act(async () => root.render(React.createElement(ProjectDashboard, {
    projectId: 'project', projectName: 'Demo', projectSlug: 'demo', workspaceSlug: 'demo',
  })));
  const render = (milestones, lateMilestoneIds, blocked, unplanned = [], waiting = [], waitingOnCycle = []) => {
    summary = {
      project: { id: 'project' },
      repositories: { connections: [], activities: [] }, notes: [], featureRequests: [],
      overview: { stats: {}, milestones, lateMilestoneIds, unplanned, blocked, waiting, waitingOnCycle, hasBaseline: true },
    };
    return renderDashboard();
  };
  const heading = () => [...document.querySelectorAll('h2')].find(item => item.textContent.startsWith('Needs attention'));
  const card = () => heading().parentElement;
  const lines = () => [...card().querySelectorAll('li')].map(item => item.textContent);
  const control = () => card().querySelector('button');
  const noMilestone = '1 open issue has no milestone';
  const blockedLabel = days => `B-${days} has been blocked for ${days} days`;

  try {
    await render([], [], []);
    assert.equal(heading().textContent, 'Needs attention · 0');
    assert.equal(card().querySelector('p').textContent, 'Nothing needs attention.');
    assert.deepEqual(lines(), []);
    assert.equal(control(), null);

    await render([], [], [2, 4, 5, 3].map(blocked), [{ id: 'unplanned' }]);
    assert.equal(heading().textContent, 'Needs attention · 5');
    assert.deepEqual(lines(), [...[5, 4, 3, 2].map(blockedLabel), noMilestone]);
    assert.equal(control(), null);

    const milestones = [3, 8, 5].map(forecast);
    const blockedIssues = [20, 30, 19, 23, 27, 17, 22, 24, 26, 21, 18, 28, 29, 16, 25].map(blocked);
    const late = [8, 5, 3].map(days => `M-${days} is forecast ${days} days after its baseline`);
    await render(milestones, ['M-8', 'M-5', 'M-3'], blockedIssues, [{ id: 'unplanned' }]);
    const collapsed = [...late, blockedLabel(30), noMilestone];
    assert.equal(heading().textContent, 'Needs attention · 19');
    assert.deepEqual(lines(), collapsed);
    assert.equal(control().textContent, 'Show all 19');
    assert.equal(control().getAttribute('aria-expanded'), 'false');
    assert.equal(document.getElementById(control().getAttribute('aria-controls')), card().querySelector('ul'));

    await React.act(async () => control().click());
    assert.equal(heading().textContent, 'Needs attention · 19');
    assert.deepEqual(lines(), [
      ...late, ...Array.from({ length: 15 }, (_, index) => blockedLabel(30 - index)), noMilestone,
    ]);
    assert.equal(control().textContent, 'Show fewer');
    assert.equal(control().getAttribute('aria-expanded'), 'true');

    await React.act(async () => control().click());
    assert.deepEqual(lines(), collapsed);
    await render(milestones, ['M-8', 'M-5', 'M-3'], blockedIssues);
    assert.deepEqual(lines(), [...late, blockedLabel(30), blockedLabel(29)]);
    assert.equal(control().textContent, 'Show all 18');

    const waiting = [
      { blocker: { id: 'idle', issueKey: 'DEMO-1', title: 'Review capacity' }, issueIds: ['one', 'two'], state: 'unassigned' },
      { blocker: { id: 'closed', issueKey: 'DEMO-2', title: 'Confirm scope' }, issueIds: ['three'], state: 'closed' },
    ];
    await render([], [], [blocked(6)], [], waiting, ['cycle-a', 'cycle-b']);
    assert.deepEqual(lines(), [
      blockedLabel(6),
      '2 issues wait on DEMO-1, Review capacity, which nobody is working on',
      '1 issue waits on DEMO-2, Confirm scope, which is closed',
      '2 issues wait on a dependency cycle',
    ]);
    const target = new URL(card().querySelectorAll('li a')[1].href, 'https://example.test');
    const cycleTarget = new URL(card().querySelectorAll('li a')[3].href, 'https://example.test');
    assert.equal(target.pathname, '/demo/projects/demo');
    assert.equal(target.searchParams.get('tab'), 'work');
    search = target.searchParams;
    await renderDashboard();
    assert.equal(document.querySelector('output').textContent, 'one,two');
    search = cycleTarget.searchParams;
    await renderDashboard();
    assert.equal(document.querySelector('output').textContent, 'cycle-a,cycle-b');
  } finally {
    await React.act(async () => root.unmount());
    dom.window.close();
  }
});
