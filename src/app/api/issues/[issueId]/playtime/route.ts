import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { ActivityService } from "@/lib/activity-service";
import { findIssueByIdOrKey } from "@/lib/issue-finder";

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

    // Resolve issue by key or id with workspace scoping
    const issue = await findIssueByIdOrKey(issueId, {
      userId: currentUser.id,
      select: { id: true, workspaceId: true }
    });

    if (!issue) {
      return NextResponse.json({ error: "Issue not found" }, { status: 404 });
    }

    // Access is already validated by findIssueByIdOrKey with userId

    // Use ActivityService to get time spent on this issue
    // For now, we'll use the same logic as tasks since the system is being migrated
    const timeSpent = await ActivityService.getTaskTimeSpent(issue.id, currentUser.id);
    
    return NextResponse.json(timeSpent);
  } catch (error) {
    console.error("[ISSUE_PLAYTIME_GET]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
