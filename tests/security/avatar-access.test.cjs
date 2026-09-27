const { assert, test, load, matches } = require('./helpers.cjs');

function fixture(entry) {
  const date = new Date('2026-09-27T00:00:00Z');
  const state = { session: true, live: true, mapping: true, fail: false, stale: false, legacy: 0, reads: [], writes: [], logs: [] };
  const actor = { id: 'actor', email: 'actor@weezboo.com', name: 'Actor', image: null,
    role: 'DEVELOPER', team: null, currentFocus: null, expertise: [], slackId: null,
    githubId: null, githubUsername: null, createdAt: date, updatedAt: date, emailVerified: date,
    avatarSkinTone: 1, avatarEyes: 2, avatarBrows: 3, avatarMouth: 4, avatarNose: 5,
    avatarHair: 6, avatarEyewear: 1, avatarAccessory: 1, useCustomAvatar: true,
    hashedPassword: 'synthetic-password', githubAccessToken: 'synthetic-token' };
  const replacement = { ...actor, id: 'replacement', email: 'old@weezboo.com' };
  const pick = (row, select) => !row ? null : !select ? { ...row } : Object.fromEntries(Object.entries(select).filter(([,v]) => v === true).map(([key]) => [key, row[key]]));
  const prisma = {
    account: { findUnique: async () => {
      if (state.fail) throw new Error('synthetic-secret-db-error');
      return state.mapping && state.live ? { user: { ...actor, accounts: [{ id: 'mapping' }] } } : null;
    } },
    user: {
      findUnique: async args => { state.reads.push(args); if (state.fail) throw new Error('synthetic-secret-db-error');
        return pick((state.live ? [actor, replacement] : []).find(row => matches(row, args.where)), args.select); },
      update: async args => {
        if (state.fail) throw new Error('synthetic-secret-db-error');
        const row = [actor, replacement].find(row => matches(row, args.where)); assert.ok(row);
        state.writes.push(args); Object.assign(row, args.data); return pick(row, args.select);
      },
    },
  };
  const env = { env: { COLLAB_AUTH_MODE: 'nextauth', COLLAB_GATEWAY_ISSUER: 'https://identity.example.test' } };
  const options = {};
  const nextAuth = { getServerSession: async actual => { assert.equal(actual, options); state.legacy++;
    return state.session ? { user: { id: 'actor', email: state.stale ? 'old@weezboo.com' : actor.email } } : null; } };
  const identity = load('src/lib/gateway-identity.ts', { 'node:crypto': require('node:crypto') }, { process: env, Buffer, TextDecoder, URL });
  const adapter = load('src/lib/request-session.ts', { 'server-only': {}, './gateway-identity': identity, 'next-auth': nextAuth,
    'next/headers': { headers: () => new Headers({
      'x-collab-issuer': Buffer.from(env.env.COLLAB_GATEWAY_ISSUER).toString('base64url'),
      'x-collab-subject': Buffer.from('avatar-actor').toString('base64url'),
      'x-collab-email': Buffer.from(actor.email).toString('base64url'), 'x-collab-email-verified': 'true', cookie: 'legacy=present',
    }) }, '@/lib/prisma': { prisma },
  }, { process: env });
  const deps = { '@/lib/prisma': { prisma }, '@/lib/request-session': adapter, 'next-auth': nextAuth,
    '@/lib/auth-options': { authOptions: options }, 'next/server': { NextResponse: Response },
    '@/lib/post-access': load('src/lib/post-access.ts'), '@/lib/user-utils': load('src/lib/user-utils.ts'),
    '@/lib/issue-finder': {},
    get '@/lib/avatar-settings'() { return load('src/lib/avatar-settings.ts', { zod: require('zod'), '@/lib/user-utils': load('src/lib/user-utils.ts') }); },
  };
  const module = load(entry === 'route' ? 'src/app/api/user/avatar/route.ts' : 'src/actions/user.ts', deps,
    { console: { error: (...args) => state.logs.push(args.map(String)) } });
  const invoke = body => entry === 'route' ? module.PATCH(new Request('https://example.test/api/user/avatar', { method: 'PATCH', body: JSON.stringify(body) })) : module.updateUserAvatar(body);
  return { state, env, actor, replacement, invoke };
}

for (const entry of ['route', 'action']) {
  test(`${entry}: legacy control retains nullable, zero and false partial updates`, async () => {
    const f = fixture(entry); const result = await f.invoke({ avatarAccessory: 0, avatarEyes: null, useCustomAvatar: false });
    const user = entry === 'route' ? (await result.json()).user : result;
    assert.equal(user.id, 'actor'); assert.equal(user.avatarAccessory, 0); assert.equal(user.avatarEyes, null);
    assert.equal(user.useCustomAvatar, false); assert.equal(user.avatarHair, 6);
  });
  test(`${entry}: actor ID wins over stale email and response excludes credentials`, async () => {
    const f = fixture(entry); f.state.stale = true;
    const result = await f.invoke({ avatarHair: 7, id: 'replacement', githubAccessToken: 'attacker-value' });
    const user = entry === 'route' ? (await result.json()).user : result;
    assert.equal(user.id, 'actor'); assert.equal(f.state.writes[0].where.id, 'actor'); assert.equal(f.replacement.avatarHair, 6);
    assert.equal('hashedPassword' in user, false); assert.equal('githubAccessToken' in user, false);
    assert.deepEqual(Object.keys(f.state.writes[0].data), ['avatarHair']);
    if (entry === 'route') assert.equal(user.createdAt, '2026-09-27T00:00:00.000Z');
  });
  test(`${entry}: malformed fields cannot become Prisma operators or mutations`, async () => {
    for (const body of [null, [], 'invalid', { avatarHair: { increment: 1 } }, { avatarEyes: 0.5 },
      { avatarNose: -1 }, { avatarBrows: 2147483648 }, { avatarMouth: '2' }, { useCustomAvatar: null }, { useCustomAvatar: 'false' }]) {
      const f = fixture(entry);
      if (entry === 'route') assert.equal((await f.invoke(body)).status, 400);
      else await assert.rejects(() => f.invoke(body), /Invalid avatar settings/);
      assert.deepEqual(f.state.writes, []);
    }
  });
  test(`${entry}: gateway identity never falls back and missing subjects do not write`, async () => {
    const f = fixture(entry); f.env.env.COLLAB_AUTH_MODE = 'gateway';
    const result = await f.invoke({ avatarHair: 2 });
    const user = entry === 'route' ? (await result.json()).user : result;
    assert.equal(user.id, 'actor'); assert.equal(f.state.legacy, 0);
    f.state.mapping = false; f.state.writes.length = 0;
    if (entry === 'route') assert.equal((await f.invoke({})).status, 401);
    else await assert.rejects(() => f.invoke({}), /Unauthorized/);
    assert.equal(f.state.legacy, 0); assert.deepEqual(f.state.writes, []);
    const deleted = fixture(entry); deleted.state.live = false;
    if (entry === 'route') assert.equal((await deleted.invoke({})).status, 404);
    else await assert.rejects(() => deleted.invoke({}), /User not found/);
    assert.deepEqual(deleted.state.writes, []);
  });
}

test('route errors do not log or return database exception content', async () => {
  const f = fixture('route'); f.state.fail = true;
  const result = await f.invoke({ avatarHair: 2 });
  assert.equal(result.status, 500); assert.equal(await result.text(), 'Internal error');
  assert.doesNotMatch(JSON.stringify(f.state.logs), /synthetic-secret-db-error/); assert.deepEqual(f.state.writes, []);
});
