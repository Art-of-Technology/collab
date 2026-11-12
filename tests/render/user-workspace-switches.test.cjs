const { assert, test, load } = require('../security/helpers.cjs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<div id="root"></div>', { url: 'https://collab.test/admin/users/bob' });
global.window = dom.window; global.document = dom.window.document; global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { createRoot } = require('react-dom/client');

const calls = [], notices = [];
let refreshed = 0, answer = { ok: true, json: async () => ({}) };
const Switches = load('src/components/workspace/UserWorkspaceSwitches.tsx', {
  react: React, 'react/jsx-runtime': require('react/jsx-runtime'),
  'next/navigation': { useRouter: () => ({ refresh: () => { refreshed += 1; } }) },
  '@/components/ui/badge': { Badge: ({ children }) => React.createElement('span', { 'data-badge': '' }, children) },
  '@/components/ui/input': { Input: ({ value, onChange, placeholder }) => React.createElement('input', { type: 'text', value, onChange, placeholder }) },
  '@/components/ui/label': { Label: ({ children, htmlFor }) => React.createElement('label', { htmlFor }, children) },
  '@/components/ui/switch': { Switch: ({ id, checked, disabled, onCheckedChange }) =>
    React.createElement('input', { type: 'checkbox', id, checked, disabled, onChange: event => onCheckedChange(event.target.checked) }) },
  '@/hooks/use-toast': { useToast: () => ({ toast: notice => notices.push(notice) }) },
}, { fetch: async (url, options) => { calls.push([url, options.method, JSON.parse(options.body)]); return answer; } }).default;

const row = (id, state) => ({ id, name: `Space ${id}`, slug: `slug-${id}`, state });
const box = id => document.getElementById(`user-workspace-${id}`);
const labels = () => [...document.querySelectorAll('label')].map(label => label.getAttribute('for').replace('user-workspace-', ''));

async function render(workspaces) {
  const root = createRoot(document.getElementById('root'));
  await React.act(async () => root.render(React.createElement(Switches, { userId: 'bob', userName: 'Bob', workspaces })));
  return root;
}

test('each workspace is a switch that adds the person or switches them off, and the owner has none', async () => {
  const root = await render([row('a', 'on'), row('b', 'off'), row('c', 'owner')]);
  try {
    assert.deepEqual([box('a').checked, box('b').checked, box('c')], [true, false, null]);
    assert.equal(document.querySelector('[data-badge]').textContent, 'Owner');
    assert.equal(document.querySelector('input[type=text]'), null, 'a short list has no filter');

    await React.act(async () => box('b').click());
    assert.deepEqual(calls.at(-1), ['/api/workspaces/b/members/by-user/bob', 'PUT', { active: true }]);
    assert.equal(notices.at(-1).description, 'Bob is now a member of Space b.');
    await React.act(async () => box('a').click());
    assert.deepEqual(calls.at(-1), ['/api/workspaces/a/members/by-user/bob', 'PUT', { active: false }]);
    assert.equal(notices.at(-1).description, "Bob's membership in Space a is switched off.");
    assert.equal(refreshed, 2);

    answer = { ok: false, json: async () => ({ error: 'User or workspace not found' }) };
    await React.act(async () => box('b').click());
    assert.equal(JSON.stringify(notices.at(-1)), JSON.stringify({ title: 'Error', description: 'User or workspace not found', variant: 'destructive' }));
    assert.equal(refreshed, 2, 'a refusal changes nothing on the page');
  } finally { await React.act(async () => root.unmount()); }
});

test('a long list can be filtered by name or slug, and an empty list says why', async () => {
  const many = 'abcdefghij'.split('').map(id => row(id, 'off'));
  let root = await render(many);
  try {
    assert.equal(labels().length, 10);
    const filter = document.querySelector('input[type=text]');
    await React.act(async () => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(filter, ' SLUG-C ');
      filter.dispatchEvent(new window.Event('input', { bubbles: true }));
    });
    assert.deepEqual(labels(), ['c']);
  } finally { await React.act(async () => root.unmount()); }

  root = await render([]);
  try {
    assert.match(document.body.textContent, /no other workspace where you may manage members/);
  } finally { await React.act(async () => root.unmount()); }
});
