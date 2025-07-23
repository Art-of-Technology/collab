import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { validateMCPToken } from "@/lib/mcp-auth";

// GET /api/tasks/[taskId]/comments - Get all comments for a task
export async function GET(
  request: NextRequest,
  { params }: { params: { taskId: string } }
) {
  try {
    // Support both NextAuth sessions and MCP tokens
    let user = null;
    
    // Try MCP token authentication first
    try {
      const mcpUser = await validateMCPToken(request);
      if (mcpUser) {
        user = mcpUser;
      }
    } catch (error) {
      // If MCP token fails, try NextAuth session
      const session = await getServerSession(authOptions);
      if (session?.user?.email) {
        user = await prisma.user.findUnique({
          where: {
            email: session.user.email
          }
        });
      }
    }

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const taskId = params.taskId;

    // Check if taskId is an issue key (e.g., MA-120)
    const isIssueKey = /^[A-Z]+-\d+$/.test(taskId);

    // Find the task to check workspace access
    const task = isIssueKey 
      ? await prisma.task.findFirst({
          where: { issueKey: taskId },
          select: { id: true, workspaceId: true },
        })
      : await prisma.task.findUnique({
          where: { id: taskId },
          select: { id: true, workspaceId: true },
        });

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // Check if user has access to the workspace
    const hasAccess = await prisma.workspaceMember.findFirst({
      where: {
        userId: user.id,
        workspaceId: task.workspaceId,
      },
    });

    if (!hasAccess) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Get comments for the task
    const comments = await prisma.taskComment.findMany({
      where: {
        taskId: task.id, // Use the actual database ID
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
        reactions: {
          include: {
            author: {
              select: {
                id: true,
                name: true,
                image: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json(comments);
  } catch (error) {
    console.error("Error fetching task comments:", error);
    return NextResponse.json(
      { error: "Failed to fetch comments" },
      { status: 500 }
    );
  }
}

// POST /api/tasks/[taskId]/comments - Create a new comment
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    // Support both NextAuth sessions and MCP tokens
    let user = null;
    
    // Try MCP token authentication first
    try {
      const mcpUser = await validateMCPToken(request);
      if (mcpUser) {
        user = mcpUser;
      }
    } catch (error) {
      // If MCP token fails, try NextAuth session
      const session = await getServerSession(authOptions);
      if (session?.user?.email) {
        user = await prisma.user.findUnique({
          where: {
            email: session.user.email
          }
        });
      }
    }

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const taskId = (await params).taskId;
    const { content, html, parentId } = await request.json();

    if (!content) {
      return NextResponse.json(
        { error: "Comment content is required" },
        { status: 400 }
      );
    }

    // Check if taskId is an issue key (e.g., MA-120)
    const isIssueKey = /^[A-Z]+-\d+$/.test(taskId);

    // Find the task to check workspace access
    const task = isIssueKey 
      ? await prisma.task.findFirst({
          where: { issueKey: taskId },
          select: { id: true, workspaceId: true },
        })
      : await prisma.task.findUnique({
          where: { id: taskId },
          select: { id: true, workspaceId: true },
        });

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // Check if user has access to the workspace
    const hasAccess = await prisma.workspaceMember.findFirst({
      where: {
        userId: user.id,
        workspaceId: task.workspaceId,
      },
    });

    if (!hasAccess) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // If parentId is provided, make sure it exists and belongs to the same task
    if (parentId) {
      const parentComment = await prisma.taskComment.findFirst({
        where: {
          id: parentId,
          taskId: task.id, // Use the actual database ID
        },
      });

      if (!parentComment) {
        return NextResponse.json(
          { error: "Parent comment not found" },
          { status: 404 }
        );
      }
    }

    // Create the comment
    const comment = await prisma.taskComment.create({
      data: {
        content,
        html,
        authorId: user.id,
        taskId: task.id, // Use the actual database ID
        parentId,
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
        reactions: true,
      },
    });

    return NextResponse.json(comment);
  } catch (error) {
    console.error("Error creating task comment:", error);
    return NextResponse.json(
      { error: "Failed to create comment" },
      { status: 500 }
    );
  }
} 