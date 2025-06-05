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
  const userId = session.user.id;

  if (!taskId) {
    return new NextResponse("Task ID is required", { status: 400 });
  }

  try {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        workspace: true, // Ensure workspace is included to check ownership or membership
      },
    });

    if (!task) {
      return new NextResponse("Task not found", { status: 404 });
    }

    // Check if user is part of the workspace or the workspace owner
    const isOwner = task.workspace.ownerId === userId;
    const isMember = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId,
          workspaceId: task.workspaceId,
        },
      },
    });

    if (!isOwner && !isMember) {
      return new NextResponse("Forbidden: You are not authorized to view activities for this task.", { status: 403 });
    }

    // Show all activities for all users (Activity Feed should show everyone's activities)
    const activities = await prisma.taskActivity.findMany({
      where: { 
        taskId
        // Removed userId filter - show all activities
      },
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            image: true,
            useCustomAvatar: true,
            avatarAccessory: true,
            avatarBrows: true,
            avatarEyes: true,
            avatarEyewear: true,
            avatarHair: true,
            avatarMouth: true,
            avatarNose: true,
            avatarSkinTone: true,
          }
        }
      }
    });

    return NextResponse.json(activities);
  } catch (error) {
    console.error("[TASK_ACTIVITIES_GET]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
} 