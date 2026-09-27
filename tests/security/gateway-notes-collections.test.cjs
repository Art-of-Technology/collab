const { assert, test, load, matches, enums } = require('./helpers.cjs');
const issuer = 'https://identity.example.test/realms/company';
const claims = () => new Headers(Object.fromEntries([
  ['issuer', issuer], ['subject', 'notes-user'], ['email', 'mapped@weezboo.com'],
].map(([key, value]) => [`x-collab-${key}`, Buffer.from(value).toString('base64url')])
  .concat([['x-collab-email-verified', 'true'], ['cookie', 'legacy=present']])));
const cases = [
  ['list', 'notes', 'GET', '?scope=PERSONAL'],
  ['create', 'notes', 'POST', ''],
  ['search', 'notes/search', 'GET', '?q=needle&workspaceId=joined'],
  ['pinned', 'notes/pinned', 'GET', '?workspaceId=joined'],
  ['shared', 'notes/shared-with-me', 'GET', ''],
  ['tags', 'notes/tags', 'GET', ''],
  ['create-tag', 'notes/tags', 'POST', ''],
  ['preview', 'link-preview', 'POST', ''],
];

function fixture(spec) {
  const [kind, path, method, query] = spec;
  const env = { env: { COLLAB_AUTH_MODE: 'gateway', COLLAB_GATEWAY_ISSUER: issuer } };
  const state = { headers: claims(), live: true, broken: false, legacyCalls: 0, mappedReads: 0, effects: [] };
  const user = { id: 'mapped', email: 'mapped@weezboo.com', role: 'DEVELOPER', accounts: [{ id: 'mapping' }] };
  const legacyUser = { ...user, id: 'legacy', email: 'legacy@weezboo.com' };
  const options = { fixtureOptions: true };
  const nextAuth = { getServerSession: async (...args) => {
    assert.equal(args.length, 1); assert.equal(args[0], options);
    state.legacyCalls++; return { user: legacyUser, expires: 'legacy-expiry' };
  } };
  const workspace = { id: 'joined', slug: 'joined', name: 'Workspace', ownerId: 'bob',
    members: ['mapped', 'legacy'].map(userId => ({ userId, status: true })) };
  const rows = ['mapped', 'legacy'].map(id => ({
    id, authorId: kind === 'shared' ? 'bob' : id, scope: 'PERSONAL', type: 'GENERAL', workspaceId: 'joined', projectId: null,
    title: `needle ${id}`, content: 'needle content', isPinned: true, isFavorite: false, isRestricted: false,
    isEncrypted: false, expiresAt: null, sharedWith: kind === 'shared' ? [{ userId: id, permission: 'VIEW' }] : [],
    workspace, author: { id, name: id }, tags: [], project: null, createdAt: new Date(), updatedAt: new Date(),
  }));
  const record = (name, args) => state.effects.push([name, args]);
  const prisma = {
    account: { findUnique: async () => {
      state.mappedReads++;
      if (state.broken) throw new Error('synthetic database failure');
      return state.live ? { user } : null;
    } },
    user: { findUnique: async ({ where }) => { record('user', where); return [user, legacyUser].find(row => row.id === where.id) ?? null; } },
    note: {
      findMany: async args => { record('notes', args); return rows.filter(row => matches(row, args.where)); },
      count: async args => { record('count', args); return rows.filter(row => matches(row, args.where)).length; },
      findFirst: async args => { record('preview', args); return rows.find(row => matches(row, args.where)) ?? null; },
      create: async ({ data }) => { record('create', data); return { ...data, id: 'created', workspace: null }; },
    },
    noteTag: {
      findMany: async args => { record('tags', args); return rows.map(row => ({ id: row.id, authorId: row.authorId, workspaceId: null }))
        .filter(row => matches(row, args.where)); },
      findFirst: async args => { record('existing-tag', args); return null; },
      create: async ({ data }) => { record('create-tag', data); return { id: 'tag', ...data }; },
    },
  };
  const identity = load('src/lib/gateway-identity.ts', { 'node:crypto': require('node:crypto') }, { process: env, Buffer, TextDecoder, URL });
  const adapter = load('src/lib/request-session.ts', { 'server-only': {}, './gateway-identity': identity,
    'next-auth': nextAuth, 'next/headers': { headers: async () => state.headers }, '@/lib/prisma': { prisma } }, { process: env });
  const access = load('src/lib/secrets/access.ts', { '@/lib/prisma': { prisma }, '@prisma/client': enums,
    '@/lib/issue-finder': { userHasWorkspaceAccess: async () => assert.fail('Personal creation needs no workspace lookup') } });
  const route = load(`src/app/api/${path}/route.ts`, {
    '@/lib/request-session': adapter, 'next-auth': nextAuth, '@/lib/auth-options': { authOptions: options },
    'next/server': { NextResponse: Response }, '@/lib/prisma': { prisma }, '@/lib/secrets/access': access,
    '@prisma/client': { ...enums, NoteType: { GENERAL: 'GENERAL' } },
    '@/lib/secrets/crypto': { isSecretNoteType: () => false },
    '@/lib/versioning': { createInitialVersion: async args => record('version', args) },
    '@/lib/event-bus': { emitContextCreated: () => assert.fail('No provider/event operation') },
  }, { URL, console: { error() {} } });
  const body = kind === 'create' ? { title: 'New', content: 'Body' }
    : kind === 'create-tag' ? { name: ' New tag ' }
      : { url: 'https://example.test/joined/notes/mapped' };
  const invoke = () => route[method](new Request(`https://example.test/api/${path}${query}`, {
    method, headers: { cookie: 'legacy=present' }, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
  }));
  async function assertSuccess(actor) {
    const response = await invoke();
    assert.equal(response.status, ['create', 'create-tag'].includes(kind) ? 201 : 200, kind);
    const body = await response.json();
    if (['create', 'create-tag'].includes(kind)) {
      assert.equal(body.authorId, actor);
      if (kind === 'create-tag') { assert.equal(body.name, 'New tag'); assert.equal(body.color, '#6366F1'); }
    } else if (kind === 'search') {
      assert.deepEqual(body.results.map(row => row.id), [actor]); assert.equal(body.total, 1);
      assert.equal(body.hasMore, false); assert.equal(body.query, 'needle');
      assert.ok(state.effects.some(([name]) => name === 'count'));
    } else if (kind === 'preview') {
      assert.equal(body.type, 'internal'); assert.equal(body.subtype, 'note');
      assert.equal(body.title, actor === 'mapped' ? 'needle mapped' : 'Not Found');
      assert.equal(body.metadata.notFound === true, actor !== 'mapped');
    } else assert.deepEqual(body.map(row => row.id), [actor]);
  }
  return { state, env, invoke, assertSuccess };
}

test('legacy Notes list remains a legitimate control', async () => {
  const f = fixture(cases[0]); f.env.env.COLLAB_AUTH_MODE = 'nextauth';
  await f.assertSuccess('legacy'); assert.equal(f.state.legacyCalls, 1); assert.equal(f.state.mappedReads, 0);
});

for (const spec of cases) {
  test(`${spec[0]} executes the real selector, fails closed and preserves legacy options`, async () => {
    const f = fixture(spec);
    await f.assertSuccess('mapped');
    assert.equal(f.state.mappedReads, 1); assert.equal(f.state.legacyCalls, 0);
    for (const failure of ['missing', 'revoked', 'invalid', 'database']) {
      f.state.headers = failure === 'missing' ? new Headers({ cookie: 'legacy=present' }) : claims();
      f.state.live = failure !== 'revoked'; f.state.broken = failure === 'database';
      f.env.env.COLLAB_AUTH_MODE = failure === 'invalid' ? 'invalid' : 'gateway';
      f.state.effects.length = 0;
      assert.equal((await f.invoke()).status, failure === 'database' ? 500 : 401, failure);
      assert.deepEqual(f.state.effects, []); assert.equal(f.state.legacyCalls, 0);
    }
    f.state.broken = false; f.state.live = true;
    const mappedReads = f.state.mappedReads;
    for (const mode of ['nextauth', undefined]) {
      if (mode) f.env.env.COLLAB_AUTH_MODE = mode; else delete f.env.env.COLLAB_AUTH_MODE;
      f.state.effects.length = 0;
      await f.assertSuccess('legacy');
    }
    assert.equal(f.state.legacyCalls, 2); assert.equal(f.state.mappedReads, mappedReads);
  });
}
