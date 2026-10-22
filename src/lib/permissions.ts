import "server-only";
import type { User } from "@prisma/client";
import { prisma } from "./prisma";
import { Permission, UserRole, WorkspaceRole } from "./permission-types";

export { Permission, UserRole, WorkspaceRole, getRoleDisplayName, getPermissionDisplayName } from "./permission-types";

export interface UserWithRole extends User {
  workspaceMemberships: Array<{
    workspaceId: string;
    role: WorkspaceRole;
  }>;
}

export interface PermissionCheckResult {
  hasPermission: boolean;
  reason?: string;
  userRole?: WorkspaceRole;
}

/**
 * Check a workspace permission for an active member, owner, or system admin.
 */
export async function checkUserPermission(
  userId: string,
  workspaceId: string,
  permission: Permission
): Promise<PermissionCheckResult> {
  try {
    // Get user with their workspace membership
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        workspaceMemberships: {
          where: { workspaceId, status: true },
          select: { role: true },
        },
        ownedWorkspaces: {
          where: { id: workspaceId },
          select: { id: true },
        },
      },
    });

    if (!user) {
      return { hasPermission: false, reason: "User not found" };
    }

    // System admins have all permissions
    if (user.role === UserRole.SYSTEM_ADMIN) {
      return { hasPermission: true, userRole: "OWNER" as any };
    }

    // Check if user is workspace owner
    if (user.ownedWorkspaces.length > 0) {
      return { hasPermission: true, userRole: "OWNER" as any };
    }

    const membership = user.workspaceMemberships[0];
    if (!membership) {
      return {
        hasPermission: false,
        reason: "User is not a member of this workspace",
      };
    }
    // Check role permission in the workspace
    const rolePermission = await (prisma as any).rolePermission.findUnique({
      where: {
        workspaceId_role_permission: {
          workspaceId,
          role: membership.role,
          permission: permission as string,
        },
      },
    });

    if (!rolePermission) {
      return {
        hasPermission: false,
        reason: "Permission not configured for this role",
        userRole: membership.role as any,
      };
    }

    return {
      hasPermission: true, // Permission exists = enabled in our new model
      userRole: membership.role as any,
    };
  } catch (error) {
    console.error("Error checking user permission:", error);
    return { hasPermission: false, reason: "Internal error" };
  }
}

/**
 * Check multiple permissions for a user in a workspace
 */
export async function checkUserPermissions(
  userId: string,
  workspaceId: string,
  permissions: Permission[]
): Promise<Record<Permission, PermissionCheckResult>> {
  const results: Record<Permission, PermissionCheckResult> = {} as any;

  for (const permission of permissions) {
    results[permission] = await checkUserPermission(
      userId,
      workspaceId,
      permission
    );
  }

  return results;
}

/**
 * Get all permissions for a user in a workspace
 */
export async function getUserPermissions(
  userId: string,
  workspaceId: string
): Promise<Permission[]> {
  try {
    // Get user with their workspace membership
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        workspaceMemberships: {
          where: { workspaceId, status: true },
          select: { role: true },
        },
        ownedWorkspaces: {
          where: { id: workspaceId },
          select: { id: true },
        },
      },
    });

    if (!user) {
      return [];
    }

    // System admins have all permissions
    if (user.role === UserRole.SYSTEM_ADMIN) {
      return Object.values(Permission);
    }

    // Workspace owners have all permissions
    if (user.ownedWorkspaces.length > 0) {
      return Object.values(Permission);
    }

    const membership = user.workspaceMemberships[0];
    if (!membership) {
      return [];
    }

    // Get all enabled permissions for the user's role
    const rolePermissions = await (prisma as any).rolePermission.findMany({
      where: {
        workspaceId,
        role: membership.role as string,
      },
      select: { permission: true },
    });

    return rolePermissions.map((rp: any) => rp.permission as Permission);
  } catch (error) {
    console.error("Error getting user permissions:", error);
    return [];
  }
}

/**
 * Get user's role in a workspace
 * Lookup failures return null by default. Read callers may opt into throwing
 * to distinguish unavailable authorization from genuine absent membership.
 */
export async function getUserWorkspaceRole(
  userId: string,
  workspaceId: string,
  throwOnError = false
): Promise<string | null> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        workspaceMemberships: {
          where: { workspaceId, status: true },
          select: { role: true },
        },
        ownedWorkspaces: {
          where: { id: workspaceId },
          select: { id: true },
        },
      },
    });

    if (!user) {
      return null;
    }

    // Workspace owner
    if (user.ownedWorkspaces.length > 0) {
      return "OWNER";
    }

    // Member role (single row due to where: { workspaceId })
    const membership = user.workspaceMemberships[0];
    return membership?.role || null;
  } catch (error) {
    if (throwOnError) throw error;
    console.error("Error getting user workspace role:", error);
    return null;
  }
}

/**
 * Check if user can perform an action on their own content
 */
export function canActOnOwnContent(
  contentOwnerId: string,
  currentUserId: string,
  hasGeneralPermission: boolean,
  hasSelfPermission: boolean
): boolean {
  // If it's their own content and they have self permission
  if (contentOwnerId === currentUserId && hasSelfPermission) {
    return true;
  }
  // If they have general permission (can act on anyone's content)
  if (hasGeneralPermission) {
    return true;
  }

  return false;
}

/**
 * Permission middleware for API routes
 */
export function requirePermission(permission: Permission) {
  return async (userId: string, workspaceId: string): Promise<boolean> => {
    const result = await checkUserPermission(userId, workspaceId, permission);
    return result.hasPermission;
  };
}

/**
 * Permission middleware for multiple permissions (OR logic)
 */
export function requireAnyPermission(permissions: Permission[]) {
  return async (userId: string, workspaceId: string): Promise<boolean> => {
    for (const permission of permissions) {
      const result = await checkUserPermission(userId, workspaceId, permission);
      if (result.hasPermission) {
        return true;
      }
    }
    return false;
  };
}

/**
 * Permission middleware for multiple permissions (AND logic)
 */
export function requireAllPermissions(permissions: Permission[]) {
  return async (userId: string, workspaceId: string): Promise<boolean> => {
    for (const permission of permissions) {
      const result = await checkUserPermission(userId, workspaceId, permission);
      if (!result.hasPermission) {
        return false;
      }
    }
    return true;
  };
}
