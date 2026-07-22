import { useQuery } from '@tanstack/react-query';
import type { TeamSyncRangeData, ActivityFeedData, IssueActivity } from '@/utils/teamSyncAnalyzer';
import { calculateDayActivity, groupActivitiesByDate } from '@/utils/teamSyncAnalyzer';
import { format, eachDayOfInterval } from 'date-fns';

interface UseTeamSyncRangeOptions {
  workspaceId: string;
  startDate: Date;
  endDate: Date;
  projectIds?: string[];
  userIds?: string[];
  enabled?: boolean;
}

interface UseActivityFeedOptions {
  workspaceId: string;
  startDate: Date;
  endDate: Date;
  projectIds?: string[];
  userIds?: string[];
  limit?: number;
  enabled?: boolean;
}

/**
 * Fetch team sync data for a date range
 */
export function useTeamSyncRange({
  workspaceId,
  startDate,
  endDate,
  projectIds,
  userIds,
  enabled = true,
}: UseTeamSyncRangeOptions) {
  return useQuery<TeamSyncRangeData>({
    queryKey: ['team-sync-range', workspaceId, startDate.toISOString(), endDate.toISOString(), projectIds, userIds],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('startDate', startDate.toISOString());
      params.append('endDate', endDate.toISOString());
      if (projectIds?.length) params.append('projectIds', projectIds.join(','));
      if (userIds?.length) params.append('userIds', userIds.join(','));

      const response = await fetch(`/api/workspaces/${workspaceId}/planning/range?${params.toString()}`);

      if (!response.ok) {
        // If API doesn't exist yet, return empty data
        if (response.status === 404) {
          return getEmptyRangeData(startDate, endDate);
        }
        throw new Error('Failed to fetch team sync range');
      }

      return response.json();
    },
    enabled: enabled && !!workspaceId,
    staleTime: 1000 * 60 * 2, // 2 minutes
  });
}

/**
 * Fetch activity feed for team
 */
export function useActivityFeed({
  workspaceId,
  startDate,
  endDate,
  projectIds,
  userIds,
  limit = 50,
  enabled = true,
}: UseActivityFeedOptions) {
  return useQuery<ActivityFeedData>({
    queryKey: ['activity-feed', workspaceId, startDate.toISOString(), endDate.toISOString(), projectIds, userIds, limit],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('startDate', startDate.toISOString());
      params.append('endDate', endDate.toISOString());
      params.append('limit', limit.toString());
      if (projectIds?.length) params.append('projectIds', projectIds.join(','));
      if (userIds?.length) params.append('userIds', userIds.join(','));

      const response = await fetch(`/api/workspaces/${workspaceId}/planning/activity?${params.toString()}`);

      if (!response.ok) {
        // If API doesn't exist yet, return empty data
        if (response.status === 404) {
          return { feed: [], hasMore: false };
        }
        throw new Error('Failed to fetch activity feed');
      }

      return response.json();
    },
    enabled: enabled && !!workspaceId,
    staleTime: 1000 * 60 * 2, // 2 minutes
  });
}

/**
 * Get empty range data for when API is not available
 */
function getEmptyRangeData(startDate: Date, endDate: Date): TeamSyncRangeData {
  const days = eachDayOfInterval({ start: startDate, end: endDate });
  const totalDays = days.length;

  return {
    members: [],
    summary: {
      totalCompleted: 0,
      totalStarted: 0,
      totalMoved: 0,
      totalCreated: 0,
      avgPerMember: 0,
      dateRange: {
        startDate,
        endDate,
        totalDays,
      },
    },
    dateRange: {
      startDate,
      endDate,
      totalDays,
    },
  };
}
