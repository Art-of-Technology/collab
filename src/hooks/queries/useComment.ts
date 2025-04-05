'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  getComments, 
  createComment, 
  updateComment, 
  deleteComment 
} from '@/actions/comment';
import { postKeys } from './usePost';

// Define query keys
export const commentKeys = {
  all: ['comments'] as const,
  lists: () => [...commentKeys.all, 'list'] as const,
  list: (postId: string) => [...commentKeys.lists(), postId] as const,
  details: () => [...commentKeys.all, 'detail'] as const,
  detail: (id: string) => [...commentKeys.details(), id] as const,
};

// Get comments for a post
export const useComments = (postId: string) => {
  return useQuery({
    queryKey: commentKeys.list(postId),
    queryFn: () => getComments(postId),
    enabled: !!postId,
  });
};

// Create comment mutation
export const useCreateComment = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: createComment,
    onSuccess: (data, variables) => {
      // Invalidate comments for this post
      queryClient.invalidateQueries({ queryKey: commentKeys.list(variables.postId) });
      
      // Invalidate post details to update comment count
      queryClient.invalidateQueries({ queryKey: postKeys.detail(variables.postId) });
      
      // If this is a reply, invalidate the parent comment
      if (variables.parentId) {
        queryClient.invalidateQueries({ queryKey: commentKeys.detail(variables.parentId) });
      }
    },
  });
};

// Update comment mutation
export const useUpdateComment = (commentId: string, postId: string) => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: { message: string; html?: string }) => 
      updateComment(commentId, data),
    onSuccess: () => {
      // Invalidate the specific comment
      queryClient.invalidateQueries({ queryKey: commentKeys.detail(commentId) });
      
      // Invalidate all comments for this post
      queryClient.invalidateQueries({ queryKey: commentKeys.list(postId) });
    },
  });
};

// Delete comment mutation
export const useDeleteComment = (postId: string) => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: deleteComment,
    onSuccess: (_, commentId) => {
      // Invalidate all comments for this post
      queryClient.invalidateQueries({ queryKey: commentKeys.list(postId) });
      
      // Invalidate post details to update comment count
      queryClient.invalidateQueries({ queryKey: postKeys.detail(postId) });
    },
  });
}; 