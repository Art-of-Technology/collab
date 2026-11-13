const { assert, test, load, matches } = require('./helpers.cjs');

// Routes that used to do their work for any caller: each must refuse before it reads or writes anything.
function fixture() {
  const users = [
    { id: 'alice', role: 'DEVELOPER' }, { id: 'bob', role: 'DEVELOPER' }, { id: 'root', role: 'SYSTEM_ADMIN' },
  ].map(user => ({ ...user, createdAt: new Date(), updatedAt: new Date(), emailVerified: null }));
  const version = { id: 'v1', manifest: {} };
  const apps = [
    // Approved already: this file is about who may call the route; tests/security/app-publish-approval.test.cjs covers approval.
    { id: 'mine', slug: 'mine', name: 'Mine', userId: 'alice', status: 'DRAFT', approvedVersionId: 'v1', versions: [version], oauthClient: null, updatedAt: new Date(0) },
    { id: 'system', slug: 'collab-agent', name: 'Agent tokens', userId: null, publisherId: 'system', isSystemApp: true, status: 'PUBLISHED', versions: [version], oauthClient: null, updatedAt: new Date(0) },
  ];
  const state = { session: null, uploads: [], appReads: 0 };
  const find = async ({ where }) => { state.appReads += 1; return apps.find(row => matches(row, where)) ?? null; };
  const prisma = {
    user: { findUnique: async ({ where }) => users.find(row => row.id === where.id) ?? null },
    $queryRaw: async () => [],
    app: { findUnique: find, findFirst: find, updateMany: async ({ where, data }) => {
      const app = apps.find(row => matches(row, where));
      if (!app) return { count: 0 };
      Object.assign(app, data);
      return { count: 1 };
    } },
    $transaction: async run => run(prisma),
  };
  const json = (body, init = {}) => ({ body, status: init.status ?? 200 });
  const deps = {
    zod: require('zod'), 'next/server': { NextResponse: { json } },
    '@/lib/prisma': { prisma }, '@/lib/auth-options': { authOptions: {} },
    '@/lib/request-session': { getServerSession: async () => state.session },
    '@/lib/apps/ownership': load('src/lib/apps/ownership.ts'),
    '@/utils/cloudinary-server': { cloudinary: { uploader: {
      upload: async (source, options) => { state.uploads.push(options?.public_id ?? source); return { secure_url: 'https://cdn.test/file', public_id: 'file' }; },
      upload_stream: () => { state.uploads.push('stream'); throw new Error('unexpected stream'); },
    } } },
  };
  const globals = { Buffer, console: { error() {}, log() {} }, process: { env: { NEXTAUTH_URL: 'https://collab.test', GITHUB_CLIENT_ID: 'configured' } }, Date };
  deps['@/lib/session'] = load('src/lib/session.ts', deps, globals);
  deps['@/lib/system-admin'] = load('src/lib/system-admin.ts', deps, globals);
  const route = file => load(`src/app/api/${file}/route.ts`, deps, globals);
  const publish = route('apps/by-id/[id]/publish'), image = route('upload/image'), profile = route('upload/profile-image'),
    video = route('upload/video'), debug = route('github/oauth/debug');
  // A session can claim any role; the routes must go by the account in the database.
  const as = (id, role = 'DEVELOPER') => { state.session = id ? { user: { id, role } } : null; };
  const request = body => ({ json: async () => body, formData: async () => { throw new Error('the body was read'); } });
  const setStatus = (id, status) => publish.PATCH(request({ status }), { params: Promise.resolve({ id }) });
  const status = id => apps.find(row => row.id === id).status;
  return { state, as, request, setStatus, status, image, profile, video, debug };
}

test('an app status is changed only by its owner or a system admin', async () => {
  const f = fixture();
  for (const [user, role, why] of [[null, null, 'no session'], ['bob', 'DEVELOPER', 'another developer'], ['bob', 'SYSTEM_ADMIN', 'a session that claims a role the account does not have']]) {
    f.as(user, role);
    for (const [id, target] of [['system', 'SUSPENDED'], ['system', 'DRAFT'], ['mine', 'PUBLISHED']]) {
      const refused = await f.setStatus(id, target);
      assert.equal(refused.status, user ? 404 : 401, `${why}: ${id} to ${target}`);
    }
  }
  assert.equal(f.status('system'), 'PUBLISHED');
  assert.equal(f.status('mine'), 'DRAFT');
  assert.equal((await f.setStatus('mine', 'NONSENSE')).status, 404, 'an invalid request for someone else\'s app is still not found');

  f.as(null);
  const reads = f.state.appReads;
  await f.setStatus('mine', 'PUBLISHED');
  assert.equal(f.state.appReads, reads, 'without a session no app is looked up');

  f.as('alice');
  assert.equal((await f.setStatus('mine', 'PUBLISHED')).status, 200);
  assert.equal(f.status('mine'), 'PUBLISHED');
  assert.equal((await f.setStatus('system', 'SUSPENDED')).status, 404, 'an owner of one app cannot touch a system app');

  f.as('root', 'SYSTEM_ADMIN');
  assert.equal((await f.setStatus('system', 'SUSPENDED')).status, 200);
  assert.equal(f.status('system'), 'SUSPENDED');
  assert.equal((await f.setStatus('mine', 'DRAFT')).status, 200);
});

test('uploads need a signed-in user and nothing is sent to storage without one', async () => {
  const f = fixture();
  f.as(null);
  assert.equal((await f.image.POST(f.request({ image: 'aGVsbG8=', filename: 'a.png' }))).status, 401);
  assert.equal((await f.profile.POST(f.request({ imageUrl: 'https://img.test/a.png', filename: 'profile_x_alice_1_a', userId: 'alice' }))).status, 401);
  assert.equal((await f.video.POST(f.request({}))).status, 401, 'refused before the upload is even read');
  assert.deepEqual(f.state.uploads, []);

  f.as('alice');
  assert.equal((await f.image.POST(f.request({ image: 'aGVsbG8=', filename: 'a.png' }))).status, 200);
  assert.deepEqual(f.state.uploads, ['a']);
});

test('a profile image is written only under the signed-in user\'s own name', async () => {
  const f = fixture();
  f.as('bob');
  const mine = { imageUrl: 'https://img.test/a.png', filename: 'profile_google_bob_1_abc', userId: 'bob' };
  for (const [body, why] of [
    [{ ...mine, userId: 'alice' }, 'another user id'],
    [{ ...mine, filename: 'profile_google_alice_1_abc' }, 'another user\'s file name'],
    [{ ...mine, filename: 'profile_google_alice_bob_1_abc' }, 'user id embedded in another user\'s file name'],
    [{ ...mine, filename: 'profile_google_bob_1_abc_extra' }, 'extra filename segments'],
    [{ ...mine, filename: undefined }, 'missing file name'],
    [{ ...mine, userId: undefined }, 'missing user id'],
    [{ ...mine, filename: 123 }, 'non-string file name'],
    [{ ...mine, filename: 'bob' }, 'a file name that is not a profile image of this user'],
  ]) {
    assert.equal((await f.profile.POST(f.request(body))).status, 403, why);
  }
  assert.deepEqual(f.state.uploads, []);
  assert.equal((await f.profile.POST(f.request({ ...mine, imageUrl: undefined }))).status, 400);
  assert.equal((await f.profile.POST(f.request(mine))).status, 200);
  assert.deepEqual(f.state.uploads, ['profile_google_bob_1_abc']);
});

test('the GitHub sign-in debug route answers a system admin only', async () => {
  const f = fixture();
  for (const [user, role] of [[null, null], ['alice', 'DEVELOPER'], ['bob', 'SYSTEM_ADMIN']]) {
    f.as(user, role);
    const refused = await f.debug.GET({});
    assert.equal(refused.status, 404, String(user));
    assert.doesNotMatch(JSON.stringify(refused.body), /collab\.test|configured|Set|Missing/);
  }
  f.as('root', 'SYSTEM_ADMIN');
  const answer = await f.debug.GET({});
  assert.equal(answer.status, 200);
  assert.equal(answer.body.environment.GITHUB_CLIENT_ID, 'Set');
});
