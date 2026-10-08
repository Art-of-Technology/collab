import { QdrantClient } from '@qdrant/js-client-rest';
import { createEmbeddingService } from './embedding';
import { cuidToUuid } from './qdrant-sync';
import { documentKey, type RankedDocument, type SearchDocument } from './agent-search-query';

export type VectorCoverage = {
  status: 'ready' | 'partial' | 'unavailable';
  reason: string | null;
  total: number;
  checked: number;
  ready: number | null;
  missing: number | null;
  stale: number | null;
  invalid: number | null;
  modelUnverified: number | null;
  checkedAt: string;
};

export function validVector(value: unknown, dimensions: number): value is number[] {
  return Array.isArray(value) && value.length === dimensions && value.every(n => typeof n === 'number' && Number.isFinite(n)) && value.some(n => n !== 0);
}

export function cosineSimilarity(a: number[], b: number[]) {
  let dot = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; aa += a[i] ** 2; bb += b[i] ** 2; }
  return dot / Math.sqrt(aa * bb);
}

export async function searchVectors(query: string, documents: SearchDocument[]) {
  const coverage: VectorCoverage = { status: 'unavailable', reason: null, total: documents.length,
    checked: 0, ready: null, missing: null, stale: null, invalid: null, modelUnverified: null, checkedAt: new Date().toISOString() };
  const unavailable = (reason: string) => ({ results: [] as RankedDocument[], coverage: { ...coverage, status: 'unavailable' as const, reason } });
  if (!process.env.QDRANT_URL || !process.env.EMBEDDING_API_URL) return unavailable('not_configured');
  if (!documents.length) return unavailable('empty_scope');
  const embedding = createEmbeddingService();
  if (!embedding || !Number.isSafeInteger(embedding.dimensions) || embedding.dimensions < 1 || embedding.dimensions > 4096) return unavailable('invalid_embedding_configuration');
  const collection = process.env.QDRANT_COLLECTION || 'collab_context';
  const client = new QdrantClient({ url: process.env.QDRANT_URL, apiKey: process.env.QDRANT_API_KEY, timeout: 2000, checkCompatibility: false });
  const ready: Array<{ document: SearchDocument; vector: number[] }> = [];
  const deadline = Date.now() + 6000;
  try {
    // Search never calls ensureCollection: a read must not create or migrate an index.
    const info = await client.getCollection(collection);
    const vectors = info.config.params.vectors;
    if (!vectors || !('size' in vectors) || vectors.size !== embedding.dimensions || vectors.distance !== 'Cosine') return unavailable('index_configuration_mismatch');
    for (let offset = 0; offset < documents.length; offset += 256) {
      if (Date.now() >= deadline) { coverage.reason = 'coverage_check_time_limit'; break; }
      const batch = documents.slice(offset, offset + 256);
      const points = await client.retrieve(collection, { ids: batch.map(d => cuidToUuid(d.id)),
        with_vector: true, with_payload: ['source_id', 'type', 'updatedAt', 'createdAt', 'embeddingModel'] });
      coverage.ready ??= 0;
      coverage.missing ??= 0;
      coverage.stale ??= 0;
      coverage.invalid ??= 0;
      coverage.modelUnverified ??= 0;
      const byId = new Map(points.map(point => [String(point.id), point]));
      for (const document of batch) {
        coverage.checked++;
        const point = byId.get(cuidToUuid(document.id));
        if (!point) { coverage.missing++; continue; }
        const payload = point.payload;
        const expectedType = document.type === 'note' ? 'context' : document.type === 'activity' ? 'issue_activity' : 'issue';
        if (payload?.source_id !== document.id || payload.type !== expectedType || !validVector(point.vector, embedding.dimensions)) { coverage.invalid++; continue; }
        const indexedDate = document.type === 'activity' ? payload.createdAt : payload.updatedAt;
        if (typeof indexedDate !== 'string' || new Date(indexedDate).getTime() !== document.updatedAt.getTime()) { coverage.stale++; continue; }
        if (payload.embeddingModel !== embedding.model) { coverage.modelUnverified++; continue; }
        ready.push({ document, vector: point.vector });
        coverage.ready++;
      }
    }
    if (!ready.length) return unavailable(coverage.reason || 'no_verified_embeddings');
    const vector = await embedding.embed(query, AbortSignal.timeout(2000));
    if (!validVector(vector, embedding.dimensions)) return unavailable('invalid_query_embedding');
    coverage.status = coverage.ready === coverage.total ? 'ready' : 'partial';
    coverage.reason ||= coverage.status === 'partial' ? 'incomplete_or_stale_index' : null;
    const results: RankedDocument[] = ready.map(({ document, vector: stored }) => ({ id: document.id, type: document.type,
      score: cosineSimilarity(vector, stored), exactIdentifier: false, matchType: 'semantic' }));
    results.sort((a, b) => b.score - a.score || documentKey(a).localeCompare(documentKey(b)));
    return { results, coverage };
  } catch {
    return unavailable('provider_unavailable');
  }
}
