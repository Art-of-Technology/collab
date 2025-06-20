'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { TaskSession } from '@/app/api/tasks/[taskId]/sessions/route';

interface SessionsResponse {
  sessions: TaskSession[];
  totalTimeMs: number;
  formattedTotalTime: string;
}

// Define query keys for sessions
export const sessionKeys = {
  all: ['sessions'] as const,
  lists: () => [...sessionKeys.all, 'list'] as const,
  list: (taskId: string) => [...sessionKeys.lists(), taskId] as const,
};

// Fetch sessions for a task
export const useTaskSessions = (taskId: string) => {
  const { data: session } = useSession();
  
  return useQuery<SessionsResponse>({
    queryKey: sessionKeys.list(taskId),
    queryFn: async () => {
      if (!taskId || !session?.user?.id) {
        throw new Error('Task ID and user session required');
      }

      const response = await fetch(`/api/tasks/${taskId}/sessions`);
      if (!response.ok) {
        throw new Error('Failed to fetch sessions');
      }
      
      return response.json();
    },
    enabled: !!taskId && !!session?.user?.id,
    staleTime: 30000, // Consider data stale after 30 seconds
    refetchInterval: 60000, // Refetch every minute
  });
};

// Update session mutation
export const useUpdateSession = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ taskId, sessionId, startTime, endTime, reason }: {
      taskId: string;
      sessionId: string;
      startTime: string;
      endTime: string;
      reason: string;
    }) => {
      const response = await fetch(`/api/tasks/${taskId}/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startTime,
          endTime,
          reason: reason.trim(),
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || 'Failed to update session');
      }

      return response.json();
    },
    onSuccess: (_, { taskId }) => {
      // Invalidate all session queries
      queryClient.invalidateQueries({ 
        queryKey: sessionKeys.all
      });
      
      // Also invalidate playtime queries
      queryClient.invalidateQueries({ 
        queryKey: ['playtime', taskId] 
      });
      
      // Invalidate helpers queries (for time tracking)
      queryClient.invalidateQueries({ 
        queryKey: ['helpers', taskId] 
      });
    },
  });
};

// Helper function to invalidate session caches for a specific task
export const invalidateTaskSessions = (queryClient: any, taskId: string) => {
  queryClient.invalidateQueries({ 
    queryKey: sessionKeys.all
  });
  
  // Also invalidate related queries
  queryClient.invalidateQueries({ queryKey: ['playtime', taskId] });
  queryClient.invalidateQueries({ queryKey: ['helpers', taskId] });
}; 