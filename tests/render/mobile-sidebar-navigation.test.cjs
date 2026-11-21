const { assert, test, load } = require('../security/helpers.cjs');
const { JSDOM } = require('jsdom');
const React = require('react');
const jsx = require('react/jsx-runtime');
const { renderToStaticMarkup } = require('react-dom/server');

function renderSidebar(onNavigate) {
  const links = [], buttons = [], items = [];
  const Container = ({children}) => React.createElement('div', null, children);
  const Empty = () => null;
  const { default: Sidebar } = load('src/components/layout/SimplifiedSidebar.tsx', {
    react: React,
    'react/jsx-runtime': jsx,
    'next/link': { default: ({children, ...props}) => { links.push(props); return React.createElement('a', props, children); } }, 'next/image': require('next/image'),
    'next/navigation': { useRouter: () => ({ push: () => {} }) },
    'lucide-react': require('lucide-react'),
    '@/lib/sign-out': { signOutCurrentSession: () => { throw new Error('Unexpected sign out'); } },
    '@/components/ui/button': { Button: ({children, ...props}) => { buttons.push(props); return React.createElement('button', props, children); } },
    '@/components/ui/input': { Input: Empty },
    '@/components/ui/scroll-area': { ScrollArea: Empty },
    '@/components/ui/dropdown-menu': Object.fromEntries(['DropdownMenu', 'DropdownMenuContent', 'DropdownMenuItem', 'DropdownMenuSeparator', 'DropdownMenuTrigger'].map(name => [name, name === 'DropdownMenuItem' ? ({children, ...props}) => { items.push(props); return React.createElement('div', null, children); } : Container])),
    '@/components/ui/user-avatar': { UserAvatar: Empty },
    '@/hooks/queries/useUser': { useCurrentUser: () => ({ data: { name: 'Cem' } }) },
    '@/context/WorkspaceContext': { useWorkspace: () => ({ currentWorkspace: { id: 'workspace', slug: 'weezboo' } }) },
    '@/hooks/queries/useProjects': { useProjects: () => ({ data: [{id: 'p1', slug: 'project-one', name: 'Project One', updatedAt: '2026-11-21'}] }) },
    '@/hooks/queries/useViews': { useViews: () => ({ data: [{id: 'v1', name: 'Saved View', isFavorite: true}] }) },
    '@/hooks/queries/useSeatsWaiting': { useSeatsWaiting: () => ({ data: 0 }) },
    '@/hooks/queries/useInstalledApps': { useInstalledApps: () => ({ data: [
      { id: 'cli', app: { slug: 'collab-cli', name: 'Collab CLI', hasPage: false } },
      { id: 'calendar', app: { slug: 'google-calendar-sync', name: 'Calendar', hasPage: true } },
    ] }) },
    '@/hooks/useAI': { useAIWidget: () => ({}), useAIAgents: () => ({}) },
    '@/lib/utils': { cn: (...args) => args.filter(Boolean).join(' ') },
    '@/hooks/use-toast': { useToast: () => ({}) },
    '@/components/workspace/WorkspaceSelector': { default: Empty },
    '@/components/modals/CreateViewModal': { default: Empty },
    '@/components/modals/CreateProjectModal': { default: Empty },
    '@/components/layout/sidebar/NotificationPopover': { default: Empty },
    '@/context/MentionContext': { useMention: () => ({ unreadCoclawCount: 0 }) },
  });
  const html = renderToStaticMarkup(React.createElement(Sidebar, {onNavigate}));
  return { links, buttons, items, html };
}

test('mobile sidebar destinations dismiss the drawer, including repeated selection', () => {
  let closed = 0;
  const { links, items } = renderSidebar(() => closed++);
  assert.ok(links.some(link => link.href.includes('project-one')));
  assert.ok(links.some(link => link.href.includes('v1')));
  assert.ok(links.some(link => link.href.includes('/apps/')));
  for (const link of links) {
    assert.equal(typeof link.onClick, 'function', link.href);
    link.onClick();
    link.onClick(); // selecting the current destination must also dismiss
  }
  assert.equal(closed, links.length * 2);
  items[0].onClick(); // Settings uses router.push rather than Link
  assert.equal(closed, links.length * 2 + 1);
});

test('desktop links have no dismissal callback; mobile expand/create actions stay open', () => {
  for (const link of renderSidebar().links) assert.equal(link.onClick, undefined);
  let closed = 0;
  const { buttons } = renderSidebar(() => closed++);
  assert.ok(buttons.length > 1);
  for (const button of buttons) button.onClick?.();
  assert.equal(closed, 0);
});

function renderLayout({ isMobileOpen, isMdUp = false }) {
  const sidebars = [];
  const closeMobile = () => {};
  const Container = ({children}) => React.createElement('div', null, children);
  const Empty = () => null;
  const { default: Layout } = load('src/components/layout/LayoutWithSidebar.tsx', {
    react: React, 'react/jsx-runtime': jsx,
    'next/navigation': { usePathname: () => '/weezboo/dashboard' },
    '@/components/layout/SimplifiedSidebar': { default: props => { sidebars.push(props); return null; } },
    '@/components/providers/SidebarProvider': { useSidebar: () => ({ isMobileOpen, isMdUp, isCollapsedDesktop: false, closeMobile }) },
    '@/context/AIContext': { AIProvider: Container },
    '@heroicons/react/24/outline': { ChevronLeftIcon: Empty, ChevronRightIcon: Empty },
    '@/components/ui/button': { Button: Empty },
    '@/components/layout/MobileBottomNav': { MobileBottomNav: () => React.createElement('button', { id: 'bottom-menu' }, 'Menu') },
    '@/components/ai/ChatBar': { ChatBar: () => React.createElement('textarea', { id: 'search-or-ask' }) },
  });
  const html = renderToStaticMarkup(React.createElement(Layout, {pathname: '/weezboo/dashboard'},
    React.createElement('button', { id: 'page-action' }, 'Page action')));
  return { html, sidebars, closeMobile };
}

test('layout wires dismissal only to the mobile drawer', () => {
  const { sidebars, closeMobile } = renderLayout({ isMobileOpen: true });
  assert.equal(sidebars.length, 2);
  assert.equal(sidebars[0].onNavigate, undefined);
  assert.equal(sidebars[1].onNavigate, closeMobile);
});

test('the open mobile drawer disables interaction with the page and bottom controls', () => {
  for (const state of [
    { isMobileOpen: true },
    { isMobileOpen: false },
    { isMobileOpen: false, isMdUp: true },
  ]) {
    const { html } = renderLayout(state);
    const { window } = new JSDOM(html);
    try {
      const { document } = window;
      for (const id of ['page-action', 'bottom-menu', 'search-or-ask']) {
        assert.equal(Boolean(document.getElementById(id).closest('[inert]')), state.isMobileOpen, id);
      }
      assert.equal(document.querySelector('[role="dialog"]').closest('[inert]'), null);
    } finally {
      window.close();
    }
  }
});

test('issue title overrides the real shared Button nowrap style and permits flex shrinking', () => {
  const { readFileSync } = require('node:fs');
  const source = readFileSync('src/components/issue/IssueDetailContent.tsx', 'utf8');
  const titleButton = source.match(/<Button\s+variant="ghost"\s+className="([^"]+)"\s+onClick=\{\(\) => setEditingTitle\(true\)\}/)[1];
  const { clsx } = require('clsx');
  const { twMerge } = require('tailwind-merge');
  const { Button } = load('src/components/ui/button.tsx', {
    react: React, 'react/jsx-runtime': jsx,
    '@radix-ui/react-slot': require('@radix-ui/react-slot'),
    'class-variance-authority': require('class-variance-authority'),
    '@/lib/utils': { cn: (...args) => twMerge(clsx(args)) },
  });
  const html = renderToStaticMarkup(React.createElement(Button, {variant: 'ghost', className: titleButton}, 'Long title'));
  assert.match(html, /whitespace-normal/);
  assert.doesNotMatch(html, /whitespace-nowrap/);
  assert.match(html, /min-w-0/);
  const heading = source.match(/<h1 className="([^"]+)" data-issue-title>/)[1];
  assert.match(heading, /\[overflow-wrap:anywhere\]/);
  assert.match(heading, /min-w-0/);
  assert.match(source, /min-h-\[2rem\] min-w-0 w-full sm:flex-1/);
});
