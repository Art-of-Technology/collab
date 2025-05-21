import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authConfig } from "@/lib/auth";

export async function GET(
  req: Request,
  { params }: { params: { taskId: string } }
) {
  const session = await getServerSession(authConfig);
  if (!session?.user?.id) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { taskId } = params;
  const userId = session.user.id; // User ID for authorization, though playtime is for the task itself

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
            userId_workspaceId: {
                userId: userId,
                workspaceId: task.workspaceId,
            },
        },
    });

    if (!isWorkspaceOwner && !workspaceMember) {
        return new NextResponse("Forbidden: You are not authorized to access this task's playtime.", { status: 403 });
    }

    const activities = await prisma.taskActivity.findMany({
      where: {
        taskId,
        action: {
          in: ["TASK_PLAY_STARTED", "TASK_PLAY_PAUSED", "TASK_PLAY_STOPPED"],
        },
      },
      orderBy: { createdAt: "asc" }, // Important to process in chronological order
    });

    let totalPlayTimeMs = 0;
    let lastStartTime: Date | null = null;

    for (const activity of activities) {
      const activityTime = new Date(activity.createdAt);
      const details = activity.details ? JSON.parse(activity.details) : {};
      const eventTimestamp = details.timestamp ? new Date(details.timestamp) : activityTime;

      if (activity.action === "TASK_PLAY_STARTED") {
        if (lastStartTime === null) { // Only start if not already started
          lastStartTime = eventTimestamp;
        }
      } else if (activity.action === "TASK_PLAY_PAUSED" || activity.action === "TASK_PLAY_STOPPED") {
        if (lastStartTime) {
          totalPlayTimeMs += eventTimestamp.getTime() - lastStartTime.getTime();
          lastStartTime = null; // Reset start time after pause or stop
        }
      }
    }

    // If the task is currently playing (last action was PLAY_STARTED and no PAUSE/STOP followed)
    // add the time from the last start to now.
    if (lastStartTime) {
        const lastActivity = activities[activities.length -1];
        if(lastActivity && lastActivity.action === "TASK_PLAY_STARTED") {
            totalPlayTimeMs += new Date().getTime() - lastStartTime.getTime();
        }
    }

    const totalSeconds = Math.floor(totalPlayTimeMs / 1000);
    const days = Math.floor(totalSeconds / (3600 * 24));
    const hours = Math.floor((totalSeconds % (3600 * 24)) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return NextResponse.json({
      totalPlayTimeMs,
      formattedTime: `${days > 0 ? days + 'd ' : ''}${hours}h ${minutes}m ${seconds}s`,
      days,
      hours,
      minutes,
      seconds
    });

  } catch (error) {
    console.error("[TASK_PLAYTIME_GET]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
} 