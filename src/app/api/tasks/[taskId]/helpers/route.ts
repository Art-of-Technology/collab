import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authConfig } from "@/lib/auth";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const session = await getServerSession(authConfig);
  if (!session?.user?.id) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const _params = await params;
  const { taskId } = _params;

  try {
    // Check if task exists and user has access to the workspace
    const task = await prisma.task.findFirst({
      where: {
        id: taskId,
        workspace: {
          OR: [
            { ownerId: session.user.id },
            { members: { some: { userId: session.user.id } } }
          ]
        }
      }
    });

    if (!task) {
      return new NextResponse("Task not found or access denied", { status: 404 });
    }

    // Fetch all task assignees (including helpers)
    const helpers = await prisma.taskAssignee.findMany({
      where: {
        taskId: taskId
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            image: true
          }
        }
      },
      orderBy: [
        { role: 'asc' }, // ASSIGNEE first, then HELPER
        { assignedAt: 'asc' }
      ]
    });

    return NextResponse.json({ helpers });
  } catch (error) {
    console.error("[TASK_HELPERS_GET]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
} 