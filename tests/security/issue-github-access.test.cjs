const { test, assert, load, matches, workspaces } = require('./helpers.cjs');
const { NextResponse } = require('next/server');
const issueAccess = load('src/lib/issue-finder.ts', { '@/lib/prisma': { prisma: {} } });
const repositoryAccess = load('src/lib/github/access.ts', { '@/lib/post-access': load('src/lib/post-access.ts') });
const versionAccess = load('src/lib/github/version-access.ts', { './access': repositoryAccess, '@/lib/issue-finder': issueAccess });
test('issue GitHub projection denies inactive/cross-workspace access and scopes related content', async () => {
  for (const mode of ['absent', 'own', 'joined', 'revoked', 'foreign', 'foreign-issue', 'foreign-status', 'no-repository']) {
    let reads = 0;
    const workspace = workspaces.find(w => w.id === mode) || workspaces[0];
    const repository = { id: 'repo', fullName: 'example/repo', project: { workspace } };
    const issue = { id: 'issue', statusId: null, workspace: mode === 'foreign-issue' ? workspaces[3] : workspace, project: { workspace, repository: mode === 'no-repository' ? null : repository } };
    if (mode === 'foreign-status') { issue.statusId = 'status'; issue.projectStatus = { project: { workspace: workspaces[3] } }; }
    const db = { issue: { findFirst: async ({ where, include }) => { assert.equal(include.project.include.repository.select.accessToken, undefined); return matches(issue, where) ? issue : null; } } };
    for (const model of ['branch', 'pullRequest', 'version', 'commit']) {
      const query = ({ where }) => {
        reads++;
        assert.equal(where.repositoryId, 'repo');
        assert.equal(matches({ project: { workspace: workspaces[2] } }, where.repository), false);
        if (model === 'version') { assert.equal(where.issueAccessInvalidated, false); assert.ok(where.issues.every); assert.equal(where.issues.some.issueId, 'issue'); assert.equal(matches({ ...issue, workspace: workspaces[3] }, where.issues.some.issue), false); }
        else { assert.equal(where.issueId, 'issue'); assert.equal(matches({ ...issue, workspace: workspaces[3] }, where.issue), false); }
        return model === 'branch' ? null : [];
      };
      db[model] = { findFirst: query, findMany: query };
    }
    const route = load('src/app/api/issues/[issueId]/github/route.ts', { '@/lib/session': { getCurrentUser: async () => mode === 'absent' ? null : { id: 'alice' } }, '@/lib/prisma': { prisma: db }, '@/lib/issue-finder': issueAccess, '@/lib/github/access': repositoryAccess, '@/lib/github/version-access': versionAccess, 'next/server': { NextResponse } });
    const response = await route.GET(new Request('https://fixture.test'), { params: Promise.resolve({ issueId: 'issue' }) });
    assert.equal(response.status, mode === 'absent' ? 401 : ['own', 'joined', 'no-repository'].includes(mode) ? 200 : 404);
    assert.equal(reads, ['own', 'joined'].includes(mode) ? 4 : 0);
    if (response.status === 200) assert.equal(response.headers.get('Cache-Control'), 'no-store');
  }
});
