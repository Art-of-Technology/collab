'use server';

import { postWorkspaceAccessWhere } from '@/lib/post-access';
import { authOptions } from '@/lib/auth-options';
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

  if (!session?.user?.email || !session.user.id) {
    throw new Error('Unauthorized');
  }
  
  const query = { workspace: postWorkspaceAccessWhere(session.user.id, workspaceId) };

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
