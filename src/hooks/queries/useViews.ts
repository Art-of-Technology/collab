import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';

export interface View {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  workspaceId: string;
  ownerId: string;
  displayType: 'KANBAN' | 'LIST' | 'TABLE' | 'CALENDAR' | 'TIMELINE';
  filters: Record<string, any> | null;
  sorting: Record<string, any> | null;
  grouping: Record<string, any> | null;
  fields: Record<string, any> | null;
  layout: Record<string, any> | null;
  projectIds: string[];
  workspaceIds: string[];
  visibility: 'PERSONAL' | 'WORKSPACE' | 'SHARED';
  isDefault: boolean;
  isFavorite: boolean;
  sharedWith: string[];
  color?: string;
  createdAt: Date;
  updatedAt: Date;
  _count?: {
    issues: number;
  };
  projects?: Array<{
    id: string;
    name: string;
    color?: string;
  }>;
}

interface UseViewsOptions {
  workspaceId?: string;
  type?: 'WORKSPACE' | 'SHARED' | 'PERSONAL' | 'ALL';
  includeStats?: boolean;
}

export const useViews = ({
  workspaceId,
  type = 'ALL',
  includeStats = false,
}: UseViewsOptions = {}) => {
  return useQuery({
    queryKey: ["views", { workspaceId, type, includeStats }],
    queryFn: async () => {
      if (!workspaceId) throw new Error('Workspace ID is required');
      
      const params = new URLSearchParams();
      if (type !== 'ALL') params.append("type", type);
      if (includeStats) params.append("includeStats", "true");

      const { data } = await axios.get(`/api/workspaces/${workspaceId}/views?${params.toString()}`);
      return data.views as View[];
    },
    enabled: !!workspaceId,
    staleTime: 1000 * 60 * 2, // 2 minutes (views change more frequently)
  });
};

export const useView = (viewSlug: string | undefined, workspaceId: string | undefined) => {
  return useQuery({
    queryKey: ["view", viewSlug, workspaceId],
    queryFn: async () => {
      if (!viewSlug) throw new Error('View slug is required');
      if (!workspaceId) throw new Error('Workspace ID is required');
      
      const { data } = await axios.get(`/api/views/${viewSlug}?workspaceId=${workspaceId}`);
      return data.view as View;
    },
    enabled: !!viewSlug && !!workspaceId,
    staleTime: 1000 * 60 * 2, // 2 minutes
  });
};

// Query key factory for views
export const viewKeys = {
  all: ['views'] as const,
  lists: () => [...viewKeys.all, 'list'] as const,
  list: (filters: { workspaceId?: string; type?: string; includeStats?: boolean }) => 
    [...viewKeys.lists(), filters] as const,
  details: () => [...viewKeys.all, 'detail'] as const,
  detail: (slug: string, workspaceId: string) => [...viewKeys.details(), slug, workspaceId] as const,
};

// Create view mutation
export interface CreateViewData {
  name: string;
  description?: string;
  displayType: string;
  visibility: 'PERSONAL' | 'WORKSPACE' | 'SHARED';
  projectIds: string[];
  filters: Record<string, any>;
  sorting: Record<string, any>;
  grouping: Record<string, any>;
  fields: string[];
  layout: Record<string, any>;
}

export const useCreateView = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ workspaceId, viewData }: { workspaceId: string; viewData: CreateViewData }) => {
      const { data } = await axios.post(`/api/workspaces/${workspaceId}/views`, viewData);
      return data;
    },
    onSuccess: (data, variables) => {
      // Invalidate all views queries for this workspace
      queryClient.invalidateQueries({ queryKey: ["views"] });
      
      // Specifically invalidate the queries used by sidebar and other components
      queryClient.invalidateQueries({ 
        queryKey: ["views", { workspaceId: variables.workspaceId }]
      });
      
      // Also invalidate queries with includeStats for sidebar
      queryClient.invalidateQueries({ 
        queryKey: ["views", { workspaceId: variables.workspaceId, includeStats: true }]
      });
    },
  });
};

// Update view mutation
export const useUpdateView = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ 
      workspaceId, 
      viewId, 
      viewData 
    }: { 
      workspaceId: string; 
      viewId: string; 
      viewData: Partial<CreateViewData> 
    }) => {
      const { data } = await axios.patch(`/api/workspaces/${workspaceId}/views/${viewId}`, viewData);
      return data;
    },
    onSuccess: (data, variables) => {
      // Invalidate all views queries for this workspace
      queryClient.invalidateQueries({ queryKey: ["views"] });
      queryClient.invalidateQueries({ 
        queryKey: ["views", { workspaceId: variables.workspaceId }]
      });
      queryClient.invalidateQueries({ 
        queryKey: ["views", { workspaceId: variables.workspaceId, includeStats: true }]
      });
    },
  });
};

// Delete view mutation
export const useDeleteView = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ workspaceId, viewId }: { workspaceId: string; viewId: string }) => {
      const { data } = await axios.delete(`/api/workspaces/${workspaceId}/views/${viewId}`);
      return data;
    },
    onSuccess: (data, variables) => {
      // Invalidate all views queries for this workspace
      queryClient.invalidateQueries({ queryKey: ["views"] });
      queryClient.invalidateQueries({ 
        queryKey: ["views", { workspaceId: variables.workspaceId }]
      });
      queryClient.invalidateQueries({ 
        queryKey: ["views", { workspaceId: variables.workspaceId, includeStats: true }]
      });
    },
  });
};

// Toggle view favorite mutation
export const useToggleViewFavorite = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ workspaceId, viewId }: { workspaceId: string; viewId: string }) => {
      const { data } = await axios.patch(`/api/workspaces/${workspaceId}/views/${viewId}/favorite`);
      return data;
    },
    onSuccess: (data, variables) => {
      // Invalidate all views queries for this workspace
      queryClient.invalidateQueries({ queryKey: ["views"] });
      queryClient.invalidateQueries({ 
        queryKey: ["views", { workspaceId: variables.workspaceId }]
      });
      queryClient.invalidateQueries({ 
        queryKey: ["views", { workspaceId: variables.workspaceId, includeStats: true }]
      });
    },
  });
};