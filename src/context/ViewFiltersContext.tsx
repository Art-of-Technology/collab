"use client";

import React, { createContext, useContext, useState, ReactNode } from 'react';

interface ViewFiltersState {
  assignees: string[];
  labels: string[];
  priority: string[];
  projects: string[];
}

interface ViewFiltersContextType {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  toggleOpen: () => void;
  filters: ViewFiltersState;
  setFilters: (filters: ViewFiltersState) => void;
  currentView: any;
  setCurrentView: (view: any) => void;
  issues: any[];
  setIssues: (issues: any[]) => void;
  workspace: any;
  setWorkspace: (workspace: any) => void;
  currentUser: any;
  setCurrentUser: (user: any) => void;
}

const ViewFiltersContext = createContext<ViewFiltersContextType | undefined>(undefined);

export function ViewFiltersProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [filters, setFilters] = useState<ViewFiltersState>({
    assignees: [],
    labels: [],
    priority: [],
    projects: []
  });
  const [currentView, setCurrentView] = useState<any>(null);
  const [issues, setIssues] = useState<any[]>([]);
  const [workspace, setWorkspace] = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);

  const toggleOpen = () => setIsOpen(prev => !prev);

  return (
    <ViewFiltersContext.Provider
      value={{
        isOpen,
        setIsOpen,
        toggleOpen,
        filters,
        setFilters,
        currentView,
        setCurrentView,
        issues,
        setIssues,
        workspace,
        setWorkspace,
        currentUser,
        setCurrentUser,
      }}
    >
      {children}
    </ViewFiltersContext.Provider>
  );
}

export function useViewFilters() {
  const context = useContext(ViewFiltersContext);
  if (context === undefined) {
    throw new Error('useViewFilters must be used within a ViewFiltersProvider');
  }
  return context;
}
