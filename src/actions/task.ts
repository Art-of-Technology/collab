'use server';

import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { trackCreation, compareObjects, trackAssignment, createActivity } from '@/lib/board-item-activity-service';
import { checkUserPermission, Permission as PermissionEnum } from '@/lib/permissions';
import { NotificationService, NotificationType } from '@/lib/notification-service';

/**
 * Get tasks for a workspace
 */
export async function getWorkspaceTasks(workspaceId: string) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    throw new Error('Unauthorized');
  }

  // Get the current user
  const user = await prisma.user.findUnique({
    where: {
      email: session.user.email
    },
    select: {
      id: true
    }
  });

  if (!user) {
    throw new Error('User not found');
  }

  // Verify the user has access to this workspace
  const workspace = await prisma.workspace.findFirst({
    where: {
      id: workspaceId,
      OR: [
        { ownerId: user.id },
        { members: { some: { userId: user.id } } }
      ]
    }
  });

  if (!workspace) {
    throw new Error('Workspace not found or access denied');
  }

  // Get the tasks
  const tasks = await prisma.task.findMany({
    where: {
      workspaceId
    },
    include: {
      assignee: {
        select: {
          id: true,
          name: true,
          image: true,
          role: true,
          useCustomAvatar: true,
          avatarSkinTone: true,
          avatarEyes: true,
          avatarBrows: true,
          avatarMouth: true,
          avatarNose: true,
          avatarHair: true,
          avatarEyewear: true,
          avatarAccessory: true,
        }
      },
      reporter: {
        select: {
          id: true,
          name: true,
          image: true,
          role: true,
          useCustomAvatar: true,
          avatarSkinTone: true,
          avatarEyes: true,
          avatarBrows: true,
          avatarMouth: true,
          avatarNose: true,
          avatarHair: true,
          avatarEyewear: true,
          avatarAccessory: true,
        }
      },
      post: {
        select: {
          id: true
        }
      }
    },
    orderBy: [
      { status: 'asc' },
      { priority: 'desc' },
      { createdAt: 'desc' }
    ]
  });

  return tasks;
}

/**
 * Get a single task by ID
 */
export async function getTaskById(taskId: string) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    throw new Error('Unauthorized');
  }

  // Get the current user
  const user = await prisma.user.findUnique({
    where: {
      email: session.user.email
    },
    select: {
      id: true
    }
  });

  if (!user) {
    throw new Error('User not found');
  }

  // Get the task with nested relations
  const task = await prisma.task.findUnique({
    where: {
      id: taskId
    },
    include: {
      workspace: true,
      assignee: {
        select: {
          id: true,
          name: true,
          image: true,
          role: true,
          useCustomAvatar: true,
          avatarSkinTone: true,
          avatarEyes: true,
          avatarBrows: true,
          avatarMouth: true,
          avatarNose: true,
          avatarHair: true,
          avatarEyewear: true,
          avatarAccessory: true,
        }
      },
      reporter: {
        select: {
          id: true,
          name: true,
          image: true,
          role: true
        }
      },
      post: { select: { id: true } },
      column: { select: { id: true, name: true } },
      labels: { select: { id: true, name: true, color: true } },
      attachments: { select: { id: true, fileName: true, fileUrl: true } },
      subtasks: { select: { id: true, title: true, issueKey: true, status: true } },
      parentTask: { select: { id: true, title: true, issueKey: true } },
      comments: {
        include: {
          author: {
            select: {
              id: true,
              name: true,
              image: true,
              useCustomAvatar: true,
              avatarSkinTone: true,
              avatarEyes: true,
              avatarBrows: true,
              avatarMouth: true,
              avatarNose: true,
              avatarHair: true,
              avatarEyewear: true,
              avatarAccessory: true,
            }
          },
          reactions: {
            include: {
              author: {
                select: {
                  id: true,
                  name: true,
                  image: true,
                  useCustomAvatar: true
                }
              }
            }
          }
        }
      },
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
                  title: true
                }
              }
            }
          }
        }
      }
    }
  });

  if (!task) {
    throw new Error('Task not found');
  }

  // Verify the user has access to the task's workspace
  const workspace = await prisma.workspace.findFirst({
    where: {
      id: task.workspaceId,
      OR: [
        { ownerId: user.id },
        { members: { some: { userId: user.id } } }
      ]
    }
  });

  if (!workspace) {
    throw new Error('You do not have access to this task');
  }

  return task;
}

/**
 * Create a new task
 */
export async function createTask(data: {
  title: string;
  description?: string;
  workspaceId: string;
  assigneeId?: string;
  reporterId?: string;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH';
  status?: string;
  dueDate?: Date;
  linkedPostIds?: string[];
  taskBoardId?: string;
  columnId?: string;
  epicId?: string | null;
  storyId?: string | null;
  type?: string;
  parentTaskId?: string | null;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    throw new Error('Unauthorized');
  }

  const {
    title,
    description,
    workspaceId,
    assigneeId,
    reporterId,
    priority = 'MEDIUM',
    status,
    dueDate,
    linkedPostIds = [],
    taskBoardId,
    columnId,
    epicId,
    storyId,
    type = 'TASK',
    parentTaskId
  } = data;

  // Validate input
  if (!title || !title.trim()) {
    throw new Error('Task title is required');
  }

  if (!workspaceId) {
    throw new Error('Workspace ID is required');
  }

  // Get the current user
  const user = await prisma.user.findUnique({
    where: {
      email: session.user.email
    }
  });

  if (!user) {
    throw new Error('User not found');
  }

  // Verify the user has access to this workspace
  const workspace = await prisma.workspace.findFirst({
    where: {
      id: workspaceId,
      OR: [
        { ownerId: user.id },
        { members: { some: { userId: user.id } } }
      ]
    }
  });

  if (!workspace) {
    throw new Error('Workspace not found or access denied');
  }

  // If assigneeId is provided, verify they are a member of the workspace
  if (assigneeId) {
    const isMember = await prisma.workspaceMember.findFirst({
      where: {
        workspaceId,
        userId: assigneeId,
        status: true
      }
    });

    const isOwner = workspace.ownerId === assigneeId;

    if (!isMember && !isOwner) {
      throw new Error('Assignee is not a member of this workspace');
    }
  }

  // If a reporter is provided, verify they are a member of the workspace
  const reporterToUse = reporterId || user.id;

  if (reporterId && reporterId !== user.id) {
    const isMember = await prisma.workspaceMember.findFirst({
      where: {
        workspaceId,
        userId: reporterId,
        status: true,
      }
    });

    const isOwner = workspace.ownerId === reporterId;

    if (!isMember && !isOwner) {
      throw new Error('Reporter is not a member of this workspace');
    }
  }

  // Generate issue key if board has a prefix
  let issueKey = null;
  if (taskBoardId) {
    // Get the board details including issuePrefix and nextIssueNumber
    const board = await prisma.taskBoard.findUnique({
      where: { id: taskBoardId },
      select: {
        id: true,
        issuePrefix: true,
        nextIssueNumber: true
      }
    });

    if (board && board.issuePrefix) {
      // Generate the issue key
      issueKey = `${board.issuePrefix}-${board.nextIssueNumber}`;

      // Update the board's next issue number
      await prisma.taskBoard.update({
        where: { id: board.id },
        data: { nextIssueNumber: { increment: 1 } }
      });
    }
  }

  // Default status if none provided
  let finalStatus = status;
  if (!finalStatus && columnId) {
    // If only columnId is provided, get the column name for the status field
    const column = await prisma.taskColumn.findUnique({
      where: { id: columnId },
      select: { name: true }
    });
    if (column) {
      finalStatus = column.name;
    }
  }
  if (!finalStatus) {
    finalStatus = 'To Do';
  }

  // Create the task
  const task = await prisma.task.create({
    data: {
      title: title.trim(),
      description: description?.trim() || null,
      type,
      workspace: {
        connect: {
          id: workspaceId
        }
      },
      reporter: {
        connect: {
          id: reporterToUse
        }
      },
      ...(assigneeId ? {
        assignee: {
          connect: {
            id: assigneeId
          }
        }
      } : {}),
      priority,
      status: finalStatus,
      dueDate: dueDate || null,
      issueKey,
      ...(linkedPostIds.length > 0 ? {
        post: {
          connect: {
            id: linkedPostIds[0]
          }
        }
      } : {}),
      ...(taskBoardId ? {
        taskBoard: {
          connect: {
            id: taskBoardId
          }
        }
      } : {}),
      ...(columnId ? {
        column: {
          connect: {
            id: columnId
          }
        }
      } : {}),
      ...(storyId ? {
        story: {
          connect: {
            id: storyId
          }
        }
      } : {}),
      ...(epicId ? {
        epic: {
          connect: {
            id: epicId
          }
        }
      } : {}),
      ...(parentTaskId ? {
        parentTask: {
          connect: {
            id: parentTaskId
          }
        }
      } : {})
    },
    include: {
      assignee: {
        select: {
          id: true,
          name: true,
          image: true,
          role: true,
          useCustomAvatar: true,
          avatarSkinTone: true,
          avatarEyes: true,
          avatarBrows: true,
          avatarMouth: true,
          avatarNose: true,
          avatarHair: true,
          avatarEyewear: true,
          avatarAccessory: true,
        }
      },
      reporter: {
        select: {
          id: true,
          name: true,
          image: true,
          role: true
        }
      },
      post: {
        select: {
          id: true
        }
      }
    }
  });

  // Create TaskRelations entries for epic and story if provided
  if (epicId || storyId) {
    const relationsToCreate = [];

    if (epicId) {
      relationsToCreate.push({
        taskId: task.id,
        relatedItemId: epicId,
        relatedItemType: 'EPIC' as const
      });
    }

    if (storyId) {
      relationsToCreate.push({
        taskId: task.id,
        relatedItemId: storyId,
        relatedItemType: 'STORY' as const
      });
    }

    if (relationsToCreate.length > 0) {
      await prisma.taskRelations.createMany({
        data: relationsToCreate
      });
    }
  }

  // Track task creation activity
  try {
    await trackCreation(
      'TASK',
      task.id,
      user.id,
      workspaceId,
      taskBoardId,
      {
        title: task.title,
        type: task.type,
        priority: task.priority,
        status: task.status,
        assigneeId: task.assigneeId,
        reporterId: task.reporterId,
        issueKey: task.issueKey,
      }
    );
  } catch (error) {
    console.error('Failed to track task creation activity:', error);
    // Don't fail the task creation if activity tracking fails
  }

  // Auto-follow the task for relevant users
  try {
    const autoFollowUsers = [];

    // Auto-follow the reporter (creator)
    if (task.reporterId) {
      autoFollowUsers.push(task.reporterId);
    }

    // Auto-follow the assignee if different from reporter
    if (task.assigneeId && task.assigneeId !== task.reporterId) {
      autoFollowUsers.push(task.assigneeId);
    }

    if (autoFollowUsers.length > 0) {
      await NotificationService.autoFollowTask(task.id, autoFollowUsers);
    }
    if (task.taskBoardId) {
      await NotificationService.notifyBoardFollowers({
        boardId: task.taskBoardId,
        taskId: task.id,
        senderId: user.id,
        type: NotificationType.BOARD_TASK_CREATED,
        content: `${user.name} created a task: ${task.title}`,
        excludeUserIds: [],
      });
    }
  } catch (error) {
    console.error('Failed to auto-follow task:', error);
    // Don't fail the task creation if auto-follow fails
  }

  return task;
}

/**
 * Update a task
 */
export async function updateTask(taskId: string, data: {
  title?: string;
  description?: string;
  assigneeId?: string | null;
  reporterId?: string | null;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH';
  status?: string;
  type?: string;
  dueDate?: Date | null;
  labels?: string[];
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    throw new Error('Unauthorized');
  }

  const { title, description, assigneeId, reporterId, priority, status, type, dueDate, labels } = data;

  // Get the current user
  const user = await prisma.user.findUnique({
    where: {
      email: session.user.email
    }
  });

  if (!user) {
    throw new Error('User not found');
  }

  // Get the task with its current column and board info
  const task = await prisma.task.findUnique({
    where: {
      id: taskId
    },
    include: {
      workspace: true,
      column: true,
      taskBoard: true,
    }
  });

  if (!task) {
    throw new Error('Task not found');
  }

  // Verify the user has access to modify this task
  const workspace = await prisma.workspace.findFirst({
    where: {
      id: task.workspaceId,
      OR: [
        { ownerId: user.id },
        { members: { some: { userId: user.id } } }
      ]
    }
  });

  if (!workspace) {
    throw new Error('You do not have access to modify this task');
  }

  // If assigneeId is provided, verify they are a member of the workspace
  if (assigneeId) {
    const isMember = await prisma.workspaceMember.findFirst({
      where: {
        workspaceId: task.workspaceId,
        userId: assigneeId,
        status: true
      }
    });

    const isOwner = workspace.ownerId === assigneeId;

    if (!isMember && !isOwner) {
      throw new Error('Assignee is not a member of this workspace');
    }
  }

  // If reporterId is provided, verify they are a member of the workspace
  if (reporterId) {
    const isMember = await prisma.workspaceMember.findFirst({
      where: {
        workspaceId: task.workspaceId,
        userId: reporterId,
        status: true,
      }
    });

    const isOwner = workspace.ownerId === reporterId;

    if (!isMember && !isOwner) {
      throw new Error('Reporter is not a member of this workspace');
    }
  }

  // Find the column ID if status is being updated
  let columnId = task.columnId;

  if (status && status !== task.column?.name) {
    // Find the column with the given name in the task's board
    const column = await prisma.taskColumn.findFirst({
      where: {
        name: status,
        taskBoardId: task.taskBoardId || undefined,
      },
    });

    if (column) {
      columnId = column.id;
    }
  }

  // Track changes before updating
  const fieldsToTrack = ['title', 'description', 'assigneeId', 'reporterId', 'priority', 'status', 'type', 'columnId', 'dueDate'];
  const oldTaskData = {
    title: task.title,
    description: task.description,
    assigneeId: task.assigneeId,
    reporterId: task.reporterId,
    priority: task.priority,
    status: task.status,
    type: task.type,
    columnId: task.columnId,
    dueDate: task.dueDate,
  };

  const newTaskData = {
    title: title !== undefined ? title.trim() : task.title,
    description: description !== undefined ? (description?.trim() || null) : task.description,
    assigneeId: assigneeId === null ? null : (assigneeId || task.assigneeId),
    reporterId: reporterId === null ? null : (reporterId || task.reporterId),
    priority: priority || task.priority,
    status: status || task.status,
    type: type !== undefined ? type : task.type,
    columnId: columnId,
    dueDate: dueDate === null ? null : (dueDate || task.dueDate),
  };

  // Update the task
  const updatedTask = await prisma.task.update({
    where: {
      id: taskId
    },
    data: {
      title: title !== undefined ? title.trim() : undefined,
      description: description !== undefined ? (description?.trim() || null) : undefined,
      assigneeId: assigneeId === null ? null : (assigneeId || undefined),
      reporterId: reporterId === null ? null : (reporterId || undefined),
      priority,
      status,
      type: type !== undefined ? type : undefined,
      columnId: columnId,
      dueDate: dueDate === null ? null : (dueDate || undefined),
      labels: labels !== undefined ? {
        set: labels.map(labelId => ({ id: labelId }))
      } : undefined
    },
    include: {
      assignee: {
        select: {
          id: true,
          name: true,
          image: true,
          role: true,
          useCustomAvatar: true,
          avatarSkinTone: true,
          avatarEyes: true,
          avatarBrows: true,
          avatarMouth: true,
          avatarNose: true,
          avatarHair: true,
          avatarEyewear: true,
          avatarAccessory: true,
        }
      },
      reporter: {
        select: {
          id: true,
          name: true,
          image: true,
          role: true
        }
      },
      post: {
        select: {
          id: true
        }
      },
      column: {
        select: {
          id: true,
          name: true,
        }
      },
      taskBoard: {
        select: {
          id: true,
          name: true,
        }
      }
    }
  });

  // Track field changes with enhanced user tracking for assignments
  try {
    const changes = compareObjects(oldTaskData, newTaskData, fieldsToTrack);
    if (changes.length > 0) {
      // Enhanced tracking for assignment changes
      for (const change of changes) {
        if (change.field === 'assigneeId') {
          // Get user details for assignee change
          const oldAssignee = change.oldValue ? await prisma.user.findUnique({
            where: { id: change.oldValue },
            select: { id: true, name: true }
          }).then(user => user ? { id: user.id, name: user.name || 'Unknown User' } : null) : null;

          const newAssignee = change.newValue ? await prisma.user.findUnique({
            where: { id: change.newValue },
            select: { id: true, name: true }
          }).then(user => user ? { id: user.id, name: user.name || 'Unknown User' } : null) : null;

          await trackAssignment(
            'TASK',
            taskId,
            user.id,
            task.workspaceId,
            oldAssignee,
            newAssignee,
            task.taskBoardId || undefined
          );
        } else if (change.field === 'reporterId') {
          // Get user details for reporter change
          const oldReporter = change.oldValue ? await prisma.user.findUnique({
            where: { id: change.oldValue },
            select: { id: true, name: true }
          }).then(user => user ? { id: user.id, name: user.name || 'Unknown User' } : null) : null;

          const newReporter = change.newValue ? await prisma.user.findUnique({
            where: { id: change.newValue },
            select: { id: true, name: true }
          }).then(user => user ? { id: user.id, name: user.name || 'Unknown User' } : null) : null;

          await createActivity({
            itemType: 'TASK',
            itemId: taskId,
            action: 'REPORTER_CHANGED',
            userId: user.id,
            workspaceId: task.workspaceId,
            boardId: task.taskBoardId || undefined,
            details: {
              field: 'reporterId',
              oldReporter,
              newReporter,
              changedAt: new Date().toISOString(),
            },
            fieldName: 'reporterId',
            oldValue: change.oldValue,
            newValue: change.newValue,
          });

          // Auto-follow the new reporter if one was assigned
          if (change.newValue) {
            await NotificationService.addTaskFollower(taskId, change.newValue);
          }
        } else {
          // Use regular tracking for other fields
          const fieldActionMap: Record<string, string> = {
            'title': 'TITLE_UPDATED',
            'description': 'DESCRIPTION_UPDATED',
            'status': 'STATUS_CHANGED',
            'priority': 'PRIORITY_CHANGED',
            'columnId': 'COLUMN_CHANGED',
            'dueDate': 'DUE_DATE_CHANGED',
            'type': 'TYPE_CHANGED',
          };

          await createActivity({
            itemType: 'TASK',
            itemId: taskId,
            action: (fieldActionMap[change.field] || 'UPDATED') as any,
            userId: user.id,
            workspaceId: task.workspaceId,
            boardId: task.taskBoardId || undefined,
            details: {
              field: change.field,
              oldValue: change.oldValue,
              newValue: change.newValue,
              displayOldValue: change.displayOldValue,
              displayNewValue: change.displayNewValue,
            },
            fieldName: change.field,
            oldValue: change.oldValue,
            newValue: change.newValue,
          });
        }
      }
    }
  } catch (error) {
    console.error('Failed to track task update activities:', error);
    // Don't fail the task update if activity tracking fails
  }

  // Send notifications to task followers based on changes
  try {
    const changes = compareObjects(oldTaskData, newTaskData, fieldsToTrack);
    if (changes.length > 0) {
      for (const change of changes) {
        let notificationType: NotificationType | null = null;
        let content = '';

        switch (change.field) {
          case 'status':
            notificationType = NotificationType.TASK_STATUS_CHANGED;
            content = `Task status changed from "${change.oldValue || 'None'}" to "${change.newValue || 'None'}"`;
            break;
          case 'assigneeId':
            if (change.newValue) {
              notificationType = NotificationType.TASK_ASSIGNED;
              const assignee = await prisma.user.findUnique({
                where: { id: change.newValue },
                select: { name: true }
              });
              content = `Task assigned to ${assignee?.name || 'Unknown User'}`;

              // Auto-follow the new assignee
              await NotificationService.addTaskFollower(taskId, change.newValue);
            }
            break;
          case 'priority':
            notificationType = NotificationType.TASK_PRIORITY_CHANGED;
            content = `Task priority changed from "${change.oldValue || 'None'}" to "${change.newValue || 'None'}"`;
            break;
          case 'dueDate':
            notificationType = NotificationType.TASK_DUE_DATE_CHANGED;
            content = change.newValue
              ? `Task due date set to ${new Date(change.newValue).toLocaleDateString()}`
              : 'Task due date removed';
            break;
          case 'title':
          case 'description':
            notificationType = NotificationType.TASK_UPDATED;
            content = `Task ${change.field} was updated`;
            break;
        }

        if (notificationType && content) {
          await NotificationService.notifyTaskFollowers({
            taskId,
            senderId: user.id,
            type: notificationType,
            content,
            excludeUserIds: []
          });

          // Notify board followers for status changes
          if (change.field === 'status' && task.taskBoardId) {
            // Standard status change notification
            await NotificationService.notifyBoardFollowers({
              boardId: task.taskBoardId,
              taskId,
              senderId: user.id,
              type: NotificationType.BOARD_TASK_STATUS_CHANGED,
              content: `Task "${task.title}" status changed from "${change.oldValue || 'None'}" to "${change.newValue || 'None'}"`,
              excludeUserIds: []
            });

            // Additional notification if task was completed (status changed to "Done")
            if (change.newValue && change.newValue.toLowerCase() === 'done') {
              await NotificationService.notifyBoardFollowers({
                boardId: task.taskBoardId,
                taskId,
                senderId: user.id,
                type: NotificationType.BOARD_TASK_COMPLETED,
                content: `Task "${task.title}" has been completed`,
                excludeUserIds: []
              });
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('Failed to send task update notifications:', error);
    // Don't fail the task update if notifications fail
  }

  return updatedTask;
}

/**
 * Delete a task
 */
export async function deleteTask(taskId: string) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    throw new Error('Unauthorized');
  }

  // Get the current user
  const user = await prisma.user.findUnique({
    where: {
      email: session.user.email
    }
  });

  if (!user) {
    throw new Error('User not found');
  }

  // Get the task
  const task = await prisma.task.findUnique({
    where: {
      id: taskId
    },
    select: {
      id: true,
      title: true,
      workspaceId: true,
      reporterId: true,
      taskBoardId: true
    }
  });

  if (!task) {
    throw new Error('Task not found');
  }

  // Verify the user has access to delete this task (must be creator or workspace owner)
  const workspace = await prisma.workspace.findUnique({
    where: {
      id: task.workspaceId
    }
  });

  if (!workspace) {
    throw new Error('Workspace not found');
  }

  const isCreator = task.reporterId === user.id;
  const isWorkspaceOwner = workspace.ownerId === user.id;

  if (!isCreator && !isWorkspaceOwner) {
    throw new Error('You do not have permission to delete this task');
  }

  // Notify followers before deleting the task
  try {
    // Notify task followers - skip taskId reference to prevent cascade deletion
    await NotificationService.notifyTaskFollowers({
      taskId,
      senderId: user.id,
      type: NotificationType.TASK_DELETED,
      content: `Task "${task.title}" has been deleted`,
      excludeUserIds: [],
      skipTaskIdReference: true
    });

    // Notify board followers if task belongs to a board - skip taskId reference
    if (task.taskBoardId) {
      await NotificationService.notifyBoardFollowers({
        boardId: task.taskBoardId,
        taskId,
        senderId: user.id,
        type: NotificationType.BOARD_TASK_DELETED,
        content: `Task "${task.title}" has been deleted from the board`,
        excludeUserIds: [],
        skipTaskIdReference: true
      });
    }
  } catch (error) {
    console.error('Failed to send task deletion notifications:', error);
    // Don't fail the deletion if notifications fail
  }

  // Delete the task (this will cascade delete followers due to foreign key constraints)
  await prisma.task.delete({
    where: {
      id: taskId
    }
  });

  return { success: true };
}

/**
 * Link a post to a task
 */
export async function linkPostToTask(data: {
  taskId: string;
  postId: string;
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    throw new Error('Unauthorized');
  }

  const { taskId, postId } = data;

  // Get the current user
  const user = await prisma.user.findUnique({
    where: {
      email: session.user.email
    }
  });

  if (!user) {
    throw new Error('User not found');
  }

  // Verify the task exists and user has access
  const task = await prisma.task.findUnique({
    where: {
      id: taskId
    },
    include: {
      workspace: true
    }
  });

  if (!task) {
    throw new Error('Task not found');
  }

  // Verify the user has access to this task
  const hasAccess = await prisma.workspace.findFirst({
    where: {
      id: task.workspaceId,
      OR: [
        { ownerId: user.id },
        { members: { some: { userId: user.id } } }
      ]
    }
  });

  if (!hasAccess) {
    throw new Error('You do not have access to this task');
  }

  // Verify the post exists
  const post = await prisma.post.findUnique({
    where: {
      id: postId
    }
  });

  if (!post) {
    throw new Error('Post not found');
  }

  // Check if the post is already linked
  const existingTask = await prisma.task.findFirst({
    where: {
      id: taskId,
      postId
    }
  });

  if (existingTask) {
    return { taskId, postId }; // Already linked
  }

  // Create the link by updating the task
  const updatedTask = await prisma.task.update({
    where: {
      id: taskId
    },
    data: {
      post: {
        connect: {
          id: postId
        }
      }
    }
  });

  return { taskId: updatedTask.id, postId };
}

/**
 * Unlink a post from a task
 */
export async function unlinkPostFromTask(data: {
  taskId: string;
  postId: string;
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    throw new Error('Unauthorized');
  }

  const { taskId, postId } = data;

  // Get the current user
  const user = await prisma.user.findUnique({
    where: {
      email: session.user.email
    }
  });

  if (!user) {
    throw new Error('User not found');
  }

  // Verify the task exists and user has access
  const task = await prisma.task.findUnique({
    where: {
      id: taskId
    },
    include: {
      workspace: true
    }
  });

  if (!task) {
    throw new Error('Task not found');
  }

  // Verify the user has access to this task
  const hasAccess = await prisma.workspace.findFirst({
    where: {
      id: task.workspaceId,
      OR: [
        { ownerId: user.id },
        { members: { some: { userId: user.id } } }
      ]
    }
  });

  if (!hasAccess) {
    throw new Error('You do not have access to this task');
  }

  // Find the task with this post
  const taskWithPost = await prisma.task.findFirst({
    where: {
      id: taskId,
      postId
    }
  });

  if (!taskWithPost) {
    throw new Error('Post is not linked to this task');
  }

  // Unlink by setting postId to null
  await prisma.task.update({
    where: {
      id: taskId
    },
    data: {
      postId: null
    }
  });

  return { success: true };
}

/**
 * Get boards for a workspace
 */
export async function getWorkspaceBoards(workspaceId: string) {
  if (!workspaceId) {
    throw new Error('Workspace ID is required');
  }

  const boards = await prisma.taskBoard.findMany({
    where: {
      workspaceId: workspaceId,
    },
    orderBy: {
      createdAt: 'asc',
    },
  });

  return boards;
}

/**
 * Get columns for a board
 */
export async function getBoardColumns(boardId: string) {
  if (!boardId) {
    throw new Error('Board ID is required');
  }

  const columns = await prisma.taskColumn.findMany({
    where: {
      taskBoardId: boardId,
    },
    orderBy: {
      order: 'asc',
    },
  });

  return columns;
}

/**
 * Create a new board
 */
export async function createBoard(data: {
  workspaceId: string;
  name: string;
  slug: string;
  description?: string;
  issuePrefix: string;
  isDefault?: boolean;
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    throw new Error('Unauthorized');
  }

  const { workspaceId, name, slug, description, issuePrefix, isDefault } = data;

  // Validate input
  if (!name || !name.trim()) {
    throw new Error('Board name is required');
  }

  if (!slug || !slug.trim()) {
    throw new Error('Board slug is required');
  }

  // Validate slug format
  if (!/^[a-z0-9-]+$/.test(slug)) {
    throw new Error('Board slug can only contain lowercase letters, numbers, and hyphens');
  }

  if (!issuePrefix || !issuePrefix.trim()) {
    throw new Error('Issue prefix is required');
  }

  if (!workspaceId) {
    throw new Error('Workspace ID is required');
  }

  // Get the current user
  const user = await prisma.user.findUnique({
    where: {
      email: session.user.email
    }
  });

  if (!user) {
    throw new Error('User not found');
  }

  // Check if user has permission to create boards in this workspace
  const hasPermission = await checkUserPermission(user.id, workspaceId, PermissionEnum.CREATE_BOARD);

  if (!hasPermission.hasPermission) {
    throw new Error('You don\'t have permission to create boards in this workspace');
  }

  // Verify the user has access to this workspace
  const workspace = await prisma.workspace.findFirst({
    where: {
      id: workspaceId,
      OR: [
        { ownerId: user.id },
        { members: { some: { userId: user.id } } }
      ]
    }
  });

  if (!workspace) {
    throw new Error('Workspace not found or access denied');
  }

  try {
    // Create the board with default columns
    const board = await prisma.taskBoard.create({
      data: {
        name: name.trim(),
        slug: slug.trim(),
        description: description?.trim() || null,
        issuePrefix: issuePrefix.trim(),
        nextIssueNumber: 1, // Start issue numbering from 1
        isDefault: isDefault || false,
        workspaceId,
        columns: {
          create: [
            { name: "To Do", order: 0, color: "#6366F1" },
            { name: "In Progress", order: 1, color: "#EC4899" },
            { name: "Review", order: 2, color: "#F59E0B" },
            { name: "Done", order: 3, color: "#10B981" },
          ],
        },
      },
      include: {
        columns: {
          orderBy: { order: "asc" },
        },
      },
    });

    return board;
  } catch (error: any) {
    // Handle unique constraint violations
    if (error.code === 'P2002') {
      if (error.meta?.target?.includes('slug')) {
        throw new Error('A board with this slug already exists in this workspace');
      }
      if (error.meta?.target?.includes('name')) {
        throw new Error('A board with this name already exists in this workspace');
      }
    }
    throw error;
  }
}

/**
 * Update a board's settings
 */
export async function updateBoard(boardId: string, data: {
  name?: string;
  description?: string;
  issuePrefix?: string;
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    throw new Error('Unauthorized');
  }

  const { name, description, issuePrefix } = data;

  // Validate board id
  if (!boardId) {
    throw new Error('Board ID is required');
  }

  // Validate issuePrefix if provided
  if (issuePrefix !== undefined && (!issuePrefix || !issuePrefix.trim())) {
    throw new Error('Issue prefix is required');
  }

  // Get the current user
  const user = await prisma.user.findUnique({
    where: {
      email: session.user.email
    }
  });

  if (!user) {
    throw new Error('User not found');
  }

  // Get the board to verify permissions
  const board = await prisma.taskBoard.findUnique({
    where: { id: boardId },
    include: { workspace: true }
  });

  if (!board) {
    throw new Error('Board not found');
  }

  // Verify the user has access to this workspace
  const workspace = await prisma.workspace.findFirst({
    where: {
      id: board.workspaceId,
      OR: [
        { ownerId: user.id },
        { members: { some: { userId: user.id, role: { in: ['admin', 'owner'] } } } },
      ]
    }
  });

  if (!workspace) {
    throw new Error('You do not have permission to update this board');
  }

  // Update the board
  const updatedBoard = await prisma.taskBoard.update({
    where: { id: boardId },
    data: {
      name: name ? name.trim() : undefined,
      description: description !== undefined ? (description?.trim() || null) : undefined,
      issuePrefix: issuePrefix !== undefined ? issuePrefix.trim() : undefined,
    },
    include: {
      columns: {
        orderBy: { order: 'asc' }
      }
    }
  });

  return updatedBoard;
}

/**
 * Create a new column for a board
 */
export async function createColumn(boardId: string, data: {
  name: string;
  order?: number;
  color?: string;
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    throw new Error('Unauthorized');
  }

  const { name, order = 0, color } = data;

  // Validate input
  if (!name || !name.trim()) {
    throw new Error('Column name is required');
  }

  if (!boardId) {
    throw new Error('Board ID is required');
  }

  // Get the current user
  const user = await prisma.user.findUnique({
    where: {
      email: session.user.email
    }
  });

  if (!user) {
    throw new Error('User not found');
  }

  // Get the board to verify permissions
  const board = await prisma.taskBoard.findUnique({
    where: { id: boardId },
    select: { workspaceId: true }
  });

  if (!board) {
    throw new Error('Board not found');
  }

  const hasPermission = await checkUserPermission(user.id, board.workspaceId, PermissionEnum.MANAGE_BOARD_SETTINGS);

  if (!hasPermission.hasPermission) {
    throw new Error('You don\'t have permission to create columns in this board');
  }

  // Create new column
  const newColumn = await prisma.taskColumn.create({
    data: {
      name: name.trim(),
      order,
      color: color || '#6366F1',
      taskBoardId: boardId
    }
  });

  return newColumn;
}

/**
 * Update a column
 */
export async function updateColumn(columnId: string, data: {
  name?: string;
  color?: string;
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    throw new Error('Unauthorized');
  }

  const { name, color } = data;

  // Validate input
  if (name !== undefined && !name.trim()) {
    throw new Error('Column name cannot be empty');
  }

  if (!columnId) {
    throw new Error('Column ID is required');
  }

  // Get the current user
  const user = await prisma.user.findUnique({
    where: {
      email: session.user.email
    }
  });

  if (!user) {
    throw new Error('User not found');
  }

  // Get the column to verify permissions
  const column = await prisma.taskColumn.findUnique({
    where: { id: columnId },
    include: { taskBoard: true }
  });

  if (!column) {
    throw new Error('Column not found');
  }

  const hasPermission = await checkUserPermission(user.id, column.taskBoard.workspaceId, PermissionEnum.MANAGE_BOARD_SETTINGS);

  if (!hasPermission.hasPermission) {
    throw new Error('You don\'t have permission to edit columns in this board');
  }

  // Update the column
  const updatedColumn = await prisma.taskColumn.update({
    where: { id: columnId },
    data: {
      name: name ? name.trim() : undefined,
      color
    }
  });

  return updatedColumn;
}

/**
 * Delete a column
 */
export async function deleteColumn(columnId: string) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    throw new Error('Unauthorized');
  }

  // Validate input
  if (!columnId) {
    throw new Error('Column ID is required');
  }

  // Get the current user
  const user = await prisma.user.findUnique({
    where: {
      email: session.user.email
    }
  });

  if (!user) {
    throw new Error('User not found');
  }

  // Get the column to verify permissions
  const column = await prisma.taskColumn.findUnique({
    where: { id: columnId },
    include: {
      taskBoard: {
        include: {
          columns: true
        }
      }
    }
  });

  if (!column) {
    throw new Error('Column not found');
  }

  const hasPermission = await checkUserPermission(user.id, column.taskBoard.workspaceId, PermissionEnum.MANAGE_BOARD_SETTINGS);

  if (!hasPermission.hasPermission) {
    throw new Error('You don\'t have permission to delete columns in this board');
  }

  // Find the first column (we'll move tasks there)
  const firstColumn = column.taskBoard.columns.find(c => c.id !== columnId);

  if (!firstColumn) {
    throw new Error('Cannot delete the only column on a board');
  }

  // Move tasks to the first column
  await prisma.task.updateMany({
    where: { columnId },
    data: { columnId: firstColumn.id }
  });

  // Delete the column
  await prisma.taskColumn.delete({
    where: { id: columnId }
  });

  return { success: true };
}

/**
 * Reorder columns
 */
export async function reorderColumns(boardId: string, columns: { id: string; order: number }[]) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    throw new Error('Unauthorized');
  }

  // Validate input
  if (!boardId) {
    throw new Error('Board ID is required');
  }

  if (!columns || !Array.isArray(columns)) {
    throw new Error('Invalid columns data');
  }

  // Get the current user
  const user = await prisma.user.findUnique({
    where: {
      email: session.user.email
    }
  });

  if (!user) {
    throw new Error('User not found');
  }

  // Get the board to verify permissions
  const board = await prisma.taskBoard.findUnique({
    where: { id: boardId },
    select: { workspaceId: true }
  });

  if (!board) {
    throw new Error('Board not found');
  }

  const hasPermission = await checkUserPermission(user.id, board.workspaceId, PermissionEnum.MANAGE_BOARD_SETTINGS);

  if (!hasPermission.hasPermission) {
    throw new Error('You don\'t have permission to reorder columns in this board');
  }

  // Update column order in transactions
  const updates = columns.map(column =>
    prisma.taskColumn.update({
      where: { id: column.id },
      data: { order: column.order }
    })
  );

  const updatedColumns = await prisma.$transaction(updates);

  return updatedColumns;
}

/**
 * Move a task to a different column or position
 */
export async function moveTask(taskId: string, data: { columnId: string; position: number }) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    throw new Error('Unauthorized');
  }

  const { columnId, position } = data;

  // Validate input
  if (!taskId) {
    throw new Error('Task ID is required');
  }

  if (!columnId) {
    throw new Error('Column ID is required');
  }

  if (position === undefined || position < 0) {
    throw new Error('Invalid position');
  }

  // Get the current user
  const user = await prisma.user.findUnique({
    where: {
      email: session.user.email
    }
  });

  if (!user) {
    throw new Error('User not found');
  }

  // Get the task
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { workspace: true }
  });

  if (!task) {
    throw new Error('Task not found');
  }

  // Verify the user has access to this task's workspace
  const hasAccess = await prisma.workspaceMember.findFirst({
    where: {
      userId: user.id,
      workspaceId: task.workspaceId,
      status: true
    }
  });

  const isWorkspaceOwner = task.workspace.ownerId === user.id;

  if (!hasAccess && !isWorkspaceOwner) {
    throw new Error('You don\'t have access to this task');
  }

  // Verify the column exists and belongs to a board in the task's workspace
  const column = await prisma.taskColumn.findUnique({
    where: { id: columnId },
    include: { taskBoard: true }
  });

  if (!column) {
    throw new Error('Column not found');
  }

  if (column.taskBoard.workspaceId !== task.workspaceId) {
    throw new Error('Column doesn\'t belong to the task\'s workspace');
  }

  // Update the task with the new column and position
  const updatedTask = await prisma.task.update({
    where: { id: taskId },
    data: {
      columnId,
      position
    }
  });

  return updatedTask;
}

/**
 * Get tasks for a specific board
 */
export async function getBoardTasks(boardId: string) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    throw new Error('Unauthorized');
  }

  // Get the current user
  const user = await prisma.user.findUnique({
    where: {
      email: session.user.email
    },
    select: {
      id: true
    }
  });

  if (!user) {
    throw new Error('User not found');
  }

  // Get the board to verify access
  const board = await prisma.taskBoard.findUnique({
    where: { id: boardId },
    select: { workspaceId: true }
  });

  if (!board) {
    throw new Error('Board not found');
  }

  // Verify the user has access to this workspace
  const workspace = await prisma.workspace.findFirst({
    where: {
      id: board.workspaceId,
      OR: [
        { ownerId: user.id },
        { members: { some: { userId: user.id } } }
      ]
    }
  });

  if (!workspace) {
    throw new Error('Workspace not found or access denied');
  }

  // Get the tasks for this board
  const tasks = await prisma.task.findMany({
    where: { taskBoardId: boardId },
    include: {
      assignee: {
        select: {
          id: true,
          name: true,
          image: true,
          role: true,
          useCustomAvatar: true,
          avatarSkinTone: true,
          avatarEyes: true,
          avatarBrows: true,
          avatarMouth: true,
          avatarNose: true,
          avatarHair: true,
          avatarEyewear: true,
          avatarAccessory: true,
        }
      },
      column: {
        select: {
          id: true,
          name: true,
        }
      },
      reporter: {
        select: {
          id: true,
          name: true,
          image: true,
          role: true
        }
      },
      _count: {
        select: {
          comments: true,
          attachments: true
        }
      }
    },
    orderBy: [
      { status: 'asc' },
      { priority: 'desc' },
      { createdAt: 'desc' }
    ]
  });

  return tasks;
} 