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
  { params }: { params: { storyId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { storyId } = params;

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
        // Include other relations as needed
      },
    });

    if (!story) {
      return NextResponse.json({ error: "Story not found" }, { status: 404 });
    }

    // Additional check: Ensure the story belongs to a workspace the user is part of
    const workspaceMember = await prisma.workspaceMember.findFirst({
      where: {
        workspaceId: story.workspaceId,
        userId: session.user.id,
      },
    });

    if (!workspaceMember) {
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
  { params }: { params: { storyId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { storyId } = params;
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

    // Verify user is part of the workspace
    const workspaceMember = await prisma.workspaceMember.findFirst({
      where: {
        workspaceId: existingStory.workspaceId,
        userId: session.user.id,
      },
    });

    if (!workspaceMember) {
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

    // If assigneeId is being changed, verify the user exists and is part of the workspace
    if (dataToUpdate.assigneeId) {
      const assigneeMember = await prisma.workspaceMember.findFirst({
          where: { userId: dataToUpdate.assigneeId, workspaceId: existingStory.workspaceId }
      });
       if (!assigneeMember) return NextResponse.json({ error: "Assignee not found in workspace" }, { status: 400 });
    }
    // --- End Additional Validation ---

    // Update the story
    const updatedStory = await prisma.story.update({
      where: { id: storyId },
      data: dataToUpdate,
      include: { // Include relations needed by the frontend after update
        epic: { select: { id: true, title: true } },
        taskBoard: { select: { id: true, name: true } },
        tasks: { select: { id: true, title: true, status: true, priority: true }, orderBy: { createdAt: 'asc' } },
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
  { params }: { params: { storyId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { storyId } = params;
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

    // Verify user is part of the workspace (or maybe has specific delete permissions?)
    const workspaceMember = await prisma.workspaceMember.findFirst({
      where: {
        workspaceId: existingStory.workspaceId,
        userId: session.user.id,
        // role: 'ADMIN' // Example: Only allow admins to delete?
      },
    });

    if (!workspaceMember) {
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