const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir, userInfo } = require('node:os');
const { join, resolve } = require('node:path');
const { execFileSync } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');
const { load } = require('../security/helpers.cjs');

// Same socket-only disposable PostgreSQL pattern as handoffs.test.cjs; no application DB.
const directory = mkdtempSync(join(tmpdir(), 'collab-token-auth-pg-'));
const bindir = execFileSync('pg_config', ['--bindir'], { encoding: 'utf8' }).trim();
let started = false, prisma, auth, crypto, derivations = 0;
const request = bearer => auth.authenticateAppRequest({ headers: new Headers({ Authorization: `Bearer ${bearer}` }) });
const stored = async bearer => (await crypto.encryptToken(bearer)).toString('base64');

before(async () => {
  execFileSync(join(bindir, 'initdb'), ['-D', join(directory, 'data'), '-A', 'trust', '--no-locale', '-E', 'UTF8'], { stdio: 'pipe' });
  execFileSync(join(bindir, 'pg_ctl'), ['-D', join(directory, 'data'), '-l', join(directory, 'server.log'),
    '-o', `-k ${directory} -c listen_addresses='' -c fsync=off`, '-w', 'start'], { stdio: 'pipe' });
  started = true;
  const url = `postgresql://${encodeURIComponent(userInfo().username)}@localhost/postgres?host=${encodeURIComponent(directory)}`;
  execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'db', 'push', '--skip-generate', '--schema', resolve('prisma/schema.prisma')],
    { env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' });
  prisma = new PrismaClient({ datasources: { db: { url } } });
  crypto = load('src/lib/apps/crypto.ts', { crypto: require('node:crypto'), util: require('node:util'), bcrypt: {} },
    { Buffer, process: { env: { APP_TOKENS_KEY: 'k'.repeat(32) } }, console });
  auth = load('src/lib/apps/auth-middleware.ts', {
    'next/server': { NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200 }) } },
    '@/lib/prisma': { prisma }, '@/lib/oauth-scopes': load('src/lib/oauth-scopes.ts'), '@/lib/post-access': load('src/lib/post-access.ts'),
    // Each decryption is one scrypt derivation: the cost that made lease calls outlast their timeout (CLB-460).
    '@/lib/apps/crypto': { ...crypto, decryptToken: async data => { derivations++; return crypto.decryptToken(data); } },
  }, { Buffer, URL, console });
  await prisma.user.create({ data: { id: 'alice', name: 'Alice' } });
  await prisma.workspace.create({ data: { id: 'w', name: 'Work', slug: 'work', ownerId: 'alice' } });
  await prisma.app.create({ data: { id: 'cli', name: 'CLI', slug: 'cli', publisherId: 'alice', status: 'PUBLISHED', isSystemApp: true } });
  // Other agents' tokens precede the caller's, as in a shared workspace.
  for (let i = 0; i <= 12; i++) {
    await prisma.appToken.create({ data: { id: `token-${i}`, appId: 'cli', workspaceId: 'w', userId: 'alice', accessToken: await stored(`secret-${i}`) } });
  }
});
after(async () => {
  await prisma?.$disconnect();
  if (started) execFileSync(join(bindir, 'pg_ctl'), ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'], { stdio: 'pipe' });
  rmSync(directory, { recursive: true, force: true });
});

test('a repeat request with the same token derives no key, however many tokens are stored', async () => {
  const first = await request('secret-12');
  assert.equal(first.success, true);
  assert.equal(first.context.user.id, 'alice');
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
