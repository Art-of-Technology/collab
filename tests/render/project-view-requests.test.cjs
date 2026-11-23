const { assert, test, load } = require('../security/helpers.cjs');
const { JSDOM } = require('jsdom');
const React = require('react');
const { createRoot } = require('react-dom/client');
const query = require('@tanstack/react-query');

const create = React.createElement;
const work = { id: 'work', projectId: 'project', title: 'Ordinary task', agentRequestRole: null, labels: [] };
const request = {
  ...work, id: 'request', projectId: 'added', title: 'Review request', agentRequestRole: 'review',
  labels: [{ id: 'reviews', name: 'Reviews' }],
};
const workspace = { id: 'workspace', slug: 'workspace' };

async function withView(run, viewOverrides = {}) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://example.test/workspace/views/demo' });
  const globals = { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true };
  const previous = Object.fromEntries(Object.keys(globals).map(key => [key, global[key]]));
  Object.assign(global, globals);

  const root = createRoot(document.getElementById('root'));
  const client = new query.QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const project = { id: 'project', name: 'Demo', slug: 'demo' };
  const addedProject = { id: 'added', name: 'Added', slug: 'added' };
  const pathname = dom.window.location.pathname;
  let view = {
    id: 'demo', name: 'Demo', type: 'USER', displayType: 'LIST', visibility: 'WORKSPACE',
    filters: {}, projects: [project], fields: ['Priority'], ...viewOverrides,
  };
  let params = new URLSearchParams();
  let renderKey = 'view';
  let initialIssues = [work];
  let initialIncludesRequests = false;
  let retainBoardRows = false;
  const listRequests = [];
  const saves = [];
  const fetch = async (url, options) => {
    const { pathname: path, searchParams } = new URL(url, window.location.origin);
    if (path === '/api/issues') {
      listRequests.push(searchParams);
      const projects = searchParams.get('projectIds')?.split(',') || [];
      return Response.json({ issues: [work, request].filter(issue =>
        projects.includes(issue.projectId) && (issue.agentRequestRole === null || searchParams.get('requests') === '1')
      ) });
    }
    if (options?.method === 'PUT') {
      saves.push(JSON.parse(options.body));
      return Response.json({});
    }
    return Response.json(path.endsWith('/members') ? [] : {});
  };

  const deps = { react: React, 'react/jsx-runtime': require('react/jsx-runtime') };
  const DropdownContext = React.createContext(null);
  const DropdownMenu = ({ open, onOpenChange, children }) => create(DropdownContext.Provider, {
    value: { open, onOpenChange },
  }, children);
  const DropdownMenuTrigger = ({ children }) => {
    const { open, onOpenChange } = React.useContext(DropdownContext);
    return React.cloneElement(children, { onClick: () => onOpenChange(!open) });
  };
  const DropdownMenuContent = ({ children }) => React.useContext(DropdownContext).open ? children : null;
  const Pass = ({ children }) => children;
  const Rows = ({ issues }) => create('output', { id: 'rows' }, issues.map(issue => issue.title).join(', '));
  const BoardRows = ({ issues }) => {
    const [rows, setRows] = React.useState(issues);
    React.useEffect(() => {
      if (!retainBoardRows) setRows(issues);
    }, [issues]);
    return create(Rows, { issues: rows });
  };
  const noop = () => {};
  const router = {
    replace(url) {
      params = new URL(url, window.location.origin).searchParams;
      render();
    },
    refresh: noop,
  };
  const navigation = { useRouter: () => router, usePathname: () => pathname, useSearchParams: () => params };
  const queryDeps = { ...deps, '@tanstack/react-query': query };
  const utils = { cn: () => '' };
  const { default: ViewTopBar } = load('src/components/views/shared/ViewTopBar.tsx', {
    ...queryDeps,
    'next/link': { default: 'a' },
    'motion/react': { motion: new Proxy({}, { get: () => Pass }), AnimatePresence: Pass },
    'lucide-react': require('lucide-react'),
    '@/lib/utils': utils,
    '@/actions/status': { getProjectStatuses: async () => [] },
    '@/components/ui/dropdown-menu': {
      DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
      DropdownMenuItem: Pass, DropdownMenuSub: Pass, DropdownMenuSubTrigger: Pass,
      DropdownMenuSubContent: () => null, DropdownMenuPortal: Pass, DropdownMenuSeparator: () => null,
    },
    '@/components/ui/input': { Input: 'input' },
    '@/components/ui/button': { Button: ({ children, onClick }) => create('button', { onClick }, children) },
    '@/components/ui/switch': load('src/components/ui/switch.tsx', {
      ...deps, '@/lib/utils': utils, '@radix-ui/react-switch': require('@radix-ui/react-switch'),
    }),
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
    '@/hooks/queries/useProjects': { useProjects: () => ({ data: [project, addedProject] }) },
    '@/hooks/queries/useIssues': load('src/hooks/queries/useIssues.ts', queryDeps, { fetch, URLSearchParams }),
    '@/hooks/useRealtimeWorkspaceEvents': { useRealtimeWorkspaceEvents: noop },
    '@/lib/featureFlags': {},
    '@/components/issue': {},
    '@/hooks/useActionFilteredIssues': load('src/hooks/useActionFilteredIssues.ts', deps),
    '@/hooks/useViewFilterState': load('src/hooks/useViewFilterState.ts', { ...deps, 'next/navigation': navigation }, { URLSearchParams }),
    './shared/ViewTopBar': { default: ViewTopBar },
    './agent-request-display': load('src/components/views/agent-request-display.ts'),
    './renderers/KanbanViewRenderer': { default: BoardRows },
    './renderers/ListViewRenderer': { default: Rows },
    './renderers/TableViewRenderer': {},
    './renderers/TimelineViewRenderer': {},
    './renderers/PlanningViewRenderer': {},
  }, { fetch, URLSearchParams });

  function render() {
    root.render(create(query.QueryClientProvider, { client }, create(ViewRenderer, {
      key: renderKey, view, workspace, currentUser: { id: 'member' }, issues: initialIssues, initialIncludesRequests,
    })));
  }
  const click = async label => {
    const button = [...document.querySelectorAll('button')].find(element => element.textContent.trim() === label);
    assert.ok(button, `Expected ${label} button`);
    await React.act(async () => button.click());
  };
  const control = () => [...document.querySelectorAll('[role="switch"]')].find(element =>
    element.getAttribute('aria-label') === 'Agent requests' ||
    document.getElementById(element.getAttribute('aria-labelledby'))?.textContent === 'Agent requests'
  );
  const toggle = async () => {
    assert.ok(control(), 'Expected Agent requests switch');
    await React.act(async () => control().click());
  };
  const rows = () => document.getElementById('rows').textContent;
  const settle = async () => {
    await React.act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });
  };
  const reload = async () => {
    view = { ...view, ...saves.at(-1) };
    initialIncludesRequests = view.fields.includes('Agent requests');
    initialIssues = initialIncludesRequests ? [work, request] : [work];
    params = new URLSearchParams();
    renderKey += '-reloaded';
    await React.act(async () => render());
  };

  try {
    await React.act(async () => render());
    await settle();
    await click('Display');
    await run({
      control, toggle, rows, listRequests, saves, click, settle, reload,
      savedView: () => ({ ...view, ...saves.at(-1) }),
      retainBoardRows: () => { retainBoardRows = true; },
    });
  } finally {
    await React.act(async () => root.unmount());
    client.clear();
    dom.window.close();
    Object.assign(global, previous);
  }
}

test('the Display menu has an Agent requests switch, off by default', async () => {
  await withView(async ({ control, rows, listRequests }) => {
    assert.ok(control(), 'Expected Agent requests switch in Display');
    assert.equal(control().getAttribute('aria-checked'), 'false');
    assert.equal(rows(), 'Ordinary task');
    assert.ok(listRequests.length > 0);
    assert.ok(listRequests.every(params => !params.has('requests')));
  });
});

test('switched on, the view asks for requests too', async () => {
  await withView(async ({ control, toggle, rows, listRequests, saves, click, settle, reload, retainBoardRows }) => {
    // A saved request-label filter still cannot show requests by itself.
    assert.equal(rows(), '');
    await click('Added');
    await settle();
    assert.equal(rows(), '');

    await toggle();
    await settle();
    assert.equal(control().getAttribute('aria-checked'), 'true');
    assert.ok(listRequests.some(params => params.get('projectIds') === 'added' && params.get('requests') === '1'));
    assert.ok(listRequests.some(params => params.get('projectIds') === 'project,added' && params.get('requests') === '1'));
    assert.equal(rows(), 'Review request');

    await click('Set default');
    assert.deepEqual(saves.at(-1).fields, ['Priority', 'Agent requests']);
    await reload();
    await click('Display');
    assert.equal(control().getAttribute('aria-checked'), 'true');
    assert.equal(rows(), 'Review request');

    // Kanban keeps optimistic rows during an in-flight drag save.
    retainBoardRows();
    await toggle();
    assert.equal(control().getAttribute('aria-checked'), 'false');
    assert.equal(rows(), '');
    await settle();
    assert.equal(rows(), '');
    await click('Set default');
    assert.deepEqual(saves.at(-1).fields, ['Priority']);
  }, { filters: { labels: ['reviews'] }, displayType: 'KANBAN' });
});

for (const sorting of [{ field: 'position', direction: 'asc' }, { field: 'manual', direction: 'desc' }]) {
  test(`Set default keeps a saved ${sorting.field} ordering`, async () => {
    await withView(async ({ toggle, click, settle, reload, saves, savedView }) => {
      await toggle();
      await settle();
      await click('Set default');
      assert.equal(saves.length, 1);
      assert.deepEqual(savedView().sorting, sorting);

      await reload();
      await click('Display');
      await toggle();
      await settle();
      await click('Set default');
      assert.equal(saves.length, 2);
      assert.deepEqual(savedView().sorting, sorting);
    }, { sorting, displayType: 'KANBAN' });
  });
}
