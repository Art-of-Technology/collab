import { useQuery } from '@tanstack/react-query';
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

export const useToggleViewFavorite = () => {
  // This will be a mutation hook for toggling favorites
  // We'll implement this when needed
};