const { assert, test, load } = require('./helpers.cjs');

test('OAuth consent displays the actual Notes permissions and preserves read-only requests', () => {
  const { oauthConsentPermissions } = load('src/lib/apps/oauth-consent.ts');
  const writable = oauthConsentPermissions('issues:read issues:write context:read context:write');
  assert.ok(writable.includes('Create and update shared Notes'));
  assert.ok(writable.includes('Create, update and delete issues and work logs'));
  const readonly = oauthConsentPermissions('  context:read\nissues:read context:read ');
  assert.deepEqual(Array.from(readonly), ['Read shared Notes and project context', 'Read issues and work logs']);
  assert.doesNotMatch(readonly.join(' '), /Create|update|delete|write/);
  assert.deepEqual(Array.from(oauthConsentPermissions('new:permission')), ['Requested permission: new:permission']);
});

test('actual consent page renders CLI name and requested Notes scope without inventing write access', () => {
  const jsx = { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
  const text = value => typeof value === 'string' ? value : Array.isArray(value) ? value.map(text).join(' ') : value && typeof value === 'object' ? text(value.props?.children) : '';
  let stateIndex = 0;
  const symbols = new Proxy({}, { get: (_, key) => key });
  const deps = {
    'react/jsx-runtime': jsx,
    react: { useState: value => [stateIndex++ === 2 ? false : value, () => {}], useEffect() {} },
    'next/navigation': { useSearchParams: () => new URLSearchParams({ client_id: 'collab-cli', redirect_uri: 'http://127.0.0.1:19400/callback', scope: 'context:read' }), useRouter: () => ({}) },
    'next-auth/react': { useSession: () => ({ status: 'authenticated', data: { user: { email: 'user@example.test' } } }) },
    'next/image': { default: 'Image' }, 'next/link': { default: 'Link' }, 'lucide-react': symbols,
    '@/components/ui/button': symbols, '@/components/ui/card': symbols, '@/components/ui/dropdown-menu': symbols,
    '@/lib/apps/oauth-consent': load('src/lib/apps/oauth-consent.ts'),
  };
  const page = load('src/app/(auth)/auth/mcp/page.tsx', deps).default();
  const rendered = text(page);
  assert.match(rendered, /Authorize\s+Collab CLI/);
  assert.match(rendered, /Read shared Notes and project context/);
  assert.doesNotMatch(rendered, /Create and update|Read and write/);
});
