import { useQuery } from '@tanstack/react-query';

export interface PostAction {
  id: string;
  postId: string;
  userId: string;
  actionType: 'CREATED' | 'EDITED' | 'TYPE_CHANGED' | 'PRIORITY_CHANGED' | 'RESOLVED' | 'REOPENED' | 'DELETED' | 'PINNED' | 'UNPINNED';
  oldValue: string | null;
  newValue: string | null;
  metadata: any;
  createdAt: string;
  user_id: string;
  user_name: string | null;
  user_image: string | null;
}

export const usePostActions = (postId: string) => {
  return useQuery({
    queryKey: ['post-actions', postId],
    queryFn: async (): Promise<PostAction[]> => {
      const response = await fetch(`/api/posts/${postId}/actions`);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to fetch post actions');
      }
      
      return response.json();
    },
    enabled: !!postId,
  });
}; 