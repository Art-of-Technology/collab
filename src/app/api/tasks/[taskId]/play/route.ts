import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { ActivityService } from "@/lib/activity-service";
import { EventType } from "@prisma/client";
import { validateMCPToken } from "@/lib/mcp-auth";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  // Support both NextAuth sessions and MCP tokens
  let currentUser = null;
  
  // Try MCP token authentication first
  try {
    const mcpUser = await validateMCPToken(req);
    if (mcpUser) {
      currentUser = mcpUser;
    }
  } catch (error) {
    // If MCP token fails, try NextAuth session
    const session = await getServerSession(authOptions);
    if (session?.user?.email) {
      currentUser = await prisma.user.findUnique({
        where: {
          email: session.user.email
        }
      });
    }
  }

  if (!currentUser) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { taskId } = await params;
  const userId = currentUser.id;

  if (!taskId) {
    return new NextResponse("Task ID is required", { status: 400 });
  }

  try {
    // Check if taskId is an issue key (e.g., MA-120)
    const isIssueKey = /^[A-Z]+-\d+$/.test(taskId);
    
    // Fetch the task either by ID or issue key
    const task = isIssueKey 
      ? await prisma.task.findFirst({
          where: { issueKey: taskId },
        })
      : await prisma.task.findUnique({
          where: { id: taskId },
        });

    if (!task) {
      return new NextResponse("Task not found", { status: 404 });
    }

    // Check if user is part of the workspace
    const workspaceMember = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId,
          workspaceId: task.workspaceId,
        },
      },
    });

    if (!workspaceMember && task.reporterId !== userId && task.assigneeId !== userId) {
        // Allow reporter or assignee even if not a general workspace member
        // (though typically they would be members)
        const workspace = await prisma.workspace.findUnique({ where: { id: task.workspaceId } });
        if (workspace?.ownerId !== userId) {
            return new NextResponse("Forbidden: You are not authorized to perform this action on this task's workspace.", { status: 403 });
        }
    }

    // Use the new activity service to start task
    const userEvent = await ActivityService.startActivity({
      userId,
      eventType: EventType.TASK_START,
      taskId: task.id, // Use the actual database ID
      description: `Started working on ${task.title}`,
      metadata: { taskTitle: task.title, issueKey: task.issueKey },
    });

    return NextResponse.json(userEvent, { status: 201 });
  } catch (error) {
    console.error("[TASK_PLAY_POST]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
} 