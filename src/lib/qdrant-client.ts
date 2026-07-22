import { QdrantClient } from "@qdrant/js-client-rest";

const globalForQdrant = global as unknown as { qdrantClient?: QdrantClient };

export const qdrantClient =
  globalForQdrant.qdrantClient ||
  new QdrantClient({
    url: process.env.QDRANT_URL || "http://localhost:6333",
    apiKey: process.env.QDRANT_API_KEY,
    // Disable version check to avoid "Failed to obtain server version" warnings
    checkCompatibility: false,
  });

if (process.env.NODE_ENV !== "production") {
  globalForQdrant.qdrantClient = qdrantClient;
}

/**
 * Check if Qdrant is available by attempting to list collections.
 * Returns true if Qdrant is reachable, false otherwise.
 */
export async function isQdrantAvailable(): Promise<boolean> {
  try {
    await qdrantClient.getCollections();
    return true;
  } catch {
    return false;
  }
}

/**
 * Retry a Qdrant operation with exponential backoff.
 * Useful for handling transient DNS resolution failures.
 */
export async function withQdrantRetry<T>(
  operation: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 500
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry on non-transient errors
      const errorMessage = lastError.message.toLowerCase();
      if (
        !errorMessage.includes('enotfound') &&
        !errorMessage.includes('fetch failed') &&
        !errorMessage.includes('econnrefused') &&
        !errorMessage.includes('timeout')
      ) {
        throw lastError;
      }

      // Wait before retrying with exponential backoff
      if (attempt < maxRetries - 1) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}
