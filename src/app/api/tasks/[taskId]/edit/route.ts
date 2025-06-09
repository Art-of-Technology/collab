import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

// PATCH /api/tasks/[taskId]/edit - Edit task details
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const _params = await params;
    const taskId = _params.taskId;
    const { 
      title, 
      description, 
      priority, 
      status, 
      dueDate, 
      assigneeId,
      type 
    } = await request.json();

    // Find the task to check workspace access and get current values
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        column: true,
        workspace: true,
        taskBoard: true,
      },
    });

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // Check if user has access to the workspace (either as owner or member)
    const workspaceAccess = await prisma.workspace.findFirst({
      where: {
        id: task.workspaceId,
        OR: [
          { ownerId: user.id }, // User is the owner
          { members: { some: { userId: user.id } } } // User is a member
        ]
      }
    });

    if (!workspaceAccess) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Find the column ID if status is being updated
    let columnId = task.columnId;
    
    if (status && status !== task.column?.name) {
      // Find the column with the given name in the task's board
      const column = await prisma.taskColumn.findFirst({
        where: {
          name: status,
          taskBoardId: task.taskBoardId || undefined,
        },
      });
      
      if (column) {
        columnId = column.id;
      }
    }

    // Update the task
    const updatedTask = await prisma.task.update({
      where: { id: taskId },
      data: {
        title: title !== undefined ? title : undefined,
        description: description !== undefined ? description : undefined,
        priority: priority !== undefined ? priority : undefined,
        status: status !== undefined ? status : undefined,
        type: type !== undefined ? type : undefined,
        columnId: columnId,
        dueDate: dueDate !== undefined ? dueDate : undefined,
        assigneeId: assigneeId !== undefined ? assigneeId || null : undefined,
      },
      include: {
        assignee: true,
        reporter: true,
        column: true,
        workspace: true,
        taskBoard: true,
        labels: true,
        comments: {
          include: {
            author: true,
          },
          orderBy: {
            createdAt: "desc",
          },
        },
      },
    });

    return NextResponse.json(updatedTask);
  } catch (error) {
    console.error("Error updating task:", error);
    return NextResponse.json(
      { error: "Failed to update task" },
      { status: 500 }
    );
  }
} 