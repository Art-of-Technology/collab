const { assert, test, load } = require('../security/helpers.cjs');
const { renderToStaticMarkup } = require('react-dom/server');
const jsx = require('react/jsx-runtime');
const React = require('react');

function hero(link = require('next/link')) {
  return load('src/app/home/AgentHero.tsx', {
    react: React, 'react/jsx-runtime': jsx, 'next/link': link,
    'lucide-react': require('lucide-react'),
    './agent-hero.module.css': { default: new Proxy({}, { get: (_, key) => String(key) }) },
  }).default;
}

function page() {
  const { default: Page, metadata } = load('src/app/home/page.tsx', {
    react: require('react'),
    'react/jsx-runtime': jsx,
    'next/link': require('next/link'),
    'next/image': require('next/image'),
    'next/font/google': { Lora: () => ({ className: 'font-test' }) },
    'lucide-react': require('lucide-react'),
    '@/components/ui/button': { Button: 'button' },
    './AgentHero': { default: hero() },
  });
  return { html: renderToStaticMarkup(Page()), metadata };
}

test('homepage showcases the product and gives visitors working docs and sign-in destinations', () => {
  const { html, metadata } = page();
  assert.match(metadata?.description || '', /projects, issues, Notes/);
  assert.match(html, /Project management\./);
  assert.match(html, /Built for your agent\./);
  assert.match(html, /Example project/);
  assert.match(html, /Illustrative workflow/);
  const coclaw = html.match(/<details\b[\s\S]*?<\/details>/)?.[0];
  assert.ok(coclaw, 'optional assistant explanation belongs in a secondary disclosure');
  assert.match(coclaw, /Do I need Coclaw to use the CLI\?/);
  assert.match(coclaw, /No\. Your existing coding agent can use the CLI directly/);
  assert.match(coclaw, /optional built-in assistant/);
  assert.match(coclaw, /tasks, connected messaging channels and persistent memory/);
  assert.match(coclaw, /using the CLI does not start Coclaw/);
  assert.match(coclaw, /execution requires an enabled deployment and a configured provider/);
  const nav = html.match(/<nav\b[\s\S]*?<\/nav>/)?.[0];
  assert.doesNotMatch(nav, /Coclaw/);
  assert.doesNotMatch(html, /Meet Coclaw/);
  assert.match(html, /href="\/docs\/cli#installation"/);
  assert.match(html, /href="\/docs\/cli#commands"/);
  assert.match(html, /href="\/login"/);
  assert.doesNotMatch(html, /25,000 teams|£29|mailto:|\/companies\//);
  assert.match(html, /aria-label="Explore the CLI workflow"/);
  assert.ok(html.indexOf('id="hero-title"') < html.indexOf('id="product-title"'), 'agent workflow leads the product detail');
  assert.ok(html.indexOf('>Install the CLI') < html.indexOf('>Explore the workflow'), 'installation is the primary hero action');
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


test('actual hero controls select each bounded command and its shared context without a network request', async () => {
  // Reuse the DOM implementation already locked under isomorphic-dompurify.
  const { createRequire } = require('node:module');
  const { JSDOM } = createRequire(require.resolve('isomorphic-dompurify'))('jsdom');
  const assertAccessStatement = document => {
    const statement = [...document.querySelectorAll('p')].find(element =>
      element.textContent === 'Access follows your approved scopes and workspace permissions.');
    assert.ok(statement, 'the complete access statement is rendered');
    assert.equal(statement.closest('[hidden], [aria-hidden="true"], details'), null,
      'the access statement stays outside hidden panels and disclosures');
  };
  assertAccessStatement(JSDOM.fragment(page().html));
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://example.test' });
  const names = ['window', 'document', 'HTMLElement', 'IS_REACT_ACT_ENVIRONMENT', 'fetch'];
  const saved = names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]);
  let requests = 0;
  const refuseNetwork = () => { requests++; throw new Error('Hero demo must not dispatch requests'); };
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true, fetch: refuseNetwork });
  dom.window.fetch = refuseNetwork;
  const { createRoot } = require('react-dom/client');
  const root = createRoot(dom.window.document.getElementById('root'));
  try {
    const Hero = hero({ default: 'a' });
    await React.act(async () => root.render(React.createElement(Hero)));
    const document = dom.window.document;
    assertAccessStatement(document);
    const buttons = [...document.querySelectorAll('[aria-controls]')];
    assert.equal(buttons.length, 4);
    const selected = () => buttons.filter(button => button.getAttribute('aria-pressed') === 'true');
    assert.equal(selected()[0].textContent, '04Bring the context');
    const expected = [
      ['projects list', 'Start with the project your team already uses.', 0],
      ['issues list', 'The issue is shared context, not a second task list.', 1],
      ['search', 'Read the why before changing the what.', 1],
      ['context get', 'Give your existing agent the context to begin.', 2],
    ];
    for (const [index, [name, note, highlighted]] of expected.entries()) {
      await React.act(async () => buttons[index].click());
      assert.equal(selected().length, 1);
      assert.equal(selected()[0], buttons[index]);
      const panel = document.getElementById(buttons[index].getAttribute('aria-controls'));
      assert.equal(panel.hidden, false);
      assert.equal(panel.querySelector('[data-cli-example]').getAttribute('data-cli-example'), name);
      assert.match(panel.textContent, /collab/);
      for (const other of buttons.filter(button => button !== buttons[index])) {
        assert.equal(document.getElementById(other.getAttribute('aria-controls')).hidden, true);
      }
      assert.equal(document.querySelector('.stepNote').textContent, note);
      assert.equal(document.querySelectorAll('[data-highlighted="true"]').length, highlighted);
      assertAccessStatement(document);
    }
    const pause = document.querySelector('.motion');
    await React.act(async () => pause.click());
    assert.equal(pause.textContent, 'Resume motion');
    assert.equal(pause.getAttribute('aria-pressed'), 'true');
    assert.equal(document.getElementById('agents').dataset.paused, 'true');
    assertAccessStatement(document);
    await React.act(async () => pause.click());
    assert.equal(pause.textContent, 'Pause motion');
    assert.equal(document.getElementById('agents').dataset.paused, 'false');
    assertAccessStatement(document);
    assert.equal(requests, 0);
  } finally {
    await React.act(async () => root.unmount());
    dom.window.close();
    for (const [name, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
});
