const { test, assert, load } = require('../security/helpers.cjs');
const { NextRequest, NextResponse } = require('next/server');

const { proxy } = load('src/proxy.ts', { 'next/server': { NextResponse }, '@/lib/gateway-identity': { authMode: () => 'local' }, '@/lib/request-session': {} }, { URL, process });

test('invalid Agents paths return 404 before the page can stream', async () => {
  for (const path of ['/team/agents/unknown', '/team/agents/inbox/extra']) {
    const response = await proxy(new NextRequest(`https://collab.test${path}`));
    assert.equal(response.status, 404, path);
    assert.equal(response.headers.get('x-middleware-rewrite'), 'https://collab.test/404');
  }
  for (const path of ['/team/agents', '/team/agents/seats', '/team/agents/inbox', '/team/agents/floor']) {
    const response = await proxy(new NextRequest(`https://collab.test${path}`));
    assert.equal(response.headers.get('x-middleware-next'), '1', path);
  }
});
