import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

export const dynamic = 'force-dynamic';

// GET /api/tasks/[taskId] - Get task details
export async function GET(
  req: NextRequest,
  { params }: { params: { taskId: string } }
) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { taskId } = params;
    
    // Check if taskId is an issue key (e.g., WZB-1)
    const isIssueKey = /^[A-Z]+-\d+$/.test(taskId);
  
    // Fetch the task either by ID or issue key
    const task = isIssueKey 
      ? await prisma.task.findFirst({
          where: { issueKey: taskId },
          include: {
            assignee: true,
            reporter: true,
            column: true,
            taskBoard: true,
            workspace: true,
            labels: true,
            comments: {
              include: {
                author: true,
              },
              orderBy: {
                createdAt: "desc",
              },
            },
            attachments: true,
          },
        })
      : await prisma.task.findUnique({
          where: { id: taskId },
          include: {
            assignee: true,
            reporter: true,
            column: true,
            taskBoard: true,
            workspace: true,
            labels: true,
            comments: {
              include: {
                author: true,
              },
              orderBy: {
                createdAt: "desc",
              },
            },
            attachments: true,
          },
        });

    if (!task) {
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404 }
      );
    }
    
    // Check if user has access to the workspace
    const hasAccess = await prisma.workspaceMember.findFirst({
      where: {
        userId: currentUser.id,
        workspaceId: task.workspaceId,
      },
    });

    if (!hasAccess) {
      return NextResponse.json(
        { error: "You don't have access to this task" },
        { status: 403 }
      );
    }
    
    // Transform attachments to match the component interface
    const transformedTask = {
      ...task,
      attachments: task.attachments.map(attachment => ({
        id: attachment.id,
        name: attachment.fileName,
        url: attachment.fileUrl
      }))
    };

    return NextResponse.json(transformedTask);
  } catch (error) {
    console.error("Error fetching task:", error);
    return NextResponse.json(
      { error: "Failed to fetch task" },
      { status: 500 }
    );
  }
} 