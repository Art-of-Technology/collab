import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { ActivityService } from "@/lib/activity-service";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const status = await ActivityService.getCurrentStatus(session.user.id);

    return NextResponse.json({
      success: true,
      status: status || {
        currentStatus: "AVAILABLE",
        isAvailable: true,
        statusStartedAt: new Date(),
      },
    });
  } catch (error) {
    console.error("Error getting user status:", error);
    return NextResponse.json(
      { error: "Failed to get user status" },
      { status: 500 }
    );
  }
} 