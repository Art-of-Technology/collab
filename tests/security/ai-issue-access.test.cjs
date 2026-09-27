const { assert, test, load, matches } = require('./helpers.cjs');

function fixture(kind) {
  const state = { member: true, owner: false, mapping: true, session: true, legacy: 0, reads: [], rootProject: false, rootStatus: false, hiddenLabels: false, hiddenOnly: false, hiddenLinksOnly: false };
  const workspace = { id: 'workspace', get ownerId() { return state.owner ? 'actor' : 'owner'; }, get members() { return [{ userId: 'actor', status: state.member }]; } };
  const foreign = { id: 'foreign', ownerId: 'outsider', members: [] };
  const project = { id: 'project', workspaceId: 'workspace', workspace };
  const hiddenProject = { id: 'hidden-project', workspaceId: 'foreign', workspace: foreign };
  const status = { id: 'status', name: 'Open', color: 'blue', isFinal: false, project };
  const label = { id: 'label', name: 'Visible label', workspaceId: 'workspace', workspace };
  const hiddenLabel = { id: 'hidden-label', name: 'HIDDEN label', workspaceId: 'foreign', workspace: foreign };
  const issue = { id: 'root', issueKey: 'FIX-1', title: 'Important search issue', description: '', workspaceId: 'workspace', workspace,
    get project() { return state.rootProject ? hiddenProject : project; },
    get projectStatus() { return state.rootStatus ? { ...status, project: hiddenProject } : status; },
    get labels() { return state.hiddenLabels ? [hiddenLabel] : [label]; },
    statusId: 'status', priority: null, assigneeId: null, assignee: null, dueDate: null, comments: [] };
  const visible = { ...issue, id: 'visible', issueKey: 'FIX-2', title: 'Important search task', labels: [label] };
  const labelOnly = { ...visible, id: 'label-only', title: 'Different title', get labels() { return state.hiddenLabels ? [hiddenLabel] : [label]; } };
  const hiddenProjectIssue = { ...visible, id: 'hidden-project-issue', title: 'Important HIDDEN project', project: hiddenProject };
  const hiddenStatusIssue = { ...visible, id: 'hidden-status-issue', title: 'Important HIDDEN status', projectStatus: { ...status, project: hiddenProject } };
  const hiddenWorkspaceIssue = { ...visible, id: 'hidden-workspace-issue', title: 'Important HIDDEN workspace', workspaceId: 'foreign', workspace: foreign };
  const candidates = () => state.hiddenOnly ? [hiddenProjectIssue, hiddenStatusIssue, hiddenWorkspaceIssue] : [visible, labelOnly, hiddenProjectIssue, hiddenStatusIssue, hiddenWorkspaceIssue];
  const relations = () => candidates().filter(candidate => !state.hiddenLinksOnly || candidate.id.startsWith('hidden-')).map((targetIssue, i) => ({ id: 'relation-' + i, sourceIssueId: 'root', targetIssueId: targetIssue.id,
    sourceIssue: issue, targetIssue, relationType: 'BLOCKS' }));
  const pick = (row, args) => {
    if (!row) return null;
    const result = args.select ? {} : { ...row };
    for (const [key, value] of Object.entries(args.select || args.include || {})) {
      if (value === true) result[key] = row[key];
      else if (Array.isArray(row[key])) result[key] = query(row[key], value);
      else result[key] = row[key] && (!value.where || matches(row[key], value.where)) ? pick(row[key], value) : null;
    }
    return result;
  };
  const query = (rows, args) => rows.filter(row => matches(row, args.where || {})).slice(0, args.take ?? Infinity).map(row => pick(row, args));
  const prisma = {
    account: { findUnique: async () => state.mapping ? { user: { id: 'actor', email: 'actor@weezboo.com', accounts: [{ id: 'mapping' }] } } : null },
    workspace: { findFirst: async args => matches(workspace, args.where) ? workspace : null },
    issue: {
      findFirst: async args => { state.reads.push(['root', args]); return matches(issue, args.where) ? pick(issue, args) : null; },
      findMany: async args => { state.reads.push(['candidates', args]); return query(candidates(), args); },
      count: async args => { state.reads.push(['count', args]); return query(candidates(), args).length; },
    },
    issueRelation: {
      findMany: async args => { state.reads.push(['links', args]); return query(relations(), args); },
      count: async args => { state.reads.push(['links-count', args]); return query(relations(), args).length; },
    },
    taskLabel: { findMany: async args => { state.reads.push(['labels', args]); return query([label, hiddenLabel], args); } },
    issueActivity: { findFirst: async args => { state.reads.push(['activity', args]); return null; } },
  };
  const options = {}, env = { env: { COLLAB_AUTH_MODE: 'nextauth', COLLAB_GATEWAY_ISSUER: 'https://identity.example.test' } };
  const nextAuth = { getServerSession: async value => { assert.equal(value, options); state.legacy++; return state.session ? { user: { id: 'actor', email: 'actor@weezboo.com' } } : null; } };
  const adapter = load('src/lib/request-session.ts', { 'server-only': {},
    './gateway-identity': load('src/lib/gateway-identity.ts', { 'node:crypto': require('node:crypto') }, { process: env, Buffer, TextDecoder, URL }),
    'next-auth': nextAuth, 'next/headers': { headers: () => new Headers({ 'x-collab-issuer': Buffer.from(env.env.COLLAB_GATEWAY_ISSUER).toString('base64url'),
      'x-collab-subject': Buffer.from('ai-actor').toString('base64url'), 'x-collab-email': Buffer.from('actor@weezboo.com').toString('base64url'), 'x-collab-email-verified': 'true' }) },
    '@/lib/prisma': { prisma },
  }, { process: env });
  const deps = { '@/lib/prisma': { prisma }, '@/lib/request-session': adapter, 'next-auth': nextAuth, '@/lib/auth': { authConfig: options },
    '@/lib/issue-finder': load('src/lib/issue-finder.ts', { '@/lib/prisma': { prisma } }), 'next/server': { NextResponse: Response } };
  const GET = load(`src/app/api/ai/issues/${kind}/route.ts`, deps, { URL, console: { error() {} } }).GET;
  return { state, env, invoke: () => GET(new Request('https://example.test/?issueId=root&workspaceId=workspace')) };
}

for (const kind of ['related', 'suggestions']) {
  test(`${kind}: legacy active-member control`, async () => {
    const f = fixture(kind); const result = await f.invoke(); assert.equal(result.status, 200); assert.equal(f.state.legacy, 1);
    const body = await result.json(); assert.ok(kind === 'related' ? body.relatedIssues.some(row => row.id === 'visible') : body.suggestions.some(row => row.id === 'suggest-priority'));
  });
  test(`${kind}: inaccessible root project/status denies before dependent queries`, async () => {
    for (const field of ['rootProject', 'rootStatus']) {
      const f = fixture(kind); f.state[field] = true; assert.equal((await f.invoke()).status, 404);
      assert.deepEqual(f.state.reads.map(([name]) => name), ['root']);
    }
  });
  test(`${kind}: owner gateway access and denied mapping never falls back`, async () => {
    const f = fixture(kind); f.state.owner = true; f.state.member = false; f.env.env.COLLAB_AUTH_MODE = 'gateway';
    assert.equal((await f.invoke()).status, 200); assert.equal(f.state.legacy, 0);
    f.state.mapping = false; f.state.reads.length = 0; assert.equal((await f.invoke()).status, 401); assert.deepEqual(f.state.reads, []); assert.equal(f.state.legacy, 0);
    const revoked = fixture(kind); revoked.state.member = false; assert.equal((await revoked.invoke()).status, 403); assert.deepEqual(revoked.state.reads, []);
  });
}

test('related filters candidate and explicit-link endpoint project/status/workspace scope', async () => {
  const body = await (await fixture('related').invoke()).json();
  assert.deepEqual(body.relatedIssues.map(row => row.id).sort(), ['label-only', 'visible']);
  assert.ok(body.relatedIssues.every(row => row.similarity === 1 && row.relation === 'blocks'));
});

test('suggestions do not count hidden candidates or treat inaccessible labels as present', async () => {
  const f = fixture('suggestions'); f.state.hiddenOnly = true; f.state.hiddenLabels = true;
  const body = await (await f.invoke()).json();
  assert.ok(body.suggestions.some(row => row.id === 'suggest-labels'));
  assert.equal(body.suggestions.some(row => row.id === 'suggest-link'), false);
  const query = f.state.reads.find(([name]) => name === 'count')[1];
  assert.equal(matches({ workspaceId: 'foreign', project: { workspaceId: 'workspace' }, id: 'other', title: 'Important hidden' }, query.where), false);
});


test('suggestions count only readable link endpoints while retaining visible-link suppression', async () => {
  const f = fixture('suggestions'); f.state.hiddenLinksOnly = true;
  let body = await (await f.invoke()).json();
  assert.ok(body.suggestions.some(row => row.id === 'suggest-link'));
  assert.equal(f.state.reads.filter(([name]) => name === 'links-count').length, 1);
  f.state.hiddenLinksOnly = false;
  body = await (await f.invoke()).json();
  assert.equal(body.suggestions.some(row => row.id === 'suggest-link'), false);
  assert.equal(f.state.reads.filter(([name]) => name === 'links-count').length, 2);
});
