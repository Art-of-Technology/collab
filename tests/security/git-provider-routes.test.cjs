const { assert, test, load, matches } = require('./helpers.cjs');
const z = require('zod');
function fixture(options = {}) {
  const calls = [], writes = [];
  const saved = { id: 'connection', projectId: 'project', provider: 'forgejo', baseUrl: 'https://forge.test', externalId: 'repo-1', repositoryPath: 'team/repo', connectedById: options.foreignOwner ? 'other' : 'alice', credentials: 'encrypted', isActive: !options.disconnected, updatedAt: new Date(0) };
  const stored = { ...saved };
  const mutate = args => {
    if (options.replacement) Object.assign(stored, options.replacement);
    if (!matches(stored, args.where)) return false;
    Object.assign(stored, args.data);
    return true;
  };
  const activity = [{ id: 'sha', kind: 'commit', title: 'Work', url: 'https://forge.test/team/repo/commit/sha', date: '2026-10-21T10:00:00Z' }];
  const ownerId = options.workspaceOwner ? 'alice' : 'owner', actor = options.actor || 'alice', members = options.members || [];
  const workspace = { id: 'workspace', ownerId, members: members.map(m => ({ workspaceId: 'workspace', status: true, ...m })) };
  const project = { id: 'project', workspaceId: 'workspace', workspace: { ownerId } };
  const connectionStore = {
    findMany: async args => { calls.push(['read', args]); return [{ ...saved, credentials: undefined, activity }]; },
    findFirst: async ({ where }) => where.projectId === 'project' && where.id === 'connection' ? saved : null,
    findUnique: async () => options.existing ? saved : null,
    update: async args => { writes.push(['update', args]); if (!mutate(args)) throw Error('Record changed'); return stored; },
    updateMany: async args => { writes.push(['updateMany', args]); return { count: options.concurrentChange ? 0 : Number(mutate(args)) }; },
    create: async args => { writes.push(['create', args]); return saved; },
  };
  const prisma = {
    project: { findFirst: async ({ where }) => { calls.push(['project', where]); return options.denied || where.id !== 'project' || (options.realAccess && !matches(workspace, where.workspace)) ? null : project; } },
    // The authority module's two reads; the workspace read counts how often the route asks it.
    workspace: { findUnique: async ({ where }) => { calls.push(['authority']); return where.id === 'workspace' ? { ownerId } : null; } },
    user: { findUnique: async ({ where, select }) => ({ role: where.id === options.platformAdmin ? 'SYSTEM_ADMIN' : 'USER', workspaceMemberships: workspace.members.filter(m => m.userId === where.id && matches(m, select.workspaceMemberships.where)).map(m => ({ role: m.role })) }) },
    gitConnection: connectionStore,
    gitConnectionActivity: { upsert: async args => { writes.push(['activity', args]); } },
    $transaction: async callback => callback(prisma),
  };
  class ProviderError extends Error {}
  const deps = {
    'next/server': { NextResponse: { json: (body, options) => ({ body, ...options }) } },
    zod: z, '@/lib/prisma': { prisma }, '@/lib/session': { getCurrentUser: async () => options.absent ? null : { id: actor } },
    '@/lib/post-access': options.realAccess ? load('src/lib/post-access.ts') : { postWorkspaceAccessWhere: id => ({ ownerId: id }) },
    '@/lib/encryption': { EncryptionService: { encrypt: value => { calls.push(['encrypt']); assert.equal(value.token, 'secret'); return 'ciphertext'; }, decrypt: () => ({ token: 'secret' }) } },
    '@/lib/git-providers/client': {
      providerSchema: z.enum(['github', 'forgejo', 'gitlab', 'bitbucket', 'bitbucket-dc']), ProviderError,
      instances: () => [], resolveInstance: (provider, baseUrl) => ({ provider, baseUrl }),
      listRepositories: async () => { calls.push(['remoteList']); return { repositories: [] }; },
      getRepository: async () => { calls.push(['remoteRepo']); if (options.revoked) throw new ProviderError('Access denied'); return { id: options.changedIdentity ? 'different' : 'repo-1', path: 'team/repo', name: 'repo', url: 'https://forge.test/team/repo' }; },
      getActivity: async () => { calls.push(['remoteActivity']); return activity; },
    },
  };
  const route = load('src/app/api/projects/[projectId]/git-connections/route.ts', deps, { URL, Date, process: { env: {} } });
  const request = body => ({ url: 'https://collab.test/api/projects/project/git-connections', headers: new Headers({ origin: options.foreignOrigin ? 'https://evil.test' : 'https://collab.test' }), json: async () => body });
  const context = { params: Promise.resolve({ projectId: options.otherProject ? 'foreign' : 'project' }) };
  return { calls, writes, saved, stored, post: body => route.POST(request(body), context), get: () => route.GET(request({}), context) };
}
const connect = { action: 'connect', provider: 'forgejo', baseUrl: 'https://forge.test', repositoryPath: 'team/repo', credentials: { token: 'secret' } };
test('anonymous, foreign project and foreign origin cannot use provider credentials', async () => {
  for (const options of [{ absent: true }, { denied: true }, { otherProject: true }, { foreignOrigin: true }]) {
    const f = fixture(options); const response = await f.post(connect);
    assert.ok([401, 403, 404].includes(response.status)); assert.equal(f.writes.length, 0); assert.equal(f.calls.some(([name]) => name.startsWith('remote')), false);
  }
});
test('GET selects public fields only and scopes reads to the authorized project', async () => {
  const f = fixture(); const r = await f.get(); assert.equal(r.status, 200); assert.equal(r.headers['Cache-Control'], 'no-store');
  const query = f.calls.find(([kind]) => kind === 'read')[1]; assert.deepEqual(JSON.parse(JSON.stringify(query.where)), { projectId: 'project' });
  assert.equal(query.select.credentials, undefined); assert.equal(query.select.activity.take, 40);
});
test('connect validates provider repository and activity before encrypting and persisting', async () => {
  const f = fixture(); const r = await f.post(connect); assert.equal(r.status, 200);
  assert.deepEqual(f.calls.filter(([name]) => name.startsWith('remote') || name === 'encrypt').map(([name]) => name), ['remoteRepo', 'remoteActivity', 'encrypt']);
  const data = f.writes.find(([kind]) => kind === 'create')[1].data;
  assert.equal(data.credentials, 'ciphertext'); assert.equal(data.externalId, 'repo-1'); assert.equal(data.projectId, 'project');
  assert.equal(JSON.stringify(r).includes('secret'), false); assert.equal(f.writes.filter(([kind]) => kind === 'activity').length, 1);
});
test('disconnect clears credentials and retains activity; other members cannot manage a connection', async () => {
  const f = fixture(); assert.equal((await f.post({ action: 'disconnect', id: 'connection' })).status, 200);
  assert.equal(f.writes.length, 1); assert.deepEqual(JSON.parse(JSON.stringify(f.writes[0][1].data)), { credentials: null, isActive: false });
  for (const body of [{ action: 'disconnect', id: 'connection' }, { action: 'refresh', id: 'connection' }, connect]) {
    const other = fixture({ foreignOwner: true, existing: true }); assert.equal((await other.post(body)).status, 403); assert.equal(other.writes.length, 0);
  }
});
test('reconnect preserves connection identity and upserts history', async () => {
  const f = fixture({ existing: true }); assert.equal((await f.post(connect)).status, 200);
  assert.equal(f.writes.some(([kind]) => kind === 'create'), false);
  assert.equal(f.writes.find(([kind]) => kind === 'update')[1].where.id, 'connection');
  assert.equal(f.writes.find(([kind]) => kind === 'activity')[1].where.connectionId_kind_externalId.connectionId, 'connection');
});
test('refresh denies revoked credentials, changed repository identity and disconnected connections', async () => {
  for (const options of [{ revoked: true }, { changedIdentity: true }, { disconnected: true }]) {
    const f = fixture(options); const r = await f.post({ action: 'refresh', id: 'connection' }); assert.ok([400, 409].includes(r.status)); assert.equal(f.writes.length, 0);
  }
});
test('refresh checks concurrent changes before writing activity', async () => {
  const f = fixture({ concurrentChange: true }); const r = await f.post({ action: 'refresh', id: 'connection' });
  assert.equal(r.status, 400); assert.equal(f.writes.some(([kind]) => kind === 'activity'), false);
  assert.equal(f.writes[0][1].where.isActive, true); assert.equal(f.writes[0][1].where.updatedAt, f.saved.updatedAt);
});
test('workspace owner may disconnect and ordinary refresh retains activity', async () => {
  const owner = fixture({ foreignOwner: true, workspaceOwner: true }); assert.equal((await owner.post({ action: 'disconnect', id: 'connection' })).status, 200);
  const f = fixture(); assert.equal((await f.post({ action: 'refresh', id: 'connection' })).status, 200); assert.equal(f.writes.filter(([kind]) => kind === 'activity').length, 1);
});

test('stale disconnect, refresh and reconnect preserve replacement credentials and ownership', async () => {
  for (const replacement of [
    { credentials: 'replacement', updatedAt: new Date(1) },
    { credentials: 'replacement', connectedById: 'owner' },
    { credentials: 'replacement', connectedById: 'owner', updatedAt: new Date(1) },
  ]) {
    for (const body of [{ action: 'disconnect', id: 'connection' }, { action: 'refresh', id: 'connection' }, connect]) {
      const f = fixture({ existing: true, replacement });
      const response = await f.post(body);
      assert.ok(response.status >= 400);
      if (body.action === 'disconnect') assert.equal(response.status, 409);
      assert.equal(f.stored.credentials, 'replacement');
      assert.equal(f.stored.connectedById, replacement.connectedById || 'alice');
      assert.equal(f.stored.isActive, true);
      assert.equal(f.writes.some(([kind]) => kind === 'activity'), false);
    }
  }
});

test("refresh, disconnect and reconnect of someone else's connection: an Owner and the primary owner pass, an Admin and a standard member are refused, the connector always passes; canManage says the same", async () => {
  // 'other' made the connection. The real authority module decides; access to the project is the real check too.
  const members = [{ userId: 'olivia', role: 'OWNER' }, { userId: 'adam', role: 'ADMIN' }, { userId: 'sam', role: 'MEMBER' }, { userId: 'other', role: 'MEMBER' },
    { userId: 'pat', role: 'MEMBER' }, { userId: 'off', role: 'OWNER', status: false }];
  const cases = [['owner', 200], ['olivia', 200], ['other', 200], ['adam', 403], ['sam', 403], ['pat', 403, { platformAdmin: 'pat' }], ['off', 404]];
  for (const [actor, expected, extra] of cases) {
    const options = { foreignOwner: true, existing: true, realAccess: true, members, actor, ...extra };
    for (const body of [{ action: 'refresh', id: 'connection' }, { action: 'disconnect', id: 'connection' }, connect]) {
      const f = fixture(options); const response = await f.post(body);
      assert.equal(response.status, expected, `${actor} ${body.action}`);
      assert.ok(f.calls.filter(([name]) => name === 'authority').length <= (actor === 'other' ? 0 : 1), `${actor} ${body.action} asks the authority at most once`);
      if (expected !== 200) {
        assert.equal(f.writes.length, 0); assert.equal(f.stored.connectedById, 'other'); assert.equal(f.stored.credentials, 'encrypted');
        // A reconnect reads the repository with the caller's own token to learn its identity; stored credentials are never used.
        assert.deepEqual(f.calls.filter(([name]) => name.startsWith('remote') || name === 'encrypt').map(([name]) => name), body.action === 'connect' && expected === 403 ? ['remoteRepo'] : [], `${actor} ${body.action}`);
      }
    }
    const read = await fixture({ foreignOwner: true, realAccess: true, members, actor, ...extra }).get();
    if (expected === 404) assert.equal(read.status, 404);
    else assert.equal(read.body.connections[0].canManage, expected === 200, `${actor} canManage`);
  }
  // A switched-off Owner who reaches the project another way still holds no Owner level.
  const off = fixture({ foreignOwner: true, members, actor: 'off' });
  assert.equal((await off.post({ action: 'disconnect', id: 'connection' })).status, 403); assert.equal(off.writes.length, 0);
  assert.equal((await fixture({ foreignOwner: true, members, actor: 'off' }).get()).body.connections[0].canManage, false);
  // The connector's own GET and calls never ask the authority.
  const own = fixture({ members }); await own.get(); await own.post({ action: 'disconnect', id: 'connection' });
  assert.equal(own.calls.some(([name]) => name === 'authority'), false);
});
