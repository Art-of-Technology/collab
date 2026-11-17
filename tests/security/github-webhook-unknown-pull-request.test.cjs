// A pull request event for a pull request Collab has no row for (CLB-707).
const crypto = require('node:crypto');
const { Prisma } = require('@prisma/client');
const { assert, test, load } = require('./helpers.cjs');

const notFound = () => new Prisma.PrismaClientKnownRequestError('No record was found for an update.', {
  code: 'P2025', clientVersion: 'test', meta: { modelName: 'PullRequest', cause: 'No record was found for an update.' },
});

function fixture(update) {
  const logs = { log: [], error: [] };
  const console = { log: (...args) => logs.log.push(args), error: (...args) => logs.error.push(args), warn() {} };
  const repository = { id: 'repo', githubRepoId: '123', webhookSecret: 'webhook-secret', projectId: 'project', project: { id: 'project', issuePrefix: 'MC' } };
  const db = {
    repository: { findFirst: async () => repository },
    user: { findFirst: async () => null },
    pullRequest: { findFirst: async () => null, update },
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
  return { logs, deliver, service: new service.GitHubWebhookService() };
}

const merged = {
  action: 'closed', repository: { id: 123 },
  pull_request: { number: 1463, merged: true, merged_at: '2026-11-17T15:47:24Z', merged_by: { id: 7 }, base: { ref: 'main' }, head: { ref: 'fix' } },
};

test('a merged pull request Collab has no row for is answered without an error', async () => {
  const f = fixture(async () => { throw notFound(); });
  const response = await f.deliver(merged);
  assert.equal(response.status, 200);
  assert.deepEqual(f.logs.error, []);
  assert.ok(f.logs.log.some(args => args.join(' ') === 'Pull request 1463 not found'));
});

test('an update that fails for another reason still fails', async () => {
  const f = fixture(async () => { throw new Error('connection lost'); });
  await assert.rejects(f.service.updatePullRequest('repo', 1463, { state: 'MERGED' }), /connection lost/);
  assert.equal(f.logs.error.length, 1);
});
