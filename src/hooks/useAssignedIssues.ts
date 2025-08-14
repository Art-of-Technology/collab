import { useQuery } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';

export interface IssueOption {
  id: string;
  title: string;
  issueKey: string;
  priority: string;
  status: string;
  type: string;
  projectId: string;
  projectName: string;
  createdAt: Date;
  currentPlayState?: 'stopped' | 'playing' | 'paused';
  assignee?: {
    id: string;
    name: string | null;
    image: string | null;
  } | null;
}

export interface IssueProject {
  id: string;
  name: string;
  issues: IssueOption[];
}

export function useAssignedIssues(workspaceId?: string) {
  const { data: session } = useSession();

  const {
    data: projects = [],
    isLoading: loading,
    error,
    refetch
  } = useQuery<IssueProject[]>({
    queryKey: ['assignedIssues', session?.user?.id, workspaceId],
    queryFn: async () => {
      if (!session?.user?.id || !workspaceId) {
        return [];
      }

      const response = await fetch(`/api/users/${session.user.id}/assigned-issues?workspaceId=${workspaceId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch assigned issues');
      }
      
      const data = await response.json();
      
      // Group issues by project
      const issuesByProject = new Map<string, IssueOption[]>();
      
      if (data.issues) {
        data.issues.forEach((issue: any) => {
          const projectId = issue.projectId || 'no-project';
          const projectName = issue.project?.name || 'No Project';
          
          if (!issuesByProject.has(projectId)) {
            issuesByProject.set(projectId, []);
          }
          
          issuesByProject.get(projectId)!.push({
            id: issue.id,
            title: issue.title,
            issueKey: issue.issueKey,
            priority: issue.priority,
            status: issue.status,
            type: issue.type,
            projectId: projectId,
            projectName: projectName,
            createdAt: new Date(issue.createdAt),
            currentPlayState: issue.currentPlayState || 'stopped',
            assignee: issue.assignee
          });
        });
      }
      
      return Array.from(issuesByProject.entries()).map(([projectId, issues]) => ({
        id: projectId,
        name: issues[0]?.projectName || 'No Project',
        issues: issues.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      }));
    },
    enabled: !!session?.user?.id && !!workspaceId,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  return {
    projects,
    loading,
    error,
    refetch,
  };
}
