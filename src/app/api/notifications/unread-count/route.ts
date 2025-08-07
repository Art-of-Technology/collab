import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");

    if (!workspaceId) {
      return NextResponse.json({ error: "Workspace ID is required" }, { status: 400 });
    }

    // Get unread notifications count for the user in this workspace
    const unreadCount = await prisma.notification.count({
      where: {
        userId: currentUser.id,
        read: false,
        // Filter by workspace if applicable (you may need to adjust this based on your schema)
        // For now, we'll get all unread notifications for the user
      },
    });

    return NextResponse.json({ count: unreadCount });
  } catch (error) {
    console.error("Error fetching unread notifications count:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}