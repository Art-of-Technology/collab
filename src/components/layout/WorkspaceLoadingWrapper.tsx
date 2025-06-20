"use client";

import { useWorkspace } from "@/context/WorkspaceContext";
import { useSession } from "next-auth/react";
import { GlobalLoading } from "@/components/ui/global-loading";
import { usePathname } from "next/navigation";

interface WorkspaceLoadingWrapperProps {
  children: React.ReactNode;
}

export function WorkspaceLoadingWrapper({ children }: WorkspaceLoadingWrapperProps) {
  const { isLoading, currentWorkspace, workspaces } = useWorkspace();
  const { status } = useSession();
  const pathname = usePathname();

  // Don't show loading on certain pages
  const isAuthPage = pathname?.startsWith('/login') || pathname?.startsWith('/signup');
  const isWelcomePage = pathname === '/welcome';
  const isCreateWorkspacePage = pathname === '/create-workspace';
  const isWorkspacesListPage = pathname === '/workspaces';
  const isWorkspaceInvitationPage = pathname?.startsWith('/workspace-invitation');
  
  // Pages that should not show global loading
  const shouldSkipLoading = isAuthPage || isWelcomePage || isCreateWorkspacePage || isWorkspacesListPage || isWorkspaceInvitationPage;
  
  // Extract workspace ID from URL to see if we're on a workspace route
  const isWorkspaceRoute = pathname && /^\/[^\/]+\//.test(pathname);
  
  // Show global loading when:
  // 1. Session is still loading (initial app load)
  // 2. OR (User is authenticated AND workspace-related loading conditions)
  const shouldShowLoading = !shouldSkipLoading && (
    // Show loading during initial session load or when no session data yet
    status === 'loading' ||
    
    // Show loading when authenticated and workspace data is loading
    (status === 'authenticated' && (
      // Workspace context is actively loading
      isLoading ||
      
      // On workspace route but no workspace data yet (initial load)
      (isWorkspaceRoute && !currentWorkspace && workspaces.length === 0)
    ))
  );

  if (shouldShowLoading) {
    return <GlobalLoading />;
  }

  return <>{children}</>;
} 