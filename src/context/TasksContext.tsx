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

  const activeWorkspaceId = useMemo(() => workspaceId || currentWorkspace?.id, [workspaceId, currentWorkspace?.id]);

  // URL Synchronization
  useEffect(() => {
    const viewParam = searchParams.get('view') as 'kanban' | 'list' | 'hierarchy' | null;
    const boardParam = searchParams.get('board');

    if (viewParam && ['kanban', 'list', 'hierarchy'].includes(viewParam) && viewParam !== view) {
      console.log("URL change -> Setting view state:", viewParam);
      setView(viewParam);
    }

    const newUrlBoardId = boardParam || '';
    if (newUrlBoardId !== urlSelectedBoardId) {
        console.log("URL change -> Updating URL board ID tracker:", newUrlBoardId);
        setUrlSelectedBoardId(newUrlBoardId);
    }

    isInitialLoad.current = false;
  }, [searchParams, view, urlSelectedBoardId]);

  const updateUrlFromState = useCallback(() => {
    if (isInitialLoad.current || !pathname.includes('/tasks')) return;

    const current = new URLSearchParams(window.location.search);
    let changed = false;

    if (current.get('view') !== view) {
      current.set('view', view);
      changed = true;
    }

    if (selectedBoardId) {
      if (current.get('board') !== selectedBoardId) {
        current.set('board', selectedBoardId);
        changed = true;
      }
    } else {
      if (current.has('board')) {
        current.delete('board');
        changed = true;
      }
    }

    if (changed) {
      const search = current.toString();
      const query = search ? `?${search}` : '';
      console.log("State change -> Updating URL:", query);
      router.replace(`${pathname}${query}`, { scroll: false });
    }
  }, [view, selectedBoardId, pathname, router]);

  useEffect(() => {
    updateUrlFromState();
  }, [view, selectedBoardId, updateUrlFromState]);

  // Board Fetching and Selection Logic
  const determineBoardSelection = useCallback((fetchedBoards: Board[], currentSelectedId: string): string => {
    if (!fetchedBoards || fetchedBoards.length === 0) {
      console.log("Determine Selection: No boards fetched, clearing selection.");
      return '';
    }

    const currentSelectionValid = fetchedBoards.some(board => board.id === currentSelectedId);
    if (currentSelectionValid) {
      console.log("Determine Selection: Current ID valid:", currentSelectedId);
      return currentSelectedId;
    }

    const firstBoardId = fetchedBoards[0].id;
    console.log("Determine Selection: Current ID invalid or missing, defaulting to first board:", firstBoardId);
    return firstBoardId;
  }, []);

  const fetchBoardsList = useCallback(async (wsId: string) => {
    console.log("Fetching boards for workspace:", wsId);
    setIsBoardsLoading(true);
    setBoards([]);
    setSelectedBoard(null);
    let newBoards: Board[] = [];
    try {
      const response = await fetch(`/api/workspaces/${wsId}/boards`);
      if (!response.ok) {
        throw new Error(`Failed to fetch boards: ${response.statusText}`);
      }
      newBoards = await response.json();
      console.log("Fetched boards data:", newBoards);
      setBoards(newBoards);

      const targetBoardId = determineBoardSelection(newBoards, urlSelectedBoardId || selectedBoardId);

      console.log("Setting selected board ID after fetch/determine:", targetBoardId);
      setSelectedBoardId(targetBoardId);

    } catch (error) {
      console.error('Error fetching boards list:', error);
      setBoards([]);
      setSelectedBoardId('');
    } finally {
      setIsBoardsLoading(false);
    }
  }, [determineBoardSelection, urlSelectedBoardId, selectedBoardId]);

  useEffect(() => {
    const currentWsId = activeWorkspaceId;
    let isMounted = true; // Prevent state updates after unmount

    const performInitialLoadOrWorkspaceChange = async () => {
      if (!currentWsId) {
        // Handle case where workspace becomes null/undefined
        if (lastWorkspaceIdRef.current !== null) { // Only clear if it wasn't already null
          console.log("No active workspace, clearing context state.");
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
         // Mark initial load done even if no workspace initially
        if (isInitialLoad.current && isMounted) {
          isInitialLoad.current = false;
          // Use rAF to defer URL update slightly after state updates
          requestAnimationFrame(updateUrlFromState);
        }
        return;
      }

      // Proceed if workspace ID is valid
      const isWorkspaceChange = currentWsId !== lastWorkspaceIdRef.current;

      if (isInitialLoad.current || isWorkspaceChange) {
        if (isWorkspaceChange) {
          console.log(`Workspace changed: ${lastWorkspaceIdRef.current} -> ${currentWsId}. Triggering refresh.`);
          if (isMounted) {
            setMilestones([]);
            setEpics([]);
            setStories([]);
            setIsBoardsLoading(true); // Reset loading for new workspace fetch
          }
        } else {
          console.log("Initial load for workspace:", currentWsId);
        }

        lastWorkspaceIdRef.current = currentWsId;
        await fetchBoardsList(currentWsId); // Wait for the fetch to complete

        // Mark initial load complete *after* the first fetch attempt
        if (isInitialLoad.current && isMounted) {
            isInitialLoad.current = false;
            // Defer initial URL sync slightly
            requestAnimationFrame(updateUrlFromState);
        }
        // Hierarchy refresh is handled by a separate effect
      }
    };

    performInitialLoadOrWorkspaceChange();

    return () => {
      isMounted = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspaceId, fetchBoardsList, updateUrlFromState]);

  useEffect(() => {
    if (!selectedBoardId) {
      setSelectedBoard(null);
      if (isBoardDetailsLoading) setIsBoardDetailsLoading(false);
      return;
    }

    const existingBoardData = boards.find(b => b.id === selectedBoardId && b.columns);
    if (existingBoardData) {
       console.log("Using existing detailed board data for:", selectedBoardId);
       setSelectedBoard(existingBoardData);
       if (isBoardDetailsLoading) setIsBoardDetailsLoading(false);
       return;
    }

    let isMounted = true;
    const fetchSelectedBoardDetails = async () => {
      console.log(`Fetching details for board: ${selectedBoardId}`);
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
      console.log("User selected board:", boardId);
      setSelectedBoardId(boardId);
      setUrlSelectedBoardId(boardId);
    }
  }, [selectedBoardId]);

  const setViewWithUrlUpdate = useCallback((newView: 'kanban' | 'list' | 'hierarchy') => {
    if (newView !== view) {
      console.log("User changed view:", newView);
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
    if (activeWorkspaceId) {
      console.log("Refreshing hierarchy for workspace/board change:", activeWorkspaceId, selectedBoardId);
      refreshHierarchy();
    } else {
        setMilestones([]);
        setEpics([]);
        setStories([]);
    }
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