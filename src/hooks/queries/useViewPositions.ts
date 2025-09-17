import { useQuery } from '@tanstack/react-query';

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

async function fetchViewPositions(viewId: string): Promise<ViewPositionsResponse> {
  const response = await fetch(`/api/views/${viewId}/issue-positions`, {
    cache: 'no-store',
    headers: {
      'cache-control': 'no-store'
    }
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch view positions');
  }
  
  return response.json();
}

export function useViewPositions(viewId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: ['viewPositions', viewId],
    queryFn: () => fetchViewPositions(viewId),
    enabled: enabled && !!viewId,
    // No caching: always stale and clear immediately
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchOnMount: 'always',
    retry: false,
  });
}

// Helper function to merge issues with their view-specific positions
export function mergeIssuesWithViewPositions(
  issues: any[], 
  positions: ViewIssuePosition[] = []
): any[] {
  // Create a map of issueId -> position for the current column/status
  return issues.map(issue => {
    return {
      ...issue,
      viewPosition: positions.find(pos => pos.issueId === issue.id)?.position
    };
  });
}