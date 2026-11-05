const { test, assert, load } = require('./helpers.cjs');

const next = { NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200 }) } };
const scopeModule = load('src/lib/oauth-scopes.ts');
const workspace = { id: 'workspace', slug: 'workspace', name: 'Workspace' };
const app = { id: 'app', slug: 'app', name: 'CLI', status: 'PUBLISHED', isSystemApp: true, scopes: [{ scope: 'issues:read' }] };
const token = { id: 'token', accessToken: Buffer.from('bearer').toString('base64'), userId: 'alice', scopes: ['issues:read'], app, workspace, installation: null };
const failure = (code, property = 'code') => Object.assign(new Error('private database detail'), { [property]: code });

function fixture({ rows = [token], scanError, userError, workspaceError, decrypt, appError, workspaceErrors = {}, handlerError } = {}) {
  const logs = [];
  let calls = 0, workspaceCalls = 0;
  const prisma = {
    appToken: { findMany: async ({ where }) => {
      assert.equal(where.isRevoked, false);
      if (scanError) throw scanError;
      return rows.filter(row => !row.isRevoked);
    } },
    user: { findUnique: async () => { if (userError) throw userError; return { id: 'alice', name: 'Alice', email: null }; } },
    app: { findUnique: async () => { if (appError) throw appError; return { isSystemApp: true }; } },
    workspace: { findFirst: async () => {
      workspaceCalls++;
      if (workspaceError) throw workspaceError;
      if (workspaceErrors[workspaceCalls]) throw workspaceErrors[workspaceCalls];
      return workspaceCalls === 1 ? workspace : { id: 'other', slug: 'other', name: 'Other' };
    } },
  };
  const auth = load('src/lib/apps/auth-middleware.ts', {
    'next/server': next, '@/lib/prisma': { prisma }, '@/lib/oauth-scopes': scopeModule,
    '@/lib/post-access': load('src/lib/post-access.ts'),
    '@/lib/apps/crypto': { decryptToken: decrypt || (async value => String(value)) },
  }, { Buffer, URL, console: { error: (...args) => logs.push(args), warn: (...args) => logs.push(args), log() {} } });
  const handler = auth.withAppAuth(async (_req, context) => { calls++; if (handlerError) throw handlerError; return { status: 200, userId: context.user.id, workspaceId: context.workspace.id }; });
  return { invoke: (bearer = 'bearer', query = '') => handler({ url: 'https://example.test/api/issues' + query, headers: new Headers(bearer === null ? {} : { Authorization: `Bearer ${bearer}` }) }), logs, calls: () => calls };
}

const regularToken = { ...token, app: null, workspace: null, installation: {
  id: 'installation', appId: app.id, workspaceId: workspace.id, installedById: 'alice', status: 'ACTIVE',
  scopes: ['issues:read'], app: { ...app, isSystemApp: false }, workspace,
} };

for (const [label, options] of [
  ['token lookup', { scanError: failure('P2024') }],
  ['installed token user lookup', { rows: [regularToken], userError: failure('P2024') }],
  ['workspace access lookup', { workspaceError: failure('P2024') }],
  ['database initialization', { scanError: failure('P1001', 'errorCode') }],
]) {
  test(`${label}: transient database failure is a sanitized 503, never a 401`, async () => {
    const f = fixture(options); const response = await f.invoke();
    assert.equal(response.status, 503);
    assert.equal(response.body.error, 'temporarily_unavailable');
    assert.equal(response.body.error_description, 'Authentication is temporarily unavailable');
    assert.equal(f.calls(), 0);
    assert.match(JSON.stringify(f.logs), /P2024|P1001/);
    assert.doesNotMatch(JSON.stringify([response, f.logs]), /private database detail/);
  });
}

test('unexpected database errors return sanitized 500 instead of invalid token', async () => {
  const f = fixture({ scanError: failure('P9999') }); const response = await f.invoke();
  assert.equal(response.status, 500); assert.equal(response.body.error, 'server_error');
  assert.equal(f.calls(), 0); assert.doesNotMatch(JSON.stringify([response, f.logs]), /private database detail/);
});

test('missing, invalid, and revoked credentials remain unauthorized', async () => {
  for (const [options, bearer] of [[{}, null], [{}, 'wrong'], [{ rows: [{ ...token, isRevoked: true }] }, 'bearer']]) {
    const f = fixture(options); assert.equal((await f.invoke(bearer)).status, 401); assert.equal(f.calls(), 0);
  }
});

test('valid system and installed tokens still reach the handler', async () => {
  for (const rows of [[token], [regularToken]]) {
    const f = fixture({ rows }); const response = await f.invoke();
    assert.equal(response.status, 200); assert.equal(response.userId, 'alice'); assert.equal(f.calls(), 1);
  }
});

test('a corrupt encrypted token does not prevent another valid token from authenticating', async () => {
  const corrupt = { ...token, id: 'corrupt', accessToken: Buffer.from('bad').toString('base64') };
  const f = fixture({ rows: [corrupt, token], decrypt: async value => {
    if (String(value) === 'bad') throw new Error('private token detail');
    return String(value);
  } });
  assert.equal((await f.invoke()).status, 200);
  assert.doesNotMatch(JSON.stringify(f.logs), /private token detail/);
});

test('missing or malformed encryption key is a server error, not an invalid credential', async () => {
  for (const key of [undefined, 'too-short']) {
    const crypto = load('src/lib/apps/crypto.ts', { crypto: require('node:crypto'), util: require('node:util'), bcrypt: {} }, { Buffer, process: { env: { APP_TOKENS_KEY: key } }, console });
    const f = fixture({ decrypt: crypto.decryptToken });
    const result = await f.invoke();
    assert.equal(result.status, 500);
    assert.equal(result.body.error, 'server_error');
    assert.equal(f.calls(), 0);
    assert.doesNotMatch(JSON.stringify([result, f.logs]), /too-short|APP_TOKENS_KEY/);
  }
});

for (const [label, options] of [
  ['app lookup', { appError: failure('P2024') }],
  ['target workspace lookup', { workspaceErrors: { 2: failure('P2024') } }],
  ['target workspace access lookup', { workspaceErrors: { 3: failure('P2024') } }],
]) {
  test(`workspace switch ${label}: transient failure is a sanitized 503`, async () => {
    const f = fixture(options); const response = await f.invoke('bearer', '?workspace=other');
    assert.equal(response.status, 503); assert.equal(response.body.error, 'temporarily_unavailable');
    assert.equal(f.calls(), 0); assert.match(JSON.stringify(f.logs), /P2024/);
    assert.doesNotMatch(JSON.stringify([response, f.logs]), /private database detail/);
  });
}

test('workspace switch unknown database errors are sanitized 500', async () => {
  const f = fixture({ appError: failure('P9999') }); const response = await f.invoke('bearer', '?workspace=other');
  assert.equal(response.status, 500); assert.equal(response.body.error, 'server_error');
  assert.equal(f.calls(), 0); assert.doesNotMatch(JSON.stringify([response, f.logs]), /private database detail/);
});

test('workspace switch succeeds and does not swallow handler failures', async () => {
  const f = fixture(); const response = await f.invoke('bearer', '?workspace=other');
  assert.equal(response.status, 200); assert.equal(response.workspaceId, 'other');
  const handlerError = failure('P2024');
  const broken = fixture({ handlerError });
  await assert.rejects(broken.invoke('bearer', '?workspace=other'), error => error === handlerError);
});
