const { test } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { load, matches } = require('./helpers.cjs');
const { JSDOM } = require('jsdom');
const { commentHtml } = load('src/lib/comment-html.ts', {
  'isomorphic-dompurify': { default: require('isomorphic-dompurify') }, marked: require('marked'),
});
const { AgentInboxView } = load('src/components/agents/AgentInboxView.tsx', {
  'react/jsx-runtime': require('react/jsx-runtime'),
  '@/lib/comment-html': { commentHtml },
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
test('inbox shows sender, claimant and issue link without executable handoff content', () => {
  const html = renderToStaticMarkup(React.createElement(AgentInboxView, { workspace: { id: 'ws', slug: 'team' }, agents: [{ name: 'worker-a' }], selected: 'worker-a', state: 'unseen', inbox: {
    hasMore: true, items: [{ id: 'handoff', issue: { id: 'issue', issueKey: 'APP-1', title: 'Finish review' }, content: '<script>alert(1)</script>', sender: { name: 'sender' }, claimedBy: { name: 'worker-a' }, recipientNames: ['worker-a'], labelIds: [], status: 'claimed', requestAck: true, createdAt: new Date('2026-10-17T00:00:00Z') }],
  } }));
  assert.match(html, /From sender/); assert.match(html, /Claimed by worker-a/); assert.match(html, /href="\/team\/issues\/APP-1"/);
  assert.doesNotMatch(html, /<script\b/i); assert.match(html, /Showing the oldest 50/);
});

test('web inbox exposes current identity, stale/error health and successful callback time without claiming model execution', async () => {
  const stamp = '2026-10-26T16:00:00.000Z';
  const f = fixture({ agents: [
    { name: 'legacy', host: null, sessionId: null, watcher: null },
    { name: 'current', host: 'review-pc', sessionId: 'session-1', watcher: { state: 'stale', lastPollAt: stamp, lastWakeAt: stamp } },
    { name: 'failed', host: 'other-pc', sessionId: 'session-2', watcher: { state: 'error', errorCode: 'wake_callback_failed' } },
  ] });
  const document = new JSDOM(renderToStaticMarkup(await f.run())).window.document;
  const table = document.querySelector('[aria-label="Agent watcher health"]');
  assert.ok(table.textContent.includes('does not prove that the model acted'));
  const rows = table.querySelectorAll('tbody tr');
  assert.equal(rows.length, 3);
  assert.ok(rows[0].textContent.includes('Not reported'));
  assert.ok(rows[1].textContent.includes('review-pcsession-1'));
  assert.ok(rows[1].textContent.includes('stale'));
  assert.equal(rows[1].querySelectorAll(`time[datetime="${stamp}"]`).length, 2);
  assert.ok(rows[2].textContent.includes('wake_callback_failed'));
  assert.deepEqual(f.calls, ['inbox']);
});

test('inbox handoff details render Markdown structures and sanitize untrusted HTML', () => {
  const content = '# Suite confirmation\n\n## Contract\n\n**Completed** with `generationId`\n\n- First step\n- Second step\n\n1. Review\n2. Reply\n\n[Contract](https://example.com/contract)\n\n```json\n{"eventName":"generation.succeeded"}\n```\n\n<script>alert(1)</script><img src=x onerror="alert(1)"><a href="javascript:alert(1)">unsafe</a>';
  const html = renderToStaticMarkup(React.createElement(AgentInboxView, {
    workspace: { id: 'ws', slug: 'team' }, agents: [{ name: 'worker-a' }], state: 'unseen', inbox: {
      hasMore: false, items: [{ id: 'handoff', issue: { id: 'issue', issueKey: 'COF-45', title: 'Contract' },
        content, recipientNames: ['worker-a'], labelIds: [], status: 'open', createdAt: new Date('2026-10-17T00:00:00Z') }],
    },
  }));
  const details = new JSDOM(html).window.document.querySelector('article details');
  assert.equal(details.querySelector('h1')?.textContent, 'Suite confirmation');
  assert.equal(details.querySelector('h2')?.textContent, 'Contract');
  assert.equal(details.querySelector('strong')?.textContent, 'Completed');
  assert.equal(details.querySelector('p code')?.textContent, 'generationId');
  assert.equal(details.querySelectorAll('ul li').length, 2);
  assert.equal(details.querySelectorAll('ol li').length, 2);
  assert.equal(details.querySelector('a')?.getAttribute('href'), 'https://example.com/contract');
  assert.equal(details.querySelector('pre code')?.textContent.trim(), '{"eventName":"generation.succeeded"}');
  assert.equal(details.querySelectorAll('script,[onerror],[href^="javascript:"]').length, 0);
});

test('inbox SVG data images remain static images in every agent and queue view', () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(document.domain)</script></svg>';
  const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  const contents = [`![Diagram](${src})`, `<img src="${src}" alt="Diagram" onclick="alert(1)" onload="alert(1)">`];
  for (const selected of [undefined, 'worker-a']) {
    for (const state of ['unseen', 'claimed']) {
      const html = renderToStaticMarkup(React.createElement(AgentInboxView, {
        workspace: { id: 'ws', slug: 'team' }, agents: [{ name: 'worker-a' }], selected, state, inbox: {
          hasMore: false, items: contents.map((content, index) => ({
            id: `handoff-${index}`, issue: { id: 'issue', issueKey: 'COF-45', title: 'Diagram' },
            content, recipientNames: ['worker-a'], labelIds: [], status: state === 'claimed' ? 'claimed' : 'open',
            createdAt: new Date('2026-10-17T00:00:00Z'),
          })),
        },
      }));
      const dom = new JSDOM(html);
      try {
        const details = dom.window.document.querySelectorAll('article details');
        assert.equal(details.length, contents.length);
        for (const detail of details) {
          const images = detail.querySelectorAll('img');
          assert.equal(images.length, 1);
          assert.equal(images[0].getAttribute('src'), src);
          assert.equal(images[0].getAttribute('alt'), 'Diagram');
          assert.equal(images[0].closest('a,button,[role="button"]'), null);
          assert.equal(detail.querySelectorAll('a,script,svg,iframe,object,embed').length, 0);
          for (const element of detail.querySelectorAll('*')) {
            assert.ok(element.getAttributeNames().every(name => !/^on/i.test(name)));
          }
        }
      } finally {
        dom.window.close();
      }
    }
  }
});
