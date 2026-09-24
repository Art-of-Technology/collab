import { z } from 'zod';
import { IssueType, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { checkUserPermissions, canActOnOwnContent, Permission } from '@/lib/permissions';
import { findIssueByIdOrKey, STANDARD_ISSUE_INCLUDE, userHasWorkspaceAccess } from '@/lib/issue-finder';
import { normalizeDescriptionHTML } from '@/utils/html-normalizer';

const UpdateIssueSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(100000).nullable().optional(),
  type: z.string().transform(value => value.toUpperCase()).pipe(z.nativeEnum(IssueType)).optional(),
  priority: z.string().transform(value => value.toLowerCase()).pipe(z.enum(['low', 'medium', 'high', 'urgent'])).optional(),
  status: z.string().min(1).max(100).optional(),
  statusValue: z.string().min(1).max(100).optional(),
  statusId: z.string().min(1).nullable().optional(),
  assigneeId: z.string().min(1).nullable().optional(),
  reporterId: z.string().min(1).nullable().optional(),
  projectId: z.string().min(1).optional(),
  parentId: z.string().min(1).nullable().optional(),
  dueDate: z.string().datetime({ offset: true }).nullable().optional(),
  startDate: z.string().datetime({ offset: true }).nullable().optional(),
  storyPoints: z.number().int().nonnegative().nullable().optional(),
  progress: z.number().int().min(0).max(100).optional(),
  position: z.number().int().optional(),
  color: z.string().max(100).nullable().optional(),
  timeEstimateMinutes: z.number().int().nonnegative().nullable().optional(),
  labels: z.array(z.union([z.string().min(1), z.object({ id: z.string().min(1) })])).max(100).optional(),
}).strict().refine(value => Object.keys(value).length > 0);

export async function updateIssue(userId: string, issueId: string, input: unknown, workspaceId?: string) {
  if (!userId) return { error: 'Unauthorized', status: 401 };
  try {
    const parsed = UpdateIssueSchema.safeParse(input);
    if (!parsed.success) {
      return { error: 'Invalid issue update', status: 400 };
    }
    const body = parsed.data;

    // Find the issue first, scoped to user's accessible workspaces
    const existingIssue = await findIssueByIdOrKey(issueId, {
      workspaceId: workspaceId || undefined,
      userId
    });

    if (!existingIssue) {
      return { error: 'Issue not found', status: 404 };
    }
    // Check workspace access
    const hasAccess = await userHasWorkspaceAccess(userId, existingIssue.workspaceId);

    if (!hasAccess) {
      return { error: "You don't have permission to update this issue", status: 403 };
    }

    const permissions = await checkUserPermissions(userId, existingIssue.workspaceId, [
      Permission.EDIT_ANY_TASK, Permission.EDIT_SELF_TASK,
      Permission.CHANGE_TASK_STATUS, Permission.ASSIGN_TASK
    ]);
    const canEdit = canActOnOwnContent(existingIssue.reporterId, userId,
      permissions[Permission.EDIT_ANY_TASK].hasPermission,
      permissions[Permission.EDIT_SELF_TASK].hasPermission);
    if (Object.keys(body).some(field => {
      if (canEdit) return false;
      if (['status', 'statusValue', 'statusId'].includes(field)) {
        return !permissions[Permission.CHANGE_TASK_STATUS].hasPermission;
      }
      if (field === 'assigneeId') return !permissions[Permission.ASSIGN_TASK].hasPermission;
      return true;
    })) {
      return { error: 'No permission to edit these issue fields', status: 403 };
    }

    const oldIssue = existingIssue;
    const assigneeChanged = body.assigneeId !== undefined && body.assigneeId !== oldIssue.assigneeId;
    const { labels, ...fields } = body;
    const labelIds = labels?.map(label => typeof label === 'string' ? label : label.id);
    const updateData: Prisma.IssueUncheckedUpdateInput = {
      ...fields, updatedAt: new Date(), lastProgressAt: new Date()
    };
    if (typeof updateData.description === 'string') {
      updateData.description = normalizeDescriptionHTML(updateData.description);
    }

    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.issue.findFirst({
        where: {
          id: existingIssue.id, workspaceId: existingIssue.workspaceId,
          projectId: existingIssue.projectId, updatedAt: existingIssue.updatedAt
        },
        select: { id: true }
      });
      if (!current) return { error: 'Issue changed; reload and retry', status: 409 };

      const projectId = body.projectId ?? existingIssue.projectId;
      const moving = projectId !== existingIssue.projectId;
      if (moving && !await tx.project.findFirst({
        where: { id: projectId, workspaceId: existingIssue.workspaceId },
        select: { id: true }
      })) {
        return { error: 'Invalid destination project', status: 400 };
      }
      for (const userId of [body.assigneeId, body.reporterId]) {
        if (userId && !await userHasWorkspaceAccess(userId, existingIssue.workspaceId)) {
          return { error: 'Invalid issue participant', status: 400 };
        }
      }
      const parentId = body.parentId !== undefined ? body.parentId : existingIssue.parentId;
      if ((body.parentId !== undefined || moving) && parentId &&
          (parentId === existingIssue.id || !await tx.issue.findFirst({
            where: { id: parentId, workspaceId: existingIssue.workspaceId, projectId },
            select: { id: true }
          }))) {
        return { error: 'Invalid parent issue', status: 400 };
      }
      if (labelIds?.length && await tx.taskLabel.count({
        where: { id: { in: [...new Set(labelIds)] }, workspaceId: existingIssue.workspaceId }
      }) !== new Set(labelIds).size) {
        return { error: 'Invalid issue labels', status: 400 };
      }
      if (moving && await tx.issue.findFirst({
        where: {
          id: existingIssue.id,
          OR: [
            { children: { some: { projectId: { not: projectId } } } },
            ...(!labelIds ? [{ labels: { some: { workspaceId: { not: existingIssue.workspaceId } } } }] : []),
            { branches: { some: { repository: { projectId: { not: projectId } } } } },
            { commits: { some: { repository: { projectId: { not: projectId } } } } },
            { pullRequests: { some: { repository: { projectId: { not: projectId } } } } },
            { versionIssues: { some: { version: { repository: { projectId: { not: projectId } } } } } }
          ]
        },
        select: { id: true }
      })) {
        return { error: 'Project move has incompatible relations', status: 400 };
      }

      const statusNames = [body.status, body.statusValue].filter((value): value is string => value !== undefined);
      const statusRequested = body.statusId !== undefined || statusNames.length > 0;
      if (statusRequested || moving) {
        if (body.statusId === null) {
          if (statusNames.length) return { error: 'Conflicting issue status', status: 400 };
          updateData.status = null;
          updateData.statusValue = null;
        } else {
          if (!statusRequested) {
            const previousStatus = existingIssue.statusId
              ? await tx.projectStatus.findFirst({ where: { id: existingIssue.statusId, projectId: existingIssue.projectId } })
              : null;
            const previousName = previousStatus?.name ?? existingIssue.statusValue ?? existingIssue.status;
            if (previousName) statusNames.push(previousName);
            else if (existingIssue.statusId) return { error: 'Invalid issue status', status: 400 };
          }
          if (body.statusId || statusNames.length) {
            const statuses = await tx.projectStatus.findMany({ where: { projectId, isActive: true } });
            const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, '_');
            const matches = statuses.filter(status =>
              (!body.statusId || status.id === body.statusId) &&
              statusNames.every(value => [status.name, status.displayName].some(name => normalize(name) === normalize(value)))
            );
            if (matches.length !== 1) return { error: 'Invalid or ambiguous issue status', status: 400 };
            const projectStatus = matches[0];
            updateData.statusId = projectStatus.id;
            updateData.status = projectStatus.name;
            updateData.statusValue = projectStatus.name;
            if (normalize(projectStatus.name).includes('in_progress') && !existingIssue.firstStartedAt) {
              updateData.firstStartedAt = new Date();
            }
          }
        }
      }

      const issue = await tx.issue.update({
        where: { id: existingIssue.id },
        data: {
          ...updateData,
          ...(labelIds ? { labels: { set: labelIds.map(id => ({ id })) } } : {})
        },
        include: STANDARD_ISSUE_INCLUDE
      });
      if (assigneeChanged && issue.assigneeId) {
        await tx.issueAssignee.upsert({
          where: { issueId_userId: { issueId: existingIssue.id, userId: issue.assigneeId } },
          create: {
            issueId: existingIssue.id, userId: issue.assigneeId,
            role: "ASSIGNEE", status: "APPROVED", assignedAt: new Date(),
            approvedAt: new Date(), approvedBy: userId
          },
          update: { role: "ASSIGNEE", status: "APPROVED", approvedAt: new Date(), approvedBy: userId }
        });
      }
      return { issue };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if ('error' in result) return result;
    return { issue: result.issue, oldIssue, assigneeChanged, updateData };

  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2034', 'P2002'].includes(error.code)) {
      return { error: 'Issue update conflict; reload and retry', status: 409 };
    }
    throw error;
  }
}
