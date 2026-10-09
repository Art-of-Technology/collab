const { test, assert, load, matches } = require('./helpers.cjs');

function harness() {
  const workspace = { id: 'w', name: 'Team', slug: 'team', ownerId: 'bob', members: [{ userId: 'alice', status: true, role: 'MEMBER' }] };
  const foreign = { id: 'foreign', ownerId: 'eve', members: [] };
  const now = new Date('2026-10-08T12:00:00Z');
  const projects = [
    { id: 'p', name: 'Pipeline', slug: 'pipeline', description: 'Project overview', workspaceId: 'w', workspace, updatedAt: now, isArchived: false },
    { id: 'p2', name: 'Dependency', slug: 'dependency', workspaceId: 'w', workspace, updatedAt: now },
    { id: 'foreign', name: 'Private', slug: 'private', workspaceId: 'foreign', workspace: foreign, updatedAt: now },
  ];
  const rows = { issue: [], issueRelation: [], issueActivity: [], note: [] };
  const state = { scopes: ['prompts:read', 'issues:read', 'context:read'], afterNotes: null };
  function select(row, fields) {
    if (!row || !fields) return row;
    return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, value === true ? row[key] : select(row[key], value.select)]));
  }
  const db = {
    workspace: { findFirst: async ({ where }) => matches(workspace, where) ? workspace : null },
    project: { findFirst: async ({ where, select: fields }) => select(projects.find(p => matches(p, where)) || null, fields) },
    user: { findUnique: async () => ({ id: 'alice', name: 'Alice', email: 'alice@example.test' }) },
    appToken: { findMany: async () => [{ accessToken: 'Y2lwaGVy', userId: 'alice', scopes: state.scopes, tokenExpiresAt: null,
      installation: { id: 'installation', appId: 'app', status: 'ACTIVE', workspaceId: 'w', installedById: 'bob', scopes: [], workspace,
        app: { id: 'app', name: 'App', slug: 'app', status: 'PUBLISHED' } } }] },
  };
  for (const [type, records] of Object.entries(rows)) db[type] = { findMany: async ({ where, select: fields, orderBy = [], take }) => {
    const found = records.filter(r => matches(r, where)).sort((a, b) => {
      for (const entry of orderBy) for (const [key, direction] of Object.entries(entry)) {
        if (a[key] < b[key]) return direction === 'asc' ? -1 : 1;
        if (a[key] > b[key]) return direction === 'asc' ? 1 : -1;
      }
      return 0;
    }).slice(0, take).map(row => select(row, fields));
    if (type === 'note' && state.afterNotes) state.afterNotes();
    return found;
  } };
  const finder = load('src/lib/issue-finder.ts', { '@/lib/prisma': { prisma: db }, '@/lib/shared-issue-key-utils': load('src/lib/shared-issue-key-utils.ts') });
  const scopes = load('src/lib/oauth-scopes.ts');
  const access = load('src/lib/secrets/access.ts', { '@/lib/prisma': { prisma: db }, '@/lib/issue-finder': finder });
  const queryModule = load('src/lib/agent-search-query.ts', { zod: require('zod') }, { Buffer });
  const dependencies = { '@/lib/prisma': { prisma: db }, '@/lib/issue-finder': finder, '@/lib/secrets/access': access,
    '@/lib/oauth-scopes': scopes, '@/lib/html-sanitizer': load('src/lib/html-sanitizer.ts') };
  const service = load('src/lib/agent-project-context.ts', { ...dependencies, zod: require('zod'), './agent-search-query': queryModule }, { Buffer });
  const auth = load('src/lib/apps/auth-middleware.ts', { 'next/server': { NextResponse: Response }, '@/lib/prisma': { prisma: db },
    '@/lib/oauth-scopes': scopes, '@/lib/apps/crypto': { decryptToken: async () => 'test-token' } }, { Buffer, URL, console });
  const route = load('src/app/api/apps/auth/ai-context/route.ts', { ...dependencies,
    'next/server': { NextResponse: Response }, '@/lib/apps/auth-middleware': auth,
    '@/lib/agent-project-context': service, '@/lib/agent-search-query': queryModule,
  }, { URL, console });
  function issue(id, fields = {}) {
    const row = { id, issueKey: `APP-${id}`, title: `Issue ${id}`, workspaceId: 'w', workspace, project: projects[0], projectId: 'p',
      parentId: null, priority: 'medium', statusId: 'todo', status: 'TODO', statusValue: null,
      projectStatus: { id: 'todo', name: 'TODO', isFinal: false, project: projects[0] },
      assignee: { id: 'alice', name: 'Alice' }, updatedAt: now, dueDate: null, ...fields };
    rows.issue.push(row); return row;
  }
  function relation(id, sourceIssue, targetIssue, relationType = 'BLOCKS') {
    const row = { id, sourceIssue, targetIssue, sourceIssueId: sourceIssue.id, targetIssueId: targetIssue.id, relationType, updatedAt: now };
    rows.issueRelation.push(row); return row;
  }
  function note(id, fields = {}) {
    const row = { id, title: `Note ${id}`, content: 'Useful project context', type: 'GUIDE', scope: 'PROJECT', projectId: 'p', project: projects[0],
      workspaceId: 'w', workspace, authorId: 'bob', isRestricted: false, isEncrypted: false, expiresAt: null, sharedWith: [],
      isAiContext: false, isPinned: false, aiContextPriority: 0, updatedAt: now, ...fields };
    rows.note.push(row); return row;
  }
  function activity(id, parent, fields = {}) {
    const row = { id, itemId: parent.id, itemType: 'ISSUE', action: 'UPDATED', fieldName: 'status', details: 'Work advanced',
      projectId: parent.projectId, workspaceId: parent.workspaceId, createdAt: now, ...fields };
    rows.issueActivity.push(row); return row;
  }
  async function call(params = {}, token = true) {
    const request = new Request(`https://example.test/api/apps/auth/ai-context?${new URLSearchParams({ projectId: 'p', includePipeline: 'true', since: '2026-10-01T00:00:00Z', ...params })}`,
      { headers: token ? { authorization: 'Bearer test-token' } : {} });
    const response = await route.GET(request, { params: Promise.resolve({}) });
    return { status: response.status, body: await response.json() };
  }
  return { call, issue, relation, note, activity, rows, workspace, projects, foreign, state };
}

test('project context returns status, assigned owners, active blockers, dependencies, parents, changes and Notes in one response', async () => {
  const h = harness(); const parent = h.issue('parent'); const child = h.issue('child', { parentId: parent.id });
  const done = h.issue('done', { projectStatus: { id: 'done', name: 'DONE', isFinal: true, project: h.projects[0] } });
  h.issue('legacy', { statusId: null, projectStatus: null, status: 'closed', assignee: null });
  const external = h.issue('external', { projectId: 'p2', project: h.projects[1] });
  h.relation('block', external, child); h.relation('resolved', done, child); h.relation('parent-edge', child, parent, 'PARENT');
  h.note('project'); h.note('instructions', { type: 'SYSTEM_PROMPT', isAiContext: true, isPinned: true });
  h.note('workspace', { scope: 'WORKSPACE', projectId: null, project: null });
  h.activity('change', child);
  const { status, body } = await h.call({ maxTokens: '64000' });
  assert.equal(status, 200);
  assert.equal(body.project.id, 'p'); assert.equal(body.summary.totalIssues, 4);
  assert.equal(body.summary.completedIssues, 1); assert.equal(body.summary.unknownCompletion, 1);
  assert.equal(body.summary.unassignedIssues, 1);
  assert.equal(body.owners.items[0].issueCount, 3);
  assert.deepEqual(body.blockers.items.map(r => r.id), ['block']);
  assert.deepEqual(body.dependencies.items.map(r => r.id), ['block', 'resolved']);
  assert.equal(body.parents.items.length, 1); assert.equal(body.parents.items[0].id, 'parent-edge');
  assert.equal(body.parents.items[0].source.id, 'child'); assert.equal(body.parents.items[0].target.id, 'parent');
  assert.ok(body.recentChanges.items.some(r => r.type === 'activity' && r.id === 'change'));
  assert.deepEqual(body.notes.items.map(n => n.id), ['instructions', 'project', 'workspace']);
  assert.equal(body.metadata.freshness, 'canonical_database');
  assert.ok(body.notes.items.every(n => n.url && n.updatedAt));
});

test('project context enforces real token scopes, project ownership and active membership', async () => {
  const h = harness(); h.issue('visible');
  assert.equal((await h.call({}, false)).status, 401);
  assert.equal((await h.call({ projectId: 'foreign' })).status, 404);
  assert.equal((await h.call({ maxTokens: '1' })).status, 400);
  h.state.scopes = ['prompts:read']; assert.equal((await h.call()).status, 403);
  h.state.scopes.push('issues:read', 'context:read');
  h.workspace.members[0].status = false; assert.equal((await h.call()).status, 403);
});

test('project context excludes inaccessible dependency endpoints, secrets, revoked Notes and orphan activity', async () => {
  const h = harness(); const allowed = h.issue('allowed');
  const foreign = h.issue('private', { projectId: 'foreign', project: h.projects[2], workspaceId: 'foreign', workspace: h.foreign });
  h.issue('corrupt-project', { projectId: 'foreign', project: h.projects[2] });
  h.issue('secret-parent-link', { parentId: foreign.id }); h.relation('secret-block', foreign, allowed); h.relation('secret-parent', allowed, foreign, 'PARENT');
  h.note('visible'); h.note('revoked', { isRestricted: true }); h.note('expired', { expiresAt: new Date('2020-01-01') });
  h.note('private', { scope: 'PERSONAL', authorId: 'alice' }); h.note('encrypted', { isEncrypted: true, authorId: 'alice' });
  h.note('foreign', { workspaceId: 'foreign', workspace: h.foreign });
  h.note('other-project', { projectId: 'p2', project: h.projects[1] });
  for (const type of ['ENV_VARS', 'API_KEYS', 'CREDENTIALS']) h.note(type, { type, authorId: 'alice' });
  h.activity('orphan', { id: 'deleted', projectId: 'p', workspaceId: 'w' }); h.activity('foreign', foreign);
  const { status, body } = await h.call();
  assert.equal(status, 200); assert.equal(body.summary.totalIssues, 2);
  assert.deepEqual(body.blockers.items, []); assert.deepEqual(body.dependencies.items, []); assert.deepEqual(body.parents.items, []);
  assert.deepEqual(body.notes.items.map(n => n.id), ['visible']);
  assert.ok(body.recentChanges.items.every(r => r.type === 'issue'));
  assert.equal(JSON.stringify(body).includes('private'), false);
});

test('project context fails closed when workspace membership is revoked during retrieval', async () => {
  const h = harness(); h.issue('visible'); h.note('visible');
  h.state.afterNotes = () => { h.workspace.members[0].status = false; };
  assert.equal((await h.call()).status, 403);
});

test('project context budgets cover the whole JSON and shortened sections advance pagination', async () => {
  const h = harness();
  for (let i = 0; i < 15; i++) { h.issue(`issue-${i}`); h.note(`note-${i}`, { content: 'Context '.repeat(100) }); }
  const { status, body } = await h.call({ limit: '10', maxTokens: '5000' });
  assert.equal(status, 200);
  assert.ok(Buffer.byteLength(JSON.stringify(body)) <= body.metadata.budget.tokenUpperBound);
  assert.ok(body.metadata.budget.tokenUpperBound <= 5000);
  assert.equal(body.metadata.budget.truncated, true);
  for (const section of ['recentChanges', 'notes']) {
    assert.ok(body[section].items.length >= 1);
    assert.equal(body[section].pagination.nextOffset, body[section].items.length);
  }
});

test('existing prompt-only callers retain their response and scope requirements', async () => {
  const h = harness(); h.state.scopes = ['prompts:read'];
  h.note('system', { type: 'SYSTEM_PROMPT', isAiContext: true });
  const { status, body } = await h.call({ includePipeline: 'false' });
  assert.equal(status, 200); assert.ok(body.systemPrompts.some(p => p.id === 'system'));
  assert.ok(body.mergedContext.includes('Useful project context')); assert.equal(body.summary, undefined);
});

test('prompt-only callers can opt into a bounded response without losing the first instruction', async () => {
  const h = harness(); h.state.scopes = ['prompts:read'];
  for (let i = 0; i < 10; i++) h.note(`system-${i}`, { type: 'SYSTEM_PROMPT', isAiContext: true, content: 'Instruction '.repeat(200) });
  const { status, body } = await h.call({ includePipeline: 'false', maxTokens: '5000' });
  assert.equal(status, 200); assert.ok(body.systemPrompts.length >= 1);
  assert.ok(Buffer.byteLength(JSON.stringify(body)) <= body.metadata.budget.tokenUpperBound);
  assert.ok(body.metadata.budget.tokenUpperBound <= 5000); assert.equal(body.metadata.budget.truncated, true);
  assert.equal((await h.call({ includePipeline: 'invalid' })).status, 400);
});

test('project context normalizes both blocker representations across project boundaries and completion states', async () => {
  for (const representation of ['BLOCKS', 'BLOCKED_BY']) for (const externalSource of [false, true]) {
    const h = harness();
    const source = h.issue('source', externalSource ? { projectId: 'p2', project: h.projects[1] } : {});
    const target = h.issue('target', externalSource ? {} : { projectId: 'p2', project: h.projects[1] });
    const add = (id, from, to) => h.relation(id, representation === 'BLOCKS' ? from : to, representation === 'BLOCKS' ? to : from, representation);
    add('active', source, target);
    const legacy = h.issue('legacy', { projectStatus: null, statusId: null, status: 'closed' });
    const done = h.issue('done', { projectStatus: { id: 'done', name: 'DONE', isFinal: true, project: h.projects[0] } });
    add('unknown', legacy, target); add('source-done', done, target); add('target-done', source, done);
    const hidden = h.issue('hidden', { projectId: 'foreign', project: h.projects[2], workspaceId: 'foreign', workspace: h.foreign });
    add('hidden-source', hidden, target); add('hidden-target', source, hidden);
    const { status, body } = await h.call({ maxTokens: '64000' });
    assert.equal(status, 200);
    assert.deepEqual(body.blockers.items.map(r => r.id), ['active', 'unknown']);
    assert.deepEqual(body.dependencies.items.map(r => r.id), ['active', 'source-done', 'target-done', 'unknown']);
    const active = body.dependencies.items.find(r => r.id === 'active');
    assert.equal(active.type, 'BLOCKS'); assert.equal(active.source.id, source.id); assert.equal(active.target.id, target.id);
    assert.equal(body.blockers.items.find(r => r.id === 'unknown').source.completed, null);
    assert.ok(!JSON.stringify(body).includes('hidden'));
  }
});

test('project context bounds final sections and accepts every normal and budget-shortened boundary cursor', async t => {
  for (const section of ['recentChanges', 'parents', 'notes']) await t.test(section, async () => {
    const h = harness();
    const issue = h.issue('issue', { parentId: section === 'parents' ? 'parent' : null });
    if (section === 'parents') h.issue('parent', { projectId: 'p2', project: h.projects[1] });
    for (let i = 0; i < (section === 'notes' ? 50000 : 49999); i++) {
      const id = String(i).padStart(5, '0');
      if (section === 'notes') h.note(id, { content: 'Context '.repeat(100) });
      if (section === 'recentChanges') h.activity(id, issue, { details: 'Change '.repeat(100) });
      if (section === 'parents') {
        const child = h.issue(id, { projectId: 'p2', project: h.projects[1], parentId: i % 2 ? null : issue.id });
        if (i % 2) h.relation(id, child, issue, 'PARENT');
      }
    }
    const ordinary = await h.call({ offset: '49990', limit: '5', maxTokens: '64000' });
    assert.equal(ordinary.status, 200);
    assert.equal(ordinary.body[section].pagination.nextOffset, 49995);
    const last = await h.call({ offset: String(ordinary.body[section].pagination.nextOffset), limit: '5', maxTokens: '64000' });
    assert.equal(last.status, 200);
    assert.equal(last.body[section].items.length, 5);
    assert.equal(last.body[section].pagination.nextOffset, null);
    const shortened = await h.call({ offset: '49990', limit: '10', maxTokens: '3000' });
    assert.equal(shortened.status, 200);
    assert.equal(shortened.body.metadata.budget.truncated, true);
    assert.ok(Buffer.byteLength(JSON.stringify(shortened.body)) <= 3000);
    const cursor = shortened.body[section].pagination.nextOffset;
    assert.ok(cursor > 49990 && cursor < 50000);
    assert.equal(cursor, 49990 + shortened.body[section].items.length);
    assert.equal((await h.call({ offset: String(cursor), maxTokens: '64000' })).status, 200);
    if (section === 'notes') h.note('overflow');
    if (section === 'recentChanges') h.activity('overflow', issue);
    if (section === 'parents') h.issue('overflow', { projectId: 'p2', project: h.projects[1], parentId: issue.id });
    for (const offset of ['0', '50000']) {
      const response = await h.call({ offset, maxTokens: '64000' });
      assert.equal(response.status, 422);
      assert.equal(response.body.error, 'scope_too_large');
    }
  });
});
