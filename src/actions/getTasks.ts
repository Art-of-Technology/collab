'use server';

import { getAuthSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { truncate } from 'lodash';
import { cookies } from 'next/headers';

/**
 * Get the current workspace ID from cookies or database
 */
async function getCurrentWorkspaceId(userId: string) {
  // Try to get from cookies first
  const cookieStore = await cookies();
  const currentWorkspaceId = cookieStore.get('currentWorkspaceId')?.value;

  if (currentWorkspaceId) {
    // Verify the user has access to this workspace
    const hasAccess = await prisma.workspace.findFirst({
      where: {
        id: currentWorkspaceId,
        OR: [
          { ownerId: userId },
          { members: { some: { userId } } }
        ]
      }
    });

    if (hasAccess) {
      return currentWorkspaceId;
    }
  }

  // If not in cookies or no access, get the first workspace the user has access to
  const userWorkspace = await prisma.workspaceMember.findFirst({
    where: {
      userId,
      status: true
    },
    select: {
      workspaceId: true,
    },
    orderBy: {
      updatedAt: 'desc',
    },
  });

  return userWorkspace?.workspaceId;
}

/**
 * Get all task boards for the current user's workspace
 */
export async function getTasksData() {
  const session = await getAuthSession();

  if (!session?.user) {
    throw new Error('Unauthorized');
  }

  // Get the user
  const user = await prisma.user.findUnique({
    where: {
      email: session.user.email as string
    },
    select: {
      id: true
    }
  });

  if (!user) {
    throw new Error('User not found');
  }

  // Get the current workspace ID
  const workspaceId = await getCurrentWorkspaceId(user.id);

  if (!workspaceId) {
    return {
      currentUserId: user.id,
      workspaceId: null,
      boards: [],
      hasNoWorkspace: true
    };
  }

  // Get all task boards for this workspace
  const boards = await prisma.taskBoard.findMany({
    where: {
      workspaceId
    },
    include: {
      _count: {
        select: {
          tasks: true
        }
      }
    },
    orderBy: {
      createdAt: 'asc'
    }
  });

  return {
    currentUserId: user.id,
    workspaceId,
    boards,
    hasNoWorkspace: false
  };
} 