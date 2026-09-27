const { assert, test, load, matches, enums } = require('./helpers.cjs');
const issuer = 'https://identity.example.test/realms/company';
const claims = () => new Headers(Object.fromEntries([
  ['issuer', issuer], ['subject', 'notes-user'], ['email', 'mapped@weezboo.com'],
].map(([key, value]) => [`x-collab-${key}`, Buffer.from(value).toString('base64url')])
  .concat([['x-collab-email-verified', 'true'], ['cookie', 'legacy=present']])));
const cases = [
  ['', 'GET'], ['', 'PATCH'], ['', 'DELETE'], ['pin/', 'POST'],
  ['share/', 'GET'], ['share/', 'POST'], ['share/', 'DELETE'],
  ['comments/[commentId]/', 'GET'], ['comments/[commentId]/', 'PATCH'], ['comments/[commentId]/', 'DELETE'],
];

function fixture([path, method]) {
  const env = { env: { COLLAB_AUTH_MODE: 'gateway', COLLAB_GATEWAY_ISSUER: issuer } };
  const state = { headers: claims(), live: true, broken: false, owner: 'mapped', legacyCalls: 0, mappingReads: 0, effects: [] };
  const options = { fixtureOptions: true };
  const nextAuth = { getServerSession: async (...args) => {
    assert.equal(args.length, 1); assert.equal(args[0], options);
    state.legacyCalls++; return { user: { id: 'legacy' }, expires: 'legacy-expiry' };
  } };
  const record = (name, args) => state.effects.push([name, args]);
  const note = () => ({ id: 'note', authorId: state.owner, scope: 'PERSONAL', type: 'GENERAL',
    workspaceId: null, projectId: null, workspace: null, project: null, sharedWith: [],
    isEncrypted: false, isRestricted: false, expiresAt: null, versioningEnabled: false });
  const comment = () => ({ id: 'comment', noteId: 'note', authorId: state.owner, message: 'Before' });
  const prisma = {
    account: { findUnique: async () => {
      state.mappingReads++;
      if (state.broken) throw new Error('Synthetic mapping failure');
      return state.live ? { user: { id: 'mapped', email: 'mapped@weezboo.com', accounts: [{ id: 'mapping' }] } } : null;
    } },
    note: {
      findUnique: async args => { record('note-read', args); return matches(note(), args.where) ? note() : null; },
      findFirst: async args => { record('note-read', args); return matches(note(), args.where) ? note() : null; },
      update: async args => { record('note-update', args); return { ...note(), ...args.data }; },
      delete: async args => { record('note-delete', args); return note(); },
    },
    noteShare: {
      findMany: async args => { record('shares-read', args); return [{ id: 'share', noteId: 'note', userId: 'target' }]; },
      findUnique: async args => { record('share-read', args); return null; },
      create: async args => { record('share-create', args); return { id: 'share', ...args.data }; },
      delete: async args => { record('share-delete', args); return {}; },
    },
    comment: {
      findFirst: async args => { record('comment-read', args); return matches(comment(), args.where) ? comment() : null; },
      update: async args => { record('comment-update', args); return { ...comment(), ...args.data }; },
      delete: async args => { record('comment-delete', args); return comment(); },
    },
  };
  const identity = load('src/lib/gateway-identity.ts', { 'node:crypto': require('node:crypto') }, { process: env, Buffer, TextDecoder, URL });
  const adapter = load('src/lib/request-session.ts', { 'server-only': {}, './gateway-identity': identity,
    'next-auth': nextAuth, 'next/headers': { headers: async () => state.headers }, '@/lib/prisma': { prisma } }, { process: env });
  const access = load('src/lib/secrets/access.ts', { '@/lib/prisma': { prisma }, '@prisma/client': enums,
    '@/lib/issue-finder': { userHasWorkspaceAccess: async () => assert.fail('No workspace in personal-note fixture') } });
  const route = load(`src/app/api/notes/[id]/${path}route.ts`, {
    '@/lib/request-session': adapter, 'next-auth': nextAuth, '@/lib/auth-options': { authOptions: options },
    'next/server': { NextResponse: Response }, '@/lib/prisma': { prisma }, '@prisma/client': enums,
    '@/lib/secrets/access': access, '@/lib/secrets/crypto': { isSecretNoteType: () => false },
    '@/lib/versioning': {}, '@/lib/event-bus': {},
  }, { URL, console: { error() {} } });
  const invoke = () => route[method](new Request('https://example.test/api/notes/note?userId=target', {
    method, headers: { cookie: 'legacy=present' }, ...(['POST', 'PATCH'].includes(method) ? {
      body: JSON.stringify({ pin: true, isFavorite: true, userId: 'target', permission: 'EDIT', message: 'After', html: '<p>After</p>' }),
    } : {}),
  }), { params: Promise.resolve({ id: 'note', commentId: 'comment' }) });
  async function success(actor) {
    state.owner = actor; state.effects.length = 0;
    const response = await invoke();
    assert.equal(response.status, path === 'share/' && method === 'POST' ? 201 : 200);
    const result = await response.json();
    if (!path && method === 'GET') assert.equal(result._permissions.isOwner, true);
    if (!path && method === 'PATCH') assert.equal(result.isFavorite, true);
    if (path === 'pin/') { assert.equal(result.isPinned, true); assert.equal(result.note.pinnedBy, actor); }
    if (path === 'share/' && method === 'POST') {
      assert.equal(result.sharedBy, actor); assert.equal(result.userId, 'target'); assert.equal(result.permission, 'EDIT');
    }
    if (path === 'share/' && method === 'GET') assert.equal(result[0].noteId, 'note');
    if (path.startsWith('comments/') && method !== 'DELETE') {
      assert.equal(result.noteId, 'note'); assert.equal(result.authorId, actor);
      if (method === 'PATCH') assert.equal(result.message, 'After');
    }
    if (method === 'DELETE') assert.match(result.message, /successfully/);
    if (method !== 'GET') assert.ok(state.effects.some(([name]) => /-(update|create|delete)$/.test(name)));
  }
  return { state, env, invoke, success };
}

test('legacy personal-note detail remains a legitimate control', async () => {
  const f = fixture(cases[0]); f.env.env.COLLAB_AUTH_MODE = 'nextauth';
  await f.success('legacy'); assert.equal(f.state.legacyCalls, 1); assert.equal(f.state.mappingReads, 0);
});

for (const spec of cases) test(`${spec[0] || 'detail/'} ${spec[1]} binds mapped actor and preserves legacy behavior`, async () => {
  const f = fixture(spec);
  await f.success('mapped'); assert.equal(f.state.mappingReads, 1); assert.equal(f.state.legacyCalls, 0);
  f.state.owner = 'foreign'; f.state.effects.length = 0;
  assert.equal((await f.invoke()).status, 404);
  assert.ok(f.state.effects.every(([name]) => name === 'note-read'));
  for (const failure of ['missing', 'revoked', 'invalid', 'database']) {
    f.state.headers = failure === 'missing' ? new Headers({ cookie: 'legacy=present' }) : claims();
    f.state.live = failure !== 'revoked'; f.state.broken = failure === 'database';
    f.env.env.COLLAB_AUTH_MODE = failure === 'invalid' ? 'invalid' : 'gateway';
    f.state.effects.length = 0;
    assert.equal((await f.invoke()).status, failure === 'database' ? 500 : 401, failure);
    assert.deepEqual(f.state.effects, []); assert.equal(f.state.legacyCalls, 0);
  }
  f.state.broken = false; f.state.live = true;
  const mappingReads = f.state.mappingReads;
  for (const mode of ['nextauth', undefined]) {
    if (mode) f.env.env.COLLAB_AUTH_MODE = mode; else delete f.env.env.COLLAB_AUTH_MODE;
    await f.success('legacy');
  }
  assert.equal(f.state.legacyCalls, 2); assert.equal(f.state.mappingReads, mappingReads);
});
