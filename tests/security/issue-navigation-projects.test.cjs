const { test, assert, load, readFileSync, ts } = require('./helpers.cjs');
const React = require('react');
const { JSDOM } = require('jsdom');

function navigation(slug, reply) {
  const calls = [];
  return { calls, ...load('src/lib/navigation-helpers.ts', {
    './client-slug-resolvers': { getWorkspaceSlug: async () => slug },
  }, { console, fetch: async url => { calls.push(url); return reply; } }) };
}

test('direct issue back navigation resolves project view even when workspace slug lookup fails', async () => {
  const nav = navigation(null, Response.json({ slug: 'buildwake-default' }));
  assert.equal(await nav.generateBackNavigationUrl('workspace-id', { projectId: 'buildwake' }), '/workspace-id/views/buildwake-default');
  assert.deepEqual(nav.calls, ['/api/projects/buildwake/default-view']);
});

test('explicit view wins and a missing default view keeps the project context', async () => {
  const nav = navigation('weezboo', new Response(null, { status: 404 }));
  const issue = { projectId: 'buildwake', project: { slug: 'buildwake' } };
  assert.equal(await nav.generateBackNavigationUrl('workspace-id', issue, 'planning'), '/weezboo/views/planning');
  assert.equal(nav.calls.length, 0);
  assert.equal(await nav.generateBackNavigationUrl('workspace-id', issue), '/weezboo/projects/buildwake');
  assert.equal(await nav.generateBackNavigationUrl('workspace-id', null), '/weezboo/views');
});

async function mounted(file, overrides, props, run) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://collab.test' });
  const originals = new Map();
  for (const [name, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  const empty = () => null;
  const container = ({ children }) => React.createElement('div', null, children);
  const button = ({ children, variant, size, ...props }) => React.createElement('button', props, children);
  const deps = Object.fromEntries(ts.preProcessFile(readFileSync(file, 'utf8')).importedFiles.map(({ fileName }) => [fileName,
    new Proxy({}, { get: (_, key) => key === '__esModule' ? false : empty })]));
  Object.assign(deps, {
    react: { ...React, default: React }, 'react/jsx-runtime': require('react/jsx-runtime'),
    'lucide-react': require('lucide-react'), 'date-fns': require('date-fns'),
    'next/link': { default: ({ children, ...props }) => React.createElement('a', props, children) },
    'next/image': { default: empty }, 'next/navigation': { useRouter: () => ({ push() {}, back() {} }) },
    '@/components/ui/button': { Button: button }, '@/components/ui/input': { Input: props => React.createElement('input', props) },
    '@/components/ui/dropdown-menu': new Proxy({}, { get: () => container }),
    '@/components/layout/PageHeader': { default: container, pageHeaderButtonStyles: {} },
    '@/lib/utils': { cn: (...parts) => parts.filter(x => typeof x === 'string').join(' ') },
    '@/hooks/use-toast': { useToast: () => ({ toast() {} }) },
    '@/context/WorkspaceContext': { useWorkspace: () => ({ currentWorkspace: { id: 'workspace', slug: 'weezboo' } }) },
    ...overrides,
  });
  const timers = new Set();
  const globals = { console, window: dom.window, document: dom.window.document,
    requestAnimationFrame: fn => fn(),
    setTimeout: (fn, delay) => { const timer = setTimeout(fn, delay); timers.add(timer); return timer; }, clearTimeout,
    fetch: async () => Response.json({ labels: [], isFollowing: false }),
  };
  const module = load(file, deps, globals);
  const Component = module.default || module.IssueDetailContent;
  const { createRoot } = require('react-dom/client');
  const root = createRoot(dom.window.document.getElementById('root'));
  const render = async updates => { Object.assign(props, updates); await React.act(async () => root.render(React.createElement(Component, props))); };
  const click = async text => {
    const target = [...dom.window.document.querySelectorAll('button')].find(x => x.textContent.trim() === text || x.getAttribute('aria-label') === text);
    assert.ok(target, text); await React.act(async () => target.click()); return target;
  };
  try { await render(); await run({ document: dom.window.document, window: dom.window, click, render }); }
  finally {
    await React.act(async () => root.unmount()); timers.forEach(clearTimeout); dom.window.close();
    for (const [name, original] of originals) { if (original) Object.defineProperty(globalThis, name, original); else delete globalThis[name]; }
  }
}

test('Projects expands, searches all projects, shows five most recently updated, and keeps full-list navigation', async () => {
  const projects = Array.from({ length: 7 }, (_, i) => ({ id: String(i), slug: `project-${i}`, name: `Project ${i}`, issuePrefix: `P${i}`, updatedAt: new Date(2026, 9, i + 1) }));
  projects.push({ id: 'archived', slug: 'archived', name: 'Archived', updatedAt: new Date(2027, 1, 1), isArchived: true });
  await mounted('src/components/layout/SimplifiedSidebar.tsx', {
    '@/hooks/queries/useProjects': { useProjects: () => ({ data: projects }) },
    '@/hooks/queries/useViews': { useViews: () => ({ data: [] }) },
    '@/hooks/queries/useInstalledApps': { useInstalledApps: () => ({ data: [] }) },
    '@/hooks/queries/useUser': { useCurrentUser: () => ({ data: {} }) },
    '@/hooks/useAI': { useAIWidget: () => ({}), useAIAgents: () => ({}) },
    '@/context/MentionContext': { useMention: () => ({ unreadCount: 0 }) },
  }, {}, async ({ document, window, click }) => {
    const links = () => [...document.querySelectorAll('#sidebar-recent-projects a')];
    assert.deepEqual(links().map(x => x.textContent), ['Project 6', 'Project 5', 'Project 4', 'Project 3', 'Project 2']);
    assert.equal(projects[0].id, '0', 'query cache order is not mutated');
    assert.equal([...document.querySelectorAll('a')].find(x => x.textContent === 'Projects').getAttribute('href'), '/weezboo/projects');
    assert.equal(document.querySelector('a[href="/weezboo/projects"] button'), null, 'project actions are not nested inside its link');
    await click('Toggle recent projects');
    assert.equal(document.querySelector('#sidebar-recent-projects'), null);
    await click('Toggle recent projects');
    const input = document.querySelector('[aria-label="Search projects"]');
    await React.act(async () => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, 'p0');
      input.dispatchEvent(new window.Event('input', { bubbles: true }));
    });
    assert.deepEqual(links().map(x => x.getAttribute('href')), ['/weezboo/projects/project-0']);
  });
});

test('issue description links remain navigable until explicit editing and switching issues returns to read mode', async () => {
  const { commentHtml } = load('src/lib/comment-html.ts', { 'isomorphic-dompurify': { default: require('isomorphic-dompurify') }, marked: require('marked') });
  const issue = { id: 'issue', issueKey: 'BW-31', title: 'Buildwake', projectId: 'buildwake', project: { name: 'Buildwake' }, description: '[Buildwake handoff](https://example.com/handoff)\n\n<script>bad()</script>', createdAt: new Date(), labels: [], comments: [] };
  await mounted('src/components/issue/IssueDetailContent.tsx', {
    'next-auth/react': { useSession: () => ({ data: { user: { id: 'user' } } }) },
    '@tanstack/react-query': { useQueryClient: () => ({}) },
    '@/hooks/queries/useIssues': { useDeleteIssue: () => ({}), useUpdateIssue: () => ({}), issueKeys: {} },
    '@/utils/html-normalizer': { normalizeDescriptionHTML: value => value },
    '@/lib/comment-html': { commentHtml },
    '@/components/RichEditor/RichTextRenderer': { RichTextRenderer: ({ content }) => React.createElement('div', { dangerouslySetInnerHTML: { __html: content } }) },
    '@/components/RichEditor/IssueRichEditor': { IssueRichEditor: React.forwardRef((props, ref) => { React.useImperativeHandle(ref, () => ({ getEditor: () => null })); return React.createElement('div', { contentEditable: true, suppressContentEditableWarning: true }, props.value); }) },
  }, { issue }, async ({ document, window, click, render }) => {
    assert.equal(!!document.querySelector('[contenteditable="true"]'), false);
    const link = document.querySelector('a[href="https://example.com/handoff"]');
    assert.ok(link); assert.equal(document.querySelector('script'), null);
    const event = new window.MouseEvent('click', { bubbles: true, cancelable: true });
    // Inspect application cancellation without letting JSDOM attempt a real navigation.
    let prevented;
    document.addEventListener('click', e => { prevented = e.defaultPrevented; e.preventDefault(); }, { once: true });
    await React.act(async () => link.dispatchEvent(event));
    assert.equal(prevented, false); assert.equal(!!document.querySelector('[contenteditable="true"]'), false);
    await click('Edit description'); assert.ok(document.querySelector('[contenteditable="true"]'));
    await click('Done'); assert.equal(!!document.querySelector('[contenteditable="true"]'), false);
    await click('Edit description'); await render({ issue: { ...issue, id: 'second', description: 'Other' } });
    assert.equal(!!document.querySelector('[contenteditable="true"]'), false);
  });
});
