import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { publishEvent } from '@/lib/redis';
import { userSelectFields } from "@/lib/user-utils";
import { checkUserPermission, Permission } from "@/lib/permissions";
import { isUUID } from "@/lib/url-utils";

// Check if a string is a CUID (Prisma's default ID format)
function isCUID(str: string): boolean {
  return /^c[a-z0-9]{24}$/.test(str);
}

// Check if a string is a database ID (UUID or CUID)
function isDatabaseId(str: string): boolean {
  return isUUID(str) || isCUID(str);
}

// Define a Task interface
interface TaskWithPosition {
  id: string;
  position: number | null;
  [key: string]: any;
}

// GET /api/tasks/boards/[boardId] - Get a board with its columns and tasks
export async function GET(req: NextRequest, { params }: { params: { boardId: string } }) {
  const _params = await params;
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { boardId } = _params;

    // Resolve board slug to ID if needed
    let board;
    if (isDatabaseId(boardId)) {
      // It's a database ID, find by ID
      board = await prisma.taskBoard.findUnique({
        where: {
          id: boardId,
        },
        include: {
          columns: {
            orderBy: {
              order: "asc",
            },
            include: {
              tasks: {
                include: {
                  assignee: {
                    select: userSelectFields,
                  },
                  _count: {
                    select: {
                      comments: true,
                      attachments: true,
                    },
                  },
                },
              },
            },
          },
        },
      });
    } else {
      // It's a slug, find by slug
      board = await prisma.taskBoard.findFirst({
        where: {
          slug: boardId,
        },
        include: {
          columns: {
            orderBy: {
              order: "asc",
            },
            include: {
              tasks: {
                include: {
                  assignee: {
                    select: userSelectFields,
                  },
                  _count: {
                    select: {
                      comments: true,
                      attachments: true,
                    },
                  },
                },
              },
            },
          },
        },
      });
    }

    if (!board) {
      return NextResponse.json({ error: "Board not found" }, { status: 404 });
    }

    const hasPermission = await checkUserPermission(currentUser.id, board.workspaceId, Permission.EDIT_BOARD);

    if (!hasPermission.hasPermission) {
      // If not the owner or admin, check if they're a workspace member
      const isMember = await prisma.workspaceMember.findFirst({
        where: {
          status: true,
          userId: currentUser.id,
          workspaceId: board.workspaceId,
        },
      });

      if (!isMember) {
        console.error(`Access denied to board ${board.id} for user ${currentUser.id}`);
        return NextResponse.json({ error: "You don't have access to this board" }, { status: 403 });
      }
    } else {
      console.log(`Access granted to board ${board.id} for workspace owner ${currentUser.id}`);
    }

    // If there are tasks without positions, update them
    if (board.columns) {
      for (const column of board.columns) {
        if (column.tasks && column.tasks.length > 0) {
          const tasksWithoutPositions = column.tasks.filter((task: TaskWithPosition) => task.position === null);

          if (tasksWithoutPositions.length > 0) {
            // Get max position in this column
            const maxPosition = Math.max(
              ...column.tasks
                .filter((task: TaskWithPosition) => task.position !== null)
                .map((task: TaskWithPosition) => task.position || 0),
              -1
            );

            // Assign positions to tasks that don't have them
            let nextPosition = maxPosition + 1;

            for (const task of tasksWithoutPositions) {
              await prisma.task.update({
                where: { id: task.id },
                data: { position: nextPosition++ },
              });

              // Update the position in the response
              task.position = nextPosition - 1;
            }
          }

          // Sort tasks by position in the response
          column.tasks.sort((a: TaskWithPosition, b: TaskWithPosition) => (a.position || 0) - (b.position || 0));
        }
      }
    }

    return NextResponse.json(board);
  } catch (error) {
    console.error("Error fetching board:", error);
    return NextResponse.json({ error: "Failed to fetch board" }, { status: 500 });
  }
}

// PATCH board settings
export async function PATCH(req: NextRequest, { params }: { params: { boardId: string } }) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { boardId } = params;
    const { name, description, issuePrefix } = await req.json();

    if (!name || name.trim() === "") {
      return NextResponse.json({ error: "Board name is required" }, { status: 400 });
    }

    if (!issuePrefix || issuePrefix.trim() === "") {
      return NextResponse.json({ error: "Issue prefix is required" }, { status: 400 });
    }

    // Find board to check permissions - handle both ID and slug
    let existingBoard;
    if (isDatabaseId(boardId)) {
      existingBoard = await prisma.taskBoard.findUnique({
        where: { id: boardId },
        select: { id: true, workspaceId: true },
      });
    } else {
      existingBoard = await prisma.taskBoard.findFirst({
        where: { slug: boardId },
        select: { id: true, workspaceId: true },
      });
    }

    if (!existingBoard) {
      return NextResponse.json({ error: "Board not found" }, { status: 404 });
    }

    const hasPermission = await checkUserPermission(currentUser.id, existingBoard.workspaceId, Permission.EDIT_BOARD);

    // Only allow workspace admins, workspace owners, or global admins to update board settings
    if (!hasPermission.hasPermission) {
      return NextResponse.json({ error: "You don't have permission to update board settings" }, { status: 403 });
    }
    // Update board using the resolved database ID
    const updatedBoard = await prisma.taskBoard.update({
      where: { id: existingBoard.id },
      data: {
        name,
        description,
        issuePrefix,
      } as any, // Using type assertion to bypass type check until Prisma client is regenerated
    });

    await publishEvent(`workspace:${existingBoard.workspaceId}:events`, {
      type: 'board.updated',
      workspaceId: existingBoard.workspaceId,
      boardId: updatedBoard.id
    });

    return NextResponse.json(updatedBoard);
  } catch (error) {
    console.error("Error updating board:", error);
    return NextResponse.json({ error: "Failed to update board" }, { status: 500 });
  }
}
