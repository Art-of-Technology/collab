import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { NoteScope, NoteSharePermission } from "@prisma/client";

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

    const note = await prisma.note.findFirst({
      where: {
        id: id,
        OR: [
          // User's own notes
          { authorId: session.user.id },
          // Workspace-visible notes
          { scope: NoteScope.WORKSPACE },
          // Project-visible notes
          { scope: NoteScope.PROJECT },
          // Public notes
          { scope: NoteScope.PUBLIC },
          // Notes shared with the user
          { sharedWith: { some: { userId: session.user.id } } }
        ]
      },
      include: {
        tags: true,
        author: {
          select: {
            id: true,
            name: true,
            image: true
          }
        },
        workspace: {
          select: {
            id: true,
            name: true,
            slug: true
          }
        },
        project: {
          select: {
            id: true,
            name: true,
            slug: true
          }
        },
        sharedWith: {
          select: {
            id: true,
            userId: true,
            permission: true,
            sharedAt: true,
            sharedBy: true,
            user: {
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

    if (!note) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    // Add computed permission for the current user
    const isOwner = note.authorId === session.user.id;
    const shareRecord = note.sharedWith.find(s => s.userId === session.user.id);
    const canEdit = isOwner || shareRecord?.permission === NoteSharePermission.EDIT;

    return NextResponse.json({
      ...note,
      _permissions: {
        isOwner,
        canEdit,
        canDelete: isOwner,
        canShare: isOwner
      }
    });
  } catch (error) {
    console.error("Error fetching note:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(
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
    const {
      title,
      content,
      isFavorite,
      tagIds,
      // New Knowledge System fields
      type,
      scope,
      projectId,
      isAiContext,
      aiContextPriority,
      category,
      // Legacy support
      isPublic
    } = body;

    // Check if note exists and user has permission to edit
    const existingNote = await prisma.note.findFirst({
      where: {
        id: id,
        OR: [
          // Owner can always edit
          { authorId: session.user.id },
          // Users with EDIT permission can edit
          {
            sharedWith: {
              some: {
                userId: session.user.id,
                permission: NoteSharePermission.EDIT
              }
            }
          }
        ]
      },
      include: {
        sharedWith: {
          where: { userId: session.user.id },
          select: { permission: true }
        }
      }
    });

    if (!existingNote) {
      return NextResponse.json({ error: "Note not found or no permission to edit" }, { status: 404 });
    }

    const isOwner = existingNote.authorId === session.user.id;

    // Non-owners cannot change scope, type, or sharing settings
    if (!isOwner && (scope !== undefined || type !== undefined)) {
      return NextResponse.json(
        { error: "Only the owner can change note type or scope" },
        { status: 403 }
      );
    }

    // Validate project exists if projectId is being set
    if (projectId) {
      const projectExists = await prisma.project.findUnique({
        where: { id: projectId },
        select: { id: true }
      });

      if (!projectExists) {
        return NextResponse.json(
          { error: "Project not found" },
          { status: 400 }
        );
      }
    }

    // Handle scope conversion from legacy isPublic
    let finalScope = scope;
    if (!scope && isPublic !== undefined && isOwner) {
      finalScope = isPublic ? NoteScope.WORKSPACE : NoteScope.PERSONAL;
    }

    // Validate scope requirements
    if (finalScope === NoteScope.PROJECT && !projectId && !existingNote.projectId) {
      return NextResponse.json(
        { error: "Project ID is required for PROJECT scope notes" },
        { status: 400 }
      );
    }

    const note = await prisma.note.update({
      where: {
        id: id
      },
      data: {
        ...(title !== undefined && { title }),
        ...(content !== undefined && { content }),
        ...(isFavorite !== undefined && { isFavorite }),
        // Only owner can update these fields
        ...(isOwner && type !== undefined && { type }),
        ...(isOwner && finalScope !== undefined && { scope: finalScope }),
        ...(isOwner && projectId !== undefined && { projectId }),
        ...(isOwner && isAiContext !== undefined && { isAiContext }),
        ...(isOwner && aiContextPriority !== undefined && { aiContextPriority }),
        ...(isOwner && category !== undefined && { category }),
        ...(tagIds && {
          tags: {
            set: tagIds.map((tagId: string) => ({ id: tagId }))
          }
        })
      },
      include: {
        tags: true,
        author: {
          select: {
            id: true,
            name: true,
            image: true
          }
        },
        workspace: {
          select: {
            id: true,
            name: true,
            slug: true
          }
        },
        project: {
          select: {
            id: true,
            name: true,
            slug: true
          }
        },
        sharedWith: {
          select: {
            id: true,
            userId: true,
            permission: true,
            sharedAt: true,
            user: {
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

    return NextResponse.json(note);
  } catch (error) {
    console.error("Error updating note:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

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

    // Check if note exists and user owns it
    const existingNote = await prisma.note.findFirst({
      where: {
        id: id,
        authorId: session.user.id
      }
    });

    if (!existingNote) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    await prisma.note.delete({
      where: {
        id: id
      }
    });

    return NextResponse.json({ message: "Note deleted successfully" });
  } catch (error) {
    console.error("Error deleting note:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
} 