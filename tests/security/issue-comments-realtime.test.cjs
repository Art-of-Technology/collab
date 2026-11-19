const { assert, test, load } = require('./helpers.cjs');

test('workspace subscribers share one stream and release it only after the last subscriber', () => {
  const sources = [];
  class EventSource {
    constructor(url, options) { this.url = url; this.options = options; this.closed = false; sources.push(this); }
    close() { this.closed = true; }
    send(data) { this.onmessage({ data: JSON.stringify(data) }); }
  }
  const { subscribeWorkspaceEvents } = load('src/lib/workspace-event-source.ts', {}, { EventSource });
  const first = [], second = [];
  const stopFirst = subscribeWorkspaceEvents('w', data => first.push(data.type));
  const stopSecond = subscribeWorkspaceEvents('w', data => second.push(data.type));
  assert.equal(sources.length, 1);
  assert.equal(sources[0].url, '/api/realtime/workspace/w/stream');
  assert.equal(sources[0].options.withCredentials, true);
  sources[0].send({ type: 'issue.comments.changed' });
  stopFirst();
  assert.equal(sources[0].closed, false);
  sources[0].send({ type: 'realtime.ready' });
  assert.deepEqual(first, ['issue.comments.changed']);
  assert.deepEqual(second, ['issue.comments.changed', 'realtime.ready']);
  stopSecond();
  assert.equal(sources[0].closed, true);
  subscribeWorkspaceEvents('w', () => {})();
  assert.equal(sources.length, 2);
});

test('comment hook refreshes only its thread and catches up after reconnect with foreground fallback', () => {
  let handler, cleanup, stopped = false;
  const invalidations = [];
  const { useIssueComments } = load('src/hooks/queries/useIssueComment.ts', {
    react: { useEffect: effect => { cleanup = effect(); } },
    '@tanstack/react-query': { useQuery: options => options, useQueryClient: () => ({ invalidateQueries: args => invalidations.push(args.queryKey) }) },
    '@/lib/workspace-event-source': { subscribeWorkspaceEvents: (workspace, listener) => {
      assert.equal(workspace, 'w'); handler = listener; return () => { stopped = true; };
    } },
    'next-auth/react': {}, '@/actions/issueComment': {}, '@/hooks/use-toast': {},
  });
  const options = useIssueComments('i', [], 'w');
  handler({ type: 'issue.comments.changed', workspaceId: 'other', issueId: 'i' });
  handler({ type: 'issue.comments.changed', workspaceId: 'w', issueId: 'other' });
  handler({ type: 'issue.updated', workspaceId: 'w', issueId: 'i' });
  assert.equal(invalidations.length, 0);
  handler({ type: 'issue.comments.changed', workspaceId: 'w', issueId: 'i' });
  handler({ type: 'realtime.ready' });
  assert.equal(invalidations.length, 2);
  for (const key of invalidations) assert.equal(JSON.stringify(key), JSON.stringify(['issue-comments', 'list', 'i']));
  assert.equal(options.refetchInterval, 30000);
  assert.equal(options.refetchIntervalInBackground, false);
  cleanup();
  assert.equal(stopped, true);
});

test('browser comment creation publishes metadata only after the database write and not after a failed write', async () => {
  let failWrite = false;
  const order = [], events = [];
  const dependencies = {
    'next/server': { NextResponse: Response },
    '@/lib/prisma': { prisma: { issueComment: { create: async () => {
      if (failWrite) throw new Error('write failed');
      order.push('write'); return { id: 'comment', content: 'private text' };
    } } } },
    '@/lib/session': { getCurrentUser: async () => ({ id: 'user' }) },
    '@/lib/issue-finder': { findIssueByIdOrKey: async () => ({ id: 'i', workspaceId: 'w' }) },
    '@/lib/forge/legacy-write-guard': { assertLegacyIssueWriteAllowed: async () => {}, ForgeProjectWriteError: class extends Error {} },
    '@/utils/mentions': { extractMentionUserIds: () => [] },
    '@/lib/notification-service': {}, '@prisma/client': {},
    '@/lib/redis': { publishEvent: async (channel, event) => { order.push('publish'); events.push({ channel, event }); return false; } },
  };
  const { POST } = load('src/app/api/issues/[issueId]/comments/route.ts', dependencies, { console: { error() {} } });
  const call = () => POST(new Request('https://example.test', { method: 'POST', body: JSON.stringify({ content: 'private text' }) }), { params: Promise.resolve({ issueId: 'i' }) });
  assert.equal((await call()).status, 201); // Redis outage does not fail a saved comment.
  assert.deepEqual(order, ['write', 'publish']);
  assert.equal(JSON.stringify(events), JSON.stringify([{ channel: 'workspace:w:events', event: { type: 'issue.comments.changed', workspaceId: 'w', issueId: 'i' } }]));
  failWrite = true;
  assert.equal((await call()).status, 500);
  assert.equal(events.length, 1);
});

test('agent/API comments publish the same workspace event as browser comments', async () => {
  const order = [];
  const { POST } = load('src/app/api/apps/auth/issues/[issueIdOrKey]/comments/route.ts', {
    'next/server': { NextResponse: Response }, zod: require('zod'),
    '@/lib/apps/auth-middleware': { withAppAuth: handler => handler },
    '@/lib/agent-seats': { HandoffError: class extends Error {}, seatWriteGuard: async () => {} },
    '@/lib/forge/legacy-write-guard': { ForgeProjectWriteError: class extends Error {}, assertLegacyIssueWriteAllowed: async () => {} },
    '@/lib/prisma': { prisma: {
      issue: { findFirst: async () => ({ id: 'i', projectId: 'p' }) },
      issueComment: { create: async () => { order.push('write'); return { id: 'c' }; } },
      issueActivity: { create: async () => { order.push('activity'); } },
    } },
    '@/lib/redis': { publishEvent: async (channel, event) => {
      assert.equal(channel, 'workspace:w:events');
      assert.equal(event.type, 'issue.comments.changed');
      assert.equal(event.issueId, 'i');
      order.push('publish');
    } },
  });
  const result = await POST(new Request('https://example.test', { method: 'POST', body: JSON.stringify({ content: 'agent comment' }) }),
    { workspace: { id: 'w' }, user: { id: 'agent' } }, { params: Promise.resolve({ issueIdOrKey: 'CLB-1' }) });
  assert.equal(result.status, 201);
  assert.deepEqual(order, ['write', 'activity', 'publish']);
});

for (const phase of ['connect', 'publish', 'reject', 'success']) {
  test(`bounded Redis publication handles ${phase} without holding a saved comment response`, async () => {
    let timer, cleared = 0;
    const client = {
      isOpen: phase !== 'connect', on() {},
      connect: () => new Promise(() => {}),
      publish: async () => {
        if (phase === 'publish') return new Promise(() => {});
        if (phase === 'reject') throw new Error('Redis unavailable');
      },
    };
    const { publishEvent } = load('src/lib/redis.ts', { redis: { createClient: () => client } }, {
      process: { env: { REDIS_URL: 'redis://test.invalid', NODE_ENV: 'test' } },
      console: { warn() {}, error() {} },
      setTimeout: (callback, ms) => { assert.equal(ms, 1000); timer = callback; return 1; },
      clearTimeout: () => { cleared++; },
    });
    const result = publishEvent('workspace:w:events', { type: 'issue.comments.changed' }, 1000);
    if (phase === 'connect' || phase === 'publish') timer();
    assert.equal(await result, phase === 'success');
    assert.equal(cleared, 1);
  });
}
