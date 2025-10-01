import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import * as BoardItemActivityService from "@/lib/board-item-activity-service";
import { findIssueByIdOrKey, userHasWorkspaceAccess } from "@/lib/issue-finder";
import { NotificationService } from "@/lib/notification-service";

// POST /api/issues/[issueId]/request-help - Request to help with an issue
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ issueId: string }> }
) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { issueId } = await params;

    // Resolve issue by key or id with workspace scoping
    const issue = await findIssueByIdOrKey(issueId, {
      userId: currentUser.id,
      include: { 
        assignee: { select: { id: true, name: true } },
        reporter: { select: { id: true, name: true } }
      }
    });

    if (!issue) {
      return NextResponse.json({ error: "Issue not found" }, { status: 404 });
    }

    // Access is already validated by findIssueByIdOrKey with userId

    // Check if user is already the assignee
    if (issue.assigneeId === currentUser.id) {
      return NextResponse.json({ error: "You are already the assignee of this issue" }, { status: 400 });
    }

    // Check if user already has a helper assignment for this issue
    const existingAssignment = await prisma.issueAssignee.findUnique({
      where: {
        issueId_userId: {
          issueId: issue.id,
          userId: currentUser.id
        }
      }
    });

    // Only block if there's already a pending request
    if (existingAssignment && existingAssignment.status === "PENDING") {
      return NextResponse.json({ error: "You already have a pending help request for this issue" }, { status: 400 });
    }

    // If user is already an approved helper, they can start working without requesting again
    if (existingAssignment && existingAssignment.status === "APPROVED") {
      return NextResponse.json({ 
        message: "You are already approved to help with this issue",
        status: "approved"
      });
    }

    // Create or update helper request
    if (existingAssignment && existingAssignment.status === "REJECTED") {
      // User was previously rejected, update existing record to pending
      await prisma.issueAssignee.update({
        where: {
          issueId_userId: {
            issueId: issue.id,
            userId: currentUser.id
          }
        },
        data: {
          status: "PENDING",
          approvedAt: null,
          approvedBy: null,
          assignedAt: new Date() // Update the request time
        }
      });
    } else {
      // Create new helper request
      await prisma.issueAssignee.create({
        data: {
          issueId: issue.id,
          userId: currentUser.id,
          role: "HELPER",
          status: "PENDING"
        }
      });
    }
    
    // Log activity for help request
    await BoardItemActivityService.createActivity({
      itemType: "ISSUE",
      itemId: issue.id,
      action: "HELP_REQUEST_SENT",
      userId: currentUser.id,
      workspaceId: issue.workspaceId,
      details: {
        requesterName: currentUser.name,
        assigneeName: issue.assignee?.name,
        reporterName: issue.reporter?.name
      }
    });

    // Create notification for assignee and reporter  
    const notificationRecipients = [issue.assigneeId, issue.reporterId].filter(id => id && id !== currentUser.id) as string[];
    if (notificationRecipients.length > 0) {
      await NotificationService.notifyUsers(
        notificationRecipients,
        'ISSUE_HELP_REQUEST',
        `${currentUser.name} requested to help with issue: ${issue.title} (${issue.issueKey || issue.id})`,
        currentUser.id,
        { issueId: issue.id }
      );
    }

    return NextResponse.json({ 
      message: "Help request sent successfully",
      status: "pending" // Placeholder status
    });

  } catch (error) {
    console.error("[ISSUE_REQUEST_HELP]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
