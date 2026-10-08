const { test, assert, load } = require('./helpers.cjs');

// Execute the real permission predicates; reject unsupported fixture operators.
function matches(row, where) {
  return Object.entries(where).every(([key, value]) => {
    if (value === undefined) return true;
    if (key === 'AND') return value.every(part => matches(row, part));
    if (key === 'OR') return value.some(part => matches(row, part));
    if (key === 'NOT') return !matches(row, value);
    const actual = row?.[key];
    if (value === null || typeof value !== 'object') return actual === value;
    if (Object.prototype.toString.call(value) === '[object Date]') return actual?.getTime() === value.getTime();
    if ('some' in value) return actual?.some(item => matches(item, value.some)) || false;
    const operators = ['in', 'notIn', 'not', 'equals', 'mode', 'gte', 'lte', 'lt', 'gt'];
    if (Object.keys(value).some(k => operators.includes(k))) return Object.entries(value).every(([op, expected]) => {
      switch (op) {
        case 'in': return expected.includes(actual);
        case 'notIn': return !expected.includes(actual);
        case 'not': return actual !== expected;
        case 'equals': return value.mode === 'insensitive' ? actual?.toLowerCase() === expected.toLowerCase() : actual === expected;
        case 'mode': return true;
        case 'gte': return actual != null && actual >= expected;
        case 'lte': return actual != null && actual <= expected;
        case 'lt': return actual != null && actual < expected;
        case 'gt': return actual != null && actual > expected;
        default: throw new Error(`Unsupported fixture operator ${op}`);
      }
    });
    return actual != null && matches(actual, value);
  });
}

function harness() {
  const scopes = load('src/lib/oauth-scopes.ts');
  const workspace = { id: 'w', slug: 'team', name: 'Team', ownerId: 'bob', members: [{ userId: 'alice', status: true, role: 'MEMBER' }] };
  const foreign = { id: 'foreign', ownerId: 'eve', members: [] };
  const projects = [{ id: 'p', workspaceId: 'w', workspace }, { id: 'p2', workspaceId: 'w', workspace }, { id: 'foreign', workspaceId: 'foreign', workspace: foreign }];
  const rows = { issue: [], note: [], issueActivity: [] };
  const state = { scopes: ['issues:read', 'context:read'], lexicalReads: 0, beforeHydrate: null, vectorResult: null };
  const db = {
    workspace: { findFirst: async ({ where }) => matches(workspace, where) ? workspace : null },
    project: { findFirst: async ({ where }) => projects.find(p => matches(p, where)) || null },
    user: { findUnique: async () => ({ id: 'alice', email: 'alice@example.test', name: 'Alice' }) },
    appToken: { findMany: async () => [{ accessToken: 'Y2lwaGVy', userId: 'alice', scopes: state.scopes, tokenExpiresAt: null,
      installation: { id: 'installation', appId: 'app', status: 'ACTIVE', workspaceId: 'w', installedById: 'bob', scopes: [], workspace,
        app: { id: 'app', name: 'App', slug: 'app', status: 'PUBLISHED' } } }] },
  };
  for (const [type, records] of Object.entries(rows)) db[type] = { findMany: async ({ where, take }) => records.filter(r => matches(r, where)).slice(0, take) };
  const finder = load('src/lib/issue-finder.ts', {
    '@/lib/prisma': { prisma: db }, '@/lib/shared-issue-key-utils': load('src/lib/shared-issue-key-utils.ts'),
  });
  const access = load('src/lib/secrets/access.ts', { '@/lib/prisma': { prisma: db }, '@/lib/issue-finder': finder });
  const queryModule = load('src/lib/agent-search-query.ts', { zod: require('zod') }, { Buffer });
  const noVectors = load('src/lib/agent-search-vectors.ts', {
    '@qdrant/js-client-rest': { QdrantClient: class { constructor() { throw new Error('Unexpected network request'); } } },
    './embedding': {}, './qdrant-sync': {}, './agent-search-query': queryModule,
  }, { process: { env: {} } });
  const service = load('src/lib/agent-search.ts', {
    '@/lib/prisma': { prisma: db }, '@/lib/issue-finder': finder, '@/lib/secrets/access': access, '@/lib/oauth-scopes': scopes,
    '@/lib/html-sanitizer': { stripHtmlToPlainText: text => text.replace(/<[^>]*>/g, '') },
    './agent-search-query': queryModule,
    './agent-search-lexical': { searchLexical: async (query, documents) => {
      state.lexicalReads++; state.corpus = documents;
      if (state.beforeHydrate) state.beforeHydrate();
      return documents.map((d, i) => ({ id: d.id, type: d.type, score: 1 / (i + 1), exactIdentifier: d.id === query.query, matchType: 'keyword' }));
    } },
    './agent-search-vectors': { searchVectors: (...args) => state.vectorResult || noVectors.searchVectors(...args) },
  }, { Buffer });
  const auth = load('src/lib/apps/auth-middleware.ts', {
    'next/server': { NextResponse: Response }, '@/lib/prisma': { prisma: db }, '@/lib/oauth-scopes': scopes,
    '@/lib/apps/crypto': { decryptToken: async () => 'test-token' },
  }, { Buffer, console, URL });
  const route = load('src/app/api/apps/auth/search/route.ts', {
    'next/server': { NextResponse: Response }, '@/lib/apps/auth-middleware': auth,
    '@/lib/agent-search': service, '@/lib/agent-search-query': queryModule,
  }, { URL, console });
  const time = new Date('2026-10-01T12:00:00Z');
  function issue(id, fields = {}) {
    const row = { id, title: id, description: 'Issue details', issueKey: `APP-${rows.issue.length + 1}`, workspaceId: 'w', workspace,
      projectId: 'p', project: projects[0], statusId: null, status: 'TODO', statusValue: null, projectStatus: null,
      assigneeId: 'alice', assignee: { id: 'alice', name: 'Alice' }, updatedAt: time, ...fields };
    rows.issue.push(row); return row;
  }
  function note(id, fields = {}) {
    const row = { id, title: id, content: 'Note details', workspaceId: 'w', workspace, projectId: null, project: null,
      scope: 'WORKSPACE', type: 'GENERAL', isRestricted: false, isEncrypted: false, expiresAt: null,
      authorId: 'bob', sharedWith: [], updatedAt: time, ...fields };
    rows.note.push(row); return row;
  }
  function activity(id, itemId, fields = {}) {
    const row = { id, itemId, itemType: 'ISSUE', action: 'UPDATED', details: 'Progress update', oldValue: null, newValue: null,
      fieldName: 'status', workspaceId: 'w', projectId: 'p', createdAt: time, ...fields };
    rows.issueActivity.push(row); return row;
  }
  async function call(params = {}, authenticated = true) {
    const request = new Request(`https://example.test/api/apps/auth/search?${new URLSearchParams({ query: 'progress', ...params })}`,
      { headers: authenticated ? { authorization: 'Bearer test-token' } : {} });
    const response = await route.GET(request, { params: Promise.resolve({}) });
    return { status: response.status, body: await response.json() };
  }
  return { call, issue, note, activity, state, rows, workspace, foreign, projects, queryModule };
}

test('agent search: authentic token scopes, workspace membership and validated filters gate retrieval', async () => {
  const h = harness(); h.issue('allowed');
  assert.equal((await h.call({}, false)).status, 401);
  for (const invalid of [{ query: '' }, { mode: 'unknown' }, { limit: '0' }, { offset: '-1' }, { maxTokens: '10' },
    { after: '2026-10-02T00:00:00Z', before: '2026-10-01T00:00:00Z' }, { unexpected: 'field' }]) {
    assert.equal((await h.call(invalid)).status, 400);
  }
  assert.equal(h.state.lexicalReads, 0);
  h.state.scopes = ['issues:read'];
  assert.equal((await h.call()).status, 403);
  assert.equal((await h.call({ type: 'issue' })).status, 200);
  assert.equal((await h.call({ type: 'issue', projectId: 'foreign' })).status, 404);
  h.state.scopes = ['context:read'];
  assert.equal((await h.call({ type: 'note', status: 'TODO' })).status, 400);
  h.workspace.members[0].status = false;
  assert.equal((await h.call({ type: 'note' })).status, 403);
});

test('agent search: canonical permissions exclude secrets, revoked Notes, orphan and foreign activity', async () => {
  const h = harness(); h.issue('allowed'); h.note('guide'); h.activity('update', 'allowed');
  h.issue('foreign', { workspaceId: 'foreign', workspace: h.foreign, project: h.projects[2], projectId: 'foreign' });
  h.issue('bad-project', { project: h.projects[2], projectId: 'foreign' });
  h.issue('bad-status', { statusId: 'foreign-status', projectStatus: { project: h.projects[2], name: 'Secret status' } });
  h.note('restricted', { isRestricted: true }); h.note('expired', { expiresAt: new Date('2020-01-01') });
  h.note('revoked-share', { isRestricted: true, sharedWith: [] });
  h.note('private', { scope: 'PERSONAL', authorId: 'alice' });
  h.note('foreign-note', { workspaceId: 'foreign', workspace: h.foreign });
  h.note('bad-note-project', { projectId: 'foreign', project: h.projects[2] });
  for (const type of ['ENV_VARS', 'API_KEYS', 'CREDENTIALS']) h.note(type, { type, authorId: 'alice' });
  h.note('encrypted', { isEncrypted: true, authorId: 'alice' });
  h.activity('orphan', 'deleted'); h.activity('foreign-update', 'foreign');
  h.activity('bad-activity-project', 'allowed', { projectId: 'foreign' });
  const response = await h.call();
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.results.map(r => r.id), ['allowed', 'guide', 'update']);
  assert.equal(response.body.mode, 'keyword');
  assert.deepEqual(response.body.metadata.fallback, { from: 'hybrid', to: 'keyword', reason: 'not_configured' });
  assert.equal(response.body.metadata.vectorCoverage.ready, null);
  for (const row of response.body.results) assert.ok(row.url.startsWith('/team/'));
  const semantic = await h.call({ mode: 'semantic' });
  assert.equal(semantic.status, 503); assert.equal(semantic.body.error, 'semantic_unavailable');
});

test('agent search: project-only Notes and explicit shares use the current canonical policy', async () => {
  const h = harness();
  h.note('project-note', { workspaceId: null, workspace: null, projectId: 'p', project: h.projects[0], scope: 'PROJECT' });
  h.note('shared', { projectId: 'p', project: h.projects[0], isRestricted: true, sharedWith: [{ userId: 'alice', permission: 'VIEW' }] });
  const response = await h.call({ type: 'note', projectId: 'p', mode: 'keyword' });
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.results.map(r => r.id), ['project-note', 'shared']);
});

test('agent search: project, status, assignee and inclusive dates narrow issues and their activity', async () => {
  const h = harness(); h.issue('match'); h.activity('recent', 'match');
  h.issue('wrong-status', { status: 'DONE' }); h.activity('done-update', 'wrong-status');
  h.issue('wrong-person', { assigneeId: 'bob' });
  h.issue('wrong-project', { projectId: 'p2', project: h.projects[1] });
  h.issue('old', { updatedAt: new Date('2020-01-01') });
  h.activity('old-change', 'match', { createdAt: new Date('2020-01-01') });
  h.note('guide');
  const response = await h.call({ projectId: 'p', status: 'TODO', assigneeId: 'alice', after: '2026-10-01T00:00:00Z', before: '2026-10-02T00:00:00Z' });
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.results.map(r => r.id), ['match', 'recent']);
});

test('agent search: deletion, sharing revocation and parent filter changes are rechecked before output', async () => {
  const h = harness(); const issue = h.issue('deleted'); const note = h.note('revoked'); h.activity('activity', issue.id);
  h.state.beforeHydrate = () => { h.rows.issue.length = 0; note.isRestricted = true; };
  assert.deepEqual((await h.call()).body.results, []);
  h.state.beforeHydrate = null;
  const changed = h.issue('changed'); h.activity('changed-activity', changed.id);
  h.state.beforeHydrate = () => { changed.status = 'DONE'; };
  assert.deepEqual((await h.call({ status: 'TODO' })).body.results, []);
});

test('agent search: workspace revocation during retrieval denies the entire response', async () => {
  const h = harness(); h.issue('allowed');
  h.state.beforeHydrate = () => { h.workspace.members[0].status = false; };
  assert.equal((await h.call()).status, 403);
});

test('agent search: partial semantic coverage is disclosed and changed records lose stale semantic matches', async () => {
  const h = harness(); const changed = h.issue('changed'); h.issue('relevant');
  h.state.vectorResult = { results: [
    { id: 'changed', type: 'issue', score: 0.95, exactIdentifier: false, matchType: 'semantic' },
    { id: 'relevant', type: 'issue', score: 0.9, exactIdentifier: false, matchType: 'semantic' },
  ], coverage: { status: 'partial', reason: 'incomplete_or_stale_index', total: 3, checked: 3, ready: 2, stale: 1 } };
  h.state.beforeHydrate = () => { changed.updatedAt = new Date('2026-10-02T00:00:00Z'); };
  const response = await h.call({ mode: 'semantic' });
  assert.equal(response.status, 200);
  assert.equal(response.body.mode, 'semantic');
  assert.equal(response.body.metadata.vectorCoverage.status, 'partial');
  assert.equal(response.body.metadata.fallback, null);
  assert.deepEqual(response.body.results.map(r => r.id), ['relevant']);
});

test('agent search: JSON byte upper bound, pagination and exact-first hybrid ranking are consistent', async () => {
  const h = harness();
  for (let i = 0; i < 12; i++) h.issue(`issue-${i}`, { description: 'Long 😀 context '.repeat(80) });
  const seen = []; let offset = 0;
  do {
    const response = await h.call({ mode: 'keyword', maxTokens: '2500', limit: '5', offset: String(offset) });
    assert.equal(response.status, 200);
    assert.ok(Buffer.byteLength(JSON.stringify(response.body)) <= response.body.metadata.budget.tokenUpperBound);
    assert.ok(response.body.metadata.budget.tokenUpperBound <= 2500);
    seen.push(...response.body.results.map(r => r.id));
    const next = response.body.pagination.nextOffset;
    assert.ok(next === null || next > offset); offset = next;
  } while (offset !== null);
  assert.deepEqual(seen, h.rows.issue.map(r => r.id));
  const tooSmall = await h.call({ maxTokens: '1024' });
  assert.equal(tooSmall.status, 422); assert.equal(tooSmall.body.error, 'budget_too_small');
  const { fuseSearchResults } = h.queryModule;
  const ranked = fuseSearchResults([
    { id: 'exact', type: 'issue', score: 1, exactIdentifier: true, matchType: 'exact' },
    { id: 'both', type: 'note', score: 100, exactIdentifier: false, matchType: 'keyword' },
  ], [{ id: 'both', type: 'note', score: 0.9, exactIdentifier: false, matchType: 'semantic' }]);
  assert.equal(ranked[0].id, 'exact'); assert.equal(ranked[1].matchType, 'hybrid');
});
