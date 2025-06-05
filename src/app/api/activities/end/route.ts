import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { ActivityService } from "@/lib/activity-service";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { description } = await request.json();

    const userEvent = await ActivityService.endCurrentActivity(
      session.user.id,
      description
    );

    return NextResponse.json({
      success: true,
      event: userEvent,
      message: "Activity ended successfully",
    });
  } catch (error) {
    console.error("Error ending activity:", error);
    return NextResponse.json(
      { error: "Failed to end activity" },
      { status: 500 }
    );
  }
} 