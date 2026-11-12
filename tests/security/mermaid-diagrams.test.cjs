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
dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
// As in a browser, closing a dialog reports it with a close event a moment later.
dom.window.HTMLDialogElement.prototype.close = function () {
  if (!this.open) return;
  this.open = false;
  setTimeout(() => this.dispatchEvent(new dom.window.Event('close')));
};
// The editor reads these when it is first required.
for (const name of ['window', 'document', 'navigator', 'Node', 'Element', 'HTMLElement', 'MutationObserver', 'getComputedStyle', 'DOMParser']) {
  Object.defineProperty(globalThis, name, { value: name === 'window' ? dom.window : dom.window[name], configurable: true, writable: true });
}
const { Editor } = require('@tiptap/core');
const { StarterKit } = require('@tiptap/starter-kit');

function diagrams(render) {
  const calls = [];
  const mermaid = { initialize: config => calls.push(config), render: async (...input) => (calls.push(input), render(...input)) };
  dom.window.mermaid = mermaid;
  // The page already has the renderer, as it does after the first diagram's script has loaded.
  const loaded = load('src/lib/mermaid-diagrams.ts', {
    ...RENDERER_URL,
    dompurify: { __esModule: true, default: require('dompurify')(dom.window) },
  }, { document, window: dom.window, MutationObserver: dom.window.MutationObserver });
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

// A control of a drawing, found by what it says or by its accessible name.
const press = (box, name) => [...box.querySelectorAll('button')]
  .find(button => button.textContent === name || button.getAttribute('aria-label') === name).click();
const sizing = box => {
  const { width, maxWidth, minWidth } = box.querySelector('svg').style;
  return { width, maxWidth, minWidth, level: box.querySelector('output').textContent };
};
async function wideDrawing() {
  const { renderDiagrams } = diagrams(async () => ({ svg: '<svg viewBox="0 0 1800 600"><text>Users</text></svg>' }));
  const container = rendered(FLOWCHART);
  renderDiagrams(container);
  await drawn();
  return container.querySelector('.mermaid-diagram');
}

test('a drawing sits in its own scrolling area under a full screen control', async () => {
  const box = await wideDrawing();
  assert.equal(box.querySelector('.mermaid-diagram-canvas > svg text').textContent, 'Users');
  assert.deepEqual([...box.querySelectorAll('button')].filter(button => !('zoom' in button.dataset)).map(button => button.textContent), ['Full screen']);
  assert.equal(box.classList.contains('mermaid-diagram-full'), false);
});

test('a drawing opens over the whole window, zooms in steps, and returns to its fitted size', async () => {
  const box = await wideDrawing();
  const canvas = box.querySelector('.mermaid-diagram-canvas');
  const parent = box.parentNode;
  press(box, 'Full screen');
  await drawn();
  assert.equal(box.parentNode, parent);
  assert.equal(box.querySelector('dialog').open, true);
  assert.equal(box.querySelector('dialog .mermaid-diagram-canvas'), canvas);
  assert.equal(box.classList.contains('mermaid-diagram-full'), true);
  assert.deepEqual(sizing(box), { width: '1800px', maxWidth: 'none', minWidth: '0px', level: '100%' });
  press(box, 'Zoom in');
  assert.deepEqual(sizing(box), { width: '2250px', maxWidth: 'none', minWidth: '0px', level: '125%' });
  press(box, 'Zoom out');
  press(box, 'Zoom out');
  assert.deepEqual(sizing(box), { width: '1440px', maxWidth: 'none', minWidth: '0px', level: '80%' });
  press(box, 'Actual size');
  assert.equal(sizing(box).width, '1800px');
  press(box, 'Exit full screen');
  await drawn();
  assert.equal(box.classList.contains('mermaid-diagram-full'), false);
  assert.equal(box.querySelector(':scope > .mermaid-diagram-canvas'), canvas);
  assert.deepEqual(sizing(box), { width: '100%', maxWidth: '1800px', minWidth: '720px', level: '100%' });
});

test('Escape closes a drawing that covers the window', async () => {
  const box = await wideDrawing();
  press(box, 'Full screen');
  await drawn();
  box.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(box.classList.contains('mermaid-diagram-full'), false);
  assert.equal(sizing(box).width, '100%');
});

test('without modal dialogs the fallback restores the same drawing to its place', async () => {
  const box = await wideDrawing();
  const parent = box.parentNode;
  const canvas = box.querySelector('.mermaid-diagram-canvas');
  const showModal = dom.window.HTMLDialogElement.prototype.showModal;
  dom.window.HTMLDialogElement.prototype.showModal = undefined;
  try {
    press(box, 'Full screen');
    await drawn();
    assert.equal(box.parentNode, document.body);
    assert.equal(box.querySelector('.mermaid-diagram-canvas'), canvas);
    press(box, 'Exit full screen');
    assert.equal(box.parentNode, parent);
    assert.equal(box.querySelector('.mermaid-diagram-canvas'), canvas);
  } finally {
    dom.window.HTMLDialogElement.prototype.showModal = showModal;
  }
});

for (const modal of [true, false]) {
  test(`removing the owner cleans up the ${modal ? 'dialog' : 'body'} fallback`, async () => {
    const box = await wideDrawing();
    const owner = box.parentNode;
    const showModal = dom.window.HTMLDialogElement.prototype.showModal;
    if (!modal) dom.window.HTMLDialogElement.prototype.showModal = undefined;
    try {
      press(box, 'Full screen');
      await drawn();
      owner.replaceChildren();
      await drawn();
      assert.equal(box.isConnected, false);
      const escape = new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
      document.body.dispatchEvent(escape);
      assert.equal(escape.defaultPrevented, false);
    } finally {
      dom.window.HTMLDialogElement.prototype.showModal = showModal;
    }
  });
}

test('a drawing comes back to its block when the browser closes the covering view by itself', async () => {
  const box = await wideDrawing();
  press(box, 'Full screen');
  await drawn();
  // What a back gesture or another close request from the browser does: no key or control of ours is involved.
  box.querySelector('dialog').close();
  await drawn();
  assert.equal(box.isConnected, true);
  assert.equal(box.classList.contains('mermaid-diagram-full'), false);
  assert.equal(box.querySelector(':scope > .mermaid-diagram-canvas > svg text').textContent, 'Users');
  assert.equal(box.querySelector('dialog'), null);
  assert.equal(sizing(box).width, '100%');
  press(box, 'Full screen');
  await drawn();
  assert.equal(box.querySelector('dialog').open, true);
});

for (const native of [false, true]) {
  test(`a queued dialog close does not dismiss a reopened ${native ? 'native' : 'fallback'} view`, async () => {
    const box = await wideDrawing();
    press(box, 'Full screen');
    await drawn();
    press(box, 'Exit full screen');
    if (native) {
      box.requestFullscreen = () => {
        Object.defineProperty(document, 'fullscreenElement', { value: box, configurable: true });
        box.dispatchEvent(new dom.window.Event('fullscreenchange'));
        return Promise.resolve();
      };
    }
    try {
      press(box, 'Full screen');
      await drawn();
      assert.equal(box.classList.contains('mermaid-diagram-full'), true);
      if (!native) assert.equal(box.querySelector('dialog').open, true);
    } finally {
      delete document.fullscreenElement;
    }
  });
}

test('fitting to the window may shrink a very wide drawing below one tenth', async () => {
  const { renderDiagrams } = diagrams(async () => ({ svg: '<svg viewBox="0 0 20000 400"><text>Users</text></svg>' }));
  const container = rendered(FLOWCHART);
  renderDiagrams(container);
  await drawn();
  const box = container.querySelector('.mermaid-diagram');
  press(box, 'Full screen');
  await drawn();
  const canvas = box.querySelector('.mermaid-diagram-canvas');
  Object.defineProperties(canvas, { clientWidth: { value: 1000 }, clientHeight: { value: 800 } });
  press(box, 'Fit to window');
  assert.deepEqual([sizing(box).width, sizing(box).level], ['1000px', '5%']);
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
    control: () => preview().querySelector(':scope > button'),
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
