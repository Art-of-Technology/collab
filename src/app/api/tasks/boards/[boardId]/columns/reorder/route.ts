import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

// PATCH /api/tasks/boards/[boardId]/columns/reorder
export async function PATCH(
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
    const { columns } = await req.json();

    if (!Array.isArray(columns)) {
      return NextResponse.json(
        { error: "Invalid columns data" },
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

    // Check if user has access to the workspace
    const hasAccess = await prisma.workspaceMember.findFirst({
      where: {
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

    // Update column order in transactions
    const updates = columns.map((column: { id: string; order: number }) =>
      prisma.taskColumn.update({
        where: { id: column.id },
        data: { order: column.order },
      })
    );

    const updatedColumns = await prisma.$transaction(updates);

    return NextResponse.json(updatedColumns);
  } catch (error) {
    console.error("Error reordering columns:", error);
    return NextResponse.json(
      { error: "Failed to reorder columns" },
      { status: 500 }
    );
  }
} 