"use client";

import React, { useState, useEffect, useRef } from 'react';
import { 
  User, 
  Circle, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  ArrowUp 
} from 'lucide-react';

import { Issue } from '../types';
import { cn } from "@/lib/utils";
import { getIssuePriorityBadge } from "@/utils/issueHelpers";

interface IssueMentionSuggestionProps {
  query: string;
  onSelect: (issue: Issue) => void;
  onEscape?: () => void;
  workspaceId?: string; // Keep for backwards compatibility but no longer used for filtering
}

// Priority icon mapping to match IssuePrioritySelector
const getPriorityIcon = (priority: string) => {
  const badge = getIssuePriorityBadge(priority);
  const Icon = badge.icon;
  
  // Extract color from the badge configuration
  const colorMap = {
    'URGENT': 'text-red-500',
    'HIGH': 'text-amber-500', 
    'MEDIUM': 'text-blue-500',
    'LOW': 'text-slate-500'
  };
  
  const colorClass = colorMap[priority as keyof typeof colorMap] || 'text-gray-500';
  
  return <Icon className={cn("h-3.5 w-3.5", colorClass)} />;
};

// Status icon mapping to match SearchRelationItem  
const getStatusIcon = (status: string) => {
  const normalizedStatus = status?.toLowerCase().replace(/[_\s]/g, ' ');
  const iconClass = "h-3.5 w-3.5";
  
  switch (normalizedStatus) {
    case 'todo':
    case 'backlog':
      return <Circle className={cn(iconClass, "text-[#8b949e]")} />;
    case 'in progress':
    case 'active':
    case 'working':
      return <Clock className={cn(iconClass, "text-[#3b82f6]")} />;
    case 'review':
    case 'testing':
      return <Clock className={cn(iconClass, "text-[#f59e0b]")} />;
    case 'done':
    case 'completed':
      return <CheckCircle2 className={cn(iconClass, "text-[#22c55e]")} fill="currentColor" />;
    case 'cancelled':
    case 'rejected':
      return <XCircle className={cn(iconClass, "text-[#ef4444]")} fill="currentColor" />;
    case 'blocked':
      return <AlertCircle className={cn(iconClass, "text-[#f59e0b]")} />;
    default:
      return <Circle className={cn(iconClass, "text-[#8b949e]")} />;
  }
};

export function IssueMentionSuggestion({ 
  query, 
  onSelect, 
  onEscape, 
  workspaceId
}: IssueMentionSuggestionProps) {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [isKeyboardNavigation, setIsKeyboardNavigation] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch issues when query changes
  useEffect(() => {
    const fetchIssues = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ q: query || '' });


        const response = await fetch(`/api/issues/search?${params}`);
        if (response.ok) {
          const searchedIssues = await response.json();
          setIssues(searchedIssues);
          setSelectedIndex(-1);
          setIsKeyboardNavigation(false);
        } else {
          console.error('Failed to search issues');
          setIssues([]);
        }
      } catch (error) {
        console.error('Error searching issues:', error);
        setIssues([]);
      } finally {
        setLoading(false);
      }
    };

    fetchIssues();
  }, [query]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!issues.length) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setIsKeyboardNavigation(true);
          setSelectedIndex(prev => (prev + 1) % issues.length);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setIsKeyboardNavigation(true);
          setSelectedIndex(prev => prev <= 0 ? issues.length - 1 : prev - 1);
          break;
        case 'Enter':
          e.preventDefault();
          if (selectedIndex >= 0 && selectedIndex < issues.length) {
            const selectedIssue = issues[selectedIndex];
            if (selectedIssue && selectedIssue.id) {
              onSelect(selectedIssue);
            }
          }
          break;
        case 'Escape':
          e.preventDefault();
          onEscape?.();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [issues, selectedIndex, onSelect, onEscape]);

  // Scroll selected item into view
  useEffect(() => {
    if (isKeyboardNavigation && selectedIndex >= 0 && containerRef.current) {
      const selectedElement = containerRef.current.children[selectedIndex] as HTMLElement;
      selectedElement?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex, isKeyboardNavigation]);



  if (loading) {
    return (
      <div className="bg-popover border rounded-md shadow-md p-2 min-w-[300px]">
        <div className="text-sm text-muted-foreground">Searching issues...</div>
      </div>
    );
  }

  if (issues.length === 0) {
    return (
      <div className="bg-popover border rounded-md shadow-md p-2 min-w-[300px]">
        <div className="text-sm text-muted-foreground">No issues found</div>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className="bg-popover border rounded-md shadow-md p-1 min-w-[400px] max-h-[250px] overflow-y-auto"
    >
      {issues.map((issue, index) => {
        return (
          <button
            key={issue.id}
            className={cn(
              "w-full flex items-center px-2 py-1 text-left transition-all duration-150 rounded-sm",
              "hover:bg-[#1f1f1f]",
              selectedIndex === index ? 'bg-[#1f1f1f] text-accent-foreground' : ''
            )}
            onClick={() => {
              if (issue && issue.id) {
                onSelect(issue);
              }
            }}
            onMouseEnter={() => {
              if (!isKeyboardNavigation) {
                setSelectedIndex(index);
              }
            }}
            onMouseLeave={() => {
              if (!isKeyboardNavigation) {
                setSelectedIndex(-1);
              }
            }}
          >
            {/* Status Icon */}
            <div className="flex items-center w-5 mr-1 flex-shrink-0">
              {getStatusIcon(issue.status || 'todo')}
            </div>

            {/* Issue Key */}
            <div className="w-16 flex-shrink-0">
              <span className="text-[#8b949e] text-xs font-mono font-medium">
                {issue.issueKey || issue.type.toUpperCase()}
              </span>
            </div>

            {/* Priority and Title section */}
            <div className="flex-1 min-w-0 mr-1">
              <div className="flex items-center gap-2">
                {/* Priority Icon */}
                {issue.priority && (
                  <div className="flex items-center flex-shrink-0">
                    {getPriorityIcon(issue.priority)}
                  </div>
                )}
                
                {/* Title */}
                <span className="text-[#e6edf3] text-xs font-medium truncate group-hover:text-[#58a6ff] transition-colors">
                  {issue.title}
                </span>
              </div>
              
              {/* Workspace name - only show if it exists and is different from current context */}
              {issue.workspace && (
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="text-[#6e7681] text-[10px] font-mono">
                    {issue.workspace.name}
                  </span>
                </div>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
