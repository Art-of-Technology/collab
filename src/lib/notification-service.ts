import { prisma } from "@/lib/prisma";
import { extractMentionUserIds } from "@/utils/mentions";
import {
  sendPushNotification,
  PushNotificationPayload,
} from "@/lib/push-notifications";
import { WorkspaceRole } from "@/lib/permissions";
import { format } from "date-fns";
import { logger } from "@/lib/logger";

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

export interface LeaveRequestActionContext {
  requestId: string;
  actionById: string;
  actionType: "SUBMITTED" | "APPROVED" | "REJECTED" | "EDITED" | "CANCELLED";
  previousStatus?: string;
  notes?: string;
}

export enum NotificationType {
  TASK_CREATED = "TASK_CREATED",
  TASK_STATUS_CHANGED = "TASK_STATUS_CHANGED",
  TASK_COMMENT_ADDED = "TASK_COMMENT_ADDED",
  TASK_COMMENT_MENTION = "TASK_COMMENT_MENTION",
  TASK_ASSIGNED = "TASK_ASSIGNED",
  TASK_UPDATED = "TASK_UPDATED",
  TASK_PRIORITY_CHANGED = "TASK_PRIORITY_CHANGED",
  TASK_DUE_DATE_CHANGED = "TASK_DUE_DATE_CHANGED",
  TASK_DELETED = "TASK_DELETED",
  POST_COMMENT_ADDED = "POST_COMMENT_ADDED",
  POST_BLOCKER_CREATED = "POST_BLOCKER_CREATED",
  POST_RESOLVED = "POST_RESOLVED",
  BOARD_TASK_CREATED = "BOARD_TASK_CREATED",
  BOARD_TASK_STATUS_CHANGED = "BOARD_TASK_STATUS_CHANGED",
  BOARD_TASK_COMPLETED = "BOARD_TASK_COMPLETED",
  BOARD_TASK_DELETED = "BOARD_TASK_DELETED",
  LEAVE_REQUEST_STATUS_CHANGED = "LEAVE_REQUEST_STATUS_CHANGED",
  LEAVE_REQUEST_EDITED = "LEAVE_REQUEST_EDITED",
  LEAVE_REQUEST_MANAGER_ALERT = "LEAVE_REQUEST_MANAGER_ALERT",
  LEAVE_REQUEST_HR_ALERT = "LEAVE_REQUEST_HR_ALERT",
}

export class NotificationService {
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
            additionalData.taskId,
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
    taskId?: string,
    postId?: string
  ): Promise<void> {
    try {
      // Build the URL based on notification type
      let url = "/";
      if (taskId) {
        url = `/tasks/${taskId}`;
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
    const typeToPreferenceMap = {
      [NotificationType.TASK_CREATED]: "taskCreated",
      [NotificationType.TASK_STATUS_CHANGED]: "taskStatusChanged",
      [NotificationType.TASK_COMMENT_ADDED]: "taskCommentAdded",
      [NotificationType.TASK_COMMENT_MENTION]: "taskMentioned",
      [NotificationType.TASK_ASSIGNED]: "taskAssigned",
      [NotificationType.TASK_UPDATED]: "taskUpdated",
      [NotificationType.TASK_PRIORITY_CHANGED]: "taskPriorityChanged",
      [NotificationType.TASK_DUE_DATE_CHANGED]: "taskDueDateChanged",
      [NotificationType.TASK_DELETED]: "taskDeleted",
      [NotificationType.POST_COMMENT_ADDED]: "postCommentAdded",
      [NotificationType.POST_BLOCKER_CREATED]: "postBlockerCreated",
      [NotificationType.POST_RESOLVED]: "postResolved",
      [NotificationType.BOARD_TASK_CREATED]: "boardTaskCreated",
      [NotificationType.BOARD_TASK_STATUS_CHANGED]: "boardTaskStatusChanged",
      [NotificationType.BOARD_TASK_COMPLETED]: "boardTaskCompleted",
      [NotificationType.BOARD_TASK_DELETED]: "boardTaskDeleted",

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
   * Get all followers of a task
   * @param taskId - Task ID to get followers for
   * @returns Array of user IDs following the task
   */
  static async getTaskFollowers(taskId: string): Promise<string[]> {
    try {
      const followers = await prisma.taskFollower.findMany({
        where: {
          taskId,
        },
        select: {
          userId: true,
        },
      });

      return followers.map((f) => f.userId);
    } catch (error) {
      logger.error("Failed to get task followers", error, { taskId });
      throw error;
    }
  }

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

  static async getPostFollowers(postId: string): Promise<string[]> {
    try {
      const followers = await prisma.postFollower.findMany({
        where: {
          postId,
        },
        select: {
          userId: true,
        },
      });

      return followers.map((f) => f.userId);
    } catch (error) {
      logger.error("Failed to get post followers", error, { postId });
      throw error;
    }
  }

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
      // Create mention notifications
      const notifications = mentionedUserIds
        .filter((userId) => userId !== senderId) // Don't notify the sender
        .map((userId) => ({
          type: NotificationType.TASK_COMMENT_MENTION.toString(),
          content: `mentioned you in a task comment: "${
            content.length > 100 ? content.substring(0, 97) + "..." : content
          }"`,
          userId,
          senderId,
          taskId,
          taskCommentId,
          read: false,
        }));

      if (notifications.length > 0) {
        await prisma.notification.createMany({
          data: notifications,
        });
        logger.info("Task comment mention notifications created", {
          count: notifications.length,
          taskId,
          taskCommentId,
        });

        // Send push notifications for mentions
        const pushPromises = notifications.map((notification) =>
          this.sendPushNotificationForUser(
            notification.userId,
            NotificationType.TASK_COMMENT_MENTION,
            notification.content,
            taskId
          )
        );
        await Promise.allSettled(pushPromises);
      }

      // Auto-follow mentioned users to the task
      await this.autoFollowTask(taskId, mentionedUserIds);
    } catch (error) {
      logger.error(
        "Failed to create task comment mention notifications",
        error,
        {
          taskId,
          taskCommentId,
          mentionedUserCount: mentionedUserIds.length,
        }
      );
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

  static async addBoardFollower(
    boardId: string,
    userId: string
  ): Promise<void> {
    try {
      await prisma.boardFollower.upsert({
        where: {
          boardId_userId: {
            boardId,
            userId,
          },
        },
        update: {}, // No updates needed if already exists
        create: {
          boardId,
          userId,
        },
      });
    } catch (error) {
      logger.error("Failed to add board follower", error, { boardId, userId });
      throw error;
    }
  }

  static async removeBoardFollower(
    boardId: string,
    userId: string
  ): Promise<void> {
    try {
      await prisma.boardFollower.deleteMany({
        where: {
          boardId,
          userId,
        },
      });
    } catch (error) {
      logger.error("Failed to remove board follower", error, {
        boardId,
        userId,
      });
      throw error;
    }
  }

  static async getBoardFollowers(boardId: string): Promise<string[]> {
    try {
      const followers = await prisma.boardFollower.findMany({
        where: {
          boardId,
        },
        select: {
          userId: true,
        },
      });

      return followers.map((f) => f.userId);
    } catch (error) {
      logger.error("Failed to get board followers", error, { boardId });
      throw error;
    }
  }

  static async isUserFollowingBoard(
    boardId: string,
    userId: string
  ): Promise<boolean> {
    try {
      const follower = await prisma.boardFollower.findUnique({
        where: {
          boardId_userId: {
            boardId,
            userId,
          },
        },
      });

      return !!follower;
    } catch (error) {
      logger.error("Failed to check if user is following board", error, {
        boardId,
        userId,
      });
      return false;
    }
  }

  // Auto-follow board for certain users
  static async autoFollowBoard(
    boardId: string,
    userIds: string[]
  ): Promise<void> {
    try {
      const followData = userIds.map((userId) => ({
        boardId,
        userId,
      }));

      // Use createMany with skipDuplicates to avoid conflicts
      await prisma.boardFollower.createMany({
        data: followData,
        skipDuplicates: true,
      });
    } catch (error) {
      logger.error("Failed to auto-follow board", error, {
        boardId,
        userCount: userIds.length,
      });
      throw error;
    }
  }

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
    const policyName = leaveRequest.policy.name;
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
        return `${userName} submitted a ${policyName} leave request for ${dateRange}`;
      case "APPROVED":
        return `Your ${policyName} leave request for ${dateRange} has been approved`;
      case "REJECTED":
        return `Your ${policyName} leave request for ${dateRange} has been rejected`;
      case "CANCELLED":
        return `${userName}'s ${policyName} leave request for ${dateRange} has been cancelled`;
      case "EDITED":
        return `${userName} updated their ${policyName} leave request for ${dateRange}`;
      default:
        return `Leave request update: ${policyName} for ${dateRange}`;
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

    // Create notifications for each manager
    const notifications = recipientIds.map((managerId) => ({
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
    for (const managerId of recipientIds) {
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

    // Create notifications for each HR person
    const notifications = hrIds.map((hrId) => ({
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
    for (const hrId of hrIds) {
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
