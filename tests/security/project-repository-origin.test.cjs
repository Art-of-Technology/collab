const { assert, test, load } = require('./helpers.cjs');
const zod = require('zod');

function fixture(publicUrl, requestUrl, origin, extraHeaders = {}, repositories = [{ id: 'repo' }]) {
  const writes = [];
  const prisma = {
    project: {
      findFirst: async () => ({ id: 'project', workspaceId: 'workspace', workspace: { ownerId: 'user' } }),
      update: async args => { writes.push(args); },
    },
    $transaction: async fn => fn(prisma),
  };
  const dependencies = {
    zod, 'next/server': { NextResponse: { json: (body, options) => ({ body, ...options }) } },
    '@/lib/prisma': { prisma }, '@/lib/session': { getCurrentUser: async () => ({ id: 'user' }) },
    '@/lib/post-access': { postWorkspaceAccessWhere: () => ({}) },
    '@/lib/permissions': { Permission: { MANAGE_AGENTS: 'manage' }, checkUserPermission: async () => ({ hasPermission: true }) },
    '@/lib/agent-repository': {
      holdProjectDefault: async () => {},
      projectRepositoryState: async () => ({ repositories }),
      repositoryAddress: value => new URL(value),
    },
    '@/lib/encryption': {},
    '@/lib/git-providers/client': { providerSchema: zod.enum(['github']), ProviderError: class extends Error {},
      resolveInstance: () => ({}), listRepositories: async () => { writes.push('provider request'); return { repositories: [] }; } },
  };
  const globals = { URL, Date, process: { env: publicUrl ? { NEXTAUTH_URL: publicUrl } : {} } };
  const context = { params: Promise.resolve({ projectId: 'project' }) };
  const request = body => ({ url: requestUrl, headers: new Headers({ ...extraHeaders, ...(origin === undefined ? {} : { origin }) }), json: async () => body });
  return {
    writes,
    save: () => load('src/app/api/projects/[projectId]/agent-repository/route.ts', dependencies, globals).PATCH(request({ repositoryId: 'repo' }), context),
    saveAddress: () => load('src/app/api/projects/[projectId]/agent-repository/route.ts', dependencies, globals).PATCH(request({ url: 'https://github.com/Acme-C6/walletserviceendpoint' }), context),
    connect: () => load('src/app/api/projects/[projectId]/git-connections/route.ts', dependencies, globals).POST(request({ action: 'list', provider: 'github', baseUrl: 'https://github.com', credentials: { token: 'fixture' } }), context),
  };
}

for (const operation of ['save', 'connect']) {
  test(`${operation}: configured public origin works behind an internal HTTP proxy`, async () => {
    const f = fixture('https://collab.weez.boo', 'http://0.0.0.0:3000/api/projects/p', 'https://collab.weez.boo');
    assert.equal((await f[operation]()).status, 200);
    assert.equal(f.writes.length, 1);
  });
  test(`${operation}: foreign, missing, null, and internal origins cannot write or spend provider credentials`, async () => {
    for (const origin of ['https://evil.test', undefined, 'null', 'http://0.0.0.0:3000', 'https://collab.weez.boo.evil.test']) {
      const f = fixture('https://collab.weez.boo', 'http://0.0.0.0:3000/api/projects/p', origin,
        { host: 'evil.test', 'x-forwarded-host': 'evil.test', 'x-forwarded-proto': 'https' });
      assert.equal((await f[operation]()).status, 403);
      assert.equal(f.writes.length, 0);
    }
  });
  test(`${operation}: unconfigured development uses exact request origin`, async () => {
    const allowed = fixture(undefined, 'http://localhost:3000/api', 'http://localhost:3000');
    assert.equal((await allowed[operation]()).status, 200);
    const denied = fixture(undefined, 'http://localhost:3000/api', 'http://localhost:3001');
    assert.equal((await denied[operation]()).status, 403);
    assert.equal(denied.writes.length, 0);
  });
}


test('typed repository address saves from the public origin behind the proxy', async () => {
  const f = fixture('https://collab.weez.boo', 'http://0.0.0.0:3000/api/projects/p', 'https://collab.weez.boo', {}, []);
  assert.equal((await f.saveAddress()).status, 200);
  assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0].data.agentRepositoryUrl, 'https://github.com/Acme-C6/walletserviceendpoint');
});
