const { test, assert, load } = require('./helpers.cjs');
const { createServer } = require('node:http');
const { once } = require('node:events');
const crypto = require('node:crypto');

const queryModule = load('src/lib/agent-search-query.ts', { zod: require('zod') }, { Buffer });
const date = new Date('2026-10-01T12:00:00Z');
const documents = [
  { id: 'login', type: 'issue', updatedAt: date, projectId: 'p' },
  { id: 'servers', type: 'issue', updatedAt: date, projectId: 'p' },
  { id: 'access-guide', type: 'note', updatedAt: date, projectId: 'p' },
  { id: 'change', type: 'activity', updatedAt: date, projectId: 'p' },
];

test('search vectors: real HTTP clients verify provenance, freshness and nonzero coverage before ranking', async t => {
  const requests = [];
  let points = [], size = 3, fail = false, hang = false, queryVector = [1, 0, 0];
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks)) : null;
    requests.push({ method: request.method, url: request.url, body });
    if (hang) return;
    response.setHeader('content-type', 'application/json');
    if (fail) { response.writeHead(503); response.end('{}'); return; }
    if (request.url === '/embeddings') {
      response.end(JSON.stringify({ data: [{ embedding: queryVector }] })); return;
    }
    const result = request.method === 'GET'
      ? { config: { params: { vectors: { size, distance: 'Cosine' } } } }
      : points.filter(point => body.ids.includes(point.id));
    response.end(JSON.stringify({ result, status: 'ok', time: 0 }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const url = `http://127.0.0.1:${server.address().port}`;
  const env = { QDRANT_URL: url, EMBEDDING_API_URL: url, EMBEDDING_MODEL: 'fixture-model', EMBEDDING_DIMENSIONS: '3' };
  const globals = { Buffer, fetch, AbortSignal, process: { env }, console };
  const embedding = load('src/lib/embedding.ts', {}, globals);
  const sync = load('src/lib/qdrant-sync.ts', {
    crypto: { default: crypto }, './qdrant-client': {}, './embedding': embedding,
  }, globals);
  const vectors = load('src/lib/agent-search-vectors.ts', {
    '@qdrant/js-client-rest': require('@qdrant/js-client-rest'), './embedding': embedding,
    './qdrant-sync': sync, './agent-search-query': queryModule,
  }, globals);
  const point = (document, vector) => ({ id: sync.cuidToUuid(document.id), vector, payload: {
    source_id: document.id, type: { issue: 'issue', note: 'context', activity: 'issue_activity' }[document.type],
    updatedAt: date.toISOString(), createdAt: date.toISOString(), embeddingModel: 'fixture-model',
  } });
  const reset = () => {
    requests.length = 0; fail = false; hang = false; size = 3; queryVector = [1, 0, 0];
    points = documents.map((d, i) => point(d, [[1, 0, 0], [0, 1, 0], [0.9, 0.1, 0], [0.8, 0.2, 0]][i]));
  };

  await t.test('unconfigured means unknown index counts and no network calls', async () => {
    reset(); delete env.QDRANT_URL;
    const result = await vectors.searchVectors('cannot sign in', documents);
    assert.equal(result.coverage.reason, 'not_configured');
    for (const key of ['ready', 'missing', 'invalid', 'stale', 'modelUnverified']) assert.equal(result.coverage[key], null);
    assert.equal(result.coverage.checked, 0);
    assert.equal(requests.length, 0);
    env.QDRANT_URL = url;
  });
  await t.test('synthetic semantic ranking crosses wording and preserves activity timestamps', async () => {
    reset(); delete points[3].payload.updatedAt;
    const result = await vectors.searchVectors('cannot sign in', documents);
    assert.equal(result.coverage.status, 'ready');
    assert.equal(result.coverage.ready, 4);
    assert.deepEqual(Array.from(result.results, row => row.id), ['login', 'access-guide', 'change', 'servers']);
    assert.equal(requests.at(-1).body.input, 'cannot sign in');
    assert.equal(requests.at(-1).body.model, 'fixture-model');
    assert.ok(requests.every(r => (r.method === 'GET' && r.url === '/collections/collab_context') ||
      (r.method === 'POST' && ['/collections/collab_context/points', '/embeddings'].includes(r.url))));
  });
  await t.test('zero, stale, missing and legacy model vectors never become semantic hits', async () => {
    reset(); points[1].vector = [0, 0, 0];
    points[2].payload.updatedAt = '2020-01-01T00:00:00Z';
    delete points[3].payload.embeddingModel;
    const result = await vectors.searchVectors('cannot sign in', documents.concat({ ...documents[0], id: 'missing' }));
    assert.equal(result.coverage.status, 'partial');
    assert.equal(result.coverage.checked, 5);
    assert.equal(result.coverage.ready, 1);
    for (const key of ['invalid', 'stale', 'modelUnverified', 'missing']) assert.equal(result.coverage[key], 1);
    assert.deepEqual(Array.from(result.results, row => row.id), ['login']);
  });
  await t.test('foreign payload identity and wrong dimensions are rejected', async () => {
    reset(); points[0].payload.source_id = 'foreign'; points[1].vector = [1];
    points[2].payload.type = 'issue'; points[3].payload.embeddingModel = 'different-model';
    const result = await vectors.searchVectors('query', documents);
    assert.equal(result.coverage.status, 'unavailable');
    assert.equal(result.coverage.reason, 'no_verified_embeddings');
    assert.equal(result.coverage.invalid, 3);
    assert.equal(requests.some(r => r.url === '/embeddings'), false);
  });
  await t.test('index mismatch and provider errors do not invent coverage', async () => {
    reset(); size = 384;
    let result = await vectors.searchVectors('query', documents);
    assert.equal(result.coverage.reason, 'index_configuration_mismatch');
    assert.equal(result.coverage.ready, null);
    fail = true;
    result = await vectors.searchVectors('query', documents);
    assert.equal(result.coverage.reason, 'provider_unavailable');
    assert.equal(result.coverage.missing, null);
  });
  await t.test('invalid query embeddings cannot label results semantic', async () => {
    reset(); queryVector = [0, 0, 0];
    const result = await vectors.searchVectors('query', documents);
    assert.equal(result.coverage.reason, 'invalid_query_embedding');
    assert.equal(result.results.length, 0);
  });
  await t.test('a stalled provider has a bounded timeout and exposes no invented coverage', { timeout: 8000 }, async () => {
    reset(); hang = true;
    const result = await vectors.searchVectors('query', documents);
    assert.equal(result.coverage.reason, 'provider_unavailable');
    assert.equal(result.coverage.ready, null);
  });
});

test('all six index producers stamp the actual embedding model, but zero-vector sync does not', async () => {
  for (const configured of [true, false]) {
    const points = [];
    const model = 'configured-fixture-model';
    const sync = load('src/lib/qdrant-sync.ts', {
      crypto: { default: crypto }, './qdrant-client': {
        qdrantClient: { getCollections: async () => ({ collections: [{ name: 'collab_context' }] }),
          upsert: async (_, request) => points.push(...request.points) },
        withQdrantRetry: fn => fn(),
      }, './embedding': { createEmbeddingService: () => configured ? {
        model, dimensions: 3, embed: async () => [1, 0, 0], embedBatch: async texts => texts.map(() => [1, 0, 0]),
      } : null },
    }, { process: { env: { EMBEDDING_DIMENSIONS: '3' } }, console });
    const issue = { id: 'issue', title: 'Access issue', workspaceId: 'w', updatedAt: date };
    const note = { id: 'note', title: 'Guide', content: 'Access instructions', workspaceId: 'w', updatedAt: date };
    const activity = { id: 'activity', action: 'UPDATED', itemId: 'issue', workspaceId: 'w', createdAt: date };
    await sync.syncIssueToQdrant(issue); await sync.syncContextToQdrant(note); await sync.syncIssueActivityToQdrant(activity);
    await sync.batchSyncIssuesToQdrant([issue]); await sync.batchSyncContextsToQdrant([note]); await sync.batchSyncActivitiesToQdrant([activity]);
    assert.equal(points.length, 6);
    for (const point of points) {
      assert.equal(point.payload.embeddingModel, configured ? model : null);
      assert.equal(point.vector.some(v => v !== 0), configured);
      assert.equal(point.payload[point.payload.type === 'issue_activity' ? 'createdAt' : 'updatedAt'], date.toISOString());
    }
  }
});
