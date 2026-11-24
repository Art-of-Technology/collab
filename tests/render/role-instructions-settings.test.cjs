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

// CLB-626: the organisation's own roles, under "Your organisation", each behaving like a built-in one.
const qa = { id: 'cqa000000001', name: 'QA Tester', baseRole: 'developer', baseName: 'Developer', instructions: 'Write the failing test first.', retired: false, seats: 1 };
async function renderCustom(canEdit, custom = [qa]) {
  const root = createRoot(document.getElementById('root'));
  await React.act(async () => root.render(React.createElement(RoleInstructionsSettings, { workspaceId: 'w', canEdit, roles, custom })));
  return root;
}
const field = label => document.querySelector(`[aria-label="${label}"]`);
const setValue = (target, value) => React.act(async () => {
  const proto = target.tagName === 'SELECT' ? dom.window.HTMLSelectElement.prototype : target.tagName === 'INPUT' ? dom.window.HTMLInputElement.prototype : dom.window.HTMLTextAreaElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(target, value);
  target.dispatchEvent(new dom.window.Event(target.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
});
const navButton = text => [...document.querySelectorAll('nav button')].find(candidate => candidate.textContent.startsWith(text));

test("the organisation's own roles are listed under Your organisation with the role they behave like, and show four layers", async () => {
  const root = await renderCustom(false);
  try {
    const nav = document.querySelector('nav').textContent;
    assert.ok(nav.indexOf('Your organisation') > nav.indexOf('Reviewer'), nav);
    assert.match(navButton('QA Tester').textContent, /like Developer/);
    assert.equal(button('+ New role'), undefined, 'only a permission manager adds a role');
    await click(navButton('QA Tester'));
    assert.match(document.querySelector('h2').textContent, /QA Tester/);
    assert.match(document.body.textContent, /Behaves like Developer/);
    assert.deepEqual(layerTitles(), ['Layer 1: Platform', 'Layer 2: Your organisation', 'Layer 3: This role', 'Layer 4: One seat']);
    // The base role's platform layer, locked, and the organisation's text for the base role.
    assert.match(document.querySelector('section[aria-label="Layer 1: Platform"]').textContent, /Work only the issue you were given\./);
    assert.match(document.querySelector('section[aria-label="Layer 2: Your organisation"]').textContent, /We use British English\./);
    assert.match(document.querySelector('section[aria-label="Layer 3: This role"]').textContent, /Write the failing test first\./);
    assert.equal(document.querySelector('textarea'), null);
    await click(button('Show what a run receives'));
    const text = document.querySelector('[aria-label="What a run receives"]').textContent;
    const order = ['Work only the issue you were given.', 'We use British English.', 'Write the failing test first.', 'Set on each seat'].map(part => text.indexOf(part));
    assert.ok(order.every(at => at >= 0), text);
    assert.deepEqual([...order].sort((a, b) => a - b), order);
  } finally { await React.act(async () => root.unmount()); }
});

test('a permission manager creates a role: a name, the built-in role it behaves like, its instructions', async () => {
  const root = await renderCustom(true, []);
  try {
    await click(button('+ New role'));
    assert.match(document.querySelector('h2').textContent, /New role/);
    assert.deepEqual([...field('Behaves like').options].map(option => option.textContent), ['Developer', 'Reviewer']);
    await setValue(field('Name'), 'QA Tester');
    await setValue(field('Behaves like'), 'reviewer');
    // The locked layer on top is the one of the role picked.
    assert.match(document.querySelector('section[aria-label="Layer 1: Platform"]').textContent, /Review the change\./);
    await setValue(field('Instructions for this role'), 'Run the app first.');
    answers = [[201, { role: { ...qa, baseRole: 'reviewer', baseName: 'Reviewer', instructions: 'Run the app first.', seats: 0 } }]];
    await click(button('Create role'));
    assert.deepEqual(calls.at(-1), ['/api/workspaces/w/agent-custom-roles', 'POST', { name: 'QA Tester', baseRole: 'reviewer', instructions: 'Run the app first.' }]);
    assert.equal(notices.at(-1).title, 'Role created');
    // It appears under Your organisation, picked.
    assert.match(navButton('QA Tester').textContent, /like Reviewer/);
    assert.match(document.querySelector('h2').textContent, /QA Tester/);

    // A built-in role's name is refused, with the reason, and the form keeps what was typed.
    await click(button('+ New role'));
    await setValue(field('Name'), 'Developer');
    answers = [[409, { error: '“Developer” is the name of a built-in role', code: 'built_in_name' }]];
    await click(button('Create role'));
    assert.equal(notices.at(-1).variant, 'destructive');
    assert.equal(notices.at(-1).description, '“Developer” is the name of a built-in role');
    assert.equal(field('Name').value, 'Developer');
  } finally { await React.act(async () => root.unmount()); }
});

test('a role with seats is retired, not deleted; a role with none is deleted', async () => {
  const idle = { ...qa, id: 'cqa000000002', name: 'Idle', seats: 0 };
  const root = await renderCustom(true, [qa, idle]);
  try {
    await click(navButton('QA Tester'));
    assert.equal(button('Delete role').disabled, true);
    assert.match(document.body.textContent, /1 seat has this role/);
    answers = [[200, { role: { ...qa, retired: true } }]];
    await click(button('Retire role'));
    assert.deepEqual(calls.at(-1), ['/api/workspaces/w/agent-custom-roles/cqa000000001', 'PATCH', { retired: true }]);
    assert.match(navButton('QA Tester').textContent, /retired/);
    assert.ok(button('Bring back'));

    // Editing the instructions saves them.
    await setValue(field('Instructions for this role'), 'Write the test first.');
    answers = [[200, { role: { ...qa, retired: true, instructions: 'Write the test first.' } }]];
    await click(button('Save'));
    assert.deepEqual(calls.at(-1), ['/api/workspaces/w/agent-custom-roles/cqa000000001', 'PATCH', { name: 'QA Tester', instructions: 'Write the test first.' }]);

    await click(navButton('Idle'));
    answers = [[200, { deleted: idle.id }]];
    await click(button('Delete role'));
    assert.deepEqual(calls.at(-1), ['/api/workspaces/w/agent-custom-roles/cqa000000002', 'DELETE', undefined]);
    assert.equal(navButton('Idle'), undefined);
  } finally { await React.act(async () => root.unmount()); }
});
