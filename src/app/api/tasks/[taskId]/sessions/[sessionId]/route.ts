import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { formatDurationDetailed } from "@/utils/duration";
import { BoardItemActivityService } from "@/lib/board-item-activity-service";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ taskId: string; sessionId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const _params = await params;
  const { taskId, sessionId } = _params;
  const userId = session.user.id;

  if (!taskId || !sessionId) {
    return new NextResponse("Task ID and Session ID are required", { status: 400 });
  }

  try {
    const { startTime, endTime, reason } = await req.json();

    if (!startTime || !endTime) {
      return new NextResponse("Start time and end time are required", { status: 400 });
    }

    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      return new NextResponse("Reason is required", { status: 400 });
    }

    const startDate = new Date(startTime);
    const endDate = new Date(endTime);
    const now = new Date();

    // Basic validation: start must be before end
    if (startDate >= endDate) {
      return new NextResponse("Start time must be before end time", { status: 400 });
    }

    // Prevent future timestamps
    if (startDate > now) {
      return new NextResponse("Start time cannot be in the future", { status: 400 });
    }

    if (endDate > now) {
      return new NextResponse("End time cannot be in the future", { status: 400 });
    }

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        workspace: true,
      },
    });

    if (!task) {
      return new NextResponse("Task not found", { status: 404 });
    }

    // Permission check
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

    // Parse session ID to get start and end event IDs
    const [startEventId, endEventId] = sessionId.split('-');
    
    if (!startEventId || (!endEventId || endEventId === 'ongoing')) {
      return new NextResponse("Cannot edit ongoing session", { status: 400 });
    }

    // Get the current events
    const startEvent = await prisma.userEvent.findUnique({
      where: { id: startEventId },
    });

    const endEvent = await prisma.userEvent.findUnique({
      where: { id: endEventId },
    });

    if (!startEvent || !endEvent) {
      return new NextResponse("Session events not found", { status: 404 });
    }

    if (startEvent.userId !== userId || endEvent.userId !== userId) {
      return new NextResponse("You can only edit your own sessions", { status: 403 });
    }

    // Get all user events for this task to check for overlaps
    const allUserEvents = await prisma.userEvent.findMany({
      where: {
        taskId,
        userId,
        eventType: { in: ['TASK_START', 'TASK_PAUSE', 'TASK_STOP'] },
      },
      orderBy: { startedAt: 'asc' },
    });

    // Find the current session's position and check for overlaps
    const startEventIndex = allUserEvents.findIndex(e => e.id === startEventId);
    const endEventIndex = allUserEvents.findIndex(e => e.id === endEventId);

    if (startEventIndex === -1 || endEventIndex === -1) {
      return new NextResponse("Session events not found in timeline", { status: 404 });
    }

    // Check against previous session (if exists)
    if (startEventIndex > 0) {
      const prevEvent = allUserEvents[startEventIndex - 1];
      if (prevEvent.eventType === 'TASK_STOP' || prevEvent.eventType === 'TASK_PAUSE') {
        if (startDate <= prevEvent.startedAt) {
          return new NextResponse(
            `Start time cannot be earlier than or equal to the previous session's end time (${prevEvent.startedAt.toISOString()})`,
            { status: 400 }
          );
        }
      }
    }

    // Check against next session (if exists)
    if (endEventIndex < allUserEvents.length - 1) {
      const nextEvent = allUserEvents[endEventIndex + 1];
      if (nextEvent.eventType === 'TASK_START') {
        if (endDate >= nextEvent.startedAt) {
          return new NextResponse(
            `End time cannot be later than or equal to the next session's start time (${nextEvent.startedAt.toISOString()})`,
            { status: 400 }
          );
        }
      }
    }

    // Calculate original and new durations
    const originalDurationMs = endEvent.startedAt.getTime() - startEvent.startedAt.getTime();
    const newDurationMs = endDate.getTime() - startDate.getTime();
    const adjustmentMs = newDurationMs - originalDurationMs;

    // Update the events with new timestamps
    await prisma.$transaction(async (tx) => {
      // Update start event
      await tx.userEvent.update({
        where: { id: startEventId },
        data: {
          startedAt: startDate,
          metadata: {
            ...((startEvent.metadata as any) || {}),
            editedAt: new Date().toISOString(),
            originalStartTime: startEvent.startedAt.toISOString(),
            editReason: reason.trim(),
          },
        },
      });

      // Update end event
      await tx.userEvent.update({
        where: { id: endEventId },
        data: {
          startedAt: endDate,
          metadata: {
            ...((endEvent.metadata as any) || {}),
            editedAt: new Date().toISOString(),
            originalEndTime: endEvent.startedAt.toISOString(),
            editReason: reason.trim(),
            adjustmentMs,
          },
        },
      });

      // Create detailed audit log
      await BoardItemActivityService.createTaskActivity(
        taskId,
        userId,
        'SESSION_EDITED',
        {
          type: 'session_edit',
          sessionId,
          reason: reason.trim(),
          editedAt: new Date().toISOString(),
          oldValue: JSON.stringify({
            startTime: startEvent.startedAt.toISOString(),
            endTime: endEvent.startedAt.toISOString(),
            duration: formatDurationDetailed(originalDurationMs),
            durationMs: originalDurationMs,
          }),
          newValue: JSON.stringify({
            startTime: startDate.toISOString(),
            endTime: endDate.toISOString(),
            duration: formatDurationDetailed(newDurationMs),
            durationMs: newDurationMs,
          }),
          changes: {
            startTimeChanged: startEvent.startedAt.getTime() !== startDate.getTime(),
            endTimeChanged: endEvent.startedAt.getTime() !== endDate.getTime(),
            durationChange: {
              ms: adjustmentMs,
              formatted: `${adjustmentMs >= 0 ? '+' : ''}${formatDurationDetailed(Math.abs(adjustmentMs))}`,
              isIncrease: adjustmentMs > 0,
            },
          },
        }
      );
    });

    return NextResponse.json({
      success: true,
      message: `Session updated successfully`,
      sessionEdit: {
        sessionId,
        originalDurationMs,
        newDurationMs,
        adjustmentMs,
        originalDuration: formatDurationDetailed(originalDurationMs),
        newDuration: formatDurationDetailed(newDurationMs),
        adjustment: `${adjustmentMs >= 0 ? '+' : ''}${formatDurationDetailed(adjustmentMs)}`,
        reason: reason.trim(),
      },
    });

  } catch (error) {
    console.error("[SESSION_EDIT_PATCH]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
} 