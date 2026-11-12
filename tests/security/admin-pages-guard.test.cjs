const { assert, test, load, matches } = require('./helpers.cjs');

// The admin layout only redirects in the browser, so each page must refuse on the server before it reads anything.
function fixture() {
  const users = [
    { id: 'root', name: 'Root', email: 'root@example.test', role: 'SYSTEM_ADMIN', createdAt: new Date(), _count: { workspaceMemberships: 1 } },
    { id: 'bob', name: 'Bob', email: 'bob@example.test', role: 'DEVELOPER', createdAt: new Date(), _count: { workspaceMemberships: 2 } },
  ];
  const state = { session: null, reads: [] };
  const prisma = {
    user: {
      findUnique: async ({ where }) => users.find(row => row.id === where.id) ?? null,
      findMany: async ({ where = {} }) => { state.reads.push('users'); return users.filter(row => matches(row, where)); },
    },
    app: { findMany: async () => { state.reads.push('apps'); return []; } },
  };
  const tag = name => name;
  const ui = names => Object.fromEntries(names.map(name => [name, tag(name)]));
  const deps = {
    'react/jsx-runtime': require('react/jsx-runtime'), react: require('react'),
    'next/navigation': { notFound() { throw new Error('NOT_FOUND'); } },
    'next/link': { default: 'a' }, 'next/image': { default: 'img' },
    'lucide-react': new Proxy({}, { get: (_, name) => name }),
    '@/lib/prisma': { prisma },
    '@/lib/request-session': { getServerSession: async () => state.session },
    '@/lib/auth-options': { authOptions: {} },
    '@/components/ui/card': ui(['Card', 'CardContent', 'CardDescription', 'CardHeader', 'CardTitle']),
    '@/components/ui/badge': ui(['Badge']), '@/components/ui/user-avatar': ui(['UserAvatar']),
    '@/components/ui/skeleton': ui(['Skeleton']), '@/components/ui/alert': ui(['Alert', 'AlertDescription', 'AlertTitle']),
    '@/components/ui/button': ui(['Button']), '@/components/ui/input': ui(['Input']),
    './SystemAppToggle': ui(['SystemAppToggle']), './AppConfigEditor': ui(['AppConfigEditor']),
  };
  deps['@/lib/system-admin'] = load('src/lib/system-admin.ts', deps);
  const pages = {
    users: load('src/app/admin/users/page.tsx', deps, { Date }).default,
    apps: load('src/app/admin/system-apps/page.tsx', deps, { Date }).default,
  };
  // Runs a page as the server does: an async component under a Suspense boundary is awaited too.
  const render = async (page, query = {}) => {
    let node = await pages[page]({ searchParams: Promise.resolve(query) });
    while (typeof node?.props?.children?.type === 'function') node = await node.props.children.type(node.props.children.props);
    return node;
  };
  const as = (id, role) => { state.session = id ? { user: { id, role } } : null; };
  return { state, users, render, as };
}

for (const page of ['users', 'apps']) {
  test(`the admin ${page} page reads nothing for a visitor who is not a system admin`, async () => {
    const f = fixture();
    for (const [id, role, why] of [
      [null, null, 'no session'],
      ['bob', 'DEVELOPER', 'an ordinary user'],
      ['bob', 'SYSTEM_ADMIN', 'a session that claims the role the account does not have'],
      ['gone', 'SYSTEM_ADMIN', 'a session for an account that no longer exists'],
    ]) {
      f.as(id, role);
      await assert.rejects(f.render(page), /NOT_FOUND/, why);
    }
    assert.deepEqual(f.state.reads, []);
  });

  test(`the admin ${page} page loads for a system admin`, async () => {
    const f = fixture();
    f.as('root', 'SYSTEM_ADMIN');
    assert.ok(await f.render(page));
    assert.deepEqual(f.state.reads, [page]);
  });
}

// Everything a rendered page says, and where its links go.
const text = node => node == null || typeof node === 'boolean' ? '' : typeof node !== 'object' ? String(node)
  : [node.props?.href ?? '', ...[].concat(node.props?.children ?? []).map(text)].join(' ');

test('the admin users list finds people by name or email and links each to their workspaces screen', async () => {
  const f = fixture();
  f.as('root', 'SYSTEM_ADMIN');
  const all = text(await f.render('users'));
  assert.match(all, /root@example\.test/);
  assert.match(all, /\/admin\/users\/bob /);
  for (const query of ['BOB@exam', ' bob ', 'Bo']) {
    const found = text(await f.render('users', { q: query }));
    assert.match(found, /bob@example\.test/, query);
    assert.doesNotMatch(found, /root@example\.test/, query);
  }
  assert.doesNotMatch(text(await f.render('users', { q: 'nobody' })), /example\.test/);
  assert.match(text(await f.render('users', { q: ['bob', 'root'] })), /root@example\.test/, 'a repeated parameter is not a search');
});
