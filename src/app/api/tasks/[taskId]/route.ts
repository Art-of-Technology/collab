import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { userSelectFields } from "@/lib/user-utils";

export async function GET(
  request: NextRequest,
  { params }: { params: { taskId: string } }
) {
  const _params = await params;
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const taskIdOrKey = _params.taskId;
    
    // Check if it's an issue key (like WZB-2) or a task ID
    const isIssueKey = /^[A-Z]+-\d+$/.test(taskIdOrKey);
    
    // Find task either by issue key or ID
    const task = isIssueKey 
      ? await prisma.task.findFirst({
          where: { issueKey: taskIdOrKey },
          include: {
            assignee: {
              select: userSelectFields,
            },
            reporter: {
              select: userSelectFields,
            },
            column: true,
            taskBoard: true,
            workspace: true,
            labels: true,
            comments: {
              include: {
                author: {
                  select: userSelectFields,
                },
                reactions: {
                  include: {
                    author: {
                      select: userSelectFields,
                    },
                  },
                },
              },
              orderBy: {
                createdAt: "desc",
              },
            },
            attachments: true,
          },
        })
      : await prisma.task.findUnique({
          where: { id: taskIdOrKey },
          include: {
            assignee: {
              select: userSelectFields,
            },
            reporter: {
              select: userSelectFields,
            },
            column: true,
            taskBoard: true,
            workspace: true,
            labels: true,
            comments: {
              include: {
                author: {
                  select: userSelectFields,
                },
                reactions: {
                  include: {
                    author: {
                      select: userSelectFields,
                    },
                  },
                },
              },
              orderBy: {
                createdAt: "desc",
              },
            },
            attachments: true,
          },
        });

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // Check if user has access to the workspace
    const hasAccess = await prisma.workspaceMember.findFirst({
      where: {
        userId: user.id,
        workspaceId: task.workspaceId,
      },
    });

    if (!hasAccess) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    return NextResponse.json(task);
  } catch (error) {
    console.error("Error fetching task:", error);
    return NextResponse.json(
      { error: "Failed to fetch task" },
      { status: 500 }
    );
  }
} 