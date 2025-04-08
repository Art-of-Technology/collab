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
 * Search for content based on query
 */
export async function searchContent(query: string, tab: string = 'all') {
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
  
  if (!query.trim()) {
    throw new Error('Empty search query');
  }
  
  try {
    // Get a valid workspace ID
    const workspaceId = await getValidWorkspaceId(user.id);
    
    // Results containers
    let posts: any[] = [];
    let users: any[] = [];
    let tags: any[] = [];
    
    // Search for posts if needed
    if (tab === 'all' || tab === 'posts') {
      posts = await prisma.post.findMany({
        where: {
          workspaceId: workspaceId,
          OR: [
            { message: { contains: query, mode: 'insensitive' } },
            { tags: { some: { name: { contains: query, mode: 'insensitive' } } } }
          ]
        },
        orderBy: {
          createdAt: "desc",
        },
        include: {
          author: true,
          tags: true,
          comments: {
            include: {
              author: true,
            },
            orderBy: {
              createdAt: "asc",
            },
          },
          reactions: true,
        },
      });
    }
    
    // Search for users if needed
    if (tab === 'all' || tab === 'people') {
      users = await prisma.user.findMany({
        where: {
          AND: [
            {
              OR: [
                { name: { contains: query, mode: 'insensitive' } },
                { email: { contains: query, mode: 'insensitive' } },
                { role: { contains: query, mode: 'insensitive' } },
                { team: { contains: query, mode: 'insensitive' } }
              ]
            },
            {
              OR: [
                { ownedWorkspaces: { some: { id: workspaceId } } },
                { workspaceMemberships: { some: { workspaceId: workspaceId } } }
              ]
            }
          ]
        },
        orderBy: {
          name: 'asc'
        },
        select: {
          id: true,
          name: true,
          image: true,
          role: true,
          team: true,
          _count: {
            select: {
              posts: {
                where: { workspaceId: workspaceId }
              }
            }
          }
        }
      });
    }
    
    // Search for tags if needed
    if (tab === 'all' || tab === 'tags') {
      tags = await prisma.tag.findMany({
        where: {
          name: { contains: query, mode: 'insensitive' },
          posts: {
            some: { workspaceId: workspaceId }
          }
        },
        include: {
          _count: {
            select: {
              posts: {
                where: { workspaceId: workspaceId }
              }
            }
          }
        },
        orderBy: {
          name: 'asc'
        }
      });
    }
    
    return { 
      query, 
      tab, 
      posts, 
      users, 
      tags, 
      totalResults: posts.length + users.length + tags.length,
      currentUserId: user.id,
      workspaceId
    };
  } catch (error) {
    console.error('Search error:', error);
    throw error;
  }
} 