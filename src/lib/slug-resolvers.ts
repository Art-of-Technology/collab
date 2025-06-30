/**
 * Slug resolver functions to convert user-friendly URLs to database IDs
 */

import { prisma } from '@/lib/prisma';
import { isUUID } from '@/lib/url-utils';

/**
 * Resolve workspace slug to workspace ID
 * Supports both slugs and legacy UUIDs for backward compatibility
 */
export async function resolveWorkspaceSlug(slugOrId: string): Promise<string | null> {
  try {
    // If it's already a UUID, return it (legacy support)
    if (isUUID(slugOrId)) {
      // Verify the workspace exists
      const workspace = await prisma.workspace.findUnique({
        where: { id: slugOrId },
        select: { id: true }
      });
      return workspace?.id || null;
    }

    // Otherwise, resolve slug to ID
    const workspace = await prisma.workspace.findUnique({
      where: { slug: slugOrId },
      select: { id: true }
    });

    return workspace?.id || null;
  } catch (error) {
    console.error('Error resolving workspace slug:', error);
    return null;
  }
}

/**
 * Resolve board slug to board ID within a workspace
 * Supports both slugs and legacy UUIDs for backward compatibility
 */
export async function resolveBoardSlug(workspaceId: string, slugOrId: string): Promise<string | null> {
  try {
    // If it's already a UUID, return it (legacy support)
    if (isUUID(slugOrId)) {
      // Verify the board exists in the workspace
      const board = await prisma.taskBoard.findFirst({
        where: { 
          id: slugOrId,
          workspaceId: workspaceId
        },
        select: { id: true }
      });
      return board?.id || null;
    }

    // Otherwise, resolve slug to ID within workspace
    const board = await prisma.taskBoard.findFirst({
      where: { 
        slug: slugOrId,
        workspaceId: workspaceId
      },
      select: { id: true }
    });

    return board?.id || null;
  } catch (error) {
    console.error('Error resolving board slug:', error);
    return null;
  }
}

/**
 * Resolve task issue key to task ID within a board
 * Supports both issue keys (TASK-123) and legacy UUIDs for backward compatibility
 */
export async function resolveTaskIssueKey(boardId: string, issueKeyOrId: string): Promise<string | null> {
  try {
    // If it's already a UUID, return it (legacy support)
    if (isUUID(issueKeyOrId)) {
      // Verify the task exists in the board
      const task = await prisma.task.findFirst({
        where: { 
          id: issueKeyOrId,
          taskBoardId: boardId
        },
        select: { id: true }
      });
      return task?.id || null;
    }

    // Otherwise, resolve issue key to ID within board
    const task = await prisma.task.findFirst({
      where: { 
        issueKey: issueKeyOrId,
        taskBoardId: boardId
      },
      select: { id: true }
    });

    return task?.id || null;
  } catch (error) {
    console.error('Error resolving task issue key:', error);
    return null;
  }
}

/**
 * Get workspace by slug or ID with full details
 */
export async function getWorkspaceBySlug(slugOrId: string, userId: string) {
  try {
    const whereClause = isUUID(slugOrId) 
      ? { id: slugOrId }
      : { slug: slugOrId };

    const workspace = await prisma.workspace.findFirst({
      where: {
        ...whereClause,
        OR: [
          { ownerId: userId },
          { members: { some: { userId: userId } } }
        ]
      },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
          }
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true,
              }
            }
          }
        }
      }
    });

    return workspace;
  } catch (error) {
    console.error('Error getting workspace by slug:', error);
    return null;
  }
}

/**
 * Get board by slug within workspace with full details
 */
export async function getBoardBySlug(workspaceId: string, slugOrId: string) {
  try {
    const whereClause = isUUID(slugOrId) 
      ? { id: slugOrId, workspaceId }
      : { slug: slugOrId, workspaceId };

    const board = await prisma.taskBoard.findFirst({
      where: whereClause,
      include: {
        columns: {
          orderBy: { order: 'asc' },
          include: {
            tasks: {
              include: {
                assignee: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                    image: true,
                  }
                }
              }
            }
          }
        }
      }
    });

    return board;
  } catch (error) {
    console.error('Error getting board by slug:', error);
    return null;
  }
}

/**
 * Get task by issue key within board with full details
 */
export async function getTaskByIssueKey(boardId: string, issueKeyOrId: string) {
  try {
    const whereClause = isUUID(issueKeyOrId) 
      ? { id: issueKeyOrId, taskBoardId: boardId }
      : { issueKey: issueKeyOrId, taskBoardId: boardId };

    const task = await prisma.task.findFirst({
      where: whereClause,
      include: {
        assignee: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          }
        },
        reporter: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          }
        },
        comments: {
          include: {
            author: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true,
              }
            }
          },
          orderBy: { createdAt: 'asc' }
        },
        attachments: true,
        labels: true
      }
    });

    return task;
  } catch (error) {
    console.error('Error getting task by issue key:', error);
    return null;
  }
}

/**
 * Generate next issue key for a board
 */
export async function generateNextIssueKey(boardId: string): Promise<string> {
  try {
    const board = await prisma.taskBoard.findUnique({
      where: { id: boardId },
      select: { issuePrefix: true, nextIssueNumber: true }
    });

    if (!board) {
      throw new Error('Board not found');
    }

    const issueKey = `${board.issuePrefix}-${board.nextIssueNumber}`;

    // Increment the next issue number
    await prisma.taskBoard.update({
      where: { id: boardId },
      data: { nextIssueNumber: board.nextIssueNumber + 1 }
    });

    return issueKey;
  } catch (error) {
    console.error('Error generating next issue key:', error);
    throw error;
  }
} 