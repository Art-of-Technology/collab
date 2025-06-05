import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useWorkspace } from '@/context/WorkspaceContext';
import { useToast } from '@/hooks/use-toast';

export interface WorkspaceSettings {
  timeTrackingEnabled: boolean;
  dockEnabled: boolean;
}

export function useWorkspaceSettings() {
  const { currentWorkspace } = useWorkspace();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch workspace settings with TanStack Query
  const {
    data: settings,
    isLoading,
    refetch
  } = useQuery({
    queryKey: ['workspaceSettings', currentWorkspace?.id],
    queryFn: async (): Promise<WorkspaceSettings> => {
      if (!currentWorkspace?.id) {
        throw new Error('No workspace selected');
      }

      const response = await fetch(`/api/workspaces/${currentWorkspace.id}/settings`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch workspace settings');
      }
      
      const data = await response.json();
      return {
        timeTrackingEnabled: data.timeTrackingEnabled,
        dockEnabled: data.dockEnabled,
      };
    },
    enabled: !!currentWorkspace?.id,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Update workspace settings mutation
  const updateSettingsMutation = useMutation({
    mutationFn: async (newSettings: Partial<WorkspaceSettings>) => {
      if (!currentWorkspace?.id) {
        throw new Error('No workspace selected');
      }

      const response = await fetch(`/api/workspaces/${currentWorkspace.id}/settings`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newSettings),
      });

      if (!response.ok) {
        throw new Error('Failed to update workspace settings');
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalidate and refetch workspace settings
      queryClient.invalidateQueries({ queryKey: ['workspaceSettings', currentWorkspace?.id] });
      
      toast({
        title: 'Settings Updated',
        description: 'Workspace settings have been saved successfully',
      });
    },
    onError: (error) => {
      console.error('Error updating workspace settings:', error);
      toast({
        title: 'Error',
        description: 'Failed to update workspace settings',
        variant: 'destructive',
      });
    },
  });

  return {
    settings,
    isLoading,
    isUpdating: updateSettingsMutation.isPending,
    updateSettings: updateSettingsMutation.mutate,
    refetch,
  };
} 