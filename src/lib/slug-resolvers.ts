/**
 * Slug resolver functions to convert user-friendly URLs to database IDs
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
 * Resolve workspace slug to workspace ID
 * Supports both slugs and legacy UUIDs for backward compatibility
 */
export async function resolveWorkspaceSlug(slugOrId: string): Promise<string | null> {
  try {
    // If it's already a database ID (UUID or CUID), return it (legacy support)
    if (isDatabaseId(slugOrId)) {
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
