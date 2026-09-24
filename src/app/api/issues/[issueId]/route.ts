import { validateIssueReferences } from '@/lib/issue-references';
import { z } from 'zod';
import { IssueType, Prisma } from '@prisma/client';
import { checkUserPermissions, canActOnOwnContent, Permission } from '@/lib/permissions';
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { trackFieldChanges, createActivity, compareObjects, trackAssignment, trackStatusChange } from "@/lib/board-item-activity-service";
import { publishEvent } from '@/lib/redis';
import { extractMentionUserIds } from "@/utils/mentions";
import { NotificationService, NotificationType } from "@/lib/notification-service";
import { emitIssueUpdated, emitIssueDeleted } from "@/lib/event-bus";
import { findIssueByIdOrKey, getStandardIssueInclude, userHasWorkspaceAccess } from "@/lib/issue-finder";
import { normalizeDescriptionHTML } from "@/utils/html-normalizer";

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

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/issues/[issueId] - Get issue details
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ issueId: string }> }
) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { issueId } = await params;
    const url = new URL(req.url);
    const workspaceId = url.searchParams.get('workspaceId');
    
    // Find issue using the utility function with proper workspace scoping
    const issue = await findIssueByIdOrKey(issueId, {
      workspaceId: workspaceId || undefined,
      userId: currentUser.id,
      include: getStandardIssueInclude(currentUser.id)
    });

    if (!issue) {
      return NextResponse.json(
        { error: "Issue not found" },
        { status: 404 }
      );
    }

    // Check if user has access to the workspace
    const hasAccess = await userHasWorkspaceAccess(currentUser.id, issue.workspaceId);
    if (!hasAccess) {
      return NextResponse.json(
        { error: "You don't have permission to view this issue" },
        { status: 403 }
      );
    }

    return NextResponse.json({ issue });

  } catch (error) {
    console.error("Error fetching issue:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// PUT /api/issues/[issueId] - Update issue
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ issueId: string }> }
) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { issueId } = await params;
    const parsed = UpdateIssueSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid issue update' }, { status: 400 });
    }
    const body = parsed.data;
    const url = new URL(req.url);
    const workspaceId = url.searchParams.get('workspaceId');

    // Find the issue first, scoped to user's accessible workspaces
    const existingIssue = await findIssueByIdOrKey(issueId, {
      workspaceId: workspaceId || undefined,
      userId: currentUser.id
    });

    if (!existingIssue) {
      return NextResponse.json({ 
        error: "Issue not found", 
        message: `Issue ${issueId} not found` 
      }, { status: 404 });
    }
    // Check workspace access
    const hasAccess = await userHasWorkspaceAccess(currentUser.id, existingIssue.workspaceId);

    if (!hasAccess) {
      return NextResponse.json(
        { error: "You don't have permission to update this issue" },
        { status: 403 }
      );
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
      const referenceError = await validateIssueReferences(tx, existingIssue.workspaceId, projectId, {
        id: existingIssue.id,
        assigneeId: body.assigneeId,
        reporterId: body.reporterId,
        parentId: body.parentId !== undefined ? body.parentId : moving ? existingIssue.parentId : undefined,
        labels: labelIds,
      });
      if (referenceError) return { error: referenceError, status: 400 };
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

      const permissions = await checkUserPermissions(currentUser.id, existingIssue.workspaceId, [
        Permission.EDIT_ANY_TASK, Permission.EDIT_SELF_TASK,
        Permission.CHANGE_TASK_STATUS, Permission.ASSIGN_TASK
      ]);
      const canEdit = canActOnOwnContent(existingIssue.reporterId, currentUser.id,
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

      const issue = await tx.issue.update({
        where: { id: existingIssue.id },
        data: {
          ...updateData,
          ...(labelIds ? { labels: { set: labelIds.map(id => ({ id })) } } : {})
        },
        include: getStandardIssueInclude(currentUser.id)
      });
      if (assigneeChanged && issue.assigneeId) {
        await tx.issueAssignee.upsert({
          where: { issueId_userId: { issueId: existingIssue.id, userId: issue.assigneeId } },
          create: {
            issueId: existingIssue.id, userId: issue.assigneeId,
            role: "ASSIGNEE", status: "APPROVED", assignedAt: new Date(),
            approvedAt: new Date(), approvedBy: currentUser.id
          },
          update: { role: "ASSIGNEE", status: "APPROVED", approvedAt: new Date(), approvedBy: currentUser.id }
        });
      }
      return { issue };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    const updatedIssue = result.issue;

    // Track activities for changed fields (Issue-centric)
    let changes: any[] = [];
    try {
      // Handle assignee changes separately with proper user name resolution
      if (assigneeChanged) {
        const oldAssignee = oldIssue.assigneeId ? await prisma.user.findUnique({
          where: { id: oldIssue.assigneeId },
          select: { id: true, name: true }
        }) : null;
        
        const newAssignee = updatedIssue.assigneeId ? await prisma.user.findUnique({
          where: { id: updatedIssue.assigneeId },
          select: { id: true, name: true }
        }) : null;
        
        // Use the specialized trackAssignment function
        await trackAssignment({
          itemType: 'ISSUE',
          itemId: updatedIssue.id,
          userId: currentUser.id,
          workspaceId: updatedIssue.workspaceId,
          oldAssigneeId: oldAssignee?.id || null,
          assigneeId: newAssignee?.id || null,
        });
      }

      // Handle reporter changes separately with proper user name resolution
      const reporterChanged = oldIssue.reporterId !== updatedIssue.reporterId;
      if (reporterChanged) {
        const oldReporter = oldIssue.reporterId ? await prisma.user.findUnique({
          where: { id: oldIssue.reporterId },
          select: { id: true, name: true }
        }) : null;
        
        const newReporter = updatedIssue.reporterId ? await prisma.user.findUnique({
          where: { id: updatedIssue.reporterId },
          select: { id: true, name: true }
        }) : null;
        
        // Create specialized reporter change activity
        await createActivity({
          itemType: 'ISSUE',
          itemId: updatedIssue.id,
          action: 'REPORTER_CHANGED',
          userId: currentUser.id,
          workspaceId: updatedIssue.workspaceId,
          details: {
            oldReporter,
            newReporter,
            changedAt: new Date().toISOString(),
          },
          fieldName: 'reporterId',
          oldValue: oldReporter?.id || null,
          newValue: newReporter?.id || null,
        });
      }

      // Handle status changes separately with proper FK relations
      const statusChanged = oldIssue.statusId !== updatedIssue.statusId;
      if (statusChanged) {
        await trackStatusChange({
          itemType: 'ISSUE',
          itemId: updatedIssue.id,
          userId: currentUser.id,
          workspaceId: updatedIssue.workspaceId,
          projectId: updatedIssue.projectId,
          oldStatusId: oldIssue.statusId || null,
          newStatusId: updatedIssue.statusId || null,
          oldStatusName: oldIssue.status || null,
          newStatusName: updatedIssue.status || null,
        });
      }

      // Track other field changes (excluding assigneeId, reporterId, and status since we handled them above)
      const fieldsToTrack = [
        'title',
        'description',
        'priority',
        'dueDate',
        'storyPoints',
        'type',
        'color',
        'parentId'
      ];

      // Use the existing compareObjects function to detect changes
      changes = compareObjects(oldIssue, updatedIssue, fieldsToTrack);

      if (changes.length > 0) {
        await trackFieldChanges({
          itemType: 'ISSUE',
          itemId: updatedIssue.id,
          userId: currentUser.id,
          workspaceId: updatedIssue.workspaceId,
          changes,
        });
      }
    } catch (e) {
      console.warn('Issue activity tracking failed:', e);
    }

    await publishEvent(`workspace:${updatedIssue.workspaceId}:events`, {
      type: 'issue.updated',
      workspaceId: updatedIssue.workspaceId,
      projectId: updatedIssue.projectId,
      issueId: updatedIssue.id,
      issueKey: updatedIssue.issueKey,
      status: updatedIssue.status ?? undefined,
      statusId: updatedIssue.statusId ?? undefined,
      statusValue: updatedIssue.statusValue ?? undefined,
      updatedAt: updatedIssue.updatedAt
    });

    // Mentions in updated description (notify tagged users)
    try {
      if (typeof (updateData as any).description === 'string' && (updateData as any).description.trim().length > 0) {
        const mentionedUserIds = extractMentionUserIds((updateData as any).description);
        const recipients = mentionedUserIds.filter((id: string) => id !== currentUser.id);
        if (recipients.length > 0) {
          await NotificationService.notifyUsers(
            recipients,
            NotificationType.ISSUE_MENTION,
            `@[${currentUser.name}](${currentUser.id}) mentioned you in an issue #[${updatedIssue.issueKey}](${updatedIssue.id})`,
            currentUser.id,
            { issueId: updatedIssue.id }
          );
        }
      }
    } catch (e) {
      console.warn('[ISSUES_PUT_MENTIONS]', e);
    }

    try {
      const recipientIds = new Set<string>();

      // Issue followers
      const followers = await prisma.issueFollower.findMany({
        where: { issueId: updatedIssue.id },
        select: { userId: true }
      });
      followers.forEach(f => recipientIds.add(f.userId));

      // Assignee and reporter
      if (updatedIssue.assigneeId) recipientIds.add(updatedIssue.assigneeId);
      if (updatedIssue.reporterId) recipientIds.add(updatedIssue.reporterId);

      // Project followers and type selection set
      const projectFollowerList = await prisma.projectFollower.findMany({
        where: { projectId: updatedIssue.projectId },
        select: { userId: true }
      });
      const pfSet = new Set(projectFollowerList.map(pf => pf.userId));
      projectFollowerList.forEach(pf => recipientIds.add(pf.userId));

      const actorId = currentUser.id;
      const recipients = Array.from(recipientIds).filter(id => id !== actorId);
      if (recipients.length > 0) {
        const content = `@[${currentUser.name}](${currentUser.id}) updated an issue #[${updatedIssue.issueKey}](${updatedIssue.id})`;
        const projectRecipients = recipients.filter((id) => pfSet.has(id));
        const standardRecipients = recipients.filter((id) => !pfSet.has(id));

        if (projectRecipients.length > 0) {
          await NotificationService.notifyUsers(
            projectRecipients,
            NotificationType.PROJECT_ISSUE_UPDATED,
            content,
            actorId,
            { issueId: updatedIssue.id }
          );
        }
        if (standardRecipients.length > 0) {
          await NotificationService.notifyUsers(
            standardRecipients,
            NotificationType.ISSUE_UPDATED,
            content,
            actorId,
            { issueId: updatedIssue.id }
          );
        }
      }
    } catch (notificationError) {
      console.warn('[ISSUES_PUT_NOTIFY]', notificationError);
    }

    // Emit webhook event for issue update
    try {
      await emitIssueUpdated(
        updatedIssue,
        changes, // Include the changes that were made
        {
          userId: currentUser.id,
          workspaceId: updatedIssue.workspaceId,
          workspaceName: updatedIssue.workspace?.name || '',
          workspaceSlug: updatedIssue.workspace?.slug || '',
          source: 'api'
        },
        { async: true } // Don't block the response
      );
    } catch (webhookError) {
      console.warn('[ISSUES_PUT_WEBHOOK]', webhookError);
    }

    return NextResponse.json({ issue: updatedIssue });

  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2034', 'P2002'].includes(error.code)) {
      return NextResponse.json({ error: 'Issue update conflict; reload and retry' }, { status: 409 });
    }
    console.error("Error updating issue:", error);
    return NextResponse.json(
      { 
        error: "Internal server error",
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      },
      { status: 500 }
    );
  }
}

// DELETE /api/issues/[issueId] - Delete issue
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ issueId: string }> }
) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { issueId } = await params;
    const url = new URL(req.url);
    const workspaceId = url.searchParams.get('workspaceId');

    // Find the issue first, scoped to user's accessible workspaces
    const existingIssue = await findIssueByIdOrKey(issueId, {
      workspaceId: workspaceId || undefined,
      userId: currentUser.id
    });

    if (!existingIssue) {
      return NextResponse.json({ error: "Issue not found" }, { status: 404 });
    }
    
    // Get full issue data with workspace for webhook
    const issueWithWorkspace = await prisma.issue.findUnique({
      where: { id: existingIssue.id },
      include: { workspace: { select: { id: true, name: true, slug: true } } }
    });

    // Check workspace access and ownership
    const hasAccess = await userHasWorkspaceAccess(currentUser.id, existingIssue.workspaceId);

    if (!hasAccess) {
      return NextResponse.json(
        { error: "You don't have permission to delete this issue" },
        { status: 403 }
      );
    }

    const permissions = await checkUserPermissions(currentUser.id, existingIssue.workspaceId, [
      Permission.DELETE_ANY_TASK, Permission.DELETE_SELF_TASK
    ]);
    if (!canActOnOwnContent(existingIssue.reporterId, currentUser.id,
      permissions[Permission.DELETE_ANY_TASK].hasPermission,
      permissions[Permission.DELETE_SELF_TASK].hasPermission)) {
      return NextResponse.json({ error: 'No permission to delete this issue' }, { status: 403 });
    }

    // Prepare notifications before deletion
    let deletionRecipients: string[] = [];
    try {
      const recipientIds = new Set<string>();
      // Issue followers
      const followers = await prisma.issueFollower.findMany({
        where: { issueId: existingIssue.id },
        select: { userId: true }
      });
      followers.forEach(f => recipientIds.add(f.userId));
      // Assignee and reporter
      if ((existingIssue as any).assigneeId) recipientIds.add((existingIssue as any).assigneeId as string);
      if ((existingIssue as any).reporterId) recipientIds.add((existingIssue as any).reporterId as string);
      // Project followers
      const projectFollowers = await prisma.projectFollower.findMany({
        where: { projectId: (existingIssue as any).projectId as string },
        select: { userId: true }
      });
      projectFollowers.forEach((pf: { userId: string }) => recipientIds.add(pf.userId));
      deletionRecipients = Array.from(recipientIds).filter(id => id !== currentUser.id);
    } catch (prepErr) {
      console.warn('[ISSUES_DELETE_NOTIFY_PREP]', prepErr);
    }

    // Emit webhook event before deletion (while we still have the data)
    try {
      await emitIssueDeleted(
        existingIssue,
        {
          userId: currentUser.id,
          workspaceId: existingIssue.workspaceId,
          workspaceName: issueWithWorkspace?.workspace?.name || '',
          workspaceSlug: issueWithWorkspace?.workspace?.slug || '',
          source: 'api'
        },
        { async: true } // Don't block the deletion
      );
    } catch (webhookError) {
      console.warn('[ISSUES_DELETE_WEBHOOK]', webhookError);
    }

    // Delete the issue
    await prisma.issue.delete({
      where: { id: existingIssue.id }
    });

    // Send deletion notifications
    try {
      if (deletionRecipients.length > 0) {
        const projectFollowers = await prisma.projectFollower.findMany({
          where: { projectId: (existingIssue as any).projectId as string },
          select: { userId: true }
        });
        const pfSet = new Set(projectFollowers.map(pf => pf.userId));
        const content = `@[${currentUser.name}](${currentUser.id}) deleted an issue #[${(existingIssue as any).issueKey}](${existingIssue.id})`;

        const projectRecipients = deletionRecipients.filter((id) => pfSet.has(id));
        const standardRecipients = deletionRecipients.filter((id) => !pfSet.has(id));

        if (projectRecipients.length > 0) {
          await NotificationService.notifyUsers(
            projectRecipients,
            NotificationType.PROJECT_ISSUE_DELETED,
            content,
            currentUser.id,
            { issueId: existingIssue.id, workspaceId: existingIssue.workspaceId }
          );
        }
        if (standardRecipients.length > 0) {
          await NotificationService.notifyUsers(
            standardRecipients,
            NotificationType.ISSUE_DELETED,
            content,
            currentUser.id,
            { issueId: existingIssue.id, workspaceId: existingIssue.workspaceId }
          );
        }
      }
    } catch (notificationError) {
      console.warn('[ISSUES_DELETE_NOTIFY]', notificationError);
    }

    return NextResponse.json({ message: "Issue deleted successfully" });

  } catch (error) {
    console.error("Error deleting issue:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}