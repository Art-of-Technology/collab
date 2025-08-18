"use client";

import { Notification } from "@/context/MentionContext";
import { BellOff, Loader2 } from "lucide-react";
import React from "react";
import VirtualNotificationsList from "./VirtualNotificationsList";

interface NotificationsListProps {
  notifications: Notification[];
  groupBy: "date" | "user" | "taskboard";
  isLoading: boolean;
  searchQuery: string;
  selectedNotifications: Set<string>;
  onSelectionChange: (selected: Set<string>) => void;
  onSelectAll: () => void;
  onMarkAsRead: (notificationId: string) => Promise<void>;
  onMarkAllRead?: () => Promise<void>;
  unreadCount?: number;
}

export default function NotificationsList({
  notifications,
  groupBy,
  isLoading,
  searchQuery,
  selectedNotifications,
  onSelectionChange,
  onSelectAll,
  onMarkAsRead,
  onMarkAllRead,
  unreadCount,
}: NotificationsListProps) {

  const handleNotificationClick = (notification: Notification, e: React.MouseEvent) => {
    // Prevent click if clicking on checkbox
    if ((e.target as HTMLElement).closest('[data-checkbox]')) {
      return;
    }

    // Mark as read if not already read
    if (!notification.read) {
      onMarkAsRead(notification.id).catch((error) => {
        console.error('Failed to mark notification as read:', error);
      });
    }

    // Handle navigation based on notification type
    // This would typically navigate to the relevant page
    console.log('Navigating to notification:', notification);
  };

  // Show loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  // Show empty state
  if (notifications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <BellOff className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium text-muted-foreground mb-2">
          No notifications
        </h3>
        <p className="text-sm text-muted-foreground">
          {searchQuery ? 'No notifications match your search.' : 'You\'re all caught up!'}
        </p>
      </div>
    );
  }

  // Use virtual scrolling for better performance
  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 min-h-0">
        <VirtualNotificationsList
          notifications={notifications}
          groupBy={groupBy}
          selectedNotifications={selectedNotifications}
          onSelectionChange={onSelectionChange}
          onNotificationClick={handleNotificationClick}
          onSelectAll={onSelectAll}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}