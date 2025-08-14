import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { ActivityService } from "@/lib/activity-service";

export const dynamic = 'force-dynamic';

// GET /api/issues/[issueId]/playtime - Get total play time for an issue
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ issueId: string }> }
) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { issueId } = await params;

    // Resolve issue by key or id
    const isIssueKey = /^[A-Z]+-\d+$/.test(issueId);
    const issue = isIssueKey
      ? await prisma.issue.findFirst({ where: { issueKey: issueId }, select: { id: true, workspaceId: true } })
      : await prisma.issue.findUnique({ where: { id: issueId }, select: { id: true, workspaceId: true } });

    if (!issue) {
      return NextResponse.json({ error: "Issue not found" }, { status: 404 });
    }

    // Check if user has access to this workspace
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

    // Use ActivityService to get time spent on this issue
    // For now, we'll use the same logic as tasks since the system is being migrated
    const timeSpent = await ActivityService.getTaskTimeSpent(issue.id, currentUser.id);
    
    return NextResponse.json(timeSpent);
  } catch (error) {
    console.error("[ISSUE_PLAYTIME_GET]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
