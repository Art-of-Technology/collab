const { assert, test, load, matches, prisma, userHasWorkspaceAccess } = require('./helpers.cjs');


test('related issues override heuristics in both directions and retain access controls', async () => {
  let session = { user: { id: 'alice' } };
  const records = ['a', 'b', 'foreign', 'ordinary'].map(id => ({ id, issueKey: id, title: id,
    workspaceId: id === 'foreign' ? 'foreign' : 'joined', project: { workspaceId: id === 'foreign' ? 'foreign' : 'joined' }, labels: [], projectStatus: { name: 'Open', color: '#fff' } }));
  let links = [];
  const { GET } = load('src/app/api/ai/issues/related/route.ts', {
    'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status ?? 200 }) } },
    'next-auth': { getServerSession: async () => session }, '@/lib/auth': { authConfig: {} },
    '@/lib/issue-finder': { userHasWorkspaceAccess },
    '@/lib/prisma': { prisma: {
      issue: { findFirst: async ({ where }) => records.find(row => matches(row, where)),
        findMany: async ({ where, take }) => records.filter(row => matches(row, where)).slice(0, take) },
      issueRelation: { findMany: async ({ where }) => links.filter(row => matches(row, where)) },
    } },
  }, { URL });
  const request = (id, workspace = 'joined') => GET(new Request(`https://example.test/?issueId=${id}&workspaceId=${workspace}`));
  for (const overlap of ['none', 'title', 'label', 'both']) {
    for (const row of records) {
      row.title = ['title', 'both'].includes(overlap)
        ? (row.id === 'ordinary' ? 'Database cleanup' : 'Database migration') : row.id.slice(0, 1);
      row.labels = ['label', 'both'].includes(overlap)
        ? (row.id === 'ordinary' ? [{ id: 'x' }] : [{ id: 'x' }, { id: 'y' }]) : [];
    }
    for (const [relationType, expected] of [['BLOCKS', ['blocks', 'dependent']], ['BLOCKED_BY', ['dependent', 'blocks']], ['RELATES_TO', ['related', 'related']]]) {
      links = [{ relationType, sourceIssueId: 'a', targetIssueId: 'b', sourceIssue: records[0], targetIssue: records[1] },
        { relationType, sourceIssueId: 'a', targetIssueId: 'foreign', sourceIssue: records[0], targetIssue: records[2] }];
      const explicitLinks = links;
      for (const extraPosition of ['none', 'before', 'after']) {
        const extra = { ...explicitLinks[0], relationType: 'RELATES_TO' };
        links = extraPosition === 'none' ? explicitLinks
          : extraPosition === 'before' ? [extra, ...explicitLinks] : [...explicitLinks, extra];
        for (const [index, id] of ['a', 'b'].entries()) {
          const response = await request(id);
          assert.equal(response.status, 200);
          assert.equal(response.body.relatedIssues.length, overlap === 'none' ? 1 : 2);
          assert.equal(new Set(response.body.relatedIssues.map(row => row.id)).size, response.body.relatedIssues.length);
          if (overlap !== 'none') {
            assert.equal(response.body.relatedIssues[1].id, 'ordinary');
            assert.equal(response.body.relatedIssues[1].relation, overlap === 'label' ? 'related' : 'similar');
            assert.ok(response.body.relatedIssues[1].similarity < 1);
          }
          assert.equal(response.body.relatedIssues[0].id, id === 'a' ? 'b' : 'a');
          assert.equal(response.body.relatedIssues[0].relation, expected[index], `${relationType}/${id}`);
          assert.equal(response.body.relatedIssues[0].similarity, 1);
        }
      }
    }
  }
  assert.equal((await request('foreign')).status, 404);
  assert.equal((await request('a', 'foreign')).status, 403);
  assert.equal((await request('a', 'revoked')).status, 403);
  session = null;
  assert.equal((await request('a')).status, 401);
});
