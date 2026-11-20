const { assert, test, load } = require('./helpers.cjs');

test('removed notes routes return 404 before authentication for every method', async () => {
  let authCalls = 0;
  class NextResponse extends Response {
    static next() { return new NextResponse(null, { status: 200 }); }
  }
  const { proxy } = load('src/proxy.ts', {
    'next/server': { NextResponse },
    '@/lib/gateway-identity': { authMode: () => { authCalls++; return 'invalid'; } },
    '@/lib/request-session': {},
  }, { process: { env: {} } });

  for (const path of ['pinned', 'search', 'shared-with-me', '%70inned']) {
    for (const method of ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
      const response = await proxy({ nextUrl: new URL(`https://example.test/api/notes/${path}?q=x`), method });
      assert.equal(response.status, 404, `${method} ${path}`);
    }
  }
  assert.equal(authCalls, 0);
  const response = await proxy({ nextUrl: new URL('https://example.test/api/notes/note'), method: 'GET' });
  assert.equal(response.status, 503);
  assert.equal(authCalls, 1);
});
