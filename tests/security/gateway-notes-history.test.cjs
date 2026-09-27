const { assert, test, load, matches, enums } = require('./helpers.cjs');
const issuer = 'https://identity.example.test/realms/company';
const claims = () => new Headers(Object.fromEntries([
  ['issuer', issuer], ['subject', 'notes-user'], ['email', 'mapped@weezboo.com'],
].map(([key, value]) => [`x-collab-${key}`, Buffer.from(value).toString('base64url')])
  .concat([['x-collab-email-verified', 'true'], ['cookie', 'legacy=present']])));
const cases = [['versions', 'GET'], ['versions/[version]', 'GET'], ['versions/[version]', 'POST'],
  ['versions/compare', 'GET'], ['save-as-template', 'POST']];

function fixture([path, method]) {
  const env = { env: { COLLAB_AUTH_MODE: 'gateway', COLLAB_GATEWAY_ISSUER: issuer } };
  const state = { headers: claims(), live: true, broken: false, owner: 'mapped', sharedWith: [],
    legacyCalls: 0, mappingReads: 0, effects: [] };
  const options = { fixtureOptions: true };
  const nextAuth = { getServerSession: async (...args) => {
    assert.equal(args.length, 1); assert.equal(args[0], options);
    state.legacyCalls++; return { user: { id: 'legacy' }, expires: 'legacy-expiry' };
  } };
  const record = (name, args) => state.effects.push([name, args]);
  const note = () => ({ id: 'note', title: 'Current', content: 'Current body', authorId: state.owner,
    scope: 'PERSONAL', type: 'GENERAL', workspaceId: 'workspace', projectId: null,
    isEncrypted: false, isRestricted: false, expiresAt: null, sharedWith: state.sharedWith,
    version: 2, versioningEnabled: true });
  const versions = [1, 2].map(version => ({ id: `v${version}`, noteId: 'note', version,
    title: `Title ${version}`, content: `Body ${version}`, author: { id: 'old-author' }, changeType: 'EDIT' }));
  const prisma = {
    account: { findUnique: async () => {
      state.mappingReads++; if (state.broken) throw new Error('Synthetic mapping failure');
      return state.live ? { user: { id: 'mapped', email: 'mapped@weezboo.com', accounts: [{ id: 'mapping' }] } } : null;
    } },
    workspace: { findFirst: async args => {
      record('workspace-read', args); const row = { id: 'workspace', ownerId: state.owner, members: [] };
      return matches(row, args.where) ? row : null;
    } },
    note: {
      findUnique: async args => { record('note-read', args); return matches(note(), args.where) ? note() : null; },
      findFirst: async args => { record('note-read', args); return matches(note(), args.where) ? note() : null; },
      update: async args => { record('note-update', args); return { ...note(), ...args.data }; },
    },
    noteTemplate: {
      findFirst: async args => { record('template-read', args); return null; },
      create: async args => { record('template-create', args); return { id: 'template', ...args.data }; },
    },
  };
  const identity = load('src/lib/gateway-identity.ts', { 'node:crypto': require('node:crypto') }, { process: env, Buffer, TextDecoder, URL });
  const adapter = load('src/lib/request-session.ts', { 'server-only': {}, './gateway-identity': identity,
    'next-auth': nextAuth, 'next/headers': { headers: async () => state.headers }, '@/lib/prisma': { prisma } }, { process: env });
  const finder = load('src/lib/issue-finder.ts', { '@/lib/prisma': { prisma } });
  const access = load('src/lib/secrets/access.ts', { '@/lib/prisma': { prisma }, '@prisma/client': enums, '@/lib/issue-finder': finder });
  const versioning = {
    getVersionHistory: async (id, options) => { record('history', { id, options }); assert.equal(id, 'note'); return { versions, total: 2, hasMore: false }; },
    getVersion: async (id, version) => { record('version', { id, version }); assert.equal(id, 'note'); return versions.find(row => row.version === version); },
    compareVersions: (from, to) => { record('compare', { from, to }); return { additions: 1, deletions: 1 }; },
    restoreVersion: async (...args) => { record('restore', args); return { id: 'restored', version: 3 }; },
  };
  const route = load(`src/app/api/notes/[id]/${path}/route.ts`, {
    '@/lib/request-session': adapter, 'next-auth': nextAuth, '@/lib/auth-options': { authOptions: options },
    'next/server': { NextResponse: Response }, '@/lib/prisma': { prisma }, '@prisma/client': enums,
    '@/lib/secrets/access': access, '@/lib/issue-finder': finder, '@/lib/versioning': versioning, zod: require('zod'),
  }, { URL, console: { error() {} } });
  const invoke = () => route[method](new Request('https://example.test/api/notes/note?from=1&to=2', {
    method, headers: { cookie: 'legacy=present' }, ...(method === 'POST' ? { body: JSON.stringify({ name: 'Saved', comment: 'Restore now' }) } : {}),
  }), { params: Promise.resolve({ id: 'note', version: '1' }) });
  async function success(actor, editor = false) {
    state.owner = editor ? 'foreign' : actor;
    state.sharedWith = editor ? [{ userId: actor, permission: 'EDIT' }] : []; state.effects.length = 0;
    const response = await invoke(); assert.equal(response.status, path === 'save-as-template' ? 201 : 200);
    const result = await response.json();
    if (path === 'versions') { assert.equal(result.total, 2); assert.equal(result.versions.length, 2); assert.equal(result.currentVersion, 2); }
    else if (path === 'versions/compare') { assert.equal(result.from.version, 1); assert.equal(result.to.version, 2); assert.equal(result.diff.titleChanged, true); }
    else if (path === 'save-as-template') { assert.equal(result.template.authorId, actor); assert.equal(result.template.workspaceId, 'workspace'); assert.equal(result.template.contentTemplate, 'Current body'); }
    else if (method === 'GET') assert.equal(result.id, 'v1');
    else {
      assert.equal(result.newVersion, 3); assert.equal(result.versionId, 'restored');
      assert.deepEqual(state.effects.find(([name]) => name === 'restore')[1], ['note', 1, actor, 'Restore now']);
      assert.ok(state.effects.some(([name, args]) => name === 'note-update' && args.data.content === 'Body 1'));
    }
  }
  return { state, env, invoke, success };
}

test('legacy version history remains a legitimate control', async () => {
  const f = fixture(cases[0]); f.env.env.COLLAB_AUTH_MODE = 'nextauth';
  await f.success('legacy'); assert.equal(f.state.legacyCalls, 1); assert.equal(f.state.mappingReads, 0);
});

for (const spec of cases) test(`${spec.join(' ')} binds mapped actor and preserves legacy behavior`, async () => {
  const f = fixture(spec);
  await f.success('mapped'); assert.equal(f.state.mappingReads, 1); assert.equal(f.state.legacyCalls, 0);
  if (spec[0] === 'versions/[version]' && spec[1] === 'POST') await f.success('mapped', true);
  f.state.owner = 'foreign'; f.state.sharedWith = []; f.state.effects.length = 0;
  assert.equal((await f.invoke()).status, 404);
  assert.ok(f.state.effects.every(([name]) => ['note-read', 'workspace-read'].includes(name)));
  for (const failure of ['missing', 'revoked', 'invalid', 'database']) {
    f.state.headers = failure === 'missing' ? new Headers({ cookie: 'legacy=present' }) : claims();
    f.state.live = failure !== 'revoked'; f.state.broken = failure === 'database';
    f.env.env.COLLAB_AUTH_MODE = failure === 'invalid' ? 'invalid' : 'gateway'; f.state.effects.length = 0;
    assert.equal((await f.invoke()).status, failure === 'database' ? 500 : 401, failure);
    assert.deepEqual(f.state.effects, []); assert.equal(f.state.legacyCalls, 0);
  }
  f.state.broken = false; f.state.live = true; const reads = f.state.mappingReads;
  for (const mode of ['nextauth', undefined]) {
    if (mode) f.env.env.COLLAB_AUTH_MODE = mode; else delete f.env.env.COLLAB_AUTH_MODE;
    await f.success('legacy');
  }
  assert.equal(f.state.legacyCalls, 2); assert.equal(f.state.mappingReads, reads);
});
