"use client";

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export interface CreateIssueData {
  title: string;
  description?: string;
  type?: string;
  status?: string;
  priority?: string;
  projectId: string;
  workspaceId: string;
  assigneeId?: string;
  reporterId?: string;
  labels?: string[];
  dueDate?: Date;
  parentId?: string;
}

export interface UpdateIssueData {
  id: string;
  title?: string;
  description?: string;
  type?: string;
  status?: string;
  statusValue?: string;
  priority?: string;
  assigneeId?: string;
  reporterId?: string;
  labels?: string[];
  dueDate?: Date;
  position?: number;
}

// Query key factory
export const issueKeys = {
  all: ['issues'] as const,
  lists: () => [...issueKeys.all, 'list'] as const,
  list: (filters: string) => [...issueKeys.lists(), filters] as const,
  details: () => [...issueKeys.all, 'detail'] as const,
  detail: (id: string) => [...issueKeys.details(), id] as const,
  byWorkspace: (workspaceId: string) => [...issueKeys.all, 'workspace', workspaceId] as const,
  byProject: (projectId: string) => [...issueKeys.all, 'project', projectId] as const,
  byView: (viewId: string, workspaceId: string) => [...issueKeys.all, 'view', viewId, workspaceId] as const,
};

// Hook for fetching issues by workspace (used by views)
export function useIssuesByWorkspace(workspaceId: string, projectIds?: string[]) {
  return useQuery({
    queryKey: [...issueKeys.byWorkspace(workspaceId), ...(projectIds || []).sort()],
    queryFn: async () => {
      const params = new URLSearchParams({
        workspaceId,
        ...(projectIds && projectIds.length > 0 && { projectIds: projectIds.join(',') })
      });
      
      const response = await fetch(`/api/issues?${params}`);
      if (!response.ok) {
        throw new Error('Failed to fetch issues');
      }
      return response.json();
    },
    enabled: !!workspaceId,
    staleTime: 5000, // 5 seconds to allow optimistic updates to show
  });
}

// Hook for fetching a single issue
export function useIssue(issueId: string) {
  return useQuery({
    queryKey: issueKeys.detail(issueId),
    queryFn: async () => {
      const response = await fetch(`/api/issues/${issueId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch issue');
      }
      return response.json();
    },
    enabled: !!issueId,
  });
}

// Hook for creating issues
export function useCreateIssue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateIssueData): Promise<any> => {
      // Normalize issue type casing
      const payload: CreateIssueData = { ...data };
      if (payload.type) {
        payload.type = payload.type.toUpperCase();
      }

      const response = await fetch('/api/issues', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create issue');
      }

      return response.json();
    },
    onSuccess: (data, variables) => {
      // Invalidate and refetch related queries
      // Invalidate all workspace queries (with any project combination)
      queryClient.invalidateQueries({ 
        predicate: (query) => 
          query.queryKey[0] === 'issues' && 
          query.queryKey[1] === 'workspace' && 
          query.queryKey[2] === variables.workspaceId
      });
      queryClient.invalidateQueries({ queryKey: issueKeys.byProject(variables.projectId) });
      queryClient.invalidateQueries({ queryKey: issueKeys.lists() });
      
      // Optionally add the new issue to the cache immediately
      queryClient.setQueryData(issueKeys.detail(data.issue.id), data);
    },
  });
}

// Hook for updating issues
export function useUpdateIssue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: UpdateIssueData): Promise<any> => {
      const { id, ...updateData } = data;
      // Normalize issue type casing
      if (updateData.type) {
        updateData.type = updateData.type.toUpperCase();
      }
      const response = await fetch(`/api/issues/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to update issue');
      }

      return response.json();
    },
    onSuccess: (data, variables) => {
      // Update the specific issue in cache
      queryClient.setQueryData(issueKeys.detail(variables.id), data);
      
      // Normal invalidation - now that we use local state, this won't cause flicker
      queryClient.invalidateQueries({ queryKey: issueKeys.lists() });
      queryClient.invalidateQueries({ queryKey: issueKeys.byWorkspace(data.issue.workspaceId) });
      queryClient.invalidateQueries({ queryKey: issueKeys.byProject(data.issue.projectId) });
    },
  });
}

// Hook for deleting issues
export function useDeleteIssue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (issueId: string): Promise<void> => {
      const response = await fetch(`/api/issues/${issueId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to delete issue');
      }
    },
    onSuccess: (_, issueId) => {
      // Remove from cache
      queryClient.removeQueries({ queryKey: issueKeys.detail(issueId) });
      
      // Invalidate lists
      queryClient.invalidateQueries({ queryKey: issueKeys.lists() });
      queryClient.invalidateQueries({ queryKey: issueKeys.all });
    },
  });
}
