import { prisma } from '@/lib/prisma';

/**
 * Resolve issue key to database ID for various entity types
 */
export async function resolveIssueKeyToId(issueKey: string, entityType: 'task' | 'epic' | 'story' | 'milestone'): Promise<string | null> {
  try {
    let entity = null;
    
    switch (entityType) {
      case 'task':
        entity = await prisma.task.findFirst({
          where: { issueKey },
          select: { id: true }
        });
        break;
      case 'epic':
        entity = await prisma.epic.findFirst({
          where: { issueKey },
          select: { id: true }
        });
        break;
      case 'story':
        entity = await prisma.story.findFirst({
          where: { issueKey },
          select: { id: true }
        });
        break;
      case 'milestone':
        entity = await prisma.milestone.findFirst({
          where: { issueKey },
          select: { id: true }
        });
        break;
      default:
        return null;
    }
    
    return entity?.id || null;
  } catch (error) {
    console.error(`Error resolving issue key ${issueKey} for ${entityType}:`, error);
    return null;
  }
}

/**
 * Resolve database ID to issue key for various entity types
 */
export async function resolveIdToIssueKey(id: string, entityType: 'task' | 'epic' | 'story' | 'milestone'): Promise<string | null> {
  try {
    let entity = null;
    
    switch (entityType) {
      case 'task':
        entity = await prisma.task.findUnique({
          where: { id },
          select: { issueKey: true }
        });
        break;
      case 'epic':
        entity = await prisma.epic.findUnique({
          where: { id },
          select: { issueKey: true }
        });
        break;
      case 'story':
        entity = await prisma.story.findUnique({
          where: { id },
          select: { issueKey: true }
        });
        break;
      case 'milestone':
        entity = await prisma.milestone.findUnique({
          where: { id },
          select: { issueKey: true }
        });
        break;
      default:
        return null;
    }
    
    return entity?.issueKey || null;
  } catch (error) {
    console.error(`Error resolving ID ${id} for ${entityType}:`, error);
    return null;
  }
}

 