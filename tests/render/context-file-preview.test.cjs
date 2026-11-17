const { assert, test, load } = require('../security/helpers.cjs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<div id="root"></div>', { url: 'https://collab.test/weezboo/context' });
global.window = dom.window; global.document = dom.window.document; global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { createRoot } = require('react-dom/client');

// Showing a file: what each of the four kinds draws, and that nothing a file carries is ever run.
const asked = [];
let reply = { ok: true, json: async () => ({}) };
const Component = load('src/components/context/ContextFilePreview.tsx', {
  react: React, 'react/jsx-runtime': require('react/jsx-runtime'),
  '@/lib/context-file-preview': load('src/lib/context-file-preview.ts', {}, { TextDecoder }),
}, {
  fetch: async url => { asked.push(url); return reply; },
}).ContextFilePreview;

const root = createRoot(document.getElementById('root'));
const show = async (file, answer) => {
  reply = { ok: true, json: async () => answer ?? {} };
  await React.act(async () => root.render(React.createElement(Component, { file })));
};
/** A reply that did not come back as a preview: a failure, or a body no parser could read. */
const showFailed = async (file, failed) => {
  reply = failed;
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

    // A CSV is a table, and it says how many rows are here when the file holds more. The count is the
    // rows that are here, not the stated limit: a file of wide rows runs out of bytes before rows.
    await show({ id: 'f2', name: 'rows.csv', mimeType: 'text/plain', size: 90 },
      { kind: 'csv', rows: [['name', 'count'], ['a, b', '2']], rowLimit: 200, hasMore: true });
    assert.deepEqual([...document.querySelectorAll('th')].map(cell => cell.textContent), ['name', 'count']);
    assert.deepEqual([...document.querySelectorAll('td')].map(cell => cell.textContent), ['a, b', '2']);
    assert.match(document.body.textContent, /The first 2 rows are shown\. This file has more\./);

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
    // A browser that will not open a PDF under that seal is not given it unsealed: the file downloads.
    assert.match(document.body.textContent, /If it does not appear, download the file/);
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

    // A CSV whose first row is longer than the bytes that were read has no rows to show, but it is not
    // an empty file, and it is not told it is one.
    await show({ id: 'f6', name: 'wide.csv', mimeType: 'text/plain', size: 4 * 1024 * 1024 },
      { kind: 'csv', rows: [], rowLimit: 200, hasMore: true });
    assert.match(document.body.textContent, /The first row of this file is too long to show/);
    await show({ id: 'f7', name: 'nothing.csv', mimeType: 'text/plain', size: 0 },
      { kind: 'csv', rows: [], rowLimit: 200, hasMore: false });
    assert.match(document.body.textContent, /This file is empty\./);

    // A reply that is not a preview says so in Collab's words: what a parser calls a body is not for
    // a member to read.
    await showFailed({ id: 'f8', name: 'notes.txt', mimeType: 'text/plain', size: 12 },
      { ok: false, json: async () => { throw new SyntaxError('Unexpected token < in JSON at position 0'); } });
    assert.equal(document.body.textContent.includes('JSON'), false);
    assert.match(document.body.textContent, /This file could not be read/);
    // The server's own words are kept when it sent any.
    await showFailed({ id: 'f9', name: 'notes.txt', mimeType: 'text/plain', size: 12 },
      { ok: false, json: async () => ({ error: 'File not found' }) });
    assert.match(document.body.textContent, /File not found/);
  } finally { await React.act(async () => root.unmount()); dom.window.close(); }
});
