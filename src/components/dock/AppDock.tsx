"use client";

import React from 'react';
import { MessageSquarePlus, NotebookPen } from 'lucide-react';
import { Dock, DockWidget } from '@/components/magicui/dock';
import { ActivityStatusWidget } from './ActivityStatusWidget';
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

  return (
    <Dock 
      expandable 
      fixed 
      className={className}
      iconSize={28}
      iconMagnification={35}
      iconDistance={80}
      leftContent={<ActivityStatusWidget />}
    >
      <DockWidget
        id="quick-notes"
        title="Quick Notes"
        icon={<NotebookPen className="h-5 w-5" />}
        content={<QuickNotesWidget />}
      />
      
      <DockWidget
        id="timeline"
        title="Quick Post"
        icon={<MessageSquarePlus className="h-5 w-5" />}
        content={<TimelineWidget />}
      />

    </Dock>
  );
} 