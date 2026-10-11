const { assert, test, load } = require('../security/helpers.cjs');
const { renderToStaticMarkup } = require('react-dom/server');
const jsx = require('react/jsx-runtime');

function page() {
  const { default: Page, metadata } = load('src/app/home/page.tsx', {
    react: require('react'),
    'react/jsx-runtime': jsx,
    'next/link': require('next/link'),
    'next/image': require('next/image'),
    'next/font/google': { Lora: () => ({ className: 'font-test' }) },
    'lucide-react': require('lucide-react'),
    '@/components/ui/button': { Button: 'button' },
  });
  return { html: renderToStaticMarkup(Page()), metadata };
}

test('homepage showcases the product and gives visitors working docs and sign-in destinations', () => {
  const { html, metadata } = page();
  assert.match(metadata?.description || '', /projects, issues, Notes/);
  assert.match(html, /Your team and your agents/);
  assert.match(html, /Example project/);
  assert.match(html, /Illustrative workflow/);
  assert.match(html, /href="\/docs\/cli#installation"/);
  assert.match(html, /href="\/docs\/cli#commands"/);
  assert.match(html, /href="\/login"/);
  assert.doesNotMatch(html, /25,000 teams|£29|mailto:|\/companies\//);
  assert.doesNotMatch(html, /<button\b/, 'static preview must not offer nonfunctional buttons');
  const ids = [...html.matchAll(/ id="([^"]+)"/g)].map(match => match[1]);
  assert.equal(ids.length, new Set(ids).size);
  for (const [, target] of html.matchAll(/href="#([^"]+)"/g)) assert.ok(ids.includes(target), target);
});

test('rendered terminal examples use supported CLI command flags and preserve the semantic availability caveat', async () => {
  const { html } = page();
  const { commands } = JSON.parse(require('node:child_process').execFileSync(process.execPath,
    ['packages/cli/bin/collab.mjs', 'schema'], { encoding: 'utf8' }));
  const snippets = [...html.matchAll(/<code data-cli-example="([^"]+)"[^>]*>([\s\S]*?)<\/code>/g)];
  assert.equal(snippets.length, 4);
  for (const [, name, code] of snippets) {
    assert.ok(commands[name], name);
    const flags = [...code.matchAll(/--([a-z-]+)/g)].map(match => match[1]);
    for (const flag of flags) assert.ok([...commands[name].options, 'json'].includes(flag), `${name}: ${flag}`);
  }
  assert.match(html, /semantic search requires a configured embedding provider and index/);
  assert.match(html, /workspace permissions/);
});
