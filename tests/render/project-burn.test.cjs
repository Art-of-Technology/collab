const { assert, test, load } = require('../security/helpers.cjs');
const { JSDOM } = require('jsdom');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { createRoot } = require('react-dom/client');

function loadProjectBurn(window) {
  return load('src/app/(main)/[workspaceId]/projects/[projectSlug]/ProjectBurn.tsx', {
    react: React,
    'react/jsx-runtime': require('react/jsx-runtime'),
    'next/link': { default: 'a' },
    '@/components/ui/card': { Card: 'div' },
    '@/hooks/use-chart-width': load('src/hooks/use-chart-width.ts', { react: React }, { window }),
    '@/lib/utils': { cn: (...classes) => classes.filter(Boolean).join(' ') },
  }, { window }).ProjectBurn;
}

test('the forecast stays within the eight-week or milestone axis and names the far date', () => {
  const { calculateProjectBurn } = load('src/lib/project-burn.ts');
  const ProjectBurn = loadProjectBurn();
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

test('the burn charts keep their axis label size when they are given a wide drawing width', async () => {
  const { calculateProjectBurn } = load('src/lib/project-burn.ts');
  const now = new Date('2026-11-21T12:00:00Z');
  const start = new Date('2026-11-02T12:00:00Z');
  const burn = calculateProjectBurn({
    workspaceId: 'demo', createdAt: start, now, milestones: [],
    work: [{ createdAt: start, updatedAt: now, done: true, finishedAt: now,
      closer: { id: 'developer', name: 'Developer', agentSeat: null } }],
    accounts: [], merges: [], runs: [], logs: [], spend: undefined,
  });
  const dom = new JSDOM('<div id="root"></div>');
  global.window = dom.window;
  global.document = dom.window.document;
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const observers = new Set();
  window.ResizeObserver = class {
    constructor(callback) { this.callback = callback; }
    observe() { observers.add(this.callback); }
    disconnect() { observers.delete(this.callback); }
  };
  const ProjectBurn = loadProjectBurn(window);
  const root = createRoot(document.getElementById('root'));
  const resize = width => React.act(async () => {
    for (const callback of observers) callback([{ contentRect: { width } }]);
  });
  const assertCharts = width => {
    for (const selector of ['svg[aria-label^="Burn-up"]', 'svg[aria-label^="Weekly"]']) {
      const chart = document.querySelector(selector);
      assert.equal(Number(chart.getAttribute('viewBox').split(' ')[2]), width);
      assert.equal(Number(chart.querySelector('line').getAttribute('x2')), width - 16);
      const labels = chart.querySelectorAll('text');
      assert.ok(labels.length > 1);
      for (const label of labels) assert.equal(label.getAttribute('font-size'), '11');
    }
  };

  try {
    await React.act(async () => root.render(React.createElement(ProjectBurn, { burn })));
    assertCharts(500);
    await resize(2300);
    assertCharts(2300);
    await resize(340);
    assertCharts(500);
  } finally {
    await React.act(async () => root.unmount());
    dom.window.close();
    delete global.window;
    delete global.document;
    delete global.IS_REACT_ACT_ENVIRONMENT;
  }
  assert.equal(observers.size, 0);
});
