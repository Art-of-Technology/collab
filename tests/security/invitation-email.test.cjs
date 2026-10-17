const { assert, test, load } = require('./helpers.cjs');

function fixture({ env = {}, response = new Response(JSON.stringify({ id: 'email-1' }), { status: 200 }), failure } = {}) {
  const calls = [];
  const logs = [];
  const api = load('src/lib/email.ts', {
    'server-only': {},
    nodemailer: { default: { createTransport: () => ({ sendMail: async () => ({ messageId: 'old-smtp' }) }) } },
  }, {
    process: { env: { RESEND_API_KEY: 'test-resend-key', NEXT_PUBLIC_APP_URL: 'https://collab.example.test', ...env } },
    URL, AbortSignal,
    console: { error: (...args) => logs.push(args) },
    fetch: async (...args) => { calls.push(args); if (failure) throw failure; return response; },
  });
  return { ...api, calls, logs };
}

test('shared email sender uses Resend and the authorized Collab address', async () => {
  const f = fixture();
  const result = await f.sendEmail({ to: 'recipient@example.test', subject: 'Notification', html: '<p>Ready</p>', text: 'Ready' });
  assert.equal(result.success, true);
  assert.equal(result.messageId, 'email-1');
  assert.equal(f.calls.length, 1);
  const [url, options] = f.calls[0];
  assert.equal(url, 'https://api.resend.com/emails');
  assert.equal(options.method, 'POST');
  assert.equal(options.headers.Authorization, 'Bearer test-resend-key');
  const body = JSON.parse(options.body);
  assert.equal(body.from, 'Collab <collab@weezboo.com>');
  assert.deepEqual(body.to, ['recipient@example.test']);
  assert.equal(body.text, 'Ready');
  assert.ok(options.signal instanceof AbortSignal);
});

test('missing credentials refuse delivery without contacting any provider', async () => {
  const f = fixture({ env: { RESEND_API_KEY: '' } });
  const result = await f.sendEmail({ to: 'recipient@example.test', subject: 'Invite', html: '<p>Invite</p>' });
  assert.equal(result.success, false);
  assert.equal(f.calls.length, 0);
  assert.equal(typeof result.error, 'string');
});

test('provider rejection, malformed response and timeout never report success or leak provider details', async () => {
  for (const options of [
    { response: new Response(JSON.stringify({ message: 'private provider detail' }), { status: 403 }) },
    { response: new Response('not JSON', { status: 502 }) },
    { response: new Response('{}', { status: 200 }) },
    { failure: new Error('private provider detail') },
  ]) {
    const f = fixture(options);
    const result = await f.sendEmail({ to: 'recipient@example.test', subject: 'Invite', html: '<p>Invite</p>' });
    assert.equal(result.success, false);
    assert.equal(typeof result.error, 'string');
    assert.doesNotMatch(JSON.stringify([result, f.logs]), /private provider detail|test-resend-key/);
    assert.equal(f.calls.length, 1, 'no automatic resend after an uncertain result');
  }
});

test('invitation uses a canonical acceptance link and escapes names in HTML', async () => {
  const f = fixture();
  await f.sendWorkspaceInvitationEmail({ to: 'recipient@example.test', inviterName: '<img src=x onerror=evil()>', workspaceName: 'Team <script>bad()</script>', invitationToken: 'token/with?characters' });
  assert.equal(f.calls.length, 1);
  const body = JSON.parse(f.calls[0][1].body);
  assert.match(body.html, /https:\/\/collab.example.test\/workspace-invitation\/token%2Fwith%3Fcharacters/);
  assert.doesNotMatch(body.html, /<script>|<img/);
  assert.match(body.html, /&lt;img/);
  assert.match(body.text, /https:\/\/collab.example.test\/workspace-invitation\/token%2Fwith%3Fcharacters/);
});

test('invitation endpoint preserves access checks and reports rejected delivery with a usable pending link', async () => {
  for (const permitted of [false, true]) {
    const f = fixture({ response: new Response('{"message":"private provider detail"}', { status: 403 }) });
    const writes = [];
    const { POST } = load('src/app/api/workspaces/[workspaceId]/invitations/route.ts', {
      'next/server': { NextResponse: { json: (body, init) => new Response(JSON.stringify(body), init) } },
      '@/lib/request-session': { getServerSession: async () => ({ user: { id: 'owner', name: 'Owner' } }) },
      '@/lib/auth-options': {}, 'node:crypto': { randomUUID: () => 'invitation-token' },
      '@/lib/email': f,
      '@/lib/permissions': { Permission: { INVITE_MEMBERS: 'invite' }, checkUserPermission: async () => ({ hasPermission: permitted }) },
      '@/lib/prisma': { prisma: {
        workspace: { findUnique: async () => ({ name: 'Workspace' }) },
        user: { findFirst: async () => null },
        workspaceInvitation: { findFirst: async () => null, create: async ({ data }) => { writes.push(data); return { id: 'invitation', ...data }; } },
      } },
    }, { console: { error() {} } });
    const response = await POST(new Request('https://collab.example.test/api/workspaces/workspace/invitations', {
      method: 'POST', body: JSON.stringify({ email: 'recipient@example.test' }),
    }), { params: Promise.resolve({ workspaceId: 'workspace' }) });
    assert.equal(response.status, permitted ? 201 : 403);
    assert.equal(writes.length, permitted ? 1 : 0);
    assert.equal(f.calls.length, permitted ? 1 : 0);
    if (permitted) {
      const result = await response.json();
      assert.equal(result.emailSent, false);
      assert.equal(result.status, 'pending');
      assert.equal(result.token, 'invitation-token');
      assert.equal(typeof result.emailDetails.error, 'string');
      assert.doesNotMatch(JSON.stringify(result), /private provider detail|test-resend-key/);
    }
  }
});
