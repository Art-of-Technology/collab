const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { load } = require('../security/helpers.cjs');
const { seatsDatabase } = require('./seats-db.cjs');

// The admin is a system admin; the owner owns a workspace and the member is in it; the seat is an agent's account.
const admin = 'cadmin00001', owner = 'cowner00001', member = 'cmember0001', seat = 'cseat000001';

let db;
after(() => db?.stop());

test("a system admin edits a role's platform prompt, with a history", async t => {
  db = await seatsDatabase(async prisma => {
    await prisma.user.create({ data: { id: admin, name: 'Ada Admin', role: 'SYSTEM_ADMIN' } });
    await prisma.user.createMany({ data: [owner, member, seat].map(id => ({ id, name: id })) });
    await prisma.workspace.create({ data: { id: 'w', name: 'w', slug: 'w', ownerId: owner } });
    await prisma.workspaceMember.createMany({ data: [member, seat].map(userId => ({ workspaceId: 'w', userId })) });
  });
  const { prisma } = db;
  const { ROLE_CATALOGUE } = load('src/lib/agent-role-catalogue.ts');
  const plain = value => JSON.parse(JSON.stringify(value));
  // The signed-in person, or null for a request with no session: an agent token is a bearer header, never a session.
  let user = admin;
  const session = { getServerSession: async () => user ? { user: { id: user } } : null };
  const deps = { zod: require('zod'), 'node:crypto': require('node:crypto'), '@/lib/prisma': { prisma }, 'next/server': { NextResponse: Response },
    '@/lib/request-session': session, '@/lib/auth-options': { authOptions: {} } };
  deps['@/lib/system-admin'] = load('src/lib/system-admin.ts', deps);
  deps['@/lib/agent-platform-prompts'] = load('src/lib/agent-platform-prompts.ts', deps, { Date });
  const { readPlatformPrompts } = deps['@/lib/agent-platform-prompts'];
  const route = load('src/app/api/admin/agent-roles/[role]/route.ts', deps);
  const { readRoleInstructions } = load('src/lib/agent-role-instructions.ts', { ...deps, '@/lib/post-access': load('src/lib/post-access.ts'),
    '@/lib/permissions': { Permission: {}, checkUserPermission: async () => ({ hasPermission: false }) } });

  const shipped = id => ROLE_CATALOGUE.getRole(id).platformPrompt;
  /** Posts `body` for `role` as the signed-in person `as`, with any extra headers: the status and the body. */
  const post = async (as, role, body, headers = {}) => {
    user = as;
    const reply = await route.POST(new Request('https://collab.test/api', { method: 'POST', headers, body: JSON.stringify(body) }), { params: Promise.resolve({ role }) });
    return [reply.status, await reply.json()];
  };
  const entries = () => prisma.agentPlatformPrompt.findMany({ orderBy: [{ role: 'asc' }, { version: 'asc' }],
    select: { id: true, role: true, version: true, text: true, reason: true, createdById: true, createdAt: true } });
  const developer = async () => (await readPlatformPrompts()).roles.find(role => role.id === 'developer');

  await t.test('with no edit, every role is in force as the repository ships it', async () => {
    const view = await readPlatformPrompts();
    assert.deepEqual(plain(view.roles.map(role => role.id)), plain(ROLE_CATALOGUE.roles.map(role => role.id)));
    for (const role of view.roles) {
      assert.deepEqual(plain([role.repository, role.inForce, role.history]), plain([shipped(role.id), { source: 'repository', text: shipped(role.id) }, []]));
    }
  });

  await t.test('only a system admin may save: a workspace owner, a member, a seat account and an agent token are refused', async () => {
    for (const [as, status, headers] of [[owner, 403], [member, 403], [seat, 403], [null, 401, { Authorization: 'Bearer collab_at_seat_token' }]]) {
      assert.equal((await post(as, 'developer', { action: 'save', text: 'Mine now.', reason: 'Because.' }, headers))[0], status, String(as));
    }
    assert.deepEqual(await entries(), []);
    // Someone who stopped being a system admin is refused at once: the role is read from the database, not the session.
    await prisma.user.update({ where: { id: owner }, data: { role: 'SYSTEM_ADMIN' } });
    await prisma.user.update({ where: { id: owner }, data: { role: 'DEVELOPER' } });
    assert.equal((await post(owner, 'developer', { action: 'save', text: 'Mine now.', reason: 'Because.' }))[0], 403);
  });

  await t.test('a save is in force at once, with who, when and why, and the shipped text stays readable', async () => {
    const [status, reply] = await post(admin, 'developer', { action: 'save', text: '  Work the issue.\nAsk {{ownerId}}.  ', reason: '  Shorter rules.  ' });
    assert.equal(status, 200, JSON.stringify(reply));
    const rows = await entries();
    assert.deepEqual(plain(rows.map(row => [row.role, row.version, row.text, row.reason, row.createdById])), [['developer', 1, 'Work the issue.\nAsk {{ownerId}}.', 'Shorter rules.', admin]]);
    const role = await developer();
    assert.deepEqual(plain(reply.role), plain(role));
    assert.equal(role.repository, shipped('developer'));
    assert.deepEqual(plain(role.inForce), plain({ source: 'edit', text: 'Work the issue.\nAsk {{ownerId}}.', version: 1, reason: 'Shorter rules.',
      by: { id: admin, name: 'Ada Admin' }, at: rows[0].createdAt, shippedNewer: false }));
    assert.deepEqual(plain(role.history), plain([{ id: rows[0].id, version: 1, text: 'Work the issue.\nAsk {{ownerId}}.', reason: 'Shorter rules.', by: { id: admin, name: 'Ada Admin' }, at: rows[0].createdAt }]));
    // Another role is untouched.
    assert.equal((await readPlatformPrompts()).roles.find(other => other.id === 'reviewer').inForce.source, 'repository');
  });

  await t.test("the workspace's Roles page shows the text in force, still locked for the organisation", async () => {
    const view = await readRoleInstructions(member, 'w');
    assert.equal(view.canEdit, false);
    assert.equal(view.roles.find(role => role.id === 'developer').platform, "Work the issue.\nAsk a person's Collab user id.");
    assert.equal(view.roles.find(role => role.id === 'reviewer').platform, ROLE_CATALOGUE.instructionLayers('reviewer', { ownerId: null })[0].text);
  });

  await t.test('an empty text, a missing reason, a text over the limit, an unchanged text or a role outside the catalogue is refused', async () => {
    const before = await entries();
    for (const [role, body, status] of [
      ['developer', { action: 'save', text: '   ', reason: 'Empty.' }, 400],
      ['developer', { action: 'save', text: 'New.', reason: '  ' }, 400],
      ['developer', { action: 'save', text: 'New.' }, 400],
      ['developer', { action: 'save', text: 'New.', reason: 'Two\nlines.' }, 400],
      ['developer', { action: 'save', text: 'x'.repeat(8_001), reason: 'Long.' }, 400],
      ['developer', { action: 'save', text: 'Work the issue.\nAsk {{ownerId}}.', reason: 'Again.' }, 409],
      ['developer', { action: 'save', text: 'New.', reason: 'Why.', role: 'lead' }, 400],
      ['developer', { action: 'delete', reason: 'Why.' }, 400],
      ['qa-tester', { action: 'save', text: 'New.', reason: 'Why.' }, 404],
    ]) assert.equal((await post(admin, role, body))[0], status, JSON.stringify(body));
    assert.deepEqual(await entries(), before);
  });

  await t.test('restoring a version adds an entry; no entry is ever changed or removed', async () => {
    await post(admin, 'developer', { action: 'save', text: 'Second text.', reason: 'Try another.' });
    const [first, second] = await entries();
    assert.equal((await developer()).inForce.text, 'Second text.');
    const [status] = await post(admin, 'developer', { action: 'restore', versionId: first.id, reason: 'The first was better.' });
    assert.equal(status, 200);
    const rows = await entries();
    assert.deepEqual(plain(rows.slice(0, 2)), plain([first, second]));
    assert.deepEqual(plain([rows[2].version, rows[2].text, rows[2].reason]), [3, 'Work the issue.\nAsk {{ownerId}}.', 'The first was better.']);
    // Newest first in the history.
    assert.deepEqual(plain((await developer()).history.map(entry => entry.version)), [3, 2, 1]);
    // A version of another role, or one that does not exist, cannot be restored here.
    const [, reviewer] = await post(admin, 'reviewer', { action: 'save', text: 'Review it.', reason: 'Reviewer rules.' });
    assert.equal((await post(admin, 'developer', { action: 'restore', versionId: reviewer.role.history[0].id, reason: 'Wrong role.' }))[0], 404);
    assert.equal((await post(admin, 'developer', { action: 'restore', versionId: 'cnosuchentry', reason: 'Nothing.' }))[0], 404);
    assert.equal((await entries()).filter(row => row.role === 'developer').length, 3);
  });

  await t.test("back to the repository's text ends the edit, and is an entry too", async () => {
    const [status, reply] = await post(admin, 'developer', { action: 'repository', reason: 'The release fixed it.' });
    assert.equal(status, 200);
    assert.deepEqual(plain(reply.role.inForce), plain({ source: 'repository', text: shipped('developer') }));
    assert.deepEqual(plain(reply.role.history.map(entry => [entry.version, entry.text, entry.reason])).slice(0, 1), [[4, null, 'The release fixed it.']]);
    assert.equal((await readRoleInstructions(member, 'w')).roles.find(role => role.id === 'developer').platform,
      ROLE_CATALOGUE.instructionLayers('developer', { ownerId: null })[0].text);
    // Already the repository's text: nothing to end.
    assert.equal((await post(admin, 'developer', { action: 'repository', reason: 'Again.' }))[0], 409);
    // An older edit restored is in force again.
    const [, again] = await post(admin, 'developer', { action: 'restore', versionId: reply.role.history[2].id, reason: 'Back to version 2.' });
    assert.equal(again.role.inForce.text, 'Second text.');
  });

  await t.test('a release that changes the shipped text leaves the edit in force and says the shipped text is newer', async () => {
    assert.equal((await developer()).inForce.shippedNewer, false);
    // The edit was saved over a shipped text that this build no longer ships.
    await prisma.agentPlatformPrompt.updateMany({ where: { role: 'developer' }, data: { shippedSha256: createHash('sha256').update('an older release').digest('hex') } });
    const role = await developer();
    assert.deepEqual(plain([role.inForce.source, role.inForce.text, role.inForce.shippedNewer, role.repository]), ['edit', 'Second text.', true, shipped('developer')]);
  });

  await t.test('two saves at once: one is kept, the other is told to read again', async () => {
    const replies = await Promise.all([1, 2, 3].map(n => post(admin, 'lead', { action: 'save', text: `Lead ${n}.`, reason: `Save ${n}.` })));
    assert.ok(replies.some(([status]) => status === 200));
    assert.ok(replies.every(([status]) => status === 200 || status === 409), JSON.stringify(replies));
    const versions = (await entries()).filter(row => row.role === 'lead').map(row => row.version);
    assert.deepEqual(versions, versions.map((_, index) => index + 1));
  });

  await t.test('an admin who leaves keeps their entries, with no name', async () => {
    const editor = 'cleaver0001';
    await prisma.user.create({ data: { id: editor, name: 'Leaver', role: 'SYSTEM_ADMIN' } });
    await post(editor, 'planner', { action: 'save', text: 'Plan it.', reason: 'Planner rules.' });
    await prisma.user.delete({ where: { id: editor } });
    const planner = (await readPlatformPrompts()).roles.find(role => role.id === 'planner');
    assert.deepEqual(plain([planner.inForce.text, planner.inForce.by, planner.history[0].by]), ['Plan it.', null, null]);
  });
});
