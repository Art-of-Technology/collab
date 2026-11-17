const { assert, test, load } = require('../security/helpers.cjs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<div id="root"></div>', { url: 'https://collab.test/w/agents/runners' });
global.window = dom.window; global.document = dom.window.document; global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { createRoot } = require('react-dom/client');

const calls = [], notices = [];
let answers = [];
const el = tag => ({ children, onClick, disabled, type }) => React.createElement(tag, { onClick, disabled, type }, children);
const { AgentRunnersView } = load('src/components/agents/AgentRunnersView.tsx', {
  react: React, 'react/jsx-runtime': require('react/jsx-runtime'),
  'next/link': { default: ({ href, children }) => React.createElement('a', { href }, children) },
  '@/components/ui/alert-dialog': { AlertDialog: ({ open, children }) => (open ? React.createElement('div', { role: 'dialog' }, children) : null),
    AlertDialogAction: el('button'), AlertDialogCancel: el('button'), AlertDialogContent: el('div'), AlertDialogDescription: el('p'),
    AlertDialogFooter: el('div'), AlertDialogHeader: el('div'), AlertDialogTitle: el('h2') },
  '@/components/ui/button': { Button: ({ asChild, children, ...rest }) => (asChild ? children : el('button')({ children, ...rest })) },
  '@/components/ui/input': { Input: ({ id, value, onChange }) => React.createElement('input', { id, value, onChange }) },
  '@/components/ui/label': { Label: el('label') },
  '@/components/ui/select': { Select: ({ value, onValueChange, children }) => React.createElement('select', { value, onChange: event => onValueChange(event.target.value) }, children),
    SelectContent: ({ children }) => children, SelectItem: ({ value, children }) => React.createElement('option', { value }, children), SelectTrigger: () => null, SelectValue: () => null },
  '@/hooks/use-toast': { useToast: () => ({ toast: notice => notices.push(notice) }) },
}, { Date, fetch: async (url, options = {}) => {
  calls.push([url, options.method ?? 'GET', options.body ? JSON.parse(options.body) : undefined]);
  const [status, body] = answers.shift();
  return { ok: status < 400, status, json: async () => body };
} });

const mac = { id: 'r1', name: 'mac', ownerId: 'me', ownerName: 'Ada', admittedAt: '2026-11-16T10:00:00.000Z', lastSeenAt: null, seats: 2 };
const button = text => [...document.querySelectorAll('button')].find(candidate => candidate.textContent === text);
const click = target => React.act(async () => target.click());
const type = (input, value) => React.act(async () => {
  Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(input, value);
  input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
});
const choose = (select, value) => React.act(async () => { select.value = value; select.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
async function render(people, first) {
  answers = [first];
  calls.length = notices.length = 0;
  const root = createRoot(document.getElementById('root'));
  await React.act(async () => root.render(React.createElement(AgentRunnersView, { workspaceId: 'w', me: 'me', people })));
  return root;
}

test('a member types the code their runner shows and connects it for themselves; the list shows what was connected', async () => {
  const root = await render([], [200, { owner: false, runners: [] }]);
  try {
    assert.deepEqual(calls, [['/api/workspaces/w/agent-runners', 'GET', undefined]]);
    assert.match(document.body.textContent, /No runner is connected yet/);
    assert.equal(document.querySelector('select'), null, 'a member cannot choose whose runner it is');
    assert.equal(button('Connect').disabled, true, 'no code yet');
    await type(document.querySelector('#runner-code'), 'k7qf-m2xd');
    assert.equal(button('Connect').disabled, false);
    answers = [[201, { runner: { id: 'r1', name: 'mac', ownerId: 'me' }, replaced: ['old-mac'] }], [200, { owner: false, runners: [mac] }]];
    await click(button('Connect'));
    assert.deepEqual(calls.slice(1), [['/api/workspaces/w/agent-runners', 'POST', { code: 'k7qf-m2xd' }], ['/api/workspaces/w/agent-runners', 'GET', undefined]]);
    assert.deepEqual([notices.at(-1).title, notices.at(-1).description], ['mac is connected', 'It replaces old-mac, whose tokens were revoked.']);
    assert.equal(document.querySelector('#runner-code').value, '');
    assert.deepEqual([...document.querySelectorAll('tbody tr')].map(row => [...row.children].slice(0, 3).map(cell => cell.textContent)), [['mac', 'Ada (me)', '2']]);
    assert.match(document.querySelector('tbody tr').textContent, /Never/);
  } finally { await React.act(async () => root.unmount()); }
});

test('the owner connects a runner for someone else, a refusal is shown as it was given, and removing asks first', async () => {
  const root = await render([{ id: 'me', name: 'Ada' }, { id: 'u2', name: 'Grace' }], [200, { owner: true, runners: [mac] }]);
  try {
    await choose(document.querySelector('select'), 'u2');
    await type(document.querySelector('#runner-code'), 'AAAA-BBBB');
    answers = [[404, { error: 'No runner is waiting with this code.', code: 'code_not_found' }]];
    await click(button('Connect'));
    assert.deepEqual(calls.at(-1), ['/api/workspaces/w/agent-runners', 'POST', { code: 'AAAA-BBBB', ownerId: 'u2' }]);
    assert.deepEqual([notices.at(-1).variant, notices.at(-1).description], ['destructive', 'No runner is waiting with this code.']);

    await click(button('Remove'));
    assert.match(document.querySelector('[role=dialog]').textContent, /Remove mac\?.*every token it fetched is revoked at once/);
    assert.equal(calls.at(-1)[1], 'POST', 'nothing is removed before the person confirms');
    answers = [[200, { revokedTokens: 2 }], [200, { owner: true, runners: [] }]];
    await click(button('Remove runner'));
    assert.deepEqual(calls.slice(-2), [['/api/workspaces/w/agent-runners/r1', 'DELETE', undefined], ['/api/workspaces/w/agent-runners', 'GET', undefined]]);
    assert.deepEqual([notices.at(-1).title, notices.at(-1).description], ['mac is removed', '2 tokens it fetched were revoked.']);
    assert.match(document.body.textContent, /No runner is connected yet/);
  } finally { await React.act(async () => root.unmount()); }
});
