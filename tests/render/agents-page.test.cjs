const { assert, test, load } = require('../security/helpers.cjs');
const React = require('react');
const jsx = require('react/jsx-runtime');
const { renderToStaticMarkup } = require('react-dom/server');

const Empty = () => null;
const link = { default: ({ children, ...props }) => React.createElement('a', props, children) };
const text = html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

function sidebar(waiting, { views = [], apps = [] } = {}) {
  return load('src/components/layout/SimplifiedSidebar.tsx', {
    react: React, 'react/jsx-runtime': jsx, 'next/link': link, 'next/image': require('next/image'),
    'next/navigation': { useRouter: () => ({}) }, 'lucide-react': require('lucide-react'),
    '@/lib/sign-out': { signOutCurrentSession: () => { throw new Error('Unexpected sign out'); } },
    '@/components/ui/button': { Button: ({ children, variant: _variant, size: _size, ...props }) => React.createElement('button', props, children) },
    '@/components/ui/input': { Input: Empty }, '@/components/ui/scroll-area': { ScrollArea: Empty },
    '@/components/ui/dropdown-menu': Object.fromEntries(['DropdownMenu', 'DropdownMenuContent', 'DropdownMenuItem', 'DropdownMenuSeparator', 'DropdownMenuTrigger'].map(name => [name, Empty])),
    '@/components/ui/user-avatar': { UserAvatar: Empty },
    '@/hooks/queries/useUser': { useCurrentUser: () => ({ data: { name: 'Cem' } }) },
    '@/context/WorkspaceContext': { useWorkspace: () => ({ currentWorkspace: { id: 'workspace', slug: 'weezboo' } }) },
    '@/hooks/queries/useProjects': { useProjects: () => ({ data: [] }) },
    '@/hooks/queries/useViews': { useViews: () => ({ data: views }) },
    '@/hooks/queries/useInstalledApps': { useInstalledApps: () => ({ data: apps }) },
    '@/hooks/queries/useSeatsWaiting': { useSeatsWaiting: workspaceId => { assert.equal(workspaceId, 'workspace'); return { data: waiting }; } },
    '@/hooks/useAI': { useAIWidget: () => ({}), useAIAgents: () => ({}) },
    '@/lib/utils': { cn: (...args) => args.filter(Boolean).join(' ') },
    '@/hooks/use-toast': { useToast: () => ({}) },
    '@/components/workspace/WorkspaceSelector': { default: Empty },
    '@/components/modals/CreateViewModal': { default: Empty }, '@/components/modals/CreateProjectModal': { default: Empty },
    '@/components/layout/sidebar/NotificationPopover': { default: Empty },
  }).default;
}
const menu = (waiting, props) => renderToStaticMarkup(React.createElement(sidebar(waiting), props));

test('the left menu has an Agents group with Seats, Seat inbox and Floor where "Agent inbox" was', () => {
  const html = menu(3, { pathname: '/weezboo/agents/inbox' });
  assert.doesNotMatch(html, /Agent inbox/);
  for (const [name, href] of [['Agents', '/weezboo/agents'], ['Seats', '/weezboo/agents'], ['Seat inbox', '/weezboo/agents/inbox'], ['Floor', '/weezboo/agents/floor']]) {
    assert.match(html, new RegExp(`<a[^>]*href="${href}"[^>]*>(<svg.*?</svg>)?<span[^>]*>${name}</span>`), name);
  }
  // The group is the first line, opens and closes with its own button, and marks the tab being read.
  assert.ok(html.indexOf('>Agents<') < html.indexOf('>Home<'));
  assert.match(html, /<button[^>]*aria-label="Toggle agents menu"[^>]*aria-expanded="true"[^>]*aria-controls="sidebar-agents"/);
  assert.match(html, /<a[^>]*href="\/weezboo\/agents\/inbox"[^>]*aria-current="page"/);
  assert.doesNotMatch(html, /<a[^>]*href="\/weezboo\/agents"[^>]*aria-current="page"/);
  // The number is on the Seat inbox line only.
  assert.match(text(html), /Agents Seats Seat inbox 3 Floor Home/);
});

test('the number is hidden at zero and capped at 9+; the old handoff inbox still counts as the Agents section', () => {
  assert.match(text(menu(0, { pathname: '/weezboo/dashboard' })), /Seat inbox Floor Home/);
  assert.match(text(menu(12, { pathname: '/weezboo/dashboard' })), /Seat inbox 9\+ Floor/);
  assert.match(menu(0, { pathname: '/weezboo/agent-inbox' }), /<a[^>]*href="\/weezboo\/agents"[^>]*class="[^"]*bg-collab-800 text-white/);
  assert.doesNotMatch(menu(0, { pathname: '/weezboo/projects/agents' }), /<a[^>]*href="\/weezboo\/agents"[^>]*class="[^"]*bg-collab-800 text-white/);
});

test('the collapsed menu shows one Agents icon with the number', () => {
  const html = menu(4, { pathname: '/weezboo/agents', isCollapsed: true });
  assert.equal(html.match(/href="\/weezboo\/agents/g).length, 1);
  assert.match(html, /<a[^>]*href="\/weezboo\/agents"[^>]*title="Agents"[^>]*>.*?<span[^>]*>4<\/span><\/a>/);
  assert.doesNotMatch(html, /Seat inbox|agent-inbox/);
  assert.doesNotMatch(menu(0, { isCollapsed: true }), /<a[^>]*title="Agents"[^>]*>.*?<span/);
});

test('sidebar highlights only the current workspace section and matching item', () => {
  const data = { views: [{ id: 'v', slug: 'report', name: 'Report', isFavorite: true }], apps: [{ id: 'a', app: { slug: 'tool', name: 'Tool' } }] };
  const render = (pathname, isCollapsed = false) => renderToStaticMarkup(React.createElement(sidebar(0, data), { pathname, isCollapsed }));
  const active = (html, href) => {
    const link = [...html.matchAll(new RegExp(`<a\\s[^>]*href="${href}"[^>]*class="[^"]*"[^>]*>`, 'g'))].at(-1);
    assert.ok(link, href);
    const classes = link[0].match(/class="([^"]*)"/)[1].split(/\s+/);
    return classes.includes('bg-collab-800') && classes.includes('text-white');
  };
  for (const [path, selected] of [['projects/timeline', 'projects'], ['dashboard/detail', 'dashboard'], ['timeline/detail', 'timeline'], ['notes/detail', 'notes'], ['features/detail', 'features']]) {
    for (const collapsed of [false, true]) {
      const html = render(`/weezboo/${path}`, collapsed);
      for (const section of ['dashboard', 'timeline', 'notes', 'features']) assert.equal(active(html, `/weezboo/${section}`), section === selected, `${path}: ${section}`);
      if (!collapsed) assert.equal(active(html, '/weezboo/projects'), selected === 'projects');
    }
  }
  assert.equal(active(render('/weezboo/projects-extra'), '/weezboo/projects'), false);
  for (const [path, href, expected] of [['views/report/detail', '/weezboo/views/report', true], ['views/reporting', '/weezboo/views/report', false], ['projects/views/report', '/weezboo/views/report', false], ['apps/tool/detail', '/weezboo/apps/tool', true], ['apps/toolbox', '/weezboo/apps/tool', false], ['projects/apps/tool', '/weezboo/apps/tool', false]]) {
    assert.equal(active(render(`/weezboo/${path}`), href), expected, path);
  }
});

test('the phone menu has the same Agents entry', () => {
  const pushed = [];
  const pass = ({ children }) => children;
  const plain = tag => ({ children, initial: _i, animate: _a, transition: _t, whileTap: _w, ...props }) => React.createElement(tag, props, children);
  const { MobileBottomNav } = load('src/components/layout/MobileBottomNav.tsx', {
    react: React, 'react/jsx-runtime': jsx, 'lucide-react': require('lucide-react'),
    'framer-motion': { motion: { div: plain('div'), button: plain('button') }, AnimatePresence: pass },
    '@/lib/utils': { cn: (...args) => args.filter(Boolean).join(' ') },
    '@/components/ui/tooltip': { Tooltip: pass, TooltipProvider: pass, TooltipTrigger: pass, TooltipContent: ({ children }) => React.createElement('span', { 'data-tip': '' }, children) },
    '@/context/WorkspaceContext': { useWorkspace: () => ({ currentWorkspace: { id: 'workspace', slug: 'weezboo' } }) },
    '@/components/providers/SidebarProvider': { useSidebar: () => ({}) },
    '@/context/AIContext': { useAI: () => ({}) },
    'next/navigation': { useRouter: () => ({ push: href => pushed.push(href) }), usePathname: () => '/weezboo/agent-inbox' },
  });
  const html = renderToStaticMarkup(React.createElement(MobileBottomNav));
  // Marked as the current section on the old handoff inbox too.
  assert.match(html, /<button class="[^"]*ring-1[^"]*">(?:(?!<button).)*<span data-tip=""><div[^>]*>Agents<\/div>/);
});

test('"Handoffs (old)" is a tab only while a project still uses handoffs', () => {
  const { AgentsTabs } = load('src/components/agents/AgentsTabs.tsx', { 'react/jsx-runtime': jsx, 'next/link': link });
  const tabs = props => renderToStaticMarkup(React.createElement(AgentsTabs, { base: '/team', ...props }));
  const mixed = tabs({ current: 'inbox', handoffs: true });
  assert.match(text(mixed), /Agents Seats Inbox Floor Handoffs \(old\)/);
  assert.match(mixed, /<a[^>]*href="\/team\/agent-inbox"[^>]*>Handoffs \(old\)<\/a>/);
  assert.match(mixed, /<a[^>]*aria-current="page"[^>]*>Inbox<\/a>/);
  for (const [name, href] of [['Seats', '/team/agents'], ['Inbox', '/team/agents/inbox'], ['Floor', '/team/agents/floor']]) assert.match(mixed, new RegExp(`<a[^>]*href="${href}"[^>]*>${name}</a>`));
  const switched = tabs({ current: 'seats', handoffs: false });
  assert.match(text(switched), /Agents Seats Inbox Floor $/);
  assert.doesNotMatch(switched, /Handoffs|agent-inbox/);
});

const seats = [
  { id: 'seat-dev', name: 'Collab Developer', role: 'developer', isDefault: true, project: 'Collab',
    working: [{ id: 'run-1', issueKey: 'CLB-9', title: 'Being worked', since: '2026-11-16T10:00:00.000Z', lost: false }],
    waiting: [{ issueId: 'i1', issueKey: 'CLB-1', title: '<b>First</b>', priority: 'high', category: 'todo', reason: 'resume', lastRunAt: null }] },
  { id: 'seat-rel', name: 'Collab Release', role: 'release', isDefault: true, project: 'Collab', working: [], waiting: [] },
];
function page({ user = 'alice', view = { workspace: { id: 'ws', slug: 'team' }, seats }, handoffs = false, manage = false } = {}) {
  const calls = [];
  const tabs = load('src/components/agents/AgentsTabs.tsx', { 'react/jsx-runtime': jsx, 'next/link': link });
  const Page = load('src/app/(main)/[workspaceId]/agents/[[...tab]]/page.tsx', {
    'react/jsx-runtime': jsx,
    'next/navigation': { redirect: path => { throw new Error(`redirect:${path}`); }, notFound: () => { throw new Error('404'); } },
    '@/lib/request-session': { getServerSession: async () => user ? { user: { id: user } } : null },
    '@/lib/auth': { authOptions: {} },
    '@/lib/permissions': { Permission: { MANAGE_WORKSPACE_PERMISSIONS: 'manage' }, checkUserPermission: async (userId, workspaceId, permission) => {
      assert.deepEqual([userId, workspaceId, permission], ['alice', 'ws', 'manage']); return { hasPermission: manage };
    } },
    '@/lib/agents-page': { usesHandoffs: async workspaceId => { assert.equal(workspaceId, 'ws'); return handoffs; },
      readSeats: async (userId, workspaceId) => { calls.push('seats'); assert.deepEqual([userId, workspaceId], ['alice', 'team']); return view; } },
    '@/lib/agent-floor': { readAgentFloor: async (userId, workspaceId) => { calls.push('floor'); assert.deepEqual([userId, workspaceId], ['alice', 'team']); return view && { workspace: { ...view.workspace, name: 'Team' } }; } },
    '@/components/agents/AgentsTabs': tabs,
    '@/components/agents/AgentSeatsView': load('src/components/agents/AgentSeatsView.tsx', { 'react/jsx-runtime': jsx, 'next/link': link,
      '@/components/ui/button': { Button: ({ children }) => children }, '@/components/agents/AgentsTabs': tabs }),
    '@/components/agents/floor/OrganisationFloor': { OrganisationFloor: ({ initial }) => React.createElement('section', null, `Floor of ${initial.workspace.name}`) },
  }).default;
  return { calls, open: async (...tab) => renderToStaticMarkup(await Page({ params: Promise.resolve({ workspaceId: 'team', ...(tab.length && { tab }) }) })) };
}

test('the Agents page reads nothing for a visitor, a stranger to the workspace or an unknown tab', async () => {
  for (const [options, tab, error] of [[{ user: null }, [], /redirect:\/login/], [{ view: null }, [], /404/], [{ view: null }, ['inbox'], /404/], [{ view: null }, ['floor'], /404/]]) {
    await assert.rejects(page(options).open(...tab), error);
  }
  for (const tab of [['handoffs'], ['seats'], ['seats', 'extra'], ['inbox', 'x'], ['floor', 'x']]) {
    const f = page(); await assert.rejects(f.open(...tab), /404/); assert.deepEqual(f.calls, []);
  }
  const anonymous = page({ user: null }); await assert.rejects(anonymous.open('floor'), /redirect:\/login/); assert.deepEqual(anonymous.calls, []);
});

test('Seats tab: each seat with its role, project, what it works on now and how many issues wait', async () => {
  const html = await page().open();
  assert.match(html, /<a[^>]*aria-current="page"[^>]*>Seats<\/a>/);
  assert.match(text(html), /Collab Developer Default for its role developer Collab CLB-9 Being worked 1 Collab Release Default for its role release Collab Nothing 0/);
  assert.match(html, /href="\/team\/issues\/CLB-9"/);
  assert.match(html, /<a[^>]*href="\/team\/agents\/inbox#seat-seat-dev"[^>]*>1<\/a>/);
  // Creating and retiring stays under Settings, and only who may do it is led there.
  assert.doesNotMatch(html, /settings\/agent-tokens|Handoffs/);
  assert.match(await page({ manage: true, handoffs: true }).open(), /href="\/workspaces\/ws\/settings\/agent-tokens"[^>]*>Create or retire a seat<.*Handoffs \(old\)|Handoffs \(old\).*href="\/workspaces\/ws\/settings\/agent-tokens"/s);
  // A lost run stays open while the seat works the next issue: both are shown, the lost one with what to do.
  const lost = await page({ view: { workspace: { id: 'ws', slug: null }, seats: [{ ...seats[0], working: [{ ...seats[0].working[0], id: 'run-2', issueKey: 'CLB-12', title: 'Next' }, { ...seats[0].working[0], lost: true }] }] } }).open();
  assert.match(text(lost), /CLB-12 Next CLB-9 Being worked The run is lost: clear it on the issue&#x27;s Activity tab\. 1 /); assert.match(lost, /href="\/ws\/issues\/CLB-9"/);
  assert.match(await page({ view: { workspace: { id: 'ws', slug: 'team' }, seats: [] } }).open(), /No seats in the projects you can read/);
});

test('Inbox tab: per seat, the issues that wait for it, with the reason and without running their text', async () => {
  const html = await page().open('inbox');
  assert.match(html, /<a[^>]*aria-current="page"[^>]*>Inbox<\/a>/);
  assert.match(html, /<section id="seat-seat-dev"[^>]*>.*?href="\/team\/issues\/CLB-1"[^>]*>CLB-1 &lt;b&gt;First&lt;\/b&gt;<\/a>.*?To resume.*?high.*?<\/section>/s);
  assert.match(html, /<section id="seat-seat-rel"[^>]*>.*?0 waiting.*?Nothing waits for this seat\./s);
  assert.doesNotMatch(html, /<b>First/);
});

test('Floor tab: the existing floor under the same tabs; its old address leads there', async () => {
  const f = page({ handoffs: true });
  const html = await f.open('floor');
  assert.match(html, /<a[^>]*aria-current="page"[^>]*>Floor<\/a>.*Handoffs \(old\).*Floor of Team/s);
  assert.deepEqual(f.calls, ['floor']);
  const Old = load('src/app/(main)/[workspaceId]/agent-inbox/floor/page.tsx', { 'next/navigation': { redirect: path => { throw new Error(`redirect:${path}`); } } }).default;
  await assert.rejects(Old({ params: Promise.resolve({ workspaceId: 'team' }) }), { message: 'redirect:/team/agents/floor' });
});

test('the menu is told the page being read, not only the workspace the layout knows', () => {
  const seen = [];
  const Layout = load('src/components/layout/LayoutWithSidebar.tsx', {
    react: React, 'react/jsx-runtime': jsx,
    'next/navigation': { usePathname: () => '/weezboo/agents/inbox' },
    '@/components/layout/SimplifiedSidebar': { default: ({ pathname }) => { seen.push(pathname); return null; } },
    '@/components/providers/SidebarProvider': { useSidebar: () => ({ isMdUp: true }) },
    '@/context/AIContext': { AIProvider: ({ children }) => children },
    '@heroicons/react/24/outline': { ChevronLeftIcon: Empty, ChevronRightIcon: Empty },
    '@/components/ui/button': { Button: Empty }, '@/components/layout/MobileBottomNav': { MobileBottomNav: Empty }, '@/components/ai/ChatBar': { ChatBar: Empty },
  }).default;
  renderToStaticMarkup(React.createElement(Layout, { pathname: '/weezboo' }, 'page'));
  assert.deepEqual(seen, ['/weezboo/agents/inbox', '/weezboo/agents/inbox']);
});
