const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { load } = require('./helpers.cjs');

test('closing a retained dialog discards create title and description without submitting', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://fixture.invalid' });
  const previous = { window: global.window, document: global.document, flag: global.IS_REACT_ACT_ENVIRONMENT, FormData: global.FormData };
  global.window = dom.window; global.document = dom.window.document; global.FormData = dom.window.FormData; global.IS_REACT_ACT_ENVIRONMENT = true;
  const React = require('react'), { createRoot } = require('react-dom/client');
  const { act, createElement: h } = React;
  const root = createRoot(document.getElementById('root'));
  const creates = []; let refreshes = 0;
  const initial = { kind: 'ready', projectName: 'Fixture', tasks: [], today: '2026-09-27', fetchedAt: '2026-09-27T12:00:00Z' };
  const actions = { changeIssue: async (...args) => { creates.push(args); return { kind: 'saved' }; }, refreshForgeBoard: async () => { refreshes++; return initial; } };
  const native = tag => ({ asChild, variant, onCloseAutoFocus, ...props }) => h(tag, props, props.children);
  // Model the exit-animation interval: closing changes open state but retains the shell and children.
  const Dialog = ({ open, onOpenChange, children }) => h('div', { 'data-dialog': true, 'data-state': open ? 'open' : 'closed', onKeyDown: e => { if (open && e.key === 'Escape') onOpenChange(false); } }, children);
  const deps = { react: React, 'react/jsx-runtime': require('react/jsx-runtime'), 'next/link': { default: native('a') },
    '@/components/ui/button': { Button: native('button') }, '@/components/ui/input': { Input: native('input') },
    '@/components/ui/textarea': { Textarea: native('textarea') }, '@/components/ui/badge': { Badge: native('span') },
    '@/components/ui/dialog': { Dialog, DialogContent: native('section'), DialogHeader: native('header'), DialogTitle: native('h2'), DialogDescription: native('p') },
    '@/lib/forge/tasks': { needsAttention: () => false, taskStatuses: ['backlog', 'in-progress', 'waiting', 'blocked', 'done'], taskPriorities: ['normal'] },
    './actions': actions, './ForgeExecution': { ForgeExecution: () => null } };
  const base = 'src/app/(main)/[workspaceId]/projects/[projectSlug]/board/';
  deps['./ForgeIssueEditor'] = load(base + 'ForgeIssueEditor.tsx', deps);
  const { ForgeBoardView } = load(base + 'ForgeBoardView.tsx', deps);
  const open = async () => act(async () => [...document.querySelectorAll('button')].find(b => b.textContent === 'New issue').click());
  const form = () => document.querySelector('[data-dialog][data-state="open"] form');
  const fill = async (element, value) => act(async () => {
    const proto = element.tagName === 'INPUT' ? dom.window.HTMLInputElement.prototype : dom.window.HTMLTextAreaElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(element, value);
    element.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
  try {
    await act(async () => root.render(h(ForgeBoardView, { initial, rights: { canCreate: true }, workspaceSlug: 'workspace', projectSlug: 'project' })));
    await open(); await fill(form().querySelector('input'), 'UNSAVED TITLE'); await fill(form().querySelector('textarea'), 'UNSAVED DESCRIPTION');
    await act(async () => form().dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    assert.equal(form(), null); assert.deepEqual(creates, []); assert.equal(refreshes, 0);
    await open(); assert.equal(form().querySelector('input').value, ''); assert.equal(form().querySelector('textarea').value, '');
    await fill(form().querySelector('input'), 'Saved title'); await fill(form().querySelector('textarea'), 'Saved description');
    await act(async () => form().dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })));
    assert.equal(creates.length, 1); assert.deepEqual(JSON.parse(JSON.stringify(creates[0])), ['workspace', 'project', { action: 'create', title: 'Saved title', description: 'Saved description' }]);
    assert.equal(refreshes, 1); assert.equal(form(), null);
  } finally {
    await act(async () => root.unmount()); dom.window.close();
    global.window = previous.window; global.document = previous.document; global.IS_REACT_ACT_ENVIRONMENT = previous.flag; global.FormData = previous.FormData;
  }
});
