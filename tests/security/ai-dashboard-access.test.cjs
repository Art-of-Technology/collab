const { assert, test, load, matches: baseMatches } = require('./helpers.cjs');

function matches(row, where = {}) {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'AND') return value.every(part => matches(row, part));
    if (key === 'OR') return value.some(part => matches(row, part));
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      if ('has' in value) return row?.[key]?.includes(value.has) ?? false;
      if ('some' in value) return row?.[key]?.some(item => matches(item, value.some)) ?? false;
      if (!['in', 'not', 'contains', 'gte', 'lt'].some(op => op in value)) return row?.[key] != null && matches(row[key], value);
    }
    return baseMatches(row, { [key]: value });
  });
}

function fixture() {
  const state = { member: true, owner: false, session: true, live: true, legacy: 0, reads: [], revoke: false, hiddenRelation: false };
  const date = new Date(); const yesterday = new Date(date); yesterday.setDate(date.getDate() - 1);
  const old = new Date(date); old.setDate(date.getDate() - 5);
  const workspace = { id: 'workspace', get ownerId() { return state.owner ? 'actor' : 'owner'; },
    get members() { return [{ userId: 'actor', status: state.member }]; } };
  const foreign = { id: 'foreign', ownerId: 'outsider', members: [] };
  const actor = { id: 'actor', name: 'Actor', email: 'actor@weezboo.com', image: null };
  const project = { id: 'project', workspaceId: 'workspace', workspace, name: 'Visible project', slug: 'project', color: '#123456', isArchived: false, updatedAt: date };
  const foreignProject = { ...project, id: 'hidden-project', workspaceId: 'foreign', workspace: foreign, name: 'HIDDEN project' };
  const status = { id: 'status', project, name: 'In Progress', displayName: 'In Progress', isFinal: false, color: '#123456' };
  const source = { id: 'blocking-source', workspaceId: 'workspace', workspace, project, statusId: 'status', projectStatus: status, createdAt: yesterday };
  const hiddenSource = { ...source, workspaceId: 'foreign', workspace: foreign, project: foreignProject, createdAt: new Date('2000-01-01') };
  const issue = { id: 'visible', issueKey: 'FIX-1', title: 'Visible issue', workspaceId: 'workspace', workspace, project,
    statusId: 'status', projectStatus: status, assigneeId: 'actor', reporterId: 'actor', assignee: actor,
    priority: 'high', dueDate: yesterday, createdAt: yesterday, updatedAt: old,
    get targetRelations() { return [{ id: 'relation', relationType: 'BLOCKED_BY', sourceIssue: state.hiddenRelation ? hiddenSource : source, targetIssue: issue }]; } };
  const hiddenProjectIssue = { ...issue, id: 'hidden-project-issue', title: 'HIDDEN project issue', project: foreignProject };
  const hiddenStatusIssue = { ...issue, id: 'hidden-status-issue', title: 'HIDDEN status issue', projectStatus: { ...status, project: foreignProject } };
  const hiddenWorkspaceIssue = { ...issue, id: 'hidden-workspace-issue', title: 'HIDDEN workspace issue', workspaceId: 'foreign', workspace: foreign };
  const rows = [issue, hiddenProjectIssue, hiddenStatusIssue, hiddenWorkspaceIssue];
  project.issues = rows; foreignProject.issues = [hiddenProjectIssue];
  const views = ['PERSONAL', 'SHARED', 'WORKSPACE'].map((visibility, i) => ({ id: `hidden-view-${i}`, name: 'HIDDEN view', slug: 'hidden', workspaceId: 'workspace', workspace,
    ownerId: 'other', visibility, sharedWith: [], lastAccessedAt: date, color: null, projectIds: [],
    ...(visibility === 'WORKSPACE' ? { id: 'workspace-view', name: 'Visible workspace view' } : {}),
  }));
  views.push({ ...views[0], id: 'own-view', name: 'Visible own view', ownerId: 'actor' },
    { ...views[1], id: 'shared-view', name: 'Visible shared view', sharedWith: ['actor'] });
  const comments = rows.map((row, i) => ({ id: `comment-${i}`, issue: row, content: '@Actor comment', authorId: 'other', author: actor, createdAt: date }));
  const select = (row, spec) => {
    if (!row) return null;
    const result = spec.select ? {} : { ...row };
    for (const [key, value] of Object.entries(spec.select || spec.include || {})) {
      if (key === '_count') { result[key] = Object.fromEntries(Object.entries(value.select).map(([name, rule]) => [name, row[name].filter(item => rule === true || matches(item, rule.where)).length])); continue; }
      if (value === true) result[key] = row[key];
      else if (Array.isArray(row[key])) result[key] = query(row[key], value);
      else result[key] = row[key] && (!value.where || matches(row[key], value.where)) ? select(row[key], value) : null;
    }
    return result;
  };
  const query = (data, args) => data.filter(row => matches(row, args.where)).slice(0, args.take ?? Infinity).map(row => select(row, args));
  const records = (name, data) => ({ findMany: async args => { state.reads.push([name, args]); return query(data, args); } });
  const prisma = {
    account: { findUnique: async () => state.live ? { user: { ...actor, accounts: [{ id: 'mapping' }] } } : null },
    workspace: { findFirst: async args => { const found = matches(workspace, args.where); if (state.revoke) state.member = false; return found ? { id: workspace.id } : null; } },
    issue: records('issue', rows), project: records('project', [project]), view: records('view', views),
    issueComment: records('comment', comments), post: records('post', []),
    workspaceMember: records('member', [{ id: 'member', workspaceId: 'workspace', workspace, status: true, userId: 'actor', user: { ...actor, assignedIssues: rows } }]),
  };
  const options = {}; const env = { env: { COLLAB_AUTH_MODE: 'nextauth', COLLAB_GATEWAY_ISSUER: 'https://identity.example.test' } };
  const nextAuth = { getServerSession: async value => { assert.equal(value, options); state.legacy++; return state.session ? { user: actor } : null; } };
  const identity = load('src/lib/gateway-identity.ts', { 'node:crypto': require('node:crypto') }, { process: env, Buffer, TextDecoder, URL });
  const adapter = load('src/lib/request-session.ts', { 'server-only': {}, './gateway-identity': identity, 'next-auth': nextAuth,
    'next/headers': { headers: () => new Headers({ 'x-collab-issuer': Buffer.from(env.env.COLLAB_GATEWAY_ISSUER).toString('base64url'),
      'x-collab-subject': Buffer.from('dashboard-actor').toString('base64url'), 'x-collab-email': Buffer.from(actor.email).toString('base64url'), 'x-collab-email-verified': 'true' }) },
    '@/lib/prisma': { prisma },
  }, { process: env });
  const deps = { '@/lib/prisma': { prisma }, '@/lib/request-session': adapter, 'next-auth': nextAuth, '@/lib/auth': { authOptions: options },
    '@/lib/post-access': load('src/lib/post-access.ts'), '@/lib/issue-finder': load('src/lib/issue-finder.ts', { '@/lib/prisma': { prisma } }),
    '@/utils/teamSyncAnalyzer': load('src/utils/teamSyncAnalyzer.ts'), 'next/server': { NextResponse: Response } };
  deps['@/lib/view-access'] = load('src/lib/view-access.ts', deps);
  const GET = load('src/app/api/ai/dashboard/route.ts', deps, { URL, console: { error() {} } }).GET;
  return { state, env, invoke: () => GET(new Request('https://example.test/api/ai/dashboard?workspaceId=workspace')) };
}

test('dashboard legacy active member remains a positive control', async () => {
  const f = fixture(); const result = await f.invoke(); assert.equal(result.status, 200);
  const body = await result.json(); assert.ok(body.myQueue.some(row => row.id === 'visible')); assert.equal(f.state.legacy, 1);
});

test('dashboard scopes private and shared views in both response paths', async () => {
  const body = await (await fixture().invoke()).json();
  assert.deepEqual(body.recentlyViewed.views.map(row => row.id).sort(), ['own-view', 'shared-view', 'workspace-view']);
  assert.ok(body.recentInteractions.filter(row => row.type === 'view').every(row => !row.title.includes('HIDDEN')));
});

test('dashboard scopes issue projections, nested team issues and project counts', async () => {
  const body = await (await fixture().invoke()).json();
  assert.doesNotMatch(JSON.stringify(body), /HIDDEN|hidden-project-issue|hidden-status-issue|hidden-workspace-issue/);
  assert.equal(body.projects[0].totalCount, 1); assert.equal(body.projects[0].overdueCount, 1);
  assert.equal(body.team[0].inProgressCount, 1); assert.equal(body.team[0].currentIssue.id, 'visible');
});

test('dashboard hidden relation endpoints cannot create blocker previews or counts', async () => {
  const f = fixture(); f.state.hiddenRelation = true;
  const body = await (await f.invoke()).json();
  assert.deepEqual(body.blockers, []); assert.equal(body.projects[0].blockedCount, 0);
});

test('dashboard current owner and gateway mapping work, with no cookie fallback on denial', async () => {
  const f = fixture(); f.state.owner = true; f.state.member = false; f.env.env.COLLAB_AUTH_MODE = 'gateway';
  assert.equal((await f.invoke()).status, 200); assert.equal(f.state.legacy, 0);
  f.state.live = false; f.state.reads.length = 0; assert.equal((await f.invoke()).status, 401); assert.deepEqual(f.state.reads, []); assert.equal(f.state.legacy, 0);
});

test('dashboard denies revoked members and repeats access at payload queries', async () => {
  const denied = fixture(); denied.state.member = false; assert.equal((await denied.invoke()).status, 403); assert.deepEqual(denied.state.reads, []);
  const f = fixture(); f.state.revoke = true; const body = await (await f.invoke()).json();
  assert.deepEqual(body.myQueue, []); assert.deepEqual(body.projects, []); assert.deepEqual(body.team, []);
  assert.deepEqual(body.recentlyViewed.views, []); assert.deepEqual(body.recentInteractions, []);
});
