import { Prisma } from '@prisma/client';
import { checkUserPermissions, canActOnOwnContent, Permission } from '@/lib/permissions';
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { trackFieldChanges, createActivity, compareObjects, trackAssignment, trackStatusChange } from "@/lib/board-item-activity-service";
import { publishEvent } from '@/lib/redis';
import { extractMentionUserIds } from "@/utils/mentions";
import { NotificationService, NotificationType } from "@/lib/notification-service";
import { emitIssueUpdated, emitIssueDeleted } from "@/lib/event-bus";
import { findIssueByIdOrKey, STANDARD_ISSUE_INCLUDE, userHasWorkspaceAccess } from "@/lib/issue-finder";
import { updateIssue } from "@/lib/issue-mutation";

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
      include: STANDARD_ISSUE_INCLUDE
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
    const result = await updateIssue(currentUser.id, issueId,
      await req.json().catch(() => null), new URL(req.url).searchParams.get('workspaceId') || undefined);
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    const { issue: updatedIssue, oldIssue, assigneeChanged, updateData } = result;

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
            { issueId: (existingIssue as any).id as string }
          );
        }
        if (standardRecipients.length > 0) {
          await NotificationService.notifyUsers(
            standardRecipients,
            NotificationType.ISSUE_DELETED,
            content,
            currentUser.id,
            { issueId: (existingIssue as any).id as string }
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