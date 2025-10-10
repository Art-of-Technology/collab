import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

type User = {
  id: string;
  email?: string | null;
};

/**
 * Verify if a user has access to a workspace and get a valid workspace ID
 * 
 * @param user The current user
 * @param urlWorkspaceId Optional workspace ID/slug from URL parameter
 * @returns A valid workspace ID or null if user has no workspaces
 * 
 * Priority: URL parameter > cookie > first accessible workspace
 */
export async function getWorkspaceId(user: User, urlWorkspaceId?: string): Promise<string> {
  if (!user) throw new Error('User not found');

  // First priority: Check URL workspace parameter (can be ID or slug)
  if (urlWorkspaceId) {
    const urlWorkspace = await prisma.workspace.findFirst({
      where: {
        OR: [
          { id: urlWorkspaceId },
          { slug: urlWorkspaceId }
        ],
        AND: {
          OR: [
            { ownerId: user.id },
            { members: { some: { userId: user.id, status: true } } }
          ]
        }
      },
      select: { id: true }
    });

    if (urlWorkspace) {
      return urlWorkspace.id;
    }
  }

  // Second priority: Get current workspace from cookie
  const cookieStore = await cookies();
  const currentWorkspaceId = cookieStore.get('currentWorkspaceId')?.value;
  
  // If a workspace ID exists in cookie, verify the user has access to it
  if (currentWorkspaceId) {
    const hasAccess = await prisma.workspace.findFirst({
      where: {
        id: currentWorkspaceId,
        OR: [
          { ownerId: user.id },
          { members: { some: { userId: user.id, status: true } } }
        ]
      },
      select: { id: true }
    });

    if (hasAccess) {
      return currentWorkspaceId;
    }
  }

  // Fallback: return any accessible workspace (oldest by creation for stability)
  const firstAccessible = await prisma.workspace.findFirst({
    where: {
      OR: [
        { ownerId: user.id },
        { members: { some: { userId: user.id, status: true } } }
      ]
    },
    select: { id: true },
    orderBy: { createdAt: 'asc' }
  });
  
  if (!firstAccessible) throw new Error('No workspace available');

  return firstAccessible.id;
}

/**
 * Get a valid workspace path segment (slug if available, otherwise ID)
 * Priority: URL parameter > cookie > first accessible workspace
 */
export async function getWorkspaceSlugOrId(user: User, urlWorkspaceId?: string): Promise<string | null> {
  if (!user) return null;

  // First priority: Check URL workspace parameter (can be ID or slug)
  if (urlWorkspaceId) {
    const urlWorkspace = await prisma.workspace.findFirst({
      where: {
        OR: [
          { id: urlWorkspaceId },
          { slug: urlWorkspaceId }
        ],
        AND: {
          OR: [
            { ownerId: user.id },
            { members: { some: { userId: user.id, status: true } } }
          ]
        }
      },
      select: { id: true, slug: true }
    });

    if (urlWorkspace) {
      return urlWorkspace.slug || urlWorkspace.id;
    }
  }

  const cookieStore = await cookies();
  const currentWorkspaceId = cookieStore.get('currentWorkspaceId')?.value;

  if (currentWorkspaceId) {
    const ws = await prisma.workspace.findFirst({
      where: {
        id: currentWorkspaceId,
        OR: [
          { ownerId: user.id },
          { members: { some: { userId: user.id, status: true } } }
        ]
      },
      select: { id: true, slug: true }
    });

    if (ws) {
      return ws.slug || ws.id;
    }
  }

  const firstAccessible = await prisma.workspace.findFirst({
    where: {
      OR: [
        { ownerId: user.id },
        { members: { some: { userId: user.id, status: true } } }
      ]
    },
    select: { id: true, slug: true },
    orderBy: { createdAt: 'asc' }
  });

  if (!firstAccessible) return null;
  return firstAccessible.slug || firstAccessible.id;
}

/**
 * Verify workspace access and handle redirects
 * 
 * @param user The current user
 * @param redirectNoAccess Whether to redirect if user has no workspaces
 * @param urlWorkspaceId Optional workspace ID/slug from URL parameter
 * @returns A valid workspace ID
 * 
 * This function will redirect to the welcome page if the user has no workspaces
 * (if redirectNoAccess is true), or redirect to login if no user is provided.
 */
export async function verifyWorkspaceAccess(
  user: User | null, 
  redirectNoAccess: boolean = true,
  urlWorkspaceId?: string
): Promise<string> {
  if (!user) {
    redirect("/login");
  }

  const workspaceId = await getWorkspaceId(user, urlWorkspaceId);
  
  if (!workspaceId && redirectNoAccess) {
    redirect('/welcome');
  }
  
  return workspaceId || '';
}

/**
 * Check if the user has access to a specific workspace
 * 
 * @param userId The user ID
 * @param workspaceId The workspace ID to check
 * @returns True if the user has access, false otherwise
 */
export async function hasWorkspaceAccess(
  userId: string,
  workspaceId: string
): Promise<boolean> {
  if (!userId || !workspaceId) return false;
  
  const workspace = await prisma.workspace.findFirst({
    where: {
      id: workspaceId,
      OR: [
        { ownerId: userId },
        { members: { some: { userId } } }
      ]
    }
  });
  
  return !!workspace;
} 