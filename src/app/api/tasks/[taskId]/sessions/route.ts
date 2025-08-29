import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { formatDurationDetailed } from "@/utils/duration";

export interface TaskSession {
  id: string;
  user: {
    id: string;
    name: string;
    image?: string;
    useCustomAvatar?: boolean;
    avatarSkinTone?: number;
    avatarEyes?: number;
    avatarBrows?: number;
    avatarMouth?: number;
    avatarNose?: number;
    avatarHair?: number;
    avatarEyewear?: number;
    avatarAccessory?: number;
  };
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

    // Get all user events for this task with user info (from all users)
    const userEvents = await prisma.userEvent.findMany({
      where: {
        taskId,
        eventType: { in: ['TASK_START', 'TASK_PAUSE', 'TASK_STOP'] },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            image: true,
            useCustomAvatar: true,
            avatarSkinTone: true,
            avatarEyes: true,
            avatarBrows: true,
            avatarMouth: true,
            avatarNose: true,
            avatarHair: true,
            avatarEyewear: true,
            avatarAccessory: true,
          },
        },
      },
      orderBy: [{ startedAt: 'asc' }, { userId: 'asc' }],
    });

    // Group events into sessions by user
    const sessions: TaskSession[] = [];
    const userSessionStates: Record<string, any> = {}; // Track ongoing sessions per user

    for (let i = 0; i < userEvents.length; i++) {
      const event = userEvents[i];
      const currentUserId = event.userId;

      if (event.eventType === 'TASK_START') {
        userSessionStates[currentUserId] = event;
      } else if (
        (event.eventType === 'TASK_PAUSE' || event.eventType === 'TASK_STOP') &&
        userSessionStates[currentUserId]
      ) {
        const currentStart = userSessionStates[currentUserId];
        const durationMs = event.startedAt.getTime() - currentStart.startedAt.getTime();
        const oneMinuteMs = 60 * 1000; // 1 minute in milliseconds

        // Skip sessions shorter than 1 minute (these are test sessions)
        if (durationMs < oneMinuteMs) {
          userSessionStates[currentUserId] = null;
          continue;
        }

        // Check if either start or end event has been edited
        const isAdjusted = !!(event.metadata as any)?.editedAt || !!(currentStart.metadata as any)?.editedAt;

        // Check if this is a pause followed by a stop (user paused then completed work)
        let effectiveEventType = event.eventType;
        if (event.eventType === 'TASK_PAUSE') {
          // Look ahead to see if the next event for this user is a TASK_STOP without a TASK_START in between
          const nextUserEvent = userEvents.slice(i + 1).find(e => e.userId === currentUserId);
          if (nextUserEvent && nextUserEvent.eventType === 'TASK_STOP') {
            // This pause was followed by a stop, so treat it as stopped
            effectiveEventType = 'TASK_STOP';
          }
        }

        sessions.push({
          id: `${currentStart.id}-${event.id}`,
          user: {
            id: currentStart.user.id,
            name: currentStart.user.name || '',
            image: currentStart.user.image || undefined,
            useCustomAvatar: currentStart.user.useCustomAvatar || false,
            avatarSkinTone: currentStart.user.avatarSkinTone || undefined,
            avatarEyes: currentStart.user.avatarEyes || undefined,
            avatarBrows: currentStart.user.avatarBrows || undefined,
            avatarMouth: currentStart.user.avatarMouth || undefined,
            avatarNose: currentStart.user.avatarNose || undefined,
            avatarHair: currentStart.user.avatarHair || undefined,
            avatarEyewear: currentStart.user.avatarEyewear || undefined,
            avatarAccessory: currentStart.user.avatarAccessory || undefined,
          },
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
          formattedDuration: formatDurationDetailed(durationMs),
          isOngoing: false,
          isAdjusted,
          adjustmentInfo: isAdjusted ? {
            originalEndTime: (event.metadata as any).originalEndTime || event.startedAt.toISOString(),
            adjustmentReason: (event.metadata as any).editReason || (currentStart.metadata as any)?.editReason || 'Session edited',
            adjustmentMs: (event.metadata as any).adjustmentMs || 0,
            adjustedAt: (event.metadata as any).editedAt || (currentStart.metadata as any)?.editedAt,
          } : undefined,
        });

        userSessionStates[currentUserId] = null;
      }
    }

    // Handle ongoing sessions for each user
    Object.entries(userSessionStates).forEach(([, currentStart]) => {
      if (currentStart) {
        const durationMs = Date.now() - currentStart.startedAt.getTime();
        sessions.push({
          id: `${currentStart.id}-ongoing`,
          user: {
            id: currentStart.user.id,
            name: currentStart.user.name || '',
            image: currentStart.user.image || undefined,
            useCustomAvatar: currentStart.user.useCustomAvatar || false,
            avatarSkinTone: currentStart.user.avatarSkinTone || undefined,
            avatarEyes: currentStart.user.avatarEyes || undefined,
            avatarBrows: currentStart.user.avatarBrows || undefined,
            avatarMouth: currentStart.user.avatarMouth || undefined,
            avatarNose: currentStart.user.avatarNose || undefined,
            avatarHair: currentStart.user.avatarHair || undefined,
            avatarEyewear: currentStart.user.avatarEyewear || undefined,
            avatarAccessory: currentStart.user.avatarAccessory || undefined,
          },
          startEvent: {
            id: currentStart.id,
            startedAt: currentStart.startedAt,
            description: currentStart.description,
            metadata: currentStart.metadata,
          },
          durationMs,
          formattedDuration: formatDurationDetailed(durationMs),
          isOngoing: true,
          isAdjusted: false,
        });
      }
    });

    // Calculate total time
    const totalTimeMs = sessions.reduce((total, session) => total + session.durationMs, 0);

    return NextResponse.json({
      sessions: sessions.reverse(), // Most recent first
      totalTimeMs,
      formattedTotalTime: formatDurationDetailed(totalTimeMs),
    });

  } catch (error) {
    console.error("[TASK_SESSIONS_GET]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

