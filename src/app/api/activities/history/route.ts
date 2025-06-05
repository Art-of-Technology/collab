import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { ActivityService } from "@/lib/activity-service";
import { EventType } from "@prisma/client";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "50");
    const startDate = searchParams.get("startDate") 
      ? new Date(searchParams.get("startDate")!) 
      : undefined;
    const endDate = searchParams.get("endDate") 
      ? new Date(searchParams.get("endDate")!) 
      : undefined;
    const eventTypesParam = searchParams.get("eventTypes");
    const eventTypes = eventTypesParam 
      ? eventTypesParam.split(",") as EventType[]
      : undefined;

    const history = await ActivityService.getActivityHistory(session.user.id, {
      limit,
      startDate,
      endDate,
      eventTypes,
    });

    return NextResponse.json({
      success: true,
      history,
    });
  } catch (error) {
    console.error("Error getting activity history:", error);
    return NextResponse.json(
      { error: "Failed to get activity history" },
      { status: 500 }
    );
  }
} 