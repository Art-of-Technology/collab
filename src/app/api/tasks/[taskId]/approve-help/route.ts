import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authConfig } from "@/lib/auth";

export async function POST(
  req: Request,
  { params }: { params: { taskId: string } }
) {
  const session = await getServerSession(authConfig);
  if (!session?.user?.id) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { taskId } = params;
  const { helperId, action } = await req.json(); // action: 'approve' | 'reject'

  try {
    // Check if task exists and user is assignee or reporter
    const task = await prisma.task.findFirst({
      where: {
        id: taskId,
        OR: [
          { assigneeId: session.user.id },
          { reporterId: session.user.id }
        ]
      },
      include: {
        assignee: {
          select: { id: true, name: true }
        },
        reporter: {
          select: { id: true, name: true }
        }
      }
    });

    if (!task) {
      return new NextResponse("Task not found or you don't have permission to approve helpers", { status: 404 });
    }

    // Find the help request
    const helpRequest = await prisma.taskAssignee.findUnique({
      where: {
        taskId_userId: {
          taskId: taskId,
          userId: helperId
        }
      },
      include: {
        user: {
          select: { id: true, name: true }
        }
      }
    });

    if (!helpRequest || helpRequest.role !== "HELPER") {
      return new NextResponse("Help request not found", { status: 404 });
    }

    if (helpRequest.status !== "PENDING") {
      return new NextResponse("Help request has already been processed", { status: 400 });
    }

    // Update the help request status
    const updatedRequest = await prisma.taskAssignee.update({
      where: {
        taskId_userId: {
          taskId: taskId,
          userId: helperId
        }
      },
      data: {
        status: action === 'approve' ? "APPROVED" : "REJECTED",
        approvedAt: action === 'approve' ? new Date() : null,
        approvedBy: session.user.id
      }
    });

    // Create notification for the helper
    await prisma.notification.create({
      data: {
        type: action === 'approve' ? "TASK_HELP_APPROVED" : "TASK_HELP_REJECTED",
        content: action === 'approve' 
          ? `Your help request for task "${task.title}" has been approved`
          : `Your help request for task "${task.title}" has been rejected`,
        userId: helperId,
        senderId: session.user.id,
        taskId: taskId
      }
    });

    return NextResponse.json({ 
      message: `Help request ${action}d successfully`,
      status: updatedRequest.status
    });
  } catch (error) {
    console.error("[TASK_APPROVE_HELP_POST]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
} 