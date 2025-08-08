import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { trackCreation, trackMove } from "@/lib/board-item-activity-service";
import { NotificationService, NotificationType } from "@/lib/notification-service";
import { prisma } from "@/lib/prisma";
import { extractMentionUserIds } from "@/utils/mentions";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

// POST /api/tasks - Create a new task
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }


    const body = await request.json();
    const {
      title,
      description,
      priority,
      type,
      status,
      storyPoints,
      dueDate,
      columnId,
      taskBoardId,
      workspaceId,
      assigneeId,
      parentTaskId,
      storyId,
      epicId,
      milestoneId,
      postId,
      labels,
    } = body;

    // Required fields
    if (!title || !workspaceId || !taskBoardId) {
      return NextResponse.json(
        { error: "Title, workspace ID, and board ID are required" },
        { status: 400 }
      );
    }

    // Check if board exists
    const board = await prisma.taskBoard.findUnique({
      where: {
        id: taskBoardId,
        workspaceId: workspaceId,
      },
      select: {
        id: true,
        name: true,
        workspaceId: true,
        issuePrefix: true,
        nextIssueNumber: true
      }
    });

    if (!board) {
      return NextResponse.json(
        { error: "Board not found or does not belong to the workspace" },
        { status: 404 }
      );
    }

    // Generate issue key if board has a prefix
    let issueKey = null;
    if (board.issuePrefix) {
      // Get the next number and increment it
      const nextNum = board.nextIssueNumber;
      issueKey = `${board.issuePrefix}-${nextNum}`;
      
      // Update the board's next issue number
      await prisma.taskBoard.update({
        where: { id: board.id },
        data: { nextIssueNumber: { increment: 1 } } as any
      });
    }

    // Find the first column if columnId is not provided
    let actualColumnId = columnId;
    if (!actualColumnId) {
      const firstColumn = await prisma.taskColumn.findFirst({
        where: {
          taskBoardId: taskBoardId,
        },
        orderBy: {
          order: 'asc',
        },
      });
      
      if (firstColumn) {
        actualColumnId = firstColumn.id;
      }
    }

    // Create the task
    const task = await prisma.task.create({
      data: {
        title,
        description,
        priority: priority || "medium",
        type: type || "task",
        status,
        storyPoints,
        issueKey,
        dueDate: dueDate ? new Date(dueDate) : undefined,
        columnId: actualColumnId,
        taskBoardId,
        workspaceId,
        assigneeId,
        parentTaskId,
        postId,
        reporterId: session.user.id,
        storyId,
        epicId,
        milestoneId,
        // Connect labels if provided
        ...(labels && labels.length > 0 && {
          labels: {
            connect: labels.map((labelId: string) => ({ id: labelId })),
          }
        }),
      },
      include: {
        assignee: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
        reporter: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
        column: true,
        taskBoard: true,
        labels: true,
        story: {
          select: {
            id: true,
            title: true,
          },
        },
        epic: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });

    // Track task creation activity
    try {
      await trackCreation(
        'TASK',
        task.id,
        session.user.id,
        workspaceId,
        taskBoardId,
        {
          title: task.title,
          priority: task.priority,
          assigneeId: task.assigneeId,
          columnId: task.columnId,
        }
      );
      await NotificationService.notifyBoardFollowers({
        boardId: taskBoardId,
        taskId: task.id,
        senderId: session.user.id,
        type: NotificationType.TASK_CREATED,
        content: `Task ${task.title} was created`,
        excludeUserIds: [session.user.id],
      });
      
      // Process mentions in task description
      if (description) {
        const mentionedUserIds = extractMentionUserIds(description);
        if (mentionedUserIds.length > 0) {
          await NotificationService.createTaskDescriptionMentionNotifications(
            task.id,
            mentionedUserIds,
            session.user.id,
            task.title
          );
        }
      }
    } catch (activityError) {
      console.error("Failed to track task creation activity:", activityError);
      // Don't fail the task creation if activity tracking fails
    }

    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    console.error("Error creating task:", error);
    return NextResponse.json(
      { error: "Failed to create task" },
      { status: 500 }
    );
  }
}

// GET /api/tasks - List tasks, with optional filtering
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Get query parameters
    const url = new URL(request.url);
    const boardId = url.searchParams.get('boardId');
    const columnId = url.searchParams.get('columnId');
    const assigneeId = url.searchParams.get('assigneeId');
    const storyId = url.searchParams.get('storyId');
    const epicId = url.searchParams.get('epicId');
    const milestoneId = url.searchParams.get('milestoneId');

    // Construct query filters
    const filters: any = {};

    if (boardId) {
      filters.taskBoardId = boardId;
    }

    if (columnId) {
      filters.columnId = columnId;
    }

    if (assigneeId) {
      filters.assigneeId = assigneeId === 'unassigned' ? null : assigneeId;
    }

    if (storyId) {
      filters.storyId = storyId;
    }

    if (epicId) {
      filters.epicId = epicId;
    }

    if (milestoneId) {
      filters.milestoneId = milestoneId;
    }

    // Fetch tasks with filters
    const tasks = await prisma.task.findMany({
      where: filters,
      include: {
        assignee: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
        column: {
          select: {
            id: true,
            name: true,
          },
        },
        reporter: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
        story: {
          select: {
            id: true,
            title: true,
          },
        },
        _count: {
          select: {
            comments: true,
            attachments: true,
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    return NextResponse.json(tasks);
  } catch (error) {
    console.error("Error fetching tasks:", error);
    return NextResponse.json(
      { error: "Failed to fetch tasks" },
      { status: 500 }
    );
  }
}

// PATCH /api/tasks - Batch update task order and positions
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const updates = await request.json();
    
    // Validate that we have an array of updates
    if (!Array.isArray(updates)) {
      return NextResponse.json(
        { error: "Expected array of task updates" },
        { status: 400 }
      );
    }

    // Validate each update object
    for (const update of updates) {
      if (!update.boardId || !update.columnId || !Array.isArray(update.orderedItemIds)) {
        return NextResponse.json(
          { error: "Each update must have boardId, columnId, and orderedItemIds" },
          { status: 400 }
        );
      }
    }

    // Process each batch update
    const results = [];
    
    for (const update of updates) {
      const { boardId, columnId, orderedItemIds, movedItemId } = update;
      
      // Verify user has access to the board
      const board = await prisma.taskBoard.findFirst({
        where: {
          id: boardId,
          OR: [
            { workspace: { ownerId: session.user.id } },
            { workspace: { members: { some: { userId: session.user.id } } } }
          ]
        }
      });

      if (!board) {
        return NextResponse.json(
          { error: "Board not found or access denied" },
          { status: 403 }
        );
      }

      // Verify column exists and belongs to the board
      const column = await prisma.taskColumn.findFirst({
        where: {
          id: columnId,
          taskBoardId: boardId
        }
      });

      if (!column) {
        return NextResponse.json(
          { error: "Column not found or does not belong to board" },
          { status: 404 }
        );
      }

      // Update task positions in a transaction
      await prisma.$transaction(async (tx) => {
        // Update all tasks in the column with their new positions
        for (let i = 0; i < orderedItemIds.length; i++) {
          const taskId = orderedItemIds[i];
          await tx.task.update({
            where: { id: taskId },
            data: {
              position: i,
              columnId: columnId,
              status: column.name, // Update status to match column
              updatedAt: new Date()
            }
          });
        }
      });

      // If a specific task was moved, track the activity and send notifications
      if (movedItemId) {
        try {
          const movedTask = await prisma.task.findUnique({
            where: { id: movedItemId },
            include: {
              column: { select: { name: true } }
            }
          });

          if (movedTask) {
            // Track the move activity
            await trackMove(
              'TASK',
              movedItemId,
              session.user.id,
              movedTask.workspaceId,
              movedTask.column ? { id: movedTask.columnId as string, name: movedTask.column.name } : null,
              { id: columnId, name: column.name },
              boardId
            );

            // Send notifications for task followers
            await NotificationService.notifyTaskFollowers({
              taskId: movedItemId,
              senderId: session.user.id,
              type: NotificationType.TASK_STATUS_CHANGED,
              content: `Task moved to "${column.name}"`,
              excludeUserIds: []
            });

            // Send notifications for board followers
            await NotificationService.notifyBoardFollowers({
              boardId: boardId,
              taskId: movedItemId,
              senderId: session.user.id,
              type: NotificationType.BOARD_TASK_STATUS_CHANGED,
              content: `Task "${movedTask.title}" moved to "${column.name}"`,
              excludeUserIds: []
            });
          }
        } catch (notificationError) {
          console.error("Failed to send notifications for task move:", notificationError);
          // Don't fail the operation if notifications fail
        }
      }

      results.push({
        boardId,
        columnId,
        updatedCount: orderedItemIds.length
      });
    }

    return NextResponse.json({
      success: true,
      results
    });

  } catch (error) {
    console.error("Error updating task order:", error);
    return NextResponse.json(
      { error: "Failed to update item order" },
      { status: 500 }
    );
  }
} 