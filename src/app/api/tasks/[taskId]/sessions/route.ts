import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export interface TaskSession {
  id: string;
  startEvent: {
    id: string;
    startedAt: Date;
    description?: string;
    metadata?: any;
  };
  endEvent?: {
    id: string;
    startedAt: Date;
    eventType: 'TASK_STOP' | 'TASK_PAUSE';
    description?: string;
    metadata?: any;
  };
  durationMs: number;
  formattedDuration: string;
  isOngoing: boolean;
  isAdjusted: boolean;
  adjustmentInfo?: {
    originalEndTime: string;
    adjustmentReason: string;
    adjustmentMs: number;
    adjustedAt: string;
  };
}

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
  const userId = session.user.id;

  if (!taskId) {
    return new NextResponse("Task ID is required", { status: 400 });
  }

  try {
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

    // Get all user events for this task
    const userEvents = await prisma.userEvent.findMany({
      where: {
        taskId,
        userId,
        eventType: { in: ['TASK_START', 'TASK_PAUSE', 'TASK_STOP'] },
      },
      orderBy: { startedAt: 'asc' },
    });

    // Group events into sessions
    const sessions: TaskSession[] = [];
    let currentStart: any = null;

    for (let i = 0; i < userEvents.length; i++) {
      const event = userEvents[i];
      
      if (event.eventType === 'TASK_START') {
        currentStart = event;
      } else if (
        (event.eventType === 'TASK_PAUSE' || event.eventType === 'TASK_STOP') &&
        currentStart
      ) {
        const durationMs = event.startedAt.getTime() - currentStart.startedAt.getTime();
        // Check if either start or end event has been edited
        const isAdjusted = !!(event.metadata as any)?.editedAt || !!(currentStart.metadata as any)?.editedAt;
        
        // Check if this is a pause followed by a stop (user paused then completed work)
        let effectiveEventType = event.eventType;
        if (event.eventType === 'TASK_PAUSE') {
          // Look ahead to see if the next event is a TASK_STOP without a TASK_START in between
          const nextEvent = userEvents[i + 1];
          if (nextEvent && nextEvent.eventType === 'TASK_STOP') {
            // This pause was followed by a stop, so treat it as stopped
            effectiveEventType = 'TASK_STOP';
          }
        }
        
        sessions.push({
          id: `${currentStart.id}-${event.id}`,
          startEvent: {
            id: currentStart.id,
            startedAt: currentStart.startedAt,
            description: currentStart.description || undefined,
            metadata: currentStart.metadata,
          },
          endEvent: {
            id: event.id,
            startedAt: event.startedAt,
            eventType: effectiveEventType as 'TASK_STOP' | 'TASK_PAUSE',
            description: event.description || undefined,
            metadata: event.metadata,
          },
          durationMs,
          formattedDuration: formatDuration(durationMs),
          isOngoing: false,
          isAdjusted,
          adjustmentInfo: isAdjusted ? {
            originalEndTime: (event.metadata as any).originalEndTime || event.startedAt.toISOString(),
            adjustmentReason: (event.metadata as any).editReason || (currentStart.metadata as any)?.editReason || 'Session edited',
            adjustmentMs: (event.metadata as any).adjustmentMs || 0,
            adjustedAt: (event.metadata as any).editedAt || (currentStart.metadata as any)?.editedAt,
          } : undefined,
        });
        
        currentStart = null;
      }
    }

    // Handle ongoing session
    if (currentStart) {
      const durationMs = Date.now() - currentStart.startedAt.getTime();
      sessions.push({
        id: `${currentStart.id}-ongoing`,
        startEvent: {
          id: currentStart.id,
          startedAt: currentStart.startedAt,
          description: currentStart.description,
          metadata: currentStart.metadata,
        },
        durationMs,
        formattedDuration: formatDuration(durationMs),
        isOngoing: true,
        isAdjusted: false,
      });
    }

    // Calculate total time
    const totalTimeMs = sessions.reduce((total, session) => total + session.durationMs, 0);

    return NextResponse.json({
      sessions: sessions.reverse(), // Most recent first
      totalTimeMs,
      formattedTotalTime: formatDuration(totalTimeMs),
    });

  } catch (error) {
    console.error("[TASK_SESSIONS_GET]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

function formatDuration(ms: number): string {
  if (ms < 0) ms = 0;
  const totalSeconds = Math.floor(ms / 1000);
  const d = Math.floor(totalSeconds / (3600 * 24));
  const h = Math.floor((totalSeconds % (3600 * 24)) / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;

  if (d > 0) return `${d}d ${h}h ${m}m ${s}s`;
  return `${h}h ${m}m ${s}s`;
} 