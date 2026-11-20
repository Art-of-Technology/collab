const { assert, test, load } = require('../security/helpers.cjs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<div id="root"></div>', { url: 'https://collab.test/workspace/projects/project/settings?tab=github' });
global.window = dom.window; global.document = dom.window.document; global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { createRoot } = require('react-dom/client');

const requests = [];
const repo = (id, name) => ({ id, name, full_name: 'org/' + name, description: null, private: false, html_url: 'https://github.test/org/' + name, default_branch: 'main', updated_at: '2026-11-01T00:00:00Z', language: null, stargazers_count: 0, owner: { login: 'org', avatar_url: '' }, permissions: { admin: true, push: true, pull: true } });
const icons = new Proxy({}, { get: () => () => null });
const Component = load('src/components/github/GitHubOAuthConnection.tsx', {
  react: React, 'react/jsx-runtime': require('react/jsx-runtime'),
  '@tanstack/react-query': { useQueryClient: () => ({ invalidateQueries: async () => {} }) },
  '@/components/ui/button': { Button: ({ variant, size, ...props }) => React.createElement('button', props) },
  '@/components/ui/input': { Input: props => React.createElement('input', props) },
  'lucide-react': icons, sonner: { toast: { error() {}, success() {}, warning() {} } }, '@/lib/utils': { cn: () => '' },
}, {
  window: dom.window, URL, URLSearchParams, AbortController, setTimeout, clearTimeout, console: { log() {}, error() {} },
  fetch: async url => {
    requests.push(url);
    const query = new URL(url, 'https://collab.test').searchParams;
    const repositories = query.get('search') ? [repo(9, 'needle')] : query.get('page') === '2' ? [repo(2, 'second-page')] : [repo(1, 'first-page')];
    return { ok: true, json: async () => ({ githubUser: 'alice', repositories, hasMore: !query.get('search') && query.get('page') !== '2' }) };
  },
}).GitHubOAuthConnection;

const settle = ms => React.act(() => new Promise(resolve => setTimeout(resolve, ms)));
const names = () => [...document.querySelectorAll('h4, h3')].map(node => node.textContent).filter(text => /page|needle/.test(text));
const shown = name => document.body.textContent.includes(name);

test('Load More asks for the next page and search asks the server', async () => {
  await React.act(async () => createRoot(document.getElementById('root')).render(React.createElement(Component, { projectId: 'p1' })));
  await settle(20);
  assert.ok(shown('first-page'));

  const more = [...document.querySelectorAll('button')].find(button => button.textContent.includes('Load More'));
  await React.act(async () => more.click());
  await settle(20);
  assert.equal(requests.at(-1), '/api/github/oauth/repositories?page=2&search=');
  assert.ok(shown('first-page') && shown('second-page'), 'second page is added below the first');

  const input = document.querySelector('input');
  const setValue = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set;
  await React.act(async () => { setValue.call(input, 'needle'); input.dispatchEvent(new dom.window.Event('input', { bubbles: true })); });
  await settle(400);
  assert.equal(requests.at(-1), '/api/github/oauth/repositories?page=1&search=needle');
  assert.ok(shown('needle') && !shown('first-page'));
});
