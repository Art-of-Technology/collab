"use client";

import React, { createContext, useContext, useState, ReactNode } from 'react';

interface DockContextType {
  isDockExpanded: boolean;
  setIsDockExpanded: (expanded: boolean) => void;
  activeDockWidget: string | null;
  setActiveDockWidget: (widgetId: string | null) => void;
}

const DockContext = createContext<DockContextType | undefined>(undefined);

export function useDock() {
  const context = useContext(DockContext);
  if (context === undefined) {
    throw new Error('useDock must be used within a DockProvider');
  }
  return context;
}

interface DockProviderProps {
  children: ReactNode;
}

export function DockProvider({ children }: DockProviderProps) {
  const [isDockExpanded, setIsDockExpanded] = useState(false);
  const [activeDockWidget, setActiveDockWidget] = useState<string | null>(null);

  const value = {
    isDockExpanded,
    setIsDockExpanded,
    activeDockWidget,
    setActiveDockWidget,
  };

  return (
    <DockContext.Provider value={value}>
      {children}
    </DockContext.Provider>
  );
} 