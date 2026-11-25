const { assert, test, load } = require('../security/helpers.cjs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<div id="root"></div>', { url: 'https://collab.test/w/projects/p/settings' });
global.window = dom.window; global.document = dom.window.document; global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { createRoot } = require('react-dom/client');

const calls = [], notices = [];
let answers = [];
const el = tag => ({ children, onClick, disabled }) => React.createElement(tag, { onClick, disabled }, children);
const { AgentModeSettings } = load('src/components/agents/AgentModeSettings.tsx', {
  react: React, 'react/jsx-runtime': require('react/jsx-runtime'),
  '@/components/ui/alert-dialog': { AlertDialog: ({ open, children }) => (open ? React.createElement('div', { role: 'dialog' }, children) : null),
    AlertDialogAction: el('button'), AlertDialogCancel: el('button'), AlertDialogContent: el('div'), AlertDialogDescription: el('p'),
    AlertDialogFooter: el('div'), AlertDialogHeader: el('div'), AlertDialogTitle: el('h2') },
  '@/components/ui/button': { Button: el('button') },
  '@/components/ui/checkbox': { Checkbox: ({ checked, onCheckedChange }) => React.createElement('input', { type: 'checkbox', checked, onChange: event => onCheckedChange(event.target.checked) }) },
  '@/components/ui/select': { Select: ({ value, onValueChange, children }) => React.createElement('select', { value, onChange: event => onValueChange(event.target.value) }, children),
    SelectContent: ({ children }) => children, SelectItem: ({ value, children }) => React.createElement('option', { value }, children), SelectTrigger: () => null, SelectValue: () => null },
  '@/hooks/use-toast': { useToast: () => ({ toast: notice => notices.push(notice) }) },
}, { Date, fetch: async (url, options = {}) => {
  calls.push([url, options.method ?? 'GET', options.body ? JSON.parse(options.body) : undefined]);
  const [status, body] = answers.shift();
  return { ok: status < 400, status, json: async () => body };
} });

const handoffs = { mode: 'handoffs', switchedAt: null,
  statuses: [{ id: 's1', name: 'Backlog', category: 'todo' }, { id: 's2', name: 'Doing', category: 'todo' }, { id: 's3', name: 'Shipped', category: 'done' }],
  claims: [{ issueId: 'i1', issueKey: 'P-1', title: 'First', agent: 'old-agent', assignee: 'Ada' }, { issueId: 'i2', issueKey: 'P-2', title: 'Second', agent: 'old-agent', assignee: null }],
  carryTo: { name: 'p-developer' }, retire: ['old-agent'] };
const button = text => [...document.querySelectorAll('button')].find(candidate => candidate.textContent === text);
const dialog = () => document.querySelector('[role=dialog]');
const click = target => React.act(async () => target.click());
const choose = (select, value) => React.act(async () => { select.value = value; select.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
async function render(first) {
  answers = [first];
  const root = createRoot(document.getElementById('root'));
  await React.act(async () => root.render(React.createElement(AgentModeSettings, { workspaceId: 'w', projectSlug: 'p' })));
  return root;
}

test('the switch dialog shows every status with its group and does not switch a project a run could not move', async () => {
  const root = await render([200, handoffs]);
  try {
    assert.deepEqual(calls.at(-1), ['/api/workspaces/w/projects/p/agent-mode', 'GET', undefined]);
    assert.match(document.body.textContent, /This project uses handoffs/);
    assert.match(document.body.textContent, /claims only in this project: old-agent/);
    assert.match(document.body.textContent, /Before retiring one, check its other work and subscriptions across the workspace/);
    assert.match(document.body.textContent, /If it is no longer needed, use collab agents retire --agent NAME/);
    assert.deepEqual([...document.querySelectorAll('select')].map(select => select.value), ['todo', 'todo', 'done']);
    assert.equal(button('Save groups').disabled, true, 'nothing to save yet');

    await click(button('Switch to seats'));
    assert.deepEqual([...dialog().querySelectorAll('li')].map(row => row.textContent), ['BacklogTo do', 'DoingTo do', 'ShippedDone']);
    assert.match(dialog().textContent, /No status is in the In progress group/);
    assert.equal([...dialog().querySelectorAll('button')].at(-1).disabled, true);
    await click([...dialog().querySelectorAll('button')].find(candidate => candidate.textContent === 'Cancel'));

    // Corrected behind the dialog, the group shows in it, and goes with the switch.
    await choose(document.querySelectorAll('select')[1], 'in_progress');
    assert.equal(button('Save groups').disabled, false);
    await click(button('Switch to seats'));
    assert.deepEqual([...dialog().querySelectorAll('li')].map(row => row.textContent), ['BacklogTo do', 'DoingIn progress', 'ShippedDone']);
    assert.doesNotMatch(dialog().textContent, /No status is in/);
    assert.match(dialog().textContent, /The ticked issues are assigned to p-developer/);
    assert.match(dialog().textContent, /P-1 Firstold-agent, assigned to Ada/);
    // One claim is left where it is.
    await click(dialog().querySelectorAll('input[type=checkbox]')[1]);

    answers = [[422, { error: 'Before this project uses seats, put a status in the done group', code: 'status_groups_required' }]];
    await click([...dialog().querySelectorAll('button')].at(-1));
    assert.deepEqual(calls.at(-1), ['/api/workspaces/w/projects/p/agent-mode', 'PATCH', { mode: 'seats', carryOver: ['i1'], categories: { s2: 'in_progress' } }]);
    assert.deepEqual([notices.at(-1).title, notices.at(-1).description, notices.at(-1).variant], ['Error', 'Before this project uses seats, put a status in the done group', 'destructive']);
    assert.match(document.body.textContent, /This project uses handoffs/, 'a refused switch changes nothing on the page');

    answers = [[200, { ...handoffs, mode: 'seats', switchedAt: '2026-11-16T10:00:00.000Z', claims: [], statuses: handoffs.statuses.map(status => (status.id === 's2' ? { ...status, category: 'in_progress' } : status)) }]];
    await click(button('Switch to seats'));
    await click([...dialog().querySelectorAll('button')].at(-1));
    assert.equal(notices.at(-1).title, 'This project uses seats now');
    assert.match(document.body.textContent, /This project uses seats since/);
    assert.equal(button('Save groups').disabled, true, 'the regrouping was saved with the switch');

    answers = [[409, { error: 'A run is open in this project.', code: 'run_open' }]];
    await click(button('Switch back to handoffs'));
    assert.equal(dialog().querySelectorAll('li').length, 0);
    await click([...dialog().querySelectorAll('button')].at(-1));
    assert.deepEqual(calls.at(-1), ['/api/workspaces/w/projects/p/agent-mode', 'PATCH', { mode: 'handoffs' }]);
    assert.equal(notices.at(-1).description, 'A run is open in this project.');
  } finally { await React.act(async () => root.unmount()); }
});

test('a person who may not manage agents is told so, and gets no switch', async () => {
  const root = await render([403, { error: 'Forbidden' }]);
  try {
    assert.match(document.body.textContent, /Only someone who manages this workspace's agents/);
    assert.equal(document.querySelectorAll('button').length, 0);
  } finally { await React.act(async () => root.unmount()); }
});

test('a seat a runner runs shows whether a runner fetched its token and when it was last used', async () => {
  const root = await render([200, { ...handoffs, runnerSeats: [
    { id: 'a', name: 'p-developer', role: 'developer', owner: 'Ada', runner: null, fetchedAt: null, lastSeenAt: '2026-11-15T09:00:00.000Z' },
    { id: 'b', name: 'p-reviewer', role: 'reviewer', owner: 'Ada', runner: 'mac', fetchedAt: '2026-11-16T10:00:00.000Z', lastSeenAt: null },
  ] }]);
  try {
    const rows = [...document.querySelectorAll('div.rounded-xl')].map(row => row.textContent).filter(text => text.startsWith('p-'));
    // A seat whose runner was removed keeps showing when it last worked.
    assert.match(rows[0], /^p-developer developer, owned by AdaNo runner yet · last used .*2026/);
    assert.match(rows[1], /^p-reviewer reviewer, owned by AdaFetched by mac on .+ · not used yet$/);
  } finally { await React.act(async () => root.unmount()); }
});

test("a runner's seat with the organisation's own role is named by that role (CLB-628)", async () => {
  const root = await render([200, { ...handoffs, runnerSeats: [
    { id: 'a', name: 'p-qa', role: 'developer', customRole: 'QA Tester', owner: 'Ada', runner: null, fetchedAt: null, lastSeenAt: null },
  ] }]);
  try {
    const row = [...document.querySelectorAll('div.rounded-xl')].map(item => item.textContent).find(text => text.startsWith('p-'));
    assert.match(row, /^p-qa QA Tester, owned by Ada/);
  } finally { await React.act(async () => root.unmount()); }
});
