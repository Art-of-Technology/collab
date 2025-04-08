'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  getTaskComments, 
  addTaskComment, 
  toggleTaskCommentLike, 
  getTaskCommentLikes 
} from '@/actions/taskComment';

// Define query keys
export const taskCommentKeys = {
  all: ['taskComments'] as const,
  lists: () => [...taskCommentKeys.all, 'list'] as const,
  list: (taskId: string) => [...taskCommentKeys.lists(), taskId] as const,
  likes: () => [...taskCommentKeys.all, 'likes'] as const,
  likesForComment: (taskId: string, commentId: string) => [...taskCommentKeys.likes(), taskId, commentId] as const,
};

/**
 * Hook to fetch task comments
 */
export function useTaskComments(taskId: string) {
  return useQuery({
    queryKey: taskCommentKeys.list(taskId),
    queryFn: () => getTaskComments(taskId),
    enabled: !!taskId,
  });
}

/**
 * Hook to add a task comment
 */
export function useAddTaskComment() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ taskId, content, parentId }: { taskId: string; content: string; parentId?: string }) => 
      addTaskComment(taskId, content, parentId),
    onSuccess: (_, { taskId }) => {
      // Invalidate task comments query
      queryClient.invalidateQueries({ queryKey: taskCommentKeys.list(taskId) });
      
      // Also invalidate the task detail to update comment count
      queryClient.invalidateQueries({ queryKey: ['tasks', 'detail', taskId] });
    },
  });
}

/**
 * Hook to fetch likes for a task comment
 */
export function useTaskCommentLikes(taskId: string, commentId: string) {
  return useQuery({
    queryKey: taskCommentKeys.likesForComment(taskId, commentId),
    queryFn: () => getTaskCommentLikes(taskId, commentId),
    enabled: !!taskId && !!commentId,
  });
}

/**
 * Hook to toggle a like on a task comment
 */
export function useToggleTaskCommentLike() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ taskId, commentId }: { taskId: string; commentId: string }) => 
      toggleTaskCommentLike(taskId, commentId),
    onSuccess: (_, { taskId, commentId }) => {
      // Invalidate the likes query for this comment
      queryClient.invalidateQueries({ queryKey: taskCommentKeys.likesForComment(taskId, commentId) });
      
      // Also invalidate all comments to update like counts
      queryClient.invalidateQueries({ queryKey: taskCommentKeys.list(taskId) });
    },
  });
} 