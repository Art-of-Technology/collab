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
    const { 
      adjustedStartTime, 
      adjustedEndTime, 
      adjustedDurationMs, 
      originalDurationMs, 
      adjustmentReason 
    } = body;

    // Support both new format (with start/end times) and legacy format (duration only)
    if (adjustedStartTime && adjustedEndTime) {
      // New format with start and end times
      if (!adjustedStartTime || !adjustedEndTime || !adjustmentReason) {
        return new NextResponse("Missing required fields for time-based adjustment", { status: 400 });
      }
    } else if (adjustedDurationMs) {
      // Legacy format with duration only
      if (!adjustedDurationMs || !originalDurationMs || !adjustmentReason) {
        return new NextResponse("Missing required fields for duration-based adjustment", { status: 400 });
      }
    } else {
      return new NextResponse("Either adjustedStartTime/adjustedEndTime or adjustedDurationMs must be provided", { status: 400 });
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

    let finalStartTime: Date;
    let finalEndTime: Date;
    let finalDurationMs: number;

    if (adjustedStartTime && adjustedEndTime) {
      // New format: use provided start and end times
      finalStartTime = new Date(adjustedStartTime);
      finalEndTime = new Date(adjustedEndTime);
      finalDurationMs = finalEndTime.getTime() - finalStartTime.getTime();
      
      // Validate times
      const now = new Date();
      if (finalStartTime > now || finalEndTime > now) {
        return new NextResponse("Start time and end time cannot be in the future", { status: 400 });
      }
      
      if (finalStartTime >= finalEndTime) {
        return new NextResponse("Start time must be before end time", { status: 400 });
      }
      
      if (finalDurationMs <= 0) {
        return new NextResponse("Session duration must be greater than 0", { status: 400 });
      }
    } else {
      // Legacy format: calculate end time based on current start time and adjusted duration
      finalStartTime = currentStartEvent.startedAt;
      finalDurationMs = adjustedDurationMs;
      finalEndTime = new Date(finalStartTime.getTime() + finalDurationMs);
    }

    const originalEndTime = new Date(currentStartEvent.startedAt.getTime() + (originalDurationMs || 0));

    // Update the start event if we have a new start time
    if (adjustedStartTime && finalStartTime.getTime() !== currentStartEvent.startedAt.getTime()) {
      await prisma.userEvent.update({
        where: { id: currentStartEvent.id },
        data: {
          startedAt: finalStartTime,
          metadata: {
            ...((currentStartEvent.metadata as any) || {}),
            editedAt: new Date().toISOString(),
            editReason: adjustmentReason,
            originalStartTime: currentStartEvent.startedAt.toISOString(),
          },
        },
      });
    }

    // Create the stop event with adjustment metadata
    const stopEvent = await prisma.userEvent.create({
      data: {
        userId,
        taskId,
        eventType: 'TASK_STOP',
        startedAt: finalEndTime,
        description: `Session stopped with adjustment: ${adjustmentReason}`,
        metadata: {
          editedAt: new Date().toISOString(),
          editReason: adjustmentReason,
          originalEndTime: originalEndTime.toISOString(),
          adjustedEndTime: finalEndTime.toISOString(),
          originalDurationMs: originalDurationMs || 0,
          adjustedDurationMs: finalDurationMs,
          adjustmentType: adjustedStartTime ? 'time_based_adjustment' : 'duration_based_adjustment',
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
        adjustedDurationMs: finalDurationMs,
        originalDurationMs: originalDurationMs || 0,
        adjustmentReason,
        adjustedStartTime: finalStartTime.toISOString(),
        adjustedEndTime: finalEndTime.toISOString(),
      },
    });

  } catch (error) {
    console.error("[STOP_WITH_ADJUSTMENT]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
} 