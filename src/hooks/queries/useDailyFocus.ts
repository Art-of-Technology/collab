import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';

export interface DailyFocusReflection {
  id: string;
  entryId: string;
  issueId: string;
  status: 'COMPLETED' | 'COULD_NOT_COMPLETE' | 'PAUSED' | 'PENDING_INPUT' | 'UNPLANNED_WORK' | 'UNTOUCHED';
  notes?: string;
  issue?: any;
}

export interface DailyFocusPlan {
  id: string;
  entryId: string;
  issueId: string;
  notes?: string;
  issue?: any;
}

export interface DailyFocusAssignment {
  id: string;
  entryId: string;
  issueId: string;
  assignedToId: string;
  assignedById: string;
  notes?: string;
  issue?: any;
  assignedTo?: any;
  assignedBy?: any;
}

export interface DailyFocusEntry {
  id: string;
  userId: string;
  workspaceId: string;
  date: string;
  status: 'DRAFT' | 'SUBMITTED';
  submittedAt?: string;
  createdAt: string;
  updatedAt: string;
  reflections: DailyFocusReflection[];
  plans: DailyFocusPlan[];
  assignments: DailyFocusAssignment[];
  user?: any;
}

export interface CreateDailyFocusEntryData {
  date?: string;
  reflections?: Array<{ issueId: string; status: string; notes?: string }>;
  plans?: Array<{ issueId: string; notes?: string }>;
  assignments?: Array<{ issueId: string; assignedToId: string; notes?: string }>;
}

export interface UpdateDailyFocusEntryData extends CreateDailyFocusEntryData {
  status?: 'DRAFT' | 'SUBMITTED';
}

export interface TeamDailyFocusFilters {
  startDate?: string;
  endDate?: string;
  projectIds?: string[];
  userIds?: string[];
  status?: string;
}

export function useDailyFocusEntry(
  workspaceId: string,
  date?: Date | string,
  userId?: string
) {
  const dateStr = date
    ? typeof date === 'string'
      ? date
      : date.toISOString().split('T')[0]
    : undefined;

  return useQuery<{ entry: DailyFocusEntry | null }>({
    queryKey: ['daily-focus-entry', workspaceId, dateStr, userId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (dateStr) params.append('date', dateStr);
      if (userId) params.append('userId', userId);

      const response = await fetch(
        `/api/workspaces/${workspaceId}/daily-focus?${params.toString()}`
      );
      if (!response.ok) {
        throw new Error('Failed to fetch daily focus entry');
      }
      return response.json();
    },
    enabled: !!workspaceId,
  });
}

export function useTeamDailyFocus(
  workspaceId: string,
  filters?: TeamDailyFocusFilters
) {
  return useQuery<{ entries: DailyFocusEntry[]; stats: any }>({
    queryKey: ['team-daily-focus', workspaceId, filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.startDate) params.append('startDate', filters.startDate);
      if (filters?.endDate) params.append('endDate', filters.endDate);
      if (filters?.projectIds?.length) {
        params.append('projectIds', filters.projectIds.join(','));
      }
      if (filters?.userIds?.length) {
        params.append('userIds', filters.userIds.join(','));
      }
      if (filters?.status) params.append('status', filters.status);

      const response = await fetch(
        `/api/workspaces/${workspaceId}/daily-focus/team?${params.toString()}`
      );
      if (!response.ok) {
        throw new Error('Failed to fetch team daily focus');
      }
      return response.json();
    },
    enabled: !!workspaceId,
  });
}

export function useCreateDailyFocusEntry(workspaceId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: CreateDailyFocusEntryData) => {
      const response = await fetch(
        `/api/workspaces/${workspaceId}/daily-focus`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        }
      );
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create daily focus entry');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['daily-focus-entry', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['team-daily-focus', workspaceId] });
      toast({
        title: 'Success',
        description: 'Daily focus entry created',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useUpdateDailyFocusEntry(workspaceId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      entryId,
      data,
    }: {
      entryId?: string;
      data: UpdateDailyFocusEntryData & { date?: string };
    }) => {
      const url = entryId
        ? `/api/workspaces/${workspaceId}/daily-focus/${entryId}`
        : `/api/workspaces/${workspaceId}/daily-focus`;
      
      const response = await fetch(url, {
        method: entryId ? 'PUT' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update daily focus entry');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['daily-focus-entry', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['team-daily-focus', workspaceId] });
      toast({
        title: 'Success',
        description: 'Daily focus entry updated',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useSubmitDailyFocusEntry(workspaceId: string) {
  const updateMutation = useUpdateDailyFocusEntry(workspaceId);
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      entryId,
      date,
    }: {
      entryId?: string;
      date?: string;
    }) => {
      return updateMutation.mutateAsync({
        entryId,
        data: {
          date,
          status: 'SUBMITTED',
        },
      });
    },
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Daily focus entry submitted',
      });
    },
  });
}

// Hook for fetching smart suggestions based on IssueActivity
export function useDailyFocusSuggestions(
  workspaceId: string,
  date?: Date | string,
  userId?: string,
  enabled: boolean = true
) {
  const dateStr = date
    ? typeof date === 'string'
      ? date
      : date.toISOString().split('T')[0]
    : new Date().toISOString().split('T')[0];

  return useQuery<{
    suggestions: {
      yesterday: {
        workedOn: any[];
        activities: any[];
      };
      today: {
        overdue: any[];
        highPriority: any[];
        inProgress: any[];
        paused: any[];
        assigned: any[];
      };
      metadata: {
        date: string;
        userId: string;
        workspaceId: string;
      };
    };
  }>({
    queryKey: ['dailyFocusSuggestions', workspaceId, dateStr, userId],
    queryFn: async () => {
      const params = new URLSearchParams({ date: dateStr });
      if (userId) {
        params.append('userId', userId);
      }
      
      const response = await fetch(
        `/api/workspaces/${workspaceId}/daily-focus/suggestions?${params}`
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch suggestions');
      }
      
      return response.json();
    },
    enabled: enabled && !!workspaceId,
    staleTime: 30000, // 30 seconds
    gcTime: 60000, // Keep in cache for 1 minute
  });
}

export type ReflectionStatus = DailyFocusReflection['status'];

