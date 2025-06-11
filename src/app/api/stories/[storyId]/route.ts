import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { z } from 'zod';

// Schema for PATCH validation
const storyPatchSchema = z.object({
  title: z.string().min(1, "Title cannot be empty.").optional(),
  description: z.string().nullable().optional(),
  status: z.string().optional(),
  priority: z.string().optional(),
  type: z.string().optional(),
  points: z.number().nullable().optional(),
  epicId: z.string().nullable().optional(),
  assigneeId: z.string().nullable().optional(),
  reporterId: z.string().nullable().optional(),
  taskBoardId: z.string().optional(),
  columnId: z.string().optional(),
  startDate: z.preprocess((arg) => {
    if (typeof arg == "string" || arg instanceof Date) return new Date(arg);
  }, z.date().nullable().optional()),
  dueDate: z.preprocess((arg) => {
    if (typeof arg == "string" || arg instanceof Date) return new Date(arg);
  }, z.date().nullable().optional()),
  color: z.string().optional(),
}).strict(); // Ensure no extra fields are passed

// GET /api/stories/{storyId} - Fetch a single story by ID
export async function GET(
  request: NextRequest,
  { params }: Promise<{ params: { storyId: string } }>
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const _params = await params;
    const { storyId } = _params;

    if (!storyId) {
      return NextResponse.json({ error: "Story ID is required" }, { status: 400 });
    }

    const story = await prisma.story.findUnique({
      where: {
        id: storyId,
        // Optionally, ensure the user has access via workspace membership
        // workspace: { members: { some: { userId: session.user.id } } },
      },
      include: {
        epic: { select: { id: true, title: true } },
        taskBoard: { select: { id: true, name: true } },
        tasks: { // Include related tasks
          select: { id: true, title: true, status: true, priority: true },
          orderBy: { createdAt: 'asc' } // Or desired order
        },
        assignee: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            useCustomAvatar: true,
            avatarAccessory: true,
            avatarBrows: true,
            avatarEyes: true,
            avatarEyewear: true,
            avatarHair: true,
            avatarMouth: true,
            avatarNose: true,
            avatarSkinTone: true,
          },
        },
        reporter: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            useCustomAvatar: true,
            avatarAccessory: true,
            avatarBrows: true,
            avatarEyes: true,
            avatarEyewear: true,
            avatarHair: true,
            avatarMouth: true,
            avatarNose: true,
            avatarSkinTone: true,
          },
        },
        // Include other relations as needed
      },
    });

    if (!story) {
      return NextResponse.json({ error: "Story not found" }, { status: 404 });
    }

    // Additional check: Ensure the story belongs to a workspace the user has access to
    const workspaceAccess = await prisma.workspace.findFirst({
      where: {
        id: story.workspaceId,
        OR: [
          { ownerId: session.user.id }, // User is the owner
          { members: { some: { userId: session.user.id } } } // User is a member
        ]
      }
    });

    if (!workspaceAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }


    return NextResponse.json(story);

  } catch (error) {
    console.error("Error fetching story:", error);
    return NextResponse.json({ error: "Failed to fetch story" }, { status: 500 });
  }
}

// PATCH /api/stories/{storyId} - Update a story
export async function PATCH(
  request: NextRequest,
  { params }: Promise<{ params: { storyId: string } }>
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const _params = await params;
    const { storyId } = _params;
    if (!storyId) {
      return NextResponse.json({ error: "Story ID is required" }, { status: 400 });
    }

    const body = await request.json();

    // Validate input
    const validation = storyPatchSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ error: "Invalid input", details: validation.error.errors }, { status: 400 });
    }
    
    const dataToUpdate = validation.data;

    // Fetch the story first to check ownership/permissions
    const existingStory = await prisma.story.findUnique({
      where: { id: storyId },
      select: { workspaceId: true },
    });

    if (!existingStory) {
      return NextResponse.json({ error: "Story not found" }, { status: 404 });
    }

    // Verify user has access to the workspace (either as owner or member)
    const workspaceAccess = await prisma.workspace.findFirst({
      where: {
        id: existingStory.workspaceId,
        OR: [
          { ownerId: session.user.id }, // User is the owner
          { members: { some: { userId: session.user.id } } } // User is a member
        ]
      }
    });

    if (!workspaceAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    
    // --- Additional Validation (Optional but Recommended) ---
    // If epicId is being changed, verify the new epic exists in the same workspace
    if (dataToUpdate.epicId) {
      const epic = await prisma.epic.findFirst({
          where: { id: dataToUpdate.epicId, workspaceId: existingStory.workspaceId }
      });
      if (!epic) return NextResponse.json({ error: "Target Epic not found in workspace" }, { status: 400 });
    }

    // Validate assignee if provided
    if (dataToUpdate.assigneeId) {
      const assignee = await prisma.user.findUnique({
        where: { id: dataToUpdate.assigneeId },
        select: { id: true }
      });
      if (!assignee) {
        return NextResponse.json({ error: "Assignee not found" }, { status: 404 });
      }
    }

    // Validate reporter if provided
    if (dataToUpdate.reporterId) {
      const reporter = await prisma.user.findUnique({
        where: { id: dataToUpdate.reporterId },
        select: { id: true }
      });
      if (!reporter) {
        return NextResponse.json({ error: "Reporter not found" }, { status: 404 });
      }
    }
    // --- End Additional Validation ---

    // Get the current story to access its board
    const currentStory = await prisma.story.findUnique({
      where: { id: storyId },
      include: { taskBoard: true, column: true }
    });

    // Find the column ID if status is being updated
    let columnId = dataToUpdate.columnId;
    
    if (dataToUpdate.status && currentStory && dataToUpdate.status !== currentStory.column?.name) {
      // Find the column with the given name in the story's board
      const column = await prisma.taskColumn.findFirst({
        where: {
          name: dataToUpdate.status,
          taskBoardId: currentStory.taskBoardId || undefined,
        },
      });
      
      if (column) {
        columnId = column.id;
      }
    }

    // Update the story with the columnId if found
    const finalDataToUpdate = {
      ...dataToUpdate,
      ...(columnId && { columnId })
    };

    // Update the story
    const updatedStory = await prisma.story.update({
      where: { id: storyId },
      data: finalDataToUpdate,
      include: { // Include relations needed by the frontend after update
        epic: { select: { id: true, title: true } },
        taskBoard: { select: { id: true, name: true } },
        tasks: { select: { id: true, title: true, status: true, priority: true }, orderBy: { createdAt: 'asc' } },
        assignee: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            useCustomAvatar: true,
            avatarAccessory: true,
            avatarBrows: true,
            avatarEyes: true,
            avatarEyewear: true,
            avatarHair: true,
            avatarMouth: true,
            avatarNose: true,
            avatarSkinTone: true,
          },
        },
        reporter: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            useCustomAvatar: true,
            avatarAccessory: true,
            avatarBrows: true,
            avatarEyes: true,
            avatarEyewear: true,
            avatarHair: true,
            avatarMouth: true,
            avatarNose: true,
            avatarSkinTone: true,
          },
        },
      }
    });

    return NextResponse.json(updatedStory);

  } catch (error) {
    console.error("Error updating story:", error);
    // Handle potential Prisma errors like unique constraint violations if needed
    return NextResponse.json({ error: "Failed to update story" }, { status: 500 });
  }
}

// DELETE /api/stories/{storyId} - Delete a story (Optional)
export async function DELETE(
  request: NextRequest,
  { params }: Promise<{ params: { storyId: string } }>
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const _params = await params;
    const { storyId } = _params;
    if (!storyId) {
      return NextResponse.json({ error: "Story ID is required" }, { status: 400 });
    }

    // Fetch the story first to check ownership/permissions
    const existingStory = await prisma.story.findUnique({
      where: { id: storyId },
      select: { workspaceId: true },
    });

    if (!existingStory) {
      // Already gone, return success or 404? 204 is common for successful delete.
      return new NextResponse(null, { status: 204 }); 
    }

    // Verify user has access to the workspace (either as owner or member)
    const workspaceAccess = await prisma.workspace.findFirst({
      where: {
        id: existingStory.workspaceId,
        OR: [
          { ownerId: session.user.id }, // User is the owner
          { members: { some: { userId: session.user.id } } } // User is a member
        ]
      }
    });

    if (!workspaceAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Delete the story
    await prisma.story.delete({
      where: { id: storyId },
    });

    return new NextResponse(null, { status: 204 }); // No content on successful delete

  } catch (error) {
    console.error("Error deleting story:", error);
    return NextResponse.json({ error: "Failed to delete story" }, { status: 500 });
  }
} 