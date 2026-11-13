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
  '@/components/ui/confirm-dialog': { ConfirmDialog: () => null },
  '@/components/ui/dialog': { ...parts(['DialogContent', 'DialogDescription', 'DialogFooter', 'DialogHeader', 'DialogTitle']),
    Dialog: ({ open, children }) => open ? React.createElement('div', { role: 'dialog' }, children) : null },
  '@/components/ui/input': { Input: () => null },
  '@/components/ui/label': { Label: el('label') },
  '@/components/ui/select': Object.fromEntries(['Select', 'SelectContent', 'SelectItem', 'SelectTrigger', 'SelectValue'].map(name => [name, () => null])),
  '@/components/ui/switch': { Switch: ({ id, checked, disabled, onCheckedChange }) =>
    React.createElement('input', { type: 'checkbox', id, checked, disabled, onChange: event => onCheckedChange(event.target.checked) }) },
  '@/components/ui/table': { Table: el('table'), TableBody: el('tbody'), TableCell: el('td'), TableHead: el('th'), TableHeader: el('thead'), TableRow: el('tr') },
  '@/hooks/use-toast': { useToast: () => ({ toast: notice => notices.push(notice) }) },
}, { fetch: async (url, options) => { calls.push([url, options.method, JSON.parse(options.body)]); return answer; } }).default;

const three = { id: 'w3', name: 'Three', slug: 'three' }, four = { id: 'w4', name: 'Four', slug: 'four' }, five = { id: 'w5', name: 'Five', slug: 'five' };
const token = (id, name, workspaces) => ({ id, name, workspaces, access: 'write', createdAt: '2026-11-12', expiresAt: '2027-11-12', expired: false });
const buttons = text => [...document.querySelectorAll('button')].filter(button => button.textContent === text);
const toggle = id => React.act(async () => document.getElementById(id).click());

async function render(props) {
  const root = createRoot(document.getElementById('root'));
  await React.act(async () => root.render(React.createElement(Manager, { workspaceId: 'w1', ...props })));
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
    const command = `claude mcp add --transport http --client-id collab-connector collab ${url}`;
    assert.deepEqual(snippets().slice(0, 3), [url, command, `claude mcp add --transport http collab ${url} --header "Authorization: Bearer $COLLAB_TOKEN"`]);
    assert.deepEqual(JSON.parse(snippets()[3]), { mcpServers: { collab: { type: 'http', url, headers: { Authorization: 'Bearer ${COLLAB_TOKEN}' } } } });
    const sections = [...document.querySelectorAll('section')];
    assert.match(sections.find(section => section.querySelector('h2')?.textContent === 'Claude Code, as yourself').textContent, /runs this command in each project/);
    assert.match(sections.find(section => section.querySelector('h2')?.textContent === 'An agent with its own name').textContent, /Run this command in each project/);
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

  root = await show(null);
  try {
    assert.deepEqual(snippets(), [], 'no command is shown for an address that is not known');
    assert.match(document.body.textContent, /no public address configured/);
  } finally { await React.act(async () => root.unmount()); }
});
