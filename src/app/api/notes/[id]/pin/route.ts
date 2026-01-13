import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { NoteScope } from "@prisma/client";

// POST /api/notes/[id]/pin - Pin or unpin a note
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: noteId } = await params;
    const body = await request.json();
    const { pin } = body;

    if (typeof pin !== "boolean") {
      return NextResponse.json(
        { error: "Pin value (boolean) is required" },
        { status: 400 }
      );
    }

    // Fetch the note to check permissions
    const note = await prisma.note.findUnique({
      where: { id: noteId },
      include: {
        workspace: {
          include: {
            members: {
              where: { userId: session.user.id },
              select: { role: true }
            }
          }
        }
      }
    });

    if (!note) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    // Permission check: Only author or workspace admin can pin notes
    const isAuthor = note.authorId === session.user.id;
    const isWorkspaceAdmin = note.workspace?.members?.[0]?.role === "ADMIN" ||
                            note.workspace?.members?.[0]?.role === "OWNER";

    if (!isAuthor && !isWorkspaceAdmin) {
      return NextResponse.json(
        { error: "You don't have permission to pin this note" },
        { status: 403 }
      );
    }

    // Only allow pinning for WORKSPACE or PROJECT scope notes
    if (note.scope === NoteScope.PERSONAL && !isAuthor) {
      return NextResponse.json(
        { error: "Only the author can pin personal notes" },
        { status: 403 }
      );
    }

    // Update the note
    const updatedNote = await prisma.note.update({
      where: { id: noteId },
      data: {
        isPinned: pin,
        pinnedAt: pin ? new Date() : null,
        pinnedBy: pin ? session.user.id : null
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            image: true
          }
        },
        pinnedByUser: {
          select: {
            id: true,
            name: true,
            image: true
          }
        },
        project: {
          select: {
            id: true,
            name: true,
            slug: true
          }
        },
        tags: true
      }
    });

    return NextResponse.json({
      success: true,
      isPinned: updatedNote.isPinned,
      note: updatedNote
    });
  } catch (error) {
    console.error("Error pinning note:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
