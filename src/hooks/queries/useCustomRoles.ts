import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

interface CustomRole {
  id: string;
  name: string;
  description?: string | null;
  color?: string | null;
  workspaceId: string;
  createdAt: string;
  updatedAt: string;
  permissions?: string[];
}

interface CreateCustomRoleData {
  name: string;
  description?: string;
  color?: string;
  permissions: string[];
}

interface UpdateCustomRoleData {
  name?: string;
  description?: string;
  color?: string;
  permissions?: string[];
}

// Fetch all custom roles for a workspace
export const useCustomRoles = (workspaceId: string) => {
  return useQuery({
    queryKey: ['customRoles', workspaceId],
    queryFn: async () => {
      const response = await fetch(`/api/workspaces/${workspaceId}/custom-roles`);
      if (!response.ok) {
        throw new Error('Failed to fetch custom roles');
      }
      return response.json() as Promise<CustomRole[]>;
    },
    enabled: !!workspaceId,
  });
};

// Fetch a single custom role
export const useCustomRole = (workspaceId: string, roleId: string) => {
  return useQuery({
    queryKey: ['customRole', workspaceId, roleId],
    queryFn: async () => {
      const response = await fetch(`/api/workspaces/${workspaceId}/custom-roles/${roleId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch custom role');
      }
      return response.json() as Promise<CustomRole>;
    },
    enabled: !!workspaceId && !!roleId,
  });
};

// Create a custom role
export const useCreateCustomRole = (workspaceId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateCustomRoleData) => {
      const response = await fetch(`/api/workspaces/${workspaceId}/custom-roles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create custom role');
      }

      return response.json() as Promise<CustomRole>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customRoles', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['workspacePermissions', workspaceId] });
    },
  });
};

// Update a custom role
export const useUpdateCustomRole = (workspaceId: string, roleId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: UpdateCustomRoleData) => {
      const response = await fetch(`/api/workspaces/${workspaceId}/custom-roles/${roleId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update custom role');
      }

      return response.json() as Promise<CustomRole>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customRoles', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['customRole', workspaceId, roleId] });
      queryClient.invalidateQueries({ queryKey: ['workspacePermissions', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['workspaceMembers', workspaceId] });
    },
  });
};

// Delete a custom role
export const useDeleteCustomRole = (workspaceId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (roleId: string) => {
      const response = await fetch(`/api/workspaces/${workspaceId}/custom-roles/${roleId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete custom role');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customRoles', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['workspacePermissions', workspaceId] });
    },
  });
}; 