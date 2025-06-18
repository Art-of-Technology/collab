import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const _params = await params;
  const { taskId } = _params;
  const userId = session.user.id;

  if (!taskId) {
    return new NextResponse("Task ID is required", { status: 400 });
  }

  try {
    const body = await req.json();
    const { adjustedDurationMs, originalDurationMs, adjustmentReason } = body;

    if (!adjustedDurationMs || !originalDurationMs || !adjustmentReason) {
      return new NextResponse("Missing required fields", { status: 400 });
    }

    // Verify the task exists and user has permission
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        workspace: true,
      },
    });

    if (!task) {
      return new NextResponse("Task not found", { status: 404 });
    }

    // Check if user has permission to work on this task
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
      return new NextResponse("Forbidden", { status: 403 });
    }

    // Find the current ongoing session (TASK_START without corresponding TASK_STOP)
    const currentStartEvent = await prisma.userEvent.findFirst({
      where: {
        userId,
        taskId,
        eventType: 'TASK_START',
      },
      orderBy: { startedAt: 'desc' },
    });

    if (!currentStartEvent) {
      return new NextResponse("No active session found", { status: 400 });
    }

    // Check if there's already a stop event for this start event
    const existingStopEvent = await prisma.userEvent.findFirst({
      where: {
        userId,
        taskId,
        eventType: { in: ['TASK_STOP', 'TASK_PAUSE'] },
        startedAt: { gt: currentStartEvent.startedAt },
      },
      orderBy: { startedAt: 'asc' },
    });

    if (existingStopEvent) {
      return new NextResponse("Session already stopped", { status: 400 });
    }

    // Calculate the adjusted end time based on the start time and adjusted duration
    const adjustedEndTime = new Date(currentStartEvent.startedAt.getTime() + adjustedDurationMs);
    const originalEndTime = new Date(currentStartEvent.startedAt.getTime() + originalDurationMs);

    // Create the stop event with adjustment metadata
    const stopEvent = await prisma.userEvent.create({
      data: {
        userId,
        taskId,
        eventType: 'TASK_STOP',
        startedAt: adjustedEndTime,
        description: `Session stopped with adjustment: ${adjustmentReason}`,
        metadata: {
          editedAt: new Date().toISOString(),
          editReason: adjustmentReason,
          originalEndTime: originalEndTime.toISOString(),
          adjustedEndTime: adjustedEndTime.toISOString(),
          originalDurationMs,
          adjustedDurationMs,
          adjustmentType: 'long_session_protection',
        },
      },
    });

    // Update user status to available
    await prisma.userStatus.upsert({
      where: { userId },
      update: {
        currentStatus: 'AVAILABLE',
        statusStartedAt: new Date(),
        currentTaskId: null,
        statusText: null,
      },
      create: {
        userId,
        currentStatus: 'AVAILABLE',
        statusStartedAt: new Date(),
        currentTaskId: null,
        statusText: null,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Session stopped and adjusted successfully",
      stopEvent: {
        id: stopEvent.id,
        startedAt: stopEvent.startedAt,
        adjustedDurationMs,
        originalDurationMs,
        adjustmentReason,
      },
    });

  } catch (error) {
    console.error("[STOP_WITH_ADJUSTMENT]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
} 