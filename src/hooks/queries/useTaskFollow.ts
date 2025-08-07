import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

interface TaskFollowStatus {
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

const taskFollowKeys = {
  all: ['taskFollow'] as const,
  byTask: (taskId: string) => [...taskFollowKeys.all, taskId] as const,
  byBoard: (boardId: string) => [...taskFollowKeys.all, 'board', boardId] as const,
  byBoardTask: (boardId: string, taskId: string) => [...taskFollowKeys.byBoard(boardId), taskId] as const,
};

export function useTaskFollowStatus(taskId: string, boardId?: string) {
  return useQuery<TaskFollowStatus>({
    queryKey: boardId 
      ? taskFollowKeys.byBoardTask(boardId, taskId)
      : taskFollowKeys.byTask(taskId),
    queryFn: async () => {
      const response = await fetch(`/api/tasks/${taskId}/follow`);
      if (!response.ok) {
        throw new Error('Failed to get task follow status');
      }
      return response.json();
    },
    enabled: !!taskId,
  });
}

export function useFollowTask(taskId: string, boardId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/tasks/${taskId}/follow`, {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error('Failed to follow task');
      }
      return response.json();
    },
    onSuccess: () => {
      // Invalidate specific task query
      if (boardId) {
        queryClient.invalidateQueries({ queryKey: taskFollowKeys.byBoardTask(boardId, taskId) });
        // Also invalidate board-level queries if needed
        queryClient.invalidateQueries({ queryKey: taskFollowKeys.byBoard(boardId) });
      } else {
        queryClient.invalidateQueries({ queryKey: taskFollowKeys.byTask(taskId) });
      }
    },
  });
}

export function useUnfollowTask(taskId: string, boardId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/tasks/${taskId}/follow`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error('Failed to unfollow task');
      }
      return response.json();
    },
    onSuccess: () => {
      // Invalidate specific task query
      if (boardId) {
        queryClient.invalidateQueries({ queryKey: taskFollowKeys.byBoardTask(boardId, taskId) });
        // Also invalidate board-level queries if needed
        queryClient.invalidateQueries({ queryKey: taskFollowKeys.byBoard(boardId) });
      } else {
        queryClient.invalidateQueries({ queryKey: taskFollowKeys.byTask(taskId) });
      }
    },
  });
}

// Hook to prefetch follow status for multiple tasks in a board
export function usePrefetchBoardTasksFollow(taskIds: string[], boardId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      // Prefetch follow status for all tasks in the board
      const promises = taskIds.map(taskId => 
        queryClient.prefetchQuery({
          queryKey: taskFollowKeys.byBoardTask(boardId, taskId),
          queryFn: async () => {
            const response = await fetch(`/api/tasks/${taskId}/follow`);
            if (!response.ok) {
              throw new Error('Failed to get task follow status');
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

// Hook to invalidate all follow queries for a board when switching
export function useInvalidateBoardFollowQueries() {
  const queryClient = useQueryClient();

  return (boardId: string) => {
    queryClient.invalidateQueries({ queryKey: taskFollowKeys.byBoard(boardId) });
  };
}