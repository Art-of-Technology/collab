import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authConfig } from "@/lib/auth";
import { NotificationService } from "@/lib/notification-service";

export async function POST(
  req: NextRequest,
  { params }: { params: { postId: string } }
) {
  try {
    const session = await getServerSession(authConfig);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { postId } = params;
    const userId = session.user.id;

    // Add the user as a follower
    await NotificationService.addPostFollower(postId, userId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error following post:", error);
    return NextResponse.json(
      { error: "Failed to follow post" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { postId: string } }
) {
  try {
    const session = await getServerSession(authConfig);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { postId } = params;
    const userId = session.user.id;

    // Remove the user as a follower
    await NotificationService.removePostFollower(postId, userId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error unfollowing post:", error);
    return NextResponse.json(
      { error: "Failed to unfollow post" },
      { status: 500 }
    );
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { postId: string } }
) {
  try {
    const session = await getServerSession(authConfig);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { postId } = params;
    const userId = session.user.id;

    // Check if user is following the post
    const isFollowing = await NotificationService.isUserFollowingPost(postId, userId);

    return NextResponse.json({ isFollowing });
  } catch (error) {
    console.error("Error checking post follow status:", error);
    return NextResponse.json(
      { error: "Failed to check follow status" },
      { status: 500 }
    );
  }
}