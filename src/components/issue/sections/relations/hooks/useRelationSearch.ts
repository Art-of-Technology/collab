import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { RelationItem, RelationSearchFilters, RelatedItemType } from "../types/relation";

export function useRelationSearch(
  workspaceId: string,
  query: string,
  filters: RelationSearchFilters = {},
  excludeIds: string[] = [],
  enabled = true
) {
  return useQuery({
    queryKey: ["relation-search", workspaceId, query, filters, excludeIds],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      
      if (query) searchParams.append("q", query);
      searchParams.append("workspace", workspaceId);
      
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
      
      // Filter out excluded IDs and transform to RelationItem format
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
          createdAt: issue.createdAt || new Date().toISOString(),
          updatedAt: issue.updatedAt || new Date().toISOString(),
          dueDate: issue.dueDate,
          _count: issue._count
        }));
      
      return filteredIssues;
    },
    enabled: enabled && !!workspaceId,
    staleTime: 10000, // 10 seconds
    refetchOnWindowFocus: false,
  });
}

// Hook for getting available filter options
export function useRelationFilterOptions(workspaceId: string) {
  return useQuery({
    queryKey: ["relation-filter-options", workspaceId],
    queryFn: async () => {
      const response = await fetch(`/api/workspaces/${workspaceId}/filter-options`);
      if (!response.ok) {
        throw new Error("Failed to fetch filter options");
      }
      return response.json();
    },
    enabled: !!workspaceId,
    staleTime: 300000, // 5 minutes
    refetchOnWindowFocus: false,
  });
}

// Hook for debounced search
export function useDebouncedRelationSearch(
  workspaceId: string,
  query: string,
  filters: RelationSearchFilters = {},
  excludeIds: string[] = [],
  debounceMs = 300
) {
  const debouncedQuery = useMemo(() => {
    const timer = setTimeout(() => query, debounceMs);
    return () => clearTimeout(timer);
  }, [query, debounceMs]);

  return useRelationSearch(
    workspaceId,
    query,
    filters,
    excludeIds,
    query.length >= 2 // Only search when query is at least 2 characters
  );
}
