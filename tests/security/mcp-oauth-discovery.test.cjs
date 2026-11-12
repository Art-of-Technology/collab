const { assert, test, load } = require('./helpers.cjs');
const { existsSync } = require('node:fs');
const { resolve } = require('node:path');

const ORIGIN = 'https://collab.example.test';
const SCOPES = ['user:read', 'workspace:read', 'projects:read', 'issues:read', 'issues:write', 'context:read', 'context:write', 'prompts:read'];

function fixture(env = { NEXTAUTH_URL: ORIGIN }) {
  const globals = { URL, process: { env } };
  const deps = { 'next/server': { NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200 }) } } };
  const lib = load('src/lib/mcp-oauth.ts', deps, globals);
  deps['@/lib/mcp-oauth'] = lib;
  const route = file => load(`src/app/.well-known/${file}/route.ts`, deps, globals);
  return {
    lib, env,
    server: route('oauth-authorization-server'),
    resource: route('oauth-protected-resource'),
    resourceForPath: route('oauth-protected-resource/api/mcp'),
  };
}

test('the authorization server document names the MCP sign-in endpoints of this deployment', async () => {
  const response = await fixture().server.GET();
  assert.equal(response.status, 200);
  assert.equal(JSON.stringify(response.body), JSON.stringify({
    issuer: ORIGIN,
    authorization_endpoint: `${ORIGIN}/api/oauth/mcp/authorize`,
    token_endpoint: `${ORIGIN}/api/oauth/mcp/token`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: SCOPES,
  }));
});

test('the protected resource document is the same at the root and at the MCP path', async () => {
  const f = fixture();
  const root = await f.resource.GET(), suffixed = await f.resourceForPath.GET();
  assert.equal(root.status, 200);
  assert.equal(JSON.stringify(root.body), JSON.stringify({
    resource: `${ORIGIN}/api/mcp`,
    authorization_servers: [ORIGIN],
    scopes_supported: SCOPES,
    bearer_methods_supported: ['header'],
  }));
  assert.equal(JSON.stringify(suffixed), JSON.stringify(root));
});

test('the issuer is the bare origin whatever path or slash NEXTAUTH_URL carries', async () => {
  for (const configured of [`${ORIGIN}/`, `${ORIGIN}/api/auth`, `${ORIGIN}/?x=1`]) {
    const f = fixture({ NEXTAUTH_URL: configured });
    assert.equal((await f.server.GET()).body.issuer, ORIGIN, configured);
    assert.equal((await f.resource.GET()).body.resource, `${ORIGIN}/api/mcp`, configured);
  }
});

test('the origin is read on each request, never fixed when the module loads', async () => {
  const f = fixture({});
  assert.equal((await f.server.GET()).status, 503);
  f.env.NEXTAUTH_URL = ORIGIN;
  assert.equal((await f.server.GET()).body.issuer, ORIGIN);
});

test('a missing or invalid origin answers 503 and never publishes a broken document', async () => {
  for (const env of [{}, { NEXTAUTH_URL: '' }, { NEXTAUTH_URL: 'not a url' }, { NEXTAUTH_URL: 'collab.example.test' }, { NEXTAUTH_URL: 'file:///tmp/collab' }, { NEXTAUTH_URL: 'ftp://collab.example.test' }, { NEXTAUTH_URL: 'blob:https://collab.example.test/id' }]) {
    const f = fixture(env);
    for (const route of [f.server, f.resource, f.resourceForPath]) {
      const response = await route.GET();
      assert.equal(response.status, 503, JSON.stringify(env));
      assert.doesNotMatch(JSON.stringify(response.body), /undefined|null\/api|endpoint/);
    }
    assert.equal(f.lib.bearerChallenge(), 'Bearer');
  }
});

test('the documents offer no client registration, offline access or revocation', async () => {
  const f = fixture();
  const text = JSON.stringify([(await f.server.GET()).body, (await f.resource.GET()).body]);
  // authorize() rejects offline_access as an unsupported scope, and /api/oauth/revoke never matches system-app tokens.
  assert.doesNotMatch(text, /registration_endpoint|client_id_metadata_document_supported|offline_access|revocation_endpoint/);
});

test('a 401 challenge points at the protected resource document for the MCP path', () => {
  assert.equal(fixture().lib.bearerChallenge(), `Bearer resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource/api/mcp"`);
});

test('the advertised scopes are supported scopes and exactly what the connector app is granted', async () => {
  const { lib } = fixture();
  const { SUPPORTED_SCOPES } = load('src/lib/oauth-scopes.ts', {}, { URL });
  assert.equal(String([...lib.MCP_SCOPES]), String(SCOPES));
  for (const scope of lib.MCP_SCOPES) assert.ok(SUPPORTED_SCOPES.includes(scope), scope);
  // authorize() refuses a request for any scope outside the app's grant, so the two lists must not drift.
  const { definitions } = await import('../../scripts/setup-agent-apps.mjs');
  assert.equal(String(definitions.find(app => app.slug === 'collab-connector').scopes), String([...lib.MCP_SCOPES]));
});

test('the path-specific document is served where the MCP path says', () => {
  const { lib } = fixture();
  assert.equal(lib.MCP_PATH, '/api/mcp');
  const root = process.env.SECURITY_TEST_ROOT || resolve(__dirname, '../../');
  assert.ok(existsSync(resolve(root, `src/app/.well-known/oauth-protected-resource${lib.MCP_PATH}/route.ts`)));
});
