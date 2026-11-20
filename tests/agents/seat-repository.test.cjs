const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { Prisma } = require('@prisma/client');
const { load } = require('../security/helpers.cjs');
const { seatsDatabase } = require('./seats-db.cjs');

// Token-facing routes accept only cuid-shaped ids.
const owner = 'cowner00001', person = 'cperson0001';
// ONE: one repository. MANY: two connected and a third switched off. NONE: nothing connected. OTHER: another project's
// repositories, which no seat of the first three may pick.
const ONE = 'cprojone0001', MANY = 'cprojmany001', NONE = 'cprojnone001', OTHER = 'cprojother01';
const scopes = ['issues:read', 'issues:write', 'user:read'];
const ago = seconds => new Date(Date.now() - seconds * 1000);

let db;
after(() => db?.stop());

test('where a seat\'s repository comes from: the project, the seat\'s own pick, or an address typed on the project', async t => {
  db = await seatsDatabase(async prisma => {
    await prisma.user.createMany({ data: [owner, person].map(id => ({ id, name: id })) });
    await prisma.workspace.create({ data: { id: 'w', name: 'w', slug: 'w', ownerId: owner } });
    await prisma.workspaceMember.create({ data: { workspaceId: 'w', userId: person } });
    for (const [id, prefix] of [[ONE, 'ON'], [MANY, 'MA'], [NONE, 'NO'], [OTHER, 'OT']]) {
      await prisma.project.create({ data: { id, workspaceId: 'w', name: `Project ${prefix}`, slug: id, issuePrefix: prefix } });
      await prisma.projectStatus.createMany({ data: ['to_do', 'in_progress', 'done'].map((name, order) => ({ id: `${id}-${name}`, projectId: id, name, displayName: name,
        order, category: name, isFinal: name === 'done' })) });
    }
    const repository = (projectId, fullName) => prisma.repository.create({ data: { projectId, githubRepoId: fullName, owner: fullName.split('/')[0],
      name: fullName.split('/')[1], fullName, webhookSecret: 'secret', accessToken: 'token' } });
    const connection = (projectId, path, data = {}) => prisma.gitConnection.create({ data: { projectId, provider: 'gitlab', baseUrl: 'https://gitlab.com',
      externalId: `${projectId}-${path}`, repositoryPath: path, name: path, url: `https://gitlab.com/${path}`, credentials: 'secret', ...data } });
    await repository(ONE, 'acme/one');
    await repository(MANY, 'acme/web');
    await connection(MANY, 'acme/api');
    await connection(MANY, 'acme/old', { isActive: false });
    await repository(OTHER, 'acme/other');
    await connection(OTHER, 'acme/other-two');
    for (const [id, slug] of [['agent-app', 'collab-agent'], ['person-app', 'collab-cli']]) {
      await prisma.app.create({ data: { id, name: slug, slug, publisherId: 'system', status: 'PUBLISHED', visibility: 'PRIVATE', isSystemApp: true,
        scopes: { create: scopes.map(scope => ({ scope })) } } });
    }
  });
  const raw = db.prisma;
  // The application's client, so Trash is hidden here as it is in production.
  const prisma = raw.$extends(load('src/lib/issue-visibility.ts').issueVisibilityExtension(Prisma.dmmf.datamodel.models));

  const crypto = { encryptToken: async value => Buffer.from(value), decryptToken: async data => Buffer.from(data).toString(), getEncryptionKey: () => {} };
  const zod = require('zod');
  const response = { NextResponse: Response };
  const globals = { console, URL, Date, Buffer };
  const handoffs = load('src/lib/agent-handoffs.ts', { 'node:crypto': require('node:crypto'), 'node:buffer': require('node:buffer'), zod,
    '@/lib/prisma': { prisma }, '@/lib/issue-finder': load('src/lib/issue-finder.ts', { '@/lib/prisma': { prisma } }), '@/lib/oauth-scopes': load('src/lib/oauth-scopes.ts') }, { Date });
  const tokens = load('src/lib/agent-tokens.ts', { crypto: require('node:crypto'), '@/lib/prisma': { prisma }, '@/lib/apps/crypto': crypto }, { Buffer, Date });
  const repositories = load('src/lib/agent-repository.ts', {}, { URL });
  const seats = load('src/lib/agent-seats.ts', { '@/lib/prisma': { prisma }, '@/lib/agent-handoffs': handoffs, '@/lib/agent-tokens': tokens,
    '@/lib/agent-repository': repositories, '@/lib/issue-assignee': load('src/lib/issue-assignee.ts', { './agent-handoffs': handoffs }) }, { Date });
  const middleware = load('src/lib/apps/auth-middleware.ts', { crypto: require('node:crypto'), 'next/server': response,
    '@/lib/apps/crypto': crypto, '@/lib/oauth-scopes': load('src/lib/oauth-scopes.ts'), '@/lib/post-access': load('src/lib/post-access.ts'),
    '@/lib/auth-error-diagnostics': load('src/lib/auth-error-diagnostics.ts'), '@/lib/prisma': { prisma } }, globals);
  class ForgeProjectWriteError extends Error {}
  // Who is signed in to the app, for the two routes a person calls: null is nobody.
  let actor = owner;
  const deps = { '@/lib/forge/legacy-write-guard': { ForgeProjectWriteError, assertLegacyIssueWriteAllowed: async () => {} },
    zod, 'next/server': response, '@/lib/prisma': { prisma }, '@/lib/apps/auth-middleware': middleware, '@/lib/agent-seats': seats,
    '@/lib/agent-repository': repositories,
    '@/lib/agent-handoff-http': load('src/lib/agent-handoff-http.ts', { zod, 'next/server': response, './agent-handoffs': handoffs }, globals),
    '@/lib/issue-finder': load('src/lib/issue-finder.ts', { '@/lib/prisma': { prisma } }),
    '@/lib/permissions': load('src/lib/permissions.ts', { './prisma': { prisma } }, { console }), '@/lib/agent-tokens': tokens,
    '@/lib/session': { getCurrentUser: async () => actor ? { id: actor } : null }, '@/lib/post-access': load('src/lib/post-access.ts'),
    '@/lib/request-session': { getServerSession: async () => actor ? { user: { id: actor } } : null }, '@/lib/auth-options': { authOptions: {} } };
  deps['@/lib/agent-runs'] = load('src/lib/agent-runs.ts', deps, { Date });
  const runs = load('src/app/api/apps/auth/runs/route.ts', deps, globals);
  const contextRoute = load('src/app/api/apps/auth/issues/[issueIdOrKey]/run-context/route.ts', deps, globals);
  const projectRoute = load('src/app/api/projects/[projectId]/agent-repository/route.ts', deps, globals);
  const seatsRoute = load('src/app/api/workspaces/[workspaceId]/agent-seats/route.ts', deps, globals);

  /** The create-seat form's request, as the signed-in person: the status and the body. */
  const createSeat = async (name, projectId, extra = {}) => {
    const reply = await seatsRoute.POST(new Request('https://collab.test/api', { method: 'POST',
      body: JSON.stringify({ name, projectId, role: 'developer', ownerId: person, expiresInDays: 30, ...extra }) }), { params: Promise.resolve({ workspaceId: 'w' }) });
    return [reply.status, await reply.json()];
  };
  const seat = async (name, projectId, extra) => {
    const [status, body] = await createSeat(name, projectId, extra);
    assert.equal(status, 201, JSON.stringify(body));
    return { ...body.seat, token: body.token.token };
  };
  /** What the form reads for a project, and what it saves on one. */
  const state = async projectId => (await projectRoute.GET(new Request('https://collab.test/api'), { params: Promise.resolve({ projectId }) })).json();
  const save = async (projectId, body, origin = 'https://collab.test') => {
    const reply = await projectRoute.PATCH(new Request('https://collab.test/api', { method: 'PATCH', headers: { origin }, body: JSON.stringify(body) }),
      { params: Promise.resolve({ projectId }) });
    return [reply.status, await reply.json()];
  };
  let count = 0;
  /** A new issue assigned to the seat, checked out by it: the checkout's answer, and the run context's for the same issue. */
  const work = async who => {
    const made = await raw.issue.create({ data: { workspaceId: 'w', projectId: who.projectId, title: `Issue ${++count}`, issueKey: `K-${count}`,
      statusId: `${who.projectId}-to_do`, assigneeId: who.userId, createdAt: ago(900) } });
    await raw.issueAssignee.create({ data: { issueId: made.id, userId: who.userId, role: 'ASSIGNEE', status: 'APPROVED', assignedAt: ago(600), approvedAt: ago(600) } });
    const headers = { Authorization: `Bearer ${who.token}` };
    const checkout = await runs.POST(new Request('https://collab.test/api', { method: 'POST', headers,
      body: JSON.stringify({ issue: made.issueKey, generation: 'g1', runner: 'test' }) }), { params: Promise.resolve({}) });
    const context = await contextRoute.GET(new Request('https://collab.test/api', { headers }), { params: Promise.resolve({ issueIdOrKey: made.issueKey }) });
    return { status: checkout.status, checkout: await checkout.json(), context: await context.json() };
  };
  /** The repository both answers name, which must be one answer. */
  const repositoryOf = async who => {
    const { status, checkout, context } = await work(who);
    assert.equal(status, 200, JSON.stringify(checkout));
    assert.deepEqual(context.repository, checkout.repository, 'the run context and the checkout answer differently');
    return checkout.repository;
  };
  const row = (projectId, repositoryPath) => raw.gitConnection.findFirstOrThrow({ where: { projectId, repositoryPath } });
  const web = await raw.repository.findFirstOrThrow({ where: { projectId: MANY } });
  const api = await row(MANY, 'acme/api'), old = await row(MANY, 'acme/old');
  // The seats the later cases come back to.
  let picked, first;

  await t.test('case 1, one repository: it comes from the project, and a seat created with nothing picked works in it', async () => {
    const read = await state(ONE);
    assert.deepEqual([read.repositories.length, read.repository.name], [1, 'acme/one']);
    const dev = await seat('dev-one', ONE);
    assert.equal(dev.repositoryId, null);
    assert.equal((await repositoryOf(dev)).name, 'acme/one');
  });

  await t.test('case 2, several: the seat works in its own pick, ahead of the project\'s default', async () => {
    const read = await state(MANY);
    // The connection that is switched off is not one of the project's repositories.
    assert.deepEqual([read.repositories.map(repository => repository.name), read.repository], [['acme/web', 'acme/api'], null]);
    picked = await seat('dev-api', MANY, { repositoryId: api.id });
    const plain = await seat('dev-plain', MANY);
    assert.deepEqual([picked.repositoryId, plain.repositoryId], [api.id, null]);
    assert.equal((await raw.agentSeat.findUniqueOrThrow({ where: { id: picked.id } })).repositoryId, api.id);
    // With no default the seat that picked works; the one that did not waits for the project's choice, as before.
    assert.equal((await repositoryOf(picked)).id, api.id);
    const waiting = await work(plain);
    assert.deepEqual([waiting.status, waiting.checkout.error, waiting.context.repository], [409, 'repository_required', null]);
    // With a default: the pick still wins for the seat that has one, and the default answers for the seat that has none.
    assert.equal((await save(MANY, { repositoryId: web.id }))[0], 200);
    assert.equal((await repositoryOf(picked)).id, api.id);
    assert.equal((await repositoryOf(plain)).id, web.id);
  });

  await t.test('a pick whose repository is connected no more names nothing: the seat follows the project again', async () => {
    // Three connected, the picked one switched off: two are left, and the project's default answers.
    await raw.gitConnection.update({ where: { id: old.id }, data: { isActive: true } });
    await raw.gitConnection.update({ where: { id: api.id }, data: { isActive: false } });
    assert.equal((await repositoryOf(picked)).id, web.id);
    // One left: the project's only repository.
    await raw.gitConnection.update({ where: { id: old.id }, data: { isActive: false } });
    assert.equal((await repositoryOf(picked)).id, web.id);
    // Connected again, the pick is the seat's repository again: it was never taken off the seat.
    await raw.gitConnection.update({ where: { id: api.id }, data: { isActive: true } });
    assert.equal((await repositoryOf(picked)).id, api.id);
  });

  await t.test('asking again under the same name: a pick moves the seat\'s repository, and no pick leaves it', async () => {
    const again = await createSeat('dev-api', MANY);
    assert.deepEqual([again[0], again[1].seat.repositoryId], [201, api.id]);
    const moved = await createSeat('dev-api', MANY, { repositoryId: web.id });
    assert.deepEqual([moved[0], moved[1].seat.repositoryId], [201, web.id]);
    assert.equal((await repositoryOf({ ...moved[1].seat, token: moved[1].token.token })).id, web.id);
    // A seat made again after it was retired is a new seat: it starts with the pick its request names, here none.
    const gone = await seat('dev-again', MANY, { repositoryId: api.id });
    await seats.retireSeat({ workspaceId: 'w', actorId: owner, seatId: gone.id });
    assert.equal((await seat('dev-again', MANY)).repositoryId, null);
  });

  await t.test('the server refuses a pick that is not one of the project\'s connected repositories', async () => {
    const foreign = await raw.repository.findFirstOrThrow({ where: { projectId: OTHER } }), foreignConnection = await row(OTHER, 'acme/other-two');
    for (const [why, repositoryId] of [['another project\'s repository', foreign.id], ['another project\'s connection', foreignConnection.id],
      ['a connection that is switched off', old.id], ['an id that names nothing', 'cnothing0001']]) {
      const [status, body] = await createSeat('dev-refused', MANY, { repositoryId });
      assert.deepEqual([status, body.code], [400, 'invalid_repository'], why);
    }
    // A project with one repository is held to the same rule: the pick is that one or nothing.
    assert.deepEqual((await createSeat('dev-refused', ONE, { repositoryId: web.id }))[1].code, 'invalid_repository');
    // The seat's own project decides, not where the repository is connected: the other project's repository is fine there.
    assert.equal((await createSeat('dev-other', OTHER, { repositoryId: foreign.id }))[0], 201);
    // Nothing was made of a refused request: no seat, and no account under its name.
    assert.equal(await raw.agentSeat.count({ where: { name: 'dev-refused' } }), 0);
    assert.equal(await raw.user.count({ where: { name: 'dev-refused' } }), 0);
    // A role that works in no repository picks none.
    const [status, body] = await createSeat('lead-many', MANY, { role: 'lead', repositoryId: api.id });
    assert.deepEqual([status, body.code], [400, 'repository_not_needed']);
    assert.equal((await createSeat('dev-long', MANY, { repositoryId: 'c'.repeat(129) }))[0], 400);
  });

  await t.test('case 3, none: an https address typed on the project, which every seat of the project gets', async () => {
    assert.deepEqual(await state(NONE), { repositories: [], repository: null, canManage: true });
    first = await seat('dev-none', NONE);
    const second = await seat('dev-none-2', NONE);
    // Until an address is saved the run starts with none, as it did before Collab sent a repository at all.
    assert.equal(await repositoryOf(first), null);

    for (const url of ['http://github.com/acme/none', 'git@github.com:acme/none.git', 'ssh://git@github.com/acme/none', 'github.com/acme/none',
      'https://user:secret@github.com/acme/none', 'https://token@github.com/acme/none', 'https://github.com', 'https://github.com/',
      'https://github.com/acme/none?token=secret', 'https://github.com/acme/none#readme', 'javascript:alert(1)', '   ', `https://github.com/${'a'.repeat(2048)}`]) {
      assert.equal((await save(NONE, { url }))[0], 400, url);
    }
    assert.equal((await save(NONE, { url: 'https://github.com/acme/none', repositoryId: api.id }))[0], 400, 'an address and a default in one request');
    // Who may save it: a person who manages the workspace's permissions, from the app's own pages.
    actor = null;
    assert.equal((await save(NONE, { url: 'https://github.com/acme/none' }))[0], 401);
    actor = person;
    assert.equal((await save(NONE, { url: 'https://github.com/acme/none' }))[0], 403);
    actor = owner;
    assert.equal((await save(NONE, { url: 'https://github.com/acme/none' }, 'https://other.test'))[0], 403);
    assert.equal((await raw.project.findUniqueOrThrow({ where: { id: NONE } })).agentRepositoryUrl, null);
    assert.equal(await repositoryOf(first), null);

    const [status, saved] = await save(NONE, { url: '  https://github.com/acme/none.git ' });
    const typed = { id: NONE, provider: 'address', name: 'acme/none', url: 'https://github.com/acme/none.git', defaultBranch: null };
    assert.equal(status, 200, JSON.stringify(saved));
    assert.deepEqual(saved, { repositories: [], repository: typed, canManage: true });
    assert.equal((await raw.project.findUniqueOrThrow({ where: { id: NONE } })).agentRepositoryUrl, typed.url);
    assert.deepEqual(await state(NONE), saved);
    assert.deepEqual([await repositoryOf(first), await repositoryOf(second)], [typed, typed]);
    // Typed again, the address is replaced.
    assert.equal((await save(NONE, { url: 'https://git.acme.test/team/acme/none' }))[1].repository.name, 'team/acme/none');
    assert.equal((await repositoryOf(first)).url, 'https://git.acme.test/team/acme/none');
  });

  await t.test('case 4, a role that needs no repository gets none, whatever its project has', async () => {
    const lead = await seat('lead-none', NONE, { role: 'lead' });
    assert.equal(await repositoryOf(lead), null);
  });

  await t.test('a connected repository comes before a typed address, and a project that has one takes no address', async () => {
    const [status, body] = await save(ONE, { url: 'https://github.com/acme/elsewhere' });
    assert.equal(status, 409, JSON.stringify(body));
    assert.equal((await raw.project.findUniqueOrThrow({ where: { id: ONE } })).agentRepositoryUrl, null);
    // The project that typed one connects a repository: its seats work in that from the next checkout on.
    const connected = await raw.gitConnection.create({ data: { projectId: NONE, provider: 'gitlab', baseUrl: 'https://gitlab.com', externalId: 'none-real',
      repositoryPath: 'acme/real', name: 'acme/real', url: 'https://gitlab.com/acme/real', credentials: 'secret' } });
    assert.equal((await repositoryOf(first)).id, connected.id);
    // And an address that is not an https address any more, however it got there, is never sent to a runner.
    await raw.gitConnection.update({ where: { id: connected.id }, data: { isActive: false } });
    await raw.project.update({ where: { id: NONE }, data: { agentRepositoryUrl: 'https://user:secret@github.com/acme/none' } });
    assert.equal(await repositoryOf(first), null);
  });
});
