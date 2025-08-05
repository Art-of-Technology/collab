import { prisma } from "@/lib/prisma";
import { extractMentionUserIds } from "@/utils/mentions";
import { sendPushNotification, PushNotificationPayload } from "@/lib/push-notifications";

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
}

export class NotificationService {
  // Helper method to send push notification
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
      console.error('Error sending push notification:', error);
      // Don't throw - push notification failure shouldn't break the main flow
    }
  }

  // Helper method to get user preferences and filter notifications
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
        };
      }
      
      return preferences;
    } catch (error) {
      console.error("Error getting user preferences:", error);
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

  // Helper method to check if user should receive notification based on type
  static shouldNotifyUser(preferences: any, notificationType: NotificationType): boolean {
    const typeToPreferenceMap = {
      [NotificationType.TASK_CREATED]: 'taskCreated',
      [NotificationType.TASK_STATUS_CHANGED]: 'taskStatusChanged',
      [NotificationType.TASK_COMMENT_ADDED]: 'taskCommentAdded',
      [NotificationType.TASK_COMMENT_MENTION]: 'taskMentioned',
      [NotificationType.TASK_ASSIGNED]: 'taskAssigned',
      [NotificationType.TASK_UPDATED]: 'taskUpdated',
      [NotificationType.TASK_PRIORITY_CHANGED]: 'taskPriorityChanged',
      [NotificationType.TASK_DUE_DATE_CHANGED]: 'taskDueDateChanged',
      [NotificationType.TASK_DELETED]: 'taskDeleted',
      [NotificationType.POST_COMMENT_ADDED]: 'postCommentAdded',
      [NotificationType.POST_BLOCKER_CREATED]: 'postBlockerCreated',
      [NotificationType.POST_RESOLVED]: 'postResolved',
      [NotificationType.BOARD_TASK_CREATED]: 'boardTaskCreated',
      [NotificationType.BOARD_TASK_STATUS_CHANGED]: 'boardTaskStatusChanged',
      [NotificationType.BOARD_TASK_COMPLETED]: 'boardTaskCompleted',
      [NotificationType.BOARD_TASK_DELETED]: 'boardTaskDeleted',
    };

    const preferenceKey = typeToPreferenceMap[notificationType];
    return preferenceKey ? preferences[preferenceKey] : true; // Default to true for unknown types
  }

  static async notifyTaskFollowers(options: TaskFollowerNotificationOptions): Promise<void> {
    const { taskId, senderId, type, content, excludeUserIds = [], skipTaskIdReference = false } = options;

    try {
      // Get all followers of the task
      const followers = await prisma.taskFollower.findMany({
        where: {
          taskId: taskId,
          userId: {
            notIn: [senderId, ...excludeUserIds] // Exclude sender and any specified users
          }
        },
        select: {
          userId: true
        }
      });

      if (followers.length === 0) {
        return; // No followers to notify
      }

      // Filter followers based on their notification preferences
      const validNotifications = [];
      for (const follower of followers) {
        const preferences = await this.getUserPreferences(follower.userId);
        if (this.shouldNotifyUser(preferences, type)) {
          const notification: any = {
            type: type.toString(),
            content,
            userId: follower.userId,
            senderId,
            read: false
          };
          
          // Only include taskId if not skipping the reference (for non-deletion notifications)
          if (!skipTaskIdReference && taskId) {
            notification.taskId = taskId;
          }
          
          validNotifications.push(notification);
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
            type,
            notification.content,
            taskId
          )
        );
        await Promise.allSettled(pushPromises);
      }

      console.log(`Created ${validNotifications.length} notifications for task ${taskId} (type: ${type})`);
    } catch (error) {
      console.error("Error creating task follower notifications:", error);
      throw error;
    }
  }

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
      console.error("Error adding task follower:", error);
      throw error;
    }
  }

  static async removeTaskFollower(taskId: string, userId: string): Promise<void> {
    try {
      await prisma.taskFollower.deleteMany({
        where: {
          taskId,
          userId
        }
      });
    } catch (error) {
      console.error("Error removing task follower:", error);
      throw error;
    }
  }

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
      console.error("Error getting task followers:", error);
      throw error;
    }
  }

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
      console.error("Error checking if user is following task:", error);
      return false;
    }
  }

  // Auto-follow task for certain users
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
      console.error("Error auto-following task:", error);
      throw error;
    }
  }

  // === POST FOLLOWER METHODS ===

  static async notifyPostFollowers(options: PostFollowerNotificationOptions): Promise<void> {
    const { postId, senderId, type, content, excludeUserIds = [] } = options;

    try {
      // Get all followers of the post
      const followers = await prisma.postFollower.findMany({
        where: {
          postId: postId,
          userId: {
            notIn: [senderId, ...excludeUserIds] // Exclude sender and any specified users
          }
        },
        select: {
          userId: true
        }
      });

      if (followers.length === 0) {
        return; // No followers to notify
      }

      // Filter followers based on their notification preferences
      const validNotifications = [];
      for (const follower of followers) {
        const preferences = await this.getUserPreferences(follower.userId);
        if (this.shouldNotifyUser(preferences, type)) {
          validNotifications.push({
            type: type.toString(),
            content,
            userId: follower.userId,
            senderId,
            postId,
            read: false
          });
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
            type,
            notification.content,
            undefined,
            postId
          )
        );
        await Promise.allSettled(pushPromises);
      }

      console.log(`Created ${validNotifications.length} notifications for post ${postId} (type: ${type})`);
    } catch (error) {
      console.error("Error creating post follower notifications:", error);
      throw error;
    }
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
      console.error("Error adding post follower:", error);
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
      console.error("Error removing post follower:", error);
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
      console.error("Error getting post followers:", error);
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
      console.error("Error checking if user is following post:", error);
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
      console.log('<<<<<<<<<<<<<<');
      console.log('Follow data: ', followData);
      console.log('>>>>>>>>>>>>>>');
      // Use createMany with skipDuplicates to avoid conflicts
      await prisma.postFollower.createMany({
        data: followData,
        skipDuplicates: true
      });
    } catch (error) {
      console.error("Error auto-following post:", error);
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
        .filter(userId => userId !== senderId) // Don't notify the sender
        .map(userId => ({
          type: NotificationType.TASK_COMMENT_MENTION.toString(),
          content: `mentioned you in a task comment: "${content.length > 100 ? content.substring(0, 97) + '...' : content}"`,
          userId,
          senderId,
          taskId,
          taskCommentId,
          read: false
        }));

      if (notifications.length > 0) {
        await prisma.notification.createMany({
          data: notifications
        });
        console.log(`Created ${notifications.length} task comment mention notifications`);

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
      }

      // Auto-follow mentioned users to the task
      await this.autoFollowTask(taskId, mentionedUserIds);
    } catch (error) {
      console.error("Error creating task comment mention notifications:", error);
      throw error;
    }
  }

  // === BOARD FOLLOWER METHODS ===

  static async notifyBoardFollowers(options: BoardFollowerNotificationOptions): Promise<void> {
    const { boardId, taskId, senderId, type, content, excludeUserIds = [], skipTaskIdReference = false } = options;

    try {
      // Get all followers of the board
      const followers = await prisma.boardFollower.findMany({
        where: {
          boardId: boardId,
          userId: {
            notIn: [senderId, ...excludeUserIds] // Exclude sender and any specified users
          }
        },
        select: {
          userId: true
        }
      });

      if (followers.length === 0) {
        return; // No followers to notify
      }

      // Filter followers based on their notification preferences
      const validNotifications = [];
      for (const follower of followers) {
        const preferences = await this.getUserPreferences(follower.userId);
        if (this.shouldNotifyUser(preferences, type)) {
          const notification: any = {
            type: type.toString(),
            content,
            userId: follower.userId,
            senderId,
            read: false
          };
          
          // Only include taskId if not skipping the reference (for non-deletion notifications)
          if (!skipTaskIdReference && taskId) {
            notification.taskId = taskId;
          }
          
          validNotifications.push(notification);
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
            type,
            notification.content,
            taskId
          )
        );
        await Promise.allSettled(pushPromises);
      }

      console.log(`Created ${validNotifications.length} notifications for board ${boardId} (type: ${type})`);
    } catch (error) {
      console.error("Error creating board follower notifications:", error);
      throw error;
    }
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
      console.error("Error adding board follower:", error);
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
      console.error("Error removing board follower:", error);
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
      console.error("Error getting board followers:", error);
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
      console.error("Error checking if user is following board:", error);
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
      console.error("Error auto-following board:", error);
      throw error;
    }
  }
}