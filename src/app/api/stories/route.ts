import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

// POST /api/stories - Create a new story
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
      status,
      priority,
      type,
      storyPoints,
      epicId,
      taskBoardId,
      workspaceId,
      color,
      columnId,
    } = body;

    // Required fields
    if (!title || !workspaceId) {
      return NextResponse.json(
        { error: "Title and workspace ID are required" },
        { status: 400 }
      );
    }

    // Check if epic exists if epicId is provided
    if (epicId) {
      const epic = await prisma.epic.findUnique({
        where: {
          id: epicId,
          workspaceId: workspaceId,
        },
        select: {
          id: true,
          taskBoardId: true,
          columnId: true, // Also get the column if available
        }
      });

      if (!epic) {
        return NextResponse.json(
          { error: "Epic not found or does not belong to the workspace" },
          { status: 404 }
        );
      }
      
      // Use the epic's taskBoardId if not provided
      if (!taskBoardId) {
        body.taskBoardId = epic.taskBoardId;
      }
      
      // Use the epic's columnId if not provided
      if (!columnId && epic.columnId) {
        body.columnId = epic.columnId;
      }
    }

    // Check if board exists if taskBoardId is provided
    if (taskBoardId) {
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

      // Validate columnId if provided
      if (columnId) {
        const column = await prisma.taskColumn.findUnique({
          where: {
            id: columnId,
            taskBoardId: taskBoardId,
          },
        });

        if (!column) {
          return NextResponse.json(
            { error: "Column not found or does not belong to the selected board" },
            { status: 404 }
          );
        }
      }

      // Generate issue key if board has a prefix
      let issueKey = null;
      if (board.issuePrefix) {
        // Update the board's next issue number for the story
        const updatedBoard = await prisma.taskBoard.update({
          where: { id: board.id },
          data: { nextIssueNumber: { increment: 1 } },
        });
        
        issueKey = `${board.issuePrefix}-${updatedBoard.nextIssueNumber - 1}`;
        body.issueKey = issueKey;
      }
    }

    // Create the story
    const story = await prisma.story.create({
      data: {
        title,
        description,
        status: status || "backlog",
        priority: priority || "medium",
        type: type || "user-story",
        storyPoints,
        epicId,
        taskBoardId,
        workspaceId,
        columnId,
        issueKey: body.issueKey,
        color: color || "#3B82F6", // Use the provided color or default blue
      } as any, // Type assertion to bypass TypeScript error
      include: {
        epic: {
          select: {
            id: true,
            title: true,
          },
        },
        taskBoard: {
          select: {
            id: true,
            name: true,
          },
        },
        column: {
          select: {
            id: true,
            name: true,
            color: true,
          },
        },
      },
    });

    return NextResponse.json(story, { status: 201 });
  } catch (error) {
    console.error("Error creating story:", error);
    return NextResponse.json(
      { error: "Failed to create story" },
      { status: 500 }
    );
  }
}

// GET /api/stories - List stories, with optional filtering
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
    const epicId = url.searchParams.get('epicId');
    const boardId = url.searchParams.get('boardId');
    const workspaceId = url.searchParams.get('workspaceId');
    const status = url.searchParams.get('status');
    const type = url.searchParams.get('type');
    const columnId = url.searchParams.get('columnId');

    // Construct query filters
    const filters: any = {};

    if (epicId) {
      filters.epicId = epicId;
    }

    if (boardId) {
      filters.taskBoardId = boardId;
    }

    if (workspaceId) {
      filters.workspaceId = workspaceId;
    }

    if (status) {
      filters.status = status;
    }

    if (type) {
      filters.type = type;
    }

    if (columnId) {
      filters.columnId = columnId;
    }

    // Fetch stories with filters
    const stories = await prisma.story.findMany({
      where: filters,
      include: {
        epic: {
          select: {
            id: true,
            title: true,
          },
        },
        taskBoard: {
          select: {
            id: true,
            name: true,
          },
        },
        column: {
          select: {
            id: true,
            name: true,
            color: true,
          },
        },
        _count: {
          select: {
            tasks: true,
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    return NextResponse.json(stories);
  } catch (error) {
    console.error("Error fetching stories:", error);
    return NextResponse.json(
      { error: "Failed to fetch stories" },
      { status: 500 }
    );
  }
} 