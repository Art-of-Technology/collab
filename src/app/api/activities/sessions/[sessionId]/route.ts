import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { formatDurationDetailed } from "@/utils/duration";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const _params = await params;
  const { sessionId } = _params;
  const userId = session.user.id;

  if (!sessionId) {
    return new NextResponse("Session ID is required", { status: 400 });
  }

  try {
    const { startTime, endTime, reason, description } = await req.json();

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
          description: description !== undefined ? description : startEvent.description, // Only update if explicitly provided
          metadata: {
            ...((startEvent.metadata as any) || {}),
            editedAt: new Date().toISOString(),
            originalStartTime: startEvent.startedAt.toISOString(),
            editReason: reason.trim(),
            originalDescription: startEvent.description, // Preserve original for reference
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
    });

    return NextResponse.json({
      success: true,
      message: `Activity session updated successfully`,
      sessionEdit: {
        sessionId,
        originalDurationMs,
        newDurationMs,
        adjustmentMs,
        originalDuration: formatDurationDetailed(originalDurationMs),
        newDuration: formatDurationDetailed(newDurationMs),
        adjustment: `${adjustmentMs >= 0 ? '+' : ''}${formatDurationDetailed(Math.abs(adjustmentMs))}`,
        reason: reason.trim(),
      },
    });

  } catch (error) {
    console.error("[ACTIVITY_SESSION_EDIT_PATCH]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
} 