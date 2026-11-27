const { assert, test, load } = require('./helpers.cjs');

// The module runs in its own context, so its objects are not this realm's: compare plain copies.
const loaded = load('src/components/profile/issueNotificationSummary.ts');
const summaryLine = view => JSON.parse(JSON.stringify(loaded.summaryLine(view)));

const off = { mineAssigned: false, mineReported: false, mineFollowed: false, onStatus: false, onAssigned: false, onReactions: false, comments: 'off' };
const slack = (address, on) => ({ address, on, offAt: null, failedAt: null });
const view = (choices, address = 'https://hooks.slack.com/services/T0…/•••only', on = true) => ({ ...off, ...choices, slack: slack(address, on) });
const starting = { mineAssigned: true, mineReported: true, mineFollowed: true, onStatus: true, onAssigned: true, onReactions: true, comments: 'mentions' };
const WARN = 'Status changes and “all comments” need at least one box ticked under “Which issues”.';

test('no address: nothing is sent', () => {
  assert.deepEqual(summaryLine(view(starting, null, false)), { text: 'Nothing is sent: no Slack address is saved.' });
});

test('an address with Slack off: nothing is sent', () => {
  assert.deepEqual(summaryLine(view(starting, 'masked', false)), { text: 'Nothing is sent: Slack is switched off.' });
});

test('Slack on with nothing ticked: nothing is sent', () => {
  assert.deepEqual(summaryLine(view({})), { text: 'Nothing is sent: Slack is on, but nothing is ticked.' });
});

test('the starting set reads as one sentence', () => {
  assert.deepEqual(summaryLine(view(starting)), { text: 'With these settings: Slack gets a message when an issue is assigned to you; someone mentions you, on any issue; someone acks or likes a comment you wrote; and on issues assigned to you, issues you reported, issues you follow: its status changes.' });
});

test('only the any-issue clauses', () => {
  assert.deepEqual(summaryLine(view({ onAssigned: true })), { text: 'With these settings: Slack gets a message when an issue is assigned to you.' });
  assert.deepEqual(summaryLine(view({ comments: 'mentions', onReactions: true })), { text: 'With these settings: Slack gets a message when someone mentions you, on any issue; someone acks or likes a comment you wrote.' });
});

test('only the which-issues part, with both events', () => {
  assert.deepEqual(summaryLine(view({ mineFollowed: true, onStatus: true, comments: 'all' })), { text: 'With these settings: Slack gets a message when someone mentions you, on any issue; and on issues you follow: its status changes, and someone comments on it.' });
  assert.deepEqual(summaryLine(view({ mineReported: true, onStatus: true })), { text: 'With these settings: Slack gets a message when on issues you reported: its status changes.' });
});

test('boxes ticked but no status and no all comments: no which-issues part', () => {
  assert.deepEqual(summaryLine(view({ mineAssigned: true, onAssigned: true })), { text: 'With these settings: Slack gets a message when an issue is assigned to you.' });
  assert.deepEqual(summaryLine(view({ mineAssigned: true })), { text: 'Nothing is sent: Slack is on, but nothing is ticked.' });
});

test('status or all comments with no which-issues box warns', () => {
  assert.deepEqual(summaryLine(view({ onStatus: true })), { text: 'Nothing is sent: Slack is on, but nothing is ticked.', warn: WARN });
  assert.deepEqual(summaryLine(view({ comments: 'all', onAssigned: true })), { text: 'With these settings: Slack gets a message when an issue is assigned to you; someone mentions you, on any issue.', warn: WARN });
  assert.equal(summaryLine(view({ comments: 'mentions' })).warn, undefined);
});
