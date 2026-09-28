const { assert, test, load } = require('./helpers.cjs');

test('production without a remote manager refuses local execution before manager side effects', async () => {
  const calls = [];
  const refuse = name => () => { calls.push(name); throw new Error(`Unexpected ${name}`); };
  const timer = {};
  let cleared = false;
  const { coclawManager } = load('src/lib/coclaw/instance-manager.ts', {
    child_process: { spawn: refuse('spawn') },
    fs: { promises: { rm: refuse('filesystem') } },
    path: { default: require('node:path') },
    '@/lib/prisma': { prisma: {
      coclawChannelConfig: { findMany: refuse('database') },
      coclawInstance: { upsert: refuse('database'), update: refuse('database') },
    } },
    '@/lib/secrets/crypto': { decryptVariable: refuse('decrypt') },
    './config-generator': { getInstanceDir: refuse('config path'), writeInstanceConfig: refuse('config write') },
  }, {
    global: {}, process: { env: { NODE_ENV: 'production' }, cwd: () => '/inert' },
    console: { log() {}, error() {} },
    setInterval: () => timer,
    clearInterval: value => { assert.equal(value, timer); cleared = true; },
    fetch: refuse('network'),
  });

  try {
    await assert.rejects(
      coclawManager.getOrCreateInstance('user', 'workspace', {}),
      { message: 'Local Coclaw execution is disabled in production.' },
    );
    assert.deepEqual(calls, []);
  } finally {
    await coclawManager.shutdownAll();
  }
  assert.equal(cleared, true);
});

test('production agent chat defaults to authenticated unavailable before MCP or provider work', async () => {
  const calls = [];
  const refuse = name => () => { calls.push(name); throw new Error(`Unexpected ${name}`); };
  let user = { id: 'user' };
  const env = { NODE_ENV: 'production' };
  const { POST } = load('src/app/api/ai/chat/stream/route.ts', {
    'next/server': { NextResponse: Response },
    '@/lib/session': { getCurrentUser: async () => user },
    '@/lib/post-access': { postWorkspaceAccessWhere: refuse('access query') },
    '@/lib/prisma': { prisma: new Proxy({}, { get: refuse('database') }) },
    '@/lib/ai/agents/registry': { getDefaultAgent: refuse('agent'), getAgent: refuse('agent') },
    '@/lib/ai/mcp-token': { getMcpToken: refuse('token'), invalidateMcpToken: refuse('token') },
    '@/lib/ai/mcp-client': { createMcpSession: refuse('MCP') },
    '@/lib/coclaw/instance-manager': { coclawManager: { getOrCreateInstance: refuse('Coclaw') } },
    '@/lib/coclaw/key-resolver': { resolveApiKey: refuse('credential') },
    '@/lib/secrets/crypto': { decryptVariable: refuse('decrypt') },
    '@/lib/coclaw/notifications': { createCoclawNotification: refuse('notification') },
  }, { process: { env }, console: { error() {} }, fetch: refuse('provider') });

  const unreadRequest = { json: refuse('body') };
  for (const value of [undefined, '', 'disabled', 'ENABLED']) {
    env.COLLAB_AGENT_EXECUTION = value;
    const response = await POST(unreadRequest);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'Agent execution is unavailable.' });
  }
  user = null;
  assert.equal((await POST(unreadRequest)).status, 401);
  assert.deepEqual(calls, []);

  // These controls reach existing input validation, not a provider or tool.
  user = { id: 'user' };
  env.COLLAB_AGENT_EXECUTION = 'enabled';
  assert.equal((await POST({ json: async () => ({}) })).status, 400);
  delete env.COLLAB_AGENT_EXECUTION;
  env.NODE_ENV = 'development';
  assert.equal((await POST({ json: async () => ({}) })).status, 400);
  assert.deepEqual(calls, []);
});
