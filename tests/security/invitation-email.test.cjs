const { assert, test, load, readFileSync, resolve } = require('./helpers.cjs');
const yaml = require('js-yaml');

function fixture({ env = {}, response = new Response(JSON.stringify({ id: 'email-1' }), { status: 200 }), failure } = {}) {
  const calls = [];
  const logs = [];
  const api = load('src/lib/email.ts', {
    'server-only': {},
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

test('shared email sender only includes caller-supplied plain text', async () => {
  const html = '<scr<script>ipt>alert(1)</scr</script>ipt>';
  for (const text of [undefined, '', 'Ready']) {
    const f = fixture();
    const result = await f.sendEmail({ to: 'recipient@example.test', subject: 'Notification', html, text });
    assert.equal(result.success, true);
    assert.equal(f.calls.length, 1);
    const body = JSON.parse(f.calls[0][1].body);
    assert.equal(body.html, html);
    assert.equal(Object.hasOwn(body, 'text'), text !== undefined);
    assert.equal(body.text, text);
  }
});

test('missing credentials refuse delivery without contacting any provider', async () => {
  const f = fixture({ env: { RESEND_API_KEY: '' } });
  const result = await f.sendEmail({ to: 'recipient@example.test', subject: 'Invite', html: '<p>Invite</p>' });
  assert.equal(result.success, false);
  assert.equal(f.calls.length, 0);
  assert.equal(typeof result.error, 'string');
});

test('Swarm service forwards the Resend key and leaves the default sender to the library', async () => {
  const config = yaml.load(readFileSync(resolve(__dirname, '../../docker-compose.swarm.yml'), 'utf8'));
  const environment = Object.fromEntries(config.services.collab.environment.map(entry => {
    const separator = entry.indexOf('=');
    return [entry.slice(0, separator), entry.slice(separator + 1)];
  }));
  assert.equal(environment.RESEND_API_KEY, '${RESEND_API_KEY}');
  assert.equal(environment.EMAIL_FROM, '${EMAIL_FROM}');
  const f = fixture({ env: { EMAIL_FROM: '' } });
  const result = await f.sendEmail({ to: 'recipient@example.test', subject: 'Invite', html: '<p>Invite</p>' });
  assert.equal(result.success, true);
  assert.equal(JSON.parse(f.calls[0][1].body).from, 'Collab <collab@weezboo.com>');
});

test('unsuccessful headers report rejection without leaking provider details or retrying', async () => {
  for (const options of [
    { response: new Response(JSON.stringify({ message: 'private provider detail' }), { status: 403 }) },
    { response: new Response('not JSON', { status: 502 }) },
    { response: new Response(JSON.stringify({ id: 'email-1' }), { status: 429 }) },
  ]) {
    const f = fixture(options);
    const result = await f.sendEmail({ to: 'recipient@example.test', subject: 'Invite', html: '<p>Invite</p>' });
    assert.equal(result.success, false);
    assert.match(result.error, /did not accept/);
    assert.doesNotMatch(JSON.stringify([result, f.logs]), /private provider detail|test-resend-key/);
    assert.equal(f.calls.length, 1, 'no automatic resend after rejection');
  }
});

test('interrupted and malformed successful responses remain uncertain without retrying', async () => {
  for (const options of [
    ...[new Error('private provider detail'), new DOMException('private provider detail', 'TimeoutError')].map(error => ({
      response: new Response(new ReadableStream({ start(controller) { controller.error(error); } }), { status: 200 }),
    })),
    { response: new Response('private provider detail', { status: 200 }) },
    { response: new Response(null, { status: 204 }) },
    { response: new Response('{}', { status: 200 }) },
    { response: new Response('null', { status: 200 }) },
    ...[null, 123, {}, [], '', ' \t '].map(id => ({ response: new Response(JSON.stringify({ id }), { status: 200 }) })),
    { failure: new Error('private provider detail') },
    { failure: new DOMException('private provider detail', 'TimeoutError') },
  ]) {
    const f = fixture(options);
    const result = await f.sendEmail({ to: 'recipient@example.test', subject: 'Invite', html: '<p>Invite</p>' });
    assert.equal(result.success, false);
    assert.equal(result.error, 'Email delivery could not be confirmed. Check the recipient inbox before retrying.');
    assert.doesNotMatch(JSON.stringify([result, f.logs]), /private provider detail|test-resend-key/);
    assert.equal(f.calls.length, 1, 'no automatic resend after an uncertain result');
  }
});

test('invitation uses a canonical acceptance link and escapes names in HTML', async () => {
  for (const [scriptTag, imageTag] of [['script', 'img'], ['SCRIPT', 'IMG'], ['ScRiPt', 'ImG']]) {
    const f = fixture();
    await f.sendWorkspaceInvitationEmail({ to: 'recipient@example.test', inviterName: `<${imageTag} src=x onerror=evil()>`, workspaceName: `Team <${scriptTag}>bad()</${scriptTag}>`, invitationToken: 'token/with?characters' });
    assert.equal(f.calls.length, 1);
    const body = JSON.parse(f.calls[0][1].body);
    assert.match(body.html, /https:\/\/collab.example.test\/workspace-invitation\/token%2Fwith%3Fcharacters/);
    assert.doesNotMatch(body.html, /<(?:script|img)\b/i);
    assert.ok(body.html.includes(`&lt;${imageTag} src=x onerror=evil()&gt;`));
    assert.ok(body.html.includes(`Team &lt;${scriptTag}&gt;bad()&lt;/${scriptTag}&gt;`));
    assert.match(body.text, /https:\/\/collab.example.test\/workspace-invitation\/token%2Fwith%3Fcharacters/);
  }
});

test('invitation endpoint preserves access checks and pending links for rejected or uncertain delivery', async () => {
  for (const [permitted, providerResponse] of [
    [false, new Response('{"id":"email-1"}', { status: 200 })],
    [true, new Response('{"message":"private provider detail"}', { status: 403 })],
    [true, new Response(new ReadableStream({ start(controller) { controller.error(new Error('private provider detail')); } }), { status: 200 })],
    [true, new Response('private provider detail', { status: 200 })],
    [true, new Response('{}', { status: 200 })],
  ]) {
    const f = fixture({ response: providerResponse });
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
      if (providerResponse.ok) assert.match(result.emailDetails.error, /could not be confirmed/);
      assert.doesNotMatch(JSON.stringify(result), /private provider detail|test-resend-key/);
    }
  }
});

test('create and resend notifications preserve uncertain delivery without triggering another request', () => {
  const notifications = [];
  const calls = [];
  const hooks = load('src/components/workspace/components/invitation/hooks/useInvitations.ts', {
    '@tanstack/react-query': { useQueryClient: () => ({ invalidateQueries() {} }), useMutation: options => options },
    '@/hooks/use-toast': { useToast: () => ({ toast: notification => notifications.push(notification) }) },
  }, { fetch: (...args) => calls.push(args) });
  const error = 'Email delivery could not be confirmed. Check the recipient inbox before retrying.';
  for (const [name, recipient] of [
    ['useInviteMember', 'recipient@example.test'],
    ['useResendInvitation', { email: 'recipient@example.test' }],
  ]) {
    hooks[name]('workspace').onSuccess({ emailSent: false, emailDetails: { error } }, recipient);
    const notification = notifications.at(-1);
    assert.match(notification.title, /email unconfirmed/);
    assert.ok(notification.description.includes(error));
    assert.doesNotMatch(notification.description, /couldn't send|email not sent/);
    assert.equal(calls.length, 0);
  }
});
