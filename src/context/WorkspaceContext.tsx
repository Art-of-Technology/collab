/* eslint-disable */
"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, usePathname } from 'next/navigation';

type Workspace = {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string | null;
  ownerId?: string;
};

type WorkspaceContextType = {
  currentWorkspace: Workspace | null;
  workspaces: Workspace[];
  isLoading: boolean;
  error: string | null;
  switchWorkspace: (workspaceId: string) => void;
  refreshWorkspaces: () => Promise<void>;
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
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasInitiallyFetched, setHasInitiallyFetched] = useState(false);

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

  const fetchWorkspaces = useCallback(async () => {
    if (status === 'loading' || !session?.user) {
      return;
    }

    try {
      setIsLoading(true);
      setHasInitiallyFetched(true);
      const response = await fetch('/api/workspaces');
      
      if (!response.ok) {
        throw new Error('Failed to fetch workspaces');
      }
      
      const data = await response.json();
      setWorkspaces(data);
      
      // Determine which workspace should be current based on URL first, then localStorage
      const urlWorkspaceId = getWorkspaceIdFromUrl();
      let targetWorkspace: Workspace | null = null;
      
      if (urlWorkspaceId) {
        // Use workspace from URL if it exists and user has access
        targetWorkspace = data.find((w: Workspace) => w.id === urlWorkspaceId) || null;
      }
      
      if (!targetWorkspace && data.length > 0) {
        // Fallback to localStorage if URL doesn't specify workspace or workspace not found
        const savedWorkspaceId = localStorage.getItem('currentWorkspaceId');
        targetWorkspace = savedWorkspaceId 
          ? data.find((w: Workspace) => w.id === savedWorkspaceId) || data[0]
          : data[0];
      }
      
      if (targetWorkspace) {
        setCurrentWorkspace(targetWorkspace);
        // Update localStorage for fallback purposes, but don't rely on it for current tab
        localStorage.setItem('currentWorkspaceId', targetWorkspace.id);
      }
    } catch (err) {
      console.error('Error fetching workspaces:', err);
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [session, status, getWorkspaceIdFromUrl]);

  // Update current workspace when URL changes
  useEffect(() => {
    if (workspaces.length > 0) {
      const urlWorkspaceId = getWorkspaceIdFromUrl();
      
      if (urlWorkspaceId) {
        const urlWorkspace = workspaces.find(w => w.id === urlWorkspaceId);
        if (urlWorkspace && (!currentWorkspace || currentWorkspace.id !== urlWorkspaceId)) {
          setCurrentWorkspace(urlWorkspace);
          // Update localStorage for fallback purposes
          localStorage.setItem('currentWorkspaceId', urlWorkspace.id);
        }
      } else if (currentWorkspace) {
        // If not on a workspace route, keep current workspace but don't force it
        // This allows non-workspace pages to still have access to workspace context
      }
    }
  }, [pathname, workspaces, currentWorkspace, getWorkspaceIdFromUrl]);

  useEffect(() => {
    if (session?.user && !hasInitiallyFetched) {
      // Only fetch workspaces if we haven't fetched them yet
      fetchWorkspaces();
    } else if (status === 'unauthenticated') {
      setWorkspaces([]);
      setCurrentWorkspace(null);
      setIsLoading(false);
      setHasInitiallyFetched(false);
    }
  }, [session, status]);

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
      
      // Navigate to the new workspace with the preserved route
      router.push(`/${workspaceDetails.id}${routePart}`);
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
        
        router.push(`/${workspace.id}${routePart}`);
      }
    }
  };

  const refreshWorkspaces = async () => {
    await fetchWorkspaces();
  };

  return (
    <WorkspaceContext.Provider
      value={{
        currentWorkspace,
        workspaces,
        isLoading,
        error,
        switchWorkspace,
        refreshWorkspaces
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}; 