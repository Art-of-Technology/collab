"use client";

import { useLazyNotifications, useMarkAllNotificationsAsRead, useMarkNotificationAsRead, useUnreadNotificationsCount } from '@/hooks/queries/useNotifications';
import axios from 'axios';
import { useSession } from 'next-auth/react';
import React, { createContext, useCallback, useContext, useState } from 'react';
import { useWorkspace } from './WorkspaceContext';

interface User {
  id: string;
  name: string | null;
  image: string | null;
}

interface Notification {
  id: string;
  type: string;
  content: string;
  read: boolean;
  createdAt: string;
  senderId?: string;
  taskId?: string;
  postId?: string;
  workspaceId?: string;
  taskCommentId?: string;
  sender?: {
    id: string;
    name: string | null;
    image?: string | null;
    email?: string;
    useCustomAvatar?: boolean;
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

interface MentionContextType {
  searchUsers: (query: string) => Promise<User[]>;
  notifications: Notification[];
  unreadCount: number;
  markNotificationAsRead: (id: string) => Promise<void>;
  markAllNotificationsAsRead: () => Promise<void>;
  loading: boolean;
  refetchNotifications: () => Promise<void>;
  enableNotificationsFetching: () => void;
  disableNotificationsFetching: () => void;
}

const MentionContext = createContext<MentionContextType | undefined>(undefined);

export function MentionProvider({ children }: { children: React.ReactNode }) {
  useSession();
  const { currentWorkspace } = useWorkspace();

  // State to control when to fetch full notifications
  const [fetchNotifications, setFetchNotifications] = useState(false);

  // Only fetch unread count regularly (every 10 seconds)
  const { data: unreadCount = 0 } = useUnreadNotificationsCount(currentWorkspace?.id || null);
  
  // Conditionally fetch full notifications only when needed (e.g., popover is open)
  const { data: notifications = [], isLoading: loading, refetch } = useLazyNotifications(
    currentWorkspace?.id || '', 
    {
      enabled: fetchNotifications,
      refetchInterval: 10000 // Fast polling when actively viewing notifications
    }
  );
  
  // Use mutation hooks for marking notifications as read
  const markAsReadMutation = useMarkNotificationAsRead();
  const markAllAsReadMutation = useMarkAllNotificationsAsRead();

  // Function to search users for mentions
  const searchUsers = useCallback(async (query: string): Promise<User[]> => {
    if (!query || query.length < 1) return [];

    try {
      const response = await axios.get(`/api/users/search?q=${encodeURIComponent(query)}`);
      return response.data;
    } catch (error) {
      console.error('Error searching users:', error);
      return [];
    }
  }, []);

  // Function to mark a notification as read using mutation hook
  const markNotificationAsRead = useCallback(async (id: string) => {
    try {
      await markAsReadMutation.mutateAsync(id);
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  }, [markAsReadMutation]);

  // Function to mark all notifications as read using mutation hook
  const markAllNotificationsAsRead = useCallback(async () => {
    try {
      if (currentWorkspace?.id) {
        await markAllAsReadMutation.mutateAsync(currentWorkspace.id);
      }
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  }, [markAllAsReadMutation, currentWorkspace?.id]);

  // Function to enable notifications fetching (when popover opens)
  const enableNotificationsFetching = useCallback(() => {
    setFetchNotifications(true);
  }, []);

  // Function to disable notifications fetching (when popover closes)
  const disableNotificationsFetching = useCallback(() => {
    setFetchNotifications(false);
  }, []);

  // Function to manually refetch notifications
  const refetchNotifications = useCallback(async () => {
    if (fetchNotifications && refetch) {
      await refetch();
    } else {
      // If notifications aren't being fetched, enable them temporarily to get fresh data
      setFetchNotifications(true);
      setTimeout(() => refetch?.(), 100);
    }
  }, [fetchNotifications, refetch]);

  return (
    <MentionContext.Provider
      value={{
        searchUsers,
        notifications,
        unreadCount,
        markNotificationAsRead,
        markAllNotificationsAsRead,
        loading,
        refetchNotifications,
        enableNotificationsFetching,
        disableNotificationsFetching
      }}
    >
      {children}
    </MentionContext.Provider>
  );
}

export const useMention = () => {
  const context = useContext(MentionContext);
  if (context === undefined) {
    throw new Error('useMention must be used within a MentionProvider');
  }
  return context;
}; 