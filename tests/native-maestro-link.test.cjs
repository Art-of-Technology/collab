const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
// Fail closed before importing authentication libraries: source checks have no network authority.
for (const transport of ['node:http', 'node:https']) {
  require(transport).request = () => { throw new Error('Network disabled in source fixture'); };
  require(transport).get = () => { throw new Error('Network disabled in source fixture'); };
}
global.fetch = async () => { throw new Error('Network disabled in source fixture'); };
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const dep = path.resolve(root, 'node_modules');
const authRoot = path.dirname(require.resolve('next-auth'));
let fixtureJwks = null;
const oidcRequestPath = path.join(path.dirname(require.resolve('openid-client')), 'helpers/request.js');
require.cache[oidcRequestPath] = { id: oidcRequestPath, filename: oidcRequestPath, loaded: true, exports: async options => {
  assert.equal(String(options.url), 'https://auth.maestro-connect.com/api/auth/jwks');
  assert.ok(fixtureJwks, 'fixture JWKS must be installed; never fall back to network');
  return { statusCode: 200, headers: {}, body: fixtureJwks };
} };
const { encode } = require('next-auth/jwt');
process.env.NEXTAUTH_SECRET = 'fixture-only-not-a-live-secret';
process.env.NEXTAUTH_URL = 'https://collab.weez.boo';
process.env.MAESTRO_ENABLED = 'true';
process.env.MAESTRO_CLIENT_ID = 'fixture-client';
function load(file, mocks = {}) {
  const source = process.env.MAESTRO_TEST_BASELINE_ISSUES === '1' && file === 'src/app/api/issues/route.ts' ? require('node:child_process').execFileSync('git', ['show', 'fddd90cadeb79faea4954a2bc399f404bfbdb0e2:'+file], { cwd: root, encoding: 'utf8' }) : fs.readFileSync(path.join(root, file), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const loadedModule = { exports: {} };
  vm.runInThisContext(`(function(require,module,exports){${js}\n})`, { filename: file })(id => id in mocks ? mocks[id] : require(id), loadedModule, loadedModule.exports);
  return loadedModule.exports;
}
process.env.COLLAB_AUTH_MODE = 'nextauth';
const gateway = load('src/lib/gateway-identity.ts');
const helper = load('src/lib/maestro-link.ts', { '@/lib/gateway-identity': gateway });
const user = { id: 'original', name: 'Existing', email: 'old@example.test', role: 'DEVELOPER' };
let accounts, writes, currentToken, returnedIdentity, captured, lastSession;
function reset() {
  accounts = [{ id: 'google-row', provider: 'google', providerAccountId: 'google-sub', userId: user.id, type: 'oauth' }];
  writes = [];
  currentToken = { sub: user.id };
  returnedIdentity = { provider: 'maestro', subject: 'maestro-sub' };
  lastSession = null;
}
const db = {
  user: { findUnique: async ({ where }) => where.id === user.id ? { ...user } : null },
  account: {
    findUnique: async ({ where }) => accounts.find(a => a.provider === where.provider_providerAccountId.provider && a.providerAccountId === where.provider_providerAccountId.providerAccountId) || null,
    findFirst: async ({ where }) => accounts.find(a => Object.entries(where).every(([k,v]) => v && typeof v === 'object' ? a[k] !== v.not : a[k] === v)) || null,
    create: async ({ data }) => { writes.push({ ...data }); const a = { id: 'new', ...data }; accounts.push(a); return a; },
  },
  $queryRaw: async (_strings, id) => id === user.id ? [{ id }] : [],
  $transaction: async (fn, options) => { assert.deepEqual(options, { isolationLevel: "ReadCommitted" }); return fn(db); }, // Modeled client; no native isolation/rollback claim.
};
const baseAdapter = () => ({
  getUser: async id => db.user.findUnique({ where: { id } }),
  getUserByAccount: async key => { const a = await db.account.findUnique({ where: { provider_providerAccountId: key } }); return a && db.user.findUnique({ where: { id: a.userId } }); },
  getUserByEmail: async () => user,
  createUser: async () => { writes.push('CREATE_USER'); return user; },
  linkAccount: async account => db.account.create({ data: account }),
});
// Only provider transport/profile verification is doubled at this core-route seam.
// Separate checks below execute the installed OIDC validator with signed tokens.
const oauthPath = path.join(authRoot, 'core/lib/oauth/callback.js');
require.cache[oauthPath] = { id: oauthPath, filename: oauthPath, loaded: true, exports: { __esModule: true, default: async () => ({
  profile: { id: returnedIdentity.subject, email: 'maestro@example.test', name: 'Remote' },
  account: { provider: returnedIdentity.provider, providerAccountId: returnedIdentity.subject, type: 'oauth', access_token: 'fixture-provider-token', id_token: 'fixture-id-token' },
  OAuthProfile: { sub: returnedIdentity.subject, email_verified: true }, cookies: [],
}) } };
const coreCallback = require(path.join(authRoot, 'core/routes/callback.js')).default;
function NextAuth(options) {
  return async (request, context) => {
    captured = options;
    const [action, providerId] = (await context.params).nextauth;
    if (action === 'signin') return Response.json({ url: `https://issuer.example.test/authorize?state=generated-state` });
    const token = currentToken ? await encode({ token: currentToken, secret: process.env.NEXTAUTH_SECRET }) : null;
    const result = await coreCallback({
      options: { ...options, provider: { id: providerId, type: 'oauth' }, url: `${helper.COLLAB_ORIGIN}/api/auth`, callbackUrl: helper.COLLAB_ORIGIN + helper.LINK_PATH,
        jwt: { secret: process.env.NEXTAUTH_SECRET, encode: async ({ token }) => { lastSession = token; return 'fixture-session'; }, decode: require('next-auth/jwt').decode },
        session: { strategy: 'jwt', maxAge: 3600 }, cookies: { sessionToken: { name: 'session', options: {} } } },
      query: {}, body: {}, method: 'GET', headers: {}, cookies: {},
      sessionStore: { value: token, chunk: () => [], clean: () => [] },
    });
    return new Response(null, { status: 302, headers: { Location: result.redirect } });
  };
}
const { NextResponse } = require('next/server');
const authOptions = load('src/lib/auth-options.ts', { '@/lib/prisma': { prisma: db }, '@/utils/user-image-handler': { processUserProfileImage: async () => null }, '@/lib/custom-prisma-adapter': { CustomPrismaAdapter: baseAdapter }, '@/lib/maestro-link': helper }).authOptions;
const route = load('src/app/api/auth/[...nextauth]/route.ts', {
  '@/lib/auth-options': { authOptions }, '@/lib/gateway-identity': gateway, '@/lib/request-session': { getGatewaySession: async () => ({ user, authMode: 'gateway' }) },
  'next-auth': { __esModule: true, default: NextAuth }, 'next/server': { NextResponse },
  'next-auth/jwt': { getToken: async () => currentToken },
  '@/lib/prisma': { prisma: db }, '@/utils/user-image-handler': { processUserProfileImage: async () => null },
  '@/lib/custom-prisma-adapter': { CustomPrismaAdapter: baseAdapter }, '@/lib/maestro-link': helper,
});
async function invoke(provider = 'maestro', intent = null, state = 'bound-state', action = 'callback') {
  const cookie = intent && await helper.sealIntent(intent);
  const request = { method: action === 'signin' ? 'POST' : 'GET', headers: new Headers({ origin: helper.COLLAB_ORIGIN }),
    nextUrl: new URL(`${helper.COLLAB_ORIGIN}/api/auth/${action}/${provider}?state=${state}`),
    cookies: { has: () => !!cookie, get: () => cookie ? { value: cookie } : undefined } };
  return route.GET(request, { params: Promise.resolve({ nextauth: [action, provider] }) });
}
const intent = (overrides = {}) => ({ userId: user.id, googleAccountId: 'google-sub', phase: 'maestro', state: 'bound-state', expires: Date.now() + 60000, ...overrides });

test('actual NextAuth core refuses unmapped ordinary Maestro, creates no account/user', async () => {
  reset(); currentToken = null;
  const response = await invoke();
  assert.match(response.headers.get('location'), /AccessDenied/); assert.deepEqual(writes, []); assert.equal(lastSession, null);
});
test('explicit state-bound link preserves local user/Google/role and omits provider tokens', async () => {
  reset(); const response = await invoke('maestro', intent());
  assert.equal(response.headers.get('location'), `${helper.COLLAB_ORIGIN}/`);
  assert.match(response.headers.get('set-cookie'), /Max-Age=0/i);
  assert.equal(lastSession.sub, user.id); assert.equal(lastSession.role, 'DEVELOPER');
  assert.equal(accounts[0].id, 'google-row'); assert.deepEqual(writes, [{ userId: user.id, type: 'oauth', provider: 'maestro', providerAccountId: 'maestro-sub' }]);
});
test('mapped login uses original local user; same binding idempotent', async () => {
  reset(); accounts.push({ provider: 'maestro', providerAccountId: 'maestro-sub', userId: user.id }); currentToken = null;
  await invoke(); assert.equal(lastSession.sub, user.id); assert.deepEqual(writes, []);
  currentToken = { sub: user.id }; await invoke('maestro', intent()); assert.deepEqual(writes, []);
});
test('foreign binding, different user subject, stale/swapped state and lost Google refuse writes', async () => {
  for (const variant of ['foreign', 'other-subject', 'stale', 'state', 'user', 'google']) {
    reset(); let i = intent();
    if (variant === 'foreign') accounts.push({ provider: 'maestro', providerAccountId: 'maestro-sub', userId: 'foreign' });
    if (variant === 'other-subject') accounts.push({ provider: 'maestro', providerAccountId: 'another', userId: user.id });
    if (variant === 'stale') i.expires = Date.now() - 1;
    if (variant === 'user') i.userId = 'foreign';
    if (variant === 'google') accounts = [];
    const response = await invoke('maestro', i, variant === 'state' ? 'swapped' : 'bound-state');
    assert.match(response.headers.get('location'), /error/i, variant); assert.deepEqual(writes, [], variant); assert.equal(lastSession, null, variant);
  }
});
test('Google proof advances only verified same original Google callback, never JWT refresh', async () => {
  reset(); returnedIdentity = { provider: 'google', subject: 'google-sub' };
  const response = await invoke('google', intent({ phase: 'google' }));
  assert.equal(response.headers.get('location'), helper.COLLAB_ORIGIN + helper.LINK_PATH);
  const sealed = response.headers.get('set-cookie').split('=')[1].split(';')[0];
  const advanced = await helper.readIntent(sealed); assert.equal(advanced.phase, 'maestro'); assert.equal(advanced.state, undefined); assert.equal(advanced.userId, user.id);
  const refreshed = await authOptions.callbacks.jwt({ token: { sub: user.id, iat: Date.now() } });
  assert.equal(refreshed.googleVerified, undefined);
  reset(); returnedIdentity = { provider: 'google', subject: 'other-google' };
  const denied = await invoke('google', intent({ phase: 'google' })); assert.match(denied.headers.get('location'), /AccessDenied/); assert.deepEqual(writes, []);
});

test('connected link page enters Collab without another sign-in; unlinked users keep verification and refusal UI', async () => {
  reset();
  let cookieReads = 0;
  let pageIntent = null;
  const page = load('src/app/account/link-maestro/page.tsx', {
    'next/navigation': { redirect: url => { throw Object.assign(new Error('redirect'), { destination: url }); } },
    'next/headers': { cookies: async () => { cookieReads++; return { get: () => undefined }; } },
    '@/lib/session': { getCurrentUser: async () => user },
    '@/lib/prisma': { prisma: db },
    '@/lib/maestro-link': { ...helper, readIntent: async () => pageIntent },
    '@/components/auth/LinkMaestro': { __esModule: true, default: 'LinkMaestro' },
  }).default;
  const descendants = node => Array.isArray(node) ? node.flatMap(descendants) : !node || typeof node !== 'object' ? [] :
    [node, ...descendants(node.props?.children)];
  for (const verified of [false, true]) {
    pageIntent = verified ? intent({ state: undefined }) : null;
    const nodes = descendants(await page({ searchParams: Promise.resolve({}) }));
    assert.equal(nodes.find(n => n.type === 'LinkMaestro').props.googleVerified, verified);
  }
  const failed = descendants(await page({ searchParams: Promise.resolve({ error: 'AccessDenied' }) }));
  assert.ok(failed.some(n => n.props.role === 'alert'));
  accounts.push({ provider: 'maestro', providerAccountId: 'maestro-sub', userId: user.id });
  cookieReads = 0;
  for (const params of [{}, { error: 'AccessDenied' }]) {
    await assert.rejects(page({ searchParams: Promise.resolve(params) }), { destination: '/' });
  }
  assert.equal(cookieReads, 0, 'completed accounts must not restart the link flow');
  assert.deepEqual(writes, []);
});
test('OAuth initiation captures actual returned state in encrypted intent', async () => {
  reset(); const response = await invoke('maestro', intent({ state: undefined }), '', 'signin');
  const sealed = response.headers.get('set-cookie').split('=')[1].split(';')[0];
  assert.equal((await helper.readIntent(sealed)).state, 'generated-state');
});
test('redirect denies lookalike, protocol-relative, backslash and auth loop; keeps internal path', async () => {
  for (const url of ['https://collab.weez.boo.evil.test/x', '//evil.test/x', '/\\evil.test', '/api/auth/callback/google']) {
    assert.equal(await authOptions.callbacks.redirect({ url, baseUrl: helper.COLLAB_ORIGIN }), helper.COLLAB_ORIGIN);
  }
  assert.equal(await authOptions.callbacks.redirect({ url: '/team/issues?q=1', baseUrl: helper.COLLAB_ORIGIN }), `${helper.COLLAB_ORIGIN}/team/issues?q=1`);
});
test('missing local user refuses session and claims do not supply role', async () => {
  await assert.rejects(authOptions.callbacks.jwt({ token: { sub: 'deleted', role: 'SYSTEM_ADMIN' } }), /Invalid session/);
  const token = await authOptions.callbacks.jwt({ token: { sub: user.id, role: 'SYSTEM_ADMIN' } }); assert.equal(token.role, 'DEVELOPER');
});
test('actual OAuth profile refusal logger omits raw claims; token exchange/verification doubled here', async () => {
  const output = []; const original = console.error;
  const config = helper.maestroProvider();
  const options = { provider: { ...config, token: { url: config.token }, userinfo: { url: config.userinfo } },
    jwt: { secret: process.env.NEXTAUTH_SECRET }, logger: helper.safeAuthLogger,
    cookies: Object.fromEntries(['state','nonce','pkceCodeVerifier'].map(name => [name, { name, options: {} }])) };
  const cookieList = [], params = {};
  const checks = require(path.join(authRoot, 'core/lib/oauth/checks.js'));
  for (const kind of ['state','nonce','pkce']) await checks[kind].create(options, cookieList, params);
  const realRequire = require('node:module').createRequire(oauthPath);
  const loadedModule = { exports: {} };
  vm.runInThisContext(`(function(require,module,exports){${fs.readFileSync(oauthPath, 'utf8')}\n})`)(id => id === './client' ? { openidClient: async () => ({
    callbackParams: () => ({}), callback: async () => ({ claims: () => ({ iss: helper.MAESTRO_ISSUER, sub: 's', email: 'PRIVATE@example.test', email_verified: 'true', access_token: 'PRIVATE' }) }),
  }) } : realRequire(id), loadedModule, loadedModule.exports);
  console.error = (...args) => output.push(args);
  try {
    const result = await loadedModule.exports.default({ options, method: 'GET', query: {}, body: {}, cookies: Object.fromEntries(cookieList.map(c => [c.name,c.value])) });
    assert.equal(result.account, undefined); assert.equal(result.profile, undefined);
  } finally { console.error = original; }
  assert.deepEqual(output, [['AUTH_FAILED', 'OAUTH_PARSE_PROFILE_ERROR']]);
});

test('installed OIDC validates actual signed ID token, issuer/audience/expiry/nonce/RS256; transport mocked', async () => {
  const { generateKeyPairSync } = require('node:crypto');
  const { SignJWT } = require('jose');
  const key = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...key.publicKey.export({ format: 'jwk' }), kid: 'fixture', alg: 'RS256', use: 'sig' };
  fixtureJwks = { keys: [jwk] };
  try {
    const { openidClient } = require(path.join(authRoot, 'core/lib/oauth/client.js'));
    const config = helper.maestroProvider();
    const client = await openidClient({ provider: { ...config, token: { url: config.token }, userinfo: { url: config.userinfo }, callbackUrl: `${helper.COLLAB_ORIGIN}/api/auth/callback/maestro` } });
    const claims = { iss: helper.MAESTRO_ISSUER, sub: 'maestro-sub', aud: 'fixture-client', iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000)+120, nonce: 'nonce', email_verified: true, email: 'test@example.test' };
    const sign = payload => new SignJWT(payload).setProtectedHeader({ alg: 'RS256', kid: 'fixture' }).sign(key.privateKey);
    const token = await sign(claims);
    await client.validateIdToken(token, 'nonce', 'token');
    for (const delta of [{ iss: 'https://other.test' }, { aud: 'other' }, { exp: 1 }, { nonce: 'wrong' }]) await assert.rejects(client.validateIdToken(await sign({ ...claims, ...delta }), 'nonce', 'token'));
    const unsigned = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url')+'.'+Buffer.from(JSON.stringify(claims)).toString('base64url')+'.';
    await assert.rejects(client.validateIdToken(unsigned, 'nonce', 'token'), /alg/);
    await assert.rejects(client.callback(`${helper.COLLAB_ORIGIN}/api/auth/callback/maestro`, { state: 'wrong' }, { state: 'expected' }), /state mismatch/);
    const wrongAlg = await new SignJWT(claims).setProtectedHeader({ alg: 'RS512', kid: 'fixture' }).sign(key.privateKey);
    await assert.rejects(client.validateIdToken(wrongAlg, 'nonce', 'token'), /alg/);
  } finally { fixtureJwks = null; }
});


test('actual NextAuth authorization generates S256/state/nonce and refuses missing or tampered check cookies', async () => {
  const authorize = require(path.join(authRoot, 'core/lib/oauth/authorization-url.js')).default;
  const checks = require(path.join(authRoot, 'core/lib/oauth/checks.js'));
  const provider = helper.maestroProvider();
  const options = { provider: { ...provider, token: { url: provider.token }, userinfo: { url: provider.userinfo }, callbackUrl: `${helper.COLLAB_ORIGIN}/api/auth/callback/maestro` },
    jwt: { secret: process.env.NEXTAUTH_SECRET }, logger: helper.safeAuthLogger,
    cookies: Object.fromEntries(['state','nonce','pkceCodeVerifier'].map(name => [name, { name, options: {} }])) };
  const response = await authorize({ options, query: {} });
  const url = new URL(response.redirect); assert.equal(url.origin, helper.MAESTRO_ISSUER); assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  const cookieMap = Object.fromEntries(response.cookies.map(c => [c.name, c.value]));
  const values = {};
  for (const kind of ['state','nonce','pkce']) {
    await checks[kind].use(cookieMap, [], options, values);
    await assert.rejects(checks[kind].use({}, [], options, {}), /missing/);
    await assert.rejects(checks[kind].use(Object.fromEntries(Object.keys(cookieMap).map(k => [k, 'tampered'])), [], options, {}));
  }
  assert.equal(values.state, url.searchParams.get('state')); assert.equal(values.nonce, url.searchParams.get('nonce'));
  assert.equal(require('node:crypto').createHash('sha256').update(values.code_verifier).digest('base64url'), url.searchParams.get('code_challenge'));
});
test('guarded adapter refuses direct new user/link and expired permit after row lock', async () => {
  reset(); const adapter = helper.guardedMaestroAdapter(db, baseAdapter(), () => null);
  await assert.rejects(adapter.createUser({ email: 'new@example.test' }));
  await assert.rejects(adapter.linkAccount({ provider: 'maestro', providerAccountId: 's', userId: user.id }));
  const expired = helper.guardedMaestroAdapter(db, baseAdapter(), () => ({ userId: user.id, googleAccountId: 'google-sub', subject: 's', expires: Date.now()-1 }));
  await assert.rejects(expired.linkAccount({ provider: 'maestro', providerAccountId: 's', userId: user.id }));
  assert.deepEqual(writes, []);
});

test('existing issue list/create deny inactive or foreign actor and forged reporter; preserve owner/active member', async t => {
  const makeRoute = (membership, owner = false, connected = false) => {
    const effects = [];
    function matches(where) {
      if (where.AND) return where.AND.every(matches);
      if (where.OR) return where.OR.some(matches);
      if (where.ownerId) return owner && where.ownerId === user.id;
      if (where.members) return membership !== null && where.members.some.userId === user.id && (where.members.some.status === undefined || where.members.some.status === membership);
      return true;
    }
    const issueDB = {
      workspace: { findFirst: async ({ where }) => matches(where) ? { id: 'workspace' } : null },
      project: { findFirst: async () => ({ id: 'project' }), findUnique: async () => ({ issuePrefix: 'ISS', nextIssueNumbers: { TASK: 1 } }), update: async () => ({}) },
      projectStatus: { findFirst: async () => ({ id: 'status' }) },
      issue: { findMany: async () => { effects.push('read'); return []; }, findFirst: async () => null,
        create: async ({ data }) => { effects.push(data); return { id: 'issue', ...data }; } },
      issueFollower: { findMany: async () => [] }, projectFollower: { findMany: async () => [] },
      $transaction: async fn => fn(issueDB),
    };
    const guard = load('src/lib/forge/legacy-write-guard.ts', { 'server-only': {}, '@/lib/prisma': { prisma: issueDB }, './reader': { readForgeBindings: async () => connected ? [{ projectId: 'project' }] : [] } });
    const sourcePath = 'src/app/api/issues/route.ts';
    const mocks = {
      '@/lib/forge/legacy-write-guard': guard,
      'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
      '@/lib/request-session': { getServerSession: async () => ({ user }) },
      '@/lib/auth-options': { authOptions: {} }, '@/lib/prisma': { prisma: issueDB },
      '@/lib/board-item-activity-service': { trackCreation: async () => {} }, '@/lib/redis': { publishEvent: async () => {} },
      '@/utils/mentions': { extractMentionUserIds: () => [] }, '@/lib/notification-service': { NotificationService: {}, NotificationType: {} },
      '@/lib/event-bus': { emitIssueCreated: async () => {} }, '@/utils/issueRelations': { buildIssueRelations: () => ({}) },
    };
    return { handlers: load(sourcePath, mocks), effects };
  };
  for (const [name, membership, owner, expected] of [['owner', null, true, 200], ['active', true, false, 200], ['inactive', false, false, 403], ['foreign', null, false, 403]]) {
    await t.test(`GET ${name}`, async () => {
      const { handlers, effects } = makeRoute(membership, owner);
      const result = await handlers.GET(new Request('https://collab.weez.boo/api/issues?workspaceId=workspace'));
      assert.equal(result.status, expected); assert.deepEqual(effects, expected === 200 ? ['read'] : []);
    });
  }
  for (const [name, membership, reporter, expected, connected] of [['active', true, user.id, 201], ['inactive', false, user.id, 403], ['foreign', null, user.id, 403], ['forged reporter', true, 'foreign', 403], ['Forge-connected', true, user.id, 409, true]]) {
    await t.test(`POST ${name}`, async () => {
      const { handlers, effects } = makeRoute(membership, false, connected);
      const result = await handlers.POST(new Request('https://collab.weez.boo/api/issues', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'New', workspaceId: 'workspace', projectId: 'project', reporterId: reporter }) }));
      assert.equal(result.status, expected);
      if (expected === 201) { assert.equal(effects.length, 1); assert.equal(effects[0].reporterId, user.id); }
      else assert.deepEqual(effects, []);
    });
  }
});


test('shared current-user accessor uses stable ID despite stale email; missing ID fails closed', async () => {
  const queries = [];
  let session = { user: { id: user.id, email: 'reassigned@example.test' } };
  const accessor = load('src/lib/session.ts', {
    '@/lib/request-session': { getServerSession: async () => session },
    '@/lib/auth-options': { authOptions: authOptions },
    '@/lib/prisma': { prisma: { user: { findUnique: async ({ where }) => {
      queries.push(where); return { ...user, createdAt: new Date(0), updatedAt: new Date(0), emailVerified: null };
    } } } },
  });
  assert.equal((await accessor.getCurrentUser()).id, user.id); assert.deepEqual(queries, [{ id: user.id }]);
  session = { user: { email: user.email } }; assert.equal(await accessor.getCurrentUser(), null); assert.equal(queries.length, 1);
});
test('Google ordinary login stays available and uses original local user', async () => {
  reset(); currentToken = null; returnedIdentity = { provider: 'google', subject: 'google-sub' };
  await invoke('google'); assert.equal(lastSession.sub, user.id); assert.deepEqual(writes, []);
});

test('explicit link initiation enforces Origin/session/Google and only sets an encrypted intent', async () => {
  let actor = { user };
  let cookie;
  const start = load('src/app/api/auth/link-maestro/route.ts', {
    'next/server': { NextResponse: { json(body, init) { const r = Response.json(body, init); r.cookies = { set(name, value, options) { cookie = { name, value, options }; } }; return r; } } },
    '@/lib/request-session': { getServerSession: async () => actor },
    '@/lib/auth-options': { authOptions: authOptions }, '@/lib/prisma': { prisma: db }, '@/lib/maestro-link': helper,
  });
  const request = origin => new Request(`${helper.COLLAB_ORIGIN}/api/auth/link-maestro`, { method: 'POST', headers: origin ? { origin } : {} });
  reset(); cookie = null;
  assert.equal((await start.POST(request('https://evil.test'))).status, 403); assert.equal(cookie, null);
  assert.equal((await start.POST(request(null))).status, 403); assert.equal(cookie, null);
  actor = null; assert.equal((await start.POST(request(helper.COLLAB_ORIGIN))).status, 401);
  actor = { user }; accounts = []; assert.equal((await start.POST(request(helper.COLLAB_ORIGIN))).status, 409);
  reset(); assert.equal((await start.POST(request(helper.COLLAB_ORIGIN))).status, 200);
  assert.equal(cookie.name, helper.LINK_COOKIE); assert.equal(cookie.options.httpOnly, true); assert.equal(cookie.options.secure, true); assert.equal(cookie.options.sameSite, 'lax');
  const decoded = await helper.readIntent(cookie.value); assert.equal(decoded.phase, 'google'); assert.equal(decoded.userId, user.id); assert.equal(decoded.state, undefined); assert.deepEqual(writes, []);
  accounts.push({ provider: 'maestro', providerAccountId: 'existing', userId: user.id });
  cookie = null; assert.equal((await start.POST(request(helper.COLLAB_ORIGIN))).status, 409); assert.equal(cookie, null);
});


test('fixture refuses unexpected outbound HTTP/HTTPS/fetch instead of using live providers', async () => {
  assert.throws(() => require('node:https').request('https://example.invalid'), /Network disabled/);
  assert.throws(() => require('node:http').get('http://example.invalid'), /Network disabled/);
  await assert.rejects(fetch('https://example.invalid'), /Network disabled/);
});

test('authorization DB failure is generic in actual core redirect/body/logs with zero link or session', async () => {
  reset(); currentToken = null;
  const sentinel = 'PRIVATE_AUTH_DATABASE_SENTINEL';
  const originalFind = db.account.findUnique, originalError = console.error;
  const logs = []; let reads = 0;
  db.account.findUnique = async () => {
    reads++;
    if (reads === 1) return null; // Installed core's initial account lookup succeeds.
    throw new Error(sentinel); // New callback authorization lookup fails.
  };
  console.error = (...args) => logs.push(args);
  try {
    const response = await invoke('maestro');
    assert.equal(reads, 2);
    const visible = JSON.stringify({ location: response.headers.get('location'), body: await response.text(), logs });
    assert.equal(visible.includes(sentinel), false);
    assert.match(response.headers.get('location'), /AccessDenied/);
    assert.deepEqual(logs, [['AUTH_FAILED', 'UNKNOWN']]);
    assert.deepEqual(writes, []); assert.equal(lastSession, null);
  } finally { db.account.findUnique = originalFind; console.error = originalError; }
});


test('gateway and invalid modes deny native callbacks and link initiation before session/account work', async () => {
  reset();
  const start = load('src/app/api/auth/link-maestro/route.ts', {
    'next/server': { NextResponse }, '@/lib/auth-options': { authOptions }, '@/lib/maestro-link': helper,
    '@/lib/request-session': { getServerSession: async () => { throw new Error('must not resolve native session'); } },
    '@/lib/prisma': { prisma: new Proxy({}, { get() { throw new Error('must not query accounts'); } }) },
  });
  try {
    for (const mode of ['gateway', 'invalid']) {
      process.env.COLLAB_AUTH_MODE = mode;
      assert.equal(helper.maestroEnabled(), false);
      assert.equal((await start.POST(new Request(helper.COLLAB_ORIGIN, { method: 'POST' }))).status, 404);
      assert.equal((await invoke()).status, mode === 'gateway' ? 404 : 503);
      assert.equal((await route.POST({}, { params: Promise.resolve({ nextauth: ['signin', 'maestro'] }) })).status, 403);
      assert.deepEqual(writes, []); assert.equal(lastSession, null);
    }
    process.env.COLLAB_AUTH_MODE = 'gateway';
    const session = await route.GET({}, { params: Promise.resolve({ nextauth: ['session'] }) });
    assert.equal(session.status, 200); assert.equal((await session.json()).authMode, 'gateway');
  } finally { process.env.COLLAB_AUTH_MODE = 'nextauth'; }
});


test('dashboard shared accessor preserves canonical native options and gateway hashed mapping without fallback', async () => {
  let nativeCalls = 0;
  const queries = [];
  const issuer = helper.MAESTRO_ISSUER, subject = 'gateway-subject';
  const headers = new Headers({ 'x-collab-issuer': Buffer.from(issuer).toString('base64url'), 'x-collab-subject': Buffer.from(subject).toString('base64url'), 'x-collab-email': Buffer.from('actor@weezboo.com').toString('base64url'), 'x-collab-email-verified': 'true' });
  const requestSession = load('src/lib/request-session.ts', {
    'server-only': {}, './gateway-identity': gateway,
    'next/headers': { headers: async () => headers },
    'next-auth': { getServerSession: async options => { nativeCalls++; assert.equal(options, authOptions); return { user }; } },
    '@/lib/prisma': { prisma: { account: { findUnique: async ({ where }) => {
      queries.push(where.provider_providerAccountId);
      return { user: { ...user, email: 'actor@weezboo.com', accounts: [{ id: 'mapped' }] } };
    } } } },
  });
  const shared = load('src/lib/auth.ts', { '@/lib/request-session': requestSession, '@/lib/auth-options': { authOptions } });
  const oldIssuer = process.env.COLLAB_GATEWAY_ISSUER;
  try {
    process.env.COLLAB_AUTH_MODE = 'nextauth';
    assert.equal((await shared.getAuthSession()).user.id, user.id); assert.equal(nativeCalls, 1); assert.deepEqual(queries, []);
    process.env.COLLAB_AUTH_MODE = 'gateway'; process.env.COLLAB_GATEWAY_ISSUER = issuer;
    assert.equal((await shared.getAuthSession()).authMode, 'gateway'); assert.equal(nativeCalls, 1);
    const key = require('node:crypto').createHash('sha256').update(issuer).update('\0').update(subject).digest('hex');
    assert.deepEqual(queries, [{ provider: 'maestro', providerAccountId: key }]); assert.notEqual(key, subject);
    process.env.COLLAB_AUTH_MODE = 'invalid'; assert.equal(await shared.getAuthSession(), null);
    assert.equal(nativeCalls, 1); assert.equal(queries.length, 1);
  } finally {
    process.env.COLLAB_AUTH_MODE = 'nextauth';
    if (oldIssuer === undefined) delete process.env.COLLAB_GATEWAY_ISSUER; else process.env.COLLAB_GATEWAY_ISSUER = oldIssuer;
  }
});


test('safe auth logger keeps only known codes, redacting unknown codes and private metadata', () => {
  const originalError = console.error, originalWarn = console.warn, originalDebug = console.debug;
  const output = [];
  console.error = console.warn = console.debug = (...args) => output.push(args);
  const privateValue = 'PRIVATE_AUTH_LOG_SENTINEL';
  try {
    helper.safeAuthLogger.error('JWT_SESSION_ERROR', { error: new Error(privateValue), token: privateValue });
    helper.safeAuthLogger.warn('NO_SECRET', { secret: privateValue });
    helper.safeAuthLogger.error(privateValue, { error: new Error(privateValue) });
    helper.safeAuthLogger.warn(privateValue);
    helper.safeAuthLogger.error({ toString() { throw new Error('must not coerce input'); } });
    helper.safeAuthLogger.debug(privateValue, { token: privateValue });
  } finally { console.error = originalError; console.warn = originalWarn; console.debug = originalDebug; }
  assert.deepEqual(output, [['AUTH_FAILED', 'JWT_SESSION_ERROR'], ['AUTH_WARNING', 'NO_SECRET'],
    ['AUTH_FAILED', 'UNKNOWN'], ['AUTH_WARNING', 'UNKNOWN'], ['AUTH_FAILED', 'UNKNOWN']]);
  assert.equal(JSON.stringify(output).includes(privateValue), false);
});

test('Maestro defaults off; explicit native enablement rejects invalid config with a fixed error', () => {
  const keys = ['MAESTRO_ENABLED', 'NEXTAUTH_URL', 'MAESTRO_CLIENT_ID', 'NEXTAUTH_SECRET', 'COLLAB_AUTH_MODE'];
  const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const restore = () => { for (const key of keys) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; } };
  const options = () => load('src/lib/auth-options.ts', { '@/lib/prisma': { prisma: db }, '@/utils/user-image-handler': {}, '@/lib/custom-prisma-adapter': { CustomPrismaAdapter: baseAdapter }, '@/lib/maestro-link': helper }).authOptions;
  try {
    for (const flag of [undefined, 'false']) {
      restore(); if (flag === undefined) delete process.env.MAESTRO_ENABLED; else process.env.MAESTRO_ENABLED = flag;
      delete process.env.MAESTRO_CLIENT_ID;
      assert.equal(helper.maestroEnabled(), false);
      assert.deepEqual(options().providers.map(p => p.id), ['google']);
    }
    for (const [key, value] of [['NEXTAUTH_URL', 'https://PRIVATE_CONFIG_SENTINEL.test'], ['MAESTRO_CLIENT_ID', ''], ['MAESTRO_CLIENT_ID', '   '], ['NEXTAUTH_SECRET', '']]) {
      restore(); process.env[key] = value;
      assert.throws(options, { message: 'Invalid Maestro configuration' });
    }
    for (const mode of ['gateway', 'invalid']) {
      restore(); process.env.COLLAB_AUTH_MODE = mode; delete process.env.MAESTRO_CLIENT_ID;
      assert.equal(helper.maestroEnabled(), false);
    }
    restore(); assert.equal(helper.maestroEnabled(), true);
    assert.deepEqual(options().providers.map(p => p.id), ['google', 'maestro']);
  } finally { restore(); }
});

test('disabled Maestro and stale intent refuse locally, clear intent, and leave ordinary Google available', async () => {
  const oldEnabled = process.env.MAESTRO_ENABLED, oldUrl = process.env.NEXTAUTH_URL;
  try {
    process.env.MAESTRO_ENABLED = 'false'; process.env.NEXTAUTH_URL = 'http://localhost:3151';
    for (const [provider, stale, expected] of [['maestro', null, '/login?error=AccessDenied'], ['google', intent({ phase: 'google', expires: Date.now()-1 }), helper.LINK_PATH+'?error=AccessDenied']]) {
      reset(); captured = null;
      const response = await invoke(provider, stale);
      assert.equal(response.headers.get('location'), expected);
      assert.match(response.headers.get('set-cookie'), /Max-Age=0/i);
      assert.match(response.headers.get('set-cookie'), /HttpOnly/i);
      assert.equal(captured, null); assert.equal(lastSession, null); assert.deepEqual(writes, []);
    }
    reset(); currentToken = null; returnedIdentity = { provider: 'google', subject: 'google-sub' };
    await invoke('google'); assert.equal(lastSession.sub, user.id); assert.deepEqual(writes, []);
    process.env.MAESTRO_ENABLED = oldEnabled; process.env.NEXTAUTH_URL = oldUrl;
    const response = await invoke('maestro', intent({ expires: Date.now()-1 }));
    assert.equal(response.headers.get('location'), helper.COLLAB_ORIGIN+helper.LINK_PATH+'?error=AccessDenied');
  } finally { process.env.MAESTRO_ENABLED = oldEnabled; process.env.NEXTAUTH_URL = oldUrl; }
});

test('profile server flag controls actual client link without sending server configuration', async () => {
  const react = require('react');
  const mocks = {
    react: { ...react, useState: value => [typeof value === 'function' ? value() : value] },
    'next/link': { __esModule: true, default: 'a' },
    '@/hooks/queries/useUser': { useCurrentUserProfile: () => ({}), useInfiniteUserProfilePosts: () => ({}) },
    '@/context/WorkspaceContext': { useWorkspace: () => ({ currentWorkspace: { id: 'workspace' } }) },
  };
  for (const name of ['ProfileForm', 'NotificationSettings']) mocks['@/components/profile/'+name] = { __esModule: true, default: name };
  mocks['@/components/posts/PostList'] = { __esModule: true, default: 'PostList' };
  for (const [file, names] of [['card', ['Card', 'CardContent', 'CardHeader']], ['user-avatar', ['UserAvatar']], ['tabs', ['Tabs', 'TabsContent', 'TabsList', 'TabsTrigger']], ['custom-avatar', ['CustomAvatar']]]) {
    mocks['@/components/ui/'+file] = Object.fromEntries(names.map(name => [name, name]));
  }
  const client = load('src/components/profile/ProfileClient.tsx', mocks).default;
  const page = load('src/app/(main)/[workspaceId]/profile/page.tsx', {
    'next/navigation': { redirect() { throw new Error('unexpected redirect'); } }, '@/lib/auth': { getAuthSession: async () => ({ user }) },
    '@/lib/session': { getCurrentUser: async () => user }, '@/actions/post': { getPosts: async () => ({ user, stats: {}, posts: [] }) },
    '@/components/profile/ProfileClient': { __esModule: true, default: client }, '@/lib/maestro-link': helper,
  }).default;
  const links = node => Array.isArray(node) ? node.flatMap(links) : !node || typeof node !== 'object' ? [] :
    [...(node.type === 'a' && node.props.href === helper.LINK_PATH ? [node] : []), ...links(node.props?.children)];
  const oldEnabled = process.env.MAESTRO_ENABLED;
  try {
    for (const enabled of [false, true]) {
      process.env.MAESTRO_ENABLED = String(enabled);
      const element = await page({ params: Promise.resolve({ workspaceId: 'workspace' }) });
      assert.equal(element.type, client); assert.equal(element.props.maestroEnabled, enabled);
      assert.deepEqual(Object.keys(element.props).sort(), ['initialData', 'maestroEnabled']);
      assert.equal(links(client(element.props)).length, enabled ? 1 : 0);
    }
    assert.equal(links(client({ initialData: { user, stats: {}, posts: [] } })).length, 0);
  } finally { process.env.MAESTRO_ENABLED = oldEnabled; }
});
