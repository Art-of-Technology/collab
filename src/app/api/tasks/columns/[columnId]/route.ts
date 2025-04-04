import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

// PATCH /api/tasks/columns/[columnId] - Edit a column
export async function PATCH(
  req: NextRequest,
  { params }: { params: { columnId: string } }
) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { columnId } = params;
    const { name, color } = await req.json();

    if (!name || name.trim() === "") {
      return NextResponse.json(
        { error: "Column name is required" },
        { status: 400 }
      );
    }

    // Fetch the column to check permissions
    const column = await prisma.taskColumn.findUnique({
      where: { id: columnId },
      include: { taskBoard: true },
    });

    if (!column) {
      return NextResponse.json(
        { error: "Column not found" },
        { status: 404 }
      );
    }

    // Check if user has admin rights in the workspace
    const userWorkspaceMembership = await prisma.workspaceMember.findFirst({
      where: {
        userId: currentUser.id,
        workspaceId: column.taskBoard.workspaceId,
      },
    });

    if (!userWorkspaceMembership) {
      return NextResponse.json(
        { error: "You don't have access to this column" },
        { status: 403 }
      );
    }

    // Check if the user is the workspace owner
    const workspace = await prisma.workspace.findUnique({
      where: { id: column.taskBoard.workspaceId },
      select: { ownerId: true },
    });

    const isWorkspaceOwner = workspace?.ownerId === currentUser.id;
    const isWorkspaceAdmin = userWorkspaceMembership.role === 'admin' || userWorkspaceMembership.role === 'owner';
    const isGlobalAdmin = currentUser.role === 'admin';

    // Only allow workspace admins, workspace owners, or global admins to edit columns
    if (!isWorkspaceOwner && !isWorkspaceAdmin && !isGlobalAdmin) {
      return NextResponse.json(
        { error: "You don't have permission to edit columns in this board" },
        { status: 403 }
      );
    }

    // Update column
    const updatedColumn = await prisma.taskColumn.update({
      where: { id: columnId },
      data: {
        name,
        color,
      },
    });

    return NextResponse.json(updatedColumn);
  } catch (error) {
    console.error("Error updating column:", error);
    return NextResponse.json(
      { error: "Failed to update column" },
      { status: 500 }
    );
  }
}

// DELETE /api/tasks/columns/[columnId] - Delete a column
export async function DELETE(
  req: NextRequest,
  { params }: { params: { columnId: string } }
) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { columnId } = params;

    // Fetch the column to check permissions
    const column = await prisma.taskColumn.findUnique({
      where: { id: columnId },
      include: { 
        taskBoard: {
          include: {
            columns: {
              orderBy: {
                order: "asc",
              },
            },
          },
        },
      },
    });

    if (!column) {
      return NextResponse.json(
        { error: "Column not found" },
        { status: 404 }
      );
    }

    // Check if user has admin rights in the workspace
    const userWorkspaceMembership = await prisma.workspaceMember.findFirst({
      where: {
        userId: currentUser.id,
        workspaceId: column.taskBoard.workspaceId,
      },
    });

    if (!userWorkspaceMembership) {
      return NextResponse.json(
        { error: "You don't have access to this column" },
        { status: 403 }
      );
    }

    // Check if the user is the workspace owner
    const workspace = await prisma.workspace.findUnique({
      where: { id: column.taskBoard.workspaceId },
      select: { ownerId: true },
    });

    const isWorkspaceOwner = workspace?.ownerId === currentUser.id;
    const isWorkspaceAdmin = userWorkspaceMembership.role === 'admin' || userWorkspaceMembership.role === 'owner';
    const isGlobalAdmin = currentUser.role === 'admin';

    // Only allow workspace admins, workspace owners, or global admins to delete columns
    if (!isWorkspaceOwner && !isWorkspaceAdmin && !isGlobalAdmin) {
      return NextResponse.json(
        { error: "You don't have permission to delete columns in this board" },
        { status: 403 }
      );
    }

    // Find the first column (we'll move tasks there)
    const firstColumn = column.taskBoard.columns.find(c => c.id !== columnId);

    if (!firstColumn) {
      return NextResponse.json(
        { error: "Cannot delete the only column on a board" },
        { status: 400 }
      );
    }

    // Move tasks to the first column
    await prisma.task.updateMany({
      where: { columnId },
      data: { columnId: firstColumn.id },
    });

    // Delete the column
    await prisma.taskColumn.delete({
      where: { id: columnId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting column:", error);
    return NextResponse.json(
      { error: "Failed to delete column" },
      { status: 500 }
    );
  }
} 