import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authConfig } from "@/lib/auth";
import BoardItemActivityService from "@/lib/board-item-activity-service";
import { sanitizeHtmlToPlainText } from "@/lib/html-sanitizer";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const session = await getServerSession(authConfig);
  if (!session?.user?.id) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const resolvedParams = await params;
  const { taskId } = resolvedParams;

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
      return new NextResponse("Task not found or access denied", { status: 404 });
    }

    // Check if user already has a pending help request
    const existingAssignment = await prisma.taskAssignee.findUnique({
      where: {
        taskId_userId: {
          taskId: taskId,
          userId: session.user.id
        }
      }
    });

    // Only block if there's already a pending request
    if (existingAssignment && existingAssignment.status === "PENDING") {
      return new NextResponse("You already have a pending help request for this task", { status: 400 });
    }

    // If user is already an approved helper, they can start working without requesting again
    if (existingAssignment && existingAssignment.status === "APPROVED") {
      return NextResponse.json({ 
        message: "You are already approved to help with this task",
        status: "approved"
      });
    }

    // Check if user is the original assignee
    if (task.assigneeId === session.user.id) {
      return new NextResponse("You are already the assignee of this task", { status: 400 });
    }

    // Create or update helper request
    if (existingAssignment && existingAssignment.status === "REJECTED") {
      // User was previously rejected, update existing record to pending
      await prisma.taskAssignee.update({
        where: {
          taskId_userId: {
            taskId: taskId,
            userId: session.user.id
          }
        },
        data: {
          status: "PENDING",
          approvedAt: null,
          approvedBy: null,
          assignedAt: new Date() // Update the request time
        }
      });
    } else {
      // Create new helper request
      await prisma.taskAssignee.create({
        data: {
          taskId: taskId,
          userId: session.user.id,
          role: "HELPER",
          status: "PENDING"
        }
      });
    }

    // Log activity for help request
    await BoardItemActivityService.createTaskActivity(
      taskId,
      session.user.id,
      "HELP_REQUEST_SENT",
      {
        requesterName: session.user.name,
        assigneeName: task.assignee?.name,
        reporterName: task.reporter?.name
      }
    );

    // Create notification for assignee and reporter
    const notificationRecipients = [task.assigneeId, task.reporterId].filter(id => id && id !== session.user.id);
    
    if (notificationRecipients.length > 0) {
      await prisma.notification.createMany({
        data: notificationRecipients.map(recipientId => ({
          type: "TASK_HELP_REQUEST",
          content: sanitizeHtmlToPlainText(`${session.user.name} requested to help with task: ${task.title}`),
          userId: recipientId!,
          senderId: session.user.id,
          taskId: taskId
        }))
      });
    }

    return NextResponse.json({ 
      message: "Help request sent successfully",
      status: "pending"
    });
  } catch (error) {
    console.error("[TASK_REQUEST_HELP_POST]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
} 