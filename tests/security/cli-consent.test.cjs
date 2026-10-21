const { assert, test, load } = require('./helpers.cjs');

test('OAuth consent displays the actual Notes permissions and preserves read-only requests', () => {
  const { getScopeDescription, normalizeScopes } = load('src/lib/oauth-scopes.ts');
  const permissions = scope => normalizeScopes(scope).map(getScopeDescription);
  const writable = permissions('issues:read issues:write context:read context:write');
  assert.ok(writable.includes('Create and update shared Notes'));
  assert.ok(writable.includes('Create, update and delete issues, relations and work logs, and add comments'));
  const readonly = permissions('  context:read\nissues:read context:read ');
  assert.deepEqual(Array.from(readonly), ['Read shared Notes and project context', 'Read issues, comments, relations and work logs']);
  assert.doesNotMatch(readonly.join(' '), /Create|update|delete|write/);
  assert.deepEqual(Array.from(permissions('new:permission __proto__')), ['Requested permission: new:permission', 'Requested permission: __proto__']);
  assert.deepEqual(Array.from(permissions('user:read projects:read projects:write workspace:write')), ['Read your Collab profile', 'Read projects', 'Create and update projects', 'Update workspace information and create labels']);
});

test('actual consent page renders CLI name and requested Notes scope without inventing write access', () => {
  const jsx = { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
  const text = value => typeof value === 'string' ? value : Array.isArray(value) ? value.map(text).join(' ') : value && typeof value === 'object' ? text(value.props?.children) : '';
  let stateIndex = 0;
  const symbols = new Proxy({}, { get: (_, key) => key });
  let scope = 'context:read';
  const deps = {
    'react/jsx-runtime': jsx,
    react: { useState: value => [stateIndex++ === 2 ? false : value, () => {}], useEffect() {} },
    'next/navigation': { useSearchParams: () => new URLSearchParams({ client_id: 'collab-cli', redirect_uri: 'http://127.0.0.1:19400/callback', scope }), useRouter: () => ({}) },
    'next-auth/react': { useSession: () => ({ status: 'authenticated', data: { user: { email: 'user@example.test' } } }) },
    'next/image': { default: 'Image' }, 'next/link': { default: 'Link' }, 'lucide-react': symbols,
    '@/components/ui/button': symbols, '@/components/ui/card': symbols, '@/components/ui/dropdown-menu': symbols,
    '@/lib/oauth-scopes': load('src/lib/oauth-scopes.ts'),
  };
  const page = load('src/app/(auth)/auth/mcp/page.tsx', deps).default;
  const rendered = text(page());
  assert.match(rendered, /Authorize\s+Collab CLI/);
  assert.match(rendered, /Read shared Notes and project context/);
  assert.doesNotMatch(rendered, /Create and update|Read and write/);
  scope = 'context:write issues:write workspace:write projects:read projects:write user:read new:permission';
  stateIndex = 0;
  const writable = text(page());
  for (const description of ['Create and update shared Notes', 'Create, update and delete issues, relations and work logs, and add comments', 'Update workspace information and create labels', 'Read projects', 'Create and update projects', 'Read your Collab profile', 'Requested permission: new:permission']) assert.ok(writable.includes(description), description);
});

for (const endpoint of ['mcp', 'regular']) {
  test(`${endpoint} consent denial uses only successful preparation callback and state`, async () => {
    for (const outcome of ['pending', 'rejected', 'prepared', 'no-state']) {
      const states = [], effects = [], navigations = [], requests = [];
      let cursor = 0;
      const symbols = new Proxy({}, { get: (_, key) => key });
      const jsx = (type, props) => ({ type, props });
      const location = { href: '' };
      const canonical = { consent_token: 'pending-token', appName: 'CLI', scope: 'issues:read',
        redirect_uri: 'http://127.0.0.1:19400/callback?preserve=yes', state: outcome === 'no-state' ? null : 'server-state' };
      const deps = {
        'react/jsx-runtime': { jsx, jsxs: jsx },
        react: {
          useState: initial => { const i = cursor++; if (!(i in states)) states[i] = initial; return [states[i], value => { states[i] = value; }]; },
          useEffect: effect => effects.push(effect),
        },
        'next/navigation': { useSearchParams: () => new URLSearchParams({ client_id: 'collab-cli', redirect_uri: 'https://untrusted.test/callback', state: 'query-state', endpoint }), useRouter: () => ({ push: url => navigations.push(url) }) },
        'next-auth/react': { useSession: () => ({ status: 'authenticated', data: { user: { email: 'user@example.test' } } }) },
        'next/image': { default: 'Image' }, 'next/link': { default: 'Link' }, 'lucide-react': symbols,
        '@/components/ui/button': symbols, '@/components/ui/card': symbols, '@/components/ui/dropdown-menu': symbols,
        '@/lib/oauth-scopes': load('src/lib/oauth-scopes.ts'),
      };
      const page = load('src/app/(auth)/auth/mcp/page.tsx', deps, { URL, URLSearchParams, AbortController, window: { location },
        fetch: async url => {
          requests.push(url);
          if (url === '/api/workspaces') return { ok: true, json: async () => [{ id: 'workspace', name: 'Workspace' }] };
          if (outcome === 'pending') return new Promise(() => {});
          return { ok: outcome !== 'rejected', json: async () => outcome === 'rejected' ? { error_description: 'Invalid callback' } : canonical };
        },
      }).default;
      const render = () => { cursor = 0; effects.length = 0; return page(); };
      const settle = () => new Promise(resolve => setImmediate(resolve));
      render(); effects[0](); await settle();
      render(); effects[2](); await settle();
      const tree = render();
      const nodes = value => !value || typeof value !== 'object' ? [] : [value, ...Object.values(value).flat().flatMap(nodes)];
      nodes(tree).find(node => node.type === 'Button' && node.props.children === 'Deny').props.onClick();
      assert.equal(requests.length, 2);
      if (outcome === 'prepared' || outcome === 'no-state') {
        const callback = new URL(location.href);
        assert.equal(callback.origin, 'http://127.0.0.1:19400');
        assert.equal(callback.pathname, '/callback');
        assert.equal(callback.searchParams.get('error'), 'access_denied');
        assert.equal(callback.searchParams.get('state'), canonical.state);
        assert.equal(callback.searchParams.get('preserve'), 'yes');
        assert.equal(callback.searchParams.has('code'), false); assert.equal(navigations.length, 0);
      } else {
        assert.deepEqual(navigations, ['/']); assert.equal(location.href, '');
      }
    }
  });
}
