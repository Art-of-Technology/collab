import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

export const dynamic = 'force-dynamic';

// GET /api/users/[userId]/assigned-issues - Get assigned issues for a user
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { userId } = await params;
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspaceId');

    if (!workspaceId) {
      return NextResponse.json({ error: "Workspace ID is required" }, { status: 400 });
    }

    // Check if user has access to this workspace
    const hasAccess = await prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        OR: [
          { ownerId: currentUser.id },
          { members: { some: { userId: currentUser.id } } },
        ],
      },
    });

    if (!hasAccess) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Fetch issues assigned to the user in the workspace
    const issues = await prisma.issue.findMany({
      where: {
        workspaceId: workspaceId,
        assigneeId: userId,
      },
      include: {
        assignee: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
        project: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json({
      issues: issues.map(issue => ({
        id: issue.id,
        title: issue.title,
        issueKey: issue.issueKey,
        priority: issue.priority,
        status: issue.status,
        type: issue.type,
        projectId: issue.projectId,
        createdAt: issue.createdAt,
        assignee: issue.assignee,
        project: issue.project,
      })),
    });
  } catch (error) {
    console.error("[ASSIGNED_ISSUES_GET]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
