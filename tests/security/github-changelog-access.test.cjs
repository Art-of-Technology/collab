const { test, assert, load, matches, workspaces } = require('./helpers.cjs');
const { NextResponse } = require('next/server');
const repositoryAccess = load('src/lib/github/access.ts', { '@/lib/post-access': load('src/lib/post-access.ts') });
const versionAccess = load('src/lib/github/version-access.ts', { './access': repositoryAccess, '@/lib/issue-finder': load('src/lib/issue-finder.ts', { '@/lib/prisma': { prisma: {} } }) });
function fixture(mode) {
  let provider = 0, writes = 0, reads = 0;
  const repo = { id: 'own', project: { workspace: workspaces[0] } };
  const version = { id: 'v-own', repositoryId: 'own', repository: repo, issueAccessInvalidated: false, version: '1.0.0', issues: [{ issue: { issueKey: 'A-1', title: 'Feature', type: 'TASK' } }] };
  const db = { repository: { findFirst: async ({ where }) => matches(repo, where) ? repo : null },
    release: { findFirst: async () => null },
    version: { findFirst: async ({ where }) => { reads++; assert.equal(where.repositoryId, 'own'); assert.equal(where.issueAccessInvalidated, false); assert.ok(where.repository); if (mode === 'revoke-before' && reads > 1) return null; return !where.id || where.id === version.id ? version : null; },
      update: async ({ where }) => { assert.equal(where.repositoryId, 'own'); assert.ok(where.repository); assert.equal(where.issueAccessInvalidated, false); if (mode === 'revoke-after') throw new Error('denied'); writes++; return {}; } },
    commit: { findMany: async () => [] }, pullRequest: { findMany: async () => [] },
  };
  class AI { chat = { completions: { create: async () => { provider++; return { choices: [{ message: { content: 'Changelog' } }] }; } } }; }
  const route = load('src/app/api/github/repositories/[repositoryId]/generate-changelog/route.ts', { '@/lib/prisma': { prisma: db }, '@/lib/session': { getCurrentUser: async () => mode === 'absent' ? null : { id: 'alice' } }, '@/lib/github/access': repositoryAccess, '@/lib/github/version-access': versionAccess, 'next/server': { NextResponse }, zod: require('zod'), openai: { default: AI } }, { process: { env: {} } });
  return { call: (body, repositoryId = 'own') => route.POST(new Request('https://fixture.test', { method: 'POST', body: JSON.stringify(body) }), { params: Promise.resolve({ repositoryId }) }), effects: () => ({ provider, writes }) };
}
test('changelog denies wrong tenant/targets before provider and rechecks final writes', async () => {
  for (const [mode, body, repository, status] of [['absent', {}, 'own', 401], ['foreign', {}, 'foreign', 404], ['bad-target', { versionId: 'v-other' }, 'own', 404], ['bad-release', { releaseId: 'release-other' }, 'own', 404], ['revoke-before', { versionId: 'v-own' }, 'own', 404]]) {
    const f = fixture(mode); assert.equal((await f.call(body, repository)).status, status); assert.deepEqual(f.effects(), { provider: 0, writes: 0 });
  }
  const success = fixture('ok'); assert.equal((await success.call({ versionId: 'v-own' })).status, 200); assert.deepEqual(success.effects(), { provider: 2, writes: 1 });
  const revoked = fixture('revoke-after'); assert.equal((await revoked.call({ versionId: 'v-own' })).status, 500); assert.deepEqual(revoked.effects(), { provider: 2, writes: 0 });
});
