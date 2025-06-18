"use client";

import React, { createContext, useContext, ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { useToast } from '@/hooks/use-toast';
import { invalidateTaskSessions } from '@/hooks/queries/useTaskSessions';

interface UserStatus {
  id: string;
  currentStatus: string;
  currentTaskId?: string;
  statusStartedAt: string;
  statusText?: string;
  isAvailable: boolean;
  autoEndAt?: string;
  currentTask?: {
    id: string;
    title: string;
    issueKey?: string;
    priority: string;
  };
  currentTaskPlayState?: "stopped" | "playing" | "paused";
}

interface ActivityContextType {
  userStatus: UserStatus | null;
  isLoading: boolean;
  error: Error | null;
  startActivity: (eventType: string, taskId?: string, duration?: number) => Promise<void>;
  endActivity: (description?: string) => Promise<void>;
  handleTaskAction: (action: "play" | "pause" | "stop", taskId: string) => Promise<void>;
  refetchStatus: () => void;
}

const ActivityContext = createContext<ActivityContextType | undefined>(undefined);

export function useActivity() {
  const context = useContext(ActivityContext);
  if (context === undefined) {
    throw new Error('useActivity must be used within an ActivityProvider');
  }
  return context;
}

interface ActivityProviderProps {
  children: ReactNode;
}

export function ActivityProvider({ children }: ActivityProviderProps) {
  const { data: session } = useSession();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch user status using tanstack query
  const {
    data: userStatus,
    isLoading,
    error,
    refetch: refetchStatus
  } = useQuery<UserStatus | null>({
    queryKey: ['userStatus', session?.user?.id],
    queryFn: async () => {
      if (!session?.user?.id) return null;
      
      const response = await fetch('/api/activities/status');
      if (!response.ok) {
        throw new Error('Failed to fetch user status');
      }
      const data = await response.json();
      return data.status;
    },
    enabled: !!session?.user?.id,
    refetchInterval: 60000, // Refetch every minute instead of 30 seconds
    staleTime: 30000, // Consider data stale after 30 seconds
  });

  // Start activity mutation
  const startActivityMutation = useMutation({
    mutationFn: async ({ eventType, taskId, duration, description }: {
      eventType: string;
      taskId?: string;
      duration?: number;
      description?: string;
    }) => {
      const autoEndAt = duration 
        ? new Date(Date.now() + duration * 60 * 1000).toISOString()
        : undefined;

      const response = await fetch('/api/activities/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType,
          taskId,
          description,
          autoEndAt,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to start activity' }));
        throw new Error(errorData.message || 'Failed to start activity');
      }

      return response.json();
    },
    onSuccess: (_, { taskId }) => {
      // Invalidate user status and task queries
      queryClient.invalidateQueries({ queryKey: ['userStatus'] });
      queryClient.invalidateQueries({ queryKey: ['assignedTasks'] });
      queryClient.invalidateQueries({ queryKey: ['searchTasks'] });
      
      // If this was a task-related activity, invalidate session caches
      if (taskId) {
        invalidateTaskSessions(queryClient, taskId);
      }
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // End activity mutation
  const endActivityMutation = useMutation({
    mutationFn: async (description?: string) => {
      const response = await fetch('/api/activities/end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: description || 'Set to available' }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to end activity' }));
        throw new Error(errorData.message || 'Failed to end activity');
      }

      return response.json();
    },
    onSuccess: (data) => {
      // Invalidate user status and task queries
      queryClient.invalidateQueries({ queryKey: ['userStatus'] });
      queryClient.invalidateQueries({ queryKey: ['assignedTasks'] });
      queryClient.invalidateQueries({ queryKey: ['searchTasks'] });
      
      // If the ended activity was task-related, invalidate session caches
      // The API response should include the taskId if it was a task activity
      if (data?.taskId) {
        invalidateTaskSessions(queryClient, data.taskId);
      }
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Task action mutation
  const taskActionMutation = useMutation({
    mutationFn: async ({ action, taskId }: { action: "play" | "pause" | "stop"; taskId: string }) => {
      const eventTypeMap = {
        play: "TASK_START",
        pause: "TASK_PAUSE", 
        stop: "TASK_STOP"
      };

      const response = await fetch('/api/activities/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: eventTypeMap[action],
          taskId,
          description: `${action === 'play' ? 'Started' : action === 'pause' ? 'Paused' : 'Stopped'} work on task`,
          metadata: { source: 'activity-context' },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: `Failed to ${action} task` }));
        throw new Error(errorData.message || `Failed to ${action} task`);
      }

      return response.json();
    },
    onSuccess: (_, { action, taskId }) => {
      toast({
        title: `Task ${action === 'play' ? 'Started' : action === 'pause' ? 'Paused' : 'Stopped'}`,
        description: `Task timer has been ${action === 'play' ? 'started' : action === 'pause' ? 'paused' : 'stopped'}.`,
      });

      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ['userStatus'] });
      queryClient.invalidateQueries({ queryKey: ['assignedTasks'] });
      queryClient.invalidateQueries({ queryKey: ['searchTasks'] });
      queryClient.invalidateQueries({ queryKey: ['taskActivities'] });
      queryClient.invalidateQueries({ queryKey: ['taskPlaytime'] });
      
      // Invalidate session caches for this specific task
      invalidateTaskSessions(queryClient, taskId);
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const contextValue: ActivityContextType = {
    userStatus: userStatus || null,
    isLoading: isLoading || startActivityMutation.isPending || endActivityMutation.isPending || taskActionMutation.isPending,
    error: error as Error | null,
    startActivity: async (eventType: string, taskId?: string, duration?: number) => {
      await startActivityMutation.mutateAsync({ eventType, taskId, duration });
    },
    endActivity: async (description?: string) => {
      await endActivityMutation.mutateAsync(description);
    },
    handleTaskAction: async (action: "play" | "pause" | "stop", taskId: string) => {
      await taskActionMutation.mutateAsync({ action, taskId });
    },
    refetchStatus: () => {
      refetchStatus();
    },
  };

  return (
    <ActivityContext.Provider value={contextValue}>
      {children}
    </ActivityContext.Provider>
  );
} 