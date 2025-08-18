'use server';

import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';

type PostType = 'UPDATE' | 'BLOCKER' | 'IDEA' | 'QUESTION' | 'RESOLVED';

/**
 * Get post statistics for a workspace
 */
export async function getPostStats({
  workspaceId,
}: {
  workspaceId?: string;
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    throw new Error('Unauthorized');
  }
  
  // Build the query
  const query: any = {};
  
  // Filter by workspace
  if (workspaceId) {
    query.workspaceId = workspaceId;
  } else {
    // Get workspaces the user has access to
    const accessibleWorkspaces = await prisma.workspace.findMany({
      where: {
        OR: [
          { ownerId: session.user.id },
          { members: { some: { userId: session.user.id } } }
        ]
      },
      select: { id: true }
    });
    
    if (accessibleWorkspaces.length === 0) {
      return {
        total: 0,
        updates: 0,
        blockers: 0,
        ideas: 0,
        questions: 0,
        priority: 0
      };
    }
    
    query.workspaceId = {
      in: accessibleWorkspaces.map(w => w.id)
    };
  }
  
  // Get counts for each type and priority
  const [
    total,
    updates,
    blockers,
    ideas,
    questions,
    priority
  ] = await Promise.all([
    // Total posts
    prisma.post.count({ where: query }),
    
    // Updates
    prisma.post.count({ 
      where: { ...query, type: 'UPDATE' } 
    }),
    
    // Blockers
    prisma.post.count({ 
      where: { ...query, type: 'BLOCKER' } 
    }),
    
    // Ideas
    prisma.post.count({ 
      where: { ...query, type: 'IDEA' } 
    }),
    
    // Questions
    prisma.post.count({ 
      where: { ...query, type: 'QUESTION' } 
    }),
    
    // Priority posts (high or critical)
    prisma.post.count({ 
      where: { 
        ...query, 
        priority: { in: ['high', 'critical'] } 
      } 
    })
  ]);

  return {
    total,
    updates,
    blockers,
    ideas,
    questions,
    priority
  };
}
