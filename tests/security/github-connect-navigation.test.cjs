const { assert, test, load } = require('./helpers.cjs');

function fixture({ ok = true, error, callbackError } = {}) {
  const effects = [], events = [], errors = [];
  const jsx = (type, props) => ({ type, props });
  const window = {
    location: { href: 'https://collab.example/workspace/projects/project/settings?tab=github' + (callbackError ? '&github_error=GitHub%20authorization%20was%20not%20completed' : ''), assign: url => events.push(['navigate', url]) },
    history: { state: null, replaceState: (_, __, url) => events.push(['replace', String(url)]) },
    open: () => { events.push(['popup']); return null; },
  };
  const deps = {
    react: { useState: value => [value, () => {}], useEffect: effect => effects.push(effect) },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    '@/components/ui/button': { Button: 'button' }, '@/components/ui/input': { Input: 'input' },
    'lucide-react': {}, sonner: { toast: { error: value => errors.push(value) } }, '@/lib/utils': { cn: () => '' },
  };
  const Component = load('src/components/github/GitHubOAuthConnection.tsx', deps, {
    window, URL, URLSearchParams, console: { log() {}, error() {} },
    setInterval: () => events.push(['timer']),
    fetch: async url => {
      events.push(['fetch', url]);
      if (error) throw new Error('network failed');
      return { ok, json: async () => ({ authUrl: 'https://github.com/login/oauth/authorize?state=sealed', error: 'Unauthorized', repositories: [] }) };
    },
  }).GitHubOAuthConnection;
  const tree = Component({ projectId: 'project-1' });
  function find(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'button') return node;
    for (const child of [node.props?.children].flat()) { const found = find(child); if (found) return found; }
  }
  return { events, errors, effects, click: () => find(tree).props.onClick() };
}

test('GitHub connect navigates in the current tab even when popups are blocked', async () => {
  const f = fixture(); await f.click();
  assert.deepEqual(f.events, [
    ['fetch', '/api/github/oauth/auth-url?state=project%3Aproject-1'],
    ['navigate', 'https://github.com/login/oauth/authorize?state=sealed'],
  ]);
  assert.deepEqual(f.errors, []);
});
for (const options of [{ ok: false }, { error: true }]) {
  test('failed authorization start stays on the page and reports an error: ' + JSON.stringify(options), async () => {
    const f = fixture(options); await f.click();
    assert.equal(f.events.some(([type]) => ['navigate', 'popup', 'timer'].includes(type)), false);
    assert.equal(f.errors.length, 1);
  });
}
test('returned consent failure is visible and removed from URL without removing the settings tab', async () => {
  const f = fixture({ callbackError: true }); f.effects[0]();
  assert.deepEqual(f.errors, ['GitHub authorization was not completed']);
  const replaced = f.events.find(([type]) => type === 'replace');
  assert.ok(replaced);
  assert.equal(new URL(replaced[1]).searchParams.get('tab'), 'github');
  assert.equal(new URL(replaced[1]).searchParams.has('github_error'), false);
});
