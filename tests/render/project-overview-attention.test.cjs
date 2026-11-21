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
  const { ProjectDashboard } = load('src/app/(main)/[workspaceId]/projects/[projectSlug]/ProjectDashboard.tsx', {
    react: React,
    'react/jsx-runtime': require('react/jsx-runtime'),
    'next/link': { default: ({ scroll, ...props }) => React.createElement('a', props) },
    'next/navigation': { useSearchParams: () => new URLSearchParams() },
    'lucide-react': { ChevronRight: () => null },
    '@/components/ui/button': { Button: ({ asChild, variant, ...props }) => asChild ? props.children : React.createElement('button', props) },
    '@/components/ui/card': { Card: 'div' },
    '@/components/issue/NewIssueModal': { default: () => null },
    '@/hooks/queries/useProjects': { useProjectSummary: () => ({ data: summary }) },
    '@/lib/utils': { cn: () => '' },
    './ProjectBurn': { BurnOverviewCard: () => null },
    './ProjectPlan': { ProjectPlanPreview: () => null },
    './ProjectWork': { ProjectWork: () => null },
  });
  const root = createRoot(document.getElementById('root'));
  const forecast = driftDays => ({
    id: `M-${driftDays}`, issueKey: `M-${driftDays}`, driftDays, forecastDate: '2026-11-25T00:00:00Z',
  });
  const blocked = blockedDays => ({ id: `B-${blockedDays}`, issueKey: `B-${blockedDays}`, blockedDays });
  const render = (milestones, lateMilestoneIds, blocked, unplanned = []) => {
    summary = {
      project: { id: 'project' },
      repositories: { connections: [], activities: [] }, notes: [], featureRequests: [],
      overview: { stats: {}, milestones, lateMilestoneIds, unplanned, blocked, hasBaseline: true },
    };
    return React.act(async () => root.render(React.createElement(ProjectDashboard, {
      projectId: 'project', projectName: 'Demo', projectSlug: 'demo', workspaceSlug: 'demo',
    })));
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
  } finally {
    await React.act(async () => root.unmount());
    dom.window.close();
  }
});
