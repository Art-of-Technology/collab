const { assert, test, load } = require('../security/helpers.cjs');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const guide = '# Create a seat\n\nHow to give an agent one project and one role.\n\n## Steps\n\n1. Open **Agent tokens**.\n';
const start = '# Collab docs\n\nWhere to start.\n';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-routes-'));
fs.mkdirSync(path.join(root, 'content/docs/guides'), { recursive: true });
fs.writeFileSync(path.join(root, 'content/docs/nav.json'), JSON.stringify([
  { title: 'Start here', pages: ['index'] },
  { title: 'Guides', pages: ['guides/create-a-seat'] },
]));
fs.writeFileSync(path.join(root, 'content/docs/index.md'), start);
fs.writeFileSync(path.join(root, 'content/docs/guides/create-a-seat.md'), guide);
// In the folder but not in the navigation: readable by its address, listed nowhere.
fs.writeFileSync(path.join(root, 'content/docs/draft.md'), '# Draft\n\nNot listed.\n');

// The routes run on the real loader, pointed at the folder above.
function routes(appUrl) {
  const globals = { Response, process: { cwd: () => root, env: appUrl ? { NEXT_PUBLIC_APP_URL: appUrl } : {} } };
  const docs = load('src/lib/docs.ts', { 'node:fs': fs, 'node:path': path }, globals);
  const route = file => load(file, { '@/lib/docs': docs }, globals);
  return {
    docs,
    raw: route('src/app/docs/raw/[...slug]/route.ts'),
    llms: route('src/app/llms.txt/route.ts'),
    full: route('src/app/llms-full.txt/route.ts'),
  };
}
const get = (route, slug) => route.GET(new Request('http://localhost/'), { params: Promise.resolve({ slug: slug.split('/') }) });

test('the Markdown address returns the loader\'s Markdown for the page, as text/markdown', async () => {
  const { docs, raw } = routes();
  const response = await get(raw, 'guides/create-a-seat');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'text/markdown; charset=utf-8');
  const body = await response.text();
  assert.equal(body, docs.docPage('guides/create-a-seat').markdown);
  assert.equal(body, guide);
});

test('the Markdown address answers 404 for a page that does not exist', async () => {
  const { raw } = routes();
  for (const slug of ['guides/nothing', '../secret', 'index.md']) {
    assert.equal((await get(raw, slug)).status, 404, slug);
  }
});

test('the Markdown addresses built ahead of time are the navigation pages', () => {
  const { raw } = routes();
  assert.deepEqual(JSON.parse(JSON.stringify(raw.generateStaticParams())), [
    { slug: ['index'] },
    { slug: ['guides', 'create-a-seat'] },
  ]);
  assert.equal(raw.dynamicParams, false);
});

test('llms.txt has one line per navigation page with its title, summary and Markdown address', async () => {
  const { llms } = routes('https://docs.example/');
  const response = await llms.GET();
  assert.equal(response.headers.get('content-type'), 'text/plain; charset=utf-8');
  const text = await response.text();
  assert.deepEqual(text.split('\n').filter(line => line.startsWith('- [')), [
    '- [Collab docs](https://docs.example/docs/index.md): Where to start.',
    '- [Create a seat](https://docs.example/docs/guides/create-a-seat.md): How to give an agent one project and one role.',
  ]);
  assert.match(text, /^# Collab docs\n\n> Where to start\.\n/);
  assert.ok(text.indexOf('## Start here') < text.indexOf('## Guides'));
  assert.ok(text.indexOf('## Guides') < text.indexOf('- [Create a seat]'));
  assert.match(text, /https:\/\/docs\.example\/llms-full\.txt/);
  assert.doesNotMatch(text, /Draft/);
});

test('llms.txt uses addresses from the site root when the public address is not configured', async () => {
  const text = await (await routes().llms.GET()).text();
  assert.match(text, /^- \[Create a seat\]\(\/docs\/guides\/create-a-seat\.md\): /m);
});

test('llms-full.txt is every navigation page in navigation order', async () => {
  const { full } = routes();
  const response = await full.GET();
  assert.equal(response.headers.get('content-type'), 'text/plain; charset=utf-8');
  assert.equal(await response.text(), `${start.trim()}\n\n${guide.trim()}\n`);
});

test('an address ending in .md is sent to the Markdown route, and no other docs address is', async () => {
  const { getPathMatch } = require('next/dist/shared/lib/router/utils/path-match');
  const { prepareDestination } = require('next/dist/shared/lib/router/utils/prepare-destination');
  const config = require('../../next.config.js');
  const resolved = typeof config === 'function' ? await config('phase-production-build', { defaultConfig: {} }) : config;
  const rewrites = await resolved.rewrites();
  const rewrite = path => {
    for (const { source, destination } of rewrites) {
      const params = getPathMatch(source, { removeUnnamedParams: true, strict: true })(path);
      if (params) return prepareDestination({ appendParamsToQuery: false, destination, params, query: {} }).parsedDestination.pathname;
    }
    return null;
  };
  assert.equal(rewrite('/docs/index.md'), '/docs/raw/index');
  assert.equal(rewrite('/docs.md'), '/docs/raw/index');
  assert.equal(rewrite('/docs/guides/create-a-seat.md'), '/docs/raw/guides/create-a-seat');
  for (const path of ['/docs', '/docs/cli', '/docs/guides/create-a-seat', '/docs/.md', '/llms.txt']) assert.equal(rewrite(path), null, path);
});
