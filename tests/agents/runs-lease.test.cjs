const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { Prisma } = require('@prisma/client');
const { load } = require('../security/helpers.cjs');
const { seatsDatabase } = require('./seats-db.cjs');

// Token-facing routes accept only cuid-shaped ids.
const owner = 'cowner00001', person = 'cperson0001', viewer = 'cviewer0001';
const A = 'cprojecta001', B = 'cprojectb001';
const scopes = ['issues:read', 'issues:write', 'user:read'];
const ago = seconds => new Date(Date.now() - seconds * 1000);

test('a unique-index refusal on the insert is answered as already_running', async () => {
  class HandoffError extends Error { constructor(code, message, status) { super(message); this.code = code; this.status = status; } }
  const prisma = { issue: { findFirst: async () => ({ id: 'i' }) }, agentRun: { findMany: async () => [] },
    $transaction: async () => { throw Object.assign(new Error('unique'), { code: 'P2002' }); } };
  const { checkout } = load('src/lib/agent-runs.ts', { zod: require('zod'), '@/lib/prisma': { prisma }, '@/lib/issue-finder': {}, '@/lib/permissions': {},
    '@/lib/agent-tokens': { AGENT_APP_SLUG: 'collab-agent' },
    '@/lib/agent-seats': { HandoffError, seatFor: async () => null, seatWriteGuard: async () => {} } }, { Date });
  await assert.rejects(checkout({ user: { id: person }, workspace: { id: 'w' } }, { issue: 'i', generation: 'g', runner: 'r' }),
    error => error.code === 'already_running' && error.status === 409);
});

let db;
after(() => db?.stop());

test('runs: checkout, the lease, lost runs and who may clear them', async t => {
  db = await seatsDatabase(async prisma => {
    await prisma.user.createMany({ data: [owner, person, viewer].map(id => ({ id, name: id })) });
    await prisma.workspace.create({ data: { id: 'w', name: 'w', slug: 'w', ownerId: owner } });
    await prisma.workspaceMember.createMany({ data: [{ workspaceId: 'w', userId: person }, { workspaceId: 'w', userId: viewer, role: 'VIEWER' }] });
    // A has three statuses in the "in progress" group: one switched off, and "doing" stored before "in_progress" but ordered after it.
    // B has none.
    for (const [id, statuses] of [[A, { old_progress: -1, to_do: 0, doing: 3, in_progress: 1, in_review: 2, done: 4 }], [B, { to_do: 0, done: 1 }]]) {
      await prisma.project.create({ data: { id, workspaceId: 'w', name: id, slug: id, issuePrefix: id === A ? 'AA' : 'BB' } });
      await prisma.projectStatus.createMany({ data: Object.entries(statuses).map(([name, order]) => ({ id: `${id}-${name}`, projectId: id, name, displayName: name,
        order, isFinal: name === 'done', isActive: name !== 'old_progress' })) });
    }
    for (const [id, slug] of [['agent-app', 'collab-agent'], ['person-app', 'collab-cli']]) {
      await prisma.app.create({ data: { id, name: slug, slug, publisherId: 'system', status: 'PUBLISHED', visibility: 'PRIVATE', isSystemApp: true,
        scopes: { create: scopes.map(scope => ({ scope })) } } });
    }
  });
  // The application's client, so Trash is hidden here as it is in production.
  const raw = db.prisma;
  const prisma = raw.$extends(load('src/lib/issue-visibility.ts').issueVisibilityExtension(Prisma.dmmf.datamodel.models));
  await raw.rolePermission.create({ data: { workspaceId: 'w', role: 'MEMBER', permission: 'ASSIGN_TASK' } });

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
  let session = person, forge = false;
  class ForgeProjectWriteError extends Error {}
  const deps = { '@/lib/forge/legacy-write-guard': { ForgeProjectWriteError,
    assertLegacyIssueWriteAllowed: async () => { if (forge) throw new ForgeProjectWriteError('Use the Forge board'); } }, zod, 'next/server': response, '@/lib/prisma': { prisma }, '@/lib/apps/auth-middleware': middleware, '@/lib/agent-seats': seats,
    '@/lib/agent-handoff-http': load('src/lib/agent-handoff-http.ts', { zod, 'next/server': response, './agent-handoffs': handoffs }, globals),
    '@/lib/issue-finder': load('src/lib/issue-finder.ts', { '@/lib/prisma': { prisma } }),
    '@/lib/permissions': load('src/lib/permissions.ts', { './prisma': { prisma } }, { console }),
    '@/lib/session': { getCurrentUser: async () => session && { id: session } }, '@/lib/agent-tokens': tokens };
  deps['@/lib/agent-runs'] = load('src/lib/agent-runs.ts', deps, { Date });
  const inboxRoute = load('src/app/api/apps/auth/seats/me/inbox/route.ts', deps, globals);
  const runs = load('src/app/api/apps/auth/runs/route.ts', deps, globals);
  const one = load('src/app/api/apps/auth/runs/[id]/route.ts', deps, globals);
  const clearRoute = load('src/app/api/issues/[issueId]/runs/[runId]/clear/route.ts', deps, globals);

  const seat = async (name, projectId, role = 'developer') => {
    const made = await seats.createSeat({ workspaceId: 'w', actorId: owner, projectId, role, ownerId: person, name, expiresInDays: 30 });
    return { ...made.seat, token: made.token.token };
  };
  const devA = await seat('dev-a', A), otherA = await seat('other-a', A), devB = await seat('dev-b', B), release = await seat('release-a', A, 'release');
  const personToken = 'collab_person_token';
  await raw.appToken.create({ data: { appId: 'person-app', workspaceId: 'w', userId: person, installationId: null,
    accessToken: Buffer.from(personToken).toString('base64'), scopes } });

  /** Calls a token route and returns [status, body]. */
  const call = async (handler, token, { body, id } = {}) => {
    const reply = await handler(new Request('https://collab.test/api', { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}` },
      ...(body && { body: JSON.stringify(body) }) }), { params: Promise.resolve({ id }) });
    return [reply.status, await reply.json()];
  };
  const checkout = (token, issue, generation = 'g1') => call(runs.POST, token, { body: { issue: issue.issueKey, generation, runner: 'test' } });
  const act = (token, id, event, generation = 'g1') => call(one.PATCH, token, { id, body: { event, generation } });
  const read = (token, id) => call(one.GET, token, { id });
  const inbox = async token => (await call(inboxRoute.GET, token))[1].items;
  const clear = async (target, runId) => {
    const reply = await clearRoute.POST(new Request('https://collab.test/api', { method: 'POST' }), { params: Promise.resolve({ issueId: target.issueKey, runId }) });
    return [reply.status, await reply.json()];
  };
  const refused = async (pending, status, code) => {
    const [got, body] = await pending;
    assert.deepEqual([got, body.error], [status, code]);
  };
  let count = 0;
  /** An issue assigned to `to` (a seat or a user id), in status `status` of its project. */
  const issue = async (to, { project = to?.projectId ?? A, status = 'to_do', ...data } = {}) => {
    const userId = to?.userId ?? to;
    const made = await raw.issue.create({ data: { workspaceId: 'w', projectId: project, title: `Issue ${++count}`, issueKey: `K-${count}`,
      statusId: `${project}-${status}`, assigneeId: userId, createdAt: ago(900), ...data } });
    if (userId) await raw.issueAssignee.create({ data: { issueId: made.id, userId, role: 'ASSIGNEE', status: 'APPROVED', assignedAt: ago(600), approvedAt: ago(600) } });
    return made;
  };
  const stored = id => raw.agentRun.findUniqueOrThrow({ where: { id } });
  const statusOf = async target => (await raw.issue.findUniqueOrThrow({ where: { id: target.id } })).statusId;
  const lapse = id => raw.agentRun.update({ where: { id }, data: { leaseUntil: ago(1) } });
  const activities = (target, action) => raw.issueActivity.findMany({ where: { itemId: target.id, action } });

  await t.test('rule 4: two checkouts at the same moment give one run and one already_running, and the issue starts', async () => {
    const target = await issue(devA);
    const replies = await Promise.all([checkout(devA.token, target, 'g1'), checkout(devA.token, target, 'g2')]);
    assert.deepEqual(replies.map(([status]) => status).sort(), [200, 409]);
    assert.equal(replies.find(([status]) => status === 409)[1].error, 'already_running');
    const { run } = replies.find(([status]) => status === 200)[1];
    assert.deepEqual([run.issueId, run.state], [target.id, 'running']);
    const lease = Date.parse(run.leaseUntil) - Date.now();
    assert.ok(lease > 55_000 && lease <= 60_000, `lease of ${lease} ms`);
    assert.equal(await raw.agentRun.count({ where: { issueId: target.id } }), 1);
    assert.equal((await stored(run.id)).seatId, devA.id);
    // The first status of the group that is in use, by order.
    const started = await raw.issue.findUniqueOrThrow({ where: { id: target.id } });
    assert.deepEqual([started.statusId, started.status, started.statusValue], [`${A}-in_progress`, 'in_progress', 'in_progress']);
    assert.ok(started.firstStartedAt && started.lastProgressAt);
    const [moved] = await activities(target, 'STATUS_CHANGED');
    assert.deepEqual([moved.oldStatusId, moved.newStatusId, moved.userId], [`${A}-to_do`, `${A}-in_progress`, devA.userId]);
    // A later checkout is refused the same way, and never offered: the run is open.
    await refused(checkout(devA.token, target, 'g3'), 409, 'already_running');
    assert.deepEqual(await inbox(devA.token), []);
  });

  await t.test('checkout leaves the status alone where the project has no "in progress" status, and where the issue is in one already', async () => {
    const plain = await issue(devB);
    assert.equal((await checkout(devB.token, plain))[0], 200);
    assert.equal(await statusOf(plain), `${B}-to_do`);
    const doing = await issue(devA, { status: 'doing' });
    assert.equal((await checkout(devA.token, doing))[0], 200);
    assert.equal(await statusOf(doing), `${A}-doing`);
    assert.deepEqual(await activities(doing, 'STATUS_CHANGED'), []);
    for (const target of [plain, doing]) {
      const updated = await raw.issue.findUniqueOrThrow({ where: { id: target.id } });
      assert.ok(updated.firstStartedAt && updated.lastProgressAt);
    }
  });

  await t.test('an agent without a seat cannot repeat checkout', async () => {
    const agent = await tokens.createAgentToken({ workspaceId: 'w', actorId: owner, name: 'non-seat', access: 'write', expiresInDays: 30 });
    const account = await raw.appToken.findUniqueOrThrow({ where: { id: agent.id } });
    const target = await issue(account.userId);
    const first = (await checkout(agent.token, target))[1].run;
    assert.equal(first.leaseUntil, null);
    await refused(checkout(agent.token, target, 'g2'), 409, 'already_running');
    assert.equal((await act(agent.token, first.id, 'close'))[0], 200);
  });

  await t.test('expiry while waiting for the issue lock is recorded before checkout, renew, or close', async () => {
    for (const action of ['checkout', 'renew', 'close']) {
      const target = await issue(devA);
      const { run } = (await checkout(devA.token, target))[1];
      let release, ready;
      const held = new Promise(resolve => { release = resolve; }), locked = new Promise(resolve => { ready = resolve; });
      const competing = raw.$transaction(async tx => {
        await tx.$queryRaw`SELECT "id" FROM "Issue" WHERE "id" = ${target.id} FOR UPDATE`;
        await tx.agentRun.update({ where: { id: run.id }, data: { leaseUntil: new Date(Date.now() + 1200) } });
        ready(); await held;
      }, { timeout: 15000 });
      await locked;
      const pending = action === 'checkout' ? checkout(devA.token, target, 'g2') : act(devA.token, run.id, action);
      try {
        await new Promise(resolve => setTimeout(resolve, 1500));
      } finally { release(); await competing; }
      const [status, body] = await pending;
      assert.equal(status, action === 'close' ? 200 : 409);
      if (action !== 'close') assert.equal(body.error, action === 'renew' ? 'run_fenced' : 'needs_person');
      assert.equal((await stored(run.id)).state, action === 'close' ? 'stopped' : 'lost');
      assert.equal((await activities(target, 'AGENT_RUN_LOST')).length, 1);
      if (action !== 'close') await act(devA.token, run.id, 'close');
    }
  });

  await t.test('rule 5: a lapsed lease is lost on the next read, needs a person or the runner\'s close, and then resumes', async () => {
    const target = await issue(devA, { priority: 'low' });
    const { run } = (await checkout(devA.token, target))[1];
    await lapse(run.id);
    // Several readers at once report it once.
    const reads = await Promise.all([devA.token, devA.token, otherA.token, personToken].map(inbox));
    assert.equal(reads[0].some(item => item.issueId === target.id), false);
    assert.equal((await stored(run.id)).state, 'lost');
    const [lost] = await activities(target, 'AGENT_RUN_LOST');
    assert.deepEqual([lost.userId, lost.projectId, JSON.parse(lost.details).runId], [devA.userId, A, run.id]);
    // Reading again does not report it again.
    await inbox(devA.token);
    assert.equal((await activities(target, 'AGENT_RUN_LOST')).length, 1);

    await refused(checkout(devA.token, target, 'g2'), 409, 'needs_person');
    // Lost is the end of that session's lease: it cannot renew its way back, and another generation cannot close it.
    await refused(act(devA.token, run.id, 'renew'), 409, 'run_fenced');
    await refused(act(devA.token, run.id, 'close', 'g2'), 409, 'run_fenced');
    await refused(act(otherA.token, run.id, 'close'), 404, 'not_found');
    assert.equal((await stored(run.id)).state, 'lost');

    const [status, closed] = await act(devA.token, run.id, 'close');
    assert.deepEqual([status, closed.run.state], [200, 'stopped']);
    assert.ok(closed.run.endedAt);
    const items = await inbox(devA.token);
    assert.deepEqual(items.filter(item => item.issueId === target.id).map(item => [item.issueId, item.reason]), [[target.id, 'resume']]);
    // And it can be taken again.
    assert.equal((await checkout(devA.token, target, 'g2'))[0], 200);
  });

  await t.test('a lease that lapsed is lost whoever reads first: a checkout, a renew, or reading the run', async () => {
    const byCheckout = await issue(devA);
    const first = (await checkout(devA.token, byCheckout))[1].run;
    await lapse(first.id);
    await refused(checkout(devA.token, byCheckout, 'g2'), 409, 'needs_person');
    assert.equal((await stored(first.id)).state, 'lost');

    const byRenew = await issue(devA);
    const second = (await checkout(devA.token, byRenew))[1].run;
    await lapse(second.id);
    await refused(act(devA.token, second.id, 'renew'), 409, 'run_fenced');
    assert.equal((await stored(second.id)).state, 'lost');

    const byRead = await issue(devA);
    const third = (await checkout(devA.token, byRead))[1].run;
    await lapse(third.id);
    const [status, body] = await read(devA.token, third.id);
    assert.deepEqual([status, body.run.state, body.run.ask], [200, 'lost', null]);
    // A run is read by the account that holds it.
    await refused(read(otherA.token, third.id), 404, 'not_found');
    for (const run of [first, second, third]) assert.equal((await act(devA.token, run.id, 'close'))[0], 200);
  });

  await t.test('a renew within the lease extends it; another generation, or a run that ended, is fenced', async () => {
    const target = await issue(devA);
    const { run } = (await checkout(devA.token, target))[1];
    await raw.agentRun.update({ where: { id: run.id }, data: { leaseUntil: new Date(Date.now() + 5000) } });
    const [status, renewed] = await act(devA.token, run.id, 'renew');
    assert.equal(status, 200);
    assert.ok(Date.parse(renewed.run.leaseUntil) - Date.now() > 55_000);
    await refused(act(devA.token, run.id, 'renew', 'g2'), 409, 'run_fenced');
    assert.equal((await act(devA.token, run.id, 'close'))[0], 200);
    await refused(act(devA.token, run.id, 'renew'), 409, 'run_fenced');
    await refused(act(devA.token, run.id, 'close'), 409, 'run_fenced');
    await refused(call(one.PATCH, devA.token, { id: run.id, body: { event: 'finish', generation: 'g1' } }), 400, 'invalid_request');
  });

  await t.test("a release seat's unfinished run is cleared only by a person with the assign permission", async () => {
    const target = await issue(release, { agentRequestRole: 'release' });
    const { run } = (await checkout(release.token, target))[1];
    await refused(act(release.token, run.id, 'close'), 409, 'needs_person');
    assert.equal((await stored(run.id)).state, 'running');
    // A run that is still held cannot be cleared.
    await refused(clear(target, run.id), 409, 'not_lost');
    await lapse(run.id);
    await refused(act(release.token, run.id, 'close'), 409, 'needs_person');

    session = null;
    assert.equal((await clear(target, run.id))[0], 401);
    session = viewer;
    await refused(clear(target, run.id), 403, 'forbidden');
    session = 'cstranger001';
    await refused(clear(target, run.id), 404, 'not_found');
    session = person;
    // The run is named together with its issue.
    await refused(clear(await issue(devA), run.id), 404, 'not_found');
    assert.equal((await stored(run.id)).state, 'lost');

    const [status, cleared] = await clear(target, run.id);
    assert.deepEqual([status, cleared.run.state], [200, 'stopped']);
    const [entry] = await activities(target, 'AGENT_RUN_CLEARED');
    assert.deepEqual([entry.userId, JSON.parse(entry.details).runId], [person, run.id]);
    assert.deepEqual((await inbox(release.token)).map(item => [item.issueId, item.reason]), [[target.id, 'resume']]);
    await refused(clear(target, run.id), 409, 'not_lost');
    // Clearing is itself a read: a lease that lapsed unseen is lost by then.
    const again = (await checkout(release.token, target, 'g2'))[1].run;
    await lapse(again.id);
    assert.equal((await clear(target, again.id))[1].run.state, 'stopped');
  });

  await t.test("a person's run has no lease, is never lost, and starting again returns the run that is open", async () => {
    const target = await issue(person);
    const [status, { run }] = await checkout(personToken, target);
    assert.deepEqual([status, run.leaseUntil, run.state], [200, null, 'running']);
    assert.equal((await stored(run.id)).seatId, null);
    await raw.agentRun.update({ where: { id: run.id }, data: { startedAt: ago(86_400) } });
    await inbox(personToken);
    assert.equal((await stored(run.id)).state, 'running');
    const [again, second] = await checkout(personToken, target, 'g2');
    assert.deepEqual([again, second.run.id, second.run.generation], [200, run.id, 'g1']);
    assert.deepEqual([(await act(personToken, run.id, 'renew'))[0], (await stored(run.id)).leaseUntil], [200, null]);
    assert.equal((await act(personToken, run.id, 'close'))[1].run.state, 'stopped');
  });

  await t.test('seats and people cannot take each other\'s issues, and a seat takes nothing outside its project', async () => {
    const ofSeat = await issue(devA), ofPerson = await issue(person), free = await issue(null);
    await refused(checkout(personToken, ofSeat), 403, 'not_assigned');
    await refused(checkout(devA.token, ofPerson), 403, 'not_assigned');
    await refused(checkout(otherA.token, ofSeat), 403, 'not_assigned');
    await refused(checkout(devA.token, free), 403, 'not_assigned');
    // Even one that carries its name.
    const elsewhere = await issue(devA.userId, { project: B });
    await refused(checkout(devA.token, elsewhere), 403, 'wrong_project');
    const trashed = await issue(devA);
    await raw.issue.update({ where: { id: trashed.id }, data: { deletedAt: new Date() } });
    await refused(checkout(devA.token, trashed), 404, 'not_found');
    await refused(checkout(devA.token, { issueKey: 'K-0' }), 404, 'not_found');
    await refused(call(runs.POST, devA.token, { body: { issue: ofSeat.issueKey, generation: 'g1' } }), 400, 'invalid_request');
    assert.equal(await raw.agentRun.count({ where: { issueId: { in: [ofSeat.id, ofPerson.id, free.id, elsewhere.id, trashed.id] } } }), 0);

    const retired = await seat('dev-retired', A);
    const left = await issue(retired);
    await seats.retireSeat({ workspaceId: 'w', actorId: owner, seatId: retired.id });
    await raw.issue.update({ where: { id: left.id }, data: { assigneeId: retired.userId } });
    await refused(checkout(retired.token, left), 403, 'seat_scope');
  });

  await t.test('review focus 1: an issue reassigned while its run is open fences the run and changes nothing', async () => {
    const target = await issue(devA);
    const { run } = (await checkout(devA.token, target))[1];
    await raw.issue.update({ where: { id: target.id }, data: { assigneeId: person } });
    const before = await stored(run.id);
    await refused(act(devA.token, run.id, 'renew'), 409, 'run_fenced');
    assert.deepEqual(await stored(run.id), before);
    assert.deepEqual([await statusOf(target), (await raw.issue.findUniqueOrThrow({ where: { id: target.id } })).assigneeId], [`${A}-in_progress`, person]);
    // The new owner cannot start until the old session is confirmed gone, which its runner can still do.
    await refused(checkout(personToken, target), 409, 'already_running');
    assert.equal((await act(devA.token, run.id, 'close'))[1].run.state, 'stopped');
    assert.equal((await checkout(personToken, target))[0], 200);
  });

  await t.test('a checkout waits for a reassignment or a retirement that is under way and then sees it', async () => {
    /** Holds `change` open in a transaction, starts a checkout, shows it waits on `lock`, then lets the change commit. */
    const during = async (change, lock, target, by) => {
      let release, ready;
      const held = new Promise(resolve => { release = resolve; }), locked = new Promise(resolve => { ready = resolve; });
      const competing = raw.$transaction(async tx => { await change(tx); ready(); await held; }, { timeout: 15000 });
      await locked;
      const taking = checkout(by.token, target);
      try {
        const deadline = Date.now() + 5000;
        let blocked = false;
        while (!blocked && Date.now() < deadline) {
          const rows = await raw.$queryRaw`SELECT 1 FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND query LIKE ${`%${lock}%`} AND pid <> pg_backend_pid()`;
          blocked = rows.length > 0;
          if (!blocked) await new Promise(resolve => setTimeout(resolve, 20));
        }
        assert.ok(blocked, `the checkout waits on ${lock}`);
      } finally {
        release();
        await competing;
      }
      return taking;
    };
    const reassigned = await issue(devA);
    await refused(during(tx => tx.issue.update({ where: { id: reassigned.id }, data: { assigneeId: person } }), '"Issue"%FOR UPDATE', reassigned, devA), 403, 'not_assigned');
    // Retiring a seat locks its row first, as here, and a retired seat takes nothing.
    const leaving = await seat('dev-leaving', A);
    const kept = await issue(leaving);
    await refused(during(tx => tx.agentSeat.update({ where: { id: leaving.id }, data: { retiredAt: new Date() } }), '"AgentSeat"%FOR SHARE', kept, leaving), 403, 'seat_scope');
    assert.equal(await raw.agentRun.count({ where: { issueId: { in: [reassigned.id, kept.id] } } }), 0);
  });

  await t.test("a Forge-connected project's issue is not taken here", async () => {
    const target = await issue(devA);
    forge = true;
    try { await refused(checkout(devA.token, target), 409, 'forge_connected_project'); } finally { forge = false; }
    assert.equal(await statusOf(target), `${A}-to_do`);
  });

  await t.test('a seat cannot be retired while it holds a run, and a seat token reaches the run routes only for its own work', async () => {
    const target = await issue(otherA);
    const { run } = (await checkout(otherA.token, target))[1];
    await assert.rejects(seats.retireSeat({ workspaceId: 'w', actorId: owner, seatId: otherA.id }), error => error.code === 'already_running');
    await refused(act(devA.token, run.id, 'renew'), 404, 'not_found');
    await refused(read(personToken, run.id), 404, 'not_found');
    assert.equal((await act(otherA.token, run.id, 'close'))[0], 200);
  });
});
