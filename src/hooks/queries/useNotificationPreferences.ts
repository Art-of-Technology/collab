import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export interface NotificationPreferences {
  id: string;
  userId: string;
  taskStatusChanged: boolean;
  taskCommentAdded: boolean;
  taskAssigned: boolean;
  taskUpdated: boolean;
  taskPriorityChanged: boolean;
  taskDueDateChanged: boolean;
  taskDeleted: boolean;
  postCommentAdded: boolean;
  postBlockerCreated: boolean;
  postResolved: boolean;
  boardTaskCreated: boolean;
  boardTaskStatusChanged: boolean;
  boardTaskAssigned: boolean;
  boardTaskCompleted: boolean;
  boardTaskDeleted: boolean;
  emailNotificationsEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export type NotificationPreferenceUpdate = Partial<Omit<NotificationPreferences, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>;

const notificationPreferencesKeys = {
  all: ['notificationPreferences'] as const,
  user: () => [...notificationPreferencesKeys.all, 'user'] as const,
};

export function useNotificationPreferences() {
  return useQuery<NotificationPreferences>({
    queryKey: notificationPreferencesKeys.user(),
    queryFn: async () => {
      const response = await fetch('/api/user/notification-preferences');
      if (!response.ok) {
        throw new Error('Failed to get notification preferences');
      }
      return response.json();
    },
  });
}

export function useUpdateNotificationPreferences() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (preferences: NotificationPreferenceUpdate) => {
      const response = await fetch('/api/user/notification-preferences', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(preferences),
      });
      if (!response.ok) {
        throw new Error('Failed to update notification preferences');
      }
      return response.json();
    },
    onSuccess: (data) => {
      // Update the cached data
      queryClient.setQueryData(notificationPreferencesKeys.user(), data);
    },
  });
}

export function useResetNotificationPreferences() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/user/notification-preferences', {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error('Failed to reset notification preferences');
      }
      return response.json();
    },
    onSuccess: (data) => {
      // Update the cached data
      queryClient.setQueryData(notificationPreferencesKeys.user(), data);
    },
  });
}