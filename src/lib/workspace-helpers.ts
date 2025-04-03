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
 * @returns A valid workspace ID or null if user has no workspaces
 * 
 * If the user doesn't have access to the workspace in the cookie,
 * this function will return the first workspace they have access to.
 * If the user has no workspaces, it returns null.
 */
export async function getValidWorkspaceId(user: User): Promise<string | null> {
  if (!user) return null;

  // Get current workspace from cookie
  const cookieStore = await cookies();
  const currentWorkspaceId = cookieStore.get('currentWorkspaceId')?.value;

  // Get all workspaces the user has access to
  const userWorkspaces = await prisma.workspace.findMany({
    where: {
      OR: [
        { ownerId: user.id },
        { members: { some: { userId: user.id } } }
      ]
    },
    select: { id: true }
  });
  
  // Check if user has any workspaces
  if (userWorkspaces.length === 0) {
    return null;
  }
  
  // Get valid workspace IDs the user has access to
  const validWorkspaceIds = userWorkspaces.map(workspace => workspace.id);
  
  // If a workspace ID is in the cookie, verify the user has access to it
  let workspaceId = currentWorkspaceId;
  if (workspaceId) {
    const hasAccess = validWorkspaceIds.includes(workspaceId);
    
    if (!hasAccess) {
      // If the user doesn't have access to the workspace in the cookie,
      // use their first accessible workspace instead
      workspaceId = userWorkspaces[0].id;
    }
  } else {
    // No workspace ID in cookie, use the first workspace
    workspaceId = userWorkspaces[0].id;
  }
  
  return workspaceId;
}

/**
 * Verify workspace access and handle redirects
 * 
 * @param user The current user
 * @param redirectNoAccess Whether to redirect if user has no workspaces
 * @returns A valid workspace ID
 * 
 * This function will redirect to the welcome page if the user has no workspaces
 * (if redirectNoAccess is true), or redirect to login if no user is provided.
 */
export async function verifyWorkspaceAccess(
  user: User | null, 
  redirectNoAccess: boolean = true
): Promise<string> {
  if (!user) {
    redirect("/login");
  }

  const workspaceId = await getValidWorkspaceId(user);
  
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