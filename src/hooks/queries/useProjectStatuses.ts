import { useQuery } from '@tanstack/react-query';

export interface ProjectStatus {
  id: string;
  name: string;
  displayName: string;
  description?: string;
  color: string;
  iconName?: string;
  order: number;
  isDefault: boolean;
  isFinal: boolean;
  issueCount: number;
  template?: {
    id: string;
    name: string;
    displayName: string;
  } | null;
}

export interface ProjectStatusesResponse {
  statuses: ProjectStatus[];
}

async function fetchProjectStatuses(projectId: string): Promise<ProjectStatusesResponse> {
  const response = await fetch(`/api/projects/${projectId}/statuses`);
  
  if (!response.ok) {
    throw new Error('Failed to fetch project statuses');
  }
  
  return response.json();
}

export function useProjectStatuses(projectId: string | null, enabled: boolean = true) {
  return useQuery({
    queryKey: ['project-statuses', projectId],
    queryFn: () => fetchProjectStatuses(projectId!),
    enabled: enabled && !!projectId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}

// Hook for fetching statuses for multiple projects
export function useMultipleProjectStatuses(projectIds: string[], enabled: boolean = true) {
  return useQuery({
    queryKey: ['multiple-project-statuses', projectIds.sort()],
    queryFn: async () => {
      const promises = projectIds.map(projectId => fetchProjectStatuses(projectId));
      const results = await Promise.all(promises);
      
      // Combine all statuses from all projects
      const allStatuses: ProjectStatus[] = [];
      const statusNames = new Set<string>();
      
      results.forEach((result, index) => {
        result.statuses.forEach(status => {
          // Create a unique entry for each project-status combination
          const uniqueStatus = {
            ...status,
            id: `${projectIds[index]}-${status.name}`, // Create unique ID for cross-project grouping
            projectId: projectIds[index],
            dbId: status.id // preserve original database id for mapping filters
          };
          allStatuses.push(uniqueStatus);
          statusNames.add(status.name);
        });
      });
      
      // Create unified column definitions with deterministic ordering
      // When multiple projects have the same status name, use the LOWEST order value
      // and prefer the template-linked displayName for consistency
      const unifiedStatuses = Array.from(statusNames)
        .map(statusName => {
          const matches = allStatuses.filter(s => s.name === statusName);
          if (matches.length === 0) return null;
          
          // Use the match with the lowest order for deterministic column ordering
          const sorted = [...matches].sort((a, b) => a.order - b.order);
          const primary = sorted[0];
          
          // Use the minimum order across all projects for this status
          const minOrder = Math.min(...matches.map(s => s.order));
          
          return {
            id: statusName,
            name: statusName,
            displayName: primary.displayName,
            description: primary.description,
            color: primary.color,
            iconName: primary.iconName,
            order: minOrder,
            isDefault: matches.some(s => s.isDefault),
            isFinal: matches.some(s => s.isFinal),
            issueCount: matches.reduce((sum, s) => sum + s.issueCount, 0)
          };
        })
        .filter(Boolean)
        .sort((a, b) => a!.order - b!.order);
      
      return {
        statuses: unifiedStatuses as ProjectStatus[],
        projectStatuses: allStatuses
      };
    },
    enabled: enabled && projectIds.length > 0,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}