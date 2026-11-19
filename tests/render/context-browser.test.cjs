const { assert, test, load } = require('../security/helpers.cjs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<div id="root"></div>', { url: 'https://collab.test/weezboo/context' });
global.window = dom.window; global.document = dom.window.document; global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { createRoot } = require('react-dom/client');

// The Context page as a whole: a folder opened from a link is shown where it is in the tree, a file
// that finishes uploading after another folder was opened does not change that folder's list, and a
// Note is opened, listed and made on this page, never on another.
const h = React.createElement;
const icons = new Proxy({}, { get: () => () => null });
const pass = ({ children }) => h(React.Fragment, null, children);
const jsx = { react: React, 'react/jsx-runtime': require('react/jsx-runtime'), 'lucide-react': icons };
const preview = load('src/lib/context-file-preview.ts', {}, { TextDecoder });

let routes = {};
let address = '';
const pushed = [];
const asked = [];
const posted = {};
const fetch = async (url, init = {}) => {
  asked.push(`${init.method ?? 'GET'} ${url}`);
  if (typeof init.body === 'string') posted[`${init.method} ${url.split('?')[0]}`] = init.body;
  const answer = await routes[`${init.method ?? 'GET'} ${url.split('?')[0]}`](new URL(url, 'https://collab.test').searchParams);
  // A route that answers with an Error is a read that failed.
  if (answer instanceof Error) return { ok: false, json: async () => ({ error: answer.message }) };
  return { ok: true, json: async () => answer };
};

const { ContextBrowser } = load('src/components/context/ContextBrowser.tsx', {
  ...jsx,
  'next/navigation': { useRouter: () => ({ replace: url => { address = url; }, push: url => { pushed.push(url); } }) },
  '@/components/ui/button': { Button: ({ asChild, children, ...props }) => (asChild ? children : h('button', props, children)) },
  '@/components/ui/dropdown-menu': {
    DropdownMenu: pass, DropdownMenuTrigger: pass, DropdownMenuContent: pass,
    DropdownMenuItem: ({ children, onSelect, disabled }) => h('button', { type: 'button', disabled, onClick: onSelect, 'data-menu': true }, children),
  },
  '@/components/ui/input-dialog': { InputDialog: ({ open, onConfirm }) => open ? h('button', { onClick: () => onConfirm('New folder') }, 'Confirm') : null },
  '@/components/context/ContextFilePreview': { ContextFilePreview: () => null },
  '@/components/context/ContextNotePane': { ContextNotePane: ({ noteId, pinned, onClose, onDelete, onPin, onSaved }) => h('div', null,
    h('button', { 'data-note-pane': noteId, 'data-pinned': String(pinned), onClick: onClose }, 'Close'),
    h('button', { onClick: onDelete }, 'Delete'),
    h('button', { onClick: () => onPin(!pinned) }, pinned ? 'Unpin' : 'Pin'),
    h('button', { onClick: () => onSaved({ title: 'Renamed', type: 'DECISION' }) }, 'Save as Renamed')) },
  '@/components/notes/TemplatePickerDialog': { TemplatePickerDialog: ({ open, onSelectTemplate, onStartBlank, onOpenChange }) => open ? h(React.Fragment, null, h('button', { onClick: () => onSelectTemplate({ id: 'decision' }, 'Use Postgres') }, 'Use template'), h('button', { onClick: () => { onStartBlank(); onOpenChange(false); } }, 'Start blank')) : null },
  '@/components/ui/select': {
    Select: ({ value, onValueChange, children }) => h('select', { 'aria-label': 'Note type', value, onChange: event => onValueChange(event.target.value) }, children),
    SelectTrigger: () => null, SelectValue: () => null, SelectContent: pass,
    SelectItem: ({ value, children }) => h('option', { value }, children),
  },
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
  assert.deepEqual(tree(), ['Pinned', 'Personal', 'Shared', 'Workspace', 'Ideas', 'Drafts', 'Specs']);
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

test('a folder that cannot be read lists nothing of the folder open before it', async () => {
  routes = {
    'GET /api/context/folders': () => ({ folders }),
    'GET /api/context/items': query => (query.get('folder') === 'specs'
      ? new Error('This folder could not be read')
      : { notes: [{ id: 'plan', title: 'Plan', type: 'GENERAL', updatedAt: '2026-11-17T09:00:00Z' }], files: [file('old.txt')] }),
  };
  await React.act(async () => root.render(h(ContextBrowser, {
    workspaceId: 'w', workspaceSlug: 'weezboo', projects: [], initialFolderId: 'ideas',
  })));
  await settle();
  assert.ok(list().some(row => row.startsWith('old.txt')));
  [...document.querySelectorAll('[role="treeitem"]')].find(row => row.textContent === 'Specs').click();
  await settle();
  assert.equal(document.querySelector('[role="alert"]').textContent, 'This folder could not be read');
  assert.deepEqual(list(), []);
  await React.act(async () => root.render(null));
});


test('creating a folder does not take over a location opened while the request is pending', async () => {
  let finishCreation;
  routes = {
    'GET /api/context/folders': query => ({ folders: query.get('project') ? [{ id: 'project-folder', name: 'Project folder', parentId: null }] : folders }),
    'GET /api/context/items': () => ({ notes: [], files: [] }),
    'POST /api/context/folders': () => new Promise(resolve => { finishCreation = resolve; }),
  };
  await React.act(async () => root.render(h(ContextBrowser, { workspaceId: 'w', workspaceSlug: 'weezboo', projects: [{ id: 'p', name: 'Project' }] })));
  await settle();
  await React.act(async () => { [...document.querySelectorAll('[data-menu]')].find(row => row.textContent === 'Folder').click(); });
  await React.act(async () => { [...document.querySelectorAll('button')].find(row => row.textContent === 'Confirm').click(); });
  await React.act(async () => { [...document.querySelectorAll('[role="treeitem"]')].find(row => row.textContent === 'Project').click(); });
  await settle();
  await React.act(async () => { finishCreation({ id: 'created' }); });
  await settle();
  assert.equal(document.querySelector('[role="treeitem"][aria-selected="true"]').textContent, 'Project');
  assert.ok(tree().includes('Project folder'));
  assert.ok(!tree().includes('Ideas'));
  await React.act(async () => root.render(null));
});

const note = (id, fields = {}) => ({ id, title: id, type: 'GENERAL', updatedAt: '2026-11-17T09:00:00Z', isPinned: false, ...fields });
const click = text => React.act(async () => { [...document.querySelectorAll('button')].find(row => row.textContent.startsWith(text)).click(); });

test('a Note opens beside the list on this page, its address can be opened again, and closing it stays here', async () => {
  routes = {
    'GET /api/context/folders': () => ({ folders }),
    'GET /api/context/items': () => ({ notes: [note('Plan', { isPinned: true }), note('Decision', { type: 'DECISION' })], files: [] }),
  };
  pushed.length = 0;
  await React.act(async () => root.render(h(ContextBrowser, {
    workspaceId: 'w', workspaceSlug: 'weezboo', projects: [], initialFolderId: 'ideas',
  })));
  await settle();
  await click('Plan');
  assert.equal(document.querySelector('[data-note-pane]').dataset.notePane, 'Plan');
  assert.equal(document.querySelector('[data-note-pane]').dataset.pinned, 'true');
  assert.equal(address, '/weezboo/context?folder=ideas&note=Plan');
  assert.deepEqual(pushed, []);
  await click('Close');
  await settle();
  assert.equal(document.querySelector('[data-note-pane]'), null);
  assert.equal(address, '/weezboo/context?folder=ideas');
  // The kind of Note can be chosen, and the list then holds that kind alone.
  const kind = document.querySelector('select[aria-label="Note type"]');
  await React.act(async () => { kind.value = 'DECISION'; kind.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
  assert.deepEqual(list(), ['DraftsFolder', 'DecisionNote · decision']);
  await React.act(async () => root.render(null));
});

test('a Note opened from a link is open on arrival, and a list is read as that list', async () => {
  const views = [];
  routes = {
    'GET /api/context/folders': () => ({ folders }),
    'GET /api/context/items': query => { views.push(query.get('view')); return { notes: query.get('view') === 'personal' ? [note('Diary')] : [], files: [] }; },
    'POST /api/notes': () => ({ id: 'made', type: 'GENERAL', updatedAt: '2026-11-17T09:00:00Z' }),
  };
  await React.act(async () => root.render(h(ContextBrowser, {
    workspaceId: 'w', workspaceSlug: 'weezboo', projects: [], initialView: 'personal', initialNoteId: 'Diary',
  })));
  await settle();
  assert.deepEqual(views, ['personal']);
  assert.equal(document.querySelector('[role="treeitem"][aria-selected="true"]').textContent, 'Personal');
  assert.equal(document.querySelector('[data-note-pane]').dataset.notePane, 'Diary');
  assert.equal(address, '/weezboo/context?view=personal&note=Diary');
  // A Note made in the personal list is a personal one, and it opens here.
  await React.act(async () => { [...document.querySelectorAll('[data-menu]')].find(row => row.textContent === 'Note').click(); });
  await click('Confirm');
  await settle();
  assert.equal(JSON.parse(posted['POST /api/notes']).scope, 'PERSONAL');
  assert.equal(document.querySelector('[data-note-pane]').dataset.notePane, 'made');
  await React.act(async () => root.render(null));
});

test('a Note from a template is filled in by the server and made where the page stands', async () => {
  routes = {
    'GET /api/context/folders': () => ({ folders }),
    // The list is read again once the Note is made, so it holds what the server then lists.
    'GET /api/context/items': () => ({ notes: posted['POST /api/notes'] ? [note('adr', { title: 'ADR 7: Use Postgres', type: 'DECISION' })] : [], files: [] }),
    'POST /api/notes/templates/decision/use': () => ({ title: 'ADR 7: Use Postgres', content: '<p>Why</p>', defaultType: 'DECISION', templateId: null }),
    'POST /api/notes': () => ({ id: 'adr', type: 'DECISION', updatedAt: '2026-11-17T09:00:00Z' }),
  };
  delete posted['POST /api/notes'];
  await React.act(async () => root.render(h(ContextBrowser, {
    workspaceId: 'w', workspaceSlug: 'weezboo', projects: [], initialFolderId: 'ideas',
  })));
  await settle();
  await React.act(async () => { [...document.querySelectorAll('[data-menu]')].find(row => row.textContent === 'Note from template').click(); });
  await click('Use template');
  await settle();
  const sent = JSON.parse(posted['POST /api/notes']);
  assert.deepEqual([sent.title, sent.content, sent.type, sent.folderId, sent.scope], ['ADR 7: Use Postgres', '<p>Why</p>', 'DECISION', 'ideas', 'WORKSPACE']);
  assert.equal(document.querySelector('[data-note-pane]').dataset.notePane, 'adr');
  assert.ok(list().some(row => row.startsWith('ADR 7: Use Postgres')));
  await React.act(async () => root.render(null));
});

test('starting blank from the template picker opens the new note dialog', async () => {
  routes = {
    'GET /api/context/folders': () => ({ folders }),
    'GET /api/context/items': () => ({ notes: [], files: [] }),
    'POST /api/notes': () => ({ id: 'blank', type: 'GENERAL', updatedAt: '2026-11-17T09:00:00Z' }),
  };
  await React.act(async () => root.render(h(ContextBrowser, { workspaceId: 'w', workspaceSlug: 'weezboo', projects: [] })));
  await settle();
  await React.act(async () => { [...document.querySelectorAll('[data-menu]')].find(row => row.textContent === 'Note from template').click(); });
  await click('Start blank');
  await click('Confirm');
  await settle();
  assert.equal(document.querySelector('[data-note-pane]').dataset.notePane, 'blank');
  await React.act(async () => root.render(null));
});

test('a created note opens even when refreshing its list fails', async () => {
  for (const template of [false, true]) {
    let reads = 0;
    routes = {
      'GET /api/context/folders': () => ({ folders }),
      'GET /api/context/items': () => ++reads === 1 ? { notes: [], files: [] } : new Error('List unavailable'),
      'POST /api/notes/templates/decision/use': () => ({ title: 'Made', content: '', defaultType: 'GENERAL', templateId: null }),
      'POST /api/notes': () => ({ id: 'Made' }),
    };
    await React.act(async () => root.render(h(ContextBrowser, { workspaceId: 'w', workspaceSlug: 'weezboo', projects: [] })));
    await settle();
    await React.act(async () => { [...document.querySelectorAll('[data-menu]')].find(row => row.textContent === (template ? 'Note from template' : 'Note')).click(); });
    await click(template ? 'Use template' : 'Confirm');
    await settle();
    assert.equal(document.querySelector('[data-note-pane]').dataset.notePane, 'Made');
    assert.equal(document.querySelector('[role="alert"]').textContent, 'List unavailable');
    await React.act(async () => root.render(null));
  }
});

test('loading more after a rename uses the current server order', async () => {
  let rows = Array.from({ length: 501 }, (_, i) => note(`Note ${String(i).padStart(3, '0')}`));
  routes = {
    'GET /api/context/folders': () => ({ folders: [] }),
    'GET /api/context/items': query => ({ notes: rows.slice(Number(query.get('offset') || 0), Number(query.get('offset') || 0) + 500), files: [] }),
  };
  await React.act(async () => root.render(h(ContextBrowser, { workspaceId: 'w', workspaceSlug: 'weezboo', projects: [] })));
  await settle();
  await click('Note 000');
  rows = [...rows.slice(1), note('Note 000', { title: 'Renamed', type: 'DECISION' })];
  await click('Save as Renamed');
  await click('Load more notes');
  await settle();
  assert.equal(list().length, 501);
  assert.equal(list().filter(row => row.startsWith('Renamed')).length, 1);
  assert.ok(list().some(row => row.startsWith('Note 500')));
  await React.act(async () => root.render(null));
});

test('a late note write changes the list it belongs to and leaves a later choice open', async () => {
  let finishCreate, finishDelete;
  let rows = [note('First'), note('Second')];
  routes = {
    'GET /api/context/folders': () => ({ folders }),
    'GET /api/context/items': () => ({ notes: rows, files: [] }),
    'POST /api/notes': () => new Promise(resolve => { finishCreate = resolve; }),
    'DELETE /api/notes/First': () => new Promise(resolve => { finishDelete = resolve; }),
  };
  await React.act(async () => root.render(h(ContextBrowser, { workspaceId: 'w', workspaceSlug: 'weezboo', projects: [] })));
  await settle();
  await click('First');
  await click('Delete');
  await click('Second');
  await React.act(async () => { finishDelete({ ok: true }); });
  // The deleted Note leaves the list, and the Note chosen meanwhile stays open.
  assert.equal(document.querySelector('[data-note-pane]').dataset.notePane, 'Second');
  assert.ok(!list().some(row => row.startsWith('First')));
  await click('Close');
  await React.act(async () => { [...document.querySelectorAll('[data-menu]')].find(row => row.textContent === 'Note').click(); });
  await click('Confirm');
  await click('Second');
  rows = [note('Made'), note('Second')];
  await React.act(async () => { finishCreate({ id: 'Made', type: 'GENERAL', updatedAt: '' }); });
  await settle();
  // The new Note is listed where the server lists it, and does not take the place of what was chosen.
  assert.equal(document.querySelector('[data-note-pane]').dataset.notePane, 'Second');
  assert.deepEqual(list().map(row => row.replace(/Note.*/, '')), ['IdeasFolder', 'SpecsFolder', 'Made', 'Second']);
  await React.act(async () => root.render(null));
});

test('a vanished note type does not hide the remaining notes', async () => {
  routes = {
    'GET /api/context/folders': () => ({ folders }),
    'GET /api/context/items': () => ({ notes: [note('First'), note('Second', { type: 'DECISION' })], files: [] }),
    'DELETE /api/notes/Second': () => ({ ok: true }),
  };
  await React.act(async () => root.render(h(ContextBrowser, { workspaceId: 'w', workspaceSlug: 'weezboo', projects: [] })));
  await settle();
  const kind = document.querySelector('select[aria-label="Note type"]');
  await React.act(async () => { kind.value = 'DECISION'; kind.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
  await click('Second');
  await click('Delete');
  await settle();
  assert.equal(document.querySelector('select[aria-label="Note type"]'), null);
  assert.ok(list().some(row => row.startsWith('First')));
  await React.act(async () => root.render(null));
});

test('what the editor saves is what the list says, and an unpinned Note leaves the pinned list', async () => {
  let reads = 0;
  routes = {
    'GET /api/context/folders': () => ({ folders }),
    'GET /api/context/items': () => { reads++; return { notes: [note('Plan', { isPinned: true }), note('Other', { isPinned: true })], files: [] }; },
    'POST /api/notes/Plan/pin': () => ({ success: true, isPinned: false }),
  };
  await React.act(async () => root.render(h(ContextBrowser, { workspaceId: 'w', workspaceSlug: 'weezboo', projects: [], initialView: 'pinned' })));
  await settle();
  await click('Plan');
  // A save renames the row at once: the list is not read again for it, on Close either.
  await click('Save as Renamed');
  assert.ok(list().includes('RenamedNote · decision · pinned'));
  await click('Unpin');
  await settle();
  assert.deepEqual(list(), ['OtherNote · general · pinned']);
  await click('Close');
  await settle();
  assert.equal(reads, 1);
  await React.act(async () => root.render(null));
});
