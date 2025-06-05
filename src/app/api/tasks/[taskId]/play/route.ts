import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { ActivityService } from "@/lib/activity-service";
import { EventType } from "@prisma/client";

export async function POST(
  req: Request,
  { params }: { params: { taskId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { taskId } = params;
  const userId = session.user.id;

  if (!taskId) {
    return new NextResponse("Task ID is required", { status: 400 });
  }

  try {
    const task = await prisma.task.findUnique({
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
      taskId,
      description: `Started working on ${task.title}`,
      metadata: { taskTitle: task.title, issueKey: task.issueKey },
    });

    return NextResponse.json(userEvent, { status: 201 });
  } catch (error) {
    console.error("[TASK_PLAY_POST]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
} 