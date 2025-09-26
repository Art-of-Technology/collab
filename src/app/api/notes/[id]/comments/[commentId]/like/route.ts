import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

// Toggle like on a comment
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, commentId } = await params;

    // Check if the note exists and user has access to it
    const note = await prisma.note.findFirst({
      where: {
        id: id,
        OR: [
          { authorId: session.user.id },
          { isPublic: true }
        ]
      }
    });

    if (!note) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    // Check if comment exists and belongs to the note
    const comment = await prisma.comment.findFirst({
      where: {
        id: commentId,
        // @ts-ignore - noteId already exists in schema
        noteId: id,
      },
    });
    
    if (!comment) {
      return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    }

    // Check if the user already liked this comment
    const existingReaction = await prisma.reaction.findFirst({
      where: {
        commentId: commentId,
        authorId: session.user.id,
        type: "LIKE"
      },
    });
    
    // If reaction exists, remove it (toggle off)
    if (existingReaction) {
      await prisma.reaction.delete({
        where: { id: existingReaction.id },
      });
      
      // Count the remaining likes
      const likesCount = await prisma.reaction.count({
        where: {
          commentId: commentId,
          type: "LIKE"
        }
      });
      
      return NextResponse.json({
        status: "removed",
        message: "Like removed",
        isLiked: false,
        likesCount
      });
    }
    
    // Otherwise, create the reaction (toggle on)
    await prisma.reaction.create({
      data: {
        type: "LIKE",
        commentId: commentId,
        authorId: session.user.id,
      },
    });
    
    // Count the total likes
    const likesCount = await prisma.reaction.count({
      where: {
        commentId: commentId,
        type: "LIKE"
      }
    });
    
    return NextResponse.json({
      status: "added",
      message: "Like added",
      isLiked: true,
      likesCount
    });
  } catch (error) {
    console.error("Error toggling comment like:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
