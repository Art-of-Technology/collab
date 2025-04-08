'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  getUserBookmarks, 
  isPostBookmarked, 
  addBookmark, 
  removeBookmark 
} from '@/actions/bookmark';

// Define query keys
export const bookmarkKeys = {
  all: ['bookmarks'] as const,
  lists: () => [...bookmarkKeys.all, 'list'] as const,
  list: () => [...bookmarkKeys.lists()] as const,
  status: () => [...bookmarkKeys.all, 'status'] as const,
  postStatus: (postId: string) => [...bookmarkKeys.status(), postId] as const,
};

// Get all bookmarks for the current user
export const useUserBookmarks = () => {
  return useQuery({
    queryKey: bookmarkKeys.list(),
    queryFn: getUserBookmarks,
  });
};

// Check if a post is bookmarked
export const useIsPostBookmarked = (postId: string) => {
  return useQuery({
    queryKey: bookmarkKeys.postStatus(postId),
    queryFn: () => isPostBookmarked(postId),
    enabled: !!postId,
  });
};

// Add bookmark mutation
export const useAddBookmark = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: addBookmark,
    onSuccess: (_, postId) => {
      // Invalidate the bookmarks list
      queryClient.invalidateQueries({ queryKey: bookmarkKeys.list() });
      
      // Invalidate the status of this post
      queryClient.invalidateQueries({ queryKey: bookmarkKeys.postStatus(postId) });
      
      // Update the status cache optimistically
      queryClient.setQueryData(bookmarkKeys.postStatus(postId), true);
    },
  });
};

// Remove bookmark mutation
export const useRemoveBookmark = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: removeBookmark,
    onSuccess: (_, postId) => {
      // Invalidate the bookmarks list
      queryClient.invalidateQueries({ queryKey: bookmarkKeys.list() });
      
      // Invalidate the status of this post
      queryClient.invalidateQueries({ queryKey: bookmarkKeys.postStatus(postId) });
      
      // Update the status cache optimistically
      queryClient.setQueryData(bookmarkKeys.postStatus(postId), false);
    },
  });
}; 