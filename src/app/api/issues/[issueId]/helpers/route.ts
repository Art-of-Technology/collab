import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { findIssueByIdOrKey } from "@/lib/issue-finder";

// GET /api/issues/[issueId]/helpers - Get all helpers for an issue
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

    // Fetch all helper assignments for this issue
    const helpers = await prisma.issueAssignee.findMany({
      where: { issueId: issue.id },
      include: { 
        user: { 
          select: { 
            id: true, 
            name: true, 
            image: true 
          } 
        } 
      },
      orderBy: { assignedAt: "desc" }
    });

    return NextResponse.json({ helpers });
  } catch (error) {
    console.error("[ISSUE_HELPERS_GET]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
