const { assert, test, load, matches, workspaces } = require('./helpers.cjs');
const plain = value => JSON.parse(JSON.stringify(value));
function select(row, fields) { return !row || !fields ? row : Object.fromEntries(Object.keys(fields).filter(k => fields[k]).map(k => [k, row[k]])); }
function fixture(options = {}) {
  const effects = [], logs = [], writes = [];
  const actor = { id: 'alice', email: 'changed@example.test', createdAt: new Date(), updatedAt: new Date() };
  const credentials = { githubId: '77', githubUsername: 'alice-gh', githubAccessToken: 'stored-secret' };
  const repositories = structuredClone(workspaces).map(workspace => ({ id: workspace.id, name: 'repo', owner: 'org', fullName: 'org/repo', project: { id: 'project-' + workspace.id, workspace }, accessToken: options.noRepoToken ? null : 'stored-secret', webhookSecret: 'hook-secret', webhookId: options.noWebhook ? null : '12', versioningStrategy: 'SINGLE_BRANCH', developmentBranch: null, branchEnvironmentMap: { main: 'production' }, issueTypeMapping: { BUG: 'PATCH' }, branches: [{ id: 'branch' }], pullRequests: [{ id: 'pull' }], versions: [{ id: 'version' }], _count: { branches: 1, pullRequests: 1, commits: 2, versions: 1 } }));
  let changed = false;
  function changeAccess(row) { if (!options.revoke || changed) return; changed = true; row.project.workspace.ownerId = 'bob'; row.project.workspace.members = [{ userId: 'alice', status: false }]; }
  function current(where) { return repositories.find(r => matches(r, where)); }
  const db = {
    user: {
      findUnique: async ({ where, select: shape }) => {
        if (options.deleted || where.id !== actor.id) return null;
        if (shape) { effects.push('credential-read'); return options.noToken ? {} : select(credentials, shape); }
        return actor;
      },
      update: async ({ where, data }) => { assert.equal(where.id, 'alice'); if (options.dbError) throw new Error('stored-secret private-detail'); Object.assign(credentials, data); writes.push(['user', plain(data)]); return actor; },
    },
    repository: {
      findFirst: async ({ where, select: shape, include }) => { if (options.readError) throw new Error('stored-secret private-detail'); const row = current(where); const result = row ? structuredClone(select(row, shape)) : null;
        if (result && include?.versions) {
          const predicate=include.versions.where;
          assert.equal(predicate.issueAccessInvalidated,false);
          assert.ok(predicate.issues.every.issue);
          assert.equal(matches({project:{workspace:workspaces[2]}},predicate.repository),false);
          assert.deepEqual(plain(include._count.select.versions.where),plain(predicate));
        }
        if (row) changeAccess(row); return result; },
      update: async ({ where, data, select: shape }) => { const row = current(where); if (!row) throw new Error('no matching record'); if (options.dbError) throw new Error('stored-secret private-detail'); Object.assign(row, data); writes.push(['update', plain(data)]); return select(row, shape); },
      delete: async ({ where }) => { const row = current(where); if (!row) throw new Error('no matching record'); if (options.dbError) throw new Error('stored-secret private-detail'); repositories.splice(repositories.indexOf(row), 1); writes.push(['delete', row.id]); return row; },
    },
  };
  const globals = { URL, Error, console: Object.fromEntries(['log', 'warn', 'error'].map(k => [k, (...args) => logs.push([k, ...args])])), fetch: async (url, init) => {
    effects.push(['provider', url, init]); if (options.providerThrow) throw new Error('stored-secret private-detail');
    if (init?.method === 'DELETE') return { ok: !options.webhookFailure, status: options.webhook404 ? 404 : 500, json: async () => ({ message: 'stored-secret private-detail' }) };
    const body = url.includes('/memberships/') ? { role: 'admin', state: 'active' } : url.includes('/user/orgs') ? [{ login: 'org', id: 11 }] : url.includes('/user/repos') ? [{ full_name: 'org/repo', owner: { login: 'org', type: 'Organization' }, private: true, permissions: { admin: true } }] : { login: 'alice-gh', id: 77, name: 'Alice', email: 'alice@example.test' };
    return { ok: true, json: async () => body };
  }, URLSearchParams };
  const deps = { '@/lib/prisma': { prisma: db }, '@/lib/auth': { authConfig: {} }, '@/lib/auth-options': { authOptions: {} },
    'next-auth': { getServerSession: async () => options.absent ? null : { user: { id: 'alice', email: 'stale@example.test' } } },
    '@/lib/request-session': { getServerSession: async () => options.absent ? null : { user: { id: 'alice', email: 'stale@example.test' } } },
    '@/lib/encryption': { EncryptionService: { decrypt: token => { effects.push('decrypt'); assert.equal(token, 'stored-secret'); return 'provider-secret'; } } },
    'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status || 200, headers: new Headers(init.headers) }) } },
    '@/lib/post-access': load('src/lib/post-access.ts'),
  };
  deps['@/lib/session'] = load('src/lib/session.ts', deps, globals);
  deps['@/lib/github/access'] = load('src/lib/github/access.ts', deps);
  deps['@/lib/github/version-access'] = load('src/lib/github/version-access.ts', { ...deps, './access': deps['@/lib/github/access'] });
  const repo = load('src/app/api/github/repositories/[repositoryId]/route.ts', deps, globals);
  const config = load('src/app/api/github/repositories/[repositoryId]/configuration/route.ts', deps, globals);
  const disconnect = load('src/app/api/github/oauth/disconnect/route.ts', deps, globals);
  const info = load('src/app/api/github/oauth/user-info/route.ts', deps, globals);
  return { effects, writes, logs, credentials, repositories, call: (action, id = 'own', body = {}) => {
    const request = { json: async () => body }, params = { params: Promise.resolve({ repositoryId: id }) };
    return action === 'GET' ? repo.GET(request, params) : action === 'DELETE' ? repo.DELETE(request, params) : action === 'PATCH' ? config.PATCH(request, params) : action === 'disconnect' ? disconnect.POST(request) : info.GET(request);
  } };
}
for (const action of ['GET', 'DELETE', 'PATCH', 'disconnect', 'info']) test(action + ' rejects absent or deleted current actor before effects', async () => {
  for (const flag of ['absent', 'deleted']) { const f = fixture({ [flag]: true }); const r = await f.call(action); assert.equal(r.status, 401); assert.deepEqual(f.effects, []); assert.deepEqual(f.writes, []); }
});
for (const action of ['GET', 'DELETE', 'PATCH']) test(action + ' rejects inactive, foreign and missing exact repository', async () => {
  for (const id of ['revoked', 'foreign', 'missing']) { const f = fixture(); assert.equal((await f.call(action, id)).status, 404); assert.deepEqual(f.effects, []); assert.deepEqual(f.writes, []); }
});
test('GET preserves owner-without-member and active-member relation payload but excludes credentials', async () => {
  for (const id of ['own', 'joined']) { const f = fixture(); const r = await f.call('GET', id); assert.equal(r.status, 200); assert.equal(r.body.repository.id, id); for (const key of ['project', 'branches', 'pullRequests', 'versions', '_count']) assert.deepEqual(plain(r.body.repository[key]), plain(f.repositories.find(x => x.id === id)[key])); assert.equal(r.body.repository.accessToken, undefined); assert.equal(r.body.repository.webhookSecret, undefined); }
});
test('PATCH owner/member preserves configuration response and invalid-input denials', async () => {
  for (const id of ['own', 'joined']) { const f = fixture(); const r = await f.call('PATCH', id, { versioningStrategy: 'MULTI_BRANCH', developmentBranch: 'dev', branchEnvironmentMap: { dev: 'staging' }, issueTypeMapping: { BUG: 'MINOR' } }); assert.equal(r.status, 200); assert.equal(r.body.repository.developmentBranch, 'dev'); assert.equal(r.body.repository.issueTypeMapping.BUG, 'MINOR'); assert.equal(r.body.repository.accessToken, undefined); assert.equal(f.writes.length, 1); }
  for (const body of [{ versioningStrategy: 'INVALID' }, { issueTypeMapping: { BUG: 'INVALID' } }]) { const f = fixture(); assert.equal((await f.call('PATCH', 'own', body)).status, 400); assert.deepEqual(f.writes, []); }
});
for (const action of ['PATCH', 'DELETE']) test(action + ' reevaluates access at final DB write after interleaved revocation', async () => {
  for (const id of ['own', 'joined']) { const f = fixture({ revoke: true }); const r = await f.call(action, id); assert.ok(r.status >= 400); assert.deepEqual(f.writes, []); const row = f.repositories.find(x => x.id === id); assert.ok(row); assert.equal(row.versioningStrategy, 'SINGLE_BRANCH'); if (action === 'DELETE') assert.equal(f.effects.filter(x => Array.isArray(x) && x[0] === 'provider').length, 1); }
});
test('DELETE owner/member preserves best-effort webhook and DB deletion including missing webhook', async () => {
  for (const id of ['own', 'joined']) for (const options of [{}, { noWebhook: true }, { noRepoToken: true }, { webhookFailure: true }, { webhookFailure: true, webhook404: true }, { providerThrow: true }]) { const f = fixture(options); const r = await f.call('DELETE', id); assert.equal(r.status, 200); assert.deepEqual(f.writes, [['delete', id]]); assert.equal(f.repositories.some(x => x.id === id), false); assert.equal(JSON.stringify(f.logs).includes('stored-secret'), false); }
});
test('disconnect clears only current user OAuth fields and preserves repository credentials', async () => {
  const f = fixture(); const r = await f.call('disconnect'); assert.equal(r.status, 200); assert.deepEqual(f.credentials, { githubId: null, githubUsername: null, githubAccessToken: null }); assert.ok(f.repositories.every(x => x.accessToken === 'stored-secret')); assert.deepEqual(f.effects, []);
});
test('user-info preserves current-user provider projection without token contents', async () => {
  const f = fixture(); const r = await f.call('info'); assert.equal(r.status, 200); assert.equal(r.body.user.login, 'alice-gh'); assert.equal(r.body.organizations[0].role, 'admin'); assert.equal(r.body.repositorySample[0].name, 'org/repo'); assert.equal(r.body.tokenInfo.hasToken, true); assert.equal(r.body.totalReposCount, 1); assert.equal(JSON.stringify(r.body).includes('secret'), false); assert.equal((await fixture({ noToken: true }).call('info')).status, 400);
});
test('unexpected touched-route errors have generic responses and fixed safe logs', async () => {
  for (const action of ['GET', 'PATCH', 'DELETE', 'disconnect', 'info']) { const f = fixture(action === 'info' ? { providerThrow: true } : action === 'GET' ? { readError: true } : { dbError: true }); const r = await f.call(action); assert.equal(r.status, 500); assert.equal(JSON.stringify(r.body).includes('private-detail'), false); assert.equal(JSON.stringify(f.logs).includes('private-detail'), false); assert.ok(f.logs.filter(x => x[0] === 'error' || x[0] === 'warn').every(x => x.length === 2 && typeof x[1] === 'string')); }
});

test('all successful private endpoints set no-store', async () => { for (const action of ['GET', 'PATCH', 'DELETE', 'disconnect', 'info']) { const r = await fixture().call(action); assert.equal(r.status, 200); assert.equal(r.headers.get('cache-control'), 'no-store'); } });
