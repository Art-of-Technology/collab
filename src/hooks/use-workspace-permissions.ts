import { useSession } from "next-auth/react";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useState, useEffect } from "react";

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
  const { data: session } = useSession();
  const { currentWorkspace, isLoading: workspaceLoading } = useWorkspace();
  const [workspaceMember, setWorkspaceMember] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkRole = async () => {
      if (!session?.user?.id || !currentWorkspace?.id || workspaceLoading) {
        return;
      }

      try {
        setIsLoading(true);
        // Fetch the member information to get the user's role in workspace
        const response = await fetch(`/api/workspaces/${currentWorkspace.id}/members/role`);
        
        if (response.ok) {
          const data = await response.json();
          setWorkspaceMember(data);
        }
      } catch (error) {
        console.error("Error checking workspace role:", error);
      } finally {
        setIsLoading(false);
      }
    };

    checkRole();
  }, [session?.user?.id, currentWorkspace?.id, workspaceLoading]);

  // Global admin, workspace owner, or workspace admin
  const isWorkspaceAdmin = 
    !isLoading && 
    (session?.user?.role === 'admin' || 
     workspaceMember?.role === 'admin' ||
     workspaceMember?.role === 'owner' ||
     currentWorkspace?.ownerId === session?.user?.id);

  // Workspace owner specifically
  const isWorkspaceOwner = 
    !isLoading && 
    (currentWorkspace?.ownerId === session?.user?.id || 
     workspaceMember?.role === 'owner');

  // Can manage boards and columns
  const canManageBoard = isWorkspaceAdmin || isWorkspaceOwner;

  return {
    isWorkspaceAdmin,
    isWorkspaceOwner,
    canManageBoard,
    isLoading: isLoading || workspaceLoading
  };
} 