const { assert, test, load } = require('./helpers.cjs');
const http = require('node:http');

// An app's manifest URL comes from its author. The server fetches it, so it must not be usable to
// reach this server or its private network, to follow a redirect, or to pull an unbounded body.
function validation(env, modules = {}) {
  return load('src/lib/apps/validation.ts', {
    zod: require('zod'), './types': {}, 'node:dns': require('node:dns'), 'node:http': http,
    'node:https': require('node:https'), 'node:net': require('node:net'), ...modules,
  }, { process: { env }, URL, AbortSignal, Buffer });
}

// A local server that counts connections and requests.
async function localServer(t, handler = (request, response) => response.end('{}')) {
  const seen = { connections: 0, paths: [] };
  const server = http.createServer((request, response) => { seen.paths.push(request.url); handler(request, response); });
  server.on('connection', () => { seen.connections += 1; });
  server.on('clientError', (error, socket) => socket.destroy());
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  t.after(() => { server.closeAllConnections(); server.close(); });
  return { seen, port: server.address().port };
}

// What the resolver answers, in both shapes the connection layer may ask for.
const resolvesTo = (...addresses) => ({
  lookup: (hostname, options, callback) => options.all
    ? callback(null, addresses.map(address => ({ address, family: address.includes(':') ? 6 : 4 })))
    : callback(null, addresses[0], addresses[0].includes(':') ? 6 : 4),
});

test('in production a manifest is not fetched from a private, loopback or link-local address', async t => {
  const { seen, port } = await localServer(t);
  const { fetchManifest } = validation({ NODE_ENV: 'production' });
  for (const host of [
    `127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`, `[::ffff:127.0.0.1]:${port}`, `2130706433:${port}`, `0x7f.1:${port}`,
    `0.0.0.0:${port}`, '10.0.0.5', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '[fd00::1]', '[fe80::1]', '[::]',
  ]) {
    await assert.rejects(fetchManifest(`https://${host}/manifest.json`), /public address/, host);
  }
  assert.equal(seen.connections, 0, 'nothing was connected to');
});

test('in production a name is judged by the addresses it resolves to', async t => {
  const { seen, port } = await localServer(t, (request, response) => response.end('{"slug":"app"}'));
  for (const addresses of [['127.0.0.1'], ['10.0.0.5'], ['93.184.216.34', '192.168.1.1'], ['fd00::1']]) {
    const { fetchManifest } = validation({ NODE_ENV: 'production' }, { 'node:dns': resolvesTo(...addresses) });
    await assert.rejects(fetchManifest(`https://manifest.example:${port}/manifest.json`), /public address/, addresses.join(', '));
  }
  assert.equal(seen.connections, 0, 'nothing was connected to');

  // A public address passes. The connection is played by a stand-in that, like the real one, asks the
  // lookup it was given before it connects, and then talks to the local server instead of the internet.
  const standIn = { request: (url, options, onResponse) => {
    const request = http.request({ host: '127.0.0.1', port, path: url.pathname, headers: options.headers, signal: options.signal, agent: false }, onResponse);
    const end = request.end.bind(request);
    request.end = () => options.lookup(url.hostname, { all: true }, error => error ? request.destroy(error) : end());
    return request;
  } };
  const { fetchManifest } = validation({ NODE_ENV: 'production' }, { 'node:dns': resolvesTo('93.184.216.34', '2606:2800:220:1:248:1893:25c8:1946'), 'node:https': standIn });
  assert.equal((await fetchManifest(`https://manifest.example:${port}/manifest.json`)).slug, 'app');
});

test('a manifest fetch does not follow redirects and stops at one megabyte', async t => {
  const { seen, port } = await localServer(t, (request, response) => {
    if (request.url === '/moved/manifest.json') return response.writeHead(302, { Location: '/internal/manifest.json' }).end();
    if (request.url === '/huge/manifest.json') return response.end(JSON.stringify({ padding: 'x'.repeat(1024 * 1024) }));
    if (request.url === '/missing/manifest.json') return response.writeHead(404).end();
    if (request.url === '/text/manifest.json') return response.end('not json');
    response.end('{"slug":"app"}');
  });
  // Outside production a developer's local manifest server is allowed, which is what makes this testable.
  const { fetchManifest } = validation({ NODE_ENV: 'test' });
  const at = path => `http://127.0.0.1:${port}${path}/manifest.json`;

  assert.equal((await fetchManifest(at('/good'))).slug, 'app');
  await assert.rejects(fetchManifest(at('/moved')), /302/);
  assert.ok(!seen.paths.includes('/internal/manifest.json'), 'the redirect target was not requested');
  await assert.rejects(fetchManifest(at('/huge')), /larger than/);
  await assert.rejects(fetchManifest(at('/missing')), /404/);
  await assert.rejects(fetchManifest(at('/text')), /not valid JSON/);
});
