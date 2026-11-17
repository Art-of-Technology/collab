const { assert, test, load } = require('../security/helpers.cjs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<div id="root"></div>', { url: 'https://collab.test/weezboo/context' });
global.window = dom.window; global.document = dom.window.document; global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { createRoot } = require('react-dom/client');

// The folder tree and the folder's list are used without a mouse: one row is in the tab order, the
// arrow keys move between rows and open or close them, and Enter opens what is focused.
const icons = new Proxy({}, { get: () => () => null });
const deps = { react: React, 'react/jsx-runtime': require('react/jsx-runtime'), 'lucide-react': icons };
const { ContextTree, folderKey, rootKey } = load('src/components/context/ContextTree.tsx', deps);
const { ContextItemList } = load('src/components/context/ContextItemList.tsx', {
  ...deps, '@/lib/context-file-preview': load('src/lib/context-file-preview.ts', {}, { TextDecoder }),
});

const root = createRoot(document.getElementById('root'));
// What a key changed outside the component, as the page would, is drawn again once the key is handled.
let redraw = null;
const press = async (key) => {
  const event = new dom.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  await React.act(async () => { document.activeElement.dispatchEvent(event); });
  if (redraw) { const again = redraw; redraw = null; await again(); }
};
const focused = () => document.activeElement.textContent;

test('the folder tree is walked, opened and closed with the keyboard', async () => {
  const roots = [{ projectId: null, name: 'Workspace' }, { projectId: 'p1', name: 'Website' }];
  const folders = [
    { id: 'ideas', name: 'Ideas', parentId: null },
    { id: 'drafts', name: 'Drafts', parentId: 'ideas' },
    { id: 'specs', name: 'Specs', parentId: null },
  ];
  let expanded = new Set([rootKey(null)]);
  const opened = [];
  const draw = () => React.act(async () => root.render(React.createElement(ContextTree, {
    roots, folders, levelProjectId: null, openFolderId: null, expanded,
    onExpand: (row, open) => {
      const key = row.folderId ? folderKey(row.folderId) : rootKey(row.projectId);
      expanded = new Set(expanded);
      if (open) expanded.add(key); else expanded.delete(key);
      redraw = draw;
    },
    onOpen: row => opened.push(row.folderId ?? `root:${row.projectId}`),
  })));
  await draw();

  const rows = () => [...document.querySelectorAll('[role="treeitem"]')];
  assert.deepEqual(rows().map(row => row.textContent), ['Workspace', 'Ideas', 'Specs', 'Website']);
  // Only the open row is a tab stop.
  assert.deepEqual(rows().map(row => row.tabIndex), [0, -1, -1, -1]);

  rows()[0].focus();
  await press('ArrowDown');
  assert.equal(focused(), 'Ideas');
  // Right shows the folders under it, and right again steps into them.
  await press('ArrowRight');
  assert.deepEqual(rows().map(row => row.textContent), ['Workspace', 'Ideas', 'Drafts', 'Specs', 'Website']);
  assert.equal(document.activeElement.getAttribute('aria-expanded'), 'true');
  await press('ArrowRight');
  assert.equal(focused(), 'Drafts');
  // Left steps back out to the folder it hangs from, and left again puts its children away.
  await press('ArrowLeft');
  assert.equal(focused(), 'Ideas');
  await press('ArrowLeft');
  assert.deepEqual(rows().map(row => row.textContent), ['Workspace', 'Ideas', 'Specs', 'Website']);
  await press('ArrowDown');
  await press('Enter');
  assert.deepEqual(opened, ['specs']);
  // The focused row keeps the tab stop, so tabbing away and back returns to it.
  assert.deepEqual(rows().map(row => row.tabIndex), [-1, -1, 0, -1]);
});

test('the list of a folder is walked and opened with the keyboard', async () => {
  const items = [
    { kind: 'folder', id: 'drafts', name: 'Drafts' },
    { kind: 'note', id: 'plan', name: 'Plan', noteType: 'GENERAL', updatedAt: '2026-11-17T09:00:00Z' },
    { kind: 'file', id: 'sketch', name: 'sketch.png', mimeType: 'image/png', size: 2048, updatedAt: '2026-11-17T09:00:00Z' },
  ];
  const opened = [];
  await React.act(async () => root.render(React.createElement(ContextItemList, {
    items, selectedId: null, onOpen: item => opened.push(item.id), emptyText: 'Empty',
  })));
  const options = [...document.querySelectorAll('[role="option"]')];
  assert.deepEqual(options.map(row => row.tabIndex), [0, -1, -1]);
  options[0].focus();
  await press('End');
  assert.match(focused(), /^sketch\.png/);
  await press('ArrowUp');
  assert.match(focused(), /^Plan/);
  await press('Enter');
  await press('Home');
  await press(' ');
  assert.deepEqual(opened, ['plan', 'drafts']);
});
