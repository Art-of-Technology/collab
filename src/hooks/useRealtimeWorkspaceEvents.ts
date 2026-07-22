"use client";

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { issueKeys } from '@/hooks/queries/useIssues';

export interface RealtimeOptions {
  workspaceId?: string;
  boardId?: string;
  viewId?: string;
}

// Singleton connection manager per workspace to avoid duplicate SSE connections
type WorkspaceConnection = {
  source: EventSource;
  refCount: number;
  listeners: Set<(data: any) => void>;
};

const workspaceConnections: Record<string, WorkspaceConnection> = {};

function getOrCreateWorkspaceConnection(workspaceId: string): WorkspaceConnection {
  let conn = workspaceConnections[workspaceId];
  if (conn) return conn;

  const url = `/api/realtime/workspace/${workspaceId}/stream`;
  const source = new EventSource(url, { withCredentials: true });
  conn = {
    source,
    refCount: 0,
    listeners: new Set(),
  };

  source.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      conn.listeners.forEach((cb) => cb(data));
    } catch {
      // ignore
    }
  };

  source.onerror = () => {
    // Allow the browser to manage reconnection
  };

  workspaceConnections[workspaceId] = conn;
  return conn;
}

// Global drag operations tracking to share across hook instances
const globalDragOperations = new Set<string>();
// Global pending drag operations - tracks operations that haven't completed their PUT requests yet
const globalPendingOperations = new Set<string>();

// Utility function to mark issues as being dragged
export function markIssueAsDragging(issueId: string) {
  globalDragOperations.add(issueId);
  globalPendingOperations.add(issueId);
  // Auto-cleanup after 5 seconds as safety net
  setTimeout(() => {
    globalDragOperations.delete(issueId);
    globalPendingOperations.delete(issueId);
  }, 5000);
}

// Global query client reference for triggering delayed GET requests
let globalQueryClient: any = null;
const delayedViewRequests = new Map<string, { sequence: number; viewId: string }>();
// Track views that just had delayed requests triggered to prevent double-triggering
const recentlyTriggeredViews = new Set<string>();

// Utility function to mark operation as completed (PUT request finished)
export function markOperationCompleted(issueId: string) {
  globalPendingOperations.delete(issueId);
  
  // If this was the last pending operation, trigger any delayed GET requests
  if (globalPendingOperations.size === 0 && delayedViewRequests.size > 0) {
    
    // Trigger all delayed requests after a short delay to ensure WebSocket events have been processed
    setTimeout(() => {
      if (globalQueryClient && globalPendingOperations.size === 0) { // Double-check no new operations started
        delayedViewRequests.forEach(({ viewId }) => {
          recentlyTriggeredViews.add(viewId); // Mark as recently triggered
          globalQueryClient.invalidateQueries({ queryKey: ['viewPositions', viewId] });
          
          // Clear the recently triggered flag after a short delay
          setTimeout(() => {
            recentlyTriggeredViews.delete(viewId);
          }, 500);
        });
        delayedViewRequests.clear();
      }
    }, 100);
  }
  
  // Keep in globalDragOperations for a bit longer to suppress issue.updated events
  setTimeout(() => {
    globalDragOperations.delete(issueId);
  }, 3000);
}

// Function to add a delayed view request
export function addDelayedViewRequest(viewId: string, sequence: number) {
  delayedViewRequests.set(viewId, { sequence, viewId });
}

// Check if there are any pending operations
export function hasPendingDragOperations(): boolean {
  return globalPendingOperations.size > 0;
}

export function useRealtimeWorkspaceEvents(options: RealtimeOptions, suppressInvalidations: null | boolean = false) {
  const { workspaceId, boardId, viewId } = options;
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const currentUserId = session?.user?.id;
  
  // Set global query client reference for delayed requests
  globalQueryClient = queryClient;
  
  // Track pending requests and sequences to prevent out-of-order invalidations
  const positionUpdateTimeouts = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const recentBatchIds = useRef<Set<string>>(new Set());
  const latestSequences = useRef<Map<string, number>>(new Map());
  const pendingInvalidations = useRef<Map<string, { sequence: number, timeout: NodeJS.Timeout }>>(new Map());
  
  // Track recent drag operations to suppress conflicting issue invalidations
  const recentDragOperations = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!workspaceId) return;

    const conn = getOrCreateWorkspaceConnection(workspaceId);
    conn.refCount += 1;

    const handleEvent = (data: any) => {
      try {
        if (suppressInvalidations) return;
        
        // Handle connection status events
        if (data?.type === 'connected') {
          console.log(`📡 Real-time connection established for workspace`);
          return;
        }
        
        if (data?.type === 'realtime.ready') {
          console.log(`✅ Real-time fully operational with Redis`);
          return;
        }
        
        if (data?.type === 'realtime.degraded') {
          console.warn(`⚠️ Real-time running in degraded mode:`, data.reason);
          return;
        }
        
        if (data?.type === 'realtime.error') {
          console.error(`❌ Real-time error:`, data.error);
          return;
        }

        // Process real-time events
        if (data?.type === 'issue.updated') {
          // Check if this is a recent drag operation - if so, skip bulk issues invalidation
          // to prevent interference with optimistic drag updates
          const isDragRelated = data.issueId && (
            recentDragOperations.current.has(data.issueId) || 
            globalDragOperations.has(data.issueId)
          );
          
          if (data.workspaceId && !isDragRelated) {
            queryClient.invalidateQueries({ queryKey: issueKeys.byWorkspace(String(data.workspaceId)) });
          }

          if (data.issueId) {
            queryClient.invalidateQueries({ queryKey: issueKeys.detail(String(data.issueId)) });
          }
          
          // Clean up drag operation tracking after a delay
          if (isDragRelated && data.issueId) {
            setTimeout(() => {
              recentDragOperations.current.delete(data.issueId);
            }, 2000); // Clean up after 2 seconds
          }
        }

        if (data?.type === 'issue.created') {
          if (data.workspaceId) {
            queryClient.invalidateQueries({ queryKey: issueKeys.byWorkspace(String(data.workspaceId)) });
          }
          if (data.issueId) {
            queryClient.invalidateQueries({ queryKey: issueKeys.detail(String(data.issueId)) });
          }
        }

        if (data?.type === 'view.issue-position.updated') {
            if (data.viewId && (!viewId || data.viewId === viewId)) {
              const currentSequence = data.sequence || 0;
              const lastSequence = latestSequences.current.get(data.viewId) || 0;
            
            // Prevent duplicate invalidations from the same batch
            if (data.batchId && recentBatchIds.current.has(data.batchId)) {
              return;
            }
            
            if (data.batchId) {
              recentBatchIds.current.add(data.batchId);
              // Clean up batch ID after 5 seconds
              setTimeout(() => {
                recentBatchIds.current.delete(data.batchId);
              }, 5000);
            }
            
            // Update latest sequence for this view
            latestSequences.current.set(data.viewId, Math.max(lastSequence, currentSequence));
            
            // Cancel any existing pending invalidation for this view
            const existingPending = pendingInvalidations.current.get(data.viewId);
            if (existingPending) {
              clearTimeout(existingPending.timeout);
              pendingInvalidations.current.delete(data.viewId);
            }
            
            // Only schedule invalidation if this is the latest sequence
            const isLatestSequence = currentSequence >= latestSequences.current.get(data.viewId)!;
            
            if (isLatestSequence) {
              // Check if this update is from the current user (my action) or another user
              const isMyAction = data.userId === currentUserId;
              
              // Track affected issues from this drag operation (only for my actions)
              if (isMyAction && data.affectedIssues && Array.isArray(data.affectedIssues)) {
                data.affectedIssues.forEach((issueId: string) => {
                  recentDragOperations.current.add(issueId);
                  globalDragOperations.add(issueId);
                  // Clean up after 3 seconds
                  setTimeout(() => {
                    recentDragOperations.current.delete(issueId);
                    globalDragOperations.delete(issueId);
                  }, 3000);
                });
              }
              
              // If this is MY action, check for pending operations to avoid conflicts
              // If this is ANOTHER USER's action, process immediately for real-time updates
              if (isMyAction && hasPendingDragOperations()) {
                addDelayedViewRequest(data.viewId, currentSequence);
                return; // Don't schedule GET request while I have pending operations
              }
              
              // Check if this view was recently triggered by the delayed system
              if (recentlyTriggeredViews.has(data.viewId)) {
                return; // Don't trigger another GET request if we just triggered one
              }
              
              // Clear any existing timeout for this view to prevent premature GET requests
              const existingInvalidation = pendingInvalidations.current.get(data.viewId);
              if (existingInvalidation) {
                clearTimeout(existingInvalidation.timeout);
              }
              
              // Use shorter delay for other users' actions to ensure faster real-time updates
              const delayMs = isMyAction ? 200 : 50; // Faster updates for other users
              
              const timeout = setTimeout(() => {
                // For my actions, check pending operations. For others, process immediately
                if (isMyAction && hasPendingDragOperations()) {
                  pendingInvalidations.current.delete(data.viewId);
                  return;
                }
                
                // Double-check we're still the latest before invalidating
                const finalLatestSequence = latestSequences.current.get(data.viewId) || 0;
                if (currentSequence >= finalLatestSequence) {
                  queryClient.invalidateQueries({ queryKey: ['viewPositions', data.viewId] });
                }
                pendingInvalidations.current.delete(data.viewId);
              }, delayMs);
              
              pendingInvalidations.current.set(data.viewId, { sequence: currentSequence, timeout });
            } else {
              // Ignoring out-of-order position update (expected behavior)
            }
          }
        }

        // Board events removed - boards have been replaced with views
      } catch {
        // ignore invalid messages
      }
    };

    conn.listeners.add(handleEvent);

    return () => {
      // Clear any pending position update timeouts
      positionUpdateTimeouts.current.forEach(timeout => clearTimeout(timeout));
      positionUpdateTimeouts.current.clear();
      
      // Clear pending invalidations
      pendingInvalidations.current.forEach(pending => clearTimeout(pending.timeout));
      pendingInvalidations.current.clear();
      
      // Clear tracking data
      recentBatchIds.current.clear();
      latestSequences.current.clear();
      recentDragOperations.current.clear();
      
      conn.listeners.delete(handleEvent);
      conn.refCount -= 1;
      if (conn.refCount <= 0) {
        try { conn.source.close(); } catch {}
        delete workspaceConnections[workspaceId];
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, boardId, viewId]);
}



