const { assert, test, load } = require('./helpers.cjs');

function fixture({ connections = [], error = false } = {}) {
  let retries = 0;
  const jsx = (type, props) => ({ type, props });
  const Component = load('src/app/(main)/[workspaceId]/projects/[projectSlug]/ProjectDashboard.tsx', {
    react: { useMemo: fn => fn() }, 'react/jsx-runtime': { jsx, jsxs: jsx },
    'next/navigation': { useRouter: () => ({}) }, 'next/link': { default: 'a' },
    'lucide-react': {}, '@/components/ui/button': { Button: 'button' }, '@/components/ui/avatar': {},
    '@/hooks/queries/useViews': { useViews: () => ({ data: [] }) },
    '@/hooks/queries/useProjects': { useProjectSummary: () => ({
      data: error ? undefined : { stats: {}, atRisk: {}, repositories: { connections, activities: [] } },
      isLoading: false, isError: error, refetch: () => retries++,
    }) },
    '@/lib/utils': { cn: () => '' }, 'date-fns': {}, '@/components/widgets': { NotesCarousel: () => null },
  }).ProjectDashboard;
  function render(node) {
    if (Array.isArray(node)) return node.map(render);
    if (!node || typeof node !== 'object') return node;
    if (typeof node.type === 'function') return render(node.type(node.props));
    return { ...node, props: { ...node.props, children: render(node.props?.children) } };
  }
  const tree = render(Component({ projectId: 'project-1', projectName: 'Buildwake', projectSlug: 'buildwake', workspaceSlug: 'weezboo' }));
  const text = node => Array.isArray(node) ? node.map(text).join('') : node && typeof node === 'object' ? text(node.props?.children) : typeof node === 'string' ? node : '';
  const nodes = node => Array.isArray(node) ? node.flatMap(nodes) : node && typeof node === 'object' ? [node, ...nodes(node.props?.children)] : [];
  return { text: text(tree), nodes: nodes(tree), retries: () => retries };
}

test('unlinked project offers provider-neutral repository settings', () => {
  const f = fixture();
  assert.match(f.text, /No repository connected/);
  assert.match(f.text, /Connect repository/);
  assert.doesNotMatch(f.text, /Setup GitHub/);
  assert.ok(f.nodes.some(n => n.type === 'a' && n.props.href === '/weezboo/projects/buildwake/settings?tab=github'));
});
test('persisted repositories remain visible regardless of provider', () => {
  const f = fixture({ connections: [{ id: 'repo', provider: 'forgejo', name: 'team/buildwake' }] });
  assert.match(f.text, /1 repository connected/);
  assert.match(f.text, /team\/buildwake/);
  assert.doesNotMatch(f.text, /No repository connected|Connect repository/);
});
test('failed summary read shows retry instead of disconnected', () => {
  const f = fixture({ error: true });
  assert.match(f.text, /Connection status unavailable/);
  assert.doesNotMatch(f.text, /No repository connected|Connect repository/);
  f.nodes.find(n => n.type === 'button' && n.props.children === 'Retry').props.onClick();
  assert.equal(f.retries(), 1);
});
