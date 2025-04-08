'use server';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';

/**
 * Get a valid workspace ID for the current user
 */
async function getValidWorkspaceId(userId: string): Promise<string> {
  // Get current workspace from cookie
  const cookieStore = await cookies();
  const currentWorkspaceId = cookieStore.get('currentWorkspaceId')?.value;

  // If a workspace ID is in the cookie, verify the user has access to it
  if (currentWorkspaceId) {
    const hasAccess = await prisma.workspace.findFirst({
      where: {
        id: currentWorkspaceId,
        OR: [
          { ownerId: userId },
          { members: { some: { userId } } }
        ]
      },
      select: { id: true }
    });
    
    if (hasAccess) return currentWorkspaceId;
  }
  
  // If no workspace ID in cookie or user doesn't have access to it,
  // get the user's first workspace
  const workspace = await prisma.workspace.findFirst({
    where: {
      OR: [
        { ownerId: userId },
        { members: { some: { userId } } }
      ]
    },
    orderBy: {
      createdAt: 'asc'
    },
    select: { id: true }
  });
  
  if (!workspace) {
    throw new Error('No workspace available');
  }
  
  return workspace.id;
}

/**
 * Fetch all tags with post counts for the current workspace
 */
export async function getTags() {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.email) {
    throw new Error('Unauthorized');
  }
  
  // Get the user
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
  
  try {
    // Get a valid workspace ID
    const workspaceId = await getValidWorkspaceId(user.id);
    
    // Get all tags and count of posts for each tag in the current workspace
    const tagsWithCount = await prisma.tag.findMany({
      where: {
        posts: {
          some: {
            workspaceId: workspaceId
          }
        }
      },
      include: {
        _count: {
          select: {
            posts: {
              where: {
                workspaceId: workspaceId
              }
            }
          }
        }
      },
      orderBy: {
        name: 'asc'
      }
    });
    
    // Group tags by first letter for better UI organization
    const groupedTags: Record<string, typeof tagsWithCount> = {};
    
    tagsWithCount.forEach(tag => {
      const firstLetter = tag.name.charAt(0).toUpperCase();
      if (!groupedTags[firstLetter]) {
        groupedTags[firstLetter] = [];
      }
      groupedTags[firstLetter].push(tag);
    });
    
    // Sort the keys alphabetically
    const sortedLetters = Object.keys(groupedTags).sort();
    
    return {
      tags: tagsWithCount,
      groupedTags,
      sortedLetters,
      currentUserId: user.id,
      workspaceId
    };
  } catch (error) {
    console.error('Error fetching tags:', error);
    throw error;
  }
} 