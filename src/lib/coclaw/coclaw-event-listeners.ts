/**
 * Coclaw Event Listeners
 *
 * Registers EventBus listeners for Coclaw instance lifecycle events.
 * Currently a placeholder — will wire up user.logout and workspace.leave
 * events in Phase 6 to trigger instance cleanup.
 */

import { eventBus } from '@/lib/event-bus';
import { coclawManager } from './instance-manager';

/**
 * Register all Coclaw-related event listeners.
 * Called once from server-init.ts during process startup.
 */
export function registerCoclawListeners(): void {
  // Placeholder: future events to listen for
  // eventBus.on('user.logout', async ({ userId }) => { ... });
  // eventBus.on('workspace.memberRemoved', async ({ userId, workspaceId }) => { ... });

  console.log('[Coclaw] Event listeners registered');

  // Handle process shutdown gracefully
  const shutdown = () => {
    coclawManager.shutdownAll().catch((err) =>
      console.error('[Coclaw] Error during shutdown:', err),
    );
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
