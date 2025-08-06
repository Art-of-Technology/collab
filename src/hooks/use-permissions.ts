import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { Permission, WorkspaceRole } from "@/lib/permissions";

interface PermissionCheckResult {
  hasPermission: boolean;
  userRole?: WorkspaceRole;
  loading: boolean;
  error?: string;
}

interface UserPermissions {
  permissions: Permission[];
  role: WorkspaceRole;
}

export function usePermissions(workspaceId?: string) {
  const { data: session } = useSession();

  const {
    data: userPermissions,
    isLoading,
    error,
  } = useQuery<UserPermissions>({
    queryKey: ["permissions", session?.user?.id, workspaceId],
    queryFn: async () => {
      if (!session?.user?.id || !workspaceId) {
        throw new Error("User or workspace not found");
      }

      const response = await fetch(
        `/api/workspaces/${workspaceId}/permissions?userId=${session.user.id}`
      );

      if (!response.ok) {
        throw new Error("Failed to fetch permissions");
      }

      return response.json();
    },
    enabled: !!session?.user?.id && !!workspaceId,
  });

  const checkPermission = (permission: Permission): PermissionCheckResult => {
    if (isLoading) {
      return { hasPermission: false, loading: true };
    }

    if (error || !userPermissions) {
      return {
        hasPermission: false,
        loading: false,
        error: error?.message || "Failed to load permissions",
      };
    }

    return {
      hasPermission: userPermissions.permissions.includes(permission),
      userRole: userPermissions.role,
      loading: false,
    };
  };

  const hasAnyPermission = (
    permissions: Permission[]
  ): PermissionCheckResult => {
    if (isLoading) {
      return { hasPermission: false, loading: true };
    }

    if (error || !userPermissions) {
      return {
        hasPermission: false,
        loading: false,
        error: error?.message || "Failed to load permissions",
      };
    }

    const hasAny = permissions.some((permission) =>
      userPermissions.permissions.includes(permission)
    );

    return {
      hasPermission: hasAny,
      userRole: userPermissions.role,
      loading: false,
    };
  };

  const hasAllPermissions = (
    permissions: Permission[]
  ): PermissionCheckResult => {
    if (isLoading) {
      return { hasPermission: false, loading: true };
    }

    if (error || !userPermissions) {
      return {
        hasPermission: false,
        loading: false,
        error: error?.message || "Failed to load permissions",
      };
    }

    const hasAll = permissions.every((permission) =>
      userPermissions.permissions.includes(permission)
    );

    return {
      hasPermission: hasAll,
      userRole: userPermissions.role,
      loading: false,
    };
  };

  const isAdmin = (): PermissionCheckResult => {
    if (isLoading) {
      return { hasPermission: false, loading: true };
    }

    if (error || !userPermissions) {
      return {
        hasPermission: false,
        loading: false,
        error: error?.message || "Failed to load permissions",
      };
    }

    const isAdminRole = ["OWNER", "ADMIN"].includes(userPermissions.role);

    return {
      hasPermission: isAdminRole,
      userRole: userPermissions.role,
      loading: false,
    };
  };

  const isSystemAdmin = (): boolean => {
    return session?.user?.role === "SYSTEM_ADMIN";
  };

  return {
    userPermissions,
    checkPermission,
    hasAnyPermission,
    hasAllPermissions,
    isAdmin,
    isSystemAdmin,
    loading: isLoading,
    error,
  };
}

// Convenience hooks for common permission checks
export function useCanManagePosts(workspaceId?: string) {
  const { hasAnyPermission } = usePermissions(workspaceId);
  return hasAnyPermission([
    Permission.EDIT_ANY_POST,
    Permission.DELETE_ANY_POST,
  ]);
}

export function useCanManageTasks(workspaceId?: string) {
  const { hasAnyPermission } = usePermissions(workspaceId);
  return hasAnyPermission([
    Permission.EDIT_ANY_TASK,
    Permission.DELETE_ANY_TASK,
    Permission.ASSIGN_TASK,
  ]);
}

export function useCanManageWorkspace(workspaceId?: string) {
  const { hasAnyPermission } = usePermissions(workspaceId);
  return hasAnyPermission([
    Permission.MANAGE_WORKSPACE_SETTINGS,
    Permission.CHANGE_MEMBER_ROLES,
  ]);
}

export function useCanManageWorkspacePermissions(workspaceId?: string) {
  const { checkPermission } = usePermissions(workspaceId);
  return checkPermission(Permission.MANAGE_WORKSPACE_PERMISSIONS);
}

export function useCanInviteMembers(workspaceId?: string) {
  const { checkPermission } = usePermissions(workspaceId);
  return checkPermission(Permission.INVITE_MEMBERS);
}

export function useCanEditFeatureRequests(workspaceId?: string) {
  const { hasAnyPermission } = usePermissions(workspaceId);
  return hasAnyPermission([
    Permission.EDIT_ANY_FEATURE_REQUEST,
    Permission.DELETE_ANY_FEATURE_REQUEST,
  ]);
}

export function useCanCreateBoard(workspaceId?: string) {
  const { checkPermission } = usePermissions(workspaceId);
  return checkPermission(Permission.CREATE_BOARD);
}

export function useCanManageLeave(workspaceId?: string) {
  const { checkPermission } = usePermissions(workspaceId);
  return checkPermission(Permission.MANAGE_LEAVE);
}
