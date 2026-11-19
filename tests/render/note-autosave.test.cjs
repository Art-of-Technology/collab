const { assert, test, load } = require('../security/helpers.cjs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<div id="root"></div>', { url: 'https://collab.test' });
global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;
global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { createRoot } = require('react-dom/client');
const toast = () => {};
let form;
let finishFirst;
const writes = [];
const fetch = async (url, init = {}) => {
  if (!init.method) return { ok: true, json: async () => ({ title: 'Original', content: 'Body', tags: [] }) };
  const values = JSON.parse(init.body);
  writes.push(values.title);
  if (writes.length === 1) await new Promise(resolve => { finishFirst = resolve; });
  return { ok: true };
};
const { useNoteForm } = load('src/hooks/useNoteForm.ts', {
  react: React,
  'react-hook-form': require('react-hook-form'),
  '@hookform/resolvers/zod': require('@hookform/resolvers/zod'),
  zod: require('zod'),
  '@/hooks/use-toast': { useToast: () => ({ toast }) },
  '@/lib/note-types': { isSecretNoteType: () => false },
}, { fetch, document, window, navigator, setTimeout, clearTimeout, console, Blob });

test('closing during an in-flight autosave writes the latest edit last', async () => {
  const root = createRoot(document.getElementById('root'));
  function Editor() {
    form = useNoteForm({ mode: 'edit', noteId: 'note', workspaceId: 'workspace' }).form;
    return null;
  }
  await React.act(async () => { root.render(React.createElement(Editor)); });
  await React.act(async () => { form.setValue('title', 'First'); });
  await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 850)); });
  assert.deepEqual(writes, ['First']);
  await React.act(async () => { form.setValue('title', 'Latest'); });
  await React.act(async () => { root.unmount(); });
  assert.deepEqual(writes, ['First']);
  await React.act(async () => { finishFirst(); await new Promise(resolve => setTimeout(resolve, 0)); });
  assert.deepEqual(writes, ['First', 'Latest']);
});

test('reverting during an in-flight autosave saves the original value last', async () => {
  writes.length = 0;
  const root = createRoot(document.getElementById('root'));
  function Editor() {
    form = useNoteForm({ mode: 'edit', noteId: 'note', workspaceId: 'workspace' }).form;
    return null;
  }
  await React.act(async () => { root.render(React.createElement(Editor)); });
  await React.act(async () => { form.setValue('title', 'First'); });
  await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 850)); });
  await React.act(async () => { form.setValue('title', 'Original'); });
  await React.act(async () => { root.unmount(); });
  await React.act(async () => { finishFirst(); await new Promise(resolve => setTimeout(resolve, 0)); });
  assert.deepEqual(writes, ['First', 'Original']);
});
