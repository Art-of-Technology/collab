const { test, assert, load, matches } = require('./helpers.cjs');
const { Prisma } = require('@prisma/client');
const rewrite = load('src/lib/issue-visibility.ts').issueVisibilityExtension(Prisma.dmmf.datamodel.models).query.$allModels.$allOperations;

function allows(row, where = {}) {
  return Object.entries(where).every(([key, value]) => {
    if (value === undefined) return true;
    if (key === 'AND') return (Array.isArray(value) ? value : [value]).every(v => allows(row, v));
    if (key === 'OR') return value.some(v => allows(row, v));
    if (key === 'NOT') return !allows(row, value);
    const actual = row?.[key];
    if (value === null || typeof value !== 'object') return actual === value;
    if ('every' in value || 'some' in value || 'none' in value) {
      return (!value.every || actual.every(v => allows(v, value.every))) &&
        (!value.some || actual.some(v => allows(v, value.some))) &&
        (!value.none || !actual.some(v => allows(v, value.none)));
    }
    if ('not' in value) return actual !== value.not;
    if ('in' in value) return value.in.includes(actual);
    if ('notIn' in value) return !value.notIn.includes(actual);
    return actual != null && allows(actual, value);
  });
}

function visible(raw) {
  return Object.fromEntries(Object.entries(raw).map(([name, methods]) =>
    [name, Object.fromEntries(Object.entries(methods).map(([operation, query]) =>
      [operation, args => rewrite({ model: name[0].toUpperCase() + name.slice(1), operation, args, query })]))]));
}

test('project moves reject active and retained children, preserve ordinary updates and allow an unlinked move', async () => {
  const workspace = { id: 'workspace', ownerId: 'alice', members: [] };
  const project = { id: 'project', workspace };
  const child = { id: 'child', parentId: 'parent', projectId: 'project', deletedAt: null };
  const parent = { id: 'parent', projectId: 'project', workspaceId: workspace.id, workspace, project,
    reporterId: 'alice', deletedAt: null, parentId: null, statusId: null, updatedAt: new Date(),
    labels: [], children: [child], branches: [], commits: [], pullRequests: [], versionIssues: [] };
  let writes = 0;
  const raw = {
    workspace: { findFirst: async ({ where }) => matches(workspace, where) ? workspace : null },
    project: { findFirst: async () => ({ id: 'destination' }) },
    issue: {
      findFirst: async ({ where }) => allows(parent, where) ? structuredClone(parent) : null,
      update: async ({ data }) => { writes++; Object.assign(parent, data); return structuredClone(parent); },
    },
  };
  const db = visible(raw);
  db.$queryRaw = async (_sql, parentId, projectId) => parent.children
    .filter(row => row.parentId === parentId && row.projectId !== projectId).map(({ id }) => ({ id }));
  db.$transaction = async (fn, options) => { assert.equal(options.isolationLevel, 'Serializable'); return fn(db); };
  const permissions = load('src/lib/permissions.ts', { './prisma': { prisma: db } });
  const { updateIssue } = load('src/lib/issue-mutation.ts', {
    zod: require('zod'), '@/lib/prisma': { prisma: db },
    '@/lib/permissions': { ...permissions, checkUserPermissions: async (_u, _w, requested) =>
      Object.fromEntries(requested.map(p => [p, { hasPermission: true }])) },
    '@/utils/html-normalizer': { normalizeDescriptionHTML: v => v },
  });
  for (const deletedAt of [null, new Date()]) {
    child.deletedAt = deletedAt;
    const result = await updateIssue('alice', 'parent', { projectId: 'destination' });
    assert.equal(result.status, 400);
    assert.equal(result.error, 'Project move has incompatible relations');
    assert.equal(writes, 0);
    assert.equal(parent.projectId, child.projectId);
  }
  assert.equal((await updateIssue('alice', 'parent', { title: 'Updated' })).issue.title, 'Updated');
  assert.equal(child.parentId, parent.id);
  parent.children = [];
  assert.equal((await updateIssue('alice', 'parent', { projectId: 'destination' })).issue.projectId, 'destination');
  assert.equal(writes, 2);
});

test('stored projections disappear on Trash and return unchanged on Restore across version endpoints', async () => {
  const workspace = { id: 'workspace', ownerId: 'alice', members: [] };
  const project = { id: 'project', workspaceId: workspace.id, workspace };
  const repository = { id: 'repo', project, projectId: project.id, isActive: true };
  const issue = { id: 'issue', issueKey: 'KEEP-1', type: 'TASK', workspace, project, statusId: null, deletedAt: null };
  const version = { id: 'version', version: '1.0.0', repositoryId: repository.id, repository,
    environment: 'production', status: 'RELEASED', issueAccessInvalidated: false, issues: [{ issue }],
    aiSummary: 'KEEP-1 summary', aiChangelog: 'KEEP-1 changelog' };
  const release = { id: 'release', repositoryId: repository.id, repository, version, name: 'KEEP-1 release', tagName: 'v1' };
  const file = { repositoryId: repository.id, repository, version, environment: 'production', isActive: true,
    content: { version: '1.0.0', features: ['KEEP-1'] } };
  const stored = JSON.stringify([version.aiSummary, version.aiChangelog, release.name, file.content]);
  let useFile = true;
  const raw = {
    project: { findFirst: async ({ where }) => allows(project, where) ? { ...project, repository } : null },
    repository: { findFirst: async ({ where }) => allows(repository, where) ? repository : null },
    version: { findMany: async ({ where }) => [version].filter(v => allows(v, where)),
      findFirst: async ({ where }) => allows(version, where) ? version : null },
    versionFile: { findFirst: async ({ where }) => useFile && allows(file, where) ? file : null },
    release: { findMany: async ({ where }) => [release].filter(v => allows(v, where)) },
  };
  for (const name of ['issue', 'projectStatus', 'commit', 'pullRequest', 'gitConnection', 'featureRequest', 'note']) {
    raw[name] = { findMany: async () => [], groupBy: async () => [], count: async () => 0 };
  }
  const db = visible(raw);
  const postAccess = load('src/lib/post-access.ts');
  const issueAccess = load('src/lib/issue-finder.ts', { '@/lib/prisma': { prisma: db } });
  const repoAccess = load('src/lib/github/access.ts', { '@/lib/post-access': postAccess });
  const versionAccess = load('src/lib/github/version-access.ts', { './access': repoAccess, '@/lib/issue-finder': issueAccess });
  const deps = {
    '@/lib/prisma': { prisma: db }, '@/lib/session': { getCurrentUser: async () => ({ id: 'alice' }) },
    '@/lib/post-access': postAccess, '@/lib/issue-finder': issueAccess,
    '@/lib/github/access': repoAccess, '@/lib/github/version-access': versionAccess,
    '@/lib/note-tag-access': { noteTagAccessWhere: () => ({}) },
    '@/lib/secrets/access': { noteAccessWhere: () => ({}) }, 'next/server': { NextResponse: Response },
  };
  const routes = [
    'src/app/api/version.json/route.ts',
    'src/app/api/github/repositories/[repositoryId]/versions/route.ts',
    'src/app/api/github/repositories/[repositoryId]/releases/route.ts',
    'src/app/api/projects/[projectId]/summary/route.ts',
  ].map(path => load(path, deps, { URL, console }));
  for (const deletedAt of [null, new Date(), null]) {
    issue.deletedAt = deletedAt;
    for (const route of routes) {
      const response = await route.GET(new Request('https://test.local?project=project'),
        { params: Promise.resolve({ repositoryId: 'repo', projectId: 'project' }) });
      assert.equal(response.status, 200);
      const body = await response.text();
      assert.equal(body.includes('KEEP-1'), deletedAt === null, body);
    }
    useFile = false;
    const fallback = await routes[0].GET(new Request('https://test.local?project=project'));
    assert.equal((await fallback.text()).includes('KEEP-1'), deletedAt === null);
    useFile = true;
    assert.equal(JSON.stringify([version.aiSummary, version.aiChangelog, release.name, file.content]), stored);
  }
});
