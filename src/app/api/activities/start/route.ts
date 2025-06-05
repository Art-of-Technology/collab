import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { ActivityService } from "@/lib/activity-service";
import { EventType } from "@prisma/client";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { eventType, taskId, description, metadata, autoEndAt } = await request.json();

    // Validate eventType
    if (!Object.values(EventType).includes(eventType)) {
      return NextResponse.json(
        { error: "Invalid event type" },
        { status: 400 }
      );
    }

    const userEvent = await ActivityService.startActivity({
      userId: session.user.id,
      eventType,
      taskId,
      description,
      metadata,
      autoEndAt: autoEndAt ? new Date(autoEndAt) : undefined,
    });

    return NextResponse.json({
      success: true,
      event: userEvent,
      message: `Started ${eventType.toLowerCase().replace('_', ' ')}`,
    });
  } catch (error) {
    console.error("Error starting activity:", error);
    return NextResponse.json(
      { error: "Failed to start activity" },
      { status: 500 }
    );
  }
} 