import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authConfig } from "@/lib/auth";
import { extractMentionUserIds } from "@/utils/mentions";
import { NotificationService } from "@/lib/notification-service";

export async function POST(req: Request) {
  const session = await getServerSession(authConfig);
  if (!session?.user?.id) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const { content, workspaceId } = await req.json();

    if (!content || !content.trim()) {
      return new NextResponse("Content is required", { status: 400 });
    }

    // Create the post
    const post = await prisma.post.create({
      data: {
        message: content.trim(),
        authorId: session.user.id,
        workspaceId: workspaceId || null,
        type: "UPDATE" // Default type
      },
      include: {
        author: {
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

    // Process mentions if any exist in the content
    const mentionedUserIds = extractMentionUserIds(content.trim());
    if (mentionedUserIds.length > 0) {
      try {
        // Create notifications for mentioned users
        await prisma.notification.createMany({
          data: mentionedUserIds.map(userId => ({
            type: "post_mention",
            content: `mentioned you in a post: "${content.length > 100 ? content.substring(0, 97) + '...' : content}"`,
            userId: userId,
            senderId: session.user.id,
            read: false,
            postId: post.id,
          }))
        });

        // Auto-follow mentioned users to the post
        await NotificationService.autoFollowPost(post.id, mentionedUserIds);
      } catch (error) {
        console.error("Failed to create mention notifications or auto-follow:", error);
        // Don't fail the post creation if mentions fail
      }
    }

    return NextResponse.json(post);
  } catch (error) {
    console.error("[TIMELINE_POSTS_POST]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}