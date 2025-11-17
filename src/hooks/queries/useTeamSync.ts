import { useQuery } from '@tanstack/react-query';
import type { TeamMemberSync } from '@/utils/teamSyncAnalyzer';

interface UseTeamSyncParams {
  workspaceId: string;
  date?: Date;
  projectIds?: string[];
  userIds?: string[];
  enabled?: boolean;
}

export function useTeamSync({
  workspaceId,
  date,
  projectIds,
  userIds,
  enabled = true,
}: UseTeamSyncParams) {
  const dateStr = date
    ? date.toISOString().split('T')[0]
    : new Date().toISOString().split('T')[0];

  return useQuery<{
    teamSync: TeamMemberSync[];
    metadata: {
      date: string;
      workspaceId: string;
      projectIds: string[];
      userIds: string[];
      generatedAt: string;
    };
  }>({
    queryKey: ['team-sync', workspaceId, dateStr, projectIds, userIds],
    queryFn: async () => {
      const params = new URLSearchParams({ date: dateStr });
      
      if (projectIds && projectIds.length > 0) {
        params.append('projectIds', projectIds.join(','));
      }
      
      if (userIds && userIds.length > 0) {
        params.append('userIds', userIds.join(','));
      }

      const response = await fetch(
        `/api/workspaces/${workspaceId}/team-sync/generate?${params}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch team sync');
      }

      return response.json();
    },
    enabled: enabled && !!workspaceId,
    staleTime: 30000, // 30 seconds
    gcTime: 60000, // Keep in cache for 1 minute
  });
}

export function useTeamSyncHistory({
  workspaceId,
  issueId,
  startDate,
  endDate,
  userId,
  enabled = true,
}: {
  workspaceId: string;
  issueId?: string;
  startDate?: Date;
  endDate?: Date;
  userId?: string;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: ['team-sync-history', workspaceId, issueId, startDate, endDate, userId],
    queryFn: async () => {
      const params = new URLSearchParams();
      
      if (issueId) params.append('issueId', issueId);
      if (startDate) params.append('startDate', startDate.toISOString());
      if (endDate) params.append('endDate', endDate.toISOString());
      if (userId) params.append('userId', userId);

      const response = await fetch(
        `/api/workspaces/${workspaceId}/team-sync/history?${params}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch history');
      }

      return response.json();
    },
    enabled: enabled && !!workspaceId,
    staleTime: 60000, // 1 minute
  });
}


