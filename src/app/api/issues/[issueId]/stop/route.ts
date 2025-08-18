import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { EventType } from "@prisma/client";

export const dynamic = 'force-dynamic';

// POST /api/issues/[issueId]/stop - Stop issue session normally
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

    // Create TASK_STOP event
    const endTime = new Date();
    await prisma.userEvent.create({
      data: {
        userId: currentUser.id,
        taskId: issueId,
        eventType: EventType.TASK_STOP,
        description: "Session stopped",
        startedAt: endTime,
      },
    });

    const sessionDurationMs = endTime.getTime() - activeTaskStartEvent.startedAt.getTime();

    return NextResponse.json({
      success: true,
      sessionDurationMs,
      message: "Session stopped successfully",
    });

  } catch (error) {
    console.error("[ISSUE_STOP]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
