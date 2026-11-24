const { assert, test, load } = require('../security/helpers.cjs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<div id="root"></div>', { url: 'https://collab.test/admin/agent-roles' });
global.window = dom.window; global.document = dom.window.document; global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { createRoot } = require('react-dom/client');

const calls = [], notices = [];
let answers = [];
const { PlatformPromptsEditor } = load('src/app/admin/agent-roles/PlatformPromptsEditor.tsx', {
  react: React, 'react/jsx-runtime': require('react/jsx-runtime'),
  '@/components/ui/button': { Button: ({ children, onClick, disabled }) => React.createElement('button', { onClick, disabled }, children) },
  '@/components/ui/textarea': { Textarea: props => React.createElement('textarea', props) },
  '@/components/ui/input': { Input: props => React.createElement('input', props) },
  '@/hooks/use-toast': { useToast: () => ({ toast: notice => notices.push(notice) }) },
}, { fetch: async (url, options = {}) => {
  calls.push([url, options.method ?? 'GET', options.body ? JSON.parse(options.body) : undefined]);
  const [status, body] = answers.shift();
  return { ok: status < 400, status, json: async () => body };
} });

const by = { id: 'cadmin00001', name: 'Ada Admin' };
const at = '2026-11-24T10:00:00.000Z';
const roles = [
  { id: 'developer', name: 'Developer', repository: 'Shipped developer rules.',
    inForce: { source: 'edit', text: 'Edited developer rules.', version: 2, reason: 'Shorter.', by, at, shippedNewer: true },
    history: [
      { id: 'v2', version: 2, text: 'Edited developer rules.', reason: 'Shorter.', by, at },
      { id: 'v1', version: 1, text: 'First edit.', reason: 'A first try.', by: null, at },
    ] },
  { id: 'reviewer', name: 'Reviewer', repository: 'Shipped reviewer rules.', inForce: { source: 'repository', text: 'Shipped reviewer rules.' }, history: [] },
];
const button = text => [...document.querySelectorAll('button')].find(candidate => candidate.textContent === text);
const click = target => React.act(async () => target.click());
const type = (field, value) => React.act(async () => {
  const prototype = field.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value').set.call(field, value);
  field.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
});
const text = () => document.body.textContent;
const why = () => document.querySelector('input[aria-label="Why"]');
async function render() {
  const root = createRoot(document.getElementById('root'));
  await React.act(async () => root.render(React.createElement(PlatformPromptsEditor, { roles })));
  return root;
}

test('the prompt in force, where it comes from, the warning about secrets, and the shipped text when it is newer', async () => {
  const root = await render();
  try {
    assert.match(document.querySelector('h2').textContent, /Developer/);
    assert.equal(document.querySelector('textarea').value, 'Edited developer rules.');
    assert.match(text(), /In force: version 2, edited by Ada Admin/);
    assert.match(text(), /Do not put a password, a token or any other secret here/);
    // A release changed the repository's text while the edit is in force: both are shown.
    const newer = document.querySelector('[aria-label="The repository\'s text"]');
    assert.match(newer.textContent, /The repository ships a newer text/);
    assert.match(newer.textContent, /Shipped developer rules\./);
    // The history, newest first, with who, when and why; a deleted account has no name.
    const history = [...document.querySelectorAll('li[aria-label^="Version"]')];
    assert.deepEqual(history.map(row => row.getAttribute('aria-label')), ['Version 2', 'Version 1']);
    assert.match(history[0].textContent, /Ada Admin.*Shorter\./);
    assert.match(history[1].textContent, /a deleted account.*A first try\./);

    // A role with no edit says it is the repository's text and has nothing to end.
    await click(button('Reviewer'));
    assert.match(text(), /In force: the repository's text/);
    assert.equal(button("Back to the repository's text"), undefined);
    assert.equal(document.querySelector('[aria-label="The repository\'s text"]'), null);
    assert.match(text(), /No edits yet/);
  } finally { await React.act(async () => root.unmount()); }
});

test('saving needs a text and a reason, and the reply becomes the text in force and the history', async () => {
  const root = await render();
  try {
    assert.equal(button('Save').disabled, true, 'nothing changed, no reason');
    await type(document.querySelector('textarea'), 'Newer rules.');
    assert.equal(button('Save').disabled, true, 'no reason yet');
    await type(why(), 'Clearer.');
    assert.equal(button('Save').disabled, false);
    await type(document.querySelector('textarea'), '   ');
    assert.equal(button('Save').disabled, true, 'an empty text is refused');
    await type(document.querySelector('textarea'), 'Newer rules.');

    const saved = { ...roles[0], inForce: { source: 'edit', text: 'Newer rules.', version: 3, reason: 'Clearer.', by, at, shippedNewer: false },
      history: [{ id: 'v3', version: 3, text: 'Newer rules.', reason: 'Clearer.', by, at }, ...roles[0].history] };
    answers = [[200, { role: saved }]];
    await click(button('Save'));
    assert.deepEqual(calls.at(-1), ['/api/admin/agent-roles/developer', 'POST', { action: 'save', text: 'Newer rules.', reason: 'Clearer.' }]);
    assert.equal(notices.at(-1).title, 'Saved');
    assert.match(text(), /In force: version 3/);
    assert.equal(why().value, '');
    assert.equal(document.querySelectorAll('li[aria-label^="Version"]').length, 3);

    // A refusal keeps what was typed and says why.
    await type(document.querySelector('textarea'), 'x');
    await type(why(), 'Try.');
    answers = [[400, { error: 'The platform instructions hold at most 8000 characters' }]];
    await click(button('Save'));
    assert.deepEqual([notices.at(-1).variant, notices.at(-1).description], ['destructive', 'The platform instructions hold at most 8000 characters']);
    assert.equal(document.querySelector('textarea').value, 'x');
  } finally { await React.act(async () => root.unmount()); }
});

test('any version can be read and restored, and the edit can be ended, each with a reason', async () => {
  const root = await render();
  try {
    const version1 = () => document.querySelector('li[aria-label="Version 1"]');
    const inside = (row, label) => [...row.querySelectorAll('button')].find(candidate => candidate.textContent === label);
    await click(inside(version1(), 'Read'));
    assert.match(version1().textContent, /First edit\./);
    assert.equal(inside(version1(), 'Restore').disabled, true, 'no reason yet');
    assert.equal(button("Back to the repository's text").disabled, true, 'no reason yet');

    await type(why(), 'Version 1 was right.');
    answers = [[200, { role: { ...roles[0], inForce: { source: 'edit', text: 'First edit.', version: 3, reason: 'Version 1 was right.', by, at, shippedNewer: false } } }]];
    await click(inside(version1(), 'Restore'));
    assert.deepEqual(calls.at(-1), ['/api/admin/agent-roles/developer', 'POST', { action: 'restore', versionId: 'v1', reason: 'Version 1 was right.' }]);
    assert.equal(document.querySelector('textarea').value, 'First edit.');

    await type(why(), 'The release fixed it.');
    answers = [[200, { role: { ...roles[0], inForce: { source: 'repository', text: 'Shipped developer rules.' } } }]];
    await click(button("Back to the repository's text"));
    assert.deepEqual(calls.at(-1), ['/api/admin/agent-roles/developer', 'POST', { action: 'repository', reason: 'The release fixed it.' }]);
    assert.match(text(), /In force: the repository's text/);
    assert.equal(document.querySelector('textarea').value, 'Shipped developer rules.');
  } finally { await React.act(async () => root.unmount()); }
});
