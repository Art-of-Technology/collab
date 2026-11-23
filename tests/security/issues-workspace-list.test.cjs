const { assert, test, load } = require('./helpers.cjs');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir, userInfo } = require('node:os');
const { join, resolve } = require('node:path');
const { Prisma, PrismaClient } = require('@prisma/client');

test('workspace and multi-project lists return every visible row and field', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'collab-issues-list-'));
  const bindir = execFileSync('pg_config', ['--bindir'], { encoding: 'utf8' }).trim();
  const data = join(directory, 'data');
  const pg = (command, args, options) => execFileSync(join(bindir, command), args, { stdio: 'pipe', ...options });
  let started = false;
  let raw;
  t.after(async () => {
    await raw?.$disconnect();
    if (started) pg('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
    rmSync(directory, { recursive: true, force: true });
  });
  pg('initdb', ['-D', data, '-A', 'trust', '--no-locale', '-E', 'UTF8']);
  pg('pg_ctl', ['-D', data, '-l', join(directory, 'server.log'), '-o', `-k ${directory} -c listen_addresses='' -c fsync=off -c work_mem=4MB`, '-w', 'start']);
  started = true;
  const username = userInfo().username;
  const schema = execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'diff', '--from-empty',
    '--to-schema-datamodel', resolve('prisma/schema.prisma'), '--script'], { stdio: 'pipe' });
  pg('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-h', directory, '-U', username, '-d', 'postgres'], { input: schema });

  const url = `postgresql://${encodeURIComponent(username)}@localhost/postgres?host=${encodeURIComponent(directory)}`;
  raw = new PrismaClient({ datasources: { db: { url } }, log: [{ emit: 'event', level: 'query' }] });
  const { issueVisibilityExtension } = load('src/lib/issue-visibility.ts');
  const statements = [];
  const issueQueries = [];
  let afterIssueRead;
  raw.$on('query', event => statements.push(event));
  const prisma = raw.$extends(issueVisibilityExtension(Prisma.dmmf.datamodel.models)).$extends({
    query: {
      async $queryRaw({ args, query }) {
        const rows = await query(args);
        issueQueries.push(statements.at(-1));
        await afterIssueRead?.();
        return rows;
      },
    },
  });

  await raw.user.createMany({ data: [{ id: 'owner', name: 'Owner', email: 'owner@example.test' }, { id: 'member' }] });
  await raw.workspace.createMany({ data: ['workspace', 'other'].map(id => ({ id, name: id, slug: id, ownerId: 'owner' })) });
  await raw.workspaceMember.create({ data: { workspaceId: 'workspace', userId: 'member' } });
  await raw.project.createMany({ data: [
    { id: 'p', name: 'Project P', slug: 'p', issuePrefix: 'PP', workspaceId: 'workspace', description: 'A project' },
    { id: 'q', name: 'Project Q', slug: 'q', issuePrefix: 'QQ', workspaceId: 'workspace' },
    { id: 'r', name: 'Project R', slug: 'r', issuePrefix: 'RR', workspaceId: 'other' },
  ] });
  await raw.projectStatus.create({ data: { id: 'status', projectId: 'p', name: 'done', displayName: 'Done', order: 4 } });
  await raw.issue.createMany({ data: [
    { id: 'parent', projectId: 'p', description: 'Full description with "quotes" and a tab\t— saved in the view', dueDate: new Date('2026-11-18T07:09:11.012Z'), statusId: 'status', assigneeId: 'member', reporterId: 'owner' },
    { id: 'child', projectId: 'q', parentId: 'parent', milestoneId: 'parent' },
    { id: 'request', projectId: 'p', parentId: 'parent', agentRequestRole: 'review' },
    { id: 'follow-up', projectId: 'q', parentId: 'request' },
    { id: 'deleted', projectId: 'p', parentId: 'parent', deletedAt: new Date('2026-11-20') },
    { id: 'retained-child', projectId: 'q', parentId: 'deleted' },
    { id: 'foreign', projectId: 'r', workspaceId: 'other' },
    { id: 'foreign-child', projectId: 'r', workspaceId: 'other', parentId: 'child' },
  ].map((row, index) => ({
    workspaceId: 'workspace', title: row.id, issueKey: `ISS-${index + 1}`,
    updatedAt: new Date(Date.UTC(2026, 10, 22, 12, 0, 10 - index)), ...row,
  })) });
  await raw.issue.update({ where: { id: 'parent' }, data: {
    updatedAt: new Date('2026-11-22T12:00:10Z'),
    labels: { create: { name: 'Important', color: '#ff0000', workspaceId: 'workspace' } },
  } });
  await raw.issueComment.create({ data: { issueId: 'parent', authorId: 'member', content: 'One comment' } });
  await raw.issueRelation.createMany({ data: [
    { sourceIssueId: 'parent', targetIssueId: 'child', relationType: 'BLOCKS' },
    { sourceIssueId: 'parent', targetIssueId: 'deleted', relationType: 'RELATES_TO' },
    { sourceIssueId: 'parent', targetIssueId: 'request', relationType: 'DUPLICATES' },
    { sourceIssueId: 'child', targetIssueId: 'foreign', relationType: 'BLOCKS' },
    { sourceIssueId: 'foreign', targetIssueId: 'child', relationType: 'DUPLICATES' },
  ] });
  // A database migration can be live before its Prisma schema reaches the app.
  await raw.$executeRaw`ALTER TABLE "Issue" ADD COLUMN "stagedField" text DEFAULT 'fixture'`;

  let userId = 'member';
  let failEncoding;
  const streamError = new Error('Could not encode the next issue batch');
  const errors = [];
  class IssueEncoder extends TextEncoder {
    encode(input) {
      if (failEncoding && input.startsWith(failEncoding)) throw streamError;
      return super.encode(input);
    }
  }
  // The browser reads every list through this.
  const snapshots = load('src/lib/issue-list-snapshot.ts', {
    '@/utils/issueRelations': load('src/utils/issueRelations.ts'),
  });
  const { GET } = load('src/app/api/issues/route.ts', {
    'next/server': { NextResponse: Response },
    '@/lib/request-session': { getServerSession: async () => ({ user: { id: userId } }) },
    '@/lib/auth-options': {},
    '@/lib/prisma': { prisma },
    '@/lib/board-item-activity-service': {},
    '@/lib/redis': {},
    '@/utils/mentions': {},
    '@/lib/notification-service': {},
    '@/lib/event-bus': {},
    '@/utils/issueRelations': load('src/utils/issueRelations.ts'),
    '@/lib/issue-list-snapshot': snapshots,
  }, {
    URL, Response, ReadableStream, TextEncoder: IssueEncoder,
    console: { ...console, error: (...args) => errors.push(args) },
  });
  const list = query => GET(new Request(`https://example.test/api/issues?${query}`));
  const { readIssueList } = snapshots;
  const readRows = async response => {
    assert.equal(response.status, 200);
    // structuredClone keeps undefined fields and moves the rows out of the module's realm.
    const { issues } = structuredClone(readIssueList(await response.json()));
    for (const issue of issues) {
      // SQL does not promise an order inside these arrays.
      issue.children.sort((a, b) => a.id.localeCompare(b.id));
      issue.issueRelations.children.sort((a, b) => a.id.localeCompare(b.id));
    }
    return issues;
  };
  for (const requests of ['', '&requests=1']) {
    const expected = [];
    for (const project of ['p', 'q']) {
      expected.push(...await readRows(await list('workspaceId=workspace&projectIds=' + project + requests)));
    }
    expected.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    const ids = requests ? ['parent', 'child', 'request', 'follow-up', 'retained-child']
      : ['parent', 'child', 'follow-up', 'retained-child'];
    for (const projects of ['', '&projectIds=p,q,r', '&projectIds=q,missing']) {
      const body = await (await list('workspaceId=workspace' + requests + projects)).text();
      const { snapshot } = JSON.parse(body);
      assert.deepEqual(snapshot.projects.map(project => project.id).sort(), projects === '&projectIds=q,missing' ? ['q'] : ['p', 'q']);
      assert.equal(body.split('"Project Q"').length - 1, 1, 'a shared record is sent once');
      issueQueries.length = 0;
      const issues = await readRows(await list('workspaceId=workspace' + requests + projects));
      if (projects === '&projectIds=q,missing') {
        assert.deepEqual(issues, expected.filter(issue => issue.projectId === 'q'));
      } else {
        assert.deepEqual(issues, expected);
        assert.deepEqual(issues.map(row => row.id), ids);
        assert.deepEqual(issues[0]._count, { children: requests ? 2 : 1, comments: 1 });
        assert.equal(issues[0].issueRelations.blocks[0].id, 'child');
        assert.deepEqual(issues[0].issueRelations.relates_to, []);
      }
      assert.equal(issues.at(-1).parent, null);
      assert.equal(issueQueries.length, 1, 'one statement reads the complete list');
    }
  }

  assert.deepEqual(await readRows(await list('workspaceId=workspace&projectIds=missing,also-missing')), []);

  statements.length = 0;
  assert.equal((await list('workspaceId=other')).status, 403);
  assert.equal(statements.length, 1);

  for (const [scope, filter] of [
    ['workspace', ''],
    ['multiple projects', '&projectIds=p,q'],
    ['single project', '&projectIds=q'],
    ['milestone', '&milestoneId=parent'],
  ]) {
    await t.test(`relation visibility with the ${scope} filter follows current workspace access`, async () => {
      const readRelations = async () => {
        const rows = await readRows(await list('workspaceId=workspace' + filter));
        const { children, _count, issueRelations: { blocks, duplicated_by } } = rows.find(row => row.id === 'child');
        assert.equal(_count.children, children.length);
        return [blocks.map(issue => issue.id), duplicated_by.map(issue => issue.id), children.map(issue => issue.id)];
      };
      const key = { userId_workspaceId: { userId: 'member', workspaceId: 'other' } };
      const membership = await raw.workspaceMember.create({ data: { ...key.userId_workspaceId, status: false } });
      try {
        assert.deepEqual(await readRelations(), [[], [], []]);
        await raw.workspaceMember.update({ where: key, data: { status: true } });
        assert.deepEqual(await readRelations(), [['foreign'], ['foreign'], ['foreign-child']]);
        await raw.workspaceMember.update({ where: key, data: { status: false } });
        assert.deepEqual(await readRelations(), [[], [], []]);
        userId = 'owner';
        assert.deepEqual(await readRelations(), [['foreign'], ['foreign'], ['foreign-child']]);
      } finally {
        userId = 'member';
        await raw.workspaceMember.delete({ where: { id: membership.id } });
      }
      assert.deepEqual(await readRelations(), [[], [], []]);
    });
  }

  await t.test('a broad list bounds database work to the workspace and its related issues', async t => {
    await raw.$executeRaw`
      INSERT INTO "Issue" (id, title, description, "projectId", "workspaceId", "updatedAt", "issueKey", "parentId")
      SELECT 'local-' || n, 'Local issue', repeat('Full description. ', 90),
        'p', 'workspace', timestamp '2026-12-01' - n * interval '1 second', 'PP-' || n,
        CASE WHEN n > 1000 AND n <= 3600 THEN 'local-' || (1 + n % 600) END
      FROM generate_series(1, 5152) n
      UNION ALL
      SELECT 'unrelated-' || n, 'Unrelated issue', NULL, 'r', 'other', now(), 'RR-' || n,
        CASE WHEN n > 200 THEN 'unrelated-' || (1 + n % 150) END
      FROM generate_series(1, 30000) n
    `;
    await raw.$executeRaw`
      INSERT INTO "IssueComment" (id, "issueId", "authorId", content, "updatedAt")
      SELECT 'local-comment-' || n, 'local-' || n, 'owner', 'Local comment', now()
      FROM generate_series(1, 5152) n
      UNION ALL
      SELECT 'unrelated-comment-' || n, 'unrelated-' || n, 'owner', 'Unrelated comment', now()
      FROM generate_series(1, 30000) n
    `;
    await raw.$executeRaw`
      INSERT INTO issue_relations (id, "sourceIssueId", "targetIssueId", "relationType", "updatedAt")
      SELECT 'unrelated-relation-' || n, 'unrelated-' || n, 'unrelated-' || (n + 1),
        'BLOCKS'::"IssueRelationType", now()
      FROM generate_series(1, 29999) n
    `;

    await raw.taskLabel.create({ data: { id: 'unrelated-label', name: 'Unrelated', workspaceId: 'other' } });
    await raw.$executeRaw`
      INSERT INTO "_IssueToLabel" ("A", "B")
      SELECT 'unrelated-' || n, 'unrelated-label' FROM generate_series(1, 30000) n
    `;
    await raw.$executeRaw`ANALYZE`;

    const expected = [];
    for (const project of ['p', 'q']) {
      expected.push(...await readRows(await list('workspaceId=workspace&projectIds=' + project)));
    }
    expected.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    issueQueries.length = 0;
    statements.length = 0;
    const response = await list('workspaceId=workspace');
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /^application\/json\b/);
    const [sample, body] = response.body.tee();
    const reader = sample.getReader();
    const first = await reader.read();
    const cancel = reader.cancel();
    assert.deepEqual(await readRows(new Response(body)), expected);
    await cancel;
    assert.ok(first.value.byteLength < 1024 * 1024, 'the response sends a small first chunk');
    assert.equal(expected.length, 5156);
    assert.equal(issueQueries.length, 1, 'a broad list reads every issue in one database statement');
    assert.equal(statements.length, 2, 'the workspace access check and the snapshot read are the only statements');
    const text = await (await list('workspaceId=workspace')).text();
    assert.equal(text.split('"Project P"').length - 1, 1, 'the project is sent once, not on each row');
    assert.ok(text.length < JSON.stringify({ issues: expected }).length * 0.9,
      `the snapshot (${text.length} bytes) is smaller than the expanded rows`);

    function largestRead(plan) {
      const rows = ['Issue', 'IssueComment', 'issue_relations', '_IssueToLabel'].includes(plan['Relation Name'])
        ? plan['Actual Loops'] * (plan['Actual Rows'] + (plan['Rows Removed by Filter'] ?? 0))
        : 0;
      return Math.max(rows, ...(plan.Plans ?? []).map(largestRead));
    }

    function sortSpills(plan) {
      return plan['Sort Space Type'] === 'Disk' || (plan.Plans ?? []).some(sortSpills);
    }

    async function assertReadBound() {
      let maxRead = 0;
      for (const { query, params } of issueQueries) {
        const [explain] = await raw.$queryRawUnsafe(
          'EXPLAIN (ANALYZE, FORMAT JSON) ' + query, ...JSON.parse(params),
        );
        const { Plan, JIT } = explain['QUERY PLAN'][0];
        maxRead = Math.max(maxRead, largestRead(Plan));
        assert.equal(JIT, undefined, `Unexpected query compilation for ${userId}`);
        assert.equal(sortSpills(Plan), false, `Issue list spilled to disk for ${userId}`);
      }
      t.diagnostic(`Largest issue or relation scan as ${userId}: ${maxRead} rows`);
      assert.ok(maxRead < 12000, `Scanned ${maxRead} rows for the issue list as ${userId}`);
    }

    await assertReadBound();
    userId = 'owner';
    try {
      issueQueries.length = 0;
      const rows = await readRows(await list('workspaceId=workspace'));
      assert.deepEqual(rows.map(issue => issue.id), expected.map(issue => issue.id));
      await assertReadBound();
    } finally {
      userId = 'member';
    }

    await t.test('the streamed body retains its snapshot after the database read finishes', async () => {
      const last = expected.at(-1);
      afterIssueRead = async () => {
        await raw.issue.update({ where: { id: last.id }, data: { title: 'Changed after the read' } });
        await raw.project.update({ where: { id: 'p' }, data: { name: 'Renamed after the read' } });
      };
      try {
        assert.deepEqual(await readRows(await list('workspaceId=workspace')), expected);
      } finally {
        afterIssueRead = undefined;
      }
    });

    failEncoding = '{"snapshot":';
    assert.equal((await list('workspaceId=workspace')).status, 500);
    failEncoding = ',';
    const interrupted = await list('workspaceId=workspace');
    assert.equal(interrupted.status, 200);
    await assert.rejects(interrupted.arrayBuffer(), streamError);
    assert.deepEqual(errors, [['[ISSUES_GET]', streamError], ['[ISSUES_GET]', streamError]]);
  });
});
