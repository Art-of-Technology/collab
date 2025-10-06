/* eslint-disable */
"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, usePathname } from 'next/navigation';
import { useWorkspaces, type Workspace } from '@/hooks/queries/useWorkspace';

type WorkspaceContextType = {
  currentWorkspace: Workspace | null;
  workspaces: Workspace[];
  isLoading: boolean;
  error: string | null;
  switchWorkspace: (workspaceId: string) => void;
};

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

export const useWorkspace = () => {
  const context = useContext(WorkspaceContext);
  if (context === undefined) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
};

type WorkspaceProviderProps = {
  children: ReactNode;
};

export const WorkspaceProvider = ({ children }: WorkspaceProviderProps) => {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(null);
  
  // Use TanStack Query for workspace data
  const { 
    data: workspaces = [], 
    isLoading, 
    error: queryError 
  } = useWorkspaces();
  
  const error = queryError ? (queryError as Error).message : null;

  // Extract workspace ID from current URL
  const getWorkspaceIdFromUrl = useCallback((): string | null => {
    if (!pathname) return null;
    
    // Match pattern: /{workspaceId}/... 
    const match = pathname.match(/^\/([^\/]+)(?:\/.*)?$/);
    if (match && match[1]) {
      const potentialWorkspaceId = match[1];
      // Exclude known non-workspace routes
      const nonWorkspaceRoutes = ['welcome', 'workspaces', 'create-workspace', 'workspace-invitation', 'login', 'home', 'terms', 'privacy-policy'];
      if (!nonWorkspaceRoutes.includes(potentialWorkspaceId)) {
        return potentialWorkspaceId;
      }
    }
    return null;
  }, [pathname]);

  // Determine current workspace based on URL and available workspaces
  useEffect(() => {
    if (workspaces.length > 0) {
      const urlWorkspaceId = getWorkspaceIdFromUrl();
      let targetWorkspace: Workspace | null = null;
      
      if (urlWorkspaceId) {
        // Use workspace from URL if it exists and user has access (support both ID and slug)
        targetWorkspace = workspaces.find((w: Workspace) => w.id === urlWorkspaceId || w.slug === urlWorkspaceId) || null;
      }
      
      if (!targetWorkspace && workspaces.length > 0) {
        // Fallback to localStorage if URL doesn't specify workspace or workspace not found
        const savedWorkspaceId = localStorage.getItem('currentWorkspaceId');
        targetWorkspace = savedWorkspaceId 
          ? workspaces.find((w: Workspace) => w.id === savedWorkspaceId) || workspaces[0]
          : workspaces[0];
      }
      
      if (targetWorkspace && (!currentWorkspace || currentWorkspace.id !== targetWorkspace.id)) {
        setCurrentWorkspace(targetWorkspace);
        // Update localStorage for fallback purposes
        localStorage.setItem('currentWorkspaceId', targetWorkspace.id);
      }
    }
  }, [workspaces, getWorkspaceIdFromUrl, currentWorkspace]);

  // Clear workspace data when user logs out
  useEffect(() => {
    if (status === 'unauthenticated') {
      setCurrentWorkspace(null);
    }
  }, [status]);

  // Sync localStorage workspace ID to cookie on initial load
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedWorkspaceId = localStorage.getItem('currentWorkspaceId');
      if (savedWorkspaceId) {
        document.cookie = `currentWorkspaceId=${savedWorkspaceId}; path=/; max-age=31536000; SameSite=Lax`;
      }
    }
  }, []);

  const switchWorkspace = async (workspaceId: string) => {
    try {
      // First get workspace details to ensure we have all data including ownerId
      const response = await fetch(`/api/workspaces/${workspaceId}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch workspace details');
      }
      
      const workspaceDetails = await response.json();
      
      // Update context immediately for this tab
      setCurrentWorkspace(workspaceDetails);
      localStorage.setItem('currentWorkspaceId', workspaceDetails.id);
      
      // Also set a cookie for server components
      document.cookie = `currentWorkspaceId=${workspaceDetails.id}; path=/; max-age=31536000; SameSite=Lax`;
      
      // Navigate to the new workspace maintaining the current route
      // Extract the route part after the workspace ID (if any)
      const currentWorkspaceId = currentWorkspace?.id;
      let routePart = '/dashboard'; // Default route
      
      if (currentWorkspaceId && pathname) {
        // Check if current path follows workspace structure
        const workspacePattern = new RegExp(`^/${currentWorkspaceId}(/.*)?`);
        const match = pathname.match(workspacePattern);
        if (match && match[1]) {
          routePart = match[1];
        } else if (pathname.startsWith('/welcome') || pathname.startsWith('/workspaces') || pathname.startsWith('/create-workspace')) {
          // For non-workspace routes, go to dashboard
          routePart = '/dashboard';
        }
      }
      
      // Navigate to the new workspace with the preserved route (use slug if available)
      const workspaceSlugOrId = workspaceDetails.slug || workspaceDetails.id;
      router.push(`/${workspaceSlugOrId}${routePart}`);
    } catch (err) {
      console.error('Error switching workspace:', err);
      
      // Fallback to basic switching if detailed fetch fails
      const workspace = workspaces.find(w => w.id === workspaceId);
      if (workspace) {
        setCurrentWorkspace(workspace);
        localStorage.setItem('currentWorkspaceId', workspace.id);
        document.cookie = `currentWorkspaceId=${workspace.id}; path=/; max-age=31536000; SameSite=Lax`;
        
        // Use same navigation logic for fallback
        const currentWorkspaceId = currentWorkspace?.id;
        let routePart = '/dashboard';
        
        if (currentWorkspaceId && pathname) {
          const workspacePattern = new RegExp(`^/${currentWorkspaceId}(/.*)?`);
          const match = pathname.match(workspacePattern);
          if (match && match[1]) {
            routePart = match[1];
          }
        }
        
        // Use slug if available, fallback to ID
        const workspaceSlugOrId = workspace.slug || workspace.id;
        router.push(`/${workspaceSlugOrId}${routePart}`);
      }
    }
  };

  return (
    <WorkspaceContext.Provider
      value={{
        currentWorkspace,
        workspaces,
        isLoading,
        error,
        switchWorkspace,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}; 