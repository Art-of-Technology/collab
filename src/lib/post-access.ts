import type { Prisma } from '@prisma/client';

export function postWorkspaceAccessWhere(userId: string, workspaceId?: string): Prisma.WorkspaceWhereInput {
  if (!userId) return { id: { in: [] } };
  return {
    OR: [
      { ownerId: userId },
      { members: { some: { userId, status: true } } },
    ],
    ...(workspaceId ? { AND: [{ OR: [{ id: workspaceId }, { slug: workspaceId }] }] } : {}),
  };
}

export function postAccessWhere(postId: string, userId: string): Prisma.PostWhereInput {
  if (!postId || !userId) return { id: { in: [] } };
  return { id: postId, workspace: postWorkspaceAccessWhere(userId) };
}

export function commentAccessWhere(commentId: string, userId: string, postId?: string): Prisma.CommentWhereInput {
  if (!commentId || !userId) return { id: { in: [] } };
  return {
    id: commentId,
    ...(postId !== undefined ? { postId } : {}),
    post: postId !== undefined ? postAccessWhere(postId, userId) : { workspace: postWorkspaceAccessWhere(userId) },
  };
}
