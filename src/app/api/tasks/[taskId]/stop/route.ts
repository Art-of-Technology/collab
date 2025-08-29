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
        status: true,
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

    // Calculate session duration
    const now = new Date();
    const sessionDurationMs = now.getTime() - currentStartEvent.startedAt.getTime();
    const oneMinuteMs = 60 * 1000; // 1 minute in milliseconds

    // If session is less than 1 minute, delete the start event instead of creating a stop event
    if (sessionDurationMs < oneMinuteMs) {
      await prisma.userEvent.delete({
        where: { id: currentStartEvent.id },
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
        message: "Short session removed (less than 1 minute)",
        sessionRemoved: true,
        sessionDurationMs,
        startEventDeleted: {
          id: currentStartEvent.id,
          startedAt: currentStartEvent.startedAt,
        },
      });
    }

    // Create the stop event for sessions longer than 1 minute
    const stopEvent = await prisma.userEvent.create({
      data: {
        userId,
        taskId,
        eventType: 'TASK_STOP',
        startedAt: now,
        description: 'Session stopped normally',
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
      message: "Session stopped successfully",
      sessionRemoved: false,
      sessionDurationMs,
      stopEvent: {
        id: stopEvent.id,
        startedAt: stopEvent.startedAt,
      },
    });

  } catch (error) {
    console.error("[TASK_STOP]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
} 