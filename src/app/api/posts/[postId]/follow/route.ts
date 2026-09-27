import { postAccessWhere } from "@/lib/post-access";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { NotificationService } from "@/lib/notification-service";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  try {
    const actor = await getCurrentUser();
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { postId } = await params;
    const userId = actor.id;
    const post = await prisma.post.findFirst({ where: postAccessWhere(postId, userId), select: { id: true } });
    if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 });

    // Add the user as a follower
    await NotificationService.addPostFollower(postId, userId);

    return NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    console.error("Error following post");
    return NextResponse.json(
      { error: "Failed to follow post" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  try {
    const actor = await getCurrentUser();
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { postId } = await params;
    const userId = actor.id;
    const post = await prisma.post.findFirst({ where: postAccessWhere(postId, userId), select: { id: true } });
    if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 });

    // Remove the user as a follower
    await NotificationService.removePostFollower(postId, userId);

    return NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    console.error("Error unfollowing post");
    return NextResponse.json(
      { error: "Failed to unfollow post" },
      { status: 500 }
    );
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  try {
    const actor = await getCurrentUser();
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { postId } = await params;
    const userId = actor.id;
    const post = await prisma.post.findFirst({ where: postAccessWhere(postId, userId), select: { id: true } });
    if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 });

    // Check if user is following the post
    const isFollowing = await NotificationService.isUserFollowingPost(postId, userId);

    return NextResponse.json({ isFollowing }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    console.error("Error checking post follow status");
    return NextResponse.json(
      { error: "Failed to check follow status" },
      { status: 500 }
    );
  }
}
