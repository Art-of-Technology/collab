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
