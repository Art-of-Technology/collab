import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

// PATCH /api/tasks/[taskId]/move - Move a task to a different column
export async function PATCH(
  req: NextRequest,
  { params }: { params: { taskId: string } }
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

    const { taskId } = _params;
    const { columnId, position } = await req.json();

    if (!columnId) {
      return NextResponse.json(
        { error: "Column ID is required" },
        { status: 400 }
      );
    }

    // Fetch the task to check permissions
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { workspaceId: true, columnId: true, position: true },
    });

    if (!task) {
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404 }
      );
    }

    // Check if user has access to the workspace
    const hasAccess = await prisma.workspaceMember.findFirst({
      where: {
        userId: currentUser.id,
        workspaceId: task.workspaceId,
      },
    });

    if (!hasAccess) {
      return NextResponse.json(
        { error: "You don't have access to this task" },
        { status: 403 }
      );
    }

    // Get the destination column to check if it exists
    const column = await prisma.taskColumn.findUnique({
      where: { id: columnId },
      include: {
        taskBoard: {
          select: {
            id: true,
          },
        },
      },
    });

    if (!column) {
      return NextResponse.json(
        { error: "Destination column not found" },
        { status: 404 }
      );
    }

    // Begin a transaction to handle position updates
    await prisma.$transaction(async (tx) => {
      const currentPosition = task.position || 0;
      
      // If moving to a different column
      if (task.columnId !== columnId) {
        // Decrement positions for tasks after the moved task in the source column
        await tx.task.updateMany({
          where: {
            columnId: task.columnId,
            position: {
              gt: currentPosition,
            },
          },
          data: {
            position: {
              decrement: 1,
            },
          },
        });

        // Increment positions for tasks at or after the target position in destination column
        await tx.task.updateMany({
          where: {
            columnId: columnId,
            position: {
              gte: position,
            },
          },
          data: {
            position: {
              increment: 1,
            },
          },
        });
      } else {
        // Moving within the same column
        if (currentPosition === position) {
          // No change needed if position is the same
          return;
        }

        if (currentPosition < position) {
          // Moving down - decrement positions for tasks between old and new positions
          await tx.task.updateMany({
            where: {
              columnId: columnId,
              position: {
                gt: currentPosition,
                lte: position,
              },
            },
            data: {
              position: {
                decrement: 1,
              },
            },
          });
        } else {
          // Moving up - increment positions for tasks between new and old positions
          await tx.task.updateMany({
            where: {
              columnId: columnId,
              position: {
                gte: position,
                lt: currentPosition,
              },
            },
            data: {
              position: {
                increment: 1,
              },
            },
          });
        }
      }

      // Update the task's column and position
      await tx.task.update({
        where: { id: taskId },
        data: {
          columnId,
          position,
          taskBoardId: column.taskBoard.id,
          status: column.name, // Update status based on column name
        },
      });
    });

    // Get the updated task
    const updatedTask = await prisma.task.findUnique({
      where: { id: taskId },
    });

    // Record activity
    await prisma.taskActivity.create({
      data: {
        taskId,
        userId: currentUser.id,
        action: "moved",
        details: JSON.stringify({
          columnId,
          columnName: column.name,
          position,
        }),
      },
    });

    return NextResponse.json(updatedTask);
  } catch (error) {
    console.error("Error moving task:", error);
    return NextResponse.json(
      { error: "Failed to move task" },
      { status: 500 }
    );
  }
} 