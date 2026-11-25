const { assert, test, load } = require('./helpers.cjs');

const { commentHtml } = load('src/lib/comment-html.ts', { 'isomorphic-dompurify': { default: require('isomorphic-dompurify') }, marked: require('marked') });
const library = load('src/lib/issue-templates.ts', { '@/lib/comment-html': { commentHtml } });
const { STANDARD_TEMPLATES } = library;
const plain = value => JSON.parse(JSON.stringify(value));
const edited = { sections: [{ title: 'What broke', required: true, guidance: 'One sentence.' }], requiredFields: ['priority', 'labels'] };

// The signed-in person's account role and membership role, for the real authority module.
const LEVEL = { PRIMARY_OWNER: ['DEVELOPER', null], OWNER: ['DEVELOPER', 'OWNER'], ADMIN: ['DEVELOPER', 'ADMIN'], STANDARD: ['DEVELOPER', 'MEMBER'],
  PLATFORM: ['SYSTEM_ADMIN', null], PLATFORM_MEMBER: ['SYSTEM_ADMIN', 'MEMBER'] };

// A workspace with its stored templates, one signed-in person, and the real store, authority module and settings route.
function workspace({ user = 'admin', canManage = true, level = canManage ? 'OWNER' : 'STANDARD', member = true, rows = [], enforced = false } = {}) {
  const [accountRole, memberRole] = LEVEL[level];
  const authority = load('src/lib/workspace-authority.ts', { './prisma': { prisma: {
    workspace: { findUnique: async () => ({ ownerId: level === 'PRIMARY_OWNER' ? user : 'someone-else' }) },
    user: { findUnique: async () => ({ role: accountRole, workspaceMemberships: memberRole ? [{ role: memberRole }] : [] }) },
  } } });
  const state = { rows: rows.map(row => ({ workspaceId: 'workspace-one', version: 2, ...row })), writes: [], enforced };
  const same = (row, where) => row.workspaceId === where.workspaceId && row.issueType === where.issueType;
  const prisma = {
    workspace: {
      findUnique: async () => ({ issueTemplatesEnforced: state.enforced }),
      update: async ({ data }) => { state.writes.push('enforce'); state.enforced = data.issueTemplatesEnforced; return {}; },
    },
    issueTemplate: {
      findMany: async ({ where }) => state.rows.filter(row => row.workspaceId === where.workspaceId),
      upsert: async ({ where, create, update }) => {
        state.writes.push('save');
        let row = state.rows.find(candidate => same(candidate, where.workspaceId_issueType));
        if (row) Object.assign(row, { ...update, version: row.version + update.version.increment });
        else state.rows.push(row = { ...create });
        return row;
      },
      deleteMany: async ({ where }) => {
        state.writes.push('reset');
        state.rows = state.rows.filter(row => !same(row, where));
        return { count: 1 };
      },
    },
  };
  const dependencies = {
    'next/server': { NextResponse: Response },
    '@/lib/prisma': { prisma },
    '@/lib/issue-templates': library,
    '@/lib/request-session': { getServerSession: async () => (user ? { user: { id: user } } : null) },
    '@/lib/auth-options': { authOptions: {} },
    '@/lib/issue-finder': { userHasWorkspaceAccess: async () => member },
    '@/lib/workspace-authority': authority,
    // Everyone holds every permission here, so a route that still asked one would let an Admin through.
    '@/lib/permissions': { Permission: { MANAGE_WORKSPACE_SETTINGS: 'MANAGE_WORKSPACE_SETTINGS' }, checkUserPermission: async () => ({ hasPermission: true }) },
  };
  const store = load('src/lib/issue-template-store.ts', dependencies);
  const route = load('src/app/api/workspaces/[workspaceId]/issue-templates/route.ts', { ...dependencies, '@/lib/issue-template-store': store }, { console });
  const params = { params: Promise.resolve({ workspaceId: 'workspace-one' }) };
  return {
    state, store,
    get: () => route.GET(new Request('https://example.test/api'), params),
    put: body => route.PUT(new Request('https://example.test/api', { method: 'PUT', body: JSON.stringify(body) }), params),
  };
}

test('a workspace that has edited nothing gets the standards, not enforced', async () => {
  const { enforced, templates } = await workspace().store.getWorkspaceTemplates('workspace-one');
  assert.equal(enforced, false);
  assert.deepEqual(plain(templates), plain(STANDARD_TEMPLATES));
});

test('an edited type replaces its standard and leaves the other types alone', async () => {
  const { enforced, templates } = await workspace({ rows: [{ issueType: 'BUG', version: 4, ...edited }], enforced: true }).store.getWorkspaceTemplates('workspace-one');
  assert.equal(enforced, true);
  assert.deepEqual(plain(templates.BUG), { type: 'BUG', version: 4, standard: false, ...edited });
  assert.deepEqual(plain(templates.TASK), plain(STANDARD_TEMPLATES.TASK));
});

test('a stored template that no longer passes the checks gives way to the standard', async () => {
  const broken = { issueType: 'BUG', sections: [{ title: '', required: true, guidance: '' }], requiredFields: ['color'] };
  const { templates } = await workspace({ rows: [broken, { issueType: 'SUBTASK', ...edited }] }).store.getWorkspaceTemplates('workspace-one');
  assert.deepEqual(plain(templates), plain(STANDARD_TEMPLATES));
});

test('malformed section properties are refused on save and fall back when stored', async () => {
  for (const section of [{ title: 'Summary', required: 'true', guidance: '' }, { title: 'Summary', required: true, guidance: 42 }]) {
    const input = { sections: [section], requiredFields: [] };
    const admin = workspace({ rows: [{ issueType: 'BUG', ...input }] });
    assert.deepEqual(plain((await admin.store.getWorkspaceTemplates('workspace-one')).templates.BUG), plain(STANDARD_TEMPLATES.BUG));
    assert.equal((await admin.put({ type: 'BUG', ...input })).status, 400);
    assert.deepEqual(admin.state.writes, []);
  }
});

test('saving a type stores it with a rising version, and resetting brings the standard back', async () => {
  const { state, store } = workspace();
  const first = await store.saveWorkspaceTemplate('workspace-one', 'BUG', edited, 'admin');
  assert.deepEqual(plain(first), { type: 'BUG', version: 2, standard: false, ...edited });
  const second = await store.saveWorkspaceTemplate('workspace-one', 'BUG', { ...edited, requiredFields: [] }, 'admin');
  assert.deepEqual([second.version, state.rows.length, state.rows[0].updatedById], [3, 1, 'admin']);
  assert.deepEqual(plain(await store.resetWorkspaceTemplate('workspace-one', 'BUG')), plain(STANDARD_TEMPLATES.BUG));
  assert.equal(state.rows.length, 0);
});

test('any member can read the templates and learns whether they may manage them', async () => {
  const response = await workspace({ user: 'member', canManage: false }).get();
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual([body.enforced, body.canManage, body.templates.length], [false, false, 5]);
  assert.ok(body.templates[0].body.startsWith('## Summary\n'));
  assert.equal((await (await workspace().get()).json()).canManage, true);
});

test('templates are not shown without a sign-in or to someone outside the workspace', async () => {
  assert.equal((await workspace({ user: null }).get()).status, 401);
  assert.equal((await workspace({ member: false }).get()).status, 404);
  assert.equal((await workspace({ user: null }).put({ type: 'BUG', ...edited })).status, 401);
});

test('only someone who may manage workspace settings can change a template', async () => {
  const outsider = workspace({ canManage: false });
  const response = await outsider.put({ type: 'BUG', ...edited });
  assert.equal(response.status, 403);
  assert.deepEqual(outsider.state.writes, []);
  assert.equal((await outsider.put({ type: 'BUG', reset: true })).status, 403);
  assert.deepEqual(outsider.state.writes, []);
});

test('a manager saves a template, and resets it to the standard', async () => {
  const admin = workspace();
  const saved = await admin.put({ type: 'bug', ...edited });
  assert.equal(saved.status, 200);
  assert.deepEqual(plain((await saved.json()).template).sections, edited.sections);
  assert.deepEqual(admin.state.writes, ['save']);
  const reset = await admin.put({ type: 'BUG', reset: true });
  assert.equal(reset.status, 200);
  assert.equal((await reset.json()).template.standard, true);
  assert.deepEqual(admin.state.writes, ['save', 'reset']);
});

test('a template that breaks the rules, or a type without templates, is refused and nothing is stored', async () => {
  const admin = workspace();
  const invalid = await admin.put({ type: 'BUG', sections: [{ title: 'A', required: true, guidance: '' }, { title: 'a', required: true, guidance: '' }], requiredFields: [] });
  assert.equal(invalid.status, 400);
  assert.match((await invalid.json()).error, /more than once/);
  for (const type of ['SUBTASK', 'nope', undefined]) assert.equal((await admin.put({ type, ...edited })).status, 400, String(type));
  assert.deepEqual(admin.state.writes, []);
});

test('an Owner and the primary owner save and switch enforcement; an Admin and a standard role that holds MANAGE_WORKSPACE_SETTINGS are refused; every member still reads', async () => {
  for (const level of ['PRIMARY_OWNER', 'OWNER', 'PLATFORM', 'PLATFORM_MEMBER']) {
    const allowed = workspace({ level });
    assert.equal((await allowed.put({ type: 'BUG', ...edited })).status, 200, level);
    assert.equal((await allowed.put({ enforced: true })).status, 200, level);
    assert.deepEqual([allowed.state.writes, allowed.state.enforced], [['save', 'enforce'], true], level);
    assert.equal((await (await allowed.get()).json()).canManage, true, level);
  }
  for (const level of ['ADMIN', 'STANDARD']) {
    const refused = workspace({ level });
    for (const body of [{ type: 'BUG', ...edited }, { type: 'BUG', reset: true }, { enforced: true }]) assert.equal((await refused.put(body)).status, 403, level);
    assert.deepEqual([refused.state.writes, refused.state.enforced], [[], false], level);
    const read = await refused.get();
    assert.deepEqual([read.status, (await read.json()).canManage], [200, false], level);
  }
});

test('only a manager switches enforcement for agents, and reading the templates shows it', async () => {
  const outsider = workspace({ canManage: false });
  assert.equal((await outsider.put({ enforced: true })).status, 403);
  assert.deepEqual([outsider.state.writes, outsider.state.enforced], [[], false]);

  const admin = workspace();
  const on = await admin.put({ enforced: true });
  assert.deepEqual([on.status, await on.json()], [200, { enforced: true }]);
  assert.equal((await (await admin.get()).json()).enforced, true);
  assert.equal((await admin.put({ enforced: false })).status, 200);
  assert.equal((await (await admin.get()).json()).enforced, false);
  // Anything but true or false is not a switch.
  assert.equal((await admin.put({ enforced: 'yes' })).status, 400);
  assert.deepEqual(admin.state.writes, ['enforce', 'enforce']);
});
