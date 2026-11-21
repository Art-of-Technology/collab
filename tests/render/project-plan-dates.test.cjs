const { assert, test, load } = require('../security/helpers.cjs');
const { after } = require('node:test');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<div id="root"></div>');
global.window = dom.window;
global.document = dom.window.document;
global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { createRoot } = require('react-dom/client');
after(() => dom.window.close());

function loadPlanComponents(writes) {
  return load('src/app/(main)/[workspaceId]/projects/[projectSlug]/ProjectPlan.tsx', {
    react: React,
    'react/jsx-runtime': require('react/jsx-runtime'),
    'next/link': { default: 'a' },
    '@/components/ui/card': { Card: 'div' },
    '@/components/ui/button': { Button: ({ asChild, variant, ...props }) => asChild ? props.children : React.createElement('button', props) },
    '@/hooks/queries/useIssues': { useUpdateIssue: () => ({ mutateAsync: async value => writes.push(value) }) },
    '@/hooks/use-permissions': { usePermissions: () => ({ checkPermission: () => ({ hasPermission: true }) }) },
    '@/hooks/use-chart-width': load('src/hooks/use-chart-width.ts', { react: React }, { window }),
    '@/lib/permission-types': load('src/lib/permission-types.ts'),
    '@/lib/utils': { cn: () => '' },
  }, { window });
}

function loadProjectPlan(writes) {
  return loadPlanComponents(writes).ProjectPlan;
}

const start = Date.parse('2026-11-20') / 86_400_000;
const end = start + 5;
const milestone = {
  id: 'launch', issueKey: 'DEMO-1', title: 'Launch', state: 'running', completed: 0, total: 0, issues: [],
  startDate: '2026-11-20T00:00:00.000Z', dueDate: '2026-11-25T00:00:00.000Z',
  start, end, baselineStart: null, baselineDue: null, forecast: null, driftDays: null,
};
const reversed = {
  ...milestone, id: 'reversed', issueKey: 'DEMO-2', title: 'Reversed',
  startDate: milestone.dueDate, dueDate: milestone.startDate,
  start: null, end: null, invalidDates: true,
};

test('the plan chart keeps its label size when it is given a wide drawing width', async () => {
  const observers = new Map();
  window.ResizeObserver = class {
    constructor(callback) { this.callback = callback; }
    observe(element) { observers.set(element, this.callback); }
    disconnect() {
      for (const [element, callback] of observers) {
        if (callback === this.callback) observers.delete(element);
      }
    }
  };
  const { ProjectPlan, ProjectPlanPreview } = loadPlanComponents([]);
  const overview = { plan: { today: start, milestones: [milestone] } };
  const root = createRoot(document.getElementById('root'));
  const resize = width => React.act(async () => {
    for (const callback of observers.values()) callback([{ contentRect: { width } }]);
  });

  try {
    for (const [element, designWidth] of [
      [React.createElement(ProjectPlan, {
        summary: { project: { id: 'project' }, overview },
        workspaceId: 'workspace', workspaceSlug: 'demo', base: '/demo/projects/example',
        refetch: async () => {},
      }), 1000],
      [React.createElement(ProjectPlanPreview, { overview, base: '/demo/projects/example' }), 520],
    ]) {
      await React.act(async () => root.render(element));
      const chart = document.querySelector('svg');
      const drawingWidth = () => Number(chart.getAttribute('viewBox').split(' ')[2]);
      const label = chart.querySelector('g[role="button"] text, a text');
      const today = [...chart.querySelectorAll('text')].find(text => text.textContent.startsWith('today,'));
      const bar = chart.querySelector('rect[fill="rgba(96,165,250,.25)"]');
      const originalBarWidth = Number(bar.getAttribute('width'));
      assert.equal(drawingWidth(), designWidth);

      await resize(2300);
      assert.equal(drawingWidth(), 2300);
      assert.equal(label.getAttribute('font-size'), '12');
      assert.equal(today.getAttribute('font-size'), '11');
      assert.equal(label.getAttribute('x'), '8');
      assert.ok(Number(bar.getAttribute('width')) > originalBarWidth);

      await resize(340);
      assert.equal(drawingWidth(), designWidth);
      assert.equal(Number(bar.getAttribute('width')), originalBarWidth);
    }
  } finally {
    await React.act(async () => root.unmount());
    delete window.ResizeObserver;
  }
  assert.equal(observers.size, 0);
});

test('Plan keeps date edits local until Save dates and commits the date pair together', async () => {
  const writes = [];
  const ProjectPlan = loadProjectPlan(writes);
  const root = createRoot(document.getElementById('root'));
  const enter = (label, value) => React.act(async () => {
    const input = [...document.querySelectorAll('label')].find(item => item.textContent === label).querySelector('input');
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  const save = () => React.act(async () => {
    [...document.querySelectorAll('button')].find(button => button.textContent === 'Save dates').click();
  });
  try {
    await React.act(async () => root.render(React.createElement(ProjectPlan, {
      summary: { project: { id: 'project' }, overview: { plan: { today: start, milestones: [milestone, reversed] } } },
      workspaceId: 'workspace', workspaceSlug: 'demo', base: '/demo/projects/example', milestoneId: 'launch',
      refetch: async () => {},
    })));
    await enter('Due', '0002-11-25');
    await enter('Due', '2026-11-19');
    assert.deepEqual(writes, []);
    await save();
    assert.equal(document.querySelector('[role="alert"]').textContent, 'The due date is before the start.');
    assert.deepEqual(writes, []);
    await enter('Start', '2026-11-26');
    await enter('Due', '2026-11-29');
    assert.deepEqual(writes, []);
    await save();
    assert.equal(writes.length, 1);
    assert.equal(writes[0].startDate.toISOString(), '2026-11-26T00:00:00.000Z');
    assert.equal(writes[0].dueDate.toISOString(), '2026-11-29T00:00:00.000Z');

    assert.doesNotMatch(document.querySelector('svg').textContent, /DEMO-2/);
    const repair = [...document.querySelectorAll('button')].find(button => button.textContent.includes('Due before start'));
    await React.act(async () => repair.click());
    assert.deepEqual([...document.querySelectorAll('input[type="date"]')].map(input => input.value), ['2026-11-25', '2026-11-20']);
  } finally {
    await React.act(async () => root.unmount());
  }
});

test('Plan enables Set baseline only for valid saved dates', async () => {
  const ProjectPlan = loadProjectPlan([]);
  const inferred = { ...milestone, state: 'done', startDate: null, dueDate: null };
  const root = createRoot(document.getElementById('root'));
  try {
    for (const [row, disabled, reason] of [
      [inferred, true, 'a charted milestone with only inferred dates'],
      [reversed, true, 'a milestone with reversed saved dates'],
      [milestone, false, 'a milestone with valid saved dates'],
    ]) {
      await React.act(async () => root.render(React.createElement(ProjectPlan, {
        summary: { project: { id: 'project' }, overview: { plan: { today: start, milestones: [row] } } },
        workspaceId: 'workspace', workspaceSlug: 'demo', base: '/demo/projects/example', milestoneId: row.id,
        refetch: async () => {},
      })));
      const button = [...document.querySelectorAll('button')].find(item => item.textContent === 'Set baseline');
      assert.ok(button, `Set baseline is visible for ${reason}`);
      assert.equal(button.disabled, disabled, reason);
    }
  } finally {
    await React.act(async () => root.unmount());
  }
});
