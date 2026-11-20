const { assert, test, load } = require('../security/helpers.cjs');
const { JSDOM } = require('jsdom');
const React = require('react');
const { createRoot } = require('react-dom/client');

test('issue detail milestone selector chooses a project milestone and clears it', async () => {
  const dom = new JSDOM('<div id="root"></div>');
  global.window = dom.window;
  global.document = dom.window.document;
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const root = createRoot(document.getElementById('root'));
  const { IssueMilestoneSelector } = load('src/components/issue/selectors/IssueMilestoneSelector.tsx', {
    'react/jsx-runtime': require('react/jsx-runtime'),
    '@tanstack/react-query': { useQuery: ({ queryKey }) => {
      assert.deepEqual([...queryKey], ['project-a', 'milestones']);
      return { data: [{ id: 'self', title: 'This issue' }, { id: 'milestone', issueKey: 'PROJ-1', title: 'Launch' }] };
    } },
    '@/hooks/queries/useIssues': { issueKeys: { byProject: id => [id] } },
  });
  const updates = [];
  const render = value => root.render(React.createElement(IssueMilestoneSelector, {
    projectId: 'project-a', issueId: 'self', value, onChange: value => updates.push(value),
  }));
  try {
    await React.act(async () => render(null));
    const select = document.querySelector('select');
    assert.deepEqual([...select.options].map(option => option.text), ['No milestone', 'PROJ-1 · Launch']);
    await React.act(async () => {
      select.value = 'milestone';
      select.dispatchEvent(new window.Event('change', { bubbles: true }));
    });
    await React.act(async () => render('milestone'));
    assert.equal(select.value, 'milestone');
    await React.act(async () => {
      select.value = '';
      select.dispatchEvent(new window.Event('change', { bubbles: true }));
    });
    assert.deepEqual(updates, ['milestone', null]);
  } finally {
    await React.act(async () => root.unmount());
    dom.window.close();
  }
});
