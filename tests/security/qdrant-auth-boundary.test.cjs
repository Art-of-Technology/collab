const { assert, test, load } = require('./helpers.cjs');
function fixture(mode = 'nextauth') {
  const state = { subject: 'actor', owner: false, role: 'ADMIN', active: true, db: 0, provider: 0, legacy: 0, headers: 0 };
  const env = { env: { ...(mode !== undefined ? { COLLAB_AUTH_MODE: mode } : {}), NEXTAUTH_SECRET: 'fixture-internal-key' } };
  const prisma = {
    workspaceMember: { findFirst: async () => { state.db++; return state.active && state.role ? { role: state.role } : null; } },
    workspace: { findFirst: async () => { state.db++; return { ownerId: state.owner ? 'actor' : 'other' }; } },
    account: { findUnique: async () => { state.db++; throw Error('unexpected account lookup'); } },
  };
  for (const model of ['issue', 'issueActivity', 'note']) prisma[model] = { findMany: async () => { state.db++; return []; }, count: async () => { state.db++; return 0; } };
  const config = {}, nextAuth = { getServerSession: async c => { assert.equal(c, config); state.legacy++; return state.subject ? { user: { id: state.subject, email: 'actor@weezboo.com' } } : null; } };
  const globals = { process: env, Buffer, TextDecoder, URL, console: { log() {}, error() {} } };
  const identity = load('src/lib/gateway-identity.ts', { 'node:crypto': require('node:crypto') }, globals);
  const adapter = load('src/lib/request-session.ts', { 'server-only': {}, 'next-auth': nextAuth, './gateway-identity': identity, '@/lib/prisma': { prisma }, 'next/headers': { headers: () => { state.headers++; throw Error('unexpected header lookup'); } } }, globals);
  const provider = { getCollectionInfo: async () => { state.provider++; return { exists: true, status: 'green', points_count: 12 }; } };
  for (const name of ['batchSyncIssuesToQdrant', 'batchSyncActivitiesToQdrant', 'batchSyncContextsToQdrant']) provider[name] = async () => { state.provider++; throw Error('unexpected batch'); };
  const route = load('src/app/api/workspaces/[workspaceId]/qdrant/migrate/route.ts', { 'next/server': { NextResponse: Response }, 'next-auth': nextAuth, '@/lib/auth-options': { authOptions: config }, '@/lib/prisma': { prisma }, '@/lib/qdrant-sync': provider, '@/lib/request-session': adapter, '@/lib/gateway-identity': identity }, globals);
  return { state, env, invoke: (method, internal = false) => route[method](new Request('https://example.test', { method, headers: internal ? { 'x-internal-key': env.env.NEXTAUTH_SECRET } : {} }), { params: Promise.resolve({ workspaceId: 'workspace' }) }) };
}
for (const method of ['GET', 'POST']) {
  for (const mode of ['gateway', 'invalid']) test(`${method} ${mode} denies before session, database or provider even with internal key`, async () => { for (const internal of [false, true]) { const f = fixture(mode); const response = await f.invoke(method, internal); assert.equal(response.status, 403); assert.deepEqual(await response.json(), { error: 'Bulk migration is unavailable in this auth mode' }); assert.equal(f.state.db, 0); assert.equal(f.state.provider, 0); assert.equal(f.state.legacy, 0); assert.equal(f.state.headers, 0); } });
  test(`${method} preserves explicit and default legacy internal authentication`, async () => { for (const mode of ['nextauth', undefined]) { const f = fixture(mode); if (mode === undefined) delete f.env.env.COLLAB_AUTH_MODE; f.state.subject = null; const response = await f.invoke(method, true); assert.equal(response.status, 200); assert.equal(f.state.legacy, 0); assert.equal(f.state.provider, method === 'GET' ? 1 : 2); const body = await response.json(); if (method === 'GET') assert.deepEqual(body.postgresql, { issues: 0, activities: 0, contexts: 0, total: 0 }); else assert.deepEqual(body.totals, { synced: 0, errors: 0, total: 0 }); } });
  test(`${method} preserves legacy owner and active-admin access`, async () => { for (const owner of [false, true]) { const f = fixture(); f.state.owner = owner; if (owner) { f.state.role = null; f.state.active = false; } assert.equal((await f.invoke(method)).status, 200); assert.equal(f.state.legacy, 1); } });
  test(`${method} preserves missing-subject and inactive-member denial`, async () => { for (const missing of [false, true]) { const f = fixture(); if (missing) f.state.subject = null; else f.state.active = false; assert.equal((await f.invoke(method)).status, missing ? 401 : 403); assert.equal(f.state.provider, 0); } });
}
test('ordinary active legacy member can read status but cannot migrate', async () => { const f = fixture(); f.state.role = 'MEMBER'; assert.equal((await f.invoke('GET')).status, 200); f.state.provider = 0; assert.equal((await f.invoke('POST')).status, 403); assert.equal(f.state.provider, 0); });
