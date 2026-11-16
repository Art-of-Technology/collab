const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, readFileSync, rmSync } = require('node:fs');
const { createHash } = require('node:crypto');
const { tmpdir, userInfo } = require('node:os');
const { join, resolve } = require('node:path');
const { execFileSync } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');
const { load } = require('../security/helpers.cjs');

// Same socket-only disposable PostgreSQL pattern as handoffs.test.cjs; no application DB.
const directory = mkdtempSync(join(tmpdir(), 'collab-token-auth-pg-'));
const bindir = execFileSync('pg_config', ['--bindir'], { encoding: 'utf8' }).trim();
let started = false, prisma, auth, crypto, tokens, derivations = 0;
const request = (bearer, using = auth) => using.authenticateAppRequest({ headers: new Headers({ Authorization: `Bearer ${bearer}` }) });
const stored = async bearer => (await crypto.encryptToken(bearer)).toString('base64');
const hashOf = bearer => createHash('sha256').update(bearer).digest('hex');
// A process that has seen no token yet, as after a restart.
const freshProcess = (onDecrypt = async () => {}) => load('src/lib/apps/auth-middleware.ts', {
  'next/server': { NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200 }) } },
  '@/lib/prisma': { prisma }, '@/lib/oauth-scopes': load('src/lib/oauth-scopes.ts'), '@/lib/post-access': load('src/lib/post-access.ts'),
  // Each decryption is one scrypt derivation: the cost that made lease calls outlast their timeout (CLB-460).
  '@/lib/apps/crypto': { ...crypto, decryptToken: async data => { derivations++; const token = await crypto.decryptToken(data); await onDecrypt(); return token; } },
}, { Buffer, URL, console });

before(async () => {
  execFileSync(join(bindir, 'initdb'), ['-D', join(directory, 'data'), '-A', 'trust', '--no-locale', '-E', 'UTF8'], { stdio: 'pipe' });
  execFileSync(join(bindir, 'pg_ctl'), ['-D', join(directory, 'data'), '-l', join(directory, 'server.log'),
    '-o', `-k ${directory} -c listen_addresses='' -c fsync=off`, '-w', 'start'], { stdio: 'pipe' });
  started = true;
  const url = `postgresql://${encodeURIComponent(userInfo().username)}@localhost/postgres?host=${encodeURIComponent(directory)}`;
  execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'db', 'push', '--skip-generate', '--schema', resolve('prisma/schema.prisma')],
    { env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' });
  prisma = new PrismaClient({ datasources: { db: { url } } });
  // The column and its index come from the migration itself, as they do in production.
  await prisma.$executeRawUnsafe('ALTER TABLE "AppToken" DROP COLUMN "tokenHash"');
  const migration = readFileSync(resolve('prisma/migrations/20261116000200_app_token_hash/migration.sql'), 'utf8');
  for (const statement of migration.split(';').filter(part => part.trim())) await prisma.$executeRawUnsafe(statement);
  crypto = load('src/lib/apps/crypto.ts', { crypto: require('node:crypto'), util: require('node:util'), bcrypt: {} },
    { Buffer, process: { env: { APP_TOKENS_KEY: 'k'.repeat(32) } }, console });
  auth = freshProcess();
  tokens = load('src/lib/agent-tokens.ts', { crypto: require('node:crypto'), '@/lib/prisma': { prisma }, '@/lib/apps/crypto': crypto }, { Buffer, Date });
  await prisma.user.create({ data: { id: 'alice', name: 'Alice' } });
  await prisma.workspace.create({ data: { id: 'w', name: 'Work', slug: 'work', ownerId: 'alice' } });
  await prisma.app.create({ data: { id: 'cli', name: 'CLI', slug: 'cli', publisherId: 'alice', status: 'PUBLISHED', isSystemApp: true } });
  await prisma.app.create({ data: { id: 'agent', name: 'Agent', slug: 'collab-agent', publisherId: 'alice', status: 'PUBLISHED', isSystemApp: true,
    scopes: { create: [{ scope: 'issues:read' }] } } });
  // Other agents' tokens precede the caller's, as in a shared workspace.
  for (let i = 0; i <= 12; i++) {
    await prisma.appToken.create({ data: { id: `token-${i}`, appId: 'cli', workspaceId: 'w', userId: 'alice', accessToken: await stored(`secret-${i}`), tokenHash: hashOf(`secret-${i}`) } });
  }
  // 300 stored tokens in all. A lookup that still decrypted its way through them would count each one.
  await prisma.appToken.createMany({ data: Array.from({ length: 287 }, (_, i) => (
    { id: `other-${i}`, appId: 'cli', workspaceId: 'w', userId: 'alice', accessToken: `other-${i}`, tokenHash: hashOf(`other-${i}`) })) });
});
after(async () => {
  await prisma?.$disconnect();
  if (started) execFileSync(join(bindir, 'pg_ctl'), ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'], { stdio: 'pipe' });
  rmSync(directory, { recursive: true, force: true });
});

test('the first request of a token derives one key and a repeat none, with 300 tokens stored', async () => {
  assert.equal(await prisma.appToken.count(), 300);
  const first = await request('secret-12');
  assert.equal(first.success, true);
  assert.equal(first.context.user.id, 'alice');
  assert.equal(derivations, 1);
  derivations = 0;
  const repeat = await request('secret-12');
  assert.equal(repeat.success, true);
  assert.equal(repeat.context.user.id, 'alice');
  assert.equal(derivations, 0);
});

test('revoking a remembered token rejects its next request', async () => {
  assert.equal((await request('secret-11')).success, true);
  await prisma.appToken.update({ where: { id: 'token-11' }, data: { isRevoked: true } });
  const result = await request('secret-11');
  assert.equal(result.success, false);
  assert.equal(result.error.statusCode, 401);
});

test('rotating a remembered token in place rejects the old value and accepts the new one', async () => {
  assert.equal((await request('secret-10')).success, true);
  await prisma.appToken.update({ where: { id: 'token-10' }, data: { accessToken: await stored('rotated') } });
  assert.equal((await request('secret-10')).error.statusCode, 401);
  assert.equal((await request('rotated')).success, true);
});

test('a token that matches no row derives no key, however often it is presented', async () => {
  derivations = 0;
  for (let i = 0; i < 3; i++) assert.equal((await request('nobody')).error.statusCode, 401);
  assert.equal(derivations, 0);
});

test('a revoked token is refused by a process that never saw it, without deriving a key', async () => {
  await prisma.appToken.update({ where: { id: 'token-9' }, data: { isRevoked: true } });
  derivations = 0;
  assert.equal((await request('secret-9', freshProcess())).error.statusCode, 401);
  assert.equal(derivations, 0);
});

test('a token replaced in place by a version that does not know the hash is found again by its hash', async () => {
  // The rotation test above left the old token's hash on the row; refusing the old token corrected it.
  assert.equal((await prisma.appToken.findUnique({ where: { id: 'token-10' } })).tokenHash, hashOf('rotated'));
  derivations = 0;
  assert.equal((await request('rotated', freshProcess())).success, true);
  assert.equal(derivations, 1);
});

test('rows older than the hash are found by the old scan once and by their hash from then on', async () => {
  const before = new Date('2026-01-01T00:00:00Z');
  for (const name of ['old-a', 'old-b']) {
    await prisma.appToken.create({ data: { id: name, appId: 'cli', workspaceId: 'w', userId: 'alice', accessToken: await stored(name), updatedAt: before } });
  }
  derivations = 0;
  assert.equal((await request('old-b')).success, true);
  assert.equal(derivations, 2, 'the scan covers only the rows without a hash');
  const rows = await prisma.appToken.findMany({ where: { id: { in: ['old-a', 'old-b'] } }, orderBy: { id: 'asc' } });
  assert.deepEqual(rows.map(row => row.tokenHash), [hashOf('old-a'), hashOf('old-b')]);
  // A refresh token's age is counted from updatedAt, so storing the hash must not make the row look new.
  assert.deepEqual(rows.map(row => row.updatedAt), [before, before]);

  derivations = 0;
  const restarted = freshProcess();
  assert.equal((await request('old-a', restarted)).success, true);
  assert.equal(derivations, 1);
  derivations = 0;
  assert.equal((await request('nobody', restarted)).error.statusCode, 401);
  assert.equal(derivations, 0);
});

test('backfill does not overwrite a concurrent revocation timestamp', async () => {
  const before = new Date('2026-01-01T00:00:00Z');
  const revokedAt = new Date('2026-02-01T00:00:00Z');
  await prisma.appToken.create({ data: { id: 'race', appId: 'cli', workspaceId: 'w', userId: 'alice', accessToken: await stored('race'), updatedAt: before } });
  const process = freshProcess(async () => {
    await prisma.appToken.update({ where: { id: 'race' }, data: { isRevoked: true, revokedAt, updatedAt: revokedAt } });
  });
  assert.equal((await request('race', process)).success, true);
  const row = await prisma.appToken.findUnique({ where: { id: 'race' } });
  assert.equal(row.isRevoked, true);
  assert.deepEqual(row.updatedAt, revokedAt);
  assert.equal(row.tokenHash, null);
  assert.equal((await request('race', process)).error.statusCode, 401);
});

test('a minted agent token is stored with its hash and never in plain', async () => {
  const minted = await tokens.createAgentToken({ workspaceId: 'w', actorId: 'alice', name: 'builder', access: 'read', expiresInDays: 30 });
  const row = await prisma.appToken.findUnique({ where: { id: minted.id } });
  assert.equal(row.tokenHash, hashOf(minted.token));
  assert.equal(JSON.stringify(row).includes(minted.token), false);
  derivations = 0;
  const result = await request(minted.token, freshProcess());
  assert.equal(result.success, true);
  assert.equal(derivations, 1);
});
