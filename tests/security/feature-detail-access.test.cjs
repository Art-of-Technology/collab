const { assert, test, load, matches } = require('./helpers.cjs');

function fixture(options = {}) {
  const state = { session: true, userExists: true, owner: false, active: true, foreign: false, workspaceId: 'workspace', projectId: 'project', projectWorkspace: 'workspace', ...options };
  const reads = [], permissions = [];
  const workspace = () => ({ id: 'workspace', slug: 'team', ownerId: state.owner ? 'actor' : 'other', members: state.foreign ? [] : [{ userId: 'actor', status: state.active }] });
  const row = () => ({ id: 'feature', title: 'Private title', description: 'Private body', workspaceId: state.workspaceId, projectId: state.projectId,
    workspace: state.workspaceId ? workspace() : null, project: state.projectId ? { id: state.projectId, workspaceId: state.projectWorkspace, workspace: { ...workspace(), id: state.projectWorkspace } } : null,
    votes: [], _count: { votes: 0 }, createdAt: new Date(0), updatedAt: new Date(0) });
  const read = async q => {
    if (q.select) { reads.push('scope'); return { workspaceId: state.workspaceId, projectId: state.projectId, project: state.projectId ? { workspaceId: state.projectWorkspace } : null }; }
    reads.push('payload'); return matches(row(), q.where) ? row() : null;
  };
  const prisma = {
    user: { findUnique: async () => state.userExists ? { id: 'actor', role: 'DEVELOPER' } : null },
    workspace: { findFirst: async q => matches(workspace(), q.where) ? workspace() : null },
    featureRequest: { findUnique: read, findFirst: read },
    featureVote: { count: async () => { reads.push('votes'); return 0; } },
    featureRequestComment: { findMany: async () => { reads.push('comments'); return [{ id: 'comment', content: 'Private comment', createdAt: new Date(0), updatedAt: new Date(0) }]; } },
  };
  const action = load('src/actions/feature.ts', {
    '@/lib/auth': { getAuthSession: async () => state.session ? { user: { id: 'actor' } } : null },
    '@/lib/prisma': { prisma }, 'next/cache': { revalidatePath() {} },
    '@/lib/post-access': load('src/lib/post-access.ts'),
    '@/lib/permissions': { checkUserPermission: async (actor, workspaceId) => { permissions.push([actor, workspaceId]); return { hasPermission: false }; } },
  }, { console: { error() {} } }).getFeatureRequestById;
  return { state, reads, permissions, action };
}

for (const [name, options] of [['inactive', { active: false }], ['foreign', { foreign: true }], ['unscoped', { workspaceId: null, projectId: null }], ['inconsistent project workspace', { projectWorkspace: 'other' }]]) {
  test(`${name} cannot read feature payload, comments or votes`, async () => {
    const f = fixture(options); assert.equal(await f.action('feature'), null);
    assert.deepEqual(f.reads.filter(x => x !== 'scope'), []); assert.deepEqual(f.permissions, []);
  });
}
for (const [name, options] of [['unauthenticated', { session: false }], ['deleted current actor', { userExists: false }]]) {
  test(`${name} denied before feature reads`, async () => { const f = fixture(options); await assert.rejects(f.action('feature')); assert.deepEqual(f.reads, []); });
}
for (const [name, options] of [['owner without membership', { owner: true, foreign: true }], ['active member', {}], ['project-derived workspace', { workspaceId: null }], ['workspace-only feature', { projectId: null }]]) {
  test(`${name} receives existing data projection`, async () => {
    const f = fixture(options), result = await f.action('feature'); assert.equal(result.title, 'Private title'); assert.equal(result.comments[0].content, 'Private comment'); assert.equal(result.isAdmin, false);
    assert.deepEqual(f.reads, ['scope', 'payload', 'votes', 'comments']); assert.deepEqual(f.permissions, [['actor', 'workspace']]);
  });
}
test('foreign caller workspace cannot grant access or select edit permissions', async () => {
  const f = fixture({ foreign: true }); assert.equal(await f.action('feature', 'owned-elsewhere'), null); assert.deepEqual(f.reads.filter(x => x !== 'scope'), []); assert.deepEqual(f.permissions, []);
  const g = fixture(); assert.equal(await g.action('feature', 'owned-elsewhere'), null); assert.deepEqual(g.reads.filter(x => x !== 'scope'), []);
});
test('matching workspace slug preserves workspace-page caller', async () => { const f = fixture(); assert.equal((await f.action('feature', 'team')).title, 'Private title'); assert.deepEqual(f.permissions, [['actor', 'workspace']]); });
