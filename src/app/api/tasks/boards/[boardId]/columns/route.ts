import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

// POST /api/tasks/boards/[boardId]/columns - Create a new column
export async function POST(
  req: NextRequest,
  { params }: { params: { boardId: string } }
) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { boardId } = params;
    const { name, order, color } = await req.json();

    if (!name || name.trim() === "") {
      return NextResponse.json(
        { error: "Column name is required" },
        { status: 400 }
      );
    }

    // Fetch the board to check permissions
    const board = await prisma.taskBoard.findUnique({
      where: { id: boardId },
      select: { workspaceId: true },
    });

    if (!board) {
      return NextResponse.json(
        { error: "Board not found" },
        { status: 404 }
      );
    }

    // Check if user has admin rights in the workspace
    const userWorkspaceMembership = await prisma.workspaceMember.findFirst({
      where: {
        status: true,
        userId: currentUser.id,
        workspaceId: board.workspaceId,
      },
    });

    if (!userWorkspaceMembership) {
      return NextResponse.json(
        { error: "You don't have access to this board" },
        { status: 403 }
      );
    }

    // Check if the user is the workspace owner
    const workspace = await prisma.workspace.findUnique({
      where: { id: board.workspaceId },
      select: { ownerId: true },
    });

    const isWorkspaceOwner = workspace?.ownerId === currentUser.id;
    const isWorkspaceAdmin = userWorkspaceMembership.role === 'admin' || userWorkspaceMembership.role === 'owner';
    const isGlobalAdmin = currentUser.role === 'admin';

    // Only allow workspace admins, workspace owners, or global admins to create columns
    if (!isWorkspaceOwner && !isWorkspaceAdmin && !isGlobalAdmin) {
      return NextResponse.json(
        { error: "You don't have permission to create columns in this board" },
        { status: 403 }
      );
    }

    // Create new column
    const newColumn = await prisma.taskColumn.create({
      data: {
        name,
        order: typeof order === 'number' ? order : 0,
        color,
        taskBoardId: boardId,
      },
    });

    return NextResponse.json(newColumn, { status: 201 });
  } catch (error) {
    console.error("Error creating column:", error);
    return NextResponse.json(
      { error: "Failed to create column" },
      { status: 500 }
    );
  }
}

// GET /api/tasks/boards/[boardId]/columns - Get all columns for a board
export async function GET(
  req: NextRequest,
  { params }: { params: { boardId: string } }
) {
  const _params = await params;
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { boardId } = _params;

    // Fetch the board to check permissions
    const board = await prisma.taskBoard.findUnique({
      where: { id: boardId },
      select: { workspaceId: true },
    });

    if (!board) {
      return NextResponse.json(
        { error: "Board not found" },
        { status: 404 }
      );
    }

    // Check if user has access to the workspace (either as owner or member)
    const workspace = await prisma.workspace.findUnique({
      where: { id: board.workspaceId },
      select: { ownerId: true },
    });

    const isWorkspaceOwner = workspace?.ownerId === currentUser.id;

    const hasAccess = isWorkspaceOwner || await prisma.workspaceMember.findFirst({
      where: {
        status: true,
        userId: currentUser.id,
        workspaceId: board.workspaceId,
      },
    });

    if (!hasAccess) {
      return NextResponse.json(
        { error: "You don't have access to this board" },
        { status: 403 }
      );
    }

    // Get all columns for this board
    const columns = await prisma.taskColumn.findMany({
      where: { taskBoardId: boardId },
      orderBy: { order: "asc" },
    });

    return NextResponse.json(columns);
  } catch (error) {
    console.error("Error fetching columns:", error);
    return NextResponse.json(
      { error: "Failed to fetch columns" },
      { status: 500 }
    );
  }
} 