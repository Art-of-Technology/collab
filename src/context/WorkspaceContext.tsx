"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

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
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchWorkspaces = async () => {
    if (status === 'loading' || !session?.user) {
      return;
    }

    try {
      setIsLoading(true);
      const response = await fetch('/api/workspaces');
      
      if (!response.ok) {
        throw new Error('Failed to fetch workspaces');
      }
      
      const data = await response.json();
      setWorkspaces(data);
      
      // If there's no current workspace selected, use the first one
      if (data.length > 0 && !currentWorkspace) {
        // Check for workspace in localStorage
        const savedWorkspaceId = localStorage.getItem('currentWorkspaceId');
        const savedWorkspace = savedWorkspaceId 
          ? data.find((w: { id: string; }) => w.id === savedWorkspaceId) 
          : null;
        
        setCurrentWorkspace(savedWorkspace || data[0]);
        if (savedWorkspace) {
          localStorage.setItem('currentWorkspaceId', savedWorkspace.id);
        } else if (data[0]) {
          localStorage.setItem('currentWorkspaceId', data[0].id);
        }
      }
    } catch (err) {
      console.error('Error fetching workspaces:', err);
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (session?.user) {
      fetchWorkspaces();
    } else if (status === 'unauthenticated') {
      setWorkspaces([]);
      setCurrentWorkspace(null);
      setIsLoading(false);
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
      setCurrentWorkspace(workspaceDetails);
      localStorage.setItem('currentWorkspaceId', workspaceDetails.id);
      
      // Also set a cookie for server components
      document.cookie = `currentWorkspaceId=${workspaceDetails.id}; path=/; max-age=31536000; SameSite=Lax`;
      
      // Refresh page data to show the new workspace content
      router.refresh();
    } catch (err) {
      console.error('Error switching workspace:', err);
      
      // Fallback to basic switching if detailed fetch fails
      const workspace = workspaces.find(w => w.id === workspaceId);
      if (workspace) {
        setCurrentWorkspace(workspace);
        localStorage.setItem('currentWorkspaceId', workspace.id);
        document.cookie = `currentWorkspaceId=${workspace.id}; path=/; max-age=31536000; SameSite=Lax`;
        router.refresh();
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