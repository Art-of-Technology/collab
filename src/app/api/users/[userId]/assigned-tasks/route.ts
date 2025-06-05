import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const _params = await params;
  const { userId } = _params;
  const currentUserId = session.user.id;

  // Users can only fetch their own tasks or be an admin
  if (currentUserId !== userId) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const workspaceId = searchParams.get('workspaceId');

  if (!workspaceId) {
    return new NextResponse("Workspace ID is required", { status: 400 });
  }

  try {
    // Verify workspace access before fetching tasks
    // Check if user is owner or member of the workspace
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
      console.error(`User ${userId} attempted to fetch assigned tasks from workspace ${workspaceId} but has no access`);
      
      // Debug: Check what workspaces the user has access to
      const userWorkspaces = await prisma.workspace.findMany({
        where: {
          OR: [
            { ownerId: userId },
            { members: { some: { userId: userId } } }
          ]
        },
        select: { id: true, name: true }
      });
      
      console.error(`User ${userId} has access to workspaces:`, userWorkspaces);
      return new NextResponse("No access to this workspace", { status: 403 });
    }

    console.log(`User ${userId} fetching assigned tasks from workspace ${workspaceId} (${workspace.name})`);

    // Get latest 3 assigned tasks for the user in this workspace
    const assignedTasks = await prisma.task.findMany({
      where: {
        assigneeId: userId,
        workspaceId: workspaceId,
      },
      take: 3,
      include: {
        assignee: {
          select: {
            id: true,
            name: true,
            image: true,
          }
        },
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
        activity: {
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

    const formattedTasks = assignedTasks.map(task => {
      // Determine current play state from last activity for this user
      let currentPlayState = "stopped";
      
      // Filter activities by the current user and find the latest one
      const userActivities = task.activity.filter(act => act.user.id === userId);
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
        currentPlayState,
        assignee: task.assignee
      };
    });

    return NextResponse.json({ tasks: formattedTasks });
  } catch (error) {
    console.error("[USER_ASSIGNED_TASKS_GET]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
} 