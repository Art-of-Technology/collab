const { assert, test, load, matches } = require('./helpers.cjs');
const issuer = 'https://identity.example.test/realms/company';
const claims = () => new Headers(Object.fromEntries([
  ['issuer', issuer], ['subject', 'issue-user'], ['email', 'mapped@weezboo.com'],
].map(([key, value]) => [`x-collab-${key}`, Buffer.from(value).toString('base64url')])
  .concat([['x-collab-email-verified', 'true'], ['cookie', 'legacy=present']])));
const cases = [['', 'GET'], ['', 'POST'], ['/search', 'GET'], ['/[issueId]/github', 'GET']];

function fixture([path, method]) {
  const env = { env: { COLLAB_AUTH_MODE: 'gateway', COLLAB_GATEWAY_ISSUER: issuer } };
  const state = { headers: claims(), live: true, broken: false, owner: 'mapped',
    legacyCalls: 0, mappingReads: 0, effects: [] };
  const options = { fixtureOptions: true };
  const nextAuth = { getServerSession: async (...args) => {
    assert.equal(args.length, 1); assert.equal(args[0], options); state.legacyCalls++;
    return { user: { id: 'legacy', name: 'Legacy' }, expires: 'legacy-expiry' };
  } };
  const record = (name, args) => state.effects.push([name, args]);
  const workspace = () => ({ id: 'workspace', slug: 'team', name: 'Team', ownerId: state.owner, members: [] });
  const repository = { id: 'repo', fullName: 'fixture/repo', owner: 'fixture', name: 'repo', aiReviewEnabled: false };
  const project = () => ({ id: 'project', workspaceId: 'workspace', workspace: workspace(), repository });
  const issue = () => ({ id: 'issue', issueKey: 'FIX-1', title: 'Fixture', type: 'TASK',
    workspaceId: 'workspace', projectId: 'project', project: project(), workspace: workspace(),
    sourceRelations: [], targetRelations: [], children: [], labels: [] });
  const prisma = {
    account: { findUnique: async () => {
      state.mappingReads++; if (state.broken) throw new Error('Synthetic mapping failure');
      return state.live ? { user: { id: 'mapped', email: 'mapped@weezboo.com', name: 'Mapped', accounts: [{ id: 'mapping' }] } } : null;
    } },
    workspace: {
      findFirst: async args => { record('workspace-read', args); return matches(workspace(), args.where) ? workspace() : null; },
      findMany: async args => { record('workspaces-read', args); return matches(workspace(), args.where) ? [workspace()] : []; },
    },
    project: { findFirst: async args => { record('project-read', args); return matches(project(), args.where) ? project() : null; } },
    issue: {
      findMany: async args => { record('issues-read', args); return matches(issue(), args.where) ? [issue()] : []; },
      findFirst: async args => { record('issue-read', args); return matches(issue(), args.where) ? issue() : null; },
    },
    issueFollower: { findMany: async args => { record('followers-read', args); return []; } },
    projectFollower: { findMany: async args => { record('project-followers-read', args); return []; } },
    branch: { findFirst: async args => { record('branch-read', args); return { name: 'fixture' }; } },
    pullRequest: { findMany: async args => { record('pulls-read', args); return [{ githubPrId: 1 }]; } },
    version: { findMany: async args => { record('versions-read', args); return []; } },
    commit: { findMany: async args => { record('commits-read', args); return [{ sha: 'synthetic' }]; } },
    $transaction: async callback => {
      record('transaction', {});
      return callback({
        project: {
          findUnique: async args => { record('counter-read', args); return { nextIssueNumbers: { TASK: 1 }, issuePrefix: 'FIX' }; },
          update: async args => { record('counter-write', args); return {}; },
        },
        projectStatus: { findFirst: async args => { record('status-read', args); return { id: 'status' }; } },
        issue: {
          findFirst: async args => { record('collision-read', args); return null; },
          create: async args => { record('create', args); return { ...issue(), ...args.data }; },
        },
        issueAssignee: { create: async args => { record('assignment', args); return {}; } },
        issueRelation: { create: async args => { record('relation', args); return {}; } },
      });
    },
  };
  const identity = load('src/lib/gateway-identity.ts', { 'node:crypto': require('node:crypto') }, { process: env, Buffer, TextDecoder, URL });
  const adapter = load('src/lib/request-session.ts', { 'server-only': {}, './gateway-identity': identity,
    'next-auth': nextAuth, 'next/headers': { headers: async () => state.headers }, '@/lib/prisma': { prisma } }, { process: env });
  const route = load(`src/app/api/issues${path}/route.ts`, {
    '@/lib/request-session': adapter, 'next-auth': nextAuth, '@/lib/auth-options': { authOptions: options },
    'next/server': { NextResponse: Response }, '@/lib/prisma': { prisma },
    '@/utils/issueRelations': load('src/utils/issueRelations.ts'),
    '@/lib/board-item-activity-service': { trackCreation: async (...args) => record('activity', args) },
    '@/lib/redis': { publishEvent: async (...args) => record('publish', args) },
    '@/utils/mentions': { extractMentionUserIds: () => [] },
    '@/lib/notification-service': { NotificationType: { ISSUE_CREATED: 'ISSUE_CREATED' },
      NotificationService: { notifyUsers: async (...args) => record('notify', args) } },
    '@/lib/event-bus': { emitIssueCreated: async (...args) => record('webhook', args) },
  }, { URL, console: { error() {}, warn() {} } });
  const invoke = (allWorkspaces = false) => route[method](new Request('https://example.test/api/issues?' +
    (allWorkspaces ? '' : 'workspaceId=workspace&workspace=team&projectIds=project&project=project&type=TASK'), {
    method, headers: { cookie: 'legacy=present' }, ...(method === 'POST' ? { body: JSON.stringify({
      title: 'Fixture', workspaceId: 'team', projectId: 'project', assigneeId: 'assignee', parentId: 'parent', labels: ['label'],
    }) } : {}),
  }), { params: Promise.resolve({ issueId: 'issue' }) });
  const effect = name => state.effects.find(([key]) => key === name)?.[1];
  async function success(actor) {
    state.owner = actor; state.effects.length = 0;
    const response = await invoke(); assert.equal(response.status, method === 'POST' ? 201 : 200);
    const result = await response.json();
    if (method === 'POST') {
      assert.equal(result.issue.reporterId, actor); assert.equal(effect('create').data.reporterId, actor);
      assert.equal(effect('assignment').data.approvedBy, actor); assert.equal(effect('activity')[2], actor);
      assert.equal(effect('webhook')[1].userId, actor); assert.equal(effect('notify')[3], actor);
      assert.equal(effect('publish')[0], 'workspace:workspace:events');
    } else if (path === '/search') {
      assert.equal(result[0].id, 'issue'); state.effects.length = 0;
      assert.equal((await invoke(true)).status, 200); assert.equal(effect('workspaces-read').where.OR[0].ownerId, actor);
      assert.deepEqual(Array.from(effect('issues-read').where.workspaceId.in), ['workspace']);
    } else if (path) {
      assert.equal(result.repository.id, 'repo'); assert.equal(result.pullRequests[0].githubUrl, 'https://github.com/fixture/repo/pull/1');
      assert.equal(result.commits[0].githubUrl, 'https://github.com/fixture/repo/commit/synthetic');
      for (const name of ['branch-read', 'pulls-read', 'versions-read', 'commits-read']) assert.equal(effect(name).where.repositoryId, 'repo');
    } else {
      assert.equal(result.issues[0].id, 'issue'); assert.deepEqual(result.issues[0].issueRelations.children, []);
      assert.equal('sourceRelations' in result.issues[0], false);
    }
  }
  return { state, env, invoke, success };
}

test('legacy issue list is a legitimate control', async () => {
  const f = fixture(cases[0]); f.env.env.COLLAB_AUTH_MODE = 'nextauth';
  await f.success('legacy'); assert.equal(f.state.legacyCalls, 1); assert.equal(f.state.mappingReads, 0);
});

for (const spec of cases) test(`issues${spec.join(' ')} uses mapped actor and preserves legacy contract`, async () => {
  const f = fixture(spec); await f.success('mapped'); assert.ok(f.state.mappingReads > 0); assert.equal(f.state.legacyCalls, 0);
  f.state.owner = 'foreign'; f.state.effects.length = 0;
  assert.equal((await f.invoke()).status, spec[0] === '/[issueId]/github' ? 404 : 403);
  assert.ok(f.state.effects.every(([name]) => ['workspace-read', 'issue-read'].includes(name)));
  for (const failure of ['missing', 'revoked', 'invalid', 'database']) {
    f.state.headers = failure === 'missing' ? new Headers({ cookie: 'legacy=present' }) : claims();
    f.state.live = failure !== 'revoked'; f.state.broken = failure === 'database';
    f.env.env.COLLAB_AUTH_MODE = failure === 'invalid' ? 'invalid' : 'gateway'; f.state.effects.length = 0;
    assert.equal((await f.invoke()).status, failure === 'database' ? 500 : 401, failure);
    assert.deepEqual(f.state.effects, []); assert.equal(f.state.legacyCalls, 0);
  }
  f.state.broken = false; f.state.live = true; const reads = f.state.mappingReads;
  for (const mode of ['nextauth', undefined]) {
    if (mode) f.env.env.COLLAB_AUTH_MODE = mode; else delete f.env.env.COLLAB_AUTH_MODE;
    await f.success('legacy');
  }
  assert.equal(f.state.legacyCalls, spec[0] === '/search' ? 4 : 2); assert.equal(f.state.mappingReads, reads);
});
