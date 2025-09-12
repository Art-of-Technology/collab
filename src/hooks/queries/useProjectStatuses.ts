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
      
      // Create unified column definitions
      const unifiedStatuses = Array.from(statusNames)
        .map(statusName => {
          // Find the first occurrence of this status name to use as template
          const template = allStatuses.find(s => s.name === statusName);
          if (!template) return null;
          
          return {
            id: statusName,
            name: statusName,
            displayName: template.displayName,
            description: template.description,
            color: template.color,
            iconName: template.iconName,
            order: template.order,
            isDefault: template.isDefault,
            isFinal: template.isFinal,
            issueCount: allStatuses
              .filter(s => s.name === statusName)
              .reduce((sum, s) => sum + s.issueCount, 0)
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