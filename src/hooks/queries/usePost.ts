'use client';

import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import {
  getPosts,
  getPostById,
  createPost,
  updatePost,
  deletePost,
  getUserPosts
} from '@/actions/post';
import { getPostStats } from '@/actions/postStats';

type PostType = 'UPDATE' | 'BLOCKER' | 'IDEA' | 'QUESTION';
type PostPriority = 'normal' | 'high' | 'critical';

// Define query keys
export const postKeys = {
  all: ['posts'] as const,
  lists: () => [...postKeys.all, 'list'] as const,
  list: (filters: Record<string, any>) => [...postKeys.lists(), filters] as const,
  details: () => [...postKeys.all, 'detail'] as const,
  detail: (id: string) => [...postKeys.details(), id] as const,
};

// Get posts hook (legacy - returns posts directly)
export const usePosts = (filters: {
  type?: PostType;
  tag?: string;
  authorId?: string;
  workspaceId?: string;
  limit?: number;
}) => {
  return useQuery({
    queryKey: postKeys.list(filters),
    queryFn: async () => {
      const result = await getPosts(filters);
      // Return just the posts for backward compatibility
      return result.posts || result;
    },
  });
};

// Infinite posts hook for pagination
export const useInfinitePosts = (filters: {
  type?: PostType;
  tag?: string;
  authorId?: string;
  workspaceId?: string;
  limit?: number;
}) => {
  return useInfiniteQuery({
    queryKey: [...postKeys.list(filters), 'infinite'],
    queryFn: async ({ pageParam = undefined }) => {
      const result = await getPosts({
        ...filters,
        cursor: pageParam
      });
      return result;
    },
    getNextPageParam: (lastPage) => {
      return lastPage.hasMore ? lastPage.nextCursor : undefined;
    },
    initialPageParam: undefined,
  });
};

// Get post by ID hook
export const usePostById = (postId: string) => {
  return useQuery({
    queryKey: postKeys.detail(postId),
    queryFn: () => getPostById(postId),
    enabled: !!postId,
  });
};

// Create post mutation
export const useCreatePost = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createPost,
    onSuccess: () => {
      // Invalidate posts lists and stats
      queryClient.invalidateQueries({ queryKey: postKeys.lists() });
      queryClient.invalidateQueries({ queryKey: ['posts', 'stats'] });
    },
  });
};

// Update post mutation
export const useUpdatePost = (postId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      message: string;
      type: PostType;
      tags?: string[];
      priority: PostPriority;
    }) => updatePost(postId, data),
    onSuccess: () => {
      // Invalidate posts lists, stats, and the specific post
      queryClient.invalidateQueries({ queryKey: postKeys.lists() });
      queryClient.invalidateQueries({ queryKey: postKeys.detail(postId) });
      queryClient.invalidateQueries({ queryKey: ['posts', 'stats'] });
    },
  });
};

// Delete post mutation
export const useDeletePost = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deletePost,
    onSuccess: () => {
      // Invalidate posts lists and stats
      queryClient.invalidateQueries({ queryKey: postKeys.lists() });
      queryClient.invalidateQueries({ queryKey: ['posts', 'stats'] });
    },
  });
};

export function useUserPosts(userId: string, workspaceId: string) {
  return useQuery({
    queryKey: ['posts', 'user', userId, workspaceId],
    queryFn: () => getUserPosts(userId, workspaceId),
    enabled: !!userId && !!workspaceId
  });
}

// Get post statistics hook
export const usePostStats = (workspaceId?: string) => {
  return useQuery({
    queryKey: ['posts', 'stats', workspaceId],
    queryFn: () => getPostStats({ workspaceId }),
    enabled: !!workspaceId,
  });
};