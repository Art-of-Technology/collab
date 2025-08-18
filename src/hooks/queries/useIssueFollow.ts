import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

interface IssueFollowStatus {
  isFollowing: boolean;
  followers: Array<{
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
    useCustomAvatar: boolean;
    avatarSkinTone: number | null;
    avatarEyes: number | null;
    avatarBrows: number | null;
    avatarMouth: number | null;
    avatarNose: number | null;
    avatarHair: number | null;
    avatarEyewear: number | null;
    avatarAccessory: number | null;
  }>;
  count: number;
}

const issueFollowKeys = {
  all: ['issueFollow'] as const,
  byIssue: (issueId: string) => [...issueFollowKeys.all, issueId] as const,
  byProject: (projectId: string) => [...issueFollowKeys.all, 'project', projectId] as const,
  byProjectIssue: (projectId: string, issueId: string) => [...issueFollowKeys.byProject(projectId), issueId] as const,
  byView: (viewId: string) => [...issueFollowKeys.all, 'view', viewId] as const,
  byViewIssue: (viewId: string, issueId: string) => [...issueFollowKeys.byView(viewId), issueId] as const,
};

export function useIssueFollowStatus(issueId: string, projectId?: string, viewId?: string) {
  return useQuery<IssueFollowStatus>({
    queryKey: projectId 
      ? issueFollowKeys.byProjectIssue(projectId, issueId)
      : viewId 
        ? issueFollowKeys.byViewIssue(viewId, issueId)
        : issueFollowKeys.byIssue(issueId),
    queryFn: async () => {
      const response = await fetch(`/api/issues/${issueId}/follow`);
      if (!response.ok) {
        throw new Error('Failed to get issue follow status');
      }
      return response.json();
    },
    enabled: !!issueId,
  });
}

export function useFollowIssue(issueId: string, projectId?: string, viewId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/issues/${issueId}/follow`, {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error('Failed to follow issue');
      }
      return response.json();
    },
    onSuccess: () => {
      // Invalidate specific issue query
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: issueFollowKeys.byProjectIssue(projectId, issueId) });
        // Also invalidate project-level queries if needed
        queryClient.invalidateQueries({ queryKey: issueFollowKeys.byProject(projectId) });
      } else if (viewId) {
        queryClient.invalidateQueries({ queryKey: issueFollowKeys.byViewIssue(viewId, issueId) });
        // Also invalidate view-level queries if needed
        queryClient.invalidateQueries({ queryKey: issueFollowKeys.byView(viewId) });
      } else {
        queryClient.invalidateQueries({ queryKey: issueFollowKeys.byIssue(issueId) });
      }
    },
  });
}

export function useUnfollowIssue(issueId: string, projectId?: string, viewId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/issues/${issueId}/follow`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error('Failed to unfollow issue');
      }
      return response.json();
    },
    onSuccess: () => {
      // Invalidate specific issue query
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: issueFollowKeys.byProjectIssue(projectId, issueId) });
        // Also invalidate project-level queries if needed
        queryClient.invalidateQueries({ queryKey: issueFollowKeys.byProject(projectId) });
      } else if (viewId) {
        queryClient.invalidateQueries({ queryKey: issueFollowKeys.byViewIssue(viewId, issueId) });
        // Also invalidate view-level queries if needed
        queryClient.invalidateQueries({ queryKey: issueFollowKeys.byView(viewId) });
      } else {
        queryClient.invalidateQueries({ queryKey: issueFollowKeys.byIssue(issueId) });
      }
    },
  });
}

// Hook to prefetch follow status for multiple issues in a project
export function usePrefetchProjectIssuesFollow(issueIds: string[], projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      // Prefetch follow status for all issues in the project
      const promises = issueIds.map(issueId => 
        queryClient.prefetchQuery({
          queryKey: issueFollowKeys.byProjectIssue(projectId, issueId),
          queryFn: async () => {
            const response = await fetch(`/api/issues/${issueId}/follow`);
            if (!response.ok) {
              throw new Error('Failed to get issue follow status');
            }
            return response.json();
          },
          staleTime: 5 * 60 * 1000, // Consider data fresh for 5 minutes
        })
      );
      
      await Promise.all(promises);
    },
  });
}

// Hook to prefetch follow status for multiple issues in a view
export function usePrefetchViewIssuesFollow(issueIds: string[], viewId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      // Prefetch follow status for all issues in the view
      const promises = issueIds.map(issueId => 
        queryClient.prefetchQuery({
          queryKey: issueFollowKeys.byViewIssue(viewId, issueId),
          queryFn: async () => {
            const response = await fetch(`/api/issues/${issueId}/follow`);
            if (!response.ok) {
              throw new Error('Failed to get issue follow status');
            }
            return response.json();
          },
          staleTime: 5 * 60 * 1000, // Consider data fresh for 5 minutes
        })
      );
      
      await Promise.all(promises);
    },
  });
}

// Hook to invalidate all follow queries for a project when switching
export function useInvalidateProjectFollowQueries() {
  const queryClient = useQueryClient();

  return (projectId: string) => {
    queryClient.invalidateQueries({ queryKey: issueFollowKeys.byProject(projectId) });
  };
}

// Hook to invalidate all follow queries for a view when switching
export function useInvalidateViewFollowQueries() {
  const queryClient = useQueryClient();

  return (viewId: string) => {
    queryClient.invalidateQueries({ queryKey: issueFollowKeys.byView(viewId) });
  };
}

