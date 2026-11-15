const { assert, test, load } = require('../security/helpers.cjs');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const React = require('react');
const jsx = require('react/jsx-runtime');
const { renderToStaticMarkup } = require('react-dom/server');

const repo = path.resolve(__dirname, '../..');

const guide = [
  '# Create a seat',
  '',
  'How to give an agent one project and one role.',
  '',
  '## Example',
  '',
  'Run `collab whoami`, read [the CLI page](/docs/cli#commands) or [GitHub](https://github.com/Art-of-Technology/collab).',
  '',
  '> ## Quoted',
  '',
  '## Agent collaboration {#agents}',
  '',
  '### Read `collab schema`',
  '',
  '## Example',
  '',
].join('\n');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-page-'));
  fs.mkdirSync(path.join(root, 'content/docs/guides'), { recursive: true });
  fs.writeFileSync(path.join(root, 'content/docs/nav.json'), JSON.stringify([
    { title: 'Start here', pages: ['index'] },
    { title: 'Guides', pages: ['guides/create-a-seat', 'guides/last'] },
  ]));
  fs.writeFileSync(path.join(root, 'content/docs/index.md'), '# Collab docs\n\nWhere to start.\n');
  fs.writeFileSync(path.join(root, 'content/docs/guides/create-a-seat.md'), guide);
  fs.writeFileSync(path.join(root, 'content/docs/guides/last.md'), '# Last page\n\nThe end.\n');
  // In the folder but not in the navigation.
  fs.writeFileSync(path.join(root, 'content/docs/draft.md'), '# Draft\n\nNot listed.\n');
  return root;
}

const docsIn = root => load('src/lib/docs.ts', {
  'node:fs': fs, 'node:path': path, marked: require('marked'), 'isomorphic-dompurify': { default: require('isomorphic-dompurify') },
}, { process: { cwd: () => root } });

// The real renderer with its real Markdown libraries, which are ES modules.
async function renderer() {
  return load('src/components/ui/markdown-renderer.tsx', {
    'react/jsx-runtime': jsx,
    'react-markdown': await import('react-markdown'),
    'remark-gfm': await import('remark-gfm'),
    'rehype-highlight': await import('rehype-highlight'),
    'rehype-sanitize': await import('rehype-sanitize'),
    'highlight.js/styles/github.css': {},
  });
}

const component = (file, dependencies = {}, globals = {}) => load(file, { react: React, 'react/jsx-runtime': jsx, ...dependencies }, globals);

// The page on the real loader and renderer; only the command list and the diagram drawing are stand-ins.
async function site(root) {
  const docs = docsIn(root);
  const copy = component('src/components/docs/CopyMarkdownButton.tsx');
  const page = load('src/app/docs/[[...slug]]/page.tsx', {
    'react/jsx-runtime': jsx,
    'next/link': require('next/link'),
    'next/navigation': { notFound() { throw new Error('NOT_FOUND'); } },
    '@/lib/docs': docs,
    '@/components/ui/markdown-renderer': await renderer(),
    '@/components/docs/OnThisPage': component('src/components/docs/OnThisPage.tsx'),
    '@/components/docs/CopyMarkdownButton': copy,
    '@/components/docs/DocsDiagrams': component('src/components/docs/DocsDiagrams.tsx', { '@/lib/mermaid-diagrams': { renderDiagrams() {} } }),
    '../command-reference': { CommandReference: () => jsx.jsx('div', { id: 'command-list', children: 'Every command' }) },
  });
  const visit = slug => page.default({ params: Promise.resolve({ slug: slug ? slug.split('/') : undefined }) });
  return { docs, page, copy, visit };
}

function find(element, match, found = []) {
  if (Array.isArray(element)) element.forEach(child => find(child, match, found));
  else if (element && typeof element === 'object') {
    if (match(element)) found.push(element);
    find(element.props?.children, match, found);
  }
  return found;
}

const ids = html => [...html.matchAll(/ id="([^"]+)"/g)].map(match => match[1]);

test('headings get the loader\'s ids in order, a repeated heading gets -2, and the {#id} marker is not shown', async () => {
  const { MarkdownRenderer } = await renderer();
  const page = docsIn(fixture()).docPage('guides/create-a-seat');
  // The loader runs in its own context, so its list is copied into this one.
  const headingIds = Array.from(page.headings, heading => heading.id);
  assert.deepEqual(headingIds, ['example', 'agents', 'read-collab-schema', 'example-2']);
  const html = renderToStaticMarkup(MarkdownRenderer({ content: page.markdown, headingIds }));
  assert.match(html, /<h2 id="example"[^>]*>Example<\/h2>/);
  assert.match(html, /<h2 id="agents"[^>]*>Agent collaboration<\/h2>/);
  assert.match(html, /<h3 id="read-collab-schema"[^>]*>Read <code/);
  assert.match(html, /<h2 id="example-2"[^>]*>Example<\/h2>/);
  // A heading inside a quote is not one of the page's headings: it takes no id and does not shift the others.
  assert.match(html, /<h2 class="[^"]*">Quoted<\/h2>/);
  assert.deepEqual(ids(html), headingIds);
  assert.doesNotMatch(html, /\{#/);
});

test('without the ids a heading is rendered as before', async () => {
  const { MarkdownRenderer } = await renderer();
  const html = renderToStaticMarkup(MarkdownRenderer({ content: '## Example\n' }));
  assert.match(html, /<h2 class="[^"]*">Example<\/h2>/);
});

test('a link to a page of this site stays in the tab; a link to another site opens a new one', async () => {
  const { MarkdownRenderer } = await renderer();
  const html = renderToStaticMarkup(MarkdownRenderer({ content: guide }));
  const link = href => html.match(new RegExp(`<a href="${href}"[^>]*>`))?.[0];
  assert.ok(link('/docs/cli#commands'));
  assert.doesNotMatch(link('/docs/cli#commands'), /target=/);
  assert.match(link('https://github.com/Art-of-Technology/collab'), /target="_blank"/);
  const elsewhere = renderToStaticMarkup(MarkdownRenderer({ content: '[other host](//example.com/docs)' }));
  assert.match(elsewhere, /target="_blank"/);
});

test('code inside a sentence stays in the sentence; only a code block is a block', async () => {
  const { MarkdownRenderer } = await renderer();
  const html = renderToStaticMarkup(MarkdownRenderer({ content: 'Run `collab whoami` now.\n\n```sh\ncollab --help\n```\n' }));
  const inline = html.match(/<p[^>]*>Run <code class="([^"]*)"/)?.[1];
  assert.ok(inline !== undefined, html);
  assert.doesNotMatch(inline, /\bblock\b/);
  assert.match(html, /<pre[^>]*><code class="[^"]*\bblock\b[^"]*"/);
});

test('the page for a slug shows its title, its headings in the right rail, and previous and next from the navigation', async () => {
  const { visit } = await site(fixture());
  const tree = await visit('guides/create-a-seat');
  const html = renderToStaticMarkup(tree);
  assert.match(html, /<h1[^>]*>Create a seat<\/h1>/);
  const rail = html.match(/<nav aria-label="On this page"[^>]*>.*?<\/nav>/s)?.[0];
  assert.ok(rail, 'right rail');
  assert.deepEqual([...rail.matchAll(/<a href="#([^"]+)"[^>]*>([^<]+)</g)].map(match => [match[1], match[2]]), [
    ['example', 'Example'], ['agents', 'Agent collaboration'], ['read-collab-schema', 'Read collab schema'], ['example-2', 'Example'],
  ]);
  // Every heading the rail links to is on the page.
  for (const [, target] of html.matchAll(/href="#([^"]+)"/g)) assert.ok(ids(html).includes(target), target);
  const [previous] = find(tree, element => element.props?.rel === 'prev');
  const [next] = find(tree, element => element.props?.rel === 'next');
  assert.equal(previous.props.href, '/docs');
  assert.match(renderToStaticMarkup(previous), /Collab docs/);
  assert.equal(next.props.href, '/docs/guides/last');
  assert.match(renderToStaticMarkup(next), /Last page/);
});

test('the first page has no previous page and the last has no next; the landing page is /docs', async () => {
  const { visit } = await site(fixture());
  const first = await visit();
  assert.match(renderToStaticMarkup(first), /<h1[^>]*>Collab docs<\/h1>/);
  assert.equal(find(first, element => element.props?.rel === 'prev').length, 0);
  assert.equal(find(first, element => element.props?.rel === 'next')[0].props.href, '/docs/guides/create-a-seat');
  const last = await visit('guides/last');
  assert.equal(find(last, element => element.props?.rel === 'next').length, 0);
  assert.equal(find(last, element => element.props?.rel === 'prev')[0].props.href, '/docs/guides/create-a-seat');
});

test('"copy page as Markdown" copies the loader\'s Markdown', async () => {
  const { docs, copy, visit } = await site(fixture());
  const [button] = find(await visit('guides/create-a-seat'), element => element.type === copy.CopyMarkdownButton);
  assert.equal(button.props.markdown, docs.docPage('guides/create-a-seat').markdown);
  assert.equal(button.props.markdown, guide);

  const copied = [];
  const { CopyMarkdownButton } = load('src/components/docs/CopyMarkdownButton.tsx', {
    react: { useState: () => [false, () => {}] }, 'react/jsx-runtime': jsx,
  }, { navigator: { clipboard: { writeText: async text => { copied.push(text); } } }, setTimeout: () => {} });
  const [control] = find(CopyMarkdownButton({ markdown: guide }), element => element.type === 'button');
  assert.match(renderToStaticMarkup(control), /Copy page as Markdown/);
  await control.props.onClick();
  assert.deepEqual(copied, [guide]);
});

test('an address that is not a navigation page is not found', async () => {
  const { visit } = await site(fixture());
  for (const slug of ['guides/nothing', 'draft', '../secret']) {
    await assert.rejects(visit(slug), /NOT_FOUND/, slug);
  }
});

test('the pages built ahead of time are the navigation pages, with the landing page at /docs', async () => {
  const { page } = await site(fixture());
  assert.deepEqual(JSON.parse(JSON.stringify(page.generateStaticParams())), [
    { slug: [] },
    { slug: ['guides', 'create-a-seat'] },
    { slug: ['guides', 'last'] },
  ]);
  assert.equal(page.dynamicParams, false);
});

test('a page\'s browser title and description are its title and summary', async () => {
  const { page } = await site(fixture());
  const metadata = await page.generateMetadata({ params: Promise.resolve({ slug: ['guides', 'create-a-seat'] }) });
  assert.match(metadata.title, /^Create a seat/);
  assert.equal(metadata.description, 'How to give an agent one project and one role.');
});

test('/docs/cli keeps the ids existing links use, and the command list follows its last heading', async () => {
  const { visit } = await site(repo);
  const html = renderToStaticMarkup(await visit('cli'));
  const found = ids(html);
  for (const id of ['overview', 'installation', 'authentication', 'capabilities', 'search', 'workflow', 'agents', 'commands', 'flags', 'automation', 'troubleshooting']) {
    assert.match(html, new RegExp(`<h2 id="${id}"`), id);
  }
  assert.equal(new Set(found).size, found.length, 'ids must be unique');
  for (const [, target] of html.matchAll(/href="#([^"]+)"/g)) assert.ok(found.includes(target), target);
  assert.ok(html.lastIndexOf('<h2 ') < html.indexOf('id="command-list"'), 'the command list comes after the Markdown');
  assert.equal(html.lastIndexOf('<h2 '), html.indexOf('<h2 id="commands"'));
  assert.doesNotMatch(renderToStaticMarkup(await visit()), /id="command-list"/);
});

test('/docs/cli still says how to install, sign in and where credentials stop', async () => {
  const { visit } = await site(repo);
  // The words of the page: code is split into highlighting elements, and quotes are written as entities.
  const words = renderToStaticMarkup(await visit('cli')).replace(/<[^>]+>/g, '');
  for (const text of [
    'curl -fsSL https://collab.weez.boo/install.sh', 'irm https://collab.weez.boo/install.ps1', 'collab --help',
    'npm install --global ./packages/cli', 'Node.js 22', 'collab auth login', 'collab inbox wait', '--wait-seconds',
    'Logout removes local credentials only', 'Each new CLI login has an independent grant', 'collab-cli', 'outcome_unknown',
  ]) assert.ok(words.includes(text), text);
});

test('the CLI page names the CLI version that is in packages/cli', () => {
  const { version } = require('../../packages/cli/package.json');
  const markdown = fs.readFileSync(path.join(repo, 'content/docs/cli.md'), 'utf8');
  const named = [...markdown.matchAll(/cli-v([0-9A-Za-z.-]+?)(?=[/)\s])/g)].map(match => match[1]);
  assert.ok(named.length > 0);
  assert.deepEqual([...new Set(named)], [version], 'a CLI release also changes the version written in content/docs/cli.md');
  for (const platform of ['darwin-arm64', 'darwin-x64', 'linux-arm64', 'linux-x64', 'windows-x64', 'windows-x86', 'windows-arm64']) {
    const url = `https://github.com/Art-of-Technology/collab/releases/download/cli-v${version}/collab-${platform}.${platform.startsWith('windows-') ? 'zip' : 'tar.gz'}`;
    assert.ok(markdown.includes(`(${url})`), platform);
    assert.ok(markdown.includes(`(${url}.sha256)`), `${platform} checksum`);
  }
  assert.ok(markdown.includes(`https://raw.githubusercontent.com/Art-of-Technology/collab/cli-v${version}/packages/cli/skills/collab-agents/SKILL.md`));
  assert.match(markdown, new RegExp(`CLI ${version.replaceAll('.', '\\.')}\\b`));
});

test('the layout lists every section and page of the navigation and marks the page being read', async () => {
  const docs = docsIn(fixture());
  let pathname = '/docs/guides/create-a-seat';
  const sidebar = component('src/components/docs/DocsSidebar.tsx', {
    'next/link': require('next/link'), 'next/navigation': { usePathname: () => pathname },
  });
  const { default: Layout } = load('src/app/docs/layout.tsx', {
    'react/jsx-runtime': jsx, 'next/link': require('next/link'), 'next/image': require('next/image'),
    'lucide-react': require('lucide-react'), '@/lib/docs': docs, '@/components/docs/DocsSidebar': sidebar,
  });
  const html = renderToStaticMarkup(Layout({ children: 'The page' }));
  assert.match(html, /The page/);
  const nav = html.match(/<nav aria-label="Documentation"[^>]*>.*?<\/nav>/s)?.[0];
  assert.ok(nav, 'sidebar');
  assert.ok(nav.indexOf('Start here') < nav.indexOf('Guides'));
  assert.deepEqual([...nav.matchAll(/<a([^>]*)href="(\/docs[^"]*)"([^>]*)>([^<]+)</g)].map(match => [match[2], match[4], /aria-current="page"/.test(match[1] + match[3])]), [
    ['/docs', 'Collab docs', false],
    ['/docs/guides/create-a-seat', 'Create a seat', true],
    ['/docs/guides/last', 'Last page', false],
  ]);
  assert.match(html, /href="\/dev\/docs"/);
  pathname = '/docs';
  assert.match(renderToStaticMarkup(Layout({ children: 'The page' })), /<a[^>]*aria-current="page"[^>]*>Collab docs</);
});

test('diagrams are drawn in the page\'s own element after it is on screen', () => {
  const container = { name: 'the page element' };
  const drawn = [];
  const effects = [];
  const { DocsDiagrams } = load('src/components/docs/DocsDiagrams.tsx', {
    react: { useRef: () => ({ current: container }), useEffect: effect => effects.push(effect) },
    'react/jsx-runtime': jsx,
    '@/lib/mermaid-diagrams': { renderDiagrams: element => drawn.push(element) },
  });
  assert.match(renderToStaticMarkup(DocsDiagrams({ children: 'A page' })), /A page/);
  assert.deepEqual(drawn, [], 'nothing is drawn while rendering');
  effects.forEach(effect => effect());
  assert.deepEqual(drawn, [container]);
});
