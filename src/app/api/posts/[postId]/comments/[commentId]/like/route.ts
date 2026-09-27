import { NextResponse } from "next/server";
import { commentAccessWhere } from "@/lib/post-access";
import { userSelectFields } from "@/lib/user-utils";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ postId: string; commentId: string }> }
) {
  try {
    const user = await getCurrentUser();
    
    if (!user) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
    const _params = await params;
    const postId = await _params.postId;
    const commentId = await _params.commentId;
    
    const access = commentAccessWhere(commentId, user.id, postId);
    // Check if comment exists and belongs to the post
    const comment = await prisma.comment.findFirst({
      where: access,
      select: { id: true },
    });
    
    if (!comment) {
      return new NextResponse("Comment not found", { status: 404 });
    }
    
    // Check if the user already liked this comment
    const existingReaction = await prisma.reaction.findFirst({
      where: {
        commentId,
        authorId: user.id,
        type: "LIKE"
      },
    });
    
    if (existingReaction) {
      await prisma.reaction.delete({ where: { id: existingReaction.id } });
    } else {
      await prisma.reaction.create({ data: { type: "LIKE", commentId, authorId: user.id } });
    }

    // Return the updated comment with reactions
    const updatedComment = await prisma.comment.findFirst({
      where: access,
      include: {
        author: { select: userSelectFields },
        reactions: {
          include: {
            author: {
              select: {
                id: true,
                name: true,
                image: true
              }
            }
          }
        }
      }
    });
    
    return NextResponse.json({ 
      status: existingReaction ? "removed" : "added",
      message: existingReaction ? "Like removed" : "Like added",
      comment: updatedComment
    });
    
  } catch (error) {
    console.error("Comment like error:", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ postId: string; commentId: string }> }
) {
  try { 
    const user = await getCurrentUser();
    if (!user?.id) return new NextResponse("Unauthorized", { status: 401 });
    const { postId, commentId } = await params;
    const access = commentAccessWhere(commentId, user.id, postId);
    const comment = await prisma.comment.findFirst({ where: access, select: { id: true } });
    if (!comment) return new NextResponse("Comment not found", { status: 404 });

    const likes = await prisma.reaction.findMany({
      where: {
        commentId,
        comment: access,
        type: "LIKE"
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
      },
    });
    
    return NextResponse.json({ likes });
  } catch (error) {
    console.error("Get comment likes error:", error);
    return new NextResponse("Internal error", { status: 500 });
  }
} 