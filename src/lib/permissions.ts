import { User } from "@prisma/client";
import { prisma } from "./prisma";

// Define the enums here since they need to be generated first
export enum UserRole {
  SYSTEM_ADMIN = "SYSTEM_ADMIN",
  DEVELOPER = "DEVELOPER",
  PROJECT_MANAGER = "PROJECT_MANAGER",
  HR = "HR",
  PROJECT_OWNER = "PROJECT_OWNER",
  LEGAL = "LEGAL",
  FINANCE = "FINANCE",
  DESIGNER = "DESIGNER",
  QA_TESTER = "QA_TESTER",
  BUSINESS_ANALYST = "BUSINESS_ANALYST",
  MARKETING = "MARKETING",
  SALES = "SALES",
  CUSTOMER_SUPPORT = "CUSTOMER_SUPPORT",
  DEVOPS = "DEVOPS",
  ARCHITECT = "ARCHITECT",
  TEAM_LEAD = "TEAM_LEAD",
}

export enum WorkspaceRole {
  OWNER = "OWNER",
  ADMIN = "ADMIN",
  MODERATOR = "MODERATOR",
  DEVELOPER = "DEVELOPER",
  PROJECT_MANAGER = "PROJECT_MANAGER",
  DESIGNER = "DESIGNER",
  QA_TESTER = "QA_TESTER",
  CONTENT_CREATOR = "CONTENT_CREATOR",
  ANALYST = "ANALYST",
  HR = "HR",
  MARKETING = "MARKETING",
  SALES = "SALES",
  CUSTOMER_SUPPORT = "CUSTOMER_SUPPORT",
  MEMBER = "MEMBER",
  VIEWER = "VIEWER",
  GUEST = "GUEST",
}

export enum Permission {
  CREATE_POST = "CREATE_POST",
  EDIT_SELF_POST = "EDIT_SELF_POST",
  EDIT_ANY_POST = "EDIT_ANY_POST",
  DELETE_SELF_POST = "DELETE_SELF_POST",
  DELETE_ANY_POST = "DELETE_ANY_POST",
  COMMENT_ON_POST = "COMMENT_ON_POST",
  EDIT_SELF_COMMENT = "EDIT_SELF_COMMENT",
  EDIT_ANY_COMMENT = "EDIT_ANY_COMMENT",
  DELETE_SELF_COMMENT = "DELETE_SELF_COMMENT",
  DELETE_ANY_COMMENT = "DELETE_ANY_COMMENT",
  REACT_TO_POST = "REACT_TO_POST",
  REACT_TO_COMMENT = "REACT_TO_COMMENT",
  MENTION_USERS = "MENTION_USERS",
  VIEW_POSTS = "VIEW_POSTS",
  BOOKMARK_POST = "BOOKMARK_POST",
  RESOLVE_BLOCKER = "RESOLVE_BLOCKER",
  CREATE_TASK = "CREATE_TASK",
  EDIT_SELF_TASK = "EDIT_SELF_TASK",
  EDIT_ANY_TASK = "EDIT_ANY_TASK",
  DELETE_SELF_TASK = "DELETE_SELF_TASK",
  DELETE_ANY_TASK = "DELETE_ANY_TASK",
  ASSIGN_TASK = "ASSIGN_TASK",
  CHANGE_TASK_STATUS = "CHANGE_TASK_STATUS",
  COMMENT_ON_TASK = "COMMENT_ON_TASK",
  VIEW_TASKS = "VIEW_TASKS",
  CREATE_BOARD = "CREATE_BOARD",
  EDIT_BOARD = "EDIT_BOARD",
  DELETE_BOARD = "DELETE_BOARD",
  MANAGE_BOARD_SETTINGS = "MANAGE_BOARD_SETTINGS",
  VIEW_BOARDS = "VIEW_BOARDS",
  CREATE_MILESTONE = "CREATE_MILESTONE",
  EDIT_SELF_MILESTONE = "EDIT_SELF_MILESTONE",
  EDIT_ANY_MILESTONE = "EDIT_ANY_MILESTONE",
  DELETE_SELF_MILESTONE = "DELETE_SELF_MILESTONE",
  DELETE_ANY_MILESTONE = "DELETE_ANY_MILESTONE",
  VIEW_MILESTONES = "VIEW_MILESTONES",
  CREATE_EPIC = "CREATE_EPIC",
  EDIT_SELF_EPIC = "EDIT_SELF_EPIC",
  EDIT_ANY_EPIC = "EDIT_ANY_EPIC",
  DELETE_SELF_EPIC = "DELETE_SELF_EPIC",
  DELETE_ANY_EPIC = "DELETE_ANY_EPIC",
  VIEW_EPICS = "VIEW_EPICS",
  CREATE_STORY = "CREATE_STORY",
  EDIT_SELF_STORY = "EDIT_SELF_STORY",
  EDIT_ANY_STORY = "EDIT_ANY_STORY",
  DELETE_SELF_STORY = "DELETE_SELF_STORY",
  DELETE_ANY_STORY = "DELETE_ANY_STORY",
  VIEW_STORIES = "VIEW_STORIES",
  CREATE_FEATURE_REQUEST = "CREATE_FEATURE_REQUEST",
  EDIT_SELF_FEATURE_REQUEST = "EDIT_SELF_FEATURE_REQUEST",
  EDIT_ANY_FEATURE_REQUEST = "EDIT_ANY_FEATURE_REQUEST",
  DELETE_SELF_FEATURE_REQUEST = "DELETE_SELF_FEATURE_REQUEST",
  DELETE_ANY_FEATURE_REQUEST = "DELETE_ANY_FEATURE_REQUEST",
  VOTE_ON_FEATURE = "VOTE_ON_FEATURE",
  COMMENT_ON_FEATURE = "COMMENT_ON_FEATURE",
  VIEW_FEATURES = "VIEW_FEATURES",
  SEND_MESSAGE = "SEND_MESSAGE",
  VIEW_MESSAGES = "VIEW_MESSAGES",
  DELETE_SELF_MESSAGE = "DELETE_SELF_MESSAGE",
  DELETE_ANY_MESSAGE = "DELETE_ANY_MESSAGE",
  CREATE_NOTE = "CREATE_NOTE",
  EDIT_SELF_NOTE = "EDIT_SELF_NOTE",
  EDIT_ANY_NOTE = "EDIT_ANY_NOTE",
  DELETE_SELF_NOTE = "DELETE_SELF_NOTE",
  DELETE_ANY_NOTE = "DELETE_ANY_NOTE",
  VIEW_NOTES = "VIEW_NOTES",
  MANAGE_WORKSPACE_SETTINGS = "MANAGE_WORKSPACE_SETTINGS",
  MANAGE_WORKSPACE_MEMBERS = "MANAGE_WORKSPACE_MEMBERS",
  MANAGE_WORKSPACE_PERMISSIONS = "MANAGE_WORKSPACE_PERMISSIONS",
  VIEW_WORKSPACE_ANALYTICS = "VIEW_WORKSPACE_ANALYTICS",
  INVITE_MEMBERS = "INVITE_MEMBERS",
  REMOVE_MEMBERS = "REMOVE_MEMBERS",
  CHANGE_MEMBER_ROLES = "CHANGE_MEMBER_ROLES",
  VIEW_MEMBER_LIST = "VIEW_MEMBER_LIST",
  MANAGE_INTEGRATIONS = "MANAGE_INTEGRATIONS",
  EXPORT_DATA = "EXPORT_DATA",
  IMPORT_DATA = "IMPORT_DATA",
  VIEW_AUDIT_LOGS = "VIEW_AUDIT_LOGS",
  MANAGE_NOTIFICATIONS = "MANAGE_NOTIFICATIONS",
  VIEW_REPORTS = "VIEW_REPORTS",
  PIN_POST = "PIN_POST",
  MANAGE_LEAVE = "MANAGE_LEAVE",
}

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
 * Check if a user has a specific permission in a workspace
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
          where: { workspaceId },
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

    // Check if user is a member of the workspace
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
          where: { workspaceId },
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

    // Check if user is a member of the workspace
    const membership = user.workspaceMemberships[0];
    if (!membership) {
      return [];
    }

    // Get all enabled permissions for the user's role
    const rolePermissions = await (prisma as any).rolePermission.findMany({
      where: {
        workspaceId,
        role: membership.role as string,
        enabled: true,
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
 */
export async function getUserWorkspaceRole(
  userId: string,
  workspaceId: string
): Promise<string | null> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        workspaceMemberships: {
          where: { workspaceId },
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

    // Member role
    const membership = user.workspaceMemberships[0];
    return membership?.role || null;
  } catch (error) {
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

/**
 * Get role display name
 */
export function getRoleDisplayName(role: WorkspaceRole): string {
  const roleNames: Record<WorkspaceRole, string> = {
    [WorkspaceRole.OWNER]: "Owner",
    [WorkspaceRole.ADMIN]: "Administrator",
    [WorkspaceRole.MODERATOR]: "Moderator",
    [WorkspaceRole.DEVELOPER]: "Developer",
    [WorkspaceRole.PROJECT_MANAGER]: "Project Manager",
    [WorkspaceRole.DESIGNER]: "Designer",
    [WorkspaceRole.QA_TESTER]: "QA Tester",
    [WorkspaceRole.CONTENT_CREATOR]: "Content Creator",
    [WorkspaceRole.ANALYST]: "Analyst",
    [WorkspaceRole.HR]: "Human Resources",
    [WorkspaceRole.MARKETING]: "Marketing",
    [WorkspaceRole.SALES]: "Sales",
    [WorkspaceRole.CUSTOMER_SUPPORT]: "Customer Support",
    [WorkspaceRole.MEMBER]: "Member",
    [WorkspaceRole.VIEWER]: "Viewer",
    [WorkspaceRole.GUEST]: "Guest",
  };

  return roleNames[role] || role;
}

/**
 * Get permission display name
 */
export function getPermissionDisplayName(permission: Permission): string {
  const permissionNames: Record<Permission, string> = {
    // Post permissions
    [Permission.CREATE_POST]: "Create Posts",
    [Permission.EDIT_SELF_POST]: "Edit Own Posts",
    [Permission.EDIT_ANY_POST]: "Edit Any Post",
    [Permission.DELETE_SELF_POST]: "Delete Own Posts",
    [Permission.DELETE_ANY_POST]: "Delete Any Post",
    [Permission.COMMENT_ON_POST]: "Comment on Posts",
    [Permission.EDIT_SELF_COMMENT]: "Edit Own Comments",
    [Permission.EDIT_ANY_COMMENT]: "Edit Any Comment",
    [Permission.DELETE_SELF_COMMENT]: "Delete Own Comments",
    [Permission.DELETE_ANY_COMMENT]: "Delete Any Comment",
    [Permission.REACT_TO_POST]: "React to Posts",
    [Permission.REACT_TO_COMMENT]: "React to Comments",
    [Permission.MENTION_USERS]: "Mention Users",
    [Permission.VIEW_POSTS]: "View Posts",
    [Permission.BOOKMARK_POST]: "Bookmark Posts",

    // Task permissions
    [Permission.CREATE_TASK]: "Create Tasks",
    [Permission.EDIT_SELF_TASK]: "Edit Own Tasks",
    [Permission.EDIT_ANY_TASK]: "Edit Any Task",
    [Permission.DELETE_SELF_TASK]: "Delete Own Tasks",
    [Permission.DELETE_ANY_TASK]: "Delete Any Task",
    [Permission.ASSIGN_TASK]: "Assign Tasks",
    [Permission.CHANGE_TASK_STATUS]: "Change Task Status",
    [Permission.COMMENT_ON_TASK]: "Comment on Tasks",
    [Permission.VIEW_TASKS]: "View Tasks",

    // Board permissions
    [Permission.CREATE_BOARD]: "Create Boards",
    [Permission.EDIT_BOARD]: "Edit Boards",
    [Permission.DELETE_BOARD]: "Delete Boards",
    [Permission.MANAGE_BOARD_SETTINGS]: "Manage Board Settings",
    [Permission.VIEW_BOARDS]: "View Boards",

    // Milestone permissions
    [Permission.CREATE_MILESTONE]: "Create Milestones",
    [Permission.EDIT_SELF_MILESTONE]: "Edit Own Milestones",
    [Permission.EDIT_ANY_MILESTONE]: "Edit Any Milestone",
    [Permission.DELETE_SELF_MILESTONE]: "Delete Own Milestones",
    [Permission.DELETE_ANY_MILESTONE]: "Delete Any Milestone",
    [Permission.VIEW_MILESTONES]: "View Milestones",

    // Epic permissions
    [Permission.CREATE_EPIC]: "Create Epics",
    [Permission.EDIT_SELF_EPIC]: "Edit Own Epics",
    [Permission.EDIT_ANY_EPIC]: "Edit Any Epic",
    [Permission.DELETE_SELF_EPIC]: "Delete Own Epics",
    [Permission.DELETE_ANY_EPIC]: "Delete Any Epic",
    [Permission.VIEW_EPICS]: "View Epics",

    // Story permissions
    [Permission.CREATE_STORY]: "Create Stories",
    [Permission.EDIT_SELF_STORY]: "Edit Own Stories",
    [Permission.EDIT_ANY_STORY]: "Edit Any Story",
    [Permission.DELETE_SELF_STORY]: "Delete Own Stories",
    [Permission.DELETE_ANY_STORY]: "Delete Any Story",
    [Permission.VIEW_STORIES]: "View Stories",

    // Feature request permissions
    [Permission.CREATE_FEATURE_REQUEST]: "Create Feature Requests",
    [Permission.EDIT_SELF_FEATURE_REQUEST]: "Edit Own Feature Requests",
    [Permission.EDIT_ANY_FEATURE_REQUEST]: "Edit Any Feature Request",
    [Permission.DELETE_SELF_FEATURE_REQUEST]: "Delete Own Feature Requests",
    [Permission.DELETE_ANY_FEATURE_REQUEST]: "Delete Any Feature Request",
    [Permission.VOTE_ON_FEATURE]: "Vote on Features",
    [Permission.COMMENT_ON_FEATURE]: "Comment on Features",
    [Permission.VIEW_FEATURES]: "View Features",

    // Message permissions
    [Permission.SEND_MESSAGE]: "Send Messages",
    [Permission.VIEW_MESSAGES]: "View Messages",
    [Permission.DELETE_SELF_MESSAGE]: "Delete Own Messages",
    [Permission.DELETE_ANY_MESSAGE]: "Delete Any Message",

    // Note permissions
    [Permission.CREATE_NOTE]: "Create Notes",
    [Permission.EDIT_SELF_NOTE]: "Edit Own Notes",
    [Permission.EDIT_ANY_NOTE]: "Edit Any Note",
    [Permission.DELETE_SELF_NOTE]: "Delete Own Notes",
    [Permission.DELETE_ANY_NOTE]: "Delete Any Note",
    [Permission.VIEW_NOTES]: "View Notes",

    // Workspace permissions
    [Permission.MANAGE_WORKSPACE_SETTINGS]: "Manage Workspace Settings",
    [Permission.MANAGE_WORKSPACE_MEMBERS]: "Manage Workspace Members",
    [Permission.MANAGE_WORKSPACE_PERMISSIONS]: "Manage Workspace Permissions",
    [Permission.VIEW_WORKSPACE_ANALYTICS]: "View Workspace Analytics",
    [Permission.INVITE_MEMBERS]: "Invite Members",
    [Permission.REMOVE_MEMBERS]: "Remove Members",
    [Permission.CHANGE_MEMBER_ROLES]: "Change Member Roles",
    [Permission.VIEW_MEMBER_LIST]: "View Member List",
    [Permission.MANAGE_INTEGRATIONS]: "Manage Integrations",
    [Permission.EXPORT_DATA]: "Export Data",
    [Permission.IMPORT_DATA]: "Import Data",
    [Permission.VIEW_AUDIT_LOGS]: "View Audit Logs",
    [Permission.MANAGE_NOTIFICATIONS]: "Manage Notifications",
    [Permission.VIEW_REPORTS]: "View Reports",
    [Permission.RESOLVE_BLOCKER]: "Resolve Blockers",
    [Permission.PIN_POST]: "Pin Posts",

    // Leave management permission
    [Permission.MANAGE_LEAVE]: "Manage Leave",
  };

  return permissionNames[permission] || permission.replace(/_/g, " ");
}
