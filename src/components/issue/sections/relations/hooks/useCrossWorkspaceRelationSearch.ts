import { useQuery } from "@tanstack/react-query";
import type { RelationItem, RelationSearchFilters } from "../types/relation";

export function useCrossWorkspaceRelationSearch(
  query: string,
  filters: RelationSearchFilters = {},
  excludeIds: string[] = [],
  enabled = true
) {
  return useQuery({
    queryKey: ["cross-workspace-relation-search", query, filters, excludeIds],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      
      if (query) searchParams.append("q", query);
      // Don't specify workspace to search across all accessible workspaces
      
      // Add type filters - convert to API format
      if (filters.type?.length) {
        filters.type.forEach(type => {
          let apiType: string;
          switch (type) {
            case 'issue':
              apiType = 'TASK'; // Issues are stored as TASK type in the API
              break;
            case 'story':
              apiType = 'STORY';
              break;
            case 'epic':
              apiType = 'EPIC';
              break;
            case 'milestone':
              apiType = 'MILESTONE';
              break;
            case 'task':
              apiType = 'TASK';
              break;
            case 'defect':
              apiType = 'BUG';
              break;
            default:
              apiType = String(type).toUpperCase();
          }
          searchParams.append("type", apiType);
        });
      }
      
      // Add project filter
      if (filters.project?.length) {
        filters.project.forEach(projectId => {
          searchParams.append("project", projectId);
        });
      }
      
      const response = await fetch(
        `/api/issues/search?${searchParams.toString()}`
      );
      
      if (!response.ok) {
        throw new Error("Failed to search issues");
      }
      
      const issues = await response.json();
      
      // Filter out excluded IDs and transform to RelationItem format with workspace info
      const filteredIssues = issues
        .filter((issue: any) => !excludeIds.includes(issue.id))
        .map((issue: any) => ({
          id: issue.id,
          title: issue.title,
          issueKey: issue.issueKey,
          status: issue.status,
          priority: issue.priority,
          type: issue.type?.toLowerCase() === 'task' ? 'issue' : 
                issue.type?.toLowerCase() === 'bug' ? 'defect' :
                issue.type?.toLowerCase() || 'issue',
          assignee: issue.assignee,
          project: issue.project,
          workspace: issue.workspace, // Include workspace information for cross-workspace context
          createdAt: issue.createdAt || new Date().toISOString(),
          updatedAt: issue.updatedAt || new Date().toISOString(),
          dueDate: issue.dueDate,
          _count: issue._count
        }));
      
      return filteredIssues;
    },
    enabled: enabled && query.length >= 2,
    staleTime: 10000, // 10 seconds
    refetchOnWindowFocus: false,
  });
}

// Hook for getting user's accessible workspaces
export function useUserWorkspaces() {
  return useQuery({
    queryKey: ["user-workspaces"],
    queryFn: async () => {
      const response = await fetch("/api/workspaces");
      if (!response.ok) {
        throw new Error("Failed to fetch workspaces");
      }
      return response.json();
    },
    staleTime: 300000, // 5 minutes
    refetchOnWindowFocus: false,
  });
}
