'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { 
  toggleIssueCommentLike, 
  updateIssueComment, 
  deleteIssueComment 
} from '@/actions/issueComment';
import { useToast } from '@/hooks/use-toast';
import { IssueComment } from '@/components/issue/sections/comments/types/comment';

// Use consistent query keys
export const issueCommentKeys = {
  all: ['issue-comments'] as const,
  lists: () => [...issueCommentKeys.all, 'list'] as const,
  list: (issueId: string) => [...issueCommentKeys.lists(), issueId] as const,
  likes: () => [...issueCommentKeys.all, 'likes'] as const,
  likesForComment: (issueId: string, commentId: string) => [...issueCommentKeys.likes(), issueId, commentId] as const,
};

/**
 * Hook to fetch issue comments
 */
export function useIssueComments(issueId: string) {
  return useQuery({
    queryKey: issueCommentKeys.list(issueId),
    queryFn: async () => {
      const response = await fetch(`/api/issues/${issueId}/comments`);
      if (!response.ok) {
        throw new Error("Failed to fetch comments");
      }
      return response.json() as Promise<IssueComment[]>;
    },
    enabled: !!issueId,
  });
}

/**
 * Hook to add an issue comment
 */
export function useAddIssueComment() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: session } = useSession();

  return useMutation({
    mutationFn: async ({
      issueId,
      content,
      html,
      parentId,
    }: {
      issueId: string;
      content: string;
      html?: string;
      parentId?: string;
    }) => {
      const response = await fetch(`/api/issues/${issueId}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content, html, parentId }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to add comment");
      }

      return response.json();
    },
    onMutate: async ({ issueId, content, html, parentId }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: issueCommentKeys.list(issueId) });

      // Snapshot the previous value
      const previousComments = queryClient.getQueryData(issueCommentKeys.list(issueId));

      // Create optimistic comment
      const optimisticComment = {
        id: `temp-${Date.now()}`,
        content,
        html: html || content,
        createdAt: new Date().toISOString(),
        author: {
          id: session?.user?.id || 'unknown',
          name: session?.user?.name || 'Unknown User',
          image: session?.user?.image || null,
        },
        reactions: [],
        parentId: parentId || null,
        replies: [],
      };

      // Optimistically update the cache
      queryClient.setQueryData(issueCommentKeys.list(issueId), (old: any) => {
        if (!old) return [optimisticComment];
        
        if (parentId) {
          // If it's a reply, add it to the parent's replies
          return old.map((comment: any) => {
            if (comment.id === parentId) {
              return {
                ...comment,
                replies: [...(comment.replies || []), optimisticComment],
              };
            }
            return comment;
          });
        } else {
          // If it's a top-level comment, add it to the list
          return [...old, optimisticComment];
        }
      });

      return { previousComments };
    },
    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previousComments) {
        queryClient.setQueryData(issueCommentKeys.list(variables.issueId), context.previousComments);
      }
      console.error("Error adding comment:", err);
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to add comment",
        variant: "destructive",
      });
    },
    onSuccess: (newComment, { issueId }) => {
      toast({
        title: "Success",
        description: "Comment added successfully",
      });
    },
    onSettled: (_, __, { issueId }) => {
      // Refetch to ensure we have the latest data and replace optimistic updates
      queryClient.invalidateQueries({ queryKey: issueCommentKeys.list(issueId) });
    },
  });
}

/**
 * Hook to toggle like on an issue comment
 */
export function useToggleIssueCommentLike() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: session } = useSession();
  
  return useMutation({
    mutationFn: ({ issueId, commentId }: { issueId: string; commentId: string }) => 
      toggleIssueCommentLike(issueId, commentId),
    onMutate: async ({ issueId, commentId }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: issueCommentKeys.list(issueId) });

      // Snapshot the previous value
      const previousComments = queryClient.getQueryData(issueCommentKeys.list(issueId));

      // Optimistically update the cache
      queryClient.setQueryData(issueCommentKeys.list(issueId), (old: any) => {
        if (!old) return old;
        
        return old.map((comment: any) => {
          if (comment.id === commentId) {
            const currentUserId = session?.user?.id;
            if (!currentUserId) return comment;
            
            const hasLiked = comment.reactions?.some((r: any) => r.type === 'like' && r.author.id === currentUserId);
            
            if (hasLiked) {
              // Remove like
              return {
                ...comment,
                reactions: comment.reactions?.filter((r: any) => !(r.type === 'like' && r.author.id === currentUserId)) || []
              };
            } else {
              // Add like
              return {
                ...comment,
                reactions: [
                  ...(comment.reactions || []),
                  {
                    id: `temp-${Date.now()}`,
                    type: 'like',
                    author: { 
                      id: currentUserId,
                      name: session?.user?.name || 'Unknown',
                      image: session?.user?.image || null
                    }
                  }
                ]
              };
            }
          }
          return comment;
        });
      });

      return { previousComments };
    },
    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previousComments) {
        queryClient.setQueryData(issueCommentKeys.list(variables.issueId), context.previousComments);
      }
      toast({
        title: "Error",
        description: "Failed to update like",
        variant: "destructive",
      });
    },
    onSettled: (_, __, { issueId }) => {
      // Refetch to ensure we have the latest data
      queryClient.invalidateQueries({ queryKey: issueCommentKeys.list(issueId) });
      // Also invalidate broader queries
      queryClient.invalidateQueries({ queryKey: issueCommentKeys.all });
    },
  });
}

/**
 * Hook to update an issue comment
 */
export function useUpdateIssueComment() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: ({ issueId, commentId, content, html }: { 
      issueId: string; 
      commentId: string; 
      content: string; 
      html?: string; 
    }) => updateIssueComment(issueId, commentId, { content, html }),
    onMutate: async ({ issueId, commentId, content, html }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: issueCommentKeys.list(issueId) });

      // Snapshot the previous value
      const previousComments = queryClient.getQueryData(issueCommentKeys.list(issueId));

      // Optimistically update the cache
      queryClient.setQueryData(issueCommentKeys.list(issueId), (old: any) => {
        if (!old) return old;
        
        return old.map((comment: any) => {
          if (comment.id === commentId) {
            return {
              ...comment,
              content,
              html: html || comment.html,
            };
          }
          return comment;
        });
      });

      return { previousComments };
    },
    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previousComments) {
        queryClient.setQueryData(issueCommentKeys.list(variables.issueId), context.previousComments);
      }
      console.error("Error updating comment:", err);
      toast({
        title: "Error",
        description: "Failed to update comment",
        variant: "destructive",
      });
    },
    onSettled: (_, __, { issueId }) => {
      // Refetch to ensure we have the latest data
      queryClient.invalidateQueries({ queryKey: issueCommentKeys.list(issueId) });
      queryClient.invalidateQueries({ queryKey: issueCommentKeys.all });
    },
  });
}

/**
 * Hook to delete an issue comment
 */
export function useDeleteIssueComment() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: ({ issueId, commentId }: { issueId: string; commentId: string }) => 
      deleteIssueComment(issueId, commentId),
    onMutate: async ({ issueId, commentId }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: issueCommentKeys.list(issueId) });

      // Snapshot the previous value
      const previousComments = queryClient.getQueryData(issueCommentKeys.list(issueId));

      // Optimistically remove the comment from cache
      queryClient.setQueryData(issueCommentKeys.list(issueId), (old: any) => {
        if (!old) return old;
        
        // Filter out the deleted comment and any of its replies
        const filterComments = (comments: any[]): any[] => {
          return comments.filter(comment => {
            // Remove the comment itself
            if (comment.id === commentId) return false;
            
            // Remove replies to the deleted comment
            if (comment.parentId === commentId) return false;
            
            // Recursively filter nested replies
            if (comment.replies) {
              comment.replies = filterComments(comment.replies);
            }
            
            return true;
          });
        };
        
        return filterComments(old);
      });

      return { previousComments };
    },
    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previousComments) {
        queryClient.setQueryData(issueCommentKeys.list(variables.issueId), context.previousComments);
      }
      console.error("Error deleting comment:", err);
      toast({
        title: "Error",
        description: "Failed to delete comment",
        variant: "destructive",
      });
    },
    onSettled: (_, __, { issueId }) => {
      // Refetch to ensure we have the latest data
      queryClient.invalidateQueries({ queryKey: issueCommentKeys.list(issueId) });
      queryClient.invalidateQueries({ queryKey: issueCommentKeys.all });
    },
  });
}
