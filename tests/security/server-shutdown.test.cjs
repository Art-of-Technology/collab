// A release stops the app container and Docker kills it ten seconds later (CLB-658). The child below shuts down the
// way the production server does — on SIGTERM it closes the HTTP server and waits for every open connection — and is
// given the connection that made releases slow: one that is open and has sent no request. Node never drops that one,
// so only the watchdog ends the process.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { spawn } = require('node:child_process');
const net = require('node:net');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '../..');
const GRACE_MS = 300;

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'collab-server-shutdown-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const source = fs.readFileSync(path.join(root, 'src/lib/shutdown-watchdog.ts'), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  fs.writeFileSync(path.join(dir, 'watchdog.cjs'), outputText);
  fs.writeFileSync(path.join(dir, 'child.cjs'), `
    const http = require('node:http');
    if (process.env.FIXTURE_WATCHDOG === 'armed') require('./watchdog.cjs').registerShutdownWatchdog();
    const server = http.createServer((request, response) => response.end('ok'));
    server.listen(0, '127.0.0.1', () => process.stdout.write(JSON.stringify({ port: server.address().port }) + '\\n'));
    // What Next does with the signal: stop accepting, then wait for every connection that is still open.
    process.on('SIGTERM', () => server.close(() => process.exit(143)));
  `);
  return dir;
}

/** Start the child, hold one connection open without sending a request, send SIGTERM, and report how it ended. */
async function stop(dir, watchdog) {
  const child = spawn(process.execPath, [path.join(dir, 'child.cjs')],
    { env: { ...process.env, FIXTURE_WATCHDOG: watchdog, COLLAB_SHUTDOWN_GRACE_MS: String(GRACE_MS) }, stdio: ['ignore', 'pipe', 'inherit'] });
  const ended = new Promise(resolve => child.on('exit', (code, signal) => resolve({ code, signal, at: Date.now() })));
  const port = await new Promise((resolve, reject) => {
    let out = '';
    child.stdout.on('data', chunk => { out += chunk; if (out.includes('\n')) resolve(JSON.parse(out).port); });
    child.on('exit', () => reject(new Error(`The child ended before it listened: ${out}`)));
  });
  const held = net.connect(port, '127.0.0.1');
  await new Promise((resolve, reject) => { held.on('connect', resolve); held.on('error', reject); });

  const sent = Date.now();
  child.kill('SIGTERM');
  const result = await Promise.race([ended, new Promise(resolve => setTimeout(() => resolve(null), 20 * GRACE_MS))]);
  child.kill('SIGKILL');
  held.destroy();
  await ended;
  return result && { ...result, waited: result.at - sent };
}

test('a held-open connection no longer keeps the process running until Docker kills it', async t => {
  const dir = fixture(t);
  const armed = await stop(dir, 'armed');
  assert.ok(armed, 'the watchdog did not end the process');
  assert.equal(armed.code, 143, 'the process should end with the code SIGTERM gives');
  assert.ok(armed.waited < 10 * GRACE_MS, `the stop took ${armed.waited} ms, longer than the grace period allows`);

  // Without it, the graceful close waits for that connection and Docker's kill is what ends the container.
  assert.equal(await stop(dir, 'off'), null, 'the fixture no longer reproduces the stop that never ends');
});
