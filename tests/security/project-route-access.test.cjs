const { assert, test, load, matches } = require('./helpers.cjs');
const root = 'src/app/api/workspaces/[workspaceId]/projects/';
const clone = value => JSON.parse(JSON.stringify(value));

function fixture() {
  const state = { subject: 'actor', mapping: true, legacy: 0, writes: [] };
  const workspace = { id: 'workspace', slug: 'space', ownerId: 'other', members: [{ userId: 'actor', status: true, user: { email: 'old@example.test' } }] };
  const hidden = { id: 'hidden', ownerId: 'other', members: [] };
  const project = { id: 'project', workspaceId: workspace.id, workspace, slug: 'project', name: 'Project', description: '', issuePrefix: 'PRO', color: '#fff', isArchived: false, createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-02'), repository: { id: 'repo', fullName: 'org/repo', webhookSecret: 'fixture-webhook', accessToken: 'fixture-token' } };
  const status = (id, extra = {}) => ({ id, projectId: project.id, project, name: id, displayName: id, color: '#fff', order: 0, isDefault: false, isFinal: false, ...extra });
  state.statuses = [status('backlog', { isDefault: true }), status('done', { isFinal: true }), status('unused')];
  const issue = (id, extra = {}) => ({ id, workspace, workspaceId: workspace.id, project, projectId: project.id, statusId: 'done', projectStatus: state.statuses[1], startDate: new Date('2026-01-01'), dueDate: new Date('2026-01-02'), ...extra });
  state.issues = [issue('visible'), issue('hidden-project', { project: { workspace: hidden } }), issue('hidden-status', { projectStatus: { project: { workspace: hidden } }, startDate: new Date('1999-01-01'), dueDate: new Date('2099-01-01') })];
  function pick(row, args = {}) {
    if (!row) return null;
    const output = args.select ? {} : { ...row };
    delete output.workspace; delete output.project;
    for (const [key, value] of Object.entries(args.select || args.include || {})) {
      if (key === '_count') output._count = { issues: state.issues.filter(i => i.projectId === row.id && matches(i, value.select.issues?.where || {})).length };
      else if (key === 'issues') output.issues = state.issues.filter(i => i.projectId === row.id && matches(i, value.where || {})).map(i => pick(i, value));
      else if (key === 'statuses') output.statuses = state.statuses.filter(s => s.projectId === row.id).map(s => pick(s, value)).sort((a, b) => a.order - b.order);
      else if (value === true) output[key] = row[key];
      else output[key] = pick(row[key], value);
    }
    return output;
  }
  const prisma = {
    account: { findUnique: async () => state.mapping ? { user: { id: 'actor', email: 'actor@weezboo.com', accounts: [{ id: 'mapping' }] } } : null },
    workspace: { findFirst: async a => matches(workspace, a.where) ? pick(workspace, a) : null },
    user: { findUnique: async ({ where }) => ({ id: where.id || 'email-owner' }) },
    project: {
      findFirst: async a => matches(project, a.where) ? pick(project, a) : null,
      findUnique: async a => matches(project, a.where) ? pick(project, a) : null,
      findMany: async a => matches(project, a.where) ? [pick(project, a)] : [],
      update: async a => { if (!matches(project, a.where)) throw Error('missing'); state.writes.push(['project', clone(a.data)]); Object.assign(project, a.data); return pick(project, a); },
      create: async a => { state.writes.push(['createProject', clone(a.data)]); return pick({ ...project, ...a.data, id: 'new-project' }, a); },
    },
    projectStatus: {
      findMany: async a => state.statuses.filter(s => matches(s, a.where)).map(s => ({ ...pick(s), _count: { issues: state.issues.filter(i => i.statusId === s.id).length } })),
      update: async a => { const s = state.statuses.find(s => matches(s, a.where)); if (!s) throw Error('missing'); state.writes.push(['updateStatus', s.id]); Object.assign(s, a.data); return pick(s); },
      deleteMany: async ({ where }) => { const removed = state.statuses.filter(s => matches(s, where)); state.writes.push(['deleteStatuses', removed.map(s => s.id)]); state.statuses = state.statuses.filter(s => !removed.includes(s)); for (const i of state.issues) if (removed.some(s => s.id === i.statusId)) i.statusId = null; return { count: removed.length }; },
      create: async ({ data }) => { const s = { ...data, id: 'new-' + state.statuses.length }; state.writes.push(['createStatus', s.id]); state.statuses.push(s); return s; },
      createMany: async ({ data }) => { state.writes.push(['createStatuses', clone(data)]); return { count: data.length }; },
    },
    statusTemplate: { findMany: async () => [{ name: 'backlog', displayName: 'Backlog', isDefault: true, order: 0 }] },
    view: { findFirst: async () => null, create: async ({ data }) => { state.writes.push(['view', clone(data)]); return data; } },
    $transaction: async fn => fn(prisma),
  };
  const env = { env: { COLLAB_AUTH_MODE: 'nextauth', COLLAB_GATEWAY_ISSUER: 'https://identity.example.test' } }, config = {};
  const nextAuth = { getServerSession: async c => { assert.equal(c, config); state.legacy++; return { user: { id: state.subject, email: 'old@example.test' } }; } };
  const globals = { process: env, Buffer, TextDecoder, URL, console: { error() {} } };
  const adapter = load('src/lib/request-session.ts', { 'server-only': {}, './gateway-identity': load('src/lib/gateway-identity.ts', { 'node:crypto': require('node:crypto') }, globals), 'next-auth': nextAuth, '@/lib/prisma': { prisma }, 'next/headers': { headers: () => new Headers({ 'x-collab-issuer': Buffer.from(env.env.COLLAB_GATEWAY_ISSUER).toString('base64url'), 'x-collab-subject': Buffer.from('actor').toString('base64url'), 'x-collab-email': Buffer.from('actor@weezboo.com').toString('base64url'), 'x-collab-email-verified': 'true' }) } }, globals);
  const deps = { '@/lib/prisma': { prisma }, '@/lib/request-session': adapter, 'next-auth/next': nextAuth, '@/lib/auth': { authConfig: config }, '@/lib/slug-resolvers': { resolveWorkspaceSlug: async v => ['workspace', 'space'].includes(v) ? 'workspace' : null }, '@/constants/project-statuses': load('src/constants/project-statuses.ts'), '@/lib/utils': { generateUniqueViewSlug: async () => 'default-view' }, 'next/server': { NextResponse: Response } };
  const handlers = Object.fromEntries([['list', 'route.ts'], ['detail', '[projectSlug]/route.ts'], ['gantt', 'gantt/route.ts']].map(([key, path]) => [key, load(root + path, deps, globals)]));
  return { state, workspace, project, env, statuses: () => state.statuses.map(s => ({ id: s.id, name: s.displayName, color: s.color, isDefault: s.isDefault })), invoke: (route, method, body, params = {}) => handlers[route][method](new Request('https://example.test', { method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }), { params: Promise.resolve({ workspaceId: 'space', projectSlug: 'project', ...params }) }) };
}
const calls = [['list', 'GET'], ['list', 'POST', { name: 'New project' }], ['detail', 'GET'], ['detail', 'PATCH', { name: 'Changed' }], ['gantt', 'GET']];
test('all five handlers require stable subject with zero writes', async () => { for (const [r, m, b] of calls) { const f = fixture(); f.state.subject = undefined; assert.equal((await f.invoke(r, m, b)).status, 401); assert.deepEqual(f.state.writes, []); } });
test('revoked member is denied across all five handlers', async () => { for (const [r, m, b] of calls) { const f = fixture(); f.workspace.members[0].status = false; assert.equal((await f.invoke(r, m, b)).status, 404); assert.deepEqual(f.state.writes, []); } });
test('owner without membership is allowed across all five handlers', async () => { for (const [r, m, b] of calls) { const f = fixture(); f.workspace.ownerId = 'actor'; f.workspace.members = []; assert.equal((await f.invoke(r, m, b)).status, m === 'POST' ? 201 : 200); } });
test('list, detail and update count only independently readable issues', async () => { for (const [r, m, b] of [calls[0], calls[2], calls[3]]) { const f = fixture(); const response = await f.invoke(r, m, b); assert.equal(response.status, 200); const data = await response.json(); assert.equal((data.project || data.projects[0]).issueCount, 1); } });
test('Gantt dates, denominator, progress and health exclude unreadable issues', async () => { const f = fixture(); const response = await f.invoke('gantt', 'GET'); assert.equal(response.status, 200); const p = (await response.json()).projects[0]; assert.equal(p.issueCount, 1); assert.equal(p.completedIssues, 1); assert.equal(p.progress, 100); assert.equal(p.health, 'completed'); assert.equal(p.startDate, '2026-01-01T00:00:00.000Z'); assert.equal(p.dueDate, '2026-01-02T00:00:00.000Z'); });
test('detail returns repository metadata without credential fields', async () => { const f = fixture(); const response = await f.invoke('detail', 'GET'); assert.equal(response.status, 200); const repo = (await response.json()).project.repository; assert.equal(repo.fullName, 'org/repo'); assert.equal('webhookSecret' in repo, false); assert.equal('accessToken' in repo, false); });
test('status edits retain IDs, issue links and internal/default/final flags', async () => { const f = fixture(); const statuses = f.statuses().reverse().map(s => ({ ...s, name: 'Renamed ' + s.id, color: '#123', isDefault: false })); assert.equal((await f.invoke('detail', 'PATCH', { statuses })).status, 200); assert.deepEqual(f.state.issues.map(i => i.statusId), ['done', 'done', 'done']); assert.equal(f.state.statuses.find(s => s.id === 'backlog').isDefault, true); assert.equal(f.state.statuses.find(s => s.id === 'done').isFinal, true); assert.equal(f.state.statuses.find(s => s.id === 'done').name, 'done'); assert.equal(f.state.statuses.find(s => s.id === 'done').displayName, 'Renamed done'); });
test('omitting used or default statuses conflicts before any writes', async () => { for (const id of ['done', 'backlog']) { const f = fixture(); const before = f.state.issues.map(i => i.statusId); assert.equal((await f.invoke('detail', 'PATCH', { name: 'Changed', statuses: f.statuses().filter(s => s.id !== id) })).status, 409); assert.deepEqual(f.state.writes, []); assert.deepEqual(f.state.issues.map(i => i.statusId), before); assert.equal(f.project.name, 'Project'); } });
test('unused status removal and new temporary status preserve used rows', async () => { const f = fixture(); const statuses = f.statuses().filter(s => s.id !== 'unused'); statuses.push({ id: 'status-123', name: 'Review', color: '#abc' }); assert.equal((await f.invoke('detail', 'PATCH', { statuses })).status, 200); assert.equal(f.state.statuses.some(s => s.id === 'unused'), false); assert.equal(f.state.statuses.some(s => s.name === 'review'), true); assert.equal(f.state.issues[0].statusId, 'done'); });
test('malformed scalar and status inputs reject without mutation', async () => { for (const [r, m, body] of [['list', 'POST', { name: {} }], ['list', 'POST', { name: 'Okay', issuePrefix: {} }], ['detail', 'PATCH', { keyPrefix: {} }], ['detail', 'PATCH', { statuses: {} }], ['detail', 'PATCH', { statuses: [null] }], ['detail', 'PATCH', { statuses: [{ id: {}, name: 'Review', color: '#fff' }] }]]) { const f = fixture(); assert.equal((await f.invoke(r, m, body)).status, 400); assert.deepEqual(f.state.writes, []); } });
test('new project view belongs to ID subject despite stale session email', async () => { const f = fixture(); assert.equal((await f.invoke('list', 'POST', { name: 'New project' })).status, 201); assert.equal(f.state.writes.find(w => w[0] === 'view')[1].ownerId, 'actor'); });
test('unchanged ordinary settings and invalid workspace retain response contract', async () => { const f = fixture(); assert.equal((await f.invoke('detail', 'PATCH', { name: 'Project' })).status, 200); assert.equal((await f.invoke('detail', 'GET', undefined, { workspaceId: 'missing' })).status, 404); });
test('empty-project UI defaults can be created from non-temporary IDs', async () => { const f = fixture(); f.state.statuses = []; f.state.issues = []; assert.equal((await f.invoke('detail', 'PATCH', { statuses: [{ id: 'backlog', name: 'Backlog', color: '#fff', isDefault: true }, { id: 'done', name: 'Done', color: '#fff', isDefault: true }] })).status, 200); assert.equal(f.state.statuses.find(s => s.name === 'done').isFinal, true); });
test('foreign status ID is only a new-row hint and never updates another project', async () => { const f = fixture(); const foreign = { id: 'foreign-status', projectId: 'foreign', name: 'foreign', displayName: 'Foreign', color: '#fff' }; f.state.statuses.push(foreign); const statuses = f.statuses().filter(s => s.id !== foreign.id); statuses.push({ id: foreign.id, name: 'Review', color: '#aaa' }); assert.equal((await f.invoke('detail', 'PATCH', { statuses })).status, 200); assert.equal(foreign.displayName, 'Foreign'); assert.equal(f.state.statuses.find(s => s.name === 'review').projectId, 'project'); assert.equal(f.state.issues[0].statusId, 'done'); });
test('duplicate IDs and colliding internal names reject before writes', async () => { for (const collision of ['id', 'name']) { const f = fixture(); const statuses = f.statuses(); statuses.push(collision === 'id' ? { ...statuses[0] } : { id: 'new', name: 'Done', color: '#fff' }); assert.equal((await f.invoke('detail', 'PATCH', { statuses })).status, collision === 'id' ? 400 : 409); assert.deepEqual(f.state.writes, []); } });
test('Gantt no-visible-issue fallback retains thirty-day no-data behavior', async () => { const f = fixture(); f.state.issues = f.state.issues.slice(1); const r = await f.invoke('gantt', 'GET'); assert.equal(r.status, 200); const p = (await r.json()).projects[0]; assert.equal(p.issueCount, 0); assert.equal(p.health, 'no_data'); assert.equal(p.progress, 0); assert.equal(p.dueDate, '2026-01-31T00:00:00.000Z'); });
for (const [r, m, b] of calls) test(`${r} ${m} gateway mapping and revocation without legacy fallback`, async () => { const f = fixture(); f.env.env.COLLAB_AUTH_MODE = 'gateway'; assert.equal((await f.invoke(r, m, b)).status, m === 'POST' ? 201 : 200); assert.equal(f.state.legacy, 0); f.state.mapping = false; f.state.writes = []; assert.equal((await f.invoke(r, m, b)).status, 401); assert.equal(f.state.legacy, 0); assert.deepEqual(f.state.writes, []); });
