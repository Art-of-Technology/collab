/**
 * Server-side functions to get slugs for URL generation
 * These return the actual slugs, not database IDs
 */

import { prisma } from '@/lib/prisma';
import { isUUID } from '@/lib/url-utils';

// Check if a string is a CUID (Prisma's default ID format)
function isCUID(str: string): boolean {
  return /^c[a-z0-9]{24}$/.test(str);
}

// Check if a string is a database ID (UUID or CUID)
function isDatabaseId(str: string): boolean {
  return isUUID(str) || isCUID(str);
}

/**
 * Get workspace slug from ID or slug
 * Returns the actual slug for URL generation
 */
export async function getWorkspaceSlugServer(idOrSlug: string): Promise<string | null> {
  try {
    if (isDatabaseId(idOrSlug)) {
      // It's a database ID, get the slug
      const workspace = await prisma.workspace.findUnique({
        where: { id: idOrSlug },
        select: { slug: true }
      });
      return workspace?.slug || null;
    } else {
      // Already a slug, just return it
      return idOrSlug;
    }
  } catch (error) {
    console.error('Error getting workspace slug:', error);
    return null;
  }
}

/**
 * Get board slug from ID or slug
 * Returns the actual slug for URL generation
 */
export async function getBoardSlugServer(boardIdOrSlug: string, workspaceSlugOrId: string): Promise<string | null> {
  try {
    // First resolve workspace to ID if needed
    let workspaceId = workspaceSlugOrId;
    if (!isDatabaseId(workspaceSlugOrId)) {
      const workspace = await prisma.workspace.findUnique({
        where: { slug: workspaceSlugOrId },
        select: { id: true }
      });
      workspaceId = workspace?.id || workspaceSlugOrId;
    }

    if (isDatabaseId(boardIdOrSlug)) {
      // It's a database ID, get the slug
      const board = await prisma.taskBoard.findFirst({
        where: { 
          id: boardIdOrSlug,
          workspaceId: workspaceId
        },
        select: { slug: true }
      });
      return board?.slug || null;
    } else {
      // Already a slug, just return it
      return boardIdOrSlug;
    }
  } catch (error) {
    console.error('Error getting board slug:', error);
    return null;
  }
} 