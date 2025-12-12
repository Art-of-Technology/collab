import type { Notification as MentionNotification } from "@/context/MentionContext";

export interface NotificationUrlContext {
  workspaceSegment?: string;
}

type NotificationRouteResolver = (
  notification: MentionNotification,
  normalizedType: string,
  workspaceSegment: string
) => string | undefined;

const POST_NOTIFICATION_TYPES = new Set([
  "post_mention",
  "post_comment",
  "post_reaction",
  "comment_mention",
  "comment_reply",
  "comment_reaction",
]);

const TASK_COMMENT_NOTIFICATION_TYPES = new Set(["taskcomment_mention"]);

const TASK_NOTIFICATION_TYPES = new Set([
  "task_mention",
  "task_assigned",
  "task_status_change",
]);

const FEATURE_NOTIFICATION_TYPES = new Set([
  "feature_mention",
  "feature_comment",
  "feature_vote",
]);

const EPIC_NOTIFICATION_TYPES = new Set(["epic_mention"]);

const STORY_NOTIFICATION_TYPES = new Set(["story_mention"]);

const MILESTONE_NOTIFICATION_TYPES = new Set(["milestone_mention"]);

export const extractNotificationIssueId = (
  notification: MentionNotification
): string | undefined => {
  if (!notification) {
    return undefined;
  }

  if (notification.issueId) {
    return notification.issueId;
  }

  if (notification.issue?.id) {
    return notification.issue.id;
  }

  const normalizedType = normalizeNotificationType(notification.type);

  if (normalizedType.includes("issue")) {
    if (notification.issueId) {
      return notification.issueId;
    }

    if (notification.task?.id) {
      return notification.task.id;
    }
  }

  const contentMatch = (notification.content ?? "").match(/#\[[^\]]+\]\(([^)]+)\)/);
  return contentMatch ? contentMatch[1] : undefined;
};

const resolvePostNotification: NotificationRouteResolver = (
  notification,
  normalizedType,
  workspaceSegment
) => {
  if (!POST_NOTIFICATION_TYPES.has(normalizedType)) {
    return undefined;
  }

  const path = notification.postId ? `posts/${notification.postId}` : "timeline";
  return buildWorkspaceUrl(workspaceSegment, path);
};

const resolveTaskCommentNotification: NotificationRouteResolver = (
  notification,
  normalizedType,
  workspaceSegment
) => {
  if (!TASK_COMMENT_NOTIFICATION_TYPES.has(normalizedType)) {
    return undefined;
  }

  const taskId = notification.issueId || notification.task?.id;
  const path = taskId ? `tasks/${taskId}` : "tasks";
  return buildWorkspaceUrl(workspaceSegment, path);
};

const resolveTaskNotification: NotificationRouteResolver = (
  notification,
  normalizedType,
  workspaceSegment
) => {
  if (!TASK_NOTIFICATION_TYPES.has(normalizedType)) {
    return undefined;
  }

  const taskId = notification.issueId || notification.task?.id;
  const path = taskId ? `tasks/${taskId}` : "tasks";
  return buildWorkspaceUrl(workspaceSegment, path);
};

const resolveFeatureNotification: NotificationRouteResolver = (
  notification,
  normalizedType,
  workspaceSegment
) => {
  if (!FEATURE_NOTIFICATION_TYPES.has(normalizedType)) {
    return undefined;
  }

  const path = notification.featureRequestId
    ? `features/${notification.featureRequestId}`
    : "features";
  return buildWorkspaceUrl(workspaceSegment, path);
};

const resolveEpicNotification: NotificationRouteResolver = (
  notification,
  normalizedType,
  workspaceSegment
) => {
  if (!EPIC_NOTIFICATION_TYPES.has(normalizedType)) {
    return undefined;
  }

  const path = notification.epicId
    ? `epics/${notification.epicId}`
    : "tasks";
  return buildWorkspaceUrl(workspaceSegment, path);
};

const resolveStoryNotification: NotificationRouteResolver = (
  notification,
  normalizedType,
  workspaceSegment
) => {
  if (!STORY_NOTIFICATION_TYPES.has(normalizedType)) {
    return undefined;
  }

  const path = notification.storyId
    ? `stories/${notification.storyId}`
    : "tasks";
  return buildWorkspaceUrl(workspaceSegment, path);
};

const resolveMilestoneNotification: NotificationRouteResolver = (
  notification,
  normalizedType,
  workspaceSegment
) => {
  if (!MILESTONE_NOTIFICATION_TYPES.has(normalizedType)) {
    return undefined;
  }

  const path = notification.milestoneId
    ? `milestones/${notification.milestoneId}`
    : "tasks";
  return buildWorkspaceUrl(workspaceSegment, path);
};

const ROUTE_RESOLVERS: NotificationRouteResolver[] = [
  resolvePostNotification,
  resolveTaskCommentNotification,
  resolveTaskNotification,
  resolveFeatureNotification,
  resolveEpicNotification,
  resolveStoryNotification,
  resolveMilestoneNotification,
];

export class NotificationUrlResolver {
  static resolve(
    notification: MentionNotification,
    context: NotificationUrlContext
  ): string {
    const workspaceSegment = context.workspaceSegment;

    if (!workspaceSegment) {
      return "/welcome";
    }

    const normalizedType = normalizeNotificationType(notification?.type);

    const issueId = extractNotificationIssueId(notification);
    if (issueId) {
      return buildWorkspaceUrl(workspaceSegment, `issues/${issueId}`);
    }

    const viewUrl = resolveViewUrl(notification, workspaceSegment);
    if (viewUrl) {
      return viewUrl;
    }

    for (const resolver of ROUTE_RESOLVERS) {
      const resolved = resolver(notification, normalizedType, workspaceSegment);
      if (resolved) {
        return resolved;
      }
    }

    return buildWorkspaceUrl(workspaceSegment, "timeline");
  }
}

function normalizeNotificationType(type: MentionNotification["type"]): string {
  return typeof type === "string" ? type.toLowerCase() : "";
}

function resolveViewUrl(
  notification: MentionNotification,
  workspaceSegment: string
): string | undefined {
  const targetView = notification.view?.slug || notification.viewId || notification.view?.id;
  if (!targetView) {
    return undefined;
  }

  return buildWorkspaceUrl(workspaceSegment, `views/${targetView}`);
}

function buildWorkspaceUrl(workspaceSegment: string, path: string): string {
  return `/${workspaceSegment}/${path}`;
}
