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
  initialBoards?: Board[];
  workspaceId?: string;
}

export const TasksProvider = ({
  children,
  initialBoardId,
  initialView = 'kanban',
  initialBoards = [],
  workspaceId
}: TasksProviderProps) => {
  const { currentWorkspace } = useWorkspace();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isInitialLoad = useRef(true);
  const lastWorkspaceIdRef = useRef<string | undefined | null>(null);
  const currentFetchController = useRef<AbortController | null>(null);
  const workspaceChangeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hierarchyRefreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastHierarchyRefreshKey = useRef<string>('');

  // State management
  const [boards, setBoards] = useState<Board[]>(initialBoards);
  const [urlSelectedBoardId, setUrlSelectedBoardId] = useState(initialBoardId || '');
  const [selectedBoardId, setSelectedBoardId] = useState<string>(initialBoardId || '');
  const [selectedBoard, setSelectedBoard] = useState<Board | null>(null);
  const [isBoardsLoading, setIsBoardsLoading] = useState(!initialBoards.length && !!(workspaceId || currentWorkspace?.id));
  const [isBoardDetailsLoading, setIsBoardDetailsLoading] = useState(false);
  const [view, setView] = useState<'kanban' | 'list' | 'hierarchy'>(initialView);

  // Hierarchy items state management
  const [milestones, setMilestones] = useState<any[]>([]);
  const [epics, setEpics] = useState<any[]>([]);
  const [stories, setStories] = useState<any[]>([]);
  const [isHierarchyLoading, setIsHierarchyLoading] = useState(false);

  // Use WorkspaceContext as single source of truth for workspace ID
  const activeWorkspaceId = useMemo(() => {
    return currentWorkspace?.id || workspaceId;
  }, [currentWorkspace?.id, workspaceId]);

  // URL Synchronization
  useEffect(() => {
    const viewParam = searchParams.get('view') as 'kanban' | 'list' | 'hierarchy' | null;
    const boardParam = searchParams.get('board');

    if (viewParam && ['kanban', 'list', 'hierarchy'].includes(viewParam) && viewParam !== view) {
      setView(viewParam);
    }

    const newUrlBoardId = boardParam || '';
    if (newUrlBoardId !== urlSelectedBoardId) {
      setUrlSelectedBoardId(newUrlBoardId);
    }

    isInitialLoad.current = false;
  }, [searchParams, view, urlSelectedBoardId]);

  // Board Fetching and Selection Logic
  const determineBoardSelection = useCallback((fetchedBoards: Board[], currentSelectedId: string): string => {
    if (!fetchedBoards || fetchedBoards.length === 0) {
      return '';
    }

    const currentSelectionValid = fetchedBoards.some(board => board.id === currentSelectedId);
    if (currentSelectionValid) {
      return currentSelectedId;
    }

    const firstBoardId = fetchedBoards[0].id;
    return firstBoardId;
  }, []);

  const fetchBoardsList = useCallback(async (wsId: string) => {
    // Cancel previous fetch if it exists
    if (currentFetchController.current) {
      currentFetchController.current.abort();
    }
    
    // Create new AbortController for this request
    const controller = new AbortController();
    currentFetchController.current = controller;
    
    // Prevent race conditions by checking if workspace is still the same when request completes
    const requestWorkspaceId = wsId;
    
    setIsBoardsLoading(true);
    setBoards([]);
    setSelectedBoard(null);
    let newBoards: Board[] = [];
    try {
      const response = await fetch(`/api/workspaces/${wsId}/boards`, {
        signal: controller.signal
      });
      
      // Check if workspace changed while we were fetching
      if (activeWorkspaceId !== requestWorkspaceId) {
        return;
      }
      
      if (!response.ok) {
        throw new Error(`Failed to fetch boards: ${response.statusText}`);
      }
      newBoards = await response.json();
      
      // Double-check workspace hasn't changed
      if (activeWorkspaceId !== requestWorkspaceId) {
        return;
      }
      setBoards(newBoards);
      const targetBoardId = determineBoardSelection(newBoards, urlSelectedBoardId || selectedBoardId);
      setSelectedBoardId(targetBoardId);

    } catch (error) {
      // Don't log errors for aborted requests
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }
      // Only clear if we're still on the same workspace
      if (activeWorkspaceId === requestWorkspaceId) {
        setBoards([]);
        setSelectedBoardId('');
      }
    } finally {
      // Only update loading state if we're still on the same workspace and this is the current controller
      if (activeWorkspaceId === requestWorkspaceId && currentFetchController.current === controller) {
        setIsBoardsLoading(false);
      }
    }
  }, [determineBoardSelection, urlSelectedBoardId, selectedBoardId, activeWorkspaceId]);

  useEffect(() => {
    const currentWsId = activeWorkspaceId;
    
    // Clear any existing timeout
    if (workspaceChangeTimeoutRef.current) {
      clearTimeout(workspaceChangeTimeoutRef.current);
    }
    
    // Debounce rapid workspace changes  
    workspaceChangeTimeoutRef.current = setTimeout(() => {
      let isMounted = true; // Prevent state updates after unmount

      const performInitialLoadOrWorkspaceChange = async () => {
        // Double-check that the workspace ID is still the same after debounce
        if (currentWsId !== activeWorkspaceId) {
          return;
        }

        if (!currentWsId) {
          // Handle case where workspace becomes null/undefined
          if (lastWorkspaceIdRef.current !== null) { // Only clear if it wasn't already null
            if (isMounted) {
              setBoards([]);
              setSelectedBoard(null);
              setSelectedBoardId('');
              setMilestones([]);
              setEpics([]);
              setStories([]);
              if (isBoardsLoading) setIsBoardsLoading(false);
              if (isBoardDetailsLoading) setIsBoardDetailsLoading(false);
            }
            lastWorkspaceIdRef.current = null;
          }
          return;
        }

        // Proceed if workspace ID is valid
        const isWorkspaceChange = currentWsId !== lastWorkspaceIdRef.current;

        if (isInitialLoad.current || isWorkspaceChange) {
          if (isWorkspaceChange) {
            if (isMounted) {
              // Clear all workspace-specific data immediately
              setBoards([]);
              setSelectedBoard(null);
              setSelectedBoardId('');
              setUrlSelectedBoardId('');
              setMilestones([]);
              setEpics([]);
              setStories([]);
              setIsBoardsLoading(true); // Reset loading for new workspace fetch
            }
          }

          lastWorkspaceIdRef.current = currentWsId;
          await fetchBoardsList(currentWsId); // Wait for the fetch to complete

        }
      };

      performInitialLoadOrWorkspaceChange();

      return () => {
        isMounted = false;
      };
    }, 150); // Increased to 150ms debounce to better handle rapid changes
    
    return () => {
      if (workspaceChangeTimeoutRef.current) {
        clearTimeout(workspaceChangeTimeoutRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspaceId, fetchBoardsList]);

  useEffect(() => {
    if (!selectedBoardId) {
      setSelectedBoard(null);
      if (isBoardDetailsLoading) setIsBoardDetailsLoading(false);
      return;
    }

    const existingBoardData = boards.find(b => b.id === selectedBoardId && b.columns);
    if (existingBoardData) {
      setSelectedBoard(existingBoardData);
      if (isBoardDetailsLoading) setIsBoardDetailsLoading(false);
      return;
    }

    let isMounted = true;
    const fetchSelectedBoardDetails = async () => {
      setIsBoardDetailsLoading(true);
      try {
        const response = await fetch(`/api/tasks/boards/${selectedBoardId}`);
        if (!isMounted) return;
        if (response.ok) {
          const data = await response.json();
          setSelectedBoard(data);
        } else {
          console.error('Failed to fetch selected board details, status:', response.status);
          setSelectedBoard(null);
        }
      } catch (error) {
        console.error('Error fetching selected board details:', error);
        setSelectedBoard(null);
      } finally {
        if (isMounted) setIsBoardDetailsLoading(false);
      }
    };

    fetchSelectedBoardDetails();

    return () => { isMounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBoardId, boards]);

  // Handlers
  const selectBoard = useCallback((boardId: string) => {
    if (boardId !== selectedBoardId) {
      setSelectedBoardId(boardId);
      setUrlSelectedBoardId(boardId);

      // Update the URL with the new board ID while preserving the current view
      const params = new URLSearchParams(window.location.search);
      params.set('board', boardId);

      // Keep the current view
      if (view && !params.has('view')) {
        params.set('view', view);
      }

      // Update the URL
      const url = `${pathname}?${params.toString()}`;
      router.replace(url, { scroll: false });
    }
  }, [selectedBoardId, view, pathname, router]);

  const setViewWithUrlUpdate = useCallback((newView: 'kanban' | 'list' | 'hierarchy') => {
    if (newView !== view) {
      setView(newView);
    }
  }, [view]);

  // Hierarchy Item Fetching
  const refreshMilestones = useCallback(async () => {
    if (!activeWorkspaceId) return;
    setIsHierarchyLoading(true);
    try {
      const boardParam = selectedBoardId ? `&boardId=${selectedBoardId}` : '';
      const response = await fetch(`/api/milestones?workspaceId=${activeWorkspaceId}${boardParam}&includeStats=true`);
      if (response.ok) setMilestones(await response.json());
      else console.error('Failed to fetch milestones');
    } catch (error) { console.error('Error fetching milestones:', error); }
    finally { setIsHierarchyLoading(false); }
  }, [activeWorkspaceId, selectedBoardId]);

  const refreshEpics = useCallback(async () => {
    if (!activeWorkspaceId) return;
    setIsHierarchyLoading(true);
    try {
      const boardParam = selectedBoardId ? `&boardId=${selectedBoardId}` : '';
      const response = await fetch(`/api/epics?workspaceId=${activeWorkspaceId}${boardParam}&includeStats=true`);
      if (response.ok) setEpics(await response.json());
      else console.error('Failed to fetch epics');
    } catch (error) { console.error('Error fetching epics:', error); }
    finally { setIsHierarchyLoading(false); }
  }, [activeWorkspaceId, selectedBoardId]);

  const refreshStories = useCallback(async () => {
    if (!activeWorkspaceId) return;
    setIsHierarchyLoading(true);
    try {
      const boardParam = selectedBoardId ? `&boardId=${selectedBoardId}` : '';
      const response = await fetch(`/api/stories?workspaceId=${activeWorkspaceId}${boardParam}&includeStats=true`);
      if (response.ok) setStories(await response.json());
      else console.error('Failed to fetch stories');
    } catch (error) { console.error('Error fetching stories:', error); }
    finally { setIsHierarchyLoading(false); }
  }, [activeWorkspaceId, selectedBoardId]);

  const refreshHierarchy = useCallback(async () => {
    setIsHierarchyLoading(true);
    await Promise.all([
      refreshMilestones(),
      refreshEpics(),
      refreshStories()
    ]);
    setIsHierarchyLoading(false);
  }, [refreshMilestones, refreshEpics, refreshStories]);

  useEffect(() => {
    // Clear any existing timeout
    if (hierarchyRefreshTimeoutRef.current) {
      clearTimeout(hierarchyRefreshTimeoutRef.current);
    }
    
    // Create a unique key for this workspace/board combination
    const refreshKey = `${activeWorkspaceId || 'null'}-${selectedBoardId || 'none'}`;
    
    // Skip if this is the same combination we just refreshed
    if (refreshKey === lastHierarchyRefreshKey.current) {
      return;
    }
    
    if (activeWorkspaceId) {
      // Debounce hierarchy refresh to prevent multiple rapid calls
      hierarchyRefreshTimeoutRef.current = setTimeout(() => {
        lastHierarchyRefreshKey.current = refreshKey;
        refreshHierarchy();
      }, 200); // 200ms debounce for hierarchy refresh
    } else {
      // Clear immediately if no workspace
      setMilestones([]);
      setEpics([]);
      setStories([]);
      lastHierarchyRefreshKey.current = refreshKey;
    }
    
    return () => {
      if (hierarchyRefreshTimeoutRef.current) {
        clearTimeout(hierarchyRefreshTimeoutRef.current);
      }
    };
  }, [activeWorkspaceId, selectedBoardId, refreshHierarchy]);

  // Manual refresh boards (e.g., button click)
  const refreshBoards = useCallback(async () => {
    const wsId = activeWorkspaceId;
    if (wsId) {
      // Re-fetch the list. fetchBoardsList will handle selection logic.
      await fetchBoardsList(wsId);
    } else {
      console.warn("Cannot refresh boards, no active workspace ID.");
    }
  }, [activeWorkspaceId, fetchBoardsList]);
  // Combine loading states
  const isLoading = isBoardsLoading || isBoardDetailsLoading;

  const contextValue = useMemo(() => ({
    boards,
    selectedBoard,
    selectedBoardId,
    isLoading,
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
    boards, selectedBoard, selectedBoardId, isLoading, view,
    setViewWithUrlUpdate, selectBoard, refreshBoards,
    milestones, epics, stories, refreshMilestones, refreshEpics,
    refreshStories, refreshHierarchy, isHierarchyLoading
  ]);


  return (
    <TasksContext.Provider value={contextValue}>
      {children}
    </TasksContext.Provider>
  );
}; 