const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { runInNewContext } = require('node:vm');
const ts = require('typescript');

function load(file, dependencies = {}) {
  const exports = {};
  const source = readFileSync(resolve(process.env.SECURITY_TEST_ROOT || resolve(__dirname, '../..'), file), 'utf8');
  runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText, {
    exports, URL, console: { error() {}, log() {} },
    require(name) {
      if (name in dependencies) return dependencies[name];
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  return exports;
}

function projectResult(row, query = {}) {
  if (row == null) return row;
  if (Array.isArray(row)) return row.map(item => projectResult(item, query));
  const result = query.select ? {} : { ...row };
  for (const [key, shape] of Object.entries(query.select || query.include || {})) {
    if (shape) result[key] = shape === true ? row[key] : projectResult(row[key], shape);
  }
  return result;
}

const secrets = ['synthetic-webhook-secret', 'synthetic-encrypted-token', 'synthetic-future-private-field'];
function fixture() {
  const workspace = { id: 'workspace', ownerId: 'alice', name: 'Workspace' };
  const project = { id: 'project', name: 'Project', slug: 'example', workspaceId: workspace.id,
    workspace, statuses: [], _count: { issues: 0 } };
  const repository = { id: 'repository', projectId: project.id, githubRepoId: '123', owner: 'example',
    name: 'repo', fullName: 'example/repo', isActive: true, defaultBranch: 'main', webhookId: '456',
    webhookSecret: secrets[0], accessToken: secrets[1], futurePrivateField: secrets[2],
    syncedAt: new Date(), createdAt: new Date(), updatedAt: new Date(),
    branches: [], versions: [], pullRequests: [], _count: { commits: 0, branches: 0 },
    project: { ...project }, versioningStrategy: 'SEMANTIC' };
  project.repository = repository;
  const calls = { writes: 0, provider: 0 };
  const db = {
    workspace: { findFirst: async () => workspace },
    project: { findFirst: async query => projectResult(project, query) },
    repository: {
      findFirst: async query => projectResult(repository, query),
      findMany: async query => [projectResult(repository, query)],
      create: async () => { calls.writes++; return repository; },
    },
    version: { findFirst: async () => ({ id: 'version' }) },
  };
  const dependencies = {
    'next/server': { NextResponse: Response },
    '@/lib/prisma': { prisma: db },
    '@/lib/auth': { authConfig: {} },
    '@/lib/request-session': { getServerSession: async () => ({ user: { id: 'alice', email: 'alice@example.test' } }) },
    '@/lib/slug-resolvers': { resolveWorkspaceSlug: async () => workspace.id },
    '@/constants/project-statuses': {},
    '@/lib/github/public-repository': load('src/lib/github/public-repository.ts'),
    '@/lib/encryption': { EncryptionService: { decrypt: () => { calls.provider++; throw new Error('Unexpected decryption'); } } },
    crypto: { randomBytes: () => ({ toString: () => secrets[0] }) },
    'next/navigation': { redirect: path => { throw new Error(`Unexpected redirect: ${path}`); } },
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }) },
    './GitHubSettingsClient': { GitHubSettingsClient: 'GitHubSettingsClient' },
  };
  return { project, repository, calls, load: file => load(file, dependencies) };
}

function publicResponse(value, repository) {
  const serialized = JSON.stringify(value);
  for (const secret of secrets) assert.equal(serialized.includes(secret), false, `Leaked ${secret}`);
  assert.equal(repository.id, 'repository');
  assert.equal(repository.fullName, 'example/repo');
  assert.equal('accessToken' in repository, false);
  assert.equal('webhookSecret' in repository, false);
}

for (const [name, file, params, extract] of [
  ['project', 'src/app/api/workspaces/[workspaceId]/projects/[projectSlug]/route.ts',
    { workspaceId: 'workspace', projectSlug: 'example' }, body => body.project.repository],
  ['debug', 'src/app/api/github/repositories/debug/route.ts', {}, body => body.project.repository],
  ['detail', 'src/app/api/github/repositories/[repositoryId]/route.ts',
    { repositoryId: 'repository' }, body => body.repository],
]) {
  test(`repository ${name} response excludes credentials and private fields`, async () => {
    const f = fixture();
    const response = await f.load(file).GET(new Request('https://collab.test/api?projectId=project'),
      { params: Promise.resolve(params) });
    assert.equal(response.status, 200);
    const body = await response.json();
    publicResponse(body, extract(body));
    if (name === 'debug') publicResponse(body.allRepositories, body.allRepositories[0]);
    assert.equal(f.calls.provider, 0);
    assert.equal(f.calls.writes, 0);
  });
}

test('repository creation response excludes generated webhook secret', async () => {
  const f = fixture();
  f.project.repository = null;
  const response = await f.load('src/app/api/github/repositories/route.ts').POST(
    new Request('https://collab.test/api', { method: 'POST', body: JSON.stringify({
      projectId: 'project', githubRepoId: '123', owner: 'example', name: 'repo',
    }) }));
  assert.equal(response.status, 200);
  const body = await response.json();
  publicResponse(body, body.repository);
  assert.equal(f.calls.writes, 1);
  assert.equal(f.calls.provider, 0);
});

test('GitHub settings client props contain only webhook configuration status', async () => {
  const f = fixture();
  const page = await f.load('src/app/(main)/[workspaceId]/projects/[projectSlug]/github/settings/page.tsx').default({
    params: Promise.resolve({ workspaceId: 'workspace', projectSlug: 'example' }),
  });
  publicResponse(page.props, page.props.repository);
  assert.equal(page.props.repository.hasWebhookSecret, true);
  f.repository.webhookSecret = null;
  const empty = await f.load('src/app/(main)/[workspaceId]/projects/[projectSlug]/github/settings/page.tsx').default({
    params: Promise.resolve({ workspaceId: 'workspace', projectSlug: 'example' }),
  });
  assert.equal(empty.props.repository.hasWebhookSecret, false);
});
