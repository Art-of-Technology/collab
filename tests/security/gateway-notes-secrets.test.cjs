const { assert, test, load, matches } = require('./helpers.cjs');
const issuer = 'https://identity.example.test/realms/company';
const claims = () => new Headers(Object.fromEntries([
  ['issuer', issuer], ['subject', 'secrets-user'], ['email', 'mapped@weezboo.com'],
].map(([key, value]) => [`x-collab-${key}`, Buffer.from(value).toString('base64url')])
  .concat([['x-collab-email-verified', 'true'], ['cookie', 'legacy=present']])));
const cases = [['audit-log', 'GET'], ['copy', 'POST'], ['export', 'GET'], ['reveal', 'POST']];

function fixture([path, method]) {
  const env = { env: { COLLAB_AUTH_MODE: 'gateway', COLLAB_GATEWAY_ISSUER: issuer } };
  const state = { headers: claims(), live: true, broken: false, owner: 'mapped', enabled: true,
    legacyCalls: 0, mappingReads: 0, effects: [] };
  const options = { fixtureOptions: true };
  const nextAuth = { getServerSession: async (...args) => {
    assert.equal(args.length, 1); assert.equal(args[0], options);
    state.legacyCalls++; return { user: { id: 'legacy' }, expires: 'legacy-expiry' };
  } };
  const record = (name, args) => state.effects.push([name, args]);
  const note = () => ({ id: 'note', title: 'Fixture', authorId: state.owner, scope: 'WORKSPACE',
    workspaceId: 'workspace', projectId: null, sharedWith: [], isRestricted: false,
    isEncrypted: true, expiresAt: null, secretVariables: JSON.stringify([{ key: 'FIXTURE', value: 'synthetic-ciphertext' }]) });
  const prisma = {
    account: { findUnique: async () => {
      state.mappingReads++; if (state.broken) throw new Error('Synthetic mapping failure');
      return state.live ? { user: { id: 'mapped', email: 'mapped@weezboo.com', accounts: [{ id: 'mapping' }] } } : null;
    } },
    note: { findUnique: async args => { record('note-read', args); return matches(note(), args.where) ? note() : null; } },
    workspace: { findFirst: async args => {
      record('workspace-read', args); const row = { id: 'workspace', ownerId: state.owner, members: [] };
      return matches(row, args.where) ? row : null;
    } },
    workspaceMember: { findUnique: async args => { record('member-read', args); return null; } },
    noteActivityLog: {
      create: async args => { record('audit-create', args); return { id: 'log', ...args.data }; },
      findMany: async args => { record('audit-read', args); assert.equal(args.where.noteId, 'note');
        return [{ id: 'log', action: 'REVEAL', details: '{}', user: { id: state.owner } }]; },
      count: async args => { record('audit-count', args); assert.equal(args.where.noteId, 'note'); return 1; },
    },
  };
  const identity = load('src/lib/gateway-identity.ts', { 'node:crypto': require('node:crypto') }, { process: env, Buffer, TextDecoder, URL });
  const adapter = load('src/lib/request-session.ts', { 'server-only': {}, './gateway-identity': identity,
    'next-auth': nextAuth, 'next/headers': { headers: async () => state.headers }, '@/lib/prisma': { prisma } }, { process: env });
  const access = load('src/lib/secrets/access.ts', { '@/lib/prisma': { prisma }, '@prisma/client': require('@prisma/client'),
    '@/lib/issue-finder': load('src/lib/issue-finder.ts', { '@/lib/prisma': { prisma } }) });
  const crypto = {
    isSecretsEnabled: () => { record('enabled', {}); return state.enabled; },
    decryptVariables: (values, workspace) => {
      record('decrypt', { values, workspace }); assert.equal(workspace, 'workspace');
      assert.equal(values[0].value, 'synthetic-ciphertext');
      return [{ key: 'FIXTURE', value: 'synthetic-plaintext', masked: true }];
    },
    decryptRawContent: () => assert.fail('Raw mode is outside this fixture'),
    toEnvContent: () => assert.fail('ENV format is outside this fixture'),
  };
  const route = load(`src/app/api/notes/[id]/secrets/${path}/route.ts`, {
    '@/lib/request-session': adapter, 'next-auth': nextAuth, '@/lib/auth-options': { authOptions: options },
    'next/server': { NextResponse: Response }, '@/lib/prisma': { prisma },
    '@/lib/secrets/access': access, '@/lib/secrets/crypto': crypto,
  }, { URL, console: { error() {} } });
  const invoke = () => route[method](new Request('https://example.test/api/notes/note?format=json', {
    method, headers: { cookie: 'legacy=present' }, ...(method === 'POST' ? { body: JSON.stringify({ key: 'FIXTURE', keys: ['FIXTURE'] }) } : {}),
  }), { params: Promise.resolve({ id: 'note' }) });
  async function success(actor) {
    state.owner = actor; state.effects.length = 0;
    const response = await invoke(); assert.equal(response.status, 200); const result = await response.json();
    if (path === 'audit-log') {
      assert.equal(result.total, 1); assert.equal(result.hasMore, false); assert.equal(result.logs[0].user.id, actor);
      assert.equal(state.effects.find(([name]) => name === 'member-read')[1].where.userId_workspaceId.userId, actor);
    } else {
      const audit = state.effects.find(([name]) => name === 'audit-create')[1].data;
      assert.equal(audit.noteId, 'note'); assert.equal(audit.userId, actor); assert.equal(audit.action, path.toUpperCase());
      if (path === 'copy') assert.equal(result.success, true);
      if (path === 'reveal') assert.equal(result.variables[0].value, 'synthetic-plaintext');
      if (path === 'export') {
        assert.equal(result.FIXTURE, 'synthetic-plaintext'); assert.match(response.headers.get('cache-control'), /no-store/);
        assert.match(response.headers.get('content-disposition'), /Fixture\.json/);
      }
    }
  }
  return { state, env, invoke, success };
}

test('legacy note audit remains a legitimate control', async () => {
  const f = fixture(cases[0]); f.env.env.COLLAB_AUTH_MODE = 'nextauth';
  await f.success('legacy'); assert.equal(f.state.legacyCalls, 1); assert.equal(f.state.mappingReads, 0);
});

for (const spec of cases) test(`${spec.join(' ')} binds actor, preserves denial audit and legacy behavior`, async () => {
  const f = fixture(spec);
  await f.success('mapped'); assert.equal(f.state.mappingReads, 1); assert.equal(f.state.legacyCalls, 0);
  f.state.owner = 'foreign'; f.state.effects.length = 0;
  assert.equal((await f.invoke()).status, spec[0] === 'audit-log' ? 404 : 403);
  assert.ok(f.state.effects.every(([name]) => ['note-read', 'workspace-read', 'enabled', 'audit-create'].includes(name)));
  const denied = f.state.effects.filter(([name]) => name === 'audit-create');
  assert.equal(denied.length, spec[0] === 'audit-log' ? 0 : 1);
  if (denied.length) { assert.equal(denied[0][1].data.userId, 'mapped'); assert.equal(denied[0][1].data.action, 'ACCESS_DENIED'); }
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
