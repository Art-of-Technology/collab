import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

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
        // Use relation syntax for storyId
        ...(storyId ? {
          story: {
            connect: {
              id: storyId
            }
          }
        } : {}),
        // Use relation syntax for epicId
        ...(epicId ? {
          epic: {
            connect: {
              id: epicId
            }
          }
        } : {}),
        // Use relation syntax for milestoneId
        ...(milestoneId ? {
          milestone: {
            connect: {
              id: milestoneId
            }
          }
        } : {}),
        // Create activity record for task creation
        activity: {
          create: {
            action: "created",
            userId: session.user.id,
          },
        },
        // Connect labels if provided
        labels: labels && labels.length > 0
          ? {
              connect: labels.map((labelId: string) => ({ id: labelId })),
            }
          : undefined,
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