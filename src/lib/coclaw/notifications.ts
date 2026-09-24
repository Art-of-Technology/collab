import { NotificationService } from '@/lib/notification-service';
import { notificationAccessWhere } from '@/lib/notification-access';
import { prisma } from '@/lib/prisma';

// ---------------------------------------------------------------------------
// Coclaw Notification Types
// ---------------------------------------------------------------------------

export enum CoclawNotificationType {
  /** Coclaw completed a chat response (background / user away) */
  COCLAW_RESPONSE = 'COCLAW_RESPONSE',
  /** Coclaw used an MCP tool to modify workspace data */
  COCLAW_TOOL_ACTION = 'COCLAW_TOOL_ACTION',
  /** Coclaw sent or received a message on a channel (Slack, Telegram, etc.) */
  COCLAW_CHANNEL_EVENT = 'COCLAW_CHANNEL_EVENT',
  /** Coclaw stored or updated a memory/context entry */
  COCLAW_MEMORY_UPDATE = 'COCLAW_MEMORY_UPDATE',
  /** Coclaw encountered an error while executing a task */
  COCLAW_ERROR = 'COCLAW_ERROR',
}

// All COCLAW types share this prefix — used for filtering in queries
export const COCLAW_NOTIFICATION_PREFIX = 'COCLAW_';

// ---------------------------------------------------------------------------
// Create a Coclaw notification (uses existing Notification model)
// ---------------------------------------------------------------------------

export interface CreateCoclawNotificationOptions {
  userId: string;
  workspaceId: string;
  type: CoclawNotificationType;
  content: string;
}

/**
 * Creates a notification for a Coclaw action.
 *
 * Because Coclaw acts *on behalf of* the user, `senderId` is set to the
 * user themselves.  The `type` field uses `COCLAW_*` prefixes so the
 * frontend can render them with a bot avatar instead of the user's face.
 *
 * Fire-and-forget — never throws.
 */
export async function createCoclawNotification(
  opts: CreateCoclawNotificationOptions,
): Promise<void> {
  await NotificationService.notifyUsers([opts.userId], opts.type, opts.content, opts.userId, {
    workspaceId: opts.workspaceId,
  });
}

// ---------------------------------------------------------------------------
// Batch: create multiple notifications at once
// ---------------------------------------------------------------------------

export async function createCoclawNotifications(
  items: CreateCoclawNotificationOptions[],
): Promise<void> {
  await Promise.all(items.map(createCoclawNotification));
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

/** Count unread Coclaw notifications for a user */
export async function getUnreadCoclawCount(userId: string, workspaceId: string): Promise<number> {
  try {
    return await prisma.notification.count({
      where: {
        ...notificationAccessWhere(userId),
        workspaceId,
        read: false,
        type: { startsWith: COCLAW_NOTIFICATION_PREFIX },
      },
    });
  } catch {
    return 0;
  }
}

/** Fetch recent Coclaw notifications for a user */
export async function getRecentCoclawNotifications(
  userId: string,
  workspaceId: string,
  limit = 20,
) {
  try {
    return await prisma.notification.findMany({
      where: {
        ...notificationAccessWhere(userId),
        workspaceId,
        type: { startsWith: COCLAW_NOTIFICATION_PREFIX },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        type: true,
        content: true,
        read: true,
        createdAt: true,
      },
    });
  } catch {
    return [];
  }
}

/** Mark all unread Coclaw notifications as read for a user */
export async function markAllCoclawNotificationsRead(
  userId: string,
  workspaceId: string,
): Promise<number> {
  try {
    const result = await prisma.notification.updateMany({
      where: {
        ...notificationAccessWhere(userId),
        workspaceId,
        read: false,
        type: { startsWith: COCLAW_NOTIFICATION_PREFIX },
      },
      data: { read: true },
    });
    return result.count;
  } catch {
    return 0;
  }
}
