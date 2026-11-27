const { assert, test, load } = require('../security/helpers.cjs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<div id="root"></div>', { url: 'https://collab.test/w/profile' });
global.window = dom.window; global.document = dom.window.document; global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { createRoot } = require('react-dom/client');

const summary = load('src/components/profile/issueNotificationSummary.ts');

// UI primitives as plain elements, so the test reads the DOM the way a person reads the screen.
const pass = tag => ({ children, className }) => React.createElement(tag, { className }, children);
const RadioContext = React.createContext({});
const ui = {
  '@/components/ui/card': { Card: pass('section'), CardHeader: pass('div'), CardTitle: pass('h3'), CardDescription: pass('p'), CardContent: pass('div') },
  '@/components/ui/button': { Button: ({ children, onClick, disabled, type }) => React.createElement('button', { onClick, disabled, type }, children) },
  '@/components/ui/badge': { Badge: pass('span') },
  '@/components/ui/label': { Label: ({ children, htmlFor, className }) => React.createElement('label', { htmlFor, className }, children) },
  '@/components/ui/input': { Input: props => React.createElement('input', props) },
  '@/components/ui/switch': { Switch: ({ id, checked, onCheckedChange, disabled, ...rest }) => React.createElement('button', {
    id, role: 'switch', 'aria-checked': String(!!checked), 'aria-label': rest['aria-label'], disabled, onClick: () => onCheckedChange(!checked) }) },
  '@/components/ui/checkbox': { Checkbox: ({ id, checked, onCheckedChange, disabled }) => React.createElement('input', {
    id, type: 'checkbox', checked: !!checked, disabled, onChange: event => onCheckedChange(event.target.checked) }) },
  '@/components/ui/radio-group': {
    RadioGroup: ({ value, onValueChange, children, disabled }) => React.createElement(RadioContext.Provider, { value: { value, onValueChange, disabled } }, React.createElement('div', { role: 'radiogroup' }, children)),
    RadioGroupItem: ({ id, value }) => {
      const group = React.useContext(RadioContext);
      return React.createElement('input', { id, type: 'radio', value, checked: group.value === value, disabled: group.disabled, onChange: () => group.onValueChange(value) });
    } },
};
const icon = () => React.createElement('svg', { 'aria-hidden': 'true' });
const icons = new Proxy({}, { get: (_, key) => (key === '__esModule' ? false : icon) });

const notices = [];
const calls = [];
let data;
let answers = {};
const mutation = name => () => ({ isPending: false, mutateAsync: async body => {
  calls.push([name, body]);
  const answer = (answers[name] || []).shift();
  if (!answer) throw new Error(`no answer for ${name}`);
  if (answer.error) throw Object.assign(new Error(answer.error.message || 'failed'), answer.error);
  return answer.body;
} });
const hooks = {
  useIssueNotificationSettings: () => ({ data, isLoading: false }),
  useUpdateIssueNotificationSettings: mutation('update'),
  useSaveSlackAddress: mutation('save'),
  useRemoveSlackAddress: mutation('remove'),
  useSendSlackTest: mutation('test'),
};
const common = { react: React, 'react/jsx-runtime': require('react/jsx-runtime'), 'lucide-react': icons,
  '@/hooks/use-toast': { useToast: () => ({ toast: notice => notices.push(notice) }) },
  '@/context/WorkspaceContext': { useWorkspace: () => ({ currentWorkspace: { id: 'w' } }) } };
const { IssueNotificationSettings } = load('src/components/profile/IssueNotificationSettings.tsx', {
  ...common, ...ui, './issueNotificationSummary': summary, '@/hooks/queries/useNotificationPreferences': hooks,
}, { Date });

const off = { mineAssigned: false, mineReported: false, mineFollowed: false, onStatus: false, onAssigned: false, onReactions: false, comments: 'off' };
const MASK = 'https://hooks.slack.com/services/T01•••/B02•••/••••••only';
const FULL = 'https://hooks.slack.com/services/T0123ABCD/B0456EFGH/fakeonly';
const view = (choices = {}, slack = {}) => ({ ...off, ...choices, slack: { address: null, on: false, offAt: null, failedAt: null, ...slack } });

const text = () => document.getElementById('root').textContent;
const byLabel = label => {
  const found = [...document.querySelectorAll('label')].find(candidate => candidate.textContent === label);
  assert.ok(found, `no label ${label}`);
  return document.getElementById(found.htmlFor);
};
const button = label => [...document.querySelectorAll('button')].find(candidate => candidate.textContent === label);
const slackSwitch = () => document.querySelector('[aria-label="Send to Slack"]');
const click = target => React.act(async () => target.click());
const type = (input, value) => React.act(async () => {
  Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(input, value);
  input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
});

async function shown(start, then, component = IssueNotificationSettings) {
  data = start; answers = {}; calls.length = 0; notices.length = 0;
  const root = createRoot(document.getElementById('root'));
  await React.act(async () => root.render(React.createElement(component)));
  try { await then(); } finally { await React.act(async () => root.unmount()); }
}

test('everything off: the switch is disabled, no box is ticked, Comments is Off, In-app and Email are disabled and marked Later', () => shown(view(), async () => {
  assert.equal(slackSwitch().disabled, true);
  assert.equal(slackSwitch().getAttribute('aria-checked'), 'false');
  assert.ok(text().includes('Not set up'));
  for (const label of ['Issues assigned to me', 'Issues I reported', 'Issues I follow', 'The status changes', 'An issue is assigned to me', 'Acks and likes on my comments']) {
    assert.equal(byLabel(label).checked, false, label);
  }
  assert.equal(byLabel('Off').checked, true);
  assert.equal(byLabel('Only comments that mention me').checked, false);
  assert.equal(byLabel('All comments').checked, false);
  const others = [...document.querySelectorAll('[role=switch]')].filter(candidate => candidate !== slackSwitch());
  assert.equal(others.length, 2);
  assert.ok(others.every(candidate => candidate.disabled));
  assert.equal(text().match(/Later/g).length, 2);
  assert.ok(text().includes('The bell keeps working as it does today. These choices will drive it later.'));
  assert.ok(text().includes('Not sent yet.'));
  assert.ok(text().includes('Only Slack can be switched on in the first version.'));
  assert.ok(text().includes('Nothing is sent: no Slack address is saved.'));
  assert.equal(byLabel('Slack webhook address').getAttribute('placeholder'), 'https://hooks.slack.com/services/…');
  assert.ok(text().includes('In Slack: create an “Incoming webhook” for the channel you want, and paste its address here. Collab stores it encrypted and never shows it in full again.'));
}));

test('an empty address shows the hint and calls nothing', () => shown(view(), async () => {
  await click(button('Save'));
  assert.ok(text().includes('Paste the address Slack gave you.'));
  assert.deepEqual(calls, []);
}));

test('saving calls the save hook with the typed address and then shows the mask and the three buttons', () => shown(view(), async () => {
  answers.save = [{ body: view({}, { address: MASK }) }];
  await type(byLabel('Slack webhook address'), FULL);
  await click(button('Save'));
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [['save', { url: FULL }]]);
  assert.ok(text().includes(MASK));
  for (const label of ['Send test message', 'Replace', 'Remove']) assert.ok(button(label), label);
  assert.ok(text().includes('Address saved. Slack stays off until you switch it on.'));
  assert.ok(text().includes('Saved, switched off'));
  assert.equal(slackSwitch().disabled, false);
}));

test('the address input is gone after saving and the full address is nowhere in the document', () => shown(view(), async () => {
  answers.save = [{ body: view({}, { address: MASK }) }];
  await type(byLabel('Slack webhook address'), FULL);
  await click(button('Save'));
  assert.equal(document.querySelector('input[placeholder="https://hooks.slack.com/services/…"]'), null);
  assert.ok(!document.documentElement.outerHTML.includes(FULL));
  assert.ok(![...document.querySelectorAll('input')].some(input => input.value === FULL));
}));

test('a refused address shows the refusal text', () => shown(view(), async () => {
  answers.save = [{ error: { status: 400, code: 'not_slack' } }, { error: { status: 503, code: 'not_configured' } }];
  await type(byLabel('Slack webhook address'), 'https://example.com/hook');
  await click(button('Save'));
  assert.ok(text().includes('Only a Slack webhook address is accepted. It starts with https://hooks.slack.com/services/'));
  await click(button('Save'));
  assert.ok(text().includes('Slack addresses cannot be stored on this server yet.'));
}));

test('ticking a box calls the update hook with that one key', () => shown(view({}, { address: MASK }), async () => {
  answers.update = [{ body: view({ mineFollowed: true }, { address: MASK }) }];
  await click(byLabel('Issues I follow'));
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [['update', { mineFollowed: true }]]);
  assert.equal(byLabel('Issues I follow').checked, true);
}));

test('a failed save shows a toast and puts the box back', () => shown(view({}, { address: MASK }), async () => {
  answers.update = [{ error: { status: 500 } }];
  await click(byLabel('The status changes'));
  assert.equal(byLabel('The status changes').checked, false);
  assert.equal(notices.length, 1);
  assert.equal(notices[0].variant, 'destructive');
}));

test('choosing All comments calls it with comments: \'all\'', () => shown(view({}, { address: MASK }), async () => {
  answers.update = [{ body: view({ comments: 'all' }, { address: MASK }) }];
  await click(byLabel('All comments'));
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [['update', { comments: 'all' }]]);
  assert.equal(byLabel('All comments').checked, true);
  assert.ok(text().includes('Status changes and “all comments” need at least one box ticked under “Which issues”.'));
}));

test('switching on calls it with slackOn: true', () => shown(view({}, { address: MASK }), async () => {
  const starting = { mineAssigned: true, mineReported: true, mineFollowed: true, onStatus: true, onAssigned: true, onReactions: true, comments: 'mentions' };
  answers.update = [{ body: view(starting, { address: MASK, on: true }) }];
  await click(slackSwitch());
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [['update', { slackOn: true }]]);
  assert.equal(slackSwitch().getAttribute('aria-checked'), 'true');
  assert.ok(text().includes('First time on: a starting set was ticked for you. Change anything.'));
  assert.ok(text().includes('With these settings: Slack gets a message when an issue is assigned to you; someone mentions you, on any issue; someone acks or likes a comment you wrote; and on issues assigned to you, issues you reported, issues you follow: its status changes.'));
}));

test('switching on with choices already kept shows no first-time text', () => shown(view({ onAssigned: true }, { address: MASK }), async () => {
  answers.update = [{ body: view({ onAssigned: true }, { address: MASK, on: true }) }];
  await click(slackSwitch());
  assert.ok(!text().includes('First time on'));
}));

test('the test message results', () => shown(view({}, { address: MASK, on: true }), async () => {
  answers.test = [{ body: { result: 'ok', settings: view({}, { address: MASK, on: true }) } }, { body: { result: 'failed', settings: view({}, { address: MASK, on: true }) } }];
  await click(button('Send test message'));
  assert.deepEqual(calls.map(([name, body]) => [name, body]), [['test', undefined]]);
  assert.ok(text().includes('Test message sent. Look in your Slack channel.'));
  await click(button('Send test message'));
  assert.ok(text().includes('Slack did not accept the test message. Try again in a moment.'));
}));

test('offAt set shows the switched-off text with the date', () => {
  const offAt = '2026-11-20T09:30:00.000Z';
  return shown(view({}, { address: MASK, offAt }), async () => {
    assert.ok(text().includes(`Switched off on ${new Date(offAt).toLocaleDateString()}: Slack says this address no longer exists. Paste a new address to switch Slack on again. Your ticks are kept.`));
    assert.ok(text().includes('Switched off by Collab'));
  });
});

test('failedAt set shows the could-not-be-delivered text', () => {
  const failedAt = '2026-11-21T14:05:00.000Z';
  return shown(view({}, { address: MASK, on: true, failedAt }), async () => {
    assert.ok(text().includes(`The last message could not be delivered (${new Date(failedAt).toLocaleString()}). Slack stays on; the next message is tried as usual.`));
  });
});

test('Replace shows the input with Cancel, and Cancel brings the mask back', () => shown(view({}, { address: MASK, on: true }), async () => {
  await click(button('Replace'));
  assert.ok(byLabel('Slack webhook address'));
  assert.ok(button('Cancel'));
  await click(button('Cancel'));
  assert.ok(text().includes(MASK));
  answers.save = [{ body: view({}, { address: MASK, on: true }) }];
  await click(button('Replace'));
  await type(byLabel('Slack webhook address'), FULL);
  await click(button('Save'));
  assert.ok(text().includes('New address saved.'));
}));

test('Remove calls the remove hook', () => shown(view({ onAssigned: true }, { address: MASK, on: true }), async () => {
  answers.remove = [{ body: view({ onAssigned: true }) }];
  await click(button('Remove'));
  assert.deepEqual(calls.map(([name, body]) => [name, body]), [['remove', undefined]]);
  assert.ok(text().includes('Address removed. Slack is off; your ticks are kept.'));
  assert.ok(text().includes('Not set up'));
  assert.equal(byLabel('An issue is assigned to me').checked, true);
}));

function loadNotificationSettings() {
  const preferences = { emailNotificationsEnabled: true, pushNotificationsEnabled: false, leaveRequestStatusChanged: true, leaveRequestEdited: true, leaveRequestManagerAlert: false, leaveRequestHRAlert: false, taskUpdated: true, taskDeleted: true, boardTaskCreated: true, boardTaskStatusChanged: true, boardTaskDeleted: true };
  const { default: NotificationSettings } = load('src/components/profile/NotificationSettings.tsx', {
    ...common, ...ui,
    '@/components/ui/separator': { Separator: () => null },
    '@/components/ui/collapsible': { Collapsible: ({ children }) => children, CollapsibleTrigger: ({ children }) => children, CollapsibleContent: ({ children }) => children },
    '@/hooks/queries/useNotificationPreferences': {
      useNotificationPreferences: () => ({ data: preferences, isLoading: false }),
      useUpdateNotificationPreferences: () => ({ isPending: false, mutateAsync: async () => preferences }),
      useResetNotificationPreferences: () => ({ isPending: false, mutateAsync: async () => preferences }),
    },
    '@/hooks/usePushNotifications': { usePushNotifications: () => ({ isSupported: true, isSubscribed: false, isLoading: false, toggleSubscription: async () => {} }) },
    '@/hooks/use-workspace-permissions': { useWorkspacePermissions: () => ({ canManageLeave: false }) },
    './IssueNotificationSettings': { default: () => React.createElement('div', { 'data-testid': 'issue-settings' }, 'ISSUE SETTINGS'), IssueNotificationSettings: () => null },
  });
  return NotificationSettings;
}

test('the two groups that changed nothing are gone', () => {
  const NotificationSettings = loadNotificationSettings();
  return shown(view(), async () => {
    const headings = [...document.querySelectorAll('h3')].map(heading => heading.textContent);
    assert.ok(!headings.includes('Issue Notifications'), headings.join('|'));
    assert.ok(!headings.includes('Project Notifications'), headings.join('|'));
    assert.ok(headings.includes('Leave Request Notifications'));
    assert.ok(text().includes('Email Delivery'));
    assert.ok(text().includes('Browser Push Notifications'));
    const block = document.querySelector('[data-testid=issue-settings]');
    assert.ok(block);
    const firstGroup = [...document.querySelectorAll('h3')].find(heading => heading.textContent === 'Email Notifications');
    assert.ok(block.compareDocumentPosition(firstGroup) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING);
  }, NotificationSettings);
});

test('the page no longer explains issue versus project notifications', () => shown(view(), async () => {
  assert.ok(text().includes('Email Delivery'));
  assert.ok(!text().includes('Issue vs Project Notifications'));
}, loadNotificationSettings()));
