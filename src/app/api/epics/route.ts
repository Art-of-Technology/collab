import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

// POST /api/epics - Create a new epic
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
      startDate,
      dueDate,
      milestoneId,
      taskBoardId,
      workspaceId,
      color,
      columnId,
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
      // Update the board's next issue number for the epic
      const updatedBoard = await prisma.taskBoard.update({
        where: { id: board.id },
        data: { nextIssueNumber: { increment: 1 } },
      });
      
      issueKey = `${board.issuePrefix}-E${updatedBoard.nextIssueNumber - 1}`;
    }

    // Create the epic
    const epic = await prisma.epic.create({
      data: {
        title,
        description,
        status: status || "backlog",
        priority: priority || "medium",
        startDate: startDate ? new Date(startDate) : undefined,
        dueDate: dueDate ? new Date(dueDate) : undefined,
        milestoneId,
        taskBoardId,
        workspaceId,
        columnId,
        issueKey,
        color: color || "#6366F1",
      },
      include: {
        milestone: {
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

    return NextResponse.json(epic, { status: 201 });
  } catch (error) {
    console.error("Error creating epic:", error);
    return NextResponse.json(
      { error: "Failed to create epic" },
      { status: 500 }
    );
  }
}

// GET /api/epics - List epics, with optional filtering
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
    const milestoneId = url.searchParams.get('milestoneId');
    const workspaceId = url.searchParams.get('workspaceId');
    const status = url.searchParams.get('status');
    const columnId = url.searchParams.get('columnId');

    // Construct query filters
    const filters: any = {};

    if (boardId) {
      filters.taskBoardId = boardId;
    }

    if (milestoneId) {
      filters.milestoneId = milestoneId;
    }

    if (workspaceId) {
      filters.workspaceId = workspaceId;
    }

    if (status) {
      filters.status = status;
    }

    if (columnId) {
      filters.columnId = columnId;
    }

    // Fetch epics with filters
    const epics = await prisma.epic.findMany({
      where: filters,
      include: {
        milestone: {
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
            stories: true,
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    return NextResponse.json(epics);
  } catch (error) {
    console.error("Error fetching epics:", error);
    return NextResponse.json(
      { error: "Failed to fetch epics" },
      { status: 500 }
    );
  }
} 