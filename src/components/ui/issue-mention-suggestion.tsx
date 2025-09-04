"use client";

import { forwardRef, useEffect, useState, useRef } from 'react';
import { CommandEmpty, CommandGroup, CommandItem, CommandList, Command } from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { CheckIcon, HashIcon, BookOpen, Target, Milestone, Bug, Layers, ArrowUpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Issue {
  id: string;
  title: string;
  issueKey: string | null;
  type: 'EPIC' | 'STORY' | 'TASK' | 'BUG' | 'MILESTONE' | 'SUBTASK';
  status?: string;
  priority: string;
  project: {
    id: string;
    name: string;
    color?: string;
  } | null;
  assignee?: {
    id: string;
    name: string | null;
    image: string | null;
  } | null;
}

interface IssueMentionSuggestionProps {
  query: string;
  onSelect: (issue: Issue) => void;
  workspaceId?: string;
  onEscape?: () => void;
  issueTypes?: Array<'EPIC' | 'STORY' | 'TASK' | 'BUG' | 'MILESTONE' | 'SUBTASK'>; // Filter by issue types
}

const CAN_MENTION_ALL_ISSUES = true;

// Icon mapping for issue types
const ISSUE_TYPE_ICONS = {
  EPIC: Target,
  STORY: BookOpen,
  TASK: HashIcon,
  BUG: Bug,
  MILESTONE: Milestone,
  SUBTASK: ArrowUpCircle,
};

export const IssueMentionSuggestion = forwardRef<HTMLDivElement, IssueMentionSuggestionProps>(
  ({ query, onSelect, workspaceId, onEscape, issueTypes }, ref) => {
    const [issues, setIssues] = useState<Issue[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(-1);
    const [isKeyboardNavigation, setIsKeyboardNavigation] = useState(false);
    const commandRef = useRef<HTMLDivElement>(null);

    // Function to get priority color
    const getPriorityColor = (priority: string): string => {
      switch (priority.toLowerCase()) {
        case 'high':
        case 'urgent':
          return 'bg-red-100 text-red-700';
        case 'medium':
          return 'bg-yellow-100 text-yellow-700';
        case 'low':
          return 'bg-green-100 text-green-700';
        default:
          return 'bg-gray-100 text-gray-700';
      }
    };

    // Function to get status color
    const getStatusColor = (status: string | undefined): string => {
      if (!status) return 'bg-gray-100 text-gray-700';

      switch (status.toLowerCase()) {
        case 'done':
        case 'completed':
          return 'bg-green-100 text-green-700';
        case 'in progress':
        case 'in_progress':
          return 'bg-blue-100 text-blue-700';
        case 'todo':
        case 'open':
        case 'backlog':
          return 'bg-gray-100 text-gray-700';
        default:
          return 'bg-gray-100 text-gray-700';
      }
    };

    // Function to get type color
    const getTypeColor = (type: string): string => {
      switch (type) {
        case 'EPIC':
          return 'bg-purple-100 text-purple-700';
        case 'STORY':
          return 'bg-blue-100 text-blue-700';
        case 'TASK':
          return 'bg-green-100 text-green-700';
        case 'BUG':
          return 'bg-red-100 text-red-700';
        case 'MILESTONE':
          return 'bg-yellow-100 text-yellow-700';
        case 'SUBTASK':
          return 'bg-gray-100 text-gray-700';
        default:
          return 'bg-gray-100 text-gray-700';
      }
    };

    // Handle keyboard navigation
    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (!issues.length) return;

        // Arrow keys for navigation
        if (e.key === "ArrowDown") {
          e.preventDefault();
          e.stopPropagation();
          setIsKeyboardNavigation(true);
          setSelectedIndex((prev) => {
            // If no item is selected (-1), start from 0
            if (prev === -1) return 0;
            // Otherwise move to next item
            return prev < issues.length - 1 ? prev + 1 : prev;
          });
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          e.stopPropagation();
          setIsKeyboardNavigation(true);
          setSelectedIndex((prev) => {
            // If no item is selected (-1), start from last item
            if (prev === -1) return issues.length - 1;
            // Otherwise move to previous item
            return prev > 0 ? prev - 1 : prev;
          });
        } else if (e.key === "Enter" && selectedIndex >= 0 && issues[selectedIndex]) {
          e.preventDefault();
          e.stopPropagation();
          onSelect(issues[selectedIndex]);
        } else if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          onEscape?.();
        }
      };

      // Add event listener to document with capture phase
      document.addEventListener("keydown", handleKeyDown, true);
      return () => {
        document.removeEventListener("keydown", handleKeyDown, true);
      };
    }, [issues, issues.length, selectedIndex, onSelect, onEscape]);

    // Search issues when query changes
    useEffect(() => {
      const fetchIssues = async () => {
        setLoading(true);
        try {
          // Fetch issues with the query (empty query will return all workspace issues)
          const params = new URLSearchParams({ q: query || '' });

          // If we can't mention all issues, we need to filter by workspace
          if (!CAN_MENTION_ALL_ISSUES && workspaceId) {
            params.append('workspace', workspaceId);
          }

          // Filter by issue types if specified
          if (issueTypes && issueTypes.length > 0) {
            issueTypes.forEach(type => params.append('type', type));
          }

          const response = await fetch(`/api/issues/search?${params}`);
          if (response.ok) {
            const searchedIssues = await response.json();
            setIssues(searchedIssues);
            // Reset selected index when new results come in
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
    }, [query, workspaceId, issueTypes]);

    // Scroll selected item into view
    useEffect(() => {
      if (commandRef.current && issues.length > 0 && isKeyboardNavigation) {
        const selectedElement = commandRef.current.querySelector(`[data-index="${selectedIndex}"]`);
        if (selectedElement) {
          selectedElement.scrollIntoView({ block: 'nearest' });
        }
      }
    }, [selectedIndex, issues.length, isKeyboardNavigation]);

    // Handle mouse enter to disable keyboard navigation styling
    const handleMouseEnter = (index: number) => {
      setIsKeyboardNavigation(false);
      setSelectedIndex(index);
    };

    return (
      <div ref={ref} className="z-50 overflow-hidden rounded-lg border shadow-lg animate-in fade-in-0 zoom-in-95 bg-popover">
        <Command ref={commandRef} className="w-[400px]" shouldFilter={false}>
          <div className="px-3 py-2 text-xs font-medium text-muted-foreground border-b">
            Mention an issue
          </div>
          <CommandList className="max-h-[250px] overflow-y-auto">
            {loading ? (
              <div className="py-6 text-center flex items-center justify-center space-x-2">
                <div className="animate-spin h-3 w-3 rounded-full border-b-2 border-primary"></div>
                <span className="text-sm text-muted-foreground">Searching...</span>
              </div>
            ) : issues.length === 0 ? (
              <div className="py-6 text-center">
                <Layers className="h-8 w-8 mx-auto text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground mt-2">No issues found</p>
              </div>
            ) : (
              <CommandGroup>
                {issues.map((issue, index) => {
                  const TypeIcon = ISSUE_TYPE_ICONS[issue.type] || HashIcon;
                  
                  return (
                    <div
                      key={issue.id}
                      data-index={index}
                      onClick={() => onSelect(issue)}
                      onMouseEnter={() => handleMouseEnter(index)}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 cursor-pointer rounded-sm",
                        // Our own hover and selected states
                        !isKeyboardNavigation && "hover:bg-accent/50",
                        isKeyboardNavigation && selectedIndex === index && "bg-accent"
                      )}
                    >
                      <div className="flex items-center gap-3 flex-1">
                        <TypeIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            {issue.issueKey && (
                              <Badge variant="outline" className="text-xs shrink-0 font-mono">
                                {issue.issueKey}
                              </Badge>
                            )}
                            <span className="text-sm font-medium truncate">{issue.title}</span>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge className={cn("text-xs", getTypeColor(issue.type))}>
                              {issue.type.toLowerCase()}
                            </Badge>
                            {(issue.projectStatus?.displayName || issue.statusValue || issue.status) && (
                              <Badge className={cn("text-xs", getStatusColor(issue.projectStatus?.displayName || issue.statusValue || issue.status || 'Todo'))}>
                                {issue.projectStatus?.displayName || issue.statusValue || issue.status}
                              </Badge>
                            )}
                            <Badge className={cn("text-xs", getPriorityColor(issue.priority))}>
                              {issue.priority}
                            </Badge>
                            {issue.project && (
                              <div className="flex items-center gap-1">
                                {issue.project.color && (
                                  <div 
                                    className="w-2 h-2 rounded-full shrink-0" 
                                    style={{ backgroundColor: issue.project.color }}
                                  />
                                )}
                                <span className="text-xs text-muted-foreground truncate">
                                  {issue.project.name}
                                </span>
                              </div>
                            )}
                            {issue.assignee && (
                              <span className="text-xs text-muted-foreground truncate">
                                @{issue.assignee.name}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      {isKeyboardNavigation && selectedIndex === index && (
                        <CheckIcon className="h-4 w-4 text-primary" />
                      )}
                    </div>
                  );
                })}
              </CommandGroup>
            )}
          </CommandList>
          {issues.length > 0 && (
            <div className="px-2 py-1.5 text-xs border-t flex justify-between">
              <span className="text-muted-foreground">
                <kbd className="px-1.5 py-0.5 bg-muted rounded border">↑</kbd>
                <kbd className="px-1.5 py-0.5 bg-muted rounded border ml-1">↓</kbd> to navigate
              </span>
              <span className="text-muted-foreground">
                <kbd className="px-1.5 py-0.5 bg-muted rounded border">enter</kbd> to select
              </span>
            </div>
          )}
        </Command>
      </div>
    );
  }
);

IssueMentionSuggestion.displayName = "IssueMentionSuggestion";

