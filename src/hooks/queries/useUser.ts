'use client';

import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { 
  getCurrentUser, 
  getUserById,
  updateUserAvatar,
  getUserProfile,
  updateUserProfile
} from '@/actions/user';
import { getPosts } from '@/actions/post';

// Define query keys
export const userKeys = {
  all: ['users'] as const,
  current: () => [...userKeys.all, 'current'] as const,
  detail: (id: string) => [...userKeys.all, 'detail', id] as const,
};

// Get current user hook
export const useCurrentUser = () => {
  return useQuery({
    queryKey: userKeys.current(),
    queryFn: getCurrentUser,
  });
};

// Get user by ID hook
export const useUserById = (userId: string) => {
  return useQuery({
    queryKey: userKeys.detail(userId),
    queryFn: () => getUserById(userId),
    enabled: !!userId,
  });
};

// Update user profile mutation
export const useUpdateUserProfile = (workspaceId?: string) => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: any) => updateUserProfile(data, workspaceId),
    onSuccess: () => {
      // Invalidate the current user query to refresh the data
      queryClient.invalidateQueries({ queryKey: userKeys.current() });
      queryClient.invalidateQueries({ queryKey: ['profile', 'current', workspaceId] });
    },
  });
};

// Update user avatar mutation
export const useUpdateUserAvatar = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: updateUserAvatar,
    onSuccess: () => {
      // Invalidate the current user query to refresh the data
      queryClient.invalidateQueries({ queryKey: userKeys.current() });
    },
  });
};

export function useInfiniteUserProfilePosts(
  workspaceId: string,
  limit = 10,
  initialPosts?: any[]
) {
  const { data: currentUser } = useCurrentUser();
  
  // Create initial page data if initialPosts is provided (even if empty array)
  const initialPageData = initialPosts !== undefined ? {
    pages: [{
      posts: initialPosts,
      hasMore: initialPosts.length >= limit,
      nextCursor: initialPosts.length > 0 ? initialPosts[initialPosts.length - 1].id : null
    }],
    pageParams: [undefined]
  } : undefined;
  
  return useInfiniteQuery({
    queryKey: ['profile', 'posts', 'infinite', workspaceId, currentUser?.id],
    queryFn: async ({ pageParam }: { pageParam: string | undefined }) => {
      if (!currentUser?.id) {
        throw new Error('User not found');
      }
      
      const result = await getPosts({
        authorId: currentUser.id,
        workspaceId: workspaceId,
        cursor: pageParam,
        limit: limit,
        includeProfileData: false
      });
      
      if (Array.isArray(result)) {
        return {
          posts: result,
          hasMore: false,
          nextCursor: null
        };
      }
      
      return result;
    },
    getNextPageParam: (lastPage) => {
      if (Array.isArray(lastPage)) {
        return undefined;
      }
      return lastPage.hasMore ? lastPage.nextCursor : undefined;
    },
    initialPageParam: undefined as string | undefined,
    enabled: !!currentUser?.id && !!workspaceId,
    initialData: initialPageData,
    staleTime: 5 * 60 * 1000,
    refetchOnMount: initialPosts === undefined,
  });
}

export function useUserProfile(userId: string, workspaceId?: string) {
  return useQuery({
    queryKey: ['profile', userId, workspaceId],
    queryFn: () => getUserProfile(userId, workspaceId),
    enabled: !!userId && workspaceId !== undefined,
  });
}

export function useUpdateProfile(workspaceId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: any) => updateUserProfile(data, workspaceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile', 'current', workspaceId] });
    }
  });
}

export function useCurrentUserProfile(workspaceId?: string) {
  const { data: currentUser } = useCurrentUser();

  return useQuery({
    queryKey: ['profile', 'current', workspaceId],
    queryFn: async () => {
      if (!currentUser?.id) {
        throw new Error('User not found');
      }

      const result = await getPosts({
        authorId: currentUser.id,
        workspaceId: workspaceId,
        limit: 1,
        includeProfileData: true
      });

      if (Array.isArray(result)) {
        return { user: null, stats: null, posts: [] };
      }

      return {
        user: result.user || null,
        stats: result.stats || null,
        posts: result.posts || []
      };
    },
    enabled: !!currentUser?.id && !!workspaceId,
    staleTime: 5 * 60 * 1000,
  });
}