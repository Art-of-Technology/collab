const { assert, test, load } = require('../security/helpers.cjs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<div id="root"></div>', { url: 'https://collab.test/' });
global.window = dom.window; global.document = dom.window.document; global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { createRoot } = require('react-dom/client');

const members = [
  { id: 'cem', name: 'Cem', email: 'cem@example.test' },
  { id: 'dev1', name: 'dev-one', email: null, agentSeat: { projectId: 'p1', role: 'developer', retiredAt: null } },
  { id: 'dev2', name: 'dev-two', email: null, agentSeat: { projectId: 'p2', role: 'release', retiredAt: null } },
  { id: 'old1', name: 'old-one', email: null, agentSeat: { projectId: 'p1', role: 'developer', retiredAt: '2026-11-15T00:00:00.000Z' } },
  { id: 'qa1', name: 'qa-one', email: null, agentSeat: { projectId: 'p3', role: 'developer', retiredAt: null, customRole: { name: 'QA Tester' } } },
];
const shown = ({ children }) => React.createElement('div', null, children);
const { IssueAssigneeSelector } = load('src/components/issue/selectors/IssueAssigneeSelector.tsx', {
  react: React, 'react/jsx-runtime': require('react/jsx-runtime'),
  '@/hooks/queries/useWorkspaceSelectorData': { useWorkspaceMemberUsers: () => ({ data: members, isLoading: false }) },
  'next-auth/react': { useSession: () => ({ data: { user: { id: 'cem' } } }) },
  '@/components/ui/popover': { Popover: shown, PopoverContent: ({ children }) => React.createElement('div', { id: 'choices' }, children), PopoverTrigger: ({ children }) => React.createElement('div', { id: 'current' }, children) },
  '@/components/ui/button': { Button: ({ children, onClick }) => React.createElement('button', { onClick }, children) },
  '@/components/ui/user-avatar': { UserAvatar: () => null }, '@/components/ui/custom-avatar': { CustomAvatar: () => null },
  '@/components/ui/input': { Input: () => null },
  'lucide-react': new Proxy({}, { get: () => () => null }),
  '@/lib/utils': { cn: (...names) => names.filter(Boolean).join(' ') },
});

async function choices(props) {
  const root = createRoot(document.getElementById('root'));
  await React.act(async () => root.render(React.createElement(IssueAssigneeSelector, { onChange() {}, workspaceId: 'w1', ...props })));
  const result = { names: [...document.querySelectorAll('#choices button')].map(button => button.textContent), current: document.getElementById('current').textContent };
  await React.act(async () => root.unmount());
  return result;
}

test('the assignee picker badges a seat and offers it only for issues of its own project', async () => {
  assert.deepEqual((await choices({ projectId: 'p1' })).names, ['No assignee✓', 'Cem (You)', 'dev-onedeveloper seat']);
  assert.deepEqual((await choices({ projectId: 'p2' })).names, ['No assignee✓', 'Cem (You)', 'dev-tworelease seat']);
  assert.deepEqual((await choices({})).names, ['No assignee✓', 'Cem (You)'], 'no project chosen yet: no seat fits');
});

test('an issue that already has a seat the picker would not offer still shows who has it', async () => {
  const picker = await choices({ projectId: 'p1', value: 'dev2' });
  assert.equal(picker.current, 'dev-two');
  assert.ok(!picker.names.some(name => name.startsWith('dev-two')));
});

test('a current assignee absent from active members remains visible', async () => {
  const picker = await choices({ projectId: 'p1', value: 'inactive', currentAssignee: { id: 'inactive', name: 'Retired agent' } });
  assert.equal(picker.current, 'Retired agent');
  assert.ok(!picker.names.some(name => name.includes('Retired agent')));
});

test("a seat with the organisation's own role is badged by that role's name (CLB-628)", async () => {
  assert.deepEqual((await choices({ projectId: 'p3' })).names, ['No assignee✓', 'Cem (You)', 'qa-oneQA Tester seat']);
});

test('a seat of the whole workspace is offered for an issue of any project, once the project is known (CLB-615)', async () => {
  members.push({ id: 'ws1', name: 'ws-dev', email: null, agentSeat: { projectId: null, role: 'developer', retiredAt: null } });
  try {
    assert.deepEqual((await choices({ projectId: 'p1' })).names, ['No assignee✓', 'Cem (You)', 'dev-onedeveloper seat', 'ws-devdeveloper seat']);
    assert.deepEqual((await choices({ projectId: 'p2' })).names, ['No assignee✓', 'Cem (You)', 'dev-tworelease seat', 'ws-devdeveloper seat']);
    assert.deepEqual((await choices({})).names, ['No assignee✓', 'Cem (You)']);
  } finally {
    members.pop();
  }
});
