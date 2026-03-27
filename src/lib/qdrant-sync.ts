import crypto from 'crypto';
import { qdrantClient, withQdrantRetry } from './qdrant-client';
import { createEmbeddingService, type EmbeddingService } from './embedding';

/**
 * Qdrant vector sync pipeline for Collab.
 *
 * Embeds and stores issues, issue activities, and context documents (notes)
 * in Qdrant to enable semantic search for Coclaw agents.
 *
 * Environment variables:
 *   QDRANT_COLLECTION — Collection name (default: collab_context)
 */

const COLLECTION_NAME = process.env.QDRANT_COLLECTION || 'collab_context';
const DEFAULT_DIMENSIONS = parseInt(process.env.EMBEDDING_DIMENSIONS || '384', 10);

let embeddingService: EmbeddingService | null = null;
let initialized = false;

// ---------------------------------------------------------------------------
// ID conversion: Qdrant requires UUID or integer point IDs.
// Prisma cuid() produces strings like "cm8ofi0bt0000wjbg8nrb6ld4".
// We deterministically map them to UUID v5-style via SHA-256 → UUID format.
// ---------------------------------------------------------------------------

export function cuidToUuid(cuid: string): string {
  const hash = crypto.createHash('sha256').update(cuid).digest('hex');
  // Format as UUID: 8-4-4-4-12
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    hash.slice(12, 16),
    hash.slice(16, 20),
    hash.slice(20, 32),
  ].join('-');
}

export async function ensureCollection(): Promise<void> {
  if (initialized) return;

  try {
    // Use retry logic for transient DNS/connection failures
    const collections = await withQdrantRetry(() => qdrantClient.getCollections());
    const exists = collections.collections.some((c) => c.name === COLLECTION_NAME);

    if (!exists) {
      embeddingService = createEmbeddingService();
      const dimensions = embeddingService?.dimensions || DEFAULT_DIMENSIONS;

      await withQdrantRetry(() =>
        qdrantClient.createCollection(COLLECTION_NAME, {
          vectors: { size: dimensions, distance: 'Cosine' },
        })
      );
      console.log(`✅ Created Qdrant collection: ${COLLECTION_NAME} (${dimensions}d)`);
    } else {
      // Still need to initialise the embedding service even if collection exists
      embeddingService = embeddingService ?? createEmbeddingService();
    }

    initialized = true;
  } catch (error) {
    // Log but don't throw - allows app to start even if Qdrant is temporarily unavailable
    console.error('❌ Failed to initialize Qdrant collection:', error);
  }
}

// ---------------------------------------------------------------------------
// Issue sync
// ---------------------------------------------------------------------------

export async function syncIssueToQdrant(issue: {
  id: string;
  title: string;
  description?: string | null;
  issueKey?: string | null;
  type?: string;
  priority?: string;
  status?: string;
  statusId?: string | null;
  projectId?: string;
  workspaceId: string;
  assigneeId?: string | null;
  reporterId?: string | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}): Promise<void> {
  await ensureCollection();

  const text = [issue.title, issue.description].filter(Boolean).join('\n\n');
  if (!text.trim()) return;

  const vector = embeddingService
    ? await embeddingService.embed(text)
    : new Array(DEFAULT_DIMENSIONS).fill(0);

  await withQdrantRetry(() =>
    qdrantClient.upsert(COLLECTION_NAME, {
      points: [
        {
          id: cuidToUuid(issue.id),
          vector,
          payload: {
            type: 'issue',
            source_id: issue.id,
            title: issue.title,
            content: issue.description || '',
            issueKey: issue.issueKey || '',
            issueType: issue.type || '',
            priority: issue.priority || '',
            status: issue.status || '',
            statusId: issue.statusId || '',
            projectId: issue.projectId || '',
            workspaceId: issue.workspaceId,
            assigneeId: issue.assigneeId || '',
            reporterId: issue.reporterId || '',
            createdAt: issue.createdAt ? new Date(issue.createdAt).toISOString() : '',
            updatedAt: issue.updatedAt ? new Date(issue.updatedAt).toISOString() : '',
          },
        },
      ],
    })
  );
}

// ---------------------------------------------------------------------------
// Context / Note sync
// ---------------------------------------------------------------------------

export async function syncContextToQdrant(context: {
  id: string;
  title: string;
  content: string;
  type?: string;
  scope?: string;
  isAiContext?: boolean;
  aiContextPriority?: number;
  projectId?: string | null;
  workspaceId?: string;
  authorId?: string;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}): Promise<void> {
  await ensureCollection();

  const text = [context.title, context.content].filter(Boolean).join('\n\n');
  if (!text.trim()) return;

  const vector = embeddingService
    ? await embeddingService.embed(text)
    : new Array(DEFAULT_DIMENSIONS).fill(0);

  await withQdrantRetry(() =>
    qdrantClient.upsert(COLLECTION_NAME, {
      points: [
        {
          id: cuidToUuid(context.id),
          vector,
          payload: {
            type: 'context',
            source_id: context.id,
            title: context.title,
            content: context.content,
            contextType: context.type || 'GENERAL',
            scope: context.scope || 'WORKSPACE',
            isAiContext: context.isAiContext || false,
            aiContextPriority: context.aiContextPriority || 0,
            projectId: context.projectId || '',
            workspaceId: context.workspaceId || '',
            authorId: context.authorId || '',
            createdAt: context.createdAt ? new Date(context.createdAt).toISOString() : '',
            updatedAt: context.updatedAt ? new Date(context.updatedAt).toISOString() : '',
          },
        },
      ],
    })
  );
}

// ---------------------------------------------------------------------------
// Issue Activity sync
// ---------------------------------------------------------------------------

export async function syncIssueActivityToQdrant(activity: {
  id: string;
  action: string;
  itemId: string;
  fieldName?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  details?: string | null;
  workspaceId: string;
  projectId?: string | null;
  userId?: string;
  createdAt?: Date | string;
}): Promise<void> {
  await ensureCollection();

  const parts = [`Activity: ${activity.action} on issue ${activity.itemId}`];
  if (activity.fieldName) parts.push(`Field: ${activity.fieldName}`);
  if (activity.oldValue) parts.push(`From: ${activity.oldValue}`);
  if (activity.newValue) parts.push(`To: ${activity.newValue}`);
  if (activity.details) parts.push(`Details: ${activity.details}`);
  const text = parts.join('\n');

  const vector = embeddingService
    ? await embeddingService.embed(text)
    : new Array(DEFAULT_DIMENSIONS).fill(0);

  await withQdrantRetry(() =>
    qdrantClient.upsert(COLLECTION_NAME, {
      points: [
        {
          id: cuidToUuid(activity.id),
          vector,
          payload: {
            type: 'issue_activity',
            source_id: activity.id,
            action: activity.action,
            itemId: activity.itemId,
            fieldName: activity.fieldName || '',
            oldValue: activity.oldValue || '',
            newValue: activity.newValue || '',
            details: activity.details || '',
            workspaceId: activity.workspaceId,
            projectId: activity.projectId || '',
            userId: activity.userId || '',
            createdAt: activity.createdAt ? new Date(activity.createdAt).toISOString() : '',
          },
        },
      ],
    })
  );
}

// ---------------------------------------------------------------------------
// Deletion
// ---------------------------------------------------------------------------

export async function removeFromQdrant(id: string): Promise<void> {
  await ensureCollection();
  try {
    await qdrantClient.delete(COLLECTION_NAME, { points: [cuidToUuid(id)] });
  } catch (error) {
    console.error(`Failed to remove ${id} from Qdrant:`, error);
  }
}

// ---------------------------------------------------------------------------
// Batch sync (for migration)
// ---------------------------------------------------------------------------

const BATCH_SIZE = 64; // Points per upsert batch
const EMBED_BATCH_SIZE = 128; // Texts per embedding API call

export interface MigrationStats {
  issues: { total: number; synced: number; errors: number };
  activities: { total: number; synced: number; errors: number };
  contexts: { total: number; synced: number; errors: number };
}

export async function batchSyncIssuesToQdrant(
  issues: Array<{
    id: string;
    title: string;
    description?: string | null;
    issueKey?: string | null;
    type?: string;
    priority?: string;
    status?: string;
    statusId?: string | null;
    projectId?: string;
    workspaceId: string;
    assigneeId?: string | null;
    reporterId?: string | null;
    createdAt?: Date | string;
    updatedAt?: Date | string;
  }>
): Promise<{ synced: number; errors: number }> {
  await ensureCollection();
  let synced = 0;
  let errors = 0;

  // Process in embed batches
  for (let i = 0; i < issues.length; i += EMBED_BATCH_SIZE) {
    const batch = issues.slice(i, i + EMBED_BATCH_SIZE);
    const texts = batch.map((issue) =>
      [issue.title, issue.description].filter(Boolean).join('\n\n')
    );

    let vectors: number[][];
    try {
      vectors = embeddingService
        ? await embeddingService.embedBatch(texts)
        : texts.map(() => new Array(DEFAULT_DIMENSIONS).fill(0));
    } catch (err) {
      console.error(`Embedding batch failed at offset ${i}:`, err);
      errors += batch.length;
      continue;
    }

    // Build points
    const points = batch.map((issue, j) => ({
      id: cuidToUuid(issue.id),
      vector: vectors[j],
      payload: {
        type: 'issue' as const,
        source_id: issue.id,
        title: issue.title,
        content: issue.description || '',
        issueKey: issue.issueKey || '',
        issueType: issue.type || '',
        priority: issue.priority || '',
        status: issue.status || '',
        statusId: issue.statusId || '',
        projectId: issue.projectId || '',
        workspaceId: issue.workspaceId,
        assigneeId: issue.assigneeId || '',
        reporterId: issue.reporterId || '',
        createdAt: issue.createdAt ? new Date(issue.createdAt).toISOString() : '',
        updatedAt: issue.updatedAt ? new Date(issue.updatedAt).toISOString() : '',
      },
    }));

    // Upsert in smaller batches
    for (let j = 0; j < points.length; j += BATCH_SIZE) {
      const upsertBatch = points.slice(j, j + BATCH_SIZE);
      try {
        await qdrantClient.upsert(COLLECTION_NAME, { points: upsertBatch });
        synced += upsertBatch.length;
      } catch (err) {
        console.error(`Qdrant upsert failed at offset ${i + j}:`, err);
        errors += upsertBatch.length;
      }
    }
  }

  return { synced, errors };
}

export async function batchSyncContextsToQdrant(
  contexts: Array<{
    id: string;
    title: string;
    content: string;
    type?: string;
    scope?: string;
    isAiContext?: boolean;
    aiContextPriority?: number;
    projectId?: string | null;
    workspaceId?: string;
    authorId?: string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
  }>
): Promise<{ synced: number; errors: number }> {
  await ensureCollection();
  let synced = 0;
  let errors = 0;

  for (let i = 0; i < contexts.length; i += EMBED_BATCH_SIZE) {
    const batch = contexts.slice(i, i + EMBED_BATCH_SIZE);
    const texts = batch.map((ctx) =>
      [ctx.title, ctx.content].filter(Boolean).join('\n\n')
    );

    let vectors: number[][];
    try {
      vectors = embeddingService
        ? await embeddingService.embedBatch(texts)
        : texts.map(() => new Array(DEFAULT_DIMENSIONS).fill(0));
    } catch (err) {
      console.error(`Embedding batch failed at offset ${i}:`, err);
      errors += batch.length;
      continue;
    }

    const points = batch.map((ctx, j) => ({
      id: cuidToUuid(ctx.id),
      vector: vectors[j],
      payload: {
        type: 'context' as const,
        source_id: ctx.id,
        title: ctx.title,
        content: ctx.content,
        contextType: ctx.type || 'GENERAL',
        scope: ctx.scope || 'WORKSPACE',
        isAiContext: ctx.isAiContext || false,
        aiContextPriority: ctx.aiContextPriority || 0,
        projectId: ctx.projectId || '',
        workspaceId: ctx.workspaceId || '',
        authorId: ctx.authorId || '',
        createdAt: ctx.createdAt ? new Date(ctx.createdAt).toISOString() : '',
        updatedAt: ctx.updatedAt ? new Date(ctx.updatedAt).toISOString() : '',
      },
    }));

    for (let j = 0; j < points.length; j += BATCH_SIZE) {
      const upsertBatch = points.slice(j, j + BATCH_SIZE);
      try {
        await qdrantClient.upsert(COLLECTION_NAME, { points: upsertBatch });
        synced += upsertBatch.length;
      } catch (err) {
        console.error(`Qdrant upsert failed at offset ${i + j}:`, err);
        errors += upsertBatch.length;
      }
    }
  }

  return { synced, errors };
}

export async function batchSyncActivitiesToQdrant(
  activities: Array<{
    id: string;
    action: string;
    itemId: string;
    fieldName?: string | null;
    oldValue?: string | null;
    newValue?: string | null;
    details?: string | null;
    workspaceId: string;
    projectId?: string | null;
    userId?: string;
    createdAt?: Date | string;
  }>
): Promise<{ synced: number; errors: number }> {
  await ensureCollection();
  let synced = 0;
  let errors = 0;

  for (let i = 0; i < activities.length; i += EMBED_BATCH_SIZE) {
    const batch = activities.slice(i, i + EMBED_BATCH_SIZE);
    const texts = batch.map((act) => {
      const parts = [`Activity: ${act.action} on issue ${act.itemId}`];
      if (act.fieldName) parts.push(`Field: ${act.fieldName}`);
      if (act.oldValue) parts.push(`From: ${act.oldValue}`);
      if (act.newValue) parts.push(`To: ${act.newValue}`);
      if (act.details) parts.push(`Details: ${act.details}`);
      return parts.join('\n');
    });

    let vectors: number[][];
    try {
      vectors = embeddingService
        ? await embeddingService.embedBatch(texts)
        : texts.map(() => new Array(DEFAULT_DIMENSIONS).fill(0));
    } catch (err) {
      console.error(`Embedding batch failed at offset ${i}:`, err);
      errors += batch.length;
      continue;
    }

    const points = batch.map((act, j) => ({
      id: cuidToUuid(act.id),
      vector: vectors[j],
      payload: {
        type: 'issue_activity' as const,
        source_id: act.id,
        action: act.action,
        itemId: act.itemId,
        fieldName: act.fieldName || '',
        oldValue: act.oldValue || '',
        newValue: act.newValue || '',
        details: act.details || '',
        workspaceId: act.workspaceId,
        projectId: act.projectId || '',
        userId: act.userId || '',
        createdAt: act.createdAt ? new Date(act.createdAt).toISOString() : '',
      },
    }));

    for (let j = 0; j < points.length; j += BATCH_SIZE) {
      const upsertBatch = points.slice(j, j + BATCH_SIZE);
      try {
        await qdrantClient.upsert(COLLECTION_NAME, { points: upsertBatch });
        synced += upsertBatch.length;
      } catch (err) {
        console.error(`Qdrant upsert failed at offset ${i + j}:`, err);
        errors += upsertBatch.length;
      }
    }
  }

  return { synced, errors };
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export async function searchQdrant(
  query: string,
  options: {
    workspaceId: string;
    type?: 'issue' | 'context' | 'issue_activity';
    projectId?: string;
    limit?: number;
  } = { workspaceId: '' }
): Promise<any[]> {
  await ensureCollection();

  if (!embeddingService) {
    console.warn('No embedding service configured — semantic search unavailable');
    return [];
  }

  const queryVector = await embeddingService.embed(query);

  const filter: any = {
    must: [{ key: 'workspaceId', match: { value: options.workspaceId } }],
  };

  if (options.type) {
    filter.must.push({ key: 'type', match: { value: options.type } });
  }
  if (options.projectId) {
    filter.must.push({ key: 'projectId', match: { value: options.projectId } });
  }

  const results = await qdrantClient.search(COLLECTION_NAME, {
    vector: queryVector,
    filter,
    limit: options.limit || 10,
    with_payload: true,
  });

  return results;
}

// ---------------------------------------------------------------------------
// Collection info (for migration status)
// ---------------------------------------------------------------------------

export async function getCollectionInfo(): Promise<{
  exists: boolean;
  pointCount: number;
  status: string;
} | null> {
  try {
    const info = await qdrantClient.getCollection(COLLECTION_NAME);
    return {
      exists: true,
      pointCount: info.points_count ?? 0,
      status: info.status as string,
    };
  } catch {
    return { exists: false, pointCount: 0, status: 'not_found' };
  }
}
