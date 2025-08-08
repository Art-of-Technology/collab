"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

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
    email?: string;
    useCustomAvatar?: boolean;
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

// Public API types are kept minimal. Computed/UI fields belong to components.

// Centralised network request helper
export const fetchNotifications = async (
  workspaceId: string
): Promise<NotificationData[]> => {
  const response = await fetch(`/api/notifications?workspaceId=${workspaceId}`);
  if (!response.ok) {
    throw new Error("Failed to fetch notifications");
  }
  return response.json();
};

/**
 * Generic list hook – single source of truth for fetching notifications.
 * Components control polling behaviour through the options argument.
 */
export const useNotificationsList = (
  workspaceId: string,
  options?: {
    enabled?: boolean;
    refetchInterval?: number;
    staleTime?: number;
    cacheTime?: number;
  }
) => {
  return useQuery({
    queryKey: ["notifications", workspaceId],
    queryFn: () => fetchNotifications(workspaceId),
    enabled: options?.enabled !== false && Boolean(workspaceId),
    refetchInterval: options?.refetchInterval ?? 30000,
    refetchIntervalInBackground: true,
    staleTime: options?.staleTime ?? 0,
    gcTime: options?.cacheTime,
  });
};

/**
 * Backwards-compatibility: the old `useNotifications` hook now delegates to the new
 * `useNotificationsList` implementation to avoid breaking other imports that might exist.
 */
export const useNotifications = useNotificationsList;

// Deprecated APIs were removed after migration to avoid duplication.

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
        predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'notifications' && q.queryKey[2] === 'unread-count'
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
          if (!oldData) return [];
          
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
// No additional utilities exported from here; keep hooks focused on data concerns.