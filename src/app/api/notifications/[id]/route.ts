import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

// PATCH /api/notifications/:id - Mark a notification as read
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const _params = await params;
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    const { id } = _params;
    const { read } = await req.json();
    
    // Verify the notification belongs to the current user
    const notification = await prisma.notification.findUnique({
      where: {
        id,
        userId: currentUser.id
      }
    });
    
    if (!notification) {
      return NextResponse.json(
        { error: "Notification not found" },
        { status: 404 }
      );
    }
    
    // Update the notification
    const updatedNotification = await prisma.notification.update({
      where: { id },
      data: { read }
    });
    
    return NextResponse.json(updatedNotification);
  } catch (error) {
    console.error("Error updating notification:", error);
    return NextResponse.json(
      { error: "Failed to update notification" },
      { status: 500 }
    );
  }
} 