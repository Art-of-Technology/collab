const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { cpSync, mkdtempSync, rmSync, writeFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { test } = require('node:test');

test('the retired AI dashboard endpoint answers 404', { timeout: 120_000 }, async t => {
  const root = resolve(__dirname, '../..');
  const source = join(root, 'src');
  const fixture = mkdtempSync(join(root, '.retired-dashboard-'));
  let server;
  t.after(async () => {
    if (server?.pid && server.exitCode === null && server.signalCode === null) {
      const exited = once(server, 'exit');
      server.kill();
      await exited;
    }
    rmSync(fixture, { recursive: true, force: true });
  });

  // Let Next discover the real API routes in a fixture without the UI or worker startup.
  cpSync(join(source, 'app/api'), join(fixture, 'app/api'), { recursive: true });
  writeFileSync(join(fixture, 'next.config.js'), `module.exports = {
    agentRules: false,
    webpack(config) {
      config.resolve.alias['@'] = ${JSON.stringify(source)};
      return config;
    },
  };`);

  let logs = '';
  server = spawn(process.execPath, [
    require.resolve('next/dist/bin/next'), 'dev', fixture,
    '--webpack', '--hostname', '127.0.0.1', '--port', '0',
  ], {
    cwd: root,
    env: { ...process.env, NODE_ENV: 'development', NEXT_TELEMETRY_DISABLED: '1', COLLAB_AUTH_MODE: 'nextauth' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const origin = await new Promise((resolveOrigin, reject) => {
    const collect = chunk => {
      logs += chunk;
      const match = logs.match(/http:\/\/127\.0\.0\.1:\d+/);
      if (match && logs.includes('Ready in')) resolveOrigin(match[0]);
    };
    server.stdout.on('data', collect);
    server.stderr.on('data', collect);
    server.once('error', reject);
    server.once('exit', () => reject(new Error(logs)));
  });
  const response = await fetch(new URL('/api/ai/dashboard', origin), {
    redirect: 'manual',
    signal: t.signal,
  });
  await response.arrayBuffer();
  assert.equal(response.status, 404, logs);
});
