const { test, assert, load, workspaces } = require('./helpers.cjs');

function matches(row, where = {}) {
  return Object.entries(where).every(([key, value]) => {
    if (value === undefined) return true;
    if (key === 'AND') return (Array.isArray(value) ? value : [value]).every(clause => matches(row, clause));
    if (key === 'OR') return value.some(clause => matches(row, clause));
    if (key === 'NOT') return !matches(row, value);
    const actual = row?.[key];
    if (value === null || typeof value !== 'object') return actual === value;
    if ('some' in value) return actual?.some(item => matches(item, value.some)) ?? false;
    if ('every' in value) return actual?.every(item => matches(item, value.every)) ?? false;
    if ('in' in value) return value.in.includes(actual);
    if ('not' in value) return actual !== value.not;
    return actual != null && matches(actual, value);
  });
}

function select(row, shape) {
  if (!shape) return { ...row };
  return Object.fromEntries(Object.entries(shape).filter(([, value]) => value).map(([key, value]) =>
    [key, value === true ? row[key] : row[key] == null ? null : select(row[key], value.select)]));
}

function fixture(options = {}) {
  const reads = [], logs = [], spaces = structuredClone(workspaces);
  const date = day => new Date(`2026-10-${String(day).padStart(2, '0')}T12:00:00.000Z`);
  const project = (id, workspaceId = 'joined', isArchived = false) => ({
    id, name: id, slug: id, color: null, workspaceId, workspace: spaces.find(row => row.id === workspaceId), isArchived,
  });
  const primary = project('primary'), otherProject = project('other-project'), archive = project('archive', 'joined', true);
  const connection = (id, overrides = {}) => ({ id, provider: id, repositoryPath: `team/${id}`, url: `https://${id}.test/team/${id}`,
    syncedAt: date(20), isActive: true, project: primary, credentials: 'private-token', ...overrides });
  const connections = [
    connection('github', { url: 'https://github.com/TEAM/REPO/', repositoryPath: 'TEAM/REPO' }),
    connection('gitlab', { syncedAt: null }), connection('forgejo'), connection('bitbucket'),
    connection('selfhosted', { provider: 'gitlab', url: 'https://git.internal.test/team/gitlab' }),
    connection('other-project', { provider: 'github', url: 'https://github.com/team/repo', project: otherProject }),
    connection('archive', { project: archive }), connection('inactive', { isActive: false }),
    connection('foreign', { project: project('foreign', 'foreign') }),
    connection('revoked', { project: project('revoked', 'revoked') }),
    connection('nullable', { project: project('nullable', 'joined', null), syncedAt: null }),
  ];
  const repo = { id: 'legacy', fullName: 'team/repo', syncedAt: date(19), isActive: true, project: primary, accessToken: 'private-token' };
  const repositories = [repo, { ...repo, id: 'inactive-legacy', isActive: false }, { ...repo, id: 'archived-legacy', project: archive }];
  const activity = connections.map((row, index) => ({ id: row.id, title: `${row.id} change`, connection: row, kind: 'pull_request',
    state: 'open', date: date(10 + Math.min(index, 10)), url: `${row.url.replace(/\/$/, '')}/pull/1` }));
  activity.find(row => row.id === 'github').date = date(23);
  const version = { repository: repo, issueAccessInvalidated: false, issues: [] };
  const pulls = [{ id: 'legacy-pr', title: 'legacy duplicate', repository: repo, githubPrId: 1, state: 'OPEN', githubUpdatedAt: date(23), updatedAt: date(23) }];
  const releases = [{ id: 'release', repository: repo, version, name: 'Release', tagName: 'v1.0',
    githubUrl: 'https://github.com/team/repo/releases/tag/v1.0', isDraft: false, publishedAt: date(22) }];
  function query(rows, args, model) {
    reads.push({ model, args });
    if (options.dbError) throw new Error('private database detail');
    let result = rows.filter(row => matches(row, args.where));
    if (args.orderBy) result.sort((a, b) => {
      for (const order of Array.isArray(args.orderBy) ? args.orderBy : [args.orderBy]) {
        const [key, direction] = Object.entries(order)[0];
        const comparison = a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0;
        if (comparison) return comparison * (direction === 'desc' ? -1 : 1);
      }
      return 0;
    });
    if (args.take != null) result = result.slice(0, args.take);
    return result.map(row => select(row, args.select));
  }
  const db = { workspace: { findFirst: async ({ where }) => spaces.find(row => matches(row, where)) ?? null } };
  for (const [model, rows] of Object.entries({ gitConnection: connections, repository: repositories, gitConnectionActivity: activity, pullRequest: pulls, release: releases })) {
    db[model] = { findMany: async args => query(rows, args, model) };
  }
  const postAccess = load('src/lib/post-access.ts');
  const repositoryAccess = load('src/lib/github/access.ts', { '@/lib/post-access': postAccess });
  const versionAccess = load('src/lib/github/version-access.ts', { './access': repositoryAccess,
    '@/lib/issue-finder': load('src/lib/issue-finder.ts', { '@/lib/prisma': { prisma: db } }) });
  const permissionCalls = [];
  const overview = load('src/lib/dashboard/repository-overview.ts', {
    'server-only': {}, '@/lib/prisma': { prisma: db }, '@/lib/post-access': postAccess,
    '@/lib/github/access': repositoryAccess, '@/lib/github/version-access': versionAccess,
    '@/lib/permissions': { Permission: { VIEW_TASKS: 'VIEW_TASKS' }, checkUserPermission: async (...args) => {
      permissionCalls.push(args);
      if (options.revoke) spaces.find(row => row.id === 'joined').members[0].status = false;
      return options.permissionError ? { hasPermission: false, reason: 'Internal error' } : { hasPermission: !options.denyPermission };
    } },
  }, { URL, console: { error: (...args) => logs.push(args) } });
  return { connections, repositories, activity, pulls, releases, primary, spaces, reads, logs, permissionCalls,
    call: (workspaceId = 'joined', actorId = 'alice') => overview.loadWorkspaceRepositoryOverview({ workspaceId, actorId }) };
}

test('repository feed denies absent, foreign, revoked and permissionless actors before any payload reads', async () => {
  for (const [space, actor, options] of [['joined', '', {}], ['', 'alice', {}], ['foreign', 'alice', {}], ['revoked', 'alice', {}], ['missing', 'alice', {}], ['joined', 'alice', { denyPermission: true }]]) {
    const f = fixture(options);
    assert.equal((await f.call(space, actor)).kind, 'denied');
    assert.equal(f.reads.length, 0);
  }
  const f = fixture();
  assert.equal((await f.call('own')).kind, 'ready');
  assert.deepEqual(f.permissionCalls, [['alice', 'own', 'VIEW_TASKS']]);
});

test('mixed cached providers are scoped, bounded, safe to serialize and GitHub duplicates collapse', async () => {
  const f = fixture(), result = await f.call();
  assert.equal(result.kind, 'ready');
  assert.equal(result.connectionCount, 7);
  assert.equal(result.neverRefreshedCount, 2);
  assert.equal(result.items.length, 6);
  assert.equal(result.items.filter(row => row.project.id === 'primary' && /github.com\/team\/repo\/pull\/1/i.test(row.url || '')).length, 1);
  assert.equal(result.items[0].id, 'connection:github');
  assert.equal(result.items.find(row => row.kind === 'release').refreshIsAttempt, true);
  assert.equal(result.items.find(row => row.id === 'connection:github').refreshIsAttempt, false);
  for (const name of ['gitConnectionActivity', 'pullRequest', 'release']) {
    const query = f.reads.find(row => row.model === name).args;
    assert.equal(query.take, 6);
    assert.ok(query.where);
  }
  const serialized = JSON.stringify(result);
  for (const hidden of ['private-token', 'foreign', 'revoked', 'archive', 'inactive', 'credentials', 'accessToken']) assert.equal(serialized.includes(hidden), false);
  assert.ok(result.items.every((row, i) => !i || row.date <= result.items[i - 1].date));
});

test('old closed PR cache upserts cannot displace newer provider events', async () => {
  const f = fixture(), pull = f.pulls[0];
  f.activity.splice(0, f.activity.length, { ...f.activity[0], date: new Date('2026-10-21T12:00:00Z') });
  pull.githubPrId = 2;
  pull.githubUpdatedAt = new Date('2026-10-23T12:00:00Z');
  for (let i = 0; i < 6; i++) f.pulls.push({
    ...pull, id: `closed-${i}`, githubPrId: i + 10, state: 'CLOSED',
    githubUpdatedAt: new Date('2026-09-01T12:00:00Z'), updatedAt: new Date('2026-10-24T12:00:00Z'),
  });
  f.pulls.push({ ...pull, id: 'undated', githubPrId: 99, githubUpdatedAt: null, updatedAt: new Date('2026-10-25T12:00:00Z') });
  const result = await f.call();
  assert.equal(result.kind, 'ready');
  assert.equal(result.items.length, 6);
  assert.deepEqual(Array.from(result.items.slice(0, 3), row => [row.id, row.date]), [
    ['github:legacy-pr', '2026-10-23T12:00:00.000Z'],
    ['release:release', '2026-10-22T12:00:00.000Z'],
    ['connection:github', '2026-10-21T12:00:00.000Z'],
  ]);
  assert.equal(result.items[0].refreshedAt, '2026-10-19T12:00:00.000Z');
  assert.equal(result.items[0].refreshIsAttempt, true);
  assert.ok(result.items.slice(3).every(row => row.state === 'CLOSED' && row.date === '2026-09-01T12:00:00.000Z'));
  assert.equal(result.items.some(row => row.id === 'github:undated'), false);
});

test('release deduplication ignores owner/repository case but preserves tag case', async () => {
  const f = fixture(), release = f.releases[0];
  f.activity.length = f.pulls.length = 0;
  f.releases.splice(0, f.releases.length,
    { ...release, id: 'upper', tagName: 'v1.2.3-RC.1', githubUrl: 'https://github.com/TEAM/REPO/releases/tag/v1.2.3-RC.1' },
    { ...release, id: 'upper-copy', tagName: 'v1.2.3-RC.1', githubUrl: 'https://github.com/team/repo/releases/tag/v1.2.3-RC.1' },
    { ...release, id: 'lower', tagName: 'v1.2.3-rc.1', githubUrl: 'https://github.com/team/repo/releases/tag/v1.2.3-rc.1' },
  );
  const result = await f.call();
  assert.equal(result.kind, 'ready');
  assert.equal(result.connectionCount, 7);
  assert.deepEqual(Array.from(result.items, row => row.url).sort(), [
    'https://github.com/TEAM/REPO/releases/tag/v1.2.3-RC.1',
    'https://github.com/team/repo/releases/tag/v1.2.3-rc.1',
  ]);
});

test('permission lookup failures report unavailable without reading repository payloads', async () => {
  const f = fixture({ permissionError: true });
  assert.equal((await f.call()).kind, 'unavailable');
  assert.equal(f.reads.length, 0);
});

test('repository identity retains separate hosts and projects, while either cache refresh counts once', async () => {
  const f = fixture();
  for (const row of f.connections) row.syncedAt = null;
  const result = await f.call();
  assert.equal(result.connectionCount, 7);
  assert.equal(result.neverRefreshedCount, 6);
  assert.ok(result.items.some(row => row.project.id === 'other-project'));
  assert.ok(result.items.some(row => row.url?.includes('git.internal.test')));
});

test('release visibility rejects draft, unpublished, invalidated and Trash or foreign-linked versions', async () => {
  for (const mode of ['draft', 'unpublished', 'invalidated', 'trash', 'foreign']) {
    const f = fixture(), release = f.releases[0];
    if (mode === 'draft') release.isDraft = true;
    if (mode === 'unpublished') release.publishedAt = null;
    if (mode === 'invalidated') release.version.issueAccessInvalidated = true;
    if (['trash', 'foreign'].includes(mode)) {
      const workspace = f.spaces.find(row => row.id === (mode === 'foreign' ? 'foreign' : 'joined'));
      release.version.issues = [{ issue: { deletedAt: mode === 'trash' ? new Date() : null, workspace, project: { workspace }, statusId: null } }];
    }
    assert.equal((await f.call()).items.some(row => row.kind === 'release'), false, mode);
  }
});

test('all queries recheck workspace access and exclude archived/inactive sources', async () => {
  const f = fixture({ revoke: true }), result = await f.call();
  assert.equal(result.kind, 'ready');
  assert.equal(result.connectionCount, 0);
  assert.deepEqual(Array.from(result.items), []);
  assert.equal(f.reads.length, 5);
});

test('unsafe activity/release URLs are omitted and unrelated activity kinds never enter the feed', async () => {
  const f = fixture();
  f.activity.find(row => row.id === 'github').url = 'javascript:alert(1)';
  f.releases[0].githubUrl = 'https://secret:token@github.com/release';
  f.activity.push({ ...f.activity[0], id: 'commit', kind: 'commit', title: 'not a PR', date: new Date('2030-01-01') });
  const result = await f.call();
  assert.equal(result.items.find(row => row.id === 'connection:github').url, null);
  assert.equal(result.items.find(row => row.kind === 'release').url, null);
  assert.equal(result.items.some(row => row.title === 'not a PR'), false);
});

test('empty and failed caches have distinct truthful states with fixed safe logging', async () => {
  const empty = fixture();
  empty.connections.length = empty.repositories.length = empty.activity.length = empty.pulls.length = empty.releases.length = 0;
  const result = await empty.call();
  assert.equal(result.kind, 'ready');
  assert.equal(result.connectionCount, 0);
  assert.equal(result.items.length, 0);
  const failed = fixture({ dbError: true });
  assert.equal((await failed.call()).kind, 'unavailable');
  assert.equal(failed.logs.length, 1);
  assert.deepEqual(failed.logs[0], ['Workspace repository overview unavailable']);
});
