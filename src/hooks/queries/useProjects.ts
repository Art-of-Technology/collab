import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';

export interface Repository {
  id: string;
  projectId: string;
  githubRepoId: string;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  webhookSecret: string;
  webhookId?: string | null;
  isActive: boolean;
  syncedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  
  // Branch versioning configuration
  developmentBranch?: string;
  versioningStrategy: 'SINGLE_BRANCH' | 'MULTI_BRANCH';
  branchEnvironmentMap?: Record<string, string>;
  issueTypeMapping?: Record<string, 'MAJOR' | 'MINOR' | 'PATCH'>;
  
  // Aggregation counts (optional, included when stats are requested)
  _count?: {
    branches: number;
    commits: number;
    releases: number;
    versions: number;
  };
}

export interface Project {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  workspaceId?: string;
  isDefault: boolean;
  isArchived?: boolean; // Optional for backwards compatibility
  issuePrefix?: string;
  keyPrefix?: string; // For settings API compatibility
  nextIssueNumbers?: Record<string, number>;
  color?: string;
  createdAt: Date;
  updatedAt: Date;
  statuses?: ProjectStatus[]; // For settings API compatibility
  repository?: Repository; // GitHub integration
  issueCount?: number; // Total issues count
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

// Archive project mutation
export const useArchiveProject = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ projectId, isArchived }: { projectId: string; isArchived: boolean }) => {
      const { data } = await axios.patch(`/api/projects/${projectId}/archive`, { isArchived });
      return data;
    },
    onSuccess: () => {
      // Invalidate all projects queries to refresh the data
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["views"] });
    },
  });
};

// Project Summary types
export interface ProjectSummaryStats {
  totalIssues: number;
  openIssues: number;
  completedIssues: number;
  overdueCount: number;
  atRiskCount: number;
  issuesWithoutDates: number;
  unassignedIssues: number;
  completionRate: number;
}

export interface StatusDistribution {
  id: string;
  name: string;
  displayName: string | null;
  color: string | null;
  isFinal: boolean;
  count: number;
}

export interface AtRiskIssue {
  id: string;
  title: string;
  issueKey: string;
  dueDate?: string;
  daysOverdue?: number;
  daysUntilDue?: number;
  priority: string | null;
  assignee: {
    id: string;
    name: string | null;
    image: string | null;
  } | null;
  status: {
    id: string;
    name: string;
    displayName: string | null;
    color: string | null;
  } | null;
  epic?: {
    id: string;
    title: string;
    issueKey: string;
  } | null;
  blockedBy?: Array<{
    id: string;
    title: string;
    issueKey: string;
  }>;
}

export interface RecentIssue {
  id: string;
  title: string;
  issueKey: string;
  updatedAt: string;
  priority: string | null;
  assignee: {
    id: string;
    name: string | null;
    image: string | null;
  } | null;
  status: {
    id: string;
    name: string;
    displayName: string | null;
    color: string | null;
  } | null;
}

export interface CompletedIssue {
  id: string;
  title: string;
  issueKey: string;
  completedAt: string;
  assignee: {
    id: string;
    name: string | null;
    image: string | null;
  } | null;
}

export interface TimelineIssue {
  id: string;
  title: string;
  issueKey: string;
  dueDate: string;
  priority: string | null;
  assignee: {
    id: string;
    name: string | null;
    image: string | null;
  } | null;
  status: {
    id: string;
    name: string;
    displayName: string | null;
    color: string | null;
    isFinal?: boolean;
  } | null;
  parent?: {
    id: string;
    title: string;
    issueKey: string;
  } | null;
}

export interface GitHubActivity {
  id: string;
  type: 'commit' | 'pull_request' | 'review' | 'release' | 'branch' | 'deployment';
  title: string;
  description?: string;
  timestamp: string;
  author: {
    name: string;
    avatar?: string;
    login?: string;
  };
  metadata?: {
    sha?: string;
    prNumber?: number;
    prState?: string;
    reviewState?: string;
    tagName?: string;
  };
}

export interface FeatureRequestSummary {
  id: string;
  title: string;
  description: string;
  status: string;
  voteScore: number;
  upvotes: number;
  downvotes: number;
  createdAt: string;
  author: {
    id: string;
    name: string | null;
    image: string | null;
  };
  _count: {
    comments: number;
  };
}

export interface NoteSummary {
  id: string;
  title: string;
  content: string;
  isPublic: boolean;
  isFavorite: boolean;
  createdAt: string;
  updatedAt: string;
  author: {
    id: string;
    name: string | null;
    image: string | null;
  };
  tags: Array<{
    id: string;
    name: string;
    color: string;
  }>;
  comments?: { id: string }[];
}

export interface ProjectSummary {
  project: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    color: string | null;
  };
  stats: ProjectSummaryStats;
  statusDistribution: StatusDistribution[];
  atRisk: {
    overdue: AtRiskIssue[];
    upcoming: AtRiskIssue[];
  };
  recentIssues: RecentIssue[];
  recentlyCompleted: CompletedIssue[];
  timeline: TimelineIssue[];
  github: {
    connected: boolean;
    repositoryName: string | null;
    activities: GitHubActivity[];
  };
  featureRequests: FeatureRequestSummary[];
  notes: NoteSummary[];
}

export const useProjectSummary = (projectId: string | undefined) => {
  return useQuery({
    queryKey: ["projectSummary", projectId],
    queryFn: async () => {
      if (!projectId) throw new Error('Project ID is required');

      const { data } = await axios.get(`/api/projects/${projectId}/summary`);
      return data as ProjectSummary;
    },
    enabled: !!projectId,
    staleTime: 1000 * 60 * 2, // 2 minutes
  });
};