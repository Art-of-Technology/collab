import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

export async function GET(
  req: Request,
  { params }: { params: { taskBoardId: string } }
) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json(
        { message: "Unauthorized" },
        { status: 401 }
      );
    }

    const taskBoardId = params.taskBoardId;
    
    if (!taskBoardId) {
      return NextResponse.json(
        { message: "Task board ID is required" },
        { status: 400 }
      );
    }

    // Find the task board
    const taskBoard = await prisma.taskBoard.findUnique({
      where: {
        id: taskBoardId,
      },
      include: {
        columns: {
          orderBy: {
            order: 'asc',
          },
        },
        _count: {
          select: {
            tasks: true,
          }
        },
      },
    });

    if (!taskBoard) {
      return NextResponse.json(
        { message: "Task board not found" },
        { status: 404 }
      );
    }

    // Verify the user has access to this workspace
    const hasAccess = await prisma.workspace.findFirst({
      where: {
        id: taskBoard.workspaceId,
        OR: [
          { ownerId: currentUser.id },
          { members: { some: { userId: currentUser.id } } }
        ]
      },
    });
    
    if (!hasAccess) {
      return NextResponse.json(
        { message: "You don't have access to this task board" },
        { status: 403 }
      );
    }

    return NextResponse.json(taskBoard);
  } catch (error) {
    console.error("Error fetching task board:", error);
    return NextResponse.json(
      { message: "Error fetching task board" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { taskBoardId: string } }
) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json(
        { message: "Unauthorized" },
        { status: 401 }
      );
    }

    const taskBoardId = params.taskBoardId;
    
    if (!taskBoardId) {
      return NextResponse.json(
        { message: "Task board ID is required" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { name, description } = body;

    // Find the task board
    const taskBoard = await prisma.taskBoard.findUnique({
      where: {
        id: taskBoardId,
      },
      select: {
        workspaceId: true,
      }
    });

    if (!taskBoard) {
      return NextResponse.json(
        { message: "Task board not found" },
        { status: 404 }
      );
    }

    // Verify the user has access to this workspace
    const hasAccess = await prisma.workspace.findFirst({
      where: {
        id: taskBoard.workspaceId,
        OR: [
          { ownerId: currentUser.id },
          { members: { some: { userId: currentUser.id } } }
        ]
      },
    });
    
    if (!hasAccess) {
      return NextResponse.json(
        { message: "You don't have access to this task board" },
        { status: 403 }
      );
    }

    // Update the task board
    const updatedTaskBoard = await prisma.taskBoard.update({
      where: {
        id: taskBoardId,
      },
      data: {
        name,
        description,
      },
    });

    return NextResponse.json(updatedTaskBoard);
  } catch (error) {
    console.error("Error updating task board:", error);
    return NextResponse.json(
      { message: "Error updating task board" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { taskBoardId: string } }
) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json(
        { message: "Unauthorized" },
        { status: 401 }
      );
    }

    const taskBoardId = params.taskBoardId;
    
    if (!taskBoardId) {
      return NextResponse.json(
        { message: "Task board ID is required" },
        { status: 400 }
      );
    }

    // Find the task board
    const taskBoard = await prisma.taskBoard.findUnique({
      where: {
        id: taskBoardId,
      },
      select: {
        workspaceId: true,
      }
    });

    if (!taskBoard) {
      return NextResponse.json(
        { message: "Task board not found" },
        { status: 404 }
      );
    }

    // Verify the user has access to this workspace and is the owner
    const workspace = await prisma.workspace.findFirst({
      where: {
        id: taskBoard.workspaceId,
        ownerId: currentUser.id
      },
    });
    
    if (!workspace) {
      return NextResponse.json(
        { message: "You don't have permission to delete this task board" },
        { status: 403 }
      );
    }

    // Delete the task board and all related entities (columns, tasks)
    await prisma.$transaction([
      prisma.task.deleteMany({
        where: {
          taskBoardId,
        },
      }),
      prisma.taskColumn.deleteMany({
        where: {
          taskBoardId,
        },
      }),
      prisma.taskBoard.delete({
        where: {
          id: taskBoardId,
        },
      }),
    ]);

    return NextResponse.json({ message: "Task board deleted successfully" });
  } catch (error) {
    console.error("Error deleting task board:", error);
    return NextResponse.json(
      { message: "Error deleting task board" },
      { status: 500 }
    );
  }
} 