const { assert, test, load } = require('../security/helpers.cjs');
const { JSDOM } = require('jsdom');
// React DOM decides at load whether the page has input events, so a window exists before it loads.
const loadWindow = new JSDOM('').window;
Object.assign(global, { window: loadWindow, document: loadWindow.document });
const React = require('react');
const { createRoot } = require('react-dom/client');
const query = require('@tanstack/react-query');

const create = React.createElement;
const issue = (id, title) => ({ id, projectId: 'project', title, agentRequestRole: null, labels: [] });
const issues = [issue('one', 'Internationalisation migration'), issue('two', 'Board colours')];
const workspace = { id: 'workspace', slug: 'workspace' };
const project = { id: 'project', name: 'Demo', slug: 'demo' };

// Renders a view as Next.js does on the client. Each router call asks the server for the view page
// again and answers slowly, as a broad view does; history.replaceState is synced into
// useSearchParams in a transition without a request, as Next.js's app router does.
async function withView(run, { address = '/workspace/views/demo' } = {}) {
  const dom = new JSDOM('<div id="root"></div>', { url: `https://example.test${address}` });
  const globals = { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true };
  const previous = Object.fromEntries(Object.keys(globals).map(key => [key, global[key]]));
  Object.assign(global, globals);

  const root = createRoot(document.getElementById('root'));
  const client = new query.QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const view = {
    id: 'demo', name: 'Demo', type: 'USER', displayType: 'LIST', visibility: 'WORKSPACE',
    filters: {}, projects: [project], fields: ['Priority'],
  };
  const pathname = dom.window.location.pathname;
  let params = new URLSearchParams(dom.window.location.search);
  const pageRequests = [];
  const pending = [];
  const fetch = async url => {
    const { pathname: path } = new URL(url, window.location.origin);
    if (path === '/api/issues') return Response.json({ issues });
    return Response.json(path.endsWith('/members') ? [] : {});
  };

  const nativeReplaceState = dom.window.history.replaceState.bind(dom.window.history);
  // Next.js hands an address written with history.replaceState back to useSearchParams later, in a
  // transition, and writes that address again when it commits; on a slow view this lags the typing.
  const handBacks = [];
  dom.window.history.replaceState = (state, unused, url) => {
    nativeReplaceState(state, unused, url);
    handBacks.push(() => {
      nativeReplaceState(null, '', url);
      params = new URL(url, window.location.origin).searchParams;
      render();
    });
  };
  const navigate = url => {
    pageRequests.push(url);
    pending.push(() => {
      nativeReplaceState(null, '', url);
      params = new URL(url, window.location.origin).searchParams;
      render();
    });
  };
  const router = { replace: navigate, push: navigate, refresh: () => pageRequests.push('refresh') };
  const navigation = { useRouter: () => router, usePathname: () => pathname, useSearchParams: () => params };

  const deps = { react: React, 'react/jsx-runtime': require('react/jsx-runtime') };
  const queryDeps = { ...deps, '@tanstack/react-query': query };
  const Pass = ({ children }) => children;
  const Rows = ({ issues }) => create('output', { id: 'rows' }, issues.map(issue => issue.title).join(', '));
  const noop = () => {};
  const utils = { cn: () => '' };
  const { default: ViewTopBar } = load('src/components/views/shared/ViewTopBar.tsx', {
    ...queryDeps,
    'next/link': { default: 'a' },
    'motion/react': { motion: new Proxy({}, { get: () => Pass }), AnimatePresence: Pass },
    'lucide-react': require('lucide-react'),
    '@/lib/utils': utils,
    '@/actions/status': { getProjectStatuses: async () => [] },
    '@/components/ui/dropdown-menu': {
      DropdownMenu: Pass, DropdownMenuTrigger: Pass, DropdownMenuContent: () => null,
      DropdownMenuItem: Pass, DropdownMenuSub: Pass, DropdownMenuSubTrigger: Pass,
      DropdownMenuSubContent: () => null, DropdownMenuPortal: Pass, DropdownMenuSeparator: () => null,
    },
    '@/components/ui/input': { Input: props => create('input', { ...props, autoFocus: undefined }) },
    '@/components/ui/button': { Button: ({ children, onClick }) => create('button', { onClick }, children) },
    '@/components/ui/switch': { Switch: () => null },
    './FilterChip': load('src/components/views/shared/FilterChip.tsx', {
      ...deps, '@/lib/utils': utils, 'lucide-react': require('lucide-react'),
    }),
  }, { window });
  const { default: ViewRenderer } = load('src/components/views/ViewRenderer.tsx', {
    ...queryDeps,
    'lucide-react': require('lucide-react'),
    'next/navigation': navigation,
    '@/components/ui/button': {},
    '@/components/ui/dialog': {},
    '@/components/ui/input': {},
    '@/hooks/use-toast': { useToast: () => ({ toast: noop }) },
    '@/hooks/queries/useViewPositions': { useViewPositions: () => ({}), mergeIssuesWithViewPositions: issues => issues },
    '@/hooks/queries/useProjects': { useProjects: () => ({ data: [project] }) },
    '@/hooks/queries/useIssues': load('src/hooks/queries/useIssues.ts', queryDeps, { fetch, URLSearchParams }),
    '@/hooks/useRealtimeWorkspaceEvents': { useRealtimeWorkspaceEvents: noop },
    '@/lib/featureFlags': {},
    '@/components/issue': {},
    '@/hooks/useActionFilteredIssues': load('src/hooks/useActionFilteredIssues.ts', deps),
    '@/hooks/useViewFilterState': load('src/hooks/useViewFilterState.ts', { ...deps, 'next/navigation': navigation }, { URLSearchParams, window }),
    './shared/ViewTopBar': { default: ViewTopBar },
    './agent-request-display': load('src/components/views/agent-request-display.ts'),
    './renderers/KanbanViewRenderer': {},
    './renderers/ListViewRenderer': { default: Rows },
    './renderers/TableViewRenderer': {},
    './renderers/TimelineViewRenderer': {},
    './renderers/PlanningViewRenderer': {},
  }, { fetch, URLSearchParams });

  function render() {
    root.render(create(query.QueryClientProvider, { client }, create(ViewRenderer, {
      view, workspace, currentUser: { id: 'member' }, issues, initialIncludesRequests: false,
    })));
  }
  const handBackOne = async () => React.act(async () => handBacks.shift()());
  const settle = async () => {
    while (handBacks.length) await handBackOne();
    await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  };
  const box = () => document.querySelector('input[placeholder="Search issues..."]');
  const openBox = async () => {
    if (box()) return;
    const toggle = [...document.querySelectorAll('button')].find(button =>
      button.querySelector('svg') && button.textContent.trim() === '' && button.className.includes('h-7 w-7'));
    assert.ok(toggle, 'Expected the search toggle');
    await React.act(async () => toggle.click());
    assert.ok(box(), 'Expected the search box');
  };
  const typeLetter = async letter => {
    const input = box();
    const setValue = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set;
    await React.act(async () => {
      setValue.call(input, input.value + letter);
      input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    });
  };
  // The server answers every page request it was asked for, in order.
  const answerServer = async () => {
    while (pending.length) await React.act(async () => pending.shift()());
    await settle();
  };
  const rows = () => document.getElementById('rows').textContent;
  const addressSearch = () => new URLSearchParams(dom.window.location.search).get('search');

  try {
    await React.act(async () => render());
    await settle();
    await run({ box, openBox, typeLetter, answerServer, settle, rows, addressSearch, pageRequests, navigate, handBacks, handBackOne });
  } finally {
    await React.act(async () => root.unmount());
    client.clear();
    dom.window.close();
    Object.assign(global, previous);
  }
}

test('typing a word into the search box asks the server for no view page and shows each letter at once', async () => {
  await withView(async ({ box, openBox, typeLetter, settle, answerServer, rows, addressSearch, pageRequests, handBacks, handBackOne }) => {
    await openBox();
    const word = 'internationa';
    const shown = [];
    for (const letter of word) {
      await typeLetter(letter);
      shown.push(box().value);
    }
    assert.equal(pageRequests.length, 0, `typing ${word.length} letters asked for the view page ${pageRequests.length} times`);
    assert.deepEqual(shown, [...word].map((_, index) => word.slice(0, index + 1)), 'the box shows each letter before any server answer');
    // The addresses of earlier letters arrive late and must not take letters out of the box.
    while (handBacks.length) {
      await handBackOne();
      assert.equal(box().value, word);
    }
    await settle();
    await answerServer();
    assert.equal(box().value, word);
    assert.equal(addressSearch(), word, 'the address keeps the search so it can be shared');
    assert.equal(rows(), 'Internationalisation migration');
  });
});

test('a search in the address when the page opens fills the box and filters the view', async () => {
  await withView(async ({ box, rows, pageRequests }) => {
    assert.equal(box()?.value, 'board');
    assert.equal(rows(), 'Board colours');
    assert.equal(pageRequests.length, 0);
  }, { address: '/workspace/views/demo?search=board' });
});

test('a search changed by the address from elsewhere replaces the text in the box', async () => {
  await withView(async ({ box, openBox, typeLetter, settle, navigate, answerServer, rows, addressSearch }) => {
    await openBox();
    for (const letter of 'board') await typeLetter(letter);
    await settle();
    assert.equal(rows(), 'Board colours');

    navigate('/workspace/views/demo?search=migration');
    await answerServer();
    assert.equal(box().value, 'migration');
    assert.equal(rows(), 'Internationalisation migration');

    navigate('/workspace/views/demo');
    await answerServer();
    assert.equal(addressSearch(), null);
    assert.equal(rows(), 'Internationalisation migration, Board colours');
  }, { address: '/workspace/views/demo' });
});

test('choosing a scope while the address still lags the typing keeps the search', async () => {
  await withView(async ({ box, openBox, typeLetter, handBacks, handBackOne, answerServer, settle, addressSearch, pageRequests }) => {
    await openBox();
    for (const letter of 'board') await typeLetter(letter);
    const backlog = [...document.querySelectorAll('button')].find(button => button.textContent.trim().startsWith('Backlog'));
    assert.ok(backlog, 'Expected the Backlog scope');
    await React.act(async () => backlog.click());
    assert.equal(pageRequests.length, 1, 'a scope is one request for the view page');
    assert.equal(new URL(pageRequests[0], 'https://example.test').searchParams.get('search'), 'board');
    while (handBacks.length) await handBackOne();
    await answerServer();
    await settle();
    assert.equal(box().value, 'board');
    assert.equal(addressSearch(), 'board');
    assert.equal(new URLSearchParams(window.location.search).get('scope'), 'backlog');
  });
});
