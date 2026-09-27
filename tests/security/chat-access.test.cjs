const { assert, test, resolve, load, matches, workspaces, prisma } = require('./helpers.cjs');


test('chat admission enforces conversation owner and workspace before either stream', async t => {
  for (const slug of ['cleo', 'coclaw']) await t.test(`${slug} stream admission`, async t => {
    const activity = [];
    const writes = [];
    let user = { id: 'alice', name: 'Alice' };
    let conversationReads = 0;
    const spaces = workspaces.map(w => ({ ...w, name: w.id, slug: w.id }));
    const rows = [
      { id: 'own', userId: 'alice', workspaceId: 'joined' },
      ...spaces.map(w => ({ id: `conversation-${w.id}`, userId: 'alice', workspaceId: w.id })),
      { id: 'foreign-owner', userId: 'bob', workspaceId: 'joined' },
      { id: 'foreign-workspace', userId: 'alice', workspaceId: 'other' },
    ];
    let lookupFails = false;
    const agent = { slug, name: slug, color: '#fff', systemPrompt: 'Test' };
    const chooseAgent = async () => { activity.push('agent'); return agent; };
    const { POST } = load('src/app/api/ai/chat/stream/route.ts', {
      'next/server': { NextResponse: Response },
      '@/lib/session': { getCurrentUser: async () => user },
      '@/lib/prisma': { prisma: {
        workspace: { findFirst: async ({ where }) => spaces.find(row => matches(row, where)) ?? null },
        aIConversation: {
          findFirst: async ({ where }) => {
            conversationReads++;
            if (lookupFails) throw new Error('Database unavailable');
            return rows.find(row => matches(row, where)) ?? null;
          },
          create: async ({ data }) => { writes.push({ kind: 'conversation', ...data }); return { id: 'new' }; },
        },
        aIAgent: { findUnique: async () => ({ id: slug }) },
        aIMessage: { create: async ({ data }) => { writes.push({ kind: 'message', ...data }); } },
        coclawChannelConfig: { findMany: async () => [] },
      } },
      '@/lib/ai/agents/registry': { getAgent: chooseAgent, getDefaultAgent: chooseAgent },
      '@/lib/ai/mcp-token': { getMcpToken: async () => { activity.push('token'); return 'test'; } },
      '@/lib/ai/mcp-client': { createMcpSession: async () => {
        activity.push('mcp'); return { convertToolsToClaudeFormat: () => [], close: async () => {} };
      } },
      '@/lib/coclaw/instance-manager': { coclawManager: { getOrCreateInstance: async () => {
        activity.push('gateway'); return { port: 1234 };
      } } },
      '@/lib/coclaw/key-resolver': { resolveApiKey: async () => {
        activity.push('key'); return { provider: 'test', key: 'test', source: 'test' };
      } },
      '@/lib/secrets/crypto': {},
      '@/lib/coclaw/notifications': { CoclawNotificationType: { COCLAW_RESPONSE: 'response' },
        createCoclawNotification: async () => { activity.push('notification'); } },
    }, {
      process: { env: {} }, Response, ReadableStream, TextEncoder, TextDecoder, AbortController, setTimeout, clearTimeout,
      console: { error() {}, warn() {} },
      fetch: async (url) => {
        activity.push(url.endsWith('/api/events') ? 'events' : 'provider');
        if (url.endsWith('/api/events')) return new Response('');
        const events = slug === 'coclaw'
          ? [{ choices: [{ delta: { content: 'Reply' }, finish_reason: 'stop' }] }]
          : [{ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Reply' } },
            { type: 'message_delta', delta: { stop_reason: 'end_turn' } }];
        return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''));
      },
    });
    const request = (conversationId, workspaceId = 'joined') => POST(new Request('https://example.test/api/ai/chat/stream', {
      method: 'POST', body: JSON.stringify({ message: 'Hello', context: { workspace: { id: workspaceId } }, agentSlug: slug, conversationId }),
    }));
    for (const workspaceId of ['revoked', 'foreign', 'anonymous']) {
      for (const supplied of [false, true]) await t.test(`${slug} denies ${workspaceId} with conversation=${supplied}`, async () => {
        activity.length = 0; writes.length = 0; conversationReads = 0;
        user = workspaceId === 'anonymous' ? null : { id: 'alice', name: 'Alice' };
        const target = workspaceId === 'anonymous' ? 'joined' : workspaceId;
        const response = await request(supplied ? `conversation-${target}` : undefined, target);
        await response.text();
        assert.equal(response.status, workspaceId === 'anonymous' ? 401 : 403);
        assert.deepEqual(activity, []); assert.deepEqual(writes, []); assert.equal(conversationReads, 0);
      });
    }
    user = { id: 'alice', name: 'Alice' };
    activity.length = 0; writes.length = 0;
    for (const [conversationId, status] of [
      ['foreign-owner', 404], ['foreign-workspace', 404], ['missing', 404],
      [{ not: '' }, 400], [['own'], 400], [true, 400], [42, 400], ['', 400],
    ]) {
      const response = await request(conversationId);
      await response.text();
      assert.deepEqual(activity, [], `${slug}: denied input must not dispatch`);
      assert.deepEqual(writes, [], `${slug}: denied input must not persist`);
      assert.equal(response.status, status, `${slug}: ${JSON.stringify(conversationId)}`);
    }
    lookupFails = true;
    assert.equal((await request('own')).status, 500);
    assert.deepEqual(activity, []);
    assert.deepEqual(writes, []);
    lookupFails = false;
    for (const workspaceId of ['joined', 'own']) for (const supplied of [true, false, null]) {
      const conversationId = supplied ? `conversation-${workspaceId}` : supplied === null ? null : undefined;
      activity.length = 0;
      writes.length = 0;
      const response = await request(conversationId, workspaceId);
      const events = (await response.text()).trim().split('\n\n').map(event => JSON.parse(event.slice(6)));
      assert.equal(response.status, 200);
      assert.ok(activity.includes('provider'));
      assert.equal(activity.includes('gateway'), slug === 'coclaw');
      assert.equal(events.find(event => event.type === 'done')?.fullContent, 'Reply');
      assert.equal(events.find(event => event.type === 'conversation')?.conversationId, conversationId || 'new');
      assert.equal(writes.filter(row => row.kind === 'conversation').length, conversationId ? 0 : 1);
      if (!conversationId) {
        assert.equal(writes[0].userId, 'alice');
        assert.equal(writes[0].workspaceId, workspaceId);
      }
      const messages = writes.filter(row => row.kind === 'message');
      assert.deepEqual(messages.map(row => [row.conversationId, row.role, row.content]),
        [[conversationId || 'new', 'user', 'Hello'], [conversationId || 'new', 'assistant', 'Reply']]);
    }
  });
});

test('chat siblings protect conversation history and queued messages', async t => {
  let user, reads, writes, tokenWorkspace;
  const spaces = workspaces.map(w => ({ ...w, slug: w.id, name: w.id }));
  const rows = spaces.map(workspace => ({ id: `c-${workspace.id}`, userId: 'alice', workspaceId: workspace.id, workspace,
    isArchived: false, title: 'Private conversation', messages: [{ content: 'Private reply' }], _count: { messages: 1 } }));
  rows.push({ ...rows[1], id: 'other-user', userId: 'bob' });
  const reset = () => { user = { id: 'alice', email: 'alice@example.test' }; reads = 0; writes = []; tokenWorkspace = 'joined'; };
  reset();
  const db = {
    workspace: { findFirst: async ({ where }) => spaces.find(w => matches(w, where)) ?? null },
    user: { findUnique: async () => user },
    aIAgent: { findUnique: async () => ({ id: 'agent' }) },
    aIConversation: {
      findFirst: async ({ where }) => { const row = rows.find(c => matches(c, where)); if (row) reads++; return row ?? null; },
      findMany: async ({ where }) => { const found = rows.filter(c => matches(c, where)); reads += found.length; return found; },
      create: async ({ data }) => { writes.push(data); return { ...data, id: 'created' }; },
      update: async ({ where, data }) => { assert.ok(rows.some(c => matches(c, where))); writes.push(data); return {}; },
    },
    aIMessage: { findMany: async () => { reads++; return [{ content: 'Private reply' }]; } },
    $queryRaw: async () => { reads++; return []; },
    appToken: { findMany: async () => [{ accessToken: 'Y2lwaGVy', userId: 'alice', scopes: ['workspace:read'],
      tokenExpiresAt: null, installation: { id: 'installation', appId: 'app', status: 'ACTIVE', installedById: 'alice',
        workspaceId: tokenWorkspace, workspace: spaces.find(w => w.id === tokenWorkspace), scopes: [],
        app: { id: 'app', slug: 'app', name: 'App', status: 'PUBLISHED' } } }] },
    coclawChannelMessage: {
      findMany: async () => { reads++; return [{ id: 'message', content: 'Private reply', createdAt: new Date() }]; },
      create: async ({ data }) => { writes.push(data); return { id: 'created', ...data, createdAt: new Date() }; },
      updateMany: async ({ where, data }) => {
        if (where.workspaceId !== undefined && where.workspaceId !== 'joined') return { count: 0 };
        writes.push(data); return { count: 1 };
      },
    },
  };
  const deps = {
    '@/lib/prisma': { prisma: db }, 'next/server': { NextResponse: Response },
    '@/lib/session': { getCurrentUser: async () => user }, '@/lib/auth': { getAuthSession: async () => user && { user } },
    '@/lib/apps/crypto': { decryptToken: async () => 'valid-token' }, '@/lib/oauth-scopes': load('src/lib/oauth-scopes.ts'),
  };
  const globals = { URL, Buffer, console };
  deps['@/lib/apps/auth-middleware'] = load('src/lib/apps/auth-middleware.ts', deps, globals);
  const list = load('src/app/api/ai/conversations/route.ts', deps, globals);
  const detail = load('src/app/api/ai/conversations/[id]/route.ts', deps, globals);
  const coclaw = load('src/app/api/workspaces/[workspaceId]/coclaw/conversations/route.ts', deps, globals);
  const queued = load('src/app/api/coclaw/channel/[userId]/messages/route.ts', deps, globals);
  const request = (method, workspaceId, body) => {
    const req = new Request(`https://example.test/?workspaceId=${workspaceId}&includeMessages=true`, {
      method, headers: user ? { Authorization: 'Bearer valid-token' } : {}, ...(body ? { body: JSON.stringify(body) } : {}),
    });
    req.nextUrl = new URL(req.url); return req;
  };
  const endpoints = [
    ['list', id => list.GET(request('GET', id))],
    ['specific', id => list.GET(new Request(`https://example.test/?workspaceId=${id}&conversationId=c-${id}`))],
    ['create', id => list.POST(request('POST', id, { workspaceId: id, title: 'New' }))],
    ['detail', id => detail.GET(request('GET', id), { params: Promise.resolve({ id: `c-${id}` }) })],
    ['archive', id => detail.DELETE(request('DELETE', id), { params: Promise.resolve({ id: `c-${id}` }) })],
    ['coclaw history', id => coclaw.GET(request('GET', id), { params: Promise.resolve({ workspaceId: id }) })],
    ['queue GET', id => queued.GET(request('GET', id), { params: Promise.resolve({ userId: 'alice' }) })],
    ['queue POST', id => queued.POST(request('POST', id, { workspace_id: id, content: 'New', role: 'user' }), { params: Promise.resolve({ userId: 'alice' }) })],
  ];
  for (const [name, invoke] of endpoints) for (const state of ['anonymous', 'revoked', 'foreign', 'own', 'joined']) {
    await t.test(`${name}: ${state}`, async () => {
      reset(); if (state === 'anonymous') user = null;
      const id = state === 'anonymous' ? 'joined' : state; tokenWorkspace = id;
      const response = await invoke(id); const body = await response.text();
      if (['own', 'joined'].includes(state)) assert.ok([200, 201].includes(response.status), body);
      else {
        assert.ok([401, 403, 404].includes(response.status), body);
        assert.doesNotMatch(body, /Private/); assert.equal(reads, 0); assert.equal(writes.length, 0);
      }
    });
  }
  await t.test('conversation ownership and workspace binding are retained', async () => {
    reset();
    for (const handler of [detail.GET, detail.DELETE]) assert.equal((await handler(request('GET', 'joined'), { params: Promise.resolve({ id: 'other-user' }) })).status, 404);
    assert.equal((await list.GET(new Request('https://example.test/?workspaceId=own&conversationId=c-joined'))).status, 404);
    assert.equal(reads, 0); assert.equal(writes.length, 0);
  });
  await t.test('queue token stays bound to its user and workspace', async () => {
    reset();
    for (const id of ['own', 'foreign']) {
      assert.equal((await queued.GET(request('GET', id), { params: Promise.resolve({ userId: 'alice' }) })).status, 403);
      assert.equal((await queued.POST(request('POST', id, { workspace_id: id, content: 'New' }), { params: Promise.resolve({ userId: 'alice' }) })).status, 403);
    }
    assert.equal((await queued.GET(request('GET', 'joined'), { params: Promise.resolve({ userId: 'bob' }) })).status, 401);
    assert.equal(reads, 0); assert.equal(writes.length, 0);
  });
  await t.test('queue acknowledgement rechecks active access and exact token workspace', async () => {
    for (const state of ['revoked', 'foreign', 'own', 'joined']) {
      reset(); tokenWorkspace = state;
      const response = await queued.PATCH(request('PATCH', state, { message_id: 'message', status: 'DELIVERED' }), { params: Promise.resolve({ userId: 'alice' }) });
      assert.equal(response.status, state === 'joined' ? 200 : state === 'own' ? 404 : 401);
      assert.equal(writes.length, state === 'joined' ? 1 : 0);
    }
  });
});
