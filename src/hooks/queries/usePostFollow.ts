import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';

interface PostFollowResponse {
  isFollowing: boolean;
}

export function useIsPostFollowed(postId: string) {
  return useQuery<PostFollowResponse>({
    queryKey: ['post-follow', postId],
    queryFn: async () => {
      const response = await fetch(`/api/posts/${postId}/follow`);
      if (!response.ok) {
        throw new Error('Failed to check follow status');
      }
      return response.json();
    },
    enabled: !!postId,
  });
}

export function useFollowPost() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (postId: string) => {
      const response = await fetch(`/api/posts/${postId}/follow`, {
        method: 'POST',
      });
      
      if (!response.ok) {
        throw new Error('Failed to follow post');
      }
      
      return response.json();
    },
    onSuccess: (_, postId) => {
      // Invalidate and refetch the follow status
      queryClient.invalidateQueries({ queryKey: ['post-follow', postId] });
      
      toast({
        description: "You're now following this post",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to follow post",
        variant: "destructive",
      });
    },
  });
}

export function useUnfollowPost() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (postId: string) => {
      const response = await fetch(`/api/posts/${postId}/follow`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        throw new Error('Failed to unfollow post');
      }
      
      return response.json();
    },
    onSuccess: (_, postId) => {
      // Invalidate and refetch the follow status
      queryClient.invalidateQueries({ queryKey: ['post-follow', postId] });
      
      toast({
        description: "You've unfollowed this post",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to unfollow post",
        variant: "destructive",
      });
    },
  });
}