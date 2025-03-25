import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

export async function POST(
  req: Request,
  { params }: { params: { postId: string; commentId: string } }
) {
  try {
    const user = await getCurrentUser();
    
    if (!user) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
    const _params = await params;
    const postId = await _params.postId;
    const commentId = await _params.commentId;
    
    // Check if comment exists and belongs to the post
    const comment = await prisma.comment.findFirst({
      where: {
        id: commentId,
        postId: postId,
      },
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
    
    // If reaction exists, remove it (toggle off)
    if (existingReaction) {
      await prisma.reaction.delete({
        where: { id: existingReaction.id },
      });
      
      // Return the updated comment with reactions
      const updatedComment = await prisma.comment.findUnique({
        where: { id: commentId },
        include: {
          author: true,
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
        status: "removed",
        message: "Like removed",
        comment: updatedComment
      });
    }
    
    // Otherwise, create the reaction (toggle on)
    await prisma.reaction.create({
      data: {
        type: "LIKE",
        commentId,
        authorId: user.id,
      },
    });
    
    // Return the updated comment with reactions
    const updatedComment = await prisma.comment.findUnique({
      where: { id: commentId },
      include: {
        author: true,
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
      status: "added",
      message: "Like added",
      comment: updatedComment
    });
    
  } catch (error) {
    console.error("Comment like error:", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}

export async function GET(
  req: Request,
  { params }: { params: { postId: string; commentId: string } }
) {
  try { 
    const _params = await params;
    const commentId = await _params.commentId;
    
    const likes = await prisma.reaction.findMany({
      where: {
        commentId,
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