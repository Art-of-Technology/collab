import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

export const dynamic = 'force-dynamic';

// GET /api/workspaces/[workspaceId]/search-issues - Search issues in a workspace
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspaceId } = await params;
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');

    if (!query || query.trim().length < 1) {
      return NextResponse.json({ issues: [] });
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

    // Search issues by title, description, or issue key
    const issues = await prisma.issue.findMany({
      where: {
        workspaceId: workspaceId,
        OR: [
          {
            title: {
              contains: query,
              mode: 'insensitive',
            },
          },
          {
            description: {
              contains: query,
              mode: 'insensitive',
            },
          },
          {
            issueKey: {
              contains: query,
              mode: 'insensitive',
            },
          },
        ],
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
      orderBy: [
        {
          updatedAt: 'desc',
        },
      ],
      take: 20, // Limit results
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
    console.error("[SEARCH_ISSUES_GET]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
