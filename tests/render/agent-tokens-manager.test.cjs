const { assert, test, load } = require('../security/helpers.cjs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<div id="root"></div>', { url: 'https://collab.test/workspaces/w1/settings/agent-tokens' });
global.window = dom.window; global.document = dom.window.document; global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { createRoot } = require('react-dom/client');

const calls = [], notices = [];
let refreshed = 0, answer = { ok: true, json: async () => ({}) };
const el = tag => ({ children, id, onClick, disabled, htmlFor }) => React.createElement(tag, { id, onClick, disabled, htmlFor }, children);
const parts = (names, tag = 'div') => Object.fromEntries(names.map(name => [name, el(tag)]));
const Manager = load('src/components/workspace/AgentTokensManager.tsx', {
  react: React, 'react/jsx-runtime': require('react/jsx-runtime'),
  'next/navigation': { useRouter: () => ({ refresh: () => { refreshed += 1; } }) },
  'lucide-react': new Proxy({}, { get: () => () => null }),
  '@/components/ui/badge': { Badge: el('span') },
  '@/components/ui/button': { Button: el('button') },
  '@/components/ui/card': parts(['Card', 'CardContent', 'CardDescription', 'CardHeader', 'CardTitle']),
  '@/components/ui/confirm-dialog': { ConfirmDialog: ({ open, confirmText, onConfirm }) => open ? React.createElement('button', { onClick: onConfirm }, `Confirm: ${confirmText}`) : null },
  '@/components/ui/dialog': { ...parts(['DialogContent', 'DialogDescription', 'DialogFooter', 'DialogHeader', 'DialogTitle']),
    Dialog: ({ open, children }) => open ? React.createElement('div', { role: 'dialog' }, children) : null },
  '@/components/ui/input': { Input: ({ id, value, onChange, readOnly }) => React.createElement('input', { id, value, onChange, readOnly }) },
  '@/components/ui/label': { Label: el('label') },
  '@/components/ui/select': { Select: ({ value, onValueChange, children }) => React.createElement('select', { value, onChange: event => onValueChange(event.target.value) }, children),
    SelectContent: ({ children }) => children, SelectItem: ({ value, children }) => React.createElement('option', { value }, children), SelectTrigger: () => null, SelectValue: () => null },
  '@/components/ui/switch': { Switch: ({ id, checked, disabled, onCheckedChange }) =>
    React.createElement('input', { type: 'checkbox', id, checked, disabled, onChange: event => onCheckedChange(event.target.checked) }) },
  '@/components/ui/table': { Table: el('table'), TableBody: el('tbody'), TableCell: el('td'), TableHead: el('th'), TableHeader: el('thead'), TableRow: el('tr') },
  '@/hooks/use-toast': { useToast: () => ({ toast: notice => notices.push(notice) }) },
}, { fetch: async (url, options) => { calls.push([url, options.method, options.body ? JSON.parse(options.body) : undefined]); return answer; } }).default;

const three = { id: 'w3', name: 'Three', slug: 'three' }, four = { id: 'w4', name: 'Four', slug: 'four' }, five = { id: 'w5', name: 'Five', slug: 'five' };
const token = (id, name, workspaces) => ({ id, name, workspaces, access: 'write', createdAt: '2026-11-12', expiresAt: '2027-11-12', expired: false });
const buttons = text => [...document.querySelectorAll('button')].filter(button => button.textContent === text);
const toggle = id => React.act(async () => document.getElementById(id).click());

async function render(props) {
  const root = createRoot(document.getElementById('root'));
  await React.act(async () => root.render(React.createElement(Manager, { workspaceId: 'w1', projects: [], people: [], ...props })));
  return root;
}

test('an agent with nowhere else to go has no Workspaces control', async () => {
  const root = await render({ workspaces: [], tokens: [token('t1', 'Claude', [])] });
  try {
    assert.equal(buttons('Workspaces').length, 0);
    assert.equal(buttons('Revoke').length, 1);
    assert.doesNotMatch(document.body.textContent, /Also works in/);
  } finally { await React.act(async () => root.unmount()); }
});

test('the Workspaces control lets an agent into a workspace, takes it away, and reports a refusal', async () => {
  // The viewer manages Three and Four; the agent is already in Three and in Five, which the viewer does not manage.
  const root = await render({ workspaces: [three, four], tokens: [token('t1', 'Claude', [three, five]), token('t2', 'Reader', [])] });
  try {
    assert.match(document.body.textContent, /Also works in Three, Five/);
    assert.equal(buttons('Workspaces').length, 2);
    assert.equal(document.querySelector('[role=dialog]'), null);
    await React.act(async () => buttons('Workspaces')[0].click());
    assert.match(document.querySelector('[role=dialog]').textContent, /Workspaces for Claude/);
    const state = () => ['w3', 'w4', 'w5'].map(id => document.getElementById(`agent-workspace-${id}`)?.checked);
    assert.deepEqual(state(), [true, false, true], 'Five is listed so it can be taken away');

    await toggle('agent-workspace-w4');
    assert.deepEqual(calls.at(-1), ['/api/workspaces/w1/agent-tokens/t1', 'PATCH', { workspaceId: 'w4', allowed: true }]);
    assert.equal(notices.at(-1).description, 'Claude can now work in Four.');
    assert.equal(refreshed, 1);

    await toggle('agent-workspace-w5');
    assert.deepEqual(calls.at(-1), ['/api/workspaces/w1/agent-tokens/t1', 'PATCH', { workspaceId: 'w5', allowed: false }]);
    assert.equal(notices.at(-1).description, 'Claude can no longer work in Five.');
    assert.equal(refreshed, 2);

    answer = { ok: false, json: async () => ({ error: 'You need permission to manage agent tokens in that workspace too' }) };
    await toggle('agent-workspace-w4');
    assert.equal(notices.at(-1).variant, 'destructive');
    assert.equal(notices.at(-1).description, 'You need permission to manage agent tokens in that workspace too');
    assert.equal(refreshed, 2, 'a refusal changes nothing on the page');
  } finally { await React.act(async () => root.unmount()); }
});

const choose = (index, value) => React.act(async () => {
  const select = document.querySelectorAll('select')[index];
  select.value = value;
  select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
});
const type = (id, value) => React.act(async () => {
  const input = document.getElementById(id);
  Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(input, value);
  input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
});

test('a token created with a project is a seat: project, role and owner go to the seats endpoint', async () => {
  const root = await render({ workspaces: [], tokens: [], projects: [{ id: 'p1', name: 'Collab' }], people: [{ id: 'u1', name: 'Cem' }] });
  try {
    await React.act(async () => buttons('New token')[0].click());
    await type('agent-token-name', 'rel');
    assert.equal(document.querySelectorAll('select').length, 3, 'project, access, expiry');
    assert.equal(buttons('Create token').length, 1);

    await choose(0, 'p1');
    assert.equal(document.querySelectorAll('select').length, 4, 'project, role, owner, expiry: a seat always writes, so access is not asked');
    await choose(1, 'release');
    await choose(2, 'u1');
    answer = { ok: true, json: async () => ({ seat: { id: 's1' }, token: { name: 'rel', token: 'collab_at_seat' } }) };
    await React.act(async () => buttons('Create seat')[0].click());
    assert.deepEqual(calls.at(-1), ['/api/workspaces/w1/agent-seats', 'POST', { name: 'rel', projectId: 'p1', role: 'release', ownerId: 'u1', expiresInDays: 90 }]);
    assert.match(document.body.textContent, /Copy the token for rel/);
    assert.equal(document.querySelector('input[readonly]').value, 'collab_at_seat');
    await React.act(async () => buttons('Done')[0].click());

    // Without a project it is a plain token, as before, and the form is back at its defaults.
    await React.act(async () => buttons('New token')[0].click());
    assert.equal(document.querySelectorAll('select')[0].value, 'none');
    await type('agent-token-name', 'plain');
    answer = { ok: true, json: async () => ({ name: 'plain', token: 'collab_at_plain' }) };
    await React.act(async () => buttons('Create token')[0].click());
    assert.deepEqual(calls.at(-1), ['/api/workspaces/w1/agent-tokens', 'POST', { name: 'plain', access: 'read', expiresInDays: 90 }]);
  } finally { await React.act(async () => root.unmount()); }
});

test('a seat is named on its token and can be retired; a retired seat and a plain token cannot', async () => {
  const seat = (id, retired) => ({ id, role: 'release', project: 'Collab', isDefault: !retired, retired });
  const root = await render({ workspaces: [], tokens: [{ ...token('t1', 'rel', []), seat: seat('s1', false) }, { ...token('t2', 'old', []), seat: seat('s2', true) }, token('t3', 'Claude', [])] });
  try {
    assert.match(document.body.textContent, /Release seat of Collab, default for its role/);
    assert.match(document.body.textContent, /Retired seat of Collab/);
    assert.equal(buttons('Retire seat').length, 1);
    assert.equal(buttons('Revoke').length, 3);

    const before = refreshed;
    await React.act(async () => buttons('Retire seat')[0].click());
    answer = { ok: true, json: async () => ({ unassigned: ['CLB-1'] }) };
    await React.act(async () => buttons('Confirm: Retire seat')[0].click());
    assert.deepEqual(calls.at(-1), ['/api/workspaces/w1/agent-seats/s1', 'DELETE', undefined]);
    assert.equal(notices.at(-1).description, 'rel takes no more work. 1 open issue was unassigned.');
    assert.equal(refreshed, before + 1);

    await React.act(async () => buttons('Retire seat')[0].click());
    answer = { ok: false, json: async () => ({ error: 'This seat has a run open; let it finish, or clear it, before retiring the seat' }) };
    await React.act(async () => buttons('Confirm: Retire seat')[0].click());
    assert.equal(notices.at(-1).variant, 'destructive');
    assert.match(notices.at(-1).description, /has a run open/);
    assert.equal(refreshed, before + 1);
  } finally { await React.act(async () => root.unmount()); }
});

test('Connect an agent shows the endpoint of this deployment and copies each command', async () => {
  const endpoint = env => load('src/lib/mcp-oauth.ts', { 'next/server': {} }, { URL, process: { env } }).mcpEndpointUrl();
  const url = endpoint({ NEXTAUTH_URL: 'https://collab.example.test/login' });
  assert.equal(url, 'https://collab.example.test/api/mcp');
  assert.equal(endpoint({}), null);

  const clipboard = [];
  const Guide = load('src/components/workspace/AgentConnectGuide.tsx', {
    react: React, 'react/jsx-runtime': require('react/jsx-runtime'),
    'lucide-react': new Proxy({}, { get: () => () => null }),
    '@/components/ui/button': { Button: el('button') },
    '@/components/ui/card': parts(['Card', 'CardContent', 'CardDescription', 'CardHeader', 'CardTitle']),
    '@/hooks/use-toast': { useToast: () => ({ toast: notice => notices.push(notice) }) },
  }, { navigator: { clipboard: { writeText: async text => { if (clipboard.refuse) throw new Error('denied'); clipboard.push(text); } } } }).default;
  const show = async mcpUrl => {
    const root = createRoot(document.getElementById('root'));
    await React.act(async () => root.render(React.createElement(Guide, { mcpUrl })));
    return root;
  };
  const snippets = () => [...document.querySelectorAll('pre')].map(pre => pre.textContent);

  let root = await show(url);
  try {
    const command = `claude mcp add --transport http --client-id collab-connector collab "${url}"`;
    assert.deepEqual(snippets().slice(0, 2), [url, command]);
    assert.equal(snippets().length, 3);
    assert.deepEqual(JSON.parse(snippets()[2]), { mcpServers: { collab: { type: 'http', url, headers: { Authorization: 'Bearer ${COLLAB_TOKEN}' } } } });
    assert.doesNotMatch(snippets().join('\n'), /\$COLLAB_TOKEN/, 'no command makes the shell write the token into a settings file');
    assert.match(document.body.textContent, /runs this command in each project/);
    assert.match(document.body.textContent, /client ID collab-connector with no secret/);
    assert.equal(document.querySelector('a').href, 'https://github.com/Art-of-Technology/collab/blob/main/docs/mcp-remote.md');

    await React.act(async () => buttons('Copy the Claude Code command')[0].click());
    assert.deepEqual(clipboard, [command]);
    assert.equal(buttons('Copied the Claude Code command').length, 1, 'only the copied snippet says so');
    assert.equal(buttons('Copy the endpoint URL').length, 1);

    clipboard.refuse = true;
    await React.act(async () => buttons('Copy the endpoint URL')[0].click());
    assert.equal(notices.at(-1).variant, 'destructive');
    assert.equal(buttons('Copy the endpoint URL').length, 1);
  } finally { await React.act(async () => root.unmount()); }

  const ipv6Url = endpoint({ NEXTAUTH_URL: 'http://[::1]:3000' });
  assert.equal(ipv6Url, 'http://[::1]:3000/api/mcp');
  clipboard.refuse = false;
  root = await show(ipv6Url);
  try {
    await React.act(async () => buttons('Copy the Claude Code command')[0].click());
    assert.equal(clipboard.at(-1), 'claude mcp add --transport http --client-id collab-connector collab "http://[::1]:3000/api/mcp"');
  } finally { await React.act(async () => root.unmount()); }

  root = await show(null);
  try {
    assert.deepEqual(snippets(), [], 'no command is shown for an address that is not known');
    assert.match(document.body.textContent, /no public address configured/);
  } finally { await React.act(async () => root.unmount()); }
});
