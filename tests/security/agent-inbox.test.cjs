const { test } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { load, matches } = require('./helpers.cjs');
const { AgentInboxView } = load('src/components/agents/AgentInboxView.tsx', {
  'react/jsx-runtime': require('react/jsx-runtime'),
  'next/link': { default: ({ children, ...props }) => React.createElement('a', props, children) },
  '@/components/ui/button': { Button: ({ children }) => React.createElement('span', null, children) },
});
class HandoffError extends Error { code = 'agent_not_found'; }
const pagePath = 'src/app/(main)/[workspaceId]/agent-inbox/page.tsx';
function fixture({ user = 'alice', member = true, agents = [{ name: 'worker-a' }] } = {}) {
  const calls = [];
  const workspace = { id: 'ws', slug: 'team', ownerId: 'bob', members: [{ userId: 'alice', status: member }] };
  const prisma = {
    workspace: { findFirst: async ({ where }) => matches(workspace, where) ? workspace : null },

  };
  const page = load(pagePath, {
    'react/jsx-runtime': require('react/jsx-runtime'),
    'next/navigation': { redirect: () => { throw new Error('login'); }, notFound: () => { throw new Error('404'); } },
    '@/lib/request-session': { getServerSession: async () => user ? { user: { id: user } } : null },
    '@/lib/auth': { authOptions: {} }, '@/lib/prisma': { prisma },
    '@/lib/post-access': load('src/lib/post-access.ts'),
    '@/lib/agent-handoffs': { HandoffError, workspaceAgentInbox: async (context, query) => {
      calls.push('inbox'); assert.equal(context.user.id, 'alice'); assert.equal(context.workspace.id, 'ws');
      assert.equal(query.limit, 50);
      if (query.agent && !agents.some(a => a.name === query.agent)) throw new HandoffError();
      return { agents, items: [], hasMore: false };
    } },
    '@/components/agents/AgentInboxView': { AgentInboxView },
  }).default;
  return { calls, run: (query = {}) => page({ params: Promise.resolve({ workspaceId: 'team' }), searchParams: Promise.resolve(query) }) };
}
test('web inbox rejects anonymous and removed members before reading messages', async () => {
  for (const [options, query, error] of [[{ user: null }, {}, /login/], [{ member: false }, {}, /404/]]) {
    const f = fixture(options); await assert.rejects(f.run(query), error); assert.ok(!f.calls.includes('inbox'));
  }
});
test('web inbox defaults to All agents, supports a selected peer and shows registration empty state', async () => {
  const f = fixture(); const html = renderToStaticMarkup(await f.run({ state: 'claimed' }));
  assert.match(html, /No claimed work/); assert.match(html, /worker-a/); assert.deepEqual(f.calls, ['inbox']);
  assert.match(html, /<option value="" selected="">All agents<\/option>/);
  const peer = fixture({ agents: [{ name: 'peer-worker' }] });
  assert.match(renderToStaticMarkup(await peer.run({ agent: 'peer-worker' })), /<option value="peer-worker" selected="">/);
  await assert.rejects(peer.run({ agent: 'foreign-worker' }), /404/);
  const empty = fixture({ agents: [] }); assert.match(renderToStaticMarkup(await empty.run()), /collab agents register/); assert.deepEqual(empty.calls, ['inbox']);
});
test('inbox shows sender, claimant, issue link and escaped handoff content', () => {
  const html = renderToStaticMarkup(React.createElement(AgentInboxView, { workspace: { id: 'ws', slug: 'team' }, agents: [{ name: 'worker-a' }], selected: 'worker-a', state: 'unseen', inbox: {
    hasMore: true, items: [{ id: 'handoff', issue: { id: 'issue', issueKey: 'APP-1', title: 'Finish review' }, content: '<script>alert(1)</script>', sender: { name: 'sender' }, claimedBy: { name: 'worker-a' }, recipientNames: ['worker-a'], labelIds: [], status: 'claimed', requestAck: true, createdAt: new Date('2026-10-17T00:00:00Z') }],
  } }));
  assert.match(html, /From sender/); assert.match(html, /Claimed by worker-a/); assert.match(html, /href="\/team\/issues\/APP-1"/);
  assert.match(html, /&lt;script&gt;/); assert.doesNotMatch(html, /<script\b/i); assert.match(html, /Showing the oldest 50/);
});
