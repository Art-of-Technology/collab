import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

export const dynamic = 'force-dynamic';

// GET /api/tasks/[taskId] - Get task details
export async function GET(
  req: NextRequest,
  { params }: { params: { taskId: string } }
) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { taskId } = params;
    
    // Check if taskId is an issue key (e.g., WZB-1)
    const isIssueKey = /^[A-Z]+-\d+$/.test(taskId);
  
    // Fetch the task either by ID or issue key
    const task = isIssueKey 
      ? await prisma.task.findFirst({
          where: { issueKey: taskId },
          include: {
            assignee: true,
            reporter: true,
            column: true,
            taskBoard: true,
            workspace: true,
            labels: true,
            story: {
              select: {
                id: true,
                title: true,
                epic: {
                  select: {
                    id: true,
                    title: true,
                    milestone: {
                      select: {
                        id: true,
                        title: true,
                      }
                    }
                  }
                }
              }
            },
            parentTask: {
              select: {
                id: true,
                title: true,
                issueKey: true,
              }
            },
            subtasks: {
              select: {
                id: true,
                title: true,
                issueKey: true,
                status: true,
              },
              orderBy: {
                createdAt: 'desc',
              }
            },
            comments: {
              include: {
                author: true,
              },
              orderBy: {
                createdAt: "desc",
              },
            },
            attachments: true,
          },
        })
      : await prisma.task.findUnique({
          where: { id: taskId },
          include: {
            assignee: true,
            reporter: true,
            column: true,
            taskBoard: true,
            workspace: true,
            labels: true,
            story: {
              select: {
                id: true,
                title: true,
                epic: {
                  select: {
                    id: true,
                    title: true,
                    milestone: {
                      select: {
                        id: true,
                        title: true,
                      }
                    }
                  }
                }
              }
            },
            parentTask: {
              select: {
                id: true,
                title: true,
                issueKey: true,
              }
            },
            subtasks: {
              select: {
                id: true,
                title: true,
                issueKey: true,
                status: true,
              },
              orderBy: {
                createdAt: 'desc',
              }
            },
            comments: {
              include: {
                author: true,
              },
              orderBy: {
                createdAt: "desc",
              },
            },
            attachments: true,
          },
        });

    if (!task) {
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404 }
      );
    }
    
    // Check if user has access to the workspace
    const hasAccess = await prisma.workspaceMember.findFirst({
      where: {
        userId: currentUser.id,
        workspaceId: task.workspaceId,
      },
    });

    if (!hasAccess) {
      return NextResponse.json(
        { error: "You don't have access to this task" },
        { status: 403 }
      );
    }
    
    // Fetch the milestone and epic if they exist
    let milestone = null;
    let epic = null;
    
    if (task.milestoneId) {
      // Task has direct milestone association
      milestone = await prisma.milestone.findUnique({
        where: { id: task.milestoneId },
        select: {
          id: true,
          title: true,
        }
      });
    } else if (task.story?.epic?.milestone) {
      // Task has milestone via story -> epic -> milestone
      milestone = task.story.epic.milestone;
    }
    
    if (task.epicId) {
      // Task has direct epic association
      epic = await prisma.epic.findUnique({
        where: { id: task.epicId },
        select: {
          id: true,
          title: true,
        }
      });
    } else if (task.story?.epic) {
      // Task has epic via story
      epic = task.story.epic;
    }
    
    // Transform attachments to match the component interface
    const transformedTask = {
      ...task,
      // Add the resolved milestone and epic
      milestone: milestone,
      epic: epic,
      attachments: task.attachments.map(attachment => ({
        id: attachment.id,
        name: attachment.fileName,
        url: attachment.fileUrl
      }))
    };

    return NextResponse.json(transformedTask);
  } catch (error) {
    console.error("Error fetching task:", error);
    return NextResponse.json(
      { error: "Failed to fetch task" },
      { status: 500 }
    );
  }
} 