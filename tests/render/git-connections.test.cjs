const { assert, test, load } = require('../security/helpers.cjs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<div id="root"></div>', { url: 'https://collab.test/project/settings' });
global.window = dom.window; global.document = dom.window.document; global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { createRoot } = require('react-dom/client');
const calls = [], notices = [];
let connected = true, rejectRefresh = false;
const instances = [{ provider: 'forgejo', baseUrl: 'https://forge.test', label: 'Forgejo' }];
const repository = { id: 'repo', path: 'team/repo', name: 'repo', url: 'https://forge.test/team/repo' };
const connection = () => ({ id: 'c1', provider: 'forgejo', baseUrl: 'https://forge.test', repositoryPath: repository.path, url: repository.url, name: 'repo', isActive: connected, canManage: true, syncedAt: '2026-10-21T12:00:00Z', activity: [{ id: 'a1', kind: 'commit', title: 'Saved work', url: repository.url + '/commit/sha', date: '2026-10-21T12:00:00Z' }] });
const Component = load('src/components/git-providers/GitConnections.tsx', {
  react: React, 'react/jsx-runtime': require('react/jsx-runtime'),
  '@/components/ui/button': { Button: ({ variant, ...props }) => React.createElement('button', props) },
  '@/components/ui/input': { Input: props => React.createElement('input', props) },
  '@/components/ui/label': { Label: props => React.createElement('label', props) },
  sonner: { toast: { success: message => notices.push(message), error: message => notices.push(message) } },
}, { fetch: async (url, options) => {
  if (options?.method !== 'POST') return { ok: true, json: async () => ({ instances, connections: [connection()] }) };
  const body = JSON.parse(options.body); calls.push(body);
  if (body.action === 'disconnect') connected = false;
  if (body.action === 'connect') connected = true;
  if (body.action === 'refresh' && rejectRefresh) return { ok: false, json: async () => ({ error: 'Token revoked. Reconnect.' }) };
  return { ok: true, json: async () => body.action === 'list' ? { repositories: [repository], nextPage: null } : {} };
} }).GitConnections;
const button = text => [...document.querySelectorAll('button')].find(b => b.textContent === text);
async function click(text) { const found = button(text); assert.ok(found, text); await React.act(async () => found.click()); }
async function input(id, value) {
  const element = document.getElementById(id); assert.ok(element, id);
  await React.act(async () => {
    const prototype = element.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value);
    element.dispatchEvent(new window.Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
}
test('project connection UI browses, connects, refreshes and disconnects while retaining history', async () => {
  const root = createRoot(document.getElementById('root'));
  try {
    await React.act(async () => root.render(React.createElement(Component, { projectId: 'project' })));
    assert.match(document.body.textContent, /Saved work/);
    await input('git-instance', 'forgejo:https://forge.test');
    await input('git-token', 'secret');
    assert.equal(button('Browse repositories').disabled, false);
    await click('Browse repositories');
    assert.equal(calls.at(-1).action, 'list'); assert.equal(calls.at(-1).credentials.token, 'secret');
    await click('Connect repo');
    assert.equal(calls.at(-1).action, 'connect'); assert.equal(calls.at(-1).repositoryPath, 'team/repo');
    assert.equal(document.getElementById('git-token').value, '');
    await click('Refresh'); assert.equal(calls.at(-1).action, 'refresh');
    rejectRefresh = true; await click('Refresh'); assert.equal(notices.at(-1), 'Token revoked. Reconnect.');
    await click('Disconnect'); assert.equal(calls.at(-1).action, 'disconnect');
    assert.match(document.body.textContent, /Disconnected — saved activity/); assert.match(document.body.textContent, /Saved work/);
    assert.equal(button('Refresh'), undefined);
    assert.equal(document.body.textContent.includes('secret'), false);
  } finally { await React.act(async () => root.unmount()); dom.window.close(); }
});
