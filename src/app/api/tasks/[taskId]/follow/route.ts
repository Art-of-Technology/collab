import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { NotificationService } from "@/lib/notification-service";
import { withRateLimit, followActionRateLimit } from "@/lib/rate-limit";

export const POST = withRateLimit(async function(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const resolvedParams = await params;
    const { taskId } = resolvedParams;

    // Check if task exists and user has access
    const task = await prisma.task.findFirst({
      where: {
        id: taskId,
        workspace: {
          OR: [
            { ownerId: currentUser.id },
            { members: { some: { userId: currentUser.id } } }
          ]
        }
      }
    });

    if (!task) {
      return NextResponse.json({ error: "Task not found or access denied" }, { status: 404 });
    }

    // Add user as follower
    await NotificationService.addTaskFollower(taskId, currentUser.id);

    return NextResponse.json({ message: "Successfully following task" });
  } catch (error) {
    console.error("Error following task:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}, followActionRateLimit);

export const DELETE = withRateLimit(async function(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const resolvedParams = await params;
    const { taskId } = resolvedParams;

    // Check if task exists and user has access
    const task = await prisma.task.findFirst({
      where: {
        id: taskId,
        workspace: {
          OR: [
            { ownerId: currentUser.id },
            { members: { some: { userId: currentUser.id } } }
          ]
        }
      }
    });

    if (!task) {
      return NextResponse.json({ error: "Task not found or access denied" }, { status: 404 });
    }

    // Remove user as follower
    await NotificationService.removeTaskFollower(taskId, currentUser.id);

    return NextResponse.json({ message: "Successfully unfollowed task" });
  } catch (error) {
    console.error("Error unfollowing task:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}, followActionRateLimit);

export const GET = withRateLimit(async function(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const resolvedParams = await params;
    const { taskId } = resolvedParams;

    // Check if task exists and user has access
    const task = await prisma.task.findFirst({
      where: {
        id: taskId,
        workspace: {
          OR: [
            { ownerId: currentUser.id },
            { members: { some: { userId: currentUser.id } } }
          ]
        }
      }
    });

    if (!task) {
      return NextResponse.json({ error: "Task not found or access denied" }, { status: 404 });
    }

    // Check if user is following the task
    const isFollowing = await NotificationService.isUserFollowingTask(taskId, currentUser.id);

    // Get all followers
    const followers = await prisma.taskFollower.findMany({
      where: { taskId },
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
      isFollowing,
      followers: followers.map(f => f.user),
      count: followers.length
    });
  } catch (error) {
    console.error("Error getting task follow status:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}, followActionRateLimit);