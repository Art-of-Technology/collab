import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { z } from 'zod';

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

    const { milestoneId } = _params;
    if (!milestoneId) {
      return NextResponse.json({ error: "Milestone ID is required" }, { status: 400 });
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

    const { milestoneId } = _params;
    if (!milestoneId) {
      return NextResponse.json({ error: "Milestone ID is required" }, { status: 400 });
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

    // Get the current milestone to access its board
    const currentMilestone = await prisma.milestone.findUnique({
      where: { id: milestoneId },
      include: { taskBoard: true, column: true }
    });

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

    const { milestoneId } = params;
    if (!milestoneId) {
      return NextResponse.json({ error: "Milestone ID is required" }, { status: 400 });
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