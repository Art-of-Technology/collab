import { prisma } from "@/lib/prisma";
import {
  sendPushNotification,
  PushNotificationPayload,
} from "@/lib/push-notifications";
import { WorkspaceRole } from "@/lib/permissions";
import { format } from "date-fns";
import { logger } from "@/lib/logger";
import { sanitizeHtmlToPlainText } from "@/lib/html-sanitizer";

export interface TaskFollowerNotificationOptions {
  taskId: string;
  senderId: string;
  type: NotificationType;
  content: string;
  excludeUserIds?: string[];
  skipTaskIdReference?: boolean; // Add this to skip setting taskId for deletion notifications
}

export interface PostFollowerNotificationOptions {
  postId: string;
  senderId: string;
  type: NotificationType;
  content: string;
  excludeUserIds?: string[];
}

export interface BoardFollowerNotificationOptions {
  boardId: string;
  taskId: string;
  senderId: string;
  type: NotificationType;
  content: string;
  excludeUserIds?: string[];
  skipTaskIdReference?: boolean; // Add this to skip setting taskId for deletion notifications
}

export interface LeaveRequestNotificationData {
  id: string;
  userId: string;
  policyId: string;
  startDate: Date;
  endDate: Date;
  duration: string;
  notes: string;
  status: string;
  user: {
    id: string;
    name: string | null;
    email: string | null;
    image?: string | null;
  };
  policy: {
    name: string;
    workspaceId: string;
  };
}

// Removed unused LeaveRequestActionContext

export enum NotificationType {
  ISSUE_MENTION = "ISSUE_MENTION",
  // Task-centric types (legacy compatibility)
  TASK_CREATED = "TASK_CREATED",
  TASK_STATUS_CHANGED = "TASK_STATUS_CHANGED",
  TASK_ASSIGNED = "TASK_ASSIGNED",
  TASK_COMMENT_ADDED = "TASK_COMMENT_ADDED",
  TASK_UPDATED = "TASK_UPDATED",
  TASK_DELETED = "TASK_DELETED",
  // Board-level task notifications
  BOARD_TASK_CREATED = "BOARD_TASK_CREATED",
  BOARD_TASK_STATUS_CHANGED = "BOARD_TASK_STATUS_CHANGED",
  BOARD_TASK_COMPLETED = "BOARD_TASK_COMPLETED",
  BOARD_TASK_DELETED = "BOARD_TASK_DELETED",
  ISSUE_CREATED = "ISSUE_CREATED",
  ISSUE_UPDATED = "ISSUE_UPDATED",
  ISSUE_DELETED = "ISSUE_DELETED",
  PROJECT_ISSUE_CREATED = "PROJECT_ISSUE_CREATED",
  PROJECT_ISSUE_UPDATED = "PROJECT_ISSUE_UPDATED",
  PROJECT_ISSUE_DELETED = "PROJECT_ISSUE_DELETED",
  POST_COMMENT_ADDED = "POST_COMMENT_ADDED",
  POST_BLOCKER_CREATED = "POST_BLOCKER_CREATED",
  POST_RESOLVED = "POST_RESOLVED",
  LEAVE_REQUEST_STATUS_CHANGED = "LEAVE_REQUEST_STATUS_CHANGED",
  LEAVE_REQUEST_EDITED = "LEAVE_REQUEST_EDITED",
  LEAVE_REQUEST_MANAGER_ALERT = "LEAVE_REQUEST_MANAGER_ALERT",
  LEAVE_REQUEST_HR_ALERT = "LEAVE_REQUEST_HR_ALERT",
}

export class NotificationService {
  /**
   * Bounce helper: returns true if the user's last notification content is the same.
   * This prevents duplicate rapid-fire notifications with identical content.
   */
  private static async shouldBounceNotification(
    userId: string,
    content: string
  ): Promise<boolean> {
    try {
      const last = await prisma.notification.findFirst({
        where: { userId },
        orderBy: { createdAt: "desc" },
        select: { content: true },
      });
      return !!last && last.content === content;
    } catch (error) {
      logger.error("Bounce check failed; proceeding without bounce", error, {
        userId,
      });
      return false;
    }
  }

  /**
   * Create notifications for a specific list of users, optionally filtering by preferences.
   * Returns the number of notifications created. Also sends push notifications when
   * postId or issueId are provided (used for URL generation).
   */
  static async notifyUsers(
    userIds: string[],
    type: NotificationType | string,
    content: string,
    senderId: string,
    options: {
      filterPreferences?: boolean;
      // Relation fields on Notification model
      postId?: string;
      commentId?: string;
      taskId?: string;
      taskCommentId?: string;
      featureRequestId?: string;
      epicId?: string;
      storyId?: string;
      milestoneId?: string;
      leaveRequestId?: string;
      // Non-persistent helper fields
      issueId?: string;
    } = {}
  ): Promise<number> {
    if (!userIds || userIds.length === 0) return 0;

    const {
      filterPreferences = false,
      postId,
      commentId,
      taskId,
      taskCommentId,
      featureRequestId,
      epicId,
      storyId,
      milestoneId,
      leaveRequestId,
      issueId,
    } = options;

    try {
      // Build base notification rows with allowed relation fields only
      const baseData = {
        type: typeof type === 'string' ? type : String(type),
        content,
        senderId,
        read: false,
        ...(postId ? { postId } : {}),
        ...(commentId ? { commentId } : {}),
        ...(taskId ? { taskId } : {}),
        ...(taskCommentId ? { taskCommentId } : {}),
        ...(featureRequestId ? { featureRequestId } : {}),
        ...(epicId ? { epicId } : {}),
        ...(storyId ? { storyId } : {}),
        ...(milestoneId ? { milestoneId } : {}),
        ...(leaveRequestId ? { leaveRequestId } : {}),
      } as any;

      let recipientIds = [...new Set(userIds)];

      if (filterPreferences) {
        const filtered: string[] = [];
        for (const userId of recipientIds) {
          const preferences = await this.getUserPreferences(userId);
          // For string types not in enum mapping, shouldNotifyUser defaults to true
          const shouldNotify = this.shouldNotifyUser(
            preferences as any,
            (type as unknown) as NotificationType
          );
          if (shouldNotify) filtered.push(userId);
        }
        recipientIds = filtered;
      }

      if (recipientIds.length === 0) return 0;

      // Bounce filter: skip users whose last notification has identical content
      const bounceChecks = await Promise.all(
        recipientIds.map((uid) => this.shouldBounceNotification(uid, content))
      );
      const dedupedRecipientIds = recipientIds.filter((_, idx) => !bounceChecks[idx]);
        recipientIds.map((uid) => NotificationService.shouldBounceNotification(uid, content))
      if (dedupedRecipientIds.length === 0) return 0;

      const data = dedupedRecipientIds.map((userId) => ({
        ...baseData,
        userId,
      }));

      const result = await prisma.notification.createMany({ data });

      // Push notifications (best-effort)
      if (issueId || postId) {
        const pushPromises = dedupedRecipientIds.map((userId) =>
          this.sendPushNotificationForUser(
            userId,
            (type as unknown) as NotificationType,
            content,
            issueId,
            postId
          )
        );
        await Promise.allSettled(pushPromises);
      }

      logger.info("Direct user notifications created", {
        count: result.count ?? dedupedRecipientIds.length,
        type,
      });

      return result.count ?? dedupedRecipientIds.length;
    } catch (error) {
      logger.error("Failed to notify users", error, { type });
      return 0;
    }
  }
  /**
   * Base method for creating notifications with followers
   * @param followerQuery - Prisma query to get followers
   * @param notificationType - Type of notification
   * @param content - Notification content
   * @param senderId - ID of the user sending the notification
   * @param excludeUserIds - User IDs to exclude from notifications
   * @param additionalData - Additional data to include in notification
   */
  private static async createFollowerNotifications<
    T extends { userId: string }
  >(
    followerQuery: Promise<T[]>,
    notificationType: NotificationType,
    content: string,
    senderId: string,
    excludeUserIds: string[] = [],
    additionalData: Record<string, any> = {}
  ): Promise<void> {
    try {
      const followers = await followerQuery;

      if (followers.length === 0) {
        return; // No followers to notify
      }

      // Filter followers based on their notification preferences
      const validNotifications = [];
      for (const follower of followers) {
        const preferences = await this.getUserPreferences(follower.userId);
        if (this.shouldNotifyUser(preferences, notificationType)) {
          // Bounce check: skip if last notification content matches
          const shouldBounce = await this.shouldBounceNotification(
            follower.userId,
            content
          const shouldBounce = await NotificationService.shouldBounceNotification(
          if (shouldBounce) continue;
          validNotifications.push({
            type: notificationType.toString(),
            content,
            userId: follower.userId,
            senderId,
            read: false,
            ...additionalData,
          });
        }
      }

      if (validNotifications.length > 0) {
        await prisma.notification.createMany({
          data: validNotifications,
        });

        // Send push notifications to users
        const pushPromises = validNotifications.map((notification) =>
          this.sendPushNotificationForUser(
            notification.userId,
            notificationType,
            notification.content,
            additionalData.issueId,
            additionalData.postId
          )
        );
        await Promise.allSettled(pushPromises);
      }

      logger.info("Follower notifications created", {
        count: validNotifications.length,
        type: notificationType,
        ...additionalData,
      });
    } catch (error) {
      logger.error("Failed to create follower notifications", error, {
        type: notificationType,
        ...additionalData,
      });
      throw error;
    }
  }

  /**
   * Helper method to send push notification to a user
   * @param userId - User ID to send notification to
   * @param notificationType - Type of notification
   * @param content - Notification content
   * @param taskId - Optional task ID for URL generation
   * @param postId - Optional post ID for URL generation
   */
  static async sendPushNotificationForUser(
    userId: string,
    notificationType: NotificationType,
    content: string,
    issueId?: string,
    postId?: string
  ): Promise<void> {
    try {
      // Build the URL based on notification type
      let url = "/";
      if (issueId) {
        url = `/issues/${issueId}`;
      } else if (postId) {
        url = `/posts/${postId}`;
      }

      const payload: PushNotificationPayload = {
        title: "Collab Notification",
        body: content,
        url,
        tag: notificationType,
        icon: "/icon-192x192.png",
        badge: "/icon-192x192.png",
        requireInteraction: false,
        actions: [
          {
            action: "view",
            title: "View",
          },
          {
            action: "dismiss",
            title: "Dismiss",
          },
        ],
      };

      await sendPushNotification(userId, payload);
    } catch (error) {
      logger.error("Failed to send push notification", error, {
        userId,
        notificationType,
      });
      // Don't throw - push notification failure shouldn't break the main flow
    }
  }

  // === ISSUE FOLLOWER METHODS ===

  /**
   * Add a user as a follower of an issue
   * @param issueId - Issue ID to follow
   * @param userId - User ID to add as follower
   */
  static async addIssueFollower(issueId: string, userId: string): Promise<void> {
    try {
      await prisma.issueFollower.upsert({
        where: {
          issueId_userId: {
            issueId,
            userId,
          },
        },
        update: {},
        create: {
          issueId,
          userId,
        },
      });
    } catch (error) {
      logger.error("Failed to add issue follower", error, { issueId, userId });
      throw error;
    }
  }

  /**
   * Remove a user as a follower of an issue
   * @param issueId - Issue ID to unfollow
   * @param userId - User ID to remove as follower
   */
  static async removeIssueFollower(issueId: string, userId: string): Promise<void> {
    try {
      await prisma.issueFollower.deleteMany({
        where: {
          issueId,
          userId,
        },
      });
    } catch (error) {
      logger.error("Failed to remove issue follower", error, { issueId, userId });
      throw error;
    }
  }

  // Removed unused: getIssueFollowers, isUserFollowingIssue, autoFollowIssue

  /**
   * Get user notification preferences or return defaults
   * @param userId - User ID to get preferences for
   * @returns User notification preferences
   */
  static async getUserPreferences(userId: string): Promise<any> {
    try {
      const preferences = await prisma.notificationPreferences.findUnique({
        where: { userId },
      });

      // Return default preferences if none exist
      if (!preferences) {
        return {
          taskCreated: true,
          taskStatusChanged: true,
          taskAssigned: true,
          taskCommentAdded: true,
          taskPriorityChanged: true,
          taskDueDateChanged: true,
          taskColumnMoved: false,
          taskUpdated: true,
          taskDeleted: true,
          taskMentioned: true,
          boardTaskCreated: true,
          boardTaskStatusChanged: true,
          boardTaskAssigned: false,
          boardTaskCompleted: true,
          boardTaskDeleted: true,
          postCommentAdded: true,
          postBlockerCreated: true,
          postResolved: true,
          emailNotificationsEnabled: true,
        };
      }

      return preferences;
    } catch (error) {
      logger.error("Failed to get user preferences", error, { userId });
      // Return defaults on error
      return {
        taskCreated: true,
        taskStatusChanged: true,
        taskAssigned: true,
        taskCommentAdded: true,
        taskPriorityChanged: true,
        taskDueDateChanged: true,
        taskColumnMoved: false,
        taskUpdated: true,
        taskDeleted: true,
        taskMentioned: true,
        boardTaskCreated: true,
        boardTaskStatusChanged: true,
        boardTaskAssigned: false,
        boardTaskCompleted: true,
        boardTaskDeleted: true,
        postCommentAdded: true,
        postUpdated: true,
        postResolved: true,
        emailNotificationsEnabled: true,
      };
    }
  }

  /**
   * Check if user should receive notification based on their preferences
   * @param preferences - User notification preferences
   * @param notificationType - Type of notification to check
   * @returns true if user should receive notification
   */
  static shouldNotifyUser(
    preferences: any,
    notificationType: NotificationType
  ): boolean {
    const typeToPreferenceMap: Partial<Record<NotificationType, keyof typeof preferences>> = {
      // Mentions
      [NotificationType.ISSUE_MENTION]: "taskMentioned",
      // Task-centric mappings
      [NotificationType.TASK_CREATED]: "taskCreated",
      [NotificationType.TASK_STATUS_CHANGED]: "taskStatusChanged",
      [NotificationType.TASK_ASSIGNED]: "taskAssigned",
      [NotificationType.TASK_COMMENT_ADDED]: "taskCommentAdded",
      [NotificationType.TASK_UPDATED]: "taskUpdated",
      [NotificationType.TASK_DELETED]: "taskDeleted",
      // Board/task at board-level
      [NotificationType.BOARD_TASK_CREATED]: "boardTaskCreated",
      [NotificationType.BOARD_TASK_STATUS_CHANGED]: "boardTaskStatusChanged",
      [NotificationType.BOARD_TASK_COMPLETED]: "boardTaskCompleted",
      [NotificationType.BOARD_TASK_DELETED]: "boardTaskDeleted",
      // Issue notifications mapped to legacy task preferences for now
      [NotificationType.ISSUE_CREATED]: "taskCreated",
      [NotificationType.ISSUE_UPDATED]: "taskUpdated",
      [NotificationType.ISSUE_DELETED]: "taskDeleted",
      // Project-level issue notifications map to board-level legacy prefs
      [NotificationType.PROJECT_ISSUE_CREATED]: "boardTaskCreated",
      [NotificationType.PROJECT_ISSUE_UPDATED]: "boardTaskStatusChanged",
      [NotificationType.PROJECT_ISSUE_DELETED]: "boardTaskDeleted",
      [NotificationType.POST_COMMENT_ADDED]: "postCommentAdded",
      [NotificationType.POST_BLOCKER_CREATED]: "postBlockerCreated",
      [NotificationType.POST_RESOLVED]: "postResolved",
      // Leave request notification mappings
      [NotificationType.LEAVE_REQUEST_STATUS_CHANGED]:
        "leaveRequestStatusChanged",
      [NotificationType.LEAVE_REQUEST_EDITED]: "leaveRequestEdited",
      [NotificationType.LEAVE_REQUEST_MANAGER_ALERT]:
        "leaveRequestManagerAlert",
      [NotificationType.LEAVE_REQUEST_HR_ALERT]: "leaveRequestHRAlert",
    };

    const preferenceKey = typeToPreferenceMap[notificationType];
    return preferenceKey ? preferences[preferenceKey] : true; // Default to true for unknown types
  }

  /**
   * Notify all followers of a task
   * @param options - Task follower notification options
   */
  static async notifyTaskFollowers(
    options: TaskFollowerNotificationOptions
  ): Promise<void> {
    const {
      taskId,
      senderId,
      type,
      content,
      excludeUserIds = [],
      skipTaskIdReference = false,
    } = options;

    const followerQuery = prisma.taskFollower.findMany({
      where: {
        taskId: taskId,
        userId: {
          notIn: [senderId, ...excludeUserIds],
        },
      },
      select: {
        userId: true,
      },
    });

    const additionalData = skipTaskIdReference ? {} : { taskId };

    await this.createFollowerNotifications(
      followerQuery,
      type,
      content,
      senderId,
      excludeUserIds,
      additionalData
    );
  }

  /**
   * Add a user as a follower of a task
   * @param taskId - Task ID to follow
   * @param userId - User ID to add as follower
   */
  static async addTaskFollower(taskId: string, userId: string): Promise<void> {
    try {
      await prisma.taskFollower.upsert({
        where: {
          taskId_userId: {
            taskId,
            userId,
          },
        },
        update: {}, // No updates needed if already exists
        create: {
          taskId,
          userId,
        },
      });
    } catch (error) {
      logger.error("Failed to add task follower", error, { taskId, userId });
      throw error;
    }
  }

  /**
   * Remove a user as a follower of a task
   * @param taskId - Task ID to unfollow
   * @param userId - User ID to remove as follower
   */
  static async removeTaskFollower(
    taskId: string,
    userId: string
  ): Promise<void> {
    try {
      await prisma.taskFollower.deleteMany({
        where: {
          taskId,
          userId,
        },
      });
    } catch (error) {
      logger.error("Failed to remove task follower", error, { taskId, userId });
      throw error;
    }
  }

  /**
   * Removed unused: getTaskFollowers
   */

  /**
   * Check if a user is following a task
   * @param taskId - Task ID to check
   * @param userId - User ID to check
   * @returns true if user is following the task
   */
  static async isUserFollowingTask(
    taskId: string,
    userId: string
  ): Promise<boolean> {
    try {
      const follower = await prisma.taskFollower.findUnique({
        where: {
          taskId_userId: {
            taskId,
            userId,
          },
        },
      });

      return !!follower;
    } catch (error) {
      logger.error("Failed to check if user is following task", error, {
        taskId,
        userId,
      });
      return false;
    }
  }

  /**
   * Automatically add multiple users as followers of a task
   * @param taskId - Task ID to follow
   * @param userIds - Array of user IDs to add as followers
   */
  static async autoFollowTask(
    taskId: string,
    userIds: string[]
  ): Promise<void> {
    try {
      const followData = userIds.map((userId) => ({
        taskId,
        userId,
      }));

      // Use createMany with skipDuplicates to avoid conflicts
      await prisma.taskFollower.createMany({
        data: followData,
        skipDuplicates: true,
      });
    } catch (error) {
      logger.error("Failed to auto-follow task", error, {
        taskId,
        userCount: userIds.length,
      });
      throw error;
    }
  }

  // === POST FOLLOWER METHODS ===

  /**
   * Notify all followers of a post
   * @param options - Post follower notification options
   */
  static async notifyPostFollowers(
    options: PostFollowerNotificationOptions
  ): Promise<void> {
    const { postId, senderId, type, content, excludeUserIds = [] } = options;

    const followerQuery = prisma.postFollower.findMany({
      where: {
        postId: postId,
        userId: {
          notIn: [senderId, ...excludeUserIds],
        },
      },
      select: {
        userId: true,
      },
    });

    await this.createFollowerNotifications(
      followerQuery,
      type,
      content,
      senderId,
      excludeUserIds,
      { postId }
    );
  }

  static async addPostFollower(postId: string, userId: string): Promise<void> {
    try {
      await prisma.postFollower.upsert({
        where: {
          postId_userId: {
            postId,
            userId,
          },
        },
        update: {}, // No updates needed if already exists
        create: {
          postId,
          userId,
        },
      });
    } catch (error) {
      logger.error("Failed to add post follower", error, { postId, userId });
      throw error;
    }
  }

  static async removePostFollower(
    postId: string,
    userId: string
  ): Promise<void> {
    try {
      await prisma.postFollower.deleteMany({
        where: {
          postId,
          userId,
        },
      });
    } catch (error) {
      logger.error("Failed to remove post follower", error, { postId, userId });
      throw error;
    }
  }

  // Removed unused: getPostFollowers

  static async isUserFollowingPost(
    postId: string,
    userId: string
  ): Promise<boolean> {
    try {
      const follower = await prisma.postFollower.findUnique({
        where: {
          postId_userId: {
            postId,
            userId,
          },
        },
      });

      return !!follower;
    } catch (error) {
      logger.error("Failed to check if user is following post", error, {
        postId,
        userId,
      });
      return false;
    }
  }

  // Auto-follow post for certain users (e.g., mentioned users)
  static async autoFollowPost(
    postId: string,
    userIds: string[]
  ): Promise<void> {
    try {
      const followData = userIds.map((userId) => ({
        postId,
        userId,
      }));
      // Use createMany with skipDuplicates to avoid conflicts
      await prisma.postFollower.createMany({
        data: followData,
        skipDuplicates: true,
      });
    } catch (error) {
      logger.error("Failed to auto-follow post", error, {
        postId,
        userCount: userIds.length,
      });
      throw error;
    }
  }

  // === TASK MENTION HANDLING ===

  /**
   * Create mention notifications for task comments
   */
  static async createTaskCommentMentionNotifications(
    taskId: string,
    taskCommentId: string,
    mentionedUserIds: string[],
    senderId: string,
    content: string
  ): Promise<void> {
    if (mentionedUserIds.length === 0) return;

    try {
      const safeContent = sanitizeHtmlToPlainText(content);
      const notifications = mentionedUserIds
        .filter((userId) => userId !== senderId)
        .map((userId) => ({
          type: NotificationType.ISSUE_MENTION.toString(),
          content: `mentioned you in a task comment: "${
            safeContent.length > 100 ? safeContent.substring(0, 97) + "..." : safeContent
          }"`,
          userId,
          senderId,
          taskId,
          taskCommentId,
          read: false,
        }));

      // Bounce filter per user/content
      const bounceChecks = await Promise.all(
        notifications.map((n) => this.shouldBounceNotification(n.userId, n.content))
      );
      const dedupedNotifications = notifications.filter((_, idx) => !bounceChecks[idx]);
        notifications.map((n) => NotificationService.shouldBounceNotification(n.userId, n.content))
      if (dedupedNotifications.length > 0) {
        await prisma.notification.createMany({ data: dedupedNotifications });
        logger.info("Task comment mention notifications created", {
          count: dedupedNotifications.length,
          taskId,
          taskCommentId,
        });

        const pushPromises = dedupedNotifications.map((n) =>
          this.sendPushNotificationForUser(
            n.userId,
            NotificationType.ISSUE_MENTION,
            n.content
          )
        );
        await Promise.allSettled(pushPromises);
      }

      await this.autoFollowTask(taskId, mentionedUserIds);
    } catch (error) {
      logger.error("Failed to create task comment mention notifications", error, {
        taskId,
        taskCommentId,
        mentionedUserCount: mentionedUserIds.length,
      });
      throw error;
    }
  }

  // === BOARD FOLLOWER METHODS ===

  /**
   * Notify all followers of a board
   * @param options - Board follower notification options
   */
  static async notifyBoardFollowers(
    options: BoardFollowerNotificationOptions
  ): Promise<void> {
    const {
      boardId,
      taskId,
      senderId,
      type,
      content,
      excludeUserIds = [],
      skipTaskIdReference = false,
    } = options;

    const followerQuery = prisma.boardFollower.findMany({
      where: {
        boardId: boardId,
        userId: {
          notIn: [senderId, ...excludeUserIds],
        },
      },
      select: {
        userId: true,
      },
    });

    const additionalData = skipTaskIdReference ? {} : { taskId };

    await this.createFollowerNotifications(
      followerQuery,
      type,
      content,
      senderId,
      excludeUserIds,
      additionalData
    );
  }
  // Removed unused board follower helpers: add/remove/get/isFollowing/autoFollow

  // ====== LEAVE REQUEST NOTIFICATION METHODS ======

  /**
   * Find managers in a workspace
   * @param workspaceId - The workspace ID
   * @returns Array of user IDs who are managers
   */
  static async findManagersInWorkspace(workspaceId: string): Promise<string[]> {
    const managers = await prisma.workspaceMember.findMany({
      where: {
        workspaceId,
        status: true,
        role: {
          in: [
            WorkspaceRole.PROJECT_MANAGER,
            WorkspaceRole.ADMIN,
            WorkspaceRole.OWNER,
            WorkspaceRole.HR,
          ],
        },
      },
      select: {
        userId: true,
      },
    });

    // Also include the workspace owner
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { ownerId: true },
    });

    const managerIds = managers.map((m) => m.userId);
    if (workspace?.ownerId && !managerIds.includes(workspace.ownerId)) {
      managerIds.push(workspace.ownerId);
    }

    return managerIds;
  }

  /**
   * Find HR personnel in a workspace
   * @param workspaceId - The workspace ID
   * @returns Array of user IDs who are HR
   */
  static async findHRInWorkspace(workspaceId: string): Promise<string[]> {
    const hrPersonnel = await prisma.workspaceMember.findMany({
      where: {
        workspaceId,
        role: WorkspaceRole.HR.toString(),
        status: true,
      },
      select: {
        userId: true,
      },
    });

    return hrPersonnel.map((hr) => hr.userId);
  }

  /**
   * Check if a leave policy requires HR notifications
   * @param policyName - The leave policy name
   * @returns true if HR should be notified
   */
  static shouldNotifyHR(policyName: string): boolean {
    const hrRequiredPolicies = [
      "parental",
      "maternity",
      "paternity",
      "bereavement",
      "medical",
      "family medical",
      "disability",
      "sabbatical",
    ];

    const lowerPolicyName = policyName.toLowerCase();
    return hrRequiredPolicies.some((policy) =>
      lowerPolicyName.includes(policy)
    );
  }

  /**
   * Create notification content for leave requests
   * @param leaveRequest - The leave request data
   * @param actionType - The type of action
   * @param actionById - User ID who performed the action
   * @returns Notification content string
   */
  static createLeaveNotificationContent(
    leaveRequest: LeaveRequestNotificationData,
    actionType: string
  ): string {
    const userName =
      leaveRequest.user.name || leaveRequest.user.email || "Someone";
    const dateRange =
      format(leaveRequest.startDate, "MMM dd") ===
      format(leaveRequest.endDate, "MMM dd")
        ? format(leaveRequest.startDate, "MMM dd, yyyy")
        : `${format(leaveRequest.startDate, "MMM dd")} - ${format(
            leaveRequest.endDate,
            "MMM dd, yyyy"
          )}`;

    switch (actionType) {
      case "SUBMITTED":
        return `${userName} submitted a leave request for ${dateRange}`;
      case "APPROVED":
        return `Your leave request for ${dateRange} has been approved`;
      case "REJECTED":
        return `Your leave request for ${dateRange} has been rejected`;
      case "CANCELLED":
        return `${userName}'s leave request for ${dateRange} has been cancelled`;
      case "EDITED":
        return `${userName} updated their leave request for ${dateRange}`;
      default:
        return `Leave request update: for ${dateRange}`;
    }
  }

  /**
   * Send notifications when a leave request is submitted (managers and HR only)
   * Employee gets toast notification instead of in-app notification
   * @param leaveRequest - The leave request data
   */
  static async notifyLeaveSubmission(
    leaveRequest: LeaveRequestNotificationData
  ): Promise<void> {
    try {
      const workspaceId = leaveRequest.policy.workspaceId;

      // 1. Notify managers
      await this.sendLeaveManagerNotifications(
        leaveRequest,
        NotificationType.LEAVE_REQUEST_MANAGER_ALERT,
        "SUBMITTED"
      );

      // 2. Notify HR if policy requires it
      if (this.shouldNotifyHR(leaveRequest.policy.name)) {
        await this.sendLeaveHRNotifications(
          leaveRequest,
          NotificationType.LEAVE_REQUEST_HR_ALERT,
          "SUBMITTED"
        );
      }

      logger.info("Leave request submission notifications sent", {
        requestId: leaveRequest.id,
        userId: leaveRequest.userId,
        workspaceId,
      });
    } catch (error) {
      logger.error(
        "Failed to send leave request submission notifications",
        error,
        {
          requestId: leaveRequest.id,
        }
      );
    }
  }

  /**
   * Send notifications when a leave request status changes (approved, rejected, cancelled)
   * @param leaveRequest - The leave request data
   * @param status - The new status (APPROVED, REJECTED, CANCELLED)
   * @param actionById - User ID who changed the status
   */
  static async notifyLeaveStatusChange(
    leaveRequest: LeaveRequestNotificationData,
    status: string,
    actionById: string
  ): Promise<void> {
    try {
      const actionType = status.toUpperCase();

      // Determine notification behavior based on status and who performed the action
      if (status === "CANCELLED") {
        // Handle cancellation logic
        if (actionById === leaveRequest.userId) {
          // Employee cancelled their own request - notify managers
          await this.sendLeaveManagerNotifications(
            leaveRequest,
            NotificationType.LEAVE_REQUEST_MANAGER_ALERT,
            actionType
          );
        } else {
          // Manager/HR cancelled - notify employee
          await this.sendLeaveEmployeeNotification(
            leaveRequest,
            NotificationType.LEAVE_REQUEST_STATUS_CHANGED,
            actionType,
            actionById
          );
        }
      } else {
        // For approved/rejected - always notify the employee
        await this.sendLeaveEmployeeNotification(
          leaveRequest,
          NotificationType.LEAVE_REQUEST_STATUS_CHANGED,
          actionType,
          actionById
        );
      }

      // Always notify HR if policy requires it
      if (this.shouldNotifyHR(leaveRequest.policy.name)) {
        await this.sendLeaveHRNotifications(
          leaveRequest,
          NotificationType.LEAVE_REQUEST_HR_ALERT,
          actionType
        );
      }

      logger.info(`Leave request ${status.toLowerCase()} notification sent`, {
        requestId: leaveRequest.id,
        userId: leaveRequest.userId,
        status,
        actionById,
      });
    } catch (error) {
      logger.error(
        `Failed to send leave request ${status.toLowerCase()} notification`,
        error,
        {
          requestId: leaveRequest.id,
          status,
        }
      );
    }
  }

  /**
   * Send notifications when a leave request is edited
   * @param leaveRequest - The leave request data
   * @param actionById - User ID who edited the request
   */
  static async notifyLeaveEdit(
    leaveRequest: LeaveRequestNotificationData,
    actionById: string
  ): Promise<void> {
    try {
      const workspaceId = leaveRequest.policy.workspaceId;

      // If edited by the employee themselves
      if (actionById === leaveRequest.userId) {
        // Notify managers about the edit
        await this.sendLeaveManagerNotifications(
          leaveRequest,
          NotificationType.LEAVE_REQUEST_MANAGER_ALERT,
          "EDITED"
        );
      } else {
        // If edited by HR/manager, notify the employee
        await this.sendLeaveEmployeeNotification(
          leaveRequest,
          NotificationType.LEAVE_REQUEST_EDITED,
          "EDITED",
          actionById
        );
      }

      // Always notify HR if policy requires it
      if (this.shouldNotifyHR(leaveRequest.policy.name)) {
        await this.sendLeaveHRNotifications(
          leaveRequest,
          NotificationType.LEAVE_REQUEST_HR_ALERT,
          "EDITED"
        );
      }

      logger.info("Leave request edit notifications sent", {
        requestId: leaveRequest.id,
        userId: leaveRequest.userId,
        actionById,
        workspaceId,
      });
    } catch (error) {
      logger.error("Failed to send leave request edit notifications", error, {
        requestId: leaveRequest.id,
      });
    }
  }

  /**
   * Send notification to the employee
   * @param leaveRequest - The leave request data
   * @param notificationType - Type of notification
   * @param actionType - The action type
   * @param actionById - Optional user ID who performed the action
   */
  private static async sendLeaveEmployeeNotification(
    leaveRequest: LeaveRequestNotificationData,
    notificationType: NotificationType,
    actionType: string,
    actionById?: string
  ): Promise<void> {
    const preferences = await NotificationService.getUserPreferences(
      leaveRequest.userId
    );

    if (!NotificationService.shouldNotifyUser(preferences, notificationType)) {
      return;
    }

    const content = this.createLeaveNotificationContent(
      leaveRequest,
      actionType
    );

    // Bounce: skip if last notification matches
    if (await this.shouldBounceNotification(leaveRequest.userId, content)) {
      return;
    }
    if (await NotificationService.shouldBounceNotification(leaveRequest.userId, content)) {
    // Create in-app notification
    await prisma.notification.create({
      data: {
        userId: leaveRequest.userId,
        senderId: actionById || leaveRequest.userId,
        type: notificationType,
        content,
        leaveRequestId: leaveRequest.id,
      },
    });

    // Send push notification if enabled
    if (preferences.pushNotificationsEnabled && preferences.pushSubscription) {
      try {
        await sendPushNotification(preferences.pushSubscription, {
          title: "Leave Request Update",
          body: content,
          icon: "/icon-192x192.png",
          badge: "/icon-192x192.png",
          data: {
            url: `/leave-management`,
            notificationType,
          },
        });
      } catch (pushError) {
        logger.error("Failed to send push notification", pushError, {
          userId: leaveRequest.userId,
          notificationType,
        });
      }
    }
  }

  /**
   * Send notifications to managers
   * @param leaveRequest - The leave request data
   * @param notificationType - Type of notification
   * @param actionType - The action type
   */
  private static async sendLeaveManagerNotifications(
    leaveRequest: LeaveRequestNotificationData,
    notificationType: NotificationType,
    actionType: string
  ): Promise<void> {
    const managerIds = await this.findManagersInWorkspace(
      leaveRequest.policy.workspaceId
    );

    // Exclude the person who performed the action
    const recipientIds = managerIds.filter((id) => id !== leaveRequest.userId);

    if (recipientIds.length === 0) return;

    const content = this.createLeaveNotificationContent(
      leaveRequest,
      actionType
    );

    // Bounce filter recipients
    const bounceChecks = await Promise.all(
      recipientIds.map((uid) => this.shouldBounceNotification(uid, content))
    );
    const dedupedRecipientIds = recipientIds.filter((_, idx) => !bounceChecks[idx]);

    if (dedupedRecipientIds.length === 0) return;

    // Create notifications for each manager
    const notifications = dedupedRecipientIds.map((managerId) => ({
      userId: managerId,
      senderId: leaveRequest.userId,
      type: notificationType,
      content,
      leaveRequestId: leaveRequest.id,
    }));

    await prisma.notification.createMany({
      data: notifications,
    });

    // Send push notifications
    for (const managerId of dedupedRecipientIds) {
      const preferences = await NotificationService.getUserPreferences(
        managerId
      );

      if (
        NotificationService.shouldNotifyUser(preferences, notificationType) &&
        preferences.pushNotificationsEnabled &&
        preferences.pushSubscription
      ) {
        try {
          await sendPushNotification(preferences.pushSubscription, {
            title: "Leave Request Alert",
            body: content,
            icon: "/icon-192x192.png",
            badge: "/icon-192x192.png",
            data: {
              url: `/leave-management`,
              notificationType,
            },
          });
        } catch (pushError) {
          logger.error(
            "Failed to send push notification to manager",
            pushError,
            {
              managerId,
              notificationType,
            }
          );
        }
      }
    }
  }

  /**
   * Send notifications to HR personnel
   * @param leaveRequest - The leave request data
   * @param notificationType - Type of notification
   * @param actionType - The action type
   */
  private static async sendLeaveHRNotifications(
    leaveRequest: LeaveRequestNotificationData,
    notificationType: NotificationType,
    actionType: string
  ): Promise<void> {
    const hrIds = await this.findHRInWorkspace(leaveRequest.policy.workspaceId);

    if (hrIds.length === 0) return;

    const content = this.createLeaveNotificationContent(
      leaveRequest,
      actionType
    );

    // Bounce filter recipients
    const bounceChecks = await Promise.all(
      hrIds.map((uid) => this.shouldBounceNotification(uid, content))
    );
    const dedupedHrIds = hrIds.filter((_, idx) => !bounceChecks[idx]);

    if (dedupedHrIds.length === 0) return;

    // Create notifications for each HR person
    const notifications = dedupedHrIds.map((hrId) => ({
      userId: hrId,
      senderId: leaveRequest.userId,
      type: notificationType,
      content,
      leaveRequestId: leaveRequest.id,
    }));

    await prisma.notification.createMany({
      data: notifications,
    });

    // Send push notifications
    for (const hrId of dedupedHrIds) {
      const preferences = await NotificationService.getUserPreferences(hrId);

      if (
        NotificationService.shouldNotifyUser(preferences, notificationType) &&
        preferences.pushNotificationsEnabled &&
        preferences.pushSubscription
      ) {
        try {
          await sendPushNotification(preferences.pushSubscription, {
            title: "Leave Request - HR Alert",
            body: content,
            icon: "/icon-192x192.png",
            badge: "/icon-192x192.png",
            data: {
              url: `/leave-management`,
              notificationType,
            },
          });
        } catch (pushError) {
          logger.error("Failed to send push notification to HR", pushError, {
            hrId,
            notificationType,
          });
        }
      }
    }
  }
}
