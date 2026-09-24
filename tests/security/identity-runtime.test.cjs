const { assert, test, load, prisma, userHasWorkspaceAccess } = require('./helpers.cjs');


test('legacy Slack commands are unavailable and never read or create tasks', async () => {
  for (const command of ['my-tasks', 'create-issue']) {
    const route = load(`src/app/api/slack/${command}/route.ts`, {
      'next/server': { NextResponse: { json: (body, init) => ({ body, status: init.status }) } },
    });
    const response = await route.POST(new Request('https://example.test/slack', {
      method: 'POST', body: 'user_id=U123&text=workspace:foreign',
    }));
    assert.equal(response.status, 503);
    assert.equal(response.body.response_type, 'ephemeral');
    assert.match(response.body.text, /unavailable/);
  }
});

test('Prisma excludes credentials from default and nested reads; explicit auth selection still works', async () => {
  const { prisma: client } = load('src/lib/prisma.ts', {
    '@prisma/client': require('@prisma/client'),
  }, { global: {}, process: { env: { NODE_ENV: 'test' } } });
  const queries = [];
  // Capture the real client's emitted engine protocol; no database is contacted.
  client._requestHandler.request = async request => {
    queries.push(request.protocolQuery.query.selection);
    return null;
  };
  try {
    await client.user.findUnique({ where: { id: 'alice' } });
    await client.workspace.findUnique({ where: { id: 'own' }, include: { members: { include: { user: true } } } });
    await client.user.findUnique({ where: { id: 'alice' }, omit: { hashedPassword: false } });
    await client.user.findUnique({ where: { id: 'alice' }, select: { githubAccessToken: true } });
    for (const selection of [queries[0], queries[1].members.selection.user.selection]) {
      assert.equal(selection.hashedPassword, false);
      assert.equal(selection.githubAccessToken, false);
    }
    assert.notEqual(queries[2].hashedPassword, false);
    assert.equal(queries[2].githubAccessToken, false);
    assert.equal(queries[3].githubAccessToken, true);
  } finally {
    await client.$disconnect();
  }
});

test('shared role checks reject inactive memberships', async () => {
  for (const active of [false, true]) {
    const db = {
      user: { findUnique: async ({ include }) => ({
        role: 'DEVELOPER', ownedWorkspaces: [],
        workspaceMemberships: include.workspaceMemberships.where.status === true && !active ? [] : [{ role: 'MEMBER' }],
      }) },
      rolePermission: { findUnique: async () => ({}), findMany: async () => [{ permission: 'CREATE_TASK' }] },
    };
    const permissions = load('src/lib/permissions.ts', { './prisma': { prisma: db } });
    assert.equal((await permissions.checkUserPermission('alice', 'joined', 'CREATE_TASK')).hasPermission, active);
    assert.equal((await permissions.getUserPermissions('alice', 'joined')).length, active ? 1 : 0);
    assert.equal(await permissions.getUserWorkspaceRole('alice', 'joined'), active ? 'MEMBER' : null);
  }
});

test('auth image migration uploads only HTTPS Google hosts across all callbacks', async () => {
  const uploads = [];
  const updates = [];
  let uploadFails = false;
  let userExists = true;
  const uploadedUrl = 'https://res.cloudinary.com/example/profile.png';
  const globals = { process: { env: {} }, URL, console: { log() {}, error() {} } };
  const imageHandler = load('src/utils/cloudinary-server.ts', {
    'server-only': {},
    cloudinary: { v2: { config() {}, uploader: { async upload(url) {
      uploads.push(url);
      if (uploadFails) throw new Error('Upload unavailable');
      return { secure_url: uploadedUrl };
    } } } },
  }, globals);
  const { authOptions } = load('src/lib/auth-options.ts', {
    'next-auth/providers/google': { default: () => ({}) },
    '@/lib/prisma': { prisma: { user: {
      findUnique: async () => userExists ? { id: 'alice' } : null,
      update: async args => updates.push(args),
    } } },
    '@/utils/user-image-handler': { processUserProfileImage: imageHandler.processUserProfileImageServer },
    '@/lib/custom-prisma-adapter': { CustomPrismaAdapter: () => ({}) },
  }, globals);
  const rejected = [
    null, 'not a URL', uploadedUrl,
    'https://evil.test/googleusercontent.com/avatar',
    'https://evil.test/?image=googleusercontent.com',
    'https://googleusercontent.com.evil.test/avatar',
    'https://evilgoogleusercontent.com/avatar',
    'https://googleusercontent.com@evil.test/avatar',
    'http://lh3.googleusercontent.com/avatar',
    'ftp://lh3.googleusercontent.com/avatar',
    '//lh3.googleusercontent.com/avatar',
  ];
  const allowed = [
    'https://googleusercontent.com/avatar',
    'https://lh3.googleusercontent.com/avatar',
    'https://LH3.GOOGLEUSERCONTENT.COM/avatar?old=cloudinary.com',
  ];
  for (const image of [...rejected, ...allowed]) {
    const shouldUpload = allowed.includes(image);
    for (const callback of ['createUser', 'linkAccount', 'signIn', 'updateImage']) {
      uploads.length = 0;
      updates.length = 0;
      const user = { id: 'alice', image };
      const args = { user, account: { provider: 'google' }, profile: { picture: image } };
      if (callback === 'signIn') {
        assert.equal(await authOptions.callbacks.signIn(args), true);
        assert.equal(user.image, shouldUpload ? uploadedUrl : image);
      } else if (callback === 'updateImage') {
        assert.equal(await imageHandler.updateUserProfileImageIfNeededServer(image, user.id), shouldUpload ? uploadedUrl : image);
      } else {
        await authOptions.events[callback](args);
      }
      assert.deepEqual(uploads, shouldUpload ? [image] : [], `${callback}: ${image}`);
      assert.equal(updates.length, shouldUpload && callback !== 'updateImage' ? 1 : 0);
      if (updates.length) assert.equal(updates[0].data.image, uploadedUrl);
    }
  }
  userExists = false;
  uploads.length = 0;
  assert.equal(await authOptions.callbacks.signIn({ user: { id: 'new', image: allowed[0] }, account: { provider: 'google' } }), true);
  assert.equal(uploads.length, 0);
  uploadFails = true;
  assert.equal(await imageHandler.processUserProfileImageServer(allowed[0], 'alice'), allowed[0]);
});

test('login redirects stay on the exact application origin', async () => {
  const { authOptions } = load('src/lib/auth-options.ts', {
    'next-auth': { default: () => () => {} },
    'next-auth/providers/google': { default: () => ({}) },
    '@/lib/prisma': { prisma: {} },
    '@/utils/user-image-handler': {},
    '@/lib/custom-prisma-adapter': { CustomPrismaAdapter: () => ({}) },
  }, { process: { env: {} }, URL });
  const baseUrl = 'https://collab.example';
  for (const url of ['https://collab.example.evil.test/', '//evil.test/', '/\\evil.test/', 'javascript:alert(1)', 'http://collab.example/', 'https://[invalid']) {
    assert.equal(await authOptions.callbacks.redirect({ url, baseUrl }), baseUrl, url);
  }
  for (const url of ['/projects', 'https://collab.example/projects']) {
    assert.equal(await authOptions.callbacks.redirect({ url, baseUrl }), baseUrl + '/projects');
  }
});

test('optional AI initialization does not require credentials during route import', async () => {
  let creations = 0;
  class MissingCredentials {
    constructor() { creations++; throw new Error('Missing test credentials'); }
  }
  const { AIContentGenerator } = load('src/lib/ai/content-generator.ts', {
    'openai': { default: MissingCredentials }, '@prisma/client': require('@prisma/client'),
  }, { process: { env: {} }, console: { error() {} } });
  const generator = new AIContentGenerator();
  assert.equal(creations, 0);
  assert.equal(await generator.enhanceIssueTitle('Original title'), 'Original title');
  assert.equal(creations, 1);
});

test('password hashing and email rendering work without contacting external services', async () => {
  const bcrypt = require('bcrypt');
  const hash = await bcrypt.hash('test-password', 4);
  assert.equal(await bcrypt.compare('test-password', hash), true);
  assert.equal(await bcrypt.compare('incorrect', hash), false);
  const mail = require('nodemailer').createTransport({ streamTransport: true, buffer: true });
  const result = await mail.sendMail({ from: 'a@example.test', to: 'b@example.test', subject: 'Test', text: 'Local only' });
  assert.match(result.message.toString(), /Local only/);
});

test('validation wrapper rejects bad body/query/params and passes validated values', async () => {
  const { z } = require('zod');
  const { withValidation } = load('src/lib/validation.ts', {
    zod: { z }, 'next/server': { NextResponse: { json: (body, init) => ({ body, status: init.status }) } },
  }, { URL });
  let calls = 0;
  const handler = withValidation(async (_req, context) => { calls++; return { status: 200, context }; }, {
    body: z.object({ title: z.string() }), query: z.object({ q: z.string() }), params: z.object({ id: z.string() }),
  });
  for (const [body, query, id] of [[{ title: 1 }, '?q=x', 'id'], [{ title: 'x' }, '', 'id'], [{ title: 'x' }, '?q=x', 1]]) {
    const response = await handler(new Request('https://example.test/' + query, { method: 'POST', body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });
    assert.equal(response.status, 400);
  }
  assert.equal(calls, 0);
  const response = await handler(new Request('https://example.test/?q=x', { method: 'POST', body: '{"title":"ok"}' }), { params: Promise.resolve({ id: 'id' }) });
  assert.equal(response.status, 200);
  assert.equal(response.context.body.title, 'ok');
  assert.equal(calls, 1);
});

test('webhook delivery requires exact trusted HTTPS origins and never follows redirects', async () => {
  const env = {};
  const webhooks = load('src/lib/webhooks.ts', { crypto: { default: require('node:crypto') } }, { process: { env }, URL, Buffer });
  const allowed = webhooks.isAllowedWebhookDeliveryUrl;
  assert.equal(allowed('https://hooks.example.test/event'), false);
  env.COLLAB_WEBHOOK_ALLOWED_ORIGINS = 'https://hooks.example.test';
  assert.equal(allowed('https://hooks.example.test/event?x=1'), true);
  assert.equal(allowed('https://HOOKS.example.test:443/event'), true);
  for (const url of ['https://hooks.example.test.evil.test/', 'https://hooks.example.test:8443/', 'http://hooks.example.test/', 'https://user@hooks.example.test/', '//hooks.example.test/', 'https://hooks.example.test/#secret']) {
    assert.equal(allowed(url), false, url);
  }
  for (const origin of ['invalid', 'http://hooks.example.test', 'https://user@hooks.example.test', 'https://hooks.example.test/path', 'https://hooks.example.test/?x=1']) {
    env.COLLAB_WEBHOOK_ALLOWED_ORIGINS = origin;
    assert.equal(allowed('https://hooks.example.test/event'), false, origin);
  }
  env.COLLAB_WEBHOOK_ALLOWED_ORIGINS = 'https://hooks.example.test:8443';
  assert.equal(allowed('https://hooks.example.test:8443/event'), true);
  assert.equal(allowed('https://hooks.example.test/event'), false);
  let requests = 0;
  const webhook = { isActive: true, url: 'https://hooks.example.test/event', eventTypes: ['issue.updated'], secretEnc: 'test' };
  const { deliverWebhook } = load('src/lib/webhook-delivery.ts', {
    '@/lib/prisma': { prisma: { appWebhook: { findUnique: async () => webhook } } },
    './webhooks': webhooks, './apps/crypto': { decrypt: async () => 'test-secret' },
  }, {
    Buffer, AbortController, setTimeout, clearTimeout, console: { log() {}, warn() {}, error() {} },
    fetch: async (_url, options) => {
      requests++;
      assert.equal(options.redirect, 'manual');
      return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/private' } });
    },
  });
  const event = { id: 'event', type: 'issue.updated', timestamp: Date.now(), data: {}, workspace: { id: 'own', name: 'Test', slug: 'test' }, app: { id: 'app', name: 'Test', slug: 'test' } };
  assert.equal((await deliverWebhook('hook', event)).success, false);
  assert.equal(requests, 0);
  env.COLLAB_WEBHOOK_ALLOWED_ORIGINS = 'https://hooks.example.test';
  const response = await deliverWebhook('hook', event);
  assert.equal(response.success, false);
  assert.equal(response.status, 302);
  assert.equal(response.shouldRetry, false);
  assert.equal(requests, 1);
});


test('profile edits cannot create membership in an inaccessible workspace', async () => {
  let writes = 0;
  const { updateUserProfile } = load('src/actions/user.ts', {
    '@/lib/auth-options': { authOptions: {} },
    'next-auth': { getServerSession: async () => ({ user: { email: 'alice@example.test' } }) },
    '@/lib/issue-finder': { userHasWorkspaceAccess },
    '@/lib/prisma': { prisma: {
      user: { findUnique: async () => ({ id: 'alice' }) },
      workspaceMember: { upsert: async () => { writes++; return {}; } },
    } },
  });
  for (const workspace of ['foreign', 'revoked']) {
    await assert.rejects(updateUserProfile({ name: 'Alice' }, workspace), /Workspace access required/);
  }
  assert.equal(writes, 0);
  await updateUserProfile({ name: 'Alice' }, 'joined');
  assert.equal(writes, 1);
});
