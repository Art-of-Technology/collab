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
const pagePath = 'src/app/(main)/[workspaceId]/agent-inbox/page.tsx';
function fixture({ user = 'alice', member = true, agents = [{ name: 'worker-a' }] } = {}) {
  const calls = [];
  const workspace = { id: 'ws', slug: 'team', ownerId: 'bob', members: [{ userId: 'alice', status: member }] };
  const prisma = {
    workspace: { findFirst: async ({ where }) => matches(workspace, where) ? workspace : null },
    agentRegistration: { findMany: async ({ where }) => {
      calls.push('registrations'); assert.equal(where.userId, 'alice'); assert.equal(where.workspaceId, 'ws'); return agents;
    } },
  };
  const page = load(pagePath, {
    'react/jsx-runtime': require('react/jsx-runtime'),
    'next/navigation': { redirect: () => { throw new Error('login'); }, notFound: () => { throw new Error('404'); } },
    '@/lib/request-session': { getServerSession: async () => user ? { user: { id: user } } : null },
    '@/lib/auth': { authOptions: {} }, '@/lib/prisma': { prisma },
    '@/lib/post-access': load('src/lib/post-access.ts'),
    '@/lib/agent-handoffs': { agentInbox: async (context, query) => {
      calls.push('inbox'); assert.equal(context.user.id, 'alice'); assert.equal(context.workspace.id, 'ws');
      assert.equal(query.agent, 'worker-a'); assert.equal(query.limit, 50);
      return { agent: query.agent, items: [], hasMore: false };
    } },
    '@/components/agents/AgentInboxView': { AgentInboxView },
  }).default;
  return { calls, run: (query = {}) => page({ params: Promise.resolve({ workspaceId: 'team' }), searchParams: Promise.resolve(query) }) };
}
test('web inbox rejects anonymous, removed members and another users agent before reading messages', async () => {
  for (const [options, query, error] of [[{ user: null }, {}, /login/], [{ member: false }, {}, /404/], [{}, { agent: 'someone-else' }, /404/]]) {
    const f = fixture(options); await assert.rejects(f.run(query), error); assert.ok(!f.calls.includes('inbox'));
  }
});
test('web inbox renders own queue and registration empty state without mutations', async () => {
  const f = fixture(); const html = renderToStaticMarkup(await f.run({ state: 'claimed' }));
  assert.match(html, /No claimed work/); assert.match(html, /worker-a/); assert.deepEqual(f.calls, ['registrations', 'inbox']);
  const empty = fixture({ agents: [] }); assert.match(renderToStaticMarkup(await empty.run()), /collab agents register/); assert.deepEqual(empty.calls, ['registrations']);
});
test('inbox shows sender, claimant, issue link and escaped handoff content', () => {
  const html = renderToStaticMarkup(React.createElement(AgentInboxView, { workspace: { id: 'ws', slug: 'team' }, agents: [{ name: 'worker-a' }], selected: 'worker-a', state: 'unseen', inbox: {
    hasMore: true, items: [{ id: 'handoff', issue: { id: 'issue', issueKey: 'APP-1', title: 'Finish review' }, content: '<script>alert(1)</script>', sender: { name: 'sender' }, claimedBy: { name: 'worker-a' }, status: 'claimed', requestAck: true, createdAt: new Date('2026-10-17T00:00:00Z') }],
  } }));
  assert.match(html, /From sender/); assert.match(html, /Claimed by worker-a/); assert.match(html, /href="\/team\/issues\/APP-1"/);
  assert.match(html, /&lt;script&gt;/); assert.doesNotMatch(html, /<script\b/i); assert.match(html, /Showing the oldest 50/);
});
