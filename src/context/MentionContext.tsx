"use client";

import React, { createContext, useState, useContext, useCallback, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import axios from 'axios';

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
  senderId: string;
  sender: {
    id: string;
    name: string | null;
    image: string | null;
    useCustomAvatar: boolean;
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
}

const MentionContext = createContext<MentionContextType | undefined>(undefined);

export function MentionProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);

  // Calculate unread notifications count
  const unreadCount = notifications.filter(n => !n.read).length;

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

  // Function to fetch notifications
  const fetchNotifications = useCallback(async () => {
    if (!session?.user?.id) return;

    setLoading(true);
    try {
      const response = await axios.get('/api/notifications');
      setNotifications(response.data);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id]);

  // Function to mark a notification as read
  const markNotificationAsRead = useCallback(async (id: string) => {
    try {
      await axios.patch(`/api/notifications/${id}`, { read: true });
      setNotifications(prev => 
        prev.map(notification => 
          notification.id === id 
            ? { ...notification, read: true } 
            : notification
        )
      );
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  }, []);

  // Function to mark all notifications as read
  const markAllNotificationsAsRead = useCallback(async () => {
    try {
      await axios.post('/api/notifications/read-all');
      setNotifications(prev => 
        prev.map(notification => ({ ...notification, read: true }))
      );
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  }, []);

  // Fetch notifications on mount and when session changes
  useEffect(() => {
    if (session?.user) {
      fetchNotifications();
    }
  }, [session, fetchNotifications]);

  return (
    <MentionContext.Provider
      value={{
        searchUsers,
        notifications,
        unreadCount,
        markNotificationAsRead,
        markAllNotificationsAsRead,
        loading,
        refetchNotifications: fetchNotifications
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