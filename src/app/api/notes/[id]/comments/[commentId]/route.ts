import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

// Get a specific comment
export async function GET(
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

    // Get the comment
    const comment = await prisma.comment.findFirst({
      where: {
        id: commentId,
        // @ts-ignore - noteId will be added after migration
        noteId: id
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            image: true
          }
        },
        children: {
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

    if (!comment) {
      return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    }

    return NextResponse.json(comment);
  } catch (error) {
    console.error("Error fetching comment:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Update a comment
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, commentId } = await params;
    const body = await request.json();
    const { message, html } = body;

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

    // Check if the comment exists
    const comment = await prisma.comment.findFirst({
      where: {
        id: commentId,
        // @ts-ignore - noteId already exists in schema
        noteId: id
      }
    });

    if (!comment) {
      return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    }

    // Check if the user is the author of the comment
    if (comment.authorId !== session.user.id) {
      return NextResponse.json({ error: "You can only edit your own comments" }, { status: 403 });
    }

    // Update the comment
    const updatedComment = await prisma.comment.update({
      where: {
        id: commentId
      },
      data: {
        message,
        html
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            image: true
          }
        }
      }
    });

    return NextResponse.json(updatedComment);
  } catch (error) {
    console.error("Error updating comment:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Delete a comment
export async function DELETE(
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

    // Check if the comment exists
    const comment = await prisma.comment.findFirst({
      where: {
        id: commentId,
        // @ts-ignore - noteId already exists in schema
        noteId: id
      }
    });

    if (!comment) {
      return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    }

    // Check if the user is the author of the comment
    if (comment.authorId !== session.user.id) {
      return NextResponse.json({ error: "You can only delete your own comments" }, { status: 403 });
    }

    // Delete the comment
    await prisma.comment.delete({
      where: {
        id: commentId
      }
    });

    return NextResponse.json({ message: "Comment deleted successfully" });
  } catch (error) {
    console.error("Error deleting comment:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
