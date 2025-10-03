import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { trackFieldChanges, createActivity, compareObjects, trackAssignment } from "@/lib/board-item-activity-service";
import { publishEvent } from '@/lib/redis';
import { extractMentionUserIds } from "@/utils/mentions";
import { NotificationService, NotificationType } from "@/lib/notification-service";
import { findIssueByIdOrKey, STANDARD_ISSUE_INCLUDE, userHasWorkspaceAccess } from "@/lib/issue-finder";

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
    const body = await req.json();
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

    // Handle status updates to work with new ProjectStatus system
    let updateData = { ...body, updatedAt: new Date() };

    // Normalize type casing if provided
    if (typeof updateData.type === 'string') {
      updateData.type = updateData.type.toUpperCase();
    }
    
    // Handle labels relation updates
    let relationalUpdates: any = {};
    if (Array.isArray(body.labels)) {
      // Handle both arrays of IDs and arrays of label objects
      const labelIds = body.labels.map((label: any) => 
        typeof label === 'string' ? label : label.id
      ).filter(Boolean);
      
      relationalUpdates.labels = {
        set: labelIds.map((id: string) => ({ id }))
      };
      delete (updateData as any).labels;
    }
    
    // If status or statusValue is being updated, find the corresponding ProjectStatus
    if (body.status || body.statusValue) {
      const statusValue = body.status || body.statusValue;
      
      // Find the ProjectStatus record for this status in this project
      // Try multiple ways to find the status: by name, displayName, or similar variations
      const projectStatus = await prisma.projectStatus.findFirst({
        where: {
          projectId: existingIssue.projectId,
          OR: [
            { name: statusValue },
            { displayName: statusValue },
            // Handle case variations and underscore/space differences
            { name: statusValue.toLowerCase().replace(/\s+/g, '_') },
            { displayName: statusValue.toLowerCase().replace(/\s+/g, '_') },
            { name: statusValue.toLowerCase().replace(/_/g, ' ') },
            { displayName: statusValue.toLowerCase().replace(/_/g, ' ') }
          ],
          isActive: true
        }
      });
      
      if (projectStatus) {
        // Update both statusId and statusValue for the new system
        updateData.statusId = projectStatus.id;
        updateData.statusValue = projectStatus.name; // Use the canonical name
        updateData.status = projectStatus.name; // Keep legacy field for compatibility
      } else {
        // No ProjectStatus found, just update the legacy status field
        updateData.status = statusValue;
        updateData.statusValue = statusValue;
        console.warn(`No ProjectStatus found for status "${statusValue}" in project ${existingIssue.projectId}`);
      }
    }

    // Capture old issue for activity comparison
    const oldIssue = existingIssue;

    // Handle assignee changes - create/update IssueAssignee record
    const assigneeChanged = body.assigneeId !== undefined && body.assigneeId !== oldIssue.assigneeId;
    
    // Update the issue and handle assignee changes in a transaction
    const updatedIssue = await prisma.$transaction(async (tx) => {
      // Update the issue
      const issue = await tx.issue.update({
        where: { id: existingIssue.id },
        data: {
          ...updateData,
          ...(Object.keys(relationalUpdates).length > 0 ? relationalUpdates : {}),
        },
          include: STANDARD_ISSUE_INCLUDE
      });

      // Handle assignee changes - create/update IssueAssignee records
      if (assigneeChanged) {
        // Create new assignee record if assigned to someone
        if (issue.assigneeId) {
          await tx.issueAssignee.upsert({
            where: {
              issueId_userId: {
                issueId: existingIssue.id,
                userId: issue.assigneeId
              }
            },
            create: {
              issueId: existingIssue.id,
              userId: issue.assigneeId,
              role: "ASSIGNEE",
              status: "APPROVED", // Assignees are automatically approved
              assignedAt: new Date(),
              approvedAt: new Date(),
              approvedBy: currentUser.id
            },
            update: {
              role: "ASSIGNEE", // If they were a helper, promote them to assignee
              status: "APPROVED",
              approvedAt: new Date(),
              approvedBy: currentUser.id
            }
          });
        }
      }

      return issue;
    });

    // Track activities for changed fields (Issue-centric)
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
        await trackAssignment(
          'ISSUE',
          updatedIssue.id,
          currentUser.id,
          updatedIssue.workspaceId,
          oldAssignee ? { id: oldAssignee.id, name: oldAssignee.name || 'Unknown User' } : null,
          newAssignee ? { id: newAssignee.id, name: newAssignee.name || 'Unknown User' } : null
        );
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

      // Track other field changes (excluding assigneeId and reporterId since we handled them above)
      const fieldsToTrack = [
        'title',
        'description',
        'status',
        'priority',
        'columnId',
        'dueDate',
        'storyPoints',
        'type',
        'color',
        'parentId'
      ];
      
      // Use the existing compareObjects function to detect changes
      const changes = compareObjects(oldIssue, updatedIssue, fieldsToTrack);

      if (changes.length > 0) {
        await trackFieldChanges(
          'ISSUE',
          updatedIssue.id,
          currentUser.id,
          updatedIssue.workspaceId,
          changes
        );
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
      columnId: updatedIssue.columnId ?? undefined,
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

      // Board followers via legacy column->board mapping, if any
      if (updatedIssue.columnId) {
        const column = await prisma.taskColumn.findUnique({
          where: { id: updatedIssue.columnId },
          select: { taskBoardId: true }
        });
        if (column?.taskBoardId) {
          const boardFollowers = await prisma.boardFollower.findMany({
            where: { boardId: column.taskBoardId },
            select: { userId: true }
          });
          boardFollowers.forEach(bf => recipientIds.add(bf.userId));
        }
      }

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

    return NextResponse.json({ issue: updatedIssue });

  } catch (error) {
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

    // Check workspace access and ownership
    const hasAccess = await userHasWorkspaceAccess(currentUser.id, existingIssue.workspaceId);

    if (!hasAccess) {
      return NextResponse.json(
        { error: "You don't have permission to delete this issue" },
        { status: 403 }
      );
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
      // Board followers via legacy column->board mapping, if any
      if ((existingIssue as any).columnId) {
        const column = await prisma.taskColumn.findUnique({
          where: { id: (existingIssue as any).columnId as string },
          select: { taskBoardId: true }
        });
        if (column?.taskBoardId) {
          const boardFollowers = await prisma.boardFollower.findMany({
            where: { boardId: column.taskBoardId },
            select: { userId: true }
          });
          boardFollowers.forEach(bf => recipientIds.add(bf.userId));
        }
      }
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