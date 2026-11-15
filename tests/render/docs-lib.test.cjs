const { assert, test, load } = require('../security/helpers.cjs');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// The loader reads content/docs under the working directory, so a test points it at a folder of its own.
function docsIn(root) {
  return load('src/lib/docs.ts', { 'node:fs': fs, 'node:path': path }, { process: { cwd: () => root } });
}

// The loader runs in its own context, so its arrays are compared by value.
const plain = value => JSON.parse(JSON.stringify(value));

function fixture(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-lib-'));
  for (const [name, text] of Object.entries(files)) {
    const file = path.join(root, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  }
  return root;
}

const guide = [
  '# Create a seat',
  '',
  'How to give an agent one project',
  'and one role.',
  '',
  'More text that is not the summary.',
  '',
  '## Example',
  '',
  '```md',
  '## Not a heading',
  '```',
  '',
  '### Read `collab schema` in [the CLI](/docs/cli)',
  '',
  '## Example',
  '',
  '## Example 2',
  '',
  '## Example',
  '',
  '#### Too deep',
  '',
].join('\n');

const root = fixture({
  'content/docs/nav.json': JSON.stringify([
    { title: 'Start here', pages: ['index'] },
    { title: 'Guides', pages: ['guides/create-a-seat'] },
  ]),
  'content/docs/index.md': '# Collab docs\n\nWhere to start.\n',
  'content/docs/guides/create-a-seat.md': guide,
  'content/docs/untitled.md': 'No title here.\n',
  'content/secret.md': '# Secret\n\nNot published.\n',
});
const docs = docsIn(root);

test('a page has its title, its one-line summary and the file as it is on disk', () => {
  const page = docs.docPage('guides/create-a-seat');
  assert.equal(page.slug, 'guides/create-a-seat');
  assert.equal(page.title, 'Create a seat');
  assert.equal(page.summary, 'How to give an agent one project and one role.');
  assert.equal(page.markdown, guide);
});

test('a page without a title line has an empty title and summary instead of a guess', () => {
  const page = docs.docPage('untitled');
  assert.equal(page.title, '');
  assert.equal(page.summary, '');
});

test('headings are the second and third level only, in order, and never read from a code block', () => {
  const { headings } = docs.docPage('guides/create-a-seat');
  assert.deepEqual(plain(headings.map(h => [h.depth, h.text])), [
    [2, 'Example'],
    [3, 'Read collab schema in the CLI'],
    [2, 'Example'],
    [2, 'Example 2'],
    [2, 'Example'],
  ]);
});

test('repeated headings get -2, -3 and never share an id with another heading', () => {
  const ids = plain(docs.docPage('guides/create-a-seat').headings.map(h => h.id));
  assert.deepEqual(ids, ['example', 'read-collab-schema-in-the-cli', 'example-2', 'example-2-2', 'example-3']);
  assert.equal(new Set(ids).size, ids.length);
});

test('headingId counts repeats in the map it is given', () => {
  const seen = new Map();
  assert.equal(docs.headingId('Agents', seen), 'agents');
  assert.equal(docs.headingId('Agents', seen), 'agents-2');
  assert.equal(docs.headingId('Agents', seen), 'agents-3');
  assert.equal(docs.headingId('Flags & inputs', new Map()), 'flags-inputs');
  assert.equal(docs.headingId('docs_search', new Map()), 'docs_search');
  assert.equal(docs.headingId('???', new Map()), 'section');
});

test('an unknown slug gives null', () => {
  assert.equal(docs.docPage('guides/nothing-here'), null);
  assert.equal(docs.docPage(''), null);
});

test('a slug that leaves the docs folder gives null', () => {
  // The file exists one folder up, so only the slug rule keeps it unpublished.
  assert.ok(fs.existsSync(path.join(root, 'content/docs/../secret.md')));
  for (const slug of ['../secret', 'guides/../../secret', '..', '/etc/hosts', 'guides\\create-a-seat', 'index.md', 'Index']) {
    assert.equal(docs.docPage(slug), null, slug);
  }
});

test('the navigation takes each title from its page', () => {
  assert.deepEqual(plain(docs.docsNav()), [
    { title: 'Start here', pages: [{ slug: 'index', title: 'Collab docs' }] },
    { title: 'Guides', pages: [{ slug: 'guides/create-a-seat', title: 'Create a seat' }] },
  ]);
});

test('allDocs returns the navigation pages in navigation order', () => {
  assert.deepEqual(plain(docs.allDocs().map(page => page.slug)), ['index', 'guides/create-a-seat']);
});

test('a navigation entry without a file is an error, not a silent gap', () => {
  const broken = docsIn(fixture({
    'content/docs/nav.json': JSON.stringify([{ title: 'Start here', pages: ['missing'] }]),
  }));
  assert.throws(() => broken.docsNav(), /missing/);
});

test('every page in the published navigation loads with a title and a summary', () => {
  const published = docsIn(path.resolve(__dirname, '../..'));
  const pages = published.allDocs();
  assert.ok(pages.length > 0);
  assert.equal(pages[0].slug, 'index');
  for (const page of pages) {
    assert.ok(page.title, page.slug);
    assert.ok(page.summary, page.slug);
  }
});
