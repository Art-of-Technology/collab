import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authConfig } from "@/lib/auth";

export async function GET(
  req: Request,
  { params }: { params: { userId: string } }
) {
  const session = await getServerSession(authConfig);
  if (!session?.user?.id) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { userId } = params;

  // Users can only fetch their own assigned tasks
  if (session.user.id !== userId) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  try {
    const tasks = await prisma.task.findMany({
      where: {
        assigneeId: userId,
      },
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
        activity: {
          where: {
            action: {
              in: ["TASK_PLAY_STARTED", "TASK_PLAY_PAUSED", "TASK_PLAY_STOPPED"]
            }
          },
          orderBy: {
            createdAt: "desc"
          },
          take: 1
        }
      },
      orderBy: [
        { taskBoard: { name: "asc" } },
        { title: "asc" }
      ]
    });

    const formattedTasks = tasks.map(task => {
      // Determine current play state from last activity
      let currentPlayState = "stopped";
      if (task.activity.length > 0) {
        const lastActivity = task.activity[0];
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
        currentPlayState
      };
    });

    return NextResponse.json({ tasks: formattedTasks });
  } catch (error) {
    console.error("[USER_ASSIGNED_TASKS_GET]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
} 