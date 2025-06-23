import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { formatDurationUI } from "@/utils/duration";
import { BoardItemActivityService } from "@/lib/board-item-activity-service";

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
    const { newDurationMs, reason, originalDurationMs } = await req.json();

    if (typeof newDurationMs !== 'number' || newDurationMs <= 0) {
      return new NextResponse("Invalid duration", { status: 400 });
    }

    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      return new NextResponse("Reason is required", { status: 400 });
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

    // Permission check: User must be part of the workspace
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
      return new NextResponse("Forbidden: You are not authorized to adjust time for this task.", { status: 403 });
    }

    // Calculate the adjustment amount
    const adjustmentMs = newDurationMs - originalDurationMs;
    const isReduction = adjustmentMs < 0;

    const originalFormatted = formatDurationUI(originalDurationMs);
    const newFormatted = formatDurationUI(newDurationMs);
    const adjustmentFormatted = formatDurationUI(adjustmentMs);

    // Create a time adjustment activity record
    await BoardItemActivityService.createTaskActivity(
      taskId,
      userId,
      'TIME_ADJUSTED',
      {
        type: 'manual_adjustment',
        originalDurationMs,
        newDurationMs,
        adjustmentMs,
        originalFormatted,
        newFormatted,
        adjustmentFormatted,
        reason: reason.trim(),
        isReduction,
        adjustedAt: new Date().toISOString(),
      }
    );

    // Session-based approach: Find the most recent session and adjust it
    // This maintains data integrity while allowing precise time adjustments
    
    if (adjustmentMs !== 0) {
      // Get all user events for this task to find sessions that can be adjusted
      const userEvents = await prisma.userEvent.findMany({
        where: {
          taskId,
          userId,
          eventType: { in: ['TASK_START', 'TASK_PAUSE', 'TASK_STOP'] },
        },
        orderBy: { startedAt: 'desc' },
      });

      // Find the most recent completed session to adjust
      let adjustedSessionFound = false;
      
      for (let i = 0; i < userEvents.length - 1; i++) {
        const endEvent = userEvents[i];
        const startEvent = userEvents[i + 1];
        
        // Look for a STOP/PAUSE followed by a START (most recent session)
        if (
          (endEvent.eventType === 'TASK_STOP' || endEvent.eventType === 'TASK_PAUSE') &&
          startEvent.eventType === 'TASK_START'
        ) {
          const sessionDurationMs = endEvent.startedAt.getTime() - startEvent.startedAt.getTime();
          const newSessionDurationMs = sessionDurationMs + adjustmentMs;
          
          if (newSessionDurationMs > 0) {
            // Adjust the session by modifying the end time
            const newEndTime = new Date(startEvent.startedAt.getTime() + newSessionDurationMs);
            
            await prisma.userEvent.update({
              where: { id: endEvent.id },
              data: {
                startedAt: newEndTime,
                metadata: {
                  ...((endEvent.metadata as any) || {}),
                  editedAt: new Date().toISOString(),
                  originalEndTime: endEvent.startedAt.toISOString(),
                  editReason: reason.trim(),
                  adjustmentMs,
                },
              },
            });
            
            adjustedSessionFound = true;
            break;
          }
        }
      }
      
      // If no existing session could be adjusted, create a new adjustment session
      if (!adjustedSessionFound && adjustmentMs > 0) {
        // Create a new session with the adjustment time
        const now = new Date();
        const sessionStart = new Date(now.getTime() - adjustmentMs);
        
        await prisma.userEvent.create({
          data: {
            userId,
            eventType: 'TASK_START',
            taskId,
            startedAt: sessionStart,
            description: `Manual time adjustment session`,
            metadata: {
              type: 'manual_adjustment_session',
              reason: reason.trim(),
              adjustmentMs,
              originalDurationMs,
              newDurationMs,
            },
          },
        });
        
        await prisma.userEvent.create({
          data: {
            userId,
            eventType: 'TASK_STOP',
            taskId,
            startedAt: now,
            description: `Manual time adjustment session end`,
            metadata: {
              type: 'manual_adjustment_session',
              reason: reason.trim(),
              adjustmentMs,
              originalDurationMs,
              newDurationMs,
            },
          },
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Time adjusted from ${originalFormatted} to ${newFormatted}`,
      adjustment: {
        originalDurationMs,
        newDurationMs,
        adjustmentMs,
        reason: reason.trim(),
        isReduction,
      },
    });

  } catch (error) {
    console.error("[TASK_ADJUST_TIME_POST]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
} 