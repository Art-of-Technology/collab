'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  getUserWorkspaces, 
  getWorkspaceById, 
  createWorkspace, 
  updateWorkspace, 
  deleteWorkspace,
  addWorkspaceMember,
  removeWorkspaceMember,
  checkWorkspaceLimit,
  getPendingInvitations,
  getDetailedWorkspaceById,
  getWorkspaceMembers
} from '@/actions/workspace';

// Define query keys
export const workspaceKeys = {
  all: ['workspaces'] as const,
  lists: () => [...workspaceKeys.all, 'list'] as const,
  list: () => [...workspaceKeys.lists()] as const,
  details: () => [...workspaceKeys.all, 'detail'] as const,
  detail: (id: string) => [...workspaceKeys.details(), id] as const,
  detailedWorkspace: (id: string) => [...workspaceKeys.all, 'detailed', id] as const,
};

// Get all user workspaces
export const useUserWorkspaces = () => {
  return useQuery({
    queryKey: workspaceKeys.list(),
    queryFn: getUserWorkspaces,
  });
};

// Get workspace by ID
export const useWorkspaceById = (workspaceId: string) => {
  return useQuery({
    queryKey: workspaceKeys.detail(workspaceId),
    queryFn: () => getWorkspaceById(workspaceId),
    enabled: !!workspaceId,
  });
};

// Create workspace mutation
export const useCreateWorkspace = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: createWorkspace,
    onSuccess: () => {
      // Invalidate the workspaces list
      queryClient.invalidateQueries({ queryKey: workspaceKeys.list() });
    },
  });
};

// Update workspace mutation
export const useUpdateWorkspace = (workspaceId: string) => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: {
      name?: string;
      description?: string;
      slug?: string;
      logoUrl?: string;
    }) => updateWorkspace(workspaceId, data),
    onSuccess: () => {
      // Invalidate the specific workspace and the list
      queryClient.invalidateQueries({ queryKey: workspaceKeys.detail(workspaceId) });
      queryClient.invalidateQueries({ queryKey: workspaceKeys.list() });
    },
  });
};

// Delete workspace mutation
export const useDeleteWorkspace = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: deleteWorkspace,
    onSuccess: (_, workspaceId) => {
      // Invalidate the workspaces list
      queryClient.invalidateQueries({ queryKey: workspaceKeys.list() });
      
      // Invalidate the specific workspace
      queryClient.invalidateQueries({ queryKey: workspaceKeys.detail(workspaceId) });
    },
  });
};

// Add workspace member mutation
export const useAddWorkspaceMember = (workspaceId: string) => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: { email: string }) => 
      addWorkspaceMember({ workspaceId, ...data }),
    onSuccess: () => {
      // Invalidate the specific workspace
      queryClient.invalidateQueries({ queryKey: workspaceKeys.detail(workspaceId) });
    },
  });
};

// Remove workspace member mutation
export const useRemoveWorkspaceMember = (workspaceId: string) => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (userId: string) => 
      removeWorkspaceMember({ workspaceId, userId }),
    onSuccess: () => {
      // Invalidate the specific workspace
      queryClient.invalidateQueries({ queryKey: workspaceKeys.detail(workspaceId) });
    },
  });
};

// Check workspace limit
export const useWorkspaceLimit = () => {
  return useQuery({
    queryKey: [...workspaceKeys.all, 'limit'],
    queryFn: checkWorkspaceLimit,
  });
};

/**
 * Hook for fetching pending workspace invitations
 */
export function usePendingInvitations(email: string | undefined | null) {
  return useQuery({
    queryKey: ['workspaces', 'invitations', 'pending', email],
    queryFn: () => getPendingInvitations(email as string),
    enabled: !!email,
  });
}

// Get detailed workspace by ID for the workspace detail page
export const useDetailedWorkspaceById = (workspaceId: string) => {
  return useQuery({
    queryKey: workspaceKeys.detailedWorkspace(workspaceId),
    queryFn: () => getDetailedWorkspaceById(workspaceId),
    enabled: !!workspaceId,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
};

// Get workspace members
export const useWorkspaceMembers = (workspaceId: string | undefined) => {
  return useQuery({
    queryKey: [...workspaceKeys.all, 'members', workspaceId],
    queryFn: () => getWorkspaceMembers(workspaceId as string),
    enabled: !!workspaceId,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}; 