const { assert, test, load } = require('./helpers.cjs');
const jsx = { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
const base = 'src/components/workspace/components/invitation/';

function nodes(node) {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== 'object') return [];
  return [node, ...nodes(node.props?.children)];
}
function text(node) {
  if (Array.isArray(node)) return node.map(text).join(' ');
  return typeof node === 'string' ? node : node && typeof node === 'object' ? text(node.props?.children) : '';
}

function fixture() {
  const notifications = [], requests = [], invalidations = [];
  let response;
  const hooks = load(`${base}hooks/useInvitations.ts`, {
    '@tanstack/react-query': {
      useQueryClient: () => ({ invalidateQueries: options => invalidations.push(options) }),
      useMutation: options => options,
    },
    '@/hooks/use-toast': { useToast: () => ({ toast: notification => notifications.push(notification) }) },
  }, { Error, fetch: async (...args) => { requests.push(args); return response; } });
  return { hooks, notifications, requests, invalidations, respond: value => { response = value; } };
}

function formFixture(f, response) {
  let formResets = 0, callbacks = 0, mutationResets = 0;
  const options = f.hooks.useInviteMember('workspace');
  const mutation = {
    data: response, isSuccess: !!response, error: null,
    reset() { mutationResets++; this.data = undefined; this.isSuccess = false; this.error = null; },
    async mutateAsync(email) {
      try {
        this.data = await options.mutationFn(email);
        this.isSuccess = true;
        options.onSuccess(this.data, email);
        return this.data;
      } catch (error) { this.error = error; options.onError(error); throw error; }
    },
  };
  const component = load(`${base}InviteMemberForm.tsx`, {
    'react/jsx-runtime': jsx, react: {}, zod: require('zod'),
    'react-hook-form': { useForm: () => ({ control: {}, reset: () => formResets++, handleSubmit: handler => handler }) },
    '@hookform/resolvers/zod': { zodResolver: () => ({}) },
    'lucide-react': { AlertCircle: 'AlertCircle', CheckCircle: 'CheckCircle' },
    '@/components/ui/button': { Button: 'Button' },
    '@/components/ui/form': { Form: 'Form', FormField: 'FormField' },
    '@/components/ui/input': { Input: 'Input' },
    './hooks': { ...f.hooks, useInviteMember: () => mutation },
  }, { Error, console: { error() {} } }).default;
  return {
    render: () => component({ workspaceId: 'workspace', onInviteSent: () => callbacks++ }), mutation,
    counts: () => ({ formResets, callbacks, mutationResets }),
  };
}

test('invitation form and create/resend notifications require confirmed email success', () => {
  for (const [result, expected] of [
    [{ emailSent: false, emailDetails: { error: 'Email delivery is not configured. Contact your workspace administrator.' } }, /Invitation created; email not sent/],
    [{ emailSent: false, emailDetails: { error: 'The email service did not accept the message. Please retry from workspace invitations.' } }, /Invitation created; email not sent/],
    [{ emailSent: false, emailDetails: { error: 'Email delivery could not be confirmed. Check the recipient inbox before retrying.' } }, /Invitation created; email unconfirmed/],
    [{}, /Invitation created; email unconfirmed/],
    [{ emailSent: true }, /Invitation sent successfully/],
  ]) {
    const f = fixture();
    const tree = formFixture(f, result).render();
    assert.match(text(tree), expected);
    const status = nodes(tree).find(node => node.props?.role === 'status');
    assert.ok(status, 'delivery feedback is announced accessibly');
    if (result.emailSent !== true) {
      assert.doesNotMatch(text(tree), /sent successfully/);
      assert.doesNotMatch(status.props.className, /green/);
      assert.match(text(tree), /Copy the invitation link/);
    }
    for (const name of ['useInviteMember', 'useResendInvitation']) {
      f.hooks[name]('workspace').onSuccess(result, { email: 'person@example.test' });
      assert.match(f.notifications.at(-1).title, expected);
      assert.equal(f.requests.length, 0, 'no automatic delivery retry');
    }
  }
});

test('submit clears stale success, keeps rejected email, and only resets a successfully created invitation', async () => {
  const f = fixture();
  const form = formFixture(f, { emailSent: true });
  f.respond(new Response(JSON.stringify({ error: 'Already invited' }), { status: 400 }));
  await nodes(form.render()).find(node => node.type === 'form').props.onSubmit({ email: 'person@example.test' });
  assert.deepEqual(form.counts(), { formResets: 0, callbacks: 0, mutationResets: 1 });
  assert.match(text(form.render()), /Already invited/);
  assert.doesNotMatch(text(form.render()), /sent successfully/);
  assert.equal(f.requests.length, 1);

  f.respond(new Response(JSON.stringify({ id: 'invitation', emailSent: false }), { status: 201 }));
  await nodes(form.render()).find(node => node.type === 'form').props.onSubmit({ email: 'person@example.test' });
  assert.deepEqual(form.counts(), { formResets: 1, callbacks: 1, mutationResets: 2 });
  assert.match(text(form.render()), /Invitation created; email unconfirmed/);
  assert.doesNotMatch(text(form.render()), /Already invited/);
});

function pendingFixture(clipboard) {
  const notifications = [];
  let state = null;
  const component = load(`${base}PendingInvitations.tsx`, {
    'react/jsx-runtime': jsx,
    react: { useState: () => [state, value => { state = value; }] },
    'lucide-react': { User: 'User' },
    '@/components/ui/card': { Card: 'Card', CardHeader: 'CardHeader', CardTitle: 'CardTitle', CardDescription: 'CardDescription', CardContent: 'CardContent' },
    '@/components/ui/button': { Button: 'Button' },
    '@/components/ui/input': { Input: 'Input' },
    '@/hooks/use-toast': { useToast: () => ({ toast: value => notifications.push(value) }) },
    '@/lib/url-resolver': load('src/lib/url-resolver.ts', { './url-utils': load('src/lib/url-utils.ts') }),
    './CancelInvitationButton': { default: 'CancelInvitationButton' },
  }, { navigator: { clipboard }, window: { location: { origin: 'https://collab.example.test' } }, URL }).default;
  const invitation = { id: 'invitation', token: 'token/with?characters', email: 'person@example.test', createdAt: '2026-10-23', expiresAt: '2026-10-30' };
  return { notifications, render: (allowed = true) => component({ invitations: [invitation], workspaceId: 'workspace', canCancelInvitations: allowed }) };
}

test('pending invitation copies the canonical encoded link only after the clipboard succeeds', async () => {
  const copied = [];
  const f = pendingFixture({ writeText: async value => copied.push(value) });
  assert.equal(nodes(f.render(false)).filter(node => node.type === 'Button').length, 0, 'no link action without invitation permission');
  await nodes(f.render()).find(node => node.type === 'Button').props.onClick();
  assert.deepEqual(copied, ['https://collab.example.test/workspace-invitation/token%2Fwith%3Fcharacters']);
  assert.equal(f.notifications.at(-1).title, 'Invitation link copied');
  assert.equal(nodes(f.render()).filter(node => node.type === 'Input').length, 0);
});

test('denied or unavailable clipboard offers a selectable link and cancellation clears it', async () => {
  for (const clipboard of [undefined, { writeText: async () => { throw new Error('Denied'); } }]) {
    const f = pendingFixture(clipboard);
    await assert.doesNotReject(nodes(f.render()).find(node => node.type === 'Button').props.onClick());
    assert.equal(f.notifications.at(-1).title, 'Could not copy the link');
    const input = nodes(f.render()).find(node => node.type === 'Input');
    assert.equal(input.props.value, 'https://collab.example.test/workspace-invitation/token%2Fwith%3Fcharacters');
    assert.equal(input.props.readOnly, true);
    assert.match(input.props['aria-label'], /Invitation link for/);
    let selected = false;
    input.props.onFocus({ target: { select: () => { selected = true; } } });
    assert.equal(selected, true);
    nodes(f.render()).find(node => node.type === 'CancelInvitationButton').props.onSuccess();
    assert.equal(nodes(f.render()).filter(node => node.type === 'Input').length, 0);
  }
});
