import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authConfig } from "@/lib/auth";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const session = await getServerSession(authConfig);
  if (!session?.user?.id) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const _params = await params;
  const { taskId } = _params;

  try {
    // Check if task exists and user has access to the workspace
    const task = await prisma.task.findFirst({
      where: {
        id: taskId,
        workspace: {
          OR: [
            { ownerId: session.user.id },
            { members: { some: { userId: session.user.id } } }
          ]
        }
      }
    });

    if (!task) {
      return new NextResponse("Task not found or access denied", { status: 404 });
    }

    // Fetch all task assignees (including helpers)
    const taskAssignees = await prisma.taskAssignee.findMany({
      where: {
        taskId: taskId
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            image: true
          }
        }
      },
      orderBy: [
        { role: 'asc' }, // ASSIGNEE first, then HELPER
        { assignedAt: 'asc' }
      ]
    });

    // Calculate actual time worked for each helper from user events
    const helpersWithActualTime = await Promise.all(
      taskAssignees.map(async (assignee) => {
        // Get all time-tracking events for this user on this task
        const events = await prisma.userEvent.findMany({
          where: {
            taskId: taskId,
            userId: assignee.userId,
            eventType: { in: ['TASK_START', 'TASK_PAUSE', 'TASK_STOP'] },
          },
          orderBy: { startedAt: 'asc' },
        });

        // Calculate total time from events
        let totalMs = 0;
        let currentStart: Date | null = null;

        for (const event of events) {
          if (event.eventType === 'TASK_START') {
            currentStart = event.startedAt;
          } else if (
            (event.eventType === 'TASK_PAUSE' || event.eventType === 'TASK_STOP') &&
            currentStart
          ) {
            const duration = event.startedAt.getTime() - currentStart.getTime();
            totalMs += duration;
            currentStart = null;
          }
        }

        return {
          ...assignee,
          totalTimeWorked: totalMs, // Use calculated time instead of cached value
        };
      })
    );

    return NextResponse.json({ helpers: helpersWithActualTime });
  } catch (error) {
    console.error("[TASK_HELPERS_GET]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
} 