const { assert, test, load, matches } = require('./helpers.cjs');
const pageRoot = 'src/app/(main)/[workspaceId]/projects/[projectSlug]/github/settings/';
const jsx = { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
function walk(node, predicate) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(n => walk(n, predicate));
  return [...(predicate(node) ? [node] : []), ...walk(node.props?.children, predicate)];
}
function text(node) { return typeof node === 'string' ? node : Array.isArray(node) ? node.map(text).join(' ') : node && typeof node === 'object' ? text(node.props?.children) : ''; }
function fixture() {
  const state = { subject: 'actor', mapping: true, legacy: 0, projectReads: 0 };
  const workspace = { id: 'workspace', ownerId: 'other', members: [{ userId: 'actor', status: true, user: { email: 'old@weezboo.com' } }] };
  const hidden = { id: 'hidden', ownerId: 'other', members: [] };
  const repository = { id: 'repo', fullName: 'org/repo', owner: 'org', name: 'repo', defaultBranch: 'main', versioningStrategy: 'SINGLE_BRANCH', webhookId: 'hook', webhookSecret: 'fixture-private-webhook', accessToken: 'fixture-private-token', syncedAt: new Date('2026-01-01'), branches: [{ id: 'branch', name: 'main', headSha: 'abc', createdAt: new Date('2026-01-01') }], _count: { branches: 1, commits: 2, pullRequests: 3, versions: 4, releases: 5 } };
  const project = { id: 'project', workspaceId: 'workspace', workspace, slug: 'project', name: 'Project', issuePrefix: 'PRO', statuses: [{ id: 'status', name: 'backlog', displayName: 'Backlog', color: '#fff', order: 0, isDefault: true }], repository };
  const prisma = {
    workspace: { findFirst: async ({ where }) => { const match = matches(workspace, where); if (state.afterWorkspace) state.afterWorkspace(); return match ? workspace : null; } },
    project: { findFirst: async ({ where }) => { state.projectReads++; return matches(project, where) ? project : null; } },
    account: { findUnique: async () => state.mapping ? { user: { id: 'actor', email: 'actor@weezboo.com', accounts: [{ id: 'mapping' }] } } : null },
  };
  const env = { env: { COLLAB_AUTH_MODE: 'nextauth', COLLAB_GATEWAY_ISSUER: 'https://identity.example.test' } }, config = {};
  const nextAuth = { getServerSession: async c => { assert.equal(c, config); state.legacy++; return { user: { id: state.subject, email: 'old@weezboo.com' } }; } };
  const globals = { process: env, Buffer, TextDecoder, URL };
  const adapter = load('src/lib/request-session.ts', { 'server-only': {}, 'next-auth': nextAuth, './gateway-identity': load('src/lib/gateway-identity.ts', { 'node:crypto': require('node:crypto') }, globals), '@/lib/prisma': { prisma }, 'next/headers': { headers: () => new Headers({ 'x-collab-issuer': Buffer.from(env.env.COLLAB_GATEWAY_ISSUER).toString('base64url'), 'x-collab-subject': Buffer.from('actor').toString('base64url'), 'x-collab-email': Buffer.from('actor@weezboo.com').toString('base64url'), 'x-collab-email-verified': 'true' }) } }, globals);
  const page = load(pageRoot + 'page.tsx', { 'react/jsx-runtime': jsx, '@/lib/request-session': adapter, '@/lib/auth': { authConfig: config }, '@/lib/prisma': { prisma }, '@/lib/slug-resolvers': { resolveWorkspaceSlug: async v => v === 'space' ? 'workspace' : null }, 'next/navigation': { redirect: path => { throw Error('redirect:' + path); } }, './GitHubSettingsClient': { GitHubSettingsClient: 'GitHubSettingsClient' } }, globals).default;
  return { state, workspace, hidden, project, repository, env, render: (params = {}) => page({ params: Promise.resolve({ workspaceId: 'space', projectSlug: 'project', ...params }) }) };
}
function clientModules() {
  const stubs = { 'react/jsx-runtime': jsx, react: { useState: value => [value === 'connection' ? 'webhooks' : value, () => {}], useEffect() {} }, 'next/navigation': { useRouter: () => ({}) }, 'lucide-react': new Proxy({}, { get: (_, name) => String(name) }), sonner: { toast: {} }, '@/lib/utils': { cn: (...values) => values.filter(Boolean).join(' ') }, 'date-fns': { formatDistanceToNow: () => 'now' } };
  for (const [path, name] of [['ui/badge', 'Badge'], ['ui/button', 'Button'], ['ui/scroll-area', 'ScrollArea'], ['github/GitHubOAuthConnection', 'GitHubOAuthConnection'], ['github/settings/VisualBranchMapper', 'VisualBranchMapper'], ['github/settings/WebhookStatus', 'WebhookStatus'], ['github/settings/VersioningConfig', 'VersioningConfig'], ['github/settings/AIReviewConfig', 'AIReviewConfig']]) stubs['@/components/' + path] = { [name]: name };
  return { Client: load(pageRoot + 'GitHubSettingsClient.tsx', stubs).GitHubSettingsClient, Webhook: load('src/components/github/settings/WebhookStatus.tsx', stubs).WebhookStatus };
}
test('missing stable subject redirects before project data', async () => { const f = fixture(); f.state.subject = undefined; await assert.rejects(f.render(), { message: 'redirect:/login' }); assert.equal(f.state.projectReads, 0); });
test('inactive membership redirects before project data', async () => { const f = fixture(); f.workspace.members[0].status = false; await assert.rejects(f.render(), { message: 'redirect:/' }); assert.equal(f.state.projectReads, 0); });
test('owner without membership can read settings', async () => { const f = fixture(); f.workspace.ownerId = 'actor'; f.workspace.members = []; assert.equal((await f.render()).props.project.id, 'project'); });
test('current member ID works with stale session email', async () => { const f = fixture(); f.workspace.members[0].user.email = 'current@weezboo.com'; assert.equal((await f.render()).props.project.id, 'project'); });
test('server props contain configuration boolean and metadata without credentials', async () => { const f = fixture(); const node = await f.render(); assert.equal(node.props.repository.webhookConfigured, true); assert.equal('webhookSecret' in node.props.repository, false); assert.equal('accessToken' in node.props.repository, false); assert.equal(JSON.stringify(node.props).includes('fixture-private'), false); assert.equal(node.props.repository.branches[0].createdAt, '2026-01-01T00:00:00.000Z'); assert.equal(node.props.repository._count.commits, 2); assert.equal(node.props.project.statuses[0].name, 'Backlog'); });
test('empty secret is false and absent repository stays null', async () => { const f = fixture(); f.repository.webhookSecret = ''; assert.equal((await f.render()).props.repository.webhookConfigured, false); f.project.repository = null; assert.equal((await f.render()).props.repository, null); });
test('project query rechecks current workspace access', async () => { const f = fixture(); f.state.afterWorkspace = () => { f.project.workspace = f.hidden; }; await assert.rejects(f.render(), { message: 'redirect:/space/projects' }); });
test('missing workspace/project redirects preserve paths', async () => { const f = fixture(); await assert.rejects(f.render({ workspaceId: 'missing' }), { message: 'redirect:/' }); await assert.rejects(f.render({ projectSlug: 'missing' }), { message: 'redirect:/space/projects' }); });
test('gateway mapping resolves settings and revocation has no legacy fallback', async () => { const f = fixture(); f.env.env.COLLAB_AUTH_MODE = 'gateway'; assert.equal((await f.render()).props.project.id, 'project'); assert.equal(f.state.legacy, 0); f.state.mapping = false; await assert.rejects(f.render(), { message: 'redirect:/login' }); assert.equal(f.state.legacy, 0); });
test('settings client forwards only configured boolean to webhook status', () => { const { Client } = clientModules(); const node = Client({ project: { id: 'project', slug: 'project', name: 'Project', statuses: [] }, repository: { id: 'repo', fullName: 'org/repo', branches: [], _count: {}, webhookConfigured: true }, workspaceSlug: 'space' }); const hooks = walk(node, n => n.type === 'WebhookStatus'); assert.equal(hooks.length, 1); assert.equal(hooks[0].props.webhookConfigured, true); assert.equal('webhookSecret' in hooks[0].props, false); });
test('webhook display preserves configured, unconfigured and disconnected states', () => { const { Webhook } = clientModules(); assert.match(text(Webhook({ repositoryId: 'repo', isConnected: true, webhookConfigured: true })), /••••••••••••••••/); assert.match(text(Webhook({ repositoryId: 'repo', isConnected: true, webhookConfigured: false })), /Not configured/); assert.match(text(Webhook({ repositoryId: 'repo', isConnected: false })), /Connect a repository to configure webhooks/); });
