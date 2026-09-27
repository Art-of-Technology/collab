const { assert, test, load, matches } = require('./helpers.cjs');
const base = 'src/app/api/workspaces/[workspaceId]/projects/[projectSlug]/statuses/[statusId]/';
function fixture() {
  const state = { subject: 'actor', mapping: true, legacy: 0, writes: [] };
  const workspace = { id: 'workspace', ownerId: 'other', members: [{ userId: 'actor', status: true, user: { email: 'old@weezboo.com' } }] };
  const hidden = { id: 'hidden', ownerId: 'other', members: [] };
  const project = { id: 'project', slug: 'project', workspaceId: workspace.id, workspace };
  const source = { id: 'source', projectId: project.id, project, isDefault: false };
  const target = { id: 'target', projectId: project.id, project, isDefault: false };
  state.statuses = [source, target];
  const issue = (id, statusId = source.id) => ({ id, workspaceId: workspace.id, workspace, projectId: project.id, project, statusId, projectStatus: statusId === source.id ? source : target });
  state.issues = [issue('first'), issue('already-target', target.id)];
  const match = (row, where) => { const { issues, ...rest } = where; return matches(row, rest) && (!issues?.none || !state.issues.some(i => i.statusId === row.id && matches(i, issues.none))); };
  const prisma = {
    account: { findUnique: async () => state.mapping ? { user: { id: 'actor', email: 'actor@weezboo.com', accounts: [{ id: 'mapping' }] } } : null },
    workspace: { findFirst: async ({ where }) => matches(workspace, where) ? workspace : null },
    project: { findFirst: async ({ where }) => matches(project, where) ? project : null },
    projectStatus: {
      findFirst: async ({ where }) => state.statuses.find(s => match(s, where)) || null,
      delete: async ({ where }) => { const s = state.statuses.find(s => match(s, where)); if (!s) throw Error('not found'); state.writes.push(['delete', s.id]); state.statuses = state.statuses.filter(x => x !== s); for (const i of state.issues) if (i.statusId === s.id) i.statusId = null; return { id: s.id, projectId: s.projectId, isDefault: s.isDefault }; },
    },
    issue: {
      count: async ({ where }) => state.issues.filter(i => matches(i, where)).length,
      updateMany: async ({ where, data }) => { const rows = state.issues.filter(i => matches(i, where)); state.writes.push(['move', rows.map(i => i.id)]); for (const i of rows) Object.assign(i, data); return { count: rows.length }; },
    },
    $transaction: async fn => { if (state.beforeTx) state.beforeTx(); return fn(prisma); },
  };
  const env = { env: { COLLAB_AUTH_MODE: 'nextauth', COLLAB_GATEWAY_ISSUER: 'https://identity.example.test' } }, config = {};
  const legacy = { getServerSession: async c => { assert.equal(c, config); state.legacy++; return { user: { id: state.subject, email: 'old@weezboo.com' } }; } };
  const globals = { process: env, Buffer, TextDecoder, URL, console: { error() {}, log() {} } };
  const adapter = load('src/lib/request-session.ts', { 'server-only': {}, 'next-auth': legacy, '@/lib/prisma': { prisma }, './gateway-identity': load('src/lib/gateway-identity.ts', { 'node:crypto': require('node:crypto') }, globals), 'next/headers': { headers: () => new Headers({ 'x-collab-issuer': Buffer.from(env.env.COLLAB_GATEWAY_ISSUER).toString('base64url'), 'x-collab-subject': Buffer.from('actor').toString('base64url'), 'x-collab-email': Buffer.from('actor@weezboo.com').toString('base64url'), 'x-collab-email-verified': 'true' }) } }, globals);
  const deps = { '@/lib/prisma': { prisma }, '@/lib/request-session': adapter, 'next-auth/next': legacy, '@/lib/auth': { authConfig: config }, '@/lib/slug-resolvers': { resolveWorkspaceSlug: async v => ['space', 'workspace'].includes(v) ? 'workspace' : null }, 'next/server': { NextResponse: Response } };
  const get = load(base + 'issues-count/route.ts', deps, globals).GET, del = load(base + 'route.ts', deps, globals).DELETE;
  return { state, workspace, hidden, project, source, target, issue, env, invoke: (method, body = {}, params = {}) => (method === 'GET' ? get : del)(new Request('https://example.test', { method, ...(method !== 'GET' ? { body: JSON.stringify(body) } : {}) }), { params: Promise.resolve({ workspaceId: 'space', projectSlug: 'project', statusId: 'source', ...params }) }) };
}
for (const method of ['GET', 'DELETE']) {
  test(`${method} requires subject and denies inactive members`, async () => { for (const missing of [true, false]) { const f = fixture(); if (missing) f.state.subject = undefined; else f.workspace.members[0].status = false; assert.equal((await f.invoke(method, { targetStatusId: 'target' })).status, missing ? 401 : 404); assert.deepEqual(f.state.writes, []); } });
  test(`${method} permits owner without membership`, async () => { const f = fixture(); f.workspace.ownerId = 'actor'; f.workspace.members = []; assert.equal((await f.invoke(method, { targetStatusId: 'target' })).status, 200); });
  test(`${method} gateway mapping revoked without legacy fallback`, async () => { const f = fixture(); f.env.env.COLLAB_AUTH_MODE = 'gateway'; assert.equal((await f.invoke(method, { targetStatusId: 'target' })).status, 200); assert.equal(f.state.legacy, 0); f.state.mapping = false; f.state.writes = []; assert.equal((await f.invoke(method, { targetStatusId: 'target' })).status, 401); assert.equal(f.state.legacy, 0); assert.deepEqual(f.state.writes, []); });
}
test('count omits an issue with an unreadable workspace', async () => { const f = fixture(); f.state.issues.push({ ...f.issue('hidden'), workspace: f.hidden }); const r = await f.invoke('GET'); assert.equal(r.status, 200); assert.deepEqual(await r.json(), { count: 1 }); });
test('used status without target cannot clear existing issue links', async () => { const f = fixture(); const r = await f.invoke('DELETE'); assert.equal(r.status, 409); assert.deepEqual(f.state.writes, []); assert.equal(f.state.issues[0].statusId, 'source'); });
test('hidden or cross-project attached issue blocks all deletion writes', async () => { for (const foreign of [false, true]) { const f = fixture(); f.state.issues.push({ ...f.issue('hidden-link'), ...(foreign ? { projectId: 'another', project: { id: 'another', workspace: f.hidden } } : { workspace: f.hidden }) }); const r = await f.invoke('DELETE', { targetStatusId: 'target' }); assert.equal(r.status, 409); assert.deepEqual(f.state.writes, []); assert.equal(f.state.issues[0].statusId, 'source'); assert.equal(f.state.issues[2].statusId, 'source'); } });
test('valid migration returns actual moved count excluding existing target issues', async () => { const f = fixture(); const r = await f.invoke('DELETE', { targetStatusId: 'target' }); assert.equal(r.status, 200); const b = await r.json(); assert.equal(b.movedIssuesCount, 1); assert.equal(b.deletedStatus.id, 'source'); assert.equal(f.state.issues.every(i => i.statusId === 'target'), true); });
test('unused status can be deleted without target', async () => { const f = fixture(); f.state.issues = f.state.issues.slice(1); const r = await f.invoke('DELETE'); assert.equal(r.status, 200); assert.equal((await r.json()).movedIssuesCount, 0); });
test('default status and foreign or identical targets are denied without writes', async () => { for (const choice of ['default', 'missing', 'same', 'foreign']) { const f = fixture(); if (choice === 'default') f.source.isDefault = true; if (choice === 'foreign') f.target.projectId = 'foreign'; const r = await f.invoke('DELETE', { targetStatusId: choice === 'missing' ? 'missing' : choice === 'same' ? 'source' : 'target' }); assert.equal(r.status, 400); assert.deepEqual(f.state.writes, []); } });
test('operator, array, null and blank target input fails before any write', async () => { for (const body of [null, [], { targetStatusId: {} }, { targetStatusId: [] }, { targetStatusId: '' }, { targetStatusId: null }]) { const f = fixture(); const r = await f.invoke('DELETE', body); assert.equal(r.status, 400); assert.deepEqual(f.state.writes, []); } });
test('transaction-entry membership revocation, moved source and default change have zero writes', async () => { for (const change of ['member', 'project', 'default']) { const f = fixture(); f.state.beforeTx = () => { if (change === 'member') f.workspace.members[0].status = false; else if (change === 'project') f.source.projectId = 'foreign'; else f.source.isDefault = true; }; assert.equal((await f.invoke('DELETE', { targetStatusId: 'target' })).status, 409); assert.deepEqual(f.state.writes, []); } });
