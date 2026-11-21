const { assert, test, load } = require('../security/helpers.cjs');
const React = require('react');
const jsx = require('react/jsx-runtime');
const { renderToStaticMarkup } = require('react-dom/server');

test('the menu lists only installed apps that have a page to open', () => {
  const Empty = () => null;
  const { default: Sidebar } = load('src/components/layout/SimplifiedSidebar.tsx', {
    react: React,
    'react/jsx-runtime': jsx,
    'next/link': require('next/link'), 'next/image': require('next/image'),
    'next/navigation': { useRouter: () => ({}) },
    'lucide-react': require('lucide-react'),
    '@/lib/sign-out': { signOutCurrentSession: () => { throw new Error('Unexpected sign out'); } },
    '@/components/ui/button': { Button: Empty },
    '@/components/ui/input': { Input: Empty },
    '@/components/ui/scroll-area': { ScrollArea: Empty },
    '@/components/ui/dropdown-menu': Object.fromEntries(['DropdownMenu', 'DropdownMenuContent', 'DropdownMenuItem', 'DropdownMenuSeparator', 'DropdownMenuTrigger'].map(name => [name, Empty])),
    '@/components/ui/user-avatar': { UserAvatar: Empty },
    '@/hooks/queries/useUser': { useCurrentUser: () => ({ data: { name: 'Cem' } }) },
    '@/context/WorkspaceContext': { useWorkspace: () => ({ currentWorkspace: { id: 'workspace', slug: 'weezboo' } }) },
    '@/hooks/queries/useProjects': { useProjects: () => ({ data: [] }) },
    '@/hooks/queries/useViews': { useViews: () => ({ data: [] }) },
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
  const html = renderToStaticMarkup(React.createElement(Sidebar, {}));
  assert.doesNotMatch(html, /Collab CLI/);
  assert.match(html, /Apps<\/div>.*href="\/weezboo\/apps\/google-calendar-sync"/);
});

test('legacy CLI app URL redirects after existing session and membership checks; web apps still embed', async () => {
  let signedIn = true;
  let member = true;
  let appReads = 0;
  let entrypoint;
  const { default: Page } = load('src/app/(main)/[workspaceId]/apps/[slug]/page.tsx', {
    'react/jsx-runtime': jsx,
    'next/navigation': {
      notFound() { throw new Error('NOT_FOUND'); },
      redirect(url) { throw new Error(`REDIRECT:${url}`); },
    },
    '@/lib/request-session': { getServerSession: async () => signedIn ? { user: { id: 'user' } } : null },
    '@/lib/auth-options': { authOptions: {} },
    'next/image': require('next/image'),
    '@/components/apps/AppHost': { AppHost: 'app-host' },
    '@/lib/prisma': { prisma: {
      workspace: { findUnique: async () => ({ id: 'workspace', slug: 'weezboo', name: 'Weezboo' }) },
      workspaceMember: { findFirst: async () => member ? { role: 'MEMBER' } : null },
      app: { findUnique: async ({ where }) => {
        appReads++;
        return { id: 'app', slug: where.slug, name: 'App', versions: [{ manifest: { entrypoint_url: entrypoint } }], scopes: [], installations: [{ id: 'installation', status: 'ACTIVE', scopes: [] }] };
      } },
      $queryRaw: async () => [{ isSystemApp: false }],
    } },
  });
  const visit = slug => Page({ params: Promise.resolve({ workspaceId: 'weezboo', slug }) });
  await assert.rejects(visit('collab-cli'), /REDIRECT:\/docs\/cli/);
  entrypoint = 'https://calendar.example';
  const web = await visit('google-calendar-sync');
  assert.equal(web.props.children.type, 'app-host');
  assert.equal(web.props.children.props.app.entrypointUrl, entrypoint);
  appReads = 0;
  member = false;
  await assert.rejects(visit('collab-cli'), /NOT_FOUND/);
  assert.equal(appReads, 0);
  signedIn = false;
  member = true;
  await assert.rejects(visit('collab-cli'), /NOT_FOUND/);
  assert.equal(appReads, 0);
});

test('an installation has a page only when its app is published and its latest version has an entrypoint', async () => {
  const app = (id, status) => ({ id, name: id, slug: id, iconUrl: null, publisherId: 'p', permissions: null, status });
  const apps = [app('web', 'PUBLISHED'), app('retired', 'DRAFT'), app('dropped-page', 'PUBLISHED')];
  const versions = [
    { appId: 'web', createdAt: 1, manifest: { entrypoint_url: 'https://web.example' } },
    { appId: 'retired', createdAt: 1, manifest: { entrypoint_url: 'https://retired.example' } },
    { appId: 'dropped-page', createdAt: 1, manifest: { entrypoint_url: 'https://old.example' } },
    { appId: 'dropped-page', createdAt: 2, manifest: {} },
  ];
  const status = id => [...apps, app('token-registration', 'PUBLISHED')].find(a => a.id === id).status;
  const { getWorkspaceInstallations } = load('src/actions/appInstallation.ts', {
    'next/navigation': {}, zod: require('zod'), '@/lib/auth-options': {}, '@/lib/audit': {}, '@/lib/security': {}, '@/lib/permissions': {},
    '@/lib/request-session': { getServerSession: async () => ({ user: { id: 'user' } }) },
    '@/lib/prisma': { prisma: {
      workspaceMember: { findFirst: async () => ({ role: 'MEMBER' }) },
      appInstallation: { findMany: async () => apps.map(a => ({ id: `install-${a.id}`, status: 'ACTIVE', app: a })) },
      $queryRaw: async () => [app('token-registration', 'PUBLISHED')],
      appScope: { findMany: async () => [] },
      appVersion: { findMany: async ({ where, orderBy, distinct }) => {
        assert.equal(JSON.stringify([orderBy, distinct]), '[{"createdAt":"desc"},["appId"]]');
        const seen = new Set();
        return versions.filter(v => where.appId.in.includes(v.appId) && status(v.appId) === where.app.status)
          .sort((a, b) => b.createdAt - a.createdAt).filter(v => !seen.has(v.appId) && seen.add(v.appId));
      } },
    } },
  });
  const pages = Object.fromEntries((await getWorkspaceInstallations('workspace')).map(i => [i.app.slug, i.app.hasPage]));
  assert.deepEqual(pages, { web: true, retired: false, 'dropped-page': false, 'token-registration': false });
});
