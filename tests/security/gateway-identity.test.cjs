const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
function load(relative, mocks = {}) {
  const filename = path.resolve(process.env.SECURITY_TEST_ROOT || path.resolve(__dirname, '../..'), 'src', relative);
  const loaded = new Module(filename, module);
  loaded.filename = filename; loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const original = loaded.require.bind(loaded);
  loaded.require = name => Object.hasOwn(mocks, name) ? mocks[name] : original(name);
  loaded._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, filename);
  return loaded.exports;
}
const identity = load('lib/gateway-identity.ts');
const issuer = 'https://identity.example.test/realms/company';
const encoded = value => Buffer.from(value).toString('base64url');
const valid = () => new Headers({ 'x-collab-issuer': encoded(issuer), 'x-collab-subject': encoded('subject-1'),
  'x-collab-email': encoded('alex@weezboo.com'), 'x-collab-email-verified': 'true' });

test('gateway accepts canonical single verified claims and rejects aliases, duplicate values and malformed UTF-8', () => {
  const accepted = identity.readGatewayIdentity(valid(), issuer);
  assert.equal(accepted.subject, 'subject-1'); assert.match(accepted.accountKey, /^[a-f0-9]{64}$/);
  for (const [name, value] of [
    ['x-collab-issuer', encoded(issuer + '/other')], ['x-collab-subject', ''],
    ['x-collab-subject', encoded('subject-1') + '='], ['x-collab-subject', '_w'],
    ['x-collab-subject', encoded('x\0y')], ['x-collab-subject', encoded('x'.repeat(513))],
    ['x-collab-email', encoded('alex@sub.weezboo.com')], ['x-collab-email', encoded('alex@weezboo.com.attacker.test')],
    ['x-collab-email', encoded('alex@@weezboo.com')], ['x-collab-email-verified', '1'],
    ['x-collab-email-verified', '"true"'], ['x-collab-email-verified', 'true, true'],
  ]) { const headers = valid(); headers.set(name, value); assert.equal(identity.readGatewayIdentity(headers, issuer), null, name + ': ' + value); }
  const duplicate = valid(); duplicate.append('x-collab-subject', encoded('subject-1'));
  assert.equal(identity.readGatewayIdentity(duplicate, issuer), null);
  const aliases = new Headers({ 'x_collab_subject': encoded('subject-1'), 'remote-user': 'alex@weezboo.com' });
  assert.equal(identity.readGatewayIdentity(aliases, issuer), null);
});

test('gateway mutations require the exact pinned HTTPS Origin including form and text/plain requests', () => {
  const origin = 'https://collab.example.test';
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    for (const from of [null, 'null', 'https://sibling.example.test', origin + '.attacker.test', origin + '/', origin + ', ' + origin]) {
      const headers = new Headers({ 'content-type': 'text/plain' }); if (from) headers.set('origin', from);
      assert.equal(identity.gatewayMutationAllowed(method, headers, origin), false);
    }
    assert.equal(identity.gatewayMutationAllowed(method, new Headers({ origin }), origin), true);
  }
  assert.equal(identity.gatewayMutationAllowed('POST', new Headers({ origin }), ''), false);
  assert.equal(identity.gatewayMutationAllowed('GET', new Headers(), origin), true);
});

test('request sessions use explicit issuer-subject account mapping and never fall back to NextAuth in gateway mode', async () => {
  const before = { mode: process.env.COLLAB_AUTH_MODE, issuer: process.env.COLLAB_GATEWAY_ISSUER };
  let header = valid(), legacy = 0, reads = 0;
  let user = { id: 'mapped-user', email: 'alex@weezboo.com', name: 'Alex', image: null, role: 'DEVELOPER', team: null, currentFocus: null, expertise: [], accounts: [{ id: 'mapping' }] };
  try {
    process.env.COLLAB_AUTH_MODE = 'gateway'; process.env.COLLAB_GATEWAY_ISSUER = issuer;
    const session = load('lib/request-session.ts', { 'server-only': {}, './gateway-identity': identity,
      'next-auth': { getServerSession: async () => { legacy++; return { user: { id: 'legacy' } }; } },
      'next/headers': { headers: async () => header }, '@/lib/prisma': { prisma: { account: { findUnique: async ({ where }) => {
        reads++; assert.deepEqual(where, { provider_providerAccountId: { provider: 'maestro', providerAccountId: identity.readGatewayIdentity(valid(), issuer).accountKey } });
        return user ? { user } : null;
      } } } },
    });
    assert.equal((await session.getServerSession({})).user.id, 'mapped-user');
    header = new Headers({ authorization: 'Bearer ignored', cookie: 'legacy=ignored' });
    assert.equal(await session.getServerSession({}), null); assert.equal(reads, 1); assert.equal(legacy, 0);
    header = valid(); const saved = user; user = null;
    assert.equal(await session.getServerSession({}), null);
    user = { ...saved, accounts: [{ id: 'one' }, { id: 'two' }] }; assert.equal(await session.getServerSession({}), null);
    user = { ...saved, email: 'another@weezboo.com' }; assert.equal(await session.getServerSession({}), null);
    process.env.COLLAB_AUTH_MODE = 'invalid'; assert.equal(await session.getServerSession({}), null); assert.equal(legacy, 0);
    process.env.COLLAB_AUTH_MODE = 'nextauth'; assert.equal((await session.getServerSession({})).user.id, 'legacy'); assert.equal(legacy, 1);
  } finally {
    for (const [name, value] of [['COLLAB_AUTH_MODE', before.mode], ['COLLAB_GATEWAY_ISSUER', before.issuer]])
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
});

test('browser session endpoint exposes gateway identity without enabling legacy callbacks or cookie mutations', async () => {
  let mode = 'gateway', legacy = 0, session = { user: { id: 'mapped-user' }, expires: '2026-09-24T00:00:00.000Z' };
  const route = load('app/api/auth/[...nextauth]/route.ts', {
    'next-auth': () => async () => { legacy++; return Response.json({ legacy: true }); },
    '@/lib/auth-options': { authOptions: {} }, 'next/server': { NextResponse: Response },
    '@/lib/gateway-identity': { authMode: () => mode },
    '@/lib/request-session': { getGatewaySession: async () => session },
  });
  const request = new Request('https://collab.example.test/api/auth/session');
  const context = { params: Promise.resolve({ nextauth: ['session'] }) };
  const response = await route.GET(request, context);
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await response.json()).user.id, 'mapped-user');
  assert.equal((await route.POST(request, context)).status, 403);
  assert.equal((await route.GET(request, { params: Promise.resolve({ nextauth: ['callback', 'google'] }) })).status, 404);
  session = null; assert.equal((await route.GET(request, context)).status, 401); assert.equal(legacy, 0);
  mode = 'nextauth'; assert.equal((await route.GET(request, context)).status, 200); assert.equal(legacy, 1);
});

test('logout traverses proxy and server mode after mapping revocation clears client session', async () => {
  const previousWindow = global.window, previousFetch = global.fetch;
  const env = { COLLAB_AUTH_MODE: 'gateway', COLLAB_GATEWAY_ISSUER: issuer, COLLAB_PUBLIC_ORIGIN: 'https://collab.example.test' };
  const previousEnv = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
  const { NextRequest, NextResponse } = require('next/server');
  let destination = '', legacy = 0, accountReads = 0, handlerCalls = 0, mapped = true;
  let requestHeaders = valid();
  const session = load('lib/request-session.ts', {
    'server-only': {}, './gateway-identity': identity,
    'next-auth': { getServerSession: async () => { throw new Error('Unexpected legacy session'); } },
    'next/headers': { headers: async () => requestHeaders },
    '@/lib/prisma': { prisma: { account: { findUnique: async () => {
      accountReads++;
      return mapped ? { user: { id: 'mapped-user', email: 'alex@weezboo.com', accounts: [{ id: 'mapping' }] } } : null;
    } } } },
  });
  const dependencies = {
    'next/server': { NextRequest, NextResponse }, '@/lib/gateway-identity': identity,
    '@/lib/request-session': session, '@/lib/auth-options': { authOptions: {} },
    'next-auth': () => async () => { legacy++; return NextResponse.json(null); },
  };
  const { proxy } = load('proxy.ts', dependencies);
  const route = load('app/api/auth/[...nextauth]/route.ts', dependencies);
  const request = (pathname, method = 'GET', claims = true) => {
    const headers = claims ? valid() : new Headers();
    headers.set('origin', env.COLLAB_PUBLIC_ORIGIN);
    return new NextRequest(env.COLLAB_PUBLIC_ORIGIN + pathname, { method, headers });
  };
  async function dispatch(pathname) {
    const req = request(pathname);
    const response = await proxy(req);
    if (response.headers.get('x-middleware-next') !== '1') return response;
    requestHeaders = req.headers; handlerCalls++;
    return route.GET(req, { params: Promise.resolve({ nextauth: req.nextUrl.pathname.slice('/api/auth/'.length).split('/') }) });
  }
  global.window = { location: { origin: env.COLLAB_PUBLIC_ORIGIN, assign: value => { destination = value; } } };
  global.fetch = async (url, options) => {
    assert.equal(options.cache, 'no-store');
    return dispatch(url);
  };
  try {
    Object.assign(process.env, env);
    let clientSession = await (await dispatch('/api/auth/session')).json();
    assert.equal(clientSession.user.id, 'mapped-user');
    mapped = false;
    const refreshed = await dispatch('/api/auth/session');
    assert.equal(refreshed.status, 403);
    clientSession = null;
    const beforeMode = accountReads, beforeHandlers = handlerCalls;
    const { signOutCurrentSession } = load('lib/sign-out.ts', { 'next-auth/react': { signOut: async () => { legacy++; } } });
    assert.equal(await signOutCurrentSession(clientSession), false);
    assert.equal(destination, 'https://collab.example.test/oauth2/callback?logout=get');
    destination = '';
    assert.equal(await signOutCurrentSession(undefined), false);
    assert.equal(destination, 'https://collab.example.test/oauth2/callback?logout=get');
    assert.equal(accountReads, beforeMode); assert.equal(handlerCalls, beforeHandlers + 2); assert.equal(legacy, 0);
    const metadata = await dispatch('/api/auth/mode?authMode=nextauth&redirect=https://attacker.test');
    assert.deepEqual(await metadata.json(), { authMode: 'gateway' });
    assert.equal(metadata.headers.get('cache-control'), 'no-store');
    assert.equal(accountReads, beforeMode);
    assert.equal((await proxy(request('/api/auth/mode', 'GET', false))).headers.get('x-middleware-next'), '1');
    assert.equal(accountReads, beforeMode);

    const protectedPaths = ['/api/auth/session', '/api/notes', '/api/auth/signout', '/api/auth/callback/google',
      '/api/auth/modes', '/api/auth/mode/', '/api/auth/mode/session', '/api/auth/%6dode', '/api/auth/mode%2f', '/api/auth/mode.json'];
    for (const pathname of protectedPaths) {
      assert.equal((await proxy(request(pathname))).status, 403, pathname);
      assert.equal((await proxy(request(pathname, 'GET', false))).status, 401, pathname);
    }
    for (const method of ['HEAD', 'OPTIONS', 'POST', 'PUT', 'PATCH', 'DELETE']) {
      assert.equal((await proxy(request('/api/auth/mode', method))).status, 403, method);
      assert.equal((await proxy(request('/api/auth/mode', method, false))).status, 401, method);
    }
    mapped = true;
    assert.equal((await proxy(request('/api/notes'))).headers.get('x-middleware-next'), '1');
    const badOrigin = request('/api/notes', 'POST'); badOrigin.headers.set('origin', 'https://attacker.test');
    assert.equal((await proxy(badOrigin)).status, 403);
    assert.equal((await proxy(request('/api/health', 'GET', false))).headers.get('x-middleware-next'), '1');
    process.env.COLLAB_AUTH_MODE = 'invalid'; destination = '';
    const beforeInvalid = handlerCalls;
    await assert.rejects(signOutCurrentSession());
    assert.equal((await proxy(request('/api/auth/mode', 'GET', false))).status, 503);
    assert.equal(handlerCalls, beforeInvalid); assert.equal(destination, ''); assert.equal(legacy, 0);
    process.env.COLLAB_AUTH_MODE = 'nextauth';
    const configured = await dispatch('/api/auth/mode');
    assert.deepEqual(await configured.json(), { authMode: 'nextauth' });
    assert.equal(legacy, 0);
  } finally {
    if (previousWindow === undefined) delete global.window; else global.window = previousWindow;
    global.fetch = previousFetch;
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test('logout preserves legacy completion checks and rejects invalid server configuration', async () => {
  const previousWindow = global.window, previousFetch = global.fetch;
  let destination = '', legacy = 0;
  let configuration = () => Response.json({ authMode: 'nextauth' });
  let remaining = () => Response.json(null);
  let logout = () => ({ url: '/' });
  global.window = { location: { origin: 'https://collab.example.test', assign: value => { destination = value; } } };
  global.fetch = async (url, options) => {
    assert.equal(options.cache, 'no-store');
    if (url === '/api/auth/mode') return configuration();
    assert.equal(url, '/api/auth/session'); return remaining();
  };
  try {
    const { signOutCurrentSession } = load('lib/sign-out.ts', { 'next-auth/react': { signOut: async options => {
      assert.deepEqual(options, { redirect: false }); legacy++; return logout();
    } } });
    assert.equal(await signOutCurrentSession(), true); assert.equal(legacy, 1);
    remaining = () => Response.json({}); assert.equal(await signOutCurrentSession(), true);
    for (const bad of [() => Response.json({ user: { id: 'still-active' } }), () => Response.json({}, { status: 403 }),
      () => new Response('invalid JSON'), () => { throw new Error('Network error'); }]) {
      remaining = bad; await assert.rejects(signOutCurrentSession());
    }
    remaining = () => Response.json(null);
    for (const bad of [() => ({}), () => ({ error: 'Use gateway' }), () => undefined, () => { throw new Error('Logout failed'); }]) {
      logout = bad; await assert.rejects(signOutCurrentSession());
    }
    const calls = legacy;
    for (const bad of [() => Response.json({ authMode: 'invalid' }), () => Response.json({}), () => Response.json(null),
      () => Response.json({}, { status: 503 }), () => new Response('invalid JSON'), () => { throw new Error('Network error'); }]) {
      configuration = bad; await assert.rejects(signOutCurrentSession());
    }
    assert.equal(legacy, calls); assert.equal(destination, '');
  } finally {
    if (previousWindow === undefined) delete global.window; else global.window = previousWindow;
    global.fetch = previousFetch;
  }
});
