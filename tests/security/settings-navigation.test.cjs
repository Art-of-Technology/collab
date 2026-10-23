const { assert, test, load } = require('./helpers.cjs');

function sidebarSettings(currentWorkspace, isCollapsed) {
  const destinations = [];
  const jsx = (type, props) => ({ type, props });
  const Sidebar = load('src/components/layout/SimplifiedSidebar.tsx', {
    react: { useState: initial => [initial, () => {}], useMemo: compute => compute() },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'next/link': { default: 'a' }, 'next/image': { default: 'img' },
    'next/navigation': { useRouter: () => ({ push: destination => destinations.push(destination) }) },
    'lucide-react': {},
    '@/lib/sign-out': {}, '@/lib/utils': { cn: () => '' },
    '@/components/ui/input': { Input: 'input' }, '@/components/ui/button': { Button: 'button' },
    '@/components/ui/scroll-area': {}, '@/components/ui/user-avatar': { UserAvatar: 'avatar' },
    '@/components/ui/dropdown-menu': {
      DropdownMenu: 'menu', DropdownMenuContent: 'menu-content', DropdownMenuItem: 'menu-item',
      DropdownMenuSeparator: 'separator', DropdownMenuTrigger: 'trigger',
    },
    '@/hooks/queries/useUser': { useCurrentUser: () => ({ data: { name: 'Cem' } }) },
    '@/context/WorkspaceContext': { useWorkspace: () => ({ currentWorkspace }) },
    '@/hooks/queries/useProjects': { useProjects: () => ({ data: [] }) },
    '@/hooks/queries/useViews': { useViews: () => ({ data: [] }) },
    '@/hooks/queries/useInstalledApps': { useInstalledApps: () => ({ data: [] }) },
    '@/hooks/useAI': { useAIWidget: () => ({}), useAIAgents: () => ({}) },
    '@/hooks/use-toast': { useToast: () => ({ toast() {} }) },
    '@/components/workspace/WorkspaceSelector': {}, '@/components/modals/CreateViewModal': {},
    '@/components/modals/CreateProjectModal': {}, '@/components/layout/sidebar/NotificationPopover': {},
  }).default;
  function nodes(node) {
    if (Array.isArray(node)) return node.flatMap(nodes);
    return node && typeof node === 'object' ? [node, ...nodes(node.props?.children)] : [];
  }
  const text = node => Array.isArray(node) ? node.map(text).join('') : node && typeof node === 'object'
    ? text(node.props?.children) : typeof node === 'string' ? node : '';
  const settings = nodes(Sidebar({ isCollapsed })).find(node => node.type === 'menu-item' && text(node).trim() === 'Settings');
  assert.ok(settings, 'user menu exposes Settings');
  return { settings, destinations };
}

for (const isCollapsed of [false, true]) {
  for (const [workspace, expected] of [
    [{ id: 'workspace-id', slug: 'weezboo' }, '/weezboo/profile'],
    [{ id: 'workspace-id', slug: null }, '/workspace-id/profile'],
  ]) {
    test(`${isCollapsed ? 'collapsed' : 'expanded'} profile Settings opens ${expected}`, () => {
      const { settings, destinations } = sidebarSettings(workspace, isCollapsed);
      settings.props.onClick();
      assert.deepEqual(destinations, [expected]);
      assert.equal(settings.props.disabled, false);
    });
  }
  test(`${isCollapsed ? 'collapsed' : 'expanded'} profile Settings is inert without a workspace`, () => {
    const { settings, destinations } = sidebarSettings(null, isCollapsed);
    settings.props.onClick();
    assert.deepEqual(destinations, []);
    assert.equal(settings.props.disabled, true);
  });
}

test('workspace settings root redirects to supported workspace management', async () => {
  const Page = load('src/app/(main)/workspaces/[workspaceId]/settings/page.tsx', {
    'next/navigation': { redirect: destination => { throw new Error(`REDIRECT:${destination}`); } },
  }).default;
  await assert.rejects(Page({ params: Promise.resolve({ workspaceId: 'workspace-id' }) }), {
    message: 'REDIRECT:/workspaces/workspace-id',
  });
});

test('retired AI keys settings remains unavailable', () => {
  const Page = load('src/app/(main)/workspaces/[workspaceId]/settings/ai-keys/page.tsx', {
    'next/navigation': { notFound: () => { throw new Error('NOT_FOUND'); } },
  }).default;
  assert.throws(() => Page(), { message: 'NOT_FOUND' });
});
