const crypto = require('node:crypto');
const { Prisma } = require('@prisma/client');
const { assert, test, load } = require('./helpers.cjs');

const notFound = () => new Prisma.PrismaClientKnownRequestError('No record was found for an update.', {
  code: 'P2025', clientVersion: 'test', meta: { modelName: 'PullRequest', cause: 'No record was found for an update.' },
});

function fixture(update, readPullRequest = row => row) {
  const logs = { log: [], error: [] };
  const console = { log: (...args) => logs.log.push(args), error: (...args) => logs.error.push(args), warn() {} };
  const repository = { id: 'repo', githubRepoId: '123', webhookSecret: 'webhook-secret', projectId: 'project', project: { id: 'project', issuePrefix: 'MC' } };
  const rows = new Map();
  const db = {
    repository: { findFirst: async () => repository },
    user: { findFirst: async ({ where }) => where.githubId === '7' ? { id: 'merger' } : null },
    pullRequest: {
      findFirst: async ({ where }) => readPullRequest(rows.get(`${where.repositoryId}:${where.githubPrId}`) ?? null),
      update: update ?? (async ({ where, data }) => {
        const { repositoryId, githubPrId } = where.repositoryId_githubPrId;
        const row = rows.get(`${repositoryId}:${githubPrId}`);
        if (!row || row.state === where.state?.not) throw notFound();
        return Object.assign(row, data);
      }),
      updateMany: async ({ where, data }) => {
        const row = [...rows.values()].find(row => row.id === where.id && row.state !== where.state.not);
        if (!row) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
      upsert: async ({ where, create, update }) => {
        const { repositoryId, githubPrId } = where.repositoryId_githubPrId;
        const key = `${repositoryId}:${githubPrId}`;
        const row = rows.has(key) ? {
          ...rows.get(key),
          ...Object.fromEntries(Object.entries(update).filter(([, value]) => value !== undefined)),
        } : { id: key, ...create };
        rows.set(key, row);
        return row;
      },
    },
  };
  const deps = { '@/lib/prisma': { prisma: db } };
  const service = load('src/lib/github/webhook-service.ts', deps, { console });
  const route = load('src/app/api/github/webhooks/events/route.ts', {
    ...deps, crypto: { default: crypto },
    'next/server': { NextResponse: { json: (body, init) => ({ status: init?.status ?? 200, body }) } },
    '@/lib/github/webhook-service': service,
    '@/lib/github/version-manager': load('src/lib/github/version-manager.ts', { ...deps, semver: require('semver') }, { console }),
    '@/lib/github/ai-pr-review-service': { aiPRReviewService: {} },
  }, { console, Buffer, JSON });
  const deliver = async payload => {
    const body = JSON.stringify(payload);
    const signature = `sha256=${crypto.createHmac('sha256', 'webhook-secret').update(body).digest('hex')}`;
    const headers = { 'x-hub-signature-256': signature, 'x-github-event': 'pull_request', 'x-github-delivery': 'delivery' };
    return route.POST({ headers: { get: name => headers[name] ?? null }, text: async () => body });
  };
  return { logs, rows, deliver, service: new service.GitHubWebhookService() };
}

const merged = {
  action: 'closed', repository: { id: 123 },
  pull_request: {
    number: 1463, title: 'A missed opening delivery', body: null, merged: true,
    merged_at: '2026-11-17T15:47:24Z', closed_at: '2026-11-17T15:47:25Z', merged_by: { id: 7 },
    created_at: '2026-11-17T15:00:00Z', updated_at: '2026-11-17T15:47:25Z',
    user: { id: 8, login: 'author' }, base: { ref: 'main' }, head: { ref: 'fix' },
  },
};

test('a signed merge delivery creates one stored merge even when the opening was missed', async () => {
  const f = fixture(async () => { throw notFound(); });
  const response = await f.deliver(merged);
  assert.equal(response.status, 200);
  assert.equal((await f.deliver(merged)).status, 200);
  assert.equal((await f.deliver({ ...merged, action: 'ready_for_review' })).status, 200);
  const row = f.rows.get('repo:1463');
  assert.equal(f.rows.size, 1);
  assert.equal(row.state, 'MERGED');
  assert.equal(row.mergedAt.toISOString(), '2026-11-17T15:47:24.000Z');
  assert.equal(row.closedAt.toISOString(), '2026-11-17T15:47:25.000Z');
  assert.equal(row.githubCreatedAt.toISOString(), '2026-11-17T15:00:00.000Z');
  assert.equal(row.mergedById, 'merger');
  assert.equal(row.authorName, 'author');
  assert.equal(row.baseBranchName, 'main');
  assert.equal(row.headBranchName, 'fix');
  assert.deepEqual(f.logs.error, []);
});

test('closing an unknown pull request without merging is answered without an error', async () => {
  const f = fixture();
  const response = await f.deliver({
    ...merged, pull_request: { ...merged.pull_request, merged: false, merged_at: null, merged_by: null },
  });
  assert.equal(response.status, 200);
  assert.equal(f.rows.size, 0);
  assert.deepEqual(f.logs.error, []);
  assert.ok(f.logs.log.some(args => args.join(' ') === 'Pull request 1463 not found'));
});

test('a late unmerged close preserves the stored merge and its timestamps', async () => {
  const f = fixture();
  assert.equal((await f.deliver(merged)).status, 200);
  const response = await f.deliver({
    ...merged,
    pull_request: {
      ...merged.pull_request,
      merged: false,
      merged_at: null,
      merged_by: null,
      closed_at: '2026-11-17T15:46:00Z',
    },
  });
  assert.equal(response.status, 200);
  assert.equal(f.rows.size, 1);
  const row = f.rows.get('repo:1463');
  assert.equal(row.state, 'MERGED');
  assert.equal(row.mergedAt.toISOString(), '2026-11-17T15:47:24.000Z');
  assert.equal(row.closedAt.toISOString(), '2026-11-17T15:47:25.000Z');
  assert.equal(row.mergedById, 'merger');
  assert.deepEqual(f.logs.error, []);
});

test('version processing can fail after an existing pull request has been recorded as merged', async () => {
  const f = fixture(async () => { throw new Error('unexpected close update'); }, row => {
    assert.equal(row.state, 'MERGED');
    throw new Error('version processing failed');
  });
  f.rows.set('repo:1463', { state: 'OPEN', issueId: 'linked-issue' });
  assert.equal((await f.deliver(merged)).status, 200);
  const row = f.rows.get('repo:1463');
  assert.equal(row.state, 'MERGED');
  assert.equal(row.issueId, 'linked-issue');
  assert.ok(f.logs.error.some(([, error]) => error.message === 'version processing failed'));
});

test('a close update that fails for another reason still fails', async () => {
  const f = fixture(async () => { throw new Error('connection lost'); });
  await assert.rejects(f.service.closePullRequest('repo', 1463, new Date()), /connection lost/);
  assert.equal(f.logs.error.length, 1);
});
