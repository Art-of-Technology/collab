import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';

interface PinPostData {
  postId: string;
  isPinned: boolean;
}

export function usePinPost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ postId, isPinned }: PinPostData) => {
      const response = await fetch(`/api/posts/${postId}/pin`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ isPinned }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update pin status');
      }

      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Success',
        description: data.message,
      });

      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      queryClient.invalidateQueries({ queryKey: ['post', data.post.id] });
      queryClient.invalidateQueries({ queryKey: ['timeline'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update pin status',
        variant: 'destructive',
      });
    },
  });
} 