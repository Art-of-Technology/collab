import { useQuery } from '@tanstack/react-query';
import type { IssueLabel, IssueUser } from '@/types/issue';

// Shared, cached reads for the issue selectors. One request per workspace per 5 minutes instead of one per selector mount.

export const workspaceMemberUsersKey = (workspaceId: string | undefined) => ['workspace-member-users', workspaceId] as const;
// Same key and shape as CreateViewModal's labels query so both share one request.
export const workspaceLabelsKey = (workspaceId: string | undefined) => ['workspace-labels', workspaceId] as const;

export function useWorkspaceMemberUsers(workspaceId: string | undefined) {
  return useQuery({
    queryKey: workspaceMemberUsersKey(workspaceId),
    queryFn: async (): Promise<IssueUser[]> => {
      const response = await fetch(`/api/workspaces/${workspaceId}/members`);
      if (!response.ok) throw new Error('Failed to fetch workspace members');
      const data = await response.json();
      const members: any[] = Array.isArray(data) ? data : (data.members || []);
      return members.map((m: any) => m.user ?? m);
    },
    enabled: !!workspaceId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useWorkspaceLabels(workspaceId: string | undefined) {
  return useQuery({
    queryKey: workspaceLabelsKey(workspaceId),
    queryFn: async (): Promise<IssueLabel[]> => {
      const response = await fetch(`/api/workspaces/${workspaceId}/labels`);
      if (!response.ok) throw new Error('Failed to fetch workspace labels');
      const data = await response.json();
      return data.labels || [];
    },
    enabled: !!workspaceId,
    staleTime: 5 * 60 * 1000,
  });
}
