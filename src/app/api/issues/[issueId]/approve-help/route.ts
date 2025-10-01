import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import * as BoardItemActivityService from "@/lib/board-item-activity-service";
import { findIssueByIdOrKey } from "@/lib/issue-finder";
import { NotificationService } from "@/lib/notification-service";

// POST /api/issues/[issueId]/approve-help - Approve or reject a help request
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
    const body = await request.json();
    const { helperId, action } = body;

    if (!helperId || !action || !['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: "Invalid request parameters" }, { status: 400 });
    }

    // Resolve issue by key or id with workspace scoping
    const issue = await findIssueByIdOrKey(issueId, {
      userId: currentUser.id,
      include: { 
        assignee: { select: { id: true, name: true } },
        reporter: { select: { id: true, name: true } },
        workspace: { select: { id: true } }
      }
    });

    if (!issue) {
      return NextResponse.json({ error: "Issue not found" }, { status: 404 });
    }

    // Check if user can approve helpers (must be assignee or reporter)
    if (currentUser.id !== issue.assigneeId && currentUser.id !== issue.reporterId) {
      return NextResponse.json({ error: "You don't have permission to approve helpers for this issue" }, { status: 403 });
    }

    // Access check: user must be in workspace
    const hasAccess = await prisma.workspace.findFirst({
      where: {
        id: issue.workspaceId,
        OR: [
          { ownerId: currentUser.id },
          { members: { some: { userId: currentUser.id } } },
        ],
      },
    });

    if (!hasAccess) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Get helper user info
    const helper = await prisma.user.findUnique({
      where: { id: helperId },
      select: { id: true, name: true }
    });

    if (!helper) {
      return NextResponse.json({ error: "Helper not found" }, { status: 404 });
    }

    // Find the helper assignment
    const helperAssignment = await prisma.issueAssignee.findUnique({
      where: {
        issueId_userId: {
          issueId: issue.id,
          userId: helperId
        }
      }
    });

    if (!helperAssignment) {
      return NextResponse.json({ error: "Helper assignment not found" }, { status: 404 });
    }

    if (helperAssignment.status !== "PENDING") {
      return NextResponse.json({ error: "This help request has already been processed" }, { status: 400 });
    }

    // Update the helper assignment status
    await prisma.issueAssignee.update({
      where: {
        issueId_userId: {
          issueId: issue.id,
          userId: helperId
        }
      },
      data: {
        status: action === "approve" ? "APPROVED" : "REJECTED",
        approvedAt: action === "approve" ? new Date() : null,
        approvedBy: action === "approve" ? currentUser.id : null
      }
    });

    // Log activity for help approval/rejection
    await BoardItemActivityService.createActivity({
      itemType: "ISSUE",
      itemId: issue.id,
      action: action === "approve" ? "HELP_REQUEST_APPROVED" : "HELP_REQUEST_REJECTED",
      userId: currentUser.id,
      workspaceId: issue.workspaceId,
      details: {
        approverName: currentUser.name,
        helperName: helper.name,
        action: action
      }
    });

    // Create notification for the helper
    await NotificationService.notifyUsers(
      [helperId],
      action === "approve" ? "ISSUE_HELP_APPROVED" : "ISSUE_HELP_REJECTED",
      `Your help request for issue "${issue.title}" (${issue.issueKey || issue.id}) has been ${action}d by ${currentUser.name}`,
      currentUser.id,
      { issueId: issue.id }
    );

    return NextResponse.json({ 
      message: `Help request ${action}d successfully`,
      action: action
    });

  } catch (error) {
    console.error("[ISSUE_APPROVE_HELP]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
