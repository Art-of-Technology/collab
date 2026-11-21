const { test } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { load } = require('./helpers.cjs');
const { commentHtml } = load('src/lib/comment-html.ts', { 'isomorphic-dompurify': { default: require('isomorphic-dompurify') }, marked: require('marked') });
const helpers = load('src/components/issue/sections/activity/utils/activityHelpers.ts');
const { ActivityItem } = load('src/components/issue/sections/activity/components/ActivityItem.tsx', {
  'react/jsx-runtime': require('react/jsx-runtime'), 'date-fns': require('date-fns'), 'next/navigation': { useParams: () => ({}) },
  '@/lib/comment-html': { commentHtml }, '@/components/ui/custom-avatar': { CustomAvatar: () => null }, '@/components/ui/badge': { Badge: ({ children }) => React.createElement('span', null, children) },
  './ActivityIcon': { ActivityIcon: () => null }, './ActivityChangeDetails': { ActivityChangeDetails: () => null },
  '../utils/activityHelpers': helpers,
});

test('agent timeline identifies each agent and the work transition', () => {
  const expected = { AGENT_CLAIM: 'picked up the work', AGENT_PROGRESS: 'reported progress', AGENT_COMPLETE: 'completed the handoff', AGENT_RELEASE: 'released the work', AGENT_ACKNOWLEDGED: 'acknowledged the handoff', AGENT_SUPERSEDED: 'superseded the handoff' };
  for (const [action, text] of Object.entries(expected)) {
    const activity = { action, details: { agent: { name: 'builder-a' } }, user: { name: 'Account owner' }, createdAt: new Date() };
    assert.equal(helpers.getActionText(activity), `builder-a ${text}`);
    assert.match(renderToStaticMarkup(React.createElement(ActivityItem, { activity })), new RegExp(`builder-a ${text}`));
  }
  const activity = { action: 'AGENT_PASSED', details: { agent: { name: 'builder-a' }, toAgents: ['reviewer-b'], toLabels: ['role-id'], content: '<script>unsafe</script>\nEvidence retained' }, user: { name: 'Owner' }, createdAt: new Date() };
  assert.equal(helpers.getActionText(activity), 'builder-a passed the work on to reviewer-b, role subscribers');
  for (const tag of ['script', 'SCRIPT', 'ScRiPt', 'script type="text/javascript"']) {
    activity.details.content = `<${tag}>unsafe</script>\nEvidence retained`;
    const html = renderToStaticMarkup(React.createElement(ActivityItem, { activity }));
    assert.match(html, /Handoff details/);
    assert.doesNotMatch(html, /unsafe/);
    assert.doesNotMatch(html, /<script\b/i);
  }
  assert.equal(helpers.getActionText({ action: 'CREATED', user: { name: 'Cem' } }), 'Cem created this issue');
});

test('a request placed by room says on its timeline which seat got it and why', () => {
  const activity = { action: 'REQUEST_PLACED', details: { toSeatId: 'seat-b', to: 'Reviewer (Bob)', why: 'most room' }, user: { name: 'Developer' }, createdAt: new Date() };
  assert.match(renderToStaticMarkup(React.createElement(ActivityItem, { activity })), /Collab sent this request to Reviewer \(Bob\): most room/);
});


test('run notes and handoffs render sanitized Markdown', () => {
  for (const action of ['AGENT_RUN_FINISHED', 'AGENT_PROGRESS']) {
    const activity = { action, details: { content: '## Done\n\n- **Fixed**\n\n[Link](https://example.com)\n\n<script>alert(1)</script>' }, user: { name: 'Agent' }, createdAt: new Date() };
    const html = renderToStaticMarkup(React.createElement(ActivityItem, { activity }));
    assert.match(html, /<h2[^>]*>Done<\/h2>/);
    assert.match(html, /<li><strong>Fixed<\/strong><\/li>/);
    assert.match(html, /href="https:\/\/example.com"/);
    assert.doesNotMatch(html, /<script|alert\(1\)/);
  }
});
