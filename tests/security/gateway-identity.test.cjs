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

test('gateway sign-out navigates to qualified native local logout without calling NextAuth', async () => {
  let destination = '', legacy = 0;
  const previous = global.window, previousFetch = global.fetch;
  global.fetch = async () => Response.json(null);
  global.window = { location: { origin: 'https://collab.example.test', assign: value => { destination = value; } } };
  try {
    const { signOutCurrentSession } = load('lib/sign-out.ts', { 'next-auth/react': { signOut: async options => {
      assert.deepEqual(options, { redirect: false }); legacy++; return { url: "/" };
    } } });
    assert.equal(await signOutCurrentSession({ authMode: 'gateway', user: { id: 'gateway' } }), false);
    assert.equal(destination, 'https://collab.example.test/oauth2/callback?logout=get'); assert.equal(legacy, 0);
    assert.equal(await signOutCurrentSession({ user: { id: 'legacy' } }), true); assert.equal(legacy, 1);
  } finally { if (previous === undefined) delete global.window; else global.window = previous; global.fetch = previousFetch; }
});


test('unresolved logout resolves session mode and rejects session or logout failures', async () => {
  const previousWindow = global.window, previousFetch = global.fetch;
  let destination = '', legacy = 0, reads = 0;
  let response = () => Response.json({ authMode: 'gateway', user: { id: 'gateway' } });
  let logout = () => { response = () => Response.json(null); return { url: '/' }; };
  global.window = { location: { origin: 'https://collab.example.test', assign: value => { destination = value; } } };
  global.fetch = async (url, options) => {
    assert.equal(url, '/api/auth/session'); assert.equal(options.cache, 'no-store'); reads++;
    return response();
  };
  try {
    const { signOutCurrentSession } = load('lib/sign-out.ts', {
      'next-auth/react': { signOut: async () => { legacy++; return logout(); } },
    });
    assert.equal(await signOutCurrentSession(undefined), false);
    assert.equal(destination, 'https://collab.example.test/oauth2/callback?logout=get');
    assert.equal(legacy, 0); assert.equal(reads, 1);
    destination = '';
    response = () => Response.json({ user: { id: 'legacy' } });
    assert.equal(await signOutCurrentSession(null), true); assert.equal(legacy, 1);
    assert.equal(destination, '');
    for (const bad of [
      () => Response.json({}, { status: 401 }),
      () => Response.json({}, { status: 503 }),
      () => Response.json(null),
      () => Response.json({}),
      () => new Response('invalid JSON'),
      () => { throw new Error('Network failure'); },
    ]) {
      response = bad;
      await assert.rejects(signOutCurrentSession(undefined));
      assert.equal(legacy, 1); assert.equal(destination, '');
    }
    response = () => Response.json({ user: { id: 'legacy' } });
    for (const bad of [() => ({ url: 'https://collab.example.test/api/auth/signout?csrf=true' }), () => ({ error: 'Use the gateway session' }), () => ({}),
      () => undefined, () => { throw new Error('Network failure'); }]) {
      logout = bad;
      await assert.rejects(signOutCurrentSession({ user: { id: 'legacy' } }));
      assert.equal(destination, '');
    }
  } finally {
    if (previousWindow === undefined) delete global.window; else global.window = previousWindow;
    global.fetch = previousFetch;
  }
});
