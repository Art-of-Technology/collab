import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useEffect } from 'react';

interface ViewIssuePosition {
  id: string;
  viewId: string;
  issueId: string;
  columnId: string;
  position: number;
  createdAt: string;
  updatedAt: string;
}

interface ViewPositionsResponse {
  positions: ViewIssuePosition[];
}

async function fetchViewPositions(viewId: string, signal?: AbortSignal): Promise<ViewPositionsResponse> {
  const response = await fetch(`/api/views/${viewId}/issue-positions`, {
    cache: 'no-store',
    headers: {
      'cache-control': 'no-store'
    },
    signal
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch view positions');
  }
  
  return response.json();
}

// Global map to track pending requests across all view instances
const pendingViewRequests = new Map<string, AbortController>();

export function useViewPositions(viewId: string, enabled: boolean = true) {
  const queryClient = useQueryClient();
  
  // Clean up pending request when hook unmounts or viewId changes
  useEffect(() => {
    return () => {
      const controller = pendingViewRequests.get(viewId);
      if (controller) {
        controller.abort();
        pendingViewRequests.delete(viewId);
      }
    };
  }, [viewId]);
  
  return useQuery({
    queryKey: ['viewPositions', viewId],
    queryFn: async ({ signal }) => {
      // Cancel any existing request for this view
      const existingController = pendingViewRequests.get(viewId);
      if (existingController) {
        existingController.abort();
        // Don't delete immediately - let the previous request clean up itself
      }
      
      // Create new controller for this request
      const controller = new AbortController();
      pendingViewRequests.set(viewId, controller);
      
      // Create a combined signal that responds to both React Query's signal and our custom controller
      const combinedController = new AbortController();
      
      // Create abort handlers
      const handleReactQueryAbort = () => {
        combinedController.abort();
      };
      
      const handleCustomAbort = () => {
        combinedController.abort();
      };
      
      // Listen to React Query's signal
      if (signal) {
        signal.addEventListener('abort', handleReactQueryAbort);
      }
      
      // Listen to our custom controller's signal
      controller.signal.addEventListener('abort', handleCustomAbort);
      
      // Clean up function for event listeners
      const cleanup = () => {
        if (signal) {
          signal.removeEventListener('abort', handleReactQueryAbort);
        }
        controller.signal.removeEventListener('abort', handleCustomAbort);
      };
      
      try {
        const result = await fetchViewPositions(viewId, combinedController.signal);
        
        // Clean up event listeners and pending request tracking
        cleanup();
        if (pendingViewRequests.get(viewId) === controller) {
          pendingViewRequests.delete(viewId);
        }
        
        return result;
      } catch (error: any) {
        // Clean up event listeners and pending request tracking
        cleanup();
        if (pendingViewRequests.get(viewId) === controller) {
          pendingViewRequests.delete(viewId);
        }
        
        if (error?.name !== 'AbortError') {
          console.error(`Failed to fetch view positions for ${viewId}:`, error);
        }
        
        throw error;
      }
    },
    enabled: enabled && !!viewId,
    // More reasonable caching since we have proper invalidation
    staleTime: 5000, // 5 seconds before considering stale
    gcTime: 30000, // Keep in cache for 30 seconds
    refetchOnWindowFocus: false, // Don't refetch on focus since we have realtime
    refetchOnReconnect: true,
    refetchOnMount: true, // Only on mount, not 'always'
    retry: (failureCount, error: any) => {
      // Don't retry if the request was cancelled
      if (error?.name === 'AbortError') {
        return false;
      }
      return failureCount < 1; // Retry once on failure
    },
  });
}

// Helper function to merge issues with their view-specific positions
export function mergeIssuesWithViewPositions(
  issues: any[], 
  positions: ViewIssuePosition[] = []
): any[] {
  // Create a lookup map of issueId -> position for O(n + m) merging
  const positionByIssueId = new Map<string, number>();
  for (const pos of positions) {
    positionByIssueId.set(pos.issueId, pos.position);
  }

  return issues.map((issue) => ({
    ...issue,
    viewPosition: positionByIssueId.get(issue.id)
  }));
}