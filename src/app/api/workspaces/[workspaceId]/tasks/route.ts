import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { validateMCPToken } from "@/lib/mcp-auth";

// GET /api/workspaces/[workspaceId]/tasks - Get tasks in workspace
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const { workspaceId } = await params;
    const { searchParams } = new URL(request.url);
    const assigneeId = searchParams.get('assigneeId');
    const limit = parseInt(searchParams.get('limit') || '50');

    // First try MCP token authentication
    const mcpUser = await validateMCPToken(request);
    let currentUserId: string | null = null;

    if (mcpUser) {
      currentUserId = mcpUser.id;
    } else {
      // Fall back to NextAuth session authentication
      const session = await getServerSession(authOptions);
      
      if (!session?.user?.email) {
        return NextResponse.json(
          { error: "Unauthorized" },
          { status: 401 }
        );
      }

      // Get user ID from session
      const sessionUser = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true }
      });

      if (!sessionUser) {
        return NextResponse.json(
          { error: "User not found" },
          { status: 404 }
        );
      }

      currentUserId = sessionUser.id;
    }

    // Check if user has access to this workspace
    const workspace = await prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        OR: [
          { ownerId: currentUserId },
          { members: { some: { userId: currentUserId } } }
        ]
      },
    });

    if (!workspace) {
      return NextResponse.json(
        { error: "Workspace not found or access denied" },
        { status: 404 }
      );
    }

    // Build query conditions
    const whereConditions: any = {
      workspaceId: workspaceId,
    };

    // If assigneeId is provided, filter by assignee
    // If not provided and MCP user, default to current user's tasks
    if (assigneeId) {
      whereConditions.assigneeId = assigneeId;
    } else if (mcpUser) {
      // For MCP requests, default to current user's tasks
      whereConditions.assigneeId = currentUserId;
    }

    // Get tasks
    const tasks = await prisma.task.findMany({
      where: whereConditions,
      include: {
        assignee: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
        reporter: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
        taskBoard: {
          select: {
            id: true,
            name: true,
            issuePrefix: true,
          },
        },
        workspace: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        column: {
          select: {
            id: true,
            name: true,
          },
        },
        labels: {
          select: {
            id: true,
            name: true,
            color: true,
          },
        },
        _count: {
          select: {
            comments: true,
            attachments: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
    });

    return NextResponse.json(tasks);
  } catch (error) {
    console.error("Error fetching workspace tasks:", error);
    return NextResponse.json(
      { error: "Failed to fetch tasks" },
      { status: 500 }
    );
  }
} 