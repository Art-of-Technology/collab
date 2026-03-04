/**
 * Embedding service — fetch-based, works with any OpenAI-compatible endpoint.
 *
 * Environment variables:
 *   EMBEDDING_API_URL    — Base URL for embedding API (e.g. https://api.openai.com/v1)
 *   EMBEDDING_API_KEY    — API key for the embedding service
 *   EMBEDDING_MODEL      — Model name (default: all-MiniLM-L6-v2)
 *   EMBEDDING_DIMENSIONS — Vector dimensions (default: 384)
 *
 * If EMBEDDING_API_URL is not set, no embeddings are produced and Qdrant stores
 * metadata only. Coclaw's reindex() can populate vectors later.
 */

export interface EmbeddingService {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
  dimensions: number;
}

export function createEmbeddingService(): EmbeddingService | null {
  const apiUrl = process.env.EMBEDDING_API_URL;
  const apiKey = process.env.EMBEDDING_API_KEY;
  const model = process.env.EMBEDDING_MODEL || 'all-MiniLM-L6-v2';

  if (!apiUrl) {
    console.warn(
      '⚠️ No EMBEDDING_API_URL configured — Qdrant sync will store metadata only, vectors populated by Coclaw reindex'
    );
    return null;
  }

  return {
    dimensions: parseInt(process.env.EMBEDDING_DIMENSIONS || '384', 10),

    async embed(text: string): Promise<number[]> {
      const resp = await fetch(`${apiUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({ model, input: text }),
      });
      if (!resp.ok) throw new Error(`Embedding API error: ${resp.status}`);
      const data = await resp.json();
      return data.data[0].embedding;
    },

    async embedBatch(texts: string[]): Promise<number[][]> {
      const resp = await fetch(`${apiUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({ model, input: texts }),
      });
      if (!resp.ok) throw new Error(`Embedding API error: ${resp.status}`);
      const data = await resp.json();
      return data.data.map((d: any) => d.embedding);
    },
  };
}
