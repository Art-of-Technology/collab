const { assert, test, load, matches } = require('./helpers.cjs');
const issuer = 'https://identity.example.test/realms/company';
const claims = () => new Headers(Object.fromEntries([
  ['issuer', issuer], ['subject', 'templates-user'], ['email', 'mapped@weezboo.com'],
].map(([key, value]) => [`x-collab-${key}`, Buffer.from(value).toString('base64url')])
  .concat([['x-collab-email-verified', 'true'], ['cookie', 'legacy=present']])));
const cases = [['', 'GET'], ['', 'POST'], ['[id]/', 'GET'], ['[id]/', 'PATCH'], ['[id]/', 'DELETE'], ['[id]/use/', 'POST']];

function fixture([path, method]) {
  const env = { env: { COLLAB_AUTH_MODE: 'gateway', COLLAB_GATEWAY_ISSUER: issuer } };
  const state = { headers: claims(), live: true, broken: false, owner: 'mapped', id: 'template',
    legacyCalls: 0, mappingReads: 0, effects: [] };
  const options = { fixtureOptions: true };
  const nextAuth = { getServerSession: async (...args) => {
    assert.equal(args.length, 1); assert.equal(args[0], options);
    state.legacyCalls++; return { user: { id: 'legacy' }, expires: 'legacy-expiry' };
  } };
  const record = (name, args) => state.effects.push([name, args]);
  const template = () => ({ id: 'template', name: 'Fixture', authorId: state.owner, workspaceId: 'workspace',
    titleTemplate: '{{userName}}', contentTemplate: '{{workspaceName}}', defaultType: 'GENERAL',
    defaultScope: 'PERSONAL', defaultTags: [], isBuiltIn: false, usageCount: 0, order: 1 });
  const prisma = {
    account: { findUnique: async () => {
      state.mappingReads++; if (state.broken) throw new Error('Synthetic mapping failure');
      return state.live ? { user: { id: 'mapped', email: 'mapped@weezboo.com', accounts: [{ id: 'mapping' }] } } : null;
    } },
    workspace: {
      findFirst: async args => {
        record('workspace-read', args); const row = { id: 'workspace', ownerId: state.owner, members: [] };
        return matches(row, args.where) ? row : null;
      },
      findUnique: async args => { record('workspace-context', args); assert.equal(args.where.id, 'workspace'); return { name: 'Workspace' }; },
    },
    user: { findUnique: async args => { record('user-context', args); return { name: args.where.id }; } },
    noteTemplate: {
      findMany: async args => { record('templates-read', args); return [template()].filter(row => matches(row, args.where)); },
      findUnique: async args => { record('template-read', args); return matches(template(), args.where) ? template() : null; },
      findFirst: async args => { record('template-read', args); return args.where.id && matches(template(), args.where) ? template() : null; },
      create: async args => { record('template-create', args); return { id: 'created', ...args.data }; },
      update: async args => { record('template-update', args); return { ...template(), ...args.data }; },
      delete: async args => { record('template-delete', args); return template(); },
    },
  };
  const identity = load('src/lib/gateway-identity.ts', { 'node:crypto': require('node:crypto') }, { process: env, Buffer, TextDecoder, URL });
  const adapter = load('src/lib/request-session.ts', { 'server-only': {}, './gateway-identity': identity,
    'next-auth': nextAuth, 'next/headers': { headers: async () => state.headers }, '@/lib/prisma': { prisma } }, { process: env });
  const finder = load('src/lib/issue-finder.ts', { '@/lib/prisma': { prisma } });
  const route = load(`src/app/api/notes/templates/${path}route.ts`, {
    '@/lib/request-session': adapter, 'next-auth': nextAuth, '@/lib/auth-options': { authOptions: options },
    'next/server': { NextResponse: Response }, '@/lib/prisma': { prisma }, '@prisma/client': require('@prisma/client'),
    '@/lib/issue-finder': finder, zod: require('zod'), '@/lib/note-templates': { BUILT_IN_TEMPLATES: [template()] },
    '@/lib/template-placeholders': load('src/lib/template-placeholders.ts'),
  }, { URL, console: { error() {} } });
  const invoke = () => route[method](new Request('https://example.test/api/notes/templates?workspaceId=workspace', {
    method, headers: { cookie: 'legacy=present' }, ...(['POST', 'PATCH'].includes(method) ? {
      body: JSON.stringify({ name: 'Edited', titleTemplate: '{{userName}}', contentTemplate: '{{workspaceName}}', workspaceId: 'workspace' }),
    } : {}),
  }), { params: Promise.resolve({ id: state.id }) });
  async function success(actor) {
    state.owner = actor; state.effects.length = 0;
    const response = await invoke(); assert.equal(response.status, !path && method === 'POST' ? 201 : 200);
    const result = await response.json();
    if (!path && method === 'GET') assert.deepEqual(result.templates.map(row => row.id), ['builtin-fixture', 'template']);
    else if (!path && method === 'POST') assert.equal(result.template.authorId, actor);
    else if (path === '[id]/use/') {
      assert.equal(result.title, actor); assert.equal(result.content, 'Workspace'); assert.equal(result.templateId, 'template');
      assert.equal(state.effects.find(([name]) => name === 'user-context')[1].where.id, actor);
      assert.ok(state.effects.some(([name, args]) => name === 'template-update' && args.data.usageCount.increment === 1));
    } else if (method === 'DELETE') assert.equal(result.success, true);
    else if (method === 'PATCH') assert.equal(result.template.name, 'Edited');
    else assert.equal(result.template.id, 'template');
  }
  return { state, env, invoke, success };
}

test('legacy template list remains a legitimate control', async () => {
  const f = fixture(cases[0]); f.env.env.COLLAB_AUTH_MODE = 'nextauth';
  await f.success('legacy'); assert.equal(f.state.legacyCalls, 1); assert.equal(f.state.mappingReads, 0);
});

for (const spec of cases) test(`${spec[0] || 'templates/'} ${spec[1]} binds mapped actor and preserves legacy behavior`, async () => {
  const f = fixture(spec);
  await f.success('mapped'); assert.equal(f.state.mappingReads, 1); assert.equal(f.state.legacyCalls, 0);
  f.state.owner = 'foreign'; f.state.effects.length = 0;
  assert.equal((await f.invoke()).status, 403);
  assert.ok(f.state.effects.every(([name]) => ['workspace-read', 'template-read'].includes(name)));
  if (spec[0] === '[id]/') {
    f.state.id = 'builtin-fixture'; f.state.effects.length = 0;
    const builtin = await f.invoke(); assert.equal(builtin.status, spec[1] === 'GET' ? 200 : 403);
    if (spec[1] === 'GET') assert.equal((await builtin.json()).template.isBuiltIn, true);
    assert.deepEqual(f.state.effects, []); f.state.id = 'template';
  }
  for (const failure of ['missing', 'revoked', 'invalid', 'database']) {
    f.state.headers = failure === 'missing' ? new Headers({ cookie: 'legacy=present' }) : claims();
    f.state.live = failure !== 'revoked'; f.state.broken = failure === 'database';
    f.env.env.COLLAB_AUTH_MODE = failure === 'invalid' ? 'invalid' : 'gateway'; f.state.effects.length = 0;
    assert.equal((await f.invoke()).status, failure === 'database' ? 500 : 401, failure);
    assert.deepEqual(f.state.effects, []); assert.equal(f.state.legacyCalls, 0);
  }
  f.state.broken = false; f.state.live = true; const reads = f.state.mappingReads;
  for (const mode of ['nextauth', undefined]) {
    if (mode) f.env.env.COLLAB_AUTH_MODE = mode; else delete f.env.env.COLLAB_AUTH_MODE;
    await f.success('legacy');
  }
  assert.equal(f.state.legacyCalls, 2); assert.equal(f.state.mappingReads, reads);
});
