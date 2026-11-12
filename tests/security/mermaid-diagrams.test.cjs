const { test, assert, load } = require('./helpers.cjs');

// The renderer's address comes from the bundler; any value stands in for it here.
const RENDERER_URL = { './mermaid-renderer-url': { rendererUrl: '/renderer.js' } };
const { diagramSource } = load('src/lib/mermaid-diagrams.ts', RENDERER_URL);

for (const [label, language, text, expected] of [
  ['a block tagged mermaid', 'mermaid', 'flowchart LR\n  A --> B\n', 'flowchart LR\n  A --> B'],
  ['an untagged flowchart', null, 'flowchart LR\n  U[Users] --> R[Routing]', 'flowchart LR\n  U[Users] --> R[Routing]'],
  ['an untagged graph with a direction', undefined, 'graph TD\n  A --> B', 'graph TD\n  A --> B'],
  ['an untagged sequence diagram', '', 'sequenceDiagram\n  participant P as Primary', 'sequenceDiagram\n  participant P as Primary'],
  ['an untagged diagram after comments and blank lines', null, '%% failover\n\nflowchart TB\n  A --> B', '%% failover\n\nflowchart TB\n  A --> B'],
  ['an untagged pie chart with a title', null, 'pie title Pets\n  "Dogs" : 3', 'pie title Pets\n  "Dogs" : 3'],
]) {
  test(`${label} is treated as a diagram`, () => assert.equal(diagramSource(language, text), expected));
}

for (const [label, language, text] of [
  ['a block tagged with another language', 'javascript', 'flowchart LR\n  A --> B'],
  ['untagged code that only mentions a graph', null, 'const graph = buildGraph();'],
  ['untagged prose starting with the word graph', null, 'graph of sales by region'],
  ['an untagged block starting with the word pie', null, 'pie is a dessert'],
  ['a keyword that is not on the first content line', null, 'echo hello\nflowchart LR'],
  ['an empty block tagged mermaid', 'mermaid', '   \n'],
]) {
  test(`${label} stays a code block`, () => assert.equal(diagramSource(language, text), null));
}

// Drawing is exercised in a DOM. The real renderer needs a browser layout engine, so `render`
// stands in for it; everything around it (detection, sanitizing, fallback, placement) is real.
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>');
const { document } = dom.window;
// The editor reads these when it is first required.
for (const name of ['window', 'document', 'navigator', 'Node', 'Element', 'HTMLElement', 'MutationObserver', 'getComputedStyle', 'DOMParser']) {
  Object.defineProperty(globalThis, name, { value: name === 'window' ? dom.window : dom.window[name], configurable: true, writable: true });
}
const { Editor } = require('@tiptap/core');
const { StarterKit } = require('@tiptap/starter-kit');

function diagrams(render) {
  const calls = [];
  const mermaid = { initialize: config => calls.push(config), render: async (...input) => (calls.push(input), render(...input)) };
  // The page already has the renderer, as it does after the first diagram's script has loaded.
  const loaded = load('src/lib/mermaid-diagrams.ts', {
    ...RENDERER_URL,
    dompurify: { __esModule: true, default: require('dompurify')(dom.window) },
  }, { document, window: { mermaid } });
  return { ...loaded, calls };
}

function rendered(html) {
  const container = document.createElement('div');
  container.innerHTML = html;
  document.body.replaceChildren(container);
  return container;
}

const drawn = () => new Promise(resolve => setTimeout(resolve, 20));
const FLOWCHART = '<pre><code class="language-mermaid">flowchart LR\n  A --&gt; B</code></pre>';
const ORDINARY = '<pre><code class="language-js">const graph = 1;</code></pre>';

test('a diagram block in rendered content is replaced by its drawing, once', async () => {
  const { renderDiagrams } = diagrams(async () => ({ svg: '<svg><text>Users</text></svg>' }));
  const container = rendered(FLOWCHART + ORDINARY);
  renderDiagrams(container);
  await drawn();
  renderDiagrams(container);
  await drawn();
  const [diagram, ordinary] = container.querySelectorAll('pre');
  assert.equal(container.querySelectorAll('.mermaid-diagram').length, 1);
  assert.equal(diagram.previousElementSibling.dataset.state, 'drawn');
  assert.equal(diagram.previousElementSibling.querySelector('text').textContent, 'Users');
  assert.equal(diagram.hidden, true);
  assert.equal(ordinary.hidden, false);
});

test('a diagram whose line breaks arrive as <br> elements is drawn from the source as it was written', async () => {
  // The description renderer can turn the line breaks inside a code block into <br> elements.
  const { commentHtml } = load('src/lib/comment-html.ts', { 'isomorphic-dompurify': { default: require('isomorphic-dompurify') }, marked: require('marked') });
  const { renderDiagrams, calls } = diagrams(async () => ({ svg: '<svg><text>Users</text></svg>' }));
  // That happens when the description opens with plain text and the block follows on the same line.
  const container = rendered(commentHtml(`Failover plan ${FLOWCHART}`));
  renderDiagrams(container);
  await drawn();
  assert.deepEqual(calls.filter(Array.isArray).map(([, source]) => source), ['flowchart LR\n  A --> B']);
});

test('content without a diagram never reaches the renderer', async () => {
  const { renderDiagrams, calls } = diagrams(async () => ({ svg: '<svg></svg>' }));
  const container = rendered(ORDINARY);
  renderDiagrams(container);
  await drawn();
  assert.equal(calls.length, 0);
  assert.equal(container.querySelectorAll('.mermaid-diagram').length, 0);
});

test('a diagram that cannot be drawn keeps its code block and shows a short reason', async () => {
  const { renderDiagrams } = diagrams(async () => { throw new Error('Parse error on line 2:\nflowchart LR  A --&gt;\n-----^'); });
  const container = rendered(FLOWCHART);
  renderDiagrams(container);
  await drawn();
  const pre = container.querySelector('pre');
  assert.equal(pre.hidden, false);
  assert.equal(pre.previousElementSibling.dataset.state, 'error');
  assert.equal(pre.previousElementSibling.textContent, 'Diagram could not be drawn: Parse error on line 2:');
});

test('markup that could run code is removed from a drawing', async () => {
  const { renderDiagrams } = diagrams(async () => ({
    svg: '<svg onload="pwn()"><script>pwn()</script><foreignObject><img src="x" onerror="pwn()"></foreignObject>'
      + '<a href="javascript:pwn()"><text onclick="pwn()">Users</text></a></svg>',
  }));
  const container = rendered(FLOWCHART);
  renderDiagrams(container);
  await drawn();
  const box = container.querySelector('.mermaid-diagram');
  assert.equal(box.querySelector('text').textContent, 'Users');
  assert.equal(box.querySelector('script, foreignObject, img'), null);
  const attributes = [...box.querySelectorAll('*')].flatMap(element => [...element.attributes]);
  assert.deepEqual(attributes.filter(({ name, value }) => name.startsWith('on') || /^\s*javascript:/i.test(value)).map(({ name }) => name), []);
});

test('a drawing is fitted to its block: at most its natural size, and no smaller than two fifths of it', async () => {
  const { renderDiagrams } = diagrams(async () => ({ svg: '<svg viewBox="0 0 1800 600"><text>Users</text></svg>' }));
  const container = rendered(FLOWCHART);
  renderDiagrams(container);
  await drawn();
  const { width, maxWidth, minWidth } = container.querySelector('.mermaid-diagram svg').style;
  assert.deepEqual({ width, maxWidth, minWidth }, { width: '100%', maxWidth: '1800px', minWidth: '720px' });
});

// The stylesheet's diagram rules decide whether a diagram's source is displayed in the note editor.
const styles = require('node:fs').readFileSync(require('node:path').resolve(process.env.SECURITY_TEST_ROOT || `${__dirname}/../..`, 'src/app/globals.css'), 'utf8');
document.head.appendChild(document.createElement('style')).textContent = styles.slice(styles.indexOf('/* Mermaid diagrams'));
const displayed = element => dom.window.getComputedStyle(element).display !== 'none';

// The note editor with the diagram extension, next to a plain editor with the same content to compare what is saved.
function noteEditors(render) {
  const { MermaidPreviewExtension } = load('src/components/RichEditor/extensions/mermaid-preview-extension.ts', {
    '@tiptap/core': require('@tiptap/core'),
    '@tiptap/pm/state': require('@tiptap/pm/state'),
    '@tiptap/pm/view': require('@tiptap/pm/view'),
    '@/lib/mermaid-diagrams': diagrams(render),
  }, { document });
  const content = `<p>Failover</p><pre><code>sequenceDiagram\n  Primary-&gt;&gt;Standby: ping</code></pre>${ORDINARY}`;
  const editor = extensions => new Editor({ element: document.body.appendChild(document.createElement('div')), extensions, content });
  const plain = editor([StarterKit]);
  const withDiagrams = editor([StarterKit, MermaidPreviewExtension]);
  const preview = () => withDiagrams.view.dom.querySelector('.mermaid-preview');
  return {
    plain, withDiagrams, preview,
    source: () => preview().nextElementSibling,
    control: () => preview().querySelector('button'),
    close() { plain.destroy(); withDiagrams.destroy(); },
  };
}
const drawing = async () => ({ svg: '<svg><text>Primary</text></svg>' });

test('the note editor shows a diagram in place of its source and keeps the saved content the same', async () => {
  const { plain, withDiagrams, preview, source, close } = noteEditors(drawing);
  await drawn();
  assert.equal(withDiagrams.view.dom.querySelectorAll('.mermaid-preview').length, 1);
  assert.equal(preview().querySelector('.mermaid-diagram text').textContent, 'Primary');
  assert.match(source().textContent, /^sequenceDiagram/);
  assert.equal(displayed(source()), false);
  const ordinary = withDiagrams.view.dom.querySelectorAll('pre')[1];
  assert.equal(displayed(ordinary), true);
  assert.equal(withDiagrams.getHTML(), plain.getHTML());
  close();
});

test('the source of a diagram opens and closes with the control under it', async () => {
  const { plain, withDiagrams, source, control, close } = noteEditors(drawing);
  await drawn();
  assert.deepEqual([control().textContent, control().getAttribute('aria-expanded')], ['Show source', 'false']);
  control().focus();
  control().click();
  assert.equal(displayed(source()), true);
  assert.deepEqual([control().textContent, control().getAttribute('aria-expanded')], ['Hide source', 'true']);
  assert.equal(document.activeElement, control());
  control().click();
  assert.equal(displayed(source()), false);
  assert.equal(document.activeElement, control());
  assert.equal(withDiagrams.getHTML(), plain.getHTML());
  close();
});

test('the source of a diagram is shown while the cursor is in it', async () => {
  const { withDiagrams, source, control, close } = noteEditors(drawing);
  await drawn();
  let block;
  withDiagrams.state.doc.descendants((node, position) => { if (block === undefined && node.type.name === 'codeBlock') block = position; });
  withDiagrams.commands.setTextSelection(block + 2);
  assert.equal(displayed(source()), true);
  assert.deepEqual([control().textContent, control().getAttribute('aria-expanded'), control().disabled], ['Hide source', 'true', true]);
  withDiagrams.commands.setTextSelection(1);
  assert.equal(displayed(source()), false);
  assert.deepEqual([control().textContent, control().getAttribute('aria-expanded'), control().disabled], ['Show source', 'false', false]);
  close();
});

test('a diagram that cannot be drawn in the note editor keeps its source in view under a short reason', async () => {
  const { preview, source, control, close } = noteEditors(async () => { throw new Error('Parse error on line 2:\nsequenceDiagram'); });
  await drawn();
  assert.equal(preview().querySelector('.mermaid-diagram').textContent, 'Diagram could not be drawn: Parse error on line 2:');
  assert.equal(displayed(source()), true);
  assert.deepEqual([control().textContent, control().getAttribute('aria-expanded'), control().disabled], ['Hide source', 'true', true]);
  close();
});

test('an open diagram follows insertions but does not transfer to a following diagram when deleted', async () => {
  const { withDiagrams, control, close } = noteEditors(drawing);
  await drawn();
  let block;
  withDiagrams.state.doc.descendants((node, position) => { if (block === undefined && node.type.name === 'codeBlock') block = position; });
  const original = withDiagrams.state.doc.nodeAt(block);
  withDiagrams.view.dispatch(withDiagrams.state.tr.insert(block + original.nodeSize, original));
  control().click();
  withDiagrams.view.dispatch(withDiagrams.state.tr.insertText('x', 1));
  let controls = withDiagrams.view.dom.querySelectorAll('.mermaid-preview button');
  assert.deepEqual([...controls].map(button => button.getAttribute('aria-expanded')), ['true', 'false']);
  withDiagrams.view.dispatch(withDiagrams.state.tr.delete(block + 1, block + 1 + original.nodeSize));
  controls = withDiagrams.view.dom.querySelectorAll('.mermaid-preview button');
  assert.deepEqual([...controls].map(button => button.getAttribute('aria-expanded')), ['false']);
  close();
});
