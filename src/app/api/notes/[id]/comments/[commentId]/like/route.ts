import { NextRequest, NextResponse } from "next/server";
import { toggleBoardItemCommentLike } from "@/actions/boardItemComment";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

// Toggle like on a comment - now using the unified comment system
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  try {
    const { id, commentId } = await params;
    
    // Use the unified toggleBoardItemCommentLike function
    const result = await toggleBoardItemCommentLike('note', id, commentId);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error toggling comment like:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Get likes for a note comment
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  try {
    // First await params to get id and commentId
    const { id, commentId } = await params;
    
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }
    
    // Get the current user
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true }
    });
    
    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }
    
    // Check if the comment exists
    // Use raw SQL query to check if the comment exists and belongs to the note
    const comments = await prisma.$queryRaw`
      SELECT * FROM "Comment" 
      WHERE id = ${commentId} 
      AND "noteId" = ${id}
    `;
    
    const comment = comments && Array.isArray(comments) && comments.length > 0 ? comments[0] : null;
    
    if (!comment) {
      return NextResponse.json(
        { error: "Comment not found" },
        { status: 404 }
      );
    }
    
    // Get all likes for this comment
    const likes = await prisma.commentLike.findMany({
      where: {
        commentId: commentId
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            image: true,
            useCustomAvatar: true
          }
        }
      }
    });
    
    // Convert the likes to the expected format
    const reactions = likes.map(like => ({
      id: like.id,
      type: "like",
      authorId: like.userId,
      author: like.user
    }));
    
    // Check if the current user has liked this comment
    const isLiked = likes.some(like => like.userId === user.id);
    
    return NextResponse.json({
      likes: reactions,
      isLiked,
      currentUserId: user.id
    });
  } catch (error) {
    console.error("Error getting comment likes:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
