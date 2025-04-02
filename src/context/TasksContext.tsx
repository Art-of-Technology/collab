"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
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
}

export const TasksProvider = ({ 
  children, 
  initialBoardId,
  initialView = 'kanban' 
}: TasksProviderProps) => {
  const { currentWorkspace } = useWorkspace();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [boards, setBoards] = useState<Board[]>([]);
  const [selectedBoardId, setSelectedBoardId] = useState<string>(initialBoardId || '');
  const [selectedBoard, setSelectedBoard] = useState<Board | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [view, setView] = useState<'kanban' | 'list'>(initialView);

  // Fetch boards when workspace changes
  useEffect(() => {
    if (!currentWorkspace) return;
    
    const fetchBoards = async () => {
      try {
        setIsLoading(true);
        const response = await fetch(`/api/workspaces/${currentWorkspace.id}/boards`);
        
        if (response.ok) {
          const data = await response.json();
          setBoards(data);
          
          // If no board is selected or the selected board doesn't exist anymore
          if (!selectedBoardId || !data.some((board: Board) => board.id === selectedBoardId)) {
            if (data.length > 0) {
              setSelectedBoardId(data[0].id);
              if (pathname.includes('/tasks')) {
                // Update URL with the new board ID using Next.js router
                updateUrlSearchParams({ board: data[0].id });
              }
            }
          }
        } else {
          console.error('Failed to fetch boards');
        }
      } catch (error) {
        console.error('Error fetching boards:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchBoards();
  }, [currentWorkspace, selectedBoardId, pathname]);

  // Fetch selected board with columns and tasks
  useEffect(() => {
    if (!selectedBoardId) return;
    
    const fetchSelectedBoard = async () => {
      try {
        setIsLoading(true);
        const response = await fetch(`/api/tasks/boards/${selectedBoardId}`);
        
        if (response.ok) {
          const data = await response.json();
          setSelectedBoard(data);
        } else {
          console.error('Failed to fetch selected board');
          setSelectedBoard(null);
        }
      } catch (error) {
        console.error('Error fetching selected board:', error);
        setSelectedBoard(null);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchSelectedBoard();
  }, [selectedBoardId]);

  // Helper function to update URL search params with Next.js router
  const updateUrlSearchParams = (params: Record<string, string>) => {
    if (!pathname.includes('/tasks')) return;
    
    const current = new URLSearchParams(Array.from(searchParams.entries()));
    
    Object.entries(params).forEach(([key, value]) => {
      current.set(key, value);
    });
    
    const search = current.toString();
    const query = search ? `?${search}` : '';
    
    router.replace(`${pathname}${query}`, { scroll: false });
  };

  const selectBoard = (boardId: string) => {
    setSelectedBoardId(boardId);
    // Update URL with Next.js router
    updateUrlSearchParams({ board: boardId, view });
  };

  const setViewWithUrlUpdate = (newView: 'kanban' | 'list') => {
    setView(newView);
    // Update URL with Next.js router
    updateUrlSearchParams({ view: newView });
  };

  const refreshBoards = async () => {
    if (!currentWorkspace) return;
    
    try {
      setIsLoading(true);
      const response = await fetch(`/api/workspaces/${currentWorkspace.id}/boards`);
      
      if (response.ok) {
        const data = await response.json();
        setBoards(data);
        
        // If there's no board selected and we have boards, select the first one
        if ((!selectedBoardId || !data.some((board: Board) => board.id === selectedBoardId)) && data.length > 0) {
          setSelectedBoardId(data[0].id);
          if (pathname.includes('/tasks')) {
            // Update URL with Next.js router
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
  };

  return (
    <TasksContext.Provider
      value={{
        boards,
        selectedBoard,
        selectedBoardId,
        isLoading,
        view,
        setView: setViewWithUrlUpdate,
        selectBoard,
        refreshBoards
      }}
    >
      {children}
    </TasksContext.Provider>
  );
}; 