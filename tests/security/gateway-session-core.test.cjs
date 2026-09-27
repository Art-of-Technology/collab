const { assert, test, load } = require('./helpers.cjs');
const identity = load('src/lib/gateway-identity.ts', { 'node:crypto': require('node:crypto') }, { process, Buffer, TextDecoder, URL });
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
  for (const name of ['x-collab-issuer', 'x-collab-subject', 'x-collab-email', 'x-collab-email-verified']) {
    const missing = valid(); missing.delete(name);
    assert.equal(identity.readGatewayIdentity(missing, issuer), null);
    const duplicate = valid(); duplicate.append(name, duplicate.get(name));
    assert.equal(identity.readGatewayIdentity(duplicate, issuer), null);
  }
  const otherSubject = valid(); otherSubject.set('x-collab-subject', encoded('subject-2'));
  assert.notEqual(identity.readGatewayIdentity(otherSubject, issuer).accountKey, accepted.accountKey);
  const otherIssuer = valid(); otherIssuer.set('x-collab-issuer', encoded(issuer + '/other'));
  assert.notEqual(identity.readGatewayIdentity(otherIssuer, issuer + '/other').accountKey, accepted.accountKey);
  const tuple = (issuerValue, subjectValue) => {
    const headers = valid(); headers.set('x-collab-issuer', encoded(issuerValue)); headers.set('x-collab-subject', encoded(subjectValue));
    return identity.readGatewayIdentity(headers, issuerValue).accountKey;
  };
  assert.notEqual(tuple('ab', 'c'), tuple('a', 'bc'));
  assert.equal(identity.readGatewayIdentity(valid(), ''), null);
  const aliases = new Headers({ 'x_collab_subject': encoded('subject-1'), 'remote-user': 'alex@weezboo.com' });
  assert.equal(identity.readGatewayIdentity(aliases, issuer), null);
});

test('gateway preserves a leading BOM in subjects and their account keys', () => {
  const headers = valid(); headers.set('x-collab-subject', encoded('\uFEFFsubject-1'));
  const accepted = identity.readGatewayIdentity(headers, issuer);
  assert.notEqual(accepted.accountKey, identity.readGatewayIdentity(valid(), issuer).accountKey);
  assert.equal(accepted.subject, '\uFEFFsubject-1');
  assert.equal(accepted.accountKey, require('node:crypto').createHash('sha256').update(issuer + '\0\uFEFFsubject-1').digest('hex'));
});

test('gateway rejects a BOM-prefixed issuer that differs from the configured issuer', () => {
  const headers = valid(); headers.set('x-collab-issuer', encoded('\uFEFF' + issuer));
  assert.equal(identity.readGatewayIdentity(headers, issuer), null);
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
  for (const configured of ['', 'http://collab.example.test', origin + '/', origin + '/path', 'https://user:pass@collab.example.test'])
    assert.equal(identity.gatewayMutationAllowed('POST', new Headers({ origin: configured }), configured), false);
  assert.equal(identity.gatewayMutationAllowed('GET', new Headers(), origin), true);
});

test('request sessions use explicit issuer-subject account mapping and never fall back to NextAuth in gateway mode', async () => {
  const before = { mode: process.env.COLLAB_AUTH_MODE, issuer: process.env.COLLAB_GATEWAY_ISSUER };
  let header = valid(), legacy = 0, reads = 0, databaseError = false;
  let legacyArgs;
  let user = { id: 'mapped-user', email: 'alex@weezboo.com', name: 'Alex', image: null, role: 'DEVELOPER', team: null, currentFocus: null, expertise: [], accounts: [{ id: 'mapping' }] };
  try {
    process.env.COLLAB_AUTH_MODE = 'gateway'; process.env.COLLAB_GATEWAY_ISSUER = issuer;
    const session = load('src/lib/request-session.ts', { 'server-only': {}, './gateway-identity': identity,
      'next-auth': { getServerSession: async (...args) => { legacyArgs = args; legacy++; return { user: { id: 'legacy' } }; } },
      'next/headers': { headers: async () => header }, '@/lib/prisma': { prisma: { account: { findUnique: async ({ where }) => {
        reads++; assert.deepEqual(JSON.parse(JSON.stringify(where)), { provider_providerAccountId: { provider: 'maestro', providerAccountId: identity.readGatewayIdentity(valid(), issuer).accountKey } });
        if (databaseError) throw new Error('Database unavailable');
        return user ? { user } : null;
      } } } },
    }, { process });
    assert.equal((await session.getServerSession({})).user.id, 'mapped-user');
    header = new Headers({ authorization: 'Bearer ignored', cookie: 'legacy=ignored' });
    assert.equal(await session.getServerSession({}), null); assert.equal(reads, 1); assert.equal(legacy, 0);
    header = valid(); const saved = user; user = null;
    assert.equal(await session.getServerSession({}), null);
    user = { ...saved, accounts: [{ id: 'one' }, { id: 'two' }] }; assert.equal(await session.getServerSession({}), null);
    user = { ...saved, email: 'another@weezboo.com' }; assert.equal(await session.getServerSession({}), null);
    databaseError = true;
    await assert.rejects(session.getServerSession({}), /Database unavailable/);
    assert.equal(legacy, 0); databaseError = false;
    process.env.COLLAB_AUTH_MODE = 'invalid'; assert.equal(await session.getServerSession({}), null); assert.equal(legacy, 0);
    process.env.COLLAB_AUTH_MODE = 'nextauth'; assert.equal((await session.getServerSession({})).user.id, 'legacy'); assert.equal(legacy, 1);
    delete process.env.COLLAB_AUTH_MODE;
    const options = { example: true };
    assert.equal((await session.getServerSession(options)).user.id, 'legacy');
    assert.equal(legacy, 2); assert.equal(legacyArgs[0], options);
  } finally {
    for (const [name, value] of [['COLLAB_AUTH_MODE', before.mode], ['COLLAB_GATEWAY_ISSUER', before.issuer]])
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
});

for (const entry of ['getAuthSession', 'getCurrentUser']) {
  test(`${entry} uses the shared adapter without legacy fallback and preserves legacy results`, async () => {
    const previous = { mode: process.env.COLLAB_AUTH_MODE, issuer: process.env.COLLAB_GATEWAY_ISSUER };
    const date = new Date('2026-09-24T00:00:00Z');
    const mapped = { id: 'mapped-user', email: 'alex@weezboo.com', role: 'DEVELOPER',
      accounts: [{ id: 'mapping' }], createdAt: date, updatedAt: date, emailVerified: null };
    const legacyUser = { ...mapped, id: 'legacy-user' };
    let header = valid(), legacyCalls = 0, userReads = 0, mappedLive = true, dbFailure = false;
    const legacy = { user: legacyUser, expires: 'legacy-expiry' };
    const nextAuth = { getServerSession: async () => { legacyCalls++; return legacy; } };
    const prisma = { account: { findUnique: async () => {
      if (dbFailure) throw new Error('database unavailable');
      return mappedLive ? { user: mapped } : null;
    } }, user: { findUnique: async ({ where }) => {
      userReads++; assert.equal(Object.keys(where).join(','), 'id');
      return [mapped, legacyUser].find(user => user.id === where.id) ?? null;
    } } };
    try {
      process.env.COLLAB_AUTH_MODE = 'gateway'; process.env.COLLAB_GATEWAY_ISSUER = issuer;
      const shared = load('src/lib/request-session.ts', { 'server-only': {}, './gateway-identity': identity,
        'next-auth': nextAuth, 'next/headers': { headers: async () => header }, '@/lib/prisma': { prisma } }, { process });
      const deps = { '@/lib/request-session': shared, 'next-auth': nextAuth, 'next-auth/next': nextAuth,
        '@/lib/prisma': { prisma }, './prisma': { prisma }, '@/lib/auth-options': { authOptions: {} },
        bcrypt: { compare: async () => false },
        'next-auth/providers/credentials': { default: () => ({}) },
        'next-auth/providers/github': { default: () => ({}) },
        './custom-prisma-adapter': { CustomPrismaAdapter: () => ({}) } };
      const fn = load(entry === 'getAuthSession' ? 'src/lib/auth.ts' : 'src/lib/session.ts', deps,
        { process, console: { error() {} } })[entry];
      const current = await fn();
      assert.equal(entry === 'getAuthSession' ? current.user.id : current.id, mapped.id);
      if (entry === 'getAuthSession') assert.equal(current.authMode, 'gateway');
      else { assert.equal(current.createdAt, date.toISOString()); assert.equal(current.emailVerified, null); }
      assert.equal(legacyCalls, 0);
      header = new Headers({ cookie: 'legacy=still-present' });
      const priorReads = userReads;
      assert.equal(await fn(), null); assert.equal(userReads, priorReads); assert.equal(legacyCalls, 0);
      header = valid(); mappedLive = false;
      assert.equal(await fn(), null); assert.equal(legacyCalls, 0);
      mappedLive = true; dbFailure = true;
      if (entry === 'getAuthSession') await assert.rejects(fn(), /database unavailable/);
      else assert.equal(await fn(), null);
      assert.equal(legacyCalls, 0); dbFailure = false;
      process.env.COLLAB_AUTH_MODE = 'invalid';
      assert.equal(await fn(), null); assert.equal(legacyCalls, 0);
      for (const mode of ['nextauth', undefined]) {
        if (mode) process.env.COLLAB_AUTH_MODE = mode; else delete process.env.COLLAB_AUTH_MODE;
        const result = await fn();
        if (entry === 'getAuthSession') assert.equal(result, legacy);
        else { assert.equal(result.id, legacyUser.id); assert.equal(result.updatedAt, date.toISOString()); }
      }
      assert.equal(legacyCalls, 2);
    } finally {
      for (const [name, value] of [['COLLAB_AUTH_MODE', previous.mode], ['COLLAB_GATEWAY_ISSUER', previous.issuer]])
        if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  });
}
