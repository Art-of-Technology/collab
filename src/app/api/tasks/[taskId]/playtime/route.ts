import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { ActivityService } from "@/lib/activity-service";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const _params = await params;
  const { taskId } = _params;
  const userId = session.user.id; // User ID for authorization and personal time tracking

  if (!taskId) {
    return new NextResponse("Task ID is required", { status: 400 });
  }

  try {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        workspace: true, // For permission checking
      },
    });

    if (!task) {
      return new NextResponse("Task not found", { status: 404 });
    }

    // Permission check: User must be part of the workspace or its owner
    const isWorkspaceOwner = task.workspace.ownerId === userId;
    const workspaceMember = await prisma.workspaceMember.findUnique({
      where: {
        status: true,
        userId_workspaceId: {
          userId: userId,
          workspaceId: task.workspaceId,
        },
      },
    });

    if (!isWorkspaceOwner && !workspaceMember) {
      return new NextResponse("Forbidden: You are not authorized to access this task's playtime.", { status: 403 });
    }

    // Use the new activity service to get task time spent by the current user
    const timeSpent = await ActivityService.getTaskTimeSpent(taskId, userId);

    return NextResponse.json(timeSpent);

  } catch (error) {
    console.error("[TASK_PLAYTIME_GET]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
} 