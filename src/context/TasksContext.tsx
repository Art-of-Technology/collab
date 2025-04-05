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
}

interface TasksContextType {
  boards: Board[];
  selectedBoard: Board | null;
  selectedBoardId: string;
  isLoading: boolean;
  view: 'kanban' | 'list';
  setView: (view: 'kanban' | 'list') => void;
  selectBoard: (boardId: string) => void;
  refreshBoards: () => Promise<void>;
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
  initialView?: 'kanban' | 'list';
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
  const isFirstRender = useRef(true);
  
  // State management
  const [boards, setBoards] = useState<Board[]>(initialBoards);
  const [selectedBoardId, setSelectedBoardId] = useState<string>(initialBoardId || '');
  const [selectedBoard, setSelectedBoard] = useState<Board | null>(null);
  const [isLoading, setIsLoading] = useState(!initialBoards.length);
  const [view, setView] = useState<'kanban' | 'list'>(initialView);

  // Memoize this function to prevent rerenders
  const updateUrlSearchParams = useCallback((params: Record<string, string>) => {
    if (!pathname.includes('/tasks')) return;
    
    const current = new URLSearchParams(Array.from(searchParams.entries()));
    
    Object.entries(params).forEach(([key, value]) => {
      current.set(key, value);
    });
    
    const search = current.toString();
    const query = search ? `?${search}` : '';
    
    router.replace(`${pathname}${query}`, { scroll: false });
  }, [pathname, searchParams, router]);

  // Fetch boards when workspace changes
  useEffect(() => {
    let isMounted = true;
    
    // If we have initial boards and this is the first render, skip the fetch
    if (initialBoards.length > 0 && isFirstRender.current) {
      isFirstRender.current = false;
      
      if (!selectedBoardId && initialBoards.length > 0) {
        setSelectedBoardId(initialBoards[0].id);
        if (pathname.includes('/tasks')) {
          updateUrlSearchParams({ board: initialBoards[0].id });
        }
      }
      return;
    }
    
    // Use workspaceId prop if provided, otherwise fallback to currentWorkspace
    const wsId = workspaceId || (currentWorkspace ? currentWorkspace.id : null);
    if (!wsId) return;
    
    const fetchBoards = async () => {
      if (!isMounted) return;
      
      try {
        setIsLoading(true);
        const response = await fetch(`/api/workspaces/${wsId}/boards`);
        
        if (!isMounted) return;
        
        if (response.ok) {
          const data = await response.json();
          setBoards(data);
          
          // If no board is selected or the selected board doesn't exist anymore
          if (!selectedBoardId || !data.some((board: Board) => board.id === selectedBoardId)) {
            if (data.length > 0) {
              setSelectedBoardId(data[0].id);
              if (pathname.includes('/tasks')) {
                updateUrlSearchParams({ board: data[0].id });
              }
            }
          }
        } else {
          console.error('Failed to fetch boards');
        }
      } catch (error) {
        if (isMounted) {
          console.error('Error fetching boards:', error);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };
    
    fetchBoards();
    
    return () => {
      isMounted = false;
    };
  }, [currentWorkspace, updateUrlSearchParams, pathname, selectedBoardId, workspaceId]);

  // Fetch selected board details
  useEffect(() => {
    let isMounted = true;
    
    if (!selectedBoardId) return;
    
    const fetchSelectedBoard = async () => {
      if (!isMounted) return;
      
      try {
        setIsLoading(true);
        const response = await fetch(`/api/tasks/boards/${selectedBoardId}`);
        
        if (!isMounted) return;
        
        if (response.ok) {
          const data = await response.json();
          setSelectedBoard(data);
        } else {
          console.error('Failed to fetch selected board');
          setSelectedBoard(null);
        }
      } catch (error) {
        if (isMounted) {
          console.error('Error fetching selected board:', error);
          setSelectedBoard(null);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };
    
    fetchSelectedBoard();
    
    return () => {
      isMounted = false;
    };
  }, [selectedBoardId]);

  // Board selection handler
  const selectBoard = useCallback((boardId: string) => {
    setSelectedBoardId(boardId);
    updateUrlSearchParams({ board: boardId, view });
  }, [updateUrlSearchParams, view]);

  // View update handler
  const setViewWithUrlUpdate = useCallback((newView: 'kanban' | 'list') => {
    setView(newView);
    updateUrlSearchParams({ view: newView });
  }, [updateUrlSearchParams]);

  // Refresh boards handler
  const refreshBoards = useCallback(async () => {
    // Use workspaceId prop if provided, otherwise fallback to currentWorkspace
    const wsId = workspaceId || (currentWorkspace ? currentWorkspace.id : null);
    if (!wsId) return;
    
    try {
      setIsLoading(true);
      const response = await fetch(`/api/workspaces/${wsId}/boards`);
      
      if (response.ok) {
        const data = await response.json();
        setBoards(data);
        
        // If there's no board selected and we have boards, select the first one
        if ((!selectedBoardId || !data.some((board: Board) => board.id === selectedBoardId)) && data.length > 0) {
          setSelectedBoardId(data[0].id);
          if (pathname.includes('/tasks')) {
            updateUrlSearchParams({ board: data[0].id });
          }
        }
      }
      
      if (selectedBoardId) {
        const boardResponse = await fetch(`/api/tasks/boards/${selectedBoardId}`);
        if (boardResponse.ok) {
          const boardData = await boardResponse.json();
          setSelectedBoard(boardData);
        }
      }
    } catch (error) {
      console.error('Error refreshing boards:', error);
    } finally {
      setIsLoading(false);
    }
  }, [currentWorkspace, selectedBoardId, pathname, updateUrlSearchParams, workspaceId]);

  // Memoize context value to prevent unnecessary re-renders
  const contextValue = useMemo(() => ({
    boards,
    selectedBoard,
    selectedBoardId,
    isLoading,
    view,
    setView: setViewWithUrlUpdate,
    selectBoard,
    refreshBoards
  }), [
    boards,
    selectedBoard,
    selectedBoardId,
    isLoading,
    view,
    setViewWithUrlUpdate,
    selectBoard,
    refreshBoards
  ]);

  return (
    <TasksContext.Provider value={contextValue}>
      {children}
    </TasksContext.Provider>
  );
}; 