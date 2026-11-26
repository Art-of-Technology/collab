const { assert, test, load } = require('../security/helpers.cjs');
const { JSDOM } = require('jsdom');
const { extraRole, extendedCatalogue } = require('../agents/role-catalogue-fixture.cjs');
const dom = new JSDOM('<div id="root"></div>', { url: 'https://collab.test/workspaces/w1/settings/agent-tokens' });
global.window = dom.window; global.document = dom.window.document; global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { createRoot } = require('react-dom/client');
const { QueryClient, QueryClientProvider, useQuery } = require('@tanstack/react-query');
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
// A query that was read keeps a timer until it is dropped, and the run would wait for it.
require('node:test').after(() => queryClient.clear());

const calls = [], notices = [];
let refreshed = 0, answer = { ok: true, json: async () => ({}) };
const el = tag => ({ children, id, onClick, disabled, htmlFor, role, 'aria-pressed': pressed }) => React.createElement(tag, { id, onClick, disabled, htmlFor, role, 'aria-pressed': pressed }, children);
const parts = (names, tag = 'div') => Object.fromEntries(names.map(name => [name, el(tag)]));
// What the create-seat form reads for a project: its connected repositories and the one it works out. A project that
// is not listed here has one repository, so a seat in it has nothing to pick.
const app = { id: 'r1', provider: 'github', name: 'acme/app', url: 'https://github.com/acme/app', defaultBranch: 'main' };
const api = { id: 'r2', provider: 'gitlab', name: 'acme/api', url: 'https://gitlab.com/acme/api', defaultBranch: null };
const repositoryStates = {};
const fetch = async (url, options) => {
  const project = /^\/api\/projects\/([^/]+)\/agent-repository$/.exec(url)?.[1];
  if (project && options.method !== 'PATCH') return { ok: repositoryStates[project] !== false, json: async () => repositoryStates[project] ?? { repositories: [app], repository: app } };
  calls.push([url, options.method, options.body ? JSON.parse(options.body) : undefined]);
  return answer;
};
const ui = {
  '@/components/ui/badge': { Badge: el('span') },
  '@/components/ui/button': { Button: el('button') },
  '@/components/ui/input': { Input: ({ id, value, onChange, readOnly, 'aria-label': label }) => React.createElement('input', { id, value, onChange, readOnly, 'aria-label': label }) },
  '@/components/ui/label': { Label: el('label') },
  '@/components/ui/select': { Select: ({ value, onValueChange, children }) => React.createElement('select', { value, onChange: event => onValueChange(event.target.value) }, children),
    SelectContent: ({ children }) => children, SelectItem: ({ value, disabled, children }) => React.createElement('option', { value, disabled }, children), SelectTrigger: () => null, SelectValue: () => null,
    SelectGroup: ({ children }) => React.createElement('optgroup', null, children), SelectLabel: ({ children }) => React.createElement('option', { disabled: true }, children) },
};
const Manager = load('src/components/workspace/AgentTokensManager.tsx', {
  '@/lib/agent-role-catalogue': extendedCatalogue(),
  react: React, 'react/jsx-runtime': require('react/jsx-runtime'),
  '@tanstack/react-query': { useQueryClient: () => queryClient },
  'next/navigation': { useRouter: () => ({ refresh: () => { refreshed += 1; } }) },
  'lucide-react': new Proxy({}, { get: () => () => null }),
  ...ui,
  // The real Repository line, with the GitHub connection flow stood in for: that flow is its own component.
  '@/components/workspace/SeatRepositoryField': load('src/components/workspace/SeatRepositoryField.tsx', {
    react: React, 'react/jsx-runtime': require('react/jsx-runtime'), '@tanstack/react-query': { useQuery, useQueryClient: () => queryClient }, ...ui,
    '@/components/github/GitHubOAuthConnection': { GitHubOAuthConnection: ({ projectId }) => React.createElement('p', null, `GitHub connection flow for ${projectId}`) },
  }, { fetch, encodeURIComponent }),
  '@/components/ui/card': parts(['Card', 'CardContent', 'CardDescription', 'CardHeader', 'CardTitle']),
  '@/components/ui/confirm-dialog': { ConfirmDialog: ({ open, confirmText, onConfirm }) => open ? React.createElement('button', { onClick: onConfirm }, `Confirm: ${confirmText}`) : null },
  '@/components/ui/dialog': { ...parts(['DialogContent', 'DialogDescription', 'DialogFooter', 'DialogHeader', 'DialogTitle']),
    Dialog: ({ open, children }) => open ? React.createElement('div', { role: 'dialog' }, children) : null },
  '@/components/ui/switch': { Switch: ({ id, checked, disabled, onCheckedChange }) =>
    React.createElement('input', { type: 'checkbox', id, checked, disabled, onChange: event => onCheckedChange(event.target.checked) }) },
  '@/components/ui/table': { Table: el('table'), TableBody: el('tbody'), TableCell: el('td'), TableHead: el('th'), TableHeader: el('thead'), TableRow: el('tr') },
  '@/hooks/use-toast': { useToast: () => ({ toast: notice => notices.push(notice) }) },
}, { fetch }).default;

const three = { id: 'w3', name: 'Three', slug: 'three' }, four = { id: 'w4', name: 'Four', slug: 'four' }, five = { id: 'w5', name: 'Five', slug: 'five' };
const token = (id, name, workspaces) => ({ id, name, workspaces, access: 'write', createdAt: '2026-11-12', expiresAt: '2027-11-12', expired: false });
const buttons = text => [...document.querySelectorAll('button')].filter(button => button.textContent === text);
const toggle = id => React.act(async () => document.getElementById(id).click());

async function render(props) {
  // Each test reads its projects' repositories afresh.
  queryClient.clear();
  const root = createRoot(document.getElementById('root'));
  await React.act(async () => root.render(React.createElement(QueryClientProvider, { client: queryClient },
    React.createElement(Manager, { workspaceId: 'w1', projects: [], people: [], ...props }))));
  return root;
}
/** The form has read the project's repositories and says so, which is when a seat can be created. */
const shows = async text => {
  for (let i = 0; i < 100 && !document.body.textContent.includes(text); i++) await React.act(async () => new Promise(resolve => setTimeout(resolve, 10)));
  assert.ok(document.body.textContent.includes(text), `the form never said "${text}": ${document.querySelector('[role=dialog]')?.textContent}`);
};

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
  const input = document.getElementById(id) ?? document.querySelector(id);
  Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(input, value);
  input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
});

test('seat changes refresh visible picker choices across workspace keys', async () => {
  const agent = { id: 'agent', name: 'Agent', email: null };
  let members = [agent];
  const selectorData = load('src/hooks/queries/useWorkspaceSelectorData.ts', {
    '@tanstack/react-query': { useQuery },
  }, { fetch: async () => ({ ok: true, json: async () => ({ members }) }) });
  const shown = ({ children }) => React.createElement('div', null, children);
  const { IssueAssigneeSelector } = load('src/components/issue/selectors/IssueAssigneeSelector.tsx', {
    react: React, 'react/jsx-runtime': require('react/jsx-runtime'),
    '@/hooks/queries/useWorkspaceSelectorData': selectorData,
    'next-auth/react': { useSession: () => ({ data: null }) },
    '@/components/ui/popover': { Popover: shown, PopoverContent: shown, PopoverTrigger: shown },
    '@/components/ui/button': { Button: el('button') },
    '@/components/ui/user-avatar': { UserAvatar: () => null }, '@/components/ui/custom-avatar': { CustomAvatar: () => null },
    '@/components/ui/input': { Input: () => null },
    'lucide-react': new Proxy({}, { get: () => () => null }),
    '@/lib/utils': { cn: (...names) => names.filter(Boolean).join(' ') },
  });
  queryClient.clear();
  const seat = { id: 's1', role: 'developer', project: 'Collab', isDefault: true, retired: false, owner: null };
  const root = createRoot(document.getElementById('root'));
  await React.act(async () => root.render(React.createElement(QueryClientProvider, { client: queryClient },
    React.createElement(Manager, { workspaceId: 'w1', workspaces: [], projects: [{ id: 'p1', name: 'Collab' }], people: [], tokens: [{ ...token('t1', 'Agent', []), seat }] }),
    ...[['id-picker', 'w1', 'p1'], ['slug-picker', 'workspace-slug', 'p1'], ['other-picker', 'w2', 'p1'], ['wrong-project', 'workspace-slug', 'p2']].map(([id, workspaceId, projectId]) =>
      React.createElement('div', { id, key: id }, React.createElement(IssueAssigneeSelector, { workspaceId, projectId, onChange() {} }))))));
  const waitFor = async predicate => {
    for (let i = 0; i < 100 && !predicate(); i++) await React.act(async () => new Promise(resolve => setTimeout(resolve, 10)));
    assert.ok(predicate(), 'picker choices did not update');
  };
  const offered = id => [...document.querySelectorAll(`#${id} button`)].some(button => button.textContent.includes('Agent'));
  try {
    await waitFor(() => offered('id-picker') && offered('slug-picker') && offered('other-picker') && offered('wrong-project'));
    await React.act(async () => buttons('New token')[0].click());
    await type('agent-token-name', 'Agent');
    await choose(0, 'p1');
    await shows('From the project');
    members = [{ ...agent, agentSeat: { projectId: 'p1', role: 'developer', retiredAt: null } }];
    answer = { ok: true, json: async () => ({ token: { name: 'Agent', token: 'token' } }) };
    await React.act(async () => buttons('Create seat')[0].click());
    await waitFor(() => offered('id-picker') && offered('slug-picker') && offered('other-picker') && !offered('wrong-project'));
    await React.act(async () => buttons('Done')[0].click());

    members = [{ ...agent, agentSeat: { projectId: 'p1', role: 'developer', retiredAt: '2026-11-15' } }];
    answer = { ok: true, json: async () => ({ unassigned: [] }) };
    await React.act(async () => buttons('Retire seat')[0].click());
    await React.act(async () => buttons('Confirm: Retire seat')[0].click());
    await waitFor(() => !offered('id-picker') && !offered('slug-picker') && !offered('other-picker'));

    await React.act(async () => buttons('New token')[0].click());
    await type('agent-token-name', 'Agent');
    await choose(0, 'p1');
    await shows('From the project');
    members = [{ ...agent, agentSeat: { projectId: 'p1', role: 'developer', retiredAt: null } }];
    answer = { ok: true, json: async () => ({ token: { name: 'Agent', token: 'token' } }) };
    await React.act(async () => buttons('Create seat')[0].click());
    await waitFor(() => offered('id-picker') && offered('slug-picker') && offered('other-picker'));
    await React.act(async () => buttons('Done')[0].click());
    members = [];
    await React.act(async () => buttons('Revoke')[0].click());
    answer = { ok: true, json: async () => ({}) };
    await React.act(async () => buttons('Confirm: Revoke')[0].click());
    await waitFor(() => !offered('id-picker') && !offered('slug-picker') && !offered('other-picker'));
  } finally {
    await React.act(async () => root.unmount());
    queryClient.clear();
  }
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
    // One repository on the project: shown, with nothing to pick, and nothing about it is sent.
    await shows('From the project acme/app. Nothing to pick, nothing to type.');
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

test('the Repository line: several are picked from, none is connected or typed, and a role that works in none says so', async () => {
  const typed = { id: 'p3', provider: 'address', name: 'acme/typed', url: 'https://github.com/acme/typed', defaultBranch: null };
  Object.assign(repositoryStates, { p2: { repositories: [app, api], repository: null }, p3: { repositories: [], repository: null }, p4: { repositories: [app, api], repository: api } });
  const projects = [{ id: 'p2', name: 'Several' }, { id: 'p3', name: 'None' }, { id: 'p4', name: 'Several with a default' }];
  const root = await render({ workspaces: [], tokens: [], projects, people: [] });
  const create = () => buttons('Create seat')[0];
  const seat = { ok: true, json: async () => ({ seat: { id: 's1' }, token: { name: 'dev', token: 'collab_at_seat' } }) };
  const open = async project => {
    await React.act(async () => buttons('New token')[0].click());
    await type('agent-token-name', 'dev');
    await choose(0, project);
  };
  try {
    // Several and no default for agents: the seat is not created until one is picked, and the pick goes with the request.
    await open('p2');
    await shows('This project has 2 repositories. Which one does this seat work in?');
    assert.equal(document.querySelectorAll('select').length, 5, 'project, role, repository, owner, expiry');
    assert.deepEqual([...document.querySelectorAll('select')[2].options].map(option => option.textContent), ['acme/app', 'acme/api']);
    assert.equal(create().disabled, true);
    // A role that works in no repository has none to pick and is not held up by one.
    await choose(1, 'lead');
    assert.match(document.querySelector('[role=dialog]').textContent, /No repository needed A Lead decides and writes; it changes no code\./);
    assert.equal(document.querySelectorAll('select').length, 4);
    assert.equal(create().disabled, false);
    await choose(1, 'developer');
    await choose(2, 'r2');
    assert.equal(create().disabled, false);
    answer = seat;
    await React.act(async () => create().click());
    assert.deepEqual(calls.at(-1), ['/api/workspaces/w1/agent-seats', 'POST', { name: 'dev', projectId: 'p2', role: 'developer', ownerId: null, expiresInDays: 90, repositoryId: 'r2' }]);
    await React.act(async () => buttons('Done')[0].click());

    // Several with a default: the pick starts there, so the seat keeps what the form showed.
    await open('p4');
    await shows('This project has 2 repositories.');
    assert.equal(document.querySelectorAll('select')[2].value, 'r2');
    await React.act(async () => create().click());
    assert.equal(calls.at(-1)[2].repositoryId, 'r2');
    await React.act(async () => buttons('Done')[0].click());
    // A lead in the same project sends no pick, whatever the form held before.
    await open('p4');
    await shows('This project has 2 repositories.');
    await choose(1, 'lead');
    await React.act(async () => create().click());
    assert.equal('repositoryId' in calls.at(-1)[2], false);
    await React.act(async () => buttons('Done')[0].click());

    // None: connect GitHub through the flow that exists, or type an address, which is saved on the project.
    await open('p3');
    await shows('No repository on this project');
    assert.equal(create().disabled, true);
    await React.act(async () => buttons('Connect GitHub')[0].click());
    assert.match(document.body.textContent, /GitHub connection flow for p3/);
    await React.act(async () => buttons('Type an address')[0].click());
    assert.doesNotMatch(document.body.textContent, /GitHub connection flow/);
    assert.equal(buttons('Save on the project')[0].disabled, true);
    await type('input[aria-label="Repository address"]', 'http://github.com/acme/typed');
    answer = { ok: false, json: async () => ({ error: 'Type the https address of the repository, like https://github.com/org/repo, with no sign-in in it.' }) };
    await React.act(async () => buttons('Save on the project')[0].click());
    assert.deepEqual(calls.at(-1), ['/api/projects/p3/agent-repository', 'PATCH', { url: 'http://github.com/acme/typed' }]);
    assert.match(document.querySelector('[role=alert]').textContent, /Type the https address/);
    assert.equal(create().disabled, true, 'a refused address leaves the project with none');

    await type('input[aria-label="Repository address"]', 'https://github.com/acme/typed');
    answer = { ok: true, json: async () => ({ repositories: [], repository: typed, canManage: true }) };
    await React.act(async () => buttons('Save on the project')[0].click());
    await shows('Saved on the project https://github.com/acme/typed');
    assert.equal(document.querySelector('[role=alert]'), null);
    assert.equal(create().disabled, false);
    answer = seat;
    await React.act(async () => create().click());
    // The address is the project's, so the seat's request names no repository.
    assert.deepEqual(calls.at(-1), ['/api/workspaces/w1/agent-seats', 'POST', { name: 'dev', projectId: 'p3', role: 'developer', ownerId: null, expiresInDays: 90 }]);
  } finally { await React.act(async () => root.unmount()); }
});

test('a failed repository refresh blocks repository roles until it succeeds', async () => {
  const root = await render({ workspaces: [], tokens: [], projects: [{ id: 'p6', name: 'Six' }], people: [] });
  try {
    await React.act(async () => buttons('New token')[0].click());
    await type('agent-token-name', 'dev');
    await choose(0, 'p6');
    await shows('From the project acme/app');
    assert.equal(buttons('Create seat')[0].disabled, false);
    repositoryStates.p6 = false;
    await React.act(async () => queryClient.refetchQueries({ queryKey: ['projectSummary', 'p6', 'agentRepository'] }));
    await shows("Could not load the project's repository.");
    assert.equal(buttons('Create seat')[0].disabled, true);
    await choose(1, 'lead');
    assert.equal(buttons('Create seat')[0].disabled, false);
    await choose(1, 'developer');
    repositoryStates.p6 = { repositories: [app], repository: app };
    await React.act(async () => buttons('Retry')[0].click());
    await shows('From the project acme/app');
    assert.equal(buttons('Create seat')[0].disabled, false);
  } finally { delete repositoryStates.p6; await React.act(async () => root.unmount()); }
});

test('a removed repository cannot be submitted after the list refreshes', async () => {
  const third = { ...app, id: 'r3', name: 'acme/third' };
  repositoryStates.p5 = { repositories: [app, api, third], repository: null };
  const root = await render({ workspaces: [], tokens: [], projects: [{ id: 'p5', name: 'Five' }], people: [] });
  try {
    await React.act(async () => buttons('New token')[0].click());
    await type('agent-token-name', 'dev');
    await choose(0, 'p5');
    await shows('This project has 3 repositories.');
    await choose(2, 'r2');
    assert.equal(buttons('Create seat')[0].disabled, false);
    await React.act(async () => queryClient.setQueryData(['projectSummary', 'p5', 'agentRepository'], { repositories: [app, third], repository: null }));
    await shows('This project has 2 repositories.');
    assert.equal(buttons('Create seat')[0].disabled, true);
    await choose(2, 'r3');
    assert.equal(buttons('Create seat')[0].disabled, false);
    answer = { ok: true, json: async () => ({ seat: { id: 's1' }, token: { name: 'dev', token: 'token' } }) };
    await React.act(async () => buttons('Create seat')[0].click());
    assert.equal(calls.at(-1)[2].repositoryId, 'r3');
  } finally { await React.act(async () => root.unmount()); }
});

test('the Owner choice says who pays for the seat and that it is fixed once the seat is made', async () => {
  const root = await render({ workspaces: [], tokens: [], projects: [{ id: 'p1', name: 'Collab' }], people: [{ id: 'u1', name: 'Cem' }] });
  try {
    await React.act(async () => buttons('New token')[0].click());
    assert.doesNotMatch(document.body.textContent, /subscription/, 'a plain token has no owner to explain');
    await choose(0, 'p1');
    // "No owner" is where the form starts: nobody's subscription pays, and the runners that exist today may refuse it.
    assert.match(document.body.textContent, /No person's subscription pays for this seat\./);
    assert.match(document.body.textContent, /runner that uses your organisation's API key/);
    assert.match(document.body.textContent, /may refuse the seat\./);
    assert.match(document.body.textContent, /The owner cannot be changed afterwards/);

    await choose(2, 'u1');
    assert.match(document.body.textContent, /Runs on this person's own Claude Code or Codex sign-in/);
    assert.doesNotMatch(document.body.textContent, /No person's subscription pays/);
    assert.match(document.body.textContent, /The owner cannot be changed afterwards/);
  } finally { await React.act(async () => root.unmount()); }
});

test('a seat is named on its token and can be retired; a retired seat and a plain token cannot', async () => {
  const seat = (id, retired) => ({ id, role: 'release', project: 'Collab', isDefault: !retired, retired, owner: retired ? null : 'Cem' });
  const root = await render({ workspaces: [], tokens: [{ ...token('t1', 'rel', []), seat: seat('s1', false) }, { ...token('t2', 'old', []), seat: seat('s2', true) }, token('t3', 'Claude', [])] });
  try {
    // Whose sign-in runs each seat, so a seat nobody pays for is not taken for one that someone does.
    assert.match(document.body.textContent, /Release seat of Collab, default for its role · Owner: Cem/);
    assert.match(document.body.textContent, /Retired seat of Collab · No owner \(API key\)/);
    assert.equal(buttons('Retire seat').length, 1);
    assert.equal(buttons('Revoke').length, 3);

    const before = refreshed;
    await React.act(async () => buttons('Retire seat')[0].click());
    answer = { ok: true, json: async () => ({ unassigned: ['CLB-1'] }) };
    await React.act(async () => buttons('Confirm: Retire seat')[0].click());
    assert.deepEqual(calls.at(-1), ['/api/workspaces/w1/agent-seats/s1', 'DELETE', undefined]);
    assert.equal(notices.at(-1).description, 'rel takes no more work. 1 open issue was unassigned.');
    assert.equal(refreshed, before + 1);

    await React.act(async () => buttons('Revoke')[0].click());
    answer = { ok: true, json: async () => ({}) };
    await React.act(async () => buttons('Confirm: Revoke')[0].click());

    await React.act(async () => buttons('Retire seat')[0].click());
    answer = { ok: false, json: async () => ({ error: 'This seat has a run open; let it finish, or clear it, before retiring the seat' }) };
    await React.act(async () => buttons('Confirm: Retire seat')[0].click());
    assert.equal(notices.at(-1).variant, 'destructive');
    assert.match(notices.at(-1).description, /has a run open/);
    assert.equal(refreshed, before + 2);
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

test('an active seat without tokens can still be retired', async () => {
  const root = await render({ workspaces: [], tokens: [], seats: [{ id: 's1', name: 'Agent', role: 'release', project: 'Collab', isDefault: true, owner: 'Cem' }] });
  try {
    assert.match(document.body.textContent, /Agent.*Release seat of Collab, default for its role · Owner: Cem/);
    await React.act(async () => buttons('Retire seat')[0].click());
    answer = { ok: true, json: async () => ({ unassigned: [] }) };
    await React.act(async () => buttons('Confirm: Retire seat')[0].click());
    assert.deepEqual(calls.at(-1).slice(0, 2), ['/api/workspaces/w1/agent-seats/s1', 'DELETE']);
  } finally { await React.act(async () => root.unmount()); }
});

test('the create-seat form offers a new catalogue entry', async () => {
  const root = await render({ workspaces: [], tokens: [], projects: [{ id: 'p1', name: 'Collab' }] });
  try {
    await React.act(async () => buttons('New token')[0].click());
    await choose(0, 'p1');
    const options = [...document.querySelectorAll('select')[1].options];
    assert.ok(options.some(option => option.value === extraRole.id && option.textContent === extraRole.name));
  } finally { await React.act(async () => root.unmount()); }
});

test('a Planner seat is created from the form and reads its project\'s repository', async () => {
  const root = await render({ workspaces: [], tokens: [], projects: [{ id: 'p1', name: 'Collab' }], people: [] });
  try {
    await React.act(async () => buttons('New token')[0].click());
    await type('agent-token-name', 'plan');
    await choose(0, 'p1');
    await choose(1, 'planner');
    await shows('From the project acme/app. Nothing to pick, nothing to type.');
    answer = { ok: true, json: async () => ({ seat: { id: 's1' }, token: { name: 'plan', token: 'collab_at_seat' } }) };
    await React.act(async () => buttons('Create seat')[0].click());
    assert.deepEqual(calls.at(-1), ['/api/workspaces/w1/agent-seats', 'POST', { name: 'plan', projectId: 'p1', role: 'planner', ownerId: null, expiresInDays: 90 }]);
    await React.act(async () => buttons('Done')[0].click());
  } finally { await React.act(async () => root.unmount()); }
});

for (const [role, name] of [['docs', 'Documentation Manager'], ['changelog', 'Changelog Manager'], ['architect', 'Software Architect']]) {
  test(`the create-seat form offers and submits the ${name} role`, async () => {
    const root = await render({ workspaces: [], tokens: [], projects: [{ id: 'p1', name: 'Collab' }], people: [] });
    try {
      await React.act(async () => buttons('New token')[0].click());
      await type('agent-token-name', name);
      await choose(0, 'p1');
      const options = [...document.querySelectorAll('select')[1].options];
      assert.ok(options.some(option => option.value === role && option.textContent === name));
      await choose(1, role);
      await shows('From the project acme/app. Nothing to pick, nothing to type.');
      answer = { ok: true, json: async () => ({ seat: { id: 's1' }, token: { name, token: 'collab_at_seat' } }) };
      await React.act(async () => buttons('Create seat')[0].click());
      assert.deepEqual(calls.at(-1), ['/api/workspaces/w1/agent-seats', 'POST', { name, projectId: 'p1', role, ownerId: null, expiresInDays: 90 }]);
    } finally { await React.act(async () => root.unmount()); }
  });
}

test("the organisation's own roles are offered under Your organisation, and a seat with one is listed by its name (CLB-628)", async () => {
  const customRoles = [{ id: 'cr1', name: 'QA Tester', baseRole: 'developer' }, { id: 'cr2', name: 'Night lead', baseRole: 'lead' }];
  const listed = { id: 's1', name: 'qa', role: 'developer', customRole: 'QA Tester', project: 'Collab', isDefault: false, owner: 'Cem' };
  const root = await render({ workspaces: [], projects: [{ id: 'p1', name: 'Collab' }], people: [], customRoles, seats: [listed],
    tokens: [{ ...token('t1', 'qa', []), seat: { id: 's1', role: 'developer', customRole: 'QA Tester', project: 'Collab', isDefault: false, retired: false, owner: 'Cem' } }] });
  try {
    assert.match(document.body.textContent, /qa.*QA Tester seat of Collab · Owner: Cem/);
    assert.doesNotMatch(document.body.textContent, /Developer seat of Collab/);

    await React.act(async () => buttons('New token')[0].click());
    await type('agent-token-name', 'qa-2');
    await choose(0, 'p1');
    const group = document.querySelectorAll('select')[1].querySelector('optgroup');
    assert.deepEqual([...group.querySelectorAll('option')].map(option => [option.disabled ? null : option.value, option.textContent]),
      [[null, 'Your organisation'], ['custom:cr1', 'QA Tester'], ['custom:cr2', 'Night lead']]);
    // The base role decides what the seat needs: a lead-like role works in no repository.
    await choose(1, 'custom:cr2');
    assert.match(document.querySelector('[role=dialog]').textContent, /No repository needed A Night lead decides and writes/);
    await choose(1, 'custom:cr1');
    await shows('From the project acme/app. Nothing to pick, nothing to type.');
    answer = { ok: true, json: async () => ({ seat: { id: 's2' }, token: { name: 'qa-2', token: 'collab_at_seat' } }) };
    await React.act(async () => buttons('Create seat')[0].click());
    // The role is the custom one; the server gives the seat its base role.
    assert.deepEqual(calls.at(-1), ['/api/workspaces/w1/agent-seats', 'POST', { name: 'qa-2', projectId: 'p1', customRoleId: 'cr1', ownerId: null, expiresInDays: 90 }]);
    await React.act(async () => buttons('Done')[0].click());
  } finally { await React.act(async () => root.unmount()); }
});

test('without roles of its own, the form has no Your organisation group', async () => {
  const root = await render({ workspaces: [], tokens: [], projects: [{ id: 'p1', name: 'Collab' }] });
  try {
    await React.act(async () => buttons('New token')[0].click());
    await choose(0, 'p1');
    assert.equal(document.querySelectorAll('select')[1].querySelector('optgroup'), null);
  } finally { await React.act(async () => root.unmount()); }
});

// CLB-616: the scope is a two-way switch, "One project" or "Whole workspace", offered only to who manages the
// workspace's permissions. A workspace seat names no project and picks no repository; release stays one per project.
test('without the permission to manage workspace permissions, the form offers no scope switch', async () => {
  const root = await render({ workspaces: [], tokens: [], projects: [{ id: 'p1', name: 'Collab' }] });
  try {
    await React.act(async () => buttons('New token')[0].click());
    assert.equal(buttons('Whole workspace').length, 0);
    assert.equal(buttons('One project').length, 0);
    assert.doesNotMatch(document.querySelector('[role=dialog]').textContent, /Whole workspace/);
  } finally { await React.act(async () => root.unmount()); }
});

test('a seat for the whole workspace is created from the switch: no project, the repository comes from each issue', async () => {
  const root = await render({ workspaces: [], tokens: [], projects: [{ id: 'p1', name: 'Collab' }], people: [{ id: 'u1', name: 'Cem' }], canScopeWorkspace: true });
  try {
    await React.act(async () => buttons('New token')[0].click());
    await type('agent-token-name', 'dev-all');
    // One project is the default, and the project list still offers a plain token.
    assert.equal(buttons('One project')[0].getAttribute('aria-pressed'), 'true');
    assert.equal(buttons('Whole workspace')[0].getAttribute('aria-pressed'), 'false');
    assert.equal(document.querySelectorAll('select')[0].value, 'none');

    await React.act(async () => buttons('Whole workspace')[0].click());
    assert.equal(buttons('Whole workspace')[0].getAttribute('aria-pressed'), 'true');
    const dialog = () => document.querySelector('[role=dialog]').textContent;
    assert.match(dialog(), /This seat can be assigned issues from every project in the workspace\. Only people who manage workspace permissions can create it\./);
    assert.match(dialog(), /From each issue A workspace seat gets the repository of the project its issue is in, run by run\./);
    assert.equal(document.querySelectorAll('select').length, 3, 'role, owner, expiry: no project to pick');
    assert.equal(document.querySelectorAll('select')[0].value, 'developer');
    await choose(1, 'u1');
    answer = { ok: true, json: async () => ({ seat: { id: 's1' }, token: { name: 'dev-all', token: 'collab_at_seat' } }) };
    await React.act(async () => buttons('Create seat')[0].click());
    assert.deepEqual(calls.at(-1), ['/api/workspaces/w1/agent-seats', 'POST', { name: 'dev-all', scope: 'workspace', role: 'developer', ownerId: 'u1', expiresInDays: 90 }]);
    await React.act(async () => buttons('Done')[0].click());

    // The next seat starts at One project again, and a project seat is sent as before.
    await React.act(async () => buttons('New token')[0].click());
    assert.equal(buttons('One project')[0].getAttribute('aria-pressed'), 'true');
    await type('agent-token-name', 'dev-one');
    await choose(0, 'p1');
    await shows('From the project acme/app. Nothing to pick, nothing to type.');
    answer = { ok: true, json: async () => ({ seat: { id: 's2' }, token: { name: 'dev-one', token: 'collab_at_seat' } }) };
    await React.act(async () => buttons('Create seat')[0].click());
    assert.deepEqual(calls.at(-1), ['/api/workspaces/w1/agent-seats', 'POST', { name: 'dev-one', projectId: 'p1', role: 'developer', ownerId: null, expiresInDays: 90 }]);
    await React.act(async () => buttons('Done')[0].click());
  } finally { await React.act(async () => root.unmount()); }
});

test('the release role cannot have the whole workspace as its scope, and the form says why', async () => {
  const customRoles = [{ id: 'cr1', name: 'Shipper', baseRole: 'release' }, { id: 'cr2', name: 'QA Tester', baseRole: 'developer' }];
  const root = await render({ workspaces: [], tokens: [], projects: [{ id: 'p1', name: 'Collab' }], customRoles, canScopeWorkspace: true });
  try {
    await React.act(async () => buttons('New token')[0].click());
    await type('agent-token-name', 'rel');
    const option = value => [...document.querySelectorAll('select')[0].options].find(row => row.value === value);
    await React.act(async () => buttons('Whole workspace')[0].click());
    // Release, and a role of the organisation's built on it, cannot be picked here; the others can.
    assert.equal(option('release').disabled, true);
    assert.equal(option('custom:cr1').disabled, true);
    assert.equal(option('developer').disabled, false);
    assert.equal(option('custom:cr2').disabled, false);
    const why = /A release seat belongs to one project: it deploys that project's changes, so it cannot have the whole workspace as its scope\./;
    assert.match(document.querySelector('[role=dialog]').textContent, why);

    // Release picked for one project, then the scope switched: the reason is shown and nothing can be created.
    await React.act(async () => buttons('One project')[0].click());
    await choose(0, 'p1');
    await choose(1, 'release');
    await React.act(async () => buttons('Whole workspace')[0].click());
    assert.match(document.querySelector('[role=alert]').textContent, why);
    assert.equal(buttons('Create seat')[0].disabled, true);
    const sent = calls.length;
    await React.act(async () => buttons('Create seat')[0].click());
    assert.equal(calls.length, sent);

    // Another role, and the seat can be created.
    await choose(0, 'developer');
    assert.equal(document.querySelector('[role=alert]'), null);
    assert.equal(buttons('Create seat')[0].disabled, false);
  } finally { await React.act(async () => root.unmount()); }
});
