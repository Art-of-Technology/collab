const { assert, test, load } = require('../security/helpers.cjs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<div id="root"></div>', { url: 'https://collab.test/weezboo/context' });
global.window = dom.window; global.document = dom.window.document; global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { createRoot } = require('react-dom/client');

// Showing a file: what each of the four kinds draws, and that nothing a file carries is ever run.
const asked = [];
let answer = {};
const Component = load('src/components/context/ContextFilePreview.tsx', {
  react: React, 'react/jsx-runtime': require('react/jsx-runtime'),
  '@/lib/context-file-preview': load('src/lib/context-file-preview.ts', {}, { TextDecoder }),
}, {
  fetch: async url => { asked.push(url); return { ok: true, json: async () => answer }; },
}).ContextFilePreview;

const root = createRoot(document.getElementById('root'));
const show = async (file, reply) => {
  answer = reply ?? {};
  await React.act(async () => root.render(React.createElement(Component, { file })));
};

test('a preview shows an image, a PDF, text and a table, and runs nothing inside the file', async () => {
  try {
    // A file that says it is HTML is read as text: React escapes it, so no element of it reaches the page.
    await show({ id: 'f1', name: 'report.html', mimeType: 'text/html', size: 40 },
      { kind: 'text', text: '<script>alert(1)</script>', truncated: true });
    assert.deepEqual(asked, ['/api/context/files/f1/preview']);
    assert.equal(document.querySelector('pre').textContent, '<script>alert(1)</script>');
    assert.equal(document.querySelector('script'), null);
    assert.match(document.body.innerHTML, /&lt;script&gt;/);
    assert.match(document.body.textContent, /Only the start of this file is shown/);

    // A CSV is a table, and it says when the file holds more rows than it shows.
    await show({ id: 'f2', name: 'rows.csv', mimeType: 'text/plain', size: 90 },
      { kind: 'csv', rows: [['name', 'count'], ['a, b', '2']], rowLimit: 200, hasMore: true });
    assert.deepEqual([...document.querySelectorAll('th')].map(cell => cell.textContent), ['name', 'count']);
    assert.deepEqual([...document.querySelectorAll('td')].map(cell => cell.textContent), ['a, b', '2']);
    assert.match(document.body.textContent, /The first 200 rows are shown\. This file has more\./);

    // An image and a PDF are drawn from the preview address itself, and nothing is read here.
    const reads = asked.length;
    await show({ id: 'f3', name: 'sketch.png', mimeType: 'image/png', size: 2048 });
    assert.equal(document.querySelector('img').getAttribute('src'), '/api/context/files/f3/preview');
    assert.equal(document.querySelector('img').getAttribute('alt'), 'sketch.png');

    await show({ id: 'f4', name: 'plan.pdf', mimeType: 'application/pdf', size: 3 * 1024 * 1024 });
    const frame = document.querySelector('iframe');
    assert.equal(frame.getAttribute('src'), '/api/context/files/f4/preview');
    // An origin of its own: the browser's viewer runs, the file reaches neither Collab nor this page.
    assert.equal(frame.getAttribute('sandbox'), 'allow-scripts');
    assert.match(document.body.textContent, /3\.0 MB/);
    assert.equal(asked.length, reads);

    // Any other type is named, not shown, with a download beside it.
    await show({ id: 'f5', name: 'photos.zip', mimeType: 'application/zip', size: 1024 });
    assert.equal(document.querySelector('img'), null);
    assert.equal(document.querySelector('iframe'), null);
    assert.match(document.body.textContent, /photos\.zip/);
    assert.match(document.body.textContent, /application\/zip · 1\.0 KB/);
    assert.match(document.body.textContent, /not shown here/);
    assert.equal(document.querySelector('a[download]').getAttribute('href'), '/api/context/files/f5/download');
    assert.equal(asked.length, reads);
  } finally { await React.act(async () => root.unmount()); dom.window.close(); }
});
