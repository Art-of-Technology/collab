const { assert, test, load, matches, workspaces } = require('./helpers.cjs');
const crypto = require('node:crypto');
function select(row, shape) { if (!shape || !row) return row; return Object.fromEntries(Object.entries(shape).filter(([,v]) => v).map(([k,v]) => [k, v === true ? row[k] : select(row[k], v.select)])); }
function fixture(options = {}) {
  const effects = [], logs = [];
  const actor = { id: 'alice', email: 'alice@example.test', createdAt: new Date(), updatedAt: new Date() };
  const projects = workspaces.map((workspace, i) => ({ id: workspace.id, name: 'project-' + workspace.id, workspace, repository: options.attached ? { id: 'attached' } : null }));
  const connections = projects.map((project, i) => ({ id: 'connection-' + i, githubRepoId: String(i + 1), project, accessToken: 'encrypted-secret', webhookSecret: 'webhook-secret' }));
  const providerRows = projects.map((p, i) => ({ id: i + 1, name: 'repo-' + p.id, full_name: 'org/repo-' + p.id, description: 'description', permissions: { admin: true } }));
  const db = {
    user: { findUnique: async ({ where, select: shape }) => {
      if (options.deleted || where.id !== actor.id) return null;
      if (shape) { effects.push(['token-read']); return options.noToken ? {} : { githubAccessToken: 'encrypted-token', githubUsername: 'alice-gh' }; }
      return actor;
    } },
    project: { findFirst: async ({ where, select: shape }) => select(projects.find(p => matches(p, where)), shape) || null },
    repository: {
      findMany: async ({ where = {}, select: shape }) => connections.filter(r => matches(r, where)).map(r => select(r, shape)),
      findFirst: async ({ select: shape }) => options.duplicate ? select(connections[3], shape) : null,
      create: async ({ data }) => { if (options.dbError) throw new Error('private-project encrypted-secret'); effects.push(['repository-write', data]); return { id: 'new', isActive: true, defaultBranch: 'main', ...data }; },
    },
    version: { findFirst: async () => null, create: async ({ data }) => { effects.push(['version-write', data]); return { id: 'version', ...data }; } },
    branch: { upsert: async () => effects.push(['branch-write']) }, commit: { upsert: async () => effects.push(['commit-write']) }, release: { upsert: async () => effects.push(['release-write']) },
  };
  const deps = {
    '@/lib/prisma': { prisma: db }, '@/lib/auth': { authConfig: {} }, '@/lib/auth-options': { authOptions: {} },
    'next-auth': { getServerSession: async () => options.absent ? null : { user: actor } },
    '@/lib/request-session': { getServerSession: async () => options.absent ? null : { user: actor } },
    '@/lib/encryption': { EncryptionService: { decrypt: token => { effects.push(['decrypt']); return 'token'; }, encrypt: token => { effects.push(['encrypt']); return 'sealed'; } } },
    crypto: { default: crypto }, '@/lib/post-access': load('src/lib/post-access.ts'),
    '@/lib/github/oauth-config': {
      getUserRepositories: async (...args) => { effects.push(['list', ...args]); if (options.listError) throw new Error(options.listError); return { repositories: providerRows, hasMore: true }; },
      getRepositoryDetails: async () => { effects.push(['details']); return { id: 99, full_name: 'org/repo', default_branch: 'main', permissions: { admin: !options.noAdmin } }; },
      createRepositoryWebhook: async () => { effects.push(['webhook']); if (options.webhookError) throw new Error(options.webhookError); return { id: 12 }; },
    },
    'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status || 200, headers: new Headers(init.headers) }) } },
  };
  deps['@/lib/github/access'] = load('src/lib/github/access.ts', deps);
  const globals = { URL, Error, crypto, process: { env: { NEXTAUTH_URL: options.local ? 'http://localhost:3000' : 'https://collab.example' } }, console: { log() {}, warn() {}, error: (...args) => logs.push(args) }, fetch: async url => { effects.push(['fetch']); return { ok: true, json: async () => url.includes('/branches') ? [{ name: 'main', commit: { sha: 'sha' }, protected: true }] : url.includes('/commits') ? [{ sha: 'sha', commit: { message: 'initial', author: { name: 'A', email: 'a@example.test', date: '2026-01-01' } } }] : [] }; } };
  deps['@/lib/session'] = load('src/lib/session.ts', deps, globals);
  const list = load('src/app/api/github/oauth/repositories/route.ts', deps, globals).GET;
  const connect = load('src/app/api/github/oauth/connect/route.ts', deps, globals).POST;
  const manual = load('src/app/api/github/repositories/route.ts', deps, globals).POST;
  return { effects, logs, list: query => list({ url: 'https://collab.example/api/github/oauth/repositories' + (query || '') }), connect: (projectId = 'own', manualMode = false) => (manualMode ? manual : connect)({ json: async () => ({ projectId, repositoryId: 99, githubRepoId: 99, owner: 'org', name: 'repo', accessToken: 'manual-token' }) }) };
}

test('list reveals connection metadata only for owner and active member projects', async () => {
  const f = fixture(); const r = await f.list(); assert.equal(r.status, 200); assert.equal(r.body.repositories.length, 4);
  assert.deepEqual(r.body.repositories.map(x => x.isConnected), [true, true, false, false]);
  assert.equal(r.body.repositories[0].connectedProject.name, 'project-own'); assert.equal(r.body.repositories[1].connectedProject.name, 'project-joined');
  for (const row of r.body.repositories.slice(2)) assert.equal(row.connectedProject, undefined);
  assert.equal(JSON.stringify(r.body).includes('encrypted-secret'), false); assert.equal(r.headers.get('cache-control'), 'no-store');
});
test('list preserves provider pagination, search, sort and disconnected response', async () => {
  const f = fixture(); const r = await f.list('?page=2&search=repo-own&sort=created'); assert.equal(r.body.repositories.length, 1); assert.equal(r.body.hasMore, false); assert.equal(r.body.currentPage, 2); assert.deepEqual(f.effects.find(e => e[0] === 'list'), ['list', 'token', 2, 30, 'created']); assert.equal((await fixture({ noToken: true }).list()).status, 400);
});
test('both connection entries reject inactive/foreign project before credentials or writes', async () => {
  for (const manual of [false, true]) for (const project of ['revoked', 'foreign', 'missing']) { const f = fixture(); assert.equal((await f.connect(project, manual)).status, 404); assert.deepEqual(f.effects, []); }
});
test('missing/deleted actors cannot list or connect through either entry', async () => {
  for (const flag of ['absent', 'deleted']) for (const mode of ['list', 'oauth', 'manual']) { const f = fixture({ [flag]: true }); const r = mode === 'list' ? await f.list() : await f.connect('own', mode === 'manual'); assert.equal(r.status, 401); assert.deepEqual(f.effects, []); }
});
test('duplicate response reveals no foreign project and causes no provider or write effects', async () => {
  const f = fixture({ duplicate: true }); const r = await f.connect(); assert.equal(r.status, 400); assert.equal(r.body.error, 'Repository is already connected to another project'); assert.equal(JSON.stringify(r.body).includes('foreign'), false); assert.equal(f.effects.some(e => ['details', 'webhook', 'repository-write', 'fetch'].includes(e[0])), false);
});
test('OAuth owner and active member preserve webhook/version/sync behavior and safe projection', async () => {
  for (const project of ['own', 'joined']) { const f = fixture(); const r = await f.connect(project); assert.equal(r.status, 200); assert.equal(r.body.success, true); assert.equal(r.body.repository.projectId, project); assert.equal(r.body.webhook.id, 12); assert.equal(r.body.sync.branches, 1); assert.equal(r.body.sync.commits, 1); assert.equal(r.body.repository.accessToken, undefined); assert.equal(r.body.repository.webhookSecret, undefined); assert.ok(f.effects.some(e => e[0] === 'version-write')); }
});
test('manual owner and member retain intentional setup secret and initial version', async () => {
  for (const project of ['own', 'joined']) { const f = fixture(); const r = await f.connect(project, true); assert.equal(r.status, 200); assert.match(r.body.repository.webhookSecret, /^[a-f0-9]{64}$/); assert.equal(r.body.repository.accessToken, undefined); assert.equal(f.effects.find(e => e[0] === 'version-write')[1].version, '0.1.0'); }
});
test('attached project and missing provider admin retain denial before creation', async () => { for (const options of [{ attached: true }, { noAdmin: true }]) { const f = fixture(options); assert.equal((await f.connect()).status, options.attached ? 400 : 403); assert.equal(f.effects.some(e => e[0] === 'repository-write' || e[0] === 'webhook'), false); } });
test('known provider error statuses and localhost webhook fallback remain', async () => {
  for (const [message, status] of [['Hook already exists', 400], ['Not Found', 404]]) assert.equal((await fixture({ webhookError: message }).connect()).status, status);
  const f = fixture({ local: true, webhookError: 'cannot reach localhost' }); const r = await f.connect(); assert.equal(r.status, 200); assert.ok(r.body.warning.includes('localhost')); assert.equal(r.body.webhook.id, null);
});
test('touched route errors do not echo raw provider/database payloads or log raw errors', async () => {
  for (const options of [{ webhookError: 'private-project encrypted-secret' }, { dbError: true }]) { const f = fixture(options); const r = await f.connect(); assert.equal(r.status, 500); assert.equal(JSON.stringify(r.body).includes('private-project'), false); assert.ok(f.logs.every(args => args.length === 1 && typeof args[0] === 'string' && !args[0].includes('private-project'))); }
  const f = fixture({ listError: 'private-project encrypted-secret' }); assert.equal((await f.list()).status, 500); assert.ok(f.logs.every(args => args.length === 1));
});
