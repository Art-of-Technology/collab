const { assert, test, load } = require('../security/helpers.cjs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<div id="root"></div>', { url: 'https://collab.test/w/agents/runners' });
global.window = dom.window; global.document = dom.window.document; global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { createRoot } = require('react-dom/client');

// The switch for the workspace rule that gives every new project its seats (CLB-519), on the Runners tab.
const calls = [], notices = [];
let answers = [];
const { SeatRuleSwitch } = load('src/components/agents/SeatRuleSwitch.tsx', {
  react: React, 'react/jsx-runtime': require('react/jsx-runtime'),
  '@/components/ui/label': { Label: ({ children, htmlFor }) => React.createElement('label', { htmlFor }, children) },
  '@/components/ui/switch': { Switch: ({ id, checked, disabled, onCheckedChange }) => React.createElement('button', { id, role: 'switch', 'aria-checked': checked, disabled, onClick: () => onCheckedChange(!checked) }) },
  '@/hooks/use-toast': { useToast: () => ({ toast: notice => notices.push(notice) }) },
}, { fetch: async (url, options = {}) => {
  calls.push([url, options.method ?? 'GET', options.body ? JSON.parse(options.body) : undefined]);
  const [status, body] = answers.shift();
  return { ok: status < 400, status, json: async () => body };
} });

async function render(first) {
  answers = [first];
  calls.length = notices.length = 0;
  const root = createRoot(document.getElementById('root'));
  await React.act(async () => root.render(React.createElement(SeatRuleSwitch, { workspaceId: 'w' })));
  return root;
}
const toggle = () => document.querySelector('#seat-rule');

test('the owner switches the rule on, and a refusal is shown as it was given', async () => {
  const root = await render([200, { on: false, owner: true, perDay: 5, today: 0, runner: 'mac' }]);
  try {
    assert.deepEqual(calls, [['/api/workspaces/w/agent-seats/rule', 'GET', undefined]]);
    assert.equal(toggle().disabled, false);
    assert.match(document.body.textContent, /runner mac.*At most 5 projects a day \(UTC\).*0 so far today/);
    answers = [[200, { on: true, owner: true, perDay: 5, today: 0, runner: 'mac' }]];
    await React.act(async () => toggle().click());
    assert.deepEqual(calls.at(-1), ['/api/workspaces/w/agent-seats/rule', 'PUT', { on: true }]);
    assert.equal(toggle().getAttribute('aria-checked'), 'true');
    answers = [[409, { error: 'No runner is connected to this workspace', code: 'no_runner' }]];
    await React.act(async () => toggle().click());
    assert.deepEqual([notices.at(-1).variant, notices.at(-1).description], ['destructive', 'No runner is connected to this workspace']);
    assert.equal(toggle().getAttribute('aria-checked'), 'true', 'a refused switch leaves it as it was');
  } finally { await React.act(async () => root.unmount()); }
});

test('anyone else sees the rule and its count, and cannot switch it', async () => {
  const root = await render([200, { on: true, owner: false, perDay: 5, today: 3, runner: null }]);
  try {
    assert.equal(toggle().disabled, true);
    assert.match(document.body.textContent, /3 so far today.*Only the workspace's owner can switch this/);
    assert.doesNotMatch(document.body.textContent, /Connect a runner first/);
  } finally { await React.act(async () => root.unmount()); }
});
