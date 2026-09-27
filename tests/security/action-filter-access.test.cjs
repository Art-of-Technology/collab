const { assert, test, load, matches } = require('./helpers.cjs');
const clone = value => JSON.parse(JSON.stringify(value));

function fixture() {
  const state = { legacy: 0, mapping: true, email: 'actor@weezboo.com', queries: [] };
  const workspace = { id: 'workspace', ownerId: 'other', members: [{ userId: 'actor', status: true, user: { email: 'actor@weezboo.com' } }] };
  const foreign = { id: 'foreign', ownerId: 'other', members: [] };
  const project = { id: 'project', workspaceId: workspace.id, workspace };
  const hiddenProject = { id: 'hidden', workspaceId: foreign.id, workspace: foreign };
  const issues = [
    { id: 'second', workspaceId: workspace.id, workspace, project, statusId: null },
    { id: 'first', workspaceId: workspace.id, workspace, project, statusId: 'status', projectStatus: { project } },
    { id: 'hidden-project', workspaceId: workspace.id, workspace, project: hiddenProject, statusId: null },
    { id: 'hidden-status', workspaceId: workspace.id, workspace, project, statusId: 'hidden', projectStatus: { project: hiddenProject } },
    { id: 'foreign', workspaceId: foreign.id, workspace: foreign, project, statusId: null },
  ];
  const activities = [...issues.map(issue => ({ itemId: issue.id, itemType: 'ISSUE', workspaceId: workspace.id, action: 'TITLE_UPDATED', newValue: '"title"' })),
    { itemId: 'deleted', itemType: 'ISSUE', workspaceId: workspace.id, action: 'TITLE_UPDATED', newValue: '"title"' },
    { itemId: 'first', itemType: 'ISSUE', workspaceId: workspace.id, action: 'STATUS_CHANGED', newValue: '"Open"' },
    { itemId: 'first', itemType: 'ISSUE', workspaceId: workspace.id, action: 'PRIORITY_CHANGED', newValue: '"HIGH"' },
    { itemId: 'second', itemType: 'ISSUE', workspaceId: workspace.id, action: 'STATUS_CHANGED', newValue: '"missing-id"' }];
  const actor = { id: 'actor', email: 'actor@weezboo.com', role: 'DEVELOPER' };
  const query = (table, rows, args) => { state.queries.push([table, clone(args)]); return rows.filter(row => matches(row, args.where)); };
  const prisma = {
    account: { findUnique: async () => state.mapping ? { user: { ...actor, accounts: [{ id: 'mapping' }] } } : null },
    workspace: { findFirst: async args => query('workspace', [workspace, foreign], args)[0] || null },
    issue: { findMany: async args => query('issue', issues, args).reverse() },
    issueActivity: { findMany: async args => query('activity', activities, args) },
    projectStatus: { findMany: async args => query('status', [{ id: 'status', name: 'OPEN', displayName: 'Open', project }, { id: 'hidden', name: 'HIDDEN', displayName: 'Hidden', project: hiddenProject }], args) },
  };
  const options = {}, env = { env: { COLLAB_AUTH_MODE: 'nextauth', COLLAB_GATEWAY_ISSUER: 'https://identity.example.test' } };
  const nextAuth = { getServerSession: async value => { assert.equal(value, options); state.legacy++; return { user: { id: 'actor', email: state.email } }; } };
  const globals = { process: env, Buffer, TextDecoder, URL, console: { error() {} } };
  const adapter = load('src/lib/request-session.ts', { 'server-only': {}, './gateway-identity': load('src/lib/gateway-identity.ts', { 'node:crypto': require('node:crypto') }, globals), 'next-auth': nextAuth,
    'next/headers': { headers: () => new Headers({ 'x-collab-issuer': Buffer.from(env.env.COLLAB_GATEWAY_ISSUER).toString('base64url'), 'x-collab-subject': Buffer.from('filter-actor').toString('base64url'), 'x-collab-email': Buffer.from(actor.email).toString('base64url'), 'x-collab-email-verified': 'true' }) }, '@/lib/prisma': { prisma },
  }, globals);
  const finder = load('src/lib/issue-finder.ts', { '@/lib/prisma': { prisma }, '@/lib/shared-issue-key-utils': load('src/lib/shared-issue-key-utils.ts') }, globals);
  const handler = load('src/app/api/workspaces/[workspaceId]/action-filter-issues/route.ts', { '@/lib/prisma': { prisma }, '@/lib/request-session': adapter, 'next-auth/next': nextAuth, '@/lib/auth': { authConfig: options }, '@/lib/issue-finder': finder, 'next/server': { NextResponse: Response } }, globals).POST;
  return { state, workspace, env, invoke: (actionFilters, workspaceId = 'workspace') => handler(new Request('https://example.test/', { method: 'POST', body: JSON.stringify({ actionFilters }) }), { params: Promise.resolve({ workspaceId }) }) };
}
const title = [{ actionType: 'TITLE_UPDATED' }];
test('stable ID allows current membership despite stale session email', async () => {
  const f = fixture(); f.state.email = 'stale@weezboo.com'; const r = await f.invoke([]); assert.equal(r.status, 200); assert.deepEqual(await r.json(), { issueIds: [] });
});
test('revoked member denied before activity reads; owner without member row allowed', async () => {
  const f = fixture(); f.workspace.members[0].status = false; assert.equal((await f.invoke(title)).status, 404); assert.equal(f.state.queries.filter(x => x[0] !== 'workspace').length, 0);
  f.workspace.ownerId = 'actor'; f.workspace.members = []; assert.equal((await f.invoke(title)).status, 200);
});
test('payload includes only currently readable existing issue IDs in original activity order', async () => {
  const f = fixture(); const r = await f.invoke(title); assert.equal(r.status, 200); assert.deepEqual(await r.json(), { issueIds: ['second', 'first'] });
});
test('AND intersection, status names/display names and ID fallback are preserved', async () => {
  const f = fixture(); const r = await f.invoke([{ actionType: 'STATUS_CHANGED', subConditions: { type: 'to', values: ['status'] } }, { actionType: 'PRIORITY_CHANGED', subConditions: { type: 'to', values: ['HIGH'] } }]);
  assert.equal(r.status, 200); assert.deepEqual(await r.json(), { issueIds: ['first'] });
  const fallback = await f.invoke([{ actionType: 'STATUS_CHANGED', subConditions: { type: 'to', values: ['missing-id'] } }]); assert.deepEqual(await fallback.json(), { issueIds: ['second'] });
});
test('empty filters and unsupported from condition return empty result without payload query', async () => {
  const f = fixture(); assert.deepEqual(await (await f.invoke([])).json(), { issueIds: [] }); assert.deepEqual(await (await f.invoke([{ actionType: 'STATUS_CHANGED', subConditions: { type: 'from', values: ['status'] } }])).json(), { issueIds: [] }); assert.equal(f.state.queries.filter(x => x[0] !== 'workspace').length, 0);
});
test('malformed filters and operator objects rejected before database reads', async () => {
  for (const filters of [null, {}, [null], [{ actionType: {} }], [{ actionType: 'TITLE_UPDATED', subConditions: {} }], [{ actionType: 'ASSIGNED', subConditions: { type: 'to', values: [{}] } }], [{ actionType: 'ASSIGNED', subConditions: { type: 'unknown', values: [] } }]]) {
    const f = fixture(); assert.equal((await f.invoke(filters)).status, 400); assert.deepEqual(f.state.queries, []);
  }
});
test('gateway mapping uses no legacy fallback and revoked mapping performs no queries', async () => {
  const f = fixture(); f.env.env.COLLAB_AUTH_MODE = 'gateway'; assert.equal((await f.invoke([])).status, 200); assert.equal(f.state.legacy, 0);
  f.state.mapping = false; f.state.queries = []; assert.equal((await f.invoke(title)).status, 401); assert.equal(f.state.legacy, 0); assert.deepEqual(f.state.queries, []);
});
test('foreign workspace denied and unknown action returns no matching IDs', async () => {
  const f = fixture(); assert.equal((await f.invoke(title, 'foreign')).status, 404); assert.deepEqual(await (await f.invoke([{ actionType: 'UNKNOWN' }])).json(), { issueIds: [] });
});
