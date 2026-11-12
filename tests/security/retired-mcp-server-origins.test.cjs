const { assert, test, load } = require('./helpers.cjs');

// The external MCP server at mcp-collab.weez.boo is retired: it is no longer an implicit frame origin
// and its web origins no longer get cross-origin access to the token endpoint.

async function frameSources(env = {}) {
  class NextResponse {
    constructor(body, init) { this.body = body; this.status = init?.status ?? 200; this.headers = new Headers(init?.headers); }
    static next() { return new NextResponse(null); }
  }
  const { proxy } = load('src/proxy.ts', {
    'next/server': { NextResponse },
    '@/lib/gateway-identity': { authMode: () => 'nextauth', gatewayMutationAllowed: () => true, readGatewayIdentity: () => null },
    '@/lib/request-session': { getGatewaySession: async () => null },
  }, { process: { env }, URL });
  const response = await proxy({ method: 'GET', headers: new Headers({ accept: 'text/html' }), nextUrl: { pathname: '/' } });
  return response.headers.get('content-security-policy').split('; ').find(directive => directive.startsWith('frame-src '));
}

test('pages may frame only this site and the origins listed in CSP_FRAME_SRC', async () => {
  assert.equal(await frameSources(), "frame-src 'self'");
  assert.equal(await frameSources({ CSP_FRAME_SRC: 'https://apps.example.test https://other.example.test' }), "frame-src 'self' https://apps.example.test https://other.example.test");
  assert.equal(await frameSources({ MCP_SERVER_URL: 'https://uat-mcp-collab.weez.boo' }), "frame-src 'self'", 'the old server variable no longer adds frame origins');
});

function tokenRoute() {
  class NextResponse {
    constructor(body, init) { this.body = body; this.status = init?.status ?? 200; this.headers = new Headers(init?.headers); }
    static json(body, init) { return new NextResponse(body, init); }
  }
  return load('src/app/api/oauth/token/route.ts', {
    'next/server': { NextResponse }, crypto: require('node:crypto'), '@/lib/prisma': { prisma: {} },
    '@/lib/oauth-scopes': load('src/lib/oauth-scopes.ts', {}, { URL }), '@/lib/post-access': load('src/lib/post-access.ts'),
    '@/lib/apps/crypto': {}, '@/lib/apps/jwt-assertion': {}, '@/lib/apps/webhook-auto-creation': {},
  }, { URL, Buffer, process: { env: {} }, console: { error() {}, log() {}, warn() {} } });
}

test('the token endpoint no longer grants cross-origin access to the retired MCP server origins', async () => {
  const { OPTIONS } = tokenRoute();
  const allowed = async origin => (await OPTIONS({ headers: new Headers({ origin }) })).headers.get('access-control-allow-origin');
  for (const origin of ['https://mcp-collab.weez.boo', 'https://dev-mcp-collab.weez.boo', 'https://uat-mcp-collab.weez.boo']) {
    assert.notEqual(await allowed(origin), origin, origin);
  }
  for (const origin of ['http://localhost:3001', 'http://localhost:3002']) assert.equal(await allowed(origin), origin, 'local development origins keep working');
  assert.doesNotMatch(await allowed('https://attacker.example'), /attacker|mcp-collab/);
});
