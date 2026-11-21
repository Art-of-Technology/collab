const { assert, test, load } = require('../security/helpers.cjs');
const { JSDOM } = require('jsdom');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

test('the forecast stays within the eight-week or milestone axis and names the far date', () => {
  const { calculateProjectBurn } = load('src/lib/project-burn.ts');
  const { ProjectBurn } = load('src/app/(main)/[workspaceId]/projects/[projectSlug]/ProjectBurn.tsx', {
    react: React,
    'react/jsx-runtime': require('react/jsx-runtime'),
    'next/link': { default: 'a' },
    '@/components/ui/card': { Card: 'div' },
    '@/lib/utils': { cn: (...classes) => classes.filter(Boolean).join(' ') },
  });
  const now = new Date('2026-11-21T12:00:00Z');
  const date = days => new Date(now.getTime() + days * 86_400_000);
  const issue = (closedDaysAgo) => ({
    createdAt: date(-30), updatedAt: now, done: closedDaysAgo !== null,
    finishedAt: closedDaysAgo === null ? null : date(-closedDaysAgo),
    closer: { id: 'developer', name: 'Developer', agentSeat: null },
  });
  const burnFor = milestones => calculateProjectBurn({
    workspaceId: 'demo', createdAt: date(-30), now, milestones,
    work: [
      ...Array.from({ length: 70 }, () => issue(1)), issue(8),
      ...Array.from({ length: 70 }, () => issue(15)),
      ...Array.from({ length: 53 }, () => issue(null)),
    ],
    accounts: [], merges: [], runs: [], logs: [], spend: undefined,
  });

  for (const [milestones, endLabel] of [
    [[], '16 Jan'],
    [[{ label: 'DEMO-1', dueDate: date(70) }], '30 Jan'],
  ]) {
    const burn = burnFor(milestones);
    const dom = new JSDOM(renderToStaticMarkup(React.createElement(ProjectBurn, { burn })));
    const { document } = dom.window;
    const chart = document.querySelector('svg[aria-label^="Burn-up"]');
    const rightEdge = Number(chart.querySelector('line').getAttribute('x2'));
    const forecastBand = chart.querySelector('polygon').getAttribute('points').split(' ');
    assert.equal(chart.querySelector(':scope > text:last-child').textContent, endLabel);
    assert.match(document.body.textContent, /At the slowest pace, completion extends beyond the chart to 27 Nov 2027/);
    assert.equal(Math.max(...forecastBand.map(point => Number(point.split(',')[0]))), rightEdge);
    dom.window.close();
  }
});
