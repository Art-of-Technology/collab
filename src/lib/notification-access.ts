import type { Prisma } from '@prisma/client';
import { featureAccessWhere } from '@/lib/feature-access';
import { prisma } from '@/lib/prisma';
import { userHasWorkspaceAccess } from '@/lib/issue-finder';

export type NotificationReferences = {
  postId?: string;
  commentId?: string;
  featureRequestId?: string;
  leaveRequestId?: string;
  issueId?: string;
  workspaceId?: string;
  personal?: boolean;
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
      { OR: [
        { workspace },
        { workspaceId: null, issueId: null, OR: [
          { isPersonal: true }, { postId: { not: null } }, { commentId: { not: null } },
          { featureRequestId: { not: null } }, { leaveRequestId: { not: null } },
        ] },
      ] },
      { OR: [{ postId: null }, { post: tenant }] },
      { OR: [{ featureRequestId: null }, { featureRequest: featureAccessWhere(userId) }] },
      { OR: [{ leaveRequestId: null }, { leaveRequest: { policy: { workspace } } }] },
      { OR: [{ commentId: null }, { comment: { AND: [
        { OR: [{ postId: null }, { post: tenant }] },
        { OR: [{ noteId: null }, { note: tenant }] },
      ] } }] },
    ],
  };
}

export async function resolveNotificationScope(refs: NotificationReferences) {
  const workspaces: (string | null)[] = refs.workspaceId ? [refs.workspaceId] : [];
  if (refs.postId) {
    const post = await prisma.post.findUnique({ where: { id: refs.postId }, select: { workspaceId: true } });
    if (!post) return null;
    workspaces.push(post.workspaceId);
  }
  if (refs.issueId) {
    const issue = await prisma.issue.findUnique({ where: { id: refs.issueId }, select: { workspaceId: true } });
    if (!issue && !refs.workspaceId) return null;
    if (issue) workspaces.push(issue.workspaceId);
  }
  if (refs.featureRequestId) {
    const feature = await prisma.featureRequest.findUnique({ where: { id: refs.featureRequestId }, select: { workspaceId: true, project: { select: { workspaceId: true } } } });
    if (!feature) return null;
    workspaces.push(feature.workspaceId);
    if (feature.project) workspaces.push(feature.project.workspaceId);
  }
  if (refs.commentId) {
    const comment = await prisma.comment.findUnique({ where: { id: refs.commentId }, select: {
      post: { select: { workspaceId: true } }, note: { select: { workspaceId: true } },
    } });
    if (!comment) return null;
    if (comment.post) workspaces.push(comment.post.workspaceId);
    if (comment.note) workspaces.push(comment.note.workspaceId);
  }
  if (refs.leaveRequestId) {
    const leave = await prisma.leaveRequest.findUnique({ where: { id: refs.leaveRequestId }, select: {
      policy: { select: { workspaceId: true } },
    } });
    if (!leave) return null;
    workspaces.push(leave.policy.workspaceId);
  }
  const tenants = [...new Set(workspaces.filter((id): id is string => id !== null))];
  if (tenants.length > 1) return null;
  if (tenants.length === 1) return { workspaceId: tenants[0], isPersonal: false };
  if (workspaces.length || refs.personal === true) return { workspaceId: null, isPersonal: true };
  return null;
}

export async function canReceiveNotification(userId: string, refs: NotificationReferences): Promise<boolean> {
  if (!await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })) return false;
  const scope = await resolveNotificationScope(refs);
  return scope !== null && (scope.isPersonal || await userHasWorkspaceAccess(userId, scope.workspaceId!));
}
