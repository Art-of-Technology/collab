const { assert, test, load } = require('../security/helpers.cjs');
const { JSDOM } = require('jsdom');
const React = require('react');
const { createRoot } = require('react-dom/client');
const query = require('@tanstack/react-query');

const create = React.createElement;
const work = { id: 'work', projectId: 'project', title: 'Ordinary task', priority: 'medium', agentRequestRole: null, labels: [] };
const workspace = { id: 'workspace', slug: 'workspace' };
const project = { id: 'project', name: 'Demo', slug: 'demo' };

// Opens a view whose page sent `issues` and answers the browser's list call when `answer` is called.
async function openView({ issues, filters = {} }, run) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://example.test/workspace/views/demo' });
  const globals = { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true };
  const previous = Object.fromEntries(Object.keys(globals).map(key => [key, global[key]]));
  Object.assign(global, globals);

  const root = createRoot(document.getElementById('root'));
  const client = new query.QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const view = {
    id: 'demo', slug: 'demo', name: 'Demo', type: 'USER', displayType: 'LIST', visibility: 'WORKSPACE',
    filters, projects: [project], fields: ['Priority'],
  };
  const pending = [];
  const listCalls = [];
  const fetch = async url => {
    const { pathname } = new URL(url, window.location.origin);
    if (pathname === '/api/issues') {
      listCalls.push(url);
      return new Promise(resolve => pending.push(resolve));
    }
    return Response.json(pathname.endsWith('/members') ? [] : {});
  };
  const answer = async (body = { issues: [work] }, status = 200) => {
    await React.act(async () => {
      for (const resolve of pending.splice(0)) resolve(Response.json(body, { status }));
      await new Promise(resolve => setTimeout(resolve, 0));
    });
  };

  const deps = { react: React, 'react/jsx-runtime': require('react/jsx-runtime') };
  const queryDeps = { ...deps, '@tanstack/react-query': query };
  const noop = () => {};
  const navigation = {
    useRouter: () => ({ replace: noop, refresh: noop }),
    usePathname: () => dom.window.location.pathname,
    useSearchParams: () => new URLSearchParams(),
  };
  const Rows = ({ issues }) => create('output', { id: 'rows' }, issues.map(issue => issue.title).join(', ') || 'No issues match your filters');
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
    '@/hooks/useViewFilterState': load('src/hooks/useViewFilterState.ts', { ...deps, 'next/navigation': navigation }, { URLSearchParams }),
    './shared/ViewTopBar': { default: () => null },
    './agent-request-display': load('src/components/views/agent-request-display.ts'),
    './renderers/KanbanViewRenderer': { default: Rows },
    './renderers/ListViewRenderer': { default: Rows },
    './renderers/TableViewRenderer': {},
    './renderers/TimelineViewRenderer': {},
    './renderers/PlanningViewRenderer': {},
  }, { fetch, URLSearchParams });

  try {
    await React.act(async () => {
      root.render(create(query.QueryClientProvider, { client }, create(ViewRenderer, {
        view, workspace, currentUser: { id: 'member' }, issues, initialIncludesRequests: false,
      })));
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    await run({
      answer,
      listCalls,
      rows: () => document.getElementById('rows')?.textContent ?? null,
      loading: () => document.querySelector('[role="status"][aria-label="Loading issues"]'),
    });
  } finally {
    await React.act(async () => root.unmount());
    client.clear();
    dom.window.close();
    Object.assign(global, previous);
  }
}

test('a view whose page sent no rows shows that its issues are loading, not that there are none', async () => {
  await openView({ issues: [] }, async ({ answer, listCalls, rows, loading }) => {
    assert.equal(listCalls.length, 1, 'The browser asks for the list once');
    assert.ok(loading(), 'Expected a loading state while the list call is out');
    assert.equal(rows(), null, 'No empty list is shown while the list call is out');

    await answer();
    assert.equal(loading(), null);
    assert.equal(rows(), 'Ordinary task');
  });
});

test('a view whose list call fails does not stay loading', async () => {
  await openView({ issues: [] }, async ({ answer, listCalls, rows, loading }) => {
    assert.ok(loading());
    await answer({ error: 'unavailable' }, 500);
    // The list hook asks once more after a failure, about a second later.
    await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 1200)); });
    assert.equal(listCalls.length, 2);
    await answer({ error: 'unavailable' }, 500);
    assert.equal(loading(), null);
    assert.equal(rows(), 'No issues match your filters');
  });
});

test('a view with saved filters shows the rows its page sent straight away', async () => {
  await openView({ issues: [work], filters: { priority: ['medium'] } }, async ({ listCalls, rows, loading }) => {
    assert.equal(listCalls.length, 0, 'The saved filters were applied on the server, so no list call is made');
    assert.equal(loading(), null);
    assert.equal(rows(), 'Ordinary task');
  });
});
