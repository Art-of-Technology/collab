import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

interface BoardFollowStatus {
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

const boardFollowKeys = {
  all: ['boardFollow'] as const,
  byBoard: (boardId: string) => [...boardFollowKeys.all, boardId] as const,
};

export function useBoardFollowStatus(boardId: string) {
  return useQuery<BoardFollowStatus>({
    queryKey: boardFollowKeys.byBoard(boardId),
    queryFn: async () => {
      const response = await fetch(`/api/boards/${boardId}/follow`);
      if (!response.ok) {
        throw new Error('Failed to get board follow status');
      }
      return response.json();
    },
    enabled: !!boardId,
  });
}

export function useFollowBoard(boardId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/boards/${boardId}/follow`, {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error('Failed to follow board');
      }
      return response.json();
    },
    onSuccess: () => {
      // Invalidate board follow query
      queryClient.invalidateQueries({ queryKey: boardFollowKeys.byBoard(boardId) });
    },
  });
}

export function useUnfollowBoard(boardId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/boards/${boardId}/follow`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error('Failed to unfollow board');
      }
      return response.json();
    },
    onSuccess: () => {
      // Invalidate board follow query
      queryClient.invalidateQueries({ queryKey: boardFollowKeys.byBoard(boardId) });
    },
  });
}

// Hook to invalidate all follow queries for a board when switching
export function useInvalidateBoardFollowQueries() {
  const queryClient = useQueryClient();

  return (boardId: string) => {
    queryClient.invalidateQueries({ queryKey: boardFollowKeys.byBoard(boardId) });
  };
}