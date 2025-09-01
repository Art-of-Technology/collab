'use server';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { getWorkspaceId } from '@/lib/workspace-helpers';

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
    const workspaceId = await getWorkspaceId({id: user.id});
    
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
      // Build search conditions for user fields
      const userSearchConditions: any[] = [];
      
      // Name and email can use contains
      if (query.trim()) {
        userSearchConditions.push(
          { name: { contains: query, mode: 'insensitive' as const } },
          { email: { contains: query, mode: 'insensitive' as const } }
        );
        
        // Team can use contains if not null
        userSearchConditions.push({ 
          team: { 
            contains: query, 
            mode: 'insensitive' as const
          } 
        });
        
        // For role enum, we need to check if the query matches any of the enum values
        const roleEnumValues = [
          'SYSTEM_ADMIN', 'DEVELOPER', 'PROJECT_MANAGER', 'HR', 'LEGAL', 
          'FINANCE', 'MARKETING', 'SALES', 'CUSTOMER_SUPPORT', 'QA_TESTER', 
          'DESIGNER', 'CONTENT_CREATOR', 'ANALYST', 'CONSULTANT', 'INTERN', 'GUEST'
        ];
        
        const matchingRoles = roleEnumValues.filter(role => 
          role.toLowerCase().includes(query.toLowerCase())
        );
        
        if (matchingRoles.length > 0) {
          userSearchConditions.push({ role: { in: matchingRoles } });
        }
      }

      users = await prisma.user.findMany({
        where: {
          AND: [
            {
              OR: userSearchConditions
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