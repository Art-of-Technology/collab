import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { userHasWorkspaceAccess } from '@/lib/issue-finder';

type NotificationReferences = {
  postId?: string;
  commentId?: string;
  featureRequestId?: string;
  leaveRequestId?: string;
  issueId?: string;
};

export function notificationAccessWhere(userId: string): Prisma.NotificationWhereInput {
  const workspace = { OR: [
    { ownerId: userId },
    { members: { some: { userId, status: true } } },
  ] };
  const tenant = { OR: [{ workspaceId: null }, { workspace }] };
  return {
    userId,
    AND: [
      { OR: [{ postId: null }, { post: tenant }] },
      { OR: [{ featureRequestId: null }, { featureRequest: tenant }] },
      { OR: [{ leaveRequestId: null }, { leaveRequest: { policy: { workspace } } }] },
      { OR: [{ commentId: null }, { comment: { AND: [
        { OR: [{ postId: null }, { post: tenant }] },
        { OR: [{ noteId: null }, { note: tenant }] },
      ] } }] },
    ],
  };
}

export async function canReceiveNotification(userId: string, refs: NotificationReferences): Promise<boolean> {
  if (!await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })) return false;
  const workspaces: (string | null)[] = [];
  if (refs.postId) {
    const post = await prisma.post.findUnique({ where: { id: refs.postId }, select: { workspaceId: true } });
    if (!post) return false;
    workspaces.push(post.workspaceId);
  }
  if (refs.issueId) {
    const issue = await prisma.issue.findUnique({ where: { id: refs.issueId }, select: { workspaceId: true } });
    if (!issue) return false;
    workspaces.push(issue.workspaceId);
  }
  if (refs.featureRequestId) {
    const feature = await prisma.featureRequest.findUnique({ where: { id: refs.featureRequestId }, select: { workspaceId: true } });
    if (!feature) return false;
    workspaces.push(feature.workspaceId);
  }
  if (refs.commentId) {
    const comment = await prisma.comment.findUnique({ where: { id: refs.commentId }, select: {
      post: { select: { workspaceId: true } }, note: { select: { workspaceId: true } },
    } });
    if (!comment) return false;
    if (comment.post) workspaces.push(comment.post.workspaceId);
    if (comment.note) workspaces.push(comment.note.workspaceId);
  }
  if (refs.leaveRequestId) {
    const leave = await prisma.leaveRequest.findUnique({ where: { id: refs.leaveRequestId }, select: {
      policy: { select: { workspaceId: true } },
    } });
    if (!leave) return false;
    workspaces.push(leave.policy.workspaceId);
  }
  for (const workspaceId of new Set(workspaces)) {
    if (workspaceId !== null && !await userHasWorkspaceAccess(userId, workspaceId)) return false;
  }
  return true;
}
