const { assert, test, load } = require('../security/helpers.cjs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<div id="root"></div>');
global.window = dom.window;
global.document = dom.window.document;
global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { createRoot } = require('react-dom/client');

test('Plan keeps date edits local until Save dates and commits the date pair together', async () => {
  const writes = [];
  const { ProjectPlan } = load('src/app/(main)/[workspaceId]/projects/[projectSlug]/ProjectPlan.tsx', {
    react: React,
    'react/jsx-runtime': require('react/jsx-runtime'),
    'next/link': { default: 'a' },
    '@/components/ui/card': { Card: 'div' },
    '@/components/ui/button': { Button: ({ asChild, variant, ...props }) => asChild ? props.children : React.createElement('button', props) },
    '@/hooks/queries/useIssues': { useUpdateIssue: () => ({ mutateAsync: async value => writes.push(value) }) },
    '@/hooks/use-permissions': { usePermissions: () => ({ checkPermission: () => ({ hasPermission: true }) }) },
    '@/lib/permission-types': load('src/lib/permission-types.ts'),
    '@/lib/utils': { cn: () => '' },
  });
  const start = Date.parse('2026-11-20') / 86_400_000;
  const end = start + 5;
  const milestone = {
    id: 'launch', issueKey: 'DEMO-1', title: 'Launch', state: 'running', completed: 0, total: 0, issues: [],
    startDate: '2026-11-20T00:00:00.000Z', dueDate: '2026-11-25T00:00:00.000Z',
    start, end, baselineStart: start, baselineDue: end, forecast: null, driftDays: 0,
  };
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
      summary: { project: { id: 'project' }, overview: { plan: { today: start, milestones: [milestone] } } },
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
  } finally {
    await React.act(async () => root.unmount());
    dom.window.close();
  }
});
