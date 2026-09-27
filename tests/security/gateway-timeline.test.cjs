const { assert, test, load, matches } = require('./helpers.cjs');
const issuer = 'https://identity.example.test/realms/company';
const claims = () => new Headers(Object.fromEntries([
  ['issuer', issuer], ['subject', 'timeline-user'], ['email', 'mapped@weezboo.com'],
].map(([key, value]) => [`x-collab-${key}`, Buffer.from(value).toString('base64url')])
  .concat([['x-collab-email-verified', 'true'], ['cookie', 'legacy=present']])));
const cases = [['posts', 'POST'], ['unified', 'GET']];

function fixture([path, method]) {
  const env = { env: { COLLAB_AUTH_MODE: 'gateway', COLLAB_GATEWAY_ISSUER: issuer } };
  const state = { headers: claims(), live: true, broken: false, owner: 'mapped', members: [],
    legacyCalls: 0, mappingReads: 0, effects: [] };
  const options = { fixtureOptions: true };
  const nextAuth = { getServerSession: async (...args) => {
    assert.equal(args.length, 1); assert.equal(args[0], options); state.legacyCalls++;
    return { user: { id: 'legacy' }, expires: 'legacy-expiry' };
  } };
  const record = (name, args) => state.effects.push([name, args]);
  const prisma = {
    account: { findUnique: async () => {
      state.mappingReads++; if (state.broken) throw new Error('Synthetic mapping failure');
      return state.live ? { user: { id: 'mapped', email: 'mapped@weezboo.com', accounts: [{ id: 'mapping' }] } } : null;
    } },
    workspace: { findFirst: async args => {
      record('workspace-read', args); const row = { id: 'workspace', ownerId: state.owner, members: state.members };
      return matches(row, args.where) ? row : null;
    } },
    post: {
      create: async args => { record('create', args); return { id: 'post', ...args.data }; },
      findMany: async args => { record('posts-read', args); return [{ id: 'post', message: 'Fixture',
        createdAt: new Date('2026-01-01T02:00:00Z'), author: { id: args.where.authorId }, _count: { comments: 2, reactions: 1 } }]; },
    },
    issueActivity: {
      findMany: async args => { record('activities-read', args); return [{ id: 'activity', itemId: 'issue', action: 'CREATED',
        newValue: '{"fixture":true}', createdAt: new Date('2026-01-01T01:00:00Z'), user: { id: args.where.userId } }]; },
      count: async args => { record('count', args); return 1; },
    },
    issue: { findMany: async args => { record('issues-read', args); return [{ id: 'issue', title: 'Fixture', issueKey: 'FIX-1', type: 'TASK' }]; } },
  };
  const identity = load('src/lib/gateway-identity.ts', { 'node:crypto': require('node:crypto') }, { process: env, Buffer, TextDecoder, URL });
  const adapter = load('src/lib/request-session.ts', { 'server-only': {}, './gateway-identity': identity,
    'next-auth': nextAuth, 'next/headers': { headers: async () => state.headers }, '@/lib/prisma': { prisma } }, { process: env });
  const route = load(`src/app/api/timeline/${path}/route.ts`, {
    '@/lib/request-session': adapter, 'next-auth': nextAuth, 'next-auth/next': nextAuth,
    '@/lib/auth': { authOptions: options, authConfig: options },
    'next/server': { NextResponse: Response }, '@/lib/prisma': { prisma },
    '@/lib/post-access': load('src/lib/post-access.ts'),
    '@/utils/mentions': load('src/utils/mentions.ts'), '@/lib/html-sanitizer': load('src/lib/html-sanitizer.ts'),
    '@/lib/notification-service': { NotificationService: {
      notifyUsers: async (...args) => record('notify', args), autoFollowPost: async (...args) => record('follow', args),
    } },
  }, { URL, console: { error() {} } });
  const invoke = actor => route[method](new Request('https://example.test/api/timeline?workspaceId=workspace&mine=true', {
    method, headers: { cookie: 'legacy=present' }, ...(method === 'POST' ? { body: JSON.stringify({ workspaceId: 'workspace',
      content: `<b>Hi</b> @[Me](${actor || 'mapped'}) @[Other](other)` }) } : {}),
  }));
  const effect = name => state.effects.find(([key]) => key === name)?.[1];
  async function success(actor, member = false) {
    state.owner = member ? 'foreign' : actor; state.members = member ? [{ userId: actor, status: true }] : [];
    state.effects.length = 0; const response = await invoke(actor); assert.equal(response.status, 200);
    const result = await response.json();
    if (method === 'POST') {
      assert.equal(result.authorId, actor); assert.equal(effect('create').data.authorId, actor);
      assert.equal(effect('notify')[3], actor); assert.deepEqual(Array.from(effect('notify')[0]), ['other']);
      assert.match(effect('notify')[2], /Hi @Me @Other/); assert.equal(effect('follow')[0], 'post');
    } else {
      assert.equal(effect('activities-read').where.userId, actor); assert.equal(effect('posts-read').where.authorId, actor);
      assert.deepEqual(result.timeline.map(item => item.id), ['post', 'activity']);
      assert.equal(result.timeline[1].issue.id, 'issue'); assert.equal(result.timeline[1].newValue.fixture, true);
      assert.equal(result.nextCursor, '2026-01-01T01:00:00.000Z'); assert.equal(result.hasMore, false);
      assert.deepEqual(result.stats, { todayCount: 1, weekCount: 1 });
    }
  }
  return { state, env, invoke, success };
}

test('legacy timeline post is a legitimate control', async () => {
  const f = fixture(cases[0]); f.env.env.COLLAB_AUTH_MODE = 'nextauth';
  await f.success('legacy'); assert.equal(f.state.legacyCalls, 1); assert.equal(f.state.mappingReads, 0);
});

for (const spec of cases) test(`timeline ${spec.join(' ')} binds actor and preserves exception contract`, async () => {
  const f = fixture(spec); await f.success('mapped'); await f.success('mapped', true);
  assert.equal(f.state.mappingReads, 2); assert.equal(f.state.legacyCalls, 0);
  for (const members of [[], [{ userId: 'mapped', status: false }]]) {
    f.state.owner = 'foreign'; f.state.members = members; f.state.effects.length = 0;
    assert.equal((await f.invoke()).status, 403); assert.deepEqual(f.state.effects.map(([name]) => name), ['workspace-read']);
  }
  for (const failure of ['missing', 'revoked', 'invalid', 'database']) {
    f.state.headers = failure === 'missing' ? new Headers({ cookie: 'legacy=present' }) : claims();
    f.state.live = failure !== 'revoked'; f.state.broken = failure === 'database';
    f.env.env.COLLAB_AUTH_MODE = failure === 'invalid' ? 'invalid' : 'gateway'; f.state.effects.length = 0;
    if (failure === 'database' && spec[1] === 'POST') await assert.rejects(f.invoke(), /Synthetic mapping failure/);
    else assert.equal((await f.invoke()).status, failure === 'database' ? 500 : 401, failure);
    assert.deepEqual(f.state.effects, []); assert.equal(f.state.legacyCalls, 0);
  }
  f.state.broken = false; f.state.live = true; const reads = f.state.mappingReads;
  for (const mode of ['nextauth', undefined]) {
    if (mode) f.env.env.COLLAB_AUTH_MODE = mode; else delete f.env.env.COLLAB_AUTH_MODE;
    await f.success('legacy');
  }
  assert.equal(f.state.legacyCalls, 2); assert.equal(f.state.mappingReads, reads);
});
