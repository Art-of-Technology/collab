const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir, userInfo } = require('node:os');
const { join, resolve } = require('node:path');
const { execFileSync } = require('node:child_process');
const { createServer } = require('node:http');
const { once } = require('node:events');
const { PrismaClient } = require('@prisma/client');
const { load } = require('../security/helpers.cjs');

// Socket-only temporary PostgreSQL and loopback HTTP; never an application DB.
test('issue activity respects issue and activity workspace boundaries', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'collab-activity-scope-'));
  const bindir = execFileSync('pg_config', ['--bindir'], { encoding: 'utf8' }).trim();
  let started = false, prisma, server;
  t.after(async () => {
    if (server) await new Promise(resolveClose => server.close(resolveClose));
    await prisma?.$disconnect();
    if (started) execFileSync(join(bindir, 'pg_ctl'), ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'], { stdio: 'pipe' });
    rmSync(directory, { recursive: true, force: true });
  });
  execFileSync(join(bindir, 'initdb'), ['-D', join(directory, 'data'), '-A', 'trust', '--no-locale', '-E', 'UTF8'], { stdio: 'pipe' });
  execFileSync(join(bindir, 'pg_ctl'), ['-D', join(directory, 'data'), '-l', join(directory, 'server.log'), '-o', `-k ${directory} -c listen_addresses='' -c fsync=off`, '-w', 'start'], { stdio: 'pipe' });
  started = true;
  const url = `postgresql://${encodeURIComponent(userInfo().username)}@localhost/postgres?host=${encodeURIComponent(directory)}`;
  execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'db', 'push', '--skip-generate', '--schema', resolve('prisma/schema.prisma')], { env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' });
  prisma = new PrismaClient({ datasources: { db: { url } } });
  await prisma.user.createMany({ data: ['alice', 'bob', 'both', 'mallory'].map(id => ({ id, name: id })) });
  await prisma.workspace.createMany({ data: [{ id: 'w', name: 'Work', slug: 'work', ownerId: 'alice' }, { id: 'foreign', name: 'Foreign', slug: 'foreign', ownerId: 'mallory' }] });
  await prisma.workspaceMember.createMany({ data: [{ workspaceId: 'w', userId: 'bob' }, { workspaceId: 'w', userId: 'both' }, { workspaceId: 'foreign', userId: 'both' }] });
  await prisma.project.createMany({ data: [{ id: 'p', workspaceId: 'w', name: 'Project', slug: 'project', issuePrefix: 'P' }, { id: 'q', workspaceId: 'foreign', name: 'Foreign project', slug: 'foreign-project', issuePrefix: 'Q' }] });
  await prisma.projectStatus.createMany({ data: [{ id: 's', projectId: 'p', name: 'todo', displayName: 'To do' }, { id: 'deleted', projectId: 'p', name: 'deleted', displayName: 'Deleted' }, { id: 'foreign-status', projectId: 'q', name: 'todo', displayName: 'Foreign to do' }] });
  await prisma.issue.createMany({ data: [
    { id: 'good', issueKey: 'P-1', workspaceId: 'w', projectId: 'p', statusId: 's', title: 'Visible' },
    // The following rows are deliberately inconsistent legacy fixtures, not normal API writes.
    { id: 'foreign-project', issueKey: 'P-2', workspaceId: 'w', projectId: 'q', title: 'Wrong project workspace' },
    { id: 'foreign-status', issueKey: 'P-3', workspaceId: 'w', projectId: 'p', statusId: 'foreign-status', title: 'Wrong status workspace' },
    { id: 'foreign-issue', issueKey: 'Q-1', workspaceId: 'foreign', projectId: 'q', title: 'Foreign issue' },
  ] });
  await prisma.issueActivity.createMany({ data: [
    { id: 'local', itemId: 'good', action: 'STATUS_CHANGED', workspaceId: 'w', projectId: 'p', userId: 'alice', fieldName: 'statusId', oldValue: 'Foreign to do', newValue: 'To do', oldStatusId: 'foreign-status', newStatusId: 's', details: JSON.stringify({ content: 'visible' }) },
    { id: 'historical', itemId: 'good', action: 'STATUS_CHANGED', workspaceId: 'w', projectId: null, userId: 'alice', fieldName: 'statusId', oldValue: 'To do', newValue: 'Foreign to do', oldStatusId: 's', newStatusId: 'foreign-status', details: JSON.stringify({ content: 'historical' }) },
    { id: 'deleted-status', itemId: 'good', action: 'STATUS_CHANGED', workspaceId: 'w', projectId: 'p', userId: 'alice', fieldName: 'statusId', oldValue: 'Old legacy', newValue: 'New legacy', oldStatusId: 'deleted' },
    { id: 'null-status', itemId: 'good', action: 'STATUS_CHANGED', workspaceId: 'w', projectId: 'p', userId: 'alice', fieldName: 'statusId', oldValue: 'Null old', newValue: 'Null new' },
    { id: 'foreign-activity', itemId: 'good', action: 'AGENT_SENT', workspaceId: 'foreign', projectId: 'q', userId: 'mallory', details: JSON.stringify({ content: 'foreign' }) },
    { id: 'wrong-project-activity', itemId: 'foreign-project', action: 'UPDATED', workspaceId: 'w', projectId: 'q', userId: 'alice' },
    { id: 'wrong-status-activity', itemId: 'foreign-status', action: 'UPDATED', workspaceId: 'w', projectId: 'p', userId: 'alice' },
  ] });
  await prisma.projectStatus.delete({ where: { id: 'deleted' } });
  await prisma.app.create({ data: { id: 'app', name: 'Fixture', slug: 'fixture', publisherId: 'alice', status: 'PUBLISHED', isSystemApp: true, scopes: { create: [{ scope: 'issues:read' }] } } });
  await prisma.appToken.createMany({ data: ['alice', 'bob', 'both', 'mallory'].map(userId => ({ id: `token-${userId}`, appId: 'app', workspaceId: userId === 'mallory' ? 'foreign' : 'w', userId, accessToken: Buffer.from(`fixture-${userId}`).toString('base64'), scopes: ['issues:read'] })) });
  const oauth = load('src/lib/oauth-scopes.ts', {}, { URL });
  const finder = load('src/lib/issue-finder.ts', { '@/lib/prisma': { prisma } });
  const auth = load('src/lib/apps/auth-middleware.ts', { 'next/server': { NextResponse: Response }, '@/lib/prisma': { prisma }, '@/lib/post-access': load('src/lib/post-access.ts'), '@/lib/oauth-scopes': oauth, '@/lib/apps/crypto': { decryptToken: async bytes => bytes.toString() } }, { Buffer, URL, Date, console });
  const activity = load('src/app/api/apps/auth/issues/[issueIdOrKey]/activity/route.ts', { 'next/server': { NextResponse: Response }, '@/lib/prisma': { prisma }, '@/lib/apps/auth-middleware': auth, '@/lib/issue-finder': finder }, { URL, console });
  server = createServer(async (req, res) => {
    try {
      const url = new URL(`http://127.0.0.1:${server.address().port}${req.url}`);
      const request = new Request(url, { headers: req.headers });
      request.nextUrl = url;
      const response = await activity.GET(request, { params: Promise.resolve({ issueIdOrKey: decodeURIComponent(url.pathname.split('/').at(-2)) }) });
      res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) { res.writeHead(500); res.end(JSON.stringify({ error: String(error) })); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const read = (issue, user, workspace = 'w') => fetch(`${base}/issues/${issue}/activity?workspaceId=${workspace}`, { headers: { authorization: `Bearer fixture-${user}` } });
  await t.test('normal issue returns same-workspace and historical activity only', async () => {
    const response = await read('P-1', 'bob');
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.issueKey, 'P-1');
    assert.deepEqual(body.activities.map(row => row.id).sort(), ['deleted-status', 'historical', 'local', 'null-status']);
    assert.deepEqual(body.activities.filter(row => row.details).map(row => row.details.content).sort(), ['historical', 'visible']);
  });
  await t.test('foreign old status and scalar are hidden while local new values remain', async () => {
    const response = await read('P-1', 'both');
    assert.equal(response.status, 200);
    const body = await response.json();
    const local = body.activities.find(row => row.id === 'local');
    assert.equal(local.oldStatus, null);
    assert.deepEqual(local.newStatus, { id: 's', name: 'todo', displayName: 'To do', color: '#6366F1', iconName: null });
    assert.equal(local.oldValue, null);
    assert.equal(local.newValue, 'To do');
  });
  await t.test('foreign new status and scalar are hidden while local old values remain', async () => {
    const response = await read('P-1', 'both');
    assert.equal(response.status, 200);
    const body = await response.json();
    const historical = body.activities.find(row => row.id === 'historical');
    assert.equal(historical.newStatus, null);
    assert.deepEqual(historical.oldStatus, { id: 's', name: 'todo', displayName: 'To do', color: '#6366F1', iconName: null });
    assert.equal(historical.oldValue, 'To do');
    assert.equal(historical.newValue, null);
  });
  await t.test('null or deleted status relations retain historical scalar values', async () => {
    const response = await read('P-1', 'both');
    assert.equal(response.status, 200);
    const body = await response.json();
    const deletedStatus = body.activities.find(row => row.id === 'deleted-status');
    assert.equal(deletedStatus.oldStatus, null);
    assert.equal(deletedStatus.newStatus, null);
    assert.equal(deletedStatus.oldValue, 'Old legacy');
    assert.equal(deletedStatus.newValue, 'New legacy');
    const nullStatus = body.activities.find(row => row.id === 'null-status');
    assert.equal(nullStatus.oldStatus, null);
    assert.equal(nullStatus.newStatus, null);
    assert.equal(nullStatus.oldValue, 'Null old');
    assert.equal(nullStatus.newValue, 'Null new');
  });
  await t.test('an issue pointing at another workspace project returns 404 even for a member of both', async () => {
    const response = await read('P-2', 'both');
    assert.equal(response.status, 404);
  });
  await t.test('an issue pointing at another workspace status returns 404 even for a member of both', async () => {
    const response = await read('P-3', 'both');
    assert.equal(response.status, 404);
  });
  await t.test('foreign issues and foreign workspace overrides are denied', async () => {
    assert.equal((await read('Q-1', 'bob')).status, 404);
    assert.equal((await read('Q-1', 'bob', 'foreign')).status, 403);
    assert.equal((await read('Q-1', 'mallory', 'foreign')).status, 200);
  });
  await t.test('revoked workspace membership is denied', async () => {
    await prisma.workspaceMember.updateMany({ where: { workspaceId: 'w', userId: 'bob' }, data: { status: false } });
    assert.equal((await read('P-1', 'bob')).status, 403);
  });
});
