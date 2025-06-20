import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useWorkspace } from '@/context/WorkspaceContext';
import { useToast } from '@/hooks/use-toast';
import type { TimesheetData, TimesheetEntry } from '@/app/api/activities/timesheet/route';

export interface TimesheetFilters {
  view: 'daily' | 'weekly' | 'monthly';
  date: string;
  boardId?: string;
}

const timesheetKeys = {
  all: ['timesheet'] as const,
  lists: () => [...timesheetKeys.all, 'list'] as const,
  list: (workspaceId: string, filters: TimesheetFilters) => 
    [...timesheetKeys.lists(), workspaceId, filters] as const,
  exports: () => [...timesheetKeys.all, 'export'] as const,
  export: (workspaceId: string, filters: TimesheetFilters) => 
    [...timesheetKeys.exports(), workspaceId, filters] as const,
};

export function useTimesheet(filters: TimesheetFilters) {
  const { currentWorkspace } = useWorkspace();
  const { toast } = useToast();

  return useQuery({
    queryKey: timesheetKeys.list(currentWorkspace?.id || '', filters),
    queryFn: async (): Promise<TimesheetData> => {
      if (!currentWorkspace?.id) {
        throw new Error('No workspace selected');
      }

      const params = new URLSearchParams({
        workspaceId: currentWorkspace.id,
        view: filters.view,
        date: filters.date,
        ...(filters.boardId && { boardId: filters.boardId }),
      });

      const response = await fetch(`/api/activities/timesheet?${params}`);
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch timesheet data');
      }
      
      return response.json();
    },
    enabled: !!currentWorkspace?.id,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    retry: (failureCount, error) => {
      // Don't retry on authorization errors
      if (error.message.includes('Unauthorized') || error.message.includes('access denied')) {
        return false;
      }
      return failureCount < 3;
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
}

export function useTimesheetExport() {
  const { currentWorkspace } = useWorkspace();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (filters: TimesheetFilters & { format: 'csv' | 'pdf' }) => {
      if (!currentWorkspace?.id) {
        throw new Error('No workspace selected');
      }

      const params = new URLSearchParams({
        workspaceId: currentWorkspace.id,
        view: filters.view,
        date: filters.date,
        format: filters.format,
        ...(filters.boardId && { boardId: filters.boardId }),
      });

      const response = await fetch(`/api/activities/timesheet/export?${params}`, {
        method: 'POST',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to export timesheet');
      }

      // Handle file download
      if (filters.format === 'pdf') {
        // For PDF, open HTML in new window so user can print to PDF
        const htmlContent = await response.text();
        const newWindow = window.open('', '_blank');
        if (newWindow) {
          newWindow.document.write(htmlContent);
          newWindow.document.close();
          // Automatically trigger print dialog
          setTimeout(() => {
            newWindow.print();
          }, 1000);
        }
      } else {
        // For CSV, download as file
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `timesheet-${filters.view}-${filters.date}.${filters.format}`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }

      return { success: true };
    },
    onSuccess: () => {
      toast({
        title: "Export Complete",
        description: "Your timesheet has been downloaded successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Export Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

// Hook for refreshing timesheet data
export function useRefreshTimesheet() {
  const queryClient = useQueryClient();
  const { currentWorkspace } = useWorkspace();

  return (filters?: Partial<TimesheetFilters>) => {
    if (filters && currentWorkspace?.id) {
      // Invalidate specific query
      queryClient.invalidateQueries({
        queryKey: timesheetKeys.list(currentWorkspace.id, filters as TimesheetFilters)
      });
    } else {
      // Invalidate all timesheet queries
      queryClient.invalidateQueries({
        queryKey: timesheetKeys.all
      });
    }
  };
}

// Hook for prefetching adjacent time periods
export function usePrefetchTimesheet() {
  const queryClient = useQueryClient();
  const { currentWorkspace } = useWorkspace();

  return (filters: TimesheetFilters) => {
    if (!currentWorkspace?.id) return;

    const currentDate = new Date(filters.date);
    let nextDate: Date, prevDate: Date;

    switch (filters.view) {
      case 'daily':
        nextDate = new Date(currentDate);
        nextDate.setDate(nextDate.getDate() + 1);
        prevDate = new Date(currentDate);
        prevDate.setDate(prevDate.getDate() - 1);
        break;
      case 'weekly':
        nextDate = new Date(currentDate);
        nextDate.setDate(nextDate.getDate() + 7);
        prevDate = new Date(currentDate);
        prevDate.setDate(prevDate.getDate() - 7);
        break;
      case 'monthly':
        nextDate = new Date(currentDate);
        nextDate.setMonth(nextDate.getMonth() + 1);
        prevDate = new Date(currentDate);
        prevDate.setMonth(prevDate.getMonth() - 1);
        break;
    }

    // Prefetch next and previous periods
    [nextDate, prevDate].forEach(date => {
      const prefetchFilters = {
        ...filters,
        date: date.toISOString(),
      };

      queryClient.prefetchQuery({
        queryKey: timesheetKeys.list(currentWorkspace.id, prefetchFilters),
        queryFn: async () => {
          const params = new URLSearchParams({
            workspaceId: currentWorkspace.id,
            view: prefetchFilters.view,
            date: prefetchFilters.date,
            ...(prefetchFilters.boardId && { boardId: prefetchFilters.boardId }),
          });

          const response = await fetch(`/api/activities/timesheet?${params}`);
          if (!response.ok) throw new Error('Failed to prefetch');
          return response.json();
        },
        staleTime: 2 * 60 * 1000,
      });
    });
  };
} 