const { test, assert, load, matches, workspaces } = require('./helpers.cjs');
const { NextResponse } = require('next/server');
const repositoryAccess = load('src/lib/github/access.ts', { '@/lib/post-access': load('src/lib/post-access.ts') });
const versionAccess = load('src/lib/github/version-access.ts', { './access': repositoryAccess, '@/lib/issue-finder': load('src/lib/issue-finder.ts', { '@/lib/prisma': { prisma: {} } }) });
for (const kind of ['dashboard', 'activity']) test(kind + ' denies absent/foreign/revoked and scopes every content query', async () => {
  for (const id of ['absent', 'foreign', 'revoked', 'own', 'joined']) {
    let queries = 0;
    const repos = workspaces.map(workspace => ({ id: workspace.id, project: { workspace }, _count: { commits: 1 } }));
    const db = { repository: { findFirst: async ({ where }) => repos.find(row => matches(row, where)) } };
    for (const model of ['commit', 'pullRequest', 'pRReview', 'release', 'deployment', 'branch']) {
      const check = ({ where }) => {
        queries++;
        const scope = model === 'pRReview' ? where.pullRequest : where;
        assert.equal(scope.repositoryId, id);
        assert.equal(matches(repos.find(row => row.id === 'foreign'), scope.repository), false);
        assert.equal(matches(repos.find(row => row.id === 'revoked'), scope.repository), false);
        if (['release', 'deployment'].includes(model)) assert.equal(scope.version.issueAccessInvalidated, false);
      };
      db[model] = { findMany: async query => { check(query); return []; }, findFirst: async query => { check(query); return null; }, count: async query => { check(query); return 1; } };
    }
    const route = load(`src/app/api/github/repositories/[repositoryId]/${kind}/route.ts`, { '@/lib/prisma': { prisma: db }, '@/lib/session': { getCurrentUser: async () => id === 'absent' ? null : { id: 'alice' } }, '@/lib/github/access': repositoryAccess, '@/lib/github/version-access': versionAccess, 'next/server': { NextResponse } }, { URL });
    const r = await route.GET(new Request('https://fixture.test'), { params: Promise.resolve({ repositoryId: id }) });
    assert.equal(r.status, id === 'absent' ? 401 : ['own', 'joined'].includes(id) ? 200 : 404);
    if (r.status !== 200) assert.equal(queries, 0);
    else { assert.ok(queries > 0); assert.equal(r.headers.get('Cache-Control'), 'no-store'); }
  }
});
