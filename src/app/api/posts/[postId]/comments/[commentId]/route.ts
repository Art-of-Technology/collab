import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

// Update a comment
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ postId: string; commentId: string }> }
) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { postId, commentId } = await params;
    const { message, html } = await request.json();

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    // Verify the post exists
    const post = await prisma.post.findUnique({
      where: { id: postId }
    });

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    // Check if comment exists and belongs to the current user
    const comment = await prisma.comment.findFirst({
      where: {
        id: commentId,
        postId: postId,
      },
    });

    if (!comment) {
      return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    }

    if (comment.authorId !== currentUser.id) {
      return NextResponse.json({ error: "You can only edit your own comments" }, { status: 403 });
    }

    // Update the comment
    const updatedComment = await prisma.comment.update({
      where: { id: commentId },
      data: {
        message: message.trim(),
        html: html || null,
        updatedAt: new Date(),
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            image: true,
            role: true,
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
        },
        reactions: {
          include: {
            author: {
              select: {
                id: true,
                name: true,
                image: true,
              }
            }
          }
        }
      },
    });

    return NextResponse.json(updatedComment);
  } catch (error) {
    console.error("Error updating comment:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// Delete a comment
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ postId: string; commentId: string }> }
) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { postId, commentId } = await params;

    // Verify the post exists
    const post = await prisma.post.findUnique({
      where: { id: postId }
    });

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    // Check if comment exists and belongs to the current user
    const comment = await prisma.comment.findFirst({
      where: {
        id: commentId,
        postId: postId,
      },
      include: {
        children: true, // Include children to check if comment has replies
      },
    });

    if (!comment) {
      return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    }

    if (comment.authorId !== currentUser.id) {
      return NextResponse.json({ error: "You can only delete your own comments" }, { status: 403 });
    }

    // Recursively delete comment and all its replies
    await deleteCommentRecursive(commentId);

    return NextResponse.json({ message: "Comment deleted successfully" });
  } catch (error) {
    console.error("Error deleting comment:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// Helper function to recursively delete a comment and its replies
async function deleteCommentRecursive(commentId: string) {
  // First, get all replies to this comment
  const replies = await prisma.comment.findMany({
    where: {
      parentId: commentId
    },
    select: {
      id: true
    }
  });

  // Recursively delete each reply
  for (const reply of replies) {
    await deleteCommentRecursive(reply.id);
  }

  // Delete reactions first (if not cascade deleted)
  await prisma.reaction.deleteMany({
    where: {
      commentId: commentId
    }
  });

  // Finally, delete this comment
  await prisma.comment.delete({
    where: {
      id: commentId
    }
  });
}

