import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface NotificationPreferences {
  id: string;
  userId: string;
  workspaceId?: string;
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
  leaveRequestStatusChanged: boolean;
  leaveRequestEdited: boolean;
  leaveRequestManagerAlert: boolean;
  leaveRequestHRAlert: boolean;
  emailNotificationsEnabled: boolean;
  pushNotificationsEnabled: boolean;
  pushSubscription: any | null;
  createdAt: string;
  updatedAt: string;
}

export type NotificationPreferenceUpdate = Partial<
  Omit<NotificationPreferences, "id" | "userId" | "createdAt" | "updatedAt">
>;

const notificationPreferencesKeys = {
  all: ["notificationPreferences"] as const,
  user: (workspaceId?: string) => [...notificationPreferencesKeys.all, "user", workspaceId] as const,
};

export function useNotificationPreferences(workspaceId?: string) {
  return useQuery<NotificationPreferences>({
    queryKey: notificationPreferencesKeys.user(workspaceId),
    queryFn: async () => {
      const response = await fetch("/api/user/notification-preferences");
      if (!response.ok) {
        throw new Error("Failed to get notification preferences");
      }
      return response.json();
    },
    enabled: workspaceId !== undefined,
  });
}

export function useUpdateNotificationPreferences(workspaceId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (preferences: NotificationPreferenceUpdate) => {
      const response = await fetch("/api/user/notification-preferences", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(preferences),
      });
      if (!response.ok) {
        throw new Error("Failed to update notification preferences");
      }
      return response.json();
    },
    onSuccess: (data) => {
      // Update the cached data
      queryClient.setQueryData(notificationPreferencesKeys.user(workspaceId), data);
    },
  });
}

export function useResetNotificationPreferences(workspaceId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/user/notification-preferences", {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error("Failed to reset notification preferences");
      }
      return response.json();
    },
    onSuccess: (data) => {
      // Update the cached data
      queryClient.setQueryData(notificationPreferencesKeys.user(workspaceId), data);
    },
  });
}
