const { assert, test, load, matches, readFileSync, resolve, runInNewContext, ts } = require('./helpers.cjs');

const ORIGIN = 'https://collab.example.test';
const ALL = ['user:read', 'workspace:read', 'projects:read', 'issues:read', 'issues:write', 'context:read', 'context:write', 'prompts:read'];
const READ = ALL.filter(scope => scope.endsWith(':read'));
const CHALLENGE = `Bearer resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource/api/mcp"`;
const READ_TOOLS = ['whoami', 'workspaces_list', 'projects_list', 'projects_statuses', 'labels_list', 'issues_list', 'issues_get', 'comments_list', 'notes_list', 'notes_get', 'search', 'context_get'];
const WRITE_TOOLS = ['issues_create', 'issues_update', 'comments_add', 'relations_add', 'worklogs_add', 'notes_create', 'notes_update'];

// Every app-auth route a tool forwards to, with the scopes the real route declares.
const ROUTES = {
  'user/me': { GET: { requiredScopes: ['user:read', 'profile:read'], scopeMode: 'any' } },
  'user/workspaces': { GET: { requiredScopes: ['user:read', 'workspace:read'] } },
  'projects': { GET: { requiredScopes: ['projects:read'] } },
  'projects/[projectId]/statuses': { GET: { requiredScopes: ['projects:read'] } },
  'labels': { GET: { requiredScopes: ['workspace:read'] } },
  'issues': { GET: { requiredScopes: ['issues:read'] }, POST: { requiredScopes: ['issues:write'] } },
  'issues/[issueIdOrKey]': { GET: { requiredScopes: ['issues:read'] }, PATCH: { requiredScopes: ['issues:write'] } },
  'issues/[issueIdOrKey]/comments': { GET: { requiredScopes: ['issues:read'] }, POST: { requiredScopes: ['issues:write'] } },
  'issues/[issueIdOrKey]/relations': { POST: { requiredScopes: ['issues:write'] } },
  'issues/[issueIdOrKey]/work-logs': { POST: { requiredScopes: ['issues:write'] } },
  'context': { GET: { requiredScopes: ['context:read'] }, POST: { requiredScopes: ['context:write'] } },
  'context/[id]': { GET: { requiredScopes: ['context:read'] }, PUT: { requiredScopes: ['context:write'] } },
  'search': { GET: { requiredScopes: ['issues:read', 'context:read'], scopeMode: 'any' } },
  'ai-context': { GET: { requiredScopes: ['prompts:read'] } },
};

function fixture({ timers = { setTimeout, clearTimeout } } = {}) {
  const app = { id: 'app', slug: 'collab-agent', name: 'Collab agent tokens', status: 'PUBLISHED', isSystemApp: true, scopes: ALL.map(scope => ({ scope })) };
  const workspaces = [
    { id: 'w1', slug: 'one', name: 'One', ownerId: 'owner', members: [{ userId: 'agent', status: true }] },
    { id: 'w2', slug: 'two', name: 'Two', ownerId: 'someone', members: [] },
  ];
  const tokens = [];
  const token = (value, scopes, extra = {}) => tokens.push({
    id: `token-${tokens.length}`, accessToken: Buffer.from(value).toString('base64'), userId: 'agent', scopes, isRevoked: false,
    installationId: null, installation: null, appId: app.id, app, workspaceId: 'w1', workspace: workspaces[0], tokenExpiresAt: new Date(Date.now() + 60_000), ...extra,
  });
  token('full', ALL); token('readonly', READ); token('expired', ALL, { tokenExpiresAt: new Date(Date.now() - 1000) });
  token('useronly', ['user:read']); token('noscopes', []);
  const state = { scanError: null }, calls = [], respond = {}, logs = [];
  const prisma = {
    appToken: { findMany: async ({ where }) => { if (state.scanError) throw state.scanError; return tokens.filter(row => matches(row, where)); } },
    app: { findUnique: async () => ({ isSystemApp: true }) },
    workspace: { findFirst: async ({ where }) => workspaces.find(row => matches(row, where)) ?? null },
  };
  const globals = { Buffer, URL, Request, Response, Headers, ...timers, process: { env: { NEXTAUTH_URL: ORIGIN } },
    console: { log: (...args) => logs.push(args), warn: (...args) => logs.push(args), error: (...args) => logs.push(args) } };
  const deps = {
    crypto: require('node:crypto'),
    '@modelcontextprotocol/server': require('@modelcontextprotocol/server'),
    'next/server': { NextRequest: Request, NextResponse: { json: (body, init) => Response.json(body, init) } },
    '@/lib/prisma': { prisma },
    // Synthetic tokens only: exercise lookup without a deployment key.
    '@/lib/apps/crypto': { getEncryptionKey: () => 'fixture-key', decryptToken: async value => value.toString() },
    '@/lib/oauth-scopes': load('src/lib/oauth-scopes.ts', {}, { URL }),
    '@/lib/post-access': load('src/lib/post-access.ts'),
  };
  deps['@/lib/mcp-oauth'] = load('src/lib/mcp-oauth.ts', deps, globals);
  deps['@/lib/apps/auth-middleware'] = load('src/lib/apps/auth-middleware.ts', deps, globals);
  // Each route is a recorder behind the real withAppAuth, so the forwarded credentials and workspace are really checked.
  for (const [file, methods] of Object.entries(ROUTES)) {
    deps[`@/app/api/apps/auth/${file}/route`] = Object.fromEntries(Object.entries(methods).map(([method, options]) => [method,
      deps['@/lib/apps/auth-middleware'].withAppAuth(async (request, context, routeParams) => {
        const url = new URL(request.url);
        calls.push({ route: `${method} ${file}`, method: request.method, path: url.pathname, query: Object.fromEntries(url.searchParams),
          authorization: request.headers.get('authorization'), body: request.method === 'GET' ? undefined : await request.json(),
          params: routeParams ? { ...await routeParams.params } : undefined, user: context.user.id, workspace: context.workspace.id });
        return (respond[`${method} ${file}`] ?? (() => Response.json({ route: `${method} ${file}` })))();
      }, options)]));
  }
  deps['@/lib/mcp-tools'] = load('src/lib/mcp-tools.ts', deps, globals);
  const route = load('src/app/api/mcp/route.ts', deps, globals);

  const post = (bearer, headers, body) => route.POST(new Request(`${ORIGIN}/api/mcp`, { method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...(bearer ? { authorization: `Bearer ${bearer}` } : {}), ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body) }));
  const read = async response => {
    const text = await response.text();
    const json = response.headers.get('content-type')?.includes('text/event-stream') ? text.split('\n').find(line => line.startsWith('data: '))?.slice(6) : text;
    return { status: response.status, type: response.headers.get('content-type'), challenge: response.headers.get('www-authenticate'), body: json ? JSON.parse(json) : null };
  };
  // A 2025-era client: no protocol headers, no per-request metadata.
  const legacy = async (bearer, method, params) => read(await post(bearer, {}, { jsonrpc: '2.0', id: 1, method, ...(params ? { params } : {}) }));
  // A 2026-07-28 client: protocol headers and per-request metadata, no handshake.
  const modern = async (bearer, method, params = {}) => read(await post(bearer,
    { 'mcp-protocol-version': '2026-07-28', 'mcp-method': method, ...(params.name ? { 'mcp-name': params.name } : {}) },
    { jsonrpc: '2.0', id: 1, method, params: { ...params, _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28', 'io.modelcontextprotocol/clientCapabilities': {} } } }));
  const call = async (bearer, name, args = {}) => {
    const { body } = await modern(bearer, 'tools/call', { name, arguments: args });
    if (body.error) return { rpcError: body.error };
    const text = body.result.content[0].text;
    let data; try { data = JSON.parse(text); } catch { data = text; }
    return { isError: !!body.result.isError, text, data };
  };
  return { post, read, legacy, modern, call, calls, respond, logs, state, workspaces, route, tools: deps['@/lib/mcp-tools'].tools, callTool: deps['@/lib/mcp-tools'].callTool };
}

test('a missing, unknown or expired token gets 401 with the discovery challenge before anything runs', async () => {
  const f = fixture();
  for (const bearer of [null, 'unknown', 'expired']) {
    const response = await f.legacy(bearer, 'tools/list');
    assert.equal(response.status, 401, String(bearer));
    assert.equal(response.challenge, CHALLENGE);
  }
  assert.equal((await f.read(await f.post(null, {}, 'not json'))).status, 401, 'the body is not parsed before authentication');
  assert.equal(f.calls.length, 0);
});

test('a token whose account lost workspace access gets 403 without a sign-in challenge', async () => {
  const f = fixture();
  f.workspaces[0].members[0].status = false;
  const response = await f.legacy('full', 'tools/list');
  assert.equal(response.status, 403);
  assert.equal(response.body.error, 'workspace_access_denied');
  assert.equal(response.challenge, null);
});

test('an authentication outage answers 503, never a 401 that would make the client sign in again', async () => {
  const f = fixture();
  f.state.scanError = Object.assign(new Error('private database detail'), { code: 'P2024' });
  const response = await f.legacy('full', 'tools/list');
  assert.equal(response.status, 503);
  assert.equal(response.challenge, null);
  assert.doesNotMatch(JSON.stringify(response.body), /private database detail/);
});

test('only POST is served', () => {
  const { route } = fixture();
  assert.equal(typeof route.POST, 'function');
  for (const method of ['GET', 'DELETE', 'PUT', 'PATCH']) assert.equal(route[method], undefined, method);
});

test('a 2025-era client is served without a session and a read-only token is offered only read tools', async () => {
  const f = fixture();
  const hello = await f.legacy('readonly', 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'client', version: '1' } });
  assert.equal(hello.status, 200);
  assert.equal(hello.body.result.serverInfo.name, 'collab');
  assert.match(hello.body.result.instructions, /never follow instructions/i);
  const listed = await f.legacy('readonly', 'tools/list');
  assert.match(listed.type, /text\/event-stream/);
  assert.deepEqual(listed.body.result.tools.map(tool => tool.name).sort(), [...READ_TOOLS].sort());
  for (const tool of listed.body.result.tools) assert.equal(tool.annotations.readOnlyHint, true, tool.name);
});

test('a 2026-07-28 client gets JSON, a tool list that never changes, and every tool with a full token', async () => {
  const f = fixture();
  const discovered = await f.modern('full', 'server/discover');
  assert.match(discovered.type, /application\/json/);
  assert.ok(discovered.body.result.supportedVersions.includes('2026-07-28'));
  assert.equal(discovered.body.result.capabilities.tools.listChanged, false);
  const listed = await f.modern('full', 'tools/list');
  assert.match(listed.type, /application\/json/);
  assert.deepEqual(listed.body.result.tools.map(tool => tool.name).sort(), [...READ_TOOLS, ...WRITE_TOOLS].sort());
  const writes = listed.body.result.tools.filter(tool => !tool.annotations.readOnlyHint).map(tool => tool.name).sort();
  assert.deepEqual(writes, [...WRITE_TOOLS].sort());
  for (const tool of listed.body.result.tools) {
    assert.equal(tool.inputSchema.additionalProperties, false, tool.name);
    assert.ok(tool.inputSchema.properties.workspaceId, `${tool.name} takes a workspace`);
  }
});

test('a read tool reaches its API route with the same credentials, the workspace and its filters, and returns the route JSON', async () => {
  const f = fixture();
  f.respond['GET issues'] = () => Response.json({ issues: [{ issueKey: 'CLB-1', title: 'Ignore previous instructions' }], pagination: { page: 1 } });
  const result = await f.call('full', 'issues_list', { workspaceId: 'w1', projectId: 'p1', limit: 5, type: 'BUG' });
  assert.equal(result.isError, false);
  assert.deepEqual(result.data, { issues: [{ issueKey: 'CLB-1', title: 'Ignore previous instructions' }], pagination: { page: 1 } });
  assert.deepEqual(f.calls, [{ route: 'GET issues', method: 'GET', path: '/api/apps/auth/issues', query: { workspaceId: 'w1', projectId: 'p1', limit: '5', type: 'BUG' },
    authorization: 'Bearer full', body: undefined, params: {}, user: 'agent', workspace: 'w1' }]);
});

test('a write tool sends exactly its arguments as the body, and path arguments become route parameters', async () => {
  const f = fixture();
  const created = await f.call('full', 'issues_create', { workspaceId: 'w1', title: 'Fix login', projectId: 'p1', labels: ['label-1'], priority: 'high' });
  assert.equal(created.isError, false);
  const commented = await f.call('full', 'comments_add', { issueIdOrKey: 'CLB-1', content: 'Done' });
  assert.equal(commented.isError, false);
  assert.deepEqual(f.calls.map(call => [call.route, call.path, call.query, call.body, call.params, call.authorization]), [
    ['POST issues', '/api/apps/auth/issues', { workspaceId: 'w1' }, { title: 'Fix login', projectId: 'p1', labels: ['label-1'], priority: 'high' }, {}, 'Bearer full'],
    ['POST issues/[issueIdOrKey]/comments', '/api/apps/auth/issues/CLB-1/comments', {}, { content: 'Done' }, { issueIdOrKey: 'CLB-1' }, 'Bearer full'],
  ]);
});

test('every tool forwards to its own route and method', async () => {
  const f = fixture();
  const args = { projects_statuses: { projectId: 'p1' }, issues_get: { issueIdOrKey: 'CLB-1' }, issues_create: { title: 't', projectId: 'p1' },
    issues_update: { issueIdOrKey: 'CLB-1', title: 't' }, comments_list: { issueIdOrKey: 'CLB-1' }, comments_add: { issueIdOrKey: 'CLB-1', content: 'c' },
    relations_add: { issueIdOrKey: 'CLB-1', targetIssueId: 'CLB-2', relationType: 'BLOCKS' }, worklogs_add: { issueIdOrKey: 'CLB-1', timeSpent: 30 },
    notes_get: { id: 'n1' }, notes_create: { title: 't', content: 'c' }, notes_update: { id: 'n1', title: 't' }, search: { query: 'login' } };
  const expected = { whoami: 'GET user/me', workspaces_list: 'GET user/workspaces', projects_list: 'GET projects', projects_statuses: 'GET projects/[projectId]/statuses',
    labels_list: 'GET labels', issues_list: 'GET issues', issues_get: 'GET issues/[issueIdOrKey]', issues_create: 'POST issues', issues_update: 'PATCH issues/[issueIdOrKey]',
    comments_list: 'GET issues/[issueIdOrKey]/comments', comments_add: 'POST issues/[issueIdOrKey]/comments', relations_add: 'POST issues/[issueIdOrKey]/relations',
    worklogs_add: 'POST issues/[issueIdOrKey]/work-logs', notes_list: 'GET context', notes_get: 'GET context/[id]', notes_create: 'POST context', notes_update: 'PUT context/[id]',
    search: 'GET search', context_get: 'GET ai-context' };
  for (const [name, route] of Object.entries(expected)) {
    const before = f.calls.length;
    const result = await f.call('full', name, args[name] ?? {});
    assert.equal(result.isError, false, `${name}: ${result.text}`);
    assert.equal(f.calls.length, before + 1, name);
    assert.equal(f.calls.at(-1).route, route, name);
  }
});

// Run a real route module far enough to see what it hands withAppAuth: that is the route's own access contract.
function declaredAccess(file, method) {
  const stub = new Proxy(function () {}, { get: (_, key) => key === 'then' ? undefined : key === Symbol.toPrimitive ? () => '' : stub, apply: () => stub, construct: () => stub });
  const source = readFileSync(resolve(process.env.SECURITY_TEST_ROOT || resolve(__dirname, '../../'), `src/app/api/apps/auth/${file}/route.ts`), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const exports = {};
  runInNewContext(outputText, { exports, URL, console, require: name => name === '@/lib/apps/auth-middleware' ? { withAppAuth: (_handler, options) => ({ options }) } : stub });
  return exports[method].options;
}

test('every tool declares exactly the scopes its real route enforces', () => {
  const { tools } = fixture();
  assert.equal(tools.length, READ_TOOLS.length + WRITE_TOOLS.length);
  for (const tool of tools) {
    const file = tool.path.replace(/:(\w+)/g, '[$1]');
    const real = declaredAccess(file, tool.method);
    assert.deepEqual([[...tool.scopes].sort(), !!tool.anyScope], [[...real.requiredScopes].sort(), real.scopeMode === 'any'], tool.name);
    assert.deepEqual(ROUTES[file][tool.method], { requiredScopes: [...real.requiredScopes], ...(real.scopeMode ? { scopeMode: real.scopeMode } : {}) }, `fixture for ${tool.name}`);
  }
});

test('a read-only token cannot call a write tool', async () => {
  const f = fixture();
  const result = await f.call('readonly', 'issues_create', { title: 'x', projectId: 'p1' });
  assert.equal(result.rpcError.code, -32602);
  assert.equal(f.calls.length, 0);
});

test('a workspace the account cannot access is refused by the API route itself', async () => {
  const f = fixture();
  const result = await f.call('full', 'issues_list', { workspaceId: 'w2' });
  assert.equal(result.isError, true);
  assert.equal(result.data.error, 'workspace_access_denied');
  assert.equal(f.calls.length, 0);
});

test('arguments are validated before any route runs', async () => {
  const f = fixture();
  for (const [name, args] of [
    ['issues_get', { issueIdOrKey: '../../secrets' }], ['issues_get', {}], ['issues_list', { limit: 500 }], ['issues_list', { unknown: true }],
    ['issues_create', { title: 'x' }], ['issues_create', { title: 'x', projectId: 'p1', type: 'INVALID' }], ['relations_add', { issueIdOrKey: 'CLB-1', targetIssueId: 'CLB-2', relationType: 'LIKES' }],
    ['worklogs_add', { issueIdOrKey: 'CLB-1', timeSpent: 0 }], ['search', {}], ['issues_list', { workspaceId: 'w1/../w2' }],
  ]) {
    const result = await f.call('full', name, args);
    assert.equal(result.isError, true, `${name} ${JSON.stringify(args)}`);
    assert.match(result.text, /Input validation error/, name);
  }
  assert.equal(f.calls.length, 0);
});

test('a request body over 1 MiB is refused with 413', async () => {
  const f = fixture();
  const response = await f.read(await f.post('full', {}, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'comments_add', arguments: { issueIdOrKey: 'CLB-1', content: 'x'.repeat(1024 * 1024) } } }));
  assert.equal(response.status, 413);
  assert.equal(f.calls.length, 0);
});

test('secret Notes cannot be read, created or changed, and personal Notes cannot be written', async () => {
  const f = fixture();
  f.respond['GET context/[id]'] = () => Response.json({ id: 'n1', type: 'API_KEYS', title: 'Keys', content: 'sk-live-secret' });
  const secret = await f.call('full', 'notes_get', { id: 'n1' });
  assert.equal(secret.isError, true);
  assert.equal(secret.data.error, 'unsupported_note_type');
  assert.doesNotMatch(secret.text, /sk-live-secret|Keys/);

  f.respond['GET context/[id]'] = () => Response.json({ id: 'n2', type: 'GUIDE', title: 'Guide', content: 'Steps' });
  assert.deepEqual((await f.call('full', 'notes_get', { id: 'n2' })).data, { id: 'n2', type: 'GUIDE', title: 'Guide', content: 'Steps' });

  const before = f.calls.length;
  for (const [name, args] of [
    ['notes_create', { title: 't', content: 'c', type: 'API_KEYS' }], ['notes_create', { title: 't', content: 'c', type: 'CREDENTIALS' }],
    ['notes_create', { title: 't', content: 'c', scope: 'PERSONAL' }], ['notes_update', { id: 'n1', type: 'ENV_VARS' }], ['notes_update', { id: 'n1', scope: 'SHARED' }],
    ['notes_list', { type: 'ENV_VARS' }], ['notes_list', { scope: 'PERSONAL' }],
  ]) assert.match((await f.call('full', name, args)).text, /Input validation error/, `${name} ${JSON.stringify(args)}`);
  assert.equal(f.calls.length, before);
});

test('a Note created for a project is a project Note unless a scope is given', async () => {
  const f = fixture();
  await f.call('full', 'notes_create', { title: 't', content: 'c', projectId: 'p1' });
  await f.call('full', 'notes_create', { title: 't', content: 'c', projectId: 'p1', scope: 'WORKSPACE' });
  await f.call('full', 'notes_create', { title: 't', content: 'c' });
  assert.deepEqual(f.calls.map(call => call.body.scope), ['PROJECT', 'WORKSPACE', undefined]);
});

test('an update with no fields is refused instead of sent', async () => {
  const f = fixture();
  for (const [name, args] of [['issues_update', { issueIdOrKey: 'CLB-1' }], ['notes_update', { id: 'n1', workspaceId: 'w1' }]]) {
    const result = await f.call('full', name, args);
    assert.equal(result.isError, true);
    assert.equal(result.data.error, 'empty_update', name);
  }
  assert.equal(f.calls.length, 0);
});

test('context_get asks for project pipeline context the way the CLI does', async () => {
  const f = fixture();
  await f.call('full', 'context_get', { projectId: 'p1' });
  await f.call('full', 'context_get', { projectId: 'p1', includeKnowledge: true });
  await f.call('full', 'context_get', {});
  await f.call('full', 'context_get', { projectId: 'p1', limit: 5, maxTokens: 4096 });
  assert.deepEqual(f.calls.map(call => call.query), [
    { projectId: 'p1', maxTokens: '8000', includePipeline: 'true' },
    { projectId: 'p1', includeKnowledge: 'true', maxTokens: '8000', includePipeline: 'false' },
    { maxTokens: '8000', includePipeline: 'false' },
    { projectId: 'p1', limit: '5', maxTokens: '4096', includePipeline: 'true' },
  ]);
  const before = f.calls.length;
  for (const args of [{ includePipeline: true }, { projectId: 'p1', includePipeline: true, includeKnowledge: true }, { limit: 5 }, { includeKnowledge: true, projectId: 'p1', since: '2026-11-01T00:00:00Z' }]) {
    const result = await f.call('full', 'context_get', args);
    assert.equal(result.isError, true, JSON.stringify(args));
    assert.equal(result.data.error, 'invalid_request');
  }
  assert.equal(f.calls.length, before);
});

test('a route error is returned as the tool error and an exception never leaks its message', async () => {
  const f = fixture();
  f.respond['GET issues/[issueIdOrKey]'] = () => Response.json({ error: 'not_found', error_description: 'Issue not found' }, { status: 404 });
  const missing = await f.call('full', 'issues_get', { issueIdOrKey: 'CLB-404' });
  assert.equal(missing.isError, true);
  assert.deepEqual(missing.data, { error: 'not_found', error_description: 'Issue not found' });

  f.respond['GET issues'] = () => { throw new Error('private database detail'); };
  const broken = await f.call('full', 'issues_list', {});
  assert.equal(broken.isError, true);
  assert.equal(broken.data.error, 'server_error');
  assert.doesNotMatch(JSON.stringify([broken, f.logs]), /private database detail/);
});

test('a tool call that outlasts 30 seconds returns a timeout that says whether a write may still land', async () => {
  // The 30 s timer fires at once; every other timer is left alone.
  const timers = { setTimeout: (run, ms, ...args) => ms === 30_000 ? (queueMicrotask(() => run(...args)), 0) : setTimeout(run, ms, ...args), clearTimeout };
  const f = fixture({ timers });
  const never = () => new Promise(() => {});
  f.respond['GET issues'] = never;
  f.respond['POST issues'] = never;
  const read = await f.call('full', 'issues_list', {});
  assert.equal(read.isError, true);
  assert.equal(read.data.error, 'timeout');
  const write = await f.call('full', 'issues_create', { title: 'x', projectId: 'p1' });
  assert.equal(write.data.error, 'timeout');
  assert.match(write.data.error_description, /may still complete/);
  assert.doesNotMatch(read.data.error_description, /may still complete/);
});

test('a path argument cannot add query parameters or path segments, even without schema validation', async () => {
  // callTool is also used without the MCP layer's validation, so it must be safe on its own.
  const f = fixture();
  const tool = f.tools.find(row => row.name === 'issues_get');
  for (const issueIdOrKey of ['x?workspaceId=w2', 'x/../../user/me', 'x#fragment', 'x&workspace=two']) {
    const result = await f.callTool(tool, { issueIdOrKey }, 'Bearer full', `${ORIGIN}/api/mcp`);
    assert.equal(result.isError, undefined, issueIdOrKey);
  }
  assert.deepEqual(f.calls.map(call => [call.route, call.query, call.params.issueIdOrKey, call.workspace]), [
    ['GET issues/[issueIdOrKey]', {}, 'x?workspaceId=w2', 'w1'],
    ['GET issues/[issueIdOrKey]', {}, 'x/../../user/me', 'w1'],
    ['GET issues/[issueIdOrKey]', {}, 'x#fragment', 'w1'],
    ['GET issues/[issueIdOrKey]', {}, 'x&workspace=two', 'w1'],
  ]);
});

test('a tool that needs two scopes is not offered with one, and a token with no scopes is offered nothing', async () => {
  const f = fixture();
  const names = async bearer => (await f.modern(bearer, 'tools/list')).body.result.tools.map(tool => tool.name).sort();
  // whoami needs user:read or profile:read; workspaces_list needs user:read and workspace:read.
  assert.deepEqual(await names('useronly'), ['whoami']);
  assert.deepEqual(await names('noscopes'), []);
  assert.equal((await f.call('useronly', 'workspaces_list')).rpcError.code, -32602);
});

test('a rejected request is logged without the text the client sent', async () => {
  const f = fixture();
  const response = await f.read(await f.post('full', { 'mcp-protocol-version': '2026-07-28', 'mcp-method': 'tools/list' },
    { jsonrpc: '2.0', id: 1, method: 'tools/list', params: { _meta: { 'io.modelcontextprotocol/protocolVersion': 'EVIL\nINJECTED-LOG-LINE token=fake', 'io.modelcontextprotocol/clientCapabilities': {} } } }));
  assert.ok(response.status >= 400 || response.body.error, 'the request is refused');
  assert.ok(f.logs.length > 0, 'the refusal is logged');
  assert.doesNotMatch(JSON.stringify(f.logs), /INJECTED-LOG-LINE|token=fake/);
});

test('the 30 second timer is cleared as soon as a call finishes', async () => {
  const started = [], cleared = [];
  const timers = { setTimeout: (run, ms, ...args) => { if (ms !== 30_000) return setTimeout(run, ms, ...args); const id = { ms }; started.push(id); return id; },
    clearTimeout: id => { if (started.includes(id)) cleared.push(id); else clearTimeout(id); } };
  const f = fixture({ timers });
  assert.equal((await f.call('full', 'issues_list', {})).isError, false);
  assert.equal(started.length, 1);
  assert.deepEqual(cleared, started, 'no timer is left running after the answer');
});
