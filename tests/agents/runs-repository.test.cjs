const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { Prisma } = require('@prisma/client');
const { load } = require('../security/helpers.cjs');
const { seatsDatabase } = require('./seats-db.cjs');

// Token-facing routes accept only cuid-shaped ids.
const owner = 'cowner00001', person = 'cperson0001';
// A: one repository from the GitHub sign-in. B: none. C: two. D: the same repository twice, once through the sign-in
// and once as a connection. E: the same path at two servers, which is two repositories. F: one connection and nothing
// else. G: three connections, one of which is connected a second time during the test. H: two servers an administrator
// configured which differ only in the case of their path. I: a repository connected twice and a second one, where a
// choice and a disconnect are made at the same time.
const A = 'cprojecta001', B = 'cprojectb001', C = 'cprojectc001', D = 'cprojectd001', E = 'cprojecte001', F = 'cprojectf001', G = 'cprojectg001',
  H = 'cprojecth001', I = 'cprojecti001';
const scopes = ['issues:read', 'issues:write', 'user:read'];
const ago = seconds => new Date(Date.now() - seconds * 1000);

let db;
after(() => db?.stop());

test('the repository of the issue\'s project comes with the checkout and the run context', async t => {
  db = await seatsDatabase(async prisma => {
    await prisma.user.createMany({ data: [owner, person].map(id => ({ id, name: id })) });
    await prisma.workspace.create({ data: { id: 'w', name: 'w', slug: 'w', ownerId: owner } });
    await prisma.workspaceMember.create({ data: { workspaceId: 'w', userId: person } });
    for (const [id, prefix] of [[A, 'AA'], [B, 'BB'], [C, 'CC'], [D, 'DD'], [E, 'EE'], [F, 'FF'], [G, 'GG'], [H, 'HH'], [I, 'II']]) {
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
    // F has nothing but a connection, at a server of its own and with the provider written as the client stores it.
    await connection(F, 'GitLab', 'acme/six', { baseUrl: 'https://gitlab.acme.test', url: 'https://gitlab.acme.test/acme/six.git' });
    // G has three repositories, one of them at GitHub and written as the client stores it: the sign-in connects the
    // same one during the test.
    await connection(G, 'github', 'ACME/seven');
    await connection(G, 'gitlab', 'acme/eight');
    await connection(G, 'gitlab', 'acme/nine');
    // H is at two servers of one host whose addresses differ only in the case of their path: an administrator
    // configures each as its own instance, and the same path at each is two repositories. The third is connected at
    // the second server and switched on during the test.
    await connection(H, 'gitlab', 'acme/ten', { baseUrl: 'https://git.acme.test/Team', url: 'https://git.acme.test/Team/acme/ten' });
    await connection(H, 'gitlab', 'acme/ten', { baseUrl: 'https://git.acme.test/team', externalId: `${H}-lower`, url: 'https://git.acme.test/team/acme/ten' });
    await connection(H, 'gitlab', 'acme/eleven', { baseUrl: 'https://git.acme.test/team', url: 'https://git.acme.test/team/acme/eleven', isActive: false });
    // I has one repository connected twice, through the sign-in and as a connection, and a second one of its own.
    await repository(I, 'acme/twelve');
    await connection(I, 'github', 'ACME/twelve');
    await connection(I, 'gitlab', 'acme/thirteen');
    for (const [id, slug] of [['agent-app', 'collab-agent'], ['person-app', 'collab-cli']]) {
      await prisma.app.create({ data: { id, name: slug, slug, publisherId: 'system', status: 'PUBLISHED', visibility: 'PRIVATE', isSystemApp: true,
        scopes: { create: scopes.map(scope => ({ scope })) } } });
    }
  });
  // The application's client, so Trash is hidden here as it is in production.
  const raw = db.prisma;
  await t.test('the additive migration preserves existing projects with no explicit default', async () => {
    await raw.$executeRawUnsafe('ALTER TABLE "Project" DROP COLUMN "agentDefaultRepositoryId"');
    await raw.$executeRawUnsafe(require('node:fs').readFileSync('prisma/migrations/20261117000200_agent_default_repository/migration.sql', 'utf8'));
    const project = await raw.project.findUniqueOrThrow({ where: { id: A } });
    assert.equal(project.agentDefaultRepositoryId, null);
    assert.equal(project.issuePrefix, 'AA');
  });
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
  // The GitHub sign-in's disconnect, which deletes the `Repository` row the choice may be saved as.
  const disconnect = load('src/app/api/github/repositories/[repositoryId]/route.ts', {
    'next/server': response, '@/lib/prisma': { prisma }, '@/lib/session': { getCurrentUser: async () => ({ id: owner }) },
    '@/lib/encryption': { EncryptionService: { decrypt: () => '' } },
    '@/lib/github/access': load('src/lib/github/access.ts', { '@/lib/post-access': load('src/lib/post-access.ts') }),
    '@/lib/github/version-access': { versionAccessWhere: () => ({}) },
    '@/lib/agent-repository': deps['@/lib/agent-repository'],
  }, globals);
  const disconnectSignIn = repositoryId => disconnect.DELETE(new Request('https://collab.test/api', { method: 'DELETE' }),
    { params: Promise.resolve({ repositoryId }) });

  const seat = async (name, projectId, role = 'developer') => {
    const made = await seats.createSeat({ workspaceId: 'w', actorId: owner, projectId, role, ownerId: person, name, expiresInDays: 30 });
    return { ...made.seat, token: made.token.token };
  };
  const devA = await seat('dev-a', A), devB = await seat('dev-b', B), leadB = await seat('lead-b', B, 'lead'), devC = await seat('dev-c', C), devD = await seat('dev-d', D);
  const leadA = await seat('lead-a', A, 'lead'), devE = await seat('dev-e', E), devF = await seat('dev-f', F), devG = await seat('dev-g', G);
  const devH = await seat('dev-h', H), devI = await seat('dev-i', I);
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

  await t.test('a project whose only repository is a connection: its own address, its provider lowercased, no branch', async () => {
    const target = await issue(devF);
    const [status, body] = await checkout(devF, target);
    assert.equal(status, 200, JSON.stringify(body));
    const connection = await raw.gitConnection.findFirstOrThrow({ where: { projectId: F } });
    assert.deepEqual(body.repository, { id: connection.id, provider: 'gitlab', name: 'acme/six', url: 'https://gitlab.acme.test/acme/six.git', defaultBranch: null });
    assert.deepEqual((await context(devF, target))[1].repository, body.repository);
    // Collab stores a connection's credentials, and they leave the server no more than the sign-in's token does.
    assert.ok(!JSON.stringify(body).includes(connection.credentials), 'the connection\'s credentials in the reply');
  });

  await t.test('a repository connected twice, through the sign-in and as a connection, is one', async () => {
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

  await t.test('the same path at two servers is two repositories, not one: nothing picks between them, checkout refuses clearly', async () => {
    const [status, body] = await checkout(devE, await issue(devE));
    // Were the two rows taken for one repository, the project would have one and the checkout would name it.
    assert.deepEqual([status, body.error], [409, 'repository_required']);
  });

  await t.test('a run that was lost is still reported as such, ahead of the repository a project does not have', async () => {
    const target = await issue(devB);
    await raw.agentRun.create({ data: { workspaceId: 'w', issueId: target.id, seatId: devB.id, userId: devB.userId, runner: 'test', generation: 'g0',
      leaseUntil: ago(120) } });
    const [status, body] = await checkout(devB, target, 'g2');
    assert.deepEqual([status, body.error], [409, 'needs_person']);
  });

  await t.test('a role that needs one and a project that gives none: the checkout stands with null, and the run starts', async () => {
    // No checkout is refused over a repository: the runner works in the copy it is configured with, as it did before
    // Collab sent the field at all. Refusing would stop seats that are working today in projects with none connected.
    const empty = await issue(devB);
    const [status, body] = await checkout(devB, empty);
    assert.deepEqual([status, body.repository, body.run.state], [200, null, 'running']);
    assert.equal(await raw.agentRun.count({ where: { issueId: empty.id } }), 1);
    assert.equal((await raw.issue.findUniqueOrThrow({ where: { id: empty.id } })).statusId, `${B}-in_progress`);
    assert.deepEqual((await context(devB, empty))[1].repository, null);

    // Several without a default refuses before creating a run or moving the issue.
    const several = await issue(devC);
    const [got, started] = await checkout(devC, several);
    assert.deepEqual([got, started.error], [409, 'repository_required']);
    assert.match(started.error_description, /default repository/);
    assert.equal(await raw.agentRun.count({ where: { issueId: several.id } }), 0);
    assert.equal((await raw.issue.findUniqueOrThrow({ where: { id: several.id } })).statusId, `${C}-to_do`);
    assert.deepEqual((await context(devC, several))[1].repository, null);
  });

  await t.test('administrators choose an active project default; checkout and context use it', async () => {
    let actor = owner;
    const route = load('src/app/api/projects/[projectId]/agent-repository/route.ts', {
      ...deps, '@/lib/session': { getCurrentUser: async () => actor ? { id: actor } : null },
      '@/lib/post-access': load('src/lib/post-access.ts'),
    }, globals);
    const selectDefault = async (repositoryId, origin = 'https://collab.test') => {
      const response = await route.PATCH(new Request('https://collab.test/api', { method: 'PATCH', headers: { origin }, body: JSON.stringify({ repositoryId }) }),
        { params: Promise.resolve({ projectId: C }) });
      return [response.status, await response.json()];
    };
    const connection = await raw.gitConnection.findFirstOrThrow({ where: { projectId: C } });
    const foreign = await raw.repository.findFirstOrThrow({ where: { projectId: A } });
    actor = null;
    assert.equal((await selectDefault(connection.id))[0], 401);
    actor = person;
    assert.equal((await selectDefault(connection.id))[0], 403);
    actor = owner;
    assert.equal((await selectDefault(connection.id, 'https://other.test'))[0], 403);
    assert.equal((await selectDefault(foreign.id))[0], 400);
    const [saved, state] = await selectDefault(connection.id);
    assert.equal(saved, 200);
    assert.equal(state.repository.id, connection.id);
    const read = await route.GET(new Request('https://collab.test/api'), { params: Promise.resolve({ projectId: C }) });
    assert.equal(read.status, 200);
    const settings = await read.json();
    assert.equal(settings.repository.id, connection.id);
    assert.equal(settings.repositories.length, 2);
    assert.equal(settings.canManage, true);
    for (const secret of ['accessToken', 'webhookSecret', 'credentials']) assert.ok(!JSON.stringify(settings).includes(secret));
    const target = await issue(devC);
    const [status, body] = await checkout(devC, target);
    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(body.repository.id, connection.id);
    assert.deepEqual((await context(devC, target))[1].repository, body.repository);
    // A stale default never sends a checkout to an inactive repository. With one remaining it is automatic.
    await raw.gitConnection.update({ where: { id: connection.id }, data: { isActive: false } });
    assert.equal((await selectDefault(connection.id))[0], 400);
    assert.equal((await checkout(devC, await issue(devC)))[1].repository.name, 'acme/one');
    await raw.gitConnection.update({ where: { id: connection.id }, data: { isActive: true } });
    await raw.project.update({ where: { id: C }, data: { agentDefaultRepositoryId: foreign.id } });
    assert.equal((await checkout(devC, await issue(devC)))[0], 409);
  });

  await t.test('the default an administrator chose holds when another row comes to represent the same repository', async () => {
    const seven = await raw.gitConnection.findFirstOrThrow({ where: { projectId: G, repositoryPath: 'ACME/seven' } });
    await raw.project.update({ where: { id: G }, data: { agentDefaultRepositoryId: seven.id } });
    assert.equal((await checkout(devG, await issue(devG)))[1].repository.id, seven.id);
    // The same repository connected a second time, through the GitHub sign-in: that row answers for both from now on,
    // and the project still has three. The choice was the repository, not the row, so the checkout keeps it.
    const signIn = await raw.repository.create({ data: { projectId: G, githubRepoId: 'acme/seven', owner: 'acme', name: 'seven', fullName: 'acme/seven',
      webhookSecret: 'secret', accessToken: 'token' } });
    const [status, body] = await checkout(devG, await issue(devG));
    assert.deepEqual([status, body.repository.id, body.repository.name], [200, signIn.id, 'acme/seven']);
    // And the other way about: the sign-in's row disconnected while the connection of the same repository stays.
    await raw.project.update({ where: { id: G }, data: { agentDefaultRepositoryId: signIn.id } });
    await raw.repository.update({ where: { id: signIn.id }, data: { isActive: false } });
    assert.equal((await checkout(devG, await issue(devG)))[1].repository.id, seven.id);
    // The sign-in's disconnect deletes its row outright, so the choice is handed to the connection of the same
    // repository rather than lost with the row. The actual delete route does it, under its own access rules.
    await raw.repository.update({ where: { id: signIn.id }, data: { isActive: true } });
    await raw.project.update({ where: { id: G }, data: { agentDefaultRepositoryId: signIn.id } });
    const gone = await disconnectSignIn(signIn.id);
    assert.equal(gone.status, 200);
    assert.equal(await raw.repository.count({ where: { id: signIn.id } }), 0);
    assert.equal((await raw.project.findUniqueOrThrow({ where: { id: G } })).agentDefaultRepositoryId, seven.id);
    assert.equal((await checkout(devG, await issue(devG)))[1].repository.id, seven.id);
    // Once the repository is connected no more, the default names nothing and the checkout refuses as before.
    await raw.gitConnection.update({ where: { id: seven.id }, data: { isActive: false } });
    const left = await issue(devG);
    const [refused, told] = await checkout(devG, left);
    assert.deepEqual([refused, told.error], [409, 'repository_required']);
    assert.equal(await raw.agentRun.count({ where: { issueId: left.id } }), 0);
  });

  await t.test('two servers whose addresses differ only in the case of their path are two servers, saved default and all', async () => {
    const upper = await raw.gitConnection.findFirstOrThrow({ where: { projectId: H, baseUrl: 'https://git.acme.test/Team' } });
    const lower = await raw.gitConnection.findFirstOrThrow({ where: { projectId: H, baseUrl: 'https://git.acme.test/team', repositoryPath: 'acme/ten' } });
    // Taken for one repository, the project would have one and the checkout would name it with nobody choosing.
    const first = await issue(devH);
    const [status, body] = await checkout(devH, first);
    assert.deepEqual([status, body.error], [409, 'repository_required']);
    assert.equal(await raw.agentRun.count({ where: { issueId: first.id } }), 0);
    // And a default saved as a row of one server never resolves to the same path at the other: the administrator chose
    // a repository at the server they configured, and switching that row off leaves the choice naming nothing.
    await raw.gitConnection.updateMany({ where: { projectId: H, repositoryPath: 'acme/eleven' }, data: { isActive: true } });
    await raw.project.update({ where: { id: H }, data: { agentDefaultRepositoryId: upper.id } });
    assert.equal((await checkout(devH, await issue(devH)))[1].repository.id, upper.id);
    await raw.gitConnection.update({ where: { id: upper.id }, data: { isActive: false } });
    const left = await issue(devH);
    const [refused, told] = await checkout(devH, left);
    assert.deepEqual([refused, told.error, told.repository], [409, 'repository_required', undefined]);
    assert.notEqual(told.repository?.id, lower.id);
    assert.equal(await raw.agentRun.count({ where: { issueId: left.id } }), 0);
  });

  await t.test('a choice and a disconnect made at the same time take turns: neither writes over the other', async () => {
    let actor = owner;
    const route = load('src/app/api/projects/[projectId]/agent-repository/route.ts', {
      ...deps, '@/lib/session': { getCurrentUser: async () => actor ? { id: actor } : null },
      '@/lib/post-access': load('src/lib/post-access.ts'),
    }, globals);
    const selectDefault = repositoryId => route.PATCH(new Request('https://collab.test/api', { method: 'PATCH',
      headers: { origin: 'https://collab.test' }, body: JSON.stringify({ repositoryId }) }), { params: Promise.resolve({ projectId: I }) });
    const signIn = await raw.repository.findFirstOrThrow({ where: { projectId: I } });
    const twelve = await raw.gitConnection.findFirstOrThrow({ where: { projectId: I, repositoryPath: 'ACME/twelve' } });
    const thirteen = await raw.gitConnection.findFirstOrThrow({ where: { projectId: I, repositoryPath: 'acme/thirteen' } });
    await raw.project.update({ where: { id: I }, data: { agentDefaultRepositoryId: signIn.id } });
    const settle = () => new Promise(resolve => setTimeout(resolve, 300));
    /** A change that takes the hold the routes take, and keeps it until it is let go: the other one has to wait. */
    const holding = async change => {
      let release; const held = new Promise(resolve => { release = resolve; });
      const open = raw.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${I} FOR UPDATE`;
        await change(tx);
        await held;
      }, { timeout: 20000, maxWait: 20000 });
      await settle();
      return { release, open };
    };

    // An administrator chooses the second repository while the first is being disconnected. The disconnect hands the
    // choice on only where it is still the row it deletes, so it leaves this one alone instead of writing over it.
    const choice = await holding(tx => tx.project.update({ where: { id: I }, data: { agentDefaultRepositoryId: thirteen.id } }));
    const disconnecting = disconnectSignIn(signIn.id);
    await settle();
    choice.release(); await choice.open;
    assert.equal((await disconnecting).status, 200);
    assert.equal((await raw.project.findUniqueOrThrow({ where: { id: I } })).agentDefaultRepositoryId, thirteen.id);
    assert.equal((await checkout(devI, await issue(devI)))[1].repository.id, thirteen.id);

    // The other way about: a repository is disconnected while an administrator is choosing it. The choice is saved
    // only after the disconnect is done, so it is refused rather than saved as a row that is gone.
    await raw.project.update({ where: { id: I }, data: { agentDefaultRepositoryId: null } });
    const removal = await holding(tx => tx.gitConnection.delete({ where: { id: twelve.id } }));
    const choosing = selectDefault(twelve.id);
    await settle();
    removal.release(); await removal.open;
    const refused = await choosing;
    assert.equal(refused.status, 400);
    assert.equal((await raw.project.findUniqueOrThrow({ where: { id: I } })).agentDefaultRepositoryId, null);
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
