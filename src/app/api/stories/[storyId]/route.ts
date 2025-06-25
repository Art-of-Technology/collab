import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { z } from 'zod';
import { compareObjects, trackAssignment, createActivity } from '@/lib/board-item-activity-service';

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
  labels: z.array(z.string()).optional(),
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
  { params }: { params: Promise<{ storyId: string }> }
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
        labels: { select: { id: true, name: true, color: true } },
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
  { params }: { params: Promise<{ storyId: string }> }
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

    // Get current user for activity tracking
    const user = await prisma.user.findUnique({
      where: { email: session.user.email! },
      select: { id: true }
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Get the current story to access its board and capture old data for tracking
    const currentStory = await prisma.story.findUnique({
      where: { id: storyId },
      include: { taskBoard: true, column: true }
    });

    if (!currentStory) {
      return NextResponse.json({ error: "Story not found" }, { status: 404 });
    }

    // Store old data for activity tracking
    const oldStoryData = {
      title: currentStory.title,
      description: currentStory.description,
      status: currentStory.column?.name || undefined,
      priority: currentStory.priority,
      type: currentStory.type,
      storyPoints: currentStory.storyPoints,
      epicId: currentStory.epicId,
      assigneeId: currentStory.assigneeId,
      reporterId: currentStory.reporterId,
      color: currentStory.color,
      columnId: currentStory.columnId,
    };

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

    // Prepare labels update if provided
    const { labels, points, ...otherData } = dataToUpdate;
    
    // Update the story with the columnId if found, mapping points to storyPoints
    const finalDataToUpdate = {
      ...otherData,
      ...(columnId && { columnId }),
      ...(points !== undefined && { storyPoints: points }), // Map points to storyPoints
      ...(labels !== undefined && {
        labels: {
          set: labels.map((labelId: string) => ({ id: labelId }))
        }
      })
    };

    // Update the story
    const updatedStory = await prisma.story.update({
      where: { id: storyId },
      data: finalDataToUpdate,
      include: { // Include relations needed by the frontend after update
        epic: { select: { id: true, title: true } },
        taskBoard: { select: { id: true, name: true } },
        tasks: { select: { id: true, title: true, status: true, priority: true }, orderBy: { createdAt: 'asc' } },
        labels: { select: { id: true, name: true, color: true } },
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

    // Create new data object for comparison
    const newStoryData = {
      title: updatedStory.title,
      description: updatedStory.description,
      status: dataToUpdate.status || oldStoryData.status,
      priority: updatedStory.priority,
      type: updatedStory.type,
      storyPoints: updatedStory.storyPoints,
      epicId: updatedStory.epicId,
      assigneeId: updatedStory.assigneeId,
      reporterId: updatedStory.reporterId,
      color: updatedStory.color,
      columnId: updatedStory.columnId,
    };

    // Define fields to track
    const fieldsToTrack = [
      'title', 'description', 'status', 'priority', 'type', 'storyPoints',
      'epicId', 'assigneeId', 'reporterId', 'color', 'columnId'
    ];

    // Track field changes with enhanced user tracking for assignments
    try {
      const changes = compareObjects(oldStoryData, newStoryData, fieldsToTrack);
      if (changes.length > 0) {
        // Enhanced tracking for assignment changes
        for (const change of changes) {
          if (change.field === 'assigneeId') {
            // Get user details for assignee change
            const oldAssignee = change.oldValue ? await prisma.user.findUnique({
              where: { id: change.oldValue },
              select: { id: true, name: true }
            }).then(user => user ? { id: user.id, name: user.name || 'Unknown User' } : null) : null;
            
            const newAssignee = change.newValue ? await prisma.user.findUnique({
              where: { id: change.newValue },
              select: { id: true, name: true }
            }).then(user => user ? { id: user.id, name: user.name || 'Unknown User' } : null) : null;

            await trackAssignment(
              'STORY',
              storyId,
              user.id,
              updatedStory.workspaceId,
              oldAssignee,
              newAssignee,
              updatedStory.taskBoardId || undefined
            );
          } else if (change.field === 'reporterId') {
            // Get user details for reporter change
            const oldReporter = change.oldValue ? await prisma.user.findUnique({
              where: { id: change.oldValue },
              select: { id: true, name: true }
            }).then(user => user ? { id: user.id, name: user.name || 'Unknown User' } : null) : null;
            
            const newReporter = change.newValue ? await prisma.user.findUnique({
              where: { id: change.newValue },
              select: { id: true, name: true }
            }).then(user => user ? { id: user.id, name: user.name || 'Unknown User' } : null) : null;

            await createActivity({
              itemType: 'STORY',
              itemId: storyId,
              action: 'REPORTER_CHANGED',
              userId: user.id,
              workspaceId: updatedStory.workspaceId,
              boardId: updatedStory.taskBoardId || undefined,
              details: {
                field: 'reporterId',
                oldReporter,
                newReporter,
              },
              fieldName: 'reporterId',
              oldValue: change.oldValue,
              newValue: change.newValue,
            });
          } else {
            // Use regular tracking for other fields  
            const fieldActionMap: Record<string, any> = {
              'title': 'TITLE_UPDATED',
              'description': 'DESCRIPTION_UPDATED',
              'status': 'STATUS_CHANGED',
              'priority': 'PRIORITY_CHANGED',
              'type': 'TYPE_CHANGED',
              'storyPoints': 'POINTS_UPDATED',
              'epicId': 'EPIC_CHANGED',
              'color': 'COLOR_CHANGED',
              'columnId': 'COLUMN_CHANGED',
            };

            await createActivity({
              itemType: 'STORY',
              itemId: storyId,
              action: fieldActionMap[change.field] || 'UPDATED',
              userId: user.id,
              workspaceId: updatedStory.workspaceId,
              boardId: updatedStory.taskBoardId || undefined,
              details: {
                field: change.field,
                oldValue: change.oldValue,
                newValue: change.newValue,
                displayOldValue: change.displayOldValue,
                displayNewValue: change.displayNewValue,
              },
              fieldName: change.field,
              oldValue: change.oldValue,
              newValue: change.newValue,
            });
          }
        }
      }
    } catch (error) {
      console.error('Failed to track story update activities:', error);
      // Don't fail the story update if activity tracking fails
    }

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
  { params }: { params: Promise<{ storyId: string }> }
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