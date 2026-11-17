const { assert, test, load } = require('../security/helpers.cjs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<div id="root"></div>', { url: 'https://collab.test/weezboo/context' });
global.window = dom.window; global.document = dom.window.document; global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { createRoot } = require('react-dom/client');

// The Context page as a whole: a folder opened from a link is shown where it is in the tree, and a
// file that finishes uploading after another folder was opened does not change that folder's list.
const h = React.createElement;
const icons = new Proxy({}, { get: () => () => null });
const pass = ({ children }) => h(React.Fragment, null, children);
const jsx = { react: React, 'react/jsx-runtime': require('react/jsx-runtime'), 'lucide-react': icons };
const preview = load('src/lib/context-file-preview.ts', {}, { TextDecoder });

let routes = {};
const asked = [];
const fetch = async (url, init = {}) => {
  asked.push(`${init.method ?? 'GET'} ${url}`);
  const answer = await routes[`${init.method ?? 'GET'} ${url.split('?')[0]}`](new URL(url, 'https://collab.test').searchParams);
  return { ok: true, json: async () => answer };
};

const { ContextBrowser } = load('src/components/context/ContextBrowser.tsx', {
  ...jsx,
  'next/navigation': { useRouter: () => ({ replace: () => {}, push: () => {} }) },
  '@/components/ui/button': { Button: ({ asChild, children, ...props }) => (asChild ? children : h('button', props, children)) },
  '@/components/ui/dropdown-menu': {
    DropdownMenu: pass, DropdownMenuTrigger: pass, DropdownMenuContent: pass,
    DropdownMenuItem: ({ children, onSelect, disabled }) => h('button', { type: 'button', disabled, onClick: onSelect, 'data-menu': true }, children),
  },
  '@/components/ui/input-dialog': { InputDialog: () => null },
  '@/components/context/ContextFilePreview': { ContextFilePreview: () => null },
  '@/components/context/ContextItemList': load('src/components/context/ContextItemList.tsx', { ...jsx, '@/lib/context-file-preview': preview }),
  '@/components/context/ContextTree': load('src/components/context/ContextTree.tsx', jsx),
}, { fetch, URLSearchParams, FormData: dom.window.FormData, console });

const root = createRoot(document.getElementById('root'));
const settle = () => React.act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
const tree = () => [...document.querySelectorAll('[role="treeitem"]')].map(row => row.textContent);
const list = () => [...document.querySelectorAll('[role="option"]')].map(row => row.textContent);

const folders = [
  { id: 'ideas', name: 'Ideas', parentId: null },
  { id: 'drafts', name: 'Drafts', parentId: 'ideas' },
  { id: 'specs', name: 'Specs', parentId: null },
];
const file = (id) => ({ id, name: id, mimeType: 'text/plain', size: 1, updatedAt: '2026-11-17T09:00:00Z' });

test('a nested folder opened from a link is shown open in the tree', async () => {
  routes = {
    'GET /api/context/folders': () => ({ folders }),
    'GET /api/context/items': () => ({ notes: [], files: [] }),
  };
  await React.act(async () => root.render(h(ContextBrowser, {
    workspaceId: 'w', workspaceSlug: 'weezboo', projects: [], initialFolderId: 'drafts',
  })));
  await settle();
  assert.deepEqual(tree(), ['Workspace', 'Ideas', 'Drafts', 'Specs']);
  const open = document.querySelector('[role="treeitem"][aria-selected="true"]');
  assert.equal(open.textContent, 'Drafts');
  assert.equal(open.tabIndex, 0);
  await React.act(async () => root.render(null));
});

test('an upload that ends after another folder was opened leaves that folder\'s list alone', async () => {
  let finishUpload;
  const filesOf = { ideas: [file('old.txt')], specs: [file('spec.txt')] };
  routes = {
    'GET /api/context/folders': () => ({ folders }),
    'GET /api/context/items': query => ({ notes: [], files: filesOf[query.get('folder')] ?? [] }),
    'POST /api/context/files': () => new Promise(resolve => { finishUpload = resolve; }),
  };
  await React.act(async () => root.render(h(ContextBrowser, {
    workspaceId: 'w', workspaceSlug: 'weezboo', projects: [], initialFolderId: 'ideas',
  })));
  await settle();
  assert.ok(list().some(row => row.startsWith('old.txt')));
  const readsOfIdeas = () => asked.filter(call => call === 'GET /api/context/items?folder=ideas').length;
  const before = readsOfIdeas();

  // Upload into Ideas, then open Specs before the upload is done.
  const input = document.querySelector('input[type="file"]');
  Object.defineProperty(input, 'files', { configurable: true, value: [new dom.window.File(['x'], 'new.txt')] });
  await React.act(async () => { input.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
  [...document.querySelectorAll('[role="treeitem"]')].find(row => row.textContent === 'Specs').click();
  await settle();
  assert.ok(list().some(row => row.startsWith('spec.txt')));

  filesOf.ideas = [file('new.txt'), file('old.txt')];
  await React.act(async () => { finishUpload({ id: 'new.txt' }); });
  await settle();
  // The finished upload did read its folder again; what it read is not drawn over Specs.
  assert.equal(readsOfIdeas(), before + 1);
  assert.ok(list().some(row => row.startsWith('spec.txt')));
  assert.ok(!list().some(row => row.startsWith('new.txt') || row.startsWith('old.txt')));
  await React.act(async () => root.render(null));
});
