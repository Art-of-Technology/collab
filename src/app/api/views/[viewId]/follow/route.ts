import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { NotificationService } from "@/lib/notification-service";
import { withRateLimit, followActionRateLimit } from "@/lib/rate-limit";

export const POST = withRateLimit(async function(
  req: NextRequest,
  { params }: { params: Promise<{ viewId: string }> }
) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const resolvedParams = await params;
    const { viewId } = resolvedParams;

    // Check if view exists and user has access
    const view = await prisma.view.findFirst({
      where: {
        id: viewId,
        OR: [
          // User owns the view
          { ownerId: currentUser.id },
          // View is shared with user
          { sharedWith: { has: currentUser.id } },
          // View is workspace-wide and user is workspace member
          {
            visibility: 'WORKSPACE',
            workspace: {
              OR: [
                { ownerId: currentUser.id },
                { members: { some: { userId: currentUser.id } } }
              ]
            }
          }
        ]
      }
    });

    if (!view) {
      return NextResponse.json({ error: "View not found or access denied" }, { status: 404 });
    }

    // Check if user is already following
    const existingFollower = await prisma.viewFollower.findUnique({
      where: {
        viewId_userId: {
          viewId,
          userId: currentUser.id
        }
      }
    });

    if (existingFollower) {
      return NextResponse.json({ error: "Already following this view" }, { status: 409 });
    }

    // Add user as follower
    await prisma.viewFollower.create({
      data: {
        viewId,
        userId: currentUser.id
      }
    });

    return NextResponse.json({ message: "Successfully following view" });
  } catch (error) {
    console.error("Error following view:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}, followActionRateLimit);

export const DELETE = withRateLimit(async function(
  req: NextRequest,
  { params }: { params: Promise<{ viewId: string }> }
) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const resolvedParams = await params;
    const { viewId } = resolvedParams;

    // Check if view exists and user has access
    const view = await prisma.view.findFirst({
      where: {
        id: viewId,
        OR: [
          // User owns the view
          { ownerId: currentUser.id },
          // View is shared with user
          { sharedWith: { has: currentUser.id } },
          // View is workspace-wide and user is workspace member
          {
            visibility: 'WORKSPACE',
            workspace: {
              OR: [
                { ownerId: currentUser.id },
                { members: { some: { userId: currentUser.id } } }
              ]
            }
          }
        ]
      }
    });

    if (!view) {
      return NextResponse.json({ error: "View not found or access denied" }, { status: 404 });
    }

    // Remove user as follower
    await prisma.viewFollower.deleteMany({
      where: {
        viewId,
        userId: currentUser.id
      }
    });

    return NextResponse.json({ message: "Successfully unfollowed view" });
  } catch (error) {
    console.error("Error unfollowing view:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}, followActionRateLimit);

export const GET = withRateLimit(async function(
  req: NextRequest,
  { params }: { params: Promise<{ viewId: string }> }
) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const resolvedParams = await params;
    const { viewId } = resolvedParams;

    // Check if view exists and user has access
    const view = await prisma.view.findFirst({
      where: {
        id: viewId,
        OR: [
          // User owns the view
          { ownerId: currentUser.id },
          // View is shared with user
          { sharedWith: { has: currentUser.id } },
          // View is workspace-wide and user is workspace member
          {
            visibility: 'WORKSPACE',
            workspace: {
              OR: [
                { ownerId: currentUser.id },
                { members: { some: { userId: currentUser.id } } }
              ]
            }
          }
        ]
      }
    });

    if (!view) {
      return NextResponse.json({ error: "View not found or access denied" }, { status: 404 });
    }

    // Check if user is following the view
    const isFollowing = await prisma.viewFollower.findUnique({
      where: {
        viewId_userId: {
          viewId,
          userId: currentUser.id
        }
      }
    });

    // Get all followers
    const followers = await prisma.viewFollower.findMany({
      where: { viewId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            useCustomAvatar: true,
            avatarSkinTone: true,
            avatarEyes: true,
            avatarBrows: true,
            avatarMouth: true,
            avatarNose: true,
            avatarHair: true,
            avatarEyewear: true,
            avatarAccessory: true,
          }
        }
      }
    });

    return NextResponse.json({
      isFollowing: !!isFollowing,
      followers: followers.map(f => f.user),
      count: followers.length
    });
  } catch (error) {
    console.error("Error getting view follow status:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}, followActionRateLimit);

