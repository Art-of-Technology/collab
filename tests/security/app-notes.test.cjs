const { assert, test, resolve, load, matches, workspaces, prisma, userHasWorkspaceAccess, note } = require('./helpers.cjs');


function appNotesHarness() {
  const client = require('@prisma/client');
  const workspace = { id: 'joined', name: 'Joined', slug: 'joined', ownerId: 'bob',
    members: [{ userId: 'alice', status: true, role: 'MEMBER' }] };
  const state = { scopes: ['context:read', 'context:write', 'knowledge:read', 'prompts:read', 'secrets:read'],
    expiresAt: null, reads: 0, counts: 0, writes: 0, decryptions: 0, audits: 0 };
  const rows = [];
  const project = { id: 'c1234567890123456789012345', workspaceId: 'joined', workspace, name: 'Project' };
  function add(id, fields = {}) {
    const row = { ...note, id, title: id, content: 'payload ' + id, type: 'GENERAL', isEncrypted: false,
      author: { id: fields.authorId || 'bob', name: 'Author' }, workspace, project: null, tags: [],
      isAiContext: true, aiContextPriority: 0, createdAt: new Date(), updatedAt: new Date(), ...fields };
    rows.push(row); return row;
  }
  const db = {
    workspace: { findFirst: async ({ where, select }) => {
      if (!matches(workspace, where)) return null;
      return { ...workspace, members: workspace.members.filter(member => !select?.members?.where || matches(member, select.members.where)) };
    } },
    user: { findUnique: async () => ({ id: 'alice', email: 'alice@example.test', name: 'Alice' }) },
    appToken: { findMany: async () => [{ accessToken: 'Y2lwaGVy', userId: 'alice', scopes: state.scopes,
      tokenExpiresAt: state.expiresAt, installation: { id: 'installation', appId: 'app', status: 'ACTIVE',
        workspaceId: 'joined', installedById: 'installer', scopes: [], workspace,
        app: { id: 'app', name: 'App', slug: 'app', status: 'PUBLISHED' } } }] },
    project: {
      findFirst: async ({ where }) => matches(project, where) ? project : null,
      findUnique: async ({ where }) => where.id === project.id ? project : null,
    },
    note: {
      findUnique: async ({ where }) => rows.find(row => row.id === where.id) ?? null,
      findFirst: async ({ where }) => {
        const row = rows.find(row => matches(row, where));
        if (row) state.reads++;
        return row ?? null;
      },
      findMany: async ({ where, skip = 0, take }) => {
        const found = rows.filter(row => matches(row, where));
        const page = found.slice(skip, take === undefined ? undefined : skip + take);
        state.reads += page.length; return page;
      },
      count: async ({ where }) => { state.counts++; return rows.filter(row => matches(row, where)).length; },
      update: async ({ where, data }) => { state.writes++; const row = rows.find(row => row.id === where.id); Object.assign(row, data); return row; },
      create: async ({ data }) => { state.writes++; return add('created', data); },
    },
    noteActivityLog: { create: async () => { state.audits++; } },
  };
  const finder = load('src/lib/issue-finder.ts', {
    '@/lib/prisma': { prisma: db }, '@/lib/shared-issue-key-utils': load('src/lib/shared-issue-key-utils.ts'),
  });
  const access = load('src/lib/secrets/access.ts', {
    '@/lib/prisma': { prisma: db }, '@prisma/client': client, '@/lib/issue-finder': finder,
  });
  const auth = load('src/lib/apps/auth-middleware.ts', {
    'next/server': { NextResponse: Response }, '@/lib/prisma': { prisma: db },
    '@/lib/oauth-scopes': load('src/lib/oauth-scopes.ts'), '@/lib/apps/crypto': { decryptToken: async () => 'test-token' },
  }, { URL, Buffer, console });
  const secrets = load('src/lib/secrets/crypto.ts', { crypto: { default: require('node:crypto') } }, {
    Buffer, process: { env: { SECRETS_MASTER_KEY: '0123456789abcdef0123456789abcdef' } },
  });
  const deps = {
    'next/server': { NextResponse: Response }, '@/lib/prisma': { prisma: db }, '@prisma/client': client,
    '@/lib/apps/auth-middleware': auth, '@/lib/issue-finder': finder, '@/lib/secrets/access': access,
    '@/lib/html-sanitizer': { stripHtmlToPlainText: value => value }, zod: require('zod'),
    '@/lib/event-bus': { emitContextUpdated: async () => {}, emitContextCreated: async () => {} },
    '@/lib/secrets/crypto': { ...secrets,
      decryptRawContent: (...args) => { state.decryptions++; return secrets.decryptRawContent(...args); },
      decryptVariables: (...args) => { state.decryptions++; return secrets.decryptVariables(...args); },
    },
  };
  const routes = new Map();
  async function call(file, method = 'GET', id = 'note', body, query = '', authenticated = true) {
    if (!routes.has(file)) routes.set(file, load('src/app/api/apps/auth/' + file + '/route.ts', deps, { URL, console }));
    const request = new Request('https://example.test/api/apps/auth/' + file + '?' + query, {
      method, headers: authenticated ? { Authorization: 'Bearer test-token' } : {},
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
    return routes.get(file)[method](request, { params: Promise.resolve({ id }) });
  }
  return { add, call, rows, workspace, state, project, secrets };
}

test('app-notes: real token scopes and Notes policy gate detail, reveal and edit rights', async () => {
  const h = appNotesHarness();
  const doc = h.add('doc', { type: 'GUIDE', isRestricted: true });
  const secret = h.add('secret', { type: 'API_KEYS', isRestricted: true, isEncrypted: true,
    encryptedContent: h.secrets.encryptRawContent('dummy-password', 'joined') });
  for (const permission of [null, 'VIEW', 'EDIT', 'OWNER']) {
    for (const row of [doc, secret]) {
      row.authorId = permission === 'OWNER' ? 'alice' : 'bob';
      row.sharedWith = ['VIEW', 'EDIT'].includes(permission) ? [{ userId: 'alice', permission }] : [];
    }
    h.state.reads = h.state.writes = h.state.decryptions = h.state.audits = 0;
    for (const file of ['context/[id]', 'context/knowledge/[id]']) {
      const response = await h.call(file, 'GET', 'doc');
      assert.equal(response.status, permission ? 200 : 404);
      if (permission) assert.equal((await response.json()).content, doc.content);
    }
    const reveal = await h.call('secrets/[id]/reveal', 'POST', 'secret', {});
    assert.equal(reveal.status, permission ? 200 : 404);
    assert.equal(h.state.decryptions, permission ? 1 : 0);
    assert.equal(h.state.audits, permission ? 1 : 0);
    if (permission) assert.equal((await reveal.json()).rawContent, 'dummy-password');
    if (!permission) assert.equal(h.state.reads, 0);
    const edit = await h.call('context/[id]', 'PUT', 'doc', { content: 'edited' });
    assert.equal(edit.status, ['EDIT', 'OWNER'].includes(permission) ? 200 : 404);
    assert.equal(h.state.writes, ['EDIT', 'OWNER'].includes(permission) ? 1 : 0);
    if (permission === 'EDIT') {
      assert.equal((await h.call('context/[id]', 'PUT', 'doc', { scope: 'PUBLIC' })).status, 403);
      assert.equal((await h.call('context/[id]', 'PUT', 'doc', { projectId: h.project.id })).status, 403);
    }
  }
  secret.expiresAt = new Date(0);
  const decryptions = h.state.decryptions;
  assert.equal((await h.call('secrets/[id]/reveal', 'POST', 'secret', {})).status, 403);
  secret.authorId = 'bob'; secret.sharedWith = [{ userId: 'alice', permission: 'VIEW' }];
  assert.equal((await h.call('secrets/[id]/reveal', 'POST', 'secret', {})).status, 404);
  assert.equal(h.state.decryptions, decryptions);
  secret.expiresAt = null; secret.authorId = 'alice';
  assert.equal((await h.call('context/[id]', 'PUT', 'secret', { type: 'GENERAL' })).status, 400);
  assert.equal((await h.call('context/[id]', 'PUT', 'doc', { projectId: 'c9999999999999999999999999' })).status, 403);
  assert.equal((await h.call('context/[id]', 'PUT', 'doc', { scope: 'PROJECT', projectId: h.project.id })).status, 200);
  assert.equal((await h.call('context/[id]', 'PUT', 'doc', { projectId: null })).status, 400);
  doc.workspaceId = 'foreign';
  assert.equal((await h.call('context/[id]', 'GET', 'doc')).status, 404);
  assert.equal((await h.call('context/[id]', 'PUT', 'doc', { title: 'denied' })).status, 404);
  doc.workspaceId = 'joined';
  h.state.scopes = ['context:read'];
  const before = h.state.writes;
  assert.equal((await h.call('context/[id]', 'PUT', 'doc', { title: 'denied' })).status, 403);
  assert.equal((await h.call('secrets/[id]/reveal', 'POST', 'secret', {})).status, 403);
  const redacted = await h.call('context/[id]', 'GET', 'secret');
  assert.equal(redacted.status, 200);
  assert.equal((await redacted.json()).content, '[REDACTED - secrets:read scope required]');
  assert.equal(h.state.writes, before);
  h.state.expiresAt = new Date(0);
  assert.equal((await h.call('context/[id]', 'GET', 'doc')).status, 401);
});

test('app-notes: collections and counts exclude restricted, private and expired siblings', async () => {
  const h = appNotesHarness();
  for (const type of ['GUIDE', 'SYSTEM_PROMPT', 'API_KEYS']) {
    for (const variant of ['visible', 'restricted', 'shared', 'expired', 'personal']) {
      h.add(type + '-' + variant, { type, isEncrypted: type === 'API_KEYS',
        isRestricted: ['restricted', 'shared'].includes(variant),
        sharedWith: variant === 'shared' ? [{ userId: 'alice', permission: 'VIEW' }] : [],
        expiresAt: variant === 'expired' ? new Date(0) : null,
        scope: variant === 'personal' ? 'PERSONAL' : 'WORKSPACE' });
    }
  }
  for (const variant of ['visible', 'restricted', 'personal']) {
    h.add('project-' + variant, { type: 'SYSTEM_PROMPT', projectId: h.project.id, project: h.project,
      scope: variant === 'personal' ? 'PERSONAL' : 'PROJECT', isRestricted: variant === 'restricted' });
  }
  for (const [file, key, expected, query] of [
    ['context', 'context', ['GUIDE-visible', 'GUIDE-shared', 'SYSTEM_PROMPT-visible', 'SYSTEM_PROMPT-shared', 'project-visible'], 'search=payload'],
    ['context/knowledge', 'articles', ['GUIDE-visible', 'GUIDE-shared'], 'q=payload'],
    ['context/system-prompts', 'prompts', ['SYSTEM_PROMPT-visible', 'SYSTEM_PROMPT-shared', 'project-visible'], 'projectId=' + h.project.id],
    ['secrets', 'secrets', ['API_KEYS-visible', 'API_KEYS-shared'], ''],
  ]) {
    const response = await h.call(file, 'GET', '', undefined, query);
    assert.equal(response.status, 200, file);
    const body = await response.json();
    assert.deepEqual(body[key].map(row => row.id), expected, file);
    if (body.total !== undefined) assert.equal(body.total, expected.length, file);
    if (['context', 'context/knowledge'].includes(file)) {
      const page = await (await h.call(file, 'GET', '', undefined, query + '&limit=1&offset=1')).json();
      assert.equal(page.total, expected.length); assert.equal(page[key].length, 1);
      assert.equal(page[key][0].id, expected[1]);
    }
  }
  const combined = await (await h.call('ai-context', 'GET', '', undefined, 'projectId=' + h.project.id + '&includeKnowledge=true')).json();
  assert.deepEqual(combined.systemPrompts.map(row => row.id), ['SYSTEM_PROMPT-visible', 'SYSTEM_PROMPT-shared', 'project-visible']);
  assert.equal(combined.metadata.promptCount, 3);
  assert.doesNotMatch(combined.mergedContext, /restricted|personal|expired/);
  const knowledge = await (await h.call('ai-context', 'GET', '', undefined, 'includeKnowledge=true')).json();
  assert.deepEqual(knowledge.knowledge.map(row => row.id), ['GUIDE-visible', 'GUIDE-shared']);
  assert.equal(h.state.counts, 4);
});

test('app-notes: anonymous and revoked tokens stop all sibling reads and writes', async () => {
  const h = appNotesHarness();
  h.add('note', { authorId: 'alice', scope: 'PUBLIC' });
  const endpoints = [
    ['context', 'GET'], ['context', 'POST'], ['context/[id]', 'GET'], ['context/[id]', 'PUT'],
    ['context/knowledge', 'GET'], ['context/knowledge/[id]', 'GET'], ['context/system-prompts', 'GET'],
    ['ai-context', 'GET'], ['secrets', 'GET'], ['secrets/[id]/reveal', 'POST'],
  ];
  for (const [file, method] of endpoints) {
    const body = method === 'GET' ? undefined : { title: 'New', content: 'text' };
    assert.equal((await h.call(file, method, 'note', body, '', false)).status, 401, file);
    h.workspace.members[0].status = false;
    assert.equal((await h.call(file, method, 'note', body)).status, 403, file);
  }
  assert.equal(h.state.reads, 0); assert.equal(h.state.counts, 0);
  assert.equal(h.state.writes, 0); assert.equal(h.state.decryptions, 0);
  h.workspace.ownerId = 'alice';
  assert.equal((await h.call('context', 'POST', '', { title: 'New', content: 'text' })).status, 201);
  assert.equal(h.state.writes, 1);
});

test('app-notes: leave policy reads require active membership while preserving owner access', async () => {
  let session = null;
  const { GET } = load('src/app/api/leave/policies/[policyId]/route.ts', {
    'next/server': { NextResponse: Response }, 'next-auth': { getServerSession: async () => session },
    '@/lib/auth-options': { authOptions: {} }, '@/lib/issue-finder': { userHasWorkspaceAccess },
    '@/lib/permissions': { Permission: { MANAGE_LEAVE: 'MANAGE_LEAVE' },
      checkUserPermission: async (_userId, workspaceId) => ({ hasPermission: workspaceId === 'own' }) }, zod: require('zod'),
    '@/lib/prisma': { prisma: {
      user: { findUnique: async () => ({ id: 'alice' }) },
      leavePolicy: { findUnique: async ({ where }) => {
        const workspace = workspaces.find(row => row.id === where.id);
        return workspace ? { id: where.id, workspaceId: where.id, name: 'Annual leave', _count: { leaveRequests: 2 } } : null;
      } },
    } },
  }, { console });
  const get = id => GET({}, { params: Promise.resolve({ policyId: id }) });
  assert.equal((await get('joined')).status, 401);
  session = { user: { email: 'alice@example.test' } };
  for (const id of ['foreign', 'revoked']) {
    const response = await get(id); assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: 'Access denied to workspace' });
  }
  assert.equal((await get('missing')).status, 404);
  for (const id of ['own', 'joined']) {
    const response = await get(id); assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), id === 'own'
      ? { id, workspaceId: id, name: 'Annual leave', _count: { leaveRequests: 2 } }
      : { id, name: 'Annual leave' });
  }
});
