const { assert, test, load, matches } = require('./helpers.cjs');

function select(row, query = {}) {
  if (!row) return null;
  if (!query.select) {
    const result = { ...row };
    for (const [key, value] of Object.entries(query.include || {})) if (value !== true) result[key] = select(row[key], value);
    return result;
  }
  return Object.fromEntries(Object.entries(query.select).filter(([, value]) => value).map(([key, value]) => [key,
    value === true ? row[key] : Array.isArray(row[key]) ? row[key].map(item => select(item, value)) : select(row[key], value)]));
}

function fixture(path, method, access = 'member', options = {}) {
  const actor = { id: 'alice', email: 'alice@example.test', createdAt: new Date(), updatedAt: new Date() };
  const workspace = { id: 'workspace', name: 'Workspace', ownerId: access === 'owner' ? 'alice' : 'bob', members: access === 'owner' || access === 'foreign' ? [] : [{ userId: 'alice', status: access === 'member' }] };
  const project = { id: 'project', name: 'Project', workspace };
  const repository = { id: 'repo', projectId: 'project', githubRepoId: '123', owner: 'octo', name: 'repo', fullName: 'octo/repo', defaultBranch: 'main', isActive: true, accessToken: options.fallback ? null : 'encrypted-secret', webhookSecret: 'webhook-secret', project, createdAt: new Date(), updatedAt: new Date(), syncedAt: null };
  const repositories = [repository, ...['foreign', 'inactive'].map(kind => ({ ...repository, id: kind, project: { id: kind, name: kind, workspace: { ownerId: 'bob', members: kind === 'inactive' ? [{ userId: 'alice', status: false }] : [] } } }))];
  const effects = [], queries = [];
  const lookup = async query => {
    queries.push(query);
    if (options.broken) throw new Error('encrypted-secret');
    return matches(repository, query.where) ? select(repository, query) : null;
  };
  const db = {
    user: { findUnique: async query => options.deleted ? null : query.select?.githubAccessToken ? { githubAccessToken: 'user-secret' } : actor },
    repository: {
      findUnique: lookup, findFirst: lookup,
      findMany: async query => repositories.filter(row => matches(row, query.where)).map(row => select(row, query)),
      update: async query => { effects.push(['write', query]); return repository; },
    },
    project: { findFirst: async query => {
      if (options.broken) throw new Error('encrypted-secret');
      return matches(project, query.where) ? select({ ...project, repository }, query) : null;
    } },
    branch: { findMany: async () => { effects.push(['branch-read']); return [{ id: 'branch', name: 'main' }]; },
      upsert: async query => { effects.push(['write', query]); return query.create; } },
    version: { findFirst: async () => null, create: async query => { effects.push(['write', query]); return { id: 'version', ...query.data }; } },
    release: { upsert: async query => { effects.push(['write', query]); return query.create; } },
    commit: { upsert: async query => { effects.push(['write', query]); return query.create; } },
    pullRequest: { upsert: async query => { effects.push(['write', query]); return query.create; } },
  };
  const deps = {
    '@/lib/prisma': { prisma: db }, '@/lib/auth': { authConfig: {} }, '@/lib/auth-options': { authOptions: {} },
    'next-auth': { getServerSession: async () => options.absent ? null : { user: actor } },
    '@/lib/request-session': { getServerSession: async () => options.absent ? null : { user: actor } },
    '@/lib/post-access': load('src/lib/post-access.ts'),
    '@/lib/github/access': load('src/lib/github/access.ts', { '@/lib/post-access': load('src/lib/post-access.ts') }),
    '@/lib/encryption': { EncryptionService: { decrypt: value => { effects.push(['decrypt', value]); return 'plain-secret'; } } },
    'next/server': { NextResponse: { json: (body, init) => ({ status: init?.status ?? 200, body, headers: init?.headers }) } },
  };
  deps['@/lib/session'] = load('src/lib/session.ts', deps, { console: { error() {} } });
  const handler = load(`src/app/api/github/repositories/${path}/route.ts`, deps, {
    URL, Error, console: { log() {}, error() {}, warn() {} }, fetch: async url => {
      effects.push(['provider', url]);
      const data = url.includes('/branches?') ? [{ name: 'main', commit: { sha: 'sha' }, protected: false }]
        : url.includes('/releases?') ? [{ id: 1, tag_name: 'v1.0.0', name: 'Release', draft: false, prerelease: false, published_at: null }]
          : url.includes('?') ? [] : { default_branch: 'main' };
      return { ok: true, json: async () => data };
    },
  })[method];
  return { effects, queries, invoke: () => handler({ url: 'https://collab.example.test/api/github/repositories/debug?projectId=project' }, { params: Promise.resolve({ repositoryId: 'repo' }) }) };
}

for (const [path, method] of [['[repositoryId]/sync', 'POST'], ['[repositoryId]/sync-releases', 'POST'], ['[repositoryId]/github-branches', 'GET'], ['[repositoryId]/github-branches', 'POST'], ['debug', 'GET']]) {
  test(`${path} ${method}: missing and deleted actor cause zero credential/provider/data effects`, async () => {
    for (const flag of ['absent', 'deleted']) {
      const f = fixture(path, method, 'member', { [flag]: true }); assert.equal((await f.invoke()).status, 401); assert.deepEqual(f.effects, []);
    }
  });
  test(`${path} ${method}: inactive and foreign users cannot access repository`, async () => {
    for (const access of ['revoked', 'foreign']) {
      const f = fixture(path, method, access); assert.equal((await f.invoke()).status, 404); assert.deepEqual(f.effects, []);
    }
  });
  test(`${path} ${method}: owner without membership and active member preserve safe successful response`, async () => {
    for (const access of ['owner', 'member']) {
      const f = fixture(path, method, access); const result = await f.invoke(); assert.equal(result.status, 200);
      assert.equal(/encrypted-secret|plain-secret|webhook-secret/.test(JSON.stringify(result.body)), false);
      if (method === 'POST') { assert.ok(f.effects.some(([kind]) => kind === 'provider')); assert.ok(f.effects.some(([kind]) => kind === 'write')); }
      if (path === 'debug') { assert.equal(result.body.project.repository.id, 'repo'); assert.equal(result.body.allRepositories[0].project.name, 'Project'); assert.deepEqual(result.body.allRepositories.map(row => row.id), ['repo']); }
      if (path.endsWith('github-branches')) assert.equal(result.body.defaultBranch, 'main');
    }
  });
}
test('sync retains explicit current-user token fallback only for authorized actor', async () => {
  const f = fixture('[repositoryId]/sync', 'POST', 'owner', { fallback: true }); assert.equal((await f.invoke()).status, 200);
  assert.ok(f.effects.some(([kind, value]) => kind === 'decrypt' && value === 'user-secret'));
});
test('debug error response excludes internal credential-bearing exception details', async () => {
  const f = fixture('debug', 'GET', 'member', { broken: true }); const result = await f.invoke();
  assert.equal(result.status, 500); assert.equal(JSON.stringify(result.body).includes('encrypted-secret'), false);
});
