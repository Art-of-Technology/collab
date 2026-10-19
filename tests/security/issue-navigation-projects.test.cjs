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
    Blob, URL, atob,
    requestAnimationFrame: fn => fn(),
    setTimeout: (fn, delay) => { const timer = setTimeout(fn, delay); timers.add(timer); return timer; }, clearTimeout,
    fetch: async () => Response.json({ labels: [], isFollowing: false }),
  };
  deps['@/components/RichEditor/RichTextRenderer'] = load('src/components/RichEditor/RichTextRenderer.tsx', deps, globals);
  const module = load(file, deps, globals);
  const Component = module.default || module.IssueDetailContent || module.RichTextRenderer;
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

test('embedded image clicks never open top-level documents while links and mentions still work', async () => {
  const { commentHtml } = load('src/lib/comment-html.ts', { 'isomorphic-dompurify': { default: require('isomorphic-dompurify') }, marked: require('marked') });
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(document.domain)</script></svg>').toString('base64');
  const sources = [`data:image/svg+xml;base64,${svg}`, `data:text/html;base64,${Buffer.from('<script>alert(1)</script>').toString('base64')}`,
    `data:image/png;base64,${svg}`, 'data:image/png;base64,%%%bad',
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGZYAAAAASUVORK5CYII=',
    'https://example.com/image.svg'];
  const content = commentHtml(sources.map(src => `<img src="${src}">`).join('') +
    '<a href="https://example.com/handoff"><img src="https://example.com/thumb.png"></a>' +
    '<span data-type="mention" data-user-id="alice">Alice</span><span data-type="issue-mention" data-issue-key="BW-31">BW-31</span>');
  await mounted('src/components/RichEditor/RichTextRenderer.tsx', {}, { content }, async ({ document, window }) => {
    const opened = [];
    window.open = (...args) => { opened.push(args[0]); return null; };
    const images = [...document.querySelectorAll('img')];
    assert.equal(images.length, sources.length + 1);
    for (const img of images.slice(0, -1)) await React.act(async () => img.click());
    assert.deepEqual(opened, []);
    let prevented;
    document.addEventListener('click', event => { prevented = event.defaultPrevented; event.preventDefault(); }, { once: true });
    await React.act(async () => images.at(-1).click());
    assert.equal(prevented, false);
    assert.deepEqual(opened, []);
    for (const mention of document.querySelectorAll('span')) await React.act(async () => mention.click());
    assert.deepEqual(opened, ['/weezboo/profile/alice', '/weezboo/issues/BW-31']);
  });
});

test('serialized preview cards and plain links survive Done, reopening and sanitization', async () => {
  const { getSchema } = require('@tiptap/core');
  const { DOMParser, DOMSerializer } = require('@tiptap/pm/model');
  const { LinkPreviewExtension } = load('src/components/RichEditor/extensions/link-preview-extension.tsx', {
    '@tiptap/core': require('@tiptap/core'), '@tiptap/react': require('@tiptap/react'),
    '@tiptap/pm/state': require('@tiptap/pm/state'), '../components/LinkPreviewCard': {},
    react: { ...React, default: React }, 'react-dom/client': { default: require('react-dom/client') },
  });
  const { commentHtml } = load('src/lib/comment-html.ts', { 'isomorphic-dompurify': { default: require('isomorphic-dompurify') }, marked: require('marked') });
  const schema = getSchema([require('@tiptap/starter-kit').default, LinkPreviewExtension]);
  const urls = ['https://example.com/handoff', '/weezboo/notes/handoff'];
  const nodes = [true, false].flatMap(showPreview => urls.map(url => schema.nodes.linkPreview.create({
    url, showPreview, preview: { title: '<img src=x onerror="bad()">', url, type: 'external' },
  })));
  const dom = new JSDOM();
  const output = dom.window.document.createElement('div');
  output.append(DOMSerializer.fromSchema(schema).serializeFragment(schema.nodes.doc.create(null, nodes).content, { document: dom.window.document }));
  const saved = output.innerHTML;
  for (const formatted of [commentHtml(saved), commentHtml('', saved)]) {
    output.innerHTML = formatted;
    assert.deepEqual([...output.querySelectorAll('a')].map(a => a.getAttribute('href')), [...urls, ...urls]);
    assert.deepEqual([...output.querySelectorAll('a')].map(a => a.textContent), [...urls, ...urls]);
    assert.ok(DOMParser.fromSchema(schema).parse(output).eq(schema.nodes.doc.create(null, nodes)));
    assert.equal(output.querySelector('img,script,[onerror]'), null);
  }
  for (const url of ['javascript:alert(1)', 'data:text/html,<script>bad()</script>', 'https://example.com/" onclick="bad()']) {
    const preview = dom.window.document.createElement('div');
    preview.dataset.type = 'link-preview'; preview.dataset.url = url;
    output.innerHTML = commentHtml(preview.outerHTML);
    assert.equal(output.querySelector('a').textContent, url);
    assert.equal(output.querySelector('[onclick],script'), null);
    if (!url.startsWith('https:')) assert.equal(output.querySelector('a').hasAttribute('href'), false);
  }
  dom.window.close();
  const issue = { id: 'issue', issueKey: 'BW-31', title: 'Buildwake', projectId: 'buildwake', description: saved, createdAt: new Date(), labels: [], comments: [] };
  await mounted('src/components/issue/IssueDetailContent.tsx', {
    'next-auth/react': { useSession: () => ({ data: { user: { id: 'user' } } }) },
    '@tanstack/react-query': { useQueryClient: () => ({}) },
    '@/hooks/queries/useIssues': { useDeleteIssue: () => ({}), useUpdateIssue: () => ({}), issueKeys: {} },
    '@/utils/html-normalizer': { normalizeDescriptionHTML: value => value }, '@/lib/comment-html': { commentHtml },
    '@/components/RichEditor/IssueRichEditor': { IssueRichEditor: React.forwardRef((props, ref) => { React.useImperativeHandle(ref, () => ({ getEditor: () => null })); return React.createElement('div', { contentEditable: true, suppressContentEditableWarning: true }, props.value); }) },
  }, { issue }, async ({ document, click, render }) => {
    const assertLinks = () => assert.deepEqual([...document.querySelectorAll('[data-type="link-preview"] a')].map(a => a.getAttribute('href')), [...urls, ...urls]);
    assertLinks();
    await click('Edit description'); await click('Done'); assertLinks();
    await render({ issue: { ...issue, id: 'reopened' } }); assertLinks();
  });
});

test('Back and post-delete navigation both retain the project when its default is inaccessible', async () => {
  const nav = navigation(null, new Response(null, { status: 404 }));
  const pushed = [], deleted = [];
  const issue = { id: 'issue', issueKey: 'BW-31', title: 'Buildwake', projectId: 'buildwake', project: { name: 'Buildwake', slug: 'buildwake' }, description: '', createdAt: new Date(), labels: [], comments: [] };
  await mounted('src/components/issue/IssueDetailContent.tsx', {
    'next-auth/react': { useSession: () => ({ data: { user: { id: 'user' } } }) },
    '@tanstack/react-query': { useQueryClient: () => ({}) },
    'next/navigation': { useRouter: () => ({ push: url => pushed.push(url) }) },
    '@/hooks/queries/useIssues': { useDeleteIssue: () => ({ mutateAsync: async key => deleted.push(key) }), useUpdateIssue: () => ({}), issueKeys: {} },
    '@/utils/html-normalizer': { normalizeDescriptionHTML: value => value },
    '@/lib/comment-html': { commentHtml: value => value }, '@/lib/navigation-helpers': nav,
    '@/components/layout/PageHeader': { default: ({ title, actions }) => React.createElement('div', null, title, actions), pageHeaderButtonStyles: {} },
    '@/components/ui/confirm-dialog': { ConfirmDialog: ({ open, onConfirm, confirmText }) => open ? React.createElement('button', { onClick: onConfirm }, confirmText) : null },
  }, { issue, workspaceId: 'workspace-id' }, async ({ click }) => {
    await click('Back to Buildwake: Default');
    await click('Delete'); await click('Delete Issue');
    assert.deepEqual(deleted, ['BW-31']);
    assert.deepEqual(pushed, ['/workspace-id/projects/buildwake', '/workspace-id/projects/buildwake']);
  });
});
