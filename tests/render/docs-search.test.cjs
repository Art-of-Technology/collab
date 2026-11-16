const { assert, test, load } = require('../security/helpers.cjs');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const jsx = require('react/jsx-runtime');

const cli = [
  '# Command line',
  '',
  'Install the CLI and sign in.',
  '',
  '## Installation',
  '',
  'Use the installer for your system.',
  '',
  '```sh',
  'curl -fsSL https://example.test/install.sh | sh',
  'collab frobnicate --zanzibar',
  '```',
  '',
  '## Agent collaboration {#agents}',
  '',
  'Agents hand work to each other.',
  '',
  '- A handoff names the next owner.',
  '  - A nested point about quokkas.',
  '',
  '| Command | What it does |',
  '| --- | --- |',
  '| `collab inbox` | Shows wombats waiting |',
  '',
  '### Example',
  '',
  'First example.',
  '',
  '### Example',
  '',
  'Second example.',
  '',
].join('\n');
const seats = '# Seats\n\nA seat is one project and one role.\n\n## Authentication\n\nA seat signs in with its own token.\n';
const start = '# Collab docs\n\nWhere to start with authentication.\n';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-search-'));
fs.mkdirSync(path.join(root, 'content/docs/agents'), { recursive: true });
fs.writeFileSync(path.join(root, 'content/docs/nav.json'), JSON.stringify([
  { title: 'Start here', pages: ['index', 'cli'] },
  { title: 'Agents', pages: ['agents/seats'] },
]));
fs.writeFileSync(path.join(root, 'content/docs/index.md'), start);
fs.writeFileSync(path.join(root, 'content/docs/cli.md'), cli);
fs.writeFileSync(path.join(root, 'content/docs/agents/seats.md'), seats);
// In the folder but not in the navigation: not searched.
fs.writeFileSync(path.join(root, 'content/docs/draft.md'), '# Draft\n\nAn unlisted page about xylophones.\n');

// The real loader, search and routes, on the folder above. Only sign-in is a stand-in.
const globals = { Response, URL, process: { cwd: () => root, env: {} } };
const docs = load('src/lib/docs.ts', { 'node:fs': fs, 'node:path': path, marked: require('marked'), entities: require('entities') }, globals);
const search = load('src/lib/docs-search.ts', { minisearch: { default: require('minisearch') } });
const granted = [];
const api = load('src/app/api/apps/auth/docs/route.ts', {
  'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
  '@/lib/apps/auth-middleware': { withAppAuth: (handler, options) => { granted.push(options); return request => handler(request, {}); } },
  '@/lib/docs': docs, '@/lib/docs-search': search,
}, globals);
const published = load('src/app/docs-index.json/route.ts', { '@/lib/docs': docs }, globals);
const ask = async query => { const response = await api.GET(new Request(`http://localhost/api/apps/auth/docs?${query}`)); return { status: response.status, body: await response.json() }; };
const places = hits => hits.map(hit => `${hit.slug}#${hit.anchor}`);

test('the index has one entry per heading section, with the loader\'s anchors', () => {
  const index = JSON.parse(JSON.stringify(docs.docsIndex()));
  assert.deepEqual(index.map(entry => [entry.id, entry.slug, entry.title, entry.heading, entry.anchor]), [
    ['/docs', 'index', 'Collab docs', 'Collab docs', ''],
    ['/docs/cli', 'cli', 'Command line', 'Command line', ''],
    ['/docs/cli#installation', 'cli', 'Command line', 'Installation', 'installation'],
    ['/docs/cli#agents', 'cli', 'Command line', 'Agent collaboration', 'agents'],
    ['/docs/cli#example', 'cli', 'Command line', 'Example', 'example'],
    ['/docs/cli#example-2', 'cli', 'Command line', 'Example', 'example-2'],
    ['/docs/agents/seats', 'agents/seats', 'Seats', 'Seats', ''],
    ['/docs/agents/seats#authentication', 'agents/seats', 'Seats', 'Authentication', 'authentication'],
  ]);
  for (const page of docs.allDocs()) {
    assert.deepEqual(index.filter(entry => entry.slug === page.slug && entry.anchor).map(entry => entry.anchor), Array.from(page.headings, heading => heading.id), page.slug);
  }
  const text = id => index.find(entry => entry.id === id).text;
  assert.equal(text('/docs/cli'), 'Install the CLI and sign in.');
  assert.equal(text('/docs/cli#installation'), 'Use the installer for your system. curl -fsSL https://example.test/install.sh | sh collab frobnicate --zanzibar');
  // Lists, nested lists and tables are part of their section.
  assert.equal(text('/docs/cli#agents'), 'Agents hand work to each other. A handoff names the next owner. A nested point about quokkas. Command What it does collab inbox Shows wombats waiting');
  assert.equal(text('/docs/cli#example-2'), 'Second example.');
});

test('the published index is the loader\'s index', async () => {
  assert.equal(published.dynamic, 'force-static');
  const response = published.GET();
  assert.match(response.headers.get('content-type'), /application\/json/);
  assert.deepEqual(await response.json(), JSON.parse(JSON.stringify(docs.docsIndex())));
});

test('a hit names its page, its section and where the words are', () => {
  const [hit] = search.searchDocs(docs.docsIndex(), 'installer');
  assert.deepEqual({ ...hit }, {
    slug: 'cli', title: 'Command line', heading: 'Installation', anchor: 'installation', href: '/docs/cli#installation',
    excerpt: 'Use the installer for your system. curl -fsSL https://example.test/install.sh | sh collab frobnicate --zanzibar',
  });
});

test('a long section is cut to the words around the match', () => {
  const text = `${'before '.repeat(60)}the needle is here ${'after '.repeat(60)}`.trim();
  const [hit] = search.searchDocs([{ id: '/docs/long', slug: 'long', title: 'Long', heading: 'Long', anchor: '', text }], 'needle');
  assert.match(hit.excerpt, /^… before .*the needle is here.* after …$/);
  assert.ok(hit.excerpt.length <= 170, `${hit.excerpt.length} characters`);
});

test('a word with one typo still finds its page, and the start of a word is enough', () => {
  const index = docs.docsIndex();
  assert.equal(places(search.searchDocs(index, 'instalation'))[0], 'cli#installation');
  assert.equal(places(search.searchDocs(index, 'instalaltion'))[0], 'cli#installation');
  assert.equal(places(search.searchDocs(index, 'instal'))[0], 'cli#installation');
});

test('a term that only occurs in a code block, a list or a table finds its section', () => {
  const index = docs.docsIndex();
  assert.deepEqual(places(search.searchDocs(index, 'zanzibar')), ['cli#installation']);
  assert.deepEqual(places(search.searchDocs(index, 'quokkas')), ['cli#agents']);
  assert.deepEqual(places(search.searchDocs(index, 'wombats')), ['cli#agents']);
});

test('a match in a heading comes before a match in the text', () => {
  // "authentication" is the heading of the seats section and only a word in the landing page's text.
  assert.deepEqual(places(search.searchDocs(docs.docsIndex(), 'authentication')), ['agents/seats#authentication', 'index#']);
});

test('an empty query returns nothing, a page outside the navigation is not found, and the limit is kept', () => {
  const index = docs.docsIndex();
  for (const query of ['', '   ', 'xylophones']) assert.equal(search.searchDocs(index, query).length, 0, query);
  assert.ok(search.searchDocs(index, 'collab').length > 2);
  assert.equal(search.searchDocs(index, 'collab', 2).length, 2);
});

test('the same query through the browser\'s function and through the docs route returns the same hits in the same order', async () => {
  // What the browser has: the published file, parsed.
  const index = await published.GET().json();
  for (const query of ['authentication', 'instalation', 'zanzibar', 'collab', 'example', 'seat token', 'agents hand work']) {
    const browser = search.searchDocs(index, query);
    const { status, body } = await ask(`query=${encodeURIComponent(query)}`);
    assert.equal(status, 200, query);
    assert.ok(browser.length > 0, query);
    assert.deepEqual(body.results, JSON.parse(JSON.stringify(browser)), query);
  }
  assert.deepEqual((await ask('query=collab&limit=2')).body.results, JSON.parse(JSON.stringify(search.searchDocs(index, 'collab', 2))));
});

test('the docs route keeps the number of results between 1 and 20, and gives 8 when no number is asked for', async () => {
  const index = Array.from({ length: 25 }, (_, i) => ({
    id: `/docs/page-${i}`, slug: `page-${i}`, title: 'Collab', heading: 'Collab', anchor: '', text: 'Collab',
  }));
  const route = load('src/app/api/apps/auth/docs/route.ts', {
    'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
    '@/lib/apps/auth-middleware': { withAppAuth: handler => request => handler(request, {}) },
    '@/lib/docs': { docsIndex: () => index }, '@/lib/docs-search': search,
  }, globals);
  const response = await route.GET(new Request('http://localhost/api/apps/auth/docs?query=collab&limit=500'));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).results.length, 20);
  // A number is cut to a whole one from 1 to 20; without a number the limit is 8.
  for (const [limit, hits] of [['0', 1], ['0.9', 1], ['-5', 1], ['2.7', 2], ['20', 20], ['1e9', 20], ['abc', 8], ['3abc', 8], ['', 8], ['%20', 8], [null, 8]]) {
    const answer = await route.GET(new Request(`http://localhost/api/apps/auth/docs?query=collab${limit === null ? '' : `&limit=${limit}`}`));
    assert.equal((await answer.json()).results.length, hits, `limit=${limit}`);
  }
});

test('the docs route gives one page as the loader has it, and says what is wrong otherwise', async () => {
  const page = await ask('slug=agents/seats');
  assert.equal(page.status, 200);
  assert.deepEqual(page.body, JSON.parse(JSON.stringify(docs.docPage('agents/seats'))));
  assert.equal(page.body.markdown, seats);
  for (const slug of ['nothing', '../secret', '']) {
    const missing = await ask(`slug=${encodeURIComponent(slug)}`);
    assert.equal(missing.status, 404, slug);
    assert.equal(missing.body.error, 'not_found');
  }
  for (const query of ['', 'query=', 'query=%20']) {
    const refused = await ask(query);
    assert.equal(refused.status, 400, query);
    assert.equal(refused.body.error, 'invalid_request');
  }
  // The documentation is public: the route asks for a valid token and no scope.
  assert.deepEqual(JSON.parse(JSON.stringify(granted)), [{ requiredScopes: [] }]);
});

// The search box with its state held by the test: `state` is what each useState call returns, in order (open, query, index, failed).
function box(state = [], reachable = true, fetchResponse) {
  const set = [], effects = [], pushed = [], listeners = {}, fetched = [];
  let at = 0;
  const react = {
    useState: initial => { const slot = at++; const value = slot in state ? state[slot] : initial; return [value, next => set.push([slot, typeof next === 'function' ? next(value) : next])]; },
    useRef: initial => ({ current: initial }),
    useEffect: effect => effects.push(effect),
  };
  const part = name => Object.assign(props => jsx.jsx('div', props), { part: name });
  const parts = Object.fromEntries(['Dialog', 'DialogContent', 'DialogTitle', 'Command', 'CommandEmpty', 'CommandInput', 'CommandItem', 'CommandList'].map(name => [name, part(name)]));
  const { DocsSearch } = load('src/components/docs/DocsSearch.tsx', {
    react, 'react/jsx-runtime': jsx, 'next/navigation': { useRouter: () => ({ push: href => pushed.push(href) }) }, 'lucide-react': require('lucide-react'),
    '@/components/ui/dialog': parts, '@/components/ui/command': parts, '@/lib/docs-search': search,
  }, {
    AbortController,
    document: { addEventListener: (type, listener) => { listeners[type] = listener; }, removeEventListener: () => {} },
    fetch: async address => { fetched.push(address); return fetchResponse ? fetchResponse() : { ok: reachable, status: reachable ? 200 : 503, json: async () => docs.docsIndex() }; },
  });
  const tree = DocsSearch();
  const all = (element, found = []) => {
    if (Array.isArray(element)) element.forEach(child => all(child, found));
    else if (element && typeof element === 'object') { found.push(element); all(element.props?.children, found); }
    return found;
  };
  const elements = all(tree);
  return { DocsSearch, set, effects, pushed, listeners, fetched, elements, parts: name => elements.filter(element => element.type?.part === name) };
}

test('⌘K and Ctrl+K open and close the search; other keys are left alone', () => {
  const closed = box();
  closed.effects.forEach(effect => effect());
  const press = (search, event) => { const prevented = []; search.listeners.keydown({ preventDefault: () => prevented.push(true), ...event }); return prevented.length; };
  assert.equal(press(closed, { key: 'k', metaKey: true }), 1);
  assert.equal(press(closed, { key: 'K', ctrlKey: true }), 1);
  assert.deepEqual(closed.set.filter(([slot]) => slot === 0), [[0, true], [0, true]]);
  assert.equal(press(closed, { key: 'k' }), 0);
  assert.equal(press(closed, { key: 'j', metaKey: true }), 0);
  assert.equal(closed.set.filter(([slot]) => slot === 0).length, 2);
  assert.deepEqual(closed.fetched, [], 'the index is not fetched before the search is opened');

  const open = box([true]);
  open.effects.forEach(effect => effect());
  press(open, { key: 'k', metaKey: true });
  assert.deepEqual(open.set.filter(([slot]) => slot === 0), [[0, false]]);
  assert.deepEqual(open.fetched, ['/docs-index.json']);

  const [button] = closed.elements.filter(element => element.type === 'button');
  button.props.onClick();
  assert.deepEqual(closed.set.at(-1), [0, true]);
});

test('the search box lists the hits of the shared search, and choosing one goes to its page and heading', async () => {
  const index = docs.docsIndex();
  const typed = box([true, 'zanzibar', index]);
  assert.equal(typed.parts('Command')[0].props.shouldFilter, false, 'the list is ordered by the shared search, not filtered again');
  assert.deepEqual(typed.parts('CommandItem').map(item => item.props.value), search.searchDocs(index, 'zanzibar').map(hit => hit.href));
  typed.effects.forEach(effect => effect());
  assert.deepEqual(typed.fetched, [], 'the index is fetched once');
  typed.parts('CommandItem')[0].props.onSelect();
  assert.deepEqual(typed.pushed, ['/docs/cli#installation']);
  assert.deepEqual(typed.set.filter(([slot]) => slot === 0), [[0, false]]);

  const loading = box([true, 'zanzibar']);
  assert.deepEqual(loading.parts('CommandItem'), []);
  loading.effects.forEach(effect => effect());
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(loading.set, [[2, index]]);
});

test('an index that cannot be fetched is said so, and opening the search again tries again', async () => {
  const text = search => search.parts('CommandEmpty').map(part => part.props.children);
  const down = box([true, 'zanzibar'], false);
  assert.deepEqual(text(down), ['Loading…']);
  down.effects.forEach(effect => effect());
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(down.set, [[3, true]]);
  assert.deepEqual(text(box([true, 'zanzibar', null, true])), ['The search could not be loaded. Close it and open it again.']);

  // Closing the search, with the dialog or with the key, takes the message away; the next opening fetches again.
  const failed = box([true, 'zanzibar', null, true]);
  failed.parts('Dialog')[0].props.onOpenChange(false);
  assert.deepEqual(failed.set, [[0, false], [3, false]]);
  failed.effects[0]();
  failed.listeners.keydown({ key: 'k', metaKey: true, preventDefault() {} });
  assert.deepEqual(failed.set.slice(2), [[3, false], [0, false]]);
  const reopened = box([true, 'zanzibar']);
  reopened.effects.forEach(effect => effect());
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(reopened.fetched, ['/docs-index.json']);
  assert.deepEqual(reopened.set, [[2, docs.docsIndex()]]);
  assert.deepEqual(text(box([true, 'nothing-like-this', docs.docsIndex()])), ['No page matches.']);
});

test('closing an opening ignores its pending fetch result', async () => {
  for (const close of ['dialog', 'keyboard']) {
    for (const succeeds of [false, true]) {
      let settle;
      const pending = new Promise((resolve, reject) => { settle = succeeds ? resolve : reject; });
      const opening = box([true, 'zanzibar'], true, () => pending);
      opening.effects[0]();
      const cleanup = opening.effects[1]();
      if (close === 'dialog') opening.parts('Dialog')[0].props.onOpenChange(false);
      else opening.listeners.keydown({ key: 'k', metaKey: true, preventDefault() {} });
      opening.set.length = 0;
      settle(succeeds ? { ok: true, json: async () => docs.docsIndex() } : new Error('offline'));
      await new Promise(resolve => setImmediate(resolve));
      assert.deepEqual(opening.set, [], `${close}, success=${succeeds}`);
      cleanup();
      const retry = box([true, 'zanzibar']);
      retry.effects.forEach(effect => effect());
      await new Promise(resolve => setImmediate(resolve));
      assert.deepEqual(retry.fetched, ['/docs-index.json']);
      assert.deepEqual(retry.set, [[2, docs.docsIndex()]]);
    }
  }
});

test('the search box is in the layout of every docs page', () => {
  const stub = name => ({ [name]: Object.assign(() => null, { stub: name }) });
  const { default: Layout } = load('src/app/docs/layout.tsx', {
    'react/jsx-runtime': jsx, 'next/link': require('next/link'), 'next/image': require('next/image'), 'lucide-react': require('lucide-react'),
    '@/lib/docs': docs, '@/components/docs/DocsSidebar': stub('DocsSidebar'), '@/components/docs/DocsSearch': stub('DocsSearch'),
    'next/font/google': { Geist: () => ({ className: 'font-geist' }) },
  });
  const seen = [];
  (function walk(element) {
    if (Array.isArray(element)) element.forEach(walk);
    else if (element && typeof element === 'object') { seen.push(element.type?.stub); walk(element.props?.children); }
  })(Layout({ children: 'The page' }));
  assert.equal(seen.filter(name => name === 'DocsSearch').length, 1);
});
