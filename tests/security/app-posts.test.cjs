const { assert, test, resolve, load, matches, workspaces, prisma } = require('./helpers.cjs');


test('app post handlers enforce live membership and preserve token and operation permissions', async t => {
  let reads, writes, token, spaces, posts, actor;
  const reset = () => {
    reads = 0; writes = []; actor = 'alice'; spaces = structuredClone(workspaces);
    posts = spaces.map(workspace => ({ id: workspace.id, workspaceId: workspace.id, workspace, authorId: 'alice',
      message: 'Protected post', html: '<p>Protected</p>', author: { id: 'alice', name: 'Alice', email: 'private@example.test' },
      comments: [], _count: { comments: 0, reactions: 0, bookmarks: 0 } }));
    token = { workspaceId: 'joined', isSystemApp: false, status: 'ACTIVE', scopes: ['posts:read', 'posts:write'], isRevoked: false };
  };
  reset();
  const project = (post, spec) => {
    if (!post) return null;
    if (spec.select) return { id: post.id };
    reads++;
    const fields = spec.include?.author?.select;
    return { ...post, author: fields ? Object.fromEntries(Object.entries(post.author).filter(([key]) => fields[key])) : post.author };
  };
  const db = {
    workspace: { findFirst: async ({ where }) => spaces.find(w => matches(w, where)) ?? null },
    workspaceMember: {
      findFirst: async ({ where }) => spaces.flatMap(w => w.members.map(m => ({ ...m, workspaceId: w.id }))).find(m => matches(m, where)),
      findUnique: async ({ where }) => spaces.find(w => w.id === where.userId_workspaceId.workspaceId)?.members.find(m => m.userId === actor) ?? null,
    },
    user: { findUnique: async () => ({ id: actor, name: 'Alice' }) },
    app: { findUnique: async () => ({ isSystemApp: token.isSystemApp }) },
    appToken: { findMany: async () => {
      if (token.isRevoked) return [];
      const workspace = spaces.find(w => w.id === token.workspaceId);
      const app = { id: 'app', name: 'App', slug: 'app', status: token.appStatus || 'PUBLISHED', isSystemApp: token.isSystemApp };
      return [{ accessToken: 'Y2lwaGVy', userId: actor, scopes: token.scopes, tokenExpiresAt: token.expiresAt,
        app, workspace, installation: token.isSystemApp ? null : { id: 'installation', workspace, workspaceId: workspace.id,
          app, appId: 'app', status: token.status, installedById: actor, scopes: [] } }];
    } },
    post: {
      findFirst: async spec => project(posts.find(p => matches(p, spec.where)), spec),
      findMany: async spec => posts.filter(p => matches(p, spec.where)).map(p => project(p, spec)),
      count: async spec => { reads++; return posts.filter(p => matches(p, spec.where)).length; },
      create: async spec => { writes.push('create'); return project({ ...posts[0], ...spec.data, id: 'created' }, spec); },
      update: async spec => { writes.push('update'); return project({ ...posts.find(p => p.id === spec.where.id), ...spec.data }, spec); },
      delete: async spec => { writes.push('delete'); posts = posts.filter(p => p.id !== spec.where.id); },
    },
    $queryRaw: async () => [], $transaction: async fn => fn(db),
  };
  const deps = { '@/lib/prisma': { prisma: db }, 'next/server': { NextResponse: Response }, zod: require('zod'),
    '@/lib/apps/crypto': { decryptToken: async () => 'valid-token' }, '@/lib/oauth-scopes': load('src/lib/oauth-scopes.ts') };
  const globals = { URL, Buffer, console, Error };
  deps['@/lib/apps/auth-middleware'] = load('src/lib/apps/auth-middleware.ts', deps, globals);
  const collection = load('src/app/api/apps/auth/posts/route.ts', deps, globals);
  const detail = load('src/app/api/apps/auth/posts/[postId]/route.ts', deps, globals);
  const call = (method, list, id = token.workspaceId, extra = {}) => (list ? collection : detail)[method](new Request('https://example.test/?' + (extra.query || ''), {
    method, headers: extra.anonymous ? {} : { Authorization: 'Bearer valid-token' },
    ...(['POST', 'PATCH'].includes(method) ? { body: JSON.stringify(extra.body || { message: 'Updated' }) } : {}),
  }), { params: Promise.resolve({ postId: id }) });
  for (const [method, list] of [['GET', true], ['POST', true], ['GET', false], ['PATCH', false], ['DELETE', false]]) {
    for (const state of ['anonymous', 'revoked', 'foreign', 'own', 'joined']) await t.test(`${list ? 'collection' : 'detail'} ${method}: ${state}`, async () => {
      reset(); token.workspaceId = state === 'anonymous' ? 'joined' : state;
      const response = await call(method, list, token.workspaceId, { anonymous: state === 'anonymous' });
      const body = await response.text();
      if (['own', 'joined'].includes(state)) {
        assert.ok([200, 201].includes(response.status), body); assert.doesNotMatch(body, /private@example/);
      } else {
        assert.equal(response.status, state === 'anonymous' ? 401 : 403, body);
        assert.equal(reads, 0); assert.equal(writes.length, 0); assert.doesNotMatch(body, /Protected|private@example/);
      }
    });
  }
  await t.test('token scope, expiry and installation checks still deny without resource access', async () => {
    for (const change of [{ scopes: ['posts:read'] }, { expiresAt: new Date(0) }, { isRevoked: true }, { status: 'SUSPENDED' }, { appStatus: 'DRAFT' }]) {
      reset(); Object.assign(token, change);
      assert.ok([401, 403].includes((await call('PATCH', false)).status)); assert.equal(reads, 0); assert.equal(writes.length, 0);
    }
  });
  await t.test('author, active admin and pin permissions remain operation specific', async () => {
    reset(); posts.find(p => p.id === 'joined').authorId = 'bob';
    assert.equal((await call('PATCH', false)).status, 403); assert.equal((await call('DELETE', false)).status, 403);
    assert.equal(writes.length, 0);
    spaces.find(w => w.id === 'joined').members[0].role = 'ADMIN';
    assert.equal((await call('PATCH', false, 'joined', { body: { isPinned: true } })).status, 200);
    assert.equal((await call('DELETE', false)).status, 200);
    reset(); assert.equal((await call('PATCH', false, 'joined', { body: { isPinned: true } })).status, 403);
    assert.equal(writes.length, 0);
  });
  await t.test('system workspace overrides enforce owner and active membership', async () => {
    for (const target of ['own', 'joined', 'revoked', 'foreign']) {
      reset(); token.isSystemApp = true;
      const response = await call('GET', false, target, { query: `workspaceId=${target}` });
      assert.equal(response.status, ['own', 'joined'].includes(target) ? 200 : 403);
      if (response.status === 403) assert.equal(reads, 0);
    }
    reset(); token.isSystemApp = true; token.workspaceId = 'revoked';
    assert.equal((await call('GET', false, 'own', { query: 'workspaceId=own' })).status, 403);
    assert.equal(reads, 0);
    reset(); assert.equal((await call('GET', false, 'foreign')).status, 404); assert.equal(reads, 0);
  });
});

test('app post creation uses the token user rather than the installer and rejects revocation', async () => {
  const workspace = { id: 'joined', slug: 'joined', name: 'Joined', ownerId: 'installer', members: [{ userId: 'token-user', status: true }] };
  let writes = [];
  const db = {
    appToken: { findMany: async () => [{ accessToken: 'Y2lwaGVy', userId: 'token-user', scopes: ['posts:write'], tokenExpiresAt: null,
      installation: { id: 'install', appId: 'app', workspaceId: workspace.id, installedById: 'installer', scopes: [], status: 'ACTIVE', workspace,
        app: { id: 'app', slug: 'app', name: 'App', status: 'PUBLISHED' } } }] },
    user: { findUnique: async ({ where }) => ({ id: where.id, name: 'Token user', email: null }) },
    workspace: { findFirst: async ({ where }) => matches(workspace, where) ? workspace : null },
    post: { create: async ({ data }) => { writes.push(data); return { ...data, id: 'post', author: { id: data.authorId }, _count: { comments: 0, reactions: 0, bookmarks: 0 } }; } },
  };
  const deps = { '@/lib/prisma': { prisma: db }, 'next/server': { NextResponse: Response }, zod: require('zod'),
    '@/lib/apps/crypto': { decryptToken: async () => 'token' }, '@/lib/oauth-scopes': load('src/lib/oauth-scopes.ts') };
  deps['@/lib/apps/auth-middleware'] = load('src/lib/apps/auth-middleware.ts', deps, { URL, Buffer, console });
  const handler = load('src/app/api/apps/auth/posts/route.ts', deps, { URL, console }).POST;
  const request = () => new Request('https://example.test', { method: 'POST', headers: { Authorization: 'Bearer token' }, body: JSON.stringify({ message: 'From the token user' }) });
  const response = await handler(request()); assert.equal(response.status, 201);
  assert.equal((await response.json()).author.id, 'token-user'); assert.equal(writes[0].authorId, 'token-user');
  workspace.members[0].status = false; writes = [];
  assert.equal((await handler(request())).status, 403); assert.equal(writes.length, 0);
});
