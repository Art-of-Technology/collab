const { test } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { load } = require('./helpers.cjs');
const helpers = load('src/components/issue/sections/activity/utils/activityHelpers.ts');
const { ActivityItem } = load('src/components/issue/sections/activity/components/ActivityItem.tsx', {
  'react/jsx-runtime': require('react/jsx-runtime'), 'date-fns': require('date-fns'),
  '@/components/ui/custom-avatar': { CustomAvatar: () => null },
  './ActivityIcon': { ActivityIcon: () => null }, './ActivityChangeDetails': { ActivityChangeDetails: () => null },
  '../utils/activityHelpers': helpers,
});

test('agent timeline identifies each agent and the work transition', () => {
  const expected = { AGENT_CLAIM: 'picked up the work', AGENT_PROGRESS: 'reported progress', AGENT_COMPLETE: 'completed the handoff', AGENT_RELEASE: 'released the work', AGENT_ACKNOWLEDGED: 'acknowledged the handoff' };
  for (const [action, text] of Object.entries(expected)) {
    const activity = { action, details: { agent: { name: 'builder-a' } }, user: { name: 'Account owner' }, createdAt: new Date() };
    assert.equal(helpers.getActionText(activity), `builder-a ${text}`);
    assert.match(renderToStaticMarkup(React.createElement(ActivityItem, { activity })), new RegExp(`builder-a ${text}`));
  }
  const activity = { action: 'AGENT_PASSED', details: { agent: { name: 'builder-a' }, toAgents: ['reviewer-b'], toLabels: ['role-id'], content: '<script>unsafe</script>\nEvidence retained' }, user: { name: 'Owner' }, createdAt: new Date() };
  assert.equal(helpers.getActionText(activity), 'builder-a passed the work on to reviewer-b, role subscribers');
  const html = renderToStaticMarkup(React.createElement(ActivityItem, { activity }));
  assert.match(html, /Handoff details/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.equal(helpers.getActionText({ action: 'CREATED', user: { name: 'Cem' } }), 'Cem created this issue');
});
