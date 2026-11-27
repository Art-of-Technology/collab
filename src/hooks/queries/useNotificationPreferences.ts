import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { IssueNotificationChoices, IssueNotificationView } from "@/components/profile/issueNotificationSummary";

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

// Issue notifications (Slack first). The view type lives beside the settings component so this
// client module never imports the server library.

export type IssueNotificationUpdate = Partial<IssueNotificationChoices> & { slackOn?: boolean };
export type SlackTestResult = { result: "ok" | "gone" | "failed" | "no_address"; settings: IssueNotificationView };

/** A refused call keeps the HTTP status and the server's error code, so the page can say which refusal it was. */
export class IssueNotificationRequestError extends Error {
  status: number;
  code?: string;
  constructor(status: number, code?: string, message?: string) {
    super(message || code || `Request failed with status ${status}`);
    this.name = "IssueNotificationRequestError";
    this.status = status;
    this.code = code;
  }
}

const ISSUES_URL = "/api/user/notification-preferences/issues";
const SLACK_URL = `${ISSUES_URL}/slack`;
const issueNotificationKeys = {
  user: (workspaceId?: string) => [...notificationPreferencesKeys.all, "issues", workspaceId] as const,
};

async function issueRequest<T>(url: string, method: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
  const answer = await response.json().catch(() => null);
  if (!response.ok) throw new IssueNotificationRequestError(response.status, answer?.error, answer?.message);
  return answer as T;
}

export function useIssueNotificationSettings(workspaceId?: string) {
  return useQuery<IssueNotificationView>({
    queryKey: issueNotificationKeys.user(workspaceId),
    queryFn: () => issueRequest<IssueNotificationView>(ISSUES_URL, "GET"),
    enabled: workspaceId !== undefined,
  });
}

function useIssueNotificationMutation<TBody, TAnswer>(
  workspaceId: string | undefined,
  send: (body: TBody) => Promise<TAnswer>,
  viewOf: (answer: TAnswer) => IssueNotificationView,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: send,
    onSuccess: (answer) => {
      queryClient.setQueryData(issueNotificationKeys.user(workspaceId), viewOf(answer));
    },
  });
}

export function useUpdateIssueNotificationSettings(workspaceId?: string) {
  return useIssueNotificationMutation(
    workspaceId,
    (body: IssueNotificationUpdate) => issueRequest<IssueNotificationView>(ISSUES_URL, "PATCH", body),
    (view) => view,
  );
}

export function useSaveSlackAddress(workspaceId?: string) {
  return useIssueNotificationMutation(
    workspaceId,
    (body: { url: string }) => issueRequest<IssueNotificationView>(SLACK_URL, "PUT", body),
    (view) => view,
  );
}

export function useRemoveSlackAddress(workspaceId?: string) {
  return useIssueNotificationMutation(
    workspaceId,
    (_: void) => issueRequest<IssueNotificationView>(SLACK_URL, "DELETE"),
    (view) => view,
  );
}

export function useSendSlackTest(workspaceId?: string) {
  return useIssueNotificationMutation(
    workspaceId,
    (_: void) => issueRequest<SlackTestResult>(SLACK_URL, "POST"),
    (answer) => answer.settings,
  );
}
