const { assert, test, load } = require('../security/helpers.cjs');
const { PrismaClient } = require('@prisma/client');
const crypto = require('node:crypto');
const z = require('zod');

const url = process.env.COLLAB_GIT_TEST_DATABASE_URL;
test('Git connection API lifecycle persists through PostgreSQL without changing legacy GitHub data', { skip: !url }, async () => {
  // This test owns only its uniquely named fixture rows, never a shared schema.
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const suffix = crypto.randomUUID();
  const user = await prisma.user.create({ data: { name: 'Git provider fixture ' + suffix, expertise: [] } });
  const other = await prisma.user.create({ data: { name: 'Foreign fixture ' + suffix, expertise: [] } });
  const workspace = await prisma.workspace.create({ data: { name: suffix, slug: suffix, ownerId: user.id } });
  const project = await prisma.project.create({ data: { name: suffix, slug: suffix, issuePrefix: 'GIT', workspaceId: workspace.id } });
  let actor = user, remoteId = 'repo-1', effects = 0;
  const globals = { URL, Buffer, Date, process: { env: { ENCRYPTION_KEY: 'X7!kPd4@vL9#qR2$wN6%aB8&zC3*mF5+' } }, console: { error() {} } };
  const encryption = load('src/lib/encryption.ts', { crypto: { default: crypto } }, globals).EncryptionService;
  class ProviderError extends Error {}
  const providers = {
    providerSchema: z.enum(['github', 'forgejo', 'gitlab', 'bitbucket', 'bitbucket-dc']), ProviderError,
    instances: () => [{ provider: 'forgejo', baseUrl: 'https://forge.test', label: 'Fixture' }],
    resolveInstance: (provider, baseUrl) => ({ provider, baseUrl }),
    getRepository: async () => { effects++; return { id: remoteId, path: 'team/repo', name: 'repo', url: 'https://forge.test/team/repo' }; },
    getActivity: async () => [{ id: 'sha-1', kind: 'commit', title: 'Fixture activity', url: 'https://forge.test/team/repo/commit/sha-1', date: '2026-10-21T10:00:00Z' }],
  };
  const route = load('src/app/api/projects/[projectId]/git-connections/route.ts', {
    'next/server': { NextResponse: { json: (body, options) => ({ body, ...options }) } }, zod: z,
    '@/lib/prisma': { prisma }, '@/lib/session': { getCurrentUser: async () => actor },
    '@/lib/post-access': load('src/lib/post-access.ts'), '@/lib/encryption': { EncryptionService: encryption },
    '@/lib/git-providers/client': providers,
  }, globals);
  const request = body => ({ url: 'https://collab.test/api/projects/' + project.id + '/git-connections', headers: new Headers({ origin: 'https://collab.test' }), json: async () => body });
  const context = { params: Promise.resolve({ projectId: project.id }) };
  const post = body => route.POST(request(body), context);
  const connect = { action: 'connect', provider: 'forgejo', baseUrl: 'https://forge.test', repositoryPath: 'team/repo', credentials: { token: 'fixture-token' } };
  try {
    const legacy = await prisma.repository.create({ data: { projectId: project.id, githubRepoId: suffix, owner: 'fixture', name: 'legacy', fullName: 'fixture/legacy', webhookSecret: 'fixture-only' } });
    assert.equal((await post(connect)).status, 200);
    let saved = await prisma.gitConnection.findFirst({ where: { projectId: project.id } });
    assert.ok(saved.credentials); assert.equal(saved.credentials.includes('fixture-token'), false);
    assert.equal(encryption.decrypt(saved.credentials).token, 'fixture-token');
    const read = await route.GET(request({}), context); assert.equal(read.status, 200);
    assert.equal(JSON.stringify(read.body).includes('credentials'), false); assert.equal(JSON.stringify(read.body).includes('fixture-token'), false);
    assert.equal(read.body.connections[0].activity.length, 1);
    assert.equal((await post({ action: 'refresh', id: saved.id })).status, 200);
    assert.equal(await prisma.gitConnectionActivity.count({ where: { connectionId: saved.id } }), 1);
    remoteId = 'replaced-repo'; assert.equal((await post({ action: 'refresh', id: saved.id })).status, 409); remoteId = 'repo-1';
    actor = other; const before = effects;
    assert.equal((await route.GET(request({}), context)).status, 404); assert.equal((await post(connect)).status, 404); assert.equal(effects, before);
    actor = user; assert.equal((await post({ action: 'disconnect', id: saved.id })).status, 200);
    saved = await prisma.gitConnection.findUnique({ where: { id: saved.id } });
    assert.equal(saved.credentials, null); assert.equal(saved.isActive, false);
    assert.equal(await prisma.gitConnectionActivity.count({ where: { connectionId: saved.id } }), 1);
    assert.equal((await post({ ...connect, credentials: { token: 'replacement-token' } })).status, 200);
    assert.equal(await prisma.gitConnection.count({ where: { projectId: project.id } }), 1);
    assert.equal(await prisma.gitConnectionActivity.count({ where: { connectionId: saved.id } }), 1);
    assert.deepEqual(await prisma.repository.findUnique({ where: { id: legacy.id } }), legacy);
  } finally {
    await prisma.workspace.delete({ where: { id: workspace.id } });
    await prisma.user.deleteMany({ where: { id: { in: [user.id, other.id] } } });
    await prisma.$disconnect();
  }
});
