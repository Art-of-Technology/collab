const { assert, test, load } = require('../security/helpers.cjs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<div id="root"></div>', { url: 'https://collab.test/workspaces/w/settings/roles' });
global.window = dom.window; global.document = dom.window.document; global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { createRoot } = require('react-dom/client');

const calls = [], notices = [];
let answers = [];
const { RoleInstructionsSettings } = load('src/components/workspace/RoleInstructionsSettings.tsx', {
  react: React, 'react/jsx-runtime': require('react/jsx-runtime'),
  '@/components/ui/button': { Button: ({ children, onClick, disabled }) => React.createElement('button', { onClick, disabled }, children) },
  '@/components/ui/textarea': { Textarea: props => React.createElement('textarea', props) },
  '@/hooks/use-toast': { useToast: () => ({ toast: notice => notices.push(notice) }) },
  'lucide-react': { Lock: () => null },
}, { fetch: async (url, options = {}) => {
  calls.push([url, options.method ?? 'GET', options.body ? JSON.parse(options.body) : undefined]);
  const [status, body] = answers.shift();
  return { ok: status < 400, status, json: async () => body };
} });

const roles = [
  { id: 'developer', name: 'Developer', takes: ['Ordinary issues'], repository: 'yes', platform: 'Work only the issue you were given.', organisation: 'We use British English.' },
  { id: 'reviewer', name: 'Reviewer', takes: ['Review request'], repository: 'yes', platform: 'Review the change.', organisation: '' },
];
const button = text => [...document.querySelectorAll('button')].find(candidate => candidate.textContent === text);
const click = target => React.act(async () => target.click());
const type = (field, value) => React.act(async () => {
  Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value').set.call(field, value);
  field.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
});
const layerTitles = () => [...document.querySelectorAll('section[aria-label]')].map(section => section.getAttribute('aria-label'));
async function render(canEdit) {
  const root = createRoot(document.getElementById('root'));
  await React.act(async () => root.render(React.createElement(RoleInstructionsSettings, { workspaceId: 'w', canEdit, roles })));
  return root;
}

test('the layers of a role are stacked, the locked platform layer on top, with the warning about secrets', async () => {
  const root = await render(true);
  try {
    assert.match(document.querySelector('h2').textContent, /Developer/);
    assert.match(document.body.textContent, /Takes: Ordinary issues · Repository: yes/);
    assert.deepEqual(layerTitles(), ['Layer 1: Platform', 'Layer 2: Your organisation', 'Layer 3: One seat']);
    const platform = document.querySelector('section[aria-label="Layer 1: Platform"]');
    assert.match(platform.textContent, /Work only the issue you were given\./);
    assert.match(platform.textContent, /The same for every organisation/);
    assert.equal(platform.querySelector('textarea'), null, 'the platform layer cannot be edited');
    assert.match(document.body.textContent, /Do not put a password, a token or any other secret here/);
    assert.equal(document.querySelector('textarea').value, 'We use British English.');

    // Another role shows its own layers.
    await click(button('Reviewer'));
    assert.match(document.querySelector('h2').textContent, /Reviewer/);
    assert.match(document.body.textContent, /Takes: Review request · Repository: yes/);
    assert.equal(document.querySelector('textarea').value, '');
  } finally { await React.act(async () => root.unmount()); }
});

test('a permission manager saves the organisation layer of the role they picked', async () => {
  const root = await render(true);
  try {
    assert.equal(button('Save').disabled, true, 'nothing to save yet');
    await type(document.querySelector('textarea'), 'Never force-push.');
    answers = [[200, { role: 'developer', text: 'Never force-push.' }]];
    await click(button('Save'));
    assert.deepEqual(calls.at(-1), ['/api/workspaces/w/agent-roles/developer', 'PUT', { text: 'Never force-push.' }]);
    assert.equal(notices.at(-1).title, 'Saved');
    assert.equal(button('Save').disabled, true, 'saved');

    // A refusal keeps the text and says why.
    await type(document.querySelector('textarea'), 'x');
    answers = [[400, { error: 'The organisation instructions hold at most 16000 characters' }]];
    await click(button('Save'));
    assert.equal(notices.at(-1).variant, 'destructive');
    assert.equal(notices.at(-1).description, 'The organisation instructions hold at most 16000 characters');
    assert.equal(document.querySelector('textarea').value, 'x');
  } finally { await React.act(async () => root.unmount()); }
});

test('someone who may not manage permissions reads the layers and cannot change them', async () => {
  const root = await render(false);
  const before = calls.length;
  try {
    assert.equal(document.querySelector('textarea'), null);
    assert.equal(button('Save'), undefined);
    assert.match(document.querySelector('section[aria-label="Layer 2: Your organisation"]').textContent, /We use British English\./);
    await click(button('Reviewer'));
    assert.match(document.querySelector('section[aria-label="Layer 2: Your organisation"]').textContent, /Nothing added for this role/);
    assert.equal(calls.length, before);
  } finally { await React.act(async () => root.unmount()); }
});

test('"Show what a run receives" shows the saved layers in the order a run gets them', async () => {
  const root = await render(true);
  try {
    await click(button('Show what a run receives'));
    const shown = document.querySelector('[aria-label="What a run receives"]');
    const text = shown.textContent;
    const order = ['Work only the issue you were given.', 'We use British English.', 'Set on each seat'].map(part => text.indexOf(part));
    assert.ok(order.every(at => at >= 0), text);
    assert.deepEqual([...order].sort((a, b) => a - b), order);
    // What is typed and not saved is not what a run receives.
    await type(document.querySelector('textarea'), 'Not saved yet.');
    assert.doesNotMatch(document.querySelector('[aria-label="What a run receives"]').textContent, /Not saved yet/);
    await click(button('Hide what a run receives'));
    assert.equal(document.querySelector('[aria-label="What a run receives"]'), null);
  } finally { await React.act(async () => root.unmount()); }
});
