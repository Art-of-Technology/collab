import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { userSelectFields } from "@/lib/user-utils";

// GET /api/tasks/boards/[boardId]/tasks - Get all tasks for a board
export async function GET(
  request: NextRequest,
  { params }: { params: { boardId: string } }
) {
  const _params = await params;
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { boardId } = _params;

    // Check if the board exists
    const board = await prisma.taskBoard.findUnique({
      where: { id: boardId },
    });

    if (!board) {
      return NextResponse.json(
        { error: "Board not found" },
        { status: 404 }
      );
    }

    // Get the search parameters for filtering
    const { searchParams } = new URL(request.url);
    const assigneeId = searchParams.get("assignee");
    const type = searchParams.get("type");
    const priority = searchParams.get("priority");
    const status = searchParams.get("status");
    const searchQuery = searchParams.get("q");

    // Build the query filters
    const filters: any = {
      taskBoardId: boardId,
    };

    if (assigneeId) {
      filters.assigneeId = assigneeId;
    }

    if (type) {
      filters.type = type;
    }

    if (priority) {
      filters.priority = priority;
    }

    if (status) {
      filters.status = status;
    }

    if (searchQuery) {
      filters.OR = [
        {
          title: {
            contains: searchQuery,
            mode: "insensitive",
          },
        },
        {
          description: {
            contains: searchQuery,
            mode: "insensitive",
          },
        },
      ];
    }

    // Fetch tasks
    const tasks = await prisma.task.findMany({
      where: filters,
      include: {
        assignee: {
          select: userSelectFields,
        },
        column: {
          select: {
            name: true,
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
        updatedAt: "desc",
      },
    });

    // Map tasks to include their column name as status
    const mappedTasks = tasks.map((task: any) => ({
      ...task,
      status: task.status || task.column?.name || "No Status",
    }));

    return NextResponse.json(mappedTasks);
  } catch (error) {
    console.error("Error fetching tasks:", error);
    return NextResponse.json(
      { error: "Failed to fetch tasks" },
      { status: 500 }
    );
  }
} 