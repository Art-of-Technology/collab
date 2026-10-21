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
    '@/components/git-providers/GitConnections': { GitConnections: () => 'Git provider connections' },
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

async function settingsFixture(query, connected = false) {
  const errors = [], requests = [], instances = new Map();
  let current, cursor, pending = [], tree;
  const jsx = (type, props) => ({ type, props });
  const window = {
    location: { href: 'https://collab.example/workspace/projects/project/settings' + query },
    history: { state: null, replaceState: (_, __, url) => { window.location.href = String(url); } },
  };
  const react = {
    useState(initial) {
      const slots = current, index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
    },
    useEffect(effect, dependencies) {
      const index = cursor++, previous = current[index];
      if (!previous || dependencies.some((value, i) => !Object.is(value, previous[i]))) pending.push(effect);
      current[index] = dependencies;
    },
  };
  const deps = {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx },
    'next/navigation': { useRouter: () => ({}), useSearchParams: () => new URL(window.location.href).searchParams },
    'next/link': { default: 'a' },
    '@/components/git-providers/GitConnections': { GitConnections: () => 'Git provider connections' },
    '@/components/ui/button': { Button: 'button' }, '@/components/ui/input': { Input: 'input' },
    '@/components/ui/label': { Label: 'label' }, '@/components/ui/textarea': { Textarea: 'textarea' },
    '@/components/ui/alert-dialog': {}, 'lucide-react': {},
    '@/hooks/use-toast': { useToast: () => ({ toast() {} }) },
    '@/context/WorkspaceContext': { useWorkspace: () => ({ currentWorkspace: { slug: 'workspace' } }) },
    '@/hooks/queries/useProjects': { useProject: () => ({ data: project, isLoading: false, refetch() {} }) },
    '@/constants/project-statuses': { DEFAULT_PROJECT_STATUSES: [] },
    '@/lib/shared-issue-key-utils': {}, '@/lib/utils': { cn: () => '' },
    sonner: { toast: { error: value => errors.push(value) } },
  };
  const project = { id: 'project-1', name: 'Project', repository: null, statuses: [] };
  const globals = {
    window, URL, console: { log() {}, error() {} },
    fetch: async url => {
      requests.push(url);
      return { ok: connected, json: async () => ({ githubUser: 'octocat', repositories: [], hasMore: false }) };
    },
  };
  deps['@/components/github/GitHubOAuthConnection'] = load('src/components/github/GitHubOAuthConnection.tsx', deps, globals);
  const Client = load('src/app/(main)/[workspaceId]/projects/[projectSlug]/settings/ProjectSettingsClient.tsx', deps, globals).default;
  const Page = load('src/app/(main)/[workspaceId]/projects/[projectSlug]/settings/page.tsx', {
    ...deps, './ProjectSettingsClient': { default: Client }, '@/lib/auth': { authConfig: {} },
    '@/lib/request-session': { getServerSession: async () => ({ user: { id: 'alice' } }) },
  }).default;
  const root = await Page({ params: Promise.resolve({ workspaceId: 'workspace', projectSlug: 'project' }) });
  function render(node) {
    if (Array.isArray(node)) return node.map(render);
    if (!node || typeof node !== 'object') return node;
    if (typeof node.type === 'function') {
      if (!instances.has(node.type)) instances.set(node.type, []);
      current = instances.get(node.type); cursor = 0;
      return render(node.type(node.props));
    }
    return { ...node, props: { ...node.props, children: render(node.props?.children) } };
  }
  async function settle() {
    for (let i = 0; i < 6; i++) {
      tree = render(root);
      const effects = pending; pending = [];
      effects.forEach(effect => effect());
      await new Promise(resolve => setImmediate(resolve));
    }
  }
  function nodes(node) {
    if (Array.isArray(node)) return node.flatMap(nodes);
    if (!node || typeof node !== 'object') return [];
    return [node, ...nodes(node.props?.children)];
  }
  const text = node => Array.isArray(node) ? node.map(text).join('') : node && typeof node === 'object' ? text(node.props?.children) : typeof node === 'string' ? node : '';
  await settle();
  return { errors, requests, window, text: () => text(tree), async select(label) {
    const button = nodes(tree).find(node => node.type === 'button' && text(node) === label);
    assert.ok(button, 'settings tab exists: ' + label);
    button.props.onClick(); await settle();
  } };
}

for (const message of ['GitHub authorization was not completed', 'No authorization code received', 'OAuth authentication failed']) {
  test('settings return page exposes callback failure: ' + message, async () => {
    const f = await settingsFixture('?tab=github&github_error=' + encodeURIComponent(message));
    assert.deepEqual(f.errors, [message]);
    assert.match(f.text(), /Connect your GitHub account/);
    assert.ok(f.requests.includes('/api/github/oauth/repositories'));
    const url = new URL(f.window.location.href);
    assert.equal(url.searchParams.get('tab'), 'github');
    assert.equal(url.searchParams.has('github_error'), false);
  });
}

test('settings return page exposes repository selection after authorization and permits tab changes', async () => {
  const f = await settingsFixture('?tab=github&github_connected=true&github_user=octocat', true);
  assert.match(f.text(), /Select Repository/);
  assert.match(f.text(), /Git provider connections/);
  assert.match(f.text(), /@octocat/);
  assert.deepEqual(f.errors, []);
  assert.equal(new URL(f.window.location.href).searchParams.has('github_connected'), false);
  assert.equal(new URL(f.window.location.href).searchParams.has('github_user'), false);
  await f.select('General');
  assert.doesNotMatch(f.text(), /Select Repository/);
  await f.select('Git providers');
  assert.match(f.text(), /Select Repository/);
  assert.match(f.text(), /Git provider connections/);
});

for (const query of ['', '?tab=unknown']) {
  test('ordinary settings visit keeps General and permits GitHub selection: ' + query, async () => {
    const f = await settingsFixture(query);
    assert.deepEqual(f.requests, []);
    assert.doesNotMatch(f.text(), /Connect your GitHub account/);
    await f.select('Git providers');
    assert.match(f.text(), /Connect your GitHub account/);
    assert.ok(f.requests.includes('/api/github/oauth/repositories'));
  });
}
