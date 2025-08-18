import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

interface ViewFollowStatus {
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

const viewFollowKeys = {
  all: ['viewFollow'] as const,
  byView: (viewId: string) => [...viewFollowKeys.all, viewId] as const,
  byWorkspace: (workspaceId: string) => [...viewFollowKeys.all, 'workspace', workspaceId] as const,
  byWorkspaceView: (workspaceId: string, viewId: string) => [...viewFollowKeys.byWorkspace(workspaceId), viewId] as const,
};

export function useViewFollowStatus(viewId: string, workspaceId?: string) {
  return useQuery<ViewFollowStatus>({
    queryKey: workspaceId
      ? viewFollowKeys.byWorkspaceView(workspaceId, viewId)
      : viewFollowKeys.byView(viewId),
    queryFn: async () => {
      const response = await fetch(`/api/views/${viewId}/follow`);
      if (!response.ok) {
        throw new Error('Failed to get view follow status');
      }
      return response.json();
    },
    enabled: !!viewId,
  });
}

export function useFollowView(viewId: string, workspaceId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/views/${viewId}/follow`, {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error('Failed to follow view');
      }
      return response.json();
    },
    onSuccess: () => {
      // Invalidate view follow query
      if (workspaceId) {
        queryClient.invalidateQueries({ queryKey: viewFollowKeys.byWorkspaceView(workspaceId, viewId) });
        // Also invalidate workspace-level queries if needed
        queryClient.invalidateQueries({ queryKey: viewFollowKeys.byWorkspace(workspaceId) });
      } else {
        queryClient.invalidateQueries({ queryKey: viewFollowKeys.byView(viewId) });
      }
    },
  });
}

export function useUnfollowView(viewId: string, workspaceId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/views/${viewId}/follow`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error('Failed to unfollow view');
      }
      return response.json();
    },
    onSuccess: () => {
      // Invalidate view follow query
      if (workspaceId) {
        queryClient.invalidateQueries({ queryKey: viewFollowKeys.byWorkspaceView(workspaceId, viewId) });
        // Also invalidate workspace-level queries if needed
        queryClient.invalidateQueries({ queryKey: viewFollowKeys.byWorkspace(workspaceId) });
      } else {
        queryClient.invalidateQueries({ queryKey: viewFollowKeys.byView(viewId) });
      }
    },
  });
}

// Hook to prefetch follow status for multiple views in a workspace
export function usePrefetchWorkspaceViewsFollow(viewIds: string[], workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      // Prefetch follow status for all views in the workspace
      const promises = viewIds.map(viewId => 
        queryClient.prefetchQuery({
          queryKey: viewFollowKeys.byWorkspaceView(workspaceId, viewId),
          queryFn: async () => {
            const response = await fetch(`/api/views/${viewId}/follow`);
            if (!response.ok) {
              throw new Error('Failed to get view follow status');
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

// Hook to invalidate all follow queries for a workspace when switching
export function useInvalidateWorkspaceFollowQueries() {
  const queryClient = useQueryClient();

  return (workspaceId: string) => {
    queryClient.invalidateQueries({ queryKey: viewFollowKeys.byWorkspace(workspaceId) });
  };
}

