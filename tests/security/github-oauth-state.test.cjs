const { assert, test, load, matches } = require('./helpers.cjs');
const crypto = require('node:crypto');
const { existsSync } = require('node:fs');
const { resolve } = require('node:path');
const cookieName = '__Host-collab-github-oauth';
function fixture(options = {}) {
  let actor = { id: 'alice', email: 'alice@example.test', createdAt: new Date(), updatedAt: new Date() };
  const effects = [], logs = [];
  const requestCookieName = options.environment === 'development' ? 'collab-github-oauth' : cookieName;
  const globals = { URL, Buffer, crypto, Error, process: { env: { NODE_ENV: options.environment || 'production', ENCRYPTION_KEY: 'X7!kPd4@vL9#qR2$wN6%aB8&zC3*mF5+' } }, console: { log: (...v) => logs.push(v), warn: (...v) => logs.push(v), error: (...v) => logs.push(v) } };
  const encryption = load('src/lib/encryption.ts', { crypto: { default: { ...crypto, createCipheriv(...args) {
    if (options.encryptError) throw new Error('raw state=' + 'a'.repeat(64) + ' token=provider-token key=' + globals.process.env.ENCRYPTION_KEY + ' sensitive provider payload');
    return crypto.createCipheriv(...args);
  } } } }, globals).EncryptionService;
  const project = { id: 'p1', slug: 'project', workspace: { slug: 'workspace', ownerId: options.access ? 'bob' : 'alice', members: options.access === 'member' || options.access === 'revoked' ? [{ userId: 'alice', status: options.access === 'member' }] : [] } };
  const response = (body, init = {}) => ({ body, status: init.status || 200, headers: new Headers(init.headers), cookies: { values: [], set(...args) { this.values.push(args); } } });
  const deps = {
    'next/server': { NextResponse: { json: response, redirect: url => ({ ...response(null, { status: 307 }), url: String(url) }) } },
    'next-auth': { getServerSession: async () => options.absent ? null : { user: actor } },
    '@/lib/request-session': { getServerSession: async () => options.absent ? null : { user: actor } },
    '@/lib/auth': { authConfig: {} }, '@/lib/auth-options': { authOptions: {} },
    '@/lib/encryption': { EncryptionService: encryption },
    '@/lib/post-access': load('src/lib/post-access.ts'),
    '@/lib/prisma': { prisma: { user: { findUnique: async () => options.deleted ? null : actor, update: async query => effects.push(['write', query]) }, project: {
      findUnique: async () => project,
      findFirst: async ({ where }) => !options.denied && matches(project, where) ? project : null,
    } } },
    '@/lib/github/oauth-config': { getGitHubAuthUrl: state => 'https://github.com/login/oauth/authorize?state=' + encodeURIComponent(state), exchangeCodeForToken: async code => { effects.push(['exchange', code]); if (options.providerError) throw new Error('sensitive provider payload'); return 'provider-token'; }, getGitHubUser: async () => { effects.push(['profile']); return { id: 1, login: 'octocat' }; } },
    'node:crypto': crypto,
  };
  deps['@/lib/session'] = load('src/lib/session.ts', deps, globals);
  const helper = 'src/lib/github/oauth-state.ts';
  if (existsSync(resolve(process.env.SECURITY_TEST_ROOT || resolve(__dirname, '../..'), helper))) deps['@/lib/github/oauth-state'] = load(helper, deps, globals);
  const issuer = load('src/app/api/github/oauth/auth-url/route.ts', deps, globals).GET;
  const callback = load('src/app/api/github/oauth/callback/route.ts', deps, globals).GET;
  const nonce = 'a'.repeat(64);
  const envelope = overrides => encryption.encrypt({ kind: 'github-oauth-state', version: 1, nonce, userId: 'alice', projectId: null, expiresAt: Date.now() + 300000, ...overrides });
  const request = (path, cookie) => ({ url: 'https://collab.example' + path, cookies: { get: name => name === requestCookieName && cookie ? { value: cookie } : undefined } });
  return { effects, logs, nonce, envelope, encryption, options, setActor: id => actor = { ...actor, id }, issue: query => issuer(request('/api/github/oauth/auth-url' + (query || ''))), callback: (query, cookie) => callback(request('/api/github/oauth/callback?' + query, cookie)) };
}
function cleared(response) { assert.ok(response.cookies.values.some(([name, value, opts]) => name === cookieName && value === '' && opts.maxAge === 0 && opts.path === '/')); }
function denied(f, response) { assert.equal(new URL(response.url).searchParams.has('github_connected'), false); assert.deepEqual(f.effects, []); cleared(response); }

test('issuer requires a live actor', async () => { for (const flag of ['absent', 'deleted']) { const f = fixture({ [flag]: true }); assert.equal((await f.issue()).status, 401); } });
test('issuer seals fresh opaque browser state and preserves project input only as metadata', async () => {
  const f = fixture(); const r = await f.issue('?state=project:p1'); assert.equal(r.status, 200); assert.match(r.body.state, /^[a-f0-9]{64}$/); assert.notEqual(r.body.state, 'project:p1'); assert.equal(new URL(r.body.authUrl).searchParams.get('state'), r.body.state);
  const [name, cookie, opts] = r.cookies.values[0]; assert.equal(name, cookieName); assert.ok(cookie); assert.equal(opts.httpOnly, true); assert.equal(opts.secure, true); assert.equal(opts.sameSite, 'lax'); assert.equal(opts.path, '/'); assert.equal(opts.maxAge, 600); assert.equal(r.headers.get('cache-control'), 'no-store'); assert.deepEqual(f.logs, []);
  const done = await f.callback('code=valid&state=' + r.body.state, cookie); assert.equal(new URL(done.url).pathname, '/workspace/projects/project/settings'); assert.equal(new URL(done.url).searchParams.get('tab'), 'github'); cleared(done);
});
test('issuer denies inaccessible projects without granting transaction', async () => { const f = fixture({ denied: true }); const r = await f.issue('?state=project:p1'); assert.equal(r.status, 404); assert.deepEqual(f.effects, []); });
test('missing or mismatched state and cookie deny before provider effects', async () => {
  for (const [query, cookie] of [['code=evil', null], ['code=evil&state=x', null], ['code=evil&state=x', 'sealed']]) { const f = fixture(); denied(f, await f.callback(query, cookie)); }
  const f = fixture(); denied(f, await f.callback('code=evil&state=' + 'b'.repeat(64), f.envelope()));
});
test('tampered ciphertext, expired state, wrong actor and wrong envelope kind deny', async () => {
  for (const overrides of [{ expiresAt: Date.now() - 1 }, { userId: 'bob' }, { kind: 'other-purpose' }, { projectId: {} }]) { const f = fixture(); denied(f, await f.callback('code=evil&state=' + f.nonce, f.envelope(overrides))); }
  const f = fixture(); const cookie = f.envelope(); denied(f, await f.callback('code=evil&state=' + f.nonce, cookie.slice(0, 12) + 'XXXX' + cookie.slice(16))); assert.deepEqual(f.logs, [['Decryption error']]);
});
test('callback rejects duplicate state/code parameters', async () => { for (const suffix of ['&state=other', '&code=other']) { const f = fixture(); denied(f, await f.callback('code=x&state=' + f.nonce + suffix, f.envelope())); } });
test('callback missing/deleted actor has no provider effects and clears transaction', async () => { for (const flag of ['absent', 'deleted']) { const f = fixture({ [flag]: true }); denied(f, await f.callback('code=x&state=' + f.nonce, f.envelope())); } });
test('project access lost after issuance denies before provider effects', async () => { const f = fixture({ denied: true }); denied(f, await f.callback('code=x&state=' + f.nonce, f.envelope({ projectId: 'p1' }))); });
test('valid personal callback writes current actor and returns success then browser-cleared replay denies', async () => {
  const f = fixture(); const r = await f.callback('code=valid&state=' + f.nonce, f.envelope()); assert.equal(new URL(r.url).searchParams.get('github_connected'), 'true'); assert.equal(f.effects[2][1].where.id, 'alice'); assert.notEqual(f.effects[2][1].data.githubAccessToken, 'provider-token'); cleared(r); f.effects.length = 0; denied(f, await f.callback('code=valid&state=' + f.nonce, null));
});
test('denied consent and missing code clear state without effects or raw provider message', async () => { for (const query of ['error=access_denied&error_description=sensitive', '']) { const f = fixture(); const r = await f.callback(query + '&state=' + f.nonce, f.envelope()); denied(f, r); assert.equal(r.url.includes('sensitive'), false); } });
test('provider failure is generic and clears cookie without credential writes', async () => { const f = fixture({ providerError: true }); const r = await f.callback('code=valid&state=' + f.nonce, f.envelope()); assert.equal(r.url.includes('sensitive'), false); assert.equal(f.effects.some(e => e[0] === 'write'), false); cleared(r); });
test('provider URL builder keeps generated state', async () => { const config = load('src/lib/github/oauth-config.ts', {}, { URLSearchParams, crypto, process: { env: {} } }); assert.equal(new URL(config.getGitHubAuthUrl('opaque')).searchParams.get('state'), 'opaque'); });

test('state validation rejects alternate field types, future expiry and oversized ciphertext', async () => {
  for (const overrides of [{ version: 2 }, { nonce: 123 }, { userId: 123 }, { expiresAt: 'later' }, { expiresAt: Number.MAX_SAFE_INTEGER }, { projectId: '' }, { projectId: 'x'.repeat(257) }]) { const f = fixture(); denied(f, await f.callback('code=x&state=' + f.nonce, f.envelope(overrides))); }
  const f = fixture(); denied(f, await f.callback('code=x&state=' + f.nonce, 'x'.repeat(2049)));
});
test('issuer rejects malformed project metadata and duplicate state', async () => { for (const query of ['?state=project:', '?state=x&state=y', '?state=' + 'x'.repeat(265)]) { const f = fixture(); assert.equal((await f.issue(query)).status, 400); assert.deepEqual(f.effects, []); } });
test('project active member succeeds while revoked and foreign actors cannot issue or redeem', async () => {
  const member = fixture({ access: 'member' }); assert.equal((await member.issue('?state=project:p1')).status, 200);
  assert.equal(new URL((await member.callback('code=ok&state=' + member.nonce, member.envelope({ projectId: 'p1' }))).url).searchParams.get('github_connected'), 'true');
  for (const access of ['revoked', 'foreign']) { const f = fixture({ access }); assert.equal((await f.issue('?state=project:p1')).status, 404); denied(f, await f.callback('code=x&state=' + f.nonce, f.envelope({ projectId: 'p1' }))); }
});
test('personal issuer and explicit local development cookie retain matching callback behavior', async () => {
  const f = fixture({ environment: 'development' }); const r = await f.issue(); const [name, cookie, opts] = r.cookies.values[0]; assert.equal(name, 'collab-github-oauth'); assert.equal(opts.secure, false); assert.equal(opts.httpOnly, true);
  const done = await f.callback('code=ok&state=' + r.body.state, cookie); assert.equal(new URL(done.url).pathname, '/projects'); assert.equal(new URL(done.url).searchParams.get('github_connected'), 'true'); assert.ok(done.cookies.values.some(([key, value, options]) => key === name && value === '' && options.path === '/' && options.maxAge === 0));
});

test('encryption failures log only fixed messages and preserve safe failure behavior', async () => {
  const f = fixture(); const cookie = f.envelope(); f.options.encryptError = true;
  assert.throws(() => f.encryption.encrypt('provider-token'), { message: 'Failed to encrypt data' });
  const issued = await f.issue(); assert.equal(issued.status, 500); assert.equal(issued.body.error, 'Failed to generate authorization URL'); assert.deepEqual(issued.cookies.values, []); assert.deepEqual(f.effects, []);
  const done = await f.callback('code=valid&state=' + f.nonce, cookie); cleared(done); assert.equal(new URL(done.url).searchParams.get('github_error'), 'OAuth authentication failed'); assert.equal(new URL(done.url).searchParams.has('github_connected'), false); assert.deepEqual(f.effects, [['exchange', 'valid'], ['profile']]);
  assert.deepEqual(f.logs, [['Encryption error'], ['Encryption error'], ['Encryption error']]);
});
