import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { z } from 'zod';

// Schema for PATCH validation
const epicPatchSchema = z.object({
  title: z.string().min(1, "Title cannot be empty.").optional(),
  description: z.string().nullable().optional(),
  status: z.string().optional(),
  priority: z.string().optional(),
  milestoneId: z.string().nullable().optional(),
  taskBoardId: z.string().optional(),
  columnId: z.string().optional(),
  startDate: z.preprocess((arg) => {
    if (typeof arg == "string" || arg instanceof Date) return new Date(arg);
  }, z.date().nullable().optional()),
  dueDate: z.preprocess((arg) => {
    if (typeof arg == "string" || arg instanceof Date) return new Date(arg);
  }, z.date().nullable().optional()),
  color: z.string().optional(),
}).strict();

// GET /api/epics/{epicId} - Fetch a single epic by ID
export async function GET(
  request: NextRequest,
  { params }: { params: { epicId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { epicId } = params;
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
      },
    });

    if (!epic) {
      return NextResponse.json({ error: "Epic not found" }, { status: 404 });
    }

    // Verify user belongs to the workspace
    const workspaceMember = await prisma.workspaceMember.findFirst({
      where: {
        workspaceId: epic.workspaceId,
        userId: session.user.id,
      },
    });

    if (!workspaceMember) {
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
  { params }: { params: { epicId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { epicId } = params;
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

    // Verify user is part of the workspace
    const workspaceMember = await prisma.workspaceMember.findFirst({
      where: {
        workspaceId: existingEpic.workspaceId,
        userId: session.user.id,
      },
    });

    if (!workspaceMember) {
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
    // --- End Additional Validation ---

    // Update the epic
    const updatedEpic = await prisma.epic.update({
      where: { id: epicId },
      data: dataToUpdate,
      include: {
        milestone: { select: { id: true, title: true } },
        taskBoard: { select: { id: true, name: true } },
        stories: { 
          select: { id: true, title: true, status: true, priority: true },
          orderBy: { createdAt: 'asc' }
        },
      }
    });

    return NextResponse.json(updatedEpic);

  } catch (error) {
    console.error("Error updating epic:", error);
    return NextResponse.json({ error: "Failed to update epic" }, { status: 500 });
  }
}

// DELETE /api/epics/{epicId} - Delete an epic (Optional)
export async function DELETE(
  request: NextRequest,
  { params }: { params: { epicId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { epicId } = params;
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

    // Verify user is part of the workspace
    const workspaceMember = await prisma.workspaceMember.findFirst({
      where: {
        workspaceId: existingEpic.workspaceId,
        userId: session.user.id,
      },
    });

    if (!workspaceMember) {
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