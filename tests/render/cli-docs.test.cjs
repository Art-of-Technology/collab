const { assert, test, load } = require('../security/helpers.cjs');
const { renderToStaticMarkup } = require('react-dom/server');
const jsx = require('react/jsx-runtime');

test('docs stay readable while session or workspace loads without changing workspace loading', () => {
  let pathname = '/docs';
  let status = 'loading';
  let isLoading = true;
  const { WorkspaceLoadingWrapper: Wrapper } = load('src/components/layout/WorkspaceLoadingWrapper.tsx', {
    'react/jsx-runtime': jsx,
    '@/context/WorkspaceContext': { useWorkspace: () => ({ isLoading }) },
    'next-auth/react': { useSession: () => ({ status }) },
    'next/navigation': { usePathname: () => pathname },
    '@/components/ui/global-loading': { GlobalLoading: () => jsx.jsx('div', { children: 'Loading workspace' }) },
  });
  for (status of ['loading', 'authenticated', 'unauthenticated']) {
    for (isLoading of [true, false]) {
      for (pathname of ['/docs', '/docs/cli', '/docs/guides/create-a-seat', '/docs/notes']) {
        assert.equal(renderToStaticMarkup(Wrapper({ children: 'Documentation' })), 'Documentation');
      }
      for (pathname of ['/docs-team/dashboard', '/workspace/dashboard']) {
        const html = renderToStaticMarkup(Wrapper({ children: 'Workspace page' }));
        if (status === 'loading' || (status === 'authenticated' && isLoading)) {
          assert.match(html, /Loading workspace/, `${pathname}: ${status}, loading=${isLoading}`);
        } else {
          assert.equal(html, 'Workspace page', `${pathname}: ${status}, loading=${isLoading}`);
        }
      }
    }
  }
});

test('workspace URL selection takes priority over saved workspace outside the documentation', () => {
  const docsWorkspace = { id: 'docs-workspace', slug: 'docs' };
  const savedWorkspace = { id: 'saved-workspace', slug: 'saved' };
  const teamWorkspace = { id: 'team-workspace', slug: 'docs-team' };
  let pathname = '/docs';
  let currentWorkspace = savedWorkspace;
  const stored = new Map([['currentWorkspaceId', savedWorkspace.id]]);
  const effects = [];
  const document = { cookie: '' };
  const { WorkspaceProvider } = load('src/context/WorkspaceContext.tsx', {
    react: {
      createContext: require('react').createContext,
      useState: () => [currentWorkspace, value => { currentWorkspace = value; }],
      useCallback: callback => callback,
      useEffect: callback => effects.push(callback),
    },
    'react/jsx-runtime': jsx,
    'next-auth/react': { useSession: () => ({ data: { user: { id: 'user' } }, status: 'authenticated' }) },
    'next/navigation': { usePathname: () => pathname, useRouter: () => ({}) },
    '@/hooks/queries/useWorkspace': { useWorkspaces: () => ({ data: [docsWorkspace, savedWorkspace, teamWorkspace], isLoading: false }) },
  }, {
    localStorage: { getItem: key => stored.get(key), setItem: (key, value) => stored.set(key, value) },
    document,
    window: { location: { protocol: 'https:' } },
  });
  for (const [route, expected] of [
    ['/docs', savedWorkspace],
    ['/docs/cli', savedWorkspace],
    // Every address under /docs is a documentation page, never a workspace's.
    ['/docs/guides/create-a-seat', savedWorkspace],
    ['/docs/notes', savedWorkspace],
    ['/docs-workspace/notes', docsWorkspace],
    ['/docs-team/dashboard', teamWorkspace],
    ['/saved/notes', savedWorkspace],
    ['/home', savedWorkspace],
  ]) {
    pathname = route;
    currentWorkspace = savedWorkspace;
    stored.set('currentWorkspaceId', savedWorkspace.id);
    effects.length = 0;
    WorkspaceProvider({ children: 'Workspace page' });
    for (const effect of effects.splice(0)) effect();
    const context = WorkspaceProvider({ children: 'Workspace page' }).props.value;
    assert.equal(context.currentWorkspace, expected, route);
    assert.equal(stored.get('currentWorkspaceId'), expected.id, route);
    assert.ok(document.cookie.startsWith(`currentWorkspaceId=${expected.id};`), route);
  }
});
