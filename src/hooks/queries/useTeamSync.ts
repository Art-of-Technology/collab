import { useQuery } from '@tanstack/react-query';
import type { 
  TeamMemberSync, 
  TeamRangeSync, 
  IssueMovement 
} from '@/utils/teamSyncAnalyzer';

interface UseTeamSyncParams {
  workspaceId: string;
  date?: Date;
  projectIds?: string[];
  userIds?: string[];
  enabled?: boolean;
}

interface UseTeamSyncRangeParams {
  workspaceId: string;
  startDate: Date;
  endDate: Date;
  projectIds?: string[];
  userIds?: string[];
  enabled?: boolean;
}

interface UseActivityFeedParams {
  workspaceId: string;
  startDate: Date;
  endDate: Date;
  projectIds?: string[];
  userIds?: string[];
  limit?: number;
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

/**
 * Hook to fetch team sync data for a date range
 * Returns day-by-day breakdown of team activity with issue movements
 */
export function useTeamSyncRange({
  workspaceId,
  startDate,
  endDate,
  projectIds,
  userIds,
  enabled = true,
}: UseTeamSyncRangeParams) {
  const startDateStr = startDate.toISOString().split('T')[0];
  const endDateStr = endDate.toISOString().split('T')[0];

  return useQuery<TeamRangeSync & { 
    metadata: {
      workspaceId: string;
      projectIds: string[];
      userIds: string[];
      generatedAt: string;
    };
  }>({
    queryKey: ['team-sync-range', workspaceId, startDateStr, endDateStr, projectIds, userIds],
    queryFn: async () => {
      const params = new URLSearchParams({
        startDate: startDateStr,
        endDate: endDateStr,
        mode: 'range',
      });
      
      if (projectIds && projectIds.length > 0) {
        params.append('projectIds', projectIds.join(','));
      }
      
      if (userIds && userIds.length > 0) {
        params.append('userIds', userIds.join(','));
      }

      const response = await fetch(
        `/api/workspaces/${workspaceId}/team-sync/range?${params}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch team sync range');
      }

      return response.json();
    },
    enabled: enabled && !!workspaceId,
    staleTime: 30000, // 30 seconds
    gcTime: 120000, // Keep in cache for 2 minutes
  });
}

/**
 * Hook to fetch activity feed (chronological list of all movements)
 */
export function useActivityFeed({
  workspaceId,
  startDate,
  endDate,
  projectIds,
  userIds,
  limit = 100,
  enabled = true,
}: UseActivityFeedParams) {
  const startDateStr = startDate.toISOString().split('T')[0];
  const endDateStr = endDate.toISOString().split('T')[0];

  return useQuery<{
    feed: IssueMovement[];
    metadata: {
      startDate: string;
      endDate: string;
      workspaceId: string;
      projectIds: string[];
      userIds: string[];
      count: number;
      generatedAt: string;
    };
  }>({
    queryKey: ['activity-feed', workspaceId, startDateStr, endDateStr, projectIds, userIds, limit],
    queryFn: async () => {
      const params = new URLSearchParams({
        startDate: startDateStr,
        endDate: endDateStr,
        mode: 'feed',
        limit: limit.toString(),
      });
      
      if (projectIds && projectIds.length > 0) {
        params.append('projectIds', projectIds.join(','));
      }
      
      if (userIds && userIds.length > 0) {
        params.append('userIds', userIds.join(','));
      }

      const response = await fetch(
        `/api/workspaces/${workspaceId}/team-sync/range?${params}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch activity feed');
      }

      return response.json();
    },
    enabled: enabled && !!workspaceId,
    staleTime: 15000, // 15 seconds - activity feed should be fresher
    gcTime: 60000, // Keep in cache for 1 minute
  });
}


