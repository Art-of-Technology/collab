import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: { boardId: string } }
) {
  try {
    const session = await getAuthSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { boardId } = params;

    // Fetch board with columns and tasks
    const board = await prisma.taskBoard.findFirst({
      where: {
        id: boardId,
        workspace: {
          OR: [
            { ownerId: session.user.id },
            { members: { some: { userId: session.user.id } } }
          ]
        }
      },
      include: {
        columns: {
          orderBy: { order: 'asc' },
          include: {
            tasks: {
              orderBy: { order: 'asc' },
              include: {
                assignee: {
                  select: {
                    id: true,
                    name: true,
                    image: true,
                  }
                },
                milestone: {
                  select: {
                    id: true,
                    title: true,
                  }
                },
                epic: {
                  select: {
                    id: true,
                    title: true,
                  }
                },
                story: {
                  select: {
                    id: true,
                    title: true,
                  }
                },
                _count: {
                  select: {
                    comments: true,
                    attachments: true,
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!board) {
      return NextResponse.json({ error: "Board not found" }, { status: 404 });
    }

    return NextResponse.json({
      id: board.id,
      name: board.name,
      description: board.description,
      columns: board.columns.map(column => ({
        id: column.id,
        name: column.name,
        order: column.order,
        color: column.color,
        tasks: column.tasks.map(task => ({
          id: task.id,
          title: task.title,
          type: task.type,
          priority: task.priority,
          status: task.status,
          issueKey: task.issueKey,
          assignee: task.assignee,
          milestone: task.milestone,
          epic: task.epic,
          story: task.story,
          _count: task._count,
        }))
      }))
    });
  } catch (error) {
    console.error("Error fetching board data:", error);
    return NextResponse.json(
      { error: "Failed to fetch board data" },
      { status: 500 }
    );
  }
}