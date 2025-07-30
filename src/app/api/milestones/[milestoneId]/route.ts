import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { z } from 'zod';
import { compareObjects, trackAssignment, createActivity } from '@/lib/board-item-activity-service';
import { resolveIssueKeyToId } from '@/lib/issue-key-resolvers';
import { isIssueKey } from '@/lib/shared-issue-key-utils';

// Schema for PATCH validation
const milestonePatchSchema = z.object({
  title: z.string().min(1, "Title cannot be empty.").optional(),
  description: z.string().nullable().optional(),
  status: z.string().optional(),
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

// Helper function to resolve milestone ID from issue key or database ID
async function resolveMilestoneId(milestoneIdOrKey: string): Promise<string | null> {
  if (isIssueKey(milestoneIdOrKey)) {
    return await resolveIssueKeyToId(milestoneIdOrKey, 'milestone');
  }
  return milestoneIdOrKey; // Already a database ID
}

// GET /api/milestones/{milestoneId} - Fetch a single milestone by ID
export async function GET(
  request: NextRequest,
  { params }: { params: { milestoneId: string } }
) {
  const _params = await params;
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { milestoneId: milestoneIdParam } = _params;
    if (!milestoneIdParam) {
      return NextResponse.json({ error: "Milestone ID is required" }, { status: 400 });
    }

    // Resolve issue key to database ID if necessary
    const milestoneId = await resolveMilestoneId(milestoneIdParam);
    if (!milestoneId) {
      return NextResponse.json({ error: "Milestone not found" }, { status: 404 });
    }

    const milestone = await prisma.milestone.findUnique({
      where: { id: milestoneId },
      include: {
        taskBoard: { select: { id: true, name: true } },
        epics: { // Include related epics
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
        // Include other relations as needed
      },
    });

    if (!milestone) {
      return NextResponse.json({ error: "Milestone not found" }, { status: 404 });
    }

    // Verify user belongs to the workspace (either as owner or member)
    const workspace = await prisma.workspace.findFirst({
      where: {
        id: milestone.workspaceId,
        OR: [
          { ownerId: session.user.id }, // User is workspace owner
          { 
            members: {
              some: { userId: session.user.id } // User is workspace member
            }
          }
        ]
      },
    });

    if (!workspace) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json(milestone);

  } catch (error) {
    console.error("Error fetching milestone:", error);
    return NextResponse.json({ error: "Failed to fetch milestone" }, { status: 500 });
  }
}

// PATCH /api/milestones/{milestoneId} - Update a milestone
export async function PATCH(
  request: NextRequest,
  { params }: { params: { milestoneId: string } }
) {
  const _params = await params;
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { milestoneId: milestoneIdParam } = _params;
    if (!milestoneIdParam) {
      return NextResponse.json({ error: "Milestone ID is required" }, { status: 400 });
    }
    
    // Resolve issue key to database ID if necessary
    const milestoneId = await resolveMilestoneId(milestoneIdParam);
    if (!milestoneId) {
      return NextResponse.json({ error: "Milestone not found" }, { status: 404 });
    }

    const body = await request.json();

    // Validate input
    const validation = milestonePatchSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ error: "Invalid input", details: validation.error.errors }, { status: 400 });
    }
    
    const dataToUpdate = validation.data;

    // Fetch the milestone first to check ownership
    const existingMilestone = await prisma.milestone.findUnique({
      where: { id: milestoneId },
      select: { workspaceId: true },
    });

    if (!existingMilestone) {
      return NextResponse.json({ error: "Milestone not found" }, { status: 404 });
    }

    // Verify user is part of the workspace (either as owner or member)
    const workspace = await prisma.workspace.findFirst({
      where: {
        id: existingMilestone.workspaceId,
        OR: [
          { ownerId: session.user.id }, // User is workspace owner
          { 
            members: {
              some: { userId: session.user.id } // User is workspace member
            }
          }
        ]
      },
    });

    if (!workspace) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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

    // Get current user for activity tracking
    const user = await prisma.user.findUnique({
      where: { email: session.user.email! },
      select: { id: true }
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Get the current milestone to access its board and capture old data for tracking
    const currentMilestone = await prisma.milestone.findUnique({
      where: { id: milestoneId },
      include: { taskBoard: true, column: true }
    });

    if (!currentMilestone) {
      return NextResponse.json({ error: "Milestone not found" }, { status: 404 });
    }

    // Store old data for activity tracking
    const oldMilestoneData = {
      title: currentMilestone.title,
      description: currentMilestone.description,
      status: currentMilestone.column?.name || undefined,
      startDate: currentMilestone.startDate,
      dueDate: currentMilestone.dueDate,
      assigneeId: currentMilestone.assigneeId,
      reporterId: currentMilestone.reporterId,
      color: currentMilestone.color,
      columnId: currentMilestone.columnId,
    };

    // Find the column ID if status is being updated
    let columnId = dataToUpdate.columnId;
    
    if (dataToUpdate.status && currentMilestone && dataToUpdate.status !== currentMilestone.column?.name) {
      // Find the column with the given name in the milestone's board
      const column = await prisma.taskColumn.findFirst({
        where: {
          name: dataToUpdate.status,
          taskBoardId: currentMilestone.taskBoardId,
        },
      });
      
      if (column) {
        columnId = column.id;
      }
    }

    // Prepare labels update if provided
    const { labels, ...otherData } = dataToUpdate;
    
    // Update the milestone with the columnId if found
    const finalDataToUpdate = {
      ...otherData,
      ...(columnId && { columnId }),
      ...(labels !== undefined && {
        labels: {
          set: labels.map((labelId: string) => ({ id: labelId }))
        }
      })
    };

    const updatedMilestone = await prisma.milestone.update({
      where: { id: milestoneId },
      data: finalDataToUpdate,
      include: {
        taskBoard: { select: { id: true, name: true } },
        epics: { 
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

    // Create new data object for comparison
    const newMilestoneData = {
      title: updatedMilestone.title,
      description: updatedMilestone.description,
      status: dataToUpdate.status || oldMilestoneData.status,
      startDate: updatedMilestone.startDate,
      dueDate: updatedMilestone.dueDate,
      assigneeId: updatedMilestone.assigneeId,
      reporterId: updatedMilestone.reporterId,
      color: updatedMilestone.color,
      columnId: updatedMilestone.columnId,
    };

    // Define fields to track
    const fieldsToTrack = [
      'title', 'description', 'status', 'startDate', 'dueDate',
      'assigneeId', 'reporterId', 'color', 'columnId'
    ];

    // Track field changes with enhanced user tracking for assignments
    try {
      const changes = compareObjects(oldMilestoneData, newMilestoneData, fieldsToTrack);
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
              'MILESTONE',
              milestoneId,
              user.id,
              updatedMilestone.workspaceId,
              oldAssignee,
              newAssignee,
              updatedMilestone.taskBoardId
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
              itemType: 'MILESTONE',
              itemId: milestoneId,
              action: 'REPORTER_CHANGED',
              userId: user.id,
              workspaceId: updatedMilestone.workspaceId,
              boardId: updatedMilestone.taskBoardId,
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
              'startDate': 'START_DATE_CHANGED',
              'dueDate': 'DUE_DATE_CHANGED',
              'color': 'COLOR_CHANGED',
              'columnId': 'COLUMN_CHANGED',
            };

            await createActivity({
              itemType: 'MILESTONE',
              itemId: milestoneId,
              action: fieldActionMap[change.field] || 'UPDATED',
              userId: user.id,
              workspaceId: updatedMilestone.workspaceId,
              boardId: updatedMilestone.taskBoardId,
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
      console.error('Failed to track milestone update activities:', error);
      // Don't fail the milestone update if activity tracking fails
    }

    return NextResponse.json(updatedMilestone);

  } catch (error) {
    console.error("Error updating milestone:", error);
    return NextResponse.json({ error: "Failed to update milestone" }, { status: 500 });
  }
}

// DELETE /api/milestones/{milestoneId} - Delete a milestone (Optional)
export async function DELETE(
  request: NextRequest,
  { params }: { params: { milestoneId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { milestoneId: milestoneIdParam } = params;
    if (!milestoneIdParam) {
      return NextResponse.json({ error: "Milestone ID is required" }, { status: 400 });
    }

    // Resolve issue key to database ID if necessary
    const milestoneId = await resolveMilestoneId(milestoneIdParam);
    if (!milestoneId) {
      return new NextResponse(null, { status: 204 });
    }

    // Fetch the milestone first to check ownership
    const existingMilestone = await prisma.milestone.findUnique({
      where: { id: milestoneId },
      select: { workspaceId: true },
    });

    if (!existingMilestone) {
      return new NextResponse(null, { status: 204 }); 
    }

    // Verify user is part of the workspace (either as owner or member)
    const workspace = await prisma.workspace.findFirst({
      where: {
        id: existingMilestone.workspaceId,
        OR: [
          { ownerId: session.user.id }, // User is workspace owner
          { 
            members: {
              some: { userId: session.user.id } // User is workspace member
            }
          }
        ]
      },
    });

    if (!workspace) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Delete the milestone
    await prisma.milestone.delete({
      where: { id: milestoneId },
    });

    return new NextResponse(null, { status: 204 });

  } catch (error) {
    console.error("Error deleting milestone:", error);
    return NextResponse.json({ error: "Failed to delete milestone" }, { status: 500 });
  }
} 