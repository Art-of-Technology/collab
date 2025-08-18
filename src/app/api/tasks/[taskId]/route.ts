import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { getAuthSession } from '@/lib/auth';
import { NotificationService, NotificationType } from "@/lib/notification-service";

export const dynamic = 'force-dynamic';

// GET /api/tasks/[taskId] - Get task details
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const resolvedParams = await params;
    const { taskId } = resolvedParams;
    
    // Check if taskId is an issue key (e.g., WZB-1, DNN1-2)
    const isIssueKey = /^[A-Z]+[0-9]*-\d+$/.test(taskId);
  
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
    
    // Check if user has access to the workspace (either as owner or member)
    const workspaceAccess = await prisma.workspace.findFirst({
      where: {
        id: task.workspaceId,
        OR: [
          { ownerId: currentUser.id }, // User is the owner
          { members: { some: { userId: currentUser.id } } } // User is a member
        ]
      },
      select: {
        id: true,
        name: true,
        ownerId: true
      }
    });

    if (!workspaceAccess) {
      // Enhanced error logging for debugging
      console.error(`Access denied: User ${currentUser.id} attempted to access task ${taskId} in workspace ${task.workspaceId}`);
      
      // Check what workspaces user has access to (both owned and member)
      const ownedWorkspaces = await prisma.workspace.findMany({
        where: { ownerId: currentUser.id },
        select: { id: true, name: true }
      });
      
      const memberWorkspaces = await prisma.workspaceMember.findMany({
        where: { userId: currentUser.id },
        include: { workspace: { select: { id: true, name: true } } }
      });
      
      const allUserWorkspaces = [
        ...ownedWorkspaces.map(w => ({ id: w.id, name: w.name, role: 'OWNER' })),
        ...memberWorkspaces.map(w => ({ id: w.workspace.id, name: w.workspace.name, role: 'MEMBER' }))
      ];
      
      console.error(`User accessible workspaces:`, allUserWorkspaces);
      console.error(`Task workspace: ${task.workspaceId}, Task workspace name: ${task.workspace?.name}`);
      
      return NextResponse.json(
        { 
          error: "You don't have access to this task",
          debug: {
            taskWorkspace: task.workspaceId,
            taskWorkspaceName: task.workspace?.name,
            userWorkspaces: allUserWorkspaces
          }
        },
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

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { taskId } = await params;

    if (!taskId) {
      return NextResponse.json({ error: 'Task ID is required' }, { status: 400 });
    }

    // First, get the task to verify permissions
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        taskBoard: {
          include: {
            workspace: true
          }
        }
      }
    });

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Check if user has access to the workspace
    const hasAccess = await prisma.workspace.findFirst({
      where: {
        id: task.workspaceId,
        OR: [
          { ownerId: session.user.id },
          { members: { some: { userId: session.user.id } } }
        ]
      }
    });

    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Delete the task (this will cascade delete related records due to foreign key constraints)
    await prisma.task.delete({
      where: { id: taskId }
    });

    await NotificationService.notifyBoardFollowers({
      boardId: task.taskBoard?.id || '',
      taskId: '',
      senderId: session.user.id,
      type: NotificationType.BOARD_TASK_DELETED,
      content: `Task "${task.title}" has been deleted from the board by ${session.user.name}`,
      excludeUserIds: [],
      skipTaskIdReference: true
    });

    return NextResponse.json({ 
      success: true, 
      message: 'Task deleted successfully' 
    });

  } catch (error) {
    console.error('Error deleting task:', error);
    return NextResponse.json(
      { error: 'Failed to delete task' },
      { status: 500 }
    );
  }
} 