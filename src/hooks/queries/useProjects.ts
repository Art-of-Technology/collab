import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';

export interface Project {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  workspaceId?: string;
  isDefault: boolean;
  issuePrefix?: string;
  keyPrefix?: string; // For settings API compatibility
  nextIssueNumbers?: Record<string, number>;
  color?: string;
  createdAt: Date;
  updatedAt: Date;
  statuses?: ProjectStatus[]; // For settings API compatibility
  issueCount?: number; // For API compatibility
  _count?: {
    issues: number;
  };
}

export interface ProjectStatus {
  id: string;
  name: string;
  color: string;
  order: number;
  isDefault?: boolean;
}

interface UseProjectsOptions {
  workspaceId?: string;
  includeStats?: boolean;
}

export const useProjects = ({
  workspaceId,
  includeStats = false,
}: UseProjectsOptions = {}) => {
  return useQuery({
    queryKey: ["projects", { workspaceId, includeStats }],
    queryFn: async () => {
      if (!workspaceId) throw new Error('Workspace ID is required');
      
      const params = new URLSearchParams();
      if (includeStats) params.append("includeStats", "true");

      const { data } = await axios.get(`/api/workspaces/${workspaceId}/projects?${params.toString()}`);
      return data.projects as Project[];
    },
    enabled: !!workspaceId,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
};

export const useProject = (workspaceId: string | undefined, projectSlug: string | undefined) => {
  return useQuery({
    queryKey: ["project", workspaceId, projectSlug],
    queryFn: async () => {
      if (!workspaceId || !projectSlug) throw new Error('Workspace ID and project slug are required');
      
      const { data } = await axios.get(`/api/workspaces/${workspaceId}/projects/${projectSlug}`);
      return data.project as Project;
    },
    enabled: !!workspaceId && !!projectSlug,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
};

// Create project mutation
export interface CreateProjectData {
  name: string;
  description?: string;
  color?: string;
  issuePrefix?: string;
}

export const useCreateProject = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ workspaceId, projectData }: { workspaceId: string; projectData: CreateProjectData }) => {
      const { data } = await axios.post(`/api/workspaces/${workspaceId}/projects`, projectData);
      return data;
    },
    onSuccess: (data, variables) => {
      // Invalidate all projects queries for this workspace
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      
      // Specifically invalidate the queries used by sidebar and other components
      queryClient.invalidateQueries({ 
        queryKey: ["projects", { workspaceId: variables.workspaceId }]
      });
      
      // Also invalidate queries with includeStats for sidebar
      queryClient.invalidateQueries({ 
        queryKey: ["projects", { workspaceId: variables.workspaceId, includeStats: true }]
      });

      // Invalidate views queries since creating a project also creates a default view
      queryClient.invalidateQueries({ queryKey: ["views"] });
      
      // Specifically invalidate the views queries used by sidebar and other components
      queryClient.invalidateQueries({ 
        queryKey: ["views", { workspaceId: variables.workspaceId }]
      });
      
      // Also invalidate views queries with includeStats for sidebar
      queryClient.invalidateQueries({ 
        queryKey: ["views", { workspaceId: variables.workspaceId, includeStats: true }]
      });
    },
  });
};