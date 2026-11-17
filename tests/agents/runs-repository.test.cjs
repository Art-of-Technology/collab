const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { Prisma } = require('@prisma/client');
const { load } = require('../security/helpers.cjs');
const { seatsDatabase } = require('./seats-db.cjs');

// Token-facing routes accept only cuid-shaped ids.
const owner = 'cowner00001', person = 'cperson0001';
// A: one repository from the GitHub sign-in. B: none. C: two. D: one connection, and the same repository connected
// twice. E: the same path at two servers, which is two repositories.
const A = 'cprojecta001', B = 'cprojectb001', C = 'cprojectc001', D = 'cprojectd001', E = 'cprojecte001';
const scopes = ['issues:read', 'issues:write', 'user:read'];
const ago = seconds => new Date(Date.now() - seconds * 1000);

let db;
after(() => db?.stop());

test('the repository of the issue\'s project comes with the checkout and the run context', async t => {
  db = await seatsDatabase(async prisma => {
    await prisma.user.createMany({ data: [owner, person].map(id => ({ id, name: id })) });
    await prisma.workspace.create({ data: { id: 'w', name: 'w', slug: 'w', ownerId: owner } });
    await prisma.workspaceMember.create({ data: { workspaceId: 'w', userId: person } });
    for (const [id, prefix] of [[A, 'AA'], [B, 'BB'], [C, 'CC'], [D, 'DD'], [E, 'EE']]) {
      await prisma.project.create({ data: { id, workspaceId: 'w', name: `Project ${prefix}`, slug: id, issuePrefix: prefix } });
      await prisma.projectStatus.createMany({ data: ['to_do', 'in_progress', 'done'].map((name, order) => ({ id: `${id}-${name}`, projectId: id, name, displayName: name,
        order, category: name, isFinal: name === 'done' })) });
    }
    const repository = (projectId, fullName, data = {}) => prisma.repository.create({ data: { projectId, githubRepoId: fullName, owner: fullName.split('/')[0],
      name: fullName.split('/')[1], fullName, webhookSecret: 'secret', accessToken: 'token', ...data } });
    await repository(A, 'acme/app');
    await repository(C, 'acme/one', { defaultBranch: 'trunk' });
    // D has the same repository twice: once as a connection, once through the GitHub sign-in.
    await repository(D, 'acme/four');
    const connection = (projectId, provider, path, data = {}) => prisma.gitConnection.create({ data: { projectId, provider, baseUrl: `https://${provider}.com`,
      externalId: `${projectId}-${path}`, repositoryPath: path, name: path, url: `https://${provider}.com/${path}`, credentials: 'secret', ...data } });
    await connection(C, 'gitlab', 'acme/two');
    await connection(D, 'github', 'ACME/four');
    // Switched off, so it is not one of the project's repositories: B still has none.
    await connection(B, 'gitlab', 'acme/off', { isActive: false });
    // The same provider and the same path at two servers: two repositories, as `GitConnection`'s own key has it.
    await connection(E, 'gitlab', 'acme/five');
    await connection(E, 'gitlab', 'acme/five', { baseUrl: 'https://gitlab.acme.test', externalId: `${E}-self-hosted`,
      url: 'https://gitlab.acme.test/acme/five' });
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
  class ForgeProjectWriteError extends Error {}
  const deps = { '@/lib/forge/legacy-write-guard': { ForgeProjectWriteError, assertLegacyIssueWriteAllowed: async () => {} },
    zod, 'next/server': response, '@/lib/prisma': { prisma }, '@/lib/apps/auth-middleware': middleware, '@/lib/agent-seats': seats,
    '@/lib/agent-repository': load('src/lib/agent-repository.ts', { '@/lib/agent-seats': seats }),
    '@/lib/agent-handoff-http': load('src/lib/agent-handoff-http.ts', { zod, 'next/server': response, './agent-handoffs': handoffs }, globals),
    '@/lib/issue-finder': load('src/lib/issue-finder.ts', { '@/lib/prisma': { prisma } }),
    '@/lib/permissions': load('src/lib/permissions.ts', { './prisma': { prisma } }, { console }), '@/lib/agent-tokens': tokens };
  deps['@/lib/agent-runs'] = load('src/lib/agent-runs.ts', deps, { Date });
  const runs = load('src/app/api/apps/auth/runs/route.ts', deps, globals);
  const contextRoute = load('src/app/api/apps/auth/issues/[issueIdOrKey]/run-context/route.ts', deps, globals);

  const seat = async (name, projectId, role = 'developer') => {
    const made = await seats.createSeat({ workspaceId: 'w', actorId: owner, projectId, role, ownerId: person, name, expiresInDays: 30 });
    return { ...made.seat, token: made.token.token };
  };
  const devA = await seat('dev-a', A), devB = await seat('dev-b', B), leadB = await seat('lead-b', B, 'lead'), devC = await seat('dev-c', C), devD = await seat('dev-d', D);
  const leadA = await seat('lead-a', A, 'lead'), devE = await seat('dev-e', E);
  const personToken = 'collab_person_token';
  await raw.appToken.create({ data: { appId: 'person-app', workspaceId: 'w', userId: person, installationId: null,
    accessToken: Buffer.from(personToken).toString('base64'), scopes } });

  const checkout = async (who, target, generation = 'g1') => {
    const reply = await runs.POST(new Request('https://collab.test/api', { method: 'POST', headers: { Authorization: `Bearer ${who.token ?? who}` },
      body: JSON.stringify({ issue: target.issueKey, generation, runner: 'test' }) }), { params: Promise.resolve({}) });
    return [reply.status, await reply.json()];
  };
  const context = async (who, target) => {
    const reply = await contextRoute.GET(new Request('https://collab.test/api', { headers: { Authorization: `Bearer ${who.token ?? who}` } }),
      { params: Promise.resolve({ issueIdOrKey: target.issueKey }) });
    return [reply.status, await reply.json()];
  };
  let count = 0;
  /** An issue assigned to a seat, in its project. */
  const issue = async (to, project = to.projectId) => {
    const made = await raw.issue.create({ data: { workspaceId: 'w', projectId: project, title: `Issue ${++count}`, issueKey: `K-${count}`,
      statusId: `${project}-to_do`, assigneeId: to.userId ?? to, createdAt: ago(900) } });
    await raw.issueAssignee.create({ data: { issueId: made.id, userId: to.userId ?? to, role: 'ASSIGNEE', status: 'APPROVED', assignedAt: ago(600), approvedAt: ago(600) } });
    return made;
  };

  await t.test('a project with one connected repository: the checkout and the run context both name it, with no credential', async () => {
    const target = await issue(devA);
    const [status, body] = await checkout(devA, target);
    assert.equal(status, 200, JSON.stringify(body));
    const repository = await raw.repository.findFirstOrThrow({ where: { projectId: A } });
    assert.deepEqual(body.repository, { id: repository.id, provider: 'github', name: 'acme/app', url: 'https://github.com/acme/app', defaultBranch: 'main' });
    const [read, seen] = await context(devA, target);
    assert.deepEqual([read, seen.repository], [200, body.repository]);
    // Rule: the address and the provider, never a way in. The runner clones with its owner's own sign-in.
    for (const reply of [body, seen]) for (const secret of ['accessToken', 'webhookSecret', 'credentials', 'token']) {
      assert.ok(!JSON.stringify(reply).includes(secret), `${secret} in the reply`);
    }
  });

  await t.test('a provider other than GitHub is named with its own address, and a repository connected twice is one', async () => {
    const [status, body] = await checkout(devD, await issue(devD));
    const connection = await raw.gitConnection.findFirstOrThrow({ where: { projectId: D } });
    assert.equal(status, 200, JSON.stringify(body));
    // The GitHub sign-in's row answers for both, so the project has one repository and not two.
    assert.deepEqual([body.repository.name, body.repository.provider], ['acme/four', 'github']);
    assert.notEqual(body.repository.id, connection.id);
  });

  await t.test('a role that needs no repository takes its issue with none worked out', async () => {
    const [status, body] = await checkout(leadB, await issue(leadB));
    assert.deepEqual([status, body.repository, body.run.state], [200, null, 'running']);
  });

  await t.test('the role is read before the project: a lead gets none even where the project has one, and the read agrees', async () => {
    const target = await issue(leadA);
    const [status, body] = await checkout(leadA, target);
    assert.deepEqual([status, body.repository, body.run.state], [200, null, 'running']);
    assert.deepEqual((await context(leadA, target))[1].repository, null);
    // A person's own run is the same rule: they work in the copy they already have.
    const mine = await issue(person, A);
    const [got, started] = await checkout(personToken, mine);
    assert.deepEqual([got, started.repository], [200, null]);
    assert.deepEqual((await context(personToken, mine))[1].repository, null);
  });

  await t.test('the same path at two servers is two repositories, not one', async () => {
    const [status, body] = await checkout(devE, await issue(devE));
    assert.deepEqual([status, body.error], [409, 'repository_required']);
    assert.match(body.error_description, /"Project EE" has 2 repositories/);
  });

  await t.test('a run that was lost is still reported as such, ahead of the repository a project does not have', async () => {
    const target = await issue(devB);
    await raw.agentRun.create({ data: { workspaceId: 'w', issueId: target.id, seatId: devB.id, userId: devB.userId, runner: 'test', generation: 'g0',
      leaseUntil: ago(120) } });
    const [status, body] = await checkout(devB, target, 'g2');
    assert.deepEqual([status, body.error], [409, 'needs_person']);
  });

  await t.test('a role that needs one is refused, by name of the project, and nothing is started', async () => {
    const empty = await issue(devB);
    const [status, body] = await checkout(devB, empty);
    assert.deepEqual([status, body.error], [409, 'repository_required']);
    assert.match(body.error_description, /"Project BB" has no repository connected/);
    assert.equal(await raw.agentRun.count({ where: { issueId: empty.id } }), 0);
    assert.equal((await raw.issue.findUniqueOrThrow({ where: { id: empty.id } })).statusId, `${B}-to_do`);

    // Several, and nothing picks between them yet: the same refusal, saying how many there are.
    const several = await issue(devC);
    const [got, refusal] = await checkout(devC, several);
    assert.deepEqual([got, refusal.error], [409, 'repository_required']);
    assert.match(refusal.error_description, /"Project CC" has 2 repositories/);
    assert.equal(await raw.agentRun.count({ where: { issueId: several.id } }), 0);
    // The read refuses nothing: it says there is none to work out.
    assert.deepEqual((await context(devC, several))[1].repository, null);
  });

  await t.test('a person takes an issue of a project with no repository, and gets none', async () => {
    const target = await issue(person, B);
    const [status, body] = await checkout(personToken, target);
    assert.deepEqual([status, body.repository, body.run.state], [200, null, 'running']);
    // Starting again gives the run that is open, with the same answer.
    assert.deepEqual(await checkout(personToken, target), [status, body]);
  });

  await t.test('the repository is the issue project\'s, so another project\'s seat reads the same one', async () => {
    const [status, body] = await context(devA, await issue(devD));
    assert.deepEqual([status, body.repository.name], [200, 'acme/four']);
  });
});
