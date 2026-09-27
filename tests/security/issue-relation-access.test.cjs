const { assert, test, load, matches } = require('./helpers.cjs');
const clone = value => JSON.parse(JSON.stringify(value));
const routeRoot = 'src/app/api/workspaces/[workspaceId]/issues/[issueKey]/relations/';

function fixture() {
  const state = { mapping: true, subject: 'actor', legacy: 0, writes: [] };
  const workspace = { id: 'workspace', slug: 'space', ownerId: 'other', members: [{ userId: 'actor', status: true }] };
  const joined = { id: 'joined', slug: 'joined', ownerId: 'other', members: [{ userId: 'actor', status: true }] };
  const hidden = { id: 'hidden', slug: 'hidden', ownerId: 'other', members: [] };
  const project = { id: 'project', name: 'Project', workspace };
  const hiddenProject = { id: 'hidden-project', workspace: hidden };
  const issue = (id, ws = workspace, extra = {}) => ({ id, issueKey: id.toUpperCase() + '-1', title: id, workspaceId: ws.id, workspace: ws, project: { ...project, workspace: ws }, statusId: null, status: 'done', type: 'TASK', priority: 'HIGH', createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-02'), assignee: null, children: [], ...extra });
  const source = issue('source'); const target = issue('target', joined); const hiddenIssue = issue('hidden-issue', workspace, { project: hiddenProject });
  const hiddenStatus = issue('hidden-status', workspace, { statusId: 'private', projectStatus: { project: hiddenProject } });
  const child = issue('child'); target.children = [child, hiddenIssue];
  const issues = [source, target, hiddenIssue, hiddenStatus, child];
  const link = (id, from, to, type = 'RELATES_TO') => ({ id, sourceIssueId: from.id, targetIssueId: to.id, sourceIssue: from, targetIssue: to, relationType: type });
  state.links = [link('visible', source, target), link('hidden-link', source, hiddenIssue), link('hidden-status-link', hiddenStatus, source), link('child-link', child, source, 'PARENT'), link('hidden-child', hiddenIssue, source, 'PARENT')];
  function pick(row, args = {}) {
    if (!row) return null;
    const result = args.select ? {} : { ...row };
    for (const [key, value] of Object.entries(args.select || args.include || {})) {
      if (key === '_count') { result._count = { comments: 0, children: row.children.filter(x => matches(x, value.select.children?.where || {})).length }; }
      else if (value === true) result[key] = row[key];
      else if (Array.isArray(row[key])) result[key] = row[key].filter(x => matches(x, value.where || {})).map(x => pick(x, value));
      else result[key] = pick(row[key], value);
    }
    return result;
  }
  const prisma = {
    account: { findUnique: async () => state.mapping ? { user: { id: 'actor', email: 'actor@weezboo.com', accounts: [{ id: 'mapping' }] } } : null },
    workspace: { findFirst: async args => pick([workspace, joined, hidden].find(row => matches(row, args.where)), args) },
    issue: { findFirst: async args => pick(issues.find(row => matches(row, args.where)), args), findMany: async args => issues.filter(row => matches(row, args.where)).map(row => pick(row, args)) },
    issueRelation: {
      findMany: async args => state.links.filter(row => matches(row, args.where)).map(row => pick(row, args)),
      findFirst: async args => pick(state.links.find(row => matches(row, args.where)), args),
      create: async ({ data }) => { state.writes.push(clone(data)); return { id: 'created', ...data }; },
      upsert: async ({ create }) => { state.writes.push(clone(create)); return { id: 'upserted', ...create }; },
      delete: async ({ where }) => { const row = state.links.find(x => matches(x, where)); if (!row) throw new Error('not found'); state.writes.push(['delete', row.id]); state.links = state.links.filter(x => x !== row); return row; },
    },
    $transaction: async operations => Promise.all(operations),
  };
  const options = {}, env = { env: { COLLAB_AUTH_MODE: 'nextauth', COLLAB_GATEWAY_ISSUER: 'https://identity.example.test' } };
  const nextAuth = { getServerSession: async value => { assert.equal(value, options); state.legacy++; return { user: { id: state.subject, email: 'stale@weezboo.com' } }; } };
  const globals = { process: env, Buffer, TextDecoder, URL, console: { error() {} } };
  const adapter = load('src/lib/request-session.ts', { 'server-only': {}, './gateway-identity': load('src/lib/gateway-identity.ts', { 'node:crypto': require('node:crypto') }, globals), 'next-auth': nextAuth,
    'next/headers': { headers: () => new Headers({ 'x-collab-issuer': Buffer.from(env.env.COLLAB_GATEWAY_ISSUER).toString('base64url'), 'x-collab-subject': Buffer.from('relation-actor').toString('base64url'), 'x-collab-email': Buffer.from('actor@weezboo.com').toString('base64url'), 'x-collab-email-verified': 'true' }) }, '@/lib/prisma': { prisma },
  }, globals);
  const finder = load('src/lib/issue-finder.ts', { '@/lib/prisma': { prisma } }, globals);
  const deps = { '@/lib/prisma': { prisma }, '@/lib/request-session': adapter, 'next-auth': nextAuth, '@/lib/auth-options': { authOptions: options }, '@/lib/issue-finder': finder, 'next/server': { NextResponse: Response } };
  const handlers = { root: load(routeRoot + 'route.ts', deps, globals), bulk: load(routeRoot + 'bulk/route.ts', deps, globals), detail: load(routeRoot + '[relationId]/route.ts', deps, globals) };
  return { state, workspace, joined, issues, env, invoke: (route, method, body, params = {}) => handlers[route][method](new Request('https://example.test/', { method, ...(body ? { body: JSON.stringify(body) } : {}) }), { params: Promise.resolve({ workspaceId: 'workspace', issueKey: 'SOURCE-1', relationId: 'visible', ...params }) }) };
}
const targetBody = { targetIssueId: 'target', relationType: 'relates_to' };
const calls = [['root', 'GET'], ['root', 'POST', targetBody], ['bulk', 'POST', { relations: [targetBody] }], ['detail', 'DELETE']];

test('GET independently scopes both endpoints, nested child count and child progress', async () => {
  const f = fixture(); const r = await f.invoke('root', 'GET'); assert.equal(r.status, 200); const body = await r.json();
  assert.deepEqual(body.relates_to.map(x => x.id), ['target']); assert.equal(body.relates_to[0]._count.children, 1);
  assert.deepEqual(body.children.map(x => x.id), ['child']); assert.deepEqual(body.childrenProgress, { completed: 1, total: 1, percentage: 100 });
});
test('single relation resolves target key and CHILD direction to database IDs', async () => {
  for (const type of ['relates_to', 'child']) { const f = fixture(); assert.equal((await f.invoke('root', 'POST', { targetIssueId: 'TARGET-1', relationType: type })).status, 200); assert.deepEqual(f.state.writes, [{ sourceIssueId: type === 'child' ? 'target' : 'source', targetIssueId: type === 'child' ? 'source' : 'target', relationType: type === 'child' ? 'PARENT' : 'RELATES_TO', createdBy: 'actor' }]); }
});
test('bulk direct IDs reject hidden projects and statuses with zero mutations', async () => {
  for (const targetIssueId of ['hidden-issue', 'hidden-status']) { const f = fixture(); assert.equal((await f.invoke('bulk', 'POST', { relations: [{ ...targetBody, targetIssueId }] })).status, 404); assert.deepEqual(f.state.writes, []); }
});
test('DELETE cannot mutate a relation with unreadable opposite endpoint', async () => {
  for (const relationId of ['hidden-link', 'hidden-status-link']) { const f = fixture(); assert.equal((await f.invoke('detail', 'DELETE', undefined, { relationId })).status, 404); assert.deepEqual(f.state.writes, []); }
});
test('single and bulk reject malformed target/operator/type input without mutations', async () => {
  for (const body of [{ targetIssueId: {}, relationType: 'PARENT' }, { targetIssueId: 'target', relationType: [] }]) { const f = fixture(); assert.equal((await f.invoke('root', 'POST', body)).status, 400); assert.deepEqual(f.state.writes, []); }
  for (const relations of [[null], [{ targetIssueId: {}, relationType: 'PARENT' }], [{ targetIssueId: 'target', relationType: 'INVALID' }]]) { const f = fixture(); assert.equal((await f.invoke('bulk', 'POST', { relations })).status, 400); assert.deepEqual(f.state.writes, []); }
});
test('missing session subject is denied across all handlers', async () => {
  for (const [route, method, body] of calls) { const f = fixture(); f.state.subject = undefined; assert.equal((await f.invoke(route, method, body)).status, 401); assert.deepEqual(f.state.writes, []); }
});
test('revoked source membership denied and owner-only deletion remains permitted', async () => {
  for (const [route, method, body] of calls) { const f = fixture(); f.workspace.members[0].status = false; assert.equal((await f.invoke(route, method, body)).status, 404); assert.deepEqual(f.state.writes, []); }
  const f = fixture(); f.workspace.ownerId = 'actor'; f.workspace.members = []; assert.equal((await f.invoke('detail', 'DELETE')).status, 200);
});
test('bulk and single preserve readable cross-workspace links and child normalization', async () => {
  const f = fixture(); assert.equal((await f.invoke('root', 'POST', targetBody)).status, 200);
  assert.equal((await f.invoke('bulk', 'POST', { relations: [{ targetIssueId: 'TARGET-1', relationType: 'child' }, { targetIssueId: 'child', relationType: 'blocks' }] })).status, 200);
  assert.deepEqual(f.state.writes.slice(1), [{ sourceIssueId: 'target', targetIssueId: 'source', relationType: 'PARENT', createdBy: 'actor' }, { sourceIssueId: 'source', targetIssueId: 'child', relationType: 'BLOCKS', createdBy: 'actor' }]);
});
test('hidden root issue and unrelated relation ID stay denied without mutations', async () => {
  for (const [route, method, body] of calls) { const f = fixture(); assert.equal((await f.invoke(route, method, body, { issueKey: 'HIDDEN-ISSUE-1' })).status, 404); assert.deepEqual(f.state.writes, []); }
  const f = fixture(); assert.equal((await f.invoke('detail', 'DELETE', undefined, { relationId: 'missing' })).status, 404); assert.deepEqual(f.state.writes, []);
});
for (const [route, method, body] of calls) test(`${route} ${method} gateway mapping has no legacy fallback and revoked mapping makes no mutations`, async () => {
  const f = fixture(); f.env.env.COLLAB_AUTH_MODE = 'gateway'; assert.equal((await f.invoke(route, method, body)).status, 200); assert.equal(f.state.legacy, 0);
  f.state.mapping = false; f.state.writes = []; assert.equal((await f.invoke(route, method, body)).status, 401); assert.equal(f.state.legacy, 0); assert.deepEqual(f.state.writes, []);
});
