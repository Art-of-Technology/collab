const { assert, test, load } = require('./helpers.cjs');

// What a signed-in user may send to media storage: who may upload is in app-status-and-upload-auth.test.cjs.
function fixture() {
  const state = { uploads: [] };
  const prisma = { user: { findUnique: async ({ where }) => ({ id: where.id, role: 'DEVELOPER', createdAt: new Date(), updatedAt: new Date(), emailVerified: null }) }, $queryRaw: async () => [] };
  const deps = {
    'next/server': { NextResponse: Response }, '@/lib/prisma': { prisma }, '@/lib/auth-options': { authOptions: {} },
    '@/lib/request-session': { getServerSession: async () => ({ user: { id: 'alice' } }) }, 'lru-cache': require('lru-cache'),
    '@/utils/cloudinary-server': { cloudinary: { uploader: {
      upload: async (source, options) => { state.uploads.push({ source, options }); return { secure_url: 'https://cdn.test/file', public_id: 'named-by-storage' }; },
      upload_stream: (options, done) => ({ end: () => { state.uploads.push({ options }); done(null, { secure_url: 'https://cdn.test/video', public_id: 'named-by-storage' }); } }),
    } } },
  };
  const globals = { Buffer, console: { error() {}, log() {} }, process: { env: {} }, URL, Headers };
  deps['@/lib/session'] = load('src/lib/session.ts', deps, globals);
  deps['@/lib/rate-limit'] = load('src/lib/rate-limit.ts', deps, globals);
  const route = Object.fromEntries(['image', 'profile-image', 'video'].map(name => [name, load(`src/app/api/upload/${name}/route.ts`, deps, globals)]));
  const post = (name, body, address = '203.0.113.9') => route[name].POST(new Request(`https://collab.test/api/upload/${name}`, {
    method: 'POST', headers: { 'x-forwarded-for': address, ...(typeof body === 'string' && { 'content-type': 'application/json' }) }, body,
  }));
  const json = (name, body, address) => post(name, JSON.stringify(body), address);
  const video = address => {
    const form = new FormData();
    form.set('video', new File([Buffer.from('video')], 'clip.mp4', { type: 'video/mp4' }));
    return post('video', form, address);
  };
  return { state, json, video };
}

test('an uploaded image is named by storage, not by the caller, and must be an image', async () => {
  const f = fixture();
  assert.equal((await f.json('image', { image: 'aGVsbG8=', filename: 'an-existing-asset.png' })).status, 200);
  assert.equal(f.state.uploads.length, 1);
  assert.equal(f.state.uploads[0].options.public_id, undefined);
  assert.equal(f.state.uploads[0].options.resource_type, 'image');
});

test('an image over 10 MB or not sent as text is refused before it reaches storage', async () => {
  const f = fixture();
  const tenMegabytes = 'A'.repeat(Math.ceil(10 * 1024 * 1024 / 3) * 4);
  assert.equal((await f.json('image', { image: tenMegabytes + 'AAAA' })).status, 413);
  assert.equal((await f.json('image', { image: { nested: true } })).status, 400);
  assert.equal((await f.json('image', {})).status, 400);
  assert.deepEqual(f.state.uploads, []);
  assert.equal((await f.json('image', { image: tenMegabytes })).status, 200, 'exactly 10 MB is accepted');
});

test('a profile image is taken only from an https address', async () => {
  const f = fixture();
  const mine = { filename: 'profile_google_alice_1_abc', userId: 'alice' };
  for (const imageUrl of ['http://img.test/a.png', '/var/data/a.png', 'file:///var/data/a.png', 'data:image/png;base64,aGVsbG8=', 'a.png', 42]) {
    assert.equal((await f.json('profile-image', { ...mine, imageUrl })).status, 400, String(imageUrl));
  }
  assert.deepEqual(f.state.uploads, []);
  assert.equal((await f.json('profile-image', { ...mine, imageUrl: 'https://img.test/a.png' })).status, 200);
  assert.equal(f.state.uploads[0].source, 'https://img.test/a.png');
});

test('uploads are limited per client address: 120 images, 10 videos and 10 profile images a minute', async () => {
  const f = fixture();
  const profile = address => f.json('profile-image', { filename: 'profile_google_alice_1_abc', userId: 'alice', imageUrl: 'https://img.test/a.png' }, address);
  for (const [send, limit] of [[address => f.json('image', { image: 'aGVsbG8=' }, address), 120], [f.video, 10], [profile, 10]]) {
    for (let count = 1; count <= limit; count++) assert.equal((await send()).status, 200, `upload ${count} of ${limit}`);
    const refused = await send();
    assert.equal(refused.status, 429);
    assert.ok(Number(refused.headers.get('Retry-After')) > 0);
    assert.equal((await send('198.51.100.7')).status, 200, 'another address has its own count');
  }
  assert.equal(f.state.uploads.length, 120 + 10 + 10 + 3, 'a refused upload does not reach storage');

  // Requests that upload nothing do not use up the count.
  const g = fixture();
  for (let count = 0; count < 15; count++) assert.equal((await g.json('profile-image', { filename: 'x', userId: 'alice', imageUrl: 'https://img.test/a.png' }, '192.0.2.1')).status, 403);
  assert.equal((await g.json('profile-image', { filename: 'profile_google_alice_1_abc', userId: 'alice', imageUrl: 'https://img.test/a.png' }, '192.0.2.1')).status, 200);
});

test('pending and failed uploads do not consume or restore a rate-limit window', async () => {
  let now = 100000;
  class Clock extends Date { static now() { return now; } }
  const { createRateLimiter } = load('src/lib/rate-limit.ts', {
    'next/server': { NextResponse: Response }, 'lru-cache': require('lru-cache'),
  }, { URL, Headers, Date: Clock });
  const limit = createRateLimiter({ maxRequests: 2, windowMs: 1000, skipFailedRequests: true });
  const request = new Request('https://collab.test/api/upload/image');
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const first = limit(request, () => pending);
  const second = limit(request, () => pending);
  assert.equal((await limit(request, async () => new Response(null, { status: 400 }))).status, 400);
  now += 1001;
  assert.equal((await limit(request, async () => new Response())).status, 200);
  finish(new Response(null, { status: 400 }));
  assert.equal((await first).status, 400);
  assert.equal((await second).status, 400);
  assert.equal((await limit(request, async () => new Response())).status, 200);
  assert.equal((await limit(request, async () => new Response())).status, 429);
});
