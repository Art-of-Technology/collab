import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

// GET /api/notifications - Get user notifications
export async function GET(req: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    // Get query parameters for pagination
    const url = new URL(req.url);
    const limit = parseInt(url.searchParams.get("limit") || "20");
    const page = parseInt(url.searchParams.get("page") || "1");
    const skip = (page - 1) * limit;
    
    // Fetch notifications for the current user
    const notifications = await prisma.notification.findMany({
      where: {
        userId: currentUser.id
      },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            image: true,
            useCustomAvatar: true,
            avatarAccessory: true,
            avatarBrows: true,
            avatarEyes: true,
            avatarEyewear: true,
            avatarHair: true,
            avatarMouth: true,
            avatarNose: true,
            avatarSkinTone: true,
          }
        },
        post: {
          select: {
            id: true,
            message: true,
          }
        },
        comment: {
          select: {
            id: true,
            message: true,
          }
        },
        task: {
          select: {
            id: true,
            title: true,
          }
        },
        featureRequest: {
          select: {
            id: true,
            title: true,
          }
        },
        epic: {
          select: {
            id: true,
            title: true,
          }
        },
        story: {
          select: {
            id: true,
            title: true,
          }
        },
        milestone: {
          select: {
            id: true,
            title: true,
          }
        },
      },
      orderBy: {
        createdAt: 'desc'
      },
      skip,
      take: limit,
    });
    
    return NextResponse.json(notifications);
  } catch (error) {
    console.error("Error fetching notifications:", error);
    return NextResponse.json(
      { error: "Failed to fetch notifications" },
      { status: 500 }
    );
  }
} 