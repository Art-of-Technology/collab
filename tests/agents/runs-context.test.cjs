const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { Prisma } = require('@prisma/client');
const { load } = require('../security/helpers.cjs');
const { seatsDatabase } = require('./seats-db.cjs');

// Token-facing routes accept only cuid-shaped ids.
const owner = 'cowner00001', person = 'cperson0001';
const A = 'cprojecta001', B = 'cprojectb001';
const scopes = ['issues:read', 'issues:write', 'user:read'];
const ago = minutes => new Date(Date.now() - minutes * 60_000);

let db;
after(() => db?.stop());

test('run context: what a fresh session needs to work an issue, in one read', async t => {
  db = await seatsDatabase(async prisma => {
    await prisma.user.createMany({ data: [owner, person].map(id => ({ id, name: id })) });
    await prisma.workspace.create({ data: { id: 'w', name: 'w', slug: 'w', ownerId: owner } });
    await prisma.workspace.create({ data: { id: 'x', name: 'x', slug: 'x', ownerId: owner } });
    await prisma.workspaceMember.create({ data: { workspaceId: 'w', userId: person } });
    for (const [id, workspaceId] of [[A, 'w'], [B, 'w'], ['cprojectx001', 'x']]) {
      await prisma.project.create({ data: { id, workspaceId, name: id, slug: id, issuePrefix: id.slice(8, 9).repeat(2).toUpperCase() } });
      await prisma.projectStatus.createMany({ data: ['to_do', 'in_review', 'done'].map((name, order) => ({ id: `${id}-${name}`, projectId: id, name, displayName: name, order, isFinal: name === 'done' })) });
    }
    for (const [id, slug] of [['agent-app', 'collab-agent'], ['person-app', 'collab-cli']]) {
      await prisma.app.create({ data: { id, name: slug, slug, publisherId: 'system', status: 'PUBLISHED', visibility: 'PRIVATE', isSystemApp: true,
        scopes: { create: scopes.map(scope => ({ scope })) } } });
    }
  });
  // The application's client, so Trash is hidden here as it is in production.
  const raw = db.prisma;
  const prisma = raw.$extends(load('src/lib/issue-visibility.ts').issueVisibilityExtension(Prisma.dmmf.datamodel.models));

  const crypto = { encryptToken: async value => Buffer.from(value), decryptToken: async data => Buffer.from(data).toString(), getEncryptionKey: () => {} };
  const zod = require('zod');
  const response = { NextResponse: Response };
  const globals = { console, URL, Date, Buffer };
  const handoffs = load('src/lib/agent-handoffs.ts', { 'node:crypto': require('node:crypto'), 'node:buffer': require('node:buffer'), zod,
    '@/lib/prisma': { prisma }, '@/lib/issue-finder': load('src/lib/issue-finder.ts', { '@/lib/prisma': { prisma } }), '@/lib/oauth-scopes': load('src/lib/oauth-scopes.ts') }, { Date });
  const tokens = load('src/lib/agent-tokens.ts', { crypto: require('node:crypto'), '@/lib/prisma': { prisma }, '@/lib/apps/crypto': crypto }, { Buffer, Date });
  const seats = load('src/lib/agent-seats.ts', { '@/lib/prisma': { prisma }, '@/lib/agent-handoffs': handoffs, '@/lib/agent-tokens': tokens,
    '@/lib/issue-assignee': load('src/lib/issue-assignee.ts', { './agent-handoffs': handoffs }) }, { Date });
  const middleware = load('src/lib/apps/auth-middleware.ts', { crypto: require('node:crypto'), 'next/server': response,
    '@/lib/apps/crypto': crypto, '@/lib/oauth-scopes': load('src/lib/oauth-scopes.ts'), '@/lib/post-access': load('src/lib/post-access.ts'),
    '@/lib/auth-error-diagnostics': load('src/lib/auth-error-diagnostics.ts'), '@/lib/prisma': { prisma } }, globals);
  const route = load('src/app/api/apps/auth/issues/[issueIdOrKey]/run-context/route.ts', { '@/lib/apps/auth-middleware': middleware,
    '@/lib/agent-handoff-http': load('src/lib/agent-handoff-http.ts', { zod, 'next/server': response, './agent-handoffs': handoffs }, globals),
    '@/lib/agent-runs': load('src/lib/agent-runs.ts', { zod, '@/lib/prisma': { prisma }, '@/lib/agent-seats': seats, '@/lib/issue-finder': {}, '@/lib/permissions': {}, '@/lib/agent-tokens': tokens }, { Date }) }, globals);

  const seat = async (name, projectId) => {
    const made = await seats.createSeat({ workspaceId: 'w', actorId: owner, projectId, role: 'developer', ownerId: person, name, expiresInDays: 30 });
    return { ...made.seat, token: made.token.token };
  };
  const devA = await seat('dev-a', A), devB = await seat('dev-b', B);
  const personToken = 'collab_person_token';
  await raw.appToken.create({ data: { appId: 'person-app', workspaceId: 'w', userId: person, installationId: null,
    accessToken: Buffer.from(personToken).toString('base64'), scopes } });

  const read = async (token, issueIdOrKey) => {
    const reply = await route.GET(new Request('https://collab.test/api', { headers: { Authorization: `Bearer ${token}` } }), { params: Promise.resolve({ issueIdOrKey }) });
    return [reply.status, await reply.json()];
  };
  const context = async target => { const [status, reply] = await read(devA.token, target.issueKey); assert.equal(status, 200, JSON.stringify(reply)); return reply; };
  let count = 0;
  const issue = (data = {}) => raw.issue.create({ data: { workspaceId: 'w', projectId: A, title: `Issue ${++count}`, issueKey: `K-${count}`, statusId: `${data.projectId ?? A}-to_do`, ...data } });
  /** A run on the issue that ended `ended` minutes ago. */
  const run = (target, ended, data) => raw.agentRun.create({ data: { workspaceId: 'w', issueId: target.id, seatId: devA.id, userId: devA.userId,
    runner: 'test', generation: 'g1', state: 'finished', outcome: 'in_review', startedAt: ago(ended + 30), endedAt: ago(ended), ...data } });
  const comment = (target, authorId, minutes, content) => raw.issueComment.create({ data: { issueId: target.id, authorId, content, createdAt: ago(minutes) } });
  const link = (source, relationType, target) => raw.issueRelation.create({ data: { sourceIssueId: source.id, targetIssueId: target.id, relationType } });
  const said = reply => reply.commentsSince.map(row => row.content);

  await t.test('the issue, the last exit note, and only the comments made after the run that left it', async () => {
    const target = await issue({ description: 'What to do', priority: 'high', assigneeId: devA.userId });
    await comment(target, owner, 90, 'first'); await comment(target, devA.userId, 40, 'second'); await comment(target, person, 10, 'third');

    // No run yet: everything that was said.
    const fresh = await context(target);
    assert.deepEqual(fresh.issue, { id: target.id, issueKey: target.issueKey, title: target.title, description: 'What to do', type: 'TASK', priority: 'high',
      projectId: A, status: 'to_do', category: 'todo', assigneeId: devA.userId, agentRequestRole: null });
    assert.equal(fresh.lastExitNote, null);
    assert.deepEqual(said(fresh), ['first', 'second', 'third']);
    assert.deepEqual(fresh.commentsSince[2], { id: fresh.commentsSince[2].id, content: 'third', createdAt: fresh.commentsSince[2].createdAt, parentId: null, author: { id: person, name: person } });
    assert.deepEqual(fresh.commands, [`collab context get --project-id ${A}`, `collab comments list ${target.issueKey}`, `collab issues activity ${target.issueKey}`]);
    assert.deepEqual([fresh.blockers, fresh.requests, fresh.requestFor], [[], [], []]);

    await run(target, 60, { note: 'The first note' });
    const second = await context(target);
    assert.equal(second.lastExitNote, 'The first note');
    assert.deepEqual(said(second), ['second', 'third']);

    // A later run that stopped without a note changes neither: the comments since the note are still what the next session lacks.
    await run(target, 20, { state: 'stopped', outcome: null });
    const resumed = await context(target);
    assert.deepEqual([resumed.lastExitNote, said(resumed)], ['The first note', ['second', 'third']]);
    // Nor does a run that is open now.
    await run(target, 0, { state: 'running', outcome: null, endedAt: null });
    assert.deepEqual(said(await context(target)), ['second', 'third']);
    await raw.agentRun.updateMany({ where: { issueId: target.id, endedAt: null }, data: { state: 'finished', outcome: 'done', note: 'The second note', endedAt: ago(5) } });
    const third = await context(target);
    assert.deepEqual([third.lastExitNote, said(third)], ['The second note', []]);
  });

  await t.test('what blocks the issue, and the requests filed for it', async () => {
    const target = await issue();
    const open = await issue(), settled = await issue({ statusId: `${A}-done` }), related = await issue(), blocked = await issue();
    const review = await issue({ agentRequestRole: 'review', reporterId: devA.userId, statusId: `${A}-in_review` });
    const elsewhere = await issue({ projectId: B, agentRequestRole: 'developer', reporterId: devA.userId });
    await link(open, 'BLOCKS', target); await link(target, 'BLOCKED_BY', settled); await link(related, 'RELATES_TO', target);
    // The issue blocks this one; that is not something it waits for.
    await link(target, 'BLOCKS', blocked);
    await link(review, 'RELATES_TO', target); await link(elsewhere, 'BLOCKS', target);

    const reply = await context(target);
    const ref = (row, status, category, role) => ({ id: row.id, issueKey: row.issueKey, title: row.title, projectId: row.projectId, status, category, ...(role && { requestRole: role }) });
    const byKey = rows => [...rows].sort((a, b) => a.id.localeCompare(b.id));
    assert.deepEqual(byKey(reply.blockers), byKey([ref(open, 'to_do', 'todo'), ref(settled, 'done', 'done'), ref(elsewhere, 'to_do', 'todo', 'developer')]));
    assert.deepEqual(byKey(reply.requests), byKey([ref(review, 'in_review', 'in_review', 'review'), ref(elsewhere, 'to_do', 'todo', 'developer')]));
    assert.deepEqual(reply.requestFor, []);

    // Read as the request, the same links say what it was filed for.
    const asRequest = await context(review);
    assert.deepEqual([asRequest.issue.agentRequestRole, asRequest.requestFor, asRequest.requests, asRequest.blockers], ['review', [ref(target, 'to_do', 'todo')], [], []]);
    assert.deepEqual((await context(elsewhere)).requestFor, [ref(target, 'to_do', 'todo')]);
  });

  await t.test('it is a read: any token of the workspace gets it, by key or by id, and nothing outside the workspace', async () => {
    const target = await issue();
    for (const [token, name] of [[devB.token, target.issueKey], [personToken, target.id]]) {
      const [status, reply] = await read(token, name);
      assert.deepEqual([status, reply.issue?.id], [200, target.id]);
    }
    const foreign = await raw.issue.create({ data: { workspaceId: 'x', projectId: 'cprojectx001', title: 'Elsewhere', issueKey: 'XX-1' } });
    for (const name of [foreign.id, foreign.issueKey, 'K-0']) {
      const [status, reply] = await read(devA.token, name);
      assert.deepEqual([status, reply.error], [404, 'not_found']);
    }
    const trashed = await issue({ deletedAt: new Date() });
    assert.equal((await read(devA.token, trashed.issueKey))[0], 404);
    assert.equal((await read('collab_at_unknown', target.issueKey))[0], 401);
  });
});
