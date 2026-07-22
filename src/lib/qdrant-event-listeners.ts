import { eventBus } from './event-bus';
import { syncIssueToQdrant, syncContextToQdrant, removeFromQdrant } from './qdrant-sync';

/**
 * Register Qdrant sync listeners on the EventBus.
 * Call this once at app startup (e.g., via server-init.ts).
 *
 * All listeners are fire-and-forget — they never block the
 * request that triggered the event.
 */
export function registerQdrantListeners(): void {
  if (!process.env.QDRANT_URL) {
    console.log('ℹ️ QDRANT_URL not configured — Qdrant sync disabled');
    return;
  }

  console.log('📡 Registering Qdrant sync listeners...');

  // ---- Issue events -------------------------------------------------------

  eventBus.on('issue.created', async (event) => {
    try {
      const { issue } = event.data;
      await syncIssueToQdrant({
        ...issue,
        workspaceId: event.workspace.id,
      });
      console.log(`🔄 Synced issue to Qdrant: ${issue.id}`);
    } catch (error: any) {
      console.error('Failed to sync issue to Qdrant:', error.message);
    }
  });

  eventBus.on('issue.updated', async (event) => {
    try {
      const { issue } = event.data;
      await syncIssueToQdrant({
        ...issue,
        workspaceId: event.workspace.id,
      });
      console.log(`🔄 Updated issue in Qdrant: ${issue.id}`);
    } catch (error: any) {
      console.error('Failed to update issue in Qdrant:', error.message);
    }
  });

  eventBus.on('issue.deleted', async (event) => {
    try {
      const { issue } = event.data;
      await removeFromQdrant(issue.id);
      console.log(`🗑️ Removed issue from Qdrant: ${issue.id}`);
    } catch (error: any) {
      console.error('Failed to remove issue from Qdrant:', error.message);
    }
  });

  // ---- Context (note) events ----------------------------------------------

  eventBus.on('context.created', async (event) => {
    try {
      const { context } = event.data;
      await syncContextToQdrant({
        ...context,
        workspaceId: event.workspace.id,
      });
      console.log(`🔄 Synced context to Qdrant: ${context.id}`);
    } catch (error: any) {
      console.error('Failed to sync context to Qdrant:', error.message);
    }
  });

  eventBus.on('context.updated', async (event) => {
    try {
      const { context } = event.data;
      await syncContextToQdrant({
        ...context,
        workspaceId: event.workspace.id,
      });
      console.log(`🔄 Updated context in Qdrant: ${context.id}`);
    } catch (error: any) {
      console.error('Failed to update context in Qdrant:', error.message);
    }
  });

  eventBus.on('context.deleted', async (event) => {
    try {
      const { context } = event.data;
      await removeFromQdrant(context.id);
      console.log(`🗑️ Removed context from Qdrant: ${context.id}`);
    } catch (error: any) {
      console.error('Failed to remove context from Qdrant:', error.message);
    }
  });

  console.log('✅ Qdrant sync listeners registered');
}
