import { useWorkspace } from "@/context/WorkspaceContext";
import { usePermissions } from "@/hooks/use-permissions";
import { useCurrentUser } from "@/hooks/queries/useUser";
import { Permission } from "@/lib/permissions";

type WorkspacePermissions = {
  isWorkspaceAdmin: boolean;
  isWorkspaceOwner: boolean;
  canManageBoard: boolean;
  isLoading: boolean;
};

/**
 * Hook to check workspace permissions for the current user
 * 
 * @returns Workspace permission status for the current user
 */
export function useWorkspacePermissions(): WorkspacePermissions {
  const { currentWorkspace, isLoading: workspaceLoading } = useWorkspace();
  const { data: currentUser } = useCurrentUser();
  const { checkPermission, isSystemAdmin } = usePermissions(currentWorkspace?.id);

  const isLoading = workspaceLoading || !currentUser;

  // Check if user is workspace admin (has admin permissions or is system admin)
  const isWorkspaceAdmin =
    !isLoading &&
    (isSystemAdmin() ||
      checkPermission(Permission.MANAGE_WORKSPACE_SETTINGS).hasPermission ||
      checkPermission(Permission.MANAGE_WORKSPACE_MEMBERS).hasPermission ||
      checkPermission(Permission.MANAGE_WORKSPACE_PERMISSIONS).hasPermission ||
      currentWorkspace?.ownerId === currentUser?.id);

  // Check if user is workspace owner specifically
  const isWorkspaceOwner =
    !isLoading &&
    (currentWorkspace?.ownerId === currentUser?.id);

  // Check if user can manage boards and columns
  const canManageBoard =
    !isLoading &&
    (isWorkspaceAdmin ||
      isWorkspaceOwner ||
      checkPermission(Permission.MANAGE_BOARD_SETTINGS).hasPermission);

  return {
    isWorkspaceAdmin,
    isWorkspaceOwner,
    canManageBoard,
    isLoading
  };
} 