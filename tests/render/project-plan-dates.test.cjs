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

function loadProjectPlan(writes) {
  return load('src/app/(main)/[workspaceId]/projects/[projectSlug]/ProjectPlan.tsx', {
    react: React,
    'react/jsx-runtime': require('react/jsx-runtime'),
    'next/link': { default: 'a' },
    '@/components/ui/card': { Card: 'div' },
    '@/components/ui/button': { Button: ({ asChild, variant, ...props }) => asChild ? props.children : React.createElement('button', props) },
    '@/hooks/queries/useIssues': { useUpdateIssue: () => ({ mutateAsync: async value => writes.push(value) }) },
    '@/hooks/use-permissions': { usePermissions: () => ({ checkPermission: () => ({ hasPermission: true }) }) },
    '@/lib/permission-types': load('src/lib/permission-types.ts'),
    '@/lib/utils': { cn: () => '' },
  }).ProjectPlan;
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
