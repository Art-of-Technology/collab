"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo, useRef } from 'react';
import { useWorkspace } from './WorkspaceContext';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';

export interface Board {
  id: string;
  name: string;
  description?: string | null;
  isDefault?: boolean;
  issuePrefix?: string | null;
  nextIssueNumber?: number;
  columns?: Column[];
}

export interface Column {
  id: string;
  name: string;
  order: number;
  color?: string | null;
  tasks?: Task[];
}

export interface Task {
  id: string;
  title: string;
  type: string;
  priority: string;
  status?: string | null;
  issueKey?: string | null;
  assignee?: {
    id: string;
    name: string | null;
    image: string | null;
  } | null;
  _count?: {
    comments: number;
    attachments: number;
  };
  milestone?: {
    id: string;
    title: string;
  };
  epic?: {
    id: string;
    title: string;
  };
  story?: {
    id: string;
    title: string;
  };
}

export type ViewMode = 'standard' | 'enhanced';

interface TasksContextType {
  boards: Board[];
  selectedBoard: Board | null;
  selectedBoardId: string;
  isLoading: boolean;
  view: 'kanban' | 'list' | 'hierarchy';
  setView: (view: 'kanban' | 'list' | 'hierarchy') => void;
  selectBoard: (boardId: string) => void;
  refreshBoards: () => Promise<void>;
  milestones: any[];
  epics: any[];
  stories: any[];
  refreshMilestones: () => Promise<void>;
  refreshEpics: () => Promise<void>;
  refreshStories: () => Promise<void>;
  refreshHierarchy: () => Promise<void>;
  isHierarchyLoading: boolean;
}

const TasksContext = createContext<TasksContextType | undefined>(undefined);

export const useTasks = () => {
  const context = useContext(TasksContext);
  if (context === undefined) {
    throw new Error('useTasks must be used within a TasksProvider');
  }
  return context;
};

interface TasksProviderProps {
  children: ReactNode;
  initialBoardId?: string;
  initialView?: 'kanban' | 'list' | 'hierarchy';
  initialViewMode?: ViewMode;
  initialBoards?: Board[];
  workspaceId?: string;
}

export const TasksProvider = ({ 
  children, 
  initialBoardId,
  initialView = 'kanban',
  initialViewMode = 'standard',
  initialBoards = [],
  workspaceId
}: TasksProviderProps) => {
  const { currentWorkspace } = useWorkspace();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isInitialLoad = useRef(true);
  
  // State management
  const [boards, setBoards] = useState<Board[]>(initialBoards);
  const [selectedBoardId, setSelectedBoardId] = useState<string>(initialBoardId || '');
  const [selectedBoard, setSelectedBoard] = useState<Board | null>(null);
  const [isLoading, setIsLoading] = useState(!initialBoards.length && !!workspaceId);
  const [view, setView] = useState<'kanban' | 'list' | 'hierarchy'>(initialView);
  const [isDetailLoading, setIsDetailLoading] = useState(false);

  // Hierarchy items state management
  const [milestones, setMilestones] = useState<any[]>([]);
  const [epics, setEpics] = useState<any[]>([]);
  const [stories, setStories] = useState<any[]>([]);
  const [isHierarchyLoading, setIsHierarchyLoading] = useState(false);

  // Memoized URL updater (Remove searchParams dependency)
  const updateUrlSearchParams = useCallback((paramsToUpdate: Record<string, string>) => {
    if (!pathname.includes('/tasks')) return;
    // Read current params *inside* the function
    const current = new URLSearchParams(window.location.search); 
    Object.entries(paramsToUpdate).forEach(([key, value]) => {
      current.set(key, value);
    });
    const search = current.toString();
    const query = search ? `?${search}` : '';
    // Use replace to avoid adding duplicate history entries
    router.replace(`${pathname}${query}`, { scroll: false }); 
  }, [pathname, router]); // Depends only on pathname and router

  // Effect to sync URL changes TO state (runs on mount and when searchParams change)
  useEffect(() => {
    const viewParam = searchParams.get('view');
    const boardParam = searchParams.get('board');

    if (viewParam && ['kanban', 'list', 'hierarchy'].includes(viewParam)) {
      const newView = viewParam as 'kanban' | 'list' | 'hierarchy';
      // Update state only if it differs from URL
      if (newView !== view) { 
          console.log("URL changed view to:", newView);
          setView(newView);
      }
    }
    
    if (boardParam && boardParam !== selectedBoardId) {
       console.log("URL changed board to:", boardParam);
       setSelectedBoardId(boardParam);
    }
    
    // Mark initial sync as done AFTER the first run
    if (isInitialLoad.current) {
        isInitialLoad.current = false;
    }
    
  // Remove 'view' and 'selectedBoardId' from dependencies to prevent loop
  }, [searchParams]); 

  // Effect to sync state changes TO URL (runs only when state changes *after* initial load)
  useEffect(() => {
    if (!isInitialLoad.current && pathname.includes('/tasks')) {
        const paramsToSet: Record<string, string> = { view };
        if (selectedBoardId) {
            paramsToSet.board = selectedBoardId;
        } else {
            // If boardId is cleared, remove it from URL too
            const current = new URLSearchParams(window.location.search);
            current.delete('board');
            const search = current.toString();
            const query = search ? `?${search}` : '';
            router.replace(`${pathname}${query}`, { scroll: false }); 
            return; // Skip updateUrlSearchParams as we manually updated
        }
      console.log("State change updating URL with:", paramsToSet);
      updateUrlSearchParams(paramsToSet);
    }
  }, [view, selectedBoardId, pathname, updateUrlSearchParams]); // Keep dependencies here
  
  // Fetch initial list of boards if not provided
  useEffect(() => {
    const wsId = workspaceId || currentWorkspace?.id;
    if (!wsId || initialBoards.length > 0) {
        // Only set loading false if it wasn't already false
        if(isLoading) setIsLoading(false); 
        return;
    } 

    let isMounted = true;
    const fetchInitialBoards = async () => {
      console.log("Fetching initial boards...");
      // Set loading true only if starting the fetch
      if(!isLoading) setIsLoading(true);
      try {
        const response = await fetch(`/api/workspaces/${wsId}/boards`);
        if (!isMounted) return;
        if (response.ok) {
          const data = await response.json();
          if (!isMounted) return;
          setBoards(data);
          if (!selectedBoardId && data.length > 0) {
             console.log("Setting default board (initial fetch):", data[0].id);
             setSelectedBoardId(data[0].id);
          }
        } else {
          console.error('Failed to fetch initial boards');
        }
      } catch (error) {
        console.error('Error fetching initial boards:', error);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    fetchInitialBoards();
    return () => { isMounted = false; };
  // Ensure selectedBoardId is NOT a dependency here to prevent re-running on default set
  }, [workspaceId, currentWorkspace?.id, initialBoards.length]); 

  // Fetch selected board details when selectedBoardId changes
  useEffect(() => {
    if (!selectedBoardId) {
        setSelectedBoard(null); 
        return; 
    }
    let isMounted = true;
    const fetchSelectedBoardDetails = async () => {
      console.log(`Fetching details for board: ${selectedBoardId}`);
      const existingBoardData = boards.find(b => b.id === selectedBoardId);
      // Only set detail loading if we don't have column data
      if (!existingBoardData?.columns) {
          if(!isDetailLoading) setIsDetailLoading(true); 
      } else {
          // Already have details, update state and ensure loading is false
          setSelectedBoard(existingBoardData);
          if(isDetailLoading) setIsDetailLoading(false);
          return; // Skip fetch
      }
      
      try {
        const response = await fetch(`/api/tasks/boards/${selectedBoardId}`); 
        if (!isMounted) return;
        if (response.ok) {
          const data = await response.json();
          setSelectedBoard(data);
        } else {
          console.error('Failed to fetch selected board details');
          setSelectedBoard(null);
        }
      } catch (error) {
        console.error('Error fetching selected board details:', error);
        setSelectedBoard(null);
      } finally {
        if (isMounted) setIsDetailLoading(false);
      }
    };
    fetchSelectedBoardDetails();
    return () => { isMounted = false; };
  }, [selectedBoardId, boards]); // Keep 'boards' dependency

  // Handlers should ONLY update state, let effects handle URL
  const selectBoard = useCallback((boardId: string) => {
    if (boardId !== selectedBoardId) {
        setSelectedBoardId(boardId);
    }
  }, [selectedBoardId]);

  const setViewWithUrlUpdate = useCallback((newView: 'kanban' | 'list' | 'hierarchy') => {
      if (newView !== view) {
        setView(newView);
      }
  }, [view]);

  // Refresh boards handler
  const refreshBoards = useCallback(async () => {
    const wsId = workspaceId || currentWorkspace?.id;
    if (!wsId) return;
    console.log("Refreshing boards for workspace:", wsId);
    try {
      setIsLoading(true);
      const response = await fetch(`/api/workspaces/${wsId}/boards`);
      if (response.ok) {
        const data = await response.json();
        setBoards(data);
        console.log("Refreshed boards:", data);
        // Re-verify selected board validity, but DON'T default here
        if (selectedBoardId && !data.some((board: Board) => board.id === selectedBoardId)) {
            console.log("Selected board no longer valid after refresh, clearing selection.");
            setSelectedBoardId(''); // Clear invalid board ID
            setSelectedBoard(null);
            // If boards exist, the default logic in the fetchInitialBoards effect might trigger
            // Or, perhaps better, redirect or show a message?
            // For now, just clearing it is simplest.
        } else if (selectedBoardId) {
            // If selected board is still valid, refetch its details
             const boardResponse = await fetch(`/api/tasks/boards/${selectedBoardId}`);
             if (boardResponse.ok) {
                 const boardData = await boardResponse.json();
                 setSelectedBoard(boardData);
             }
        }
      } else {
          console.error("Failed to refresh boards list");
      }
    } catch (error) {
      console.error('Error refreshing boards:', error);
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId, currentWorkspace?.id, selectedBoardId]);

  // Refresh functions for hierarchy items
  const refreshMilestones = useCallback(async () => {
    const wsId = workspaceId || (currentWorkspace ? currentWorkspace.id : null);
    if (!wsId) return;
    
    try {
      setIsHierarchyLoading(true);
      // Use selectedBoardId to limit milestones to the current board
      const boardParam = selectedBoardId ? `&boardId=${selectedBoardId}` : '';
      const response = await fetch(`/api/milestones?workspaceId=${wsId}${boardParam}&includeStats=true`);
      
      if (response.ok) {
        const data = await response.json();
        setMilestones(data);
      } else {
        console.error('Failed to fetch milestones');
      }
    } catch (error) {
      console.error('Error fetching milestones:', error);
    } finally {
      setIsHierarchyLoading(false);
    }
  }, [currentWorkspace, workspaceId, selectedBoardId]);

  const refreshEpics = useCallback(async () => {
    const wsId = workspaceId || (currentWorkspace ? currentWorkspace.id : null);
    if (!wsId) return;
    
    try {
      setIsHierarchyLoading(true);
      // Use selectedBoardId to limit epics to the current board
      const boardParam = selectedBoardId ? `&boardId=${selectedBoardId}` : '';
      const response = await fetch(`/api/epics?workspaceId=${wsId}${boardParam}&includeStats=true`);
      
      if (response.ok) {
        const data = await response.json();
        setEpics(data);
      } else {
        console.error('Failed to fetch epics');
      }
    } catch (error) {
      console.error('Error fetching epics:', error);
    } finally {
      setIsHierarchyLoading(false);
    }
  }, [currentWorkspace, workspaceId, selectedBoardId]);

  const refreshStories = useCallback(async () => {
    const wsId = workspaceId || (currentWorkspace ? currentWorkspace.id : null);
    if (!wsId) return;
    
    try {
      setIsHierarchyLoading(true);
      // Use selectedBoardId to limit stories to the current board
      const boardParam = selectedBoardId ? `&boardId=${selectedBoardId}` : '';
      const response = await fetch(`/api/stories?workspaceId=${wsId}${boardParam}&includeStats=true`);
      
      if (response.ok) {
        const data = await response.json();
        setStories(data);
      } else {
        console.error('Failed to fetch stories');
      }
    } catch (error) {
      console.error('Error fetching stories:', error);
    } finally {
      setIsHierarchyLoading(false);
    }
  }, [currentWorkspace, workspaceId, selectedBoardId]);

  // Combined refresh function for all hierarchy items
  const refreshHierarchy = useCallback(async () => {
    await Promise.all([
      refreshMilestones(),
      refreshEpics(),
      refreshStories()
    ]);
  }, [refreshMilestones, refreshEpics, refreshStories]);

  // Load hierarchy items when workspace changes
  useEffect(() => {
    const wsId = workspaceId || (currentWorkspace ? currentWorkspace.id : null);
    if (!wsId) return;
    
    refreshHierarchy();
  }, [workspaceId, currentWorkspace, selectedBoardId, refreshHierarchy]);

  // Combine loading states for context consumer
  const combinedIsLoading = isLoading || isDetailLoading;

  // Memoize context value to prevent unnecessary re-renders
  const contextValue = useMemo(() => ({
    boards,
    selectedBoard,
    selectedBoardId,
    isLoading: combinedIsLoading,
    view,
    setView: setViewWithUrlUpdate,
    selectBoard,
    refreshBoards,
    milestones,
    epics,
    stories,
    refreshMilestones,
    refreshEpics,
    refreshStories,
    refreshHierarchy,
    isHierarchyLoading
  }), [
    boards,
    selectedBoard,
    selectedBoardId,
    isLoading,
    view,
    setViewWithUrlUpdate,
    selectBoard,
    refreshBoards,
    milestones,
    epics,
    stories,
    refreshMilestones,
    refreshEpics,
    refreshStories,
    refreshHierarchy,
    isHierarchyLoading
  ]);

  return (
    <TasksContext.Provider value={contextValue}>
      {children}
    </TasksContext.Provider>
  );
}; 