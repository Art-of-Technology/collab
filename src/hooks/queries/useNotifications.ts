"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from 'react';

export interface NotificationData {
  id: string;
  type: string;
  content: string;
  read: boolean;
  createdAt: string;
  taskId?: string;
  postId?: string;
  workspaceId?: string;
  senderId?: string;
  taskCommentId?: string;
  sender?: {
    id: string;
    name: string | null;
    email: string;
    image?: string | null;
  };
  workspace?: {
    id: string;
    name: string;
    color?: string | null;
  };
  task?: {
    id: string;
    title: string;
  };
}

export interface OptimizedNotification extends NotificationData {
  // Add computed fields for better performance
  isRecent: boolean;
  isUrgent: boolean;
  formattedTime: string;
  groupKey: string;
}

interface UseNotificationsOptions {
  workspaceId: string;
  refetchInterval?: number;
  staleTime?: number;
  cacheTime?: number;
}

export const useNotifications = (
  workspaceId: string, 
  options?: { 
    enabled?: boolean; 
    refetchInterval?: number; 
  }
) => {
  return useQuery({
    queryKey: ["notifications", workspaceId],
    queryFn: async (): Promise<NotificationData[]> => {
      const response = await fetch(`/api/notifications?workspaceId=${workspaceId}`);
      if (!response.ok) {
        throw new Error("Failed to fetch notifications");
      }
      return response.json();
    },
    enabled: options?.enabled !== false && Boolean(workspaceId), // Don't fetch if disabled or no workspace
    refetchInterval: options?.refetchInterval ?? 15000, // Default to 15 seconds, but allow customization
    refetchIntervalInBackground: true, // Continue polling when tab is not active
    staleTime: 0, // Always consider data stale to ensure fresh notifications
  });
};


/**
 * Hook that conditionally fetches notifications based on whether they're needed
 * Used to optimize performance by only fetching full notifications when required
 */
export const useLazyNotifications = (
  workspaceId: string, 
  options?: { 
    enabled?: boolean;
    refetchInterval?: number;
  }
) => {
  return useQuery({
    queryKey: ["notifications", workspaceId],
    queryFn: async (): Promise<NotificationData[]> => {
      const response = await fetch(`/api/notifications?workspaceId=${workspaceId}`);
      if (!response.ok) {
        throw new Error("Failed to fetch notifications");
      }
      return response.json();
    },
    enabled: options?.enabled !== false && Boolean(workspaceId),
    refetchInterval: options?.enabled ? (options?.refetchInterval ?? 30000) : false, // Only poll when enabled
    refetchIntervalInBackground: false, // Don't poll in background when not needed
    staleTime: 5000, // Consider data stale after 5 seconds when actively needed
    gcTime: 60000, // Keep in cache for 1 minute when not actively used
  });
};

export const useMarkNotificationAsRead = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (notificationId: string) => {
      const response = await fetch(`/api/notifications/${notificationId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ read: true }),
      });

      if (!response.ok) {
        throw new Error("Failed to mark notification as read");
      }

      return response.json();
    },
    onSuccess: (_, notificationId) => {
      // Update the notification in all relevant queries
      queryClient.setQueriesData(
        { queryKey: ["notifications"] },
        (oldData: NotificationData[] | undefined) => {
          if (!oldData) return oldData;
          
          return oldData.map(notification =>
            notification.id === notificationId
              ? { ...notification, read: true }
              : notification
          );
        }
      );
      
      // Invalidate unread count queries to get fresh counts
      queryClient.invalidateQueries({
        queryKey: ["notifications", undefined, "unread-count"]
      });
      
      // Also invalidate the notifications list to refresh the UI
      queryClient.invalidateQueries({
        queryKey: ["notifications"]
      });
    },
  });
};

export const useMarkAllNotificationsAsRead = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (workspaceId: string) => {
      const response = await fetch("/api/notifications/read-all", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ workspaceId }),
      });

      if (!response.ok) {
        throw new Error("Failed to mark all notifications as read");
      }

      return response.json();
    },
    onSuccess: (_, workspaceId) => {
      // Update all notifications for this workspace
      queryClient.setQueriesData(
        { queryKey: ["notifications", workspaceId] },
        (oldData: NotificationData[] | undefined) => {
          if (!oldData) return oldData;
          
          return oldData.map(notification => ({
            ...notification,
            read: true
          }));
        }
      );
      
      // Invalidate unread count queries to get fresh counts
      queryClient.invalidateQueries({
        queryKey: ["notifications", workspaceId, "unread-count"]
      });
      
      // Also invalidate the notifications list to refresh the UI
      queryClient.invalidateQueries({
        queryKey: ["notifications", workspaceId]
      });
    },
  });
};

export const useUnreadNotificationsCount = (workspaceId: string | null) => {
  return useQuery({
    queryKey: ["notifications", workspaceId, "unread-count"],
    queryFn: async (): Promise<number> => {
      if (!workspaceId) return 0;
      
      const response = await fetch(`/api/notifications/unread-count?workspaceId=${workspaceId}`);
      if (!response.ok) {
        throw new Error("Failed to fetch unread count");
      }
      const data = await response.json();
      return data.count;
    },
    enabled: !!workspaceId,
    refetchInterval: 10000, // Poll every 10 seconds for more responsive updates
    refetchIntervalInBackground: true, // Continue polling when tab is not active
    staleTime: 0, // Always consider data stale to ensure fresh counts
  });
};

/**
 * Optimized useNotifications hook with performance enhancements, grouping, and additional features
 */
export function useOptimizedNotifications({
  workspaceId,
  refetchInterval = 30000,
  staleTime = 10000,
  cacheTime = 5 * 60 * 1000, // 5 minutes
}: UseNotificationsOptions) {
  const queryClient = useQueryClient();

  // Fetch notifications with optimized caching
  const {
    data: notifications = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['notifications', workspaceId],
    queryFn: async () => {
      const response = await fetch(`/api/notifications?workspaceId=${workspaceId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch notifications');
      }
      return response.json();
    },
    refetchInterval,
    staleTime,
    gcTime: cacheTime,
    // Optimize refetch behavior
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });

  // Memoized computed notifications with optimized fields
  const optimizedNotifications = useMemo(() => {
    return notifications.map((notification: NotificationData): OptimizedNotification => {
      const createdAt = new Date(notification.createdAt);
      const now = new Date();
      const timeDiff = now.getTime() - createdAt.getTime();
      
      return {
        ...notification,
        isRecent: timeDiff < 5 * 60 * 1000, // Less than 5 minutes
        isUrgent: notification.type?.includes('URGENT') || notification.type?.includes('DEADLINE'),
        formattedTime: formatRelativeTime(createdAt),
        groupKey: getGroupKey(notification),
      };
    });
  }, [notifications]);

  // Memoized unread count
  const unreadCount = useMemo(() => {
    return optimizedNotifications.filter((n: OptimizedNotification) => !n.read).length;
  }, [optimizedNotifications]);

  // Memoized grouped notifications
  const groupedNotifications = useMemo(() => {
    const grouped: Record<string, OptimizedNotification[]> = {};
    
    optimizedNotifications.forEach((notification: OptimizedNotification) => {
      const groupKey = notification.groupKey;
      if (!grouped[groupKey]) {
        grouped[groupKey] = [];
      }
      grouped[groupKey].push(notification);
    });
    
    return grouped;
  }, [optimizedNotifications]);

  // Optimized mark as read function with optimistic updates
  const markAsRead = useCallback(async (notificationId: string) => {
    // Optimistic update
    queryClient.setQueryData(['notifications', workspaceId], (old: NotificationData[] | undefined) => {
      if (!old) return old;
      return old.map(n => 
        n.id === notificationId ? { ...n, read: true } : n
      );
    });

    try {
      await fetch(`/api/notifications/${notificationId}/mark-read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      // Revert optimistic update on error
      queryClient.invalidateQueries({ queryKey: ['notifications', workspaceId] });
      throw error;
    }
  }, [workspaceId, queryClient]);

  // Optimized mark all as read function
  const markAllAsRead = useCallback(async () => {
    
    // Optimistic update
    queryClient.setQueryData(['notifications', workspaceId], (old: NotificationData[] | undefined) => {
      if (!old) return old;
      return old.map(n => ({ ...n, read: true }));
    });

    try {
      await fetch(`/api/notifications/mark-all-read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId }),
      });
    } catch (error) {
      // Revert optimistic update on error
      queryClient.invalidateQueries({ queryKey: ['notifications', workspaceId] });
      throw error;
    }
  }, [workspaceId, queryClient]);

  // Memoized filters for better performance
  const filters = useMemo(() => ({
    unread: optimizedNotifications.filter((n: OptimizedNotification) => !n.read),
    recent: optimizedNotifications.filter((n: OptimizedNotification) => n.isRecent),
    urgent: optimizedNotifications.filter((n: OptimizedNotification) => n.isUrgent),
    byType: (type: string) => optimizedNotifications.filter((n: OptimizedNotification) => n.type?.includes(type)),
  }), [optimizedNotifications]);

  return {
    notifications: optimizedNotifications,
    unreadCount,
    groupedNotifications,
    filters,
    isLoading,
    error,
    refetch,
    markAsRead,
    markAllAsRead,
  };
}

// Utility functions
function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (diffInSeconds < 60) return 'just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
  
  return date.toLocaleDateString();
}

function getGroupKey(notification: NotificationData): string {
  const date = new Date(notification.createdAt);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  
  if (date.toDateString() === today.toDateString()) {
    return 'Today';
  } else if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  } else {
    return date.toLocaleDateString();
  }
}