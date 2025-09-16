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
  const positionMap = new Map<string, number>();
  
  // Create a map of issueId -> position for the current column/status
  positions.forEach(pos => {
    const key = `${pos.issueId}_${pos.columnId}`;
    positionMap.set(key, pos.position);
  });
  
  return issues.map(issue => {
    const currentStatus = issue.projectStatus?.name || issue.statusValue || issue.status || 'todo';
    const positionKey = `${issue.id}_${currentStatus}`;
    const viewPosition = positionMap.get(positionKey);
    
    return {
      ...issue,
      viewPosition: viewPosition
    };
  });
}