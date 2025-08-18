import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { EventType } from "@prisma/client";

export const dynamic = 'force-dynamic';

// POST /api/issues/[issueId]/stop-with-adjustment - Stop issue session with time adjustment
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ issueId: string }> }
) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { issueId } = await params;
    const body = await request.json();
    const {
      adjustedStartTime,
      adjustedEndTime,
      adjustedDurationMs,
      originalDurationMs,
      adjustmentReason,
    } = body;

    // Validate the issue exists and user has access
    const issue = await prisma.issue.findUnique({
      where: { id: issueId },
      include: {
        workspace: {
          select: {
            id: true,
            ownerId: true,
            members: {
              where: { userId: currentUser.id },
              select: { userId: true },
            },
          },
        },
      },
    });

    if (!issue) {
      return NextResponse.json({ error: "Issue not found" }, { status: 404 });
    }

    // Check workspace access
    const hasAccess = issue.workspace.ownerId === currentUser.id || 
                     issue.workspace.members.length > 0;

    if (!hasAccess) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Find the current active task start event for this user and issue
    const activeTaskStartEvent = await prisma.userEvent.findFirst({
      where: {
        userId: currentUser.id,
        taskId: issueId,
        eventType: EventType.TASK_START,
      },
      orderBy: { startedAt: 'desc' },
    });

    if (!activeTaskStartEvent) {
      return NextResponse.json({ error: "No active session found" }, { status: 400 });
    }

    const adjustedStartDate = new Date(adjustedStartTime);
    const adjustedEndDate = new Date(adjustedEndTime);

    // Validation
    if (adjustedStartDate >= adjustedEndDate) {
      return NextResponse.json({ error: "Start time must be before end time" }, { status: 400 });
    }

    if (adjustedEndDate > new Date()) {
      return NextResponse.json({ error: "End time cannot be in the future" }, { status: 400 });
    }

    if (adjustedDurationMs <= 0) {
      return NextResponse.json({ error: "Duration must be greater than 0" }, { status: 400 });
    }

    // Update the start event with adjusted start time
    await prisma.userEvent.update({
      where: { id: activeTaskStartEvent.id },
      data: {
        startedAt: adjustedStartDate,
        description: `${activeTaskStartEvent.description || 'Working on issue'} (Time adjusted: ${adjustmentReason})`,
      },
    });

    // Create TASK_STOP event with adjusted end time
    await prisma.userEvent.create({
      data: {
        userId: currentUser.id,
        taskId: issueId,
        eventType: EventType.TASK_STOP,
        description: `Session stopped with time adjustment: ${adjustmentReason}`,
        metadata: {
          originalDurationMs,
          adjustedDurationMs,
          adjustmentReason,
          originalStartTime: activeTaskStartEvent.startedAt.toISOString(),
          adjustedStartTime: adjustedStartDate.toISOString(),
          adjustedEndTime: adjustedEndDate.toISOString(),
          timeAdjusted: true,
        },
        startedAt: adjustedEndDate,
      },
    });

    return NextResponse.json({
      success: true,
      adjustedDurationMs,
      message: "Session stopped and adjusted successfully",
    });

  } catch (error) {
    console.error("[ISSUE_STOP_WITH_ADJUSTMENT]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
