const { assert, test, load } = require('../security/helpers.cjs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<div id="root"></div>', { url: 'https://collab.test/workspaces/w1' });
global.window = dom.window; global.document = dom.window.document; global.IS_REACT_ACT_ENVIRONMENT = true;
// The screen never asks the browser to confirm: a native dialog fails the test.
dom.window.confirm = dom.window.alert = () => { throw new Error('No browser dialog is used'); };
const React = require('react');
const { createRoot } = require('react-dom/client');

const calls = [], removals = [];
let answer = { ok: true, json: async () => ({}) }, removal = async () => ({ success: true });
const fetch = async (url, options) => { calls.push([url, options.method, JSON.parse(options.body)]); if (answer instanceof Error) throw answer; return answer; };

const plain = tag => ({ children }) => React.createElement(tag, null, children);
const parts = names => Object.fromEntries(names.map(name => [name, plain('div')]));
const Button = React.forwardRef(({ asChild, variant, size, className, children, ...props }, ref) =>
  asChild ? children : React.createElement('button', { ...props, ref }, children));
const SelectTrigger = () => null;
const ui = {
  react: React, 'react/jsx-runtime': require('react/jsx-runtime'),
  'next/link': { default: ({ href, children }) => React.createElement('a', { href }, children) },
  'lucide-react': new Proxy({}, { get: () => () => null }),
  '@/components/ui/button': { Button },
  '@/components/ui/badge': { Badge: ({ title, children }) => React.createElement('span', { title }, children) },
  '@/components/ui/user-avatar': { UserAvatar: () => null },
  '@/components/ui/custom-avatar': { CustomAvatar: () => null },
  // The shared select, as a native one named by its trigger.
  '@/components/ui/select': { SelectTrigger, SelectValue: () => null, SelectContent: ({ children }) => children,
    SelectItem: ({ value, children }) => React.createElement('option', { value }, children),
    Select: ({ value, onValueChange, disabled, children }) => {
      const kids = React.Children.toArray(children);
      const trigger = kids.find(kid => kid.type === SelectTrigger);
      return React.createElement('select', { value, disabled, 'aria-label': trigger?.props['aria-label'], onChange: event => onValueChange(event.target.value) }, kids.filter(kid => kid !== trigger));
    } },
};
const MemberRow = load('src/components/workspace/MemberRow.tsx', {
  ...ui,
  '@/lib/permission-types': load('src/lib/permission-types.ts'),
  '@/actions/workspace': { removeWorkspaceMember: async input => { removals.push(input); return removal(); } },
  // The action's refusal is an Error from this realm, as it is in the browser.
}, { fetch, Error });

let current;
const Screen = load('src/components/workspace/WorkspaceDetailClient.tsx', {
  ...ui,
  './MemberRow': MemberRow,
  'next/image': { default: () => null },
  'next/navigation': { useRouter: () => ({ push() {} }) },
  '@/components/ui/tabs': { Tabs: plain('div'), TabsList: plain('div'), TabsTrigger: plain('div'), TabsContent: plain('div') },
  '@/components/ui/card': parts(['Card', 'CardContent', 'CardDescription', 'CardHeader', 'CardTitle']),
  '@/components/ui/dialog': { ...parts(['DialogContent', 'DialogDescription', 'DialogFooter', 'DialogHeader', 'DialogTitle']), Dialog: () => null },
  '@/components/ui/input': { Input: () => null }, '@/components/ui/label': { Label: () => null },
  '@/app/(main)/workspaces/[workspaceId]/WorkspaceDetailsEditor': { default: () => null },
  '@/components/workspace/components/invitation': { InvitationsTab: () => null },
  './WorkspaceFeatureSettings': { WorkspaceFeatureSettings: () => null },
  '@/hooks/queries/useWorkspace': { useDetailedWorkspaceById: () => ({ data: current }), workspaceKeys: { detailedWorkspace: id => ['workspaces', 'detailed', id] } },
  '@/hooks/use-workspace-permissions': { useWorkspacePermissions: () => ({}) },
  '@/hooks/use-permissions': { useCanInviteMembers: () => ({ hasPermission: false }), useCanManageMembers: () => ({ hasPermission: true }) },
  '@/components/layout/PageHeader': { default: () => null },
  '@tanstack/react-query': { useQueryClient: () => ({ invalidateQueries: async () => {} }) },
  '@/hooks/use-toast': { toast: () => {} },
}, { fetch }).default;

const person = (id, name, role, level, more = {}) => ({ id: `m-${id}`, role, status: true, level, agent: false, mayAct: false,
  user: { id, name, email: `${id}@acme.test` }, ...more });
// Alex is the primary owner. The stored owner id is there to show the screen does not read it.
const people = () => [
  person('alex', 'Alex Kay', 'OWNER', 'PRIMARY_OWNER'),
  person('sam', 'Sam Roe', 'owner', 'OWNER'),
  person('robin', 'Robin Lee', 'ADMIN', 'ADMIN', { mayAct: true }),
  person('kim', 'Kim Park', 'MEMBER', 'STANDARD', { mayAct: true }),
  person('pat', 'Pat Jones', 'Support', 'STANDARD', { mayAct: true, status: false }),
  person('seat', 'Sample Developer', 'MEMBER', 'STANDARD', { agent: true, user: { id: 'seat', name: 'Sample Developer', email: null } }),
];
const workspace = more => ({ id: 'w1', name: 'Acme', slug: 'acme', ownerId: 'robin', isOwner: false, isMember: true, canManage: false,
  viewerLevel: 'OWNER', rolesViewerMayGrant: ['ADMIN', 'MEMBER', 'Support'], invitations: [], members: people(), ...more });

async function render(data) {
  current = data;
  const root = createRoot(document.getElementById('root'));
  await React.act(async () => root.render(React.createElement(Screen, { workspaceId: 'acme', initialWorkspace: data })));
  return root;
}
const row = name => [...document.querySelectorAll('[data-member]')].find(el => el.textContent.includes(name));
const button = (text, within = document) => [...within.querySelectorAll('button')].find(el => el.textContent === text || el.getAttribute('aria-label') === text);
const click = el => React.act(async () => el.click());
const choose = (select, value) => React.act(async () => {
  select.value = value;
  select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
});
const status = () => document.querySelector('[role=status]')?.textContent;
const controls = el => el.querySelectorAll('select, button').length;

test("the workspace's owner has the Primary owner pill and no control", async () => {
  for (const viewer of [{}, { viewerLevel: null, canManage: true, rolesViewerMayGrant: [] }]) {
    const root = await render(workspace(viewer));
    try {
      assert.match(row('Alex Kay').textContent, /Primary owner/);
      assert.equal(controls(row('Alex Kay')), 0);
      assert.equal(button('More actions for Alex Kay'), undefined);
    } finally { await React.act(async () => root.unmount()); }
  }
});

test("a row the viewer may act on has a role select with exactly the roles the viewer may grant; other rows show the role's name", async () => {
  const root = await render(workspace());
  try {
    const selects = [...document.querySelectorAll('select')];
    assert.deepEqual(selects.map(el => el.getAttribute('aria-label')), ['Role of Robin Lee', 'Role of Kim Park']);
    for (const select of selects) assert.deepEqual([...select.options].map(option => [option.value, option.textContent]), [['ADMIN', 'Admin'], ['MEMBER', 'Member'], ['Support', 'Support']]);
    assert.equal(selects[0].value, 'ADMIN');
    // The stored "owner" reads as the level's name; an inactive row says so in words.
    assert.match(row('Sam Roe').textContent, /Owner/);
    assert.doesNotMatch(row('Sam Roe').textContent, /owner/);
    assert.equal(row('Sam Roe').querySelectorAll('select').length, 0);
    assert.match(row('Pat Jones').textContent, /Inactive · Support/);
    assert.equal(row('Pat Jones').querySelectorAll('select').length, 0);

    await choose(selects[1], 'ADMIN');
    assert.deepEqual(calls.at(-1), ['/api/workspaces/w1/members/m-kim/role', 'PUT', { role: 'ADMIN' }]);
    assert.equal(status(), 'Kim Park is now Admin.');
    assert.equal(document.querySelector('[aria-label="Role of Kim Park"]').value, 'ADMIN');

    answer = { ok: false, json: async () => ({ error: 'Only an Owner can grant the Admin role' }) };
    await choose(document.querySelector('[aria-label="Role of Robin Lee"]'), 'MEMBER');
    assert.equal(status(), 'Only an Owner can grant the Admin role');
    assert.equal(document.querySelector('[aria-label="Role of Robin Lee"]').value, 'ADMIN', 'a refused change keeps the row as it was');
  } finally { answer = { ok: true, json: async () => ({}) }; await React.act(async () => root.unmount()); }
});

test('editable rows select the stored built-in or exact custom role', async () => {
  const members = [
    person('sam', 'Sam Roe', 'owner', 'OWNER', { mayAct: true }),
    person('pat', 'Pat Jones', 'Support Team', 'STANDARD', { mayAct: true }),
  ];
  const root = await render(workspace({ members, viewerLevel: 'PRIMARY_OWNER', rolesViewerMayGrant: ['MEMBER', 'OWNER', 'Support Team'] }));
  try {
    assert.equal(row('Sam Roe').querySelector('select').selectedOptions[0].textContent, 'Owner');
    assert.equal(row('Pat Jones').querySelector('select').value, 'Support Team');
  } finally { await React.act(async () => root.unmount()); }
});

test('active read-only and inactive badges expose their full role label on hover', async () => {
  const role = 'International Customer Support and Escalations Coordinator';
  const members = [
    person('sam', 'Sam Roe', role, 'STANDARD'),
    person('pat', 'Pat Jones', role, 'STANDARD', { status: false, mayAct: true }),
  ];
  const root = await render(workspace({ members }));
  try {
    for (const [name, label] of [['Sam Roe', role], ['Pat Jones', `Inactive · ${role}`]]) {
      const badge = row(name).querySelector('[title]');
      assert.equal(badge?.title, label);
      assert.equal(badge.textContent, label);
    }
  } finally { await React.act(async () => root.unmount()); }
});

test('the row menu switches a member on or off and removes one after an inline confirmation', async () => {
  const root = await render(workspace());
  try {
    const menu = button('More actions for Kim Park');
    assert.equal(menu.getAttribute('aria-expanded'), 'false');
    await click(menu);
    assert.equal(menu.getAttribute('aria-expanded'), 'true');
    assert.ok([...row('Kim Park').parentElement.querySelectorAll('a')].some(link => link.getAttribute('href') === '/workspaces/acme/settings/members/kim' && link.textContent === 'Other workspaces'));

    await click(button('Deactivate'));
    assert.deepEqual(calls.at(-1), ['/api/workspaces/w1/members/m-kim', 'PATCH', { status: false }]);
    assert.equal(status(), 'Kim Park is now inactive.');
    assert.match(row('Kim Park').textContent, /Inactive · Member/);
    await click(button('Activate'));
    assert.deepEqual(calls.at(-1), ['/api/workspaces/w1/members/m-kim', 'PATCH', { status: true }]);
    assert.equal(status(), 'Kim Park is now active.');

    await click(button('Remove from workspace…'));
    assert.match(document.body.textContent, /Remove Kim Park from Acme\?/);
    assert.equal(document.activeElement.textContent, 'Cancel', 'the confirmation takes the keyboard focus');
    await click(button('Cancel'));
    assert.doesNotMatch(document.body.textContent, /Remove Kim Park from Acme\?/);
    assert.equal(removals.length, 0);

    removal = async () => { throw new Error('You can only remove members below your own level'); };
    await click(button('Remove from workspace…'));
    await click(button('Remove'));
    assert.equal(status(), 'Kim Park was not removed. Reload the page to see who is here now.', 'a production build hides the thrown sentence, so the line does not use it');
    assert.ok(row('Kim Park'), 'a refused removal keeps the row');

    removal = async () => ({ success: true });
    await click(button('Remove'));
    assert.deepEqual({ ...removals.at(-1) }, { workspaceId: 'w1', userId: 'kim' });
    assert.equal(status(), 'Kim Park was removed from Acme.');
    assert.equal(row('Kim Park'), undefined);
  } finally { await React.act(async () => root.unmount()); }
});

test('a lost connection keeps the last confirmed role and status and leaves controls usable', async () => {
  const root = await render(workspace());
  try {
    answer = new TypeError('Failed to fetch');
    const select = row('Kim Park').querySelector('select');
    await choose(select, 'ADMIN');
    assert.match(status(), /could not confirm.*role/i);
    assert.equal(select.value, 'MEMBER');
    assert.equal(select.disabled, false);

    for (const [name, action] of [['Kim Park', 'Deactivate'], ['Pat Jones', 'Activate']]) {
      await click(button(`More actions for ${name}`));
      await click(button(action));
      assert.match(status(), /could not confirm.*status/i);
      assert.equal(button(action).disabled, false);
    }
  } finally { answer = { ok: true, json: async () => ({}) }; await React.act(async () => root.unmount()); }
});

test('a removal that is under way cannot be cancelled on the screen', async () => {
  const root = await render(workspace());
  let release;
  try {
    removal = () => new Promise(done => { release = () => done({ success: true }); });
    await click(button('More actions for Kim Park'));
    await click(button('Remove from workspace…'));
    await click(button('Remove'));
    assert.equal(button('Cancel').disabled, true, 'the question stays until the server has answered');
    await React.act(async () => release());
    assert.equal(row('Kim Park'), undefined);
  } finally { removal = async () => ({ success: true }); await React.act(async () => root.unmount()); }
});

test('one row menu is open at a time, and Escape closes it and gives the focus back', async () => {
  const root = await render(workspace());
  try {
    const robin = button('More actions for Robin Lee'), kim = button('More actions for Kim Park');
    await click(robin);
    await click(kim);
    assert.equal(robin.getAttribute('aria-expanded'), 'false', 'opening another row closes the first');
    assert.equal(kim.getAttribute('aria-expanded'), 'true');
    await React.act(async () => button('Deactivate').dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    assert.equal(kim.getAttribute('aria-expanded'), 'false');
    assert.equal(document.activeElement, kim);
  } finally { await React.act(async () => root.unmount()); }
});

test('agents are listed in their own group with no role and no control', async () => {
  const root = await render(workspace());
  try {
    const agents = document.querySelector('section[aria-label=Agents]');
    assert.match(agents.textContent, /Sample Developer/);
    assert.match(agents.textContent, /agent seat/);
    assert.match(agents.textContent, /no role/);
    assert.equal(controls(agents), 0);
    assert.doesNotMatch(document.querySelector('section[aria-label=People]').textContent, /Sample Developer/);
  } finally { await React.act(async () => root.unmount()); }
});

test('a viewer below Admin sees the list and no control', async () => {
  const members = people().map(member => ({ ...member, mayAct: false }));
  const root = await render(workspace({ viewerLevel: 'STANDARD', rolesViewerMayGrant: [], members }));
  try {
    assert.match(document.body.textContent, /You can see who is here\. Changing roles needs Admin or above\./);
    for (const name of ['Alex Kay', 'Sam Roe', 'Robin Lee', 'Kim Park', 'Pat Jones']) assert.equal(controls(row(name)), 0, name);
    assert.match(row('Robin Lee').textContent, /Admin/);
    assert.match(row('Kim Park').textContent, /Member/);
  } finally { await React.act(async () => root.unmount()); }
});

test("a platform admin's header badge reads Platform admin", async () => {
  // Not a member: no level, and the module gives them no row.
  const members = people().map(member => ({ ...member, mayAct: false }));
  const root = await render(workspace({ viewerLevel: null, canManage: true, isMember: false, rolesViewerMayGrant: [], members }));
  try {
    const badges = [...document.querySelector('h1').parentElement.querySelectorAll('span')].map(el => el.textContent);
    assert.ok(badges.includes('Platform admin'));
    assert.ok(!badges.includes('Admin'));
    // The controls this screen gave them before stay: switching a person on or off, and their other workspaces.
    assert.equal(document.querySelectorAll('select').length, 0);
    await click(button('More actions for Kim Park'));
    assert.ok(button('Deactivate'));
    assert.equal(button('Remove from workspace…'), undefined);
    assert.equal(button('More actions for Sample Developer'), undefined);
  } finally { await React.act(async () => root.unmount()); }
});
