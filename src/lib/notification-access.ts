import type { Prisma } from '@prisma/client';
import { postWorkspaceAccessWhere } from '@/lib/post-access';
import { noteAccessWhere } from '@/lib/secrets/access';

/** A comment may reference a post, a Note, or both; every attached resource must be accessible. */
export function notificationCommentAccessWhere(userId: string): Prisma.CommentWhereInput {
  return {
    AND: [
      { OR: [{ postId: { not: null } }, { noteId: { not: null } }] },
      { OR: [{ postId: null }, { post: { workspace: postWorkspaceAccessWhere(userId) } }] },
      { OR: [{ noteId: null }, { note: noteAccessWhere(userId) }] },
    ],
  };
}

export function postNotificationAccessWhere(userId: string): Prisma.NotificationWhereInput {
  return {
    userId,
    AND: [
      { OR: [{ postId: null }, { post: { workspace: postWorkspaceAccessWhere(userId) } }] },
      { OR: [{ commentId: null }, { comment: notificationCommentAccessWhere(userId) }] },
    ],
  };
}
