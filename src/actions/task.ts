'use server';

import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';

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
  status?: 'TODO' | 'IN_PROGRESS' | 'DONE';
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
    status = 'TODO',
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
        userId: assigneeId
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
        userId: reporterId
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
      status,
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

  return task;
}

/**
 * Update a task
 */
export async function updateTask(taskId: string, data: {
  title?: string;
  description?: string;
  assigneeId?: string | null;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH';
  status?: 'TODO' | 'IN_PROGRESS' | 'DONE';
  dueDate?: Date | null;
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    throw new Error('Unauthorized');
  }

  const { title, description, assigneeId, priority, status, dueDate } = data;

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
    include: {
      workspace: true
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
        userId: assigneeId
      }
    });

    const isOwner = workspace.ownerId === assigneeId;

    if (!isMember && !isOwner) {
      throw new Error('Assignee is not a member of this workspace');
    }
  }

  // Update the task
  const updatedTask = await prisma.task.update({
    where: {
      id: taskId
    },
    data: {
      title: title !== undefined ? title.trim() : undefined,
      description: description !== undefined ? (description?.trim() || null) : undefined,
      assigneeId: assigneeId === null ? null : (assigneeId || undefined),
      priority,
      status,
      dueDate: dueDate === null ? null : (dueDate || undefined)
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

  // Delete the task
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
  description?: string;
  issuePrefix?: string;
  isDefault?: boolean;
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    throw new Error('Unauthorized');
  }

  const { workspaceId, name, description, issuePrefix, isDefault } = data;

  // Validate input
  if (!name || !name.trim()) {
    throw new Error('Board name is required');
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

  // Create the board with default columns
  const board = await prisma.taskBoard.create({
    data: {
      name: name.trim(),
      description: description?.trim() || null,
      issuePrefix: issuePrefix?.trim() || null,
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
      issuePrefix: issuePrefix !== undefined ? (issuePrefix?.trim() || null) : undefined,
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

  // Verify the user has admin rights in the workspace
  const userWorkspaceMembership = await prisma.workspaceMember.findFirst({
    where: {
      userId: user.id,
      workspaceId: board.workspaceId
    }
  });

  // Check if the user is the workspace owner
  const workspace = await prisma.workspace.findUnique({
    where: { id: board.workspaceId },
    select: { ownerId: true }
  });

  const isWorkspaceOwner = workspace?.ownerId === user.id;
  const isWorkspaceAdmin = userWorkspaceMembership?.role === 'admin' || userWorkspaceMembership?.role === 'owner';
  const isGlobalAdmin = user.role === 'admin';

  // Only allow workspace admins, workspace owners, or global admins to create columns
  if (!isWorkspaceOwner && !isWorkspaceAdmin && !isGlobalAdmin) {
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

  // Verify the user has admin rights in the workspace
  const userWorkspaceMembership = await prisma.workspaceMember.findFirst({
    where: {
      userId: user.id,
      workspaceId: column.taskBoard.workspaceId
    }
  });

  // Check if the user is the workspace owner
  const workspace = await prisma.workspace.findUnique({
    where: { id: column.taskBoard.workspaceId },
    select: { ownerId: true }
  });

  const isWorkspaceOwner = workspace?.ownerId === user.id;
  const isWorkspaceAdmin = userWorkspaceMembership?.role === 'admin' || userWorkspaceMembership?.role === 'owner';
  const isGlobalAdmin = user.role === 'admin';

  // Only allow workspace admins, workspace owners, or global admins to edit columns
  if (!isWorkspaceOwner && !isWorkspaceAdmin && !isGlobalAdmin) {
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

  // Verify the user has admin rights in the workspace
  const userWorkspaceMembership = await prisma.workspaceMember.findFirst({
    where: {
      userId: user.id,
      workspaceId: column.taskBoard.workspaceId
    }
  });

  // Check if the user is the workspace owner
  const workspace = await prisma.workspace.findUnique({
    where: { id: column.taskBoard.workspaceId },
    select: { ownerId: true }
  });

  const isWorkspaceOwner = workspace?.ownerId === user.id;
  const isWorkspaceAdmin = userWorkspaceMembership?.role === 'admin' || userWorkspaceMembership?.role === 'owner';
  const isGlobalAdmin = user.role === 'admin';

  // Only allow workspace admins, workspace owners, or global admins to delete columns
  if (!isWorkspaceOwner && !isWorkspaceAdmin && !isGlobalAdmin) {
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

  // Verify the user has admin rights in the workspace
  const userWorkspaceMembership = await prisma.workspaceMember.findFirst({
    where: {
      userId: user.id,
      workspaceId: board.workspaceId
    }
  });

  // Check if the user is the workspace owner
  const workspace = await prisma.workspace.findUnique({
    where: { id: board.workspaceId },
    select: { ownerId: true }
  });

  const isWorkspaceOwner = workspace?.ownerId === user.id;
  const isWorkspaceAdmin = userWorkspaceMembership?.role === 'admin' || userWorkspaceMembership?.role === 'owner';
  const isGlobalAdmin = user.role === 'admin';

  // Only allow workspace admins, workspace owners, or global admins to reorder columns
  if (!isWorkspaceOwner && !isWorkspaceAdmin && !isGlobalAdmin) {
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
      workspaceId: task.workspaceId
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