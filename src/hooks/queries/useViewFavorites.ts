import { useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';

export const useToggleViewFavorite = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ workspaceId, viewId }: { workspaceId: string; viewId: string }) => {
      const { data } = await axios.post(`/api/workspaces/${workspaceId}/views/${viewId}/favorite`);
      return data;
    },
    onSuccess: () => {
      // Invalidate views queries to refresh the data
      queryClient.invalidateQueries({ queryKey: ["views"] });
    },
  });
};
