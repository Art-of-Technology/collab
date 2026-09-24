import type { Prisma } from '@prisma/client';
import { featureAccessWhere } from '@/lib/feature-access';
import { prisma } from '@/lib/prisma';
import { issueReadAccessWhere, userHasWorkspaceAccess } from '@/lib/issue-finder';
import { noteAccessWhere } from '@/lib/secrets/access';

export type NotificationReferences = {
  postId?: string;
  commentId?: string;
  featureRequestId?: string;
  leaveRequestId?: string;
  issueId?: string;
  workspaceId?: string;
  personal?: boolean;
};

export async function notificationAccessWhere(userId: string): Promise<Prisma.NotificationWhereInput> {
  const references = await prisma.notification.findMany({
    where: { userId, issueId: { not: null } },
    select: { issueId: true },
    distinct: ['issueId'],
  });
  const ids = references.flatMap(row => row.issueId ? [row.issueId] : []);
  const accessible = ids.length ? await prisma.issue.findMany({
    where: { id: { in: ids }, ...issueReadAccessWhere(userId) }, select: { id: true },
  }) : [];

  const workspace = { OR: [
    { ownerId: userId },
    { members: { some: { userId, status: true } } },
  ] };
  const tenant = { OR: [{ workspaceId: null }, { workspace }] };
  const note = noteAccessWhere(userId);
  return {
    userId,
    AND: [
      { OR: [
        { issueId: null },
        { issueId: { in: accessible.map(issue => issue.id) } },
      ] },
      { OR: [
        { workspace },
        { postId: null, issueId: null, featureRequestId: null, leaveRequestId: null,
          comment: { postId: null, note } },
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
        { OR: [{ noteId: null }, { note }] },
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
    if (!issue) return null;
    workspaces.push(issue.workspaceId);
  }
  if (refs.featureRequestId) {
    const feature = await prisma.featureRequest.findUnique({ where: { id: refs.featureRequestId }, select: { workspaceId: true, project: { select: { workspaceId: true } } } });
    if (!feature) return null;
    workspaces.push(feature.workspaceId);
    if (feature.project) workspaces.push(feature.project.workspaceId);
  }
  if (refs.commentId) {
    const comment = await prisma.comment.findUnique({ where: { id: refs.commentId }, select: {
      post: { select: { workspaceId: true } },
      note: { select: { workspaceId: true, project: { select: { workspaceId: true } } } },
    } });
    if (!comment) return null;
    if (comment.post) workspaces.push(comment.post.workspaceId);
    if (comment.note) {
      workspaces.push(comment.note.workspaceId);
      if (comment.note.project) workspaces.push(comment.note.project.workspaceId);
    }
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
  let noteOnly = false;
  if (refs.commentId) {
    const comment = await prisma.comment.findFirst({
      where: { id: refs.commentId, OR: [{ noteId: null }, { note: noteAccessWhere(userId) }] },
      select: { noteId: true, postId: true },
    });
    if (!comment) return false;
    noteOnly = !!comment.noteId && !comment.postId && !refs.workspaceId && !refs.postId &&
      !refs.issueId && !refs.featureRequestId && !refs.leaveRequestId;
  }
  if (refs.issueId) {
    if (!await prisma.issue.findFirst({
      where: { id: refs.issueId, ...issueReadAccessWhere(userId) }, select: { id: true },
    })) return false;
  }
  const scope = await resolveNotificationScope(refs);
  return scope !== null && (noteOnly || scope.isPersonal || await userHasWorkspaceAccess(userId, scope.workspaceId!));
}
