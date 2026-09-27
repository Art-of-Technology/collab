const { assert, test, load } = require('./helpers.cjs');
const issuer = 'https://identity.example.test/realms/company';
const claims = () => new Headers(Object.fromEntries([
  ['issuer', issuer], ['subject', 'subject-1'], ['email', 'alex@weezboo.com'],
].map(([key, value]) => [`x-collab-${key}`, Buffer.from(value).toString('base64url')]).concat([['x-collab-email-verified', 'true']])));

for (const kind of ['developer', 'admin', 'app-owner', 'oauth-consent']) {
  test(`${kind} API uses mapped sessions, denies missing/revoked identity and preserves legacy behavior`, async () => {
    const env = { env: { COLLAB_AUTH_MODE: 'gateway', COLLAB_GATEWAY_ISSUER: issuer } };
    const identity = load('src/lib/gateway-identity.ts', { 'node:crypto': require('node:crypto') }, { process: env, Buffer, TextDecoder, URL });
    let headers = claims(), live = true, broken = false, legacyCalls = 0, mappedReads = 0;
    const calls = [];
    const user = { id: 'mapped', email: 'alex@weezboo.com', role: 'SYSTEM_ADMIN', accounts: [{ id: 'mapping' }] };
    const legacyUser = { ...user, id: 'legacy', role: 'DEVELOPER' };
    const options = {};
    const nextAuth = { getServerSession: async (...args) => {
      assert.equal(args[0], options); legacyCalls++; return { user: legacyUser };
    } };
    const prisma = {
      account: { findUnique: async () => { mappedReads++; if (broken) throw new Error('unavailable'); return live ? { user } : null; } },
      app: {
        findFirst: async arg => { calls.push(['app-read', arg]); return { oauthClient: { apiKey: 'fixture-key' } }; },
        findUnique: async arg => { calls.push(['app-read', arg]); return { userId: 'mapped', oauthClient: { id: 'client', apiKey: 'fixture-key' } }; },
        count: async arg => { calls.push(['app-count', arg]); return 3; },
      },
      user: { count: async () => { calls.push(['user-count']); return 1; } },
      workspace: { count: async () => { calls.push(['workspace-count']); return 2; } },
      appInstallation: { count: async () => { calls.push(['install-count']); return 4; } },
      appOAuthClient: { update: async arg => { calls.push(['write', arg]); return {}; } },
    };
    const adapter = load('src/lib/request-session.ts', { 'server-only': {}, './gateway-identity': identity,
      'next-auth': nextAuth, 'next/headers': { headers: async () => headers }, '@/lib/prisma': { prisma } }, { process: env });
    const response = { json: (body, init) => ({ status: init?.status ?? 200, body }) };
    const paths = { developer: 'dev/api-key', admin: 'admin/stats', 'app-owner': 'apps/by-id/[id]/mark-api-key-revealed', 'oauth-consent': 'oauth/authorize' };
    const handler = load(`src/app/api/${paths[kind]}/route.ts`, {
      '@/lib/request-session': adapter, 'next-auth': nextAuth, '@/lib/auth-options': { authOptions: options },
      '@/lib/prisma': { prisma }, 'next/server': { NextResponse: response },
      'next/navigation': { redirect() { throw new Error('Unexpected redirect'); } },
      '@/lib/apps/crypto': {}, '@/lib/oauth-scopes': {},
    }, { process: env, URL, console: { error() {} } });
    const invoke = () => kind === 'app-owner'
      ? handler.POST({}, { params: Promise.resolve({ id: 'app' }) })
      : kind === 'oauth-consent'
        ? handler.POST({ url: 'https://collab.example.test/api/oauth/authorize', json: async () => ({ approve: false, redirect_uri: 'https://client.example.test/callback', state: 'state-1' }) })
        : handler.GET();
    const initial = await invoke();
    assert.equal(initial.status, 200); assert.equal(legacyCalls, 0); assert.equal(mappedReads, 1);
    if (kind === 'developer') {
      assert.equal(calls[0][1].where.userId, 'mapped'); assert.equal(initial.body.apiKey, 'fixture-key');
      assert.equal(calls[0][1].orderBy.createdAt, 'desc');
    } else if (kind === 'admin') {
      assert.deepEqual(JSON.parse(JSON.stringify(initial.body)), { totalUsers: 1, totalWorkspaces: 2, totalApps: 3, systemApps: 3, totalInstallations: 4 });
      user.role = 'DEVELOPER'; calls.length = 0;
      assert.equal((await invoke()).status, 403); assert.equal(calls.length, 0); user.role = 'SYSTEM_ADMIN';
    } else if (kind === 'app-owner') {
      assert.equal(initial.body.success, true); assert.equal(calls[1][0], 'write');
      assert.equal(calls[1][1].where.id, 'client'); assert.equal(calls[1][1].data.apiKeyRevealed, true);
      user.id = 'foreign'; calls.length = 0;
      assert.equal((await invoke()).status, 403); assert.equal(calls.length, 1); user.id = 'mapped';
    } else {
      const url = new URL(initial.body.redirect);
      assert.equal(url.origin, 'https://client.example.test'); assert.equal(url.searchParams.get('error'), 'access_denied');
      assert.equal(url.searchParams.get('state'), 'state-1'); assert.equal(calls.length, 0);
    }
    for (const failure of ['missing', 'revoked', 'invalid', 'database']) {
      headers = failure === 'missing' ? new Headers({ cookie: 'legacy=present' }) : claims();
      live = failure !== 'revoked'; broken = failure === 'database';
      env.env.COLLAB_AUTH_MODE = failure === 'invalid' ? 'invalid' : 'gateway'; calls.length = 0;
      assert.equal((await invoke()).status, broken ? 500 : 401, failure);
      assert.equal(calls.length, 0); assert.equal(legacyCalls, 0);
    }
    broken = false; live = true;
    for (const mode of ['nextauth', undefined]) {
      if (mode) env.env.COLLAB_AUTH_MODE = mode; else delete env.env.COLLAB_AUTH_MODE;
      calls.length = 0;
      assert.equal((await invoke()).status, ['admin', 'app-owner'].includes(kind) ? 403 : 200);
      if (kind === 'developer') assert.equal(calls[0][1].where.userId, 'legacy');
      assert.equal(calls.filter(call => call[0] === 'write').length, 0);
    }
    assert.equal(legacyCalls, 2);
  });
}
