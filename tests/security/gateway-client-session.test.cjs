const { assert, test, load } = require('./helpers.cjs');
const jsx = { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
function walk(n, predicate) {
  if (Array.isArray(n)) return n.flatMap(x => walk(x, predicate));
  if (!n || typeof n !== 'object') return [];
  return [...(predicate(n) ? [n] : []), ...walk(n.props?.children, predicate)];
}
function text(n) { return typeof n === 'string' ? n : Array.isArray(n) ? n.map(text).join(' ') : n && typeof n === 'object' ? text(n.props?.children) : ''; }
function fixture(mode = 'gateway') {
  const state = { legacy: 0, reads: 0, mapping: true, body: 0, writes: 0, hashes: 0, modeFetches: 0, signin: [], signout: 0, assigned: [], pushes: [], toasts: [], sessionBody: {}, signoutResult: { url: '/' }, responseOK: true, hookValues: [] };
  const env = { env: { COLLAB_GATEWAY_ISSUER: 'https://identity.example.test' } };
  if (mode !== undefined && mode !== 'unset') env.env.COLLAB_AUTH_MODE = mode;
  const headers = new Headers({ 'x-collab-issuer': Buffer.from(env.env.COLLAB_GATEWAY_ISSUER).toString('base64url'), 'x-collab-subject': Buffer.from('subject').toString('base64url'), 'x-collab-email': Buffer.from('actor@weezboo.com').toString('base64url'), 'x-collab-email-verified': 'true' });
  const globals = { process: env, Buffer, TextDecoder, URL, console: { log() {}, error() {} }, window: { location: { origin: 'https://collab.example.test', href: 'https://collab.example.test/auth/mcp?state=preserve', assign: v => state.assigned.push(v) } } };
  const identity = load('src/lib/gateway-identity.ts', { 'node:crypto': require('node:crypto') }, globals);
  const prisma = { account: { findUnique: async () => { state.reads++; return state.mapping ? { user: { id: 'actor', email: 'actor@weezboo.com', accounts: [{ id: 'mapping' }], role: 'DEVELOPER' } } : null; } }, user: { findUnique: async () => { state.reads++; return null; }, create: async ({ data }) => { state.writes++; return { id: 'new', email: data.email }; } } };
  const adapter = load('src/lib/request-session.ts', { 'server-only': {}, 'next-auth': { getServerSession: async () => { state.legacy++; return null; } }, 'next/headers': { headers: () => headers }, '@/lib/prisma': { prisma }, './gateway-identity': identity }, globals);
  const json = (body, options = {}) => ({ body, status: options.status ?? 200, headers: new Headers(options.headers) });
  const legacyHandler = async (...args) => { state.legacy++; state.handlerArgs = args; return json({ legacy: true }); };
  const route = load('src/app/api/auth/[...nextauth]/route.ts', { 'next-auth': { default: () => legacyHandler }, '@/lib/auth-options': { authOptions: {} }, 'next/server': { NextResponse: { json } }, '@/lib/gateway-identity': identity, '@/lib/request-session': adapter }, globals);
  const registration = load('src/app/api/register/route.ts', { 'next/server': { NextResponse: { json } }, bcrypt: { hash: async () => { state.hashes++; return 'fixture-hash'; } }, '@/lib/prisma': { prisma }, '@/lib/avatar-generator': { generateRandomAvatar: () => ({}) }, '@/lib/gateway-identity': identity }, globals);
  const request = { json: async () => { state.body++; return { name: 'New', email: 'new@weezboo.com', password: 'fixture-password', role: 'DEVELOPER' }; } };
  globals.fetch = async url => {
    if (url === '/api/auth/mode') { state.modeFetches++; return { ok: state.responseOK, json: async () => ({ authMode: identity.authMode() }) }; }
    assert.equal(url, '/api/auth/session');
    return { ok: state.responseOK, json: async () => state.sessionBody };
  };
  const nextAuthReact = { signIn: async (...args) => state.signin.push(args), signOut: async () => { state.signout++; return state.signoutResult; }, useSession: () => ({ status: state.sessionStatus ?? 'authenticated', data: { user: { id: 'actor' } } }), SessionProvider: 'NextAuthSessionProvider' };
  let hookIndex = 0;
  const deps = {
    '@/lib/apps/oauth-consent': load('src/lib/apps/oauth-consent.ts'),
    'react/jsx-runtime': jsx,
    react: { useState: v => { const i = hookIndex++; return [v, x => { state.hookValues[i] = x; }]; }, useEffect() {}, useMemo: fn => fn() },
    'next-auth/react': nextAuthReact,
    'next/navigation': { useRouter: () => ({ push: v => state.pushes.push(v), refresh: () => state.pushes.push('refresh') }), useSearchParams: () => new URLSearchParams(), redirect: path => { throw Error('redirect:' + path); } },
    'next/image': { default: 'Image' }, 'next/link': { default: 'Link' }, 'lucide-react': new Proxy({}, { get: (_, key) => String(key) }), '@heroicons/react/24/outline': {},
    '@/hooks/use-toast': { useToast: () => ({ toast: v => state.toasts.push(v) }) },
    '@/hooks/queries/useUser': { useCurrentUser: () => ({ data: { name: 'Actor' } }) },
    '@/context/WorkspaceContext': { useWorkspace: () => ({ currentWorkspace: { id: 'space' } }) },
    '@/context/MentionContext': { useMention: () => ({ notifications: [], unreadCount: 0 }) },
    '@/components/providers/SidebarProvider': { useSidebar: () => ({}) },
    '@/hooks/queries/useProjects': { useProjects: () => ({ data: [] }) }, '@/hooks/queries/useViews': { useViews: () => ({ data: [] }) }, '@/hooks/queries/useInstalledApps': { useInstalledApps: () => ({ data: [] }) },
    '@/hooks/useAI': { useAIWidget: () => ({}), useAIAgents: () => ({}) }, '@/lib/utils': { cn: (...a) => a.filter(Boolean).join(' ') }, 'date-fns': {},
    '@/components/auth/LoginForm': { default: 'LoginForm' }, '@/lib/session': { getCurrentUser: async () => state.currentUser ?? null }, '@/lib/workspace-helpers': { getWorkspaceSlugOrId: async () => state.workspaceSlug }, '@/lib/gateway-identity': identity,
  };
  for (const path of ['ui/button', 'ui/input', 'ui/avatar', 'ui/dropdown-menu', 'ui/dialog', 'ui/popover', 'ui/scroll-area', 'ui/custom-avatar', 'ui/user-avatar', 'ui/collab-text', 'ui/markdown-content', 'ui/card', 'workspace/WorkspaceSelector', 'modals/CreateViewModal', 'modals/CreateProjectModal', 'layout/sidebar/NotificationPopover']) deps['@/components/' + path] = new Proxy({}, { get: (_, key) => String(key) });
  Object.defineProperty(deps, '@/lib/sign-out', { get: () => load('src/lib/sign-out.ts', { 'next-auth/react': nextAuthReact }, globals) });
  const render = (path, props = {}) => { hookIndex = 0; return load(path, deps, globals).default(props); };
  return { state, headers, env, request, route, registration, render, globals, call: (method, path) => route[method](request, { params: Promise.resolve({ nextauth: path }) }) };
}
test('mode endpoint reports gateway, legacy, unset and invalid without session lookup', async () => {
  for (const mode of ['gateway', 'nextauth', 'unset', 'invalid']) {
    const f = fixture(mode), r = await f.call('GET', ['mode']);
    assert.equal(r.status, mode === 'invalid' ? 503 : 200); assert.equal(r.body.authMode, mode === 'unset' ? 'nextauth' : mode); assert.equal(r.headers.get('cache-control'), 'no-store'); assert.equal(f.state.legacy + f.state.reads, 0);
  }
});
test('gateway session uses actual current mapping and revocation returns uncached 401 without fallback', async () => {
  const f = fixture(), r = await f.call('GET', ['session']); assert.equal(r.status, 200); assert.equal(r.body.user.id, 'actor'); assert.equal(r.body.authMode, 'gateway'); assert.equal(r.headers.get('cache-control'), 'no-store');
  f.state.mapping = false; const denied = await f.call('GET', ['session']); assert.equal(denied.status, 401); assert.equal(JSON.stringify(denied.body), '{}'); assert.equal(denied.headers.get('cache-control'), 'no-store'); assert.equal(f.state.legacy, 0);
});
test('missing gateway identity never falls back to legacy session', async () => { const f = fixture(); f.headers.delete('x-collab-subject'); assert.equal((await f.call('GET', ['session'])).status, 401); assert.equal(f.state.legacy + f.state.reads, 0); });
test('gateway only serves exact session/mode paths and blocks all auth POSTs', async () => {
  const f = fixture(); for (const path of [['providers'], ['callback', 'google'], ['session', 'extra'], ['mode', 'extra']]) assert.equal((await f.call('GET', path)).status, 404);
  for (const path of [['session'], ['signin'], ['signout'], ['callback', 'credentials']]) assert.equal((await f.call('POST', path)).status, 403);
  assert.equal(f.state.legacy + f.state.reads + f.state.body, 0);
});
test('invalid mode blocks session and POST without protected work', async () => { const f = fixture('invalid'); assert.equal((await f.call('GET', ['session'])).status, 503); assert.equal((await f.call('POST', ['session'])).status, 403); assert.equal(f.state.legacy + f.state.reads + f.state.body, 0); });
test('legacy and unset modes forward original GET/POST arguments', async () => { for (const mode of ['nextauth', 'unset']) { const f = fixture(mode); for (const method of ['GET', 'POST']) { const ctx = { params: Promise.resolve({ nextauth: ['session'] }) }; assert.equal((await f.route[method](f.request, ctx)).body.legacy, true); assert.equal(f.state.handlerArgs[0], f.request); assert.equal(f.state.handlerArgs[1], ctx); } assert.equal(f.state.legacy, 2); } });
test('gateway and invalid registration deny before body, hash or database', async () => { for (const mode of ['gateway', 'invalid']) { const f = fixture(mode); assert.equal((await f.registration.POST(f.request)).status, 403); assert.equal(f.state.body + f.state.hashes + f.state.reads + f.state.writes, 0); } });
test('legacy registration keeps successful creation', async () => { const f = fixture('nextauth'); assert.equal((await f.registration.POST(f.request)).body.id, 'new'); assert.equal(f.state.writes, 1); assert.equal(f.state.hashes, 1); });
test('login gateway/invalid without mapped user cannot render legacy login form', async () => { for (const mode of ['gateway', 'invalid']) { const f = fixture(mode); const n = await f.render('src/app/(auth)/login/page.tsx'); assert.equal(walk(n, n => n.type === 'LoginForm').length, 0); assert.match(text(n), /unavailable/i); } });
test('legacy login form and authenticated welcome/workspace routing remain', async () => { const f = fixture('nextauth'); assert.equal(walk(await f.render('src/app/(auth)/login/page.tsx'), n => n.type === 'LoginForm').length, 1); f.state.currentUser = { id: 'actor' }; await assert.rejects(f.render('src/app/(auth)/login/page.tsx'), { message: 'redirect:/welcome' }); f.state.workspaceSlug = 'space'; await assert.rejects(f.render('src/app/(auth)/login/page.tsx'), { message: 'redirect:/space/timeline' }); });
test('register page preserves login redirect', async () => { await assert.rejects(fixture().render('src/app/(auth)/register/page.tsx'), { message: 'redirect:/login' }); });
test('MCP gateway/invalid signin reports error and never invokes legacy signin', async () => { for (const mode of ['gateway', 'invalid']) { const f = fixture(mode); f.state.sessionStatus = 'unauthenticated'; const n = f.render('src/app/(auth)/auth/mcp/page.tsx'); await walk(n, n => n.type === 'Button')[0].props.onClick(); assert.equal(f.state.signin.length, 0); assert.equal(f.state.hookValues.some(v => typeof v === 'string' && /unavailable/i.test(v)), true); } });
test('MCP legacy signin retains provider selection and exact callback', async () => { const f = fixture('nextauth'); f.state.sessionStatus = 'unauthenticated'; await walk(f.render('src/app/(auth)/auth/mcp/page.tsx'), n => n.type === 'Button')[0].props.onClick(); assert.equal(f.state.signin.length, 1); assert.equal(f.state.signin[0][0], undefined); assert.equal(f.state.signin[0][1].callbackUrl, f.globals.window.location.href); });
for (const name of ['Navbar', 'SimplifiedSidebar']) {
  function signoutNode(f) { return walk(f.render(`src/components/layout/${name}.tsx`, { hasWorkspaces: true }), n => n.type === 'DropdownMenuItem' && /Sign out/.test(text(n)))[0]; }
  test(`${name} gateway logout navigates locally without legacy POST or success navigation`, async () => { const f = fixture(); await signoutNode(f).props.onClick(); assert.equal(f.state.signout, 0); assert.deepEqual(f.state.assigned, ['https://collab.example.test/oauth2/callback?logout=get']); assert.deepEqual(f.state.toasts, []); assert.deepEqual(f.state.pushes, []); });
  test(`${name} legacy logout confirms empty session before existing navigation`, async () => { const f = fixture('nextauth'); await signoutNode(f).props.onClick(); assert.equal(f.state.signout, 1); assert.equal(f.state.toasts.length, 1); assert.equal(f.state.toasts[0].variant, undefined); assert.equal(f.state.pushes[0], '/'); });
  test(`${name} invalid mode or surviving/malformed session never announces success`, async () => {
    for (const value of [{ user: { id: 'actor' } }, [], 'invalid', false]) { const f = fixture('nextauth'); f.state.sessionBody = value; await signoutNode(f).props.onClick(); assert.equal(f.state.pushes.length, 0); assert.equal(f.state.toasts[0].variant, 'destructive'); }
    const f = fixture('invalid'); await signoutNode(f).props.onClick(); assert.equal(f.state.signout, 0); assert.equal(f.state.pushes.length, 0); assert.equal(f.state.toasts[0].variant, 'destructive');
  });
  test(`${name} failed mode fetch or failed signout result stays signed in`, async () => { const f = fixture('nextauth'); f.state.responseOK = false; await signoutNode(f).props.onClick(); assert.equal(f.state.signout, 0); assert.equal(f.state.pushes.length, 0); assert.equal(f.state.toasts[0].variant, 'destructive'); const g = fixture('nextauth'); g.state.signoutResult = null; await signoutNode(g).props.onClick(); assert.equal(g.state.pushes.length, 0); assert.equal(g.state.toasts[0].variant, 'destructive'); });
}
test('provider uses one-minute refetch with existing focus/offline policy and explicit overrides', () => { const f = fixture(); const n = f.render('src/providers/SessionProvider.tsx', { children: 'child' }); assert.equal(n.props.refetchInterval, 60); assert.equal(n.props.refetchOnWindowFocus, true); assert.equal(n.props.refetchWhenOffline, false); assert.equal(n.props.children, 'child'); assert.equal(f.render('src/providers/SessionProvider.tsx', { refetchInterval: 12 }).props.refetchInterval, 12); });
