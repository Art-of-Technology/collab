import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { NoteScope, NoteSharePermission } from "@prisma/client";

// GET - List all shares for a note
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Check if note exists and user is the owner
    const note = await prisma.note.findFirst({
      where: {
        id: id,
        authorId: session.user.id
      },
      select: { id: true }
    });

    if (!note) {
      return NextResponse.json({ error: "Note not found or you don't own this note" }, { status: 404 });
    }

    const shares = await prisma.noteShare.findMany({
      where: { noteId: id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true
          }
        }
      },
      orderBy: { sharedAt: "desc" }
    });

    return NextResponse.json(shares);
  } catch (error) {
    console.error("Error fetching note shares:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST - Share a note with a user
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { userId, email, permission = NoteSharePermission.READ } = body;

    // Need either userId or email
    if (!userId && !email) {
      return NextResponse.json(
        { error: "Either userId or email is required" },
        { status: 400 }
      );
    }

    // Check if note exists and user is the owner
    const note = await prisma.note.findFirst({
      where: {
        id: id,
        authorId: session.user.id
      },
      select: { id: true, scope: true }
    });

    if (!note) {
      return NextResponse.json({ error: "Note not found or you don't own this note" }, { status: 404 });
    }

    // Only PERSONAL scope notes can be shared
    if (note.scope !== NoteScope.PERSONAL) {
      return NextResponse.json(
        { error: "Only personal notes can be shared with specific users. Change scope to Personal first." },
        { status: 400 }
      );
    }

    // Find the target user
    let targetUserId = userId;
    if (!targetUserId && email) {
      const targetUser = await prisma.user.findUnique({
        where: { email },
        select: { id: true }
      });

      if (!targetUser) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }

      targetUserId = targetUser.id;
    }

    // Cannot share with yourself
    if (targetUserId === session.user.id) {
      return NextResponse.json(
        { error: "Cannot share a note with yourself" },
        { status: 400 }
      );
    }

    // Check if share already exists
    const existingShare = await prisma.noteShare.findUnique({
      where: {
        noteId_userId: {
          noteId: id,
          userId: targetUserId
        }
      }
    });

    if (existingShare) {
      // Update existing share permission
      const updatedShare = await prisma.noteShare.update({
        where: { id: existingShare.id },
        data: { permission },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true
            }
          }
        }
      });

      return NextResponse.json(updatedShare);
    }

    // Create new share
    const share = await prisma.noteShare.create({
      data: {
        noteId: id,
        userId: targetUserId,
        permission,
        sharedBy: session.user.id
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true
          }
        }
      }
    });

    return NextResponse.json(share, { status: 201 });
  } catch (error) {
    console.error("Error sharing note:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE - Remove a share
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const shareId = searchParams.get("shareId");
    const userId = searchParams.get("userId");

    if (!shareId && !userId) {
      return NextResponse.json(
        { error: "Either shareId or userId is required" },
        { status: 400 }
      );
    }

    // Check if note exists and user is the owner
    const note = await prisma.note.findFirst({
      where: {
        id: id,
        authorId: session.user.id
      },
      select: { id: true }
    });

    if (!note) {
      return NextResponse.json({ error: "Note not found or you don't own this note" }, { status: 404 });
    }

    // Delete the share
    if (shareId) {
      await prisma.noteShare.delete({
        where: {
          id: shareId,
          noteId: id
        }
      });
    } else if (userId) {
      await prisma.noteShare.delete({
        where: {
          noteId_userId: {
            noteId: id,
            userId
          }
        }
      });
    }

    return NextResponse.json({ message: "Share removed successfully" });
  } catch (error) {
    console.error("Error removing share:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
