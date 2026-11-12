const { assert, test, load, matches } = require('./helpers.cjs');

// An owner publishes only what an administrator approved, and cannot undo an administrator's decision.
function fixture({ status = 'DRAFT', approved = null } = {}) {
  const users = [{ id: 'alice', role: 'DEVELOPER' }, { id: 'root', role: 'SYSTEM_ADMIN' }]
    .map(user => ({ ...user, createdAt: new Date(), updatedAt: new Date(), emailVerified: null }));
  // Newest first, as the routes ask for them.
  const app = { id: 'app', slug: 'app', name: 'App', userId: 'alice', status, approvedVersionId: approved, oauthClient: null, updatedAt: new Date(0),
    versions: [{ id: 'v1', manifest: {} }] };
  const state = { session: null, beforeUpdate: null };
  const read = async ({ where }) => matches(app, where) ? { ...app, versions: app.versions.slice(0, 1) } : null;
  const prisma = {
    user: { findUnique: async ({ where }) => users.find(row => row.id === where.id) ?? null },
    $queryRaw: async () => [],
    app: { findUnique: read, findFirst: read, updateMany: async ({ where, data }) => {
      if (state.beforeUpdate) { const change = state.beforeUpdate; state.beforeUpdate = null; change(); }
      if (!matches(app, where)) return { count: 0 };
      Object.assign(app, data, { updatedAt: data.updatedAt || new Date(app.updatedAt.getTime() + 1) });
      return { count: 1 };
    } },
    $transaction: async run => run(prisma),
  };
  const json = (body, init = {}) => ({ body, status: init.status ?? 200 });
  const deps = {
    zod: require('zod'), 'next/server': { NextResponse: { json } },
    '@/lib/prisma': { prisma }, '@/lib/auth-options': { authOptions: {} },
    '@/lib/request-session': { getServerSession: async () => state.session },
    '@/lib/apps/ownership': load('src/lib/apps/ownership.ts'),
    '@/lib/apps/crypto': { generateClientCredentials: async () => { throw new Error('no credentials expected'); }, encryptToken: async () => { throw new Error('no secret expected'); } },
    '@/lib/apps/jwks': { validateJWKS: async () => ({ valid: true }) },
  };
  const globals = { Buffer, console: { error() {}, log() {} }, Date };
  deps['@/lib/session'] = load('src/lib/session.ts', deps, globals);
  const publish = load('src/app/api/apps/by-id/[id]/publish/route.ts', deps, globals);
  const approval = load('src/app/api/apps/by-id/[id]/approve/route.ts', deps, globals);
  const rejection = load('src/app/api/apps/by-id/[id]/reject/route.ts', deps, globals);
  const as = id => { state.session = id ? { user: { id, role: users.find(row => row.id === id).role } } : null; };
  const params = { params: Promise.resolve({ id: 'app' }) };
  const set = async (who, target) => { as(who); return (await publish.PATCH({ json: async () => ({ status: target }) }, params)).status; };
  const approve = async () => { as('root'); return (await approval.POST({}, params)).status; };
  const reject = async () => { as('root'); return (await rejection.POST({ json: async () => ({ reason: 'Not ready' }) }, params)).status; };
  // What submitting a manifest does: a new newest version, back to review.
  const submit = id => { app.versions.unshift({ id, manifest: {} }); app.status = 'IN_REVIEW'; };
  return { app, state, set, approve, reject, submit };
}

test('stale transitions cannot overwrite newer app state', async () => {
  for (const [status, action, change, expected] of [
    ['DRAFT', f => f.set('alice', 'PUBLISHED'), f => f.submit('v2'), 'IN_REVIEW'],
    ['PUBLISHED', f => f.set('alice', 'DRAFT'), f => { f.app.status = 'SUSPENDED'; }, 'SUSPENDED'],
    ['IN_REVIEW', f => f.approve(), f => { f.app.status = 'DRAFT'; }, 'DRAFT'],
    ['IN_REVIEW', f => f.approve(), f => f.submit('v2'), 'IN_REVIEW'],
    // An approval and the owner's publish landed while a rejection was on its way.
    ['IN_REVIEW', f => f.reject(), f => { f.app.status = 'PUBLISHED'; }, 'PUBLISHED'],
  ]) {
    const f = fixture({ status, approved: 'v1' });
    f.state.beforeUpdate = () => { change(f); f.app.updatedAt = new Date(1); };
    assert.equal(await action(f), 409);
    assert.equal(f.app.status, expected);
    assert.equal(f.app.approvedVersionId, 'v1');
  }
});

test('an owner cannot publish a version that no administrator approved', async () => {
  const f = fixture();
  assert.equal(await f.set('alice', 'PUBLISHED'), 403);
  assert.equal(f.app.status, 'DRAFT');

  assert.equal(await f.set('alice', 'IN_REVIEW'), 200);
  assert.equal(await f.set('alice', 'DRAFT'), 200, 'withdrawing from review is the owner\'s to do');
  assert.equal(await f.set('alice', 'PUBLISHED'), 403, 'but it does not approve anything');

  f.app.status = 'IN_REVIEW';
  assert.equal(await f.approve(), 200);
  assert.equal(JSON.stringify([f.app.status, f.app.approvedVersionId]), JSON.stringify(['DRAFT', 'v1']));
  assert.equal(await f.set('alice', 'PUBLISHED'), 200);
  assert.equal(await f.set('alice', 'DRAFT'), 200);
  assert.equal(await f.set('alice', 'PUBLISHED'), 200, 'the approved version can be unpublished and published again');
});

test('a new version needs its own approval', async () => {
  const f = fixture({ status: 'PUBLISHED', approved: 'v1' });
  f.submit('v2');
  assert.equal(await f.set('alice', 'DRAFT'), 200);
  assert.equal(await f.set('alice', 'PUBLISHED'), 403, 'v1 was approved, v2 was not');
  f.app.status = 'IN_REVIEW';
  assert.equal(await f.approve(), 200);
  assert.equal(f.app.approvedVersionId, 'v2');
  assert.equal(await f.set('alice', 'PUBLISHED'), 200);
});

test('an owner cannot lift a suspension or make an administrator\'s decisions', async () => {
  for (const [status, target] of [['SUSPENDED', 'PUBLISHED'], ['SUSPENDED', 'DRAFT'], ['PUBLISHED', 'SUSPENDED'], ['IN_REVIEW', 'REJECTED']]) {
    const f = fixture({ status, approved: 'v1' });
    assert.equal(await f.set('alice', target), 403, `${status} to ${target}`);
    assert.equal(f.app.status, status);
    assert.equal(await f.set('root', target), 200, `a system admin: ${status} to ${target}`);
  }
  const f = fixture({ status: 'REJECTED' });
  assert.equal(await f.set('alice', 'DRAFT'), 200, 'a rejected app goes back to draft for rework');
  assert.equal(await f.set('alice', 'SUSPENDED'), 400, 'a change that is valid for nobody is still a bad request');
});

test('a system admin who publishes a draft records that version as approved', async () => {
  const f = fixture();
  assert.equal(await f.set('root', 'PUBLISHED'), 200);
  assert.equal(f.app.approvedVersionId, 'v1');
  assert.equal(await f.set('alice', 'DRAFT'), 200);
  assert.equal(await f.set('alice', 'PUBLISHED'), 200);
});

test('a rejection in time sends the app back and leaves the newest version unapproved', async () => {
  const f = fixture({ status: 'PUBLISHED', approved: 'v1' });
  f.submit('v2');
  assert.equal(await f.reject(), 200);
  assert.equal(JSON.stringify([f.app.status, f.app.approvedVersionId]), JSON.stringify(['REJECTED', null]));
  assert.equal(await f.set('alice', 'DRAFT'), 200);
  assert.equal(await f.set('alice', 'PUBLISHED'), 403, 'the rejected version cannot be published');
  assert.equal(await f.reject(), 400, 'only an app in review can be rejected');
});

test('rejecting a previously approved version revokes its approval through either route', async () => {
  for (const reject of [f => f.reject(), f => f.set('root', 'REJECTED')]) {
    const f = fixture({ approved: 'v1' });
    assert.equal(await f.set('alice', 'IN_REVIEW'), 200);
    assert.equal(await reject(f), 200);
    assert.equal(f.app.approvedVersionId, null);
    assert.equal(await f.set('alice', 'DRAFT'), 200);
    assert.equal(await f.set('alice', 'PUBLISHED'), 403);
    assert.equal(await f.set('alice', 'IN_REVIEW'), 200);
    assert.equal(await f.approve(), 200);
    assert.equal(await f.set('alice', 'PUBLISHED'), 200);
  }
});
