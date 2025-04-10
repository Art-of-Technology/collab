'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getPosts,
  getPostById,
  createPost,
  updatePost,
  deletePost,
  getUserPosts
} from '@/actions/post';

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

// Get posts hook
export const usePosts = (filters: {
  type?: PostType;
  tag?: string;
  authorId?: string;
  workspaceId?: string;
  limit?: number;
}) => {
  return useQuery({
    queryKey: postKeys.list(filters),
    queryFn: () => getPosts(filters),
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
      // Invalidate posts lists
      queryClient.invalidateQueries({ queryKey: postKeys.lists() });
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
      // Invalidate posts lists and the specific post
      queryClient.invalidateQueries({ queryKey: postKeys.lists() });
      queryClient.invalidateQueries({ queryKey: postKeys.detail(postId) });
    },
  });
};

// Delete post mutation
export const useDeletePost = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deletePost,
    onSuccess: () => {
      // Invalidate posts lists
      queryClient.invalidateQueries({ queryKey: postKeys.lists() });
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