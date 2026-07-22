'use client';

import { useQuery } from '@tanstack/react-query';
import { format, subDays } from 'date-fns';
import type { TeamActivityResponse } from './types';

interface UseTeamActivityOptions {
  workspaceId: string;
  startDate?: Date;
  endDate?: Date;
  projectIds?: string[];
  userIds?: string[];
  enabled?: boolean;
}

export function useTeamActivity({
  workspaceId,
  startDate,
  endDate,
  projectIds,
  userIds,
  enabled = true,
}: UseTeamActivityOptions) {
  // Default to yesterday and today
  const defaultEndDate = new Date();
  const defaultStartDate = subDays(defaultEndDate, 1);

  const start = startDate || defaultStartDate;
  const end = endDate || defaultEndDate;

  return useQuery<TeamActivityResponse>({
    queryKey: [
      'team-activity',
      workspaceId,
      format(start, 'yyyy-MM-dd'),
      format(end, 'yyyy-MM-dd'),
      projectIds?.join(','),
      userIds?.join(','),
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        startDate: format(start, 'yyyy-MM-dd'),
        endDate: format(end, 'yyyy-MM-dd'),
      });

      if (projectIds?.length) {
        params.set('projectIds', projectIds.join(','));
      }

      if (userIds?.length) {
        params.set('userIds', userIds.join(','));
      }

      const response = await fetch(
        `/api/workspaces/${workspaceId}/planning/team-activity?${params.toString()}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch team activity');
      }

      return response.json();
    },
    enabled: enabled && !!workspaceId,
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 60 * 1000, // Refetch every minute for live updates
  });
}
