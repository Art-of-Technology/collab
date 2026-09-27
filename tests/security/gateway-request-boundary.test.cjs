const { assert, test, load } = require('./helpers.cjs');
const { NextRequest, NextResponse } = require('next/server');
const { unstable_doesMiddlewareMatch } = require('next/experimental/testing/server');
const origin = 'https://collab.example.test';
function fixture(mode = 'gateway') {
  const state = { mapped: true, reads: 0, legacy: 0, fail: false, assigned: [] };
  const env = { env: { COLLAB_AUTH_MODE: mode, COLLAB_GATEWAY_ISSUER: 'https://identity.example.test', COLLAB_PUBLIC_ORIGIN: origin, NODE_ENV: 'production' } };
  const claims = () => new Headers({ 'x-collab-issuer': Buffer.from(env.env.COLLAB_GATEWAY_ISSUER).toString('base64url'), 'x-collab-subject': Buffer.from('subject').toString('base64url'), 'x-collab-email': Buffer.from('actor@weezboo.com').toString('base64url'), 'x-collab-email-verified': 'true' });
  let requestHeaders = claims();
  const globals = { process: env, Buffer, TextDecoder, URL };
  const identity = load('src/lib/gateway-identity.ts', { 'node:crypto': require('node:crypto') }, globals);
  const adapter = load('src/lib/request-session.ts', { 'server-only': {}, './gateway-identity': identity, 'next-auth': { getServerSession: async () => { state.legacy++; return null; } }, 'next/headers': { headers: () => requestHeaders }, '@/lib/prisma': { prisma: { account: { findUnique: async () => { state.reads++; if (state.fail) throw Error('fixture unavailable'); return state.mapped ? { user: { id: 'actor', email: 'actor@weezboo.com', accounts: [{ id: 'mapping' }] } } : null; } } } } }, globals);
  const dependencies = { 'next/server': { NextRequest, NextResponse }, '@/lib/gateway-identity': identity, '@/lib/request-session': adapter, '@/lib/auth-options': { authOptions: {} }, 'next-auth': { default: () => async () => { state.legacy++; return NextResponse.json({ legacy: true }); } } };
  const { proxy, config } = load('src/proxy.ts', dependencies, globals);
  const route = load('src/app/api/auth/[...nextauth]/route.ts', dependencies, globals);
  const request = (pathname = '/api/notes', method = 'GET', headers = claims()) => new NextRequest(origin + pathname, { method, headers });
  async function dispatch(pathname) {
    const req = request(pathname), result = await proxy(req);
    if (result.headers.get('x-middleware-next') !== '1') return result;
    requestHeaders = req.headers;
    return route.GET(req, { params: Promise.resolve({ nextauth: req.nextUrl.pathname.slice('/api/auth/'.length).split('/') }) });
  }
  const logout = load('src/lib/sign-out.ts', { 'next-auth/react': { signOut: async () => { state.legacy++; return { url: '/' }; } } }, { ...globals, fetch: async (url, options) => { assert.equal(options.cache, 'no-store'); return dispatch(url); }, window: { location: { origin, assign: url => state.assigned.push(url) } } });
  return { state, env, claims, proxy, config, request, dispatch, logout };
}
test('actual Next matcher protects API health/mode and both realtime routes while excluding static assets', () => {
  const f = fixture();
  for (const url of ['/api/health', '/api/auth/mode', '/api/realtime/workspace/space/stream', '/api/realtime/view/view/stream', '/space/notes', '/api/issues']) assert.equal(unstable_doesMiddlewareMatch({ config: f.config, url: origin + url }), true, url);
  for (const url of ['/_next/static/chunk.js', '/_next/image', '/favicon.ico', '/images/logo.png']) assert.equal(unstable_doesMiddlewareMatch({ config: f.config, url: origin + url }), false, url);
});
test('gateway rejects missing/malformed claims before database or handler', async () => { const f = fixture(); for (const headers of [new Headers(), new Headers({ 'x-collab-subject': 'bad' })]) assert.equal((await f.proxy(f.request('/api/realtime/workspace/space/stream', 'GET', headers))).status, 401); assert.equal(f.state.reads + f.state.legacy, 0); });
test('unsafe requests require exact pinned HTTPS Origin before account reads', async () => {
  const f = fixture();
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    for (const value of [null, 'null', origin + '/', origin + '.attacker.test', origin + ', ' + origin, 'https://sibling.example.test']) {
      const h = f.claims(); h.set('content-type', 'text/plain'); if (value) h.set('origin', value);
      assert.equal((await f.proxy(f.request('/api/issues', method, h))).status, 403, method + ':' + value);
    }
  }
  assert.equal(f.state.reads, 0);
  for (const value of ['', 'http://collab.example.test', origin + '/']) { f.env.env.COLLAB_PUBLIC_ORIGIN = value; const h = f.claims(); h.set('origin', origin); assert.equal((await f.proxy(f.request('/api/issues', 'POST', h))).status, 403); }
  f.env.env.COLLAB_PUBLIC_ORIGIN = origin; const h = f.claims(); h.set('origin', origin); assert.equal((await f.proxy(f.request('/api/issues', 'POST', h))).headers.get('x-middleware-next'), '1'); assert.equal(f.state.reads, 1);
});
test('current mapping denial and lookup errors fail closed without legacy fallback', async () => { const f = fixture(); f.state.mapped = false; assert.equal((await f.proxy(f.request())).status, 403); f.state.fail = true; assert.equal((await f.proxy(f.request())).status, 503); assert.equal(f.state.legacy, 0); });
test('only exact GET health/mode bypass identity and lookup, including revoked mapping', async () => {
  const f = fixture(); f.state.mapped = false;
  for (const path of ['/api/health', '/api/auth/mode', '/api/auth/mode?authMode=nextauth']) assert.equal((await f.proxy(f.request(path, 'GET', new Headers()))).headers.get('x-middleware-next'), '1');
  assert.equal(f.state.reads, 0);
  for (const path of ['/api/auth/modes', '/api/auth/mode/', '/api/auth/mode/session', '/api/auth/%6dode', '/api/auth/mode%2f', '/api/auth/mode.json', '/api/health/extra', '/api/auth/session']) assert.equal((await f.proxy(f.request(path, 'GET', new Headers()))).status, 401, path);
  for (const method of ['HEAD', 'OPTIONS', 'POST', 'PUT', 'PATCH', 'DELETE']) assert.equal((await f.proxy(f.request('/api/auth/mode', method, new Headers()))).status, 401, method);
});
test('revocation blocks session refresh while mode still permits local logout', async () => {
  const f = fixture(); assert.equal((await (await f.dispatch('/api/auth/session')).json()).user.id, 'actor');
  f.state.mapped = false; assert.equal((await f.dispatch('/api/auth/session')).status, 403);
  const before = f.state.reads; assert.equal(await f.logout.signOutCurrentSession(), false); assert.equal(f.state.reads, before); assert.deepEqual(f.state.assigned, [origin + '/oauth2/callback?logout=get']); assert.equal(f.state.legacy, 0);
});
test('invalid mode rejects even public mode path without lookup or logout navigation', async () => { const f = fixture('invalid'); assert.equal((await f.proxy(f.request('/api/auth/mode', 'GET', new Headers()))).status, 503); await assert.rejects(f.logout.signOutCurrentSession()); assert.equal(f.state.reads + f.state.assigned.length + f.state.legacy, 0); });
test('legacy passthrough and existing HTML security headers are preserved', async () => {
  const f = fixture('nextauth'); const h = new Headers({ accept: 'text/html' }); const r = await f.proxy(f.request('/login', 'GET', h));
  assert.equal(r.headers.get('x-middleware-next'), '1'); assert.equal(r.headers.get('x-content-type-options'), 'nosniff'); assert.match(r.headers.get('content-security-policy'), /default-src 'self'/); assert.match(r.headers.get('strict-transport-security'), /max-age=15552000/); assert.equal(r.headers.get('cache-control'), null); assert.equal(f.state.reads, 0);
  f.env.env.COLLAB_AUTH_MODE = 'gateway'; const g = f.claims(); g.set('accept', 'text/html'); const rr = await f.proxy(f.request('/space', 'GET', g)); assert.equal(rr.headers.get('content-security-policy'), r.headers.get('content-security-policy')); assert.equal(rr.headers.get('cache-control'), 'private, no-store');
});
