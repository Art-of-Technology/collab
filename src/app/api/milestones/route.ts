import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

// POST /api/milestones - Create a new milestone
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
      startDate,
      dueDate,
      taskBoardId,
      workspaceId,
      color,
      columnId,
      issueKey,
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

    // Generate issue key if board has a prefix and no custom issueKey is provided
    let finalIssueKey = issueKey;
    if (!finalIssueKey && board.issuePrefix) {
      // Update the board's next issue number for the milestone
      const updatedBoard = await prisma.taskBoard.update({
        where: { id: board.id },
        data: { nextIssueNumber: { increment: 1 } },
      });
      
      finalIssueKey = `${board.issuePrefix}-${updatedBoard.nextIssueNumber - 1}`;
    }

    // Create the milestone
    const milestone = await prisma.milestone.create({
      data: {
        title,
        description,
        status: status || "planned",
        startDate: startDate ? new Date(startDate) : undefined,
        dueDate: dueDate ? new Date(dueDate) : undefined,
        taskBoardId,
        workspaceId,
        columnId,
        color: color || "#6366F1",
        issueKey: finalIssueKey,
      },
      include: {
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
          },
        },
        _count: {
          select: {
            epics: true,
          },
        },
      },
    });

    return NextResponse.json(milestone, { status: 201 });
  } catch (error) {
    console.error("Error creating milestone:", error);
    return NextResponse.json(
      { error: "Failed to create milestone" },
      { status: 500 }
    );
  }
}

// GET /api/milestones - List milestones, with optional filtering
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
    const workspaceId = url.searchParams.get('workspaceId');
    const status = url.searchParams.get('status');
    const columnId = url.searchParams.get('columnId');

    // Construct query filters
    const filters: any = {};

    if (boardId) {
      filters.taskBoardId = boardId;
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

    // Fetch milestones with filters
    const milestones = await prisma.milestone.findMany({
      where: filters,
      include: {
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
            epics: true,
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    return NextResponse.json(milestones);
  } catch (error) {
    console.error("Error fetching milestones:", error);
    return NextResponse.json(
      { error: "Failed to fetch milestones" },
      { status: 500 }
    );
  }
} 