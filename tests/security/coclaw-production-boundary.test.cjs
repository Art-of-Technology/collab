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
