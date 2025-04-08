'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  getPostReactions, 
  getCommentReactions, 
  addReaction, 
  removeReaction 
} from '@/actions/reaction';
import { postKeys } from './usePost';
import { commentKeys } from './useComment';

// Define query keys
export const reactionKeys = {
  all: ['reactions'] as const,
  postReactions: (postId: string) => [...reactionKeys.all, 'post', postId] as const,
  commentReactions: (commentId: string) => [...reactionKeys.all, 'comment', commentId] as const,
};

// Get post reactions
export const usePostReactions = (postId: string) => {
  return useQuery({
    queryKey: reactionKeys.postReactions(postId),
    queryFn: () => getPostReactions(postId),
    enabled: !!postId,
  });
};

// Get comment reactions
export const useCommentReactions = (commentId: string) => {
  return useQuery({
    queryKey: reactionKeys.commentReactions(commentId),
    queryFn: () => getCommentReactions(commentId),
    enabled: !!commentId,
  });
};

// Add reaction mutation
export const useAddReaction = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: addReaction,
    onSuccess: (_, variables) => {
      // Invalidate appropriate queries based on whether it's a post or comment reaction
      if (variables.postId) {
        queryClient.invalidateQueries({ queryKey: reactionKeys.postReactions(variables.postId) });
        queryClient.invalidateQueries({ queryKey: postKeys.detail(variables.postId) });
      }
      
      if (variables.commentId) {
        queryClient.invalidateQueries({ queryKey: reactionKeys.commentReactions(variables.commentId) });
        // Also invalidate parent post's comments
        const comment = queryClient.getQueryData([commentKeys.detail(variables.commentId)]);
        if (comment && (comment as any).postId) {
          queryClient.invalidateQueries({ queryKey: commentKeys.list((comment as any).postId) });
        }
      }
    },
  });
};

// Remove reaction mutation
export const useRemoveReaction = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: removeReaction,
    onSuccess: (_, variables) => {
      // Invalidate appropriate queries based on whether it's a post or comment reaction
      if (variables.postId) {
        queryClient.invalidateQueries({ queryKey: reactionKeys.postReactions(variables.postId) });
        queryClient.invalidateQueries({ queryKey: postKeys.detail(variables.postId) });
      }
      
      if (variables.commentId) {
        queryClient.invalidateQueries({ queryKey: reactionKeys.commentReactions(variables.commentId) });
        // Also invalidate parent post's comments
        const comment = queryClient.getQueryData([commentKeys.detail(variables.commentId)]);
        if (comment && (comment as any).postId) {
          queryClient.invalidateQueries({ queryKey: commentKeys.list((comment as any).postId) });
        }
      }
    },
  });
}; 