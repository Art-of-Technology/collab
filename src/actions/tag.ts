'use server';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { getWorkspaceId } from '@/lib/workspace-helpers';

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
    const workspaceId = await getWorkspaceId({id: user.id});
    
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