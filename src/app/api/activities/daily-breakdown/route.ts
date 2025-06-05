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

    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get("date");
    const date = dateParam ? new Date(dateParam) : new Date();

    const breakdown = await ActivityService.getDailyTimeBreakdown(
      session.user.id,
      date
    );

    return NextResponse.json({
      success: true,
      breakdown,
      date: date.toISOString(),
    });
  } catch (error) {
    console.error("Error getting daily breakdown:", error);
    return NextResponse.json(
      { error: "Failed to get daily breakdown" },
      { status: 500 }
    );
  }
} 