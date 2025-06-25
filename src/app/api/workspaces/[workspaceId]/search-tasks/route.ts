import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const _params = await params;
  const { workspaceId } = _params;
  const userId = session.user.id;

  const { searchParams } = new URL(req.url);
  const query = searchParams.get('q') || '';

  if (!workspaceId) {
    return new NextResponse("Workspace ID is required", { status: 400 });
  }

  try {
    // Verify workspace access before searching tasks
    const workspace = await prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        OR: [
          { ownerId: userId },
          { members: { some: { userId: userId } } }
        ]
      },
      select: {
        id: true,
        name: true,
        ownerId: true
      }
    });

    if (!workspace) {
      console.error(`User ${userId} attempted to search tasks from workspace ${workspaceId} but has no access`);
      return new NextResponse("No access to this workspace", { status: 403 });
    }

    // Search tasks in the workspace
    const tasks = await prisma.task.findMany({
      where: {
        workspaceId: workspaceId,
        OR: [
          { title: { contains: query, mode: 'insensitive' } },
          { issueKey: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } }
        ]
      },
      take: 20, // Limit results
      include: {
        taskBoard: {
          select: {
            id: true,
            name: true,
          }
        },
        column: {
          select: {
            name: true,
          }
        },
        assignee: {
          select: {
            id: true,
            name: true,
            image: true,
          }
        },
        activities: {
          where: {
            action: {
              in: ["TASK_PLAY_STARTED", "TASK_PLAY_PAUSED", "TASK_PLAY_STOPPED"]
            }
          },
          orderBy: {
            createdAt: "desc"
          },
          include: {
            user: {
              select: {
                id: true
              }
            }
          }
        }
      },
      orderBy: [
        { taskBoard: { name: "asc" } },
        { title: "asc" }
      ]
    });

    const formattedTasks = tasks.map(task => {
      // Determine current play state from last activity for this user
      let currentPlayState = "stopped";
      
      // Filter activities by the current user and find the latest one
      const userActivities = task.activities.filter(act => act.user.id === userId);
      if (userActivities.length > 0) {
        const lastActivity = userActivities[0]; // Already sorted by createdAt desc
        if (lastActivity.action === "TASK_PLAY_STARTED") {
          currentPlayState = "playing";
        } else if (lastActivity.action === "TASK_PLAY_PAUSED") {
          currentPlayState = "paused";
        }
      }

      return {
        id: task.id,
        title: task.title,
        issueKey: task.issueKey,
        priority: task.priority,
        status: task.column?.name || task.status || "TO DO",
        boardId: task.taskBoard?.id || "",
        boardName: task.taskBoard?.name || "No Board",
        assignee: task.assignee,
        currentPlayState
      };
    });

    return NextResponse.json({ tasks: formattedTasks });
  } catch (error) {
    console.error("[WORKSPACE_SEARCH_TASKS_GET]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
} 