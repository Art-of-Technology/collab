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
  const response = await fetch(`/api/views/${viewId}/issue-positions`);
  
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
    staleTime: 5000, // 5 seconds - balance between freshness and performance
    refetchOnWindowFocus: true,
    refetchOnMount: true,
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
    const currentStatus = issue.statusValue || issue.status || 'todo';
    const positionKey = `${issue.id}_${currentStatus}`;
    const viewPosition = positionMap.get(positionKey);
    
    return {
      ...issue,
      viewPosition: viewPosition
    };
  });
}