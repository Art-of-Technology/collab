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

test('version.json authorizes project and stored/fallback provenance without public caching', async () => {
  for (const mode of ['absent', 'foreign', 'stored', 'fallback', 'empty']) {
    let reads = 0;
    const workspace = workspaces[mode === 'foreign' ? 3 : 0];
    const project = { id: 'project', workspace, repository: { id: 'repo' } };
    const db = { project: { findFirst: async ({ where, include }) => { assert.deepEqual(Object.keys(include.repository.select), ['id']); return matches(project, where) ? project : null; } },
      versionFile: { findFirst: async ({ where }) => { reads++; assert.equal(where.version.issueAccessInvalidated, false); assert.ok(where.repository); return mode === 'stored' ? { content: { version: '1.0.0' } } : null; } },
      version: { findFirst: async ({ where }) => { reads++; assert.equal(where.issueAccessInvalidated, false); assert.ok(where.repository); return mode === 'fallback' ? { version: '1.0.0', issues: [], createdAt: new Date() } : null; } },
    };
    const route = load('src/app/api/version.json/route.ts', { '@/lib/prisma': { prisma: db }, '@/lib/session': { getCurrentUser: async () => mode === 'absent' ? null : { id: 'alice' } }, '@/lib/post-access': load('src/lib/post-access.ts'), '@/lib/github/access': repositoryAccess, '@/lib/github/version-access': versionAccess, 'next/server': { NextResponse } }, { URL });
    const r = await route.GET(new Request('https://fixture.test?project=project'));
    assert.equal(r.status, mode === 'absent' ? 401 : mode === 'foreign' ? 404 : 200);
    if (r.status !== 200) assert.equal(reads, 0);
    else { assert.ok(reads > 0); assert.equal(r.headers.get('Cache-Control'), 'no-store'); assert.equal((await r.json()).version, mode === 'empty' ? '0.0.0+' : '1.0.0'); }
  }
});
