"use client";

import React from 'react';
import { MessageSquarePlus, NotebookPen } from 'lucide-react';
import { ModernDock, DockItem } from './ModernDock';
import { TimelineWidget } from './TimelineWidget';
import { QuickNotesWidget } from './QuickNotesWidget';
import { useWorkspaceSettings } from '@/hooks/useWorkspaceSettings';

interface AppDockProps {
  className?: string;
}

export function AppDock({ className }: AppDockProps) {
  const { settings, isLoading } = useWorkspaceSettings();

  // Don't render anything while loading settings
  if (isLoading) {
    return null;
  }

  // Don't render dock if disabled in workspace settings
  if (!settings?.dockEnabled) {
    return null;
  }

  const dockItems: DockItem[] = [
    {
      id: 'quick-notes',
      title: 'Quick Notes',
      icon: <NotebookPen className="h-4 w-4" />,
      content: <QuickNotesWidget />,
    },
    {
      id: 'timeline',
      title: 'Quick Post',
      icon: <MessageSquarePlus className="h-4 w-4" />,
      content: <TimelineWidget />,
    },
  ];

  return (
    <ModernDock
      items={dockItems}
      className={className}
    />
  );
} 