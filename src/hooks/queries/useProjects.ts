import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

export interface Project {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  workspaceId: string;
  isDefault: boolean;
  issuePrefix: string;
  nextIssueNumbers: Record<string, number>;
  color?: string;
  createdAt: Date;
  updatedAt: Date;
  _count?: {
    issues: number;
  };
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