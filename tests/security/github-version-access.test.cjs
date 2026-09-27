const { test, assert, load, matches, workspaces } = require('./helpers.cjs');
const { NextResponse } = require('next/server');
const routePath = 'src/app/api/github/repositories/[repositoryId]/versions/route.ts';
function fixture(absent = false, releases = false) {
  let reads = 0;
  const repos = workspaces.map(workspace => ({ id: workspace.id, project: { workspace } }));
  const repositoryAccess = load('src/lib/github/access.ts', { '@/lib/post-access': load('src/lib/post-access.ts') });
  const issueAccess = load('src/lib/issue-finder.ts', { '@/lib/prisma': { prisma: {} } });
  const access = load('src/lib/github/version-access.ts', { './access': repositoryAccess, '@/lib/issue-finder': issueAccess });
  const ownIssue = { workspace: workspaces[0], project: { workspace: workspaces[0] }, statusId: null };
  const versions = [
    { id: 'safe', repositoryId: 'own', repository: repos[0], issueAccessInvalidated: false, issues: [{ issue: ownIssue }] },
    { id: 'invalidated', repositoryId: 'own', repository: repos[0], issueAccessInvalidated: true, issues: [] },
    { id: 'foreign-issue', repositoryId: 'own', repository: repos[0], issueAccessInvalidated: false, issues: [{ issue: { ...ownIssue, workspace: workspaces[3] } }] },
  ];
  const allows = (row, where) => matches(row, Object.fromEntries(Object.entries(where).filter(([k]) => k !== 'issues'))) && (!where.issues || row.issues.every(link => matches(link.issue, where.issues.every.issue)));
  const db = { repository: { findFirst: async ({ where }) => repos.find(repo => matches(repo, where)) }, version: { findMany: async ({ where, include, take }) => {
    reads++; assert.ok(take > 0 && take <= 100);
    for (const relation of ['parentVersion', 'childVersions']) {
      assert.equal(allows({ ...versions[0], repository: repos[3] }, include[relation].where), false);
      assert.equal(allows(versions[1], include[relation].where), false);
    }
    return versions.filter(row => allows(row, where));
  } } };
  db.release = { findMany: async ({ where, take }) => {
    reads++; assert.ok(take > 0 && take <= 100);
    assert.equal(matches(repos[3], where.repository), false);
    return versions.filter(row => row.repositoryId === where.repositoryId && allows(row, where.version)).map(version => ({ id: 'release-' + version.id, version }));
  } };
  const route = load(releases ? routePath.replace('/versions/', '/releases/') : routePath, { '@/lib/prisma': { prisma: db }, '@/lib/session': { getCurrentUser: async () => absent ? null : { id: 'alice' } }, '@/lib/github/access': repositoryAccess, '@/lib/github/version-access': access, 'next/server': { NextResponse } }, { URL });
  return { reads: () => reads, call: id => route.GET(new Request('https://fixture.test?limit=1000'), { params: Promise.resolve({ repositoryId: id }) }) };
}
test('versions deny absent and foreign actors before version reads and filter inaccessible provenance', async () => {
  const missing = fixture(true); assert.equal((await missing.call('own')).status, 401); assert.equal(missing.reads(), 0);
  for (const id of ['foreign', 'revoked', 'missing']) { const f = fixture(); assert.equal((await f.call(id)).status, 404); assert.equal(f.reads(), 0); }
  const f = fixture(), response = await f.call('own'); assert.equal(response.status, 200); assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual((await response.json()).versions.map(v => v.id), ['safe']);
});

test('release payloads require repository and version provenance access', async () => {
  for (const absent of [true, false]) { const f = fixture(absent, true); assert.equal((await f.call('foreign')).status, absent ? 401 : 404); assert.equal(f.reads(), 0); }
  const f = fixture(false, true), r = await f.call('own'); assert.equal(r.status, 200); assert.deepEqual((await r.json()).releases.map(x => x.id), ['release-safe']);
});
