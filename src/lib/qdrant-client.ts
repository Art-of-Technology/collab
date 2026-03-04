import { QdrantClient } from "@qdrant/js-client-rest";

const globalForQdrant = global as unknown as { qdrantClient?: QdrantClient };

export const qdrantClient =
  globalForQdrant.qdrantClient ||
  new QdrantClient({
    url: process.env.QDRANT_URL || "http://localhost:6333",
    apiKey: process.env.QDRANT_API_KEY,
  });

if (process.env.NODE_ENV !== "production") {
  globalForQdrant.qdrantClient = qdrantClient;
}
