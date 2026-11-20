const { assert, test, load } = require('./helpers.cjs');

function fixture({ connections = [], error = false, tab, milestones = [], expanded = null } = {}) {
  let retries = 0;
  const jsx = (type, props) => ({ type, props });
  const Component = load('src/app/(main)/[workspaceId]/projects/[projectSlug]/ProjectDashboard.tsx', {
    react: { useState: initial => [initial === null ? expanded : initial, () => {}] },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'next/navigation': { useSearchParams: () => new URLSearchParams(tab) }, 'next/link': { default: 'a' },
    '@/components/ui/button': { Button: ({ asChild, children, ...props }) => asChild ? children : jsx('button', { ...props, children }) },
    '@/components/ui/card': { Card: 'div' }, '@/components/issue/NewIssueModal': {},
    '@/hooks/queries/useProjects': { useProjectSummary: () => ({
      data: error ? undefined : {
        project: { id: 'project-1' },
        overview: { stats: {}, milestones, lateMilestoneIds: [], unplanned: [], blocked: [] },
        repositories: { connections, activities: [] }, notes: [], featureRequests: [],
      },
      isLoading: false, isError: error, refetch: () => retries++,
    }) },
    '@/lib/utils': { cn: () => '' },
  }).ProjectDashboard;
  function render(node) {
    if (Array.isArray(node)) return node.map(render);
    if (!node || typeof node !== 'object') return node;
    if (typeof node.type === 'function') return render(node.type(node.props));
    return { ...node, props: { ...node.props, children: render(node.props?.children) } };
  }
  const tree = render(Component({ projectId: 'project-1', projectName: 'Example Project', projectSlug: 'example', workspaceSlug: 'demo' }));
  const text = node => Array.isArray(node) ? node.map(text).join('') : node && typeof node === 'object' ? text(node.props?.children) : typeof node === 'string' ? node : '';
  const nodes = node => Array.isArray(node) ? node.flatMap(nodes) : node && typeof node === 'object' ? [node, ...nodes(node.props?.children)] : [];
  const rendered = nodes(tree);
  const nav = rendered.find(n => n.type === 'nav');
  return { text: text(tree), nodes: rendered, retries: () => retries, tabs: nodes(nav).filter(n => n.type === 'a') };
}

test('unlinked project offers provider-neutral repository settings', () => {
  const f = fixture({ expanded: 'repository' });
  assert.match(f.text, /No repository connected/);
  assert.match(f.text, /Connect repository/);
  assert.doesNotMatch(f.text, /Setup GitHub/);
  assert.ok(f.nodes.some(n => n.type === 'a' && n.props.href === '/demo/projects/example/settings?tab=github'));
});
test('persisted repositories remain visible regardless of provider', () => {
  const f = fixture({ connections: [{ id: 'repo', provider: 'forgejo', name: 'team/example' }], expanded: 'repository' });
  assert.match(f.text, /1 repository connected/);
  assert.match(f.text, /team\/example/);
  assert.doesNotMatch(f.text, /No repository connected|Connect repository/);
});
test('failed summary read shows retry instead of disconnected', () => {
  const f = fixture({ error: true });
  assert.match(f.text, /Connection status unavailable/);
  assert.doesNotMatch(f.text, /No repository connected|Connect repository/);
  f.nodes.find(n => n.type === 'button' && n.props.children === 'Retry').props.onClick();
  assert.equal(f.retries(), 1);
});
test('the project tabs follow the URL and a milestone opens in Plan', () => {
  const f = fixture({ tab: 'tab=plan&milestone=first', milestones: [{ id: 'first', issueKey: 'DEMO-1', title: 'First milestone' }] });
  assert.deepEqual(f.tabs.map(n => n.props.children), ['Overview', 'Plan', 'Burn', 'Work']);
  assert.equal(f.tabs.find(n => n.props['aria-current'] === 'page').props.children, 'Plan');
  assert.match(f.text, /DEMO-1 · First milestone/);
  assert.doesNotMatch(f.text, /Project board/);
});
test('a project without milestones offers only Overview and Work and an invitation', () => {
  const f = fixture({ tab: 'tab=burn' });
  assert.deepEqual(f.tabs.map(n => n.props.children), ['Overview', 'Work']);
  assert.equal(f.tabs.find(n => n.props['aria-current'] === 'page').props.children, 'Overview');
  assert.match(f.text, /Create your first milestone/);
  assert.doesNotMatch(f.text, /Feature requests/);
});
