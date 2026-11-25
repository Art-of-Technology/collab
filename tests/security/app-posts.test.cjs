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
    workspace: { findFirst: async ({ where }) => spaces.find(w => matches(w, where)) ?? null,
      findUnique: async ({ where }) => spaces.find(w => w.id === where.id) ?? null },
    workspaceMember: {
      findFirst: async ({ where }) => spaces.flatMap(w => w.members.map(m => ({ ...m, workspaceId: w.id }))).find(m => matches(m, where)),
      findUnique: async ({ where }) => spaces.find(w => w.id === where.userId_workspaceId.workspaceId)?.members.find(m => m.userId === actor) ?? null,
    },
    user: { findUnique: async ({ select }) => select?.workspaceMemberships
      // The authority module asks for the role and the active memberships.
      ? { role: 'DEVELOPER', workspaceMemberships: (spaces.find(w => w.id === select.workspaceMemberships.where.workspaceId)?.members ?? [])
        .filter(m => m.userId === actor && m.status === true).map(m => ({ role: m.role })) }
      : { id: actor, name: 'Alice' } },
    app: { findUnique: async () => ({ isSystemApp: token.isSystemApp }) },
    appToken: { findMany: async () => {
      if (token.isRevoked) return [];
      const workspace = spaces.find(w => w.id === token.workspaceId);
      const app = { id: 'app', name: 'App', slug: 'app', status: token.appStatus || 'PUBLISHED', isSystemApp: token.isSystemApp, scopes: [{ scope: 'posts:read' }, { scope: 'posts:write' }] };
      return [{ accessToken: 'Y2lwaGVy', userId: actor, scopes: token.scopes, tokenExpiresAt: token.expiresAt,
        app, workspace, installation: token.isSystemApp ? null : { id: 'installation', workspace, workspaceId: workspace.id,
          app, appId: 'app', status: token.status, installedById: actor, scopes: ['posts:read', 'posts:write'] } }];
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
    '@/lib/apps/crypto': { getEncryptionKey: () => 'fixture-key', decryptToken: async () => 'valid-token' }, '@/lib/oauth-scopes': load('src/lib/oauth-scopes.ts') };
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
      installation: { id: 'install', appId: 'app', workspaceId: workspace.id, installedById: 'installer', scopes: ['posts:read', 'posts:write'], status: 'ACTIVE', workspace,
        app: { id: 'app', slug: 'app', name: 'App', status: 'PUBLISHED', scopes: [{ scope: 'posts:write' }] } } }] },
    user: { findUnique: async ({ where }) => ({ id: where.id, name: 'Token user', email: null }) },
    workspace: { findFirst: async ({ where }) => matches(workspace, where) ? workspace : null },
    post: { create: async ({ data }) => { writes.push(data); return { ...data, id: 'post', author: { id: data.authorId }, _count: { comments: 0, reactions: 0, bookmarks: 0 } }; } },
  };
  const deps = { '@/lib/prisma': { prisma: db }, 'next/server': { NextResponse: Response }, zod: require('zod'),
    '@/lib/apps/crypto': { getEncryptionKey: () => 'fixture-key', decryptToken: async () => 'token' }, '@/lib/oauth-scopes': load('src/lib/oauth-scopes.ts') };
  deps['@/lib/apps/auth-middleware'] = load('src/lib/apps/auth-middleware.ts', deps, { URL, Buffer, console });
  const handler = load('src/app/api/apps/auth/posts/route.ts', deps, { URL, console }).POST;
  const request = () => new Request('https://example.test', { method: 'POST', headers: { Authorization: 'Bearer token' }, body: JSON.stringify({ message: 'From the token user' }) });
  const response = await handler(request()); assert.equal(response.status, 201);
  assert.equal((await response.json()).author.id, 'token-user'); assert.equal(writes[0].authorId, 'token-user');
  workspace.members[0].status = false; writes = [];
  assert.equal((await handler(request())).status, 403); assert.equal(writes.length, 0);
});

test('a post of someone else is updated and deleted by a token of an Admin and above, and by nobody below', async t => {
  const fixture = () => {
    const state = { actor: null, writes: [] };
    const users = { author: 'DEVELOPER', primary: 'DEVELOPER', owner: 'DEVELOPER', admin: 'DEVELOPER', member: 'DEVELOPER', root: 'SYSTEM_ADMIN', off: 'DEVELOPER' };
    const workspace = { id: 'w', slug: 'w', name: 'Workspace', ownerId: 'primary', members: [['author', 'DEVELOPER', true], ['owner', 'OWNER', true],
      ['admin', 'ADMIN', true], ['member', 'DEVELOPER', true], ['root', 'DEVELOPER', true], ['off', 'ADMIN', false]]
      .map(([userId, role, status]) => ({ userId, workspaceId: 'w', role, status })) };
    let posts = [{ id: 'post', workspaceId: 'w', workspace, authorId: 'author', message: 'Original', html: null, type: 'UPDATE', priority: 'normal',
      isPinned: false, author: { id: 'author', name: 'Author', image: null }, _count: { comments: 0, reactions: 0, bookmarks: 0 } }];
    const db = {
      appToken: { findMany: async () => [{ accessToken: 'Y2lwaGVy', userId: state.actor, scopes: ['posts:read', 'posts:write'], tokenExpiresAt: null,
        installation: { id: 'install', appId: 'app', workspaceId: 'w', installedById: state.actor, scopes: ['posts:read', 'posts:write'], status: 'ACTIVE',
          workspace: { id: 'w', slug: 'w', name: 'Workspace' },
          app: { id: 'app', slug: 'app', name: 'App', status: 'PUBLISHED', scopes: [{ scope: 'posts:read' }, { scope: 'posts:write' }] } } }] },
      user: { findUnique: async ({ where, select }) => {
        if (!(where.id in users)) return null;
        // The middleware asks who the token's user is; the authority module asks for the role and active memberships.
        if (!select.workspaceMemberships) return { id: where.id, email: null, name: where.id };
        return { role: users[where.id], workspaceMemberships: workspace.members.filter(m => m.userId === where.id && matches(m, select.workspaceMemberships.where)).map(m => ({ role: m.role })) };
      } },
      workspace: {
        findFirst: async ({ where }) => matches(workspace, where) ? { id: workspace.id } : null,
        findUnique: async ({ where }) => where.id === workspace.id ? { ownerId: workspace.ownerId } : null,
      },
      workspaceMember: { findUnique: async ({ where }) => workspace.members.find(m => m.userId === where.userId_workspaceId.userId) ?? null },
      post: {
        findFirst: async ({ where }) => posts.find(p => matches(p, where)) ?? null,
        update: async ({ where, data }) => { state.writes.push({ update: where.id, data: { ...data } }); return { ...posts.find(p => p.id === where.id), ...data, resolvedBy: null, pinnedByUser: null }; },
        delete: async ({ where }) => { state.writes.push({ delete: where.id }); posts = posts.filter(p => !matches(p, where)); },
      },
      $queryRaw: async () => [], $transaction: async fn => fn(db),
    };
    const deps = { '@/lib/prisma': { prisma: db }, 'next/server': { NextResponse: Response }, zod: require('zod'),
      '@/lib/apps/crypto': { getEncryptionKey: () => 'fixture-key', decryptToken: async () => 'token' }, '@/lib/oauth-scopes': load('src/lib/oauth-scopes.ts') };
    const globals = { URL, Buffer, console, Error };
    deps['@/lib/apps/auth-middleware'] = load('src/lib/apps/auth-middleware.ts', deps, globals);
    const route = load('src/app/api/apps/auth/posts/[postId]/route.ts', deps, globals);
    const send = async (actor, method, body) => {
      state.actor = actor;
      const response = await route[method](new Request('https://example.test', { method, headers: { Authorization: 'Bearer token' },
        ...(body ? { body: JSON.stringify(body) } : {}) }), { params: Promise.resolve({ postId: 'post' }) });
      return { status: response.status, body: await response.json() };
    };
    return { state, send };
  };

  // The author, an Admin, an Owner and the primary owner (no membership row) pass.
  for (const actor of ['author', 'admin', 'owner', 'primary']) await t.test(`${actor} updates and deletes`, async () => {
    const { state, send } = fixture();
    const updated = await send(actor, 'PATCH', { message: `By ${actor}` });
    assert.equal(updated.status, 200, JSON.stringify(updated.body)); assert.equal(updated.body.message, `By ${actor}`);
    const deleted = await send(actor, 'DELETE');
    assert.equal(deleted.status, 200, JSON.stringify(deleted.body));
    assert.deepEqual(state.writes, [{ update: 'post', data: { message: `By ${actor}` } }, { delete: 'post' }]);
  });

  // A standard member, a platform admin whose membership is standard, and a switched-off Admin are refused and write nothing.
  for (const actor of ['member', 'root', 'off']) await t.test(`${actor} is refused`, async () => {
    const { state, send } = fixture();
    for (const [method, body] of [['PATCH', { message: 'Not mine' }], ['DELETE']]) {
      const refused = await send(actor, method, body);
      assert.equal(refused.status, 403, `${method} ${JSON.stringify(refused.body)}`);
      if (actor !== 'off') assert.equal(refused.body.error, 'insufficient_permissions');
    }
    assert.equal(state.writes.length, 0);
  });

  // Pinning stays with those who may manage other people's posts; the author alone does not pin.
  await t.test('pinning follows the same rule', async () => {
    const { state, send } = fixture();
    const refused = await send('author', 'PATCH', { isPinned: true });
    assert.equal(refused.status, 403); assert.equal(refused.body.error, 'insufficient_permissions');
    assert.equal(state.writes.length, 0);
    for (const actor of ['admin', 'owner', 'primary']) assert.equal((await send(actor, 'PATCH', { isPinned: true })).status, 200, actor);
    assert.equal(state.writes.length, 3);
  });
});
