const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Prisma } = require('@prisma/client');
const { load } = require('../security/helpers.cjs');
const { seatsDatabase } = require('./seats-db.cjs');

const owner = 'cowner00001', person = 'cperson0001';
// S switches to seats, H keeps handoffs, N has no status a run could use, C has claims to carry over.
const S = 'cprojects001', H = 'cprojecth001', N = 'cprojectn001', C = 'cprojectc001';
const scopes = ['issues:read', 'issues:write', 'user:read'];

let db;
after(() => db?.stop());

test('agent mode: a project gives agents work by handoffs or by seats', async t => {
  db = await seatsDatabase(async prisma => {
    await prisma.user.createMany({ data: [owner, person].map(id => ({ id, name: id, email: `${id}@example.test` })) });
    await prisma.workspace.create({ data: { id: 'w', name: 'w', slug: 'w', ownerId: owner } });
    await prisma.workspaceMember.create({ data: { workspaceId: 'w', userId: person } });
    for (const [id, issuePrefix, names] of [[S, 'S'], [H, 'H'], [C, 'C'], [N, 'N', ['backlog', 'shipping']]]) {
      await prisma.project.create({ data: { id, workspaceId: 'w', name: id, slug: issuePrefix.toLowerCase(), issuePrefix } });
      await prisma.projectStatus.createMany({ data: (names ?? ['to_do', 'in_progress', 'done']).map((name, order) => ({ id: `${id}-${name}`, projectId: id, name,
        displayName: name, order, isDefault: order === 0, isFinal: name === 'done' })) });
    }
    await prisma.app.create({ data: { id: 'agent-app', name: 'collab-agent', slug: 'collab-agent', publisherId: 'system', status: 'PUBLISHED', visibility: 'PRIVATE', isSystemApp: true,
      scopes: { create: scopes.map(scope => ({ scope })) } } });
    await prisma.taskLabel.createMany({ data: ['Review request', 'Release request', 'Docs request', 'Changelog request', 'backend'].map(name => ({ id: name, workspaceId: 'w', name, color: '#123456' })) });
  });
  // The application's client, so Trash is hidden here as it is in production.
  const raw = db.prisma;
  const prisma = raw.$extends(load('src/lib/issue-visibility.ts').issueVisibilityExtension(Prisma.dmmf.datamodel.models));

  const crypto = { encryptToken: async value => Buffer.from(value), decryptToken: async data => Buffer.from(data).toString(), getEncryptionKey: () => {} };
  const zod = require('zod');
  const response = { NextResponse: Response };
  const handoffs = load('src/lib/agent-handoffs.ts', { 'node:crypto': require('node:crypto'), 'node:buffer': require('node:buffer'), zod,
    '@/lib/prisma': { prisma }, '@/lib/issue-finder': load('src/lib/issue-finder.ts', { '@/lib/prisma': { prisma } }), '@/lib/oauth-scopes': load('src/lib/oauth-scopes.ts') }, { Date });
  const tokens = load('src/lib/agent-tokens.ts', { crypto: require('node:crypto'), '@/lib/prisma': { prisma }, '@/lib/apps/crypto': crypto }, { Buffer, Date });
  const assignee = load('src/lib/issue-assignee.ts', { './agent-handoffs': handoffs });
  const seats = load('src/lib/agent-seats.ts', { '@/lib/prisma': { prisma }, '@/lib/agent-handoffs': handoffs, '@/lib/agent-tokens': tokens, '@/lib/issue-assignee': assignee }, { Date });
  const templates = load('src/lib/issue-templates.ts', { '@/lib/comment-html': load('src/lib/comment-html.ts', { 'isomorphic-dompurify': { default: require('isomorphic-dompurify') }, marked: require('marked') }) });
  const deps = { zod, 'next/server': response, '@/lib/prisma': { prisma }, '@/lib/apps/auth-middleware': {}, '@/lib/agent-seats': seats, '@/lib/issue-assignee': assignee, '@/lib/agent-handoffs': handoffs,
    '@/lib/forge/legacy-write-guard': { ForgeProjectWriteError: class extends Error {}, assertLegacyIssueWriteAllowed: async () => {}, assertLegacyProjectWriteAllowed: async () => {} },
    '@/lib/issue-finder': {}, '@/lib/permissions': {}, '@/lib/agent-tokens': tokens, '@/lib/issue-templates': templates, '@/lib/issue-template-store': load('src/lib/issue-template-store.ts', { '@/lib/prisma': { prisma }, '@/lib/issue-templates': templates }),
    '@/lib/event-bus': { emitIssueCreated: async () => {} } };
  deps['@/lib/agent-runs'] = load('src/lib/agent-runs.ts', deps, { Date });
  const requests = deps['@/lib/agent-requests'] = load('src/lib/agent-requests.ts', deps, { Date });
  const { enqueueLabelHandoff } = load('src/lib/agent-label-triggers.ts', { 'node:crypto': require('node:crypto'), '@/lib/agent-requests': requests });
  const mode = deps['@/lib/agent-mode'] = load('src/lib/agent-mode.ts', deps, { Date });

  const context = user => ({ user: { id: user }, workspace: { id: 'w', name: 'w', slug: 'w' }, token: { scopes: [...scopes, 'workspace:write'] } });
  const boss = context(owner);
  const register = (name, labelIds = []) => handoffs.registerAgent(boss, handoffs.registrationSchema.parse({ name, labelIds }));
  const send = (issue, data) => handoffs.sendHandoff(boss, handoffs.sendSchema.parse({ agent: 'lead', issue, content: 'Do this, then report.', toAgents: ['worker'], ...data }));
  const act = (handoff, action, agent = 'worker') => handoffs.actOnHandoff(boss, handoff.id,
    handoffs.actionSchema.parse({ agent, action, ...(['progress', 'complete', 'release'].includes(action) && { content: 'Where it stands.' }) }));
  const offer = (handoff, requestId = randomUUID()) => handoffs.createTransferOffer(boss, handoffs.transferOfferSchema.parse({ agent: 'worker', handoffId: handoff.id, toAgent: 'lead', requestId, content: 'Take this over.' }));
  const offerAct = (made, action, agent = 'lead') => handoffs.actOnTransferOffer(boss, made.id, handoffs.transferOfferActionSchema.parse({ agent, action }));
  const refused = (pending, code, status) => assert.rejects(pending, error => {
    assert.deepEqual([error.code, error.status], [code, status], error.message);
    return true;
  });
  // What the loaded modules return belongs to their own realm: compare it as plain data.
  const plain = value => JSON.parse(JSON.stringify(value));
  const set = async (projectId, input) => plain(await mode.setAgentMode({ workspaceId: 'w', projectId, actorId: owner, ...input }));
  const read = async projectId => plain(await mode.agentModeState(prisma, projectId));
  const seat = async (name, projectId, role = 'developer') => (await seats.createSeat({ workspaceId: 'w', actorId: owner, projectId, role, ownerId: person, name, expiresInDays: 30 })).seat;
  let count = 0;
  const issue = (projectId, data = {}) => raw.issue.create({ data: { workspaceId: 'w', projectId, title: `Issue ${++count}`, issueKey: `K-${count}`,
    statusId: `${projectId}-${projectId === N ? 'backlog' : 'to_do'}`, ...data } });
  /** A label edit as the issue routes make it: the labels and what they set off commit together. */
  const label = (by, target, names) => prisma.$transaction(async tx => {
    const before = await tx.issue.findUniqueOrThrow({ where: { id: target.id }, include: { labels: true } });
    const changed = await tx.issue.update({ where: { id: target.id }, data: { labels: { set: names.map(id => ({ id })) } }, include: { labels: true } });
    return enqueueLabelHandoff(tx, by, changed, before.labels.map(row => row.id));
  }, { isolationLevel: 'Serializable' });
  const requestsFor = target => raw.issue.findMany({ where: { agentRequestRole: { not: null }, sourceRelations: { some: { targetIssueId: target.id } } },
    orderBy: { createdAt: 'asc' }, include: { labels: true, sourceRelations: true, helpers: true } });
  const handoffCount = target => raw.agentHandoff.count({ where: { issueId: target.id } });

  await register('lead'); await register('worker', ['backend', 'Release request']); await register('solo');
  const devS = await seat('dev-s', S), revS = await seat('rev-s', S, 'reviewer'), relS = await seat('rel-s', S, 'release');

  await t.test('rule 9: a project that uses seats refuses new handoffs and claims, keeps the old ones readable, and its neighbour is untouched', async () => {
    const work = await issue(S), other = await issue(H);
    const open = await send(work.id), held = await send(work.id), moving = await send(work.id), offered = await send(work.id);
    for (const handoff of [held, moving, offered]) await act(handoff, 'claim');
    const sameRequest = randomUUID(), pending = await offer(offered, sameRequest);
    await label(person, work, ['backend']);
    assert.equal(await handoffCount(work), 5, 'before the switch a subscribed label hands the issue to its subscribers');

    const state = await set(S, { mode: 'seats' });
    assert.equal(state.mode, 'seats');
    assert.ok(Date.parse(state.switchedAt) > Date.now() - 60_000);
    assert.deepEqual((await raw.appAuditLog.findMany({ where: { action: 'project.agent_mode' } })).map(row => [row.actorId, row.details]),
      [[owner, { projectId: S, from: 'handoffs', to: 'seats' }]]);

    await refused(send(work.id), 'project_uses_seats', 409);
    await refused(act(open, 'claim'), 'project_uses_seats', 409);
    await refused(act(held, 'claim'), 'project_uses_seats', 409);
    await refused(offer(moving), 'project_uses_seats', 409);
    await refused(offer(offered, sameRequest), 'project_uses_seats', 409);
    await refused(offerAct(pending, 'accept'), 'project_uses_seats', 409);
    await label(person, work, []);
    await label(person, work, ['backend']);
    assert.equal(await handoffCount(work), 5, 'a subscribed label hands a seats project issue to nobody');

    // What was there stays readable, and work claimed before the switch can be reported on and closed.
    assert.equal((await handoffs.getHandoff(boss, 'worker', open.id)).handoff.status, 'open');
    assert.ok((await handoffs.agentInbox(boss, handoffs.inboxSchema.parse({ agent: 'worker' }))).items.some(item => item.id === open.id));
    await act(held, 'progress');
    assert.equal((await act(held, 'complete')).status, 'completed');
    assert.equal((await offerAct(pending, 'cancel', 'worker')).status, 'cancelled');
    assert.equal((await act(moving, 'release')).status, 'open');

    // The project beside it, in the same workspace, works as it always did.
    const sent = await send(other.id);
    assert.equal((await act(sent, 'claim')).status, 'claimed');
    const accepted = await offerAct(await offer(sent), 'accept');
    assert.equal(accepted.handoff.status, 'claimed');
    await label(person, other, ['backend', 'Release request']);
    assert.equal(await handoffCount(other), 3, 'one handoff for the labels, beside the one sent and the transfer');
    assert.deepEqual(await requestsFor(other), [], 'and no request: a label asks a seat only where the project uses seats');
  });

  await t.test('rule 9: in a seats project the Release request and Review request labels each file one request', async () => {
    const work = await issue(S, { title: 'Ship the thing', priority: 'high', assigneeId: devS.userId });
    await label(person, work, ['Release request']);
    let filed = await requestsFor(work);
    assert.equal(filed.length, 1);
    const [release] = filed;
    assert.deepEqual([release.projectId, release.assigneeId, release.reporterId, release.agentRequestRole, release.type, release.priority, release.statusId, release.title],
      [S, relS.userId, person, 'release', 'TASK', 'high', `${S}-to_do`, `Release request: ${work.issueKey} Ship the thing`]);
    assert.match(release.issueKey, /^S-\d+$/);
    assert.match(release.description, new RegExp(`"Release request" label to ${work.issueKey}`));
    assert.deepEqual(release.helpers.map(helper => [helper.userId, helper.role, helper.status]), [[relS.userId, 'ASSIGNEE', 'APPROVED']]);
    assert.deepEqual(release.sourceRelations.map(relation => [relation.targetIssueId, relation.relationType, relation.createdBy]), [[work.id, 'RELATES_TO', person]]);
    assert.deepEqual(release.labels.map(row => row.name), ['Release request'], 'people see what it is by its label');
    assert.equal(await handoffCount(work), 0, 'the label has a subscriber, and still hands the issue to nobody');

    // Asking twice asks once: saved again, taken off and put back, and by two people at the same moment.
    await label(person, work, ['Release request']);
    await label(person, work, []);
    await label(owner, work, ['Release request']);
    assert.equal((await requestsFor(work)).length, 1);
    const raced = await issue(S);
    const race = await Promise.allSettled([label(person, raced, ['Release request']), label(owner, raced, ['Release request'])]);
    assert.ok(race.some(result => result.status === 'fulfilled'), JSON.stringify(race));
    assert.equal((await requestsFor(raced)).length, 1);

    // Once that release is done, the label asks for the next one.
    await raw.issue.update({ where: { id: release.id }, data: { statusId: `${S}-done` } });
    await label(person, work, []);
    await label(person, work, ['Release request']);
    assert.equal((await requestsFor(work)).length, 2);

    // A request is not asked for again by its own label, nor by the other one.
    await label(person, release, []);
    await label(person, release, ['Release request', 'Review request']);
    assert.deepEqual(await requestsFor(release), []);

    // Review goes to the reviewer seat; both labels in one edit ask for both.
    const both = await issue(S);
    await label(person, both, ['Review request', 'Release request', 'backend']);
    filed = await requestsFor(both);
    assert.deepEqual(filed.map(row => [row.agentRequestRole, row.assigneeId, row.labels.map(tag => tag.name).join()]).sort(),
      [['release', relS.userId, 'Release request'], ['review', revS.userId, 'Review request']]);

    // A request a seat filed by command counts: the label does not ask a second time.
    const asked = await issue(S, { assigneeId: devS.userId });
    await requests.fileRequest(context(devS.userId), { role: 'review', title: 'Review this', body: 'Please.', fromIssue: asked.id });
    await label(person, asked, ['Review request']);
    assert.equal((await requestsFor(asked)).length, 1);

    // The seat a request would go to cannot ask itself.
    await refused(label(relS.userId, await issue(S), ['Release request']), 'invalid_request', 400);

    // An agent token that is not a seat asks for a release by label, as a person does, and for a review it does not.
    await tokens.createAgentToken({ workspaceId: 'w', actorId: owner, name: 'crm', access: 'write', expiresInDays: 30 });
    const crm = await raw.user.findFirstOrThrow({ where: { name: 'crm' } }), unasked = await issue(S);
    await label(person, asked, []);
    await refused(label(crm.id, asked, ['Review request']), 'assign_by_person', 403);
    await refused(label(crm.id, asked, ['Review request', 'Release request']), 'assign_by_person', 403);
    assert.equal((await requestsFor(asked)).length, 1);
    assert.deepEqual((await raw.issue.findUniqueOrThrow({ where: { id: asked.id }, include: { labels: true } })).labels, []);
    await refused(label(crm.id, unasked, ['Review request']), 'assign_by_person', 403);
    await refused(label(crm.id, unasked, ['Review request', 'Release request']), 'assign_by_person', 403);
    assert.deepEqual(await requestsFor(unasked), []);
    await label(crm.id, unasked, ['backend', 'Release request']);
    filed = await requestsFor(unasked);
    assert.deepEqual(filed.map(row => [row.agentRequestRole, row.assigneeId, row.reporterId]), [['release', relS.userId, crm.id]]);
    await label(crm.id, unasked, ['backend']);
    await label(crm.id, unasked, ['backend', 'Release request']);
    assert.equal((await requestsFor(unasked)).length, 1, 'asking again while the request is open files nothing');

    // With no seat to take it, the edit is refused whole: the label is not left on the issue asking nobody.
    await seats.retireSeat({ workspaceId: 'w', actorId: owner, seatId: revS.id });
    const unheard = await issue(S);
    await refused(label(person, unheard, ['Review request']), 'no_default_seat', 409);
    assert.deepEqual((await raw.issue.findUniqueOrThrow({ where: { id: unheard.id }, include: { labels: true } })).labels, []);
    assert.deepEqual(await requestsFor(unheard), []);
  });

  for (const [role, requestLabel, name] of [
    ['docs', 'Docs request', 'Documentation Manager'],
    ['changelog', 'Changelog request', 'Changelog Manager'],
  ]) {
    await t.test(`${role} requests reach the ${name} through the request schema or a label`, async () => {
      const manager = await seat(`${role}-s`, S, role);
      const source = await issue(S, { assigneeId: devS.userId });
      const request = requests.requestSchema.parse({ role, title: requestLabel, body: 'Prepare the release update.', fromIssue: source.id });
      const { issue: filed } = await requests.fileRequest(context(devS.userId), request);
      assert.deepEqual((await requestsFor(source)).map(row => [row.id, row.agentRequestRole, row.assigneeId, row.labels.map(tag => tag.name)]),
        [[filed.id, role, manager.userId, [requestLabel]]]);

      const labelled = await issue(S);
      await tokens.createAgentToken({ workspaceId: 'w', actorId: owner, name: `${role}-integration`, access: 'write', expiresInDays: 30 });
      const integration = await raw.user.findFirstOrThrow({ where: { name: `${role}-integration` } });
      await refused(label(integration.id, labelled, [requestLabel]), 'assign_by_person', 403);
      assert.deepEqual(await requestsFor(labelled), []);
      await label(person, labelled, [requestLabel]);
      assert.deepEqual((await requestsFor(labelled)).map(row => [row.agentRequestRole, row.assigneeId, row.labels.map(tag => tag.name)]),
        [[role, manager.userId, [requestLabel]]]);
    });
  }

  await t.test('rule 9: a project switches back to handoffs, but not while a run is open in it', async () => {
    const work = await issue(S, { assigneeId: devS.userId });
    const run = await raw.agentRun.create({ data: { workspaceId: 'w', issueId: work.id, seatId: devS.id, userId: devS.userId, runner: 'test', generation: 'one' } });
    await refused(set(S, { mode: 'handoffs' }), 'run_open', 409);
    assert.equal((await read(S)).mode, 'seats');
    await raw.agentRun.update({ where: { id: run.id }, data: { state: 'finished', endedAt: new Date() } });
    const state = await set(S, { mode: 'handoffs' });
    assert.deepEqual([state.mode, state.switchedAt], ['handoffs', null]);
    assert.equal((await send(work.id)).status, 'open', 'handoffs work again');
  });

  await t.test('the switch shows every status with its group and is refused until a run has somewhere to start and to end', async () => {
    assert.deepEqual((await read(S)).statuses, [{ id: `${S}-to_do`, name: 'to_do', category: 'todo' },
      { id: `${S}-in_progress`, name: 'in_progress', category: 'in_progress' }, { id: `${S}-done`, name: 'done', category: 'done' }]);
    assert.deepEqual((await read(N)).statuses.map(status => status.category), ['todo', 'todo']);

    const none = await set(N, { mode: 'seats' }).catch(error => error);
    assert.deepEqual([none.code, none.status, plain(none.body)], ['status_groups_required', 422, { missing: ['in_progress', 'done'] }]);
    // A refused switch keeps nothing, the regrouping sent with it included.
    const half = await set(N, { mode: 'seats', categories: { [`${N}-shipping`]: 'done' } }).catch(error => error);
    assert.deepEqual([half.code, plain(half.body)], ['status_groups_required', { missing: ['in_progress'] }]);
    assert.deepEqual((await read(N)).statuses.map(status => status.category), ['todo', 'todo']);
    await refused(set(N, { categories: { [`${S}-done`]: 'blocked' } }), 'invalid_request', 400);
    assert.equal((await raw.projectStatus.findUniqueOrThrow({ where: { id: `${S}-done` } })).category, 'done', "another project's status is not regrouped from here");

    // Groups can be corrected on their own, and with the switch.
    assert.deepEqual((await set(N, { categories: { [`${N}-shipping`]: 'done' } })).statuses.map(status => status.category), ['todo', 'done']);
    const switched = await set(N, { mode: 'seats', categories: { [`${N}-backlog`]: 'in_progress' } });
    assert.deepEqual([switched.mode, switched.statuses.map(status => status.category)], ['seats', ['in_progress', 'done']]);
    await refused(set('cmissing0001', { mode: 'seats' }), 'project_not_found', 404);
    await refused(mode.setAgentMode({ workspaceId: 'elsewhere', projectId: S, actorId: owner, mode: 'seats' }), 'project_not_found', 404);
  });

  await t.test('the switch carries over the claims touched in the last seven days, and only the ones a person picks', async () => {
    const devC = await seat('dev-c', C);
    const claim = async (target, agent = 'solo', touched) => {
      const handoff = await send(target.id, { toAgents: [agent] });
      await act(handoff, 'claim', agent);
      if (touched) await raw.$executeRaw`UPDATE "AgentHandoff" SET "updatedAt" = ${touched} WHERE "id" = ${handoff.id}`;
      return handoff;
    };
    const recent = await issue(C, { assigneeId: person }), stale = await issue(C), done = await issue(C, { statusId: `${C}-done` });
    await raw.issueAssignee.createMany({ data: [
      { issueId: recent.id, userId: person, role: 'ASSIGNEE', status: 'APPROVED', approvedBy: owner },
      { issueId: recent.id, userId: owner, role: 'HELPER', status: 'APPROVED', approvedBy: owner },
      // An assignee row from before the last reassignment, which the issue editor leaves behind.
      { issueId: recent.id, userId: devS.userId, role: 'ASSIGNEE', status: 'APPROVED', approvedBy: owner },
    ] });
    const seated = await issue(C, { assigneeId: devC.userId }), shared = await issue(C), request = await issue(C, { agentRequestRole: 'release' });
    const handoff = await claim(recent, 'solo', new Date(Date.now() - 6 * 86_400_000));
    await claim(recent, 'worker', new Date(Date.now() - 6.5 * 86_400_000));
    await claim(stale, 'solo', new Date(Date.now() - 8 * 86_400_000));
    for (const target of [done, seated, request]) await claim(target);
    await claim(shared, 'worker');
    await claim(await issue(H), 'lead');

    const before = await read(C);
    assert.deepEqual(before.claims.map(row => [row.issueKey, row.agent, row.assignee, row.handoffId === handoff.id]),
      [[shared.issueKey, 'worker', null, false], [recent.issueKey, 'solo', person, true]], 'newest first, one row per issue, its latest claim');
    assert.deepEqual(before.carryTo, { userId: devC.userId, name: 'dev-c' });
    assert.deepEqual(before.retire, ['solo'], 'the names all of whose claims are in this project; worker and lead hold claims elsewhere too');

    await refused(set(C, { carryOver: [recent.id] }), 'invalid_request', 400);
    await refused(set(C, { mode: 'seats', carryOver: [recent.id, stale.id] }), 'invalid_request', 400);
    assert.deepEqual([(await read(C)).mode, (await raw.issue.findUniqueOrThrow({ where: { id: recent.id } })).assigneeId], ['handoffs', person],
      'a refused carry-over switches nothing and moves nothing');
    assert.ok(await raw.issueAssignee.findUnique({ where: { issueId_userId: { issueId: recent.id, userId: person } } }));
    await refused(set(H, { mode: 'seats', carryOver: [(await read(H)).claims[0].issueId] }), 'no_default_seat', 409);
    assert.equal((await read(H)).mode, 'handoffs');

    const after = await set(C, { mode: 'seats', carryOver: [recent.id] });
    assert.deepEqual(after.claims.map(row => row.issueKey), [shared.issueKey], 'what went to a seat is no longer waiting; what was not picked stays where it was');
    const moved = await raw.issue.findUniqueOrThrow({ where: { id: recent.id }, include: { helpers: true } });
    assert.equal(moved.assigneeId, devC.userId);
    assert.deepEqual(moved.helpers.map(helper => [helper.userId, helper.role, helper.status, helper.approvedBy]).sort(),
      [[devC.userId, 'ASSIGNEE', 'APPROVED', owner], [owner, 'HELPER', 'APPROVED', owner]].sort());
    const [entry] = await raw.issueActivity.findMany({ where: { itemId: recent.id, action: 'ASSIGNED' } });
    assert.deepEqual([entry.userId, entry.projectId, entry.oldValue, entry.newValue, JSON.parse(entry.details)],
      [owner, C, person, devC.userId, { reason: 'seat_carry_over', agent: 'solo', handoffId: handoff.id }]);
    assert.equal((await raw.issue.findUniqueOrThrow({ where: { id: shared.id } })).assigneeId, null);
    assert.equal((await raw.agentHandoff.findUniqueOrThrow({ where: { id: handoff.id } })).status, 'claimed', 'the old claim is left for its agent to be retired');

    // An edit under way when the carry-over starts is waited for, and decides: an issue it finished is no claim to carry.
    const contested = await issue(C), solo = await raw.agentRegistration.findFirstOrThrow({ where: { name: 'solo' } });
    await raw.agentHandoff.create({ data: { workspaceId: 'w', issueId: contested.id, sourceKey: 'contested', content: 'Claimed before the switch.', recipientNames: ['solo'],
      status: 'claimed', claimedById: solo.id, claimedOnce: true } });
    assert.deepEqual((await read(C)).claims.map(row => row.issueKey), [contested.issueKey, shared.issueKey]);
    let reached, release;
    const editing = new Promise(resolve => { reached = resolve; }), held = new Promise(resolve => { release = resolve; });
    const edit = raw.$transaction(async tx => {
      await tx.issue.update({ where: { id: contested.id }, data: { statusId: `${C}-done` } });
      reached();
      await held;
    }, { timeout: 20_000 });
    await editing;
    const carry = set(C, { carryOver: [contested.id] }).then(() => 'carried', error => error.code);
    assert.equal(await Promise.race([carry, new Promise(resolve => setTimeout(() => resolve('waiting'), 500))]), 'waiting');
    release();
    await edit;
    assert.equal(await carry, 'invalid_request');
    assert.equal((await raw.issue.findUniqueOrThrow({ where: { id: contested.id } })).assigneeId, null);
  });

  await t.test('only a person who manages the workspace reads or changes the mode', async () => {
    let session = null, allowed = false;
    const route = load('src/app/api/workspaces/[workspaceId]/projects/[projectSlug]/agent-mode/route.ts', { ...deps,
      '@/lib/agent-runners': load('src/lib/agent-runners.ts', { crypto: require('node:crypto'), '@/lib/prisma': { prisma }, '@/lib/agent-handoffs': handoffs, '@/lib/agent-tokens': tokens }, { Date }),
      '@/lib/request-session': { getServerSession: async () => session }, '@/lib/auth-options': {},
      '@/lib/slug-resolvers': { resolveWorkspaceSlug: async value => (value === 'w' ? 'w' : null) },
      '@/lib/permissions': { Permission: { MANAGE_AGENTS: 'manage' },
        checkUserPermission: async (user, workspace, permission) => ({ hasPermission: allowed && user === owner && workspace === 'w' && permission === 'manage' }) } }, { console });
    const call = async (method, projectSlug, body, workspaceId = 'w') => {
      const reply = await route[method](new Request('https://collab.test/api', { method, ...(body && { body: typeof body === 'string' ? body : JSON.stringify(body) }) }),
        { params: Promise.resolve({ workspaceId, projectSlug }) });
      assert.equal(reply.headers.get('cache-control'), 'no-store');
      return [reply.status, await reply.json()];
    };
    assert.equal((await call('GET', 'h'))[0], 401);
    session = { user: { id: owner } };
    assert.deepEqual([(await call('GET', 'h'))[0], (await call('PATCH', 'h', { mode: 'seats' }))[0], (await call('GET', 'h', null, 'elsewhere'))[0]], [403, 403, 403]);
    assert.equal((await raw.project.findUniqueOrThrow({ where: { id: H } })).agentMode, 'handoffs');
    allowed = true;
    assert.equal((await call('GET', 'nowhere'))[0], 404);
    const [status, state] = await call('GET', 'h');
    assert.deepEqual([status, state.mode, state.statuses.length, state.claims.length], [200, 'handoffs', 3, 2]);
    // With the project's seats that a runner runs: none here.
    assert.deepEqual(state.runnerSeats, []);
    for (const bad of ['{', { mode: 'both' }, { categories: { [`${H}-done`]: 'finished' } }, { mode: 'seats', extra: true }]) assert.equal((await call('PATCH', 'h', bad))[0], 400);
    await raw.projectStatus.update({ where: { id: `${H}-in_progress` }, data: { category: 'todo' } });
    assert.deepEqual(await call('PATCH', 'h', { mode: 'seats' }), [422, { error: (await set(H, { mode: 'seats' }).catch(error => error)).message, code: 'status_groups_required', missing: ['in_progress'] }]);
    const [ok, switched] = await call('PATCH', 'h', { mode: 'seats', categories: { [`${H}-in_progress`]: 'in_progress' } });
    assert.deepEqual([ok, switched.mode, switched.runnerSeats], [200, 'seats', []]);
  });
});
