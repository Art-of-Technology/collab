import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { NotificationService } from "@/lib/notification-service";
import { withRateLimit, followActionRateLimit } from "@/lib/rate-limit";
import { findIssueByIdOrKey } from "@/lib/issue-finder";

export const POST = withRateLimit(async function(
  req: NextRequest,
  { params }: { params: Promise<{ issueId: string }> }
) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const resolvedParams = await params;
    const { issueId } = resolvedParams;

    // Check if issue exists and user has access
    const issue = await findIssueByIdOrKey(issueId, {
      userId: currentUser.id
    });

    if (!issue) {
      return NextResponse.json({ error: "Issue not found or access denied" }, { status: 404 });
    }

    // Check if user is already following
    const existingFollower = await prisma.issueFollower.findUnique({
      where: {
        issueId_userId: {
          issueId,
          userId: currentUser.id
        }
      }
    });

    if (existingFollower) {
      return NextResponse.json({ error: "Already following this issue" }, { status: 409 });
    }

    // Add user as follower
    await prisma.issueFollower.create({
      data: {
        issueId,
        userId: currentUser.id
      }
    });

    // Notify via NotificationService if it has issue support
    try {
      await NotificationService.addIssueFollower?.(issueId, currentUser.id);
    } catch (error) {
      console.warn("NotificationService.addIssueFollower not available:", error);
    }

    return NextResponse.json({ message: "Successfully following issue" });
  } catch (error) {
    console.error("Error following issue:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}, followActionRateLimit);

export const DELETE = withRateLimit(async function(
  req: NextRequest,
  { params }: { params: Promise<{ issueId: string }> }
) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const resolvedParams = await params;
    const { issueId } = resolvedParams;

    // Check if issue exists and user has access
    const issue = await findIssueByIdOrKey(issueId, {
      userId: currentUser.id
    });

    if (!issue) {
      return NextResponse.json({ error: "Issue not found or access denied" }, { status: 404 });
    }

    // Remove user as follower
    await prisma.issueFollower.deleteMany({
      where: {
        issueId,
        userId: currentUser.id
      }
    });

    // Notify via NotificationService if it has issue support
    try {
      await NotificationService.removeIssueFollower?.(issueId, currentUser.id);
    } catch (error) {
      console.warn("NotificationService.removeIssueFollower not available:", error);
    }

    return NextResponse.json({ message: "Successfully unfollowed issue" });
  } catch (error) {
    console.error("Error unfollowing issue:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}, followActionRateLimit);

export const GET = withRateLimit(async function(
  req: NextRequest,
  { params }: { params: Promise<{ issueId: string }> }
) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const resolvedParams = await params;
    const { issueId } = resolvedParams;

    // Check if issue exists and user has access
    const issue = await findIssueByIdOrKey(issueId, {
      userId: currentUser.id
    });

    if (!issue) {
      return NextResponse.json({ error: "Issue not found or access denied" }, { status: 404 });
    }

    // Check if user is following the issue
    const isFollowing = await prisma.issueFollower.findUnique({
      where: {
        issueId_userId: {
          issueId,
          userId: currentUser.id
        }
      }
    });

    // Get all followers
    const followers = await prisma.issueFollower.findMany({
      where: { issueId },
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
    console.error("Error getting issue follow status:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}, followActionRateLimit);

