'use server';

import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client'; // Import Prisma
import { getServerSession } from 'next-auth';

/**
 * Get all items (tasks, milestones, epics, stories) for a board
 */
export async function getBoardItems(boardId: string) {
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

  // Get the tasks for this board, ordered by position
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
      labels: {
        select: {
          id: true,
          name: true,
          color: true
        }
      },
      parentTask: {
        select: {
          id: true,
          title: true,
          issueKey: true,
        },
      },
      _count: {
        select: {
          comments: true,
          attachments: true,
          subtasks: true,
        }
      }
    },
    orderBy: [
      { position: 'asc' },
      { createdAt: 'desc' }
    ]
  });

  // Get the milestones for this board, ordered by position
  const milestones = await prisma.milestone.findMany({
    where: { taskBoardId: boardId },
    include: {
      column: {
        select: {
          id: true,
          name: true,
        }
      },
      assignee: {
        select: {
          id: true,
          name: true,
          image: true,
          role: true,
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
      },
      reporter: {
        select: {
          id: true,
          name: true,
          image: true,
          role: true,
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
      },
      labels: {
        select: {
          id: true,
          name: true,
          color: true
        }
      },
      _count: {
        select: {
          epics: true
        }
      }
    },
    orderBy: [
      { position: 'asc' },
      { createdAt: 'desc' }
    ]
  });

  // Get the epics for this board, ordered by position
  const epics = await prisma.epic.findMany({
    where: { taskBoardId: boardId },
    include: {
      column: {
        select: {
          id: true,
          name: true,
        }
      },
      milestone: {
        select: {
          id: true,
          title: true,
        }
      },
      assignee: {
        select: {
          id: true,
          name: true,
          image: true,
          role: true,
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
      },
      reporter: {
        select: {
          id: true,
          name: true,
          image: true,
          role: true,
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
      },
      labels: {
        select: {
          id: true,
          name: true,
          color: true
        }
      },
      _count: {
        select: {
          stories: true
        }
      }
    },
    orderBy: [
      { position: 'asc' },
      { createdAt: 'desc' }
    ]
  });

  // Get the stories for this board, ordered by position
  const stories = await prisma.story.findMany({
    where: { taskBoardId: boardId },
    include: {
      column: {
        select: {
          id: true,
          name: true,
        }
      },
      epic: {
        select: {
          id: true,
          title: true,
        }
      },
      assignee: {
        select: {
          id: true,
          name: true,
          image: true,
          role: true,
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
      },
      reporter: {
        select: {
          id: true,
          name: true,
          image: true,
          role: true,
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
      },
      labels: {
        select: {
          id: true,
          name: true,
          color: true
        }
      },
      _count: {
        select: {
          tasks: true
        }
      }
    },
    orderBy: [
      { position: 'asc' },
      { createdAt: 'desc' }
    ]
  });

  // Transform the milestones to match the task shape, include position
  const transformedMilestones = milestones.map(milestone => ({
    id: milestone.id,
    title: milestone.title,
    description: milestone.description,
    type: 'MILESTONE',
    column: milestone.column,
    columnId: milestone.columnId,
    color: milestone.color,
    dueDate: milestone.dueDate,
    position: milestone.position,
    issueKey: milestone.issueKey,
    assignee: milestone.assignee,
    reporter: milestone.reporter,
    labels: milestone.labels,
    _count: {
      epics: milestone._count.epics,
    },
    entityType: 'milestone'
  }));

  // Transform the epics to match the task shape, include position
  const transformedEpics = epics.map(epic => ({
    id: epic.id,
    title: epic.title,
    description: epic.description,
    type: 'EPIC',
    column: epic.column,
    columnId: epic.columnId,
    color: epic.color,
    dueDate: epic.dueDate,
    position: epic.position,
    issueKey: epic.issueKey,
    milestone: epic.milestone,
    milestoneId: epic.milestoneId,
    assignee: epic.assignee,
    reporter: epic.reporter,
    labels: epic.labels,
    _count: {
      stories: epic._count.stories,
    },
    entityType: 'epic'
  }));

  // Transform the stories to match the task shape, include position
  const transformedStories = stories.map(story => ({
    id: story.id,
    title: story.title,
    description: story.description,
    type: 'STORY',
    column: story.column,
    columnId: story.columnId,
    color: story.color,
    position: story.position,
    issueKey: story.issueKey,
    epic: story.epic,
    epicId: story.epicId,
    storyPoints: story.storyPoints,
    assignee: story.assignee,
    reporter: story.reporter,
    labels: story.labels,
    _count: {
      tasks: story._count.tasks,
    },
    entityType: 'story'
  }));

  // Transform tasks to include entityType, include position
  const transformedTasks = tasks.map(task => ({
    ...task,
    position: task.position,
    entityType: 'task'
  }));

  // Combine all items
  const allItems = [
    ...transformedTasks,
    ...transformedMilestones,
    ...transformedEpics,
    ...transformedStories
  ].sort((a, b) => (a.position ?? Infinity) - (b.position ?? Infinity));

  // Group items by columnId
  const itemsByColumn = allItems.reduce((acc, item) => {
    if (item.columnId) {
      if (!acc[item.columnId]) {
        acc[item.columnId] = [];
      }
      acc[item.columnId].push(item);
    }
    return acc;
  }, {} as Record<string, any[]>);

  return {
    tasks: transformedTasks,
    milestones: transformedMilestones,
    epics: transformedEpics,
    stories: transformedStories,
    allItems,
    itemsByColumn
  };
}

/**
 * Reorders items within a column or moves an item to a new column and position.
 * This can work as both a server action and via API endpoint
 */
export async function reorderItemsInColumn(data: {
  boardId: string; 
  columnId: string; 
  orderedItemIds: string[]; 
  movedItemId: string; // Keep this to identify the moved item for status updates
  // entityType is no longer needed here as we will determine type per item
}) {
  // Check if this is running in a client context (browser)
  // If so, make an API call instead of running server logic directly
  if (typeof window !== 'undefined') {
    const response = await fetch('/api/tasks', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([data]), // Wrap in array as expected by API
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to reorder items');
    }

    return await response.json();
  }

  // Server-side execution continues below...
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    throw new Error('Unauthorized');
  }

  const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
  if (!user) {
    throw new Error('User not found');
  }

  const { boardId, columnId, orderedItemIds, movedItemId } = data;

  // Verify user has access to the board/workspace and get column name
  const board = await prisma.taskBoard.findUnique({ 
    where: { id: boardId }, 
    select: { workspaceId: true, columns: { where: { id: columnId }, select: { name: true } } }
  });
  if (!board) throw new Error('Board not found');
  
  const workspace = await prisma.workspace.findFirst({ 
    where: { id: board.workspaceId, OR: [{ ownerId: user.id }, { members: { some: { userId: user.id } } }] }
  });
  if (!workspace) throw new Error('Access denied');
  
  const columnName = board.columns[0]?.name;

  // 1. First get the previous state of the moved item for notifications
  let previousColumnName: string | null = null;
  let movedTaskTitle: string | null = null;
  
  // Check if the moved item is a task and get its previous column
  const movedTask = await prisma.task.findUnique({
    where: { id: movedItemId },
    select: { 
      title: true,
      columnId: true,
      column: {
        select: { name: true }
      }
    }
  });
  
  if (movedTask) {
    previousColumnName = movedTask.column?.name || null;
    movedTaskTitle = movedTask.title;
  }

  // 2. Fetch the types of all items involved
  const itemsWithTypes = await Promise.all([
    prisma.task.findMany({ 
      where: { id: { in: orderedItemIds } }, 
      select: { id: true }
    }).then(items => items.map(i => ({ id: i.id, type: 'task' }))),
    prisma.milestone.findMany({ 
      where: { id: { in: orderedItemIds } }, 
      select: { id: true }
    }).then(items => items.map(i => ({ id: i.id, type: 'milestone' }))),
    prisma.epic.findMany({ 
      where: { id: { in: orderedItemIds } }, 
      select: { id: true }
    }).then(items => items.map(i => ({ id: i.id, type: 'epic' }))),
    prisma.story.findMany({ 
      where: { id: { in: orderedItemIds } }, 
      select: { id: true }
    }).then(items => items.map(i => ({ id: i.id, type: 'story' }))),
  ]).then(results => results.flat());

  const itemTypeMap = new Map(itemsWithTypes.map(item => [item.id, item.type]));

  // 2. Build the transaction updates based on the actual type of each item
  const updates = orderedItemIds.map((itemId, index) => {
    const itemType = itemTypeMap.get(itemId);
    
    const dataToUpdate: { position: number; columnId: string; status?: string } = {
      position: index,
      columnId: columnId,
    };

    // Add status update if it's the moved item and the type supports status
    if (itemId === movedItemId && columnName) {
      // All entity types now use the column name directly, same as tasks
      dataToUpdate.status = columnName;
    }

    switch (itemType) {
      case 'milestone':
        return prisma.milestone.update({ where: { id: itemId }, data: dataToUpdate });
      case 'epic':
        return prisma.epic.update({ where: { id: itemId }, data: dataToUpdate });
      case 'story':
        return prisma.story.update({ where: { id: itemId }, data: dataToUpdate });
      case 'task':
        // Task update now includes status when moving between columns
        const taskData: { position: number; columnId: string; status?: string } = { 
          position: index, 
          columnId: columnId 
        };
        // Add status if this is the moved item
        if (itemId === movedItemId && dataToUpdate.status) {
          taskData.status = dataToUpdate.status;
        }
        return prisma.task.update({ where: { id: itemId }, data: taskData });
      default:
        // This should ideally not happen if all items were found
        console.warn(`Could not determine type for item ID: ${itemId}. Skipping update.`);
        // Return a non-update operation or handle as needed
        // For safety, let's return a promise that resolves to null or similar
        return Promise.resolve(null) as Prisma.PrismaPromise<any>; 
    }
  }).filter(Boolean); // Filter out any null promises from skipped items

  // 3. Execute the transaction
  if (updates.length !== orderedItemIds.length) {
     // This indicates some items couldn't be typed or updated
     console.error("Mismatch between requested updates and generated updates. Check item types.");
     throw new Error("Failed to reorder items: Could not determine type for all items.");
  }

  try {
    await prisma.$transaction(updates);
    
    // 4. Send notifications for status changes if it's a task
    const movedItemType = itemTypeMap.get(movedItemId);
    if (movedItemType === 'task' && columnName && previousColumnName && columnName !== previousColumnName) {
      // Import NotificationService at the top of the file
      const { NotificationService, NotificationType } = await import('@/lib/notification-service');
      
      // Get the updated task with board ID
      const task = await prisma.task.findUnique({
        where: { id: movedItemId },
        select: { 
          taskBoardId: true
        }
      });
      
      if (task && task.taskBoardId) {
        // Send notification to task followers
        await NotificationService.notifyTaskFollowers({
          taskId: movedItemId,
          senderId: user.id,
          type: NotificationType.TASK_STATUS_CHANGED,
          content: `Task status changed from "${previousColumnName}" to "${columnName}"`,
          excludeUserIds: []
        });
        
        // Send notification to board followers
        await NotificationService.notifyBoardFollowers({
          boardId: task.taskBoardId,
          taskId: movedItemId,
          senderId: user.id,
          type: NotificationType.BOARD_TASK_STATUS_CHANGED,
          content: `Task "${movedTaskTitle}" status changed from "${previousColumnName}" to "${columnName}"`,
          excludeUserIds: []
        });
        
        if (columnName.toLowerCase() === 'done') {
          await NotificationService.notifyBoardFollowers({
            boardId: task.taskBoardId,
            taskId: movedItemId,
            senderId: user.id,
            type: NotificationType.BOARD_TASK_COMPLETED,
            content: `Task "${movedTaskTitle}" has been completed`,
            excludeUserIds: []
          });
        }
      }
    }
  } catch (error) {
    console.error("Error reordering items in transaction:", error);
    // More specific error handling can be added based on Prisma error codes
    throw new Error(`Failed to reorder items. Details: ${error instanceof Error ? error.message : String(error)}`);
  }

  return { success: true };
}

// --- Functions to get individual entities by ID --- 

async function verifyAccessAndGetUser(entity: { workspaceId: string } | null, entityName: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) throw new Error('Unauthorized');

  const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
  if (!user) throw new Error('User not found');

  if (!entity) throw new Error(`${entityName} not found`);

  const workspace = await prisma.workspace.findFirst({ 
    where: { id: entity.workspaceId, OR: [{ ownerId: user.id }, { members: { some: { userId: user.id } } }] }
  });
  if (!workspace) throw new Error(`Access denied to ${entityName}'s workspace`);

  return user;
}

export async function getMilestoneById(id: string) {
  const milestone = await prisma.milestone.findUnique({ 
    where: { id },
    // Select necessary fields, including taskBoardId
    select: { id: true, title: true, taskBoardId: true, workspaceId: true } 
  });
  await verifyAccessAndGetUser(milestone, 'Milestone');
  return milestone;
}

export async function getEpicById(id: string) {
  const epic = await prisma.epic.findUnique({ 
    where: { id },
    // Select necessary fields, including taskBoardId
    select: { id: true, title: true, taskBoardId: true, workspaceId: true } 
  });
  await verifyAccessAndGetUser(epic, 'Epic');
  return epic;
}

export async function getStoryById(id: string) {
  const story = await prisma.story.findUnique({ 
    where: { id },
    // Select necessary fields, including taskBoardId and epicId
    select: { id: true, title: true, taskBoardId: true, workspaceId: true, epicId: true } 
  });
  // Stories might not always have a taskBoardId directly, handle null
  if (story && !story.taskBoardId) {
     // If story has an epic, try to get boardId from the epic
     if (story.epicId) {
         const epic = await prisma.epic.findUnique({ where: { id: story.epicId }, select: { taskBoardId: true }});
         if (epic) {
             (story as any).taskBoardId = epic.taskBoardId; // Assign boardId from epic
         }
     }
     // Add further fallback logic if necessary (e.g., from milestone via epic)
  }
  await verifyAccessAndGetUser(story, 'Story');
  
  // The logic to refetch and assign taskBoardId can be simplified
  // as the initial fetch now includes epicId and handles the fallback.
  // We just need to return the potentially modified story object.
  return story; 
}

// --- Functions to get lists of entities for selectors --- 

async function verifyWorkspaceAccess(workspaceId: string, userId: string) {
  const workspace = await prisma.workspace.findFirst({ 
    where: { id: workspaceId, OR: [{ ownerId: userId }, { members: { some: { userId: userId } } }] }
  });
  if (!workspace) throw new Error('Access denied to workspace');
}

export async function getWorkspaceMilestones(workspaceId: string, boardId?: string | null) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) throw new Error('Unauthorized');
  const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
  if (!user) throw new Error('User not found');
  await verifyWorkspaceAccess(workspaceId, user.id);

  const whereClause: Prisma.MilestoneWhereInput = { workspaceId };
  if (boardId) {
    whereClause.taskBoardId = boardId;
  }

  return prisma.milestone.findMany({
    where: whereClause,
    select: { id: true, title: true, taskBoardId: true },
    orderBy: { createdAt: 'desc' }
  });
}

export async function getWorkspaceEpics(workspaceId: string, boardId?: string | null) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) throw new Error('Unauthorized');
  const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
  if (!user) throw new Error('User not found');
  await verifyWorkspaceAccess(workspaceId, user.id);
  
  const whereClause: Prisma.EpicWhereInput = { workspaceId };
  if (boardId) {
    whereClause.taskBoardId = boardId;
  }

  return prisma.epic.findMany({
    where: whereClause,
    select: { id: true, title: true, taskBoardId: true },
    orderBy: { createdAt: 'desc' }
  });
}

export async function getWorkspaceStories(workspaceId: string, boardId?: string | null) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) throw new Error('Unauthorized');
  const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
  if (!user) throw new Error('User not found');
  await verifyWorkspaceAccess(workspaceId, user.id);

  const whereClause: Prisma.StoryWhereInput = { workspaceId };
  if (boardId) {
    whereClause.taskBoardId = boardId;
  }

  const stories = await prisma.story.findMany({
    where: whereClause,
    select: { id: true, title: true, taskBoardId: true, epicId: true },
    orderBy: { createdAt: 'desc' }
  });

  if (!boardId) {
    const storiesWithBoardId = await Promise.all(stories.map(async (story) => {
      if (!story.taskBoardId && story.epicId) {
        const epic = await prisma.epic.findUnique({ 
          where: { id: story.epicId }, 
          select: { taskBoardId: true }
        });
        return { ...story, taskBoardId: epic?.taskBoardId ?? null };
      }
      return story;
    }));
    return storiesWithBoardId;
  }

  return stories;
} 