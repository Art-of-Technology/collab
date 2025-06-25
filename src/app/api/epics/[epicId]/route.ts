import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { z } from 'zod';
import { compareObjects, trackAssignment, createActivity } from '@/lib/board-item-activity-service';

// Schema for PATCH validation
const epicPatchSchema = z.object({
  title: z.string().min(1, "Title cannot be empty.").optional(),
  description: z.string().nullable().optional(),
  status: z.string().optional(),
  priority: z.string().optional(),
  milestoneId: z.string().nullable().optional(),
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
  assigneeId: z.string().nullable().optional(),
  reporterId: z.string().nullable().optional(),
}).strict();

// GET /api/epics/{epicId} - Fetch a single epic by ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ epicId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const _params = await params;
    const { epicId } = _params;
    if (!epicId) {
      return NextResponse.json({ error: "Epic ID is required" }, { status: 400 });
    }

    const epic = await prisma.epic.findUnique({
      where: { id: epicId },
      include: {
        milestone: { select: { id: true, title: true } },
        taskBoard: { select: { id: true, name: true } },
        stories: { // Include related stories
          select: { id: true, title: true, status: true, priority: true },
          orderBy: { createdAt: 'asc' }
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
      },
    });

    if (!epic) {
      return NextResponse.json({ error: "Epic not found" }, { status: 404 });
    }

    // Verify user has access to the workspace (either as owner or member)
    const workspaceAccess = await prisma.workspace.findFirst({
      where: {
        id: epic.workspaceId,
        OR: [
          { ownerId: session.user.id }, // User is the owner
          { members: { some: { userId: session.user.id } } } // User is a member
        ]
      }
    });

    if (!workspaceAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json(epic);

  } catch (error) {
    console.error("Error fetching epic:", error);
    return NextResponse.json({ error: "Failed to fetch epic" }, { status: 500 });
  }
}

// PATCH /api/epics/{epicId} - Update an epic
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ epicId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const _params = await params;
    const { epicId } = _params;
    if (!epicId) {
      return NextResponse.json({ error: "Epic ID is required" }, { status: 400 });
    }

    const body = await request.json();

    // Validate input
    const validation = epicPatchSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ error: "Invalid input", details: validation.error.errors }, { status: 400 });
    }

    const dataToUpdate = validation.data;

    // Fetch the epic first to check ownership
    const existingEpic = await prisma.epic.findUnique({
      where: { id: epicId },
      select: { workspaceId: true },
    });

    if (!existingEpic) {
      return NextResponse.json({ error: "Epic not found" }, { status: 404 });
    }

    // Verify user has access to the workspace (either as owner or member)
    const workspaceAccess = await prisma.workspace.findFirst({
      where: {
        id: existingEpic.workspaceId,
        OR: [
          { ownerId: session.user.id }, // User is the owner
          { members: { some: { userId: session.user.id } } } // User is a member
        ]
      }
    });

    if (!workspaceAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // --- Additional Validation ---
    // If milestoneId is being changed, verify the new milestone exists in the same workspace
    if (dataToUpdate.milestoneId) {
      const milestone = await prisma.milestone.findFirst({
        where: { id: dataToUpdate.milestoneId, workspaceId: existingEpic.workspaceId }
      });
      if (!milestone) return NextResponse.json({ error: "Target Milestone not found in workspace" }, { status: 400 });
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

    // Get the current epic to access its board and for change tracking
    const currentEpic = await prisma.epic.findUnique({
      where: { id: epicId },
      include: { taskBoard: true, column: true }
    });

    if (!currentEpic) {
      return NextResponse.json({ error: "Epic not found" }, { status: 404 });
    }

    // Find the column ID if status is being updated
    let columnId = dataToUpdate.columnId;

    if (dataToUpdate.status && dataToUpdate.status !== currentEpic.column?.name) {
      // Find the column with the given name in the epic's board
      const column = await prisma.taskColumn.findFirst({
        where: {
          name: dataToUpdate.status,
          taskBoardId: currentEpic.taskBoardId,
        },
      });

      if (column) {
        columnId = column.id;
      }
    }

    // Track changes before updating
    const fieldsToTrack = ['title', 'description', 'assigneeId', 'reporterId', 'status', 'priority', 'columnId', 'dueDate', 'startDate'];
    const oldEpicData = {
      title: currentEpic.title,
      description: currentEpic.description,
      assigneeId: currentEpic.assigneeId,
      reporterId: currentEpic.reporterId,
      status: currentEpic.column?.name || currentEpic.status,
      priority: currentEpic.priority,
      columnId: currentEpic.columnId,
      dueDate: currentEpic.dueDate,
      startDate: currentEpic.startDate,
    };

    const newEpicData = {
      title: dataToUpdate.title !== undefined ? dataToUpdate.title : currentEpic.title,
      description: dataToUpdate.description !== undefined ? dataToUpdate.description : currentEpic.description,
      assigneeId: dataToUpdate.assigneeId !== undefined ? dataToUpdate.assigneeId : currentEpic.assigneeId,
      reporterId: dataToUpdate.reporterId !== undefined ? dataToUpdate.reporterId : currentEpic.reporterId,
      status: dataToUpdate.status !== undefined ? dataToUpdate.status : (currentEpic.column?.name || currentEpic.status),
      priority: dataToUpdate.priority !== undefined ? dataToUpdate.priority : currentEpic.priority,
      columnId: columnId !== undefined ? columnId : currentEpic.columnId,
      dueDate: dataToUpdate.dueDate !== undefined ? dataToUpdate.dueDate : currentEpic.dueDate,
      startDate: dataToUpdate.startDate !== undefined ? dataToUpdate.startDate : currentEpic.startDate,
    };

    // Prepare labels update if provided
    const { labels, ...otherData } = dataToUpdate;
    
    // Update the epic with the columnId if found
    const finalDataToUpdate = {
      ...otherData,
      ...(columnId && { columnId }),
      ...(labels !== undefined && {
        labels: {
          set: labels.map((labelId: string) => ({ id: labelId }))
        }
      })
    };

    const updatedEpic = await prisma.epic.update({
      where: { id: epicId },
      data: finalDataToUpdate,
      include: {
        milestone: { select: { id: true, title: true } },
        taskBoard: { select: { id: true, name: true } },
        stories: {
          select: { id: true, title: true, status: true, priority: true },
          orderBy: { createdAt: 'asc' }
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
      }
    });

    // Track field changes with enhanced user tracking for assignments
    try {
      const changes = compareObjects(oldEpicData, newEpicData, fieldsToTrack);
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
              'EPIC',
              epicId,
              session.user.id,
              currentEpic.workspaceId,
              oldAssignee,
              newAssignee,
              currentEpic.taskBoardId || undefined
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
              itemType: 'EPIC',
              itemId: epicId,
              action: 'REPORTER_CHANGED',
              userId: session.user.id,
              workspaceId: currentEpic.workspaceId,
              boardId: currentEpic.taskBoardId || undefined,
              details: {
                field: 'reporterId',
                oldReporter,
                newReporter,
                changedAt: new Date().toISOString(),
              },
              fieldName: 'reporterId',
              oldValue: change.oldValue,
              newValue: change.newValue,
            });
          } else {
            // Use regular tracking for other fields
            const fieldActionMap: Record<string, string> = {
              'title': 'TITLE_UPDATED',
              'description': 'DESCRIPTION_UPDATED',
              'status': 'STATUS_CHANGED',
              'priority': 'PRIORITY_CHANGED',
              'columnId': 'COLUMN_CHANGED',
              'dueDate': 'DUE_DATE_CHANGED',
              'startDate': 'DUE_DATE_CHANGED',
            };
            
            await createActivity({
              itemType: 'EPIC',
              itemId: epicId,
              action: (fieldActionMap[change.field] || 'UPDATED') as any,
              userId: session.user.id,
              workspaceId: currentEpic.workspaceId,
              boardId: currentEpic.taskBoardId || undefined,
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
      console.error('Failed to track epic update activities:', error);
      // Don't fail the epic update if activity tracking fails
    }

    return NextResponse.json(updatedEpic);

  } catch (error) {
    console.error("Error updating epic:", error);
    return NextResponse.json({ error: "Failed to update epic" }, { status: 500 });
  }
}

// DELETE /api/epics/{epicId} - Delete an epic (Optional)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ epicId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const _params = await params;
    const { epicId } = _params;
    if (!epicId) {
      return NextResponse.json({ error: "Epic ID is required" }, { status: 400 });
    }

    // Fetch the epic first to check ownership
    const existingEpic = await prisma.epic.findUnique({
      where: { id: epicId },
      select: { workspaceId: true },
    });

    if (!existingEpic) {
      return new NextResponse(null, { status: 204 });
    }

    // Verify user has access to the workspace (either as owner or member)
    const workspaceAccess = await prisma.workspace.findFirst({
      where: {
        id: existingEpic.workspaceId,
        OR: [
          { ownerId: session.user.id }, // User is the owner
          { members: { some: { userId: session.user.id } } } // User is a member
        ]
      }
    });

    if (!workspaceAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Delete the epic
    await prisma.epic.delete({
      where: { id: epicId },
    });

    return new NextResponse(null, { status: 204 });

  } catch (error) {
    console.error("Error deleting epic:", error);
    return NextResponse.json({ error: "Failed to delete epic" }, { status: 500 });
  }
} 