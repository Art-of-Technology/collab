import { sendEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";

import {
  PushNotificationPayload,
  sendPushNotification,
} from "@/lib/push-notifications";

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
  TASK_DESCRIPTION_MENTION = "TASK_DESCRIPTION_MENTION",
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
   * @param _excludeUserIds - User IDs to exclude from notifications
   * @param additionalData - Additional data to include in notification
   */
  private static async createFollowerNotifications<T extends { userId: string }>(
    followerQuery: Promise<T[]>,
    notificationType: NotificationType,
    content: string,
    senderId: string,
    _excludeUserIds: string[] = [],
    additionalData: Record<string, any> = {}
  ): Promise<void> {
    try {
      const followers = await followerQuery;
      
      if (followers.length === 0) {
        return; // No followers to notify
      }

      // Filter followers based on their notification preferences
      const validNotifications = [];
      const emailNotifications = [];
      
      for (const follower of followers) {
        // Check if a current task notification already exists
        if (additionalData.taskId) {
          const existingNotification = await prisma.notification.findFirst({
            where: {
              userId: follower.userId,
              taskId: additionalData.taskId,
              createdAt: {
                gte: new Date(Date.now() - 1000 * 10) // 10 seconds ago
              }
            }
          });

          if (existingNotification) {
            continue;
          }
        }
        
        const preferences = await this.getUserPreferences(follower.userId);
        if (this.shouldNotifyUser(preferences, notificationType)) {
          validNotifications.push({
            type: notificationType.toString(),
            content,
            userId: follower.userId,
            senderId,
            read: false,
            ...additionalData
          });
          
          // Check if user has email notifications enabled
          if (preferences.emailNotificationsEnabled) {
            const user = await prisma.user.findUnique({
              where: { id: follower.userId },
              select: { email: true, name: true }
            });
            
            if (user?.email) {
              emailNotifications.push({
                email: user.email,
                name: user.name || 'User',
                content,
                notificationType,
                ...additionalData
              });
            }
          }
        }
      }

      if (validNotifications.length > 0) {
        await prisma.notification.createMany({
          data: validNotifications
        });

        // Send push notifications to users
        const pushPromises = validNotifications.map(notification => 
          this.sendPushNotificationForUser(
            notification.userId,
            notificationType,
            notification.content,
            additionalData.taskId,
            additionalData.postId
          )
        );
        await Promise.allSettled(pushPromises);
        
        // Send email notifications
        const emailPromises = emailNotifications.map(emailNotif =>
          this.sendNotificationEmail(
            emailNotif.email,
            emailNotif.name,
            emailNotif.content,
            emailNotif.notificationType,
            additionalData.taskId,
            additionalData.postId
          )
        );
        await Promise.allSettled(emailPromises);
      }

      logger.info('Follower notifications created', { 
        count: validNotifications.length, 
        emailCount: emailNotifications.length,
        type: notificationType,
        ...additionalData
      });
    } catch (error) {
      logger.error('Failed to create follower notifications', error, { 
        type: notificationType,
        ...additionalData 
      });
      throw error;
    }
  }

  /**
   * Helper method to send email notification to a user
   * @param email - User email address
   * @param name - User name
   * @param content - Notification content
   * @param notificationType - Type of notification
   * @param taskId - Optional task ID for URL generation
   * @param postId - Optional post ID for URL generation
   */
  static async sendNotificationEmail(
    email: string,
    name: string,
    content: string,
    notificationType: NotificationType,
    taskId?: string,
    postId?: string
  ): Promise<void> {
    try {
      // Build the URL based on notification type
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      let url = appUrl;
      if (taskId) {
        url = `${appUrl}/tasks/${taskId}`;
      } else if (postId) {
        url = `${appUrl}/posts/${postId}`;
      }

      const subject = 'New Notification - Collab';
      
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Hi ${name},</h2>
          <p>${content}</p>
          <div style="margin: 30px 0;">
            <a href="${url}" style="background-color: #22c55e; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
              View Details
            </a>
          </div>
          <p style="color: #666; font-size: 14px; margin-top: 40px; border-top: 1px solid #eee; padding-top: 20px;">
            You received this email because you have email notifications enabled. 
            You can manage your notification preferences in your profile settings.
          </p>
        </div>
      `;

      await sendEmail({
        to: email,
        subject,
        html,
      });
    } catch (error) {
      logger.error('Failed to send email notification', error, { email, notificationType });
      // Don't throw - email notification failure shouldn't break the main flow
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
      let url = '/';
      if (taskId) {
        url = `/tasks/${taskId}`;
      } else if (postId) {
        url = `/posts/${postId}`;
      }

      const payload: PushNotificationPayload = {
        title: 'Collab Notification',
        body: content,
        url,
        tag: notificationType,
        icon: '/icon-192x192.png',
        badge: '/icon-192x192.png',
        requireInteraction: false,
        actions: [
          {
            action: 'view',
            title: 'View'
          },
          {
            action: 'dismiss',
            title: 'Dismiss'
          }
        ]
      };

      await sendPushNotification(userId, payload);
    } catch (error) {
      logger.error('Failed to send push notification', error, { userId, notificationType });
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
        where: { userId }
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
          pushNotificationsEnabled: false,
        };
      }
      
      return preferences;
    } catch (error) {
      logger.error('Failed to get user preferences', error, { userId });
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
        pushNotificationsEnabled: false,
        postBlockerCreated: false
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
      [NotificationType.TASK_DESCRIPTION_MENTION]: 'taskMentioned',
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
  static async notifyTaskFollowers(options: TaskFollowerNotificationOptions): Promise<void> {
    const { taskId, senderId, type, content, excludeUserIds = [], skipTaskIdReference = false } = options;

    const followerQuery = prisma.taskFollower.findMany({
      where: {
        taskId: taskId,
        userId: {
          notIn: [senderId, ...excludeUserIds]
        }
      },
      select: {
        userId: true
      }
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
            userId
          }
        },
        update: {}, // No updates needed if already exists
        create: {
          taskId,
          userId
        }
      });
    } catch (error) {
      logger.error('Failed to add task follower', error, { taskId, userId });
      throw error;
    }
  }

  /**
   * Remove a user as a follower of a task
   * @param taskId - Task ID to unfollow
   * @param userId - User ID to remove as follower
   */
  static async removeTaskFollower(taskId: string, userId: string): Promise<void> {
    try {
      await prisma.taskFollower.deleteMany({
        where: {
          taskId,
          userId
        }
      });
    } catch (error) {
      logger.error('Failed to remove task follower', error, { taskId, userId });
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
          taskId
        },
        select: {
          userId: true
        }
      });

      return followers.map(f => f.userId);
    } catch (error) {
      logger.error('Failed to get task followers', error, { taskId });
      throw error;
    }
  }

  /**
   * Check if a user is following a task
   * @param taskId - Task ID to check
   * @param userId - User ID to check
   * @returns true if user is following the task
   */
  static async isUserFollowingTask(taskId: string, userId: string): Promise<boolean> {
    try {
      const follower = await prisma.taskFollower.findUnique({
        where: {
          taskId_userId: {
            taskId,
            userId
          }
        }
      });

      return !!follower;
    } catch (error) {
      logger.error('Failed to check if user is following task', error, { taskId, userId });
      return false;
    }
  }

  /**
   * Automatically add multiple users as followers of a task
   * @param taskId - Task ID to follow
   * @param userIds - Array of user IDs to add as followers
   */
  static async autoFollowTask(taskId: string, userIds: string[]): Promise<void> {
    try {
      const followData = userIds.map(userId => ({
        taskId,
        userId
      }));

      // Use createMany with skipDuplicates to avoid conflicts
      await prisma.taskFollower.createMany({
        data: followData,
        skipDuplicates: true
      });
    } catch (error) {
      logger.error('Failed to auto-follow task', error, { taskId, userCount: userIds.length });
      throw error;
    }
  }

  // === POST FOLLOWER METHODS ===

  /**
   * Notify all followers of a post
   * @param options - Post follower notification options
   */
  static async notifyPostFollowers(options: PostFollowerNotificationOptions): Promise<void> {
    const { postId, senderId, type, content, excludeUserIds = [] } = options;

    const followerQuery = prisma.postFollower.findMany({
      where: {
        postId: postId,
        userId: {
          notIn: [senderId, ...excludeUserIds]
        }
      },
      select: {
        userId: true
      }
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
            userId
          }
        },
        update: {}, // No updates needed if already exists
        create: {
          postId,
          userId
        }
      });
    } catch (error) {
      logger.error('Failed to add post follower', error, { postId, userId });
      throw error;
    }
  }

  static async removePostFollower(postId: string, userId: string): Promise<void> {
    try {
      await prisma.postFollower.deleteMany({
        where: {
          postId,
          userId
        }
      });
    } catch (error) {
      logger.error('Failed to remove post follower', error, { postId, userId });
      throw error;
    }
  }

  static async getPostFollowers(postId: string): Promise<string[]> {
    try {
      const followers = await prisma.postFollower.findMany({
        where: {
          postId
        },
        select: {
          userId: true
        }
      });

      return followers.map(f => f.userId);
    } catch (error) {
      logger.error('Failed to get post followers', error, { postId });
      throw error;
    }
  }

  static async isUserFollowingPost(postId: string, userId: string): Promise<boolean> {
    try {
      const follower = await prisma.postFollower.findUnique({
        where: {
          postId_userId: {
            postId,
            userId
          }
        }
      });

      return !!follower;
    } catch (error) {
      logger.error('Failed to check if user is following post', error, { postId, userId });
      return false;
    }
  }

  // Auto-follow post for certain users (e.g., mentioned users)
  static async autoFollowPost(postId: string, userIds: string[]): Promise<void> {
    try {
      const followData = userIds.map(userId => ({
        postId,
        userId
      }));
      // Use createMany with skipDuplicates to avoid conflicts
      await prisma.postFollower.createMany({
        data: followData,
        skipDuplicates: true
      });
    } catch (error) {
      logger.error('Failed to auto-follow post', error, { postId, userCount: userIds.length });
      throw error;
    }
  }

  // === TASK MENTION HANDLING ===

  /**
   * Create mention notifications for task descriptions
   */
  static async createTaskDescriptionMentionNotifications(
    taskId: string,
    mentionedUserIds: string[],
    senderId: string,
    taskTitle: string
  ): Promise<void> {
    if (mentionedUserIds.length === 0) return;

    try {
      // Create mention notifications with email preferences
      const notifications = [];
      const emailNotifications = [];
      
      for (const userId of mentionedUserIds) {
        if (userId === senderId) continue; // Don't notify the sender
        
        const preferences = await this.getUserPreferences(userId);
        if (this.shouldNotifyUser(preferences, NotificationType.TASK_DESCRIPTION_MENTION)) {
          notifications.push({
            type: NotificationType.TASK_DESCRIPTION_MENTION.toString(),
            content: `mentioned you in task: "${taskTitle}"`,
            userId,
            senderId,
            taskId,
            read: false
          });
          
          // Check if user has email notifications enabled
          if (preferences.emailNotificationsEnabled) {
            const user = await prisma.user.findUnique({
              where: { id: userId },
              select: { email: true, name: true }
            });
            
            if (user?.email) {
              emailNotifications.push({
                email: user.email,
                name: user.name || 'User',
                content: `mentioned you in task: "${taskTitle}"`,
                userId
              });
            }
          }
        }
      }

      if (notifications.length > 0) {
        await prisma.notification.createMany({
          data: notifications
        });
        logger.info('Task description mention notifications created', { 
          count: notifications.length,
          emailCount: emailNotifications.length,
          taskId
        });

        // Send push notifications for mentions
        const pushPromises = notifications.map(notification => 
          this.sendPushNotificationForUser(
            notification.userId,
            NotificationType.TASK_DESCRIPTION_MENTION,
            notification.content,
            taskId
          )
        );
        await Promise.allSettled(pushPromises);
        
        // Send email notifications for mentions
        const emailPromises = emailNotifications.map(emailNotif =>
          this.sendNotificationEmail(
            emailNotif.email,
            emailNotif.name,
            emailNotif.content,
            NotificationType.TASK_DESCRIPTION_MENTION,
            taskId
          )
        );
        await Promise.allSettled(emailPromises);
      }

      // Auto-follow mentioned users to the task
      await this.autoFollowTask(taskId, mentionedUserIds);
    } catch (error) {
      logger.error('Failed to create task description mention notifications', error, { 
        taskId, 
        mentionedUserCount: mentionedUserIds.length 
      });
      throw error;
    }
  }

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
      // Create mention notifications with email preferences
      const notifications = [];
      const emailNotifications = [];
      
      for (const userId of mentionedUserIds) {
        if (userId === senderId) continue; // Don't notify the sender
        
        const preferences = await this.getUserPreferences(userId);
        if (this.shouldNotifyUser(preferences, NotificationType.TASK_COMMENT_MENTION)) {
          const notificationContent = `mentioned you in a task comment: "${content.length > 100 ? content.substring(0, 97) + '...' : content}"`;
          
          notifications.push({
            type: NotificationType.TASK_COMMENT_MENTION.toString(),
            content: notificationContent,
            userId,
            senderId,
            taskId,
            taskCommentId,
            read: false
          });
          
          // Check if user has email notifications enabled
          if (preferences.emailNotificationsEnabled) {
            const user = await prisma.user.findUnique({
              where: { id: userId },
              select: { email: true, name: true }
            });
            
            if (user?.email) {
              emailNotifications.push({
                email: user.email,
                name: user.name || 'User',
                content: notificationContent,
                userId
              });
            }
          }
        }
      }

      if (notifications.length > 0) {
        await prisma.notification.createMany({
          data: notifications
        });
        logger.info('Task comment mention notifications created', { 
          count: notifications.length,
          emailCount: emailNotifications.length,
          taskId,
          taskCommentId
        });

        // Send push notifications for mentions
        const pushPromises = notifications.map(notification => 
          this.sendPushNotificationForUser(
            notification.userId,
            NotificationType.TASK_COMMENT_MENTION,
            notification.content,
            taskId
          )
        );
        await Promise.allSettled(pushPromises);
        
        // Send email notifications for mentions
        const emailPromises = emailNotifications.map(emailNotif =>
          this.sendNotificationEmail(
            emailNotif.email,
            emailNotif.name,
            emailNotif.content,
            NotificationType.TASK_COMMENT_MENTION,
            taskId
          )
        );
        await Promise.allSettled(emailPromises);
      }

      // Auto-follow mentioned users to the task
      await this.autoFollowTask(taskId, mentionedUserIds);
    } catch (error) {
      logger.error('Failed to create task comment mention notifications', error, { 
        taskId, 
        taskCommentId,
        mentionedUserCount: mentionedUserIds.length 
      });
      throw error;
    }
  }

  // === BOARD FOLLOWER METHODS ===

  /**
   * Notify all followers of a board
   * @param options - Board follower notification options
   */
  static async notifyBoardFollowers(options: BoardFollowerNotificationOptions): Promise<void> {
    const { boardId, taskId, senderId, type, content, excludeUserIds = [], skipTaskIdReference = false } = options;

    const followerQuery = prisma.boardFollower.findMany({
      where: {
        boardId: boardId,
        userId: {
          notIn: [senderId, ...excludeUserIds]
        }
      },
      select: {
        userId: true
      }
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

  static async addBoardFollower(boardId: string, userId: string): Promise<void> {
    try {
      await prisma.boardFollower.upsert({
        where: {
          boardId_userId: {
            boardId,
            userId
          }
        },
        update: {}, // No updates needed if already exists
        create: {
          boardId,
          userId
        }
      });
    } catch (error) {
      logger.error('Failed to add board follower', error, { boardId, userId });
      throw error;
    }
  }

  static async removeBoardFollower(boardId: string, userId: string): Promise<void> {
    try {
      await prisma.boardFollower.deleteMany({
        where: {
          boardId,
          userId
        }
      });
    } catch (error) {
      logger.error('Failed to remove board follower', error, { boardId, userId });
      throw error;
    }
  }

  static async getBoardFollowers(boardId: string): Promise<string[]> {
    try {
      const followers = await prisma.boardFollower.findMany({
        where: {
          boardId
        },
        select: {
          userId: true
        }
      });

      return followers.map(f => f.userId);
    } catch (error) {
      logger.error('Failed to get board followers', error, { boardId });
      throw error;
    }
  }

  static async isUserFollowingBoard(boardId: string, userId: string): Promise<boolean> {
    try {
      const follower = await prisma.boardFollower.findUnique({
        where: {
          boardId_userId: {
            boardId,
            userId
          }
        }
      });

      return !!follower;
    } catch (error) {
      logger.error('Failed to check if user is following board', error, { boardId, userId });
      return false;
    }
  }

  // Auto-follow board for certain users
  static async autoFollowBoard(boardId: string, userIds: string[]): Promise<void> {
    try {
      const followData = userIds.map(userId => ({
        boardId,
        userId
      }));

      // Use createMany with skipDuplicates to avoid conflicts
      await prisma.boardFollower.createMany({
        data: followData,
        skipDuplicates: true
      });
    } catch (error) {
      logger.error('Failed to auto-follow board', error, { boardId, userCount: userIds.length });
      throw error;
    }
  }
}
